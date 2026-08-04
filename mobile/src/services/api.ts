import AsyncStorage from '@react-native-async-storage/async-storage';

const PRODUCTION_API_URL = 'https://cerbyl-api.yellowwave-ef452238.eastus.azurecontainerapps.io/api';

function normalizeApiUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return PRODUCTION_API_URL;
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

export const API_URL = normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL ?? PRODUCTION_API_URL);

// Public web app origin (for building shareable /chat/share/:token, /flashcards/share/:token links) —
// matches backend's ALLOWED_ORIGINS default in main.py, not the API host.
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://cerbyl.com').replace(/\/+$/, '');

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('token');
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readApiError(res: Response, fallback: string): Promise<never> {
  let detail = fallback;
  try {
    const data = await res.json();
    detail = data?.detail || data?.message || fallback;
  } catch {
    // ignore JSON parse failures and use fallback
  }
  throw new Error(detail);
}

// ── Auth ─────────────────────────────────────────────────────────────
export async function login(username: string, password: string) {
  const body = new URLSearchParams({ username, password, grant_type: 'password' });
  const res = await fetch(`${API_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) await readApiError(res, 'Invalid credentials');
  return res.json(); // { access_token, token_type }
}

export async function getMe() {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/me`, { headers });
  if (!res.ok) await readApiError(res, 'Unauthorized');
  return res.json(); // { username, email, first_name, ... }
}

export async function changeUsername(newUsername: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/account/change_username`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_username: newUsername }),
  });
  if (!res.ok) await readApiError(res, 'Could not update username');
  return res.json(); // { username, access_token, token_type }
}

export async function changePassword(currentPassword: string | null, newPassword: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/account/change_password`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!res.ok) await readApiError(res, 'Could not update password');
  return res.json();
}

// ── Onboarding / Comprehensive Profile ──────────────────────────────────
export type ProfileQuizStatus = { completed: boolean; quiz_completed: boolean; quiz_skipped: boolean };

export async function checkProfileQuiz(userId: string): Promise<ProfileQuizStatus> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/check_profile_quiz?user_id=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) return { completed: false, quiz_completed: false, quiz_skipped: false };
  return res.json();
}

export type ComprehensiveProfile = {
  fieldOfStudy: string;
  brainwaveGoal: string;
  preferredSubjects: string[];
  primaryArchetype: string;
  secondaryArchetype: string;
  archetypeDescription: string;
  quizCompleted: boolean;
  quizSkipped: boolean;
  notificationsEnabled?: boolean;
};

export async function getComprehensiveProfile(userId: string): Promise<ComprehensiveProfile> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_comprehensive_profile?user_id=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) await readApiError(res, 'Could not load profile');
  return res.json();
}

export async function updateComprehensiveProfile(userId: string, patch: Record<string, unknown>) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/update_comprehensive_profile`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, ...patch }),
  });
  if (!res.ok) await readApiError(res, 'Could not update profile');
  return res.json();
}

export type SaveCompleteProfilePayload = {
  user_id: string;
  learning_stage?: string;
  preferred_subjects?: string[];
  main_subject?: string;
  brainwave_goal?: string;
  learning_preferences?: Record<string, string[]>;
  quiz_completed: boolean;
  quiz_skipped: boolean;
};

export async function saveCompleteProfile(payload: SaveCompleteProfilePayload) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/save_complete_profile`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await readApiError(res, 'Could not save profile');
  return res.json();
}

export async function setWeeklyGoals(userId: string, goals: { chat: number; note: number; flashcard: number; quiz: number }) {
  const headers = await authHeaders();
  const params = new URLSearchParams({
    user_id: userId,
    chat_goal: String(goals.chat),
    note_goal: String(goals.note),
    flashcard_goal: String(goals.flashcard),
    quiz_goal: String(goals.quiz),
  });
  const res = await fetch(`${API_URL}/set_weekly_goals?${params.toString()}`, { method: 'POST', headers });
  if (!res.ok) await readApiError(res, 'Could not save weekly goals');
  return res.json();
}

// ── Stats ─────────────────────────────────────────────────────────────
export async function getEnhancedStats(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(
    `${API_URL}/get_enhanced_user_stats?user_id=${encodeURIComponent(userId)}&tz=${encodeURIComponent(deviceTimeZone())}`,
    { headers }
  );
  return res.json(); // { streak, hours, totalChatSessions, totalFlashcards, totalNotes, todayMinutes, ... }
}

export async function getWeeklyBingo(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_weekly_bingo_stats?user_id=${encodeURIComponent(userId)}`, { headers });
  return res.json();
}

export type EarnedAchievement = {
  id: number;
  name: string;
  description: string;
  icon: string;
  points: number;
  category: string;
  rarity: string;
  earned_at: string;
};

export async function getUserAchievements(userId: string): Promise<{ achievements: EarnedAchievement[]; total_points: number }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_user_achievements?user_id=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) return { achievements: [], total_points: 0 };
  return res.json();
}

export type MissedAchievement = { id: number; name: string; description: string; icon: string; points: number };

export async function getMissedAchievements(userId: string): Promise<{ missed_achievements: MissedAchievement[] }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/check_missed_achievements?user_id=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) return { missed_achievements: [] };
  return res.json();
}

export type DailyChallenge = {
  challenge: { id: number; title: string; description: string; target: number; type: string; reward: number; icon: string };
  progress: number;
};

export async function getDashboardData(userId: string): Promise<{
  status: string;
  gamification: Record<string, any>;
  daily_metrics: { questions_answered: number; time_spent_minutes: number; accuracy_rate: number };
  streak: number;
  daily_challenge: DailyChallenge;
}> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_dashboard_data?user_id=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) await readApiError(res, 'Failed to load dashboard data');
  return res.json();
}

export type XpPoint = { date: string; label: string; xp: number };
export type XpSource = { label: string; xp: number; count: number; percent: number };
export type XpHistory = {
  period: 'week' | 'month' | 'year';
  total_xp: number;
  delta_percent: number;
  points: XpPoint[];
  by_source: XpSource[];
};

export async function getXpHistory(userId: string, period: 'week' | 'month' | 'year' = 'week'): Promise<XpHistory> {
  const headers = await authHeaders();
  const res = await fetch(
    `${API_URL}/analytics/xp_history?user_id=${encodeURIComponent(userId)}&period=${period}`,
    { headers }
  );
  return res.json();
}

// ── Session time tracking ─────────────────────────────────────────────
function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export async function startSession(userId: string, sessionType = 'mobile_app') {
  const headers = await authHeaders();
  const body = new URLSearchParams({ user_id: userId, session_type: sessionType, tz: deviceTimeZone() });
  const res = await fetch(`${API_URL}/analytics/start_session`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  return res.json(); // { session_id, start_time }
}

export async function endSession(userId: string, sessionId: string, timeSpentMinutes: number, sessionType = 'mobile_app') {
  const headers = await authHeaders();
  const body = new URLSearchParams({
    user_id: userId,
    session_id: sessionId,
    time_spent_minutes: String(timeSpentMinutes),
    session_type: sessionType,
    tz: deviceTimeZone(),
  });
  const res = await fetch(`${API_URL}/analytics/end_session`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  return res.json();
}

// ── Chat ─────────────────────────────────────────────────────────────
export async function getConversationStarters(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/conversation_starters?user_id=${encodeURIComponent(userId)}`, { headers });
  return res.json(); // { starters: string[] }
}

