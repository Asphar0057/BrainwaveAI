"""Real classroom routes and database, no AI calls or real environment files."""
import os
import sys
from pathlib import Path
os.environ['CERBYL_NO_ENV_FILES'] = '1'
os.environ['SECRET_KEY'] = 'b2b-test-secret-not-a-real-deployment'
os.environ['DATABASE_URL'] = 'sqlite://'
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi import FastAPI
from fastapi.testclient import TestClient
import models
from database import get_db
from routes.institution import router
from services.auth_tokens import create_user_access_token

@pytest.fixture
def world():
    engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
    @event.listens_for(engine,'connect')
    def fk(conn,_): conn.execute('PRAGMA foreign_keys=ON')
    models.Base.metadata.create_all(engine)
    db=sessionmaker(bind=engine)()
    users=[models.User(username=n,email=n+'@example.com',account_role='learner') for n in ['owner','teacher','student','outsider','peer']]
    db.add_all(users);db.commit()
    app=FastAPI();app.include_router(router);app.dependency_overrides[get_db]=lambda:db
    client=TestClient(app)
    def login(index): client.headers['Authorization']='Bearer '+create_user_access_token(users[index])
    login(0)
    r=client.post('/api/institution/companies',json={'name':'First Learning Centre'});assert r.status_code==201,r.text
    org=r.json()['id']
    def invite(index,role,section=None):
        login(0);r=client.post(f'/api/institution/companies/{org}/invitations',json={'entries':[{'email':users[index].email,'role':role,'section_id':section}]});assert r.status_code==201,r.text
        token=r.json()['invitations'][0]['token'];login(index);a=client.post('/api/institution/invitations/accept',json={'token':token});assert a.status_code==200,a.text
        return token
    invite(1,'educator');login(0)
    r=client.post(f'/api/institution/companies/{org}/sections',json={'code':'MATH101','title':'Probability','name':'September','instructor_id':users[1].id});assert r.status_code==201,r.text
    sid=r.json()['id']; token=invite(2,'student',sid);invite(4,'student',sid)
    yield db,users,client,login,org,sid,token
    db.close();engine.dispose()

QUESTION={'prompt':'A bag has three blue counters and one gold. Probability of gold?', 'options':['1/3','1/4','3/4','1/2'], 'correct_index':1,'explanation':'One gold counter out of four total gives 1/4.', 'source':'Teacher probability lesson, paragraph 1'}

def test_b2b_profile_saves_identity_without_changing_access(world):
    db,users,c,login,org,sid,token=world;login(2)
    profile=c.get('/api/institution/profile').json()
    assert profile['role']=='student'
    assert [s['id'] for s in profile['classes']]==[sid]
    assert profile['organizations'][0]['id']==org
    response=c.patch('/api/institution/profile',json={'first_name':'  Aarav  ','last_name':'Northstar'})
    assert response.status_code==200,response.text
    assert response.json()['user']['display_name']=='Aarav Northstar'
    assert c.get('/api/institution/profile').json()['user']['first_name']=='Aarav'
    for extra in [{'account_role':'educator'},{'user_id':users[1].id},{'email':'new@example.com'},{'username':'owner'},{'organization_id':org}]:
        assert c.patch('/api/institution/profile',json={'first_name':'Changed',**extra}).status_code==422
    assert c.patch('/api/institution/profile',json={'first_name':'   '}).status_code==422
    db.refresh(users[2]);db.refresh(users[1])
    assert users[2].account_role=='student'
    assert users[2].first_name=='Aarav'
    assert users[1].first_name is None

def test_b2b_profile_respects_membership_and_excludes_consumer_accounts(world):
    db,users,c,login,org,sid,token=world;login(3)
    assert c.get('/api/institution/profile').status_code==403
    assert c.patch('/api/institution/profile',json={'first_name':'Outsider'}).status_code==403
    login(0)
    profile=c.get('/api/institution/profile').json()
    assert profile['dashboard_route']=='/company'
    assert profile['organizations'][0]['role']=='owner'
    membership=db.query(models.OrganizationMembership).filter_by(user_id=users[2].id,organization_id=org).one()
    membership.status='inactive';db.commit();login(2)
    profile=c.get('/api/institution/profile').json()
    assert profile['organizations']==[] and profile['classes']==[]
    login(1)
    assert c.get('/api/institution/profile').json()['classes'][0]['id']==sid

