"""Isolated local B2B demo: real institution routes, separate SQLite DB, no AI calls.
Run: python backend/scripts/b2b_demo.py --build-dir /tmp/cerbyl-b2b-build
Never points at the deployment DATABASE_URL or reads environment files.
"""
import argparse
import json
import os
import secrets
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / '.local' / 'b2b-demo'
LOCAL.mkdir(parents=True, exist_ok=True)
os.chmod(LOCAL, 0o700)
os.environ['CERBYL_NO_ENV_FILES'] = '1'
os.environ['DATABASE_URL'] = 'sqlite:///' + str(LOCAL / 'classroom.db')
os.environ['STORAGE_TYPE'] = 'local'
os.environ['UPLOAD_DIR'] = str(LOCAL / 'uploads')
secret_file = LOCAL / 'session.key'
if not secret_file.exists():
    secret_file.write_text(secrets.token_urlsafe(48)); secret_file.chmod(0o600)
os.environ['SECRET_KEY'] = secret_file.read_text().strip()
sys.path.insert(0,str(ROOT/'backend'))
import models
from database import Base, engine, SessionLocal, get_db
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from routes.institution import router
from routes.product import router as product_router
from deps import get_current_user
from services.auth_tokens import create_user_access_token

CREDENTIALS = LOCAL / 'credentials.json'

def seed():
    Base.metadata.create_all(engine)
    if CREDENTIALS.exists():
        return json.loads(CREDENTIALS.read_text())
    db=SessionLocal(); credentials=[]; ph=PasswordHasher()
    for slug, name, course_title in [('northstar','Northstar Coaching · Demo','Probability foundations'),('meridian','Meridian Training · Demo','Workplace numeracy')]:
        if db.query(models.Organization).filter_by(slug=slug+'-b2b-demo').first():
            raise RuntimeError('Demo already exists but credentials are missing. Use the existing database credentials or a new demo directory; users were not overwritten.')
        org=models.Organization(name=name,slug=slug+'-b2b-demo',institution_type='coaching' if slug=='northstar' else 'training');db.add(org);db.flush()
        db.add(models.OrganizationLicense(organization_id=org.id,plan='demo',seat_limit=25,expires_at=datetime.now()+timedelta(days=90)))
        people={}
        for role,first in [('owner','Alex'),('educator','Maya'),('student','Aarav'),('student2','Riya')]:
            label={'educator':'teacher','student2':'student2'}.get(role,role)
            password=secrets.token_urlsafe(14)+'!7'
            user=models.User(username=f'{slug}.{label}',email=f'{slug}.{label}@example.com',first_name=first,last_name=name.split()[0],account_role='educator' if role in {'owner','educator'} else 'student',hashed_password=ph.hash(password),school_university=name)
            db.add(user);db.flush();people[role]=user
            db.add(models.OrganizationMembership(organization_id=org.id,user_id=user.id,role='student' if role=='student2' else role))
            credentials.append({'company':name,'role':label,'username':user.username,'email':user.email,'password':password,'portal':'/company' if role=='owner' else '/educator' if role=='educator' else '/student'})
        term=models.AcademicTerm(organization_id=org.id,name='September cohort',starts_on=date.today()-timedelta(days=7),ends_on=date.today()+timedelta(days=90),is_current=True);db.add(term);db.flush()
        course=models.Course(organization_id=org.id,code='FOUND101',title=course_title,description='Fictional demonstration course.',created_by=people['owner'].id);db.add(course);db.flush()
        section=models.ClassSection(course_id=course.id,academic_term_id=term.id,name='Evening cohort',instructor_id=people['educator'].id,schedule_text='Tue & Thu · 6 pm IST',room='Online classroom');db.add(section);db.flush()
        for role in ['student','student2']:db.add(models.Enrollment(section_id=section.id,student_id=people[role].id))
        lesson=models.LearningLesson(section_id=section.id,title='Count every possible outcome',objective='Explain why probability uses all equally likely outcomes.',content='A bag contains three blue counters and one gold counter.\n\nThere are four counters altogether. Each is equally likely to be selected. The probability of gold is the number of gold counters divided by the number of all counters: 1 / 4.\n\nA common error is dividing by only the three blue counters. That excludes the gold counter from the total.\n\nTry a fresh example: if the bag contains two gold and three blue counters, the probability of gold is 2 / 5.\n\nThis lesson is prepared demonstration content reviewed for this sample.',position=1,minutes=5,status='published',created_by=people['educator'].id);db.add(lesson)
        questions=[{'prompt':'Three blue counters and one gold: what is the probability of gold?', 'options':['1/3','1/4','3/4','1/2'],'correct_index':1,'explanation':'One favourable outcome divided by four equally likely outcomes gives 1/4.','source':'Count every possible outcome · paragraphs 1–2'}, {'prompt':'Two gold and three blue counters: what is the probability of gold?', 'options':['2/3','3/5','2/5','1/5'],'correct_index':2,'explanation':'There are two gold counters out of five total counters, so the probability is 2/5.','source':'Count every possible outcome · fresh example'}]
        check=models.LearningCheckpoint(section_id=section.id,title='Probability: check your reasoning',concept='Counting outcomes',questions=questions,status='published',approved_by=people['educator'].id,approved_at=datetime.now(),created_by=people['educator'].id);db.add(check);db.flush()
        results=[{**q,'chosen_index':i,'confidence':3,'is_correct':i==q['correct_index']} for q,i in zip(questions,[0,2])]
        db.add(models.CheckpointAttempt(checkpoint_id=check.id,student_id=people['student2'].id,answers=[0,2],confidence=[3,3],results=results,score_percent=50))
        assignment=models.Assignment(section_id=section.id,title='Explain the denominator',description='A bag has three blue counters and one gold. Explain your answer in your own words and give a second example.',points_possible=10,rubric_text='4 points: counts all outcomes. 4 points: correct probability. 2 points: a clear explanation.',estimated_minutes=10,created_by=people['educator'].id,due_at=datetime.now()+timedelta(days=3));db.add(assignment);db.flush()
        db.add(models.Submission(assignment_id=assignment.id,student_id=people['student2'].id,status='submitted',content_text='I think the probability is one third, because there are three blue counters.',submitted_at=datetime.now()))
        db.add(models.LearningIntervention(section_id=section.id,student_id=people['student'].id,created_by=people['educator'].id,title='Explain your reasoning before we meet',instructions='Read the lesson and explain why every counter belongs in the denominator. Then give a new example using two gold counters and three blue counters.',evidence={'basis':'teacher_observation'},due_at=datetime.now()+timedelta(days=2)))
        db.add(models.Announcement(section_id=section.id,author_id=people['educator'].id,title='Welcome to your cohort',body='Start with your learning plan. Read the lesson, try the checkpoint, and ask your teacher privately if you need help.'))
        db.add(models.OrganizationAudit(organization_id=org.id,actor_id=people['owner'].id,action='demo_created',detail='Fictional company, people and coursework created for local product testing.'))
    db.commit();db.close()
    CREDENTIALS.write_text(json.dumps(credentials,indent=2));CREDENTIALS.chmod(0o600)
    return credentials