export async function createChatSession(userId: string, title = 'New Chat') {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/create_chat_session`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, title }),
  });
  return res.json(); // { id, title, ... }
}

export async function askAI(
  userId: string,
  question: string,
  chatId?: number,
  useHsContext: boolean = false,
  docIds: string[] = []
) {
  const headers = await authHeaders();
  const body = new URLSearchParams({
    user_id: userId,
    question,
    use_hs_context: String(useHsContext),
    ...(chatId ? { chat_id: String(chatId) } : {}),
    ...(docIds.length ? { context_doc_ids: docIds.join(',') } : {}),
  });
  const res = await fetch(`${API_URL}/ask/`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  return res.json(); // { response, chat_id, ... }
}

export async function askAIWithFile(
  userId: string,
  question: string,
  file: { uri: string; name: string; type: string },
  chatId?: number,
  useHsContext: boolean = false,
  docIds: string[] = []
) {
  const headers = await authHeaders();
  const body = new FormData();
  body.append('user_id', userId);
  body.append('question', question);
  body.append('use_hs_context', String(useHsContext));
  if (chatId) body.append('chat_id', String(chatId));
  if (docIds.length) body.append('context_doc_ids', docIds.join(','));
  body.append('files', { uri: file.uri, name: file.name, type: file.type } as any);

  const res = await fetch(`${API_URL}/ask_with_files/`, {
    method: 'POST',
    headers,
    body,
  });
  return res.json(); // { answer, chat_id, ... }
}

export type PersonalizedPrompt = { text: string; reason: string; priority: 'high' | 'medium' | 'low' };

export async function getPersonalizedPrompts(): Promise<{ prompts: PersonalizedPrompt[] }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_personalized_prompts`, { method: 'POST', headers });
  if (!res.ok) return { prompts: [] };
  return res.json();
}

export async function getSearchHubSuggestions(userId: string, query = '') {
  const headers = await authHeaders();
  const res = await fetch(
    `${API_URL}/agents/searchhub/suggestions?query=${encodeURIComponent(query)}&user_id=${encodeURIComponent(userId)}`,
    { headers }
  );
  if (!res.ok) {
    await readApiError(res, 'Failed to load suggestions');
  }
  return res.json() as Promise<{ success: boolean; suggestions: string[] }>;
}

export async function runSearchHubCommand(payload: {
  userId: string;
  query: string;
  sessionId?: string;
  context?: Record<string, any>;
  useHsContext?: boolean;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/agents/searchhub`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: payload.userId,
      query: payload.query,
      session_id: payload.sessionId,
      context: payload.context ?? {},
      use_hs_context: payload.useHsContext ?? true,
    }),
  });
  if (!res.ok) {
    await readApiError(res, 'SearchHub command failed');
  }
  return res.json();
}

export async function getSearchHubCommands() {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/agents/searchhub/commands`, { headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to load commands');
  }
  return res.json() as Promise<{ success: boolean; commands: Array<{ command: string; description: string }> }>;
}

// ── Question Bank ─────────────────────────────────────────────────────
export type QuestionSetSummary = {
  id: number;
  title: string;
  description?: string | null;
  question_count?: number;
  total_questions?: number;
  best_score?: number;
  attempt_count?: number;
  status?: string;
  created_at?: string;
};

export type PracticeQuestion = {
  id: number;
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'short_answer' | 'fill_blank' | string;
  correct_answer?: string;
  options?: string[];
  difficulty?: string;
  explanation?: string;
  topic?: string;
};

export async function getQuestionSets(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/qb/get_question_sets?user_id=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to load question sets');
  }
  return res.json() as Promise<{ question_sets: QuestionSetSummary[] }>;
}

export async function getQuestionSet(questionSetId: number, userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/qb/get_question_set/${questionSetId}?user_id=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to load questions');
  }
  return res.json() as Promise<QuestionSetSummary & { questions: PracticeQuestion[] }>;
}

export async function generatePracticeQuestions(payload: {
  userId: string;
  topic: string;
  questionCount?: number;
  difficulty?: string;
  questionTypes?: string[];
  title?: string;
  contextDocIds?: string[];
  useHsContext?: boolean;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/generate_practice_questions`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: payload.userId,
      topic: payload.topic,
      title: payload.title ?? `Practice: ${payload.topic}`,
      question_count: payload.questionCount ?? 10,
      difficulty: payload.difficulty ?? 'mixed',
      question_types: payload.questionTypes ?? ['multiple_choice', 'true_false', 'short_answer'],
      context_doc_ids: payload.contextDocIds ?? [],
      use_hs_context: payload.useHsContext ?? true,
    }),
  });
  if (!res.ok) {
    await readApiError(res, 'Failed to generate questions');
  }
  return res.json() as Promise<{ question_set_id: number; id: number; title: string; question_count: number; questions: PracticeQuestion[] }>;
}

export async function submitQuestionAnswers(userId: string, questionSetId: number, answers: Record<string, string>) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/qb/submit_answers`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, question_set_id: questionSetId, answers }),
  });
  if (!res.ok) {
    await readApiError(res, 'Failed to submit answers');
  }
  return res.json() as Promise<{
    status: string;
    score: number;
    correct_count: number;
    total_questions: number;
    details: Array<{ question_id: number; user_answer: string; correct_answer: string; is_correct: boolean; explanation?: string }>;
  }>;
}

export async function deleteQuestionSet(questionSetId: number, userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/qb/delete_question_set/${questionSetId}?user_id=${encodeURIComponent(userId)}`, { method: 'DELETE', headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to delete question set');
  }
  return res.json();
}

// ── Knowledge Maps / Roadmaps ─────────────────────────────────────────
export type KnowledgeRoadmap = {
  id: number;
  title: string;
  root_topic: string;
  total_nodes?: number;
  max_depth_reached?: number;
  status?: string;
  created_at?: string;
  last_accessed?: string | null;
};

export type KnowledgeNode = {
  id: number;
  parent_id?: number | null;
  topic_name: string;
  description?: string;
  depth_level?: number;
  ai_explanation?: string;
  key_concepts?: string[];
  why_important?: string;
  real_world_examples?: string[];
  learning_tips?: string;
  is_explored?: boolean;
  exploration_count?: number;
  expansion_status?: string;
  has_generated_subtopics?: boolean;
  user_notes?: string;
  position?: { x?: number; y?: number };
  created_at?: string;
};

export type KnowledgeRoadmapDetail = {
  roadmap: KnowledgeRoadmap;
  nodes_flat: KnowledgeNode[];
  expanded_nodes: number[];
};

export async function getKnowledgeRoadmaps(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_user_roadmaps?user_id=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to load knowledge maps');
  }
  return res.json() as Promise<{ status: string; roadmaps: KnowledgeRoadmap[] }>;
}

export async function createKnowledgeRoadmap(userId: string, rootTopic: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/create_knowledge_roadmap`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, root_topic: rootTopic }),
  });
  if (!res.ok) {
    await readApiError(res, 'Failed to create knowledge map');
  }
  return res.json() as Promise<{ status: string; roadmap_id: number; root_node_id: number; total_nodes: number }>;
}

export async function createKnowledgeRoadmapFromDocs(userId: string, contextDocIds: string[], title?: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/create_roadmap_from_context_docs`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, context_doc_ids: contextDocIds, title }),
  });
  if (!res.ok) {
    await readApiError(res, 'Failed to create knowledge map from sources');
  }
  return res.json() as Promise<{ status: string; roadmap_id?: number; root_node_id?: number; root_topic?: string; title?: string }>;
}

export async function getKnowledgeRoadmap(roadmapId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_knowledge_roadmap/${roadmapId}`, { headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to load knowledge map');
  }
  return res.json() as Promise<KnowledgeRoadmapDetail>;
}

export async function expandKnowledgeNode(nodeId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/expand_knowledge_node/${nodeId}`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    await readApiError(res, 'Failed to expand node');
  }
  return res.json() as Promise<{ status: string; message?: string; child_nodes?: KnowledgeNode[] }>;
}

export async function exploreKnowledgeNode(nodeId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/explore_node/${nodeId}`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    await readApiError(res, 'Failed to explore knowledge node');
  }
  return res.json() as Promise<{ status?: string; node?: KnowledgeNode } & Partial<KnowledgeNode>>;
}

