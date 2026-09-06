import ToolNavigation from '../components/ToolNavigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw, Shield, Activity, AlertTriangle, CheckCircle2,
  Filter, Search, ChevronDown, ChevronUp, Server, Zap, Clock,
  TrendingUp, Ban, BarChart2, Radio
} from 'lucide-react';
import { API_URL } from '../config';
import './AdminRateLimits.css';

const ADMIN_EMAILS = ['aditya.s.lanka@gmail.com', 'asphar057@gmail.com'];

const TIER_COLORS = {
  ai_heavy:    '#f2ce88',
  ai_light:    '#93c5fd',
  file_upload: '#a78bfa',
  write:       '#6ee7b7',
  read:        '#94a3b8',
  auth_login:  '#f87171',
  auth_register: '#fb923c',
  auth_social: '#fbbf24',
};

const TIER_LABELS = {
  ai_heavy:    'AI Generation',
  ai_light:    'AI Search',
  file_upload: 'File Upload',
  write:       'Write',
  read:        'Read',
  auth_login:  'Auth Login',
  auth_register: 'Auth Register',
  auth_social: 'Auth Social',
};

const fmtTs = (ts) => {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const fmtRelative = (ts) => {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 5)  return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

const fmtReset = (resetAt) => {
  const diff = Math.max(0, resetAt - Math.floor(Date.now() / 1000));
  if (diff <= 0)  return 'now';
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0)  return `${h}h ${m}m`;
  if (m > 0)  return `${m}m ${s}s`;
  return `${s}s`;
};

const fmtWindow = (s) => {
  if (s >= 3600) return `${s / 3600}h`;
  if (s >= 60)   return `${s / 60}m`;
  return `${s}s`;
};

const fmtNum = (n) => Number(n || 0).toLocaleString();
const fmtMs = (n) => `${Number(n || 0).toFixed(1)}ms`;

const StatusBadge = ({ code, allowed }) => {
  if (!allowed || code === 429) return <span className="arl-badge arl-badge--blocked">429 Blocked</span>;
  if (code >= 500) return <span className="arl-badge arl-badge--error">{code} Error</span>;
  if (code >= 400) return <span className="arl-badge arl-badge--warn">{code}</span>;
  return <span className="arl-badge arl-badge--ok">{code}</span>;
};

const TierPill = ({ tier }) => (
  <span
    className="arl-tier-pill"
    style={{ background: `${TIER_COLORS[tier] || '#6b7280'}22`, color: TIER_COLORS[tier] || '#6b7280', borderColor: `${TIER_COLORS[tier] || '#6b7280'}44` }}
  >
    {TIER_LABELS[tier] || tier}
  </span>
);

