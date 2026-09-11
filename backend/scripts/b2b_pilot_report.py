"""Read-only local pilot scorecard. No credentials, environment files or writes to the database.

Usage: python backend/scripts/b2b_pilot_report.py --section-id 5 --out output/pilot
Teacher time CSV: task,baseline_minutes,cerbyl_minutes (same task scope in each row).
"""
import argparse
import csv
import json
import sqlite3
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path


def report(database, section_id, days=14, time_csv=None):
    db = sqlite3.connect(f'file:{Path(database).resolve()}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    section = db.execute('SELECT s.id,s.name,c.code,c.title,o.name company FROM class_sections s JOIN courses c ON c.id=s.course_id JOIN organizations o ON o.id=c.organization_id WHERE s.id=?',(section_id,)).fetchone()
    if not section: raise ValueError('Class not found')
    students = {r[0] for r in db.execute("SELECT student_id FROM enrollments WHERE section_id=? AND status='active'",(section_id,))}
    assignments = db.execute("SELECT id,title,due_at FROM assignments WHERE section_id=? AND status='published' AND (start_at IS NULL OR datetime(start_at)<=datetime('now'))",(section_id,)).fetchall()
    rows=[]
    for a in assignments:
        submissions = [r for r in db.execute('SELECT student_id,status,submitted_at,graded_at FROM submissions WHERE assignment_id=?',(a['id'],)) if r['student_id'] in students]
        done=[r for r in submissions if r['status'] in ('submitted','graded')]
        rows.append({'assignment_id':a['id'],'title':a['title'],'eligible_students':len(students),'submitted':len(done),'graded':sum(r['status']=='graded' for r in done),'completion_percent':round(100*len(done)/len(students),1) if students else None})
    since=(datetime.now(timezone.utc)-timedelta(days=days)).isoformat()
    activity=defaultdict(set)
    queries=[
        ('SELECT actor_id,created_at FROM class_activity_events WHERE section_id=? AND event_type=\'submission_received\'',()),
        ('SELECT lc.student_id,lc.completed_at FROM lesson_completions lc JOIN learning_lessons l ON l.id=lc.lesson_id WHERE l.section_id=?',()),
        ('SELECT ca.student_id,ca.submitted_at FROM checkpoint_attempts ca JOIN learning_checkpoints q ON q.id=ca.checkpoint_id WHERE q.section_id=?',()),
        ('SELECT student_id,responded_at FROM learning_interventions WHERE section_id=? AND responded_at IS NOT NULL',()),
    ]
    for query,_ in queries:
        for uid,date in db.execute(query,(section_id,)):
            if uid in students and date and date.replace(' ','T') >= since[:19]: activity[uid].add(date[:10])
    comparable=[]
    if time_csv:
        with open(time_csv,newline='') as f:
            for row in csv.DictReader(f):
                if not row.get('baseline_minutes') or not row.get('cerbyl_minutes'): continue
                baseline=float(row['baseline_minutes']);actual=float(row['cerbyl_minutes'])
                if baseline<=0 or actual<0: raise ValueError('Time records require positive baseline and nonnegative Cerbyl minutes')
                comparable.append((baseline,actual))
    base=sum(r[0] for r in comparable);actual=sum(r[1] for r in comparable)
    eligible=sum(r['eligible_students'] for r in rows);submitted=sum(r['submitted'] for r in rows)
    result={'generated_at':datetime.now(timezone.utc).isoformat(),'class':dict(section),'window_days':days,'active_students':len(students),'assignments':rows,
        'assignment_completion':{'submitted':submitted,'eligible':eligible,'percent':round(100*submitted/eligible,1) if eligible else None},
        'repeat_learning_activity':{'active_learners':len(activity),'learners_on_multiple_days':sum(len(d)>=2 for d in activity.values()),'percent_of_active':round(100*sum(len(d)>=2 for d in activity.values())/len(activity),1) if activity else None},
        'teacher_time':{'source':'instructor self-report; comparable tasks only','measured_tasks':len(comparable),'baseline_minutes':base if comparable else None,'cerbyl_minutes':actual if comparable else None,'minutes_saved':base-actual if comparable else None,'percent_saved':round(100*(base-actual)/base,1) if base else None},
        'limits':['Completion uses currently active enrolments and currently published, available assignments; this is not a historical roster snapshot.','Repeat activity means meaningful learning actions on two or more UTC dates within the window; it does not measure passive browsing.','Time savings require real instructor measurements and are not inferred from request latency.','Demo and QA classes are not evidence of customer adoption.']}
    db.close();return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--section-id',type=int,required=True);parser.add_argument('--database',default=str(Path(__file__).resolve().parents[1]/'brainwave_tutor.db'));parser.add_argument('--days',type=int,default=14);parser.add_argument('--teacher-time-csv');parser.add_argument('--out',type=Path,default=Path('output/pilot'));args=parser.parse_args()
    if args.days<1:parser.error('--days must be positive')
    result=report(args.database,args.section_id,args.days,args.teacher_time_csv);args.out.mkdir(parents=True,exist_ok=True)
    (args.out/'metrics.json').write_text(json.dumps(result,indent=2))
    with (args.out/'assignments.csv').open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=['assignment_id','title','eligible_students','submitted','graded','completion_percent']);writer.writeheader();writer.writerows(result['assignments'])
    print(f"Wrote {args.out/'metrics.json'} and {args.out/'assignments.csv'}")