def checkpoint(world):
    db,users,c,login,org,sid,token=world;login(1)
    r=c.post(f'/api/institution/educator/sections/{sid}/checkpoints',json={'title':'Probability checkpoint','concept':'Probability','questions':[QUESTION]});assert r.status_code==201,r.text
    return r.json()['id']

def test_end_to_end_learning_followup_and_private_evidence(world):
    db,users,c,login,org,sid,token=world;login(1)
    lesson={'title':'Probability foundations','objective':'Use all possible outcomes','content':'A probability compares favourable outcomes with all equally likely outcomes.','position':1,'minutes':5,'status':'draft'}
    r=c.post(f'/api/institution/educator/sections/{sid}/lessons',json=lesson);assert r.status_code==201,r.text
    lid=r.json()['id'];login(2)
    assert c.get(f'/api/institution/sections/{sid}/learning').json()['lessons']==[]
    assert c.post(f'/api/institution/student/lessons/{lid}/complete',json={'confidence':3}).status_code==404
    login(1);lesson['status']='published';assert c.put(f'/api/institution/educator/lessons/{lid}',json=lesson).status_code==200
    qid=checkpoint(world);login(2)
    assert c.get(f'/api/institution/sections/{sid}/learning').json()['checkpoints']==[]
    login(1);assert c.post(f'/api/institution/educator/checkpoints/{qid}/approve').status_code==200
    login(2);q=c.get(f'/api/institution/sections/{sid}/learning').json()['checkpoints'][0]['questions'][0]
    assert set(q)=={'prompt','options'}
    assert c.post(f'/api/institution/student/lessons/{lid}/complete',json={'confidence':2}).status_code==200
    r=c.post(f'/api/institution/student/checkpoints/{qid}/submit',json={'answers':[0],'confidence':[3]});assert r.status_code==200,r.text
    assert r.json()['score_percent']==0;aid=r.json()['id']
    replay=c.post(f'/api/institution/student/checkpoints/{qid}/submit',json={'answers':[1],'confidence':[3]});assert replay.json()['score_percent']==0
    assert db.query(models.CheckpointAttempt).count()==1
    login(1);b=c.get(f'/api/institution/educator/sections/{sid}/briefing');assert b.status_code==200,b.text
    assert b.json()['evidence'][0]['signal']=='Confident but incorrect'
    r=c.post(f'/api/institution/educator/sections/{sid}/followups',json={'student_id':users[2].id,'title':'Revisit the denominator','instructions':'Explain why the denominator counts every counter in the bag.','checkpoint_attempt_id':aid});assert r.status_code==201,r.text
    fid=r.json()['id'];login(4);assert c.get(f'/api/institution/sections/{sid}/learning').json()['followups']==[]
    assert c.post(f'/api/institution/student/followups/{fid}/respond',json={'response':'I am not the intended student for this task.'}).status_code==404
    login(2);assert c.get('/api/institution/student/plan').json()['tasks'][0]['type']=='followup'
    assert c.post(f'/api/institution/student/followups/{fid}/respond',json={'response':'The denominator is four because there are four counters altogether.'}).status_code==200
    login(1);assert c.post(f'/api/institution/educator/followups/{fid}/review',json={'review':'You now counted every outcome correctly. Good reasoning.','status':'resolved'}).status_code==200
    login(2);assert c.get(f'/api/institution/sections/{sid}/learning').json()['followups'][0]['status']=='resolved'