export async function saveKnowledgeNodeNotes(nodeId: number, notes: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/save_node_notes/${nodeId}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    await readApiError(res, 'Failed to save node notes');
  }
  return res.json();
}

export async function addManualKnowledgeNode(payload: {
  roadmapId: number;
  parentId: number;
  topicName: string;
  description?: string;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/add_manual_node`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roadmap_id: payload.roadmapId,
      parent_id: payload.parentId,
      topic_name: payload.topicName,
      description: payload.description || '',
    }),
  });
  if (!res.ok) {
    await readApiError(res, 'Failed to add node');
  }
  return res.json() as Promise<{ status: string; node: KnowledgeNode }>;
}

export async function deleteKnowledgeNode(nodeId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/delete_roadmap_node/${nodeId}`, { method: 'DELETE', headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to delete node');
  }
  return res.json();
}

export async function deleteKnowledgeRoadmap(roadmapId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/delete_roadmap/${roadmapId}`, { method: 'DELETE', headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to delete knowledge map');
  }
  return res.json();
}

// ── Slide Explorer ───────────────────────────────────────────────────
export type UploadedSlide = {
  id: number;
  title?: string;
  filename: string;
  file_size?: number;
  file_type?: string;
  page_count?: number;
  created_at?: string;
  uploaded_at?: string;
  preview_url?: string | null;
  processing_status?: string;
};

export type SlideAnalysisPage = {
  slide_number: number;
  title?: string;
  content?: string;
  summary?: string;
  explanation?: string;
  detailed_explanation?: string;
  key_points?: string[];
  key_concepts?: string[];
  insights?: string[];
  visual_description?: string;
  definitions?: Record<string, string>;
  exam_questions?: Array<{
    question: string;
    type?: string;
    difficulty?: 'easy' | 'medium' | 'hard' | string;
    answer_hint?: string;
  }>;
  practical_applications?: string[];
  common_misconceptions?: string[];
  study_tips?: string[];
  cross_references?: string[];
  difficulty_level?: string;
  estimated_study_time?: string;
};

export type SlidePresentationSummary = {
  total_concepts?: number;
  total_exam_questions?: number;
  difficulty_distribution?: Record<string, number>;
  estimated_total_study_time?: string;
  recommended_review_sessions?: number;
};

export type SlideAnalysis = {
  status: string;
  filename: string;
  total_slides: number;
  presentation_summary?: SlidePresentationSummary | string;
  slides: SlideAnalysisPage[];
  analyzed_at?: string;
};

export async function getUploadedSlides(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_uploaded_slides?user_id=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to load slides');
  }
  return res.json() as Promise<{ slides: UploadedSlide[] }>;
}

export async function uploadSlides(files: Array<{ uri: string; name: string; mimeType?: string | null }>) {
  const headers = await authHeaders();
  const body = new FormData();
  files.forEach((file) => {
    body.append('files', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || 'application/octet-stream',
    } as any);
  });
  const res = await fetch(`${API_URL}/upload_slides`, {
    method: 'POST',
    headers,
    body,
  });
  if (!res.ok) {
    await readApiError(res, 'Failed to upload slides');
  }
  return res.json() as Promise<{ status: string; uploaded_count: number; message: string }>;
}

export async function analyzeSlide(slideId: number, forceReanalyze = false) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/analyze_slide/${slideId}?force_reanalyze=${forceReanalyze}`, { headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to analyze slides');
  }
  return res.json() as Promise<SlideAnalysis>;
}

export async function getSlideImageSource(slideId: number, pageNumber: number) {
  const headers = await authHeaders();
  return {
    uri: `${API_URL}/slide_image/${slideId}/${pageNumber}`,
    headers,
  };
}

export async function deleteSlide(slideId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/delete_slide/${slideId}`, { method: 'DELETE', headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to delete slides');
  }
  return res.json();
}

export async function generateQuestionsFromSlides(payload: {
  userId: string;
  slideIds: number[];
  questionCount?: number;
  difficultyMix?: { easy?: number; medium?: number; hard?: number };
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/generate_questions`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: payload.userId,
      slide_ids: payload.slideIds,
      question_count: payload.questionCount ?? 10,
      difficulty_mix: payload.difficultyMix ?? { easy: 3, medium: 5, hard: 2 },
    }),
  });
  if (!res.ok) {
    await readApiError(res, 'Failed to generate slide questions');
  }
  return res.json() as Promise<{ status: string; question_set_id: number; id?: number; question_count: number }>;
}

export async function getPersonalizedXPRoadmap(userId: string, forceRefresh = false) {
  const headers = await authHeaders();
  const res = await fetch(
    `${API_URL}/xp_roadmap/personalized?user_id=${encodeURIComponent(userId)}&include_stats=true&force_refresh=${forceRefresh}`,
    { headers }
  );
  if (!res.ok) {
    await readApiError(res, 'Failed to load XP roadmap');
  }
  return res.json();
}

export type ConceptNode = {
  id: number;
  concept_name: string;
  description?: string;
  category?: string;
  importance_score?: number;
  mastery_level?: number;
  notes_count?: number;
  quizzes_count?: number;
  flashcards_count?: number;
};

export type ConceptConnection = {
  id: number;
  source_id: number;
  target_id: number;
  connection_type?: string;
  strength?: number;
};

export async function getConceptWeb(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_concept_web?user_id=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to load concept web');
  }
  return res.json() as Promise<{ nodes: ConceptNode[]; connections: ConceptConnection[] }>;
}

export async function generateConceptWeb(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/generate_concept_web`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) {
    await readApiError(res, 'Failed to generate concept web');
  }
  return res.json();
}

export async function addConceptNode(payload: { userId: string; conceptName: string; description?: string; category?: string }) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/add_concept_node`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: payload.userId,
      concept_name: payload.conceptName,
      description: payload.description ?? '',
      category: payload.category ?? 'General',
    }),
  });
  if (!res.ok) {
    await readApiError(res, 'Failed to add concept');
  }
  return res.json();
}

export async function generateConceptAsset(userId: string, conceptId: number, asset: 'notes' | 'flashcards' | 'quiz') {
  const headers = await authHeaders();
  const endpoint =
    asset === 'notes'
      ? 'generate_concept_notes'
      : asset === 'flashcards'
        ? 'generate_concept_flashcards'
        : 'generate_concept_quiz';
  const res = await fetch(`${API_URL}/${endpoint}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, concept_id: conceptId }),
  });
  if (!res.ok) {
    await readApiError(res, `Failed to generate concept ${asset}`);
  }
  return res.json();
}

export async function createNoteFromContextDocs(payload: {
  userId: string;
  contextDocIds: string[];
  title?: string;
  topic?: string;
  depth?: string;
  tone?: string;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/create_note_from_context_docs`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: payload.userId,
      context_doc_ids: payload.contextDocIds,
      title: payload.title,
      topic: payload.topic,
      depth: payload.depth ?? 'deep',
      tone: payload.tone ?? 'professional',
    }),
  });
  if (!res.ok) {
    await readApiError(res, 'Failed to create note from selected sources');
  }
  return res.json() as Promise<{ status?: string; note_id?: number; id?: number; title?: string }>;
}

export type LearningReview = {
  id: number;
  title: string;
  status?: string;
  total_points?: number;
  best_score?: number;
  attempt_count?: number;
  current_attempt?: number;
  created_at?: string;
  completed_at?: string | null;
  can_continue?: boolean;
};

export async function getLearningReviews(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_learning_reviews?user_id=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to load learning reviews');
  }
  return res.json() as Promise<{ reviews: LearningReview[] }>;
}

