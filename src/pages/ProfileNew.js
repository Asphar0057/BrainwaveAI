import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X, Check, Pencil, Award, BarChart3, Crown, Rocket, ShieldCheck, LogOut, Trash2, MessageSquare, LayoutDashboard, User, CreditCard, Target, Settings, BookOpen, Sparkles, Plus, Gauge } from 'lucide-react';
import { SidebarShell, SidebarSection, SidebarMenuItem, SidebarStats, SidebarStatBox, SidebarActions, SidebarAction, SidebarStripButton, SidebarStripDivider, SidebarStripSpacer } from '../components/Sidebar';
import { API_URL } from '../config';
import { signOutAppSession } from '../utils/authSession';
import './ProfileNew.css';
import '../components/SocialHubChrome.css';

const PRESET_PFPS = [
  { id: 'cat', label: 'Cat', src: '/pfp/cat.png' },
  { id: 'woman', label: 'Woman', src: '/pfp/woman.png' }
];
const isPresetPfp = (src) => PRESET_PFPS.some(p => p.src === src);
const isUploadedPfp = (src) => typeof src === 'string' && src.startsWith('data:image/jpeg;');
const isAllowedCustomPfp = (src) => isPresetPfp(src) || isUploadedPfp(src);
const PFP_DEFAULT_KEY = 'cerbyl.defaultPfp';
const PFP_CUSTOM_KEY = 'cerbyl.customPfp';
const DISPLAY_NAME_KEY = 'cerbyl.displayName';
const MAX_CUSTOM_PFP_BYTES = 2 * 1024 * 1024;

const hydrateProfile = (parsed = {}, username = '') => {
  const p = parsed || {};
  const storedDefault = localStorage.getItem(PFP_DEFAULT_KEY) || '';
  const storedCustom = localStorage.getItem(PFP_CUSTOM_KEY) || '';
  const storedDisplayName = localStorage.getItem(DISPLAY_NAME_KEY) || '';
  const hasExplicitCustom = Object.prototype.hasOwnProperty.call(p, 'customPfp');
  const hasExplicitDefault = Object.prototype.hasOwnProperty.call(p, 'defaultPfp');
  const picCandidate = p.picture_url || p.picture || p.photoURL || p.photo_url || '';
  const parsedCustom = p.customPfp && isAllowedCustomPfp(p.customPfp) ? p.customPfp : '';
  const customPfp = hasExplicitCustom
    ? parsedCustom
    : (parsedCustom || (isAllowedCustomPfp(storedCustom) ? storedCustom : '') || (isAllowedCustomPfp(picCandidate) ? picCandidate : ''));
  const defaultPfp = hasExplicitDefault
    ? (p.defaultPfp || '')
    : (p.defaultPfp || p.googlePicture || storedDefault || (isPresetPfp(picCandidate) ? '' : picCandidate) || '');
  const activePfp = customPfp || defaultPfp;
  const resolvedName = p.firstName || p.first_name || storedDisplayName || (username ? username.split('@')[0] : '');
  return { ...p, firstName: p.firstName || resolvedName, first_name: p.first_name || resolvedName, defaultPfp, customPfp, picture: activePfp, picture_url: activePfp };
};

const ALL_SUBJECTS = [
  'Mathematics','Physics','Chemistry','Biology','Computer Science',
  'History','Geography','Literature','Languages','Art',
  'Music','Economics','Business','Psychology','Philosophy',
  'Engineering','Medicine','Law','Political Science','Sociology'
];

const BRAINWAVE_GOALS = {
  exam_prep: 'Exam Preparation', homework_help: 'Homework Assistance',
  concept_mastery: 'Master Concepts', skill_building: 'Build Skills',
  career_prep: 'Career Development', curiosity: 'Learn for Fun'
};

const ARCHETYPE_INFO = {
  Logicor: { tagline: 'The Systematic Thinker', desc: 'You excel at logical analysis and breaking down complex problems.' },
  Flowist: { tagline: 'The Dynamic Learner', desc: 'You thrive through hands-on experiences and adapt easily to new challenges.' },
  Kinetiq: { tagline: 'The Movement Master', desc: 'You learn best through physical engagement and kinesthetic experiences.' },
  Synth: { tagline: 'The Pattern Connector', desc: 'You naturally see connections and integrate knowledge across domains.' },
  Dreamweaver: { tagline: 'The Visionary', desc: 'You think in possibilities and excel with visual and imaginative approaches.' },
  Anchor: { tagline: 'The Structured Strategist', desc: 'You value organization and thrive with clear systems and methodical approaches.' },
  Spark: { tagline: 'The Creative Innovator', desc: 'You\'re driven by creativity and love exploring novel ideas and methods.' },
  Empathion: { tagline: 'The Empathetic Learner', desc: 'You connect deeply with meaning and understand through emotional intelligence.' },
  Seeker: { tagline: 'The Curious Explorer', desc: 'You\'re motivated by discovery and love expanding your knowledge horizons.' },
  Resonant: { tagline: 'The Adaptive Mind', desc: 'You\'re highly flexible and tune into different learning environments effortlessly.' }
};

export const PLAN_META = {
  starter: { icon: ShieldCheck, theme: 'starter' },
  pro: { icon: Crown, theme: 'pro' },
  power: { icon: Rocket, theme: 'power' },
  unlimited: { icon: ShieldCheck, theme: 'power' }
};

const PLAN_INCLUDED_TOKENS = {
  starter: 100000,
  pro: 2000000,
  power: 5000000,
  unlimited: 0
};

export const PLAN_FALLBACKS = {
  starter: { id: 'starter', name: 'Starter', monthly_price_usd: 0, yearly_price_usd: 0, included_tokens_monthly: 100000 },
  pro: { id: 'pro', name: 'Pro', monthly_price_usd: 15, yearly_price_usd: 150, included_tokens_monthly: 2000000 },
  power: { id: 'power', name: 'Power', monthly_price_usd: 25, yearly_price_usd: 249, included_tokens_monthly: 5000000 },
  unlimited: { id: 'unlimited', name: 'Unlimited', monthly_price_usd: 0, yearly_price_usd: 0, included_tokens_monthly: 0, unlimited: true }
};

export const withCurrentPlanCredits = (plan = {}) => {
  const planId = String(plan.id || '').trim().toLowerCase();
  const includedTokens = PLAN_INCLUDED_TOKENS[planId];
  if (!includedTokens) return plan;
  return {
    ...plan,
    included_tokens_monthly: includedTokens
  };
};

export const FALLBACK_PLANS = Object.values(PLAN_FALLBACKS).map(withCurrentPlanCredits);

