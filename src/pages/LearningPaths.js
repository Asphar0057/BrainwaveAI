import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  BookOpen,
  Check,
  Clock3,
  Compass,
  Flame,
  Gauge,
  Home,
  Library,
  Loader2,
  Map,
  Milestone,
  Plus,
  Route,
  Sparkles,
  TrendingUp,
  Trash2,
} from 'lucide-react';
import learningPathService from '../services/learningPathService';
import GeoBackground from '../components/GeoBackground';
import { API_URL } from '../config';
import {
  SidebarAction,
  SidebarActions,
  SidebarMenuItem,
  SidebarPrimaryButton,
  SidebarSection,
  SidebarShell,
  SidebarStatBox,
  SidebarStats,
  SidebarStripButton,
  SidebarStripDivider,
  SidebarStripSpacer,
} from '../components/Sidebar';
import './LearningPaths.css';

const FALLBACK_TOPICS = [
  'System design for AI products',
  'React performance architecture',
  'Advanced calculus for ML',
  'Data structures in Python',
];

const TOPIC_GROUPS = [
  { key: 'needs_work', label: 'Strengthen these', icon: Flame },
  { key: 'progressing', label: 'In progress', icon: TrendingUp },
  { key: 'mastered', label: 'Already strong', icon: Award },
];

const FILTERS = [
  { key: 'all', label: 'All paths' },
  { key: 'active', label: 'In motion' },
  { key: 'completed', label: 'Completed' },
];

const SORTS = [
  { key: 'recent', label: 'Recently updated' },
  { key: 'progress', label: 'Most progress' },
  { key: 'time', label: 'Shortest first' },
  { key: 'az', label: 'A-Z' },
];

function getPathProgress(path) {
  return Math.round(path.progress?.completion_percentage || 0);
}

function getPathStatus(path) {
  if (path.status === 'completed' || getPathProgress(path) >= 100) return 'completed';
  return 'active';
}