export async function submitLearningReviewResponse(reviewId: number, responseText: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/submit_review_response`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ review_id: reviewId, response_text: responseText }),
  });
  if (!res.ok) {
    await readApiError(res, 'Failed to submit review response');
  }
  return res.json();
}

// ── Analytics / Weaknesses ────────────────────────────────────────────
export async function getLearningAnalytics(userId: string, period = 'week') {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_learning_analytics?user_id=${encodeURIComponent(userId)}&period=${encodeURIComponent(period)}`, { headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to load learning analytics');
  }
  return res.json();
}

export async function getStrengthsWeaknesses(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/study_insights/strengths_weaknesses?user_id=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to load strengths and weaknesses');
  }
  return res.json();
}

export async function getWeaknessAnalysis(userId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/weakness-practice/analysis?user_id=${encodeURIComponent(String(userId))}`, { headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to load weakness analysis');
  }
  return res.json();
}

// ── RL / bandit observability + live BKT recommendations ────────────────
export type RLStrategyStat = {
  strategy_id: string;
  total_pulls: number;
  avg_reward: number;
  win_rate: number;
  best_states: string[];
  worst_states: string[];
};
export type RLPolicyRow = { state_description: string; best_strategy: string; confidence: number; pulls: number };
export type RLStrategyPerformance = {
  strategy_stats: RLStrategyStat[];
  top_policy: RLPolicyRow[];
  learning_curve: { avg_reward_by_week: { week: string; avg_reward: number }[]; exploration_rate: number };
  overall_stats: {
    total_interactions_with_rl: number;
    avg_reward_all_time: number;
    most_used_strategy: string;
    most_effective_strategy: string;
    improvement_vs_rules: number;
    selection_method_breakdown: Record<string, number>;
  };
};

export async function getRlStrategyPerformance(userId: string): Promise<RLStrategyPerformance> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/intelligence/rl/strategy-performance/${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) await readApiError(res, 'Failed to load learning insights');
  return res.json();
}

export type WeaknessRecommendation = {
  concept_id: string;
  concept_name: string;
  p_mastery: number;
  priority_score: number;
  estimated_time_minutes: number;
  recommended_resource: 'ask_tutor' | 'review_flashcards' | 'try_a_quiz';
  trend_label: 'improving' | 'declining' | 'stable';
};

export async function getWeaknessRecommendations(userId: string): Promise<{ recommendations: WeaknessRecommendation[] }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/intelligence/weakness/recommendations?user_id=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) return { recommendations: [] };
  return res.json();
}

export async function getMasteryOverview(userId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/weakness-practice/mastery-overview?user_id=${encodeURIComponent(String(userId))}`, { headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to load topics hub');
  }
  return res.json();
}

// ── Social ────────────────────────────────────────────────────────────
export async function getFriends(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/friends?user_id=${encodeURIComponent(userId)}`, { headers });
  return res.json();
}

export async function getFriendRequests(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/friend_requests?user_id=${encodeURIComponent(userId)}`, { headers });
  return res.json(); // { received: [], sent: [] }
}

export async function getFriendActivityFeed(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/friend_activity_feed?user_id=${encodeURIComponent(userId)}`, { headers });
  return res.json();
}

// ── Notifications ─────────────────────────────────────────────────────
export type AppNotification = {
  id: number;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  created_at: string;
};

export async function getNotifications(userId: string, limit = 50): Promise<{ notifications: AppNotification[] }> {
  const headers = await authHeaders();
  const res = await fetch(
    `${API_URL}/get_notifications?user_id=${encodeURIComponent(userId)}&timezone_offset=${new Date().getTimezoneOffset()}&limit=${limit}`,
    { headers }
  );
  if (!res.ok) return { notifications: [] };
  return res.json();
}

export async function markNotificationRead(notificationId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/mark_notification_read/${notificationId}`, { method: 'PUT', headers });
  return res.json();
}

export async function markAllNotificationsRead(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/mark_all_notifications_read?user_id=${encodeURIComponent(userId)}`, { method: 'PUT', headers });
  return res.json();
}

export async function deleteNotification(notificationId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/delete_notification/${notificationId}`, { method: 'DELETE', headers });
  return res.json();
}

// ── Sharing ───────────────────────────────────────────────────────────
export type SharedItem = {
  id: number;
  content_type: 'note' | 'chat';
  content_id: number;
  title: string;
  permission: string;
  message: string | null;
  shared_at: string | null;
  shared_by: { id: number; username: string; first_name: string; last_name: string; picture_url: string };
};

export async function shareContent(payload: {
  contentType: 'note' | 'chat';
  contentId: number;
  friendIds: number[];
  message?: string;
  permission?: 'view' | 'edit';
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/share_content`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content_type: payload.contentType,
      content_id: payload.contentId,
      friend_ids: payload.friendIds,
      message: payload.message ?? null,
      permission: payload.permission ?? 'view',
    }),
  });
  if (!res.ok) await readApiError(res, 'Could not share this item');
  return res.json();
}

export async function getSharedWithMe(): Promise<{ shared_items: SharedItem[] }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/shared_with_me`, { headers });
  if (!res.ok) return { shared_items: [] };
  return res.json();
}

export async function getSharedContentDetail(contentType: 'note' | 'chat', contentId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/shared/${contentType}/${contentId}`, { headers });
  if (!res.ok) await readApiError(res, 'Could not open this shared item');
  return res.json();
}

export async function removeSharedAccess(shareId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/remove_shared_access/${shareId}`, { method: 'DELETE', headers });
  return res.json();
}

export async function getChatShareLink(sessionId: number): Promise<{ public_token: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/chat/${sessionId}/share-link`, { headers });
  if (!res.ok) await readApiError(res, 'Could not create a share link');
  return res.json();
}

// ── Reminders ─────────────────────────────────────────────────────────
export type Reminder = {
  id: number;
  title: string;
  description: string | null;
  reminder_date: string | null;
  reminder_type: string;
  priority: string;
  color: string;
  is_completed: boolean;
  is_flagged: boolean;
};

export async function getReminders(userId: string, opts: { startDate?: string; endDate?: string; includeCompleted?: boolean } = {}): Promise<Reminder[]> {
  const headers = await authHeaders();
  const params = new URLSearchParams({ user_id: userId });
  if (opts.startDate) params.set('start_date', opts.startDate);
  if (opts.endDate) params.set('end_date', opts.endDate);
  if (opts.includeCompleted) params.set('include_completed', 'true');
  const res = await fetch(`${API_URL}/get_reminders?${params.toString()}`, { headers });
  if (!res.ok) return [];
  return res.json();
}

export async function createReminder(payload: {
  userId: string;
  title: string;
  description?: string;
  reminderDate?: string;
  priority?: string;
  color?: string;
}): Promise<Reminder> {
  const headers = await authHeaders();
  const body = new FormData();
  body.append('user_id', payload.userId);
  body.append('title', payload.title);
  if (payload.description) body.append('description', payload.description);
  if (payload.reminderDate) body.append('reminder_date', payload.reminderDate);
  body.append('priority', payload.priority ?? 'none');
  body.append('color', payload.color ?? '#D7B38C');
  body.append('timezone_offset', String(new Date().getTimezoneOffset()));
  const res = await fetch(`${API_URL}/create_reminder`, { method: 'POST', headers, body });
  if (!res.ok) await readApiError(res, 'Could not create reminder');
  return res.json();
}

export async function updateReminder(reminderId: number, patch: { isCompleted?: boolean; title?: string }): Promise<Reminder> {
  const headers = await authHeaders();
  const body = new FormData();
  if (patch.isCompleted !== undefined) body.append('is_completed', String(patch.isCompleted));
  if (patch.title !== undefined) body.append('title', patch.title);
  const res = await fetch(`${API_URL}/update_reminder/${reminderId}`, { method: 'PUT', headers, body });
  if (!res.ok) await readApiError(res, 'Could not update reminder');
  return res.json();
}

export async function deleteReminder(reminderId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/delete_reminder/${reminderId}`, { method: 'DELETE', headers });
  return res.json();
}

