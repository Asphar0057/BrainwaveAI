import ToolNavigation from '../components/ToolNavigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Award,
  BookOpen,
  Brain,
  CheckCircle,
  ChevronRight,
  Clock,
  Crown,
  FileText,
  Flame,
  Gift,
  LayoutDashboard,
  Layers,
  Lock,
  Map,
  MessageCircle,
  Package,
  Plus,
  RefreshCw,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Target,
  Trophy,
  User,
  X,
  Zap
} from 'lucide-react';
import {
  SidebarAction,
  SidebarActions,
  SidebarMenuItem,
  SidebarPrimaryButton,
  SidebarSection,
  SidebarShell,
  SidebarStripButton,
  SidebarStripDivider,
  SidebarStripSpacer
} from '../components/Sidebar';
import XPRoadmapWorkspace from './XPRoadmapWorkspace';
import './XPRoadmap.css';
import '../components/SocialHubChrome.css';

const API_BASE_URL = (process.env.REACT_APP_API_URL || 'http://localhost:8000/api').replace(/\/api$/, '');

const LEVEL_THRESHOLDS = [0, 100, 282, 500, 800, 1200, 1700, 2300, 3000];

const CAMPAIGN_NODES = [
  { id: 'ignite', xp: 0, title: 'Ignition Run', type: 'mission', reward: 'Origin Sigil', x: 7, y: 70, icon: Rocket },
  { id: 'spark', xp: 100, title: 'Spark Chain', type: 'mission', reward: 'Combo Token', x: 17, y: 47, icon: Zap },
  { id: 'vault-one', xp: 250, title: 'First Vault', type: 'chest', reward: 'Bronze Chest', x: 28, y: 61, icon: Package },
  { id: 'focus', xp: 500, title: 'Focus Gate', type: 'mission', reward: 'Focus Badge', x: 39, y: 34, icon: Target },
  { id: 'streak-core', xp: 800, title: 'Streak Core', type: 'mission', reward: 'Freeze Charge', x: 50, y: 54, icon: Flame },
  { id: 'weekly-raid', xp: 1200, title: 'Weekly Raid', type: 'boss', reward: 'Raid Crown', x: 62, y: 29, icon: Crown },
  { id: 'vault-two', xp: 1700, title: 'Deep Vault', type: 'chest', reward: 'Platinum Chest', x: 72, y: 51, icon: Gift },
  { id: 'recall', xp: 2500, title: 'Recall Sprint', type: 'mission', reward: 'Recall Emblem', x: 82, y: 30, icon: Brain },
  { id: 'mastery', xp: 4000, title: 'Mastery Tower', type: 'boss', reward: 'Legend Aura', x: 91, y: 58, icon: Trophy }
];

const QUEST_METRICS = [
  { id: 'chat', label: 'Dialogue', stat: 'weekly_ai_chats', goal: 'weekly_chat_goal', total: 'total_ai_chats', icon: MessageCircle },
  { id: 'notes', label: 'Notes', stat: 'weekly_notes_created', goal: 'weekly_note_goal', total: 'total_notes_created', icon: FileText },
  { id: 'flashcards', label: 'Cards', stat: 'weekly_flashcards_created', goal: 'weekly_flashcard_goal', total: 'total_flashcards_created', icon: Layers },
  { id: 'quizzes', label: 'Quizzes', stat: 'weekly_quizzes_completed', goal: 'weekly_quiz_goal', total: 'total_quizzes_completed', icon: Brain }
];

function getXpForLevel(level) {
  if (level < LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[level];
  return LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] + ((level - LEVEL_THRESHOLDS.length + 1) * 1000);
}

function getLevelWindow(level) {
  const start = level <= 1 ? 0 : getXpForLevel(level - 1);
  const end = getXpForLevel(level);
  return { start, end };
}

function getNodeState(node, xp, nextXp) {
  if (xp >= node.xp) return 'mastered';
  if (node.xp === nextXp) return 'active';
  return 'locked';
}

function getWeekDecayLabel() {
  const now = new Date();
  const nextMonday = new Date(now);
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  const diff = Math.max(0, nextMonday.getTime() - now.getTime());
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  return `${days}d ${hours}h`;
}

