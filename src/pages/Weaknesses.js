import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Target, Brain, MessageSquare,
  CheckCircle, Activity, Zap, RefreshCw, Cpu,
  LayoutDashboard, TrendingUp, Clock, FileText, Layers, MessageCircle, BookOpen
} from 'lucide-react';
import './Weaknesses.css';
import { API_URL } from '../config';
import { queuedAIJsonFetch } from '../services/aiJobService';
import WeaknessTracker from '../components/WeaknessTracker/WeaknessTracker';
import RLInsights from '../components/RLInsights/RLInsights';

const Weaknesses = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const userName = localStorage.getItem('username');

  const [activeView, setActiveView] = useState('weak-areas');
  const [loading, setLoading] = useState(true);
  const [weakAreasData, setWeakAreasData] = useState(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activityFeed, setActivityFeed] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [topicsHub, setTopicsHub] = useState(null);
  const [topicsHubLoading, setTopicsHubLoading] = useState(false);
  const [topicsHubFilter, setTopicsHubFilter] = useState('all');

  const loadTopicsHub = async () => {
    setTopicsHubLoading(true);
    try {
      const res = await fetch(`${API_URL}/weakness-practice/mastery-overview?user_id=${encodeURIComponent(userName)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setTopicsHub(await res.json());
    } catch (e) { /* silenced */ } finally {
      setTopicsHubLoading(false);
    }
  };

  const loadActivityFeed = async () => {
    setActivityLoading(true);
    try {
      const res = await fetch(`${API_URL}/study_insights/activity_feed?user_id=${userName}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setActivityFeed(await res.json());
    } catch (e) { /* silenced */ } finally {
      setActivityLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    loadWeakAreas();
  }, []);

  const loadWeakAreas = async () => {
    setLoading(true);
    try {
      const response = await queuedAIJsonFetch(`/study_insights/strengths_weaknesses?user_id=${userName}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setWeakAreasData(data);
      }
    } catch (error) {
      console.error('Error loading weak areas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTopicClick = (topic) => {
    navigate(`/weakness-tips/${encodeURIComponent(topic)}`);
  };

  const getFilteredAreas = () => {
    if (!weakAreasData?.weak_areas) return [];
    if (filterCategory === 'all') {
      return [
        ...(weakAreasData.weak_areas.critical || []),
        ...(weakAreasData.weak_areas.needs_practice || []),
        ...(weakAreasData.weak_areas.improving || [])
      ];
    }
    return weakAreasData.weak_areas[filterCategory] || [];
  };

  const criticalCount = weakAreasData?.summary?.critical_count || 0;
  const needsPracticeCount = weakAreasData?.summary?.needs_practice_count || 0;
  const improvingCount = weakAreasData?.summary?.improving_count || 0;
  const totalCount = criticalCount + needsPracticeCount + improvingCount;

  if (loading) {
    return (
      <div className="wk-container">
        <div className="wk-loading">
          <div className="wk-loading-dots">
            <span /><span /><span />
          </div>
          <p>ANALYZING YOUR PERFORMANCE</p>
        </div>
      </div>
    );
  }

  const filteredAreas = getFilteredAreas();

  return (
    <div className="wk-container">
      <svg className="geo-bg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <circle cx="600" cy="400" r="360" fill="none" stroke="currentColor" strokeWidth="1"/>
        <circle cx="600" cy="400" r="260" fill="none" stroke="currentColor" strokeWidth="0.8"/>
        <circle cx="600" cy="400" r="168" fill="none" stroke="currentColor" strokeWidth="0.7"/>
        <circle cx="600" cy="400" r="90" fill="none" stroke="currentColor" strokeWidth="0.6"/>
        <line x1="600" y1="0" x2="600" y2="800" stroke="currentColor" strokeWidth="0.5"/>
        <line x1="0" y1="400" x2="1200" y2="400" stroke="currentColor" strokeWidth="0.5"/>
        <line x1="0" y1="800" x2="500" y2="0" stroke="currentColor" strokeWidth="0.4"/>
        <line x1="1200" y1="0" x2="700" y2="800" stroke="currentColor" strokeWidth="0.4"/>
        <circle cx="600" cy="40" r="5" fill="currentColor"/>
        <circle cx="600" cy="760" r="5" fill="currentColor"/>
        <circle cx="240" cy="400" r="5" fill="currentColor"/>
        <circle cx="960" cy="400" r="5" fill="currentColor"/>
        <circle cx="345" cy="146" r="3.5" fill="currentColor"/>
        <circle cx="855" cy="654" r="3.5" fill="currentColor"/>
        <circle cx="855" cy="146" r="3.5" fill="currentColor"/>
        <circle cx="345" cy="654" r="3.5" fill="currentColor"/>
        <rect x="24" y="24" width="72" height="72" fill="none" stroke="currentColor" strokeWidth="0.8"/>
        <rect x="44" y="44" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <circle cx="60" cy="60" r="3" fill="currentColor"/>
        <rect x="1104" y="704" width="72" height="72" fill="none" stroke="currentColor" strokeWidth="0.8"/>
        <rect x="1124" y="724" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <circle cx="1140" cy="740" r="3" fill="currentColor"/>
        <circle cx="120" cy="200" r="2" fill="currentColor"/>
        <circle cx="160" cy="160" r="1.5" fill="currentColor"/>
        <circle cx="200" cy="200" r="2" fill="currentColor"/>
        <circle cx="160" cy="240" r="1.5" fill="currentColor"/>
        <circle cx="1080" cy="600" r="2" fill="currentColor"/>
        <circle cx="1040" cy="640" r="1.5" fill="currentColor"/>
        <circle cx="1000" cy="600" r="2" fill="currentColor"/>
        <circle cx="1040" cy="560" r="1.5" fill="currentColor"/>
      </svg>

      <div className="wk-topbar">
        <div className="wk-topbar-tagline"><span>LEARNING,</span> UNIFIED</div>
      </div>

      <div className={`wk-layout ${sidebarCollapsed ? 'wk-layout-collapsed' : ''}`}>
        {sidebarCollapsed ? (
          <aside className="wk-sidebar-collapsed">
            <button
              className="wk-side-expand-btn"
              type="button"
              title="Expand sidebar"
              onClick={() => setSidebarCollapsed(false)}
            >
              <ChevronRight size={14} />
            </button>
            <button className="wk-side-icon-btn" title="Weak Areas" onClick={() => { setSidebarCollapsed(false); setActiveView('weak-areas'); }}>
              <Activity size={16} />
            </button>
            <button className="wk-side-icon-btn" title="Topics Hub" onClick={() => { setSidebarCollapsed(false); setActiveView('topics-hub'); if (!topicsHub) loadTopicsHub(); }}>
              <BookOpen size={16} />
            </button>
            <button className="wk-side-icon-btn" title="Intelligence" onClick={() => { setSidebarCollapsed(false); setActiveView('intelligence'); }}>
              <Cpu size={16} />
            </button>
            <button className="wk-side-icon-btn" title="How I Learn" onClick={() => { setSidebarCollapsed(false); setActiveView('how-i-learn'); }}>
              <Brain size={16} />
            </button>
            <button className="wk-side-icon-btn" title="Activity" onClick={() => { setSidebarCollapsed(false); setActiveView('activity'); if (!activityFeed) loadActivityFeed(); }}>
              <Clock size={16} />
            </button>
            <button className="wk-side-icon-btn" title="Dashboard" onClick={() => navigate('/dashboard-cerbyl')}>
              <LayoutDashboard size={16} />
            </button>
            <button className="wk-side-icon-btn wk-side-icon-btn--accent" title="Dashboard" onClick={() => navigate('/dashboard-cerbyl')}>
              <LayoutDashboard size={16} />
            </button>
          </aside>
        ) : (
          <aside className="wk-sidebar">
            <button
              className="wk-side-collapse-btn"
              type="button"
              title="Hide sidebar"
              aria-label="Hide Weak Areas sidebar"
              onClick={() => setSidebarCollapsed(true)}
            >
              <ChevronLeft size={14} />
            </button>
            <nav className="wk-sidebar-nav">
              <button
                className={`wk-sidebar-item ${activeView === 'weak-areas' ? 'active' : ''}`}
                onClick={() => setActiveView('weak-areas')}
              >
                <Activity size={16} />
                <span>Weak Areas</span>
                {totalCount > 0 && <span className="wk-count">{totalCount}</span>}
              </button>
              <button
                className={`wk-sidebar-item ${activeView === 'topics-hub' ? 'active' : ''}`}
                onClick={() => { setActiveView('topics-hub'); if (!topicsHub) loadTopicsHub(); }}
              >
                <BookOpen size={16} />
                <span>Topics Hub</span>
                {topicsHub?.total_topics > 0 && <span className="wk-count">{topicsHub.total_topics}</span>}
              </button>
              <button
                className={`wk-sidebar-item ${activeView === 'intelligence' ? 'active' : ''}`}
                onClick={() => setActiveView('intelligence')}
              >
                <Cpu size={16} />
                <span>Intelligence</span>
              </button>
              <button
                className={`wk-sidebar-item ${activeView === 'how-i-learn' ? 'active' : ''}`}
                onClick={() => setActiveView('how-i-learn')}
              >
                <Brain size={16} />
                <span>How I Learn</span>
              </button>
              <button
                className={`wk-sidebar-item ${activeView === 'activity' ? 'active' : ''}`}
                onClick={() => { setActiveView('activity'); if (!activityFeed) loadActivityFeed(); }}
              >
                <Clock size={16} />
                <span>Activity</span>
              </button>
              <button className="wk-sidebar-item" onClick={() => navigate('/dashboard-cerbyl')}>
                <LayoutDashboard size={16} />
                <span>Dashboard</span>
              </button>
            </nav>

            <div className="wk-sidebar-actions">
              <button className="wk-nav-btn" onClick={loadWeakAreas}>
                <RefreshCw size={15} />
                Refresh
              </button>
              <button className="wk-nav-btn wk-nav-btn-accent" onClick={() => navigate('/dashboard-cerbyl')}>
                <LayoutDashboard size={15} />
                Dashboard
              </button>
            </div>

            {activeView === 'weak-areas' && totalCount > 0 && (
              <div className="wk-sidebar-stats">
                {criticalCount > 0 && (
                  <div className="wk-stat-pill wk-stat-critical">
                    <span className="wk-stat-num">{criticalCount}</span>
                    <span className="wk-stat-lbl">Critical</span>
                  </div>
                )}
                {needsPracticeCount > 0 && (
                  <div className="wk-stat-pill wk-stat-practice">
                    <span className="wk-stat-num">{needsPracticeCount}</span>
                    <span className="wk-stat-lbl">Practice</span>
                  </div>
                )}
                {improvingCount > 0 && (
                  <div className="wk-stat-pill wk-stat-improving">
                    <span className="wk-stat-num">{improvingCount}</span>
                    <span className="wk-stat-lbl">Improving</span>
                  </div>
                )}
              </div>
            )}
          </aside>
        )}

        <main className="wk-main">
          {activeView === 'weak-areas' && (
            <>
              <div className="wk-view-header">
                <span className="wk-view-kicker">Performance Analysis</span>
                <h2 className="wk-view-title">Weak Areas</h2>
                <p className="wk-view-sub">
                  {totalCount > 0
                    ? `${totalCount} area${totalCount !== 1 ? 's' : ''} identified across your activity`
                    : 'No weak areas detected'}
                </p>
              </div>

              {totalCount > 0 && (
                <div className="wk-filter-row">
                  {[
                    { key: 'all', label: 'All Areas', count: null },
                    { key: 'critical', label: 'Critical', count: criticalCount },
                    { key: 'needs_practice', label: 'Needs Practice', count: needsPracticeCount },
                    { key: 'improving', label: 'Improving', count: improvingCount },
                  ].map(({ key, label, count }) => (
                    <button
                      key={key}
                      className={`wk-filter-pill ${filterCategory === key ? 'active' : ''} wk-filter-${key}`}
                      onClick={() => setFilterCategory(key)}
                    >
                      {label}
                      {count !== null && <span className="wk-filter-count">{count}</span>}
                    </button>
                  ))}
                </div>
              )}

              {filteredAreas.length === 0 ? (
                <div className="wk-empty">
                  <CheckCircle size={56} />
                  <h3>No weak areas detected</h3>
                  <p>You're performing well across all tracked topics. Keep learning to build your profile.</p>
                  <button className="wk-cta-btn" onClick={() => navigate('/ai-chat')}>
                    <Zap size={16} />
                    Start Learning
                  </button>
                </div>
              ) : (
                <div className="wk-bento-grid">
                  {filteredAreas.map((area, idx) => (
                    <WeaknessCard
                      key={idx}
                      area={area}
                      onClick={() => handleTopicClick(area.topic)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {activeView === 'topics-hub' && (
            <>
              <div className="wk-view-header">
                <span className="wk-view-kicker">Everything You've Learned</span>
                <h2 className="wk-view-title">Topics Hub</h2>
                <p className="wk-view-sub">
                  {topicsHub?.total_topics > 0
                    ? `${topicsHub.total_topics} topic${topicsHub.total_topics !== 1 ? 's' : ''} tracked · ${topicsHub.overall_mastery}% overall mastery`
                    : 'Every topic you have studied, with mastery, accuracy, and practice history in one place'}
                </p>
              </div>

              {topicsHubLoading ? (
                <div className="wk-loading"><div className="wk-loading-dots"><span /><span /><span /></div><p>LOADING TOPICS</p></div>
              ) : !topicsHub || topicsHub.total_topics === 0 ? (
                <div className="wk-empty">
                  <BookOpen size={56} />
                  <h3>No topics tracked yet</h3>
                  <p>Study with quizzes, flashcards, or chat to start building your topic mastery profile.</p>
                  <button className="wk-cta-btn" onClick={() => navigate('/ai-chat')}>
                    <Zap size={16} />
                    Start Learning
                  </button>
                </div>
              ) : (
                <>
                  <div className="wk-filter-row">
                    {[
                      { key: 'all', label: 'All Topics', count: topicsHub.total_topics },
                      { key: 'mastered', label: 'Mastered', count: topicsHub.mastered_topics },
                      { key: 'progressing', label: 'Progressing', count: topicsHub.progressing_topics },
                      { key: 'needs_work', label: 'Needs Work', count: topicsHub.needs_work_topics },
                    ].map(({ key, label, count }) => (
                      <button
                        key={key}
                        className={`wk-filter-pill ${topicsHubFilter === key ? 'active' : ''} wk-filter-${key === 'needs_work' ? 'critical' : key === 'progressing' ? 'needs_practice' : key === 'mastered' ? 'improving' : 'all'}`}
                        onClick={() => setTopicsHubFilter(key)}
                      >
                        {label}
                        <span className="wk-filter-count">{count}</span>
                      </button>
                    ))}
                  </div>

                  <div className="wk-bento-grid">
                    {(topicsHubFilter === 'all'
                      ? [...topicsHub.topic_breakdown.mastered, ...topicsHub.topic_breakdown.progressing, ...topicsHub.topic_breakdown.needs_work]
                      : topicsHub.topic_breakdown[topicsHubFilter] || []
                    ).map((t, idx) => (
                      <TopicHubCard key={idx} topic={t} onClick={() => handleTopicClick(t.topic)} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {activeView === 'intelligence' && (
            <>
              <div className="wk-view-header">
                <span className="wk-view-kicker">AI-Powered Insights</span>
                <h2 className="wk-view-title">Intelligence</h2>
                <p className="wk-view-sub">Deep analysis of your learning patterns and concept mastery</p>
              </div>
              <div className="wk-component-wrapper">
                <WeaknessTracker userId={userName} token={token} onNavigate={navigate} />
              </div>
            </>
          )}

          {activeView === 'how-i-learn' && (
            <>
              <div className="wk-view-header">
                <span className="wk-view-kicker">Adaptive Strategy</span>
                <h2 className="wk-view-title">How I Learn</h2>
                <p className="wk-view-sub">Your personalized teaching strategy profile, powered by reinforcement learning</p>
              </div>
              <div className="wk-component-wrapper">
                <RLInsights userName={userName} token={token} />
              </div>
            </>
          )}

          {activeView === 'activity' && (
            <>
              <div className="wk-view-header">
                <span className="wk-view-kicker">Recent Activity</span>
                <h2 className="wk-view-title">Activity Feed</h2>
                <p className="wk-view-sub">Everything you've studied — chats, notes, flashcards, quizzes</p>
              </div>
              {activityLoading ? (
                <div className="wk-loading"><div className="wk-loading-dots"><span /><span /><span /></div><p>LOADING ACTIVITY</p></div>
              ) : activityFeed?.activities?.length > 0 ? (
                <div className="wk-activity-feed">
                  {activityFeed.activities.map((act, i) => <ActivityRow key={i} act={act} />)}
                </div>
              ) : (
                <div className="wk-empty">
                  <Clock size={32} />
                  <p>No activity yet. Start studying to see your feed here.</p>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default Weaknesses;

// ==================== WEAKNESS CARD ====================

const handleTileMove = (e) => {
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
};

const handleTileLeave = (e) => {
  const card = e.currentTarget;
  card.style.setProperty('--rx', '0deg');
  card.style.setProperty('--ry', '0deg');
};

const WeaknessCard = ({ area, onClick }) => {
  const navigate = useNavigate();
  const cat = area.category;
  const accuracy = area.accuracy ?? 0;

  const catColor = {
    critical: '#ef4444',
    needs_practice: '#f59e0b',
    improving: '#10b981',
  }[cat] || '#6b7280';

  const catLabel = {
    critical: 'Critical',
    needs_practice: 'Needs Practice',
    improving: 'Improving',
  }[cat] || cat;

  const CoverIcon = {
    critical: Target,
    needs_practice: Brain,
    improving: TrendingUp,
  }[cat] || Target;

  const hasMetrics = area.sources?.includes('quiz') || area.sources?.includes('flashcard');
  const correct = (area.total_attempts || 0) - (area.total_wrong || 0);

  return (
    <div className={`wk-card wk-card--${cat}`} onClick={onClick} onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
      <div className="cb-tile-texture" />
      <div
        className="wk-card-cover"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${catColor} 22%, transparent) 0%, color-mix(in srgb, ${catColor} 8%, transparent) 100%)`,
        }}
      >
        <div className="wk-card-cover-icon" style={{ color: catColor }}>
          <CoverIcon size={40} />
        </div>
      </div>

      <div className="wk-card-content">
        <h3 className="wk-card-topic">{area.topic || 'Unknown Topic'}</h3>

        <div className="wk-card-header">
          <div className="wk-card-badges">
            {area.sources?.includes('quiz') && <span className="wk-badge wk-badge--quiz">Quiz</span>}
            {area.sources?.includes('flashcard') && <span className="wk-badge wk-badge--card">Cards</span>}
            {area.sources?.includes('chat') && <span className="wk-badge wk-badge--chat">Chat</span>}
          </div>
          <span className="wk-card-cat" style={{ color: catColor }}>{catLabel}</span>
        </div>

        {hasMetrics && (
          <div className="wk-card-bar-wrap">
            <div className="wk-card-bar-track">
              <div
                className="wk-card-bar-fill"
                style={{ width: `${accuracy}%`, background: catColor }}
              />
            </div>
            <span className="wk-card-pct" style={{ color: catColor }}>{accuracy}%</span>
          </div>
        )}

        {hasMetrics && (
          <div className="wk-card-metrics">
            <div className="wk-metric">
              <span className="wk-metric-val" style={{ color: '#10b981' }}>{correct}</span>
              <span className="wk-metric-lbl">Correct</span>
            </div>
            <div className="wk-metric">
              <span className="wk-metric-val" style={{ color: '#ef4444' }}>{area.total_wrong || 0}</span>
              <span className="wk-metric-lbl">Wrong</span>
            </div>
            <div className="wk-metric">
              <span className="wk-metric-val">{area.total_attempts || 0}</span>
              <span className="wk-metric-lbl">Attempts</span>
            </div>
          </div>
        )}

        <div className="wk-card-action-row">
          <button
            className="wk-card-btn wk-card-btn--practice"
            onClick={(e) => { e.stopPropagation(); navigate(`/weakness-tips/${encodeURIComponent(area.topic)}`); }}
          >
            Practice
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== TOPIC HUB CARD ====================

const fmtLastPracticed = (iso) => {
  if (!iso) return 'Never practiced';
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
};

const TopicHubCard = ({ topic, onClick }) => {
  const navigate = useNavigate();
  const masteryPct = Math.round((topic.mastery_level || 0) * 100);
  const cat = masteryPct >= 80 ? 'improving' : masteryPct >= 50 ? 'needs_practice' : 'critical';
  const catColor = { critical: '#ef4444', needs_practice: '#f59e0b', improving: '#10b981' }[cat];
  const catLabel = masteryPct >= 80 ? 'Mastered' : masteryPct >= 50 ? 'Progressing' : 'Needs Work';
  const CoverIcon = masteryPct >= 80 ? CheckCircle : masteryPct >= 50 ? Brain : Target;

  return (
    <div className={`wk-card wk-card--${cat}`} onClick={onClick} onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
      <div className="cb-tile-texture" />
      <div
        className="wk-card-cover"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${catColor} 22%, transparent) 0%, color-mix(in srgb, ${catColor} 8%, transparent) 100%)`,
        }}
      >
        <div className="wk-card-cover-icon" style={{ color: catColor }}>
          <CoverIcon size={40} />
        </div>
      </div>

      <div className="wk-card-content">
        <h3 className="wk-card-topic">{topic.topic || 'Unknown Topic'}</h3>

        <div className="wk-card-header">
          <div className="wk-card-badges">
            {(topic.excels_at || []).slice(0, 1).map((s, i) => (
              <span key={i} className="wk-badge wk-badge--card">{s}</span>
            ))}
          </div>
          <span className="wk-card-cat" style={{ color: catColor }}>{catLabel}</span>
        </div>

        <div className="wk-card-bar-wrap">
          <div className="wk-card-bar-track">
            <div className="wk-card-bar-fill" style={{ width: `${masteryPct}%`, background: catColor }} />
          </div>
          <span className="wk-card-pct" style={{ color: catColor }}>{masteryPct}%</span>
        </div>

        <div className="wk-card-metrics">
          <div className="wk-metric">
            <span className="wk-metric-val">{topic.accuracy ?? 0}%</span>
            <span className="wk-metric-lbl">Accuracy</span>
          </div>
          <div className="wk-metric">
            <span className="wk-metric-val">{topic.times_studied || 0}</span>
            <span className="wk-metric-lbl">Sessions</span>
          </div>
          <div className="wk-metric">
            <span className="wk-metric-val">{fmtLastPracticed(topic.last_practiced)}</span>
            <span className="wk-metric-lbl">Last Seen</span>
          </div>
        </div>

        {(topic.struggles_with || []).length > 0 && (
          <p className="wk-evidence">Struggles with: {topic.struggles_with.slice(0, 2).join(', ')}</p>
        )}

        <div className="wk-card-action-row">
          <button
            className="wk-card-btn wk-card-btn--practice"
            onClick={(e) => { e.stopPropagation(); navigate(`/weakness-tips/${encodeURIComponent(topic.topic)}`); }}
          >
            Practice
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== ACTIVITY ROW ====================

const ACTIVITY_ICONS = {
  chat: MessageCircle,
  note: FileText,
  flashcard: Layers,
  quiz: CheckCircle,
  weak_area: Target,
};
const ACTIVITY_COLORS = {
  chat: '#6366f1',
  note: '#3b82f6',
  flashcard: '#8b5cf6',
  quiz: '#10b981',
  weak_area: '#ef4444',
};

const fmtTs = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
};

const ActivityRow = ({ act }) => {
  const Icon = ACTIVITY_ICONS[act.type] || Activity;
  const color = ACTIVITY_COLORS[act.type] || '#6b7280';
  return (
    <div className="wk-act-row">
      <div className="wk-act-icon" style={{ color }}><Icon size={15} /></div>
      <div className="wk-act-body">
        <span className="wk-act-topic">{act.topic}</span>
        {act.detail ? <span className="wk-act-detail">{act.detail}</span> : null}
      </div>
      <div className="wk-act-meta">
        <span className="wk-act-type">{act.type}</span>
        <span className="wk-act-ts">{fmtTs(act.ts)}</span>
      </div>
    </div>
  );
};