export async function respondFriendRequest(userId: string, requestId: number, action: 'accept' | 'decline') {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/respond_friend_request`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, request_id: requestId, action }),
  });
  return res.json();
}

export async function searchUsers(userId: string, query: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/search_users?user_id=${encodeURIComponent(userId)}&query=${encodeURIComponent(query)}`, { headers });
  return res.json();
}

// ── Flashcard Sets ────────────────────────────────────────────────────
export async function getFlashcardHistory(userId: string, limit = 50, offset = 0) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_flashcard_history?user_id=${encodeURIComponent(userId)}&limit=${limit}&offset=${offset}`, { headers });
  return res.json(); // { flashcard_history: [{id, title, card_count, accuracy_percentage, source_type, ...}] }
}

export async function getFlashcardsInSet(setId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_flashcards_in_set?set_id=${setId}`, { headers });
  return res.json(); // { set_title, flashcards: [{id, question, answer, difficulty}] }
}

export async function getAllFlashcards(userId: string, limit = 2000) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_flashcards?user_id=${encodeURIComponent(userId)}&limit=${limit}`, { headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to load flashcards');
  }
  return res.json();
}

export async function getFlashcardsForReview(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_flashcards_for_review?user_id=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to load review cards');
  }
  return res.json();
}

export async function markFlashcardForReview(cardId: number, marked: boolean) {
  const headers = await authHeaders();
  const body = new FormData();
  body.append('card_id', String(cardId));
  body.append('marked', String(marked));
  const res = await fetch(`${API_URL}/mark_flashcard_for_review`, {
    method: 'POST',
    headers,
    body,
  });
  if (!res.ok) {
    await readApiError(res, 'Failed to update review card');
  }
  return res.json();
}

export async function generateFlashcards(payload: {
  userId: string;
  topic: string;
  cardCount: number;
  difficulty: 'adaptive' | 'easy' | 'medium' | 'hard';
  additionalSpecs?: string;
  setTitle?: string;
  isPublic?: boolean;
}) {
  const headers = await authHeaders();
  const body = new FormData();
  body.append('user_id', payload.userId);
  body.append('topic', payload.topic);
  body.append('generation_type', 'topic');
  body.append('card_count', String(payload.cardCount));
  body.append('difficulty', payload.difficulty);
  body.append('depth_level', 'standard');
  body.append('additional_specs', payload.additionalSpecs ?? '');
  body.append('use_hs_context', 'false');
  body.append('set_title', payload.setTitle ?? `Flashcards: ${payload.topic}`);
  body.append('is_public', String(Boolean(payload.isPublic)));

  const res = await fetch(`${API_URL}/generate_flashcards`, {
    method: 'POST',
    headers,
    body,
  });

  if (!res.ok) {
    await readApiError(res, 'Failed to generate flashcards');
  }

  return res.json();
}

export async function reviewFlashcard(payload: {
  userId: string;
  cardId: number;
  wasCorrect: boolean;
  mode?: string;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/flashcards/review`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: payload.userId,
      card_id: String(payload.cardId),
      was_correct: payload.wasCorrect,
      mode: payload.mode ?? 'mobile',
    }),
  });
  if (!res.ok) {
    await readApiError(res, 'Failed to save flashcard review');
  }
  return res.json();
}

// ── Spaced Repetition (SM-2/FSRS) ────────────────────────────────────────
export type SRIntervalPreview = { again: string; hard: string; good: string; easy: string };
export type SRDueCard = {
  id: number;
  set_id: number;
  set_title: string;
  question: string;
  answer: string;
  difficulty: string;
  sr_state: 'new' | 'learning' | 'review' | 'relearning';
  ease_factor: number;
  interval: number;
  repetitions: number;
  lapses: number;
  interval_preview: SRIntervalPreview;
};
export type SRDueCardsResponse = {
  due_count: number;
  new_count: number;
  review_count: number;
  learning_count: number;
  relearning_count: number;
  cards: SRDueCard[];
};

export async function getDueFlashcards(userId: string, limit = 100): Promise<SRDueCardsResponse> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/flashcards/due?user_id=${encodeURIComponent(userId)}&limit=${limit}`, { headers });
  if (!res.ok) await readApiError(res, 'Failed to load due flashcards');
  return res.json();
}

export type SRGrade = 'again' | 'hard' | 'good' | 'easy';
export type SRReviewResult = {
  status: string;
  card_id: number;
  new_state: string;
  new_interval: number;
  new_ease: number;
  next_review_date: string;
  fsrs_stability: number;
  retrievability: number;
  interval_preview: SRIntervalPreview;
};

export async function srReviewFlashcard(userId: string, cardId: number, grade: SRGrade): Promise<SRReviewResult> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/flashcards/sr_review`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, card_id: cardId, grade }),
  });
  if (!res.ok) await readApiError(res, 'Failed to submit review grade');
  return res.json();
}

export type SRStats = {
  total_cards: number;
  state_distribution: { new: number; learning: number; review: number; relearning: number };
  retention_rate: number;
  total_reviews?: number;
  ease_distribution: { range: string; label: string; count: number }[];
  review_forecast: { date: string; day_label: string; count: number }[];
  maturity: { average_interval: number; mature_count: number; longest_interval: number; review_card_count?: number };
  lapse_stats: { total_lapses: number; most_lapsed: { card_id: number; question: string; lapses: number }[] };
};

export async function getSrStats(userId: string): Promise<SRStats> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/flashcards/sr_stats?user_id=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) await readApiError(res, 'Failed to load spaced repetition stats');
  return res.json();
}

export type SRAiSuggestions = {
  daily_target: number;
  problem_areas: { topic: string; suggestion: string; priority: 'high' | 'medium' | 'low' }[];
  study_tips: string[];
  optimal_new_cards_per_day: number;
  encouragement: string;
};

export async function getFlashcardAiSuggestions(userId: string): Promise<SRAiSuggestions> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/flashcards/ai_suggestions?user_id=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) await readApiError(res, 'Failed to load study suggestions');
  return res.json();
}

export async function createFlashcardSet(payload: {
  userId: string;
  title: string;
  description?: string;
  isPublic?: boolean;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/flashcards/sets/create`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: payload.userId,
      title: payload.title,
      description: payload.description ?? '',
      is_public: Boolean(payload.isPublic),
    }),
  });

  if (!res.ok) {
    await readApiError(res, 'Failed to create flashcard set');
  }

  return res.json();
}

export async function createFlashcard(payload: {
  setId: number;
  question: string;
  answer: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/flashcards/cards/create`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      set_id: payload.setId,
      question: payload.question,
      answer: payload.answer,
      difficulty: payload.difficulty ?? 'medium',
    }),
  });

  if (!res.ok) {
    await readApiError(res, 'Failed to create flashcard');
  }

  return res.json();
}

// ── Notes ─────────────────────────────────────────────────────────────
export async function getNotes(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_notes?user_id=${encodeURIComponent(userId)}`, { headers });
  return res.json(); // [{id, title, content, updated_at, is_favorite, folder_id}]
}

export async function createNote(payload: {
  userId: string;
  title: string;
  content?: string;
  folderId?: number | null;
  customFont?: string;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/create_note`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: payload.userId,
      title: payload.title,
      content: payload.content ?? '',
      folder_id: payload.folderId ?? null,
      custom_font: payload.customFont ?? 'Inter',
    }),
  });

  if (!res.ok) {
    await readApiError(res, 'Failed to create note');
  }

  return res.json();
}

