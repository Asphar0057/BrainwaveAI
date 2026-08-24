import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Plus, ChevronLeft, ChevronRight, FileText, Mic, Library, Search, Pencil, X, Check, User, Bell, Sparkles, Trash2, LogOut } from 'lucide-react';
import { API_URL } from '../config/api';
import ThemeSwitcher from '../components/ThemeSwitcher';
import { useNotifications } from '../contexts/NotificationContext';
import { getRelativeTime } from '../utils/dateUtils';
import { signOutAppSession } from '../utils/authSession';
import './DashboardCerbyl.css';

const MODULES = [
  { num: '04', label: 'Search Hub',    sub: 'EXPLORE',      route: '/search-hub' },
  { num: '05', label: 'Knowledge Map', sub: 'KNOWLEDGE',    route: '/knowledge-map' },
  { num: '06', label: 'Questions',     sub: 'PRACTICE',     route: '/question-bank' },
  { num: '07', label: 'Slides',        sub: 'PRESENT',      route: '/slide-explorer' },
  { num: '08', label: 'Weak Areas',    sub: 'IMPROVE',      route: '/weaknesses' },
  { num: '09', label: 'Social Hub',    sub: 'COMMUNITY',    route: '/social' },
  { num: '10', label: 'Timeline',      sub: 'ACTIVITY LOG', route: '/activity-timeline' },
  { num: '11', label: 'Learning Path', sub: 'PROGRESSION',  route: '/learning-paths' },
  { num: '12', label: 'XP Roadmap',    sub: 'MILESTONES',   route: '/xp-roadmap' },
  { num: '13', label: 'Quiz Hub',      sub: 'CHALLENGE',    route: '/quiz-hub' },
  { num: '14', label: 'Concept Web',   sub: 'NETWORK',      route: '/concept-web' },
  { num: '15', label: 'Playlists',     sub: 'COLLECTIONS',  route: '/playlists' }
];

const ALL_FEATURES = [
  { label: 'Dashboard', route: '/dashboard-cerbyl', keywords: 'home overview' },
  { label: 'Search Hub', route: '/search-hub', keywords: 'atlas explore command center' },
  { label: 'AI Chat', route: '/ai-chat', keywords: 'tutor chat assistant' },
  { label: 'Context Hub', route: '/contexthub', keywords: 'documents vault textbooks curriculum' },
  { label: 'Notes', route: '/notes', keywords: 'notebook write' },
  { label: 'Media Notes', route: '/notes/ai-media', keywords: 'audio video transcript' },
  { label: 'Flashcards', route: '/flashcards', keywords: 'cards study deck' },
  { label: 'Quiz Hub', route: '/quiz-hub', keywords: 'quizzes challenge' },
  { label: 'Solo Quiz', route: '/solo-quiz', keywords: 'practice quiz' },
  { label: 'Quiz Battle', route: '/quiz-battles', keywords: '1v1 battle challenge friend' },
  { label: 'Question Bank', route: '/question-bank', keywords: 'questions practice' },
  { label: 'Slide Explorer', route: '/slide-explorer', keywords: 'slides presentation' },
  { label: 'Weak Areas', route: '/weaknesses', keywords: 'weaknesses improve' },
  { label: 'Weakness Practice', route: '/weakness-practice', keywords: 'practice improve' },
  { label: 'Challenges', route: '/challenges', keywords: 'daily challenge' },
  { label: 'Analytics', route: '/analytics', keywords: 'stats insights' },
  { label: 'Study Insights', route: '/study-insights', keywords: 'analytics insights' },
  { label: 'XP Roadmap', route: '/xp-roadmap', keywords: 'milestones level' },
  { label: 'Knowledge Map', route: '/knowledge-map', keywords: 'concepts network' },
  { label: 'Activity Timeline', route: '/activity-timeline', keywords: 'history log activity' },
  { label: 'Learning Paths', route: '/learning-paths', keywords: 'curriculum progression' },
  { label: 'Playlists', route: '/playlists', keywords: 'collections' },
  { label: 'Concept Web', route: '/concept-web', keywords: 'learning path network' },
  { label: 'Review Hub', route: '/learning-review-hub', keywords: 'review spaced repetition' },
  { label: 'Social Hub', route: '/social', keywords: 'friends community' },
  { label: 'Friends', route: '/friends-dashboard', keywords: 'social friends' },
  { label: 'Leaderboards', route: '/leaderboards', keywords: 'rank ranking competition' },
  { label: 'Games', route: '/games', keywords: 'gamification points bingo' },
  { label: 'Shared Content', route: '/shared-content', keywords: 'shared sharing' },
  { label: 'Profile', route: '/profile', keywords: 'account settings archetype' },
  { label: 'Customize Dashboard', route: '/customize-dashboard', keywords: 'settings personalize' },
];

const SIDE_LINKS = [
  { label: 'Search Hub',        route: '/search-hub' },
  { label: 'Knowledge Map',     route: '/knowledge-map' },
  { label: 'Questions',         route: '/question-bank' },
  { label: 'Slides',            route: '/slide-explorer' },
  { label: 'Weak Areas',        route: '/weaknesses' },
  { label: 'Social Hub',        route: '/social' },
  { label: 'Activity Timeline', route: '/activity-timeline' },
  { label: 'Learning Path',     route: '/learning-paths' },
  { label: 'XP Roadmap',        route: '/xp-roadmap' },
  { label: 'Analytics',         route: '/analytics' }
];

const greetingForHour = (h) => {
  if (h < 5) return 'Good Night';
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  if (h < 21) return 'Good Evening';
  return 'Good Night';
};

const formatDateLong = (d) => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

const routeForNotification = (notificationType) => {
  switch (notificationType) {
    case 'reminder':
    case 'calendar_event':
    case 'inactivity':
      return '/activity-timeline';
    case 'level_up':
    case 'streak_milestone':
    case 'streak_broken':
    case 'achievement':
      return '/profile';
    case 'token_usage_warning':
    case 'token_usage_critical':
    case 'token_usage_exhausted':
      return '/profile?upgrade=1';
    case 'quiz_result':
    case 'quiz_excellent':
    case 'quiz_poor_performance':
    case 'quiz_completed':
    case 'quiz_milestone':
      return '/quiz-hub';
    case 'flashcard_excellent':
    case 'flashcard_review':
    case 'flashcard_reviewed':
    case 'flashcard_mastered':
    case 'flashcards_milestone':
      return '/flashcards';
    case 'proactive_ai':
    case 'ai_chat_milestone':
      return '/ai-chat';
    case 'notes_milestone':
      return '/notes';
    case 'questions_milestone':
      return '/question-bank';
    case 'study_time_milestone':
      return '/analytics';
    case 'friend_request':
      return '/friends?view=requests';
    case 'friend_accepted':
    case 'friend_rejected':
    case 'friend_removed':
      return '/friends';
    case 'share_received':
    case 'content_shared':
      return '/social';
    case 'battle_challenge':
    case 'battle_result':
    case 'battle_accepted':
    case 'battle_declined':
    case 'battle_started':
    case 'battle_won':
    case 'battle_lost':
      return '/quiz-battles';
    case 'challenge_completed':
    case 'challenge_joined':
      return '/challenges';
    case 'study_insights':
    case 'welcome_insights':
      return '/study-insights';
    default:
      return '/dashboard-cerbyl';
  }
};

const fetchJson = async (url) => {
  const token = localStorage.getItem('token');
  const r = await fetch(url, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

const DAY_LABELS = ['S','M','T','W','T','F','S'];
const QUICK_ASK_PROMPT = 'Explain quantum mechanics in simple terms.';
const QUICK_REPLY_PREVIEW = 'Sure. Let us break it into three simple ideas.';
const PRESET_PFPS = [
  { id: 'cat', label: 'Cat', src: '/pfp/cat.png' },
  { id: 'woman', label: 'Woman', src: '/pfp/woman.png' }
];
const isPresetPfp = (src) => PRESET_PFPS.some((p) => p.src === src);
const isUploadedPfp = (src) => typeof src === 'string' && src.startsWith('data:image/jpeg;');
const isAllowedCustomPfp = (src) => isPresetPfp(src) || isUploadedPfp(src);
const PFP_DEFAULT_KEY = 'cerbyl.defaultPfp';
const PFP_CUSTOM_KEY = 'cerbyl.customPfp';
const DISPLAY_NAME_KEY = 'cerbyl.displayName';
const MAX_CUSTOM_PFP_BYTES = 2 * 1024 * 1024;
const PLAN_INCLUDED_TOKENS = {
  starter: 100000,
  pro: 2000000,
  power: 5000000,
  unlimited: 0
};
const PLAN_NAMES = {
  starter: 'Starter',
  pro: 'Pro',
  power: 'Power',
  unlimited: 'Unlimited'
};

const formatTokenCount = (value) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return n.toLocaleString();
};

const formatUsedTokenCount = (value) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)).toLocaleString() : '0';
};

const parseResetDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getNextDailyUsageResetDate = (from = new Date()) => (
  new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate() + 1,
    0,
    0,
    0,
    0
  ))
);

const getDailyUsageResetDate = (value, from = new Date()) => {
  const parsed = parseResetDate(value);
  if (parsed && parsed.getTime() > from.getTime()) return parsed;
  return getNextDailyUsageResetDate(from);
};

