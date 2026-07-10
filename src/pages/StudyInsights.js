import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './StudyInsights.css';
import '../components/SocialHubChrome.css';
import { API_URL } from '../config';
import { queuedAIJsonFetch } from '../services/aiJobService';
import logo from '../assets/logo.svg';
import {
  ArrowLeft, LayoutDashboard, MessageSquare, LogOut, Sparkles,
  Clock, BarChart3, BookOpen, Brain, FileQuestion, Target
} from 'lucide-react';

const SI_ICONS = {
  home: <LayoutDashboard size={18} />,
  chat: <MessageSquare size={18} />,
  logout: <LogOut size={18} />,
  arrowLeft: <ArrowLeft size={14} />,
  summary: <Sparkles size={18} />,
  time: <Clock size={18} />,
  activity: <BarChart3 size={18} />,
  quiz: <Brain size={18} />,
  flashcards: <BookOpen size={18} />,
  qb: <FileQuestion size={18} />,
  weak: <Target size={18} />,
};

const StudyInsights = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('overall');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const userName = localStorage.getItem('username');
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    
    const profile = localStorage.getItem('userProfile');
    if (profile) {
      try {
        const parsed = JSON.parse(profile);
        if (parsed.showStudyInsights === false) {
          navigate('/dashboard-cerbyl', { replace: true });
          return;
        }
      } catch (e) { /* silenced */ }
    }
    
    loadComprehensiveInsights();
  }, [timeRange]);

  const loadComprehensiveInsights = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await queuedAIJsonFetch(`/study_insights/comprehensive?user_id=${userName}&time_range=${timeRange}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setInsights(data);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.detail || `Error: ${response.status}`);
      }
    } catch (err) {
      setError(err.message || 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  };

  const handleTileMove = useCallback((e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = x / rect.width - 0.5;
    const cy = y / rect.height - 0.5;
    card.style.setProperty('--mx', `${x}px`);
    card.style.setProperty('--my', `${y}px`);
    card.style.setProperty('--rx', `${(-cy * 7).toFixed(2)}deg`);
    card.style.setProperty('--ry', `${(cx * 9).toFixed(2)}deg`);
  }, []);

  const handleTileLeave = useCallback((e) => {
    const card = e.currentTarget;
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  }, []);

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const getDisplayName = () => {
    const profile = localStorage.getItem('userProfile');
    if (profile) {
      try {
        const parsed = JSON.parse(profile);
        if (parsed.firstName) return parsed.firstName;
        if (parsed.first_name) return parsed.first_name;
      } catch (e) { /* silenced */ }
    }
    if (userName && userName.includes('@')) {
      return userName.split('@')[0];
    }
    return userName || 'there';
  };

  if (loading) {
    return (
      <div className="si-page">
        <div className="shc-topbar">
          <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
          <div className="shc-topbar-right">
            <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
          </div>
        </div>
        <div className="si-loading">
          <span className="si-loading-text">ANALYZING YOUR STUDY DATA</span>
          <div className="si-spinner">
            <div className="si-spinner-cube"></div>
            <div className="si-spinner-cube"></div>
            <div className="si-spinner-cube"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="si-page">
        <div className="shc-topbar">
          <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
          <div className="shc-topbar-right">
            <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
          </div>
        </div>
        <div className="si-error">
          <p>Unable to load insights</p>
          {error && <p className="si-error-detail">{error}</p>}
          <button className="si-btn" onClick={loadComprehensiveInsights}>Retry</button>
          <button className="si-btn" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
        </div>
      </div>
    );
  }

  
  const hasData = insights && (
    (insights.time_stats && (insights.time_stats.weekly_study_minutes > 0 || insights.time_stats.day_streak > 0)) ||
    (insights.flashcards && insights.flashcards.total_cards > 0) ||
    (insights.notes && insights.notes.total_notes > 0) ||
    (insights.weak_areas && insights.weak_areas.length > 0)
  );

  return (
    <div className="si-page">
      <div className="shc-topbar">
        <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
        <div className="shc-topbar-right">
          <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
        </div>
      </div>
      <div className="si-qb-body">
        <div className={`si-qb-shell ${sidebarCollapsed ? 'si-qb-shell--collapsed' : ''}`}>
          <aside className={`si-qb-sidebar ${sidebarCollapsed ? 'si-qb-sidebar--collapsed' : ''}`} aria-label="Study Insights navigation">
            {sidebarCollapsed ? (
              <div className="si-qb-collapsed-strip">
                <button className="si-qb-strip-btn si-qb-strip-logo" data-tip="Open sidebar" onClick={() => setSidebarCollapsed(false)} type="button">
                  cb
                </button>
                <button className="si-qb-strip-btn" data-tip="Summary" onClick={() => { setSidebarCollapsed(false); scrollToSection('si-section-summary'); }} type="button">
                  {SI_ICONS.summary}
                </button>
                <button className="si-qb-strip-btn" data-tip="Study Time" onClick={() => { setSidebarCollapsed(false); scrollToSection('si-section-time'); }} type="button">
                  {SI_ICONS.time}
                </button>
                <button className="si-qb-strip-btn" data-tip="Weekly Activity" onClick={() => { setSidebarCollapsed(false); scrollToSection('si-section-activity'); }} type="button">
                  {SI_ICONS.activity}
                </button>
                <button className="si-qb-strip-btn" data-tip="Quiz Performance" onClick={() => { setSidebarCollapsed(false); scrollToSection('si-section-quiz'); }} type="button">
                  {SI_ICONS.quiz}
                </button>
                <button className="si-qb-strip-btn" data-tip="Flashcard Mastery" onClick={() => { setSidebarCollapsed(false); scrollToSection('si-section-flashcards'); }} type="button">
                  {SI_ICONS.flashcards}
                </button>
                <button className="si-qb-strip-btn" data-tip="Weak Areas" onClick={() => { setSidebarCollapsed(false); scrollToSection('si-section-weak'); }} type="button">
                  {SI_ICONS.weak}
                </button>
                <button className="si-qb-strip-btn" data-tip="Question Bank" onClick={() => { setSidebarCollapsed(false); scrollToSection('si-section-qb'); }} type="button">
                  {SI_ICONS.qb}
                </button>
                <div className="si-qb-strip-spacer" />
                <button className="si-qb-strip-btn" data-tip="AI Chat" onClick={() => navigate('/ai-chat')} type="button">
                  {SI_ICONS.chat}
                </button>
                <button className="si-qb-strip-btn" data-tip="Dashboard" onClick={() => navigate('/dashboard-cerbyl')} type="button">
                  {SI_ICONS.home}
                </button>
                <button
                  className="si-qb-strip-btn"
                  data-tip="Logout"
                  onClick={() => {
                    localStorage.removeItem('token');
                    localStorage.removeItem('username');
                    navigate('/');
                  }}
                  type="button"
                >
                  {SI_ICONS.logout}
                </button>
              </div>
            ) : (
            <>
              <div className="si-qb-side-brand">
                <div className="si-qb-brand-wrap">
                  <div className="si-qb-brand">cerbyl</div>
                  <div className="si-qb-current-title">Study Insights</div>
                </div>
                <button
                  className="si-qb-side-close-btn"
                  onClick={() => setSidebarCollapsed(true)}
                  title="Close sidebar"
                  aria-label="Close study insights sidebar"
                  type="button"
                >
                  {SI_ICONS.arrowLeft}
                </button>
              </div>

              <div className="si-qb-side-block">
                <div className="si-qb-side-label">Time Range</div>
                <nav className="si-qb-view-nav" aria-label="Time range filters">
                  <button className={`si-qb-view-link ${timeRange === 'overall' ? 'si-qb-view-link--active' : ''}`} onClick={() => setTimeRange('overall')} type="button">
                    {SI_ICONS.time}
                    <span>Overall</span>
                  </button>
                  <button className={`si-qb-view-link ${timeRange === 'weekly' ? 'si-qb-view-link--active' : ''}`} onClick={() => setTimeRange('weekly')} type="button">
                    {SI_ICONS.time}
                    <span>This Week</span>
                  </button>
                  <button className={`si-qb-view-link ${timeRange === 'monthly' ? 'si-qb-view-link--active' : ''}`} onClick={() => setTimeRange('monthly')} type="button">
                    {SI_ICONS.time}
                    <span>This Month</span>
                  </button>
                </nav>
              </div>

              <div className="si-qb-side-block si-qb-side-block--grow">
                <div className="si-qb-side-label">Sections</div>
                <nav className="si-qb-view-nav" aria-label="Insight sections">
                  <button className="si-qb-view-link" onClick={() => scrollToSection('si-section-summary')} type="button">
                    {SI_ICONS.summary}
                    <span>AI Summary</span>
                  </button>
                  <button className="si-qb-view-link" onClick={() => scrollToSection('si-section-time')} type="button">
                    {SI_ICONS.time}
                    <span>Study Time</span>
                  </button>
                  <button className="si-qb-view-link" onClick={() => scrollToSection('si-section-activity')} type="button">
                    {SI_ICONS.activity}
                    <span>Weekly Activity</span>
                  </button>
                  <button className="si-qb-view-link" onClick={() => scrollToSection('si-section-quiz')} type="button">
                    {SI_ICONS.quiz}
                    <span>Quiz Performance</span>
                  </button>
                  <button className="si-qb-view-link" onClick={() => scrollToSection('si-section-flashcards')} type="button">
                    {SI_ICONS.flashcards}
                    <span>Flashcard Mastery</span>
                  </button>
                  <button className="si-qb-view-link" onClick={() => scrollToSection('si-section-weak')} type="button">
                    {SI_ICONS.weak}
                    <span>Weak Areas</span>
                  </button>
                  <button className="si-qb-view-link" onClick={() => scrollToSection('si-section-qb')} type="button">
                    {SI_ICONS.qb}
                    <span>Question Bank</span>
                  </button>
                </nav>
              </div>

              <div className="si-qb-side-actions">
                <button
                  className="si-qb-action-btn si-qb-action-btn--ghost"
                  onClick={() => navigate('/dashboard-cerbyl')}
                  type="button"
                >
                  {SI_ICONS.home}
                  <span>Dashboard</span>
                </button>
                <button
                  className="si-qb-action-btn si-qb-action-btn--ghost"
                  onClick={() => navigate('/ai-chat')}
                  type="button"
                >
                  {SI_ICONS.chat}
                  <span>AI Chat</span>
                </button>
                <button
                  className="si-qb-action-btn si-qb-action-btn--ghost"
                  onClick={() => {
                    localStorage.removeItem('token');
                    localStorage.removeItem('username');
                    navigate('/');
                  }}
                  type="button"
                >
                  {SI_ICONS.logout}
                  <span>Logout</span>
                </button>
              </div>
            </>
            )}
          </aside>

          <main className="si-main si-qb-main">
        <div className="si-bento-grid">
          <div className="si-bento si-summary" id="si-section-summary" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
            <div className="cb-tile-texture" />
            <span className="view-kicker si-bento-title">AI SUMMARY</span>
            <p className="si-summary-text">{insights.ai_summary}</p>
          </div>

          <div className="si-bento si-time-stats" id="si-section-time" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
            <div className="cb-tile-texture" />
            <span className="view-kicker si-bento-title">STUDY TIME</span>
            <div className="si-stats-grid">
              <div className="si-stat">
                <div className="si-stat-value">{insights.time_stats?.weekly_study_minutes || 0}</div>
                <div className="si-stat-label">Minutes This Week</div>
              </div>
              <div className="si-stat">
                <div className="si-stat-value">{insights.time_stats?.day_streak || 0}</div>
                <div className="si-stat-label">Day Streak</div>
              </div>
              <div className="si-stat">
                <div className="si-stat-value">{insights.time_stats?.total_points || 0}</div>
                <div className="si-stat-label">Total Points</div>
              </div>
            </div>
          </div>

          <div className="si-bento si-activity" id="si-section-activity" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
            <div className="cb-tile-texture" />
            <span className="view-kicker si-bento-title">WEEKLY ACTIVITY</span>
            <div className="si-activity-list">
              <div className="si-activity-row">
                <span className="si-activity-label">AI Chats</span>
                <span className="si-activity-value">{insights.activity_breakdown?.ai_chats || 0}</span>
              </div>
              <div className="si-activity-row">
                <span className="si-activity-label">Quizzes Completed</span>
                <span className="si-activity-value">{insights.activity_breakdown?.quizzes_completed || 0}</span>
              </div>
              <div className="si-activity-row">
                <span className="si-activity-label">Flashcards Reviewed</span>
                <span className="si-activity-value">{insights.activity_breakdown?.flashcards_reviewed || 0}</span>
              </div>
              <div className="si-activity-row">
                <span className="si-activity-label">Questions Answered</span>
                <span className="si-activity-value">{insights.activity_breakdown?.questions_answered || 0}</span>
              </div>
              <div className="si-activity-row">
                <span className="si-activity-label">Notes Created</span>
                <span className="si-activity-value">{insights.activity_breakdown?.notes_created || 0}</span>
              </div>
            </div>
          </div>

          <div className="si-bento si-quiz" id="si-section-quiz" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
            <div className="cb-tile-texture" />
            <span className="view-kicker si-bento-title">QUIZ PERFORMANCE</span>
            {insights.quizzes?.total_quizzes > 0 ? (
              <>
                <div className="si-quiz-summary">
                  <div className="si-quiz-main">
                    <div className="si-quiz-score">{insights.quizzes.average_score}%</div>
                    <div className="si-quiz-label">Average Score</div>
                  </div>
                  <div className="si-quiz-side">
                    <div className="si-quiz-count">{insights.quizzes.total_quizzes}</div>
                    <div className="si-quiz-label">Quizzes Taken</div>
                  </div>
                </div>
                <div className="si-diff-grid">
                  <div className="si-diff">
                    <span className="si-diff-label">Easy</span>
                    <span className="si-diff-score">{insights.quizzes.by_difficulty?.easy?.average || 0}%</span>
                  </div>
                  <div className="si-diff">
                    <span className="si-diff-label">Medium</span>
                    <span className="si-diff-score">{insights.quizzes.by_difficulty?.intermediate?.average || 0}%</span>
                  </div>
                  <div className="si-diff">
                    <span className="si-diff-label">Hard</span>
                    <span className="si-diff-score">{insights.quizzes.by_difficulty?.hard?.average || 0}%</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="si-empty">
                <p className="si-empty-text">No quizzes completed yet</p>
                <button className="si-btn-small" onClick={() => navigate('/quiz-hub')}>Take a Quiz</button>
              </div>
            )}
          </div>

          <div className="si-bento si-flashcards" id="si-section-flashcards" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
            <div className="cb-tile-texture" />
            <span className="view-kicker si-bento-title">FLASHCARD MASTERY</span>
            {insights.flashcards?.total > 0 ? (
              <>
                <div className="si-fc-stats">
                  <div className="si-fc-stat">
                    <div className="si-fc-value">{insights.flashcards.total}</div>
                    <div className="si-fc-label">Total Cards</div>
                  </div>
                  <div className="si-fc-stat">
                    <div className="si-fc-value">{insights.flashcards.mastered}</div>
                    <div className="si-fc-label">Mastered</div>
                  </div>
                  <div className="si-fc-stat">
                    <div className="si-fc-value">{insights.flashcards.mastery_rate}%</div>
                    <div className="si-fc-label">Mastery Rate</div>
                  </div>
                </div>
                {insights.flashcards.struggling && insights.flashcards.struggling.length > 0 && (
                  <div className="si-struggling">
                    <div className="si-struggling-title">Needs Practice:</div>
                    {insights.flashcards.struggling.slice(0, 3).map((card, idx) => (
                      <div key={idx} className="si-struggling-card">
                        <div className="si-card-question">{card.question}</div>
                        <div className="si-card-accuracy">{card.accuracy}% accuracy</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="si-empty">
                <p className="si-empty-text">No flashcards created yet</p>
                <button className="si-btn-small" onClick={() => navigate('/flashcards')}>Create Flashcards</button>
              </div>
            )}
          </div>

          <div className="si-bento si-weak" id="si-section-weak" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
            <div className="cb-tile-texture" />
            <span className="view-kicker si-bento-title">WEAK AREAS TO IMPROVE</span>
            {insights.weak_areas && insights.weak_areas.length > 0 ? (
              <div className="si-weak-list">
                {insights.weak_areas.slice(0, 5).map((area, idx) => (
                  <div key={idx} className="si-weak-row">
                    <div className="si-weak-info">
                      <div className="si-weak-topic">{area.topic}</div>
                      {area.subtopic && <div className="si-weak-subtopic">{area.subtopic}</div>}
                    </div>
                    <div className="si-weak-stats">
                      <div className="si-weak-accuracy" style={{
                        color: area.accuracy < 50 ? '#ef4444' : area.accuracy < 70 ? '#f59e0b' : '#10b981'
                      }}>
                        {area.accuracy}%
                      </div>
                      <div className="si-weak-priority">Priority: {area.priority}/10</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="si-empty">
                <p className="si-empty-text">No weak areas identified yet</p>
                <p className="si-empty-hint">Complete quizzes to track your progress</p>
              </div>
            )}
          </div>

          {insights.quizzes?.recent_quizzes && insights.quizzes.recent_quizzes.length > 0 && (
            <div className="si-bento si-recent-quizzes" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
              <div className="cb-tile-texture" />
              <span className="view-kicker si-bento-title">RECENT QUIZ RESULTS</span>
              <div className="si-quiz-list">
                {insights.quizzes.recent_quizzes.slice(0, 5).map((quiz, idx) => (
                  <div key={idx} className="si-quiz-row">
                    <div className="si-quiz-info">
                      <div className="si-quiz-title">{quiz.title || 'Untitled Quiz'}</div>
                      <div className="si-quiz-meta">{quiz.difficulty} • {quiz.question_count} questions</div>
                    </div>
                    <div className="si-quiz-badge" style={{
                      backgroundColor: quiz.score >= 80 ? '#10b981' : quiz.score >= 60 ? '#f59e0b' : '#ef4444'
                    }}>
                      {quiz.score}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="si-bento si-qb" id="si-section-qb" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
            <div className="cb-tile-texture" />
            <span className="view-kicker si-bento-title">QUESTION BANK</span>
            {insights.question_bank?.total_questions > 0 ? (
              <div className="si-qb-stats">
                <div className="si-qb-stat">
                  <div className="si-qb-value">{insights.question_bank.total_questions}</div>
                  <div className="si-qb-label">Total Questions</div>
                </div>
                <div className="si-qb-stat">
                  <div className="si-qb-value">{insights.question_bank.completed_questions}</div>
                  <div className="si-qb-label">Completed</div>
                </div>
                <div className="si-qb-stat">
                  <div className="si-qb-value">{insights.question_bank.average_accuracy}%</div>
                  <div className="si-qb-label">Accuracy</div>
                </div>
              </div>
            ) : (
              <div className="si-empty">
                <p className="si-empty-text">No question sets yet</p>
                <button className="si-btn-small" onClick={() => navigate('/question-bank')}>Create Questions</button>
              </div>
            )}
          </div>

          {insights.session_data?.specific_topics && insights.session_data.specific_topics.length > 0 && (
            <div className="si-bento si-topics" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
              <div className="cb-tile-texture" />
              <span className="view-kicker si-bento-title">TOPICS STUDIED</span>
              <div className="si-topics-list">
                {insights.session_data.specific_topics.slice(0, 6).map((topic, idx) => (
                  <div key={idx} className="si-topic-row" onClick={() => navigate('/ai-chat', {
                    state: { initialMessage: `Help me practice ${topic.name}` }
                  })}>
                    <span className="si-topic-name">{topic.name}</span>
                    <span className="si-topic-count">{topic.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {insights.notes?.recent_notes && insights.notes.recent_notes.length > 0 && (
            <div className="si-bento si-notes" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
              <div className="cb-tile-texture" />
              <span className="view-kicker si-bento-title">RECENT NOTES</span>
              <div className="si-notes-list">
                {insights.notes.recent_notes.map((note) => (
                  <div key={note.id} className="si-note-row" onClick={() => navigate(`/notes/editor/${note.id}`)}>
                    <span className="si-note-title">{note.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasData && (
            <div className="si-bento si-empty-state" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
              <div className="cb-tile-texture" />
              <span className="view-kicker si-bento-title">GET STARTED</span>
              <p className="si-empty-text">Start studying to see your comprehensive insights here.</p>
              <button className="si-btn-large" onClick={() => navigate('/ai-chat')}>START STUDYING</button>
            </div>
          )}
        </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default StudyInsights;
