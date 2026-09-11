"""Run independently. Real DB/ASGI; no environment files or provider calls."""
import asyncio
import importlib
import json
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
_scratch = tempfile.TemporaryDirectory(prefix="cerbyl-product-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_scratch.name}/test.db"
os.environ["SECRET_KEY"] = "isolated-product-test-secret"
os.environ["ADMIN_EMAILS"] = "admin@example.test"
env = ModuleType('env_loader'); env.load_backend_env = lambda: None; sys.modules['env_loader'] = env
# Avoid initialization of providers; all generated responses in this suite are explicit fixtures.
class FakeAI:
    def __init__(self, *args, **kwargs): self.generate = Mock()
ai = ModuleType('services.ai_utils'); ai.UnifiedAIClient = FakeAI; sys.modules['services.ai_utils'] = ai
groq = ModuleType('groq'); groq.Groq = FakeAI; sys.modules['groq'] = groq
import database
import models
import deps
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from services.auth_tokens import create_user_access_token, resolve_access_token
from services.entitlements import effective_plan
from services.ai_costs import cost_metadata
from routes import product, weakness, subscription

@pytest.fixture
def setup():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    models.Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine, expire_on_commit=False)()
    users = [models.User(username='owner', email='owner@example.test'), models.User(username='other', email='other@example.test'), models.User(username='teacher', email='teacher@example.test', account_role='educator')]
    db.add_all(users); db.commit()
    app = FastAPI(); app.include_router(product.router); app.include_router(weakness.router); app.include_router(subscription.router)
    app.dependency_overrides[deps.get_db] = lambda: db
    app.dependency_overrides[product.check_admin] = lambda: True
    client = TestClient(app); client.headers['Authorization'] = 'Bearer ' + create_user_access_token(users[0])
    yield db, users, client
    db.close(); engine.dispose()

def test_identity_survives_rename_but_not_password_revocation(setup):
    db, (owner, other, _), _client = setup
    token = create_user_access_token(owner)
    owner.username = 'renamed'; other.username = 'owner'; db.commit()
    assert resolve_access_token(token, db).id == owner.id
    owner.session_version += 1; db.commit()
    with pytest.raises(HTTPException) as e: resolve_access_token(token, db)
    assert e.value.status_code == 401

def test_legacy_username_token_rejected(setup):
    from jose import jwt
    db, _, _ = setup
    token = jwt.encode({'sub': 'owner', 'exp': datetime.now(timezone.utc) + timedelta(hours=1), 'aud': 'brainwave-client', 'iss': 'brainwave-backend'}, os.environ['SECRET_KEY'], algorithm='HS256')
    with pytest.raises(HTTPException): resolve_access_token(token, db)

def test_entitlements_expire_and_fail_closed():
    p = SimpleNamespace(subscription_tier='pro', subscription_status='active', current_period_end=datetime.now(timezone.utc) + timedelta(days=1))
    assert effective_plan(p) == 'pro'
    p.current_period_end = datetime.now(timezone.utc) - timedelta(seconds=1)
    assert effective_plan(p) == 'starter'
    p.current_period_end = None
    assert effective_plan(p) == 'starter'

def test_reports_enforce_owner_and_preserve_original(setup):
    db, (owner, other, _), client = setup
    chats = [models.ChatSession(user_id=u.id) for u in (owner, other)]
    db.add_all(chats); db.flush()
    messages = [models.ChatMessage(chat_session_id=c.id, user_message='Question', ai_response='Original answer') for c in chats]
    db.add_all(messages); db.commit()
    body = {'resource_type': 'chat_message', 'resource_id': messages[1].id, 'reason': 'incorrect_answer'}
    assert client.post('/api/product/answer-reports', json=body).status_code == 404
    body['resource_id'] = messages[0].id
    response = client.post('/api/product/answer-reports', json=body)
    assert response.status_code == 200, response.text
    assert client.post('/api/product/answer-reports', json=body).json()['id'] == response.json()['id']
    rid = response.json()['id']
    resolved = client.post(f'/api/product/admin/answer-reports/{rid}/resolve', json={'resolution': 'Corrected: use the total outcomes in the denominator.'})
    assert resolved.status_code == 200
    assert client.get('/api/product/answer-reports').json()[0]['resolution'].startswith('Corrected:')
    assert messages[0].ai_response == 'Original answer'