export const formatUsd = (value) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '$0';
  return `$${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
};

export const formatTokens = (value) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString();
};

const toProfileFormData = (profile = {}, username = '') => ({
  username: profile.username || username || '',
  firstName: profile.firstName || profile.first_name || '',
  lastName: profile.lastName || profile.last_name || '',
  email: profile.email || '',
  googleUser: profile.googleUser === true || profile.google_user === true,
  fieldOfStudy: profile.fieldOfStudy || profile.field_of_study || '',
  brainwaveGoal: profile.brainwaveGoal || profile.brainwave_goal || '',
  preferredSubjects: profile.preferredSubjects || profile.preferred_subjects || [],
  primaryArchetype: profile.primaryArchetype || profile.primary_archetype || '',
  secondaryArchetype: profile.secondaryArchetype || profile.secondary_archetype || '',
  archetypeDescription: profile.archetypeDescription || profile.archetype_description || '',
  archetypeScores: (() => {
    try {
      return typeof profile.archetypeScores === 'string'
        ? JSON.parse(profile.archetypeScores)
        : (profile.archetypeScores || {});
    } catch (e) {
      return {};
    }
  })(),
  showStudyInsights: profile.showStudyInsights !== false,
  notificationsEnabled: profile.notificationsEnabled !== false,
  quizCompleted: profile.quizCompleted === true || profile.quiz_completed === true,
  quizSkipped: profile.quizSkipped === true || profile.quiz_skipped === true,
});

const scheduleProfileIdle = (callback) => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout: 1800 });
  }
  return window.setTimeout(callback, 450);
};

const cancelProfileIdle = (handle) => {
  if (!handle) return;
  if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(handle);
    return;
  }
  window.clearTimeout(handle);
};

export const getPlanPrice = (plan, billingCycle) => {
  const isYearly = billingCycle === 'yearly';
  const raw = isYearly
    ? (plan?.yearly_price_usd ?? ((Number(plan?.monthly_price_usd || 0)) * 12))
    : (plan?.monthly_price_usd ?? 0);
  const n = Number(raw || 0);
  return Number.isFinite(n) ? n : 0;
};

export const getYearlySavingsPct = (plan) => {
  const monthly = Number(plan?.monthly_price_usd || 0);
  const yearly = Number(plan?.yearly_price_usd || 0);
  if (!Number.isFinite(monthly) || !Number.isFinite(yearly) || monthly <= 0 || yearly <= 0) return 0;
  const yearlyFromMonthly = monthly * 12;
  if (yearly >= yearlyFromMonthly) return 0;
  return Math.round(((yearlyFromMonthly - yearly) / yearlyFromMonthly) * 100);
};

export const getYearlySavingsUsd = (plan) => {
  const monthly = Number(plan?.monthly_price_usd || 0);
  const yearly = Number(plan?.yearly_price_usd || 0);
  if (!Number.isFinite(monthly) || !Number.isFinite(yearly) || monthly <= 0 || yearly <= 0) return 0;
  const savings = (monthly * 12) - yearly;
  return savings > 0 ? savings : 0;
};

export const getYearlyEquivalentMonthly = (plan) => {
  const yearly = Number(plan?.yearly_price_usd || 0);
  if (!Number.isFinite(yearly) || yearly <= 0) return 0;
  return yearly / 12;
};

export const USAGE_TIER_LABELS = {
  ai_heavy: 'AI Generation',
  ai_light: 'AI Search',
  file_upload: 'File Uploads',
};

export const formatReset = (resetAt) => {
  const ms = Math.max(0, resetAt * 1000 - Date.now());
  const totalSecs = Math.floor(ms / 1000);
  if (totalSecs <= 0) return 'soon';
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

const PRICE_TICKER_MS = 340;

export const PriceTicker = ({ amount }) => {
  const [displayAmount, setDisplayAmount] = useState(Number(amount || 0));
  const [nextAmount, setNextAmount] = useState(null);
  const [direction, setDirection] = useState('up');
  const [transitionToken, setTransitionToken] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const target = Number(amount || 0);
    if (!Number.isFinite(target)) return;
    if (nextAmount !== null) return;
    if (target === displayAmount) return;

    setDirection(target > displayAmount ? 'up' : 'down');
    setNextAmount(target);
    setTransitionToken((prev) => prev + 1);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDisplayAmount(target);
      setNextAmount(null);
    }, PRICE_TICKER_MS);
  }, [amount, displayAmount, nextAmount]);

  if (nextAmount === null) {
    return (
      <span className="pn-price-ticker pn-price-ticker--static">
        <span className="pn-price-ticker-value pn-price-ticker-value--static">
          {formatUsd(displayAmount)}
        </span>
      </span>
    );
  }

  return (
    <span
      key={transitionToken}
      className={`pn-price-ticker ${direction === 'up' ? 'pn-price-ticker--up' : 'pn-price-ticker--down'}`}
    >
      <span className="pn-price-ticker-value pn-price-ticker-value--old">
        {formatUsd(displayAmount)}
      </span>
      <span className="pn-price-ticker-value pn-price-ticker-value--new">
        {formatUsd(nextAmount)}
      </span>
    </span>
  );
};

export const GeoBackground = () => (
  <div className="pn-bg" aria-hidden="true">
    <div className="pn-orb pn-orb-1" />
    <div className="pn-orb pn-orb-2" />
    <div className="pn-orb pn-orb-3" />
    <div className="pn-dots" />
    <svg className="pn-geo" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
      {}
      <circle cx="-40" cy="420" r="380" fill="none" strokeWidth="0.6" opacity="0.18" />
      <circle cx="-40" cy="420" r="520" fill="none" strokeWidth="0.3" opacity="0.1" />
      <circle cx="1480" cy="460" r="340" fill="none" strokeWidth="0.5" opacity="0.16" />
      <circle cx="1480" cy="460" r="480" fill="none" strokeWidth="0.25" opacity="0.09" />

      {}
      <circle cx="720" cy="-30" r="110" fill="none" strokeWidth="0.5" opacity="0.22" />
      <circle cx="720" cy="-30" r="180" fill="none" strokeWidth="0.25" opacity="0.12" />
      <circle cx="1100" cy="820" r="90" fill="none" strokeWidth="0.4" opacity="0.2" />

      {}
      <rect x="960" y="160" width="90" height="90" fill="none" strokeWidth="0.5" opacity="0.22"
        transform="rotate(45 1005 205)" />
      <rect x="960" y="160" width="130" height="130" fill="none" strokeWidth="0.25" opacity="0.12"
        transform="rotate(45 1005 205) translate(-20 -20)" />

      {}
      <line x1="0" y1="220" x2="1440" y2="220" strokeWidth="0.3" opacity="0.1" strokeDasharray="3 14" />
      <line x1="0" y1="450" x2="1440" y2="450" strokeWidth="0.3" opacity="0.1" strokeDasharray="3 14" />
      <line x1="0" y1="680" x2="1440" y2="680" strokeWidth="0.3" opacity="0.1" strokeDasharray="3 14" />

      {}
      <line x1="360" y1="0" x2="360" y2="900" strokeWidth="0.3" opacity="0.1" strokeDasharray="3 14" />
      <line x1="720" y1="0" x2="720" y2="900" strokeWidth="0.3" opacity="0.1" strokeDasharray="3 14" />
      <line x1="1080" y1="0" x2="1080" y2="900" strokeWidth="0.3" opacity="0.1" strokeDasharray="3 14" />

      {}
      <line x1="200" y1="0" x2="600" y2="450" strokeWidth="0.4" opacity="0.12" />
      <line x1="1240" y1="900" x2="900" y2="450" strokeWidth="0.4" opacity="0.1" />

      {}
      {[[360,220],[720,220],[1080,220],[360,450],[720,450],[1080,450],[360,680],[720,680],[1080,680]].map(([x,y],i) => (
        <g key={i} opacity="0.28">
          <line x1={x-5} y1={y} x2={x+5} y2={y} strokeWidth="0.6" />
          <line x1={x} y1={y-5} x2={x} y2={y+5} strokeWidth="0.6" />
        </g>
      ))}

      {}
      <g opacity="0.2">
        <polyline points="40,40 40,20 60,20" fill="none" strokeWidth="0.8" />
        <polyline points="1400,40 1400,20 1380,20" fill="none" strokeWidth="0.8" />
        <polyline points="40,860 40,880 60,880" fill="none" strokeWidth="0.8" />
        <polyline points="1400,860 1400,880 1380,880" fill="none" strokeWidth="0.8" />
      </g>

      {}
      <g className="pn-geo-nums" opacity="0.22" fontSize="9" fontFamily="'Inter', monospace" letterSpacing="0.05em">
        <text x="354" y="895">0.25</text>
        <text x="714" y="895">0.50</text>
        <text x="1074" y="895">0.75</text>
      </g>

      {}
      <g className="pn-geo-nums" opacity="0.22" fontSize="9" fontFamily="'Inter', monospace" letterSpacing="0.05em">
        <text x="1398" y="224">0.24</text>
        <text x="1398" y="454">0.50</text>
        <text x="1398" y="684">0.75</text>
      </g>

      {}
      <g className="pn-geo-nums" opacity="0.18" fontSize="10" fontFamily="'Inter', monospace" letterSpacing="0.04em">
        <text x="80" y="135">0.482</text>
        <text x="560" y="320">−1.337</text>
        <text x="890" y="110">2.094</text>
        <text x="1200" y="310">0.707</text>
        <text x="160" y="660">3.1416</text>
        <text x="1050" y="580">−0.892</text>
        <text x="640" y="810">1.618</text>
        <text x="320" y="380">0.071</text>
        <text x="820" y="570">−2.190</text>
        <text x="1280" y="720">0.333</text>
      </g>

      {}
      {[[360,220],[720,450],[1080,220],[360,680],[1080,680]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="2" opacity="0.3" />
      ))}

      {}
      <line x1="360" y1="220" x2="720" y2="450" strokeWidth="0.4" opacity="0.12" strokeDasharray="2 8" />
      <line x1="720" y1="450" x2="1080" y2="220" strokeWidth="0.4" opacity="0.12" strokeDasharray="2 8" />
      <line x1="360" y1="680" x2="1080" y2="680" strokeWidth="0.4" opacity="0.1" strokeDasharray="2 8" />

      {}
      <g className="pn-geo-nums" opacity="0.14" fontSize="60" fontFamily="'Inter', sans-serif" fontWeight="800" letterSpacing="-0.03em">
        <text x="30" y="200" transform="rotate(-90 80 180)">01</text>
        <text x="1370" y="580">02</text>
      </g>
    </svg>
    <div className="pn-vignette" />
  </div>
);

const ProfileNew = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const pfpUploadInputRef = useRef(null);
  const token = localStorage.getItem('token');
  const [userName, setUserName] = useState(() => localStorage.getItem('username') || '');

  const [pfp, setPfp] = useState(() => {
    const raw = localStorage.getItem('userProfile');
    if (!raw) return hydrateProfile({}, userName);
    try { return hydrateProfile(JSON.parse(raw), userName); } catch (e) { return hydrateProfile({}, userName); }
  });
  const [cachedProfile] = useState(() => {
    const raw = localStorage.getItem('userProfile');
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (e) { return {}; }
  });
  const [pfpModalOpen, setPfpModalOpen] = useState(false);
  const [gamificationStats, setGamificationStats] = useState(null);

  const [profileData, setProfileData] = useState(() => toProfileFormData(cachedProfile, userName));
  const [quizAnswers, setQuizAnswers] = useState({});
  const [dataLoaded, setDataLoaded] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [profileSaveError, setProfileSaveError] = useState('');
  const [deleteStep, setDeleteStep] = useState('password');
  const [deleteForm, setDeleteForm] = useState({ password: '', otp: '' });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState('');
  const lastSavedRef = useRef(null);
  const saveTimerRef = useRef(null);
  const isSavingRef = useRef(false);
  const [subscriptionData, setSubscriptionData] = useState({
    loading: false,
    saving: false,
    saveAction: null,
    currentPlanId: cachedProfile.subscriptionTier || cachedProfile.subscription_tier || 'starter',
    billingCycle: cachedProfile.billingCycle || cachedProfile.billing_cycle || 'monthly',
    subscriptionStatus: cachedProfile.subscriptionStatus || cachedProfile.subscription_status || 'active',
    subscriptionStartedAt: cachedProfile.subscriptionStartedAt || cachedProfile.subscription_started_at || null,
    plans: FALLBACK_PLANS,
    usage: null,
    error: null
  });

  const [rateLimits, setRateLimits] = useState(null);
  const [typedName, setTypedName] = useState('');
  const [nameDone, setNameDone] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  ));
  const mainScrollRef = useRef(null);

  const scrollToSection = useCallback((id) => {
    const el = document.getElementById(id);
    const scroller = mainScrollRef.current;
    if (!el) return;
    if (scroller) {
      scroller.scrollTo({ top: Math.max(el.offsetTop - 16, 0), behavior: 'smooth' });
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    if (!dataLoaded) return undefined;
    const params = new URLSearchParams(location.search || '');
    if (params.get('upgrade') !== '1') return undefined;

    const timer = setTimeout(() => {
      scrollToSection('pn-section-subscription');
    }, 120);
    return () => clearTimeout(timer);
  }, [dataLoaded, location.search, scrollToSection]);

  const activeBillingCycle = subscriptionData.billingCycle === 'yearly' ? 'yearly' : 'monthly';
  const billingLabel = activeBillingCycle === 'yearly' ? '/yr' : '/mo';
  const currentPlanId = String(subscriptionData.currentPlanId || 'starter').trim().toLowerCase();
  const currentPlan = subscriptionData.plans.find(p => String(p.id || '').trim().toLowerCase() === currentPlanId) || PLAN_FALLBACKS[currentPlanId] || null;
  const currentPlanPrice = currentPlan ? getPlanPrice(currentPlan, activeBillingCycle) : 0;
  const currentPlanYearlySavingsPct = currentPlan ? getYearlySavingsPct(currentPlan) : 0;
  const currentPlanYearlySavingsUsd = currentPlan ? getYearlySavingsUsd(currentPlan) : 0;
  const currentPlanYearlyEquivalentMonthly = currentPlan ? getYearlyEquivalentMonthly(currentPlan) : 0;

  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    if (userName) {
      loadProfile();
      const idleHandles = [
        scheduleProfileIdle(() => loadSubscriptionOverview({ silent: true, includeUsage: true })),
        scheduleProfileIdle(() => loadGamificationStats()),
        scheduleProfileIdle(() => loadRateLimitStatus())
      ];
      return () => idleHandles.forEach(cancelProfileIdle);
    }
    return undefined;
  }, []);

  const displayName = profileData.firstName || pfp?.firstName || pfp?.first_name
    || localStorage.getItem(DISPLAY_NAME_KEY)
    || (userName ? userName.split('@')[0] : 'Profile');
  const isGoogleAccount = Boolean(pfp?.googleUser || pfp?.google_user);
  const initial = (displayName[0] || 'A').toUpperCase();
  const profilePhoto = pfp?.picture || pfp?.picture_url || '';
  const activeCustomPfp = pfp?.customPfp || '';
  const defaultUserPfp = pfp?.defaultPfp || '';
  const profileLevel = gamificationStats?.level || 1;
  const profileXp = gamificationStats?.total_points || gamificationStats?.experience || 0;
  const nextLevelXp = gamificationStats?.next_level_xp || 100;
  const levelProgress = Math.min(100, Math.max(0, nextLevelXp ? (profileXp / nextLevelXp) * 100 : 0));

  useEffect(() => {
    const full = String(displayName || '').trim();
    if (!full) { setTypedName(''); setNameDone(true); return; }
    setTypedName(''); setNameDone(false);
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setTypedName(full.slice(0, i));
      if (i >= full.length) { clearInterval(t); setNameDone(true); }
    }, 80);
    return () => clearInterval(t);
  }, [displayName]);

  const loadSubscriptionOverview = useCallback(async ({ silent = false, includeUsage = false } = {}) => {
    if (!userName) return;
    if (!silent) {
      setSubscriptionData(prev => ({ ...prev, loading: true, error: null }));
    }
    try {
      const resp = await fetch(`${API_URL}/subscription/overview?user_id=${encodeURIComponent(userName)}&include_usage=${includeUsage ? 'true' : 'false'}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (!resp.ok) {
        throw new Error(`Subscription overview failed: ${resp.status}`);
      }
      const data = await resp.json();
      setSubscriptionData(prev => ({
        ...prev,
        loading: false,
        error: null,
        currentPlanId: data.currentPlanId || 'starter',
        billingCycle: data.billingCycle || 'monthly',
        subscriptionStatus: data.subscriptionStatus || 'active',
        subscriptionStartedAt: data.subscriptionStartedAt || null,
        plans: Array.isArray(data.plans) && data.plans.length ? data.plans.map(withCurrentPlanCredits) : FALLBACK_PLANS,
        usage: data.usage || prev.usage || null
      }));
    } catch (e) {
      setSubscriptionData(prev => ({
        ...prev,
        loading: false,
        error: silent ? prev.error : 'Unable to load subscription data.'
      }));
    }
  }, [API_URL, token, userName]);

  const loadRateLimitStatus = useCallback(async () => {
    if (!token) return;
    try {
      const resp = await fetch(`${API_URL}/rate-limits/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.ok) setRateLimits(await resp.json());
    } catch (e) { /* silenced */ }
  }, [API_URL, token]);

  const readApiError = async (resp, fallbackMessage) => {
    try {
      const payload = await resp.json();
      if (payload?.detail) return payload.detail;
    } catch (e) { /* silenced */ }
    return fallbackMessage;
  };

  const handleSelectPlan = async (planId) => {
    if (!userName || !planId || subscriptionData.saving || planId === subscriptionData.currentPlanId) return;
    const currentBillingCycle = subscriptionData.billingCycle || 'monthly';
    setSubscriptionData(prev => ({
      ...prev,
      saving: true,
      saveAction: 'plan',
      error: null
    }));
    try {
      const isFreePlan = planId === 'starter';
      const resp = await fetch(`${API_URL}/subscription/${isFreePlan ? 'select' : 'checkout'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          user_id: userName,
          tier: planId,
          billingCycle: currentBillingCycle,
          subscriptionStatus: 'active'
        })
      });
      if (!resp.ok) {
        throw new Error(await readApiError(resp, 'Unable to switch plan right now.'));
      }
      const data = await resp.json().catch(() => ({}));
      if (!isFreePlan) {
        const checkoutUrl = new URL(data.checkoutUrl || '');
        if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com') {
          throw new Error('The payment provider returned an invalid checkout URL.');
        }
        window.location.assign(checkoutUrl.toString());
        return;
      }
      setSubscriptionData(prev => ({
        ...prev,
        currentPlanId: data.subscriptionTier || planId,
        billingCycle: data.billingCycle || prev.billingCycle,
        subscriptionStatus: data.subscriptionStatus || prev.subscriptionStatus
      }));
      void loadSubscriptionOverview({ silent: true, includeUsage: true });
    } catch (e) {
      setSubscriptionData(prev => ({
        ...prev,
        error: e?.message || 'Unable to switch plan right now.'
      }));
    } finally {
      setSubscriptionData(prev => ({ ...prev, saving: false, saveAction: null }));
    }
  };

  const handleBillingCycleChange = (nextCycle) => {
    if (!userName || !nextCycle || subscriptionData.saving || nextCycle === subscriptionData.billingCycle) return;
    setSubscriptionData(prev => ({
      ...prev,
      billingCycle: nextCycle,
      error: null
    }));
  };

  const loadProfile = async () => {
    try {
      const resp = await fetch(`${API_URL}/get_comprehensive_profile?user_id=${userName}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (resp.ok) {
        const data = await resp.json();
        const newData = toProfileFormData(data, userName);
        setProfileData(newData);
        lastSavedRef.current = JSON.stringify(newData);
        if (data.quizResponses) {
          try { setQuizAnswers(typeof data.quizResponses === 'string' ? JSON.parse(data.quizResponses) : data.quizResponses); }
          catch (e) { /* silenced */ }
        }
        localStorage.setItem('userProfile', JSON.stringify(newData));
      }
    } catch (e) { /* silenced */ }
    setDataLoaded(true);
    setLastSaved(new Date().toLocaleTimeString());
  };

  const loadGamificationStats = async () => {
    try {
      const resp = await fetch(`${API_URL}/get_gamification_stats?user_id=${encodeURIComponent(userName)}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (resp.ok) {
        setGamificationStats(await resp.json());
      }
    } catch (e) { /* silenced */ }
  };

  const autoSave = useCallback(async (data) => {
    if (isSavingRef.current) return;
    const snapshot = JSON.stringify(data);
    if (snapshot === lastSavedRef.current) return;
    isSavingRef.current = true;
    setAutoSaving(true);
    try {
      const resp = await fetch(`${API_URL}/update_comprehensive_profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...data, user_id: userName })
      });
      if (resp.ok) {
        const responseData = await resp.json().catch(() => ({}));
        const savedData = { ...data };
        if (responseData.username) {
          savedData.username = responseData.username;
          localStorage.setItem('username', responseData.username);
          setUserName(responseData.username);
        }
        if (responseData.access_token) {
          localStorage.setItem('token', responseData.access_token);
        }
        const savedSnapshot = JSON.stringify(savedData);
        lastSavedRef.current = savedSnapshot;
        setLastSaved(new Date().toLocaleTimeString());
        setProfileSaveError('');
        localStorage.setItem('userProfile', savedSnapshot);
      } else {
        const errorData = await resp.json().catch(() => ({}));
        setProfileSaveError(errorData.detail || 'Could not save profile changes.');
      }
    } catch (e) {
      setProfileSaveError('Could not save profile changes.');
    }
    isSavingRef.current = false;
    setAutoSaving(false);
  }, [token, userName]);

  useEffect(() => {
    if (!dataLoaded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const snapshot = JSON.stringify(profileData);
    if (snapshot === lastSavedRef.current) return;
    saveTimerRef.current = setTimeout(() => autoSave(profileData), 3000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [profileData, dataLoaded]);

  const setField = (field, value) => {
    setProfileData(prev => ({ ...prev, [field]: value }));
    if (field === 'showStudyInsights' || field === 'notificationsEnabled') {
      const cp = localStorage.getItem('userProfile');
      if (cp) {
        try { const p = JSON.parse(cp); p[field] = value; localStorage.setItem('userProfile', JSON.stringify(p)); } catch (e) { /* silenced */ }
      }
      try { window.dispatchEvent(new Event('notification-settings-changed')); } catch (e) { /* silenced */ }
    }
  };

  const toggleSubject = (s) => setField('preferredSubjects',
    profileData.preferredSubjects.includes(s)
      ? profileData.preferredSubjects.filter(x => x !== s)
      : [...profileData.preferredSubjects, s]
  );

  const savePfp = (next) => {
    let base = {};
    const raw = localStorage.getItem('userProfile');
    if (raw) try { base = JSON.parse(raw) || {}; } catch (e) { /* silenced */ }
    const merged = hydrateProfile({ ...base, ...next }, userName);
    setPfp(merged);
    localStorage.setItem('userProfile', JSON.stringify(merged));
    if (merged.defaultPfp) localStorage.setItem(PFP_DEFAULT_KEY, merged.defaultPfp);
    if (merged.customPfp) localStorage.setItem(PFP_CUSTOM_KEY, merged.customPfp);
    else localStorage.removeItem(PFP_CUSTOM_KEY);
    if (merged.firstName) localStorage.setItem(DISPLAY_NAME_KEY, merged.firstName);
  };

  const selectPreset = (src) => {
    const cur = pfp || {};
    const def = cur.defaultPfp || cur.googlePicture || cur.photoURL || cur.photo_url
      || (isAllowedCustomPfp(cur.picture_url || cur.picture || '') ? '' : (cur.picture_url || cur.picture || '')) || '';
    savePfp({ ...cur, defaultPfp: def, customPfp: src, picture: src, picture_url: src });
    setPfpModalOpen(false);
  };

  const selectDefault = () => {
    const cur = pfp || {};
    const def = cur.defaultPfp || cur.googlePicture || cur.photoURL || cur.photo_url
      || (isAllowedCustomPfp(cur.picture_url || cur.picture || '') ? '' : (cur.picture_url || cur.picture || '')) || '';
    savePfp({ ...cur, defaultPfp: def, customPfp: '', picture: def, picture_url: def });
    setPfpModalOpen(false);
  };

  const selectUploaded = (dataUrl) => {
    const cur = pfp || {};
    const def = cur.defaultPfp || cur.googlePicture || cur.photoURL || cur.photo_url
      || (isAllowedCustomPfp(cur.picture_url || cur.picture || '') ? '' : (cur.picture_url || cur.picture || '')) || '';
    savePfp({ ...cur, defaultPfp: def, customPfp: dataUrl, picture: dataUrl, picture_url: dataUrl });
  };

  const handlePfpUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const isJpeg = file.type === 'image/jpeg' || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg');
    if (!isJpeg) {
      alert('Please choose a JPG or JPEG image.');
      return;
    }
    if (file.size > MAX_CUSTOM_PFP_BYTES) {
      alert('Please choose an image under 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!isUploadedPfp(dataUrl)) {
        alert('Could not read this JPG image.');
        return;
      }
      selectUploaded(dataUrl);
    };
    reader.onerror = () => alert('Could not read this image.');
    reader.readAsDataURL(file);
  };

  const clearSessionAndNavigate = (targetPath = '/login') => {
    void signOutAppSession();
    navigate(targetPath);
  };

  const clearSessionAndGoLogin = () => clearSessionAndNavigate('/login');

  const fetchWithTimeout = async (url, options = {}, timeoutMs = 20000) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const requestAccountDeletion = async (e) => {
    e.preventDefault();
    if (!isGoogleAccount && !deleteForm.password.trim()) {
      setDeleteStatus('Enter your password first.');
      return;
    }

    setDeleteLoading(true);
    setDeleteStatus('');
    try {
      const resp = await fetchWithTimeout(`${API_URL}/account/delete/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ password: isGoogleAccount ? null : deleteForm.password })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.detail || `HTTP ${resp.status}`);
      const devOtp = data.dev_otp ? ` Dev OTP: ${data.dev_otp}` : '';
      setDeleteStatus(`${data.message || 'Deletion OTP sent to your email.'}${devOtp}`);
      setDeleteStep('otp');
    } catch (e) {
      setDeleteStatus(e?.name === 'AbortError' ? 'Delete OTP request timed out. Try again.' : (e?.message || 'Could not send deletion OTP.'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmAccountDeletion = async (e) => {
    e.preventDefault();
    if (!deleteForm.otp.trim()) {
      setDeleteStatus('Enter the deletion OTP.');
      return;
    }
    if (!window.confirm('This permanently deletes your account and learning data. Continue?')) {
      return;
    }

    setDeleteLoading(true);
    setDeleteStatus('');
    try {
      const resp = await fetchWithTimeout(`${API_URL}/account/delete/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ otp: deleteForm.otp.trim() })
      }, 30000);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.detail || `HTTP ${resp.status}`);
      clearSessionAndNavigate('/');
    } catch (e) {
      setDeleteStatus(e?.name === 'AbortError' ? 'Account deletion timed out. Refresh and try again.' : (e?.message || 'Could not delete account.'));
    } finally {
      setDeleteLoading(false);
    }
  };

  useEffect(() => {
    if (!pfpModalOpen) return;
    const fn = (e) => { if (e.key === 'Escape') setPfpModalOpen(false); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [pfpModalOpen]);

  const arch = profileData.primaryArchetype ? ARCHETYPE_INFO[profileData.primaryArchetype] : null;
  const archSecondary = profileData.secondaryArchetype ? ARCHETYPE_INFO[profileData.secondaryArchetype] : null;

  const QUIZ_LABELS = {
    learningEnvironment: 'Learning Environment', problemSolving: 'Problem Solving',
    newConcepts: 'New Concepts', informationProcessing: 'Information Processing',
    feedback: 'Feedback Preference', studyPreference: 'Study Preference',
    challengeResponse: 'Challenge Response', contentType: 'Content Type'
  };
  const ANSWER_LABELS = {
    structured: 'Structured & Organized', flexible: 'Flexible & Adaptive',
    collaborative: 'Collaborative', independent: 'Independent',
    break_down: 'Break Into Steps', visualize: 'Visualize Big Picture',
    experiment: 'Hands-on Experimentation', discuss: 'Discussion & Dialogue',
    reading: 'Reading & Text', visual: 'Visual & Diagrams',
    hands_on: 'Hands-on Practice', discussion: 'Discussion',
    logic: 'Logical Analysis', patterns: 'Pattern Recognition',
    emotion: 'Emotional Connection', action: 'Physical Action',
    detailed: 'Detailed Analysis', encouraging: 'Encouraging',
    constructive: 'Constructive', direct: 'Direct & Concise'
  };

  return (
    <div className="pn-root">
      <GeoBackground />

      <div className="pn-topbar">
        <div className="pn-topbar-center"><span className="shc-tagline"><span>LEARNING,</span> UNIFIED</span></div>
        <div className="pn-topbar-actions">
          <button className="pn-top-action" onClick={() => navigate('/dashboard-cerbyl')} type="button">
            <span>Dashboard</span>
          </button>
          <div className="pn-save-status">
            {autoSaving ? (
              <span className="pn-saving">saving<span className="pn-saving-dots"><i/><i/><i/></span></span>
            ) : profileSaveError ? (
              <span className="pn-save-error">{profileSaveError}</span>
            ) : lastSaved ? (
              <span className="pn-saved">· saved {lastSaved}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="pf-qb-body">
        <div className={`pf-qb-shell ${sidebarCollapsed ? 'pf-qb-shell--collapsed' : ''}`}>
          <SidebarShell
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
            brandKicker="PROFILE"
            ariaLabel="Profile navigation"
            collapsedContent={(
              <>
                <SidebarStripButton icon={<User size={18} />} tip="Overview" onClick={() => { setSidebarCollapsed(false); scrollToSection('pn-section-overview'); }} />
                <SidebarStripButton icon={<CreditCard size={18} />} tip="Subscription" onClick={() => { setSidebarCollapsed(false); scrollToSection('pn-section-subscription'); }} />
                <SidebarStripButton icon={<Gauge size={18} />} tip="Usage" onClick={() => navigate('/profile/usage')} />
                <SidebarStripButton icon={<BookOpen size={18} />} tip="Personal Info" onClick={() => { setSidebarCollapsed(false); scrollToSection('pn-section-personal'); }} />
                <SidebarStripButton icon={<Target size={18} />} tip="Learning Goals" onClick={() => { setSidebarCollapsed(false); scrollToSection('pn-section-goals'); }} />
                <SidebarStripButton icon={<Sparkles size={18} />} tip="Subjects" onClick={() => { setSidebarCollapsed(false); scrollToSection('pn-section-subjects'); }} />
                <SidebarStripDivider />
                <SidebarStripButton icon={<Settings size={18} />} tip="Settings" onClick={() => { setSidebarCollapsed(false); scrollToSection('pn-section-settings'); }} />
                <SidebarStripButton icon={<Trash2 size={18} />} tip="Account" onClick={() => { setSidebarCollapsed(false); scrollToSection('pn-section-account'); }} />
                <SidebarStripButton icon={<Award size={18} />} tip="Retake Assessment" onClick={() => navigate('/profile-quiz')} />
                <SidebarStripSpacer />
                <SidebarStripButton icon={<MessageSquare size={18} />} tip="AI Chat" onClick={() => navigate('/ai-chat')} />
                <SidebarStripButton icon={<LayoutDashboard size={18} />} tip="Dashboard" onClick={() => navigate('/dashboard-cerbyl')} />
                <SidebarStripButton icon={<LogOut size={18} />} tip="Logout" onClick={clearSessionAndGoLogin} />
              </>
            )}
          >
            <SidebarSection heading="Sections">
              <SidebarMenuItem icon={<User size={16} />} label="Overview" onClick={() => scrollToSection('pn-section-overview')} />
              <SidebarMenuItem icon={<CreditCard size={16} />} label="Subscription" onClick={() => scrollToSection('pn-section-subscription')} />
              <SidebarMenuItem icon={<Gauge size={16} />} label="Usage" onClick={() => navigate('/profile/usage')} />
              <SidebarMenuItem icon={<BookOpen size={16} />} label="Personal Info" onClick={() => scrollToSection('pn-section-personal')} />
              <SidebarMenuItem icon={<Target size={16} />} label="Learning Goals" onClick={() => scrollToSection('pn-section-goals')} />
              <SidebarMenuItem icon={<Sparkles size={16} />} label="Subjects" onClick={() => scrollToSection('pn-section-subjects')} />
            </SidebarSection>

            <SidebarSection heading="Account">
              <SidebarMenuItem icon={<LayoutDashboard size={16} />} label="Dashboard" onClick={() => navigate('/dashboard-cerbyl')} />
              <SidebarMenuItem icon={<Settings size={16} />} label="Settings" onClick={() => scrollToSection('pn-section-settings')} />
              <SidebarMenuItem icon={<Trash2 size={16} />} label="Delete Account" onClick={() => scrollToSection('pn-section-account')} />
              <SidebarMenuItem icon={<Award size={16} />} label="Retake Assessment" onClick={() => navigate('/profile-quiz')} />
            </SidebarSection>

            <SidebarStats>
              <SidebarStatBox value={profileLevel} label="Level" />
              <SidebarStatBox value={profileXp.toLocaleString()} label="XP" />
              <SidebarStatBox value={`${Math.round(levelProgress)}%`} label="Progress" />
            </SidebarStats>

            <SidebarActions>
              <SidebarAction icon={<LayoutDashboard size={14} />} label="Dashboard" onClick={() => navigate('/dashboard-cerbyl')} />
              <SidebarAction icon={<MessageSquare size={14} />} label="AI Chat" onClick={() => navigate('/ai-chat')} />
              <SidebarAction icon={<LogOut size={14} />} label="Logout" onClick={clearSessionAndGoLogin} />
            </SidebarActions>
          </SidebarShell>

          <main className="pf-qb-main" ref={mainScrollRef}>
      <div className="pn-wrap">

        {}
        <section className="pn-hero" id="pn-section-overview">
          <div className="pn-hero-text">
            <div className="pn-eyebrow">YOUR PROFILE</div>
            <h1 className="pn-name">
              {nameDone ? displayName : typedName}
              {!nameDone && <span className="pn-cursor" aria-hidden />}
              {nameDone && <span className="pn-period">.</span>}
            </h1>
            {arch && (
              <div className="pn-hero-badges">
                <span className="pn-badge">{profileData.primaryArchetype}</span>
                {profileData.secondaryArchetype && <span className="pn-badge pn-badge--ghost">{profileData.secondaryArchetype}</span>}
              </div>
            )}
            <div className="pn-level-card">
              <div className="pn-level-icon"><Award size={18} /></div>
              <div className="pn-level-meta">
                <span className="pn-level-kicker">Current Level</span>
                <strong>Level {profileLevel}</strong>
                <div className="pn-level-track">
                  <span style={{ width: `${levelProgress}%` }} />
                </div>
              </div>
              <div className="pn-level-xp">{profileXp.toLocaleString()} XP</div>
            </div>
          </div>
          <div className="pn-pfp-wrap">
            <div className="pn-pfp-ring">
              {profilePhoto ? (
                <img src={profilePhoto} alt={displayName} className="pn-pfp-img" referrerPolicy="no-referrer" />
              ) : (
                <div className="pn-pfp-fallback">{initial}</div>
              )}
              <button className="pn-pfp-edit-btn" onClick={() => setPfpModalOpen(true)} aria-label="Edit profile picture">
                <Pencil size={13} /> Edit PFP
              </button>
            </div>
          </div>
        </section>

        {}
        {profileData.primaryArchetype ? (
          <section className="pn-section">
            <div className="pn-section-label">LEARNING ARCHETYPE</div>
            <div className="pn-archetype-grid">
              <div className="pn-archetype-main">
                <div className="pn-arch-tag">PRIMARY</div>
                <div className="pn-arch-name">{profileData.primaryArchetype}</div>
                <div className="pn-arch-tagline">{arch?.tagline}</div>
                <p className="pn-arch-desc">{arch?.desc}</p>
                {profileData.secondaryArchetype && (
                  <div className="pn-arch-secondary">
                    <span className="pn-arch-secondary-tag">SECONDARY</span>
                    <span className="pn-arch-secondary-name">{profileData.secondaryArchetype}</span>
                    <span className="pn-arch-secondary-sub">{archSecondary?.tagline}</span>
                  </div>
                )}
                <button className="pn-retake-btn" onClick={() => navigate('/profile-quiz')}>
                  Retake Assessment
                </button>
              </div>
              {Object.keys(profileData.archetypeScores).length > 0 && (
                <div className="pn-archetype-bars">
                  <div className="pn-bars-label">BREAKDOWN</div>
                  {Object.entries(profileData.archetypeScores)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 6)
                    .map(([name, score]) => (
                      <div key={name} className="pn-bar-row">
                        <span className="pn-bar-name">{name}</span>
                        <div className="pn-bar-track">
                          <div className="pn-bar-fill" style={{ width: `${score}%` }} />
                        </div>
                        <span className="pn-bar-pct">{Math.round(score)}%</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="pn-section">
            <div className="pn-section-label">LEARNING ARCHETYPE</div>
            <button className="pn-discover-btn" onClick={() => navigate('/profile-quiz')}>
              <span className="pn-discover-title">Discover Your Learning Archetype</span>
              <span className="pn-discover-sub">Take our assessment to unlock personalized AI tutoring tailored to your style</span>
            </button>
          </section>
        )}

        <section className="pn-section" id="pn-section-subscription">
          <div className="pn-section-label">SUBSCRIPTION</div>
          <div className="pn-subscription-header">
            <div className="pn-subscription-current">
              <span className="pn-subscription-current-icon" aria-hidden>
                <BarChart3 size={16} />
              </span>
              <span className="pn-subscription-current-copy">
                <span className="pn-subscription-current-label">Current Plan</span>
                <span className="pn-subscription-current-value">
                  {currentPlan
                    ? `${currentPlan.name} · ${formatUsd(currentPlanPrice)}${billingLabel}`
                    : `Starter · ${formatUsd(0)}/mo`}
                </span>
              </span>
            </div>
            <div className="pn-billing-toggle" role="group" aria-label="Billing cycle">
              <span
                className={`pn-billing-glider ${activeBillingCycle === 'yearly' ? 'pn-billing-glider--yearly' : ''}`}
                aria-hidden
              />
              <button
                className={`pn-billing-btn ${activeBillingCycle === 'monthly' ? 'pn-billing-btn--active' : ''}`}
                onClick={() => handleBillingCycleChange('monthly')}
                disabled={subscriptionData.saving}
              >
                Monthly
              </button>
              <button
                className={`pn-billing-btn ${activeBillingCycle === 'yearly' ? 'pn-billing-btn--active' : ''}`}
                onClick={() => handleBillingCycleChange('yearly')}
                disabled={subscriptionData.saving}
              >
                Yearly
              </button>
            </div>
            <p
              className={`pn-subscription-note ${
                activeBillingCycle === 'yearly'
                  ? 'pn-subscription-note--yearly'
                  : (currentPlanYearlySavingsPct > 0 ? 'pn-subscription-note--savings' : '')
              }`}
            >
              {activeBillingCycle === 'yearly'
                ? (
                  currentPlan
                    ? (
                      <>
                        <span className="pn-subscription-note-strong">Yearly billing active.</span>{' '}
                        {formatUsd(currentPlanPrice)}{billingLabel}
                        {currentPlanYearlyEquivalentMonthly > 0 && (
                          <>
                            {' '}· <span className="pn-subscription-note-strong">~{formatUsd(currentPlanYearlyEquivalentMonthly)}/mo effective</span>
                          </>
                        )}
                        {currentPlanYearlySavingsPct > 0 && (
                          <>
                            {' '}· <span className="pn-subscription-note-strong">Save {currentPlanYearlySavingsPct}%</span>
                          </>
                        )}
                      </>
                    )
                    : 'Yearly billing enabled. You can switch anytime.'
                )
                : (
                  currentPlanYearlySavingsPct > 0
                    ? (
                      <>
                        <span className="pn-subscription-note-strong">
                          Switch to yearly and save {currentPlanYearlySavingsPct}%.
                        </span>{' '}
                        That’s {formatUsd(currentPlanYearlySavingsUsd)}/year.
                      </>
                    )
                    : 'Choose the plan that fits your study flow. You can switch anytime.'
                )}
            </p>
          </div>

          {subscriptionData.loading ? (
            <div className="pn-subscription-loading">Loading subscription plans...</div>
          ) : (
            <>
              <div className="pn-plan-grid">
                {subscriptionData.plans.map((plan) => {
                  const meta = PLAN_META[plan.id] || PLAN_META.starter;
                  const Icon = meta.icon;
                  const isCurrent = subscriptionData.currentPlanId === plan.id;
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
                      <ul className="pn-plan-features">
                        {(plan.features || []).map((feature) => (
                          <li key={feature}><Check size={11} />{feature}</li>
                        ))}
                      </ul>
                      <button
                        className={`pn-plan-cta ${isCurrent ? 'pn-plan-cta--current' : ''}`}
                        onClick={() => handleSelectPlan(plan.id)}
                        disabled={isCurrent || subscriptionData.saving}
                      >
                        {isCurrent ? 'Current Plan' : (subscriptionData.saveAction === 'plan' ? 'Switching...' : 'Switch Plan')}
                      </button>
                    </article>
                  );
                })}
              </div>
            </>
          )}
          {subscriptionData.error && <div className="pn-subscription-error">{subscriptionData.error}</div>}

          {rateLimits && (
            <div className="pn-usage-card">
              <div className="pn-usage-header">
                <span className="pn-usage-title">Session Usage</span>
                <span className="pn-usage-subtitle">4-hour rolling window · resets automatically</span>
              </div>
              {['ai_heavy', 'ai_light', 'file_upload'].map(tier => {
                const t = rateLimits.tiers?.[tier];
                if (!t || t.limit === 'unlimited') return null;
                const pct = Math.min(100, Math.round((t.used / t.limit) * 100));
                const resetStr = t.reset_at > 0 ? formatReset(t.reset_at) : '—';
                return (
                  <div key={tier} className="pn-usage-row">
                    <div className="pn-usage-meta">
                      <span className="pn-usage-label">{USAGE_TIER_LABELS[tier]}</span>
                      <span className="pn-usage-count">{t.used} / {t.limit}</span>
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
          )}
        </section>

        <div className="pn-divider" />

        {}
        <div className="pn-two-col">
          <section className="pn-section" id="pn-section-personal">
            <div className="pn-section-label">PERSONAL INFO</div>
            <div className="pn-field-row">
              <div className="pn-field">
                <label className="pn-field-label">First Name</label>
                <input className="pn-input" value={profileData.firstName} onChange={e => setField('firstName', e.target.value)} placeholder="First name" />
              </div>
              <div className="pn-field">
                <label className="pn-field-label">Last Name</label>
                <input className="pn-input" value={profileData.lastName} onChange={e => setField('lastName', e.target.value)} placeholder="Last name" />
              </div>
            </div>
            <div className="pn-field pn-field--full">
              <label className="pn-field-label">Username</label>
              <input
                className="pn-input"
                value={profileData.username}
                onChange={e => setField('username', e.target.value)}
                placeholder="Your username"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
            <div className="pn-field pn-field--full">
              <label className="pn-field-label">Email Address</label>
              <input className="pn-input" type="email" value={profileData.email} onChange={e => setField('email', e.target.value)} placeholder="your@email.com" />
            </div>
          </section>

          <section className="pn-section" id="pn-section-goals">
            <div className="pn-section-label">LEARNING GOALS</div>
            {profileData.quizSkipped && !profileData.quizCompleted && !profileData.fieldOfStudy && profileData.preferredSubjects.length === 0 && (
              <button className="pn-discover-btn" onClick={() => navigate('/profile-quiz')}>
                <span className="pn-discover-title">Complete Your Profile</span>
                <span className="pn-discover-sub">You skipped onboarding — set your subject and goals so the AI tutor can personalize your experience, or fill them in below</span>
              </button>
            )}
            <div className="pn-field pn-field--full">
              <label className="pn-field-label">Main Subject</label>
              <select className="pn-select" value={profileData.fieldOfStudy} onChange={e => setField('fieldOfStudy', e.target.value)}>
                <option value="">Select your main subject</option>
                {ALL_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="pn-field pn-field--full">
              <label className="pn-field-label">Primary Goal</label>
              <select className="pn-select" value={profileData.brainwaveGoal} onChange={e => setField('brainwaveGoal', e.target.value)}>
                <option value="">Select your goal</option>
                {Object.entries(BRAINWAVE_GOALS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </section>
        </div>

        <div className="pn-divider" />

        {}
        <section className="pn-section" id="pn-section-subjects">
          <div className="pn-section-label">INTERESTED SUBJECTS</div>
          <div className="pn-subjects-grid">
            {ALL_SUBJECTS.map(s => (
              <button
                key={s}
                className={`pn-chip ${profileData.preferredSubjects.includes(s) ? 'pn-chip--on' : ''}`}
                onClick={() => toggleSubject(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        <div className="pn-divider" />

        {}
        <section className="pn-section" id="pn-section-settings">
          <div className="pn-section-label">SETTINGS</div>
          <div className="pn-settings-grid">
            <div className="pn-setting-row">
              <div className="pn-setting-info">
                <span className="pn-setting-label">Study Insights on Login</span>
                <span className="pn-setting-desc">Display study insights page when you first log in each day</span>
              </div>
              <button
                className={`pn-toggle ${profileData.showStudyInsights ? 'pn-toggle--on' : ''}`}
                onClick={() => setField('showStudyInsights', !profileData.showStudyInsights)}
                role="switch" aria-checked={profileData.showStudyInsights}
              >
                <span className="pn-toggle-thumb" />
              </button>
            </div>
            <div className="pn-setting-row">
              <div className="pn-setting-info">
                <span className="pn-setting-label">Enable Notifications</span>
                <span className="pn-setting-desc">Show notification popups and unread badges across the app</span>
              </div>
              <button
                className={`pn-toggle ${profileData.notificationsEnabled ? 'pn-toggle--on' : ''}`}
                onClick={() => setField('notificationsEnabled', !profileData.notificationsEnabled)}
                role="switch" aria-checked={profileData.notificationsEnabled}
              >
                <span className="pn-toggle-thumb" />
              </button>
            </div>
          </div>
        </section>

        <div className="pn-divider" />

        <section className="pn-section pn-danger-section" id="pn-section-account">
          <div className="pn-section-label">ACCOUNT</div>
          <div className="pn-account-actions">
            <div className="pn-account-action-copy">
              <span className="pn-account-title"><Trash2 size={15} /> Delete Account</span>
              <p>
                {isGoogleAccount
                  ? 'We will email an OTP before permanently deleting this Google-linked account.'
                  : 'Enter your password first. We will email an OTP before permanently deleting the account.'}
              </p>
            </div>
            {deleteStep === 'password' ? (
              <form className="pn-delete-form" onSubmit={requestAccountDeletion}>
                {!isGoogleAccount && (
                  <input
                    className="pn-input"
                    type="password"
                    value={deleteForm.password}
                    onChange={e => setDeleteForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Account password"
                    disabled={deleteLoading}
                  />
                )}
                <button className="pn-danger-btn" type="submit" disabled={deleteLoading}>
                  {deleteLoading ? 'Sending OTP...' : 'Send Delete OTP'}
                </button>
              </form>
            ) : (
              <form className="pn-delete-form" onSubmit={confirmAccountDeletion}>
                <input
                  className="pn-input"
                  type="text"
                  value={deleteForm.otp}
                  onChange={e => setDeleteForm(prev => ({ ...prev, otp: e.target.value }))}
                  placeholder="6-digit deletion OTP"
                  inputMode="numeric"
                  maxLength={6}
                  disabled={deleteLoading}
                />
                <button className="pn-danger-btn" type="submit" disabled={deleteLoading}>
                  {deleteLoading ? 'Deleting...' : 'Delete Permanently'}
                </button>
              </form>
            )}
            {deleteStatus && <div className="pn-delete-status">{deleteStatus}</div>}
          </div>
        </section>

        {}
        {Object.keys(quizAnswers).length > 0 && (
          <>
            <div className="pn-divider" />
            <section className="pn-section">
              <div className="pn-section-label">ASSESSMENT RESPONSES</div>
              <div className="pn-quiz-grid">
                {Object.entries(quizAnswers).map(([q, a]) => (
                  <div key={q} className="pn-quiz-item">
                    <span className="pn-quiz-q">{QUIZ_LABELS[q] || q}</span>
                    <span className="pn-quiz-a">{ANSWER_LABELS[a] || a}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <div className="pn-bottom-gap" />
      </div>
          </main>
        </div>
      </div>

      {}
      {pfpModalOpen && (
        <div className="pn-modal-overlay" onClick={() => setPfpModalOpen(false)}>
          <div className="pn-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="pn-modal-head">
              <div>
                <div className="pn-modal-kicker">PROFILE PERSONALIZATION</div>
                <h3 className="pn-modal-title">Select Your PFP</h3>
              </div>
              <button className="pn-modal-close" onClick={() => setPfpModalOpen(false)}><X size={15} /></button>
            </div>
            <input
              ref={pfpUploadInputRef}
              className="pn-pfp-upload-input"
              type="file"
              accept=".jpg,.jpeg,image/jpeg"
              onChange={handlePfpUpload}
            />
            <div className="pn-pfp-grid">
              <button className={`pn-pfp-card ${!activeCustomPfp ? 'pn-pfp-card--active' : ''}`} onClick={selectDefault} type="button">
                <div className="pn-pfp-card-media">
                  {defaultUserPfp
                    ? <img src={defaultUserPfp} alt="Default" className="pn-pfp-card-img" referrerPolicy="no-referrer" />
                    : <div className="pn-pfp-card-fallback">{initial}</div>}
                </div>
                <div className="pn-pfp-card-label">Default</div>
                {!activeCustomPfp && <span className="pn-pfp-card-check"><Check size={11} /></span>}
              </button>
              {PRESET_PFPS.map(p => (
                <button key={p.id} className={`pn-pfp-card ${activeCustomPfp === p.src ? 'pn-pfp-card--active' : ''}`} onClick={() => selectPreset(p.src)} type="button">
                  <div className="pn-pfp-card-media">
                    <img src={p.src} alt={p.label} className="pn-pfp-card-img" />
                  </div>
                  <div className="pn-pfp-card-label">{p.label}</div>
                  {activeCustomPfp === p.src && <span className="pn-pfp-card-check"><Check size={11} /></span>}
                </button>
              ))}
              <button
                className={`pn-pfp-card pn-pfp-card--upload ${isUploadedPfp(activeCustomPfp) ? 'pn-pfp-card--active' : ''}`}
                onClick={() => pfpUploadInputRef.current?.click()}
                type="button"
              >
                <div className="pn-pfp-card-media">
                  {isUploadedPfp(activeCustomPfp) ? (
                    <img src={activeCustomPfp} alt="Custom uploaded profile" className="pn-pfp-card-img" />
                  ) : (
                    <div className="pn-pfp-upload-placeholder">
                      <Plus size={24} />
                    </div>
                  )}
                </div>
                <div className="pn-pfp-card-label">Custom</div>
                {isUploadedPfp(activeCustomPfp) && <span className="pn-pfp-card-check"><Check size={11} /></span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileNew;
