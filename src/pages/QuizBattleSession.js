import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Clock, Target, Trophy, CheckCircle, XCircle, Loader, ArrowLeft, Play, Swords } from 'lucide-react';
import './BattleQuizFlow.css';
import SocialHubChrome from '../components/SocialHubChrome';
import { API_URL } from '../config';
import { queuedAIJsonFetch } from '../services/aiJobService';
import useSharedWebSocket from '../hooks/useSharedWebSocket';
import gamificationService from '../services/gamificationService';
import { extractQuestionText, normalizeQuestions } from '../utils/quizQuestionUtils';
import MathRenderer from '../components/MathRenderer';
import './QuizBattleSession.css';
import { formatBattleMode, getQuestionTimeLimit, shouldEndRun } from '../utils/battleRules';

const QuizBattleSession = () => {
  const navigate = useNavigate();
  const { battleId } = useParams();
  const token = localStorage.getItem('token');
  
  const [battle, setBattle] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [answeredQuestions, setAnsweredQuestions] = useState([]);
  const [score, setScore] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [questionTimeRemaining, setQuestionTimeRemaining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [opponentAnswers, setOpponentAnswers] = useState([]);
  const [opponentNotification, setOpponentNotification] = useState(null);
  const [opponentCompleted, setOpponentCompleted] = useState(false);
  const [showDetailedResults, setShowDetailedResults] = useState(false);
  const [detailedBattleData, setDetailedBattleData] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  const mountedRef = useRef(true);
  const answerTimeoutRef = useRef(null);
  const opponentNotifTimeoutRef = useRef(null);
  const lastSubmitAttemptRef = useRef(null);
  const resultsRequestIdRef = useRef(0);
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (answerTimeoutRef.current) clearTimeout(answerTimeoutRef.current);
      if (opponentNotifTimeoutRef.current) clearTimeout(opponentNotifTimeoutRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    const scrollSurface = document.querySelector('.battle-quiz-flow .shc-main');
    scrollSurface?.scrollTo({ top: 0, left: 0 });
  }, [battleId, showResult, showDetailedResults]);


  const { isConnected } = useSharedWebSocket(token, (message) => {
    
    if (message.type === 'connected') {
            return;
    }
    
    if (message.type === 'pong') {
      return; 
    }
    
    if (message.type === 'battle_answer_submitted') {
      
      if (message.battle_id === parseInt(battleId)) {
        const notificationData = {
          questionIndex: message.question_index,
          isCorrect: message.is_correct
        };
                
        
        setOpponentNotification(notificationData);


        if (opponentNotifTimeoutRef.current) clearTimeout(opponentNotifTimeoutRef.current);
        opponentNotifTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) setOpponentNotification(null);
        }, 2000);
      } else {
        
      }
    } else if (message.type === 'battle_opponent_completed' && message.battle_id === parseInt(battleId)) {
      setOpponentCompleted(true);
      
            setTimeout(() => fetchDetailedResults(), 500);
    } else if (message.type === 'battle_completed' && message.battle_id === parseInt(battleId)) {
            
      setOpponentCompleted(true);
      setTimeout(() => fetchDetailedResults(), 500);
    }
  });

  useEffect(() => {
    loadBattle();
  }, [battleId]);

  useEffect(() => {
    if (questions.length === 0) {
      if (currentQuestionIndex !== 0) {
        setCurrentQuestionIndex(0);
      }
      return;
    }

    if (currentQuestionIndex >= questions.length) {
      setCurrentQuestionIndex(questions.length - 1);
    }
  }, [questions.length, currentQuestionIndex]);

  
  useEffect(() => {
    if (opponentCompleted && showResult && !showDetailedResults) {
            fetchDetailedResults();
    }
  }, [opponentCompleted, showResult, showDetailedResults]);

  
  useEffect(() => {
    if (showResult && !showDetailedResults && !opponentCompleted) {
            const pollInterval = setInterval(() => {
                fetchDetailedResults();
      }, 3000); 

      return () => {
                clearInterval(pollInterval);
      };
    }
  }, [showResult, showDetailedResults, opponentCompleted]);

  
  useEffect(() => {
    if (opponentNotification) {
                } else {
          }
  }, [opponentNotification]);

  useEffect(() => {
    if (battle?.game_mode === 'blitz' || showResult || questions.length === 0) return undefined;
    if (timeRemaining > 0) {
      const timer = setTimeout(() => {
        setTimeRemaining(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (timeRemaining === 0) {
      handleTimeUp();
    }
    return undefined;
  }, [timeRemaining, showResult, questions.length, battle?.game_mode]);

  useEffect(() => {
    if (battle?.game_mode !== 'blitz' || showResult || questions.length === 0 || selectedAnswer !== null) return undefined;
    if (questionTimeRemaining > 0) {
      const timer = setTimeout(() => setQuestionTimeRemaining((value) => value - 1), 1000);
      return () => clearTimeout(timer);
    }
    if (questionTimeRemaining === 0) handleNextQuestion(null);
    return undefined;
  }, [questionTimeRemaining, showResult, questions.length, selectedAnswer, battle?.game_mode]);

  const loadBattle = async () => {
    try {
      const response = await fetch(`${API_URL}/quiz_battle/${battleId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setBattle(data.battle);
        setTimeRemaining(data.battle.time_limit_seconds);
        setQuestionTimeRemaining(getQuestionTimeLimit(data.battle.game_mode));
        startedAtRef.current = Date.now();

        if (data.questions && data.questions.length > 0) {
          const normalized = normalizeQuestions(data.questions);
          setQuestions(normalized);
          if (data.battle.your_completed) {
            setScore(data.battle.your_score || 0);
            setOpponentCompleted(Boolean(data.battle.opponent_completed));
            setShowResult(true);
            if (data.battle.opponent_completed) {
              setDetailedBattleData({ ...data, questions: normalized });
              setShowDetailedResults(true);
            }
          }
          setLoading(false);
        } else {
          if (data.battle.your_completed) {
            setScore(data.battle.your_score || 0);
            setOpponentCompleted(Boolean(data.battle.opponent_completed));
            setShowResult(true);
            if (data.battle.opponent_completed) {
              setDetailedBattleData(data);
              setShowDetailedResults(true);
            }
            setLoading(false);
          } else {
            await generateQuestions();
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.detail || 'Failed to load battle');
        navigate('/quiz-battles');
      }
    } catch (error) {
            alert('Failed to load battle');
      navigate('/quiz-battles');
    }
  };

  const generateQuestions = async () => {
    setGeneratingQuestions(true);
    
    try {
      const response = await queuedAIJsonFetch('/generate_battle_questions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          battle_id: battleId
        })
      });

      if (response.ok) {
        const data = await response.json();
        setQuestions(normalizeQuestions(data.questions));
      } else {
        throw new Error('Failed to generate questions');
      }
    } catch (error) {
      alert('Failed to generate questions. Please try again.');
      navigate('/quiz-battles');
    } finally {
      setGeneratingQuestions(false);
      setLoading(false);
    }
  };

  const handleAnswerSelect = (answerIndex) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(answerIndex);



    answerTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) handleNextQuestion(answerIndex);
    }, 1200);
  };

  const submitAnswerNotification = async (questionIndex, isCorrect) => {
    try {
            const response = await fetch(`${API_URL}/submit_battle_answer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          battle_id: parseInt(battleId),
          question_index: questionIndex,
          is_correct: isCorrect
        })
      });
      
      if (response.ok) {
              } else {
              }
    } catch (error) { /* silenced */ }
  };

  const handleNextQuestion = (answerIndex = selectedAnswer) => {
    
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    const isCorrect = answerIndex === currentQuestion.correct_answer;
    
    const newAnsweredQuestions = [
      ...answeredQuestions,
      {
        question_id: currentQuestion.id,
        question: extractQuestionText(currentQuestion),
        options: currentQuestion.options,
        correct_answer: currentQuestion.correct_answer,
        explanation: currentQuestion.explanation || '',
        selected_answer: answerIndex,
        is_correct: isCorrect,
        time_taken: Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)),
        time_taken_ms: Math.max(0, Date.now() - startedAtRef.current)
      }
    ];
    
    setAnsweredQuestions(newAnsweredQuestions);
    
    const newScore = score + (isCorrect ? 1 : 0);
    setScore(newScore);

    
    submitAnswerNotification(currentQuestionIndex, isCorrect);

    if (shouldEndRun(battle.game_mode, isCorrect)) {
      submitBattle(newScore, newAnsweredQuestions);
    } else if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(null);
      setQuestionTimeRemaining(getQuestionTimeLimit(battle.game_mode));
    } else {
      submitBattle(newScore, newAnsweredQuestions);
    }
  };

  const handleTimeUp = () => {
    submitBattle(score, answeredQuestions);
  };

  const submitBattle = async (finalScore, answers) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    lastSubmitAttemptRef.current = { finalScore, answers };

    try {
      const response = await fetch(`${API_URL}/complete_quiz_battle`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          battle_id: parseInt(battleId),
          answers: answers
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSubmitError(null);
        setShowResult(true);


        if (data.both_completed) {
          fetchDetailedResults();
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        setSubmitError(errorData.detail || 'Failed to submit your results.');
      }
    } catch (error) {
      setSubmitError('Failed to submit your results. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const retrySubmitBattle = () => {
    if (!lastSubmitAttemptRef.current) return;
    const { finalScore, answers } = lastSubmitAttemptRef.current;
    submitBattle(finalScore, answers);
  };

  const fetchDetailedResults = async () => {
    const requestId = ++resultsRequestIdRef.current;
    try {
            const response = await fetch(`${API_URL}/quiz_battle/${battleId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!mountedRef.current || requestId !== resultsRequestIdRef.current) return;

      if (response.ok) {
        const data = await response.json();
        if (!mountedRef.current || requestId !== resultsRequestIdRef.current) return;

        if (data.battle.opponent_completed && data.battle.your_completed) {
                    setDetailedBattleData(data);
          setShowDetailedResults(true);
          setOpponentCompleted(true);


          const userName = localStorage.getItem('username');
          if (userName && data.battle) {
            if (data.battle.your_score > data.battle.opponent_score) {
              gamificationService.trackBattleResult(userName, 'win');
            } else if (data.battle.your_score < data.battle.opponent_score) {
              gamificationService.trackBattleResult(userName, 'loss');
            } else {
              gamificationService.trackBattleResult(userName, 'draw');
            }
          }
        } else {
                                      }
      } else {
              }
    } catch (error) { /* silenced */ }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderBattleChrome = (content, activeSection = 'session') => (
    <div className="battle-quiz-flow with-social-chrome">
      <SocialHubChrome
        brandKicker="Quiz Battles"
        sidebarLead={(
          <button className="battle-flow-primary" type="button" onClick={() => navigate('/quiz-battles')}>
            <ArrowLeft size={15} />
            <span>Battle hub</span>
          </button>
        )}
        collapsedLeadItems={[{ icon: ArrowLeft, label: 'Battle hub', onClick: () => navigate('/quiz-battles') }]}
        sideSections={[{
          label: 'Battle Session',
          items: [
            { icon: Play, label: 'Questions', active: activeSection === 'session', disabled: activeSection === 'results', onClick: () => {} },
            { icon: Trophy, label: 'Results', active: activeSection === 'results', disabled: activeSection !== 'results', onClick: () => {} },
            { icon: Swords, label: 'All battles', onClick: () => navigate('/quiz-battles') },
          ],
        }]}
        sidebarTail={(
          <div className="battle-flow-summary" aria-live="polite">
            <span>{activeSection === 'results' ? 'Battle complete' : isConnected ? 'Live connection' : 'Refreshing battle'}</span>
            <strong>{battle?.subject || 'Preparing arena'}</strong>
            <small>{questions.length ? `${questions.length} questions` : 'Loading questions'}</small>
          </div>
        )}
      >
        {content}
      </SocialHubChrome>
    </div>
  );

  if (loading || generatingQuestions) {
    return renderBattleChrome(
      <main className="battle-session-loading">
        <Loader size={48} className="spinner" />
        <h2>{generatingQuestions ? 'Generating Questions...' : 'Loading Battle...'}</h2>
        <p>{generatingQuestions ? 'AI is creating custom questions for your battle' : 'Please wait'}</p>
      </main>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];

  if (showResult) {
    if (showDetailedResults && detailedBattleData) {
      
      const { battle: battleData, questions: detailedQuestions = [] } = detailedBattleData;
      const battleQuestions = normalizeQuestions(detailedQuestions.length > 0 ? detailedQuestions : questions);
      const totalBattleQuestions = Math.max(battleQuestions.length, battleData.question_count || 0, 1);
      const yourAnswers = battleData.your_answers || [];
      const opponentAnswers = battleData.opponent_answers || [];
      const youWon = battleData.your_result === 'win';
      const isDraw = battleData.your_result === 'draw';

      return renderBattleChrome(
        <main className="battle-result-page detailed">
          <div className="result-container detailed">
            <div className="result-header">
              <Trophy size={64} className={`result-icon ${youWon ? 'winner' : isDraw ? 'draw' : 'loser'}`} />
              <h1>{youWon ? 'Victory!' : isDraw ? 'Draw!' : 'Good Try!'}</h1>
            </div>

            <div className="result-comparison">
              <div className="player-result you">
                <h3>You</h3>
                <div className="player-score">{battleData.your_score}</div>
                <div className="player-accuracy">{Math.round((battleData.your_score / totalBattleQuestions) * 100)}%</div>
              </div>
              <div className="vs-divider">VS</div>
              <div className="player-result opponent">
                <h3>{battleData.opponent.first_name || battleData.opponent.username}</h3>
                <div className="player-score">{battleData.opponent_score}</div>
                <div className="player-accuracy">{Math.round((battleData.opponent_score / totalBattleQuestions) * 100)}%</div>
              </div>
            </div>

            <div className="question-by-question">
              <h3>Question by Question Breakdown</h3>
              {!battleData.question_quality_version && (
                <div className="battle-legacy-warning" role="note">
                  Legacy result: these questions predate answer-key validation, so explanations may not match the recorded key.
                </div>
              )}
              <div className="questions-comparison-list">
                {battleQuestions.map((question, index) => {
                  const yourAnswer = yourAnswers[index];
                  const opponentAnswer = opponentAnswers[index];
                  const yourCorrect = yourAnswer?.is_correct;
                  const opponentCorrect = opponentAnswer?.is_correct;
                  const yourSelectedIndex = yourAnswer?.selected_answer;
                  const opponentSelectedIndex = opponentAnswer?.selected_answer;
                  const correctAnswerIndex = question.correct_answer;
                  const showExplanation = !yourCorrect || !opponentCorrect; 
                  const options = Array.isArray(question.options) ? question.options : [];

                  return (
                    <div key={index} className="question-comparison-item expanded">
                      <div className="question-comparison-header">
                        <div className="question-number">Q{index + 1}</div>
                        <div className="question-text-full">{extractQuestionText(question)}</div>
                      </div>
                      
                      <div className="answer-options-review">
                        {options.map((option, optIndex) => {
                          const isCorrect = optIndex === correctAnswerIndex;
                          const youSelected = optIndex === yourSelectedIndex;
                          const opponentSelected = optIndex === opponentSelectedIndex;
                          
                          return (
                            <div 
                              key={optIndex} 
                              className={`answer-option-review ${isCorrect ? 'correct-answer' : ''} ${youSelected || opponentSelected ? 'selected' : ''}`}
                            >
                              <div className="option-content">
                                <span className="option-letter">{String.fromCharCode(65 + optIndex)}</span>
                                <span className="option-text">{option}</span>
                                {isCorrect && <CheckCircle size={16} className="correct-icon" />}
                              </div>
                              <div className="selection-indicators">
                                {youSelected && (
                                  <span className={`user-badge you ${yourCorrect ? 'correct' : 'incorrect'}`}>
                                    You {yourCorrect ? '✓' : '✗'}
                                  </span>
                                )}
                                {opponentSelected && (
                                  <span className={`user-badge opponent ${opponentCorrect ? 'correct' : 'incorrect'}`}>
                                    Opponent {opponentCorrect ? '✓' : '✗'}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {showExplanation && question.explanation && (
                        <div className="question-explanation">
                          <strong>Explanation:</strong> {question.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <button 
              className="result-button"
              onClick={() => navigate('/quiz-battles')}
            >
              Back to Quiz Battles
            </button>
          </div>
        </main>,
        'results'
      );
    }

    
    const totalQuestions = Math.max(questions.length, 1);

    return renderBattleChrome(
      <main className="battle-result-page">
        <div className="result-container">
          <div className="result-header">
            <Trophy size={64} className="result-icon" />
            <h1>Battle Complete!</h1>
          </div>

          <div className="result-stats">
            <div className="result-stat">
              <span className="stat-label">Your Score</span>
              <span className="stat-value">{score}</span>
            </div>
            <div className="result-stat">
              <span className="stat-label">Total Questions</span>
              <span className="stat-value">{questions.length}</span>
            </div>
            <div className="result-stat">
              <span className="stat-label">Accuracy</span>
              <span className="stat-value">{Math.round((score / totalQuestions) * 100)}%</span>
            </div>
          </div>

          <div className="result-message">
            {opponentCompleted ? (
              <>
                <Loader size={32} className="spinner" />
                <p>Loading final results...</p>
              </>
            ) : (
              <>
                <p>Waiting for opponent to complete...</p>
                <p className="result-hint">You'll see detailed results when they finish</p>
              </>
            )}
          </div>

          <button 
            className="result-button"
            onClick={() => navigate('/quiz-battles')}
          >
            Back to Quiz Battles
          </button>
        </div>
      </main>,
      'results'
    );
  }

  if (!currentQuestion) {
    return renderBattleChrome(
      <main className="battle-session-loading">
        <Loader size={48} className="spinner" />
        <h2>No questions available</h2>
        <p>This battle does not have any playable questions yet.</p>
        <button
          className="result-button"
          onClick={() => navigate('/quiz-battles')}
        >
          Back to Quiz Battles
        </button>
      </main>
    );
  }

  const currentQuestionText = extractQuestionText(currentQuestion);
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  const currentOptions = Array.isArray(currentQuestion.options) ? currentQuestion.options : [];

  return renderBattleChrome(
    <main className="battle-session-page">
      {/* Live opponent notification */}
      {opponentNotification && (
        <div className={`opponent-notification ${opponentNotification.isCorrect ? 'correct' : 'incorrect'}`}>
          <div className="notification-content">
            {opponentNotification.isCorrect ? (
              <>
                <CheckCircle size={20} />
                <span>Opponent got Q{opponentNotification.questionIndex + 1} correct!</span>
              </>
            ) : (
              <>
                <XCircle size={20} />
                <span>Opponent got Q{opponentNotification.questionIndex + 1} wrong</span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="session-header">
        <div className="session-info">
          <div className="info-item">
            <Target size={16} />
            <span>{battle?.subject} · {formatBattleMode(battle?.game_mode)}</span>
          </div>
          <div className="info-item">
            <span className="question-counter">
              Question {currentQuestionIndex + 1} of {questions.length}
            </span>
          </div>
        </div>
        
        <div className="session-timer">
          <Clock size={20} />
          <span className={timeRemaining < 60 ? 'time-warning' : ''}>
            {battle?.game_mode === 'blitz' ? `${questionTimeRemaining ?? 15}s` : formatTime(timeRemaining)}
          </span>
        </div>
      </div>

      <div className="progress-bar">
        <div className="progress-fill" style={{ transform: `scaleX(${progress / 100})` }} />
      </div>

      <div className="battle-session-container">
        <div className="question-card">
          <div className="question-header">
            <MathRenderer content={currentQuestionText} className="question-text" />
            <div className="question-difficulty">
              <span className={`difficulty-badge ${battle?.difficulty}`}>
                {battle?.difficulty}
              </span>
              <span className="battle-mode-badge">{formatBattleMode(battle?.game_mode)}</span>
            </div>
          </div>

          <div className="answers-grid">
            {currentOptions.map((option, index) => {
              const isSelected = selectedAnswer === index;
              const isCorrect = index === currentQuestion.correct_answer;
              const showCorrect = selectedAnswer !== null && isCorrect;
              const showIncorrect = selectedAnswer !== null && isSelected && !isCorrect;

              return (
                <button
                  key={index}
                  className={`answer-option ${isSelected ? 'selected' : ''} ${showCorrect ? 'correct' : ''} ${showIncorrect ? 'incorrect' : ''}`}
                  onClick={() => handleAnswerSelect(index)}
                  disabled={selectedAnswer !== null}
                >
                  <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                  <MathRenderer content={String(option)} className="option-text" />
                  {showCorrect && <CheckCircle size={20} className="option-icon" />}
                  {showIncorrect && <XCircle size={20} className="option-icon" />}
                </button>
              );
            })}
          </div>

          {/* Removed feedback and next button - auto-advances after 2 seconds */}

          {submitError && (
            <div className="battle-submit-error" role="alert">
              <span>{submitError}</span>
              <button type="button" className="result-button" onClick={retrySubmitBattle} disabled={isSubmitting}>
                {isSubmitting ? 'Retrying…' : 'Try again'}
              </button>
            </div>
          )}
        </div>

        <div className="battle-sidebar">
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
              {questions.map((_, index) => (
                <div
                  key={index}
                  className={`question-dot ${
                    index < currentQuestionIndex ? 'answered' : 
                    index === currentQuestionIndex ? 'current' : 
                    'upcoming'
                  }`}
                >
                  {index + 1}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default QuizBattleSession;
