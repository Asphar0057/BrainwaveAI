import { useState } from 'react';
import { Link } from 'react-router-dom';
import { productRequest } from '../services/productService';
import '../pages/ProductFlows.css';

export default function AnswerFeedback({ resourceType, resourceId, sources = [] }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('incorrect_answer');
  const [detail, setDetail] = useState('');
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { setReport(await productRequest('/product/answer-reports', { method: 'POST', body: JSON.stringify({ resource_type: resourceType, resource_id: Number(resourceId), reason, detail }) })); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="learning-flow flow-feedback-tools">
    {sources.length > 0 ? <details><summary>Source references ({sources.length})</summary>{sources.map((source, i) => <p key={i}><strong>{source.book_title || source.filename || source.source_label || 'Course material'}{source.page ? ` · page ${source.page}` : ''}</strong>{source.snippet && <><br />{source.snippet}</>}</p>)}</details> : <p className="flow-muted">No source reference attached. Verify this explanation against your course material.</p>}
    {resourceId && (report ? <p role="status">{report.status === 'resolved' ? report.resolution : 'Report saved for review. Your original answer and score are preserved.'} <Link to="/answer-reports">View reports and corrections</Link></p> : <>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>This answer is wrong</button>
      {open && <form onSubmit={submit}><label>What needs review?<select value={reason} onChange={e => setReason(e.target.value)}><option value="incorrect_answer">Incorrect answer or grading</option><option value="unclear_explanation">Unclear explanation</option><option value="missing_source">Missing or incorrect source</option><option value="other">Something else</option></select></label><label>Tell the reviewer what you found (optional)<textarea maxLength={3000} value={detail} onChange={e => setDetail(e.target.value)} /></label>{error && <p role="alert" className="flow-error">{error}</p>}<button disabled={busy}>{busy ? 'Saving…' : 'Send for review'}</button></form>}
    </>)}
  </div>;
}
