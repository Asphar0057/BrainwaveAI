import { ArrowRight, Check, Clock3 } from 'lucide-react';
import { Link } from 'react-router-dom';

const taskLabels = {
  assignment: { type: 'Assignment', action: 'Open assignment' },
  lesson: { type: 'Lesson', action: 'Read lesson' },
  checkpoint: { type: 'Practice', action: 'Start practice' },
  followup: { type: 'Teacher request', action: 'View teacher request' },
};

function TaskContext({ task, sections }) {
  const section = sections.find(s => String(s.id) === String(task.section_id));
  const due = task.due_at && new Date(/Z$|[+-]\d\d:\d\d$/.test(task.due_at) ? task.due_at : `${task.due_at}Z`);
  return <div className="b2b-task-context">
    <span>{section ? `${section.title} · ${section.name} · ${section.company}` : 'Your class'}</span>
    {due && <span className={due < new Date() ? 'b2b-task-overdue' : ''}>
      {due < new Date() ? 'Overdue · ' : 'Due '}
      <time dateTime={task.due_at}>{due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>
    </span>}
  </div>;
}

export default function StudentLearningPlan({ plan, sections, openTask }) {
  const [next, ...remaining] = plan.tasks;
  if (!next) return <section className="b2b-panel b2b-today-empty">
    <div className="ci-tile-texture" aria-hidden="true" />
    <Check size={24} aria-hidden="true" />
    <h2>You’re all caught up</h2>
    <p>No unfinished lessons, practice, assignments, or teacher requests. You can revisit your classwork or check your feedback in Progress.</p>
    <Link className="b2b-link" to="?view=Progress">View progress <ArrowRight size={14} aria-hidden="true" /></Link>
  </section>;

  return <div className="b2b-today">
    <div className="b2b-today-summary"><h2>Today</h2><p>{plan.total_tasks} {plan.total_tasks === 1 ? 'task' : 'tasks'} to do · Across your classes</p></div>
    <section className="b2b-panel b2b-priority-task" aria-labelledby="next-task-title">
      <div className="ci-tile-texture" aria-hidden="true" />
      <div className="b2b-task-kind"><span>Up next · {taskLabels[next.type].type}</span><span><Clock3 size={14} aria-hidden="true" /> About {next.minutes} min</span></div>
      <h2 id="next-task-title">{next.title}</h2>
      <TaskContext task={next} sections={sections} />
      <p>{next.reason}</p>
      <button className="ci-action ci-action--primary" onClick={() => openTask(next)}>{taskLabels[next.type].action}<ArrowRight size={15} aria-hidden="true" /></button>
    </section>
    {!!remaining.length && <section className="b2b-upcoming" aria-labelledby="remaining-tasks-title">
      <h2 id="remaining-tasks-title">Also to do</h2>
      {remaining.map(task => <article className="b2b-row b2b-next" key={`${task.type}-${task.id}`}>
        <div><span className="b2b-task-kind">{taskLabels[task.type].type} · About {task.minutes} min</span><h3>{task.title}</h3><TaskContext task={task} sections={sections} /></div>
        <button className="b2b-task-link" onClick={() => openTask(task)} aria-label={`${taskLabels[task.type].action}: ${task.title}`}>{taskLabels[task.type].action}<ArrowRight size={14} aria-hidden="true" /></button>
      </article>)}
      {plan.total_tasks > plan.tasks.length && <p>Showing your first {plan.tasks.length} tasks. More will appear as you complete them.</p>}
    </section>}
    <p className="b2b-plan-help">Stuck on something? <Link to="/student/messages">Ask your teacher</Link></p>
  </div>;
}
