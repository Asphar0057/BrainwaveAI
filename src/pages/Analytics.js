import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download, Zap, BookOpen, MessageSquare, Plus,
  Trophy, Target, Flame, Clock, Brain, Cpu, Database, LayoutDashboard,
  Network, Sparkles, TrendingUp, TrendingDown, CheckCircle,
  Layers, GitBranch, Info, AlertCircle, BarChart3, Activity
} from 'lucide-react';
import './Analytics.css';
import '../components/SocialHubChrome.css';
import { API_URL } from '../config';
import ThemeSwitcher from '../components/ThemeSwitcher';

const CACHE_TTL = 5 * 1000;
const CLIENT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

const SIDE_LINKS = [
  { label: 'Search Hub', route: '/search-hub' },
  { label: 'Knowledge Map', route: '/knowledge-map' },
  { label: 'Questions', route: '/question-bank' },
  { label: 'Slides', route: '/slide-explorer' },
  { label: 'Weak Areas', route: '/weaknesses' },
  { label: 'Social Hub', route: '/social' },
  { label: 'Activity Timeline', route: '/activity-timeline' },
  { label: 'Learning Path', route: '/learning-paths' },
  { label: 'XP Roadmap', route: '/xp-roadmap' }
];

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

const Analytics = () => {
  const navigate = useNavigate();
  const userName = localStorage.getItem('username') || '';
  const chartRef = useRef(null);
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
    const W = 800, H = 200, pL = 0, pR = 0, pT = 20, pB = 30;
    const iW = W - pL - pR, iH = H - pT - pB;
    const maxV = Math.max(1, ...historicalData.map(d => d.points || 0));
    const step = iW / Math.max(1, historicalData.length - 1);
    const pts = historicalData.map((d, i) => ({
      x: pL + i * step,
      y: pT + iH - ((d.points || 0) / maxV) * iH,
      v: d.points || 0,
      label: d.label || d.day || '',
      date: d.date || '',
    }));
    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area = pts.length > 1
      ? `${path} L ${pts[pts.length-1].x},${pT+iH} L ${pts[0].x},${pT+iH} Z`
      : '';
    return { W, H, pT, pB, iH, pts, path, area };
  }, [historicalData]);

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
  };

  if (loading) return (
    <div className="an-root">
      <div className="shc-topbar">
        <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
        <div className="shc-topbar-right">
          <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
        </div>
      </div>
      <div className="an-loading">
        <div className="an-spin" /><p>LOADING</p>
      </div>
    </div>
  );

  return (
    <div className="an-root">
      {}
      <div className="an-bg" aria-hidden>
        <div className="an-orb an-orb-1" />
        <div className="an-orb an-orb-2" />
        <div className="an-orb an-orb-3" />
        <div className="an-grid-texture" />
      </div>

      <div className="shc-topbar">
        <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
        <div className="shc-topbar-right">
          <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
        </div>
      </div>

      <div className="an-shell">
        <aside className="an-side" aria-label="Activity navigation">
          <div className="an-side-brand">cerbyl</div>

          <button className="an-side-avatar" onClick={() => navigate('/profile')} aria-label="Open profile">
            {profilePhoto ? (
              <img src={profilePhoto} alt={`${displayName} profile`} referrerPolicy="no-referrer" />
            ) : (
              <span>{initial}</span>
            )}
          </button>

          <div className="an-side-sections">
            {[
              { label: 'AI Chat', route: '/ai-chat' },
              { label: 'Flashcards', route: '/flashcards' },
              { label: 'Notes', route: '/notes' }
            ].map((item) => (
              <button key={item.label} className="an-side-section" onClick={() => navigate(item.route)}>
                <span className="an-side-dot" />
                <span>{item.label}</span>
                <Plus size={13} strokeWidth={2.4} />
              </button>
            ))}
          </div>

          <nav className="an-side-nav" aria-label="Learning hub links">
            {SIDE_LINKS.map((link) => (
              <button key={link.label} className="an-side-link" onClick={() => navigate(link.route)}>
                <span className="an-side-link-dot" />
                {link.label}
              </button>
            ))}
          </nav>

          <button className="an-side-user" onClick={() => navigate('/profile')}>
            <span className="an-side-user-name">{displayName}</span>
            <span className="an-side-user-sub">Level {level} &middot; {xp.toLocaleString()} XP</span>
          </button>
        </aside>

      <main className="an-main">
        {}
        <div className="an-mobile-tabs">
          {[['overview','OVERVIEW'],['deep','DEEP STATS'],['ml','ML INSIGHTS']].map(([v,l]) => (
            <button key={v} className={`an-topbar-tab ${activeTab===v?'active':''}`} onClick={() => setActiveTab(v)}>{l}</button>
          ))}
        </div>
        <div className="an-topbar-actions" style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:'8px',marginBottom:'12px'}}>
          <button className="an-action-btn an-action-btn--text" onClick={() => navigate('/dashboard-cerbyl')} aria-label="Open dashboard" title="Open dashboard">
            <LayoutDashboard size={13}/>
            <span>Dashboard</span>
          </button>
          <button className="an-action-btn" onClick={exportData} aria-label="Export analytics data" title="Export analytics data"><Download size={13}/></button>
          <button className="an-action-btn" onClick={() => navigate('/xp-roadmap')} aria-label="Open XP roadmap" title="Open XP roadmap"><Trophy size={13}/></button>
          <ThemeSwitcher />
        </div>

        {}
        {activeTab === 'overview' && (
          <div className="an-overview">

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
            <div className="an-controls">
              <div className="an-range-pills">
                {[['week','WEEK'],['month','MONTH'],['year','YEAR'],['all','ALL']].map(([v,l]) => (
                  <button key={v} className={`an-pill ${timeRange===v?'active':''}`} onClick={() => setTimeRange(v)}>{l}</button>
                ))}
              </div>
              <span className="an-period-meta">
                {periodStats.totalActivities} activities · {periodStats.totalPoints.toLocaleString()} pts
              </span>
            </div>

            {}
            <div className="an-section-label">
              <span className="an-sec-num">01</span>
              <span className="an-sec-title">ACTIVITY TREND</span>
              <span className="an-sec-line" />
            </div>

            <div className="an-trend-row">
              {}
              <div className="an-chart-card" ref={chartRef} onMouseLeave={() => setChartHover(null)}>
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
                    preserveAspectRatio="none"
                    onMouseMove={(e) => {
                      if (!chartRef.current || !lineSvg) return;
                      const rect = chartRef.current.getBoundingClientRect();
                      const rx = e.clientX - rect.left;
                      const idx = Math.round((rx / rect.width) * (lineSvg.pts.length - 1));
                      setChartHover(lineSvg.pts[Math.max(0, Math.min(idx, lineSvg.pts.length - 1))]);
                    }}
                  >
                    <defs>
                      <linearGradient id="an-area-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28"/>
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
                      </linearGradient>
                      <filter id="an-glow">
                        <feGaussianBlur stdDeviation="2.5" result="blur"/>
                        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                      </filter>
                    </defs>
                    {}
                    {[0.25, 0.5, 0.75, 1].map((f, i) => (
                      <line key={i}
                        x1={0} y1={lineSvg.pT + lineSvg.iH * (1-f)}
                        x2={lineSvg.W} y2={lineSvg.pT + lineSvg.iH * (1-f)}
                        stroke="rgba(255,255,255,0.04)" strokeWidth="1"
                      />
                    ))}
                    <path d={lineSvg.area} fill="url(#an-area-grad)"/>
                    <path d={lineSvg.path} fill="none" stroke="var(--accent)" strokeWidth="2.5"
                      strokeLinecap="round" strokeLinejoin="round" filter="url(#an-glow)"/>
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
                      <line x1={chartHover.x} y1={lineSvg.pT} x2={chartHover.x} y2={lineSvg.pT+lineSvg.iH}
                        stroke="var(--accent)" strokeWidth="1" strokeDasharray="4 3" opacity="0.4"/>
                    )}
                    {}
                    {lineSvg.pts.filter((_, i) => lineSvg.pts.length <= 7 || i === 0 || i === lineSvg.pts.length-1 || (i % Math.ceil(lineSvg.pts.length/6) === 0)).map((p, i) => (
                      <text key={i} x={p.x} y={lineSvg.H-6} textAnchor="middle" className="an-axis-label">
                        {(p.label || '').slice(0,3).toUpperCase()}
                      </text>
                    ))}
                  </svg>
                ) : (
                  <div className="an-empty-chart"><BarChart3 size={28}/><p>No data for this period</p></div>
                )}
              </div>

              {}
              <div className="an-breakdown-card">
                <div className="an-chart-title">Activity Split</div>
                <div className="an-chart-sub">{totalBkdn} total actions</div>
                <div className="an-breakdown-rows">
                  {Object.entries(breakdown)
                    .filter(([, v]) => v.count > 0)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([key, v]) => {
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
              <span className="an-sec-title">PROGRESS RINGS</span>
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
                  <div key={r.label} className="an-ring-card">
                    <div className="an-ring-deco" style={{ color: r.col }}>{r.icon}</div>
                    <svg viewBox="0 0 128 128" className="an-ring-svg">
                      <defs>
                        <filter id={`glow-${r.label}`}>
                          <feGaussianBlur stdDeviation="3" result="blur"/>
                          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                      </defs>
                      <circle cx="64" cy="64" r="52" stroke="rgba(255,255,255,0.05)" strokeWidth="8" fill="none"/>
                      <circle cx="64" cy="64" r="52"
                        stroke={r.col} strokeWidth="8" fill="none"
                        strokeDasharray={`${dash.toFixed(2)} ${C.toFixed(2)}`}
                        strokeLinecap="round" transform="rotate(-90 64 64)"
                        filter={`url(#glow-${r.label})`}
                      />
                    </svg>
                    <div className="an-ring-num">{r.val.toLocaleString()}</div>
                    <div className="an-ring-pct" style={{ color: r.col }}>{pct.toFixed(0)}%</div>
                    <div className="an-ring-lbl">{r.label}</div>
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
                <div className="an-wbar-legend">
                  {[['#3b82f6','Chats'],['#10b981','Notes'],['#f59e0b','Flash'],['#ef4444','Quiz']].map(([col,lbl]) => (
                    <span key={lbl} className="an-wbar-leg"><span style={{background:col}}/>{lbl}</span>
                  ))}
                </div>
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
          <div className="an-deep">
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
          <div className="an-ml">
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
      </div>
    </div>
  );
};

export default Analytics;
