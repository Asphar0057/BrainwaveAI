import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { productRequest } from '../services/productService';
import '../pages/ProductFlows.css';
export default function LearningEvidence({ sections }) {
  const [sectionId, setSectionId] = useState(''); const [data, setData] = useState(null); const [error, setError] = useState(''); const [reload, setReload] = useState(0);
  const selected = sectionId || String(sections[0]?.section_id || '');
  useEffect(() => {
    let active = true; setData(null); setError('');
    if (selected) productRequest(`/product/sections/${selected}/learning-evidence`).then(value => { if (active) setData(value); }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [selected, reload]);
  return <section className="learning-flow flow-panel" aria-labelledby="learning-evidence-title"><h2 id="learning-evidence-title">Learning gaps to investigate</h2><p>Open the underlying work before deciding what to reteach.</p>{!sections.length ? <p>Add a class and grade submissions to see evidence here.</p> : <><label>Class section<select value={selected} onChange={e => setSectionId(e.target.value)}>{sections.map(s => <option key={s.section_id} value={s.section_id}>{s.course_code} · {s.course_title}</option>)}</select></label>{error && <p className="flow-error" role="alert">{error} <button onClick={() => setReload(reload + 1)}>Retry</button></p>}{!data && !error && <p role="status">Loading submitted work…</p>}{data && <><p className="flow-muted">{data.interpretation}</p>{data.groups.length === 0 && <p>No graded submissions below 70% in this section. Ungraded work is not evidence of mastery.</p>}{data.groups.map(group => <details key={group.assignment_id}><summary><strong>{group.title}</strong> · {group.attempts.length} of {group.graded_count} graded submissions below 70%</summary>{group.attempts.map(attempt => <article className="flow-attempt" key={attempt.submission_id}><strong>{attempt.student} · {attempt.score}/{attempt.points_possible} · Attempt {attempt.attempt_number}</strong><blockquote>{attempt.answer || 'No text answer. Open the assignment to inspect the attachment.'}</blockquote><p>Teacher feedback: {attempt.feedback || 'No feedback recorded yet.'}</p></article>)}<p><Link to="/educator/assignments">Open assignments to follow up →</Link></p></details>)}</>}</>}</section>;
}
