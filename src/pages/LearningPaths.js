import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import learningPathService from '../services/learningPathService';
import GeoBackground from '../components/GeoBackground';
import './Flashcards.css';
import './LearningPaths.css';

const LP_ICONS = {
  chevronRight: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  chevronLeft: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  ),
  sparkle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z"/>
    </svg>
  ),
  paths: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="5" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="19" r="2"/>
      <path d="M7 12h8a2 2 0 0 0 2-2V7"/><path d="M7 12h8a2 2 0 0 1 2 2v3"/>
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  book: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  ),
  chevronDown: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  ),
};

const DIFFICULTY_COLORS = {
  beginner: 'linear-gradient(135deg, #1a6b3c 0%, #27ae60dd 100%)',
  intermediate: 'linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 60%, #8B5000) 100%)',
  advanced: 'linear-gradient(135deg, #7b1818 0%, #c0392bdd 100%)',
};

const SUGGESTED_TOPICS = [
  'System design for AI products',
  'React performance architecture',
  'Advanced calculus for ML',
  'Data structures in Python',
];

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
];

const SORTS = [
  { key: 'recent', label: 'Recent' },
  { key: 'progress', label: 'Progress' },
  { key: 'time', label: 'Shortest' },
  { key: 'az', label: 'A–Z' },
];

