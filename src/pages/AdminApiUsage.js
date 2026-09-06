import ToolNavigation from '../components/ToolNavigation';
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Shield, Zap } from 'lucide-react';
import { API_URL } from '../config';
import './AdminApiUsage.css';

const formatNumber = (value) => Number(value || 0).toLocaleString();

const formatDateTime = (value) => {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString();
};

const AdminApiUsage = () => {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadUsage = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/admin/api-key-usage`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || `Request failed: ${response.status}`);
      }

      setUsage(await response.json());
    } catch (err) {
      setError(err.message || 'Failed to load API key usage');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsage();
    const interval = setInterval(loadUsage, 30000);
    return () => clearInterval(interval);
  }, []);

  const totals = usage?.totals || {};
  const providers = usage?.providers || [];
  const keys = usage?.keys || [];

  return (
    <div className="api-usage-page">
      <div style={{marginBottom: 16}}><ToolNavigation /></div>
      <header className="api-usage-header">
        <div>
          <div className="api-usage-kicker"><Shield size={15} /> Admin only</div>
          <h1>API Key Usage</h1>
          <p>Daily quota tracking for configured AI key pools.</p>
        </div>
        <button className="api-usage-refresh" onClick={loadUsage} disabled={loading}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      {error && (
        <div className="api-usage-alert">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      <section className="api-usage-summary">
        <MetricCard label="Used today" value={formatNumber(totals.used_tokens)} />
        <MetricCard label="Remaining" value={formatNumber(totals.remaining_tokens)} />
        <MetricCard label="Daily limit" value={formatNumber(totals.daily_limit)} />
        <MetricCard label="Keys tracked" value={formatNumber(totals.key_count)} />
      </section>

      <section className="api-usage-panel">
        <div className="api-usage-panel-head">
          <h2>Providers</h2>
          <span>{usage?.usage_day || 'Today'}</span>
        </div>
        {loading && !usage ? (
          <div className="api-usage-empty">Loading usage...</div>
        ) : providers.length ? (
          <div className="api-provider-grid">
            {providers.map((provider) => (
              <ProviderCard key={provider.provider} provider={provider} />
            ))}
          </div>
        ) : (
          <div className="api-usage-empty">No API key pool usage is configured yet.</div>
        )}
      </section>

      <section className="api-usage-panel">
        <div className="api-usage-panel-head">
          <h2>Keys</h2>
          <span>Updated {formatDateTime(usage?.generated_at)}</span>
        </div>
        <div className="api-key-list">
          {keys.map((key) => (
            <KeyUsageRow key={`${key.provider}-${key.fingerprint}`} item={key} />
          ))}
        </div>
      </section>
    </div>
  );
};

const MetricCard = ({ label, value }) => (
  <div className="api-usage-metric">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const ProviderCard = ({ provider }) => (
  <div className="api-provider-card">
    <div className="api-provider-title">
      <Zap size={17} />
      <strong>{provider.provider}</strong>
    </div>
    <UsageBar percent={provider.usage_percent} />
    <div className="api-provider-stats">
      <span>{formatNumber(provider.used_tokens)} used</span>
      <span>{formatNumber(provider.remaining_tokens)} left</span>
      <span>{provider.key_count} keys</span>
    </div>
  </div>
);

const KeyUsageRow = ({ item }) => (
  <div className="api-key-row">
    <div className="api-key-main">
      <div>
        <strong>{item.provider} {item.key_label}</strong>
        <span>#{item.short_fingerprint}</span>
      </div>
      <StatusBadge item={item} />
    </div>
    <UsageBar percent={item.usage_percent} />
    <div className="api-key-meta">
      <span>{formatNumber(item.used_tokens)} / {formatNumber(item.daily_limit)} tokens</span>
      <span>{formatNumber(item.remaining_tokens)} remaining</span>
      <span>Updated {formatDateTime(item.updated_at)}</span>
    </div>
  </div>
);

const StatusBadge = ({ item }) => {
  if (item.is_exhausted) {
    return (
      <span className="api-status api-status--warn">
        <AlertTriangle size={14} />
        Exhausted
      </span>
    );
  }
  return (
    <span className="api-status">
      <CheckCircle2 size={14} />
      Active
    </span>
  );
};

const UsageBar = ({ percent = 0 }) => (
  <div className="api-usage-bar" aria-label={`${percent}% used`}>
    <div style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
  </div>
);

export default AdminApiUsage;
