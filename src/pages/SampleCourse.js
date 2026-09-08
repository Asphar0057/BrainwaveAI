import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sampleEvent } from '../services/productService';
import './ProductFlows.css';

const questions = [
  { question: 'A bag contains 3 blue counters and 1 gold counter. What is the probability of drawing gold?', options: ['1/4', '1/3', '3/4', '1/2'], correct: '1/4', explanation: 'There is 1 gold counter among 4 counters in total. The denominator counts every possible outcome, including the gold counter.' },
  { question: 'A second bag contains 2 gold counters and 3 blue counters. What is the probability of drawing gold?', options: ['2/3', '2/5', '3/5', '1/5'], correct: '2/5', explanation: 'Count the 2 gold counters, then all 5 counters. The probability is 2/5. The blue counters alone are not the total.' },
];
export default function SampleCourse() {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState('');
  const [answers, setAnswers] = useState([]);
  useEffect(() => { sampleEvent('sample_opened'); }, []);
  const current = questions[step];
  const checked = answers.length > step;
  const complete = step === questions.length;
  function submit(event) {
    event.preventDefault();
    if (!selected || checked) return;
    setAnswers([...answers, selected]);
    sampleEvent('sample_answered');
    if (step === questions.length - 1) sampleEvent('sample_completed');
  }
  return <main className="learning-flow flow-page">
    <nav className="flow-topline" aria-label="Sample navigation"><Link to="/">← Cerbyl</Link><span className="flow-muted">Free sample · No account needed</span></nav>
    <h1>Find the gap.<br />Try again with understanding.</h1>
    <p className="flow-muted">A three-minute probability lesson. Read, practise, and use the explanation on a fresh question.</p>
    <div className="flow-columns">
      <article id="source-note" aria-labelledby="sample-lesson-title"><h2 id="sample-lesson-title">Count every possible outcome</h2>
        <p>When outcomes are equally likely, probability is the number of outcomes you want divided by the total number of possible outcomes.</p>
        <p><strong>Probability = favourable outcomes / total outcomes</strong></p>
        <p>For example, a fair six-sided die has six possible outcomes. Two are greater than four: 5 and 6. So the probability of rolling greater than four is 2/6, or 1/3.</p>
        <p className="flow-source flow-muted">Source: this prepared Cerbyl sample lesson. Assume each counter is equally likely to be drawn. The questions and explanations here are authored examples; this sample does not call the AI tutor.</p>
      </article>
      <section aria-label="Sample practice">
        {!complete ? <><h2>Practice {step + 1} of {questions.length}</h2><form onSubmit={submit}>
          <fieldset className="flow-options" disabled={checked}><legend>{current.question}</legend>{current.options.map(option => <label className="flow-option" key={option}><input type="radio" name="answer" value={option} checked={selected === option} onChange={() => setSelected(option)} />{option}</label>)}</fieldset>
          {!checked && <button className="flow-primary" disabled={!selected}>Check my answer</button>}
        </form>
        {checked && <div className="flow-feedback" role="status"><strong>{selected === current.correct ? 'Correct.' : `The answer is ${current.correct}.`}</strong><p>{current.explanation}</p><p><a href="#source-note">Check the lesson reference ↑</a></p><button className="flow-primary" onClick={() => { setStep(step + 1); setSelected(''); }}>{step === 0 ? 'Try a fresh question →' : 'See my results →'}</button></div>}</>
        : <div role="status"><h2>{answers.filter((answer, i) => answer === questions[i].correct).length} of 2 correct</h2><p>{answers[1] === questions[1].correct ? 'You applied the idea to a new example.' : 'Keep practising the denominator: count all counters, not just the blue ones.'} Two questions are a starting point, not proof of mastery.</p><p>Create your workspace to practise your own subjects and return to weak topics.</p><div className="flow-actions"><Link className="flow-action flow-primary" to="/register">Create my workspace</Link><button onClick={() => { setStep(0); setSelected(''); setAnswers([]); }}>Repeat sample</button></div></div>}
      </section>
    </div>
  </main>;
}