const formatResetClock = (value) => {
  const date = parseResetDate(value);
  if (!date) return 'Not available';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const formatResetDateTime = (value) => {
  const date = parseResetDate(value);
  if (!date) return 'Not available';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const formatResetCountdown = (secondsValue) => {
  const seconds = Number(secondsValue);
  if (!Number.isFinite(seconds) || seconds < 0) return 'Not available';
  if (seconds < 60) return 'less than 1m';
  const totalMinutes = Math.floor(seconds / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (!days || minutes) parts.push(`${minutes}m`);
  return parts.join(' ');
};

const hydrateProfile = (parsedProfile = {}, username = '') => {
  const parsed = parsedProfile || {};
  const storedDefault = localStorage.getItem(PFP_DEFAULT_KEY) || '';
  const storedCustom = localStorage.getItem(PFP_CUSTOM_KEY) || '';
  const storedDisplayName = localStorage.getItem(DISPLAY_NAME_KEY) || '';
  const hasExplicitCustom = Object.prototype.hasOwnProperty.call(parsed, 'customPfp');
  const hasExplicitDefault = Object.prototype.hasOwnProperty.call(parsed, 'defaultPfp');

  const pictureCandidate =
    parsed.picture_url ||
    parsed.picture ||
    parsed.photoURL ||
    parsed.photo_url ||
    '';

  const parsedCustom = parsed.customPfp && isAllowedCustomPfp(parsed.customPfp) ? parsed.customPfp : '';
  const customPfp = hasExplicitCustom
    ? parsedCustom
    : (
      parsedCustom ||
      (isAllowedCustomPfp(storedCustom) ? storedCustom : '') ||
      (isAllowedCustomPfp(pictureCandidate) ? pictureCandidate : '')
    );

  const defaultPfp = hasExplicitDefault
    ? (parsed.defaultPfp || '')
    : (
      parsed.defaultPfp ||
      parsed.googlePicture ||
      storedDefault ||
      (isPresetPfp(pictureCandidate) ? '' : pictureCandidate) ||
      ''
    );

  const activePfp = customPfp || defaultPfp;
  const resolvedName =
    parsed.firstName ||
    parsed.first_name ||
    storedDisplayName ||
    (username ? username.split('@')[0] : '');

  return {
    ...parsed,
    firstName: parsed.firstName || resolvedName,
    first_name: parsed.first_name || resolvedName,
    defaultPfp,
    customPfp,
    picture: activePfp,
    picture_url: activePfp
  };
};

const DashboardCerbyl = () => {
  const navigate = useNavigate();
  const pfpUploadInputRef = useRef(null);
  const tokenUsageExactModeRef = useRef(false);

  const [userName, setUserName] = useState(() => localStorage.getItem('username') || '');
  const [profile, setProfile] = useState(() => {
    const username = localStorage.getItem('username') || '';
    const prof = localStorage.getItem('userProfile');
    if (!prof) return hydrateProfile({}, username);
    try {
      return hydrateProfile(JSON.parse(prof), username);
    } catch (e) {
      return hydrateProfile({}, username);
    }
  });
  const [stats, setStats] = useState({
    streak: 0,
    level: 1,
    xp: 0,
    nextXp: 1000,
    chats: 0,
    notes: 0,
    cards: 0,
    quizzes: 0,
    questions: 0,
    rank: null,
    weeklyPoints: 0
  });
  const [heatmap, setHeatmap] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [weeklyDisplay, setWeeklyDisplay] = useState([]);
  const [now, setNow] = useState(new Date());
  const [recentNotes, setRecentNotes] = useState([]);
  const [recentMedia, setRecentMedia] = useState([]);
  const [recentSets, setRecentSets] = useState([]);
  const [dashboardError, setDashboardError] = useState(false);
  const [subscriptionUsage, setSubscriptionUsage] = useState({
    loading: true,
    currentPlanId: 'starter',
    currentPlanName: 'Starter',
    includedTokens: 100000,
    usedTokens: 0,
    utilizationPct: 0,
    groqResetAt: null,
    isAdmin: false,
    hasUnlimitedAccess: false,
    error: null
  });
  const [isPfpModalOpen, setIsPfpModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(max-width: 1100px)');
    const syncSidebarToViewport = () => setIsSidebarOpen(!media.matches);
    syncSidebarToViewport();
    media.addEventListener?.('change', syncSidebarToViewport);
    return () => media.removeEventListener?.('change', syncSidebarToViewport);
  }, []);
  const [featureQuery, setFeatureQuery] = useState('');
  const [showFeatureResults, setShowFeatureResults] = useState(false);
  const [activeFeatureIndex, setActiveFeatureIndex] = useState(-1);
  const featureSearchRef = useRef(null);

  const featureResults = useMemo(() => {
    const q = featureQuery.trim().toLowerCase();
    if (!q) return [];
    return ALL_FEATURES
      .filter((f) => f.label.toLowerCase().includes(q) || f.keywords?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [featureQuery]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (featureSearchRef.current && !featureSearchRef.current.contains(e.target)) {
        setShowFeatureResults(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const goToFeature = (feature) => {
    if (!feature) return;
    navigate(feature.route);
    setFeatureQuery('');
    setShowFeatureResults(false);
    setActiveFeatureIndex(-1);
  };

  const onFeatureSearchKeyDown = (e) => {
    if (!showFeatureResults || featureResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveFeatureIndex((i) => (i + 1) % featureResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveFeatureIndex((i) => (i <= 0 ? featureResults.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      goToFeature(featureResults[activeFeatureIndex] || featureResults[0]);
    } else if (e.key === 'Escape') {
      setShowFeatureResults(false);
    }
  };

  const applySubscriptionOverview = useCallback((sub = {}, options = {}) => {
    const rawPlanId = sub.currentPlanId || sub.current_plan_id || sub.plan || 'starter';
    const normalizedPlanId = String(rawPlanId || 'starter').trim().toLowerCase();
    const plan = sub.currentPlan || (sub.plans || []).find((p) => String(p.id || '').trim().toLowerCase() === normalizedPlanId) || {};
    const planId = normalizedPlanId || String(plan.id || 'starter').trim().toLowerCase();
    const planIncludedTokens = Number(plan.included_tokens_monthly);
    const fallbackIncludedTokens = Object.prototype.hasOwnProperty.call(PLAN_INCLUDED_TOKENS, planId)
      ? PLAN_INCLUDED_TOKENS[planId]
      : PLAN_INCLUDED_TOKENS.starter;
    const includedTokens = Number.isFinite(planIncludedTokens) && planIncludedTokens > 0
      ? planIncludedTokens
      : Number(fallbackIncludedTokens);
    const overviewUsedTokens = Number(sub.usage?.total_tokens || 0);

    setSubscriptionUsage(prev => {
      const keepExactDisplayedValue = options.silent && tokenUsageExactModeRef.current;
      const usedTokens = keepExactDisplayedValue
        ? Number(prev.usedTokens || 0)
        : overviewUsedTokens;

      return {
        loading: false,
        currentPlanId: planId,
        currentPlanName: plan.name || PLAN_NAMES[planId] || 'Starter',
        includedTokens,
        usedTokens,
        utilizationPct: includedTokens > 0 ? Math.round((usedTokens / includedTokens) * 1000) / 10 : 0,
        groqResetAt: prev.groqResetAt,
        isAdmin: Boolean(sub.isAdmin),
        hasUnlimitedAccess: Boolean(sub.hasUnlimitedAccess || plan.unlimited || planId === 'unlimited'),
        error: null
      };
    });
  }, []);

  const refreshSubscriptionUsage = useCallback(async ({ silent = true } = {}) => {
    if (!userName) return;
    if (!silent) {
      setSubscriptionUsage(prev => ({ ...prev, loading: true, error: null }));
    }
    try {
      const encodedUser = encodeURIComponent(userName);
      const sub = await fetchJson(`${API_URL}/subscription/overview?user_id=${encodedUser}&include_usage=true`);
      applySubscriptionOverview(sub || {}, { silent });
    } catch (e) {
      setSubscriptionUsage(prev => ({ ...prev, loading: false, error: 'usage-unavailable' }));
    }
  }, [applySubscriptionOverview, userName]);

  const [showNotifications, setShowNotifications] = useState(false);
  const [chatPromptDisplay, setChatPromptDisplay] = useState(QUICK_ASK_PROMPT);
  const [chatReplyDisplay, setChatReplyDisplay] = useState('');
  const [isChatTypingAnim, setIsChatTypingAnim] = useState(false);
  const [isChatReplyTypingAnim, setIsChatReplyTypingAnim] = useState(false);
  const [flashCountsDisplay, setFlashCountsDisplay] = useState({});
  const [isFlashAnimating, setIsFlashAnimating] = useState(false);
  const notifPanelRef = useRef(null);
  const notifButtonRef = useRef(null);
  const {
    notifications,
    unreadCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
  } = useNotifications();
  const [flashActiveSetId, setFlashActiveSetId] = useState('');
  const [isNotesAnimating, setIsNotesAnimating] = useState(false);
  const [notesTitleProgress, setNotesTitleProgress] = useState({});
  const [notesActiveKey, setNotesActiveKey] = useState('');
  const [progressDisplay, setProgressDisplay] = useState({ chats: 0, notes: 0, cards: 0, quizzes: 0 });
  const [rankDisplay, setRankDisplay] = useState(1);
  const [rankPointsDisplay, setRankPointsDisplay] = useState([250, 500, 200]);
  const [isRankAnimating, setIsRankAnimating] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [isNameTyping, setIsNameTyping] = useState(true);
  const chatTypeTimerRef = useRef(null);
  const chatReplyTimerRef = useRef(null);
  const chatReplyDelayRef = useRef(null);
  const flashAnimFrameRef = useRef(null);
  const flashResetTimerRef = useRef(null);
  const notesAnimTimerRef = useRef(null);
  const notesTypeTimerRef = useRef(null);
  const progressAnimFrameRef = useRef(null);
  const weeklyAnimTimerRef = useRef(null);
  const rankAnimFrameRef = useRef(null);
  const moduleMarqueeRef = useRef(null);
  const moduleTrackRef = useRef(null);
  const moduleAnimFrameRef = useRef(null);
  const moduleLastFrameRef = useRef(0);
  const moduleOffsetRef = useRef(0);
  const moduleSegmentWidthRef = useRef(0);
  const moduleHoverPausedRef = useRef(false);
  const moduleCooldownRef = useRef(false);
  const moduleResumeTimerRef = useRef(null);
  const moduleDragRef = useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startOffset: 0
  });
  const moduleDragMovedRef = useRef(false);
  const [isModuleDragging, setIsModuleDragging] = useState(false);

  // exact copy of Home.js's handleTileMove/handleTileLeave, driving the same
  // --mx/--my/--rx/--ry tilt + spotlight custom properties on the bento cards
  const handleTileMove = useCallback((e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = x / rect.width - 0.5;
    const cy = y / rect.height - 0.5;
    card.style.setProperty('--mx', `${x}px`);
    card.style.setProperty('--my', `${y}px`);
    card.style.setProperty('--rx', `${(-cy * 7).toFixed(2)}deg`);
    card.style.setProperty('--ry', `${(cx * 9).toFixed(2)}deg`);
  }, []);

  const handleTileLeave = useCallback((e) => {
    const card = e.currentTarget;
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  }, []);

  const normalizeModuleOffset = (offset) => {
    const segmentWidth = moduleSegmentWidthRef.current;
    if (!segmentWidth) return offset;

    while (offset < segmentWidth * 0.5) offset += segmentWidth;
    while (offset >= segmentWidth * 2.5) offset -= segmentWidth;
    return offset;
  };

  const renderModuleOffset = () => {
    const track = moduleTrackRef.current;
    if (!track) return;
    track.style.transform = `translate3d(${-moduleOffsetRef.current}px, 0, 0)`;
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    const prof = localStorage.getItem('userProfile');
    if (!token) { navigate('/login'); return; }
    if (username) setUserName(username);
    if (prof) {
      try {
        setProfile(hydrateProfile(JSON.parse(prof), username || ''));
      } catch (e) { /* silenced */ }
    } else {
      setProfile(hydrateProfile({}, username || ''));
    }
  }, [navigate]);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const marquee = moduleMarqueeRef.current;
    const track = moduleTrackRef.current;
    if (!marquee || !track) return undefined;

    const measureTrack = () => {
      const gap = Number.parseFloat(window.getComputedStyle(track).columnGap) || 0;
      const nextWidth = (track.scrollWidth + gap) / 3;
      if (!nextWidth) return;

      const previousWidth = moduleSegmentWidthRef.current;
      if (!previousWidth) {
        moduleOffsetRef.current = nextWidth;
      } else if (Math.abs(nextWidth - previousWidth) > 0.5) {
        const phase = (
          (moduleOffsetRef.current - previousWidth) % previousWidth + previousWidth
        ) % previousWidth;
        moduleOffsetRef.current = nextWidth + (phase / previousWidth) * nextWidth;
      }

      moduleSegmentWidthRef.current = nextWidth;
      renderModuleOffset();
    };

    measureTrack();
    const resizeObserver = new ResizeObserver(measureTrack);
    resizeObserver.observe(marquee);
    resizeObserver.observe(track);

    const animateModules = (now) => {
      const previous = moduleLastFrameRef.current || now;
      const elapsed = Math.min(now - previous, 40);
      moduleLastFrameRef.current = now;

      if (
        moduleSegmentWidthRef.current > 0 &&
        !moduleHoverPausedRef.current &&
        !moduleDragRef.current.active &&
        !moduleCooldownRef.current
      ) {
        moduleOffsetRef.current = normalizeModuleOffset(
          moduleOffsetRef.current + elapsed * 0.035
        );
        renderModuleOffset();
      }

      moduleAnimFrameRef.current = requestAnimationFrame(animateModules);
    };

    moduleAnimFrameRef.current = requestAnimationFrame(animateModules);

    return () => {
      if (moduleAnimFrameRef.current) {
        cancelAnimationFrame(moduleAnimFrameRef.current);
      }
      if (moduleResumeTimerRef.current) {
        clearTimeout(moduleResumeTimerRef.current);
      }
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!userName) return;
    let cancelled = false;

    (async () => {
      const encodedUser = encodeURIComponent(userName);
      const [
        dashboardResult,
        heatmapResult,
        analyticsResult,
        mediaResult,
        subscriptionResult,
      ] = await Promise.allSettled([
        fetchJson(`${API_URL}/get_dashboard_data?user_id=${encodedUser}&include_recent_summaries=true`),
        fetchJson(`${API_URL}/get_activity_heatmap?user_id=${encodedUser}`),
        fetchJson(`${API_URL}/get_analytics_history?user_id=${encodedUser}&period=week`),
        fetchJson(`${API_URL}/media/history?user_id=${encodedUser}&limit=2`),
        fetchJson(`${API_URL}/subscription/overview?user_id=${encodedUser}&include_usage=true`),
      ]);

      if (cancelled) return;

      if (dashboardResult.status === 'fulfilled') {
        const d = dashboardResult.value || {};
        const gf = d.gamification || {};
        setStats(prev => ({
          ...prev,
          streak: gf.current_streak ?? prev.streak,
          level: gf.level ?? prev.level,
          xp: gf.experience ?? gf.current_xp ?? prev.xp,
          nextXp: gf.next_level_xp ?? prev.nextXp,
          chats: gf.total_chat_sessions ?? prev.chats,
          notes: gf.total_notes_created ?? prev.notes,
          cards: gf.total_flashcards_created ?? prev.cards,
          quizzes: gf.total_quizzes_completed ?? gf.total_quizzes ?? prev.quizzes,
          questions: gf.total_ai_chats ?? gf.total_questions_answered ?? prev.questions,
          rank: gf.rank ?? gf.global_rank ?? prev.rank,
          weeklyPoints: gf.weekly_points ?? prev.weeklyPoints
        }));
        setRecentNotes(Array.isArray(d.recent_notes) ? d.recent_notes.slice(0, 3) : []);
        setRecentSets(Array.isArray(d.recent_flashcard_sets) ? d.recent_flashcard_sets.slice(0, 3) : []);
        setDashboardError(false);
      } else {
        setDashboardError(true);
      }

      if (heatmapResult.status === 'fulfilled') {
        setHeatmap(heatmapResult.value?.heatmap_data || []);
      }

      if (analyticsResult.status === 'fulfilled') {
        const arr = (analyticsResult.value?.history || []).map(x => ({
          total: (x.ai_chats || 0) + (x.flashcards || 0) + (x.notes || 0) + (x.quizzes || 0),
          date: x.date
        }));
        setWeekly(arr.length === 7 ? arr : [...Array(7)].map((_, i) => arr[i] || { total: 0, date: '' }));
      } else {
        setWeekly([...Array(7)].map(() => ({ total: 0, date: '' })));
      }

      if (mediaResult.status === 'fulfilled') {
        setRecentMedia((mediaResult.value?.history || []).slice(0, 2));
      }

      if (subscriptionResult.status === 'fulfilled') {
        applySubscriptionOverview(subscriptionResult.value || {});
      } else {
        setSubscriptionUsage(prev => ({ ...prev, loading: false, error: 'usage-unavailable' }));
      }
    })();

    return () => { cancelled = true; };
  }, [applySubscriptionOverview, userName]);

  useEffect(() => {
    if (!userName) return undefined;

    const refresh = () => {
      refreshSubscriptionUsage({ silent: true });
    };
    const onTokenUsageUpdated = (event) => {
      const detail = event?.detail || {};
      const usedTokens = Number(detail.usedTokens);
      const tokenDelta = Number(detail.tokenDelta);
      if (!Number.isFinite(usedTokens) && !Number.isFinite(tokenDelta)) return;

      setSubscriptionUsage(prev => {
        const headerLimit = Number(detail.includedTokens);
        const includedTokens = Number.isFinite(headerLimit) && headerLimit > 0
          ? headerLimit
          : prev.includedTokens;
        const currentPlanId = detail.currentPlanId || prev.currentPlanId;
        const nextUsedTokens = Number.isFinite(tokenDelta) && tokenDelta > 0
          ? Number(prev.usedTokens || 0) + tokenDelta
          : usedTokens;
        if (Number.isFinite(tokenDelta) && tokenDelta > 0) {
          tokenUsageExactModeRef.current = true;
        }

        return {
          ...prev,
          loading: false,
          currentPlanId,
          currentPlanName: PLAN_NAMES[currentPlanId] || prev.currentPlanName,
          includedTokens,
          usedTokens: nextUsedTokens,
          utilizationPct: includedTokens > 0
            ? Math.round((nextUsedTokens / includedTokens) * 1000) / 10
            : 0,
          error: null
        };
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };

    const intervalId = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener('brainwave:token-usage-updated', onTokenUsageUpdated);
    window.addEventListener('brainwave:token-usage-refresh', refresh);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('brainwave:token-usage-updated', onTokenUsageUpdated);
      window.removeEventListener('brainwave:token-usage-refresh', refresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshSubscriptionUsage, userName]);

  useEffect(() => {
    if (!userName) return undefined;

    let cancelled = false;
    const loadGroqReset = async () => {
      try {
        const reset = await fetchJson(`${API_URL}/rate-limits/groq-daily-reset`);
        if (cancelled) return;
        setSubscriptionUsage(prev => ({
          ...prev,
          groqResetAt: reset?.reset_at || prev.groqResetAt
        }));
      } catch (e) {
        if (!cancelled) {
          setSubscriptionUsage(prev => ({
            ...prev,
            groqResetAt: prev.groqResetAt || getNextDailyUsageResetDate().toISOString()
          }));
        }
      }
    };

    loadGroqReset();
    const intervalId = window.setInterval(loadGroqReset, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [userName]);

  const greet = greetingForHour(now.getHours()).toUpperCase();
  const displayName =
    profile?.firstName ||
    profile?.first_name ||
    localStorage.getItem(DISPLAY_NAME_KEY) ||
    (userName ? userName.split('@')[0] : 'there');
  const initial = (displayName[0] || 'A').toUpperCase();
  const profilePhoto = profile?.picture || profile?.picture_url || profile?.photoURL || profile?.photo_url || '';
  const defaultUserPfp = profile?.defaultPfp || '';
  const activeCustomPfp = profile?.customPfp || '';
  const hasUnlimitedAccess = subscriptionUsage.hasUnlimitedAccess;
  const isAdminUnlimited = subscriptionUsage.isAdmin && subscriptionUsage.hasUnlimitedAccess;
  const usagePct = Math.max(0, Math.min(100, Number(subscriptionUsage.utilizationPct || 0)));
  const resetDate = getDailyUsageResetDate(subscriptionUsage.groqResetAt, now);
  const resetTimeText = formatResetClock(resetDate);
  const resetDateTimeText = formatResetDateTime(resetDate);
  const resetCountdownSeconds = Math.max(0, Math.floor((resetDate.getTime() - now.getTime()) / 1000));
  const resetCountdownText = formatResetCountdown(resetCountdownSeconds);

  useEffect(() => {
    const fullName = String(displayName || '').trim();
    if (!fullName) {
      setTypedName('');
      setIsNameTyping(false);
      return undefined;
    }

    setTypedName('');
    setIsNameTyping(true);
    let idx = 0;
    const timer = setInterval(() => {
      idx += 1;
      setTypedName(fullName.slice(0, idx));
      if (idx >= fullName.length) {
        clearInterval(timer);
        setIsNameTyping(false);
      }
    }, 130);

    return () => clearInterval(timer);
  }, [displayName]);

  useEffect(() => {
    if (!profile) return;
    if (profile.defaultPfp) localStorage.setItem(PFP_DEFAULT_KEY, profile.defaultPfp);
    if (profile.customPfp) localStorage.setItem(PFP_CUSTOM_KEY, profile.customPfp);
    const resolvedName = profile.firstName || profile.first_name || (userName ? userName.split('@')[0] : '');
    if (resolvedName) localStorage.setItem(DISPLAY_NAME_KEY, resolvedName);
  }, [profile, userName]);

  const heatmapWeeks = useMemo(() => {
    if (!heatmap.length) return [];
    const map = new Map();
    heatmap.forEach(d => map.set(d.date, d));
    const last = new Date(heatmap[heatmap.length - 1].date);
    const start = new Date(last);
    start.setDate(last.getDate() - 7 * 52);
    while (start.getDay() !== 0) start.setDate(start.getDate() - 1);
    const weeks = [];
    const cur = new Date(start);
    while (cur <= last) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        const key = cur.toISOString().split('T')[0];
        week.push(map.get(key) || { date: key, count: 0, level: 0 });
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
    }
    return weeks;
  }, [heatmap]);

  const weeklyChart = useMemo(() => {
    const w = 320, h = 90, padX = 16, padTop = 14, padBot = 22;
    const innerW = w - padX * 2;
    const innerH = h - padTop - padBot;
    const fullTotals = weeklyDisplay
      .map(d => d.total)
      .filter(v => typeof v === 'number');
    const max = Math.max(1, ...fullTotals);
    const step = innerW / Math.max(1, weeklyDisplay.length - 1);
    const points = weeklyDisplay.reduce((acc, d, i) => {
      if (typeof d.total !== 'number') return acc;
      const x = padX + i * step;
      const y = padTop + innerH - (d.total / max) * innerH;
      acc.push({ x, y, total: d.total, date: d.date, index: i });
      return acc;
    }, []);
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const area = points.length > 1
      ? `${path} L ${points[points.length - 1].x.toFixed(1)} ${padTop + innerH} L ${points[0].x.toFixed(1)} ${padTop + innerH} Z`
      : '';
    return { w, h, padX, padTop, padBot, innerH, points, path, area };
  }, [weeklyDisplay]);

  const xpPct = Math.min(100, stats.nextXp ? (stats.xp / stats.nextXp) * 100 : 0);
  const sessionsTotal = (stats.chats || 0) + (stats.quizzes || 0);
  const pct = (n, d) => d > 0 ? Math.min(100, Math.round((n / d) * 100)) : 0;
  const ringTargets = { chats: 50, notes: 50, cards: 100, quizzes: 50 };
  const progressRings = [
    { key: 'chats', k: 'CHATS', v: progressDisplay.chats, t: ringTargets.chats },
    { key: 'notes', k: 'NOTES', v: progressDisplay.notes, t: ringTargets.notes },
    { key: 'cards', k: 'CARDS', v: progressDisplay.cards, t: ringTargets.cards },
    { key: 'quizzes', k: 'QUIZZES', v: progressDisplay.quizzes, t: ringTargets.quizzes }
  ];

  useEffect(() => {
    setProgressDisplay({
      chats: stats.chats || 0,
      notes: stats.notes || 0,
      cards: stats.cards || 0,
      quizzes: stats.quizzes || 0
    });
  }, [stats.chats, stats.notes, stats.cards, stats.quizzes]);

  useEffect(() => {
    setRankDisplay(stats.rank || 1);
    setRankPointsDisplay([250, 500, 200]);
  }, [stats.rank]);

  useEffect(() => {
    const counts = {};
    recentSets.forEach((s) => { counts[s.set_id] = s.count || 0; });
    setFlashCountsDisplay(counts);
  }, [recentSets]);

  useEffect(() => {
    const progress = {};
    recentNotes.slice(0, 2).forEach((n) => {
      const key = `n-${n.id}`;
      const title = n.title || 'Untitled note';
      progress[key] = title.length;
    });
    recentMedia.slice(0, 2).forEach((m) => {
      const key = `m-${m.id}`;
      const title = m.title || 'Media note';
      progress[key] = title.length;
    });
    setNotesTitleProgress(progress);
  }, [recentNotes, recentMedia]);

  useEffect(() => {
    setWeeklyDisplay(weekly);
  }, [weekly]);

  useEffect(() => () => {
    if (chatTypeTimerRef.current) {
      clearInterval(chatTypeTimerRef.current);
    }
    if (chatReplyTimerRef.current) {
      clearInterval(chatReplyTimerRef.current);
    }
    if (chatReplyDelayRef.current) {
      clearTimeout(chatReplyDelayRef.current);
    }
    if (flashAnimFrameRef.current) {
      cancelAnimationFrame(flashAnimFrameRef.current);
    }
    if (flashResetTimerRef.current) {
      clearTimeout(flashResetTimerRef.current);
    }
    if (notesAnimTimerRef.current) {
      clearTimeout(notesAnimTimerRef.current);
    }
    if (notesTypeTimerRef.current) {
      clearInterval(notesTypeTimerRef.current);
    }
    if (progressAnimFrameRef.current) {
      cancelAnimationFrame(progressAnimFrameRef.current);
    }
    if (weeklyAnimTimerRef.current) {
      clearInterval(weeklyAnimTimerRef.current);
    }
    if (rankAnimFrameRef.current) {
      cancelAnimationFrame(rankAnimFrameRef.current);
    }
  }, []);

  const pauseModuleMarquee = () => {
    moduleHoverPausedRef.current = true;
  };

  const resumeModuleMarquee = () => {
    moduleHoverPausedRef.current = false;
    moduleLastFrameRef.current = performance.now();
  };

  const handleModulePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const marquee = moduleMarqueeRef.current;
    if (!marquee) return;

    if (moduleResumeTimerRef.current) {
      clearTimeout(moduleResumeTimerRef.current);
      moduleResumeTimerRef.current = null;
    }

    moduleCooldownRef.current = false;
    moduleDragMovedRef.current = false;
    moduleDragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startOffset: moduleOffsetRef.current
    };
  };

  const handleModulePointerMove = (event) => {
    const marquee = moduleMarqueeRef.current;
    const drag = moduleDragRef.current;
    if (!marquee) return;

    // A stationary cursor can end up over the rail while the page scrolls.
    // Only deliberate mouse movement inside the rail should pause auto-scroll.
    if (!drag.active) {
      if (event.pointerType === 'mouse') pauseModuleMarquee();
      return;
    }
    if (drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    if (!moduleDragMovedRef.current && Math.abs(deltaX) > 5) {
      moduleDragMovedRef.current = true;
      setIsModuleDragging(true);
      // Keep a simple press owned by the module button so its click can
      // navigate. Capture only once the gesture is definitively a drag.
      marquee.setPointerCapture?.(event.pointerId);
    }
    if (!moduleDragMovedRef.current) return;

    moduleOffsetRef.current = normalizeModuleOffset(drag.startOffset - deltaX);
    renderModuleOffset();
  };

  const handleModuleWheel = (event) => {
    const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : (event.shiftKey ? event.deltaY : 0);
    if (!horizontalDelta) return;

    event.preventDefault();
    moduleOffsetRef.current = normalizeModuleOffset(
      moduleOffsetRef.current + horizontalDelta
    );
    renderModuleOffset();

    moduleCooldownRef.current = true;
    if (moduleResumeTimerRef.current) clearTimeout(moduleResumeTimerRef.current);
    moduleResumeTimerRef.current = setTimeout(() => {
      moduleCooldownRef.current = false;
      moduleResumeTimerRef.current = null;
      moduleLastFrameRef.current = performance.now();
    }, 650);
  };

  const finishModuleDrag = (event) => {
    const marquee = moduleMarqueeRef.current;
    const drag = moduleDragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    marquee?.releasePointerCapture?.(event.pointerId);
    moduleDragRef.current.active = false;
    moduleDragRef.current.pointerId = null;
    setIsModuleDragging(false);

    if (moduleDragMovedRef.current) {
      moduleCooldownRef.current = true;
      moduleResumeTimerRef.current = setTimeout(() => {
        moduleCooldownRef.current = false;
        moduleResumeTimerRef.current = null;
      }, 1200);
    }
  };

  const openModule = (event, route) => {
    if (moduleDragMovedRef.current) {
      event.preventDefault();
      event.stopPropagation();
      moduleDragMovedRef.current = false;
      return;
    }
    navigate(route);
  };

  const runProgressHoverAnimation = () => {
    const targets = {
      chats: stats.chats || 0,
      notes: stats.notes || 0,
      cards: stats.cards || 0,
      quizzes: stats.quizzes || 0
    };
    const durationMs = 1250;
    const startedAt = performance.now();

    if (progressAnimFrameRef.current) {
      cancelAnimationFrame(progressAnimFrameRef.current);
    }

    setProgressDisplay({ chats: 0, notes: 0, cards: 0, quizzes: 0 });

    const step = (now) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);

      setProgressDisplay({
        chats: Math.round(targets.chats * eased),
        notes: Math.round(targets.notes * eased),
        cards: Math.round(targets.cards * eased),
        quizzes: Math.round(targets.quizzes * eased)
      });

      if (t < 1) {
        progressAnimFrameRef.current = requestAnimationFrame(step);
      } else {
        setProgressDisplay(targets);
      }
    };

    progressAnimFrameRef.current = requestAnimationFrame(step);
  };

  const runChatCardHoverAnimation = () => {
    const full = QUICK_ASK_PROMPT;
    const reply = QUICK_REPLY_PREVIEW;
    let idx = 0;
    let replyIdx = 0;

    if (chatTypeTimerRef.current) {
      clearInterval(chatTypeTimerRef.current);
    }
    if (chatReplyTimerRef.current) {
      clearInterval(chatReplyTimerRef.current);
    }
    if (chatReplyDelayRef.current) {
      clearTimeout(chatReplyDelayRef.current);
    }

    setIsChatTypingAnim(true);
    setIsChatReplyTypingAnim(false);
    setChatPromptDisplay('');
    setChatReplyDisplay('');

    chatTypeTimerRef.current = setInterval(() => {
      idx += 1;
      setChatPromptDisplay(full.slice(0, idx));
      if (idx >= full.length) {
        clearInterval(chatTypeTimerRef.current);
        chatTypeTimerRef.current = null;
        chatReplyDelayRef.current = setTimeout(() => {
          setIsChatReplyTypingAnim(true);
          chatReplyTimerRef.current = setInterval(() => {
            replyIdx += 1;
            setChatReplyDisplay(reply.slice(0, replyIdx));
            if (replyIdx >= reply.length) {
              clearInterval(chatReplyTimerRef.current);
              chatReplyTimerRef.current = null;
              setIsChatReplyTypingAnim(false);
              setIsChatTypingAnim(false);
            }
          }, 24);
        }, 220);
      }
    }, 35);
  };

  const stopChatCardHoverAnimation = () => {
    if (chatTypeTimerRef.current) {
      clearInterval(chatTypeTimerRef.current);
      chatTypeTimerRef.current = null;
    }
    if (chatReplyTimerRef.current) {
      clearInterval(chatReplyTimerRef.current);
      chatReplyTimerRef.current = null;
    }
    if (chatReplyDelayRef.current) {
      clearTimeout(chatReplyDelayRef.current);
      chatReplyDelayRef.current = null;
    }
    setIsChatTypingAnim(false);
    setIsChatReplyTypingAnim(false);
    setChatPromptDisplay(QUICK_ASK_PROMPT);
    setChatReplyDisplay('');
  };

  const runFlashcardsCardHoverAnimation = () => {
    if (flashAnimFrameRef.current) {
      cancelAnimationFrame(flashAnimFrameRef.current);
      flashAnimFrameRef.current = null;
    }
    if (flashResetTimerRef.current) {
      clearTimeout(flashResetTimerRef.current);
      flashResetTimerRef.current = null;
    }

    // The flip/fan preview should animate even before the user has created
    // their first flashcard set. Recent-set counters are an optional extra.
    setIsFlashAnimating(true);

    if (!recentSets.length) {
      flashResetTimerRef.current = setTimeout(() => {
        setIsFlashAnimating(false);
        flashResetTimerRef.current = null;
      }, 900);
      return;
    }

    const durationPerSetMs = 680;
    const durationMs = durationPerSetMs * recentSets.length;
    const startedAt = performance.now();
    const targets = {};
    recentSets.forEach((s) => { targets[s.set_id] = s.count || 0; });

    setFlashCountsDisplay(Object.fromEntries(recentSets.map((s) => [s.set_id, s.count || 0])));
    setFlashActiveSetId(recentSets[0]?.set_id || '');

    const step = (now) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      const elapsed = now - startedAt;
      const nextCounts = {};
      let activeId = '';

      recentSets.forEach((s, idx) => {
        const setStart = idx * durationPerSetMs;
        const local = Math.max(0, Math.min(1, (elapsed - setStart) / durationPerSetMs));
        const eased = 1 - Math.pow(1 - local, 3);
        const total = targets[s.set_id] || 0;

        if (local > 0 && local < 1 && !activeId) {
          activeId = s.set_id;
        }

        if (local <= 0) {
          nextCounts[s.set_id] = total;
        } else if (local >= 1) {
          nextCounts[s.set_id] = 0;
        } else {
          nextCounts[s.set_id] = Math.max(0, Math.round(total * (1 - eased)));
        }
      });

      setFlashActiveSetId(activeId || recentSets[recentSets.length - 1]?.set_id || '');
      setFlashCountsDisplay(nextCounts);

      if (t < 1) {
        flashAnimFrameRef.current = requestAnimationFrame(step);
      } else {
        setFlashActiveSetId('');
        flashResetTimerRef.current = setTimeout(() => {
          setFlashCountsDisplay(targets);
          setIsFlashAnimating(false);
        }, 420);
      }
    };

    flashAnimFrameRef.current = requestAnimationFrame(step);
  };

  const stopFlashcardsCardHoverAnimation = () => {
    if (flashAnimFrameRef.current) {
      cancelAnimationFrame(flashAnimFrameRef.current);
      flashAnimFrameRef.current = null;
    }
    if (flashResetTimerRef.current) {
      clearTimeout(flashResetTimerRef.current);
      flashResetTimerRef.current = null;
    }

    setIsFlashAnimating(false);
    setFlashActiveSetId('');
    setFlashCountsDisplay(Object.fromEntries(recentSets.map((s) => [s.set_id, s.count || 0])));
  };

  const runNotesCardHoverAnimation = () => {
    const entries = [
      ...recentNotes.slice(0, 2).map((n) => ({
        key: `n-${n.id}`,
        title: n.title || 'Untitled note'
      })),
      ...recentMedia.slice(0, 2).map((m) => ({
        key: `m-${m.id}`,
        title: m.title || 'Media note'
      }))
    ];

    if (notesAnimTimerRef.current) {
      clearTimeout(notesAnimTimerRef.current);
      notesAnimTimerRef.current = null;
    }
    if (notesTypeTimerRef.current) {
      clearInterval(notesTypeTimerRef.current);
      notesTypeTimerRef.current = null;
    }

    setIsNotesAnimating(true);

    // Keep the ink animation available even when the user has not created
    // a note yet. The CSS loop remains active until the pointer leaves.
    if (!entries.length) return;

    setNotesActiveKey(entries[0].key);
    setNotesTitleProgress(Object.fromEntries(entries.map((e) => [e.key, 0])));

    let entryIndex = 0;
    let charIndex = 0;
    let holdTicks = 0;

    notesTypeTimerRef.current = setInterval(() => {
      const current = entries[entryIndex];
      if (!current) {
        clearInterval(notesTypeTimerRef.current);
        notesTypeTimerRef.current = null;
        setNotesTitleProgress(Object.fromEntries(entries.map((e) => [e.key, e.title.length])));
        notesAnimTimerRef.current = setTimeout(() => {
          setNotesActiveKey('');
          notesAnimTimerRef.current = null;
        }, 420);
        return;
      }

      setNotesActiveKey(current.key);
      if (charIndex < current.title.length) {
        charIndex += 1;
        setNotesTitleProgress((prev) => ({ ...prev, [current.key]: charIndex }));
        return;
      }

      if (holdTicks < 8) {
        holdTicks += 1;
        return;
      }

      entryIndex += 1;
      charIndex = 0;
      holdTicks = 0;
    }, 48);
  };

  const stopNotesCardHoverAnimation = () => {
    if (notesAnimTimerRef.current) {
      clearTimeout(notesAnimTimerRef.current);
      notesAnimTimerRef.current = null;
    }
    if (notesTypeTimerRef.current) {
      clearInterval(notesTypeTimerRef.current);
      notesTypeTimerRef.current = null;
    }

    const entries = [
      ...recentNotes.slice(0, 2).map((n) => ({
        key: `n-${n.id}`,
        title: n.title || 'Untitled note'
      })),
      ...recentMedia.slice(0, 2).map((m) => ({
        key: `m-${m.id}`,
        title: m.title || 'Media note'
      }))
    ];

    setIsNotesAnimating(false);
    setNotesActiveKey('');
    setNotesTitleProgress(Object.fromEntries(entries.map((e) => [e.key, e.title.length])));
  };

  const runWeeklyHoverAnimation = () => {
    if (!weekly.length) return;

    if (weeklyAnimTimerRef.current) {
      clearInterval(weeklyAnimTimerRef.current);
    }

    const target = weekly.map((d) => ({ ...d }));
    const staged = target.map((d) => ({ ...d, total: null }));
    setWeeklyDisplay(staged);

    let idx = -1;
    weeklyAnimTimerRef.current = setInterval(() => {
      idx += 1;
      setWeeklyDisplay((prev) => prev.map((d, i) => (
        i <= idx ? { ...d, total: target[i].total } : d
      )));

      if (idx >= target.length - 1) {
        clearInterval(weeklyAnimTimerRef.current);
        weeklyAnimTimerRef.current = null;
        setWeeklyDisplay(target);
      }
    }, 170);
  };

  const runRankHoverAnimation = () => {
    const targetRank = stats.rank || 1;
    const startRank = Math.max(targetRank + 75, Math.ceil(targetRank * 1.12));
    const pointTargets = [250, 500, 200];
    const pointStagger = [0, 0.18, 0.34];
    const durationMs = 1200;
    const startedAt = performance.now();

    if (rankAnimFrameRef.current) {
      cancelAnimationFrame(rankAnimFrameRef.current);
    }

    setIsRankAnimating(true);
    setRankDisplay(startRank);
    setRankPointsDisplay([0, 0, 0]);

    const step = (now) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);

      const rankValue = Math.round(startRank - (startRank - targetRank) * eased);
      setRankDisplay(rankValue);

      setRankPointsDisplay(pointTargets.map((target, i) => {
        const delay = pointStagger[i];
        const localT = Math.max(0, Math.min(1, (t - delay) / (1 - delay)));
        const localEased = 1 - Math.pow(1 - localT, 3);
        return Math.round(target * localEased);
      }));

      if (t < 1) {
        rankAnimFrameRef.current = requestAnimationFrame(step);
      } else {
        setRankDisplay(targetRank);
        setRankPointsDisplay(pointTargets);
        setIsRankAnimating(false);
      }
    };

    rankAnimFrameRef.current = requestAnimationFrame(step);
  };

  const todayLabel = (() => {
    const d = new Date();
    const offset = (i) => {
      const x = new Date(d);
      x.setDate(d.getDate() - (6 - i));
      return DAY_LABELS[x.getDay()];
    };
    return [...Array(7)].map((_, i) => offset(i));
  })();

  const runQuickAskPrompt = (e) => {
    e.stopPropagation();
    navigate('/ai-chat', { state: { initialMessage: QUICK_ASK_PROMPT } });
  };

  const normalizeFlashcardTopic = (value = '') =>
    String(value || '').replace(/^flashcards:\s*/i, '').trim();

  const openFlashcardMasterTopic = (e, rawTopic = '') => {
    e.stopPropagation();
    const topicText = normalizeFlashcardTopic(rawTopic);
    navigate('/flashcards', {
      state: {
        openPanel: 'generator',
        generationMode: 'topic',
        initialTopic: topicText
      }
    });
  };

  const closePfpModal = () => setIsPfpModalOpen(false);

  const saveProfile = (nextProfile) => {
    let baseProfile = {};
    const raw = localStorage.getItem('userProfile');
    if (raw) {
      try { baseProfile = JSON.parse(raw) || {}; } catch (e) { /* silenced */ }
    }
    const mergedProfile = hydrateProfile({ ...baseProfile, ...nextProfile }, userName);
    setProfile(mergedProfile);
    localStorage.setItem('userProfile', JSON.stringify(mergedProfile));

    if (mergedProfile.defaultPfp) localStorage.setItem(PFP_DEFAULT_KEY, mergedProfile.defaultPfp);
    if (mergedProfile.customPfp) localStorage.setItem(PFP_CUSTOM_KEY, mergedProfile.customPfp);
    else localStorage.removeItem(PFP_CUSTOM_KEY);

    const resolvedName = mergedProfile.firstName || mergedProfile.first_name || '';
    if (resolvedName) localStorage.setItem(DISPLAY_NAME_KEY, resolvedName);
  };

  const openPfpModal = (e) => {
    e.stopPropagation();
    setIsPfpModalOpen(true);
  };

  const selectPresetPfp = (src) => {
    const current = profile || {};
    const inferredDefault =
      current.defaultPfp ||
      current.googlePicture ||
      current.photoURL ||
      current.photo_url ||
      (isAllowedCustomPfp(current.picture_url || current.picture || '') ? '' : (current.picture_url || current.picture || '')) ||
      '';

    const nextProfile = {
      ...current,
      defaultPfp: inferredDefault,
      customPfp: src,
      picture: src,
      picture_url: src
    };
    saveProfile(nextProfile);
    closePfpModal();
  };

  const selectDefaultPfp = () => {
    const current = profile || {};
    const fallbackDefault =
      current.defaultPfp ||
      current.googlePicture ||
      current.photoURL ||
      current.photo_url ||
      (isAllowedCustomPfp(current.picture_url || current.picture || '') ? '' : (current.picture_url || current.picture || '')) ||
      '';

    const nextProfile = {
      ...current,
      defaultPfp: fallbackDefault,
      customPfp: '',
      picture: fallbackDefault,
      picture_url: fallbackDefault
    };
    saveProfile(nextProfile);
    closePfpModal();
  };

  const selectUploadedPfp = (dataUrl) => {
    const current = profile || {};
    const inferredDefault =
      current.defaultPfp ||
      current.googlePicture ||
      current.photoURL ||
      current.photo_url ||
      (isAllowedCustomPfp(current.picture_url || current.picture || '') ? '' : (current.picture_url || current.picture || '')) ||
      '';

    saveProfile({
      ...current,
      defaultPfp: inferredDefault,
      customPfp: dataUrl,
      picture: dataUrl,
      picture_url: dataUrl
    });
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
      selectUploadedPfp(dataUrl);
    };
    reader.onerror = () => alert('Could not read this image.');
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!isPfpModalOpen) return undefined;
    const onKeyDown = (ev) => {
      if (ev.key === 'Escape') setIsPfpModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPfpModalOpen]);

  useEffect(() => {
    if (!showNotifications) return undefined;
    const onPointerDown = (ev) => {
      if (
        notifPanelRef.current?.contains(ev.target) ||
        notifButtonRef.current?.contains(ev.target)
      ) {
        return;
      }
      setShowNotifications(false);
    };
    const onKeyDown = (ev) => {
      if (ev.key === 'Escape') setShowNotifications(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showNotifications]);

  const openNotification = async (notification) => {
    await markNotificationAsRead(notification.id);
    setShowNotifications(false);
    navigate(routeForNotification(notification.notification_type));
  };

  const handleDashboardSignOut = async () => {
    await signOutAppSession();
    navigate('/login', { replace: true });
  };

  return (
    <div className="cbd-root">
      {}
      <div className="cb-bg-fx" aria-hidden>
        <div className="cb-bg-wash" />
        <div className="cb-bg-orb cb-bg-orb-1" />
        <div className="cb-bg-orb cb-bg-orb-2" />
        <div className="cb-bg-orb cb-bg-orb-3" />
        <div className="cb-bg-dots" />
        <div className="cb-bg-grain" />
        <div className="cb-bg-vignette" />
      </div>

      {}
      <div className="cb-topbar">
        <div className="cb-tagline"><span>LEARNING,</span> UNIFIED</div>
        <div
          className={`cb-usage-meter ${isAdminUnlimited ? 'cb-usage-meter--admin' : ''}`}
          aria-label={isAdminUnlimited
            ? 'Admin unlimited AI access'
            : hasUnlimitedAccess
              ? 'Unlimited AI access'
              : `${subscriptionUsage.currentPlanName} plan, ${formatUsedTokenCount(subscriptionUsage.usedTokens)} of ${formatTokenCount(subscriptionUsage.includedTokens)} monthly tokens used. Groq API tokens reset daily at ${resetTimeText}. Upgrade now.`}
        >
          <div className="cb-usage-copy">
            <span className="cb-usage-heading">
              <span className="cb-usage-label">Token limit</span>
              <span className="cb-usage-plan-group">
                <span className="cb-usage-plan">{isAdminUnlimited ? 'Admin' : subscriptionUsage.currentPlanName}</span>
                {!hasUnlimitedAccess && (
                  <span className="cb-usage-reset">Daily usage reset {resetTimeText}</span>
                )}
              </span>
            </span>
            {hasUnlimitedAccess ? (
              <span className="cb-usage-admin-text">Unlimited access</span>
            ) : (
              <>
                <span className="cb-usage-row">
                  <span className="cb-usage-track" role="progressbar" aria-label="Daily token usage" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(usagePct)}>
                    <span className="cb-usage-fill" style={{ width: `${usagePct}%` }} />
                  </span>
                  <span className="cb-usage-subline">
                    {subscriptionUsage.loading
                      ? 'Loading'
                      : subscriptionUsage.error
                        ? 'Unavailable'
                        : `${formatUsedTokenCount(subscriptionUsage.usedTokens)} used / ${formatTokenCount(subscriptionUsage.includedTokens)}`}
                  </span>
                </span>
                <div className="cb-usage-hover-panel" aria-hidden="true">
                  <span><strong>Daily usage reset</strong>{resetDateTimeText}</span>
                  <span><strong>Time remaining</strong>{resetCountdownText}</span>
                </div>
              </>
            )}
          </div>
          {!hasUnlimitedAccess && (
            <button className="cb-usage-upgrade" type="button" onClick={() => navigate('/profile?upgrade=1')}>
              Upgrade
            </button>
          )}
        </div>
        <div className="cb-topbar-right">
          {!isSidebarOpen && (
            <button
              className="cb-topbar-text-btn"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Show sidebar"
            >
              SHOW SIDEBAR
            </button>
          )}
          <div className="cb-date">{formatDateLong(now)}</div>
          <ThemeSwitcher />
          <div className="cb-notif-wrap">
            <button
              ref={notifButtonRef}
              className="cb-notif-btn"
              type="button"
              onClick={() => setShowNotifications(prev => !prev)}
              aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
            >
              <Bell size={16} />
              {unreadCount > 0 && <span className="cb-notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </button>

            {showNotifications && (
              <div ref={notifPanelRef} className="cb-notif-panel" role="dialog" aria-label="Notifications">
                <div className="cb-tile-texture cb-notif-texture" aria-hidden="true" />
                <div className="cb-notif-panel-head">
                  <div className="cb-notif-heading">
                    <span className="cb-notif-heading-icon"><Bell size={15} /></span>
                    <div>
                      <span>Notifications</span>
                      <p>
                        {unreadCount > 0
                          ? `${unreadCount} unread · ${notifications.length} total`
                          : notifications.length > 0
                            ? `${notifications.length} notification${notifications.length === 1 ? '' : 's'}`
                            : 'All caught up'}
                      </p>
                    </div>
                  </div>
                  <button className="cb-notif-mark-all" type="button" onClick={markAllNotificationsAsRead} disabled={unreadCount === 0}>
                    Mark all read
                  </button>
                </div>

                <div className="cb-notif-list">
                  {notifications.length === 0 ? (
                    <div className="cb-notif-empty">
                      <Bell size={24} />
                      <p>No notifications yet</p>
                    </div>
                  ) : (
                    notifications.slice(0, 12).map((notification, index) => (
                      <div
                        key={notification.id}
                        className={`cb-notif-item ${notification.is_read ? '' : 'cb-notif-item--unread'}`}
                        style={{ '--cb-notif-index': index }}
                        role="button"
                        tabIndex={0}
                        onClick={() => openNotification(notification)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openNotification(notification);
                          }
                        }}
                      >
                        <span className="cb-notif-item-icon">
                          <Sparkles size={14} />
                        </span>
                        <span className="cb-notif-copy">
                          <strong>{notification.title}</strong>
                          <em>{notification.message}</em>
                          <small>{getRelativeTime(notification.created_at)}</small>
                        </span>
                        <button
                          className="cb-notif-delete"
                          type="button"
                          aria-label={`Delete notification ${notification.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(notification.id);
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="cb-profile-menu-wrap" onMouseEnter={() => setShowNotifications(false)}>
            <button
              className="cb-profile-btn"
              onClick={() => navigate('/profile')}
              aria-label="Open profile; hover for account shortcuts"
              aria-haspopup="menu"
            >
              {profilePhoto ? (
                <img src={profilePhoto} alt={displayName} className="cb-profile-btn-img" referrerPolicy="no-referrer" />
              ) : (
                <span className="cb-profile-btn-initial">{(displayName[0] || 'A').toUpperCase()}</span>
              )}
            </button>
            <div className="cb-profile-drawer" role="menu" aria-label="Account shortcuts">
              <span className="cb-profile-drawer-texture" aria-hidden="true" />
              <div className="cb-profile-drawer-identity" aria-hidden="true">
                <span>Account</span>
                <strong>{displayName}</strong>
              </div>
              <div className="cb-profile-drawer-actions">
                <button type="button" role="menuitem" onClick={() => navigate('/profile')}>
                  <User size={14} />
                  <span>Profile</span>
                </button>
                <button type="button" role="menuitem" className="cb-profile-drawer-signout" onClick={handleDashboardSignOut}>
                  <LogOut size={14} />
                  <span>Log out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`cb-shell ${isSidebarOpen ? '' : 'cb-shell--collapsed'}`}>
        {}
        <div className={`cb-side-slot ${isSidebarOpen ? '' : 'cb-side-slot--collapsed'}`}>
        <aside className={`cb-side ${isSidebarOpen ? '' : 'cb-side--collapsed'}`}>
          <div className="cb-tile-texture" />
          {isSidebarOpen ? (
          <>
            <div className="cb-brand">
              <span className="cb-brand-name">cerbyl</span>
              <span className="cb-brand-kicker">Dashboard</span>
              <button
                className="cb-sidebar-collapse"
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                title="Collapse"
                aria-label="Collapse dashboard sidebar"
                aria-expanded="true"
              >
                <ChevronLeft size={12} />
              </button>
            </div>

          <div className="cb-logo-wrap">
            {profilePhoto ? (
              <img
                src={profilePhoto}
                alt={`${displayName} profile`}
                className="cb-brand-pfp"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="cb-brand-pfp cb-brand-pfp--fallback" aria-label="Profile avatar">
                {initial}
              </div>
            )}
            <button
              className="cb-pfp-edit-btn"
              onClick={openPfpModal}
              aria-label="Edit profile picture"
              title="Choose profile picture"
            >
              <Pencil size={12} />
              Edit PFP
            </button>
          </div>

          <div className="cb-side-sections">
            {[
              { label: 'AI Chat',    route: '/ai-chat' },
              { label: 'Flashcards', route: '/flashcards' },
              { label: 'Notes',      route: '/notes' }
            ].map((s) => (
              <button key={s.label} className="cb-side-section" type="button" onClick={() => navigate(s.route)}>
                <span className="cb-side-dot" />
                <span className="cb-side-label">{s.label}</span>
                <span className="cb-side-plus" aria-hidden="true">
                  <Plus size={12} strokeWidth={2.4} />
                </span>
              </button>
            ))}
          </div>

          <nav className="cb-side-nav">
            {SIDE_LINKS.map(l => (
              <button
                key={l.label}
                className="cb-side-link"
                onClick={() => navigate(l.route)}
              >
                <span className="cb-side-link-dot" />
                {l.label}
              </button>
            ))}
          </nav>

          <button className="cb-user-chip" onClick={() => navigate('/profile')}>
            <span className="cb-user-meta">
              <span className="cb-user-name">{displayName}</span>
              <span className="cb-user-sub">Level {stats.level} · {stats.xp} XP</span>
            </span>
          </button>
          </>
          ) : (
            <div className="cb-side-strip">
              <button
                className="cb-side-strip-btn"
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                aria-label="Expand dashboard sidebar"
                aria-expanded="false"
                data-tip="Expand"
              >
                <ChevronRight size={15} />
              </button>
              <div className="cb-side-strip-rule" />
              <button
                className="cb-side-strip-btn cb-side-strip-btn--profile"
                type="button"
                onClick={() => navigate('/profile')}
                aria-label="Open profile"
                data-tip="Profile"
              >
                {profilePhoto ? (
                  <img src={profilePhoto} alt="" className="cb-side-strip-avatar" referrerPolicy="no-referrer" />
                ) : (
                  <User size={15} />
                )}
              </button>
            </div>
          )}
        </aside>
        </div>

        {}
        <main className="cb-main">
          {dashboardError && (
            <div className="cb-dashboard-error-banner" role="alert">
              <span>Couldn't load your latest stats — the numbers below may be out of date. Reload the page to try again.</span>
            </div>
          )}
          {}
          <section className="cb-hero">
            <div className="cb-hero-text">
              <div className="cb-eyebrow">{greet}</div>
              <h1 className="cb-name">
                {isNameTyping ? typedName : displayName}
                {isNameTyping ? (
                  <span className="cb-name-cursor" aria-hidden="true" />
                ) : (
                  <span className="cb-period">.</span>
                )}
              </h1>
            </div>

            <div className="cb-feature-search" ref={featureSearchRef}>
              <Search size={16} className="cb-feature-search-icon" />
              <input
                type="text"
                className="cb-feature-search-input"
                placeholder="Search for a feature... (e.g. flashcards, quiz battle, notes)"
                value={featureQuery}
                onChange={(e) => {
                  setFeatureQuery(e.target.value);
                  setShowFeatureResults(true);
                  setActiveFeatureIndex(-1);
                }}
                onFocus={() => setShowFeatureResults(true)}
                onKeyDown={onFeatureSearchKeyDown}
              />
              {featureQuery && (
                <button
                  className="cb-feature-search-clear"
                  onClick={() => { setFeatureQuery(''); setActiveFeatureIndex(-1); }}
                  aria-label="Clear search"
                  type="button"
                >
                  <X size={14} />
                </button>
              )}

              {showFeatureResults && featureQuery && (
                <div className="cb-feature-results" role="listbox">
                  {featureResults.length > 0 ? (
                    featureResults.map((f, idx) => (
                      <button
                        key={f.route}
                        className={`cb-feature-result ${idx === activeFeatureIndex ? 'active' : ''}`}
                        onMouseEnter={() => setActiveFeatureIndex(idx)}
                        onClick={() => goToFeature(f)}
                        type="button"
                        role="option"
                        aria-selected={idx === activeFeatureIndex}
                      >
                        <Search size={13} />
                        <span>{f.label}</span>
                        <ChevronRight size={13} className="cb-feature-result-arrow" />
                      </button>
                    ))
                  ) : (
                    <div className="cb-feature-no-results">No features match "{featureQuery}"</div>
                  )}
                </div>
              )}
            </div>

            <div className="cb-stat-row">
              <div className="cb-stat" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
                <div className="cb-tile-texture" />
                <div className="cb-stat-num">{String(stats.level).padStart(2, '0')}</div>
                <div className="cb-stat-lbl">LEVEL</div>
              </div>
              <div className="cb-stat" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
                <div className="cb-tile-texture" />
                <div className="cb-stat-num">{stats.xp}<span className="cb-stat-tiny"> XP</span></div>
                <div className="cb-stat-lbl">OF {stats.nextXp}</div>
              </div>
              <div className="cb-stat" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
                <div className="cb-tile-texture" />
                <div className="cb-stat-num">#{stats.rank || 1}</div>
                <div className="cb-stat-lbl">GLOBAL</div>
              </div>
              <div className="cb-stat" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
                <div className="cb-tile-texture" />
                <div className="cb-stat-num">{stats.streak}</div>
                <div className="cb-stat-lbl">STREAK</div>
              </div>
              <div className="cb-stat" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
                <div className="cb-tile-texture" />
                <div className="cb-stat-num">{stats.questions}</div>
                <div className="cb-stat-lbl">QUESTIONS</div>
              </div>
              <button className="cb-ai-cta" onClick={() => navigate('/search-hub')}>
                <Search size={15} /> Search Hub <ArrowUpRight size={16} />
              </button>
              <button className="cb-ai-cta cb-ai-cta--ghost" onClick={() => navigate('/contexthub')}>
                <Library size={15} /> ContextHub <ArrowUpRight size={16} />
              </button>
            </div>

            <div className="cb-xp-track" role="progressbar" aria-label={`XP progress ${stats.xp} of ${stats.nextXp}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(xpPct)}>
              <div className="cb-xp-fill" style={{ width: `${xpPct}%` }} />
            </div>
          </section>

          {}
          <section className="cb-features">
            <div
              className="cb-feat cb-feat--chat"
              onMouseEnter={runChatCardHoverAnimation}
              onMouseMove={handleTileMove}
              onMouseLeave={(e) => { stopChatCardHoverAnimation(e); handleTileLeave(e); }}
              onClick={() => navigate('/ai-chat')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/ai-chat'); } }}
              role="button"
              tabIndex={0}
            >
              <div className="cb-tile-texture" />
              <div className="cb-feat-tag">AI CHAT</div>
              <div className="cb-feat-title">Ask<br />Anything</div>
              <div className="cb-feat-desc">Instant AI guidance on any topic</div>
              <div className={`cb-feat-typing cb-feat-typing--chat ${isChatTypingAnim ? 'is-animating' : ''}`}>
                <button className="cb-typing-prompt cb-typing-prompt--user" onClick={runQuickAskPrompt}>
                  {chatPromptDisplay}
                </button>
                <div className={`cb-typing-row ${chatReplyDisplay ? 'cb-typing-row--answer' : ''}`} aria-hidden>
                  {chatReplyDisplay ? (
                    <span className={`cb-typing-answer ${isChatReplyTypingAnim ? 'is-typing' : ''}`}>
                      {chatReplyDisplay}
                    </span>
                  ) : (
                    <span className="cb-typing-dots"><i/><i/><i/></span>
                  )}
                </div>
              </div>
              <span className="cb-feat-arrow"><ArrowUpRight size={16}/></span>
            </div>

            <div
              className={`cb-feat cb-feat--flash ${isFlashAnimating ? 'is-animating' : ''}`}
              onMouseEnter={runFlashcardsCardHoverAnimation}
              onMouseMove={handleTileMove}
              onMouseLeave={(e) => { stopFlashcardsCardHoverAnimation(e); handleTileLeave(e); }}
              onClick={(e) => openFlashcardMasterTopic(e, recentSets[0]?.title || '')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFlashcardMasterTopic(e, recentSets[0]?.title || ''); } }}
              role="button"
              tabIndex={0}
            >
              <div className="cb-tile-texture" />
              <div className="cb-feat-tag">FLASHCARDS</div>
              <div className="cb-feat-title">Master<br />Any Topic</div>
              <div className="cb-feat-desc">Spaced repetition · AI card sets</div>
              <div className={`cb-flash-preview ${isFlashAnimating ? 'is-animating' : ''}`} aria-hidden>
                <span className="cb-flash-preview-face cb-flash-preview-face--q">Q</span>
                <span className="cb-flash-preview-face cb-flash-preview-face--a">A</span>
              </div>
              <div className={`cb-flash-stack ${isFlashAnimating ? 'is-animating' : ''}`} aria-hidden>
                <span className="cb-flash-card cb-flash-card--1" />
                <span className="cb-flash-card cb-flash-card--2" />
                <span className="cb-flash-card cb-flash-card--3" />
              </div>
              <div className="cb-recent-list">
                {recentSets.length === 0 ? (
                  <button
                    className="cb-recent-empty cb-recent-empty-btn"
                    onClick={(e) => openFlashcardMasterTopic(e, '')}
                  >
                    No card sets yet. Tap to create one.
                  </button>
                ) : recentSets.map(s => (
                  <button
                    key={s.set_id}
                    className={`cb-recent-item ${flashActiveSetId === s.set_id ? 'is-reviewing' : ''}`}
                    onClick={(e) => {
                      openFlashcardMasterTopic(e, s.title);
                    }}
                  >
                    <span className="cb-recent-icon"><FileText size={12}/></span>
                    <span className="cb-recent-title">{s.title}</span>
                    <span className="cb-recent-meta">
                      {isFlashAnimating
                        ? `${Math.max(0, (s.count || 0) - ((flashCountsDisplay[s.set_id] ?? s.count) || 0))}/${s.count || 0}`
                        : (s.count || 0)}
                    </span>
                  </button>
                ))}
              </div>
              <span className="cb-feat-arrow"><ArrowUpRight size={16}/></span>
            </div>

            <div
              className={`cb-feat cb-feat--notes ${isNotesAnimating ? 'is-animating' : ''}`}
              onMouseEnter={runNotesCardHoverAnimation}
              onMouseMove={handleTileMove}
              onMouseLeave={(e) => { stopNotesCardHoverAnimation(e); handleTileLeave(e); }}
              onClick={() => navigate('/notes')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/notes'); } }}
              role="button"
              tabIndex={0}
            >
              <div className="cb-tile-texture" />
              <div className="cb-feat-tag">NOTES</div>
              <div className="cb-feat-title">Your<br />Knowledge</div>
              <div className="cb-feat-desc">Written notes · AI media notes</div>
              <div className={`cb-notes-ink ${isNotesAnimating ? 'is-animating' : ''}`} aria-hidden>
                <span />
                <span />
                <span />
                <i className="cb-notes-caret" />
              </div>
              <div className="cb-recent-list">
                {recentNotes.length === 0 && recentMedia.length === 0 ? (
                  <div className="cb-recent-empty">No notes yet. Tap to start writing.</div>
                ) : (
                  <>
                    {recentNotes.slice(0, 2).map(n => (
                      <div
                        key={`n-${n.id}`}
                        className={`cb-recent-item ${notesActiveKey === `n-${n.id}` ? 'is-writing' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/notes/editor/${n.id}`);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/notes/editor/${n.id}`);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <span className="cb-recent-icon"><FileText size={12}/></span>
                        <span className="cb-recent-title">
                          {(n.title || 'Untitled note').slice(
                            0,
                            notesTitleProgress[`n-${n.id}`] ?? (n.title || 'Untitled note').length
                          )}
                          {isNotesAnimating &&
                          notesActiveKey === `n-${n.id}` &&
                          (notesTitleProgress[`n-${n.id}`] ?? 0) < (n.title || 'Untitled note').length ? (
                            <i className="cb-inline-caret" aria-hidden />
                          ) : null}
                        </span>
                        <span className="cb-recent-meta">note</span>
                      </div>
                    ))}
                    {recentMedia.slice(0, 2).map(m => (
                      <div
                        key={`m-${m.id}`}
                        className={`cb-recent-item ${notesActiveKey === `m-${m.id}` ? 'is-writing' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/notes/ai-media/${m.id}`);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/notes/ai-media/${m.id}`);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <span className="cb-recent-icon"><Mic size={12}/></span>
                        <span className="cb-recent-title">
                          {(m.title || 'Media note').slice(
                            0,
                            notesTitleProgress[`m-${m.id}`] ?? (m.title || 'Media note').length
                          )}
                          {isNotesAnimating &&
                          notesActiveKey === `m-${m.id}` &&
                          (notesTitleProgress[`m-${m.id}`] ?? 0) < (m.title || 'Media note').length ? (
                            <i className="cb-inline-caret" aria-hidden />
                          ) : null}
                        </span>
                        <span className="cb-recent-meta">media</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
              <span className="cb-feat-arrow"><ArrowUpRight size={16}/></span>
            </div>
          </section>

          {}
          <section className="cb-strip">
            <div className="cb-strip-eyebrow">
              ALL MODULES — HOVER TO PAUSE · DRAG TO BROWSE
            </div>
            <div
              ref={moduleMarqueeRef}
              className={`cb-marquee ${isModuleDragging ? 'is-dragging' : ''}`}
              onMouseLeave={resumeModuleMarquee}
              onPointerDown={handleModulePointerDown}
              onPointerMove={handleModulePointerMove}
              onPointerUp={finishModuleDrag}
              onPointerCancel={finishModuleDrag}
              onWheel={handleModuleWheel}
            >
              <div ref={moduleTrackRef} className="cb-marquee-track">
                {[...MODULES, ...MODULES, ...MODULES].map((m, i) => (
                  <button
                    key={`${m.num}-${i}`}
                    className="cb-mod"
                    draggable={false}
                    onClick={(event) => openModule(event, m.route)}
                    onMouseMove={handleTileMove}
                    onMouseLeave={handleTileLeave}
                  >
                    <div className="cb-tile-texture" />
                    <div className="cb-mod-num">{m.num}</div>
                    <div className="cb-mod-label">{m.label}</div>
                    <div className="cb-mod-sub">{m.sub}</div>
                    <span className="cb-mod-arrow"><ChevronRight size={14}/></span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {}
          <section className="cb-bottom">
            <div
              className="cb-panel cb-panel--act cb-panel--interactive"
              onMouseEnter={runWeeklyHoverAnimation}
              onMouseMove={handleTileMove}
              onMouseLeave={handleTileLeave}
              onClick={() => navigate('/analytics')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate('/analytics');
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="cb-tile-texture" />
              <div className="cb-panel-head">
                <span className="cb-panel-title">Past Week Activity</span>
                <button
                  className="cb-panel-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/analytics');
                  }}
                >
                  all <ArrowUpRight size={12}/>
                </button>
              </div>
              <div className="cb-panel-sub">{sessionsTotal} sessions total · {stats.weeklyPoints} pts this week</div>
              <svg viewBox={`0 0 ${weeklyChart.w} ${weeklyChart.h}`} className="cb-line" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="cb-line-fade" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32"/>
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <path d={weeklyChart.area} fill="url(#cb-line-fade)"/>
                <path d={weeklyChart.path} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                {weeklyChart.points.map((p, i) => (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r="3" fill="var(--accent)"/>
                    <text x={p.x} y={weeklyChart.h - 6} textAnchor="middle" className="cb-line-x">{todayLabel[i]}</text>
                  </g>
                ))}
              </svg>
            </div>

            <div
              className="cb-panel cb-panel--prog"
              onMouseEnter={runProgressHoverAnimation}
              onMouseMove={handleTileMove}
              onMouseLeave={handleTileLeave}
            >
              <div className="cb-tile-texture" />
              <div className="cb-panel-head">
                <span className="cb-panel-title">Progress</span>
              </div>
              <div className="cb-rings">
                {progressRings.map(r => {
                  const p = pct(r.v, r.t);
                  const C = 2 * Math.PI * 18;
                  const dash = (p / 100) * C;
                  return (
                    <div className="cb-ring" key={r.key}>
                      <div className="cb-ring-meter">
                        <svg viewBox="0 0 44 44" className="cb-ring-svg">
                          <circle cx="22" cy="22" r="18" stroke="var(--border)" strokeWidth="3" fill="none"/>
                          <circle cx="22" cy="22" r="18" stroke="var(--accent)" strokeWidth="3" fill="none"
                            strokeDasharray={`${dash} ${C}`} strokeLinecap="round"
                            transform="rotate(-90 22 22)"/>
                        </svg>
                        <div className="cb-ring-num">{r.v}</div>
                      </div>
                      <div className="cb-ring-lbl">{r.k}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              className={`cb-panel cb-panel--rank ${isRankAnimating ? 'is-animating' : ''}`}
              onMouseEnter={runRankHoverAnimation}
              onMouseMove={handleTileMove}
              onMouseLeave={handleTileLeave}
            >
              <div className="cb-tile-texture" />
              <div className="cb-panel-head">
                <span className="cb-panel-title">Global Rank</span>
                <span className="cb-rank-num">#{rankDisplay}</span>
              </div>
              <ul className="cb-rank-list">
                <li>
                  <span className="cb-rank-dot" />
                  <span className="cb-rank-name">Perfect Score</span>
                  <span className="cb-rank-pts">+{rankPointsDisplay[0]}</span>
                </li>
                <li>
                  <span className="cb-rank-dot" />
                  <span className="cb-rank-name">Study Streak</span>
                  <span className="cb-rank-pts">+{rankPointsDisplay[1]}</span>
                </li>
                <li>
                  <span className="cb-rank-dot" />
                  <span className="cb-rank-name">Note Taker</span>
                  <span className="cb-rank-pts">+{rankPointsDisplay[2]}</span>
                </li>
              </ul>
              <button className="cb-rank-cta" onClick={() => navigate('/leaderboards')}>
                View Leaderboard <ArrowUpRight size={12}/>
              </button>
            </div>
          </section>

          {}
          <section
            className="cb-panel cb-panel--heat cb-heat-full"
            onMouseMove={handleTileMove}
            onMouseLeave={handleTileLeave}
          >
            <div className="cb-tile-texture" />
            <div className="cb-panel-head">
              <span className="cb-panel-title">Heatmap</span>
              <span className="cb-panel-sub">Activity over the last year</span>
            </div>

            {heatmapWeeks.length === 0 ? (
              <div className="cb-heat-empty">No activity yet</div>
            ) : (
              <div className="cb-heat-wrapper">
                {}
                <div className="cb-heat-top">
                  <div className="cb-heat-day-pad" />
                  <div className="cb-heat-month-row">
                    {heatmapWeeks.map((week, wi) => {
                      const monthLabel = week.reduce((found, d) => {
                        if (found || !d.date) return found;
                        const dt = new Date(d.date);
                        return dt.getDate() === 1
                          ? dt.toLocaleString('default', { month: 'short' })
                          : null;
                      }, null);
                      return (
                        <div key={wi} className="cb-heat-month-slot">
                          {monthLabel && <span className="cb-heat-month-lbl">{monthLabel}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {}
                <div className="cb-heat-body">
                  <div className="cb-heat-days">
                    {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((d, i) => (
                      <span key={i} className="cb-heat-day-lbl">{d}</span>
                    ))}
                  </div>
                  <div className="cb-heat-grid">
                    {heatmapWeeks.map((week, wi) => (
                      <div className="cb-heat-col" key={wi}>
                        {week.map((d, di) => (
                          <span
                            key={di}
                            className={`cb-heat-cell cb-l${d.level || 0}`}
                            title={d.date ? `${d.date} · ${d.count} session${d.count !== 1 ? 's' : ''}` : ''}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="cb-heat-legend">
              <span>less</span>
              <span className="cb-heat-cell cb-l0"/>
              <span className="cb-heat-cell cb-l1"/>
              <span className="cb-heat-cell cb-l2"/>
              <span className="cb-heat-cell cb-l3"/>
              <span className="cb-heat-cell cb-l4"/>
              <span>more</span>
            </div>
          </section>
        </main>
      </div>

      {isPfpModalOpen && (
        <div className="cb-pfp-modal-overlay" onClick={closePfpModal}>
          <section className="cb-pfp-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Select profile picture">
            <div className="cb-pfp-modal-head">
              <div>
                <div className="cb-pfp-modal-kicker">PROFILE PERSONALIZATION</div>
                <h3 className="cb-pfp-modal-title">Select Your PFP</h3>
              </div>
              <button className="cb-pfp-modal-close" onClick={closePfpModal} aria-label="Close avatar picker">
                <X size={16} />
              </button>
            </div>

            <input
              ref={pfpUploadInputRef}
              className="cb-pfp-upload-input"
              type="file"
              accept=".jpg,.jpeg,image/jpeg"
              onChange={handlePfpUpload}
            />

            <div className="cb-pfp-grid">
              <button
                className={`cb-pfp-card ${activeCustomPfp ? '' : 'cb-pfp-card--active'}`}
                onClick={selectDefaultPfp}
                type="button"
              >
                <div className="cb-pfp-card-media">
                  {defaultUserPfp ? (
                    <img src={defaultUserPfp} alt="Default profile" className="cb-pfp-card-img" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="cb-pfp-card-fallback">{initial}</div>
                  )}
                </div>
                <div className="cb-pfp-card-label">Default</div>
                {!activeCustomPfp && <span className="cb-pfp-card-check"><Check size={12} /></span>}
              </button>

              {PRESET_PFPS.map((preset) => (
                <button
                  key={preset.id}
                  className={`cb-pfp-card ${activeCustomPfp === preset.src ? 'cb-pfp-card--active' : ''}`}
                  onClick={() => selectPresetPfp(preset.src)}
                  type="button"
                >
                  <div className="cb-pfp-card-media">
                    <img src={preset.src} alt={`${preset.label} avatar`} className="cb-pfp-card-img" />
                  </div>
                  <div className="cb-pfp-card-label">{preset.label}</div>
                  {activeCustomPfp === preset.src && <span className="cb-pfp-card-check"><Check size={12} /></span>}
                </button>
              ))}

              <button
                className={`cb-pfp-card cb-pfp-card--upload ${isUploadedPfp(activeCustomPfp) ? 'cb-pfp-card--active' : ''}`}
                onClick={() => pfpUploadInputRef.current?.click()}
                type="button"
              >
                <div className="cb-pfp-card-media">
                  {isUploadedPfp(activeCustomPfp) ? (
                    <img src={activeCustomPfp} alt="Custom uploaded profile" className="cb-pfp-card-img" />
                  ) : (
                    <div className="cb-pfp-upload-placeholder">
                      <Plus size={24} />
                    </div>
                  )}
                </div>
                <div className="cb-pfp-card-label">Custom</div>
                {isUploadedPfp(activeCustomPfp) && <span className="cb-pfp-card-check"><Check size={12} /></span>}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default DashboardCerbyl;
