import { useEffect, useRef, useState } from 'react';
import MathRenderer from './MathRenderer';

// Activities stay attached to the node; opening one never counts as completion.
export default function LearningPathActivity({ activity, node, onComplete, onClose }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState({});
  const [answers, setAnswers] = useState({});
  const [reflection, setReflection] = useState(node.progress?.evidence?.chat?.metadata?.reflection || '');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: 'start' }); }, []);
  const cards = activity.data.flashcards || [];
  const questions = activity.data.questions || [];
  const correct = (q, answer) => typeof q.correct_answer === 'number'
    ? answer === q.correct_answer : q.options?.[answer] === q.correct_answer;
  const score = questions.filter((q, i) => correct(q, answers[i])).length;
  const finish = async metadata => {
    setSaving(true);
    setError('');
    try { await onComplete(metadata); setSaved(true); }
    catch (e) { setError(e.message || 'Progress could not be saved. Try again.'); }
    finally { setSaving(false); }
  };
  return <section className="lpd-activity-workspace" aria-labelledby="lpd-active-title">
    <header>
      <div><span>{node.title}</span><h2 id="lpd-active-title" ref={heading} tabIndex={-1}>
        {activity.type === 'chat' ? 'Lesson reflection' : activity.type === 'quiz' ? 'Practice quiz' : 'Flashcard practice'}
      </h2></div>
      <button type="button" onClick={onClose} disabled={saving}>Close activity</button>
    </header>
    <p>{activity.description}</p>
    {activity.type === 'flashcards' && (cards.length ? <>
      <p>Card {index + 1} of {cards.length}</p>
      <h3>{cards[index].question || cards[index].front}</h3>
      {revealed[index] ? <MathRenderer content={cards[index].answer || cards[index].back} />
        : <button type="button" onClick={() => setRevealed({ ...revealed, [index]: true })}>Reveal answer</button>}
      <div className="lpd-practice-actions">
        <button disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous card</button>
        <button disabled={index === cards.length - 1} onClick={() => setIndex(index + 1)}>Next card</button>
        <button disabled={Object.keys(revealed).length < cards.length || saving || saved}
          onClick={() => finish({ cards_reviewed: cards.length })}>{saved ? 'Practice saved' : 'Finish flashcards'}</button>
      </div>
    </> : <p>No flashcards are available for this lesson yet.</p>)}
    {activity.type === 'quiz' && (questions.length ? <>
      {questions.map((q, i) => <fieldset key={q.id || i} disabled={submitted}>
        <legend>{i + 1}. {q.question_text || q.question}</legend>
        {(q.options || []).map((option, j) => <label key={j}>
          <input type="radio" name={`practice-${i}`} checked={answers[i] === j}
            onChange={() => setAnswers({ ...answers, [i]: j })} />
          {String(option).replace(/^\s*(?:correct|incorrect)\s*:\s*/i, '')}
        </label>)}
        {submitted && <p>{correct(q, answers[i]) ? 'Correct.' : 'Review this answer.'} {q.explanation}</p>}
      </fieldset>)}
      {submitted && <p role="status">{score} of {questions.length} correct.{saved ? ' Progress saved.' : ''}</p>}
      <div className="lpd-practice-actions">
        <button disabled={Object.keys(answers).length < questions.length || saving || saved}
          onClick={() => { setSubmitted(true); finish({ score: Math.round(score / questions.length * 100), answers }); }}>
          {saving ? 'Saving…' : submitted ? 'Save result' : 'Check answers'}
        </button>
        {submitted && <button onClick={() => { setSubmitted(false); setSaved(false); setAnswers({}); }}>Try again</button>}
      </div>
    </> : <p>No questions are available for this lesson yet.</p>)}
    {activity.type === 'chat' && <>
      <MathRenderer content={activity.data.prompt} />
      <label htmlFor="lpd-reflection">Explain your reasoning using this lesson</label>
      <textarea id="lpd-reflection" rows={7} value={reflection} onChange={e => { setReflection(e.target.value); setSaved(false); }} />
      <button disabled={!reflection.trim() || saving || saved} onClick={() => finish({ reflection })}>
        {saved ? 'Reflection saved' : saving ? 'Saving…' : 'Save reflection'}
      </button>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
