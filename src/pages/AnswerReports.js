import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { productRequest } from '../services/productService';
import './ProductFlows.css';
export default function AnswerReports() {
  const [rows, setRows] = useState(null); const [error, setError] = useState('');
  async function load() { setError(''); try { setRows(await productRequest('/product/answer-reports')); } catch (err) { setError(err.message); } }
  useEffect(() => { load(); }, []);
  return <main className="learning-flow flow-page"><Link to="/dashboard">← Dashboard</Link><h1>Your answer reports</h1><p>Reviewer corrections appear here. Reporting an answer does not automatically change your score.</p>{error && <p role="alert" className="flow-error">{error} <button onClick={load}>Retry</button></p>}{!rows && !error && <p role="status">Loading reports…</p>}{rows?.length === 0 && <p>You haven’t reported any answers yet. Use “This answer is wrong” beneath a tutor or practice answer.</p>}{rows?.map(row => <article className="flow-panel" key={row.id}><h2>Report #{row.id} · {row.status === 'open' ? 'Awaiting review' : 'Reviewed'}</h2><p>{row.snapshot.question}</p><details><summary>Original answer</summary><p>{row.snapshot.answer}</p>{row.snapshot.student_answer && <p>Your answer: {row.snapshot.student_answer}</p>}</details><p>{row.detail}</p>{row.resolution && <div className="flow-feedback"><strong>Reviewer correction / explanation</strong><p>{row.resolution}</p></div>}</article>)}</main>;
}