def test_next_practice_prioritizes_only_owned_due_cards(setup):
    db, (owner, other, _), client = setup
    foreign = models.FlashcardSet(user_id=other.id, title='Private'); own = models.FlashcardSet(user_id=owner.id, title='My review')
    db.add_all([foreign, own]); db.flush()
    for s in (foreign, own): db.add(models.Flashcard(set_id=s.id, question='Q', answer='A', marked_for_review=True))
    db.commit()
    result = client.get('/api/product/practice-next').json()
    assert result['title'] == 'My review'
    assert result['href'].startswith(f'/flashcards?set_id={own.id}')

def test_practice_issued_once_no_answer_leak_no_replay(setup):
    db, (owner, other, _), client = setup
    q = models.GeneratedQuestion(topic='Counting', difficulty='intermediate', question_text='2 + 2?', question_type='multiple_choice', options=json.dumps(['2','3','4','5']), correct_answer='4', explanation='Add two pairs.')
    db.add(q); db.commit()
    assert client.post('/api/weakness-practice/start-session', json={'user_id': other.id, 'topic': 'Counting'}).status_code == 403
    start = client.post('/api/weakness-practice/start-session', json={'user_id': owner.id, 'topic': 'Counting', 'question_count': 1})
    assert start.status_code == 200, start.text
    assert 'first_question' not in start.json()
    sid = start.json()['session_id']
    body = {'session_id': sid, 'question_id': str(q.id), 'user_answer': 'C', 'time_taken': 2}
    assert client.post('/api/weakness-practice/submit-answer', json=body).status_code == 409
    question = client.get('/api/weakness-practice/next-question', params={'session_id': sid})
    assert question.status_code == 200, question.text
    assert 'correct_answer' not in question.json()['question']
    assert client.get('/api/weakness-practice/next-question', params={'session_id': sid}).json() == question.json()
    result = client.post('/api/weakness-practice/submit-answer', json=body)
    assert result.status_code == 200, result.text
    assert result.json()['is_correct'] is True
    assert client.post('/api/weakness-practice/submit-answer', json=body).status_code == 409
    assert db.query(models.PracticeAnswer).count() == 1
    area = db.query(models.UserWeakArea).filter_by(user_id=owner.id, topic='Counting').one()
    assert area.total_questions == 1
    assert area.correct_count == 1
    assert area.accuracy == 100
    assert area.last_practiced is not None
    assert db.query(models.ProductEvent).filter_by(name='practice_completed').count() == 1

def test_grading_failure_cannot_count_as_success(monkeypatch):
    question = {'question_type': 'short_answer', 'question_text': 'Explain', 'correct_answer': 'valid answer'}
    for output in ('incorrect', '{"is_correct":"false","feedback":"bad"}', '{"is_correct":null,"feedback":"bad"}'):
        monkeypatch.setattr(weakness, 'call_ai', lambda *a, **kw: output)
        with pytest.raises(HTTPException) as e: weakness._evaluate_answer(question, 'wrong')
        assert e.value.status_code == 503

def test_costs_are_unknown_until_exact_model_price_configured(monkeypatch):
    monkeypatch.delenv('AI_MODEL_PRICES_JSON', raising=False)
    assert cost_metadata('groq', 'model', {})['estimated_cost_usd'] is None
    monkeypatch.setenv('AI_MODEL_PRICES_JSON', json.dumps({'groq:model': {'input_per_million_usd': 1, 'output_per_million_usd': 2}}))
    assert cost_metadata('groq', 'model', {'prompt_tokens': 1000, 'completion_tokens': 1000})['estimated_cost_usd'] == .003