def test_company_isolation_roles_and_revocation(world):
    db,users,c,login,org,sid,token=world
    login(3)
    for path in [f'/companies/{org}',f'/sections/{sid}',f'/sections/{sid}/learning',f'/companies/{org}/roster.csv']:
        assert c.get('/api/institution'+path).status_code in {403,404}
    login(2);assert c.get(f'/api/institution/companies/{org}').status_code==404
    assert c.post(f'/api/institution/educator/sections/{sid}/lessons',json={'title':'Bad lesson','objective':'Bad objective','content':'A student may not publish a lesson.'}).status_code==403
    login(0);m=db.query(models.OrganizationMembership).filter_by(user_id=users[2].id,organization_id=org).one()
    assert c.patch(f'/api/institution/companies/{org}/members/{m.id}',json={'status':'inactive'}).status_code==200
    login(2)
    assert c.get(f'/api/institution/sections/{sid}').status_code==404
    assert c.get('/api/institution/student/dashboard').json()['courses']==[]
    assert c.get('/api/institution/student/plan').json()['tasks']==[]
    assert c.get('/api/institution/messages').json()['messages']==[]


def test_invitation_replay_email_binding_seats_and_atomic_import(world):
    db,users,c,login,org,sid,token=world
    login(2);assert c.post('/api/institution/invitations/accept',json={'token':token}).status_code==409
    login(0);license=db.get(models.OrganizationLicense,org);license.seat_limit=5;db.commit()
    r=c.post(f'/api/institution/companies/{org}/invitations',json={'entries':[{'email':'next@example.com'}]});assert r.status_code==201,r.text
    pending=r.json()['invitations'][0]['token']
    assert c.post(f'/api/institution/companies/{org}/invitations',json={'entries':[{'email':'another@example.com'}]}).status_code==409
    login(3);assert c.post('/api/institution/invitations/accept',json={'token':pending}).status_code==403
    login(0);license.seat_limit=20;db.commit();count=db.query(models.OrganizationInvite).count()
    assert c.post(f'/api/institution/companies/{org}/invitations',json={'entries':[{'email':'new@example.com'},{'email':'teacher@example.com'}]}).status_code==409
    assert db.query(models.OrganizationInvite).count()==count


def test_approval_and_validation_protect_results(world):
    db,users,c,login,org,sid,token=world;qid=checkpoint(world);login(2)
    assert c.post(f'/api/institution/student/checkpoints/{qid}/submit',json={'answers':[1],'confidence':[3]}).status_code==404
    login(1);c.post(f'/api/institution/educator/checkpoints/{qid}/approve')
    assert c.put(f'/api/institution/educator/checkpoints/{qid}',json={'title':'Changed checkpoint','concept':'Probability','questions':[QUESTION]}).status_code==409
    login(2)
    for body in [{'answers':[99],'confidence':[3]},{'answers':[1],'confidence':[0]},{'answers':[1,1],'confidence':[3,3]}]:
        assert c.post(f'/api/institution/student/checkpoints/{qid}/submit',json=body).status_code==422
    assert db.query(models.CheckpointAttempt).count()==0


def test_submission_history_survives_regrading_and_resubmit(world):
    db,users,c,login,org,sid,token=world;login(1)
    r=c.post('/api/institution/educator/assignments',json={'section_id':sid,'title':'Explain probability','points_possible':10});assert r.status_code==201,r.text
    aid=r.json()['id'];login(2)
    r=c.post(f'/api/institution/student/assignments/{aid}/submit',json={'content_text':'My original answer used three as the denominator.'});assert r.status_code==200,r.text
    sub=r.json()['id'];login(1)
    assert c.patch(f'/api/institution/educator/submissions/{sub}/grade',json={'score':3,'feedback':'Count all four outcomes.'}).status_code==200
    login(2);assert c.post(f'/api/institution/student/assignments/{aid}/submit',json={'content_text':'My new answer is one fourth because there are four counters.'}).status_code==200
    h=c.get(f'/api/institution/submissions/{sub}/history');assert h.status_code==200,h.text
    assert any(r['snapshot']['score']==3 and 'original' in r['snapshot']['content_text'] for r in h.json())
    login(4);assert c.get(f'/api/institution/submissions/{sub}/history').status_code==404
    login(1);assert c.get(f'/api/institution/educator/sections/{sid}/grades.csv').status_code==200


