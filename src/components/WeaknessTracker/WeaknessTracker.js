import { useState, useEffect, useCallback } from 'react';
import './WeaknessTracker.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const MASTERY_COLORS = {
  deep_red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  light_green: '#86efac',
  bright_green: '#22c55e',
};

const SOURCE_ICONS = { flashcard: '🃏', chat: '💬', quiz: '📝', roadmap: '🗺️' };
const TREND_ICONS = { improving: '↑', declining: '↓', stable: '→' };

function SvgBarChart({ data = [], dataKey = 'interactions', labelKey = 'date', height = 150 }) {
  if (!data.length) return <p className="wt-empty">No activity data.</p>;
  const W = 100; 
  const total = data.length;
  const maxVal = Math.max(...data.map(d => d[dataKey] || 0), 1);
  const vbWidth = total * W;
  const vbHeight = height;
  const barW = W * 0.6;
  const barOff = (W - barW) / 2;

  return (
    <svg viewBox={`0 0 ${vbWidth} ${vbHeight}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      {data.map((d, i) => {
        const val = d[dataKey] || 0;
        const barH = (val / maxVal) * (vbHeight - 30);
        const x = i * W + barOff;
        const y = vbHeight - 20 - barH;
        const label = String(d[labelKey] || '').slice(5); 
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH}
              fill="var(--accent)" rx={3} opacity={0.85} />
            <text x={i * W + W / 2} y={vbHeight - 4} textAnchor="middle"
              fontSize={10} fill="var(--text-secondary)">{label}</text>
            {val > 0 && (
              <text x={i * W + W / 2} y={y - 3} textAnchor="middle"
                fontSize={9} fill="var(--text-secondary)">{val}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function SvgLineChart({ data = [], dataKey = 'avg_p_mastery', labelKey = 'date', height = 220 }) {
  if (!data.length) return <p className="wt-empty">No trend data yet.</p>;
  const VW = 500;
  const VH = height;
  const PAD = { top: 10, right: 10, bottom: 30, left: 36 };
  const innerW = VW - PAD.left - PAD.right;
  const innerH = VH - PAD.top - PAD.bottom;

  const vals = data.map(d => d[dataKey] || 0);
  const minV = 0;
  const maxV = 1;

  const toX = i => PAD.left + (i / (data.length - 1 || 1)) * innerW;
  const toY = v => PAD.top + innerH - ((v - minV) / (maxV - minV)) * innerH;

  const pts = data.map((d, i) => `${toX(i)},${toY(d[dataKey] || 0)}`).join(' ');
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      {yTicks.map(v => (
        <g key={v}>
          <line x1={PAD.left} x2={VW - PAD.right}
            y1={toY(v)} y2={toY(v)}
            stroke="var(--border-color, rgba(255,255,255,0.08))" strokeWidth={1} />
          <text x={PAD.left - 4} y={toY(v) + 4} textAnchor="end"
            fontSize={9} fill="var(--text-secondary)">{Math.round(v * 100)}%</text>
        </g>
      ))}
      <polyline points={pts} fill="none"
        stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={toX(i)} cy={toY(d[dataKey] || 0)} r={3}
            fill="var(--accent)" />
          {i % Math.ceil(data.length / 6) === 0 && (
            <text x={toX(i)} y={VH - PAD.bottom + 14} textAnchor="middle"
              fontSize={9} fill="var(--text-secondary)">
              {String(d[labelKey] || '').slice(5)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

function SvgPieChart({ data = [], height = 220 }) {
  if (!data.length) return <p className="wt-empty">No data.</p>;
  const total = data.reduce((s, d) => s + (d.value || 0), 0) || 1;
  const R = 70;
  const cx = 110;
  const cy = height / 2;

  let angle = -Math.PI / 2;
  const slices = data.map(d => {
    const sweep = (d.value / total) * 2 * Math.PI;
    const x1 = cx + R * Math.cos(angle);
    const y1 = cy + R * Math.sin(angle);
    angle += sweep;
    const x2 = cx + R * Math.cos(angle);
    const y2 = cy + R * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    return { ...d, x1, y1, x2, y2, large, sweep, midAngle: angle - sweep / 2 };
  });

  return (
    <svg viewBox={`0 0 280 ${height}`} style={{ width: '100%', height }}>
      {slices.map((s, i) => (
        s.sweep > 0.01 && (
          <path key={i}
            d={`M${cx},${cy} L${s.x1},${s.y1} A${R},${R} 0 ${s.large},1 ${s.x2},${s.y2} Z`}
            fill={s.color} opacity={0.9} />
        )
      ))}
      {}
      {data.map((d, i) => (
        <g key={i} transform={`translate(195,${30 + i * 24})`}>
          <rect width={12} height={12} fill={d.color} rx={2} />
          <text x={16} y={10} fontSize={11} fill="var(--text-primary)">
            {d.name} — {Math.round((d.value / total) * 100)}%
          </text>
        </g>
      ))}
    </svg>
  );
}

function AnimatedNumber({ value, suffix = '' }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const target = Number(value) || 0;
    const step = Math.ceil(target / 20) || 1;
    let current = 0;
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      setDisplay(current);
      if (current >= target) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [value]);
  return <span>{display.toLocaleString()}{suffix}</span>;
}

function MasteryBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  const color =
    pct < 30 ? '#ef4444' :
    pct < 50 ? '#f97316' :
    pct < 70 ? '#eab308' :
    pct < 85 ? '#86efac' :
               '#22c55e';
  return (
    <div className="wt-mastery-bar-wrap">
      <div className="wt-mastery-bar-bg">
        <div className="wt-mastery-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="wt-mastery-pct">{pct}%</span>
    </div>
  );
}

export default function WeaknessTracker({ userId, token, onNavigate, emptyFallback = null }) {
  const [profile, setProfile] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchData = useCallback(async () => {
    if (!userId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [profileRes, recRes] = await Promise.all([
        fetch(`${API_BASE}/api/intelligence/weakness/profile?user_id=${userId}`, { headers }),
        fetch(`${API_BASE}/api/intelligence/weakness/recommendations?user_id=${userId}`, { headers }),
      ]);
      if (profileRes.ok) setProfile(await profileRes.json());
      if (recRes.ok) {
        const d = await recRes.json();
        setRecommendations(d.recommendations || []);
      }
    } catch (e) {
      setError('Failed to load intelligence data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [userId, token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return (
    <div className="wt-loading">
      <div className="wt-spinner" />
      <p>Loading your intelligence profile...</p>
    </div>
  );

  if (error) return (
    <div className="wt-error">
      <span>⚠️</span><p>{error}</p>
      <button onClick={fetchData}>Retry</button>
    </div>
  );

  if (!profile) return emptyFallback;

  const {
    stats = {}, weak_concepts = [], badges = [],
    weekly_activity = [], mastery_over_time = [],
    heatmap = [], struggling_today = [],
  } = profile;

  const earnedBadges = badges.filter(b => b.earned);
  const unearnedBadges = badges.filter(b => !b.earned);

  const pointsBreakdownData = [
    { name: 'Chat',      value: Math.round((stats.weekly_points || 0) * 0.3), color: '#3b82f6' },
    { name: 'Quiz',      value: Math.round((stats.weekly_points || 0) * 0.4), color: '#22c55e' },
    { name: 'Flashcard', value: Math.round((stats.weekly_points || 0) * 0.2), color: '#eab308' },
    { name: 'Knowledge Map', value: Math.round((stats.weekly_points || 0) * 0.1), color: '#a855f7' },
  ];

  const handleConceptClick = (conceptId, conceptName) => {
    if (onNavigate) onNavigate('/ai-chat', { primed_concept: conceptId, concept_name: conceptName });
  };

  return (
    <div className="wt-root">
      <div className="wt-header">
        <h2 className="wt-title">Intelligence Dashboard</h2>
        <button className="wt-refresh-btn" onClick={fetchData}>↻ Refresh</button>
        {struggling_today.length > 0 && (
          <div className="wt-struggling-banner">
            ⚡ Struggling today: {struggling_today.slice(0, 3).join(', ')}
          </div>
        )}
      </div>

      <div className="wt-stats-bar">
        {[
          { label: 'Total Points',  val: <AnimatedNumber value={stats.total_points} /> },
          { label: 'This Week',     val: <>+<AnimatedNumber value={stats.weekly_points} /></>, accent: true },
          { label: 'Streak',        val: <AnimatedNumber value={stats.daily_streak} suffix=" days" /> },
          { label: 'Mastered',      val: <AnimatedNumber value={stats.concepts_mastered} /> },
          { label: 'In Progress',   val: <AnimatedNumber value={stats.concepts_in_progress} /> },
          { label: 'Study Hours',   val: <AnimatedNumber value={Math.round(stats.total_study_time_hours || 0)} /> },
        ].map(({ label, val, accent }) => (
          <div key={label} className={`wt-stat-card${accent ? ' accent' : ''}`}>
            <span className="wt-stat-label">{label}</span>
            <span className="wt-stat-value">{val}</span>
          </div>
        ))}
      </div>

      <div className="wt-tabs">
        {['overview', 'heatmap', 'charts', 'badges'].map(tab => (
          <button key={tab}
            className={`wt-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {}
      {activeTab === 'overview' && (
        <div className="wt-panel">
          <div className="wt-two-col">
            <div className="wt-section">
              <h3>Priority Study List</h3>
              {weak_concepts.length === 0
                ? <p className="wt-empty">No weak concepts tracked yet. Start studying!</p>
                : (
                  <div className="wt-concept-list">
                    {weak_concepts.slice(0, 5).map((c, i) => (
                      <div key={c.concept_id || i} className="wt-concept-card">
                        <div className="wt-concept-header">
                          <span className="wt-concept-name">{c.concept_name || c.concept_id}</span>
                          <span className={`wt-trend wt-trend--${c.mastery_trend_label}`}>
                            {TREND_ICONS[c.mastery_trend_label] || '→'}
                          </span>
                        </div>
                        <MasteryBar value={c.p_mastery} />
                        {c.evidence && (
                          <p className="wt-evidence">&ldquo;{c.evidence}&rdquo;</p>
                        )}
                        <div className="wt-concept-footer">
                          <div className="wt-sources">
                            {(c.struggle_sources || []).map(s => (
                              <span key={s} className="wt-source-icon" title={s}>{SOURCE_ICONS[s] || '📚'}</span>
                            ))}
                          </div>
                          <button className="wt-action-btn"
                            onClick={() => handleConceptClick(c.concept_id, c.concept_name)}>
                            Ask Tutor
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            <div className="wt-section">
              <h3>Today's Recommendations</h3>
              {recommendations.length === 0
                ? <p className="wt-empty">No recommendations yet. Keep studying!</p>
                : (
                  <div className="wt-rec-list">
                    {recommendations.slice(0, 3).map((r, i) => (
                      <div key={r.concept_id || i} className="wt-rec-card">
                        <div className="wt-rec-rank">{i + 1}</div>
                        <div className="wt-rec-body">
                          <p className="wt-rec-name">{r.concept_name || r.concept_id}</p>
                          <p className="wt-rec-meta">
                            Mastery: {Math.round((r.p_mastery || 0) * 100)}% ·
                            ~{r.estimated_time_minutes}min ·
                            <span className={`wt-trend wt-trend--${r.trend_label}`}>
                              {TREND_ICONS[r.trend_label] || '→'}
                            </span>
                          </p>
                          <button className="wt-action-btn primary"
                            onClick={() => handleConceptClick(r.concept_id, r.concept_name)}>
                            {r.recommended_resource === 'ask_tutor' ? '💬 Ask Tutor' :
                             r.recommended_resource === 'review_flashcards' ? '🃏 Flashcards' : '📝 Quiz'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              <div style={{ marginTop: '1.5rem' }}>
                <h3>Weekly Activity</h3>
                <SvgBarChart data={weekly_activity} dataKey="interactions" labelKey="date" height={150} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── HEATMAP ── */}
      {activeTab === 'heatmap' && (
        <div className="wt-panel">
          <h3>Concept Mastery Heatmap</h3>
          <p className="wt-heatmap-legend">
            <span style={{ color: MASTERY_COLORS.deep_red }}>■</span> &lt;30% &nbsp;
            <span style={{ color: MASTERY_COLORS.orange }}>■</span> 30–50% &nbsp;
            <span style={{ color: MASTERY_COLORS.yellow }}>■</span> 50–70% &nbsp;
            <span style={{ color: MASTERY_COLORS.light_green }}>■</span> 70–85% &nbsp;
            <span style={{ color: MASTERY_COLORS.bright_green }}>■</span> 85%+
          </p>
          <div className="wt-heatmap-grid">
            {heatmap.length === 0
              ? <p className="wt-empty">No concepts tracked yet.</p>
              : heatmap.map((node, i) => (
                <button key={node.concept_id || i} className="wt-heatmap-node"
                  style={{
                    background: MASTERY_COLORS[node.color] || MASTERY_COLORS.deep_red,
                    animation: node.color === 'bright_green' ? 'wt-pulse 2s infinite' : 'none',
                  }}
                  title={`${node.concept_name}: ${Math.round((node.p_mastery || 0) * 100)}%`}
                  onClick={() => handleConceptClick(node.concept_id, node.concept_name)}>
                  <span className="wt-node-label">{(node.concept_name || node.concept_id).substring(0, 20)}</span>
                  <span className="wt-node-pct">{Math.round((node.p_mastery || 0) * 100)}%</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* ── CHARTS ── */}
      {activeTab === 'charts' && (
        <div className="wt-panel">
          <div className="wt-two-col">
            <div className="wt-section">
              <h3>Mastery Over Time (30 days)</h3>
              <SvgLineChart data={mastery_over_time} dataKey="avg_p_mastery" labelKey="date" height={220} />
            </div>
            <div className="wt-section">
              <h3>Points by Source</h3>
              <SvgPieChart data={pointsBreakdownData} height={220} />
            </div>
          </div>
          <div className="wt-section" style={{ marginTop: '1.5rem' }}>
            <h3>Performance Stats</h3>
            <div className="wt-perf-grid">
              {[
                ['Weakest Subject',   stats.weakest_subject || 'N/A'],
                ['Strongest Subject', stats.strongest_subject || 'N/A'],
                ['Avg Session',       `${stats.avg_session_length_min || 0} min`],
                ['Improvement Rate',  `${stats.improvement_rate > 0 ? '+' : ''}${((stats.improvement_rate || 0) * 100).toFixed(1)}%/session`],
              ].map(([label, val]) => (
                <div key={label} className="wt-perf-item">
                  <span className="wt-perf-label">{label}</span>
                  <span className="wt-perf-val">{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── BADGES ── */}
      {activeTab === 'badges' && (
        <div className="wt-panel">
          <h3>Badges Earned ({earnedBadges.length})</h3>
          <div className="wt-badge-grid">
            {earnedBadges.map(b => (
              <div key={b.badge_id} className="wt-badge wt-badge--earned" title={b.description}>
                <span className="wt-badge-icon">{b.icon || '🏅'}</span>
                <span className="wt-badge-name">{b.name}</span>
              </div>
            ))}
          </div>
          {unearnedBadges.length > 0 && (
            <>
              <h3 style={{ marginTop: '1.5rem' }}>Locked ({unearnedBadges.length})</h3>
              <div className="wt-badge-grid">
                {unearnedBadges.slice(0, 8).map(b => (
                  <div key={b.badge_id} className="wt-badge wt-badge--locked" title={b.description}>
                    <span className="wt-badge-icon">🔒</span>
                    <span className="wt-badge-name">{b.name}</span>
                    <span className="wt-badge-desc">{b.description}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
