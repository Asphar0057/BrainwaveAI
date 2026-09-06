import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Trophy, CheckCircle, XCircle, Loader, Lightbulb, RefreshCw, AlertCircle, ChevronLeft, ChevronRight, ArrowLeft, Play } from 'lucide-react';
import SocialHubChrome from '../components/SocialHubChrome';
import quizAgentService from '../services/quizAgentService';
import MathRenderer from '../components/MathRenderer';
import { extractQuestionText, normalizeQuestions } from '../utils/quizQuestionUtils';
import './QuizBattleSession.css';
import './SoloQuizFlow.css';

const SoloQuizSession = () => {
  const navigate = useNavigate();
  const username = localStorage.getItem('username');
  
  const [questions, setQuestions] = useState([]);
  const [quizData, setQuizData] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [userAnswers, setUserAnswersState] = useState({});
  const answersRef = useRef({});
  const submittingRef = useRef(false);
  const feedbackTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(feedbackTimerRef.current), []);
  const setUserAnswers = value => {
    const next = typeof value === 'function' ? value(answersRef.current) : value;
    answersRef.current = next;
    setUserAnswersState(next);
  };
  const attemptKey = `cerbyl.quizAttempt:${username}`;
  const [score, setScore] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [results, setResults] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [quizMode, setQuizMode] = useState('standard');
  const [timingMode, setTimingMode] = useState('timed');
  const [showInstantFeedback, setShowInstantFeedback] = useState(false);
  const [instantFeedbackCorrect, setInstantFeedbackCorrect] = useState(false);
  const [completionWarning, setCompletionWarning] = useState(false);

  
  useEffect(() => {
    const storedData = sessionStorage.getItem('quizData');
    if (storedData) {
      let data;
      try { data = JSON.parse(storedData); } catch { navigate('/solo-quiz'); return; }
      let saved;
      try { saved = JSON.parse(sessionStorage.getItem(attemptKey) || 'null'); } catch {}
      if (saved?.signature !== storedData) saved = null;
      const beganAt = saved?.startTime || Date.now();
      const normalizedQuestions = normalizeQuestions(data.questions || []);
      setQuizData(data);
      setQuestions(normalizedQuestions);
      setQuizMode(data.quizMode || 'standard');
      setTimingMode(data.timingMode || 'timed');
      
      
      if ((data.timingMode || 'timed') === 'timed') {
        setTimeRemaining(Math.max(0, (data.questions?.length || 10) * 60 - Math.floor((Date.now() - beganAt) / 1000)));
      } else if (data.timingMode === 'stopwatch') {
        setTimeElapsed(0);
      }
      
      setStartTime(beganAt);
      if (saved) { setUserAnswers(saved.answers || {}); setCurrentQuestionIndex(saved.index || 0); setSelectedAnswer(saved.selected ?? null); setScore(saved.score || 0); setTimeElapsed(Math.floor((Date.now() - beganAt) / 1000)); }
      setLoading(false);
    } else {
      navigate('/solo-quiz');
    }
  }, [navigate]);

  
  useEffect(() => {
    if (showResult || loading || grading) return;

    if (timingMode === 'timed' && timeRemaining > 0) {
      const timer = setTimeout(() => {
        setTimeRemaining(Math.max(0, questions.length * 60 - Math.floor((Date.now() - startTime) / 1000)));
      }, 1000);
      return () => clearTimeout(timer);
    } else if (timingMode === 'timed' && timeRemaining === 0 && questions.length > 0) {
      handleSubmitQuiz();
    } else if (timingMode === 'stopwatch') {
      const timer = setTimeout(() => {
        setTimeElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [timeRemaining, timeElapsed, showResult, loading, grading, questions.length, timingMode]);

  useEffect(() => {
    if (loading || !quizData || (showResult && !completionWarning)) return;
    sessionStorage.setItem(attemptKey, JSON.stringify({ signature: JSON.stringify(quizData), answers: userAnswers, index: currentQuestionIndex, selected: selectedAnswer, startTime, score }));
  }, [loading, quizData, userAnswers, currentQuestionIndex, selectedAnswer, startTime, score, showResult, completionWarning, attemptKey]);

  const handleAnswerSelect = (answerIndex) => {
    if (showInstantFeedback || submittingRef.current) return;
    const question = questions[currentQuestionIndex];
    const value = question.question_type === 'multiple_choice' ? String.fromCharCode(65 + answerIndex) : question.question_type === 'true_false' ? (answerIndex === 0 ? 'true' : 'false') : String(answerIndex);
    setUserAnswers(previous => ({ ...previous, [String(question.id ?? currentQuestionIndex)]: value }));
    
    if (quizMode === 'sequential-instant') {
      const currentQuestion = questions[currentQuestionIndex];
      const questionId = String(currentQuestion.id ?? currentQuestionIndex);
      
      
      let answerValue;
      if (currentQuestion.question_type === 'multiple_choice') {
        answerValue = String.fromCharCode(65 + answerIndex);
      } else if (currentQuestion.question_type === 'true_false') {
        answerValue = answerIndex === 0 ? 'true' : 'false';
      } else {
        answerValue = String(answerIndex);
      }
      
      
      const correctAnswer = String(currentQuestion.correct_answer || '').toLowerCase();
      const isCorrect = answerValue.toLowerCase() === correctAnswer || 
                        answerValue.toLowerCase() === correctAnswer.charAt(0);
      
      setSelectedAnswer(answerIndex);
      setShowInstantFeedback(true);
      setInstantFeedbackCorrect(isCorrect);
      
      
      setUserAnswers(prev => ({
        ...prev,
        [questionId]: answerValue
      }));
      
      if (isCorrect) {
        setScore(prev => prev + 1);
      }
      
      
      feedbackTimerRef.current = setTimeout(() => {
        setShowInstantFeedback(false);
        if (currentQuestionIndex < questions.length - 1) {
          setCurrentQuestionIndex(prev => prev + 1);
          setSelectedAnswer(null);
        } else {
          handleSubmitQuiz();
        }
      }, 1500);
    } else {
      
      setSelectedAnswer(answerIndex);
    }
  };

  const handleNext = () => {
    
    if (quizMode === 'standard') {
      
      if (selectedAnswer !== null) {
        const currentQuestion = questions[currentQuestionIndex];
        const questionId = String(currentQuestion.id ?? currentQuestionIndex);
        
        let answerValue;
        if (currentQuestion.question_type === 'multiple_choice') {
          answerValue = String.fromCharCode(65 + selectedAnswer);
        } else if (currentQuestion.question_type === 'true_false') {
          answerValue = selectedAnswer === 0 ? 'true' : 'false';
        } else {
          answerValue = String(selectedAnswer);
        }
        
        setUserAnswers(prev => ({
          ...prev,
          [questionId]: answerValue
        }));
        
        
      }
      
      
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        setSelectedAnswer(null);
      }
      return;
    }
    
    
    if (selectedAnswer === null) return;
    
    const currentQuestion = questions[currentQuestionIndex];
    const questionId = String(currentQuestion.id ?? currentQuestionIndex);
    
    
    if (quizMode !== 'sequential-instant') {
      
      let answerValue;
      if (currentQuestion.question_type === 'multiple_choice') {
        answerValue = String.fromCharCode(65 + selectedAnswer);
      } else if (currentQuestion.question_type === 'true_false') {
        answerValue = selectedAnswer === 0 ? 'true' : 'false';
      } else {
        answerValue = String(selectedAnswer);
      }
      
      setUserAnswers(prev => ({
        ...prev,
        [questionId]: answerValue
      }));

      
      const correctAnswer = String(currentQuestion.correct_answer || '').toLowerCase();
      const isCorrect = answerValue.toLowerCase() === correctAnswer || 
                        answerValue.toLowerCase() === correctAnswer.charAt(0);
      
      if (isCorrect) {
        setScore(prev => prev + 1);
      }
    }

    
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedAnswer(null);
    } else {
      handleSubmitQuiz();
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
      
      if (quizMode === 'standard') {
        const prevQuestion = questions[currentQuestionIndex - 1];
        const prevQuestionId = String(prevQuestion?.id ?? (currentQuestionIndex - 1));
        if (userAnswers[prevQuestionId]) {
          const prevAnswer = userAnswers[prevQuestionId];

          if (prevQuestion.question_type === 'multiple_choice') {
            setSelectedAnswer(prevAnswer.charCodeAt(0) - 65);
          } else if (prevQuestion.question_type === 'true_false') {
            setSelectedAnswer(prevAnswer === 'true' ? 0 : 1);
          } else {
            setSelectedAnswer(parseInt(prevAnswer, 10));
          }
        } else {
          setSelectedAnswer(null);
        }
      } else {
        setSelectedAnswer(null);
      }
    }
  };

  const handleQuestionJump = (index) => {
    if (quizMode === 'standard') {
      setCurrentQuestionIndex(index);
      
      const question = questions[index];
      const questionId = String(question?.id ?? index);
      if (userAnswers[questionId]) {
        const answer = userAnswers[questionId];
        if (question.question_type === 'multiple_choice') {
          setSelectedAnswer(answer.charCodeAt(0) - 65);
        } else if (question.question_type === 'true_false') {
          setSelectedAnswer(answer === 'true' ? 0 : 1);
        } else {
          setSelectedAnswer(parseInt(answer, 10));
        }
      } else {
        setSelectedAnswer(null);
      }
    }
  };

  const handleSubmitFromStandard = () => {
    
    if (quizMode === 'standard') {
      handleSubmitQuiz();
    }
  };

  const handleSubmitQuiz = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    const submittedAnswers = { ...answersRef.current };
    setGrading(true);
    const timeTaken = Math.round((Date.now() - startTime) / 1000);

    try {
      
      const gradeResponse = await quizAgentService.gradeQuiz({
        userId: username,
        questions,
        answers: submittedAnswers,
        timeTakenSeconds: timeTaken
      });

      setResults(gradeResponse);
      setCompletionWarning(gradeResponse.completion_saved === false);
      if (gradeResponse.completion_saved !== false) { sessionStorage.removeItem(attemptKey); sessionStorage.removeItem('quizData'); }


      let performanceAnalysis = null;
      if (gradeResponse.results) {
        try {
          const analyzeResponse = await quizAgentService.analyzePerformance({
            userId: username,
            results: gradeResponse.results,
            timeTakenSeconds: timeTaken
          });
          performanceAnalysis = analyzeResponse?.analysis || null;
          setAnalysis(performanceAnalysis);
        } catch (analyzeError) {
          console.error('Performance analysis failed:', analyzeError);
        }
      }

      
      const reviewData = {
        questions,
        results: gradeResponse.results || [],
        score: gradeResponse.correct_answers ?? score,
        total_questions: gradeResponse.total_questions || questions.length,
        correct_answers: gradeResponse.correct_answers ?? score,
        percentage: gradeResponse.percentage ?? Math.round((score / questions.length) * 100),
        time_taken: timeTaken,
        topic: quizData?.topic || 'Quiz',
        difficulty: quizData?.difficulty || 'medium',
        analysis: performanceAnalysis
      };
      sessionStorage.setItem('lastQuizResults', JSON.stringify(reviewData));

      setShowResult(true);
    } catch (error) {
      console.error('Quiz grading error:', error);
      setCompletionWarning(true);
      
      const localResults = questions.map((q, idx) => {
        const questionId = String(q.id ?? idx);
        const userAnswer = submittedAnswers[questionId] || '';
        const correctAnswer = String(q.correct_answer || '');
        const isCorrect = userAnswer.toLowerCase() === correctAnswer.toLowerCase() || 
                         userAnswer.toLowerCase() === correctAnswer.toLowerCase().charAt(0);
        return {
          question_text: extractQuestionText(q),
          user_answer: userAnswer,
          correct_answer: correctAnswer,
          is_correct: isCorrect,
          explanation: q.explanation
        };
      });

      const localScore = localResults.filter(r => r.is_correct).length;
      const reviewData = {
        questions,
        results: localResults,
        score: localScore,
        total_questions: questions.length,
        correct_answers: localScore,
        percentage: Math.round((localScore / questions.length) * 100),
        time_taken: timeTaken,
        topic: quizData?.topic || 'Quiz',
        difficulty: quizData?.difficulty || 'medium',
        analysis: null
      };

      setResults({
        total_questions: questions.length,
        correct_answers: localScore,
        percentage: reviewData.percentage,
        results: localResults
      });
      
      sessionStorage.setItem('lastQuizResults', JSON.stringify(reviewData));
      setShowResult(true);
    } finally {
      setGrading(false);
      submittingRef.current = false;
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRetry = () => {
    navigate('/solo-quiz');
  };

  const renderSoloChrome = (content, activeSection = 'session') => (
    <div className="solo-quiz-flow with-social-chrome">
      <SocialHubChrome
        brandKicker="Solo Quiz"
        sidebarLead={(
          <button className="solo-flow-primary" type="button" onClick={() => navigate('/solo-quiz')}>
            <ArrowLeft size={15} />
            <span>New quiz</span>
          </button>
        )}
        collapsedLeadItems={[{ icon: ArrowLeft, label: 'New quiz', onClick: () => navigate('/solo-quiz') }]}
        sideSections={[
          {
            label: 'Quiz session',
            items: [
              { icon: Play, label: 'Questions', active: activeSection === 'session', onClick: () => {} },
              { icon: Trophy, label: 'Results', active: activeSection === 'results', disabled: activeSection !== 'results', onClick: () => {} },
              { icon: ArrowLeft, label: 'Quiz setup', onClick: () => navigate('/solo-quiz') },
            ],
          },
        ]}
        sidebarTail={(
          <div className="solo-flow-summary" aria-live="polite">
            <span>{activeSection === 'results' ? 'Completed' : 'Current session'}</span>
            <strong>{quizData?.topic || 'Preparing quiz'}</strong>
            <small>{questions.length ? `${questions.length} questions` : 'Loading questions'}</small>
          </div>
        )}
      >
        {content}
      </SocialHubChrome>
    </div>
  );

  if (loading) {
    return renderSoloChrome(
      <main className="solo-flow-state battle-session-loading">
        <Loader size={48} className="spinner" />
        <h2>Loading quiz…</h2>
      </main>
    );
  }

  if (grading) {
    return renderSoloChrome(
      <main className="solo-flow-state battle-session-loading">
        <Loader size={48} className="spinner" />
        <h2>Grading your answers…</h2>
        <p>AI is analyzing your performance</p>
      </main>
    );
  }

  if (showResult) {
    const percentage = results?.percentage ?? Math.round((score / questions.length) * 100);
    const correctCount = results?.correct_answers ?? score;

    return renderSoloChrome(
      <main className="solo-result-main battle-result-page detailed">
        <div className="result-container detailed">
          <div className="result-header">
            <Trophy size={64} className="result-icon winner" />
            <h1>Quiz Complete!</h1>
          </div>

          {completionWarning && (
            <div className="battle-submit-error" role="alert">
              <span>Your score was calculated but couldn't be saved to your account (connection issue). Points and progress from this quiz were not recorded. Your answers are retained.</span><button type="button" onClick={handleSubmitQuiz}>Retry saving result</button>
            </div>
          )}

          <div className="result-stats">
            <div className="result-stat">
              <span className="stat-label">Your Score</span>
              <span className="stat-value">{correctCount}/{questions.length}</span>
            </div>
            <div className="result-stat">
              <span className="stat-label">Accuracy</span>
              <span className="stat-value">{percentage}%</span>
            </div>
            {analysis?.avg_time_per_question && (
              <div className="result-stat">
                <span className="stat-label">Avg Time/Question</span>
                <span className="stat-value">{Math.round(analysis.avg_time_per_question)}s</span>
              </div>
            )}
          </div>

          {analysis && (
            <div className="performance-insights">
              {analysis.weak_topics?.length > 0 && (
                <div className="insight-section weak">
                  <h3><AlertCircle size={18} /> Areas to Improve</h3>
                  <div className="topic-tags">
                    {analysis.weak_topics.map((topic, idx) => (
                      <span key={idx} className="topic-tag weak">{topic}</span>
                    ))}
                  </div>
                </div>
              )}
              {analysis.strong_topics?.length > 0 && (
                <div className="insight-section strong">
                  <h3><CheckCircle size={18} /> Strong Areas</h3>
                  <div className="topic-tags">
                    {analysis.strong_topics.map((topic, idx) => (
                      <span key={idx} className="topic-tag strong">{topic}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="question-by-question">
            <h3>Review Your Answers</h3>
            <div className="questions-comparison-list">
              {(results?.results || []).map((result, index) => {
                const question = questions[index];
                const isCorrect = result.is_correct;
                let options = question?.options || [];
                if (typeof options === 'string') {
                  try { options = JSON.parse(options); } catch { options = []; }
                }

                return (
                  <div key={index} className={`question-comparison-item expanded ${isCorrect ? 'correct' : 'incorrect'}`}>
                    <div className="question-comparison-header">
                      <div className="question-number">Q{index + 1}</div>
                      <MathRenderer content={result.question_text || extractQuestionText(question)} className="question-text-full" />
                      <span className={`status-badge ${isCorrect ? 'correct' : 'incorrect'}`}>
                        {isCorrect ? '✓ Correct' : '✗ Incorrect'}
                      </span>
                    </div>
                    
                    {options.length > 0 && (
                      <div className="answer-options-review">
                        {options.map((option, optIndex) => {
                          const optionLetter = String.fromCharCode(65 + optIndex);
                          const correctAnswerNum = Number(result.correct_answer);
                          const userAnswerNum = Number(result.user_answer);
                          const isCorrectOption = Number.isFinite(correctAnswerNum) && optIndex === correctAnswerNum;
                          const isUserSelected = Number.isFinite(userAnswerNum) && optIndex === userAnswerNum;
                          const optionText = typeof option === 'string' ? option.replace(/^[A-D]\)\s*/, '') : option;
                          
                          return (
                            <div 
                              key={optIndex} 
                              className={`answer-option-review ${isCorrectOption ? 'correct-answer' : ''} ${isUserSelected ? 'selected' : ''}`}
                            >
                              <div className="option-content">
                                <span className="option-letter">{optionLetter}</span>
                                <MathRenderer content={optionText || ''} className="option-text" />
                                {isCorrectOption && <CheckCircle size={16} className="correct-icon" />}
                              </div>
                              {isUserSelected && (
                                <span className={`user-badge ${isCorrect ? 'correct' : 'incorrect'}`}>
                                  Your Answer {isCorrect ? '✓' : '✗'}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!isCorrect && (result.explanation || question?.explanation) && (
                      <div className="question-explanation">
                        <Lightbulb size={16} />
                        <span>{result.explanation || question?.explanation}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="result-actions">
            <button className="result-button primary" onClick={() => {
              const reviewData = {
                questions,
                results: results?.results || [],
                score: results?.correct_answers ?? score,
                total_questions: results?.total_questions || questions.length,
                correct_answers: results?.correct_answers ?? score,
                percentage: results?.percentage ?? percentage,
                time_taken: Math.round((Date.now() - startTime) / 1000),
                topic: quizData?.topic || 'Quiz',
                difficulty: quizData?.difficulty || 'medium',
                analysis: analysis
              };
              navigate('/solo-quiz/review', { state: { quizResults: reviewData } });
            }}>
              <Lightbulb size={18} />
              Review Answers
            </button>
            <button className="result-button secondary" onClick={handleRetry}>
              <RefreshCw size={18} />
              Try Another Quiz
            </button>
            <button className="result-button secondary" onClick={() => navigate('/dashboard-cerbyl')}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </main>,
      'results'
    );
  }

  
  const currentQuestion = questions[currentQuestionIndex];
  const currentQuestionText = extractQuestionText(currentQuestion);
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  
  let options = currentQuestion?.options || [];
  if (typeof options === 'string') {
    try { options = JSON.parse(options); } catch { options = []; }
  }
  if (currentQuestion?.question_type === 'true_false' && options.length === 0) {
    options = ['True', 'False'];
  }

  
  const currentQuestionId = String(currentQuestion?.id ?? currentQuestionIndex);
  const hasAnswered = userAnswers.hasOwnProperty(currentQuestionId);

  return renderSoloChrome(
    <main className="solo-session-main battle-session-page solo-session-page">
      <div className="session-header">
        <span className="view-kicker">Solo Quiz</span>
        <h1 className="session-title">{quizData?.topic || 'QUIZ'}</h1>
      </div>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="battle-session-container">
        <div className="question-card">
          <div className="question-header">
            <MathRenderer content={currentQuestionText} className="question-text" />
          </div>

          <div className="answers-grid">
            {options.map((option, index) => {
              const isSelected = selectedAnswer === index;
              const optionText = typeof option === 'string' ? option.replace(/^[A-D]\)\s*/, '') : option;
              
              
              let feedbackClass = '';
              if (quizMode === 'sequential-instant' && showInstantFeedback && isSelected) {
                feedbackClass = instantFeedbackCorrect ? 'correct' : 'incorrect';
              }

              return (
                <button
                  key={index}
                  className={`answer-option ${isSelected ? 'selected' : ''} ${feedbackClass}`}
                  onClick={() => handleAnswerSelect(index)}
                  disabled={quizMode === 'sequential-instant' && showInstantFeedback}
                >
                  <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                  <MathRenderer content={optionText || ''} className="option-text" />
                  {quizMode === 'sequential-instant' && showInstantFeedback && isSelected && (
                    instantFeedbackCorrect ? 
                      <CheckCircle size={20} className="option-icon" /> : 
                      <XCircle size={20} className="option-icon" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="question-navigation">
            {quizMode === 'standard' ? (
              <>
                <button 
                  className="nav-btn prev-btn" 
                  onClick={handlePrevious}
                  disabled={currentQuestionIndex === 0}
                >
                  <ChevronLeft size={20} />
                  <span>PREVIOUS</span>
                </button>
                <button 
                  className="nav-btn next-btn" 
                  onClick={handleNext}
                  disabled={currentQuestionIndex === questions.length - 1}
                >
                  <span>NEXT</span>
                  <ChevronRight size={20} />
                </button>
              </>
            ) : quizMode === 'sequential-instant' ? (
              <div className="instant-feedback-info">
                {showInstantFeedback ? (
                  <span className={instantFeedbackCorrect ? 'feedback-correct' : 'feedback-incorrect'}>
                    {instantFeedbackCorrect ? '✓ Correct! Moving to next...' : '✗ Incorrect. Moving to next...'}
                  </span>
                ) : (
                  <span className="feedback-hint">Select an answer to see instant feedback</span>
                )}
              </div>
            ) : (
              <>
                <button 
                  className="nav-btn prev-btn" 
                  onClick={handlePrevious}
                  disabled={currentQuestionIndex === 0}
                >
                  <ChevronLeft size={20} />
                  <span>PREVIOUS</span>
                </button>
                <button 
                  className="nav-btn next-btn" 
                  onClick={handleNext}
                  disabled={selectedAnswer === null}
                >
                  <span>{currentQuestionIndex === questions.length - 1 ? 'SUBMIT' : 'NEXT'}</span>
                  <ChevronRight size={20} />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="battle-sidebar solo-session-sidebar">
          <div className="sidebar-meta">
            {timingMode === 'timed' && (
              <div className="session-timer">
                <Clock size={18} />
                <span className={timeRemaining < 60 ? 'time-warning' : ''}>
                  {formatTime(timeRemaining)}
                </span>
              </div>
            )}
            {timingMode === 'stopwatch' && (
              <div className="session-timer">
                <Clock size={18} />
                <span>{formatTime(timeElapsed)}</span>
              </div>
            )}
            <div className="session-question-count">
              <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
            </div>
          </div>

          <div className="score-display">
            <Trophy size={24} />
            <div className="score-info">
              <span className="score-label">Current Score</span>
              <span className="score-value">{score}/{questions.length}</span>
            </div>
          </div>

          <div className="questions-overview">
            <h3>Progress</h3>
            <div className="question-dots">
              {questions.map((_, index) => {
                const questionId = String(questions[index]?.id ?? index);
                const isAnswered = userAnswers.hasOwnProperty(questionId);
                const isCurrent = index === currentQuestionIndex;
                
                
                let isCorrect = false;
                if (isAnswered && quizMode !== 'standard') {
                  const q = questions[index];
                  const userAns = userAnswers[questionId];
                  const correctAns = String(q.correct_answer || '').toLowerCase();
                  isCorrect = userAns.toLowerCase() === correctAns || 
                             userAns.toLowerCase() === correctAns.charAt(0);
                }

                return (
                  <button
                    type="button"
                    key={index}
                    className={`question-dot ${
                      isCurrent ? 'current' : 
                      isAnswered ? (quizMode === 'standard' ? 'answered' : (isCorrect ? 'answered-correct' : 'answered-incorrect')) : 
                      'upcoming'
                    } ${quizMode === 'standard' ? 'clickable' : ''}`}
                    onClick={() => quizMode === 'standard' && handleQuestionJump(index)}
                    disabled={quizMode !== 'standard'}
                    aria-label={`Go to question ${index + 1}${isAnswered ? ', answered' : ''}`}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {quizMode === 'standard' && (
            <button 
              className="sidebar-submit-btn" 
              onClick={handleSubmitFromStandard}
              disabled={Object.keys(userAnswers).length === 0}
            >
              <CheckCircle size={18} />
              <span>SUBMIT QUIZ</span>
            </button>
          )}
        </div>
      </div>
    </main>
  );
};

export default SoloQuizSession;
