import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3, Gauge, LayoutDashboard, LogOut, MessageSquare } from 'lucide-react';
import { API_URL } from '../config';
import { signOutAppSession } from '../utils/authSession';
import {
  GeoBackground,
  PLAN_META,
  PLAN_FALLBACKS,
  FALLBACK_PLANS,
  withCurrentPlanCredits,
  formatUsd,
  formatTokens,
  getPlanPrice,
  getYearlySavingsPct,
  getYearlyEquivalentMonthly,
  PriceTicker,
  formatReset,
} from './ProfileNew';
import './ProfileNew.css';
import '../components/SocialHubChrome.css';

const TIER_GROUPS = [
  {
    label: 'Study & AI Usage',
    tiers: [
      { key: 'ai_heavy', label: 'AI Generation (flashcards, notes, quizzes, chat)' },
      { key: 'ai_light', label: 'AI Search & Suggestions' },
      { key: 'file_upload', label: 'File Uploads' },
      { key: 'write', label: 'Saves & Edits' },
      { key: 'read', label: 'Page Loads' },
    ],
  },
  {
    label: 'Account Security',
    tiers: [
      { key: 'auth_login', label: 'Login Attempts' },
      { key: 'auth_register', label: 'Registration Attempts' },
      { key: 'auth_social', label: 'Social Sign-In' },
    ],
  },
];

const formatWindow = (seconds) => {
  const n = Number(seconds || 0);
  if (n >= 3600) return `${Math.round(n / 3600)}h`;
  if (n >= 60) return `${Math.round(n / 60)}m`;
  return `${n}s`;
};

