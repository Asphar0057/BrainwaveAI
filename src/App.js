import React, { useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { NotificationProvider } from './contexts/NotificationContext';
import ProactiveNotification from './components/ProactiveNotification';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSpinner from './components/LoadingSpinner';
import GlobalNotifications from './components/GlobalNotifications';
import RateLimitHandler from './components/RateLimitHandler';
import Home from './pages/Home';
import { getChatDockState, listenChatDockUpdates } from './utils/chatDock';
import {
  formatUsageLimitMessage,
  installUsageLimitFetchInterceptor,
  listenUsageLimit,
} from './utils/usageLimit';
import './styles/ui-safety.css';
import './App.css';

// Pages are lazy-loaded so each route ships as its own chunk instead of
// inflating the initial bundle with ~60 page components up front.
const lazyRoute = (loader) => {
  const Component = lazy(loader);
  Component.preload = loader;
  return Component;
};

const DashboardCerbyl = lazyRoute(() => import('./pages/DashboardCerbyl'));
const AIChat = lazyRoute(() => import('./pages/AIChat'));
const Homepage = lazyRoute(() => import('./pages/Homepage'));
const LearningReviewHub = lazyRoute(() => import('./pages/LearningReviewHub'));
const Social = lazyRoute(() => import('./pages/Social'));
const SharedPage = lazyRoute(() => import('./pages/SharedPage'));
const FriendsDashboard = lazyRoute(() => import('./pages/FriendsDashboard'));
const ActivityFeed = lazyRoute(() => import('./pages/ActivityFeed'));
const Leaderboards = lazyRoute(() => import('./pages/Leaderboards'));
const QuizHub = lazyRoute(() => import('./pages/QuizHub'));
const QuizBattle = lazyRoute(() => import('./pages/QuizBattle'));
const QuizBattleSession = lazyRoute(() => import('./pages/QuizBattleSession'));
const SoloQuiz = lazyRoute(() => import('./pages/SoloQuiz'));
const SoloQuizSession = lazyRoute(() => import('./pages/SoloQuizSession'));
const SoloQuizReview = lazyRoute(() => import('./pages/SoloQuizReview'));
const Analytics = lazyRoute(() => import('./pages/Analytics'));
const ChallengeSession = lazyRoute(() => import('./pages/ChallengeSession'));
const Challenges = lazyRoute(() => import('./pages/Challenges'));
const KnowledgeMap = lazyRoute(() => import('./pages/KnowledgeMap'));
const ConceptWeb = lazyRoute(() => import('./pages/ConceptWeb'));
const QuestionBank = lazyRoute(() => import('./pages/Questionbankdashboard'));
const SlideExplorer = lazyRoute(() => import('./pages/SlideExplorer'));
const Statistics = lazyRoute(() => import('./pages/Statistics'));
const Flashcards = lazyRoute(() => import('./pages/Flashcards'));
const NotesRedesign = lazyRoute(() => import('./pages/NotesRedesign'));
const NotesHub = lazyRoute(() => import('./pages/NotesHub'));
const AudioVideoNotes = lazyRoute(() => import('./pages/AudioVideoNotes'));
const AIMediaNotes = lazyRoute(() => import('./pages/AIMediaNotes'));
const MyNotes = lazyRoute(() => import('./pages/MyNotes'));
const NotesPodcastMode = lazyRoute(() => import('./pages/NotesPodcastMode'));
const Login = lazyRoute(() => import('./pages/Login'));
const Register = lazyRoute(() => import('./pages/Register'));
const Profile = lazyRoute(() => import('./pages/ProfileNew'));
const UsageStats = lazyRoute(() => import('./pages/UsageStats'));
const ProfileQuiz = lazyRoute(() => import('./pages/ProfileQuiz'));
const SearchHub = lazyRoute(() => import('./pages/SearchHub'));
const StudyInsights = lazyRoute(() => import('./pages/StudyInsights'));
const Weaknesses = lazyRoute(() => import('./pages/Weaknesses'));
const WeaknessPractice = lazyRoute(() => import('./pages/WeaknessPractice'));
const WeaknessTips = lazyRoute(() => import('./pages/WeaknessTips'));
const SharedItemViewer = lazyRoute(() => import('./pages/SharedItemViewer'));
const PublicFlashcardView = lazyRoute(() => import('./pages/PublicFlashcardView'));
const PublicChatView = lazyRoute(() => import('./pages/PublicChatView'));
const NotesDashboard = lazyRoute(() => import('./pages/NotesDashboard'));
const ActivityTimeline = lazyRoute(() => import('./pages/ActivityTimeline'));
const CustomizeDashboard = lazyRoute(() => import('./pages/CustomizeDashboard'));
const Games = lazyRoute(() => import('./pages/Games'));
const PlaylistDetailPage = lazyRoute(() => import('./pages/PlaylistDetailPage'));
const PlaylistsPage = lazyRoute(() => import('./pages/PlaylistsPage'));
const XPRoadmap = lazyRoute(() => import('./pages/XPRoadmap'));
const LearningPaths = lazyRoute(() => import('./pages/LearningPaths'));
const LearningPathDetail = lazyRoute(() => import('./pages/LearningPathDetail'));
const AdminAnalytics = lazyRoute(() => import('./pages/AdminAnalytics'));
const AdminApiUsage = lazyRoute(() => import('./pages/AdminApiUsage'));
const AdminRateLimits = lazyRoute(() => import('./pages/AdminRateLimits'));
const CanvasHub = lazyRoute(() => import('./pages/CanvasHub'));
const Vault = lazyRoute(() => import('./pages/Vault'));
const ContextFileAnalysis = lazyRoute(() => import('./pages/ContextFileAnalysis'));
const AIChatDock = lazyRoute(() => import('./components/AIChatDock'));

const ROUTE_PRELOAD_ORDER = [
  DashboardCerbyl,
  SearchHub,
  AIChat,
  NotesHub,
  NotesRedesign,
  Flashcards,
  QuestionBank,
  KnowledgeMap,
  LearningPaths,
  ActivityTimeline,
  Social,
  QuizHub,
  SoloQuiz,
  Analytics,
  Profile,
  Vault,
  AIMediaNotes,
  SlideExplorer,
  Weaknesses,
  ConceptWeb,
  PlaylistsPage,
  Games,
  XPRoadmap,
  LearningReviewHub,
  FriendsDashboard,
  ActivityFeed,
  Leaderboards,
  QuizBattle,
  QuizBattleSession,
  SoloQuizSession,
  SoloQuizReview,
  ChallengeSession,
  Challenges,
  Statistics,
  AudioVideoNotes,
  MyNotes,
  NotesPodcastMode,
  ProfileQuiz,
  StudyInsights,
  WeaknessPractice,
  WeaknessTips,
  NotesDashboard,
  CustomizeDashboard,
  PlaylistDetailPage,
  LearningPathDetail,
  CanvasHub,
  ContextFileAnalysis,
  SharedPage,
  SharedItemViewer,
  PublicFlashcardView,
  PublicChatView,
];

const scheduleIdle = (callback) => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout: 2500 });
  }
  return window.setTimeout(callback, 900);
};

