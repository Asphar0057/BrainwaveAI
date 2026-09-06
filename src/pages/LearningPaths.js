import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  BookOpen,
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
  Search,
  Sparkles,
  TrendingUp,
  Trash2,
} from 'lucide-react';
import learningPathService from '../services/learningPathService';
import { API_URL } from '../config';
import SocialHubChrome from '../components/SocialHubChrome';
import './LearningPaths.css';
import './LearningPathTheme.css';

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 900,
  );
  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [searchQuery, setSearchQuery] = useState('');
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
    .filter((path) => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return `${getDisplayTitle(path)} ${getDisplayDescription(path)} ${path.difficulty || ''}`
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => {
      if (sortBy === 'progress') return getPathProgress(b) - getPathProgress(a);
      if (sortBy === 'time') return (a.estimated_hours || 0) - (b.estimated_hours || 0);
      if (sortBy === 'az') return (a.title || '').localeCompare(b.title || '');
      return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
    }), [paths, searchQuery, sortBy, statusFilter]);

  const leadPath = useMemo(() => {
    const active = paths.filter((path) => getPathStatus(path) === 'active');
    return [...active].sort((a, b) => {
      const aProgress = getPathProgress(a);
      const bProgress = getPathProgress(b);
      if (aProgress && bProgress) return bProgress - aProgress;
      return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
    })[0] || null;
  }, [paths]);

  const libraryPaths = useMemo(
    () => filteredPaths.filter((path) => !(
      leadPath
      && statusFilter !== 'completed'
      && !searchQuery.trim()
      && path.id === leadPath.id
    )),
    [filteredPaths, leadPath, searchQuery, statusFilter],
  );

  const handleCreatePath = async () => {
    const topic = topicPrompt.trim();
    if (!topic || generating) return;
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

  const navigationSections = [
    {
      label: 'Workspace',
      items: [
        { label: 'My paths', icon: Route, active: activePanel === 'paths', count: summary.total, onClick: () => { setStatusFilter('all'); openPanel('paths'); } },
        { label: 'Path builder', icon: Milestone, active: activePanel === 'generator', onClick: () => openPanel('generator') },
      ],
    },
    {
      label: 'Your map',
      items: [
        { label: 'Notes', icon: Library, onClick: () => navigate('/notes') },
        { label: 'Flashcards', icon: BookOpen, onClick: () => navigate('/flashcards') },
      ],
    },
  ];

  return (
    <div className="lp-page with-social-chrome">
      <SocialHubChrome
        brandKicker="Learning Paths"
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        sideSections={navigationSections}
        collapsedLeadItems={[{ icon: Plus, label: 'Create a path', active: activePanel === 'generator', onClick: () => openPanel('generator') }]}
        footerItems={[{ icon: Home, label: 'Dashboard', path: '/dashboard-cerbyl' }]}
        sidebarLead={(
          <button className="lp-side-primary" type="button" onClick={() => openPanel('generator')}>
            <Sparkles size={15} />
            <span>Create a path</span>
          </button>
        )}
        sidebarTail={(
          <div className="lp-sidebar-summary">
            <div><span>Active progress</span><strong>{summary.avgProgress}%</strong></div>
            <div className="lp-summary-track" role="progressbar" aria-label="Average active path progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={summary.avgProgress}>
              <i style={{ width: `${summary.avgProgress}%` }} />
            </div>
            <small>{summary.total} mapped path{summary.total === 1 ? '' : 's'}</small>
          </div>
        )}
      >
        <div className="lp-main">
          {activePanel === 'generator' ? (
            <section className="lp-builder" aria-labelledby="lp-builder-title">
              <div className="lp-builder-copy">
                <span className="lp-kicker">Plot a new route</span>
                <h1 id="lp-builder-title">Build a learning path.</h1>
                <p>Choose the subject, depth and outcome. Cerbyl will arrange the sequence.</p>
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
                  <span className="lp-kicker">Learning paths</span>
                  <h1 id="lp-library-title">Your routes</h1>
                  <p>Resume the path that matters now, or find another route in your library.</p>
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
                  {leadPath && statusFilter !== 'completed' && !searchQuery.trim() && (
                    <section className="lp-resume" aria-labelledby="lp-resume-title">
                      <div className="lp-resume-label">
                        <Compass size={16} />
                        <span>Continue learning</span>
                      </div>
                      <button type="button" className="lp-resume-path" onClick={() => navigate(`/learning-paths/${leadPath.id}`)}>
                        <div className="lp-resume-copy">
                          <h2 id="lp-resume-title">{getDisplayTitle(leadPath)}</h2>
                          <p>{getDisplayDescription(leadPath)}</p>
                          <div className="lp-lead-meta">
                            <span><Clock3 size={14} /> {Math.round(leadPath.estimated_hours || 0)} hours</span>
                            <span><Milestone size={14} /> {leadPath.completed_nodes || 0}/{leadPath.total_nodes || 0} checkpoints</span>
                            <span><Gauge size={14} /> {leadPath.difficulty || 'intermediate'}</span>
                          </div>
                        </div>
                        <div className="lp-resume-action" aria-label={`${getPathProgress(leadPath)} percent complete`}>
                          <strong>{getPathProgress(leadPath)}%</strong>
                          <span>{getPathProgress(leadPath) > 0 ? 'Resume path' : 'Start path'} <ArrowRight size={16} /></span>
                        </div>
                      </button>
                    </section>
                  )}

                  <section className="lp-path-library" aria-labelledby="lp-path-library-title">
                    <div className="lp-path-library-head">
                      <div>
                        <h2 id="lp-path-library-title">Path library</h2>
                        <p>{libraryPaths.length} route{libraryPaths.length === 1 ? '' : 's'} in this view</p>
                      </div>
                      <div className="lp-library-tools">
                        <label className="lp-search">
                          <Search size={16} />
                          <span className="lp-visually-hidden">Search learning paths</span>
                          <input
                            type="search"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Search paths"
                          />
                        </label>
                        <label className="lp-sort-select">
                          <span>Order</span>
                          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                            {SORTS.map(({ key, label }) => <option value={key} key={key}>{label}</option>)}
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="lp-filter-row" aria-label="Filter learning paths">
                      {FILTERS.map(({ key, label }) => (
                        <button type="button" key={key} aria-pressed={statusFilter === key} className={statusFilter === key ? 'active' : ''} onClick={() => setStatusFilter(key)}>
                          {label}
                          <span>{key === 'all' ? summary.total : key === 'active' ? summary.active : summary.completed}</span>
                        </button>
                      ))}
                    </div>

                    {libraryPaths.length === 0 ? (
                      <div className="lp-filter-empty">
                        <Map size={26} />
                        <h3>{searchQuery ? 'No matching paths' : 'No paths in this view'}</h3>
                        <p>{searchQuery ? 'Try a different title or topic.' : 'Change the filter to see the rest of your library.'}</p>
                        <button type="button" onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}>Reset library</button>
                      </div>
                    ) : (
                      <div className="lp-route-list">
                        {libraryPaths.map((path) => {
                          const progress = getPathProgress(path);
                          return (
                            <article className="lp-route-row" key={path.id} style={{ '--lp-progress': `${progress}%` }}>
                              <button type="button" className="lp-route-open" onClick={() => navigate(`/learning-paths/${path.id}`)}>
                                <div className="lp-route-title">
                                  <h3>{getDisplayTitle(path)}</h3>
                                  <p>{getDisplayDescription(path)}</p>
                                  <div className="lp-route-meta">
                                    <span>{path.difficulty || 'intermediate'}</span>
                                    <span>{Math.round(path.estimated_hours || 0)} hours</span>
                                    <span>{path.completed_nodes || 0}/{path.total_nodes || 0} checkpoints</span>
                                  </div>
                                </div>
                                <div className="lp-route-progress" aria-label={`${progress} percent complete`}>
                                  <strong>{progress}%</strong>
                                  <span>{progress > 0 ? 'Continue' : 'Start'}</span>
                                  <i aria-hidden="true"><b /></i>
                                </div>
                                <ArrowRight className="lp-route-arrow" size={19} />
                              </button>
                              <button type="button" className="lp-route-delete" aria-label={`Delete ${getDisplayTitle(path)}`} onClick={(event) => handleDeletePath(path.id, event)}>
                                <Trash2 size={16} />
                              </button>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </>
              )}
            </section>
          )}
        </div>
      </SocialHubChrome>
    </div>
  );
};

export default LearningPaths;
