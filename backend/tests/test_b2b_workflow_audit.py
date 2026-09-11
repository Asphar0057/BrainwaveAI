"""Workflow regression checks using real routes and an isolated database."""
from test_b2b_journey import world


def assignment(c, sid, **changes):
    r = c.post('/api/institution/educator/assignments', json={
        'section_id': sid, 'title': 'Explain the probability of gold',
        'description': 'A bag contains three blue counters and one gold. One counter is chosen at random. Find the probability of gold and explain the denominator.',
        'rubric_text': '4 points: all four outcomes. 4 points: probability 1/4. 2 points: clear explanation.',
        'points_possible': 10, **changes})
    assert r.status_code == 201, r.text
    return r.json()['id']


def submit_grade(c, login, aid, score=8):
    login(2)
    r = c.post(f'/api/institution/student/assignments/{aid}/submit', json={'content_text': 'There are four equally likely counters. One is gold, so the probability is 1/4.'})
    assert r.status_code == 200, r.text
    sub = r.json()['id']; login(1)
    r = c.patch(f'/api/institution/educator/submissions/{sub}/grade', json={'score': score, 'feedback': 'You correctly counted all four counters and found 1/4. Next, explain why random selection makes the outcomes equally likely.'})
    assert r.status_code == 200, r.text
    return sub


def test_material_draft_submission_message_grade_refresh_and_isolation(world):
    db, users, c, login, org, sid, _ = world
    login(1)
    material = c.post(f'/api/institution/educator/sections/{sid}/materials', json={'title': 'Probability reading', 'material_type': 'link', 'source_url': 'https://example.com/probability'})
    assert material.status_code == 201, material.text
    aid = assignment(c, sid)
    login(2)
    section = c.get(f'/api/institution/sections/{sid}').json()
    assert section['materials'][0]['id'] == material.json()['id']
    body = {'content_text': 'I think the denominator is three because there are three blue counters.'}
    draft = c.put(f'/api/institution/student/assignments/{aid}/draft', json=body)
    assert draft.status_code == 200
    assert c.get(f'/api/institution/sections/{sid}').json()['assignments'][0]['content_text'] == body['content_text']
    login(1)
    assert c.get(f'/api/institution/educator/assignments/{aid}/submissions').json()['submissions'][0]['content_text'] is None
    sub = submit_grade(c, login, aid)
    login(2)
    msg = c.post('/api/institution/messages', json={'section_id': sid, 'recipient_id': users[1].id, 'assignment_id': aid, 'subject': 'Why count all counters?', 'body': 'Does the denominator include the gold counter as well as the three blue counters?'})
    assert msg.status_code == 201, msg.text
    login(4)
    assert c.get('/api/institution/messages').json()['messages'] == []
    assert c.get(f'/api/institution/submissions/{sub}/history').status_code == 404
    login(3)
    for path in [f'/sections/{sid}', f'/educator/sections/{sid}/gradebook', f'/educator/assignments/{aid}/submissions']:
        assert c.get('/api/institution'+path).status_code in {403,404}
    login(1)
    assert c.get('/api/institution/messages').json()['messages'][0]['id'] == msg.json()['id']
    book = c.get(f'/api/institution/educator/sections/{sid}/gradebook').json()
    row = next(r for r in book['rows'] if r['student']['id'] == users[2].id)
    assert row['average_percent'] == 80 and row['progress_percent'] == 100
    login(2)
    for _ in range(2):
        course = c.get('/api/institution/student/dashboard').json()['courses'][0]
        assert course['progress_percent'] == 100 and course['mastery_percent'] == 80
        result = c.get(f'/api/institution/sections/{sid}').json()['assignments'][0]
        assert result['score'] == 8 and 'equally likely' in result['feedback']
    assert any(n['type'] == 'class_grade' for n in c.get('/api/institution/notifications').json()['notifications'])


def test_progress_recalculates_when_assignment_set_changes(world):
    db, users, c, login, org, sid, _ = world; login(1)
    a = assignment(c, sid); submit_grade(c, login, a)
    b = assignment(c, sid, title='Second assignment')
    login(2)
    assert c.get('/api/institution/student/dashboard').json()['courses'][0]['progress_percent'] == 50
    login(1); assert c.delete(f'/api/institution/educator/assignments/{b}').status_code == 200
    login(2); assert c.get('/api/institution/student/dashboard').json()['courses'][0]['progress_percent'] == 100
    login(1); c.delete(f'/api/institution/educator/assignments/{a}')
    login(2)
    course = c.get('/api/institution/student/dashboard').json()['courses'][0]
    assert course['progress_percent'] == 0 and course['mastery_percent'] == 0