def make_app(build_dir):
    app=FastAPI(title='Cerbyl isolated B2B demo')
    app.add_middleware(CORSMiddleware,allow_origins=['http://localhost:4174','http://127.0.0.1:4174'],allow_methods=['*'],allow_headers=['*'])
    app.include_router(router)
    app.include_router(product_router)
    @app.post('/api/token')
    def token(form: OAuth2PasswordRequestForm=Depends(),db:Session=Depends(get_db)):
        u=db.query(models.User).filter(models.User.username==form.username.strip()).first()
        valid=False
        if u:
            try:valid=PasswordHasher().verify(u.hashed_password,form.password)
            except (VerificationError,InvalidHashError):pass
        if not valid:raise HTTPException(401,'Incorrect username or password.')
        return {'access_token':create_user_access_token(u),'token_type':'bearer'}
    @app.get('/api/me')
    def me(user=Depends(get_current_user)):
        return {'id':user.id,'username':user.username,'email':user.email,'first_name':user.first_name,'last_name':user.last_name,'account_role':user.account_role}
    @app.get('/api/health')
    def health():return {'status':'ok','mode':'isolated_local_b2b_demo'}
    @app.get('/{path:path}')
    def frontend(path:str):
        if path.startswith('api/'):raise HTTPException(404,'This endpoint is outside the local B2B demo.')
        candidate=(build_dir/path).resolve()
        if not candidate.is_relative_to(build_dir):raise HTTPException(404)
        # This preview is rebuilt in place. Never reuse an earlier app shell or
        # return HTML for a JavaScript/CSS chunk removed by a newer build.
        if candidate.is_file():return FileResponse(candidate,headers={'Cache-Control':'no-store'})
        if path.startswith('static/'):raise HTTPException(404,'Preview asset no longer exists. Reload the page.')
        return FileResponse(build_dir/'index.html',headers={'Cache-Control':'no-store'})
    return app

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--build-dir',default=str(ROOT/'build'));parser.add_argument('--seed-only',action='store_true');parser.add_argument('--port',type=int,default=4174);args=parser.parse_args()
    rows=seed()
    print(f'Demo accounts ready. Private credentials: {CREDENTIALS}')
    if not args.seed_only:
        build=Path(args.build_dir).resolve()
        if not (build/'index.html').exists():raise SystemExit('Build the web app first and pass --build-dir.')
        import uvicorn
        uvicorn.run(make_app(build),host='127.0.0.1',port=args.port,access_log=False)
