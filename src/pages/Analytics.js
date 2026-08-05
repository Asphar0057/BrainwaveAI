import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download, Zap, BookOpen, MessageSquare,
  Trophy, Target, Flame, Clock, Brain, Cpu,
  Network, Sparkles, TrendingUp, CheckCircle,
  GitBranch, Info, AlertCircle, BarChart3, Activity,
  Search, CircleHelp, Presentation, TriangleAlert, History
} from 'lucide-react';
import './Analytics.css';
import SocialHubChrome from '../components/SocialHubChrome';
import { API_URL } from '../config';
import ThemeSwitcher from '../components/ThemeSwitcher';

const CACHE_TTL = 5 * 1000;
const CLIENT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

const readCache = (key) => {
  try {
    const raw = localStorage.getItem(`an_cache_${key}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
};

const writeCache = (key, data) => {
  try { localStorage.setItem(`an_cache_${key}`, JSON.stringify({ data, ts: Date.now() })); } catch {}
};

const fetchJson = async (url) => {
  const token = localStorage.getItem('token');
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

const formatChartLabel = (point = {}, groupBy = 'day') => {
  const rawDate = point.date || point.period;
  if (rawDate) {
    const parsed = new Date(`${rawDate}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat('en', groupBy === 'month'
        ? { month: 'short' }
        : { month: 'short', day: 'numeric' }).format(parsed);
    }
  }
  return String(point.label || point.day || '').slice(0, 7);
};

const getNiceChartMaximum = (value) => {
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
};

