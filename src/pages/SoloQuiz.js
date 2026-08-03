import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Play, Brain, Sparkles, Loader, AlertCircle, BarChart3,
  BookOpen, Gauge, Cpu, Database, ArrowRight, History, TrendingUp, Zap, ChevronRight, ArrowLeft
} from 'lucide-react';
import './SoloQuiz.css';
import SocialHubChrome from '../components/SocialHubChrome';
import quizAgentService from '../services/quizAgentService';

const SoloQuiz = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const username = localStorage.getItem('username');

  const [activeTab, setActiveTab] = useState('generator');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  ));
  const [subject, setSubject] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [questionCount, setQuestionCount] = useState(10);
  const [questionTypes] = useState(['multiple_choice']);
  const [useAdaptive, setUseAdaptive] = useState(false);
  const [quizMode, setQuizMode] = useState('standard');
  const [timingMode, setTimingMode] = useState('timed');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [completedQuizzes, setCompletedQuizzes] = useState([]);
  const [statistics, setStatistics] = useState(null);

  const getDifficultyMix = () => {
    switch (difficulty) {
      case 'easy': return { easy: 6, medium: 3, hard: 1 };
      case 'medium': return { easy: 3, medium: 5, hard: 2 };
      case 'hard': return { easy: 1, medium: 4, hard: 5 };
      default: return { easy: 3, medium: 5, hard: 2 };
    }
  };

  const difficultyLabel = difficulty === 'medium' ? 'Balanced' : difficulty;

  useEffect(() => {
    const autoStartData = location.state;
    if (autoStartData?.autoStart && autoStartData.topics?.length > 0) {
      setSubject(autoStartData.topics[0]);
      setDifficulty(autoStartData.difficulty || 'medium');
      setQuestionCount(autoStartData.questionCount || 10);
      setTimeout(() => {
        handleStartQuiz(null, autoStartData.topics[0], autoStartData.difficulty || 'medium', autoStartData.questionCount || 10);
      }, 500);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleStartQuiz = async (e, autoTopic = null, autoDifficulty = null, autoCount = null) => {
    if (e) e.preventDefault();
    const topicToUse = autoTopic || subject;
    const difficultyToUse = autoDifficulty || difficulty;
    const countToUse = autoCount || questionCount;

    if (!topicToUse) {
      setError('Please enter a subject to begin your quiz');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const useHsContext = localStorage.getItem('hs_mode_enabled') === 'true';
      let response;
      if (useAdaptive) {
        response = await quizAgentService.generateAdaptiveQuiz({
          userId: username,
          topic: topicToUse,
          questionCount: countToUse,
          use_hs_context: useHsContext
        });
      } else {
        response = await quizAgentService.generateQuiz({
          userId: username,
          topic: topicToUse,
          questionCount: countToUse,
          difficultyMix: getDifficultyMix(),
          questionTypes,
          use_hs_context: useHsContext
        });
      }

      if (response.success && response.questions?.length > 0) {
        sessionStorage.setItem('quizData', JSON.stringify({
          questions: response.questions,
          topic: topicToUse,
          difficulty: difficultyToUse,
          adaptiveConfig: response.adaptive_config,
          quizMode,
          timingMode,
          quiz_id: response.quiz_id
        }));
        navigate('/solo-quiz/session');
      } else {
        setError('Unable to generate questions. Please try a different topic.');
      }
    } catch (err) {
      setError(err.message || 'Failed to create quiz. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sq-page with-social-chrome">
      <SocialHubChrome
        brandKicker="Solo Quiz"
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        sidebarLead={(
          <button className="sq-side-primary" type="button" onClick={() => setActiveTab('generator')}>
            <Sparkles size={15} />
            <span>Build a quiz</span>
          </button>
        )}
        collapsedLeadItems={[{ icon: Sparkles, label: 'Build a quiz', active: activeTab === 'generator', onClick: () => setActiveTab('generator') }]}
        sideSections={[
          {
            label: 'Quiz Workspace',
            items: [
              { icon: Sparkles, label: 'Generator', active: activeTab === 'generator', onClick: () => setActiveTab('generator') },
              { icon: History, label: 'Completed', active: activeTab === 'completed', onClick: () => setActiveTab('completed'), count: completedQuizzes.length },
              { icon: TrendingUp, label: 'Statistics', active: activeTab === 'statistics', onClick: () => setActiveTab('statistics') },
              { icon: ArrowLeft, label: 'Quiz modes', onClick: () => navigate('/quiz-hub') },
            ],
          },
        ]}
        collapsedTailItems={[{ icon: ArrowLeft, label: 'Quiz modes', onClick: () => navigate('/quiz-hub') }]}
      >
        <main className="sq-main">
          {activeTab === 'generator' && (
            <div className="sq-content">
              <div className="sq-generator-container">
                <div className="sq-generator-header">
                  <div className="sq-generator-heading">
                    <span className="sq-generator-kicker">Solo quiz brief</span>
                    <Brain size={30} className="sq-generator-icon" />
                    <h1 className="sq-generator-title">Build the test you need right now.</h1>
                    <p className="sq-generator-subtitle">
                      Set the topic, pressure and feedback style. Cerbyl will build the questions.
                    </p>
                  </div>
                  <div className="sq-live-brief" aria-live="polite">
                    <div className="sq-live-topic">
                      <span>Topic</span>
                      <strong>{subject.trim() || 'Waiting for a subject'}</strong>
                    </div>
                    <div className="sq-live-specs">
                      <span><strong>{questionCount}</strong> questions</span>
                      <span><strong>{difficultyLabel}</strong> level</span>
                      <span><strong>{timingMode === 'none' ? 'Open' : timingMode}</strong> pace</span>
                    </div>
                    <div className="sq-live-mode">
                      <span>{useAdaptive ? 'Adaptive difficulty on' : 'Fixed difficulty'}</span>
                      <strong>{quizMode === 'sequential-instant' ? 'Instant feedback' : quizMode}</strong>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleStartQuiz} className="sq-generator-form">
                  <div className="sq-form-group">
                    <label>
                      <BookOpen size={16} />
                      Subject or topic
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="e.g., Machine Learning, World War II, Calculus..."
                      required
                    />
                  </div>

                  <div className="sq-form-row">
                    <div className="sq-form-group">
                      <label>
                        <Gauge size={16} />
                        Difficulty
                      </label>
                      <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>

                    <div className="sq-form-group">
                      <label>
                        <Database size={16} />
                        Questions
                      </label>
                      <input
                        type="number"
                        value={questionCount}
                        onChange={(e) => setQuestionCount(Math.min(20, Math.max(5, parseInt(e.target.value) || 5)))}
                        min="5"
                        max="20"
                      />
                    </div>
                  </div>

                  <div className="sq-form-group">
                    <label>
                      <Play size={16} />
                      Answer flow
                    </label>
                    <div className="sq-mode-options">
                      <button
                        type="button"
                        className={`sq-mode-btn ${quizMode === 'standard' ? 'active' : ''}`}
                        aria-pressed={quizMode === 'standard'}
                        onClick={() => setQuizMode('standard')}
                      >
                        <div className="sq-mode-header">
                          <span className="sq-mode-name">Standard</span>
                        </div>
                        <p className="sq-mode-desc">Navigate freely between questions. Answer at your own pace.</p>
                      </button>

                      <button
                        type="button"
                        className={`sq-mode-btn ${quizMode === 'sequential' ? 'active' : ''}`}
                        aria-pressed={quizMode === 'sequential'}
                        onClick={() => setQuizMode('sequential')}
                      >
                        <div className="sq-mode-header">
                          <span className="sq-mode-name">Sequential</span>
                        </div>
                        <p className="sq-mode-desc">Answer each question to proceed. Results shown at the end.</p>
                      </button>

                      <button
                        type="button"
                        className={`sq-mode-btn ${quizMode === 'sequential-instant' ? 'active' : ''}`}
                        aria-pressed={quizMode === 'sequential-instant'}
                        onClick={() => setQuizMode('sequential-instant')}
                      >
                        <div className="sq-mode-header">
                          <span className="sq-mode-name">Instant Feedback</span>
                        </div>
                        <p className="sq-mode-desc">See if your answer is correct immediately after selection.</p>
                      </button>
                    </div>
                  </div>

                  <div className="sq-form-group">
                    <label>
                      <Gauge size={16} />
                      Timing
                    </label>
                    <div className="sq-timing-options">
                      <button
                        type="button"
                        className={`sq-timing-btn ${timingMode === 'timed' ? 'active' : ''}`}
                        aria-pressed={timingMode === 'timed'}
                        onClick={() => setTimingMode('timed')}
                      >
                        <span className="sq-timing-name">Timed</span>
                        <p className="sq-timing-desc">Countdown timer (1 min/question)</p>
                      </button>

                      <button
                        type="button"
                        className={`sq-timing-btn ${timingMode === 'stopwatch' ? 'active' : ''}`}
                        aria-pressed={timingMode === 'stopwatch'}
                        onClick={() => setTimingMode('stopwatch')}
                      >
                        <span className="sq-timing-name">Stopwatch</span>
                        <p className="sq-timing-desc">Track how fast you complete</p>
                      </button>

                      <button
                        type="button"
                        className={`sq-timing-btn ${timingMode === 'none' ? 'active' : ''}`}
                        aria-pressed={timingMode === 'none'}
                        onClick={() => setTimingMode('none')}
                      >
                        <span className="sq-timing-name">No Timer</span>
                        <p className="sq-timing-desc">Take your time, no pressure</p>
                      </button>
                    </div>
                  </div>

                  <div className="sq-form-group sq-adaptive-toggle">
                    <label className="sq-toggle-label">
                      <input
                        type="checkbox"
                        checked={useAdaptive}
                        onChange={(e) => setUseAdaptive(e.target.checked)}
                      />
                      <span className="sq-toggle-text">
                        <Cpu size={20} />
                        Use adaptive difficulty
                      </span>
                    </label>
                    <p className="sq-toggle-desc">AI adjusts questions based on your past performance</p>
                  </div>

                  {error && (
                    <div className="sq-error">
                      <AlertCircle size={20} />
                      <span>{error}</span>
                      <button type="button" onClick={() => setError(null)}>×</button>
                    </div>
                  )}

                  <button type="submit" className="sq-submit-btn" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader size={20} className="spinner" />
                        <span>Building your quiz…</span>
                      </>
                    ) : (
                      <>
                        <Play size={18} />
                        <span>Build and start quiz</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'completed' && (
            <div className="sq-content sq-content--flush">
              <div className="sq-tab-hero">
                <div className="sq-tab-kicker">Quiz History</div>
                <h1 className="sq-tab-title">Completed</h1>
                <p className="sq-tab-desc">Review your past performances and track your growth</p>
              </div>

              <div className="sq-completed-list">
                {completedQuizzes.length === 0 ? (
                  <div className="sq-empty-state">
                    <History size={48} />
                    <h3>No Completed Quizzes Yet</h3>
                    <p>Start a new quiz to see your results here</p>
                    <button className="sq-empty-btn" onClick={() => setActiveTab('generator')}>
                      <span style={{ fontSize: '24px', fontWeight: '400', lineHeight: '1' }}>+</span>
                      <span>GENERATE QUIZ</span>
                    </button>
                  </div>
                ) : (
                  completedQuizzes.map((quiz, idx) => (
                    <div key={idx} className="sq-quiz-card">
                      <div className="sq-quiz-card-header">
                        <h3>{quiz.topic}</h3>
                        <span className={`sq-score-badge ${quiz.score >= 80 ? 'excellent' : quiz.score >= 60 ? 'good' : 'needs-work'}`}>
                          {quiz.score}%
                        </span>
                      </div>
                      <div className="sq-quiz-card-meta">
                        <span><BookOpen size={14} /> {quiz.questionCount} questions</span>
                        <span><Gauge size={14} /> {quiz.difficulty}</span>
                        <span>{new Date(quiz.completedAt).toLocaleDateString()}</span>
                      </div>
                      <button className="sq-review-btn">
                        <ArrowRight size={16} />
                        Review Answers
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'statistics' && (
            <div className="sq-content sq-content--flush">
              <div className="sq-tab-hero">
                <div className="sq-tab-kicker">Performance</div>
                <h1 className="sq-tab-title">Statistics</h1>
                <p className="sq-tab-desc">Track your progress and performance over time</p>
              </div>

              {statistics ? (
                <div className="sq-stats-grid">
                  <div className="sq-stat-card">
                    <div className="sq-stat-icon"><Play size={24} /></div>
                    <div className="sq-stat-content">
                      <h3 className="sq-stat-value">{statistics.totalQuizzes}</h3>
                      <p className="sq-stat-label">Total Quizzes</p>
                    </div>
                  </div>
                  <div className="sq-stat-card">
                    <div className="sq-stat-icon"><BarChart3 size={24} /></div>
                    <div className="sq-stat-content">
                      <h3 className="sq-stat-value">{statistics.averageScore}%</h3>
                      <p className="sq-stat-label">Average Score</p>
                    </div>
                  </div>
                  <div className="sq-stat-card">
                    <div className="sq-stat-icon"><TrendingUp size={24} /></div>
                    <div className="sq-stat-content">
                      <h3 className="sq-stat-value">{statistics.bestScore}%</h3>
                      <p className="sq-stat-label">Best Score</p>
                    </div>
                  </div>
                  <div className="sq-stat-card">
                    <div className="sq-stat-icon"><Database size={24} /></div>
                    <div className="sq-stat-content">
                      <h3 className="sq-stat-value">{statistics.totalQuestions}</h3>
                      <p className="sq-stat-label">Questions Answered</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="sq-empty-state">
                  <BarChart3 size={48} />
                  <h3>No Statistics Available</h3>
                  <p>Complete some quizzes to see your statistics here</p>
                  <button className="sq-empty-btn" onClick={() => setActiveTab('generator')}>
                    <span style={{ fontSize: '24px', fontWeight: '400', lineHeight: '1' }}>+</span>
                    <span>START A QUIZ</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </SocialHubChrome>
    </div>
  );
};

export default SoloQuiz;
