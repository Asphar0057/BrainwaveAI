import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Clock, FileQuestion, Play, Target, Trophy, XCircle } from 'lucide-react';
import SocialHubChrome from '../components/SocialHubChrome';
import MathRenderer from '../components/MathRenderer';
import { extractQuestionText } from '../utils/quizQuestionUtils';
import './SoloQuizFlow.css';

const readStoredResults = () => {
  try {
    const value = sessionStorage.getItem('lastQuizResults');
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

const readableAnswer = (answer, question) => {
  if (answer === null || answer === undefined || answer === '') return 'No answer';
  let options = question?.options || [];
  if (typeof options === 'string') {
    try { options = JSON.parse(options); } catch { options = []; }
  }
  const normalized = String(answer).trim();
  let index = -1;
  if (/^[A-Z]$/i.test(normalized)) {
    index = normalized.toUpperCase().charCodeAt(0) - 65;
  } else if (/^\d+$/.test(normalized)) {
    index = parseInt(normalized, 10);
  }
  const option = index >= 0 ? options[index] : null;
  const letter = index >= 0 ? String.fromCharCode(65 + index) : normalized.toUpperCase();
  return option ? `${letter} · ${String(option).replace(/^[A-D][).]\s*/, '')}` : normalized;
};

const SoloQuizReview = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const quizResults = useMemo(() => location.state?.quizResults || readStoredResults(), [location.state]);
  const questions = quizResults?.questions || [];
  const results = quizResults?.results || [];
  const total = quizResults?.total_questions || questions.length || results.length;
  const correct = quizResults?.correct_answers ?? quizResults?.score ?? results.filter((item) => item.is_correct).length;
  const percentage = quizResults?.percentage ?? (total ? Math.round((correct / total) * 100) : 0);
  const elapsed = quizResults?.time_taken || 0;

  const sidebar = {
    sidebarLead: (
      <button className="solo-flow-primary" type="button" onClick={() => navigate('/solo-quiz')}>
        <ArrowLeft size={15} />
        <span>Back to quizzes</span>
      </button>
    ),
    collapsedLeadItems: [{ icon: ArrowLeft, label: 'Back to quizzes', onClick: () => navigate('/solo-quiz') }],
    sideSections: [{
      label: 'Quiz review',
      items: [
        { icon: FileQuestion, label: 'Answer review', active: true, onClick: () => {} },
        { icon: Play, label: 'New quiz', onClick: () => navigate('/solo-quiz') },
      ],
    }],
    sidebarTail: quizResults ? (
      <div className="solo-flow-summary">
        <span>Last attempt</span>
        <strong>{quizResults.topic || 'Solo quiz'}</strong>
        <small>{percentage}% accuracy</small>
      </div>
    ) : null,
  };

  return (
    <div className="solo-quiz-flow solo-review-flow with-social-chrome">
      <SocialHubChrome brandKicker="Quiz Review" {...sidebar}>
        <main className="solo-review-main">
          {!quizResults ? (
            <section className="solo-review-empty">
              <FileQuestion size={38} aria-hidden="true" />
              <h1>No quiz to review</h1>
              <p>Complete a solo quiz and your answer breakdown will appear here.</p>
              <button className="solo-review-action" type="button" onClick={() => navigate('/solo-quiz')}>Build a quiz</button>
            </section>
          ) : (
            <>
              <header className="solo-review-hero">
                <span className="solo-review-kicker">Answer review</span>
                <h1>{quizResults.topic || 'Your quiz performance'}</h1>
                <p>Review each decision, compare it with the correct response, and carry the strongest insight into your next attempt.</p>
              </header>

              <div className="solo-review-toolbar">
                <div className="solo-review-stats" aria-label="Quiz summary">
                  <div className="solo-review-stat"><Target size={16} /><span>Accuracy</span><strong>{percentage}%</strong></div>
                  <div className="solo-review-stat"><Trophy size={16} /><span>Correct</span><strong>{correct}/{total}</strong></div>
                  <div className="solo-review-stat"><Clock size={16} /><span>Time</span><strong>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</strong></div>
                </div>
                <button className="solo-review-action" type="button" onClick={() => navigate('/solo-quiz')}>Try another quiz</button>
              </div>

              <section className="solo-review-list" aria-label="Question review">
                {results.map((result, index) => {
                  const question = questions[index];
                  return (
                    <article className="solo-review-question" key={question?.id || index}>
                      <div className="solo-review-question-head">
                        <span className="solo-review-index">{String(index + 1).padStart(2, '0')}</span>
                        <MathRenderer
                          content={result.question_text || extractQuestionText(question)}
                          className="solo-review-question-title"
                        />
                        <span className={`solo-review-status ${result.is_correct ? 'correct' : 'incorrect'}`}>
                          {result.is_correct ? <CheckCircle size={14} /> : <XCircle size={14} />}
                          {result.is_correct ? 'Correct' : 'Review'}
                        </span>
                      </div>
                      <div className="solo-review-answers">
                        <div className="solo-review-answer">
                          <span>Your answer</span>
                          <strong>{readableAnswer(result.user_answer, question)}</strong>
                        </div>
                        <div className="solo-review-answer">
                          <span>Correct answer</span>
                          <strong>{readableAnswer(result.correct_answer, question)}</strong>
                        </div>
                      </div>
                      {(result.explanation || question?.explanation) && (
                        <p className="solo-review-explanation">{result.explanation || question.explanation}</p>
                      )}
                    </article>
                  );
                })}
              </section>
            </>
          )}
        </main>
      </SocialHubChrome>
    </div>
  );
};

export default SoloQuizReview;