def test_weighted_grade_matches_student_dashboard(world):
    db, users, c, login, org, sid, _ = world; login(1)
    a = assignment(c, sid, weight_percent=80); submit_grade(c, login, a, 10)
    b = assignment(c, sid, title='Second assignment', weight_percent=20); submit_grade(c, login, b, 0)
    book = c.get(f'/api/institution/educator/sections/{sid}/gradebook').json()
    row = next(r for r in book['rows'] if r['student']['id'] == users[2].id)
    login(2)
    assert c.get('/api/institution/student/dashboard').json()['courses'][0]['mastery_percent'] == row['average_percent'] == 80


def test_reject_blank_feedback_and_invalid_assignment_changes(world):
    db, users, c, login, org, sid, _ = world; login(1)
    a = assignment(c, sid); sub = submit_grade(c, login, a)
    assert c.patch(f'/api/institution/educator/submissions/{sub}/grade', json={'score':8,'feedback':'   '}).status_code == 422
    assert c.patch(f'/api/institution/educator/assignments/{a}', json={'points_possible':5}).status_code == 422
    assert c.patch(f'/api/institution/educator/assignments/{a}', json={'title':None}).status_code == 422
    assert c.post('/api/institution/educator/assignments', json={'section_id':sid,'title':'   '}).status_code == 422
    assert c.post('/api/institution/educator/assignments', json={'section_id':sid,'title':'Reversed dates','start_at':'2026-09-15T10:00:00Z','due_at':'2026-09-14T10:00:00Z'}).status_code == 422


def test_teacher_creates_own_class_with_company_students_atomically(world):
    db, users, c, login, org, sid, _ = world; login(1)
    setup = c.get('/api/institution/educator/class-setup').json()
    assert setup['instructor_id'] == users[1].id
    assert {s['id'] for s in setup['companies'][0]['students']} == {users[2].id, users[4].id}
    body = {'code':'AUDIT101','title':'Probability practice','name':'Pilot class','instructor_id':users[1].id,'student_ids':[users[2].id]}
    assert c.post(f'/api/institution/companies/{org}/sections',json={**body,'instructor_id':users[0].id}).status_code == 403
    assert c.post(f'/api/institution/companies/{org}/sections',json={**body,'student_ids':[users[2].id,users[3].id]}).status_code == 422
    r = c.post(f'/api/institution/companies/{org}/sections',json=body); assert r.status_code == 201,r.text
    new = r.json()['id']; login(2)
    assert c.get(f'/api/institution/sections/{new}').status_code == 200
    login(4); assert c.get(f'/api/institution/sections/{new}').status_code == 404
    assert c.get('/api/institution/educator/class-setup').status_code == 403


def test_draft_files_are_private_until_submitted(world, monkeypatch):
    from services.storage_service import StorageService
    class MemoryStorage:
        storage_type = 'local'
        def upload_bytes(self, *args): pass
        def download_bytes(self, *args): return b'Private draft content'
    monkeypatch.setattr(StorageService, 'get_storage', lambda: MemoryStorage())
    db, users, c, login, org, sid, _ = world; login(1)
    a = assignment(c, sid); login(2)
    upload = c.post(f'/api/institution/student/assignments/{a}/file', files={'file':('draft.txt',b'Private draft content','text/plain')})
    assert upload.status_code == 200, upload.text
    url = upload.json()['url']; assert c.get(url).status_code == 200
    login(1); assert c.get(url).status_code == 404
    login(4); assert c.get(url).status_code in {403,404}
    login(2)
    assert c.post(f'/api/institution/student/assignments/{a}/submit',json={'content_text':'My completed work is in the attached file.', 'attachment_url':url}).status_code == 200
    login(1); assert c.get(url).content == b'Private draft content'


def test_material_requires_a_real_resource(world):
    db, users, c, login, org, sid, _ = world; login(1)
    assert c.post(f'/api/institution/educator/sections/{sid}/materials',json={'title':'An empty material'}).status_code == 422


