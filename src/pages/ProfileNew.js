import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X, Check, Pencil, Award, BarChart3, Crown, Rocket, ShieldCheck, LogOut, Trash2, User, CreditCard, Target, Settings, BookOpen, Sparkles, Plus, Gauge, ArrowUpRight, Bell, Eye, Fingerprint } from 'lucide-react';
import SocialHubChrome from '../components/SocialHubChrome';
import WeaknessTracker from '../components/WeaknessTracker/WeaknessTracker';
import { API_URL } from '../config';
import { signOutAppSession } from '../utils/authSession';
import { fetchAccountSession, getCachedAccountSession } from '../utils/institutionSession';
import { getProfileExperience } from '../utils/profileExperience';
import './ProfileNew.css';
import './ProfileWorkspace.css';

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

export const getHighResolutionProfilePhoto = (src, size = 1024) => {
  if (typeof src !== 'string' || !src) return '';
  if (!/^https:\/\/lh\d*\.googleusercontent\.com\//i.test(src)) return src;

  const safeSize = Math.max(256, Math.min(2048, Number(size) || 1024));
  return src.replace(/=s\d+(?:-c)?(?:-[a-z0-9-]+)?$/i, `=s${safeSize}-c`);
};

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

export const PriceTicker = ({ amount }) => {
  const target = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  const previousAmountRef = useRef(target);
  const direction = target >= previousAmountRef.current ? 'up' : 'down';

  useEffect(() => {
    previousAmountRef.current = target;
  }, [target]);

  return (
    <span
      key={target}
      className={`pn-price-ticker ${direction === 'up' ? 'pn-price-ticker--up' : 'pn-price-ticker--down'}`}
    >
      <span className="pn-price-ticker-value pn-price-ticker-value--new">
        {formatUsd(target)}
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
  const pfpTriggerRef = useRef(null);
  const pfpModalRef = useRef(null);
  const pfpCloseButtonRef = useRef(null);
  const pfpPreviousFocusRef = useRef(null);
  const token = localStorage.getItem('token');
  const [userName, setUserName] = useState(() => localStorage.getItem('username') || '');
  const [accountRole, setAccountRole] = useState(() => getCachedAccountSession()?.role || 'learner');
  const profileExperience = getProfileExperience(accountRole);

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
  const [, setAutoSaving] = useState(false);
  const [, setLastSaved] = useState(null);
  const [, setProfileSaveError] = useState('');
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
  const [activeSection, setActiveSection] = useState('pn-section-overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  ));
  const mainScrollRef = useRef(null);

  const scrollToSection = useCallback((id) => {
    const el = document.getElementById(id);
    const scroller = mainScrollRef.current;
    if (!el) return;
    if (scroller) {
      const targetTop = scroller.scrollTop
        + el.getBoundingClientRect().top
        - scroller.getBoundingClientRect().top;
      scroller.scrollTo({ top: Math.max(targetTop - 16, 0), behavior: 'smooth' });
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    const scroller = mainScrollRef.current;
    if (!scroller) return undefined;
    const sectionIds = [
      'pn-section-overview',
      'pn-section-personal',
      'pn-section-subjects',
      ...(profileExperience.showPaymentInformation ? ['pn-section-subscription'] : []),
      'pn-section-mastery',
      'pn-section-settings'
    ];
    let frame = null;
    const updateActiveSection = () => {
      frame = null;
      const scrollerTop = scroller.getBoundingClientRect().top;
      const current = sectionIds
        .map((id) => {
          const element = document.getElementById(id);
          return element ? { id, distance: Math.abs(element.getBoundingClientRect().top - scrollerTop - 24) } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.distance - b.distance)[0];
      if (current) setActiveSection(current.id);
    };
    const onScroll = () => {
      if (frame == null) frame = window.requestAnimationFrame(updateActiveSection);
    };
    updateActiveSection();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame != null) window.cancelAnimationFrame(frame);
    };
  }, [profileExperience.showPaymentInformation]);

  useEffect(() => {
    if (!dataLoaded) return undefined;
    const params = new URLSearchParams(location.search || '');
    if (!profileExperience.showPaymentInformation || params.get('upgrade') !== '1') return undefined;

    const timer = setTimeout(() => {
      scrollToSection('pn-section-subscription');
    }, 120);
    return () => clearTimeout(timer);
  }, [dataLoaded, location.search, profileExperience.showPaymentInformation, scrollToSection]);

  const activeBillingCycle = subscriptionData.billingCycle === 'yearly' ? 'yearly' : 'monthly';
  const billingLabel = activeBillingCycle === 'yearly' ? '/yr' : '/mo';
  const currentPlanId = String(subscriptionData.currentPlanId || 'starter').trim().toLowerCase();
  const currentPlan = subscriptionData.plans.find(p => String(p.id || '').trim().toLowerCase() === currentPlanId) || PLAN_FALLBACKS[currentPlanId] || null;
  const currentPlanPrice = currentPlan ? getPlanPrice(currentPlan, activeBillingCycle) : 0;
  const currentPlanYearlySavingsPct = currentPlan ? getYearlySavingsPct(currentPlan) : 0;
  const currentPlanYearlySavingsUsd = currentPlan ? getYearlySavingsUsd(currentPlan) : 0;
  const currentPlanYearlyEquivalentMonthly = currentPlan ? getYearlyEquivalentMonthly(currentPlan) : 0;

  useEffect(() => {
    let cancelled = false;
    fetchAccountSession({ force: true })
      .then((session) => {
        if (!cancelled && session?.role) setAccountRole(session.role);
      })
      .catch(() => {
        // apiRequest() already redirects to /login and clears the token on a
        // genuine 401 — only force-navigate here if that already happened
        // (no token left), so a transient network/500 error doesn't kick out
        // a still-validly-authenticated user.
        if (!cancelled && !localStorage.getItem('token')) navigate('/login', { replace: true });
      });
    return () => { cancelled = true; };
  }, [navigate]);

  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    if (!accountRole) return undefined;
    if (userName) {
      loadProfile();
      const idleHandles = [
        scheduleProfileIdle(() => loadGamificationStats()),
        ...(profileExperience.showPaymentInformation
          ? [
            scheduleProfileIdle(() => loadSubscriptionOverview({ silent: true, includeUsage: true })),
            scheduleProfileIdle(() => loadRateLimitStatus()),
          ]
          : []),
      ];
      return () => idleHandles.forEach(cancelProfileIdle);
    }
    return undefined;
  }, [accountRole]);

  const displayName = profileData.firstName || pfp?.firstName || pfp?.first_name
    || localStorage.getItem(DISPLAY_NAME_KEY)
    || (userName ? userName.split('@')[0] : 'Profile');
  const isGoogleAccount = Boolean(pfp?.googleUser || pfp?.google_user);
  const initial = (displayName[0] || 'A').toUpperCase();
  const profilePhoto = pfp?.picture || pfp?.picture_url || '';
  const displayProfilePhoto = getHighResolutionProfilePhoto(profilePhoto);
  const activeCustomPfp = pfp?.customPfp || '';
  const defaultUserPfp = pfp?.defaultPfp || '';
  const profileLevel = gamificationStats?.level || 1;
  const profileXp = gamificationStats?.total_points || gamificationStats?.experience || 0;
  const nextLevelXp = gamificationStats?.next_level_xp || 100;
  const levelProgress = Math.min(100, Math.max(0, nextLevelXp ? (profileXp / nextLevelXp) * 100 : 0));

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
    pfpPreviousFocusRef.current = document.activeElement;
    const focusFrame = window.requestAnimationFrame(() => pfpCloseButtonRef.current?.focus());
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setPfpModalOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !pfpModalRef.current) return;
      const focusable = Array.from(pfpModalRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onKeyDown);
      pfpPreviousFocusRef.current?.focus?.();
    };
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

  const profileSideSections = [
    {
      label: 'Profile',
      items: [
        { icon: User, label: 'Overview', active: activeSection === 'pn-section-overview', onClick: () => scrollToSection('pn-section-overview') },
        { icon: BookOpen, label: 'Identity', active: activeSection === 'pn-section-personal', onClick: () => scrollToSection('pn-section-personal') },
        { icon: Sparkles, label: 'Learning profile', active: activeSection === 'pn-section-subjects', onClick: () => scrollToSection('pn-section-subjects') },
        ...(profileExperience.showPaymentInformation ? [{ icon: CreditCard, label: 'Plan and usage', active: activeSection === 'pn-section-subscription', onClick: () => scrollToSection('pn-section-subscription') }] : [])
      ]
    },
    {
      label: 'Account',
      items: [
        { icon: BarChart3, label: 'Mastery', active: activeSection === 'pn-section-mastery', onClick: () => scrollToSection('pn-section-mastery') },
        { icon: Settings, label: 'Preferences', active: activeSection === 'pn-section-settings', onClick: () => scrollToSection('pn-section-settings') },
        { icon: Award, label: 'Assessment', onClick: () => navigate('/profile-quiz') }
      ]
    }
  ];

  return (
    <div className="pn-root pn-profile-workspace with-social-chrome">
      <SocialHubChrome
        brandKicker="Profile"
        sideSections={profileSideSections}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        topbarAction={{ label: 'Dashboard', path: profileExperience.dashboardRoute }}
        sidebarLead={(
          <button type="button" className="pnw-side-primary" onClick={() => scrollToSection('pn-section-personal')}>
            <Pencil size={15} />
            <span>Edit profile</span>
          </button>
        )}
        collapsedLeadItems={[
          { icon: Pencil, label: 'Edit profile', onClick: () => { setSidebarCollapsed(false); scrollToSection('pn-section-personal'); } }
        ]}
        collapsedTailItems={[
          { icon: LogOut, label: 'Sign out', onClick: clearSessionAndGoLogin }
        ]}
        sidebarTail={(
          <div className="pnw-sidebar-tail">
            <button type="button" onClick={clearSessionAndGoLogin}>
              <LogOut size={15} /><span>Sign out</span><ArrowUpRight size={13} />
            </button>
          </div>
        )}
      >
          <div className="pnw-main" ref={mainScrollRef}>
            <div className="pnw-canvas">
              <section className={`pnw-identity ${displayProfilePhoto ? '' : 'pnw-identity--no-photo'}`} id="pn-section-overview">
                <svg className="pnw-identity-signal" viewBox="0 0 1000 330" preserveAspectRatio="none" aria-hidden="true">
                  <path className="pnw-signal-path pnw-signal-path--primary" d="M26 270 C178 228 240 276 376 202 S610 116 760 154 S888 94 980 58" />
                  <path className="pnw-signal-path pnw-signal-path--secondary" d="M88 74 C226 118 296 94 418 136 S636 244 808 210 S922 230 988 184" />
                  <path className="pnw-signal-path pnw-signal-path--quiet" d="M236 318 C354 250 452 276 556 212 S738 76 946 106" />
                  <g className="pnw-signal-nodes">
                    <circle cx="178" cy="238" r="4" />
                    <circle cx="376" cy="202" r="5" />
                    <circle cx="610" cy="133" r="3" />
                    <circle cx="760" cy="154" r="5" />
                    <circle cx="296" cy="94" r="3" />
                    <circle cx="556" cy="212" r="4" />
                    <circle cx="808" cy="210" r="3" />
                    <circle cx="946" cy="106" r="4" />
                  </g>
                </svg>
                {displayProfilePhoto && (
                  <img
                    className="pnw-identity-backdrop"
                    src={displayProfilePhoto}
                    alt=""
                    aria-hidden="true"
                    referrerPolicy="no-referrer"
                    decoding="async"
                  />
                )}
                {!displayProfilePhoto && <div className="pnw-identity-initial" aria-hidden="true">{initial}</div>}
                <div className="pnw-identity-nameplate" aria-hidden="true">{displayName}</div>
                <div className="pnw-identity-copy">
                  <p className="pnw-kicker">{profileExperience.identityLabel}</p>
                  <h1>{displayName}<span>.</span></h1>
                  <p className="pnw-identity-summary">
                    {arch
                      ? `${arch.tagline}. ${arch.desc}`
                      : 'Set your learning profile so Cerbyl can adapt study support to you.'}
                  </p>
                  <div className="pnw-identity-actions">
                    <button type="button" className="pnw-primary-action" onClick={() => scrollToSection('pn-section-personal')}>
                      Edit identity <ArrowUpRight size={15} />
                    </button>
                    <button type="button" className="pnw-secondary-action" onClick={() => navigate('/profile-quiz')}>
                      {arch ? 'Retake assessment' : 'Find my learning style'}
                    </button>
                  </div>
                </div>

                <div className="pnw-portrait">
                  <div className="pnw-portrait-index" aria-hidden>{String(profileLevel).padStart(2, '0')}</div>
                  <div
                    className="pnw-portrait-orbit"
                    style={{ '--pnw-level-progress': `${levelProgress * 3.6}deg` }}
                    aria-hidden="true"
                  >
                    <span className="pnw-orbit-progress"><strong>{Math.round(levelProgress)}%</strong><small>next</small></span>
                    <span className="pnw-orbit-satellite" />
                  </div>
                  <button ref={pfpTriggerRef} type="button" className="pnw-photo-button" onClick={() => setPfpModalOpen(true)} aria-label="Change profile picture">
                    {displayProfilePhoto
                      ? <img src={displayProfilePhoto} alt={displayName} referrerPolicy="no-referrer" decoding="async" fetchPriority="high" />
                      : <span>{initial}</span>}
                    <i><Pencil size={14} /> Change photo</i>
                  </button>
                  <div className="pnw-portrait-caption">
                    <span>{profileData.primaryArchetype || 'Learning profile pending'}</span>
                    <strong>Level {profileLevel}</strong>
                  </div>
                </div>
              </section>

              <section className="pnw-status-band" aria-label="Profile status">
                <div data-value={String(profileLevel).padStart(2, '0')}><span>Level</span><strong>{String(profileLevel).padStart(2, '0')}</strong></div>
                <div data-value={profileXp.toLocaleString()}><span>Experience</span><strong>{profileXp.toLocaleString()} XP</strong></div>
                <div data-value={`${Math.round(levelProgress)}%`}><span>Next level</span><strong>{Math.round(levelProgress)}%</strong></div>
                {profileExperience.showPaymentInformation ? (
                  <div data-value={(currentPlan?.name || 'Starter').slice(0, 8)}><span>Current plan</span><strong>{currentPlan?.name || 'Starter'}</strong></div>
                ) : (
                  <div data-value={profileExperience.role || 'profile'}><span>Access</span><strong>{profileExperience.workspaceLabel}</strong></div>
                )}
              </section>

              <div className="pnw-work-grid">
                <section className="pnw-panel pnw-identity-form" id="pn-section-personal">
                  <div className="pnw-section-heading">
                    <div>
                      <span><Fingerprint size={15} /> Identity</span>
                      <h2>The details Cerbyl uses.</h2>
                    </div>
                    <small>Autosaves after changes</small>
                  </div>
                  <div className="pnw-form-grid">
                    <label>
                      <span>First name</span>
                      <input value={profileData.firstName} onChange={(e) => setField('firstName', e.target.value)} autoComplete="given-name" />
                    </label>
                    <label>
                      <span>Last name</span>
                      <input value={profileData.lastName} onChange={(e) => setField('lastName', e.target.value)} autoComplete="family-name" />
                    </label>
                    <label>
                      <span>Username</span>
                      <input value={profileData.username} onChange={(e) => setField('username', e.target.value)} autoCapitalize="none" autoCorrect="off" />
                    </label>
                    <label>
                      <span>Email address</span>
                      <input type="email" value={profileData.email} onChange={(e) => setField('email', e.target.value)} autoComplete="email" />
                    </label>
                  </div>
                </section>

                <section className="pnw-panel pnw-goal-form" id="pn-section-goals">
                  <div className="pnw-section-heading">
                    <div>
                      <span><Target size={15} /> Learning direction</span>
                      <h2>What are you working toward?</h2>
                    </div>
                  </div>
                  {profileData.quizSkipped && !profileData.quizCompleted && !profileData.fieldOfStudy && profileData.preferredSubjects.length === 0 && (
                    <button type="button" className="pnw-inline-prompt" onClick={() => navigate('/profile-quiz')}>
                      Complete your learning profile <ArrowUpRight size={14} />
                    </button>
                  )}
                  <label className="pnw-select-field">
                    <span>Main subject</span>
                    <select value={profileData.fieldOfStudy} onChange={(e) => setField('fieldOfStudy', e.target.value)}>
                      <option value="">Select your main subject</option>
                      {ALL_SUBJECTS.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                    </select>
                  </label>
                  <label className="pnw-select-field">
                    <span>Primary goal</span>
                    <select value={profileData.brainwaveGoal} onChange={(e) => setField('brainwaveGoal', e.target.value)}>
                      <option value="">Select your goal</option>
                      {Object.entries(BRAINWAVE_GOALS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                </section>
              </div>

              <section className="pnw-signature" id="pn-section-subjects">
                <div className="pnw-signature-copy">
                  <div className="pnw-section-heading">
                    <div>
                      <span><Sparkles size={15} /> Learning profile</span>
                      <h2>{profileData.primaryArchetype || 'Build your learning signature.'}</h2>
                    </div>
                  </div>
                  {arch ? (
                    <>
                      <p>{arch.desc}</p>
                      {profileData.secondaryArchetype && (
                        <div className="pnw-secondary-type">
                          <span>Secondary pattern</span>
                          <strong>{profileData.secondaryArchetype}</strong>
                          <small>{archSecondary?.tagline}</small>
                        </div>
                      )}
                      <button type="button" className="pnw-text-action" onClick={() => navigate('/profile-quiz')}>
                        Retake assessment <ArrowUpRight size={14} />
                      </button>
                    </>
                  ) : (
                    <button type="button" className="pnw-assessment-callout" onClick={() => navigate('/profile-quiz')}>
                      <Award size={22} />
                      <span><strong>Discover your learning archetype</strong><small>Complete the assessment to personalize tutoring.</small></span>
                      <ArrowUpRight size={16} />
                    </button>
                  )}
                  {profileData.preferredSubjects.length > 0 && (
                    <div className="pnw-interest-echo" aria-hidden="true">
                      {profileData.preferredSubjects.slice(0, 5).map((subject) => (
                        <span key={subject}>{subject}</span>
                      ))}
                    </div>
                  )}
                  {Object.keys(profileData.archetypeScores).length > 0 && (
                    <div className="pnw-score-list" aria-label="Learning archetype scores">
                      {Object.entries(profileData.archetypeScores)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 5)
                        .map(([name, score]) => (
                          <div key={name}>
                            <span>{name}</span>
                            <i style={{ width: `${Math.max(4, Number(score) || 0)}%` }} />
                            <strong>{Math.round(score)}%</strong>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                <div className="pnw-subject-desk">
                  <div className="pnw-subject-head">
                    <div><span>Study interests</span><strong>{profileData.preferredSubjects.length} selected</strong></div>
                    <small>Select every subject Cerbyl should prioritize.</small>
                  </div>
                  <div className="pnw-subjects">
                    {ALL_SUBJECTS.map((subject) => {
                      const selected = profileData.preferredSubjects.includes(subject);
                      return (
                        <button
                          key={subject}
                          type="button"
                          className={selected ? 'is-selected' : ''}
                          aria-pressed={selected}
                          onClick={() => toggleSubject(subject)}
                        >
                          <span>{subject}</span>{selected && <Check size={13} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              {profileExperience.showPaymentInformation && <section className="pnw-plan-section" id="pn-section-subscription">
                <div className="pnw-plan-heading">
                  <div className="pnw-section-heading">
                    <div>
                      <span><CreditCard size={15} /> SUBSCRIPTION</span>
                      <h2>Choose the capacity you need.</h2>
                    </div>
                  </div>
                  <div className="pnw-plan-controls">
                    <div>
                      <span>Current plan</span>
                      <strong>{currentPlan?.name || 'Starter'} at {formatUsd(currentPlanPrice)}{billingLabel}</strong>
                    </div>
                    <div className="pnw-billing-switch" role="group" aria-label="Billing cycle">
                      <button type="button" className={activeBillingCycle === 'monthly' ? 'is-active' : ''} onClick={() => handleBillingCycleChange('monthly')} disabled={subscriptionData.saving}>Monthly</button>
                      <button type="button" className={activeBillingCycle === 'yearly' ? 'is-active' : ''} onClick={() => handleBillingCycleChange('yearly')} disabled={subscriptionData.saving}>Yearly</button>
                    </div>
                  </div>
                </div>

                {currentPlanYearlySavingsPct > 0 && activeBillingCycle === 'monthly' && (
                  <p className="pnw-plan-note">Yearly billing saves {currentPlanYearlySavingsPct}% ({formatUsd(currentPlanYearlySavingsUsd)} per year).</p>
                )}
                {activeBillingCycle === 'yearly' && currentPlanYearlyEquivalentMonthly > 0 && (
                  <p className="pnw-plan-note">Yearly billing is approximately {formatUsd(currentPlanYearlyEquivalentMonthly)} per month.</p>
                )}

                {subscriptionData.loading ? (
                  <div className="pnw-plan-loading" role="status">Loading available plans</div>
                ) : (
                  <div className="pnw-plan-ledger">
                    {subscriptionData.plans.map((plan) => {
                      const meta = PLAN_META[plan.id] || PLAN_META.starter;
                      const Icon = meta.icon;
                      const isCurrent = currentPlanId === String(plan.id || '').toLowerCase();
                      const planPrice = getPlanPrice(plan, activeBillingCycle);
                      return (
                        <article key={plan.id} className={isCurrent ? 'is-current' : ''}>
                          <div className="pnw-plan-name"><Icon size={16} /><strong>{plan.name}</strong>{isCurrent && <span>Current</span>}</div>
                          <div className="pnw-plan-price"><PriceTicker amount={planPrice} /><small>{billingLabel}</small></div>
                          <div className="pnw-plan-credit"><strong>{formatTokens(plan.included_tokens_monthly)}</strong><span>monthly AI credits</span></div>
                          <div className="pnw-plan-summary">{plan.summary || (plan.features || []).slice(0, 1).join('')}</div>
                          <button type="button" onClick={() => handleSelectPlan(plan.id)} disabled={isCurrent || subscriptionData.saving}>
                            {isCurrent ? 'Selected' : subscriptionData.saveAction === 'plan' ? 'Switching' : 'Choose plan'}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                )}
                {subscriptionData.error && <div className="pnw-inline-error" role="alert">{subscriptionData.error}</div>}

                <div className="pnw-usage-rack">
                  <button type="button" onClick={() => navigate('/profile/usage')}>
                    <Gauge size={17} /><span><strong>Open usage details</strong><small>Limits, reset windows and account capacity</small></span><ArrowUpRight size={15} />
                  </button>
                  {rateLimits && ['ai_heavy', 'ai_light', 'file_upload'].map((tier) => {
                    const item = rateLimits.tiers?.[tier];
                    if (!item || item.limit === 'unlimited') return null;
                    const pct = Math.min(100, Math.round((item.used / item.limit) * 100));
                    return (
                      <div key={tier}>
                        <span>{USAGE_TIER_LABELS[tier]}</span>
                        <strong>{item.used} / {item.limit}</strong>
                        <small>{pct}% used, resets in {item.reset_at > 0 ? formatReset(item.reset_at) : 'soon'}</small>
                      </div>
                    );
                  })}
                </div>
              </section>}

              <section className="pnw-mastery" id="pn-section-mastery">
                <div className="pnw-section-heading">
                  <div>
                    <span><BarChart3 size={15} /> Mastery</span>
                    <h2>Your learning evidence.</h2>
                  </div>
                  <button type="button" className="pnw-text-action" onClick={() => navigate('/weaknesses')}>
                    Open Weak Areas <ArrowUpRight size={14} />
                  </button>
                </div>
                <WeaknessTracker
                  userId={userName}
                  token={token}
                  onNavigate={navigate}
                  emptyFallback={(
                    <div className="pnw-mastery-empty">
                      <Target size={18} />
                      <span>
                        <strong>No mastery signal yet</strong>
                        <small>Complete a quiz or practice session to start building your learning evidence.</small>
                      </span>
                    </div>
                  )}
                />
              </section>

              <div className="pnw-account-grid">
                <section className="pnw-panel" id="pn-section-settings">
                  <div className="pnw-section-heading">
                    <div>
                      <span><Settings size={15} /> Preferences</span>
                      <h2>How the app meets you.</h2>
                    </div>
                  </div>
                  <div className="pnw-setting-list">
                    <div>
                      <span className="pnw-setting-icon"><Eye size={16} /></span>
                      <span><strong>Study insights on login</strong><small>Show a learning summary when you begin the day.</small></span>
                      <button type="button" className={`pnw-switch ${profileData.showStudyInsights ? 'is-on' : ''}`} onClick={() => setField('showStudyInsights', !profileData.showStudyInsights)} role="switch" aria-checked={profileData.showStudyInsights} aria-label="Study insights on login"><i /></button>
                    </div>
                    <div>
                      <span className="pnw-setting-icon"><Bell size={16} /></span>
                      <span><strong>Notifications</strong><small>Allow updates and unread indicators across Cerbyl.</small></span>
                      <button type="button" className={`pnw-switch ${profileData.notificationsEnabled ? 'is-on' : ''}`} onClick={() => setField('notificationsEnabled', !profileData.notificationsEnabled)} role="switch" aria-checked={profileData.notificationsEnabled} aria-label="Notifications"><i /></button>
                    </div>
                  </div>

                  {Object.keys(quizAnswers).length > 0 && (
                    <div className="pnw-assessment-record">
                      <div><strong>Assessment record</strong><button type="button" onClick={() => navigate('/profile-quiz')}>Retake</button></div>
                      <dl>
                        {Object.entries(quizAnswers).map(([question, answer]) => (
                          <div key={question}><dt>{QUIZ_LABELS[question] || question}</dt><dd>{ANSWER_LABELS[answer] || answer}</dd></div>
                        ))}
                      </dl>
                    </div>
                  )}
                </section>

                <section className="pnw-panel pnw-danger" id="pn-section-account">
                  <div className="pnw-section-heading">
                    <div>
                      <span><Trash2 size={15} /> Account control</span>
                      <h2>Delete this account.</h2>
                    </div>
                  </div>
                  <p>
                    {isGoogleAccount
                      ? 'Cerbyl will email an OTP before deleting this Google-linked account.'
                      : 'Confirm your password, then verify the deletion OTP sent by email.'}
                  </p>
                  {deleteStep === 'password' ? (
                    <form onSubmit={requestAccountDeletion}>
                      {!isGoogleAccount && (
                        <label><span>Account password</span><input type="password" value={deleteForm.password} onChange={(e) => setDeleteForm((prev) => ({ ...prev, password: e.target.value }))} disabled={deleteLoading} autoComplete="current-password" /></label>
                      )}
                      <button type="submit" disabled={deleteLoading}>{deleteLoading ? 'Sending OTP' : 'Send deletion OTP'}</button>
                    </form>
                  ) : (
                    <form onSubmit={confirmAccountDeletion}>
                      <label><span>Deletion OTP</span><input type="text" value={deleteForm.otp} onChange={(e) => setDeleteForm((prev) => ({ ...prev, otp: e.target.value }))} inputMode="numeric" maxLength={6} disabled={deleteLoading} /></label>
                      <button type="submit" disabled={deleteLoading}>{deleteLoading ? 'Deleting account' : 'Delete permanently'}</button>
                    </form>
                  )}
                  {deleteStatus && <div className="pnw-delete-status" role="status">{deleteStatus}</div>}
                </section>
              </div>
            </div>
          </div>
      </SocialHubChrome>

      {pfpModalOpen && (
        <div className="pn-modal-overlay" onClick={() => setPfpModalOpen(false)}>
          <div ref={pfpModalRef} className="pn-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pn-avatar-title">
            <div className="pn-modal-head">
              <div><span className="pn-modal-kicker">Profile picture</span><h3 className="pn-modal-title" id="pn-avatar-title">Choose how you appear.</h3></div>
              <button ref={pfpCloseButtonRef} className="pn-modal-close" onClick={() => setPfpModalOpen(false)} aria-label="Close profile picture chooser"><X size={15} /></button>
            </div>
            <input ref={pfpUploadInputRef} className="pn-pfp-upload-input" type="file" accept=".jpg,.jpeg,image/jpeg" onChange={handlePfpUpload} />
            <div className="pn-pfp-grid">
              <button className={`pn-pfp-card ${!activeCustomPfp ? 'pn-pfp-card--active' : ''}`} onClick={selectDefault} type="button">
                <div className="pn-pfp-card-media">
                  {defaultUserPfp ? <img src={defaultUserPfp} alt="Default profile" className="pn-pfp-card-img" referrerPolicy="no-referrer" /> : <div className="pn-pfp-card-fallback">{initial}</div>}
                </div>
                <div className="pn-pfp-card-label">Default</div>
                {!activeCustomPfp && <span className="pn-pfp-card-check"><Check size={11} /></span>}
              </button>
              {PRESET_PFPS.map((preset) => (
                <button key={preset.id} className={`pn-pfp-card ${activeCustomPfp === preset.src ? 'pn-pfp-card--active' : ''}`} onClick={() => selectPreset(preset.src)} type="button">
                  <div className="pn-pfp-card-media"><img src={preset.src} alt={preset.label} className="pn-pfp-card-img" /></div>
                  <div className="pn-pfp-card-label">{preset.label}</div>
                  {activeCustomPfp === preset.src && <span className="pn-pfp-card-check"><Check size={11} /></span>}
                </button>
              ))}
              <button className={`pn-pfp-card pn-pfp-card--upload ${isUploadedPfp(activeCustomPfp) ? 'pn-pfp-card--active' : ''}`} onClick={() => pfpUploadInputRef.current?.click()} type="button">
                <div className="pn-pfp-card-media">
                  {isUploadedPfp(activeCustomPfp)
                    ? <img src={activeCustomPfp} alt="Uploaded profile" className="pn-pfp-card-img" />
                    : <div className="pn-pfp-upload-placeholder"><Plus size={24} /></div>}
                </div>
                <div className="pn-pfp-card-label">Upload JPG</div>
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
