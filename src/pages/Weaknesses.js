import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Target, Brain, MessageSquare,
  CheckCircle, Activity, Zap, RefreshCw, Cpu,
  LayoutDashboard, TrendingUp, Clock, FileText, Layers, MessageCircle, BookOpen
} from 'lucide-react';
import './Weaknesses.css';
import '../components/SocialHubChrome.css';
import { API_URL } from '../config';
import { queuedAIJsonFetch } from '../services/aiJobService';
import WeaknessTracker from '../components/WeaknessTracker/WeaknessTracker';
import RLInsights from '../components/RLInsights/RLInsights';
import GeometricGrid from '../components/GeometricGrid';

const WeakAreasBackdrop = () => (
  <div className="shc-bg-fx" aria-hidden="true">
    <div className="shc-bg-wash" />
    <div className="shc-bg-orb shc-bg-orb--one" />
    <div className="shc-bg-orb shc-bg-orb--two" />
    <GeometricGrid
      className="shc-bg-geo"
      linesClassName="shc-bg-geo-lines"
      numsClassName="shc-bg-geo-nums"
    />
    <div className="shc-bg-grain" />
    <div className="shc-bg-vignette" />
  </div>
);

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
        <WeakAreasBackdrop />
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
      <WeakAreasBackdrop />

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
            <button className="wk-side-icon-btn" title="Intelligence" onClick={() => { setSidebarCollapsed(false); setActiveView('intelligence'); }}>
              <Cpu size={16} />
            </button>
            <button className="wk-side-icon-btn" title="How I Learn" onClick={() => { setSidebarCollapsed(false); setActiveView('how-i-learn'); }}>
              <Brain size={16} />
            </button>
            <button className="wk-side-icon-btn" title="Activity" onClick={() => { setSidebarCollapsed(false); setActiveView('activity'); if (!activityFeed) loadActivityFeed(); }}>
              <Clock size={16} />
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