function pathForSegment(from, to) {
  const x1 = from.x * 10;
  const y1 = from.y * 6;
  const x2 = to.x * 10;
  const y2 = to.y * 6;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1 - 70}, ${mid} ${y2 + 70}, ${x2} ${y2}`;
}

const MISSION_ACTIONS = {
  ignite: { label: 'Explore Topic', route: '/search-hub', mode: 'search' },
  spark: { label: 'Start AI Chat', route: '/ai-chat', mode: 'chat' },
  'vault-one': { label: 'Create Note', route: '/notes', mode: 'note' },
  focus: { label: 'Practice Topic', route: '/question-bank', mode: 'questions' },
  'streak-core': { label: 'Create Flashcards', route: '/flashcards', mode: 'flashcards' },
  'weekly-raid': { label: 'Create Quiz', route: '/solo-quiz', mode: 'quiz' },
  'vault-two': { label: 'Review Topic', route: '/learning-review', mode: 'review' },
  recall: { label: 'Start Recall Quiz', route: '/solo-quiz', mode: 'quiz' },
  mastery: { label: 'Open Analytics', route: '/analytics', mode: 'analytics' }
};

const XP_QUICK_LINKS = [
  { label: 'AI Chat', route: '/ai-chat' },
  { label: 'Flashcards', route: '/flashcards' },
  { label: 'Notes', route: '/notes' }
];

const XP_SIDEBAR_LINKS = [
  { label: 'Dashboard', route: '/dashboard-cerbyl' },
  { label: 'Search Hub', route: '/search-hub' },
  { label: 'Knowledge Map', route: '/knowledge-map' },
  { label: 'Question Bank', route: '/question-bank' },
  { label: 'Quiz Hub', route: '/quiz-hub' },
  { label: 'Learning Path', route: '/learning-paths' },
  { label: 'XP Roadmap', route: '/xp-roadmap' },
  { label: 'Activity Timeline', route: '/activity-timeline' },
  { label: 'Leaderboards', route: '/leaderboards' }
];

const MISSION_MODE_TO_MILESTONE_TYPE = {
  chat: 'ai_chat',
  note: 'notes',
  flashcards: 'flashcards',
  questions: 'quizzes',
  quiz: 'quizzes',
  review: 'flashcards'
};

function getMissionAction(node) {
  return MISSION_ACTIONS[node?.id] || { label: 'Open Dashboard', route: '/dashboard-cerbyl' };
}

function getFallbackTopic(node) {
  if (!node?.title) return 'current study topic';
  return node.title.replace(/\b(run|chain|vault|gate|core|raid|sprint|tower)\b/gi, '').replace(/\s+/g, ' ').trim() || node.title;
}

const XPRoadmap = () => {
  const navigate = useNavigate();
  const shellRef = useRef(null);
  const pixiRef = useRef(null);
  const drawerRef = useRef(null);
  const drawerCloseRef = useRef(null);
  const previousFocusRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState('');
  const [statsRetry, setStatsRetry] = useState(0);
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  const [roadmapError, setRoadmapError] = useState('');
  const [roadmapRetry, setRoadmapRetry] = useState(0);
  const [stats, setStats] = useState(null);
  const [personalizedRoadmap, setPersonalizedRoadmap] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [xpBursts] = useState([]);
  const [decayLabel, setDecayLabel] = useState(getWeekDecayLabel());
  const [levelWave, setLevelWave] = useState(false);
  const [powerUpLoading, setPowerUpLoading] = useState(null);
  const [powerNotice, setPowerNotice] = useState(null);
  const [missionLoading, setMissionLoading] = useState(false);
  const [missionNotice, setMissionNotice] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  ));

  const xp = stats?.total_points || 0;
  const level = stats?.level || 1;
  const userName = localStorage.getItem('username') || '';
  const displayName = localStorage.getItem('cerbyl.displayName') || (userName ? userName.split('@')[0] : 'You');

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        if (isMounted) {
          setLoading(true);
          setStatsError('');
        }
        const token = localStorage.getItem('token');
        const userName = localStorage.getItem('username');

        if (!userName) {
          if (isMounted) setStatsError('Sign in to load your XP roadmap.');
          return;
        }

        const headers = { Authorization: `Bearer ${token}` };
        const statsRes = await fetch(`${API_BASE_URL}/api/get_gamification_stats?user_id=${encodeURIComponent(userName)}`, { headers });
        if (!statsRes.ok) throw new Error(`Progress request failed (${statsRes.status})`);
        const data = await statsRes.json();
        if (isMounted) setStats(data);
      } catch (error) {
        console.error('XP roadmap stats load error:', error);
        if (isMounted) setStatsError('Your progress could not be loaded. Your XP is safe. Try again in a moment.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [statsRetry]);

  useEffect(() => {
    if (loading || !userName) return undefined;

    let isMounted = true;
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    setRoadmapLoading(true);
    setRoadmapError('');
    fetch(`${API_BASE_URL}/api/xp_roadmap/personalized?user_id=${encodeURIComponent(userName)}`, { headers })
      .then(async (response) => {
        if (!response.ok) throw new Error(`XP roadmap request failed (${response.status})`);
        return response.json();
      })
      .then((data) => {
        if (isMounted) setPersonalizedRoadmap(data?.roadmap || null);
      })
      .catch((error) => {
        console.error('XP roadmap personalization load error:', error);
        if (isMounted) setRoadmapError('Personalized topic arcs are temporarily unavailable.');
      })
      .finally(() => {
        if (isMounted) setRoadmapLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [loading, userName, roadmapRetry]);

  useEffect(() => {
    const interval = window.setInterval(() => setDecayLabel(getWeekDecayLabel()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (loading) return undefined;

    const timeout = window.setTimeout(() => setLevelWave(true), 250);
    const cleanup = window.setTimeout(() => setLevelWave(false), 1500);
    return () => {
      window.clearTimeout(timeout);
      window.clearTimeout(cleanup);
    };
  }, [loading, level]);

  const levelWindow = useMemo(() => getLevelWindow(level), [level]);
  const levelProgress = useMemo(() => {
    return Math.max(0, Math.min(100, ((xp - levelWindow.start) / Math.max(1, levelWindow.end - levelWindow.start)) * 100));
  }, [xp, levelWindow]);

  const nextNode = useMemo(() => CAMPAIGN_NODES.find((node) => xp < node.xp) || null, [xp]);
  const masteredCount = useMemo(() => CAMPAIGN_NODES.filter((node) => xp >= node.xp).length, [xp]);

  const quests = useMemo(() => {
    if (!stats) return [];
    return QUEST_METRICS.map((quest) => {
      const current = Number(stats[quest.stat] || 0);
      const goal = Math.max(1, Number(stats[quest.goal] || 1));
      const progress = Math.min(100, Math.round((current / goal) * 100));
      return {
        ...quest,
        current,
        goal,
        progress,
        done: current >= goal
      };
    });
  }, [stats]);

  const runMechanics = useMemo(() => {
    const completedQuests = quests.filter((quest) => quest.done).length;
    const averageQuestProgress = quests.length
      ? Math.round(quests.reduce((total, quest) => total + quest.progress, 0) / quests.length)
      : 0;
    const combo = Math.min(2, 1 + (completedQuests * 0.2));
    const freezes = Math.min(3, Math.floor((stats?.longest_streak || 0) / 7));
    const revive = (stats?.current_streak || 0) > 0 ? 'armed' : ((stats?.longest_streak || 0) > 0 ? 'ready' : 'charging');

    return {
      completedQuests,
      averageQuestProgress,
      combo: combo.toFixed(1),
      freezes,
      revive
    };
  }, [quests, stats]);

  const chestInventory = useMemo(() => {
    return CAMPAIGN_NODES.filter((node) => node.type === 'chest').map((node) => ({
      ...node,
      state: getNodeState(node, xp, nextNode?.xp)
    }));
  }, [xp, nextNode]);

  const nextRewards = useMemo(() => {
    return CAMPAIGN_NODES.filter((node) => xp < node.xp).slice(0, 3);
  }, [xp]);

  const bossNode = useMemo(() => {
    return CAMPAIGN_NODES.find((node) => node.type === 'boss' && xp < node.xp) || CAMPAIGN_NODES.filter((node) => node.type === 'boss').slice(-1)[0];
  }, [xp]);

  const streakChain = useMemo(() => {
    const streak = stats?.current_streak || 0;
    const completed = Math.min(7, streak % 7 || (streak > 0 ? 7 : 0));
    return Array.from({ length: 7 }, (_, index) => ({
      id: `chain-${index}`,
      active: index < completed,
      current: index === completed && completed < 7
    }));
  }, [stats]);

  const powerUps = useMemo(() => {
    const powerupState = stats?.powerups || {};
    const freezeCharges = Number(powerupState.freeze_charges ?? stats?.freeze_charges ?? runMechanics.freezes ?? 0);
    const reviveCharges = Number(powerupState.revive_charges ?? stats?.revive_charges ?? 0);
    const boostActive = Boolean(powerupState.boost_active || stats?.xp_boost_active);
    const boostAvailable = Number(powerupState.boost_available || 0);
    const boostMultiplier = Number(powerupState.boost_multiplier || stats?.xp_boost_multiplier || runMechanics.combo || 1);
    const vaultsAvailable = Number(powerupState.vaults_available || 0);
    const vaultsMastered = Number(powerupState.vaults_mastered ?? chestInventory.filter((chest) => chest.state === 'mastered').length);

    return [
      {
        id: 'freeze',
        label: 'Freeze',
        value: freezeCharges,
        icon: Shield,
        charged: freezeCharges > 0,
        disabled: freezeCharges <= 0,
        description: 'Protect today from breaking your streak'
      },
      {
        id: 'revive',
        label: 'Revive',
        value: reviveCharges > 0 ? reviveCharges : runMechanics.revive,
        icon: RefreshCw,
        charged: reviveCharges > 0 && (stats?.current_streak || 0) <= 0,
        disabled: reviveCharges <= 0 || (stats?.current_streak || 0) > 0,
        description: (stats?.current_streak || 0) > 0 ? 'Your streak is already active' : 'Restart a broken streak'
      },
      {
        id: 'boost',
        label: 'Boost',
        value: boostActive ? `x${boostMultiplier.toFixed(1)}` : boostAvailable,
        icon: Zap,
        charged: boostActive || boostAvailable > 0,
        disabled: boostActive || boostAvailable <= 0,
        description: boostActive ? 'XP boost is already active' : 'Activate a 30 minute XP multiplier'
      },
      {
        id: 'vault',
        label: 'Vaults',
        value: `${vaultsAvailable}/${vaultsMastered}`,
        icon: Package,
        charged: vaultsAvailable > 0,
        disabled: vaultsAvailable <= 0,
        description: 'Claim XP from unlocked campaign vaults'
      }
    ];
  }, [runMechanics, chestInventory, stats]);

  const badgeCollection = useMemo(() => {
    return CAMPAIGN_NODES.map((node) => ({
      ...node,
      state: getNodeState(node, xp, nextNode?.xp)
    }));
  }, [xp, nextNode]);

  const seasonTrack = useMemo(() => {
    const rewardLabels = ['Origin', 'Boost', 'Vault', 'Freeze', 'Raid', 'Crown'];
    return rewardLabels.map((label, index) => {
      const threshold = [0, 150, 350, 700, 1200, 2000][index];
      return {
        id: `season-${label}`,
        label,
        threshold,
        unlocked: xp >= threshold
      };
    });
  }, [xp]);

  const selectedNodeDetails = useMemo(() => {
    if (!selectedNode) return null;

    const state = selectedNode.state || getNodeState(selectedNode, xp, nextNode?.xp);
    const questSummary = quests.map((quest) => ({
      id: quest.id,
      label: quest.label,
      progress: quest.progress,
      done: quest.done
    }));

    return {
      ...selectedNode,
      state,
      questSummary,
      delta: Math.max(0, selectedNode.xp - xp)
    };
  }, [selectedNode, xp, nextNode, quests]);

  useEffect(() => {
    if (!selectedNodeDetails) return undefined;
    previousFocusRef.current = document.activeElement;
    const focusFrame = window.requestAnimationFrame(() => drawerCloseRef.current?.focus());
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedNode(null);
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;

      const focusable = Array.from(drawerRef.current.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
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
      previousFocusRef.current?.focus?.();
    };
  }, [selectedNodeDetails]);

  const selectedMissionAction = useMemo(() => {
    const targetNode = selectedNodeDetails?.state === 'locked' ? nextNode : selectedNodeDetails;
    return getMissionAction(targetNode);
  }, [selectedNodeDetails, nextNode]);

  const missionRecommendations = useMemo(() => {
    const targetNode = selectedNodeDetails?.state === 'locked' ? nextNode : selectedNodeDetails;
    const action = getMissionAction(targetNode);
    const generatedRecommendations = personalizedRoadmap?.recommended_topics?.[action.mode] || [];
    if (generatedRecommendations.length > 0) {
      return generatedRecommendations.slice(0, 3).map((recommendation, index) => ({
        topic: recommendation.topic,
        category: recommendation.source || 'suggestion_engine',
        activityCount: 0,
        reason: recommendation.reason || 'Recommended by Search Hub',
        progress: 0,
        score: 100 - index
      }));
    }

    const topics = personalizedRoadmap?.topics || [];
    const buckets = personalizedRoadmap?.topic_milestones || {};
    const milestoneType = MISSION_MODE_TO_MILESTONE_TYPE[action.mode];

    const scoredTopics = topics.map((topicItem, index) => {
      const topic = topicItem.topic;
      const milestones = buckets[topic]?.milestones || [];
      const matchingMilestones = milestoneType
        ? milestones.filter((milestone) => milestone.type === milestoneType)
        : milestones;
      const nextMilestone = matchingMilestones.find((milestone) => !milestone.completed) || matchingMilestones[0] || null;
      const progressGap = nextMilestone ? Math.max(0, Number(nextMilestone.target || 0) - Number(nextMilestone.current || 0)) : 0;

      return {
        topic,
        category: topicItem.category,
        activityCount: topicItem.activity_count || 0,
        reason: nextMilestone?.title || `${topicItem.category || 'Study'} focus`,
        progress: nextMilestone ? Math.round(Number(nextMilestone.progress || 0)) : 0,
        score: (topicItem.activity_count || 0) + (nextMilestone && !nextMilestone.completed ? 8 : 0) + Math.max(0, 6 - index) + Math.min(4, progressGap)
      };
    });

    const recommendations = scoredTopics
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);

    if (recommendations.length > 0) return recommendations;

    return [{
      topic: getFallbackTopic(targetNode),
      category: 'general',
      activityCount: 0,
      reason: 'Campaign focus',
      progress: 0,
      score: 0
    }];
  }, [personalizedRoadmap, selectedNodeDetails, nextNode]);

  const [selectedMissionTopic, setSelectedMissionTopic] = useState('');

  useEffect(() => {
    setSelectedMissionTopic(missionRecommendations[0]?.topic || '');
    setMissionNotice(null);
  }, [missionRecommendations]);

  const activeMissionTopic = selectedMissionTopic || missionRecommendations[0]?.topic || getFallbackTopic(selectedNodeDetails || nextNode);

  const selectedCtaLabel = selectedMissionAction.label;

  const topicArcs = useMemo(() => {
    const topics = personalizedRoadmap?.topics || [];
    const buckets = personalizedRoadmap?.topic_milestones || {};

    return topics.slice(0, 4).map((topic) => {
      const bucket = buckets[topic.topic] || {};
      const completed = Number(bucket.completed_count || 0);
      const total = Math.max(1, Number(bucket.total_count || 1));
      return {
        topic: topic.topic,
        category: topic.category,
        activityCount: topic.activity_count,
        completed,
        total,
        progress: Math.round((completed / total) * 100)
      };
    });
  }, [personalizedRoadmap]);

  const handleNodeMove = (event) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) - 0.5;
    const y = ((event.clientY - rect.top) / rect.height) - 0.5;
    target.style.setProperty('--magnet-x', `${x * 14}px`);
    target.style.setProperty('--magnet-y', `${y * 14}px`);
  };

  const handleNodeLeave = (event) => {
    event.currentTarget.style.setProperty('--magnet-x', '0px');
    event.currentTarget.style.setProperty('--magnet-y', '0px');
  };

  const handleNodeClick = (node, state, event) => {
    setSelectedNode({ ...node, state });

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (state === 'active' && event.currentTarget.animate && !reduceMotion) {
      event.currentTarget.animate(
        [
          { transform: 'translateY(0) scale(1)' },
          { transform: 'translateY(-2px) scale(1.025)' },
          { transform: 'translateY(0) scale(1)' }
        ],
        { duration: 260, easing: 'cubic-bezier(.23,1,.32,1)' }
      );
    }
  };

  const handleContinueMission = async () => {
    const targetNode = selectedNodeDetails?.state === 'locked' ? nextNode : selectedNodeDetails;
    const action = getMissionAction(targetNode);
    const topic = activeMissionTopic || getFallbackTopic(targetNode);
    const token = localStorage.getItem('token');
    const userName = localStorage.getItem('username');
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    try {
      setMissionLoading(true);
      setMissionNotice(null);

      if (action.mode === 'note') {
        const response = await fetch(`${API_BASE_URL}/api/agents/searchhub/create-note`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            user_id: userName,
            topic,
            depth: 'standard',
            tone: 'professional',
            use_hs_context: true
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.detail || 'Failed to create note');
        setSelectedNode(null);
        navigate(data?.navigate_to || '/notes/my-notes');
        return;
      }

      if (action.mode === 'flashcards') {
        const response = await fetch(`${API_BASE_URL}/api/agents/searchhub/create-flashcards`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            user_id: userName,
            topic,
            count: 10,
            difficulty: 'medium',
            use_hs_context: true
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.detail || 'Failed to create flashcards');
        setSelectedNode(null);
        navigate(data?.navigate_to || '/flashcards');
        return;
      }

      setSelectedNode(null);

      if (action.mode === 'chat') {
        navigate('/ai-chat', {
          state: {
            initialMessage: `Help me learn ${topic}. Start with the most important ideas, then give me a short practice plan.`
          }
        });
        return;
      }

      if (action.mode === 'quiz') {
        navigate('/solo-quiz', {
          state: {
            autoStart: true,
            topics: [topic],
            contextSummary: `XP Roadmap recommended topic: ${topic}`,
            difficulty: 'medium',
            questionCount: 10
          }
        });
        return;
      }

      if (action.mode === 'questions') {
        navigate('/question-bank', {
          state: {
            initialTopic: topic,
            topic,
            source: 'xp_roadmap'
          }
        });
        return;
      }

      if (action.mode === 'search') {
        navigate('/search-hub', {
          state: {
            initialQuery: topic,
            source: 'xp_roadmap'
          }
        });
        return;
      }

      navigate(action.route, action.state ? { state: action.state } : undefined);
    } catch (error) {
      setMissionNotice({ type: 'error', text: error.message || 'Mission action failed.' });
    } finally {
      setMissionLoading(false);
    }
  };

  const handleUsePowerUp = async (power) => {
    if (power.disabled || powerUpLoading) return;

    try {
      setPowerUpLoading(power.id);
      setPowerNotice(null);
      const token = localStorage.getItem('token');
      const userName = localStorage.getItem('username');
      const response = await fetch(`${API_BASE_URL}/api/xp_roadmap/powerups/use?user_id=${encodeURIComponent(userName)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ powerup_id: power.id })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || 'Power-up failed');
      }

      if (data?.stats) {
        setStats(data.stats);
      }
      setPowerNotice({ type: 'success', text: data?.message || `${power.label} used.` });
    } catch (error) {
      setPowerNotice({ type: 'error', text: error.message || 'Power-up failed.' });
    } finally {
      setPowerUpLoading(null);
    }
  };

  const scrollToPanel = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openNextMission = () => {
    if (nextNode) {
      setSelectedNode({ ...nextNode, state: 'active' });
      return;
    }
    navigate('/analytics');
  };

  if (typeof XPRoadmapWorkspace === 'function') {
    return (
      <XPRoadmapWorkspace
        loading={loading}
        statsError={statsError}
        retryStats={() => setStatsRetry((value) => value + 1)}
        navigate={navigate}
        shellRef={shellRef}
        drawerRef={drawerRef}
        drawerCloseRef={drawerCloseRef}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        levelWave={levelWave}
        level={level}
        xp={xp}
        displayName={displayName}
        levelProgress={levelProgress}
        levelWindow={levelWindow}
        masteredCount={masteredCount}
        nextNode={nextNode}
        nextMissionAction={getMissionAction(nextNode)}
        stats={stats}
        quests={quests}
        runMechanics={runMechanics}
        decayLabel={decayLabel}
        powerUps={powerUps}
        powerUpLoading={powerUpLoading}
        powerNotice={powerNotice}
        handleUsePowerUp={handleUsePowerUp}
        chestInventory={chestInventory}
        nextRewards={nextRewards}
        bossNode={bossNode}
        streakChain={streakChain}
        seasonTrack={seasonTrack}
        topicArcs={topicArcs}
        roadmapLoading={roadmapLoading}
        roadmapError={roadmapError}
        retryRoadmap={() => setRoadmapRetry((value) => value + 1)}
        badgeCollection={badgeCollection}
        handleNodeClick={handleNodeClick}
        scrollToPanel={scrollToPanel}
        openNextMission={openNextMission}
        setSelectedNode={setSelectedNode}
        xpBursts={xpBursts}
        selectedNodeDetails={selectedNodeDetails}
        missionRecommendations={missionRecommendations}
        activeMissionTopic={activeMissionTopic}
        setSelectedMissionTopic={setSelectedMissionTopic}
        missionNotice={missionNotice}
        selectedMissionAction={selectedMissionAction}
        selectedCtaLabel={selectedCtaLabel}
        missionLoading={missionLoading}
        handleContinueMission={handleContinueMission}
      />
    );
  }

  if (loading) {
    return (
      <div className="xpv-loading">
        <div className="shc-topbar">
          <ToolNavigation />
        </div>
        <div className="xpv-loader-core" aria-hidden="true">
          <span className="xpv-loader-ring xpv-loader-ring--outer" />
          <span className="xpv-loader-ring xpv-loader-ring--inner" />
          <span className="xpv-loader-pip" />
        </div>
        <p>Booting XP campaign</p>
      </div>
    );
  }

  return (
    <div className="xpv-shell" ref={shellRef}>
      <div className="xpv-bg-fx" aria-hidden="true">
        <div className="xpv-bg-orb xpv-bg-orb-1" />
        <div className="xpv-bg-orb xpv-bg-orb-2" />
        <div className="xpv-bg-dots" />
        <div className="xpv-bg-vignette" />
      </div>

      <div className="shc-topbar">
        <ToolNavigation />
      </div>

      {levelWave && <div className="xpv-level-wave" aria-hidden="true" />}

      <div className="xpv-layout">
        <div className="xpv-side-slot">
        <aside className="xpv-side" aria-label="XP Roadmap sidebar">
          <div className="xpv-brand">
            <span className="xpv-brand-name">cerbyl</span>
          </div>

          <div className="xpv-side-hero">
            <div className="xpv-side-hero-icon">
              <Zap size={26} />
            </div>
            <div className="xpv-side-hero-copy">
              <strong>XP Roadmap</strong>
              <span>Level {level} campaign</span>
            </div>
          </div>

          <div className="xpv-side-sections">
            {XP_QUICK_LINKS.map((item) => (
              <div key={item.label} className="xpv-side-section" onClick={() => navigate(item.route)}>
                <span className="xpv-side-dot" />
                <span className="xpv-side-label">{item.label}</span>
                <button
                  className="xpv-side-plus"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    navigate(item.route);
                  }}
                  aria-label={`Open ${item.label}`}
                >
                  <Plus size={12} strokeWidth={2.4} />
                </button>
              </div>
            ))}
          </div>

          <nav className="xpv-side-nav" aria-label="Learning navigation">
            {XP_SIDEBAR_LINKS.map((item) => (
              <button
                key={item.route}
                type="button"
                className={`xpv-side-link ${item.route === '/xp-roadmap' ? 'active' : ''}`}
                onClick={() => navigate(item.route)}
              >
                <span className="xpv-side-link-dot" />
                {item.label}
              </button>
            ))}
          </nav>

          <button className="xpv-user-chip" type="button" onClick={() => navigate('/profile')}>
            <span className="xpv-user-meta">
              <span className="xpv-user-name">{displayName}</span>
              <span className="xpv-user-sub">Level {level} · {xp.toLocaleString()} XP</span>
            </span>
          </button>
        </aside>
        </div>

        <main className="xpv-content">
        <section className="xpv-run-strip" aria-label="Current run">
          <div className="xpv-run-cell">
            <Flame size={18} />
            <span>Run streak</span>
            <strong>{stats?.current_streak || 0}d</strong>
          </div>
          <div className="xpv-run-cell is-hot">
            <Zap size={18} />
            <span>Combo</span>
            <strong>x{runMechanics.combo}</strong>
          </div>
          <div className="xpv-run-cell">
            <Target size={18} />
            <span>Daily target</span>
            <strong>{runMechanics.averageQuestProgress}%</strong>
          </div>
          <div className="xpv-run-cell">
            <Shield size={18} />
            <span>Freezes</span>
            <strong>{runMechanics.freezes}</strong>
          </div>
          <div className="xpv-run-cell">
            <RefreshCw size={18} />
            <span>Revive</span>
            <strong>{runMechanics.revive}</strong>
          </div>
          <div className="xpv-run-cell">
            <Clock size={18} />
            <span>Combo decay</span>
            <strong>{decayLabel}</strong>
          </div>
        </section>

        <section className="xpv-campaign-grid">
          <div className="xpv-stage">
            <div className="xpv-stage-canvas" ref={pixiRef} aria-hidden="true" />
            <div className="xpv-stage-scanline" aria-hidden="true" />

            <div className="xpv-stage-header">
              <div>
                <span className="xpv-kicker">Current Campaign</span>
                <h1>Road to {nextNode?.title || 'Ascendant Core'}</h1>
              </div>
              <div className="xpv-level-module" style={{ '--level-progress': `${levelProgress}%` }}>
                <span>LEVEL {level}</span>
                <strong>{xp.toLocaleString()} XP</strong>
              </div>
            </div>

            <svg className="xpv-path-svg" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
              {CAMPAIGN_NODES.slice(1).map((node, index) => {
                const previous = CAMPAIGN_NODES[index];
                const state = getNodeState(node, xp, nextNode?.xp);
                const previousMastered = xp >= previous.xp;
                const segmentState = state === 'mastered' ? 'mastered' : (previousMastered && state === 'active' ? 'active' : 'locked');
                return (
                  <path
                    key={`${previous.id}-${node.id}`}
                    className={`xpv-path-segment ${segmentState}`}
                    d={pathForSegment(previous, node)}
                  />
                );
              })}
            </svg>

            <div className="xpv-node-layer">
              {CAMPAIGN_NODES.map((node) => {
                const state = getNodeState(node, xp, nextNode?.xp);
                const Icon = node.icon;
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={`xpv-mission-node ${state} type-${node.type}`}
                    style={{ left: `${node.x}%`, top: `${node.y}%` }}
                    onMouseMove={handleNodeMove}
                    onMouseLeave={handleNodeLeave}
                    onClick={(event) => handleNodeClick(node, state, event)}
                    aria-label={`${node.title} ${state}`}
                  >
                    <span className="xpv-node-aura" />
                    <span className="xpv-node-core">
                      {state === 'locked' ? <Lock size={22} /> : <Icon size={24} />}
                    </span>
                    <span className="xpv-node-copy">
                      <strong>{node.title}</strong>
                      <small>{node.xp.toLocaleString()} XP</small>
                    </span>
                </button>
              );
            })}
            </div>

            <div className="xpv-stage-footer">
              <div>
                <Map size={16} />
                <span>{masteredCount}/{CAMPAIGN_NODES.length} missions mastered</span>
              </div>
              <div>
                <Award size={16} />
                <span>{Math.max(0, levelWindow.end - xp).toLocaleString()} XP to level {level + 1}</span>
              </div>
            </div>
          </div>

          <aside className="xpv-rail" aria-label="Quest systems">
            <section className="xpv-rail-panel xpv-next-panel">
              <div className="xpv-panel-title">
                <Target size={16} />
                <h2>Current Mission</h2>
              </div>
              <div className="xpv-next-mission">
                <strong>{nextNode?.title || 'Campaign Complete'}</strong>
                <span>{nextNode ? `${Math.max(0, nextNode.xp - xp).toLocaleString()} XP remaining` : 'All mapped missions mastered'}</span>
                <div className="xpv-mini-meter">
                  <span style={{ width: `${levelProgress}%` }} />
                </div>
              </div>
            </section>

            <section className="xpv-rail-panel">
              <div className="xpv-panel-title">
                <Sparkles size={16} />
                <h2>Active Quests</h2>
              </div>
              <div className="xpv-quest-list">
                {quests.map((quest) => {
                  const Icon = quest.icon;
                  return (
                    <div key={quest.id} className={`xpv-quest-row ${quest.done ? 'done' : ''}`}>
                      <Icon size={17} />
                      <div>
                        <strong>{quest.label}</strong>
                        <span>{quest.current}/{quest.goal}</span>
                      </div>
                      <div className="xpv-mini-meter">
                        <span style={{ width: `${quest.progress}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="xpv-rail-panel">
              <div className="xpv-panel-title">
                <Crown size={16} />
                <h2>Weekly Boss</h2>
              </div>
              <div className="xpv-boss-module">
                <div className="xpv-boss-mark">
                  <Crown size={28} />
                </div>
                <strong>{bossNode?.title || 'Weekly Raid'}</strong>
                <span>{runMechanics.completedQuests}/4 quest lanes charged</span>
                <div className="xpv-mini-meter">
                  <span style={{ width: `${(runMechanics.completedQuests / 4) * 100}%` }} />
                </div>
                <div className="xpv-boss-lanes">
                  {quests.slice(1).map((quest) => (
                    <span key={quest.id} className={quest.done ? 'done' : ''}>{quest.label}</span>
                  ))}
                </div>
              </div>
            </section>
          </aside>
        </section>

        <section className="xpv-system-grid" aria-label="Progression systems">
          <section className="xpv-system-panel">
            <div className="xpv-topic-heading">
              <Flame size={17} />
              <h2>Streak Chain</h2>
            </div>
            <div className="xpv-chain xpv-chain--inline" aria-label="Streak chain">
              {streakChain.map((link, index) => (
                <span key={link.id} className={`xpv-chain-link ${link.active ? 'active' : ''} ${link.current ? 'current' : ''}`}>
                  {index + 1}
                </span>
              ))}
            </div>
          </section>

          <section className="xpv-system-panel">
            <div className="xpv-topic-heading">
              <Shield size={17} />
              <h2>Power Ups</h2>
            </div>
            <div className="xpv-power-grid">
              {powerUps.map((power) => {
                const Icon = power.icon;
                return (
                  <button
                    key={power.id}
                    type="button"
                    className={`xpv-power ${power.charged ? 'charged' : ''}`}
                    onClick={() => handleUsePowerUp(power)}
                    disabled={power.disabled || powerUpLoading === power.id}
                    title={power.description}
                  >
                    <Icon size={18} />
                    <strong>{powerUpLoading === power.id ? '...' : power.value}</strong>
                    <span>{power.label}</span>
                  </button>
                );
              })}
            </div>
            {powerNotice && (
              <div className={`xpv-power-notice ${powerNotice.type}`}>
                {powerNotice.text}
              </div>
            )}
          </section>

          <section className="xpv-system-panel">
            <div className="xpv-topic-heading">
              <Package size={17} />
              <h2>Chest Inventory</h2>
            </div>
            <div className="xpv-chest-list">
              {chestInventory.map((chest) => (
                <button key={chest.id} type="button" className={`xpv-chest ${chest.state}`} onClick={() => setSelectedNode(chest)}>
                  <Gift size={17} />
                  <span>{chest.reward}</span>
                  {chest.state === 'mastered' ? <CheckCircle size={15} /> : <Lock size={15} />}
                </button>
              ))}
            </div>
          </section>

          <section className="xpv-system-panel">
            <div className="xpv-topic-heading">
              <Star size={17} />
              <h2>Next Rewards</h2>
            </div>
            <div className="xpv-reward-list">
              {nextRewards.length === 0 && <span className="xpv-muted">All rewards unlocked</span>}
              {nextRewards.map((reward) => (
                <div key={reward.id} className="xpv-reward-row">
                  <Gift size={15} />
                  <span>{reward.reward}</span>
                  <small>{reward.xp.toLocaleString()} XP</small>
                </div>
              ))}
            </div>
          </section>
        </section>

        <section className="xpv-season-band">
          <div className="xpv-topic-heading">
            <Award size={17} />
            <h2>Season Track</h2>
          </div>
          <div className="xpv-season-track">
            {seasonTrack.map((reward) => (
              <div key={reward.id} className={`xpv-season-step ${reward.unlocked ? 'unlocked' : ''}`}>
                <span>{reward.label}</span>
                <small>{reward.threshold.toLocaleString()} XP</small>
              </div>
            ))}
          </div>
        </section>

        <section className="xpv-topic-band">
          <div className="xpv-topic-heading">
            <BookOpen size={17} />
            <h2>Personalized Topic Arcs</h2>
          </div>
          <div className="xpv-topic-arcs">
            {topicArcs.length === 0 && (
              <div className="xpv-topic-empty">No topic arcs unlocked yet.</div>
            )}
            {topicArcs.map((arc) => (
              <div key={arc.topic} className="xpv-topic-arc">
                <div>
                  <strong>{arc.topic}</strong>
                  <span>{arc.category} / {arc.activityCount} signals</span>
                </div>
                <div className="xpv-topic-meter">
                  <span style={{ width: `${arc.progress}%` }} />
                </div>
                <small>{arc.completed}/{arc.total}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="xpv-badge-band">
          <div className="xpv-topic-heading">
            <Trophy size={17} />
            <h2>Badge Codex</h2>
          </div>
          <div className="xpv-badge-grid">
            {badgeCollection.map((badge) => {
              const Icon = badge.icon;
              return (
                <button
                  key={badge.id}
                  type="button"
                  className={`xpv-badge ${badge.state}`}
                  onClick={() => setSelectedNode(badge)}
                >
                  <Icon size={18} />
                  <span>{badge.title}</span>
                </button>
              );
            })}
          </div>
        </section>
        </main>
      </div>

      {xpBursts.map((burst) => (
        <span key={burst.id} className="xpv-xp-burst" style={{ left: burst.x, top: burst.y }}>
          +{Math.max(10, Math.round(burst.amount / 10))} XP
        </span>
      ))}

      {selectedNodeDetails && (
        <div className="xpv-drawer" role="dialog" aria-modal="false">
          <div className="xpv-drawer-head">
            <div>
              <span>{selectedNodeDetails.state}</span>
              <strong>{selectedNodeDetails.title}</strong>
            </div>
            <button type="button" onClick={() => setSelectedNode(null)}>x</button>
          </div>
          <div className="xpv-drawer-reward">
            <Gift size={18} />
            <span>{selectedNodeDetails.reward}</span>
            {selectedNodeDetails.delta > 0 && <small>{selectedNodeDetails.delta.toLocaleString()} XP left</small>}
          </div>
          <div className="xpv-drawer-lanes">
            {selectedNodeDetails.questSummary.map((lane) => (
              <div key={lane.id} className={lane.done ? 'done' : ''}>
                <span>{lane.label}</span>
                <strong>{lane.progress}%</strong>
              </div>
            ))}
          </div>
          <div className="xpv-drawer-recommendations">
            <span>{roadmapLoading ? 'Updating recommendations...' : 'Recommended topics'}</span>
            <div>
              {missionRecommendations.map((recommendation) => (
                <button
                  key={recommendation.topic}
                  type="button"
                  className={recommendation.topic === activeMissionTopic ? 'active' : ''}
                  onClick={() => setSelectedMissionTopic(recommendation.topic)}
                >
                  <strong>{recommendation.topic}</strong>
                  <small>{recommendation.reason}</small>
                </button>
              ))}
            </div>
          </div>
          <div className={`xpv-drawer-action-note ${missionNotice?.type || ''}`}>
            {missionNotice
              ? missionNotice.text
              : (selectedNodeDetails.state === 'locked' && nextNode
                ? `Locked. Continue from ${nextNode.title} with ${activeMissionTopic}.`
                : `${selectedMissionAction.label} using ${activeMissionTopic}.`)}
          </div>
          <button type="button" className="xpv-drawer-cta" onClick={handleContinueMission} disabled={missionLoading}>
            {missionLoading ? 'Creating...' : selectedCtaLabel}
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

export default XPRoadmap;