export async function updateNote(payload: {
  noteId: number | string;
  title: string;
  content: string;
  customFont?: string;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/update_note`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      note_id: String(payload.noteId),
      title: payload.title,
      content: payload.content,
      custom_font: payload.customFont ?? 'Inter',
    }),
  });

  if (!res.ok) {
    await readApiError(res, 'Failed to update note');
  }

  return res.json();
}

export async function toggleFavorite(payload: {
  noteId: number | string;
  isFavorite: boolean;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/toggle_favorite`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      note_id: String(payload.noteId),
      is_favorite: payload.isFavorite,
    }),
  });

  if (!res.ok) {
    await readApiError(res, 'Failed to update favorite');
  }

  return res.json();
}

export async function moveNoteToTrash(noteId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/soft_delete_note/${noteId}`, {
    method: 'PUT',
    headers,
  });

  if (!res.ok) {
    await readApiError(res, 'Failed to move note to trash');
  }

  return res.json();
}

export async function getTrash(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_trash?user_id=${encodeURIComponent(userId)}`, { headers });

  if (!res.ok) {
    await readApiError(res, 'Failed to load trash');
  }

  return res.json();
}

export async function restoreNote(noteId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/restore_note/${noteId}`, {
    method: 'PUT',
    headers,
  });

  if (!res.ok) {
    await readApiError(res, 'Failed to restore note');
  }

  return res.json();
}

export async function permanentlyDeleteNote(noteId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/permanent_delete_note/${noteId}`, {
    method: 'DELETE',
    headers,
  });

  if (!res.ok) {
    await readApiError(res, 'Failed to permanently delete note');
  }

  return res.json();
}

export async function getFolders(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_folders?user_id=${encodeURIComponent(userId)}`, { headers });

  if (!res.ok) {
    await readApiError(res, 'Failed to load folders');
  }

  return res.json();
}

export async function createFolder(payload: {
  userId: string;
  name: string;
  color?: string;
  parentId?: number | null;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/create_folder`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: payload.userId,
      name: payload.name,
      color: payload.color ?? '#D7B38C',
      parent_id: payload.parentId ?? null,
    }),
  });

  if (!res.ok) {
    await readApiError(res, 'Failed to create folder');
  }

  return res.json();
}

export async function moveNoteToFolder(payload: {
  noteId: number | string;
  folderId: number | null;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/move_note_to_folder`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      note_id: String(payload.noteId),
      folder_id: payload.folderId,
    }),
  });

  if (!res.ok) {
    await readApiError(res, 'Failed to move note');
  }

  return res.json();
}

export async function convertChatSessionsToNoteContent(payload: {
  userId: string;
  sessionIds: number[];
}) {
  const headers = await authHeaders();
  const sessions = Array.isArray(payload.sessionIds) ? payload.sessionIds : [];

  if (!sessions.length) {
    throw new Error('Select at least one chat session');
  }

  const sections: string[] = [];
  for (const sessionId of sessions) {
    const body = new FormData();
    body.append('chat_id', String(sessionId));
    body.append('user_id', payload.userId);

    const res = await fetch(`${API_URL}/convert_chat_to_note_content/`, {
      method: 'POST',
      headers,
      body,
    });

    if (!res.ok) {
      await readApiError(res, `Failed to convert chat session ${sessionId}`);
    }

    const data = await res.json();
    if (data?.content) {
      sections.push(sessions.length === 1 ? data.content : `# Chat Session ${sections.length + 1}\n\n${data.content}`);
    }
  }

  if (!sections.length) {
    throw new Error('No chat content returned');
  }

  return {
    title: sessions.length > 1 ? `Chat Notes (${sessions.length} Sessions)` : 'Chat Notes',
    content: sections.join('\n\n'),
  };
}

export async function convertChatSessionsToNote(payload: {
  userId: string;
  sessionIds: number[];
  title?: string;
}) {
  const converted = await convertChatSessionsToNoteContent({
    userId: payload.userId,
    sessionIds: payload.sessionIds,
  });

  return createNote({
    userId: payload.userId,
    title: payload.title ?? converted.title,
    content: converted.content,
  });
}

export async function convertNotesToFlashcards(payload: {
  noteIds: number[];
  cardCount?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/import_export/notes_to_flashcards`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      note_ids: payload.noteIds,
      card_count: payload.cardCount ?? 10,
      difficulty: payload.difficulty ?? 'medium',
    }),
  });

  if (!res.ok) {
    await readApiError(res, 'Failed to convert notes to flashcards');
  }

  return res.json();
}

export async function convertNotesToQuestions(payload: {
  noteIds: number[];
  questionCount?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/import_export/notes_to_questions`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      note_ids: payload.noteIds,
      question_count: payload.questionCount ?? 10,
      difficulty: payload.difficulty ?? 'medium',
    }),
  });

  if (!res.ok) {
    await readApiError(res, 'Failed to convert notes to questions');
  }

  return res.json();
}

export async function invokeNotesAgent(payload: {
  userId: string;
  action: string;
  content?: string;
  topic?: string;
  tone?: string;
  depth?: string;
  context?: string;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/agents/notes`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: payload.userId,
      action: payload.action,
      content: payload.content ?? '',
      topic: payload.topic ?? '',
      tone: payload.tone ?? 'professional',
      depth: payload.depth ?? 'standard',
      context: payload.context ?? '',
    }),
  });

  if (!res.ok) {
    await readApiError(res, 'Failed to process AI note request');
  }

  return res.json();
}

// ── AI Media Notes ────────────────────────────────────────────────────
export async function processMediaYouTube(userId: string, youtubeUrl: string, noteStyle = 'detailed') {
  const headers = await authHeaders();
  const body = new FormData();
  body.append('user_id', userId);
  body.append('youtube_url', youtubeUrl);
  body.append('note_style', noteStyle);
  body.append('difficulty', 'intermediate');
  body.append('subject', 'general');
  const res = await fetch(`${API_URL}/media/process`, {
    method: 'POST',
    headers,
    body,
  });
  return res.json();
}

export async function processMediaFile(
  userId: string,
  file: { uri: string; name: string; mimeType: string },
  noteStyle = 'detailed'
) {
  const headers = await authHeaders();
  const body = new FormData();
  body.append('user_id', userId);
  body.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  body.append('note_style', noteStyle);
  body.append('difficulty', 'intermediate');
  body.append('subject', 'general');
  const res = await fetch(`${API_URL}/media/process`, {
    method: 'POST',
    headers,
    body,
  });
  return res.json();
}

export async function getMediaHistory(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/media/history?user_id=${encodeURIComponent(userId)}`, { headers });
  return res.json(); // { history: [{id, title, created_at, preview}] }
}

export async function saveMediaNotes(
  userId: string,
  title: string,
  content: string,
  transcript?: string,
  analysis?: any,
) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/media/save-notes`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, title, content, transcript, analysis }),
  });
  return res.json(); // { success, note_id }
}

// ── Podcast Mode ─────────────────────────────────────────────────────
export type PodcastChapter = {
  index: number;
  title?: string;
  content?: string;
  summary?: string;
  duration_seconds?: number;
};

export type PodcastQuestion = {
  index: number;
  question: string;
  options: string[];
};

export type PodcastMCQState = {
  active?: boolean;
  completed?: boolean;
  score?: number;
  total?: number;
  current_index?: number;
  question?: PodcastQuestion;
  summary?: string;
};

export type PodcastSessionPayload = {
  success?: boolean;
  session_id: string;
  episode_title?: string;
  title?: string;
  current_segment?: string;
  current_index?: number;
  total_segments?: number;
  has_more?: boolean;
  chapters?: PodcastChapter[];
  bookmarks?: Array<{ id: number; label?: string; chapter_index?: number; timestamp_seconds?: number }>;
  key_takeaways?: string[];
  follow_up_suggestions?: string[];
  answer?: string;
  mcq_state?: PodcastMCQState;
  mcq_drill?: PodcastMCQState;
};

async function podcastRequest<T>(path: string, payload: Record<string, any>) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/media/podcast${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    await readApiError(res, 'Podcast request failed');
  }
  return res.json() as Promise<T>;
}

export async function getPodcastSessions(userId: string, limit = 20) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/media/podcast/sessions?user_id=${encodeURIComponent(userId)}&limit=${limit}`, { headers });
  if (!res.ok) {
    await readApiError(res, 'Failed to load podcast sessions');
  }
  return res.json() as Promise<{ success: boolean; sessions: Array<{ session_id: string; title?: string; episode_title?: string; updated_at?: string; created_at?: string; current_index?: number; total_segments?: number }> }>;
}