const UsageBar = ({ pct, small }) => {
  const cls = pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : 'ok';
  return (
    <div className={`arl-bar ${small ? 'arl-bar--sm' : ''}`}>
      <div className={`arl-bar-fill arl-bar-fill--${cls}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, sub, accent }) => (
  <div className="arl-stat" style={accent ? { borderColor: `${accent}44` } : {}}>
    <div className="arl-stat-icon" style={accent ? { color: accent, background: `${accent}18` } : {}}>
      <Icon size={18} />
    </div>
    <div>
      <div className="arl-stat-value">{value}</div>
      <div className="arl-stat-label">{label}</div>
      {sub && <div className="arl-stat-sub">{sub}</div>}
    </div>
  </div>
);

const SortIcon = ({ field, current, dir }) => {
  if (current !== field) return <span className="arl-sort-icon">↕</span>;
  return <span className="arl-sort-icon arl-sort-icon--active">{dir === 'asc' ? '↑' : '↓'}</span>;
};

const AdminRateLimits = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  let userEmail = localStorage.getItem('username');
  try {
    const p = JSON.parse(localStorage.getItem('userProfile') || '{}');
    if (p.email) userEmail = p.email;
  } catch (e) { /* silenced */ }

  useEffect(() => {
    if (!ADMIN_EMAILS.includes(userEmail)) navigate('/dashboard');
  }, [userEmail, navigate]);

  const [tab, setTab] = useState('feed');
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [live, setLive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liveLoading, setLiveLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statsWindow, setStatsWindow] = useState(300);
  const [feedFilter, setFeedFilter] = useState({ blockedOnly: false, tier: '', user: '' });
  const [liveFilter, setLiveFilter] = useState({ tier: '', minPct: 0, search: '' });
  const [liveSort, setLiveSort] = useState({ field: 'pct', dir: 'desc' });
  const [feedSort, setFeedSort] = useState({ field: 'ts', dir: 'desc' });
  const [expanded, setExpanded] = useState(null);
  const intervalRef = useRef(null);
  const feedRef = useRef(null);

  const headers = { Authorization: `Bearer ${token}` };

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/admin/rate-limits/stats?window=${statsWindow}`, { headers });
      if (!r.ok) throw new Error('Statistics unavailable');
      setStats(await r.json());
    } catch (e) { setError('Monitoring data could not be refreshed. Displayed data may be stale. Use Refresh to retry.'); }
  }, [statsWindow, token]);

  const loadRecent = useCallback(async () => {
    const qs = new URLSearchParams({ limit: 250 });
    if (feedFilter.blockedOnly) qs.set('blocked_only', 'true');
    if (feedFilter.tier)  qs.set('tier', feedFilter.tier);
    if (feedFilter.user)  qs.set('user', feedFilter.user);
    try {
      const r = await fetch(`${API_URL}/admin/rate-limits/recent?${qs}`, { headers });
      if (!r.ok) throw new Error('Request feed unavailable');
      if (r.ok) {
        const d = await r.json();
        setRecent(d.requests || []);
      }
    } catch (e) { setError('Monitoring data could not be refreshed. Displayed data may be stale. Use Refresh to retry.'); }
  }, [feedFilter, token]);

  const loadLive = useCallback(async () => {
    setLiveLoading(true);
    try {
      const r = await fetch(`${API_URL}/admin/rate-limits/live`, { headers });
      if (!r.ok) throw new Error('Live quotas unavailable');
      setLive(await r.json());
    } catch (e) { setError('Monitoring data could not be refreshed. Displayed data may be stale. Use Refresh to retry.'); }
    setLiveLoading(false);
  }, [token]);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    setError('');
    try {
      await Promise.all([loadStats(), loadRecent(), loadLive()]);
    } catch (e) {
      setError('Failed to load rate limit data.');
    }
    if (!silent) setLoading(false);
    setRefreshing(false);
  }, [loadStats, loadRecent, loadLive]);

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    loadStats();
    loadRecent();
  }, [statsWindow, feedFilter]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoRefresh) {
      intervalRef.current = setInterval(() => loadAll(true), 4000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, loadAll]);

  const sortedLive = (() => {
    if (!live?.quotas) return [];
    let rows = live.quotas.filter(q => {
      if (liveFilter.tier && q.tier !== liveFilter.tier) return false;
      if (liveFilter.minPct > 0 && q.pct < liveFilter.minPct) return false;
      if (liveFilter.search && !q.identity.toLowerCase().includes(liveFilter.search.toLowerCase())) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => {
      const v = (x) => {
        if (liveSort.field === 'pct')    return x.pct;
        if (liveSort.field === 'used')   return x.used;
        if (liveSort.field === 'reset')  return x.reset_at;
        if (liveSort.field === 'tier')   return x.tier;
        return x.pct;
      };
      const diff = v(a) < v(b) ? -1 : v(a) > v(b) ? 1 : 0;
      return liveSort.dir === 'asc' ? diff : -diff;
    });
    return rows;
  })();

  const sortedFeed = (() => {
    let rows = [...recent];
    rows = rows.sort((a, b) => {
      const v = (x) => {
        if (feedSort.field === 'ts')       return x.ts;
        if (feedSort.field === 'dur')      return x.duration_ms;
        if (feedSort.field === 'status')   return x.status_code;
        return x.ts;
      };
      const diff = v(a) < v(b) ? -1 : v(a) > v(b) ? 1 : 0;
      return feedSort.dir === 'asc' ? diff : -diff;
    });
    return rows;
  })();

  const violations = recent.filter(r => !r.allowed);

  const toggleSort = (setter, field) => {
    setter(prev => ({
      field,
      dir: prev.field === field && prev.dir === 'desc' ? 'asc' : 'desc',
    }));
  };

  if (loading) {
    return (
      <div className="arl-root">
        <div className="arl-loading">
          <div className="arl-spinner" />
          <span>Loading rate limit tracker...</span>
        </div>
      </div>
    );
  }

  const tierOptions = Object.keys(TIER_LABELS);

  return (
    <div className="arl-root">
      <div style={{marginBottom: 16}}><ToolNavigation /></div>
      <header className="arl-header">
        <div className="arl-header-left">
          <div className="arl-kicker"><Shield size={13} /> Admin · Rate Limits</div>
          <h1>Request Tracker</h1>
          <p>Live per-user rate limit enforcement, request feed, and quota state.</p>
        </div>
        <div className="arl-header-right">
          <span className={`arl-live-dot ${autoRefresh ? 'arl-live-dot--on' : ''}`} />
          <button className="arl-btn-ghost" onClick={() => setAutoRefresh(v => !v)}>
            <Radio size={14} /> {autoRefresh ? 'Live' : 'Paused'}
          </button>
          <button className="arl-btn-ghost" onClick={() => loadAll()} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'arl-spin' : ''} /> Refresh
          </button>
          <a className="arl-btn-ghost" href="/admin/analytics">Analytics</a>
          <a className="arl-btn-ghost" href="/admin/api-usage">API Keys</a>
        </div>
      </header>

      {error && <div className="arl-error"><AlertTriangle size={16} />{error}</div>}

      <div className="arl-backend-bar">
        <Server size={13} />
        <span>Backend: <strong>{stats?.backend_id || live?.backend_id || '—'}</strong></span>
        <span className="arl-backend-sep" />
        <span>Tracked: <strong>{fmtNum(stats?.tracked_total)}</strong> entries (2h window)</span>
        {live?.quotas && <><span className="arl-backend-sep" /><span>Active quotas: <strong>{live.quotas.length}</strong></span></>}
        {live?.tier_windows && (
          <><span className="arl-backend-sep" />
          <span>
            {Object.entries(live.tier_windows).filter(([t]) => t.startsWith('ai')).map(([t, w]) => (
              <span key={t} className="arl-window-tag"><TierPill tier={t} /> {fmtWindow(w)} window</span>
            ))}
          </span></>
        )}
      </div>

      <section className="arl-stats-row">
        <StatCard icon={Activity}    label={`Requests (${fmtWindow(statsWindow)})`} value={fmtNum(stats?.total_requests)}    accent="#93c5fd" />
        <StatCard icon={Ban}         label="Blocked"                                value={fmtNum(stats?.blocked_requests)}   sub={`${stats?.block_rate_pct ?? 0}% block rate`} accent="#f87171" />
        <StatCard icon={Clock}       label="Avg Latency"                            value={fmtMs(stats?.avg_duration_ms)}     sub={`p95: ${fmtMs(stats?.p95_duration_ms)}`} accent="#a78bfa" />
        <StatCard icon={TrendingUp}  label="Top User"                               value={(stats?.top_users?.[0]?.user_id || '—').slice(0, 22)} sub={stats?.top_users?.[0] ? `${stats.top_users[0].count} reqs` : ''} accent="#f2ce88" />
        <StatCard icon={AlertTriangle} label="Top Violator"                          value={(stats?.top_violators?.[0]?.user_id || '—').slice(0, 22)} sub={stats?.top_violators?.[0] ? `${stats.top_violators[0].blocked} blocked` : ''} accent="#fb923c" />
        <div className="arl-stat arl-stat--window">
          <div className="arl-stat-label">Window</div>
          <select className="arl-select" value={statsWindow} onChange={e => setStatsWindow(Number(e.target.value))}>
            <option value={60}>1 min</option>
            <option value={300}>5 min</option>
            <option value={900}>15 min</option>
            <option value={3600}>1 hour</option>
            <option value={86400}>24 hours</option>
          </select>
        </div>
      </section>

      {stats?.by_tier && Object.keys(stats.by_tier).length > 0 && (
        <section className="arl-tier-breakdown">
          <div className="arl-section-title"><BarChart2 size={14} /> By Tier</div>
          <div className="arl-tier-grid">
            {Object.entries(stats.by_tier).map(([tier, d]) => (
              <div key={tier} className="arl-tier-card" style={{ borderColor: `${TIER_COLORS[tier] || '#6b7280'}44` }}>
                <TierPill tier={tier} />
                <div className="arl-tier-nums">
                  <span className="arl-tier-total">{fmtNum(d.total)}</span>
                  {d.blocked > 0 && <span className="arl-tier-blocked">·{fmtNum(d.blocked)} blocked</span>}
                </div>
                <UsageBar pct={d.total > 0 ? Math.round(d.blocked / d.total * 100) : 0} small />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="arl-tabs">
        {[
          { id: 'feed',       label: 'Request Feed',   icon: Activity,  badge: recent.length },
          { id: 'live',       label: 'Live Quotas',    icon: Zap,       badge: live?.quotas?.length },
          { id: 'violations', label: 'Violations',     icon: Ban,       badge: violations.length },
          { id: 'users',      label: 'Top Users',      icon: TrendingUp },
        ].map(t => (
          <button
            key={t.id}
            className={`arl-tab ${tab === t.id ? 'arl-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={14} />
            {t.label}
            {t.badge > 0 && <span className="arl-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === 'feed' && (
        <section className="arl-panel">
          <div className="arl-filter-bar">
            <div className="arl-filter-group">
              <Search size={13} />
              <input
                className="arl-input"
                placeholder="Filter by user / IP..."
                value={feedFilter.user}
                onChange={e => setFeedFilter(f => ({ ...f, user: e.target.value }))}
              />
            </div>
            <div className="arl-filter-group">
              <Filter size={13} />
              <select className="arl-select" value={feedFilter.tier} onChange={e => setFeedFilter(f => ({ ...f, tier: e.target.value }))}>
                <option value="">All tiers</option>
                {tierOptions.map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
              </select>
            </div>
            <label className="arl-toggle-label">
              <input type="checkbox" checked={feedFilter.blockedOnly} onChange={e => setFeedFilter(f => ({ ...f, blockedOnly: e.target.checked }))} />
              Blocked only
            </label>
            <span className="arl-filter-count">{sortedFeed.length} requests</span>
          </div>

          <div className="arl-table-wrap" ref={feedRef}>
            <table className="arl-table">
              <thead>
                <tr>
                  <th onClick={() => toggleSort(setFeedSort, 'ts')} className="arl-th-sort">
                    Time <SortIcon field="ts" current={feedSort.field} dir={feedSort.dir} />
                  </th>
                  <th>User / IP</th>
                  <th>Method + Path</th>
                  <th>Tier</th>
                  <th onClick={() => toggleSort(setFeedSort, 'status')} className="arl-th-sort">
                    Status <SortIcon field="status" current={feedSort.field} dir={feedSort.dir} />
                  </th>
                  <th>Used/Limit</th>
                  <th onClick={() => toggleSort(setFeedSort, 'dur')} className="arl-th-sort">
                    Latency <SortIcon field="dur" current={feedSort.field} dir={feedSort.dir} />
                  </th>
                  <th>Backend</th>
                  <th>Plan</th>
                </tr>
              </thead>
              <tbody>
                {sortedFeed.length === 0 && (
                  <tr><td colSpan={9} className="arl-empty">No requests match the current filter.</td></tr>
                )}
                {sortedFeed.map(r => (
                  <>
                    <tr
                      key={r.id}
                      className={`arl-row ${!r.allowed ? 'arl-row--blocked' : ''} ${expanded === r.id ? 'arl-row--expanded' : ''}`}
                      onClick={() => setExpanded(prev => prev === r.id ? null : r.id)}
                    >
                      <td className="arl-td-time">
                        <span className="arl-ts-abs">{fmtTs(r.ts)}</span>
                        <span className="arl-ts-rel">{fmtRelative(r.ts)}</span>
                      </td>
                      <td className="arl-td-user" title={r.user_id}>{r.user_id?.slice(0, 28)}</td>
                      <td className="arl-td-path">
                        <span className="arl-method">{r.method}</span>
                        <span className="arl-path" title={r.path}>{r.path}</span>
                      </td>
                      <td>{r.tier ? <TierPill tier={r.tier} /> : '—'}</td>
                      <td><StatusBadge code={r.status_code} allowed={r.allowed} /></td>
                      <td className="arl-td-quota">
                        {r.limit > 0 ? (
                          <>
                            <span className="arl-quota-num">{r.used}/{r.limit}</span>
                            <UsageBar pct={r.limit > 0 ? Math.round(r.used / r.limit * 100) : 0} small />
                          </>
                        ) : <span className="arl-muted">unlimited</span>}
                      </td>
                      <td className="arl-td-dur">{fmtMs(r.duration_ms)}</td>
                      <td className="arl-td-backend"><span className="arl-backend-tag">{r.backend_id || '—'}</span></td>
                      <td><span className="arl-plan-tag">{r.plan || '—'}</span></td>
                    </tr>
                    {expanded === r.id && (
                      <tr key={`${r.id}-detail`} className="arl-row-detail">
                        <td colSpan={9}>
                          <div className="arl-detail-grid">
                            <div><span>Full path</span><code>{r.path}</code></div>
                            <div><span>Full user</span><code>{r.user_id}</code></div>
                            <div><span>IP</span><code>{r.ip}</code></div>
                            <div><span>Timestamp</span><code>{new Date(r.ts * 1000).toISOString()}</code></div>
                            <div><span>Tier</span><code>{r.tier || '—'}</code></div>
                            <div><span>Plan</span><code>{r.plan}</code></div>
                            <div><span>Backend</span><code>{r.backend_id}</code></div>
                            <div><span>Duration</span><code>{r.duration_ms}ms</code></div>
                            <div><span>Used / Limit</span><code>{r.used} / {r.limit}</code></div>
                            <div><span>Allowed</span><code>{String(r.allowed)}</code></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'live' && (
        <section className="arl-panel">
          <div className="arl-filter-bar">
            <div className="arl-filter-group">
              <Search size={13} />
              <input
                className="arl-input"
                placeholder="Search identity..."
                value={liveFilter.search}
                onChange={e => setLiveFilter(f => ({ ...f, search: e.target.value }))}
              />
            </div>
            <div className="arl-filter-group">
              <Filter size={13} />
              <select className="arl-select" value={liveFilter.tier} onChange={e => setLiveFilter(f => ({ ...f, tier: e.target.value }))}>
                <option value="">All tiers</option>
                {tierOptions.map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
              </select>
            </div>
            <div className="arl-filter-group">
              <span className="arl-filter-label">Min %</span>
              <input
                className="arl-input arl-input--sm"
                type="number"
                min={0} max={100}
                value={liveFilter.minPct}
                onChange={e => setLiveFilter(f => ({ ...f, minPct: Number(e.target.value) }))}
              />
            </div>
            <span className="arl-filter-count">{sortedLive.length} active keys · {liveLoading ? 'refreshing...' : ''}</span>
          </div>

          {live?.plan_limits && (
            <div className="arl-plan-legend">
              {Object.entries(live.plan_limits).map(([planId, limits]) => (
                <div key={planId} className="arl-plan-legend-card">
                  <strong>{planId}</strong>
                  {Object.entries(limits).filter(([t]) => t.startsWith('ai')).map(([t, lim]) => (
                    <span key={t}><TierPill tier={t} /> {lim}/{fmtWindow(live.tier_windows?.[t] || 3600)}</span>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="arl-table-wrap">
            <table className="arl-table">
              <thead>
                <tr>
                  <th>Identity</th>
                  <th onClick={() => toggleSort(setLiveSort, 'tier')} className="arl-th-sort">
                    Tier <SortIcon field="tier" current={liveSort.field} dir={liveSort.dir} />
                  </th>
                  <th onClick={() => toggleSort(setLiveSort, 'used')} className="arl-th-sort">
                    Used <SortIcon field="used" current={liveSort.field} dir={liveSort.dir} />
                  </th>
                  <th>Limit</th>
                  <th onClick={() => toggleSort(setLiveSort, 'pct')} className="arl-th-sort">
                    % Used <SortIcon field="pct" current={liveSort.field} dir={liveSort.dir} />
                  </th>
                  <th>Progress</th>
                  <th onClick={() => toggleSort(setLiveSort, 'reset')} className="arl-th-sort">
                    Resets In <SortIcon field="reset" current={liveSort.field} dir={liveSort.dir} />
                  </th>
                  <th>Window</th>
                  <th>Store</th>
                  <th>Backend</th>
                </tr>
              </thead>
              <tbody>
                {sortedLive.length === 0 && (
                  <tr><td colSpan={10} className="arl-empty">No active quota keys in range.</td></tr>
                )}
                {sortedLive.map((q, i) => (
                  <tr key={i} className={`arl-row ${q.pct >= 90 ? 'arl-row--danger' : q.pct >= 70 ? 'arl-row--warn' : ''}`}>
                    <td className="arl-td-user" title={q.identity}>{q.identity.slice(0, 36)}</td>
                    <td><TierPill tier={q.tier} /></td>
                    <td className="arl-td-num">{q.used}</td>
                    <td className="arl-td-num">{q.limit}</td>
                    <td className="arl-td-num">
                      <span className={q.pct >= 90 ? 'arl-pct-danger' : q.pct >= 70 ? 'arl-pct-warn' : ''}>{q.pct}%</span>
                    </td>
                    <td className="arl-td-bar"><UsageBar pct={q.pct} /></td>
                    <td className="arl-td-reset">{fmtReset(q.reset_at)}</td>
                    <td className="arl-td-window">{fmtWindow(q.window_seconds)}</td>
                    <td><span className={`arl-store-tag arl-store-tag--${q.store}`}>{q.store}</span></td>
                    <td><span className="arl-backend-tag">{q.backend_id || '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'violations' && (
        <section className="arl-panel">
          <div className="arl-violations-header">
            <Ban size={16} className="arl-violations-icon" />
            <span>{violations.length} blocked requests in current feed window</span>
          </div>
          <div className="arl-table-wrap">
            <table className="arl-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User / IP</th>
                  <th>Path</th>
                  <th>Tier</th>
                  <th>Used / Limit</th>
                  <th>Plan</th>
                  <th>Backend</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {violations.length === 0 && (
                  <tr><td colSpan={8} className="arl-empty"><CheckCircle2 size={14} /> No violations in current window.</td></tr>
                )}
                {violations.map(r => (
                  <tr key={r.id} className="arl-row arl-row--blocked">
                    <td className="arl-td-time">
                      <span className="arl-ts-abs">{fmtTs(r.ts)}</span>
                      <span className="arl-ts-rel">{fmtRelative(r.ts)}</span>
                    </td>
                    <td className="arl-td-user" title={r.user_id}>{r.user_id?.slice(0, 32)}</td>
                    <td className="arl-td-path">
                      <span className="arl-method">{r.method}</span>
                      <span className="arl-path" title={r.path}>{r.path}</span>
                    </td>
                    <td>{r.tier ? <TierPill tier={r.tier} /> : '—'}</td>
                    <td className="arl-td-num">{r.used}/{r.limit}</td>
                    <td><span className="arl-plan-tag">{r.plan}</span></td>
                    <td><span className="arl-backend-tag">{r.backend_id}</span></td>
                    <td className="arl-muted">{r.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'users' && (
        <section className="arl-panel">
          <div className="arl-users-grid">
            <div className="arl-users-col">
              <div className="arl-col-title"><TrendingUp size={14} /> Top Requesters ({fmtWindow(statsWindow)})</div>
              <table className="arl-table">
                <thead><tr><th>#</th><th>User / IP</th><th>Requests</th><th>Bar</th></tr></thead>
                <tbody>
                  {(stats?.top_users || []).map((u, i) => (
                    <tr key={u.user_id} className="arl-row">
                      <td className="arl-td-rank">{i + 1}</td>
                      <td className="arl-td-user" title={u.user_id}>{u.user_id.slice(0, 36)}</td>
                      <td className="arl-td-num">{fmtNum(u.count)}</td>
                      <td className="arl-td-bar">
                        <UsageBar pct={stats.top_users[0]?.count > 0 ? Math.round(u.count / stats.top_users[0].count * 100) : 0} small />
                      </td>
                    </tr>
                  ))}
                  {(!stats?.top_users?.length) && <tr><td colSpan={4} className="arl-empty">No data.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="arl-users-col">
              <div className="arl-col-title"><Ban size={14} /> Top Violators ({fmtWindow(statsWindow)})</div>
              <table className="arl-table">
                <thead><tr><th>#</th><th>User / IP</th><th>Blocked</th><th>Bar</th></tr></thead>
                <tbody>
                  {(stats?.top_violators || []).map((u, i) => (
                    <tr key={u.user_id} className="arl-row arl-row--blocked-mild">
                      <td className="arl-td-rank">{i + 1}</td>
                      <td className="arl-td-user" title={u.user_id}>{u.user_id.slice(0, 36)}</td>
                      <td className="arl-td-num">{fmtNum(u.blocked)}</td>
                      <td className="arl-td-bar">
                        <UsageBar pct={stats.top_violators[0]?.blocked > 0 ? Math.round(u.blocked / stats.top_violators[0].blocked * 100) : 0} small />
                      </td>
                    </tr>
                  ))}
                  {(!stats?.top_violators?.length) && <tr><td colSpan={4} className="arl-empty">No violations.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="arl-users-col">
              <div className="arl-col-title"><Server size={14} /> By Backend</div>
              <table className="arl-table">
                <thead><tr><th>Backend</th><th>Requests</th><th>Share</th></tr></thead>
                <tbody>
                  {Object.entries(stats?.by_backend || {}).map(([bid, count]) => {
                    const total = Object.values(stats.by_backend).reduce((a, b) => a + b, 0);
                    const pct = total > 0 ? Math.round(count / total * 100) : 0;
                    return (
                      <tr key={bid} className="arl-row">
                        <td><span className="arl-backend-tag">{bid}</span></td>
                        <td className="arl-td-num">{fmtNum(count)}</td>
                        <td className="arl-td-bar">
                          <div className="arl-bar-inline"><UsageBar pct={pct} small /><span>{pct}%</span></div>
                        </td>
                      </tr>
                    );
                  })}
                  {(!stats?.by_backend || Object.keys(stats.by_backend).length === 0) && <tr><td colSpan={3} className="arl-empty">No data.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default AdminRateLimits;