const UsageStats = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const userName = localStorage.getItem('username') || '';

  const [subscriptionData, setSubscriptionData] = useState({
    loading: true,
    saving: false,
    saveAction: null,
    error: null,
    currentPlanId: 'starter',
    billingCycle: 'monthly',
    plans: FALLBACK_PLANS,
    usage: null,
  });
  const [rateLimits, setRateLimits] = useState(null);
  const [rateLimitsError, setRateLimitsError] = useState(null);

  const loadOverview = useCallback(async () => {
    if (!userName) return;
    setSubscriptionData(prev => ({ ...prev, loading: true, error: null }));
    try {
      const resp = await fetch(`${API_URL}/subscription/overview?user_id=${encodeURIComponent(userName)}&include_usage=true`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (!resp.ok) throw new Error(`Subscription overview failed: ${resp.status}`);
      const data = await resp.json();
      setSubscriptionData(prev => ({
        ...prev,
        loading: false,
        error: null,
        currentPlanId: data.currentPlanId || 'starter',
        billingCycle: data.billingCycle || 'monthly',
        plans: Array.isArray(data.plans) && data.plans.length ? data.plans.map(withCurrentPlanCredits) : FALLBACK_PLANS,
        usage: data.usage || null,
      }));
    } catch (e) {
      setSubscriptionData(prev => ({ ...prev, loading: false, error: 'Unable to load usage overview.' }));
    }
  }, [token, userName]);

  const loadRateLimits = useCallback(async () => {
    if (!token) return;
    try {
      const resp = await fetch(`${API_URL}/rate-limits/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error(`Rate limit status failed: ${resp.status}`);
      setRateLimits(await resp.json());
      setRateLimitsError(null);
    } catch (e) {
      setRateLimitsError('Unable to load live usage right now.');
    }
  }, [token]);

  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    loadOverview();
    loadRateLimits();
  }, [token, navigate, loadOverview, loadRateLimits]);

  const readApiError = async (resp, fallback) => {
    try {
      const payload = await resp.json();
      if (payload?.detail) return payload.detail;
    } catch (e) { /* silenced */ }
    return fallback;
  };

  const handleSelectPlan = async (planId) => {
    if (!userName || !planId || subscriptionData.saving || planId === subscriptionData.currentPlanId) return;
    setSubscriptionData(prev => ({ ...prev, saving: true, saveAction: 'plan', error: null }));
    try {
      const isFreePlan = planId === 'starter';
      const resp = await fetch(`${API_URL}/subscription/${isFreePlan ? 'select' : 'checkout'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          user_id: userName,
          tier: planId,
          billingCycle: subscriptionData.billingCycle || 'monthly',
          subscriptionStatus: 'active'
        })
      });
      if (!resp.ok) throw new Error(await readApiError(resp, 'Unable to switch plan right now.'));
      const data = await resp.json().catch(() => ({}));
      if (!isFreePlan) {
        const checkoutUrl = new URL(data.checkoutUrl || '');
        if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com') {
          throw new Error('The payment provider returned an invalid checkout URL.');
        }
        window.location.assign(checkoutUrl.toString());
        return;
      }
      await Promise.all([loadOverview(), loadRateLimits()]);
    } catch (e) {
      setSubscriptionData(prev => ({ ...prev, error: e?.message || 'Unable to switch plan right now.' }));
    } finally {
      setSubscriptionData(prev => ({ ...prev, saving: false, saveAction: null }));
    }
  };

  const clearSessionAndGoLogin = () => {
    void signOutAppSession();
    navigate('/login');
  };

  const activeBillingCycle = subscriptionData.billingCycle === 'yearly' ? 'yearly' : 'monthly';
  const billingLabel = activeBillingCycle === 'yearly' ? '/yr' : '/mo';
  const currentPlanId = String(subscriptionData.currentPlanId || 'starter').trim().toLowerCase();
  const currentPlan = subscriptionData.plans.find(p => String(p.id || '').trim().toLowerCase() === currentPlanId) || PLAN_FALLBACKS[currentPlanId] || null;
  const currentPlanPrice = currentPlan ? getPlanPrice(currentPlan, activeBillingCycle) : 0;

  const usage = subscriptionData.usage || {};
  const includedTokens = Number(currentPlan?.included_tokens_monthly || 0);
  const totalTokens = Number(usage.total_tokens || 0);
  const tokenPct = includedTokens > 0 ? Math.min(100, Math.round((totalTokens / includedTokens) * 100)) : 0;

  return (
    <div className="pn-root">
      <GeoBackground />

      <div className="pn-topbar">
        <div className="pn-topbar-center"><span className="shc-tagline"><span>LEARNING,</span> UNIFIED</span></div>
        <div className="pn-topbar-actions">
          <button className="pn-top-action" onClick={() => navigate('/profile')} type="button">
            <span>Back to Profile</span>
          </button>
          <button className="pn-top-action" onClick={() => navigate('/dashboard-cerbyl')} type="button">
            <span>Dashboard</span>
          </button>
        </div>
      </div>

      <div className="pf-qb-body">
        <div className="pf-qb-shell">
          <aside className="pf-qb-sidebar" aria-label="Usage navigation">
            <div className="pf-qb-side-brand">
              <div className="pf-qb-brand-wrap">
                <div className="pf-qb-brand">cerbyl</div>
                <div className="pf-qb-current-title"><Gauge size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Usage &amp; Billing</div>
              </div>
            </div>

            <div className="pf-qb-side-block">
              <div className="pf-qb-side-label">Navigate</div>
              <nav className="pf-qb-view-nav" aria-label="Usage sections">
                <button className="pf-qb-view-link" onClick={() => navigate('/profile')} type="button">
                  <ArrowLeft size={16} />
                  <span>Back to Profile</span>
                </button>
                <button className="pf-qb-view-link" onClick={() => navigate('/dashboard-cerbyl')} type="button">
                  <LayoutDashboard size={16} />
                  <span>Dashboard</span>
                </button>
                <button className="pf-qb-view-link" onClick={() => navigate('/ai-chat')} type="button">
                  <MessageSquare size={16} />
                  <span>AI Chat</span>
                </button>
              </nav>
            </div>

            <div className="pf-qb-side-block">
              <div className="pf-qb-side-label">Snapshot</div>
              <div className="pf-qb-stat-grid">
                <div className="pf-qb-stat-card">
                  <span>{currentPlan?.name || 'Starter'}</span>
                  <small>Plan</small>
                </div>
                <div className="pf-qb-stat-card">
                  <span>{includedTokens > 0 ? `${tokenPct}%` : '—'}</span>
                  <small>Used</small>
                </div>
                <div className="pf-qb-stat-card">
                  <span>{usage.ai_requests || 0}</span>
                  <small>AI Calls</small>
                </div>
              </div>
            </div>

            <div className="pf-qb-side-actions">
              <button className="pf-qb-action-btn pf-qb-action-btn--ghost" onClick={clearSessionAndGoLogin} type="button">
                <LogOut size={14} />
                <span>Logout</span>
              </button>
            </div>
          </aside>

          <main className="pf-qb-main">
            <div className="pn-wrap">

              <section className="pn-section" id="usage-section-overview">
                <div className="pn-section-label">PLAN OVERVIEW</div>
                <div className="pn-subscription-header">
                  <div className="pn-subscription-current">
                    <span className="pn-subscription-current-icon" aria-hidden><BarChart3 size={16} /></span>
                    <span className="pn-subscription-current-copy">
                      <span className="pn-subscription-current-label">Current Plan</span>
                      <span className="pn-subscription-current-value">
                        {currentPlan
                          ? `${currentPlan.name} · ${formatUsd(currentPlanPrice)}${billingLabel}`
                          : `Starter · ${formatUsd(0)}/mo`}
                      </span>
                    </span>
                  </div>
                </div>

                {subscriptionData.error && <div className="pn-subscription-error">{subscriptionData.error}</div>}

                <div className="pf-qb-stat-grid" style={{ marginTop: 14 }}>
                  <div className="pf-qb-stat-card">
                    <span>{formatTokens(totalTokens)}</span>
                    <small>Tokens (30d)</small>
                  </div>
                  <div className="pf-qb-stat-card">
                    <span>{usage.ai_requests || 0}</span>
                    <small>AI Requests (30d)</small>
                  </div>
                  <div className="pf-qb-stat-card">
                    <span>{includedTokens > 0 ? `${tokenPct}%` : '—'}</span>
                    <small>Plan Utilization</small>
                  </div>
                </div>

                {includedTokens > 0 && (
                  <div className="pn-usage-card" style={{ marginTop: 16 }}>
                    <div className="pn-usage-header">
                      <span className="pn-usage-title">Monthly AI Credits</span>
                      <span className="pn-usage-subtitle">Last 30 days &middot; included with {currentPlan?.name || 'your plan'}</span>
                    </div>
                    <div className="pn-usage-row">
                      <div className="pn-usage-meta">
                        <span className="pn-usage-label">Tokens used</span>
                        <span className="pn-usage-count">{formatTokens(totalTokens)} / {formatTokens(includedTokens)}</span>
                      </div>
                      <div className="pn-usage-track">
                        <div
                          className={`pn-usage-fill${tokenPct >= 90 ? ' pn-usage-fill--danger' : tokenPct >= 70 ? ' pn-usage-fill--warn' : ''}`}
                          style={{ width: `${tokenPct}%` }}
                        />
                      </div>
                      <div className="pn-usage-footer">
                        <span className="pn-usage-pct">{tokenPct}%</span>
                        <span className="pn-usage-reset">Resets monthly</span>
                      </div>
                    </div>
                  </div>
                )}

                {Array.isArray(usage.top_tools) && usage.top_tools.length > 0 && (
                  <div className="pn-usage-card" style={{ marginTop: 16 }}>
                    <div className="pn-usage-header">
                      <span className="pn-usage-title">Most Used Tools</span>
                      <span className="pn-usage-subtitle">Last 30 days</span>
                    </div>
                    {usage.top_tools.map(tool => (
                      <div key={tool.tool_name} className="pn-usage-row">
                        <div className="pn-usage-meta">
                          <span className="pn-usage-label">{tool.tool_name}</span>
                          <span className="pn-usage-count">{tool.usage_count} calls &middot; {formatTokens(tool.tokens_used)} tokens</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <div className="pn-divider" />

              <section className="pn-section" id="usage-section-limits">
                <div className="pn-section-label">RATE LIMIT USAGE</div>
                {rateLimitsError && <div className="pn-subscription-error">{rateLimitsError}</div>}
                {!rateLimits && !rateLimitsError && <div className="pn-subscription-loading">Loading live usage...</div>}

                {rateLimits && TIER_GROUPS.map(group => (
                  <div key={group.label} className="pn-usage-card" style={{ marginTop: 16 }}>
                    <div className="pn-usage-header">
                      <span className="pn-usage-title">{group.label}</span>
                      <span className="pn-usage-subtitle">Plan: {rateLimits.plan} &middot; resets automatically per window</span>
                    </div>
                    {group.tiers.map(({ key, label }) => {
                      const t = rateLimits.tiers?.[key];
                      if (!t) return null;
                      if (t.limit === 'unlimited') {
                        return (
                          <div key={key} className="pn-usage-row">
                            <div className="pn-usage-meta">
                              <span className="pn-usage-label">{label}</span>
                              <span className="pn-usage-count">Unlimited</span>
                            </div>
                          </div>
                        );
                      }
                      const pct = t.limit > 0 ? Math.min(100, Math.round((t.used / t.limit) * 100)) : 0;
                      const resetStr = t.reset_at > 0 ? formatReset(t.reset_at) : '—';
                      return (
                        <div key={key} className="pn-usage-row">
                          <div className="pn-usage-meta">
                            <span className="pn-usage-label">{label}</span>
                            <span className="pn-usage-count">{t.used} / {t.limit} &middot; {formatWindow(t.window_seconds)} window</span>
                          </div>
                          <div className="pn-usage-track">
                            <div
                              className={`pn-usage-fill${pct >= 90 ? ' pn-usage-fill--danger' : pct >= 70 ? ' pn-usage-fill--warn' : ''}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="pn-usage-footer">
                            <span className="pn-usage-pct">{pct}%</span>
                            <span className="pn-usage-reset">Resets in {resetStr}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </section>

              <div className="pn-divider" />

              <section className="pn-section" id="usage-section-switch">
                <div className="pn-section-label">SWITCH PLAN</div>
                <p className="pn-subscription-note pn-subscription-note--savings">
                  <span className="pn-subscription-note-strong">Testing mode.</span>{' '}
                  Switching plans here updates your tier instantly with no payment &mdash; billing isn&apos;t wired up yet.
                  Use this to see how usage limits change per plan.
                </p>

                {subscriptionData.loading ? (
                  <div className="pn-subscription-loading">Loading plans...</div>
                ) : (
                  <div className="pn-plan-grid">
                    {subscriptionData.plans.map((plan) => {
                      const meta = PLAN_META[plan.id] || PLAN_META.starter;
                      const Icon = meta.icon;
                      const isCurrent = currentPlanId === String(plan.id || '').trim().toLowerCase();
                      const planYearlySavingsPct = getYearlySavingsPct(plan);
                      const planYearlyEquivalentMonthly = getYearlyEquivalentMonthly(plan);
                      const planPrice = getPlanPrice(plan, activeBillingCycle);
                      return (
                        <article key={plan.id} className={`pn-plan-card pn-plan-card--${meta.theme} ${isCurrent ? 'pn-plan-card--active' : ''}`}>
                          <div className="pn-plan-top">
                            <span className="pn-plan-icon"><Icon size={14} /></span>
                            <span className="pn-plan-name">{plan.name}</span>
                          </div>
                          <div className="pn-plan-price-row">
                            <div className="pn-plan-price">
                              <PriceTicker amount={planPrice} />
                              <small>{billingLabel}</small>
                            </div>
                            {planYearlySavingsPct > 0 && activeBillingCycle === 'yearly' && (
                              <span className="pn-plan-save-badge">Save {planYearlySavingsPct}%</span>
                            )}
                          </div>
                          <div className="pn-plan-meta">Includes {formatTokens(plan.included_tokens_monthly)} monthly AI credits</div>
                          {activeBillingCycle === 'yearly' && planYearlyEquivalentMonthly > 0 && (
                            <div className="pn-plan-billing-note">~{formatUsd(planYearlyEquivalentMonthly)}/mo effective</div>
                          )}
                          {plan.summary && <div className="pn-plan-summary">{plan.summary}</div>}
                          <button
                            className={`pn-plan-cta ${isCurrent ? 'pn-plan-cta--current' : ''}`}
                            onClick={() => handleSelectPlan(plan.id)}
                            disabled={isCurrent || subscriptionData.saving}
                          >
                            {isCurrent ? 'Current Plan' : (subscriptionData.saveAction === 'plan' ? 'Switching...' : 'Switch Plan (test)')}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default UsageStats;