def test_csv_formula_safety():
    from routes.institution.company import csv_response
    assert "'=HYPERLINK" in csv_response('x.csv',['Name'],[['=HYPERLINK("bad")']]).body.decode()


def test_expired_company_blocks_new_work_but_keeps_exports(world):
    from datetime import datetime,timedelta
    db,users,c,login,org,sid,_=world
    license=db.get(models.OrganizationLicense,org);license.expires_at=datetime.now()-timedelta(days=1);db.commit()
    login(1)
    assert c.post('/api/institution/educator/assignments',json={'section_id':sid,'title':'New work'}).status_code==402
    assert c.get(f'/api/institution/educator/sections/{sid}/grades.csv').status_code==200
    assert c.get(f'/api/institution/sections/{sid}/learning').status_code==200


def test_teacher_cannot_read_private_draft_and_student_only_sees_own_rank(world):
    db,users,c,login,org,sid,_=world;login(1)
    r=c.post('/api/institution/educator/assignments',json={'section_id':sid,'title':'Private draft example'});aid=r.json()['id']
    login(2);assert c.put(f'/api/institution/student/assignments/{aid}/draft',json={'content_text':'Private unfinished thoughts that must not be shared with my teacher.'}).status_code==200
    login(1);rows=c.get(f'/api/institution/educator/assignments/{aid}/submissions').json()['submissions']
    assert all(r['content_text'] is None for r in rows)
    login(2);board=c.get(f'/api/institution/sections/{sid}/leaderboard').json()
    assert board['student_count']==2
    assert [r['student']['id'] for r in board['leaderboard']]==[users[2].id]


def test_company_withdrawn_teacher_has_no_classroom_access(world):
    db,users,c,login,org,sid,_=world;login(0)
    row=db.query(models.OrganizationMembership).filter_by(organization_id=org,user_id=users[1].id).one()
    c.patch(f'/api/institution/companies/{org}/members/{row.id}',json={'status':'inactive'})
    login(1)
    assert c.get('/api/institution/educator/dashboard').json()['class_health']==[]
    assert c.get('/api/institution/educator/assignments').json()['assignments']==[]
    assert c.get(f'/api/institution/educator/sections/{sid}/grades.csv').status_code==404


def test_checkpoint_retirement_preserves_results_and_teacher_resolves_report(world):
    from routes.product import owned_snapshot
    db,users,c,login,org,sid,_=world;qid=checkpoint(world);login(1);c.post(f'/api/institution/educator/checkpoints/{qid}/approve')
    login(2);r=c.post(f'/api/institution/student/checkpoints/{qid}/submit',json={'answers':[1],'confidence':[3]});attempt_id=r.json()['id']
    snapshot=owned_snapshot(db,users[2],'checkpoint_attempt',attempt_id)
    report=models.AnswerReport(user_id=users[2].id,resource_type='checkpoint_attempt',resource_id=attempt_id,reason='unclear_explanation',detail='Please explain the denominator.',snapshot=snapshot);db.add(report);db.commit()
    login(1);assert c.post(f'/api/institution/educator/checkpoint-reports/{report.id}/resolve',json={'resolution':'The denominator includes every equally likely outcome, including gold.'}).status_code==200
    assert db.get(models.AnswerReport,report.id).status=='resolved'
    assert c.post(f'/api/institution/educator/checkpoints/{qid}/archive').status_code==200
    login(2);result=c.get(f'/api/institution/sections/{sid}/learning').json()['checkpoints'][0]
    assert result['attempt']['score_percent']==100 and result['status']=='archived'
    login(4);assert c.get(f'/api/institution/sections/{sid}/learning').json()['checkpoints']==[]
    assert c.post(f'/api/institution/student/checkpoints/{qid}/submit',json={'answers':[1],'confidence':[3]}).status_code==404