def test_teacher_evidence_is_section_scoped(setup):
    db, (owner, other, teacher), client = setup
    organization = models.Organization(name='Evidence test company', slug='evidence-test')
    db.add(organization); db.flush()
    db.add(models.OrganizationMembership(organization_id=organization.id, user_id=teacher.id, role='educator'))
    course = models.Course(organization_id=organization.id, code='MATH', title='Math')
    db.add(course); db.flush()
    section = models.ClassSection(course_id=course.id, academic_term_id=1, instructor_id=teacher.id)
    db.add(section); db.flush()
    assignment = models.Assignment(section_id=section.id, title='Probability', points_possible=10)
    db.add(assignment); db.flush()
    db.add(models.Submission(assignment_id=assignment.id, student_id=owner.id, score=3, status='graded', content_text='1/3', feedback='Count all counters.')); db.commit()
    assert client.get(f'/api/product/sections/{section.id}/learning-evidence').status_code == 403
    client.headers['Authorization'] = 'Bearer ' + create_user_access_token(teacher)
    result = client.get(f'/api/product/sections/{section.id}/learning-evidence')
    assert result.status_code == 200, result.text
    assert result.json()['groups'][0]['attempts'][0]['answer'] == '1/3'
    other.account_role='educator'; db.commit()
    client.headers['Authorization'] = 'Bearer ' + create_user_access_token(other)
    assert client.get(f'/api/product/sections/{section.id}/learning-evidence').status_code == 404

def test_sample_events_idempotent_and_validation(setup):
    import uuid
    db, _, client = setup
    body = {'visitor_id': str(uuid.uuid4()), 'name': 'sample_opened'}
    assert client.post('/api/product/sample-events', json=body).status_code == 202
    assert client.post('/api/product/sample-events', json=body).status_code == 202
    assert db.query(models.ProductEvent).count() == 1
    body['name']='payment_received'
    assert client.post('/api/product/sample-events', json=body).status_code == 422

def test_billing_reconciles_current_status_and_replay(setup, monkeypatch):
    db, (owner, _, _), client = setup
    monkeypatch.setenv('STRIPE_WEBHOOK_SECRET','test')
    monkeypatch.setenv('STRIPE_SECRET_KEY','test')
    monkeypatch.setattr(subscription, '_verify_webhook_signature', lambda *a: True)
    profile=models.ComprehensiveUserProfile(user_id=owner.id, stripe_customer_id='cus_test', stripe_subscription_id='sub_test')
    db.add(profile); db.commit()
    getter=Mock(return_value=SimpleNamespace(ok=True, json=lambda: {'id':'sub_test','customer':'cus_test','status':'canceled','items':{'data':[]}}))
    monkeypatch.setattr(subscription.requests,'get',getter)
    event={'id':'evt_test','created':1,'type':'customer.subscription.updated','data':{'object':{'id':'sub_test','customer':'cus_test','status':'active'}}}
    response=client.post('/api/subscription/webhook',json=event)
    assert response.status_code == 200, response.text
    assert profile.subscription_status == 'cancelled'
    assert client.post('/api/subscription/webhook',json=event).json()['duplicate']
    assert getter.call_count == 1


def test_numeric_username_cannot_select_another_account(setup):
    db, (owner, other, _), client = setup
    other.username = str(owner.id); db.commit()
    response = client.post('/api/weakness-practice/start-session', json={'user_id': owner.id, 'topic':'Test'})
    assert response.status_code == 403


def test_admin_email_as_username_does_not_grant_unlimited(setup):
    from services.token_limits import is_unlimited_user
    db, (owner, _, _), client = setup
    owner.username = 'admin@example.test'
    assert is_unlimited_user(owner) is False


def test_grading_symbols_dont_match(setup):
    q = {'question_type':'multiple_choice', 'correct_answer':'2%', 'options':['2','2%','20','20%']}
    assert weakness._evaluate_answer(q, '2')[0] is False