export async function startPodcastSession(payload: {
  userId: string;
  transcript: string;
  analysis?: Record<string, any>;
  title?: string;
  sourceType?: string;
  voiceMode?: string;
  voicePersona?: string;
  difficulty?: string;
  answerLanguage?: string;
  sessionOptions?: Record<string, any>;
}) {
  return podcastRequest<PodcastSessionPayload>('/start', {
    user_id: payload.userId,
    transcript: payload.transcript,
    analysis: payload.analysis ?? {},
    title: payload.title ?? 'Media Podcast',
    source_type: payload.sourceType ?? 'media',
    voice_mode: payload.voiceMode ?? 'coach',
    voice_persona: payload.voicePersona ?? 'mentor',
    difficulty: payload.difficulty ?? 'intermediate',
    answer_language: payload.answerLanguage ?? 'en',
    session_options: payload.sessionOptions ?? {},
  });
}

export async function resumePodcastSession(userId: string, sessionId: string) {
  return podcastRequest<PodcastSessionPayload>('/resume', { user_id: userId, session_id: sessionId });
}

export async function getNextPodcastSegment(userId: string, sessionId: string) {
  return podcastRequest<PodcastSessionPayload>('/next', { user_id: userId, session_id: sessionId });
}

export async function jumpPodcastChapter(userId: string, sessionId: string, chapterIndex: number) {
  return podcastRequest<PodcastSessionPayload>('/jump', { user_id: userId, session_id: sessionId, chapter_index: chapterIndex });
}

export async function askPodcastQuestion(payload: {
  userId: string;
  sessionId: string;
  question: string;
  voiceMode?: string;
  voicePersona?: string;
  difficulty?: string;
  answerLanguage?: string;
}) {
  return podcastRequest<PodcastSessionPayload>('/ask', {
    user_id: payload.userId,
    session_id: payload.sessionId,
    question: payload.question,
    voice_mode: payload.voiceMode ?? 'coach',
    voice_persona: payload.voicePersona ?? 'mentor',
    difficulty: payload.difficulty ?? 'intermediate',
    answer_language: payload.answerLanguage ?? 'en',
  });
}

export async function addPodcastBookmark(userId: string, sessionId: string, chapterIndex?: number) {
  return podcastRequest<PodcastSessionPayload>('/bookmark', {
    user_id: userId,
    session_id: sessionId,
    chapter_index: chapterIndex ?? 0,
  });
}

export async function startPodcastMCQ(userId: string, sessionId: string, count = 5) {
  return podcastRequest<PodcastMCQState>('/mcq/start', { user_id: userId, session_id: sessionId, count });
}

export async function answerPodcastMCQ(userId: string, sessionId: string, questionIndex: number, selectedIndex: number) {
  return podcastRequest<{
    is_correct?: boolean;
    explanation?: string;
    completed?: boolean;
    score?: number;
    total?: number;
    summary?: string;
    next_question?: PodcastQuestion;
  }>('/mcq/answer', {
    user_id: userId,
    session_id: sessionId,
    question_index: questionIndex,
    selected_index: selectedIndex,
  });
}

// ── Weekly Progress ───────────────────────────────────────────────────
export async function getWeeklyProgress(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_weekly_progress?user_id=${encodeURIComponent(userId)}`, { headers });
  return res.json(); // { daily_breakdown: [{day, ai_chats, notes, flashcards, ...}], weekly_stats, ... }
}

// ── Flashcard Stats ───────────────────────────────────────────────────
export async function getFlashcardStatistics(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_flashcard_statistics?user_id=${encodeURIComponent(userId)}`, { headers });
  return res.json(); // { total_sets, total_cards, cards_mastered, average_accuracy }
}

// ── Chat History ─────────────────────────────────────────────────────
export async function getChatSessions(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_chat_sessions?user_id=${encodeURIComponent(userId)}`, { headers });
  return res.json(); // { sessions: [{id, title, updated_at}] }
}

export async function getChatMessages(chatId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_chat_messages?chat_id=${chatId}`, { headers });
  return res.json(); // [{id, type, content, timestamp}]
}

export async function renameChatSession(chatId: number, newTitle: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/rename_chat_session`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, new_title: newTitle }),
  });
  if (!res.ok) await readApiError(res, 'Could not rename chat');
  return res.json();
}

export async function deleteChatSession(chatId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/delete_chat_session/${chatId}`, { method: 'DELETE', headers });
  if (!res.ok) await readApiError(res, 'Could not delete chat');
  return res.json();
}

export type ChatFolder = { id: number; name: string; color: string; parent_id: number | null; created_at: string | null };

export async function createChatFolder(userId: string, name: string, color = '#D7B38C'): Promise<ChatFolder> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/create_chat_folder`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, name, color }),
  });
  if (!res.ok) await readApiError(res, 'Could not create folder');
  return res.json();
}

export async function getChatFolders(userId: string): Promise<{ folders: ChatFolder[] }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_chat_folders?user_id=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) return { folders: [] };
  return res.json();
}

export async function deleteChatFolder(folderId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/delete_chat_folder/${folderId}`, { method: 'DELETE', headers });
  if (!res.ok) await readApiError(res, 'Could not delete folder');
  return res.json();
}

export async function moveChatToFolder(chatId: number, folderId: number | null) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/move_chat_to_folder`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: String(chatId), folder_id: folderId }),
  });
  if (!res.ok) await readApiError(res, 'Could not move chat');
  return res.json();
}

export async function submitChatFeedback(payload: {
  userId: string;
  rating: number;
  messageContent?: string;
  feedbackText?: string;
  improvementSuggestion?: string;
}) {
  const headers = await authHeaders();
  const body = new FormData();
  body.append('user_id', payload.userId);
  body.append('rating', String(payload.rating));
  if (payload.messageContent) body.append('message_content', payload.messageContent);
  if (payload.feedbackText) body.append('feedback_text', payload.feedbackText);
  if (payload.improvementSuggestion) body.append('improvement_suggestion', payload.improvementSuggestion);
  const res = await fetch(`${API_URL}/submit_advanced_feedback`, { method: 'POST', headers, body });
  if (!res.ok) await readApiError(res, 'Could not submit feedback');
  return res.json();
}

// ── Register ──────────────────────────────────────────────────────────
export async function register(data: {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  password: string;
}) {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    throw new Error(`Network request failed. Could not reach backend at ${API_URL}.`);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Registration failed');
  }
  return res.json();
}

export async function verifyRegistration(data: {
  email: string;
  otp: string;
}) {
  const res = await fetch(`${API_URL}/register/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Verification failed');
  }
  return res.json();
}

export async function resendRegistrationOtp(email: string) {
  const res = await fetch(`${API_URL}/register/resend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Could not resend verification code');
  }
  return res.json();
}

export async function requestPasswordReset(email: string) {
  const res = await fetch(`${API_URL}/password-reset/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Could not send OTP');
  }
  return res.json();
}

