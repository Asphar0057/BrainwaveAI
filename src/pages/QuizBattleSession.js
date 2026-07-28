import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Clock, Target, Trophy, CheckCircle, XCircle, Loader , Menu} from 'lucide-react';
import './QuizBattleSession.css';
import '../components/SocialHubChrome.css';
import { API_URL } from '../config';
import { queuedAIJsonFetch } from '../services/aiJobService';
import useSharedWebSocket from '../hooks/useSharedWebSocket';
import gamificationService from '../services/gamificationService';
import { extractQuestionText, normalizeQuestions } from '../utils/quizQuestionUtils';
import MathRenderer from '../components/MathRenderer';

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
  const [loading, setLoading] = useState(true);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [opponentAnswers, setOpponentAnswers] = useState([]);
  const [opponentNotification, setOpponentNotification] = useState(null);
  const [opponentCompleted, setOpponentCompleted] = useState(false);
  const [showDetailedResults, setShowDetailedResults] = useState(false);
  const [detailedBattleData, setDetailedBattleData] = useState(null);

  
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
                
        
        setTimeout(() => {
          setOpponentNotification(null);
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
    if (timeRemaining > 0 && !showResult) {
      const timer = setTimeout(() => {
        setTimeRemaining(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (timeRemaining === 0 && questions.length > 0) {
      handleTimeUp();
    }
  }, [timeRemaining, showResult]);

  const loadBattle = async () => {
    try {
      const response = await fetch(`${API_URL}/quiz_battle/${battleId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setBattle(data.battle);
        setTimeRemaining(data.battle.time_limit_seconds);
        
        
        if (data.questions && data.questions.length > 0) {
          setQuestions(normalizeQuestions(data.questions));
          setLoading(false);
        } else {
          
          await generateQuestions(data.battle);
        }
      }
    } catch (error) {
            alert('Failed to load battle');
      navigate('/quiz-battles');
    }
  };

  const generateQuestions = async (battleData) => {
    setGeneratingQuestions(true);
    
    try {
      const response = await queuedAIJsonFetch('/generate_battle_questions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          battle_id: battleId,
          subject: battleData.subject,
          difficulty: battleData.difficulty,
          question_count: battleData.question_count
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
    
    
    
    setTimeout(() => {
      handleNextQuestion(answerIndex);
    }, 2000);
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
        time_taken: battle.time_limit_seconds - timeRemaining
      }
    ];
    
    setAnsweredQuestions(newAnsweredQuestions);
    
    const newScore = score + (isCorrect ? 1 : 0);
    setScore(newScore);

    
    submitAnswerNotification(currentQuestionIndex, isCorrect);

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(null);
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
    
    try {
      const response = await fetch(`${API_URL}/complete_quiz_battle`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          battle_id: parseInt(battleId),
          score: finalScore,
          answers: answers
        })
      });

      if (response.ok) {
        const data = await response.json();
        setShowResult(true);
        
        
        if (data.both_completed) {
          fetchDetailedResults();
        }
      }
    } catch (error) {
            alert('Failed to submit results');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchDetailedResults = async () => {
    try {
            const response = await fetch(`${API_URL}/quiz_battle/${battleId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
                                                
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

  if (loading || generatingQuestions) {
    return (
      <div className="battle-session-loading">
        <Loader size={48} className="spinner" />
        <h2>{generatingQuestions ? 'Generating Questions...' : 'Loading Battle...'}</h2>
        <p>{generatingQuestions ? 'AI is creating custom questions for your battle' : 'Please wait'}</p>
      </div>
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
      const youWon = battleData.your_score > battleData.opponent_score;
      const isDraw = battleData.your_score === battleData.opponent_score;

      return (
        <div className="battle-result-page detailed">
          <div className="result-container detailed">
            <div className="result-header">
              <Trophy size={64} className={`result-icon ${youWon ? 'winner' : isDraw ? 'draw' : 'loser'}`} />
              <h1>{youWon ? ' Victory!' : isDraw ? ' Draw!' : ' Good Try!'}</h1>
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
        </div>
      );
    }

    
    const totalQuestions = Math.max(questions.length, 1);

    return (
      <div className="battle-result-page">
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
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="battle-session-loading">
        <Loader size={48} className="spinner" />
        <h2>No questions available</h2>
        <p>This battle does not have any playable questions yet.</p>
        <button
          className="result-button"
          onClick={() => navigate('/quiz-battles')}
        >
          Back to Quiz Battles
        </button>
      </div>
    );
  }

  const currentQuestionText = extractQuestionText(currentQuestion);
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  const currentOptions = Array.isArray(currentQuestion.options) ? currentQuestion.options : [];

  return (
    <div className="battle-session-page">
      <div className="shc-topbar">
        <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
        <div className="shc-topbar-right">
          <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
        </div>
      </div>
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
            <span>{battle?.subject}</span>
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
            {formatTime(timeRemaining)}
          </span>
        </div>
      </div>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="battle-session-container">
        <div className="question-card">
          <div className="question-header">
            <MathRenderer content={currentQuestionText} className="question-text" />
            <div className="question-difficulty">
              <span className={`difficulty-badge ${battle?.difficulty}`}>
                {battle?.difficulty}
              </span>
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
                  <span className="option-text">{option}</span>
                  {showCorrect && <CheckCircle size={20} className="option-icon" />}
                  {showIncorrect && <XCircle size={20} className="option-icon" />}
                </button>
              );
            })}
          </div>

          {/* Removed feedback and next button - auto-advances after 2 seconds */}
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
    </div>
  );
};

export default QuizBattleSession;