const LearningPaths = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [activePanel, setActivePanel] = useState('paths');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');

  const [topicPrompt, setTopicPrompt] = useState('');
  const [difficulty, setDifficulty] = useState('intermediate');
  const [pathLength, setPathLength] = useState('medium');
  const [goals, setGoals] = useState('');
  const [difficultyOpen, setDifficultyOpen] = useState(false);
  const [lengthOpen, setLengthOpen] = useState(false);

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

  useEffect(() => { loadPaths(); }, []);

  useEffect(() => {
    if (location.state?.autoGenerate && location.state?.topic) {
      setTopicPrompt(location.state.topic);
      setDifficulty(location.state.difficulty || 'intermediate');
      setPathLength(location.state.length || 'medium');
      setActivePanel('generator');
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const loadPaths = async () => {
    try {
      setLoading(true);
      const response = await learningPathService.getPaths();
      setPaths(response.paths || []);
    } catch (error) {
      console.error('Error loading paths:', error);
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    const active = paths.filter(p => (p.status || 'active') === 'active');
    const completed = paths.filter(p => p.status === 'completed').length;
    const avgProgress = active.length
      ? Math.round(active.reduce((s, p) => s + (p.progress?.completion_percentage || 0), 0) / active.length)
      : 0;
    return { total: paths.length, active: active.length, completed, avgProgress };
  }, [paths]);

  const filteredPaths = useMemo(() => {
    return paths
      .filter(p => statusFilter === 'all' || (p.status || 'active') === statusFilter)
      .sort((a, b) => {
        if (sortBy === 'progress') return (b.progress?.completion_percentage || 0) - (a.progress?.completion_percentage || 0);
        if (sortBy === 'time') return (a.estimated_hours || 0) - (b.estimated_hours || 0);
        if (sortBy === 'az') return (a.title || '').localeCompare(b.title || '');
        return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
      });
  }, [paths, sortBy, statusFilter]);

  const handleCreatePath = async () => {
    const topic = topicPrompt.trim();
    if (!topic) return;
    try {
      setGenerating(true);
      const response = await learningPathService.generatePath(topic, {
        difficulty,
        length: pathLength,
        goals: goals.split('\n').map(g => g.trim()).filter(Boolean),
      });
      if (response.success) {
        setTopicPrompt('');
        setGoals('');
        navigate(`/learning-paths/${response.path_id}`);
      }
    } catch (error) {
      console.error('Error creating path:', error);
    } finally {
      setGenerating(false);
    }
  };

  const handleDeletePath = async (pathId, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this learning path? This cannot be undone.')) return;
    try {
      await learningPathService.deletePath(pathId);
      setPaths(prev => prev.filter(p => p.id !== pathId));
    } catch (error) {
      console.error('Error deleting path:', error);
    }
  };

  return (
    <div className="flashcards-page">
      <GeoBackground />

      {/* Topbar */}
      <div className="fc-qb-topbar">
        <div className="fc-qb-tagline">
          learning, <span style={{ color: 'var(--accent)' }}>unified</span>
        </div>
      </div>

      <div className="fc-layout fc-qb-body">
        <div className={`fc-qb-shell ${sidebarCollapsed ? 'fc-qb-shell--collapsed' : ''}`}>

          {/* ── Sidebar ── */}
          <aside className={`fc-qb-sidebar ${sidebarCollapsed ? 'fc-qb-sidebar--collapsed' : ''}`}>

            {sidebarCollapsed ? (
              /* Collapsed strip */
              <div className="fc-qb-collapsed-strip">
                <button
                  className="fc-qb-strip-btn fc-qb-strip-logo"
                  onClick={() => setSidebarCollapsed(false)}
                  type="button"
                >
                  {LP_ICONS.chevronRight}
                </button>
                <button
                  className={`fc-qb-strip-btn ${activePanel === 'generator' ? 'active' : ''}`}
                  onClick={() => { setSidebarCollapsed(false); setActivePanel('generator'); }}
                  type="button"
                >
                  {LP_ICONS.sparkle}
                </button>
                <button
                  className={`fc-qb-strip-btn ${activePanel === 'paths' ? 'active' : ''}`}
                  onClick={() => { setSidebarCollapsed(false); setActivePanel('paths'); }}
                  type="button"
                >
                  {LP_ICONS.paths}
                </button>
                <div className="fc-qb-strip-spacer" />
                <button
                  className="fc-qb-strip-btn"
                  onClick={() => navigate('/dashboard-cerbyl')}
                  type="button"
                >
                  {LP_ICONS.home}
                </button>
              </div>
            ) : (
              /* Expanded sidebar */
              <>
                {/* Brand */}
                <div className="fc-qb-side-brand">
                  <div className="fc-qb-brand-wrap">
                    <div className="fc-qb-brand">cerbyl</div>
                    <div className="fc-qb-brand-kicker">Learning Paths</div>
                  </div>
                  <button
                    className="fc-qb-side-close-btn"
                    onClick={() => setSidebarCollapsed(true)}
                    type="button"
                  >
                    {LP_ICONS.chevronLeft}
                  </button>
                </div>

                {/* Generate button */}
                <button
                  className="fc-qb-new-btn"
                  onClick={() => setActivePanel('generator')}
                  type="button"
                >
                  {LP_ICONS.sparkle}
                  <span>Generate</span>
                </button>

                {/* Navigation */}
                <div className="fc-qb-side-block fc-qb-side-block--grow">
                  <div className="fc-qb-side-label">Navigation</div>
                  <nav className="fc-qb-view-nav">
                    <button
                      className={`fc-qb-view-link ${activePanel === 'paths' ? 'fc-qb-view-link--active' : ''}`}
                      onClick={() => setActivePanel('paths')}
                      type="button"
                    >
                      {LP_ICONS.paths}
                      <span>My Paths</span>
                      {summary.total > 0 && (
                        <span className="lp-nav-count">{summary.total}</span>
                      )}
                    </button>
                    <button
                      className={`fc-qb-view-link ${activePanel === 'generator' ? 'fc-qb-view-link--active' : ''}`}
                      onClick={() => setActivePanel('generator')}
                      type="button"
                    >
                      {LP_ICONS.sparkle}
                      <span>Generator</span>
                    </button>
                  </nav>
                </div>

                {/* Footer */}
                <div className="fc-qb-side-actions">
                  <button
                    className="fc-qb-action-btn"
                    onClick={() => navigate('/dashboard-cerbyl')}
                    type="button"
                  >
                    {LP_ICONS.home}
                    <span>Dashboard</span>
                  </button>
                </div>
              </>
            )}
          </aside>

          {/* ── Main ── */}
          <main className="fc-main fc-qb-main">

            {/* Generator panel */}
            {activePanel === 'generator' && (
              <div className="fc-content">
                <div className="fc-view-header">
                  <span className="fc-view-kicker">AI-Powered</span>
                  <h2 className="fc-view-title">New Learning Path</h2>
                  <p className="fc-view-sub">Describe what you want to master — AI builds a structured curriculum for you</p>
                </div>

                <div className="fc-generator">
                  <div className="fc-form-group">
                    <label className="fc-label">Topic</label>
                    <input
                      className="fc-input"
                      type="text"
                      placeholder="e.g. learn backend system design for high-traffic AI apps"
                      value={topicPrompt}
                      onChange={e => setTopicPrompt(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCreatePath(); }}
                    />
                  </div>

                  <div className="lp-topic-chips">
                    {SUGGESTED_TOPICS.map(topic => (
                      <button
                        key={topic}
                        className="lp-topic-chip"
                        type="button"
                        onClick={() => setTopicPrompt(topic)}
                      >
                        {topic}
                      </button>
                    ))}
                  </div>

                  <div className="fc-form-row">
                    <div className="fc-form-group">
                      <label className="fc-label">Difficulty</label>
                      <div className="fc-custom-select-wrapper">
                        <button
                          className="fc-custom-select"
                          type="button"
                          onClick={() => { setDifficultyOpen(o => !o); setLengthOpen(false); }}
                        >
                          <span className="fc-custom-select-text">{difficulty.toUpperCase()}</span>
                          <span className="fc-custom-select-arrow">{LP_ICONS.chevronDown}</span>
                        </button>
                        {difficultyOpen && (
                          <div className="fc-custom-dropdown">
                            {['beginner', 'intermediate', 'advanced'].map(level => (
                              <button
                                key={level}
                                type="button"
                                className={`fc-custom-option ${difficulty === level ? 'active' : ''}`}
                                onClick={() => { setDifficulty(level); setDifficultyOpen(false); }}
                              >
                                {level.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="fc-form-group">
                      <label className="fc-label">Length</label>
                      <div className="fc-custom-select-wrapper">
                        <button
                          className="fc-custom-select"
                          type="button"
                          onClick={() => { setLengthOpen(o => !o); setDifficultyOpen(false); }}
                        >
                          <span className="fc-custom-select-text">{pathLength.toUpperCase()}</span>
                          <span className="fc-custom-select-arrow">{LP_ICONS.chevronDown}</span>
                        </button>
                        {lengthOpen && (
                          <div className="fc-custom-dropdown">
                            {['short', 'medium', 'long'].map(item => (
                              <button
                                key={item}
                                type="button"
                                className={`fc-custom-option ${pathLength === item ? 'active' : ''}`}
                                onClick={() => { setPathLength(item); setLengthOpen(false); }}
                              >
                                {item.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="fc-form-group">
                    <label className="fc-label">
                      Goals
                      <span className="lp-label-optional"> · optional, one per line</span>
                    </label>
                    <textarea
                      className="fc-input lp-goals-textarea"
                      value={goals}
                      onChange={e => setGoals(e.target.value)}
                      placeholder={"e.g. Build a REST API\nUnderstand authentication flows"}
                      rows={3}
                    />
                  </div>

                  <button
                    className="fc-generate-btn"
                    onClick={handleCreatePath}
                    disabled={generating || !topicPrompt.trim()}
                  >
                    {generating
                      ? <><span className="lp-spinner" /> GENERATING PATH…</>
                      : 'GENERATE LEARNING PATH'
                    }
                  </button>
                </div>
              </div>
            )}

            {/* My Paths panel */}
            {activePanel === 'paths' && (
              <div className="fc-content fc-cards-panel">
                <div className="fc-view-header">
                  <span className="fc-view-kicker">Your Collection</span>
                  <h2 className="fc-view-title">My Learning Paths</h2>
                  <p className="fc-view-sub">
                    {summary.total} path{summary.total !== 1 ? 's' : ''} · {summary.avgProgress}% avg progress
                  </p>
                </div>

                {/* Filter + sort */}
                <div className="lp-control-bar">
                  <div className="lp-filter-row">
                    {FILTERS.map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        className={`lp-filter-btn ${statusFilter === key ? 'active' : ''}`}
                        onClick={() => setStatusFilter(key)}
                      >
                        {label}
                        <span>
                          {key === 'all' ? summary.total : key === 'active' ? summary.active : summary.completed}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="lp-sort-row">
                    {SORTS.map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        className={`lp-sort-btn ${sortBy === key ? 'active' : ''}`}
                        onClick={() => setSortBy(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {loading ? (
                  <div className="lp-lib-loading">
                    <span className="lp-spinner lp-spinner--lg" />
                  </div>
                ) : filteredPaths.length === 0 ? (
                  <div className="lp-empty-state">
                    <div className="lp-empty-icon">{LP_ICONS.paths}</div>
                    <span className="fc-view-kicker" style={{ marginBottom: 6 }}>
                      {paths.length ? 'No matches' : 'Empty collection'}
                    </span>
                    <h3 className="lp-empty-title">
                      {paths.length ? 'No Matching Paths' : 'No Learning Paths Yet'}
                    </h3>
                    <p className="lp-empty-sub">
                      {paths.length
                        ? 'Try adjusting your filters'
                        : 'Create your first AI-powered structured curriculum'}
                    </p>
                    {!paths.length && (
                      <button
                        className="fc-generate-btn lp-empty-cta"
                        onClick={() => setActivePanel('generator')}
                      >
                        Get Started
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="fc-grid">
                    {filteredPaths.map(path => {
                      const pct = Math.round(path.progress?.completion_percentage || 0);
                      const gradBg = DIFFICULTY_COLORS[path.difficulty] || DIFFICULTY_COLORS.intermediate;
                      const masteryLabel = pct >= 100 ? 'Complete' : pct >= 60 ? 'Active' : pct > 0 ? 'In Progress' : 'Not Started';
                      const masteryColor = pct >= 100 ? '#22c55e' : pct >= 60 ? 'var(--accent)' : pct > 0 ? '#f59e0b' : undefined;
                      return (
                        <div
                          key={path.id}
                          className="fc-set-card-new lp-path-card"
                          onClick={() => navigate(`/learning-paths/${path.id}`)}
                          onMouseMove={handleTileMove}
                          onMouseLeave={handleTileLeave}
                        >
                          <div className="cb-tile-texture" />
                          {/* Thumbnail */}
                          <div
                            className="fc-set-thumbnail lp-path-thumb"
                            style={{ background: gradBg }}
                          >
                            <div className="fc-set-thumbnail-content">
                              <h2 className="fc-thumbnail-title">{path.title}</h2>
                              <div className="fc-thumbnail-card-count">
                                {path.total_nodes || 0} NODES · {Math.round(path.estimated_hours || 0)}H
                              </div>
                            </div>
                            <button
                              className="fc-delete-btn-thumb"
                              type="button"
                              onClick={e => handleDeletePath(path.id, e)}
                            >
                              {LP_ICONS.trash}
                            </button>
                          </div>

                          {/* Content */}
                          <div className="fc-set-content-new">
                            <div className="lp-mastery-section">
                              <div className="lp-mastery-info">
                                <span className="fc-mastery-label">Progress</span>
                                <span className="fc-mastery-value" style={masteryColor ? { color: masteryColor } : {}}>
                                  {masteryLabel}
                                </span>
                              </div>
                              <div className="fc-set-progress-new">
                                <div
                                  className="fc-set-progress-fill-new"
                                  style={{
                                    width: `${pct}%`,
                                    background: masteryColor || 'var(--accent)',
                                  }}
                                />
                              </div>
                              <span className="fc-mastery-percentage">{pct}%</span>
                            </div>

                            <div className="lp-path-meta-row">
                              {LP_ICONS.clock}
                              <span>{Math.round(path.estimated_hours || 0)}h</span>
                              <span className="lp-meta-dot">·</span>
                              {LP_ICONS.book}
                              <span>{path.completed_nodes || 0}/{path.total_nodes || 0}</span>
                              <span className="lp-meta-dot">·</span>
                              <span className="lp-diff-label">{path.difficulty || 'intermediate'}</span>
                            </div>
                          </div>

                          {/* Open action */}
                          <div className="fc-set-actions-new lp-path-actions">
                            <button
                              className="fc-action-btn-new lp-action-open"
                              type="button"
                              onClick={e => { e.stopPropagation(); navigate(`/learning-paths/${path.id}`); }}
                            >
                              <span>OPEN PATH</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default LearningPaths;