def test_separate_company_teacher_cannot_read_or_change_evidence(world):
    db, users, c, login, org, sid, _ = world; login(1)
    a = assignment(c, sid); sub = submit_grade(c, login, a)
    login(3)
    second = c.post('/api/institution/companies',json={'name':'Second independent company'}); assert second.status_code == 201
    other = second.json()['id']
    assert [r['id'] for r in c.get('/api/institution/educator/class-setup').json()['companies']] == [other]
    for endpoint in [f'/sections/{sid}',f'/sections/{sid}/learning',f'/educator/sections/{sid}/gradebook',f'/educator/sections/{sid}/grades.csv',f'/educator/assignments/{a}/submissions',f'/submissions/{sub}/history']:
        assert c.get('/api/institution'+endpoint).status_code == 404
    assert c.patch(f'/api/institution/educator/submissions/{sub}/grade',json={'score':0,'feedback':'Unauthorized change'}).status_code == 404
    assert c.post('/api/institution/messages',json={'section_id':sid,'recipient_id':users[2].id,'subject':'Wrong company','body':'This should never be delivered.'}).status_code == 404


def test_personalization_topics_never_cross_accounts(world):
    from services.ml_pipeline import MessageMLPipeline
    db, users, c, login, org, sid, _ = world
    import models
    db.add(models.TopicMastery(user_id=users[3].id,topic_name='Private company topic',mastery_level=0.5))
    db.commit()
    pipeline = MessageMLPipeline.__new__(MessageMLPipeline)
    class Registry:
        _embed_model = True
        def embed(self, text): return [1.0,0.0]
    pipeline._registry = Registry()
    assert pipeline._load_concept_cache(db, users[2].id) == {}
    assert 'private_company_topic' in pipeline._load_concept_cache(db, users[3].id)


def test_unrelated_topics_are_not_inferred_from_embedding_similarity(world):
    import asyncio
    from services.ml_pipeline import MessageMLPipeline, SessionContext
    db, users, c, login, org, sid, _ = world
    pipeline = MessageMLPipeline.__new__(MessageMLPipeline)
    class Registry:
        _embed_model = True
        def embed(self,text):return [1.0,0.0]
        def get_model_info(self):return {}
    pipeline._registry = Registry()
    pipeline._load_concept_cache = lambda db,uid: {'confusing_economics_with_other_social_sciences':[1.0,0.0]}
    _, concepts = asyncio.run(pipeline._layer1_intent_concept('What is the probability of gold?',db,users[2].id,SessionContext()))
    assert concepts == []


def test_first_turn_attempt_gets_checked_before_guidance():
    from tutor.nodes import detect_intent
    result=detect_intent({'tutor_mode':True,'user_input':'I think P(gold) is 1/3 because there are three blue and one gold counter. Is my reasoning correct? Explain simply and help me fix it.','chat_history':[]})
    assert result['intent']=='comprehension_answer'
    assert '1/3' in result['comprehension_check']


def test_pilot_report_keeps_unknown_savings_and_real_denominators(world, tmp_path):
    import sqlite3
    from scripts.b2b_pilot_report import report
    db, users, c, login, org, sid, _ = world; login(1)
    a = assignment(c, sid); submit_grade(c, login, a)
    target=tmp_path/'pilot.db'
    with sqlite3.connect(target) as backup:
        db.connection().connection.driver_connection.backup(backup)
    data=report(target,sid)
    assert data['assignment_completion']=={'submitted':1,'eligible':2,'percent':50.0}
    assert data['repeat_learning_activity']['learners_on_multiple_days']==0
    assert data['teacher_time']['minutes_saved'] is None
    times=tmp_path/'times.csv';times.write_text('task,baseline_minutes,cerbyl_minutes\nReview 2 answers,10,12\n')
    assert report(target,sid,time_csv=times)['teacher_time']['minutes_saved']==-2


def test_retry_after_lost_response_does_not_duplicate_attempt_or_feedback(world):
    import models
    db, users, c, login, org, sid, _ = world; login(1)
    a=assignment(c,sid,allow_resubmission=False);login(2)
    body={'content_text':'All four outcomes count in the denominator, giving one fourth.'}
    first=c.post(f'/api/institution/student/assignments/{a}/submit',json=body)
    retry=c.post(f'/api/institution/student/assignments/{a}/submit',json=body)
    assert retry.status_code==200 and retry.json()==first.json()
    sub=first.json()['id'];login(1)
    grade={'score':10,'feedback':'Correct: you included all four equally likely outcomes. Explain a different example next.'}
    first=c.patch(f'/api/institution/educator/submissions/{sub}/grade',json=grade)
    notifications=db.query(models.Notification).count();history=db.query(models.SubmissionRevision).count()
    retry=c.patch(f'/api/institution/educator/submissions/{sub}/grade',json=grade)
    assert retry.status_code==200 and retry.json()==first.json()
    assert db.query(models.Notification).count()==notifications
    assert db.query(models.SubmissionRevision).count()==history