const Analytics = () => {
  const navigate = useNavigate();
  const userName = localStorage.getItem('username') || '';
  const profile = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('userProfile') || '{}') || {};
    } catch {
      return {};
    }
  }, []);

  const [loading, setLoading] = useState(() => !readCache(`core_month_${localStorage.getItem('username')}`));
  const [timeRange, setTimeRange] = useState('month');
  const [activeTab, setActiveTab] = useState('overview');
  const [chartHover, setChartHover] = useState(null);

  const u = localStorage.getItem('username') || '';
  const [gamStats, setGamStats] = useState(() => readCache(`gam_${u}`) || {});
  const [historicalData, setHistoricalData] = useState(() => readCache(`hist_month_${u}`)?.history || []);
  const [weeklyData, setWeeklyData] = useState(() => readCache(`weekly_${u}`) || { daily_breakdown: [], weekly_stats: {}, total_points: 0 });
  const [breakdown, setBreakdown] = useState(() => readCache(`bkdn_month_${u}`)?.breakdown || {});
  const [quizPerf, setQuizPerf] = useState(() => readCache(`quiz_${u}`) || { quiz_history: [], total_quizzes: 0, avg_score: 0 });
  const [periodStats, setPeriodStats] = useState(() => {
    const h = readCache(`hist_month_${u}`);
    return h ? { totalPoints: h.total_points || 0, totalActivities: h.total_activities || 0, groupBy: h.group_by || 'day' } : { totalPoints: 0, totalActivities: 0, groupBy: 'day' };
  });
  const [mlStats, setMlStats] = useState(null);
  const [contextSessions, setContextSessions] = useState([]);
  const [chatDetails, setChatDetails] = useState(null);
  const [flashDetails, setFlashDetails] = useState(null);

  useEffect(() => {
    if (!localStorage.getItem('token')) { navigate('/login'); return; }
    const hasCached = !!readCache(`core_${timeRange}_${userName}`);
    if (hasCached) {
      const h = readCache(`hist_${timeRange}_${userName}`);
      const b = readCache(`bkdn_${timeRange}_${userName}`);
      if (h) { setHistoricalData(h.history || []); setPeriodStats({ totalPoints: h.total_points || 0, totalActivities: h.total_activities || 0, groupBy: h.group_by || 'day' }); }
      if (b) setBreakdown(b.breakdown || {});
    }
    loadCore(hasCached);
  }, [timeRange]);

  useEffect(() => {
    if (activeTab === 'ml') {
      if (!mlStats) fetchJson(`${API_URL}/get_ml_analytics?user_id=${userName}`).then(d => setMlStats(d)).catch(() => {});
      if (!contextSessions.length) fetchJson(`${API_URL}/get_context_sessions?user_id=${userName}`).then(d => setContextSessions(d.sessions || [])).catch(() => {});
    } else if (activeTab === 'deep') {
      if (!chatDetails) fetchJson(`${API_URL}/get_chat_details?user_id=${userName}`).then(d => setChatDetails(d)).catch(() => {});
      if (!flashDetails) fetchJson(`${API_URL}/get_flashcard_details?user_id=${userName}`).then(d => setFlashDetails(d)).catch(() => {});
    }
  }, [activeTab]);

  const loadCore = async (silent = false) => {
    if (!silent) setLoading(true);
    await Promise.allSettled([
      fetchJson(`${API_URL}/get_gamification_stats?user_id=${userName}`).then(d => {
        setGamStats(d); writeCache(`gam_${userName}`, d);
      }),
      fetchJson(`${API_URL}/get_analytics_history?user_id=${userName}&period=${timeRange}&tz=${encodeURIComponent(CLIENT_TIMEZONE)}`).then(d => {
        setHistoricalData(d.history || []);
        setPeriodStats({ totalPoints: d.total_points || 0, totalActivities: d.total_activities || 0, groupBy: d.group_by || 'day' });
        writeCache(`hist_${timeRange}_${userName}`, d);
        writeCache(`core_${timeRange}_${userName}`, true);
      }),
      fetchJson(`${API_URL}/get_weekly_progress?user_id=${userName}`).then(d => {
        setWeeklyData(d); writeCache(`weekly_${userName}`, d);
      }),
      fetchJson(`${API_URL}/get_activity_breakdown?user_id=${userName}&period=${timeRange}`).then(d => {
        setBreakdown(d.breakdown || {}); writeCache(`bkdn_${timeRange}_${userName}`, d);
      }),
      fetchJson(`${API_URL}/get_quiz_performance?user_id=${userName}`).then(d => {
        setQuizPerf(d); writeCache(`quiz_${userName}`, d);
      }),
    ]);
    setLoading(false);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      loadCore(true);
    }, 10000);
    return () => clearInterval(timer);
  }, [timeRange, userName]);

  const lineSvg = useMemo(() => {
    if (!historicalData.length) return null;
    const W = 800, H = 224, pL = 48, pR = 16, pT = 14, pB = 34;
    const iW = W - pL - pR, iH = H - pT - pB;
    const maxV = getNiceChartMaximum(Math.max(1, ...historicalData.map(d => d.points || 0)));
    const step = iW / Math.max(1, historicalData.length - 1);
    const pts = historicalData.map((d, i) => ({
      x: pL + i * step,
      y: pT + iH - ((d.points || 0) / maxV) * iH,
      v: d.points || 0,
      label: formatChartLabel(d, periodStats.groupBy),
      date: d.date || '',
    }));
    const path = pts.reduce((result, point, index) => {
      if (index === 0) return `M ${point.x.toFixed(1)},${point.y.toFixed(1)}`;
      const previous = pts[index - 1];
      const midpoint = (previous.x + point.x) / 2;
      return `${result} C ${midpoint.toFixed(1)},${previous.y.toFixed(1)} ${midpoint.toFixed(1)},${point.y.toFixed(1)} ${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    }, '');
    const area = pts.length > 1
      ? `${path} L ${pts[pts.length-1].x},${pT+iH} L ${pts[0].x},${pT+iH} Z`
      : '';
    const yTicks = [0, .25, .5, .75, 1].map(fraction => ({
      value: Math.round(maxV * fraction),
      y: pT + iH * (1 - fraction),
    }));
    return { W, H, pL, pR, pT, pB, iW, iH, pts, path, area, yTicks };
  }, [historicalData, periodStats.groupBy]);

  const xp = gamStats.experience || gamStats.current_xp || 0;
  const nextXp = gamStats.next_level_xp || 1000;
  const xpPct = Math.min(100, nextXp ? (xp / nextXp) * 100 : 0);
  const level = gamStats.level || 1;
  const streak = gamStats.current_streak || 0;
  const rank = gamStats.global_rank || gamStats.rank || '—';
  const totalPoints = gamStats.total_points || 0;
  const quizHistory = Array.isArray(quizPerf?.quiz_history) ? quizPerf.quiz_history : [];
  const averageQuizScore = Number(quizPerf?.avg_score) || 0;
  const totalActs = (gamStats.total_chat_sessions || gamStats.total_ai_chats || 0) +
    (gamStats.total_notes_created || 0) +
    (gamStats.total_flashcards_created || 0) +
    (gamStats.total_quizzes_completed || gamStats.total_quizzes || 0);

  const breakdownColors = { ai_chats:'#3b82f6', notes:'#10b981', flashcards:'#f59e0b', quizzes:'#ef4444', battles:'#8b5cf6', other:'#6b7280' };
  const totalBkdn = useMemo(() => Object.values(breakdown).reduce((s, v) => s + (v.count || 0), 0), [breakdown]);
  const breakdownEntries = useMemo(() => Object.entries(breakdown)
    .filter(([, value]) => value.count > 0)
    .sort((a, b) => b[1].count - a[1].count), [breakdown]);
  const displayName =
    profile.firstName ||
    profile.first_name ||
    localStorage.getItem('cerbyl.displayName') ||
    (userName ? userName.split('@')[0] : 'Learner');
  const profilePhoto =
    profile.customPfp ||
    profile.picture ||
    profile.picture_url ||
    profile.photoURL ||
    profile.photo_url ||
    localStorage.getItem('cerbyl.customPfp') ||
    localStorage.getItem('cerbyl.defaultPfp') ||
    '';
  const initial = (displayName[0] || 'A').toUpperCase();

  const exportData = () => {
    const csv = [
      ['Date','Label','Points','Chats','Notes','Flashcards','Quizzes'].join(','),
      ...historicalData.map(d => [d.date, d.label||d.day, d.points, d.ai_chats, d.notes, d.flashcards, d.quizzes].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics_${timeRange}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const analyticsViews = [
    { value: 'overview', label: 'OVERVIEW', sidebarLabel: 'Overview', description: 'Momentum and activity', icon: Activity },
    { value: 'deep', label: 'DEEP STATS', sidebarLabel: 'Deep stats', description: 'Chat and recall detail', icon: BarChart3 },
    { value: 'ml', label: 'ML INSIGHTS', sidebarLabel: 'ML insights', description: 'Adaptive model signals', icon: Cpu },
  ];
  const handleViewKeyDown = (event, index) => {
    const navigationKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!navigationKeys.includes(event.key)) return;

    event.preventDefault();
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % analyticsViews.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + analyticsViews.length) % analyticsViews.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = analyticsViews.length - 1;

    const nextView = analyticsViews[nextIndex].value;
    setActiveTab(nextView);
    requestAnimationFrame(() => document.getElementById(`analytics-tab-${nextView}`)?.focus());
  };
  const sidebarSections = [
    {
      label: 'Analytics',
      items: analyticsViews.map(view => ({
        icon: view.icon,
        label: view.sidebarLabel,
        active: activeTab === view.value,
        onClick: () => setActiveTab(view.value),
      })),
    },
    {
      label: 'Create & study',
      items: [
        { icon: MessageSquare, label: 'AI Chat', onClick: () => navigate('/ai-chat') },
        { icon: Brain, label: 'Flashcards', onClick: () => navigate('/flashcards') },
        { icon: BookOpen, label: 'Notes', onClick: () => navigate('/notes') },
      ],
    },
    {
      label: 'Explore',
      items: [
        { icon: Search, label: 'Search Hub', onClick: () => navigate('/search-hub') },
        { icon: CircleHelp, label: 'Questions', onClick: () => navigate('/question-bank') },
        { icon: Presentation, label: 'Slides', onClick: () => navigate('/slide-explorer') },
        { icon: TriangleAlert, label: 'Weak Areas', onClick: () => navigate('/weaknesses') },
        { icon: History, label: 'Activity Timeline', onClick: () => navigate('/activity-timeline') },
      ],
    },
    {
      label: 'Learning system',
      items: [
        { icon: Trophy, label: 'XP Roadmap', onClick: () => navigate('/xp-roadmap') },
        { icon: Network, label: 'Knowledge Map', onClick: () => navigate('/knowledge-map') },
        { icon: GitBranch, label: 'Learning Paths', onClick: () => navigate('/learning-paths') },
      ],
    },
  ];
  const sidebarLead = (
    <button className="an-side-primary" type="button" onClick={exportData}>
      <Download size={15} />
      <span>Export report</span>
    </button>
  );
  const sidebarTail = (
    <button className="an-profile-card" type="button" onClick={() => navigate('/profile')}>
      <span className="an-profile-avatar">
        {profilePhoto ? <img src={profilePhoto} alt="" referrerPolicy="no-referrer" /> : initial}
      </span>
      <span className="an-profile-copy">
        <strong>{displayName}</strong>
        <small>Level {level} · {xp.toLocaleString()} XP</small>
      </span>
    </button>
  );

  if (loading) return (
    <div className="an-root with-social-chrome">
      <div className="an-bg" aria-hidden="true" />
      <SocialHubChrome brandKicker="Analytics" sideSections={sidebarSections} sidebarLead={sidebarLead} sidebarTail={sidebarTail}>
        <div className="an-loading" role="status" aria-live="polite">
          <div className="an-spin" /><p>Reading your learning signals</p>
        </div>
      </SocialHubChrome>
    </div>
  );

  return (
    <div className="an-root with-social-chrome">
      <div className="an-bg" aria-hidden="true" />
      <SocialHubChrome brandKicker="Analytics" sideSections={sidebarSections} sidebarLead={sidebarLead} sidebarTail={sidebarTail}>
      <main className="an-main">
        <header className="an-hero">
          <span className="an-hero-kicker">Learning intelligence</span>
          <h1>See the shape of your learning.</h1>
          <p>Follow momentum, find the habits that compound, and understand how Cerbyl adapts around you.</p>
        </header>

        <div className="an-mobile-tabs" role="tablist" aria-label="Analytics views">
          {analyticsViews.map(({ value, label, description, icon: Icon }, index) => (
            <button
              key={value}
              id={`analytics-tab-${value}`}
              type="button"
              role="tab"
              aria-selected={activeTab === value}
              aria-controls={`analytics-panel-${value}`}
              tabIndex={activeTab === value ? 0 : -1}
              className={`an-topbar-tab ${activeTab === value ? 'active' : ''}`}
              onClick={() => setActiveTab(value)}
              onKeyDown={(event) => handleViewKeyDown(event, index)}
            >
              <span className="an-tab-index">0{index + 1}</span>
              <Icon size={15} />
              <span className="an-tab-copy"><strong>{label}</strong><small>{description}</small></span>
            </button>
          ))}
        </div>
        <div className="an-toolbar">
          <div className="an-range-pills" aria-label="Analytics time range">
            {[['week','WEEK'],['month','MONTH'],['year','YEAR'],['all','ALL']].map(([v,l]) => (
              <button key={v} className={`an-pill ${timeRange===v?'active':''}`} aria-pressed={timeRange === v} onClick={() => setTimeRange(v)}>{l}</button>
            ))}
          </div>
          <span className="an-period-meta">{periodStats.totalActivities} activities · {periodStats.totalPoints.toLocaleString()} pts</span>
          <div className="an-topbar-actions">
          <button className="an-action-btn" onClick={exportData} aria-label="Export analytics data" title="Export analytics data"><Download size={13}/></button>
          <button className="an-action-btn" onClick={() => navigate('/xp-roadmap')} aria-label="Open XP roadmap" title="Open XP roadmap"><Trophy size={13}/></button>
          <ThemeSwitcher />
          </div>
        </div>

        {}
        {activeTab === 'overview' && (
          <div
            id="analytics-panel-overview"
            className="an-overview"
            role="tabpanel"
            aria-labelledby="analytics-tab-overview"
          >

            {}
            <div className="an-mega">
              <div className="an-mega-stat">
                <div className="an-mega-num">{streak}<span className="an-mega-unit">d</span></div>
                <div className="an-mega-lbl"><Flame size={11}/> STREAK</div>
              </div>
              <div className="an-mega-sep" />
              <div className="an-mega-stat">
                <div className="an-mega-num">{typeof rank === 'number' ? `#${rank}` : rank}</div>
                <div className="an-mega-lbl"><Trophy size={11}/> RANK</div>
              </div>
              <div className="an-mega-sep" />
              <div className="an-mega-stat an-mega-stat--accent">
                <div className="an-mega-num">{totalPoints.toLocaleString()}</div>
                <div className="an-mega-lbl"><Zap size={11}/> TOTAL XP</div>
              </div>
              <div className="an-mega-sep" />
              <div className="an-mega-stat">
                <div className="an-mega-num">{totalActs.toLocaleString()}</div>
                <div className="an-mega-lbl"><Activity size={11}/> ACTIVITIES</div>
              </div>
              <div className="an-mega-sep" />
              <div className="an-mega-stat">
                <div className="an-mega-num">{level}</div>
                <div className="an-mega-lbl"><Sparkles size={11}/> LEVEL</div>
              </div>
              {}
              <div className="an-mega-deco">ANALYTICS</div>
            </div>

            {}
            <div className="an-xp-bar">
              <div className="an-xp-meta">
                <span>LVL {level}</span>
                <div className="an-xp-track"><div className="an-xp-fill" style={{ width: `${xpPct}%` }}/></div>
                <span>{xp.toLocaleString()} / {nextXp.toLocaleString()} XP</span>
              </div>
            </div>

            {}
            {}
            <div className="an-section-label">
              <span className="an-sec-num">01</span>
              <span className="an-sec-title">ACTIVITY TREND</span>
              <span className="an-sec-line" />
            </div>

            <div className="an-trend-row">
              {}
              <div className="an-chart-card" onMouseLeave={() => setChartHover(null)}>
                <div className="an-chart-header">
                  <div>
                    <div className="an-chart-title">Points Over Time</div>
                    <div className="an-chart-sub">{historicalData.length} {periodStats.groupBy === 'month' ? 'months' : periodStats.groupBy === 'week' ? 'weeks' : 'days'}</div>
                  </div>
                  {chartHover && (
                    <div className="an-chart-tooltip-inline">
                      <span className="an-tt-label">{chartHover.label}</span>
                      <span className="an-tt-val">{chartHover.v} pts</span>
                    </div>
                  )}
                </div>
                {lineSvg ? (
                  <svg
                    viewBox={`0 0 ${lineSvg.W} ${lineSvg.H}`}
                    className="an-line-svg"
                    preserveAspectRatio="xMidYMid meet"
                    role="img"
                    aria-label="Points earned over time"
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const rx = e.clientX - rect.left;
                      const chartX = (rx / rect.width) * lineSvg.W;
                      const progress = Math.max(0, Math.min(1, (chartX - lineSvg.pL) / lineSvg.iW));
                      const idx = Math.round(progress * (lineSvg.pts.length - 1));
                      setChartHover(lineSvg.pts[Math.max(0, Math.min(idx, lineSvg.pts.length - 1))]);
                    }}
                  >
                    <defs>
                      <linearGradient id="an-area-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28"/>
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
                      </linearGradient>
                    </defs>
                    {lineSvg.yTicks.map(tick => (
                      <g key={tick.value}>
                        <line
                          x1={lineSvg.pL} y1={tick.y}
                          x2={lineSvg.W - lineSvg.pR} y2={tick.y}
                          className="an-chart-gridline"
                        />
                        <text x={lineSvg.pL - 10} y={tick.y + 3} textAnchor="end" className="an-axis-value">
                          {tick.value}
                        </text>
                      </g>
                    ))}
                    <path d={lineSvg.area} fill="url(#an-area-grad)"/>
                    <path className="an-line-path" d={lineSvg.path} fill="none" stroke="var(--accent)" strokeWidth="3"
                      strokeLinecap="round" strokeLinejoin="round"/>
                    {}
                    {lineSvg.pts.map((p, i) => {
                      const isHov = chartHover && chartHover.x === p.x;
                      const show = isHov || lineSvg.pts.length <= 10 || i === 0 || i === lineSvg.pts.length-1;
                      return show ? (
                        <g key={i}>
                          {isHov && <circle cx={p.x} cy={p.y} r="10" fill="var(--accent)" opacity="0.12"/>}
                          <circle cx={p.x} cy={p.y} r={isHov ? 5 : 3} fill="var(--accent)" opacity={isHov ? 1 : 0.85}/>
                        </g>
                      ) : null;
                    })}
                    {chartHover && (
                      <line className="an-chart-crosshair" x1={chartHover.x} y1={lineSvg.pT} x2={chartHover.x} y2={lineSvg.pT+lineSvg.iH}/>
                    )}
                    {}
                    {lineSvg.pts.filter((_, i) => lineSvg.pts.length <= 7 || i === 0 || i === lineSvg.pts.length-1 || (i % Math.ceil(lineSvg.pts.length/6) === 0)).map((p, i) => (
                      <text key={i} x={p.x} y={lineSvg.H-6} textAnchor="middle" className="an-axis-label">
                        {p.label}
                      </text>
                    ))}
                  </svg>
                ) : (
                  <div className="an-empty-chart"><BarChart3 size={28}/><p>No data for this period</p></div>
                )}
              </div>

              {}
              <div className="an-breakdown-card">
                <div className="an-chart-header">
                  <div>
                    <div className="an-chart-title">Activity Split</div>
                    <div className="an-chart-sub">{totalBkdn} total actions</div>
                  </div>
                  <span className="an-breakdown-total">{breakdownEntries.length} types</span>
                </div>
                {totalBkdn > 0 && (
                  <div className="an-bk-stack" aria-label="Activity distribution">
                    {breakdownEntries.map(([key, value]) => (
                      <span
                        key={key}
                        style={{
                          width: `${(value.count / totalBkdn) * 100}%`,
                          background: breakdownColors[key] || '#6b7280',
                        }}
                        title={`${value.label}: ${value.count}`}
                      />
                    ))}
                  </div>
                )}
                <div className="an-breakdown-rows">
                  {breakdownEntries.map(([key, v]) => {
                      const pct = totalBkdn > 0 ? (v.count / totalBkdn) * 100 : 0;
                      const col = breakdownColors[key] || '#6b7280';
                      return (
                        <div key={key} className="an-bk-row">
                          <div className="an-bk-meta">
                            <span className="an-bk-dot" style={{ background: col }}/>
                            <span className="an-bk-name">{v.label}</span>
                            <span className="an-bk-pct">{pct.toFixed(0)}%</span>
                            <span className="an-bk-count">{v.count}</span>
                          </div>
                          <div className="an-bk-track">
                            <div className="an-bk-fill" style={{ width: `${pct}%`, background: col }}/>
                          </div>
                        </div>
                      );
                    })}
                  {totalBkdn === 0 && <div className="an-empty-state">No activity yet</div>}
                </div>
              </div>
            </div>

            {}
            <div className="an-section-label">
              <span className="an-sec-num">02</span>
              <span className="an-sec-title">LEARNING GOALS</span>
              <span className="an-sec-line" />
            </div>

            <div className="an-rings-row">
              {[
                { label: 'AI CHATS', val: gamStats.total_chat_sessions || gamStats.total_ai_chats || 0, target: 100, col: '#3b82f6', icon: <MessageSquare size={14}/> },
                { label: 'NOTES', val: gamStats.total_notes_created || 0, target: 50, col: '#10b981', icon: <BookOpen size={14}/> },
                { label: 'FLASHCARDS', val: gamStats.total_flashcards_created || 0, target: 200, col: '#f59e0b', icon: <Brain size={14}/> },
                { label: 'QUIZZES', val: gamStats.total_quizzes_completed || gamStats.total_quizzes || 0, target: 50, col: '#ef4444', icon: <Target size={14}/> },
              ].map(r => {
                const pct = Math.min(100, r.target > 0 ? (r.val / r.target) * 100 : 0);
                const C = 2 * Math.PI * 52;
                const dash = (pct / 100) * C;
                return (
                  <div key={r.label} className="an-ring-card" style={{ '--an-series': r.col }}>
                    <div className="an-ring-visual">
                      <svg viewBox="0 0 128 128" className="an-ring-svg" role="img" aria-label={`${r.label}: ${pct.toFixed(0)} percent of goal`}>
                        <circle className="an-ring-track" cx="64" cy="64" r="52" strokeWidth="8" fill="none"/>
                        <circle className="an-ring-progress" cx="64" cy="64" r="52"
                          strokeWidth="8" fill="none"
                          strokeDasharray={`${dash.toFixed(2)} ${C.toFixed(2)}`}
                          strokeLinecap="round" transform="rotate(-90 64 64)"
                        />
                      </svg>
                      <div className="an-ring-center">
                        <strong>{r.val.toLocaleString()}</strong>
                        <span>{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="an-ring-meta">
                      <div className="an-ring-label"><span>{r.icon}</span><strong>{r.label}</strong></div>
                      <small>Goal {r.target.toLocaleString()}</small>
                    </div>
                  </div>
                );
              })}
            </div>

            {}
            <div className="an-section-label">
              <span className="an-sec-num">03</span>
              <span className="an-sec-title">THIS WEEK</span>
              <span className="an-sec-line" />
              <span className="an-sec-sub">{weeklyData.total_points || 0} pts earned</span>
            </div>

            <div className="an-weekly-row">
              {}
              <div className="an-weekly-card">
                <div className="an-chart-header">
                  <div>
                    <div className="an-chart-title">Daily Activity</div>
                    <div className="an-chart-sub">Actions by study tool</div>
                  </div>
                </div>
                {(weeklyData.daily_breakdown || []).length > 0 ? (
                  <div className="an-weekly-bars">
                  {(weeklyData.daily_breakdown || []).map((d, i) => {
                    const total = (d.ai_chats||0) + (d.notes||0) + (d.flashcards||0) + (d.quizzes||0);
                    const max = Math.max(1, ...(weeklyData.daily_breakdown||[]).map(x => (x.ai_chats||0)+(x.notes||0)+(x.flashcards||0)+(x.quizzes||0)));
                    const h = total > 0 ? (total / max) * 100 : 0;
                    return (
                      <div key={i} className="an-wbar-col">
                        <div className="an-wbar-track">
                          <div className="an-wbar-inner" style={{ height: `${h}%` }}>
                            {['quizzes','flashcards','notes','ai_chats'].map((key, ki) => {
                              const v = d[key] || 0;
                              const cols = { ai_chats:'#3b82f6', notes:'#10b981', flashcards:'#f59e0b', quizzes:'#ef4444' };
                              if (!v || !total) return null;
                              return <div key={key} className="an-wbar-seg" style={{ flex: v, background: cols[key] }}/>;
                            })}
                          </div>
                        </div>
                        <div className="an-wbar-pts">{d.points || 0}</div>
                        <div className="an-wbar-day">{(d.day||'').slice(0,1)}</div>
                      </div>
                    );
                  })}
                  </div>
                ) : (
                  <div className="an-empty-chart"><BarChart3 size={24}/><p>No activity recorded this week</p></div>
                )}
                {(weeklyData.daily_breakdown || []).length > 0 && (
                  <div className="an-wbar-legend">
                    {[['#3b82f6','Chats'],['#10b981','Notes'],['#f59e0b','Flash'],['#ef4444','Quiz']].map(([col,lbl]) => (
                      <span key={lbl} className="an-wbar-leg"><span style={{background:col}}/>{lbl}</span>
                    ))}
                  </div>
                )}
              </div>

              {}
              <div className="an-quiz-card">
                <div className="an-quiz-header">
                  <span className="an-chart-title">Quiz History</span>
                  <span className="an-quiz-avg">avg {averageQuizScore.toFixed(0)}%</span>
                </div>
                <div className="an-quiz-list">
                  {quizHistory.length === 0 ? (
                    <div className="an-empty-state">No quizzes taken yet</div>
                  ) : quizHistory.slice(-10).map((q, i) => {
                    const sc = q.total > 0 ? (q.score / q.total) * 100 : q.score;
                    const col = sc >= 80 ? '#10b981' : sc >= 60 ? '#f59e0b' : '#ef4444';
                    return (
                      <div key={i} className="an-quiz-item">
                        <div className="an-quiz-row">
                          <span className="an-quiz-topic">{q.topic || 'Quiz'}</span>
                          <span className="an-quiz-pct" style={{ color: col }}>{sc.toFixed(0)}%</span>
                        </div>
                        <div className="an-quiz-bar-bg">
                          <div className="an-quiz-bar-fill" style={{ width: `${Math.min(100,sc)}%`, background: col }}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {}
              <div className="an-weekstats">
                {[
                  { l:'Chats', v: weeklyData.weekly_stats?.ai_chats||0, all: gamStats.total_chat_sessions||gamStats.total_ai_chats||0, col:'#3b82f6', icon:<MessageSquare size={13}/> },
                  { l:'Notes', v: weeklyData.weekly_stats?.notes_created||0, all: gamStats.total_notes_created||0, col:'#10b981', icon:<BookOpen size={13}/> },
                  { l:'Flashcards', v: weeklyData.weekly_stats?.flashcards_created||0, all: gamStats.total_flashcards_created||0, col:'#f59e0b', icon:<Brain size={13}/> },
                  { l:'Quizzes', v: weeklyData.weekly_stats?.quizzes_completed||0, all: gamStats.total_quizzes_completed||gamStats.total_quizzes||0, col:'#ef4444', icon:<Target size={13}/> },
                  { l:'Study Time', v:`${Math.floor((weeklyData.weekly_stats?.study_minutes||0)/60)}h`, all:`${Math.floor((gamStats.total_study_minutes||0)/60)}h total`, col:'var(--accent)', icon:<Clock size={13}/> },
                  { l:'Points', v: gamStats.weekly_points||0, all: totalPoints, col:'var(--accent)', icon:<Zap size={13}/>, accent:true },
                ].map((s, i) => (
                  <div key={i} className={`an-ws-card ${s.accent?'an-ws-card--accent':''}`}>
                    <span className="an-ws-icon" style={{color:s.col}}>{s.icon}</span>
                    <span className="an-ws-val">{s.v}</span>
                    <span className="an-ws-lbl">{s.l}</span>
                    <span className="an-ws-all">{typeof s.all === 'number' ? s.all.toLocaleString() : s.all} all time</span>
                  </div>
                ))}
              </div>
            </div>

            {}
            <div className="an-section-label">
              <span className="an-sec-num">04</span>
              <span className="an-sec-title">POINT SYSTEM</span>
              <span className="an-sec-line" />
            </div>

            <div className="an-pts-grid">
              {[
                ['AI Chat','+1'],['Answer Question','+2'],['Battle Loss','+2'],
                ['Battle Draw','+5'],['Flashcard Set','+10'],['Battle Win','+10'],
                ['Complete Quiz','+15'],['Create Note','+20'],['Quiz 80%+','+30'],
                ['Solo Quiz (max)','+40'],['Study 1 Hour','+50'],
              ].map(([label, pts]) => (
                <div key={label} className="an-pts-item">
                  <span className="an-pts-label">{label}</span>
                  <span className="an-pts-val">{pts}</span>
                </div>
              ))}
            </div>

          </div>
        )}

        {}
        {activeTab === 'deep' && (
          <div
            id="analytics-panel-deep"
            className="an-deep"
            role="tabpanel"
            aria-labelledby="analytics-tab-deep"
          >
            {}
            <div className="an-section-label an-section-label--top">
              <span className="an-sec-num">01</span>
              <span className="an-sec-title">AI CHAT ANALYTICS</span>
              <span className="an-sec-line" />
            </div>
            <div className="an-deep-card">
              {chatDetails ? (
                <>
                  <div className="an-deep-metrics">
                    {[
                      {l:'Total Chats', v:chatDetails.total_chats||0, icon:<MessageSquare size={16}/>},
                      {l:'Avg Session', v:chatDetails.avg_session_length||'0m', icon:<Clock size={16}/>},
                      {l:'Most Active', v:chatDetails.most_active_day||'N/A', icon:<TrendingUp size={16}/>},
                      {l:'Msgs/Chat', v:chatDetails.avg_messages_per_chat||0, icon:<Sparkles size={16}/>},
                    ].map((s,i) => (
                      <div key={i} className="an-deep-metric">
                        <span className="an-dm-icon">{s.icon}</span>
                        <span className="an-dm-val">{s.v}</span>
                        <span className="an-dm-lbl">{s.l}</span>
                      </div>
                    ))}
                  </div>
                  {chatDetails.intent_breakdown && (
                    <div className="an-deep-section">
                      <div className="an-ds-title">Intent Breakdown</div>
                      {Object.entries(chatDetails.intent_breakdown).map(([intent, count]) => (
                        <div key={intent} className="an-ds-row">
                          <span className="an-ds-lbl">{intent}</span>
                          <div className="an-ds-bar-bg">
                            <div className="an-ds-bar-fill" style={{width:`${chatDetails.total_chats>0?(count/chatDetails.total_chats)*100:0}%`}}/>
                          </div>
                          <span className="an-ds-val">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {chatDetails.top_concepts?.length > 0 && (
                    <div className="an-deep-section">
                      <div className="an-ds-title">Top Concepts</div>
                      <div className="an-concept-cloud">
                        {chatDetails.top_concepts.map((c,i) => (
                          <span key={i} className="an-concept-chip">{c.name}<b>{c.count}</b></span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : <div className="an-spinner"><div className="an-spin"/><span>Loading...</span></div>}
            </div>

            {}
            <div className="an-section-label">
              <span className="an-sec-num">02</span>
              <span className="an-sec-title">FLASHCARD ANALYTICS</span>
              <span className="an-sec-line" />
            </div>
            <div className="an-deep-card">
              {flashDetails ? (
                <>
                  <div className="an-deep-metrics">
                    {[
                      {l:'Reviews', v:flashDetails.total_reviews||0, icon:<Brain size={16}/>},
                      {l:'Accuracy', v:flashDetails.accuracy_rate||'0%', icon:<CheckCircle size={16}/>},
                      {l:'Streak', v:`${flashDetails.study_streak||0}d`, icon:<Flame size={16}/>},
                      {l:'Mastered', v:flashDetails.mastered_cards||0, icon:<Trophy size={16}/>},
                    ].map((s,i) => (
                      <div key={i} className="an-deep-metric">
                        <span className="an-dm-icon">{s.icon}</span>
                        <span className="an-dm-val">{s.v}</span>
                        <span className="an-dm-lbl">{s.l}</span>
                      </div>
                    ))}
                  </div>
                  <div className="an-deep-metrics an-deep-metrics--3">
                    {[['Avg Retention',flashDetails.avg_retention||'0%'],['Due Today',flashDetails.cards_due_today||0],['Optimal Time',flashDetails.optimal_review_time||'N/A']].map(([l,v]) => (
                      <div key={l} className="an-fsrs-stat">
                        <span className="an-fsrs-val">{v}</span>
                        <span className="an-fsrs-lbl">{l}</span>
                      </div>
                    ))}
                  </div>
                  {flashDetails.difficulty_distribution && (
                    <div className="an-deep-section">
                      <div className="an-ds-title">Difficulty Distribution</div>
                      {Object.entries(flashDetails.difficulty_distribution).map(([lvl, count]) => {
                        const col = lvl==='easy'?'#10b981':lvl==='medium'?'#f59e0b':'#ef4444';
                        return (
                          <div key={lvl} className="an-ds-row">
                            <span className="an-ds-lbl" style={{textTransform:'capitalize'}}>{lvl}</span>
                            <div className="an-ds-bar-bg">
                              <div className="an-ds-bar-fill" style={{width:`${flashDetails.total_reviews>0?(count/flashDetails.total_reviews)*100:0}%`,background:col}}/>
                            </div>
                            <span className="an-ds-val">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : <div className="an-spinner"><div className="an-spin"/><span>Loading...</span></div>}
            </div>
          </div>
        )}

        {}
        {activeTab === 'ml' && (
          <div
            id="analytics-panel-ml"
            className="an-ml"
            role="tabpanel"
            aria-labelledby="analytics-tab-ml"
          >
            <div className="an-ml-hero">
              <Cpu size={36}/>
              <div>
                <h2>Machine Learning Transparency</h2>
                <p>Full visibility into how the AI adapts to your learning style</p>
              </div>
            </div>

            {mlStats ? (
              <>
                {}
                <div className="an-section-label an-section-label--top">
                  <span className="an-sec-num">01</span>
                  <span className="an-sec-title">BAYESIAN KNOWLEDGE TRACING</span>
                  <span className="an-sec-line" />
                </div>
                <div className="an-deep-card">
                  <div className="an-deep-metrics">
                    {[['Concepts',mlStats.bkt_concepts_tracked||0],['Updates',mlStats.bkt_total_updates||0],['Avg Mastery',mlStats.bkt_avg_mastery||'0%']].map(([l,v]) => (
                      <div key={l} className="an-deep-metric">
                        <span className="an-dm-val">{v}</span>
                        <span className="an-dm-lbl">{l}</span>
                      </div>
                    ))}
                  </div>
                  {mlStats.top_mastery_concepts?.map((c, i) => (
                    <div key={i} className="an-ds-row">
                      <span className="an-ds-lbl">{c.name}</span>
                      <div className="an-ds-bar-bg">
                        <div className="an-ds-bar-fill" style={{width:`${c.mastery*100}%`,background:c.mastery>0.7?'#10b981':c.mastery>0.4?'#f59e0b':'#ef4444'}}/>
                      </div>
                      <span className="an-ds-val">{Math.round(c.mastery*100)}%</span>
                    </div>
                  ))}
                  <div className="an-param-row">
                    {[['P(Learn)',mlStats.bkt_p_learn||'0.09','Per-interaction learning prob'],['P(Slip)',mlStats.bkt_p_slip||'0.10','Error despite knowledge'],['P(Guess)',mlStats.bkt_p_guess||'0.20','Correct despite no knowledge']].map(([n,v,d]) => (
                      <div key={n} className="an-param-card">
                        <span className="an-param-name">{n}</span>
                        <span className="an-param-val">{v}</span>
                        <span className="an-param-desc">{d}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {}
                <div className="an-section-label">
                  <span className="an-sec-num">02</span>
                  <span className="an-sec-title">RL STRATEGY AGENT</span>
                  <span className="an-sec-line" />
                </div>
                <div className="an-deep-card">
                  <div className="an-deep-metrics">
                    {[['Episodes',mlStats.rl_total_episodes||0],['Exploration',mlStats.rl_exploration_rate||'0%'],['Best Strategy',mlStats.rl_best_strategy||'N/A']].map(([l,v]) => (
                      <div key={l} className="an-deep-metric">
                        <span className="an-dm-val">{v}</span>
                        <span className="an-dm-lbl">{l}</span>
                      </div>
                    ))}
                  </div>
                  {mlStats.strategy_performance?.map((s,i) => (
                    <div key={i} className="an-strategy-row">
                      <span className="an-str-name">{s.name}</span>
                      <div className="an-str-stats">
                        <span>Uses: {s.use_count}</span>
                        <span>Success: {s.success_rate}%</span>
                        <span>Reward: {s.avg_reward.toFixed(3)}</span>
                      </div>
                    </div>
                  ))}
                  <div className="an-info-note"><Info size={14}/><p>Thompson Sampling balances exploration of new strategies vs. exploitation of proven ones.</p></div>
                </div>

                {}
                <div className="an-section-label">
                  <span className="an-sec-num">03</span>
                  <span className="an-sec-title">AFFECT DETECTION</span>
                  <span className="an-sec-line" />
                </div>
                <div className="an-deep-card">
                  <div className="an-affect-row">
                    {[{label:'Frustration',data:mlStats.frustration_trend,inv:true},{label:'Engagement',data:mlStats.engagement_trend,inv:false}].map(({label,data,inv}) => (
                      <div key={label} className="an-affect-chart">
                        <div className="an-affect-label">{label}</div>
                        <div className="an-trend-bars">
                          {(data||[]).map((v,i) => (
                            <div key={i} className="an-tbar-wrap">
                              <div className="an-tbar" style={{height:`${v*100}%`,background:inv?(v>0.6?'#ef4444':v>0.3?'#f59e0b':'#10b981'):(v>0.7?'#10b981':v>0.4?'#f59e0b':'#ef4444')}}/>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {mlStats.cognitive_state_distribution && (
                      <div className="an-cog-states">
                        <div className="an-ds-title">Cognitive States</div>
                        {Object.entries(mlStats.cognitive_state_distribution).map(([state, count]) => (
                          <div key={state} className="an-cog-chip">
                            <span>{state}</span>
                            <span className="an-cog-pct">{Math.round((count/(mlStats.total_ml_logs||1))*100)}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="an-transparency-note">
                  <AlertCircle size={14}/>
                  <span>All ML models train exclusively on your data and are never shared with third parties.</span>
                </div>
              </>
            ) : (
              <div className="an-spinner an-spinner--lg"><div className="an-spin"/><span>Loading ML insights...</span></div>
            )}
          </div>
        )}

      </main>
      </SocialHubChrome>
    </div>
  );
};

export default Analytics;