def test_solo_score_is_server_calculated_and_replay_safe(setup, monkeypatch):
    from routes import social
    db, (owner, _, _), client = setup
    client.app.include_router(social.router)
    gam = ModuleType('services.gamification_system')
    gam.award_points = lambda *a, **kw: {'points_earned':0, 'total_points':0, 'level':1}
    gam.calculate_solo_quiz_points = lambda *a, **kw: {}
    monkeypatch.setitem(sys.modules, 'services.gamification_system', gam)
    quiz=models.SoloQuiz(user_id=owner.id, subject='Test', question_count=2)
    db.add(quiz); db.flush()
    qs=[models.SoloQuizQuestion(quiz_id=quiz.id, question=t, options='["Zero","One"]', correct_answer=k) for t,k in [('Q1',1),('Q2',0)]]
    db.add_all(qs); db.commit()
    assert 'correct_answer' not in client.get(f'/api/solo_quiz/{quiz.id}').json()['questions'][0]
    response=client.post('/api/complete_solo_quiz',json={'quiz_id':quiz.id,'score':100,'answers':{str(qs[0].id):'B'}})
    assert response.status_code == 200, response.text
    assert response.json()['percentage'] == 50
    assert response.json()['results'][1]['is_correct'] is False
    response2=client.post('/api/complete_solo_quiz',json={'quiz_id':quiz.id,'score':100,'answers':{str(qs[1].id):'0'}})
    assert response2.json()['percentage'] == 50
    assert db.query(models.ProductEvent).filter_by(name='practice_completed').count()==1


def test_question_bank_resource_guard_rejects_foreign_set_without_user_field(setup):
    from services.question_bank_access import enforce_question_bank_resources
    from fastapi import Depends
    db, (owner, other, _), client = setup
    row=models.QuestionSet(user_id=other.id,title='Private'); db.add(row); db.commit()
    @client.app.get('/guard-test/{set_id}', dependencies=[Depends(enforce_question_bank_resources)])
    def guarded(set_id:int): return {'ok':True}
    assert client.get(f'/guard-test/{row.id}').status_code==404


def test_profile_cannot_change_email_or_paid_entitlements(setup):
    from routes import auth
    db, (owner, _, _), client = setup
    client.app.include_router(auth.router)
    for fields in ({'subscriptionTier':'pro'}, {'email':'admin@example.test'}, {'billingCycle':'yearly'}):
        response=client.post('/api/update_comprehensive_profile',json={'user_id':owner.username, **fields})
        assert response.status_code==400, response.text
    assert owner.email=='owner@example.test'


def test_product_metrics_distinguish_unpriced_usage_and_browser_attribution(setup):
    import uuid
    db, (owner, _, _), client=setup
    with db.bind.begin() as conn:
        conn.execute(text('CREATE TABLE user_activity_log (action TEXT, timestamp DATETIME, metadata TEXT)'))
        conn.execute(text('INSERT INTO user_activity_log VALUES (:action,:timestamp,:metadata)'), {'action':'ai_generate','timestamp':datetime.now(timezone.utc),'metadata':'{}'})
    visitor=str(uuid.uuid4())
    client.post('/api/product/sample-events',json={'name':'sample_opened','visitor_id':visitor})
    client.post('/api/product/activation',json={'visitor_id':visitor})
    response=client.get('/api/product/admin/metrics')
    assert response.status_code==200,response.text
    assert response.json()['sample_funnel']['linked_activated_accounts']==1
    assert response.json()['ai_costs']['unpriced_calls']==1


def test_migration_up_down_preserves_existing_user(setup):
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import inspect
    db, (owner, _, _), _client = setup
    owner_id=owner.id
    db.close()
    with db.bind.begin() as connection:
        for name in ('billing_events','practice_deliveries','answer_reports','product_events'):
            connection.execute(text(f'DROP TABLE {name}'))
        connection.execute(text('ALTER TABLE users DROP COLUMN session_version'))
        connection.execute(text('ALTER TABLE chat_messages DROP COLUMN source_metadata'))
        filename=Path(__file__).resolve().parents[1]/'alembic/versions/a9f1e8c2b603_product_trust_and_measurement.py'
        spec=importlib.util.spec_from_file_location('product_migration',filename)
        migration=importlib.util.module_from_spec(spec); spec.loader.exec_module(migration)
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            assert connection.execute(text('SELECT session_version FROM users WHERE id=:id'), {'id':owner_id}).scalar()==0
            assert 'answer_reports' in inspect(connection).get_table_names()
            migration.downgrade()
            assert 'answer_reports' not in inspect(connection).get_table_names()
            assert connection.execute(text('SELECT username FROM users WHERE id=:id'), {'id':owner_id}).scalar()=='owner'


