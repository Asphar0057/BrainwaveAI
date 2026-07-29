import { LEARN_DESTINATION_KEY, WORKSPACE_KEY } from './workspace';
import { clearAccountSession } from './institutionSession';

export const ACCOUNT_LOCAL_STORAGE_KEYS = [
  'token',
  'username',
  'userProfile',
  'user_id',
  'email',
  'cerbyl.defaultPfp',
  'cerbyl.customPfp',
  'cerbyl.displayName',
  'cerbyl.chatDock',
  'active_context',
  'hs_mode_enabled',
  'ctx_selected_doc_ids',
  'context_history',
  'ctx_file_action_stats',
  'currentDashboardLayout',
  'currentLayoutName',
  'dashboardLayouts',
  'customTemplates',
  'customTheme',
  'themeProfile',
  'preferredFont',
  'searchHistory',
  'flashcardStreak',
  'lastFlashcardStudy',
  WORKSPACE_KEY,
  LEARN_DESTINATION_KEY,
];

export const ACCOUNT_SESSION_STORAGE_KEYS = [
  'justLoggedIn',
  'safetyAccepted',
  'quizData',
  'lastQuizResults',
  'cb_intro_seen',
  'isFirstTimeUser',
  'justCompletedOnboarding',
  'trial_active',
];

export const clearBackendSession = () => {
  ACCOUNT_LOCAL_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  ACCOUNT_SESSION_STORAGE_KEYS.forEach((key) => sessionStorage.removeItem(key));
  clearAccountSession();
};