export async function confirmPasswordReset(data: {
  email: string;
  otp: string;
  new_password: string;
}) {
  const res = await fetch(`${API_URL}/password-reset/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Could not reset password');
  }
  return res.json();
}

// ── Google OAuth ──────────────────────────────────────────────────────
export async function googleAuth(idToken: string) {
  const res = await fetch(`${API_URL}/google-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: idToken }),
  });
  if (!res.ok) await readApiError(res, 'Google auth failed');
  return res.json(); // { access_token, token_type, user_info }
}

// ── Friends (extended) ────────────────────────────────────────────────
export async function sendFriendRequest(userId: string, targetUsername: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/send_friend_request`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, target_username: targetUsername }),
  });
  return res.json(); // { message }
}

export async function removeFriend(userId: string, friendId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/remove_friend`, {
    method: 'DELETE',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, friend_id: friendId }),
  });
  return res.json();
}

export async function giveKudos(userId: string, recipientId: number, kudosType = 'great_study') {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/give_kudos`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, recipient_id: recipientId, kudos_type: kudosType }),
  });
  return res.json();
}

// ── Leaderboard ───────────────────────────────────────────────────────
export async function getLeaderboard(category: 'global' | 'friends' = 'global', limit = 50) {
  const headers = await authHeaders();
  const params = new URLSearchParams({ category, limit: String(limit) });
  const res = await fetch(`${API_URL}/leaderboard?${params.toString()}`, { headers });
  if (!res.ok) throw new Error(`Leaderboard request failed (${res.status})`);
  return res.json();
}

export async function getFriendsLeaderboard(_userId: string) {
  return getLeaderboard('friends', 50);
}

export async function getGlobalLeaderboard(limit = 20) {
  const res = await fetch(`${API_URL}/get_global_leaderboard?limit=${limit}`);
  return res.json(); // { leaderboard: [{rank, username, total_points, streak}] }
}

// ── Quiz Battles ──────────────────────────────────────────────────────
export async function getQuizBattles(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/quiz_battles?user_id=${encodeURIComponent(userId)}`, { headers });
  if (!res.ok) return { battles: [] };
  return res.json(); // { battles: [{id, subject, status, opponent, your_score, opponent_score, your_completed, opponent_completed, is_challenger, ...}] }
}

export async function createQuizBattle(payload: {
  challenger_id: string;
  opponent_id: number;
  subject: string;
  difficulty?: string;
  question_count?: number;
  time_limit_seconds?: number;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/create_quiz_battle`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      difficulty: 'medium',
      question_count: 10,
      time_limit_seconds: 300,
      ...payload,
    }),
  });
  if (!res.ok) await readApiError(res, 'Failed to create battle');
  return res.json(); // { battle_id, message }
}

export async function acceptQuizBattle(battleId: number, userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/accept_quiz_battle`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ battle_id: battleId, user_id: userId }),
  });
  if (!res.ok) await readApiError(res, 'Could not accept battle');
  return res.json();
}

export async function declineQuizBattle(battleId: number, userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/decline_quiz_battle`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ battle_id: battleId, user_id: userId }),
  });
  if (!res.ok) await readApiError(res, 'Could not decline battle');
  return res.json();
}

export async function getBattleDetails(battleId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/quiz_battle/${battleId}`, { headers });
  if (!res.ok) await readApiError(res, 'Could not load this battle');
  return res.json();
}

export type BattleQuestion = { id: number; question: string; options: string[]; correct_answer: number; explanation: string };

export async function generateBattleQuestions(payload: {
  battleId: number;
  subject: string;
  difficulty?: string;
  questionCount?: number;
}): Promise<{ questions: BattleQuestion[] }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/generate_battle_questions`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      battle_id: payload.battleId,
      subject: payload.subject,
      difficulty: payload.difficulty ?? 'medium',
      question_count: payload.questionCount ?? 10,
    }),
  });
  if (!res.ok) await readApiError(res, 'Failed to generate battle questions');
  return res.json();
}

export type BattleAnswer = {
  question_id: number;
  question: string;
  options: string[];
  correct_answer: number;
  explanation: string;
  selected_answer: number;
  is_correct: boolean;
  time_taken: number;
};

export async function submitBattleAnswer(battleId: number, questionIndex: number, isCorrect: boolean) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/submit_battle_answer`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ battle_id: battleId, question_index: questionIndex, is_correct: isCorrect }),
  });
  return res.json();
}

export async function completeQuizBattle(battleId: number, score: number, answers: BattleAnswer[]) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/complete_quiz_battle`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ battle_id: battleId, score, answers }),
  });
  if (!res.ok) await readApiError(res, 'Failed to submit battle results');
  return res.json();
}

// ── Solo Quiz ────────────────────────────────────────────────────────
export async function createSoloQuiz(payload: { subject: string; difficulty: string; question_count: number }) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/create_solo_quiz`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await readApiError(res, 'Could not create quiz');
  return res.json(); // { status, quiz_id, uid }
}

export type SoloQuizQuestion = {
  id: number;
  question: string;
  options: string[];
  correct_answer: number | string; // 0-based index into `options`
  explanation: string;
};

export async function getSoloQuiz(quizId: string | number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/solo_quiz/${quizId}`, { headers });
  if (!res.ok) await readApiError(res, 'Could not load quiz');
  return res.json() as Promise<{
    quiz: { id: number; uid: string; subject: string; difficulty: string; question_count: number; time_limit_seconds: number };
    questions: SoloQuizQuestion[];
  }>;
}

export async function completeSoloQuiz(payload: {
  quiz_id: string | number;
  score: number;
  answers: { question_text: string; user_answer: string; correct_answer: string; is_correct: boolean; explanation?: string }[];
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/complete_solo_quiz`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await readApiError(res, 'Could not save quiz results');
  return res.json();
}

// ── Challenges ────────────────────────────────────────────────────────
export async function getChallenges(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/challenges?user_id=${encodeURIComponent(userId)}`, { headers });
  return res.json(); // { challenges: [{id, title, subject, participants, ...}] }
}

export async function createChallenge(payload: {
  title: string;
  subject: string;
  description?: string;
  challenge_type: 'speed' | 'accuracy' | 'topic_mastery' | 'streak';
  target_metric: 'questions_answered' | 'accuracy_percentage';
  target_value: number;
  time_limit_minutes?: number;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/create_challenge`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: '', time_limit_minutes: 1440, ...payload }),
  });
  return res.json();
}

export async function joinChallenge(challengeId: number, userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/join_challenge`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge_id: challengeId, user_id: userId }),
  });
  return res.json();
}

export async function getChallengeDetail(challengeId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/challenge/${challengeId}`, { headers });
  if (!res.ok) await readApiError(res, 'Could not load this challenge');
  return res.json();
}

export async function generateChallengeQuestions(payload: {
  challengeId: number;
  subject: string;
  challengeType?: string;
  questionCount?: number;
}): Promise<{ questions: BattleQuestion[] }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/generate_challenge_questions`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge_id: payload.challengeId,
      subject: payload.subject,
      challenge_type: payload.challengeType ?? 'speed',
      question_count: payload.questionCount ?? 10,
    }),
  });
  if (!res.ok) await readApiError(res, 'Failed to generate challenge questions');
  return res.json();
}

export async function updateChallengeProgress(payload: {
  challengeId: number;
  questionsAnswered: number;
  accuracyPercentage: number;
  answers: { question_id: number; selected_answer: number; is_correct: boolean }[];
}): Promise<{ progress: number; completed: boolean }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/update_challenge_progress`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge_id: payload.challengeId,
      questions_answered: payload.questionsAnswered,
      accuracy_percentage: payload.accuracyPercentage,
      answers: payload.answers,
    }),
  });
  if (!res.ok) await readApiError(res, 'Failed to submit challenge progress');
  return res.json();
}
