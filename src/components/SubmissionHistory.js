import { useState } from 'react';
import { institution } from '../services/institutionService';
export default function SubmissionHistory({submissionId}) {
  const [rows,setRows]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  async function load(){setLoading(true);setError('');try{setRows(await institution(`/submissions/${submissionId}/history`));}catch(e){setError(e.message);}finally{setLoading(false);}}
  if(!submissionId)return null;
  return <details className="b2b-detail" onToggle={e=>{if(e.currentTarget.open&&rows===null&&!loading)load();}}><summary>Submission & feedback history</summary>{loading&&<p role="status">Loading history…</p>}{error&&<p role="alert">{error}<button type="button" className="ci-action" onClick={load}>Retry</button></p>}{rows?.length===0&&<p>History will be recorded from your next submission or grading update. Older attempts were not retained.</p>}{rows?.map(r=><article className="b2b-row" key={r.id}><strong>Attempt {r.attempt_number} · {r.event.replaceAll('_',' ')}</strong><p>{r.snapshot.content_text}</p>{r.snapshot.score!=null&&<p>Score: {r.snapshot.score}</p>}{r.snapshot.feedback&&<p>Feedback: {r.snapshot.feedback}</p>}</article>)}</details>;
}