const cancelIdle = (handle) => {
  if (!handle) return;
  if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(handle);
    return;
  }
  window.clearTimeout(handle);
};

const routeWarmupCache = new Set();

function RouteWarmup() {
  const location = useLocation();

  useEffect(() => {
    if (!localStorage.getItem('token')) return undefined;

    let cancelled = false;
    let idleHandle = null;
    let index = 0;

    const warmNext = () => {
      if (cancelled || index >= ROUTE_PRELOAD_ORDER.length) return;
      const Component = ROUTE_PRELOAD_ORDER[index];
      index += 1;

      if (!Component?.preload || routeWarmupCache.has(Component)) {
        idleHandle = scheduleIdle(warmNext);
        return;
      }

      routeWarmupCache.add(Component);
      Promise.resolve(Component.preload())
        .catch(() => {})
        .finally(() => {
          if (!cancelled) idleHandle = scheduleIdle(warmNext);
        });
    };

    idleHandle = scheduleIdle(warmNext);

    return () => {
      cancelled = true;
      cancelIdle(idleHandle);
    };
  }, [location.pathname]);

  return null;
}

function AIChatDockMount() {
  const location = useLocation();
  const [dock, setDock] = useState(() => getChatDockState());

  useEffect(() => {
    const offCustom = listenChatDockUpdates((next) => setDock(next));
    const onStorage = (event) => {
      if (event.key === 'cerbyl.chatDock') {
        setDock(getChatDockState());
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      offCustom();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const token = localStorage.getItem('token');
  const hiddenRoutes = ['/ai-chat', '/login', '/register'];
  const shouldLoad =
    Boolean(token && dock?.enabled && dock?.chatId) &&
    !hiddenRoutes.some((prefix) => location.pathname.startsWith(prefix));

  if (!shouldLoad) return null;

  return (
    <Suspense fallback={null}>
      <AIChatDock />
    </Suspense>
  );
}

function App() {
  const [notification, setNotification] = useState(null);
  const [usageLimit, setUsageLimit] = useState(null);

  useEffect(() => {
    installUsageLimitFetchInterceptor();
    return listenUsageLimit((limit) => setUsageLimit(limit || {}));
  }, []);

  return (
    <ThemeProvider>
      <NotificationProvider>
        <ToastProvider>
          <RateLimitHandler />
          <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-top)', color: 'var(--text-primary)' }}>
            <RouteWarmup />
            <GlobalNotifications />
            <AIChatDockMount />
            {usageLimit && (
              <div className="usage-limit-popover" role="alert" aria-live="assertive">
                <div className="usage-limit-popover__panel">
                  <div className="usage-limit-popover__eyebrow">Usage limit reached</div>
                  <p>{formatUsageLimitMessage(usageLimit)}</p>
                  <button type="button" onClick={() => setUsageLimit(null)}>Got it</button>
                </div>
              </div>
            )}
            {notification && (
              <ProactiveNotification
                message={notification.message}
                chatId={notification.chatId}
                urgencyScore={notification.urgencyScore}
                onClose={() => setNotification(null)}
              />
            )}
            <ErrorBoundary>
              <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/search-hub" element={<ProtectedRoute><SearchHub /></ProtectedRoute>} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/homepage" element={<ProtectedRoute><Homepage /></ProtectedRoute>} />
                  <Route path="/profile-quiz" element={<ProtectedRoute><ProfileQuiz /></ProtectedRoute>} />
                  <Route path="/dashboard-cerbyl" element={<ProtectedRoute><DashboardCerbyl /></ProtectedRoute>} />
                  <Route path="/dashboard" element={<Navigate to="/dashboard-cerbyl" replace />} />
                  <Route path="/dashboard-classic" element={<Navigate to="/dashboard-cerbyl" replace />} />
                  <Route path="/study-insights" element={<ProtectedRoute><StudyInsights /></ProtectedRoute>} />
                  <Route path="/weaknesses" element={<ProtectedRoute><Weaknesses /></ProtectedRoute>} />
                  <Route path="/weakness-practice" element={<ProtectedRoute><WeaknessPractice /></ProtectedRoute>} />
                  <Route path="/practice/:id" element={<ProtectedRoute><WeaknessPractice /></ProtectedRoute>} />
                  <Route path="/weakness-tips/:topic" element={<ProtectedRoute><WeaknessTips /></ProtectedRoute>} />
                  <Route path="/ai-chat" element={<ProtectedRoute><AIChat /></ProtectedRoute>} />
                  <Route path="/ai-chat/:chatId?" element={<ProtectedRoute><AIChat /></ProtectedRoute>} />
                  <Route path="/learning-review" element={<ProtectedRoute><LearningReviewHub /></ProtectedRoute>} />
                  <Route path="/social" element={<ProtectedRoute><Social /></ProtectedRoute>} />
                  <Route path="/shared" element={<ProtectedRoute><SharedPage /></ProtectedRoute>} />
                  <Route path="/shared/:contentType/:contentId" element={<SharedItemViewer />} />
                  <Route path="/shared/chat/:chatId" element={<AIChat sharedMode={true} />} />
                  <Route path="/shared/note/:noteId" element={<NotesRedesign sharedMode={true} />} />
                  <Route path="/flashcards/share/:token" element={<PublicFlashcardView />} />
                  <Route path="/chat/share/:token" element={<PublicChatView />} />
                  <Route path="/playlists" element={<ProtectedRoute><PlaylistsPage /></ProtectedRoute>} />
                  <Route path="/playlists/:playlistId" element={<ProtectedRoute><PlaylistDetailPage /></ProtectedRoute>} />
                  <Route path="/friends" element={<ProtectedRoute><FriendsDashboard /></ProtectedRoute>} />
                  <Route path="/activity-feed" element={<ProtectedRoute><ActivityFeed /></ProtectedRoute>} />
                  <Route path="/leaderboards" element={<ProtectedRoute><Leaderboards /></ProtectedRoute>} />
                  <Route path="/quiz-hub" element={<ProtectedRoute><QuizHub /></ProtectedRoute>} />
                  <Route path="/quiz-battles" element={<ProtectedRoute><QuizBattle /></ProtectedRoute>} />
                  <Route path="/quiz-battle/:battleId" element={<ProtectedRoute><QuizBattleSession /></ProtectedRoute>} />
                  <Route path="/solo-quiz" element={<ProtectedRoute><SoloQuiz /></ProtectedRoute>} />
                  <Route path="/solo-quiz/session" element={<ProtectedRoute><SoloQuizSession /></ProtectedRoute>} />
                  <Route path="/solo-quiz/review" element={<ProtectedRoute><SoloQuizReview /></ProtectedRoute>} />
                  <Route path="/solo-quiz/review/:quizId" element={<ProtectedRoute><SoloQuizReview /></ProtectedRoute>} />
                  <Route path="/solo-quiz/:quizId" element={<ProtectedRoute><SoloQuizSession /></ProtectedRoute>} />
                  <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
                  <Route path="/games" element={<ProtectedRoute><Games /></ProtectedRoute>} />
                  <Route path="/xp-roadmap" element={<ProtectedRoute><XPRoadmap /></ProtectedRoute>} />
                  <Route path="/challenges" element={<ProtectedRoute><Challenges /></ProtectedRoute>} />
                  <Route path="/challenge/:challengeId" element={<ProtectedRoute><ChallengeSession /></ProtectedRoute>} />
                  <Route path="/knowledge-map" element={<ProtectedRoute><KnowledgeMap /></ProtectedRoute>} />
                  <Route path="/knowledge-map/:mapId" element={<ProtectedRoute><KnowledgeMap /></ProtectedRoute>} />
                  <Route path="/knowledge-roadmap" element={<ProtectedRoute><KnowledgeMap /></ProtectedRoute>} />
                  <Route path="/knowledge-roadmap/:roadmapId" element={<ProtectedRoute><KnowledgeMap /></ProtectedRoute>} />
                  <Route path="/concept-web" element={<ProtectedRoute><ConceptWeb /></ProtectedRoute>} />
                  <Route path="/learning-paths" element={<ProtectedRoute><LearningPaths /></ProtectedRoute>} />
                  <Route path="/learning-paths/:pathId" element={<ProtectedRoute><LearningPathDetail /></ProtectedRoute>} />
                  <Route path="/question-bank" element={<ProtectedRoute><QuestionBank /></ProtectedRoute>} />
                  <Route path="/slide-explorer" element={<ProtectedRoute><SlideExplorer /></ProtectedRoute>} />
                  <Route path="/statistics" element={<ProtectedRoute><Statistics /></ProtectedRoute>} />
                  <Route path="/flashcards" element={<ProtectedRoute><Flashcards /></ProtectedRoute>} />
                  <Route path="/notes" element={<ProtectedRoute><NotesHub /></ProtectedRoute>} />
                  <Route path="/notes/dashboard" element={<ProtectedRoute><NotesDashboard /></ProtectedRoute>} />
                  <Route path="/notes/audio-video" element={<ProtectedRoute><AudioVideoNotes /></ProtectedRoute>} />
                  <Route path="/notes/ai-media" element={<ProtectedRoute><AIMediaNotes /></ProtectedRoute>} />
                  <Route path="/notes/ai-media/my-notes" element={<ProtectedRoute><AIMediaNotes /></ProtectedRoute>} />
                  <Route path="/notes/ai-media/:noteId" element={<ProtectedRoute><AIMediaNotes /></ProtectedRoute>} />
                  <Route path="/notes/my-notes" element={<ProtectedRoute><MyNotes /></ProtectedRoute>} />
                  <Route path="/notes/podcast" element={<ProtectedRoute><NotesPodcastMode /></ProtectedRoute>} />
                  <Route path="/notes/editor/:noteId" element={<ProtectedRoute><NotesRedesign /></ProtectedRoute>} />
                  <Route path="/activity-timeline" element={<ProtectedRoute><ActivityTimeline /></ProtectedRoute>} />
                  <Route path="/customize-dashboard" element={<ProtectedRoute><CustomizeDashboard /></ProtectedRoute>} />
                  <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                  <Route path="/profile/usage" element={<ProtectedRoute><UsageStats /></ProtectedRoute>} />
                  <Route path="/admin/analytics" element={<ProtectedRoute><AdminAnalytics /></ProtectedRoute>} />
                  <Route path="/admin/api-usage" element={<ProtectedRoute><AdminApiUsage /></ProtectedRoute>} />
                  <Route path="/admin/rate-limits" element={<ProtectedRoute><AdminRateLimits /></ProtectedRoute>} />
                  <Route path="/admin/api_usage" element={<Navigate to="/admin/api-usage" replace />} />
                  <Route path="/api-usage" element={<Navigate to="/admin/api-usage" replace />} />
                  <Route path="/api_usage" element={<Navigate to="/admin/api-usage" replace />} />
                  <Route path="/contexthub" element={<ProtectedRoute><Vault /></ProtectedRoute>} />
                  <Route path="/contexthub/file/:docId" element={<ProtectedRoute><ContextFileAnalysis /></ProtectedRoute>} />
                  <Route path="/context" element={<Navigate to="/contexthub" replace />} />
                  <Route path="/vault" element={<Navigate to="/contexthub" replace />} />
                  <Route path="/canvas" element={<ProtectedRoute><CanvasHub /></ProtectedRoute>} />
                  <Route path="/home" element={<Navigate to="/dashboard-cerbyl" replace />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </div>
        </ToastProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App;
