import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { productRequest } from '../services/productService';
import AnswerFeedback from '../components/AnswerFeedback';
import './ProductFlows.css';

export default function PracticeNext() {
  const [next, setNext] = useState(null);
  const [session, setSession] = useState(null);
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null);
  const [started, setStarted] = useState(Date.now());
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  async function load() {
    setBusy(true); setError('');
    try { setNext(await productRequest('/product/practice-next')); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);
  async function nextQuestion(id) {
    const data = await productRequest(`/weakness-practice/next-question?session_id=${id}`);
    if (data.status !== 'success') throw new Error(data.message || 'This session has ended. Return to your dashboard for another recommendation.');
    setQuestion(data); setAnswer(''); setResult(null); setStarted(Date.now());
  }
  async function start() {
    setBusy(true); setError('');
    try {
      let active = session;
      if (!active) { active = await productRequest('/weakness-practice/start-session', { method: 'POST', body: JSON.stringify({ user_id: next.user_id, topic: next.topic, question_count: 3 }) }); setSession(active); }
      await nextQuestion(active.session_id);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { setResult(await productRequest('/weakness-practice/submit-answer', { method: 'POST', body: JSON.stringify({ session_id: session.session_id, question_id: question.question.question_id, user_answer: answer, time_taken: Math.min(86400, Math.floor((Date.now() - started) / 1000)) }) })); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <main className="learning-flow flow-page"><Link to="/dashboard">← Dashboard</Link><h1>Practice next</h1>
    {error && <p role="alert" className="flow-error">{error} {!next && <button onClick={load}>Retry</button>}</p>}
    {!next && busy && <p role="status">Finding your next useful practice…</p>}
    {next && <><h2>{next.title}</h2><p className="flow-muted">{next.reason}</p>
      {!question && (next.href ? <Link className="flow-action flow-primary" to={next.href}>{next.kind === 'review' ? 'Review my cards' : 'Try the sample'}</Link> : <button className="flow-primary" disabled={busy} onClick={start}>{busy ? 'Preparing question…' : 'Start three questions'}</button>)}
      {question && <section><p>Question {question.question_number} of {question.total_questions}</p><h2>{question.question.question_text}</h2><form onSubmit={submit}>
        {question.question.options?.length ? <fieldset className="flow-options" disabled={Boolean(result) || busy}><legend>Choose an answer</legend>{question.question.options.map(option => <label key={option} className="flow-option"><input type="radio" name="practice-answer" checked={answer === option} onChange={() => setAnswer(option)} />{option}</label>)}</fieldset> : <label>Your answer<textarea disabled={Boolean(result) || busy} value={answer} onChange={e => setAnswer(e.target.value)} maxLength={10000} /></label>}
        {!result && <button className="flow-primary" disabled={busy || !answer.trim()}>{busy ? 'Checking…' : 'Check my answer'}</button>}
      </form>{result && <div className="flow-feedback"><p role="status"><strong>{result.is_correct ? 'Correct.' : 'Review this answer.'}</strong> {result.feedback}</p><AnswerFeedback resourceType="practice_answer" resourceId={result.answer_id} />{result.session_complete ? <><h2>Practice complete</h2><p>{result.correct_answers} of {result.questions_answered} correct. Your next recommendation uses your recorded progress.</p><Link className="flow-action flow-primary" to="/dashboard">Back to my dashboard</Link></> : <button disabled={busy} onClick={start}>{busy ? 'Preparing…' : 'Practice next question →'}</button>}</div>}</section>}
    </>}
  </main>;
}