def test_new_subscription_can_replace_cancelled_one(setup, monkeypatch):
    db, (owner, _, _), client=setup
    monkeypatch.setenv('STRIPE_WEBHOOK_SECRET','test'); monkeypatch.setenv('STRIPE_SECRET_KEY','test')
    monkeypatch.setenv('STRIPE_PRICE_PRO_MONTHLY','price_pro')
    monkeypatch.setattr(subscription,'_verify_webhook_signature',lambda *a:True)
    profile=models.ComprehensiveUserProfile(user_id=owner.id,stripe_customer_id='cus_test',stripe_subscription_id='sub_old',subscription_status='cancelled')
    db.add(profile);db.commit()
    monkeypatch.setattr(subscription.requests,'get',lambda *a,**kw: SimpleNamespace(ok=True,json=lambda:{'id':'sub_new','customer':'cus_test','status':'active','current_period_end':int((datetime.now(timezone.utc)+timedelta(days=30)).timestamp()),'items':{'data':[{'price':{'id':'price_pro'}}]}}))
    response=client.post('/api/subscription/webhook',json={'id':'evt_new','created':2,'type':'customer.subscription.created','data':{'object':{'id':'sub_new','customer':'cus_test','metadata':{'user_pk':str(owner.id)}}}})
    assert response.status_code==200,response.text
    assert profile.stripe_subscription_id=='sub_new'
    assert effective_plan(profile)=='pro'


def test_due_cards_use_the_spaced_review_queue(setup):
    db,(owner,_,_),client=setup
    cards=models.FlashcardSet(user_id=owner.id,title='Probability');db.add(cards);db.flush()
    db.add(models.Flashcard(set_id=cards.id,question='Q',answer='A',next_review_date=datetime.now(timezone.utc)-timedelta(days=1)));db.commit()
    assert client.get('/api/product/practice-next').json()['href']=='/flashcards?review=due'


def test_weakness_analysis_does_not_overwrite_verified_practice_with_old_cards(setup):
    from services.comprehensive_weakness_analyzer import get_comprehensive_weakness_analysis
    db, (owner, _, _), _client = setup
    area = models.UserWeakArea(user_id=owner.id, topic='fractions', total_questions=10, correct_count=9, incorrect_count=1, accuracy=90, weakness_score=7, status='mastered')
    cards = models.FlashcardSet(user_id=owner.id, title='Old cards')
    db.add_all([area, cards]); db.flush()
    db.add(models.Flashcard(set_id=cards.id, question='Old question', answer='Answer', category='fractions', times_reviewed=4, correct_count=1))
    db.commit()
    get_comprehensive_weakness_analysis(db, owner.id, models)
    db.expire_all()
    assert area.accuracy == 90 and area.status == 'mastered'
    assert area.total_questions == 10


def test_starter_prompts_use_percentage_scale_and_skip_mastered(setup):
    from services.chat_starter_prompts import _weak_area_candidates
    db, (owner, _, _), _client = setup
    db.add_all([
        models.UserWeakArea(user_id=owner.id, topic='Fractions', total_questions=5, accuracy=60, weakness_score=40, status='improving'),
        models.UserWeakArea(user_id=owner.id, topic='Geometry', total_questions=5, accuracy=95, weakness_score=80, status='mastered'),
    ]); db.commit()
    candidates = _weak_area_candidates(db, owner.id)
    assert len(candidates) == 1
    assert candidates[0].text.startswith('Explain')
    assert candidates[0].rank == 0.4


def test_placeholder_weaknesses_are_not_displayed_as_real_learning_gaps(setup):
    from services.comprehensive_weakness_analyzer import get_comprehensive_weakness_analysis
    db, (owner, _, _), _client = setup
    db.add(models.UserWeakArea(user_id=owner.id, topic='none', total_questions=3, incorrect_count=3, accuracy=0, status='needs_practice'))
    db.commit()
    result = get_comprehensive_weakness_analysis(db, owner.id, models)
    assert result['summary']['total_topics'] == 0
    assert db.query(models.UserWeakArea).filter_by(user_id=owner.id).count() == 1
