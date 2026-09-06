import ToolNavigation from '../components/ToolNavigation';
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Clock, Target, Trophy, CheckCircle, XCircle, Loader, TrendingUp , Menu} from 'lucide-react';
import './ChallengeSession.css';
import '../components/SocialHubChrome.css';
import { API_URL } from '../config';
import { queuedAIJsonFetch } from '../services/aiJobService';
import MathRenderer from '../components/MathRenderer';

const ChallengeSession = () => {
  const navigate = useNavigate();
  const { challengeId } = useParams();
  const token = localStorage.getItem('token');
  
  const [requestError, setRequestError] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [answeredQuestions, setAnsweredQuestions] = useState([]);
  const [score, setScore] = useState(0);
  const [accuracy, setAccuracy] = useState(100);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    loadChallenge();
  }, [challengeId]);

  useEffect(() => {
    if (loading || generatingQuestions || isSubmitting || requestError || showResult) return;
    if (timeRemaining > 0 && !showResult) {
      const timer = setTimeout(() => {
        setTimeRemaining(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (timeRemaining === 0 && questions.length > 0) {
      handleTimeUp();
    }
  }, [timeRemaining, showResult, loading, generatingQuestions, isSubmitting, requestError]);

  const loadChallenge = async () => {
    setRequestError(''); setLoading(true);
    try {
      const response = await fetch(`${API_URL}/challenge/${challengeId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('The challenge request failed. Please try again.');
      if (response.ok) {
        const data = await response.json();
        setChallenge(data.challenge);
        setTimeRemaining(data.challenge.time_limit_minutes * 60);
        
        
        if (data.questions && data.questions.length > 0) {
          setQuestions(data.questions);
          setLoading(false);
        } else {
          
          await generateQuestions(data.challenge);
        }
      }
    } catch (error) {
            setRequestError('Could not load this challenge. Please try again.');
      setLoading(false);
    }
  };

  const generateQuestions = async (challengeData) => {
    setGeneratingQuestions(true);
    try {
      
      let questionCount = 10;
      if (challengeData.target_metric === 'questions_answered') {
        questionCount = Math.ceil(challengeData.target_value);
      }

      const response = await queuedAIJsonFetch('/generate_challenge_questions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          challenge_id: challengeId,
          subject: challengeData.subject || 'General Knowledge',
          challenge_type: challengeData.challenge_type,
          question_count: questionCount
        })
      });

      if (!response.ok) throw new Error('The challenge request failed. Please try again.');
      if (response.ok) {
        const data = await response.json();
        setQuestions(data.questions);
      } else {
        throw new Error('Failed to generate questions');
      }
    } catch (error) {
            setRequestError('Questions could not be prepared. Please try again.');
    } finally {
      setGeneratingQuestions(false);
      setLoading(false);
    }
  };

  const handleAnswerSelect = (answerIndex) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(answerIndex);
  };

  const handleNextQuestion = () => {
    const currentQuestion = questions[currentQuestionIndex];
    const isCorrect = selectedAnswer === currentQuestion.correct_answer;
    
    const newAnsweredQuestions = [
      ...answeredQuestions,
      {
        question_id: currentQuestion.id,
        selected_answer: selectedAnswer,
        is_correct: isCorrect
      }
    ];
    
    setAnsweredQuestions(newAnsweredQuestions);
    if (isCorrect) {
      setScore(score + 1);
    }

    
    const totalAnswered = newAnsweredQuestions.length;
    const correctCount = newAnsweredQuestions.filter(q => q.is_correct).length;
    setAccuracy(Math.round((correctCount / totalAnswered) * 100));

    
    updateProgress(newAnsweredQuestions);

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(null);
    } else {
      submitChallenge(newAnsweredQuestions);
    }
  };

  const updateProgress = (answers) => {
    if (!challenge) return;

    let currentProgress = 0;
    const totalAnswered = answers.length;
    const correctCount = answers.filter(q => q.is_correct).length;
    const currentAccuracy = (correctCount / totalAnswered) * 100;

    switch (challenge.target_metric) {
      case 'questions_answered':
        currentProgress = (totalAnswered / challenge.target_value) * 100;
        break;
      case 'accuracy_percentage':
        currentProgress = (currentAccuracy / challenge.target_value) * 100;
        break;
      case 'study_hours':
        
        const minutesSpent = (challenge.time_limit_minutes * 60 - timeRemaining) / 60;
        currentProgress = (minutesSpent / (challenge.target_value * 60)) * 100;
        break;
      default:
        currentProgress = (totalAnswered / questions.length) * 100;
    }

    setProgress(Math.min(currentProgress, 100));
  };

  const handleTimeUp = () => {
    submitChallenge(answeredQuestions);
  };

  const submitChallenge = async (answers) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    try {
      const totalAnswered = answers.length;
      const correctCount = answers.filter(q => q.is_correct).length;
      const finalAccuracy = totalAnswered > 0 ? (correctCount / totalAnswered) * 100 : 0;

      const response = await fetch(`${API_URL}/update_challenge_progress`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          challenge_id: parseInt(challengeId),
          questions_answered: totalAnswered,
          accuracy_percentage: finalAccuracy,
          answers: answers
        })
      });

      if (!response.ok) throw new Error('The challenge request failed. Please try again.');
      if (response.ok) {
        setShowResult(true);
      }
    } catch (error) {
            setRequestError('Your result was not saved. Your answers are still available here.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getChallengeGoalText = () => {
    if (!challenge) return '';
    
    switch (challenge.target_metric) {
      case 'questions_answered':
        return `Answer ${challenge.target_value} questions`;
      case 'accuracy_percentage':
        return `Achieve ${challenge.target_value}% accuracy`;
      case 'study_hours':
        return `Study for ${challenge.target_value} hours`;
      case 'streak_days':
        return `Maintain ${challenge.target_value} day streak`;
      default:
        return `Reach target: ${challenge.target_value}`;
    }
  };

  if (requestError) return <main className="challenge-session-loading"><h2>Challenge interrupted</h2><p role="alert">{requestError}</p><button type="button" onClick={() => { setRequestError(''); if (questions.length) submitChallenge(answeredQuestions); else loadChallenge(); }}>Try again</button><button type="button" onClick={() => navigate('/challenges')}>Back to challenges</button></main>;
  if (loading || generatingQuestions) {
    return (
      <div className="challenge-session-loading">
        <Loader size={48} className="spinner" />
        <h2>{generatingQuestions ? 'Generating Questions...' : 'Loading Challenge...'}</h2>
        <p>{generatingQuestions ? 'AI is creating custom questions for your challenge' : 'Please wait'}</p>
      </div>
    );
  }

  if (showResult) {
    const isCompleted = progress >= 100;
    
    return (
      <div className="challenge-result-page">
        <div className="result-container">
          <div className="result-header">
            <Trophy size={64} className="result-icon" />
            <h1>{isCompleted ? 'Challenge Complete!' : 'Progress Saved!'}</h1>
          </div>

          <div className="result-stats">
            <div className="result-stat">
              <span className="stat-label">Questions Answered</span>
              <span className="stat-value">{answeredQuestions.length}</span>
            </div>
            <div className="result-stat">
              <span className="stat-label">Accuracy</span>
              <span className="stat-value">{accuracy}%</span>
            </div>
            <div className="result-stat">
              <span className="stat-label">Progress</span>
              <span className="stat-value">{Math.round(progress)}%</span>
            </div>
          </div>

          <div className={`result-message ${isCompleted ? 'success' : 'info'}`}>
            <p>{isCompleted ? 'Congratulations! You completed the challenge!' : 'Keep going to complete the challenge!'}</p>
            <p className="result-hint">{getChallengeGoalText()}</p>
          </div>

          <button 
            className="result-button"
            onClick={() => navigate('/challenges')}
          >
            Back to Challenges
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const questionProgress = ((currentQuestionIndex + 1) / questions.length) * 100;

  return (
    <div className="challenge-session-page">
      <div className="shc-topbar">
        <ToolNavigation />
      </div>
      <div className="session-header">
        <div className="session-info">
          <div className="info-item">
            <Target size={16} />
            <span>{challenge?.title}</span>
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

      <div className="progress-container">
        <div className="progress-label">
          <span>Challenge Progress</span>
          <span className="progress-percentage">{Math.round(progress)}%</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="progress-goal">{getChallengeGoalText()}</div>
      </div>

      <div className="challenge-session-container">
        <div className="question-card">
          <div className="question-header">
            <MathRenderer content={currentQuestion.question} className="question-text" />
            {challenge?.subject && (
              <div className="question-subject">
                <span className="subject-badge">{challenge.subject}</span>
              </div>
            )}
          </div>

          <div className="answers-grid">
            {currentQuestion.options.map((option, index) => {
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

          {selectedAnswer !== null && (
            <div className={`answer-feedback ${selectedAnswer === currentQuestion.correct_answer ? 'correct' : 'incorrect'}`}>
              <div className="feedback-icon">
                {selectedAnswer === currentQuestion.correct_answer ? (
                  <CheckCircle size={24} />
                ) : (
                  <XCircle size={24} />
                )}
              </div>
              <div className="feedback-text">
                <strong>
                  {selectedAnswer === currentQuestion.correct_answer ? 'Correct!' : 'Incorrect'}
                </strong>
                <MathRenderer content={currentQuestion.explanation} />
              </div>
            </div>
          )}

          <div className="question-actions">
            {selectedAnswer !== null && (
              <button 
                className="next-question-btn"
                onClick={handleNextQuestion}
              >
                {currentQuestionIndex < questions.length - 1 ? 'Next Question' : 'Finish Challenge'}
              </button>
            )}
          </div>
        </div>

        <div className="challenge-sidebar">
          <div className="stats-card">
            <h3>Performance</h3>
            <div className="stat-row">
              <span className="stat-label">Score</span>
              <span className="stat-value">{score}/{questions.length}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Accuracy</span>
              <span className="stat-value">{accuracy}%</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Answered</span>
              <span className="stat-value">{answeredQuestions.length}</span>
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

export default ChallengeSession;