function getDisplayTitle(path) {
  const raw = String(path?.title || 'Untitled learning path')
    .replace(/\*\*/g, '')
    .replace(/^chat title:\s*/i, '')
    .replace(/\s+(student|tutor):[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return raw.length > 82 ? `${raw.slice(0, 79).trim()}...` : raw;
}

function getDisplayDescription(path) {
  const description = String(path?.description || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (!description || /chat title:|student:|tutor:/i.test(description)) {
    return `A sequenced route through ${getDisplayTitle(path)}, with practice and checkpoints placed where they matter.`;
  }
  return description.length > 180 ? `${description.slice(0, 177).trim()}...` : description;
}

const LearningPaths = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activePanel, setActivePanel] = useState('paths');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [topicPrompt, setTopicPrompt] = useState('');
  const [difficulty, setDifficulty] = useState('intermediate');
  const [pathLength, setPathLength] = useState('medium');
  const [goals, setGoals] = useState('');
  const [topicMastery, setTopicMastery] = useState(null);
  const [masteryLoading, setMasteryLoading] = useState(true);

  const loadPaths = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const response = await learningPathService.getPaths();
      setPaths(response.paths || []);
    } catch (error) {
      console.error('Error loading paths:', error);
      setLoadError('Your paths could not be loaded. Try the route again.');
    } finally {
      setLoading(false);
    }
  };

  const loadTopicMastery = async () => {
    const token = localStorage.getItem('token');
    const userName = localStorage.getItem('username');
    if (!token || !userName) {
      setMasteryLoading(false);
      return;
    }
    try {
      setMasteryLoading(true);
      const response = await fetch(`${API_URL}/weakness-practice/mastery-overview?user_id=${encodeURIComponent(userName)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Topic mastery unavailable');
      setTopicMastery(await response.json());
    } catch (error) {
      console.error('Error loading topic mastery:', error);
      setTopicMastery(null);
    } finally {
      setMasteryLoading(false);
    }
  };

  useEffect(() => {
    loadPaths();
    loadTopicMastery();
  }, []);

  useEffect(() => {
    if (location.state?.autoGenerate && location.state?.topic) {
      setTopicPrompt(location.state.topic);
      setDifficulty(location.state.difficulty || 'intermediate');
      setPathLength(location.state.length || 'medium');
      setActivePanel('generator');
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const summary = useMemo(() => {
    const active = paths.filter((path) => getPathStatus(path) === 'active');
    const completed = paths.filter((path) => getPathStatus(path) === 'completed');
    const avgProgress = active.length
      ? Math.round(active.reduce((total, path) => total + getPathProgress(path), 0) / active.length)
      : 0;
    return { total: paths.length, active: active.length, completed: completed.length, avgProgress };
  }, [paths]);

  const topicGroups = useMemo(() => {
    const breakdown = topicMastery?.topic_breakdown;
    if (!breakdown || !topicMastery?.total_topics) return [];
    return TOPIC_GROUPS.map(({ key, label, icon }) => ({
      key,
      label,
      icon,
      topics: [...(breakdown[key] || [])]
        .sort((a, b) => (key === 'mastered' ? b.mastery_level - a.mastery_level : a.mastery_level - b.mastery_level))
        .slice(0, 6),
    })).filter((group) => group.topics.length > 0);
  }, [topicMastery]);

  const filteredPaths = useMemo(() => paths
    .filter((path) => statusFilter === 'all' || getPathStatus(path) === statusFilter)
    .sort((a, b) => {
      if (sortBy === 'progress') return getPathProgress(b) - getPathProgress(a);
      if (sortBy === 'time') return (a.estimated_hours || 0) - (b.estimated_hours || 0);
      if (sortBy === 'az') return (a.title || '').localeCompare(b.title || '');
      return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
    }), [paths, sortBy, statusFilter]);

  const leadPath = useMemo(() => {
    const active = paths.filter((path) => getPathStatus(path) === 'active');
    return [...active].sort((a, b) => {
      const aProgress = getPathProgress(a);
      const bProgress = getPathProgress(b);
      if (aProgress && bProgress) return bProgress - aProgress;
      return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
    })[0] || paths[0];
  }, [paths]);

  const handleCreatePath = async () => {
    const topic = topicPrompt.trim();
    if (!topic) return;
    try {
      setGenerating(true);
      setGenerateError('');
      const response = await learningPathService.generatePath(topic, {
        difficulty,
        length: pathLength,
        goals: goals.split('\n').map((goal) => goal.trim()).filter(Boolean),
      });
      if (response.success) {
        setTopicPrompt('');
        setGoals('');
        navigate(`/learning-paths/${response.path_id}`);
      } else {
        setGenerateError('The path was not created. Refine the topic and try again.');
      }
    } catch (error) {
      console.error('Error creating path:', error);
      setGenerateError('The path was not created. Check your connection and try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDeletePath = async (pathId, event) => {
    event.stopPropagation();
    if (!window.confirm('Delete this learning path? This cannot be undone.')) return;
    try {
      await learningPathService.deletePath(pathId);
      setPaths((current) => current.filter((path) => path.id !== pathId));
    } catch (error) {
      console.error('Error deleting path:', error);
      setLoadError('That path could not be deleted. Please try again.');
    }
  };

  const openPanel = (panel) => {
    setActivePanel(panel);
    if (window.innerWidth <= 900) setSidebarCollapsed(true);
  };

  return (
    <div className="lp-page">
      <GeoBackground />
      <header className="lp-topbar">
        <div className="lp-topbar-brand">learning, <span>unified</span></div>
        <div className="lp-topbar-state">
          <span className="lp-status-dot" />
          {summary.active} active route{summary.active === 1 ? '' : 's'}
        </div>
      </header>

      <div className={`lp-shell ${sidebarCollapsed ? 'lp-shell--collapsed' : ''}`}>
        <SidebarShell
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
          brandKicker="LEARNING PATHS"
          ariaLabel="Learning paths navigation"
          collapsedContent={(
            <>
              <SidebarStripButton icon={<Plus size={18} />} tip="Create a path" active={activePanel === 'generator'} onClick={() => openPanel('generator')} />
              <SidebarStripButton icon={<Route size={18} />} tip="My paths" active={activePanel === 'paths'} onClick={() => openPanel('paths')} />
              <SidebarStripDivider />
              <SidebarStripSpacer />
              <SidebarStripButton icon={<Home size={18} />} tip="Dashboard" onClick={() => navigate('/dashboard-cerbyl')} />
            </>
          )}
        >
          <SidebarPrimaryButton icon={<Sparkles size={18} />} label="Create a path" onClick={() => openPanel('generator')} />
          <SidebarSection heading="Workspace">
            <SidebarMenuItem icon={<Route size={18} />} label="My paths" active={activePanel === 'paths' && statusFilter === 'all'} badge={summary.total || null} onClick={() => { setStatusFilter('all'); openPanel('paths'); }} />
            <SidebarMenuItem icon={<Compass size={18} />} label="In motion" active={activePanel === 'paths' && statusFilter === 'active'} badge={summary.active || null} onClick={() => { setStatusFilter('active'); openPanel('paths'); }} />
            <SidebarMenuItem icon={<Check size={18} />} label="Completed" active={activePanel === 'paths' && statusFilter === 'completed'} badge={summary.completed || null} onClick={() => { setStatusFilter('completed'); openPanel('paths'); }} />
            <SidebarMenuItem icon={<Milestone size={18} />} label="Path builder" active={activePanel === 'generator'} onClick={() => openPanel('generator')} />
          </SidebarSection>
          <SidebarSection heading="Your map">
            <SidebarMenuItem icon={<Library size={18} />} label="Notes" onClick={() => navigate('/notes')} />
            <SidebarMenuItem icon={<BookOpen size={18} />} label="Flashcards" onClick={() => navigate('/flashcards')} />
          </SidebarSection>
          <SidebarStats>
            <SidebarStatBox value={summary.avgProgress + '%'} label="Active progress" />
            <SidebarStatBox value={summary.total} label="Mapped paths" />
          </SidebarStats>
          <SidebarActions>
            <SidebarAction icon={<Home size={18} />} label="Dashboard" onClick={() => navigate('/dashboard-cerbyl')} />
          </SidebarActions>
        </SidebarShell>

        <main className="lp-main">
          {activePanel === 'generator' ? (
            <section className="lp-builder" aria-labelledby="lp-builder-title">
              <div className="lp-builder-copy">
                <span className="lp-kicker">Plot a new route</span>
                <h1 id="lp-builder-title">Turn an ambition into a study sequence.</h1>
                <p>Set the destination and constraints. Cerbyl will arrange the concepts, practice and checks in the order they should happen.</p>
                <div className="lp-builder-route" aria-hidden="true">
                  <div className="lp-builder-route-line" />
                  {['Destination', 'Depth', 'Pace', 'Outcome'].map((label, index) => (
                    <div className="lp-builder-route-stop" key={label}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <strong>{label}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lp-planning-desk">
                <div className="lp-field lp-field--destination">
                  <label htmlFor="path-topic"><span>01</span> What do you want to understand?</label>
                  <textarea
                    id="path-topic"
                    value={topicPrompt}
                    onChange={(event) => setTopicPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) handleCreatePath();
                    }}
                    placeholder="Example: Design reliable AI systems that can serve millions of users"
                    rows={3}
                    autoFocus
                  />
                </div>

                <div className="lp-topics-panel">
                  <div className="lp-topics-head">
                    <span>Your topics</span>
                    {topicMastery?.total_topics > 0 && (
                      <p>{topicMastery.total_topics} tracked &middot; {topicMastery.overall_mastery}% overall mastery</p>
                    )}
                  </div>

                  {masteryLoading ? (
                    <div className="lp-topics-loading"><Loader2 className="lp-spin" size={15} /> Reading your topic history</div>
                  ) : topicGroups.length > 0 ? (
                    topicGroups.map((group) => {
                      const GroupIcon = group.icon;
                      return (
                        <div className="lp-topic-group" key={group.key}>
                          <span className="lp-topic-group-label"><GroupIcon size={12} /> {group.label}</span>
                          <div className="lp-topic-chips">
                            {group.topics.map((t) => (
                              <button type="button" key={t.topic} onClick={() => setTopicPrompt(t.topic)}>
                                {t.topic}
                                <em>{Math.round((t.mastery_level || 0) * 100)}%</em>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <>
                      <p className="lp-topics-empty">
                        No tracked topics yet &mdash; study a topic anywhere in Cerbyl and it&apos;ll show up here. For now, here are a few to start from:
                      </p>
                      <div className="lp-topic-chips">
                        {FALLBACK_TOPICS.map((topic) => (
                          <button type="button" key={topic} onClick={() => setTopicPrompt(topic)}>{topic}</button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="lp-builder-options">
                  <fieldset className="lp-choice-group">
                    <legend><span>02</span> Starting point</legend>
                    {['beginner', 'intermediate', 'advanced'].map((level) => (
                      <button type="button" key={level} aria-pressed={difficulty === level} className={difficulty === level ? 'active' : ''} onClick={() => setDifficulty(level)}>
                        {level}
                      </button>
                    ))}
                  </fieldset>
                  <fieldset className="lp-choice-group">
                    <legend><span>03</span> Route length</legend>
                    {['short', 'medium', 'long'].map((length) => (
                      <button type="button" key={length} aria-pressed={pathLength === length} className={pathLength === length ? 'active' : ''} onClick={() => setPathLength(length)}>
                        {length}
                      </button>
                    ))}
                  </fieldset>
                </div>

                <div className="lp-field">
                  <label htmlFor="path-goals"><span>04</span> What should you be able to do at the end?</label>
                  <textarea
                    id="path-goals"
                    value={goals}
                    onChange={(event) => setGoals(event.target.value)}
                    placeholder={"One outcome per line\nBuild a working prototype\nExplain the tradeoffs clearly"}
                    rows={4}
                  />
                </div>

                {generateError && <div className="lp-inline-error" role="alert">{generateError}</div>}
                <div className="lp-builder-submit">
                  <div>
                    <span>Ready to plot</span>
                    <p>{topicPrompt.trim() ? `${difficulty} depth, ${pathLength} route` : 'Add a destination to continue'}</p>
                  </div>
                  <button type="button" onClick={handleCreatePath} disabled={generating || !topicPrompt.trim()}>
                    {generating ? <Loader2 className="lp-spin" size={18} /> : <Route size={18} />}
                    {generating ? 'Building route' : 'Build learning path'}
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className="lp-library" aria-labelledby="lp-library-title">
              <div className="lp-library-head">
                <div>
                  <span className="lp-kicker">Route desk</span>
                  <h1 id="lp-library-title">Pick up the thread.</h1>
                  <p>Your paths are ordered journeys, not folders. Continue the next useful step or inspect the whole map.</p>
                </div>
                <button type="button" className="lp-head-create" onClick={() => openPanel('generator')}>
                  <Plus size={17} /> New path
                </button>
              </div>

              {loadError && (
                <div className="lp-load-error" role="alert">
                  <span>{loadError}</span>
                  <button type="button" onClick={loadPaths}>Try again</button>
                </div>
              )}

              {loading ? (
                <div className="lp-loading"><Loader2 className="lp-spin" size={28} /><span>Reading your map</span></div>
              ) : paths.length === 0 ? (
                <div className="lp-empty">
                  <div className="lp-empty-map" aria-hidden="true">
                    <span /><span /><span /><i />
                  </div>
                  <span className="lp-kicker">No route plotted</span>
                  <h2>Your next subject is still a blank map.</h2>
                  <p>Start with a destination. Cerbyl will turn it into a sequence of concepts, practice and checks.</p>
                  <button type="button" onClick={() => openPanel('generator')}>Plot the first path <ArrowRight size={16} /></button>
                </div>
              ) : (
                <>
                  {leadPath && statusFilter !== 'completed' && (
                    <button type="button" className="lp-lead-path" onClick={() => navigate(`/learning-paths/${leadPath.id}`)}>
                      <div className="lp-lead-copy">
                        <span className="lp-kicker">Continue from here</span>
                        <h2>{getDisplayTitle(leadPath)}</h2>
                        <p>{getDisplayDescription(leadPath)}</p>
                        <div className="lp-lead-meta">
                          <span><Clock3 size={14} /> {Math.round(leadPath.estimated_hours || 0)} hours</span>
                          <span><Milestone size={14} /> {leadPath.completed_nodes || 0} of {leadPath.total_nodes || 0} checkpoints</span>
                          <span><Gauge size={14} /> {leadPath.difficulty || 'intermediate'}</span>
                        </div>
                      </div>
                      <div className="lp-lead-map" aria-label={`${getPathProgress(leadPath)} percent complete`}>
                        <div className="lp-lead-percent">{String(getPathProgress(leadPath)).padStart(2, '0')}<small>%</small></div>
                        <div className="lp-route-track">
                          {Array.from({ length: Math.max(3, Math.min(8, leadPath.total_nodes || 5)) }).map((_, index) => {
                            const completeCount = Math.round((Math.max(3, Math.min(8, leadPath.total_nodes || 5)) * getPathProgress(leadPath)) / 100);
                            return <span key={index} className={index < completeCount ? 'complete' : index === completeCount ? 'current' : ''} />;
                          })}
                        </div>
                        <strong>Resume route <ArrowRight size={17} /></strong>
                      </div>
                    </button>
                  )}

                  <div className="lp-library-controls">
                    <div className="lp-filter-row" aria-label="Filter learning paths">
                      {FILTERS.map(({ key, label }) => (
                        <button type="button" key={key} className={statusFilter === key ? 'active' : ''} onClick={() => setStatusFilter(key)}>
                          {label}
                          <span>{key === 'all' ? summary.total : key === 'active' ? summary.active : summary.completed}</span>
                        </button>
                      ))}
                    </div>
                    <label className="lp-sort-select">
                      <span>Order by</span>
                      <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                        {SORTS.map(({ key, label }) => <option value={key} key={key}>{label}</option>)}
                      </select>
                    </label>
                  </div>

                  {filteredPaths.length === 0 ? (
                    <div className="lp-filter-empty">
                      <Map size={28} />
                      <h2>No paths in this view.</h2>
                      <button type="button" onClick={() => setStatusFilter('all')}>Show every path</button>
                    </div>
                  ) : (
                    <div className="lp-route-list">
                      {filteredPaths.map((path, index) => {
                        const progress = getPathProgress(path);
                        const nodeCount = Math.max(3, Math.min(7, path.total_nodes || 4));
                        const completedNodes = Math.round((nodeCount * progress) / 100);
                        return (
                          <article className="lp-route-row" key={path.id}>
                            <button type="button" className="lp-route-open" onClick={() => navigate(`/learning-paths/${path.id}`)}>
                              <span className="lp-route-index">{String(index + 1).padStart(2, '0')}</span>
                              <div className="lp-route-title">
                                <span>{path.difficulty || 'intermediate'}</span>
                                <h3>{getDisplayTitle(path)}</h3>
                                <p>{getDisplayDescription(path)}</p>
                              </div>
                              <div className="lp-route-nodes" aria-label={`${progress} percent complete`}>
                                {Array.from({ length: nodeCount }).map((_, nodeIndex) => (
                                  <span key={nodeIndex} className={nodeIndex < completedNodes ? 'complete' : nodeIndex === completedNodes ? 'current' : ''}>
                                    {nodeIndex < completedNodes ? <Check size={11} /> : nodeIndex + 1}
                                  </span>
                                ))}
                              </div>
                              <div className="lp-route-progress">
                                <strong>{progress}%</strong>
                                <span>{path.completed_nodes || 0}/{path.total_nodes || 0} steps</span>
                              </div>
                              <ArrowRight className="lp-route-arrow" size={20} />
                            </button>
                            <button type="button" className="lp-route-delete" aria-label={`Delete ${getDisplayTitle(path)}`} onClick={(event) => handleDeletePath(path.id, event)}>
                              <Trash2 size={16} />
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default LearningPaths;
