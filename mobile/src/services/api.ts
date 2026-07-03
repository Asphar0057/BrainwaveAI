import AsyncStorage from '@react-native-async-storage/async-storage';

const PRODUCTION_API_URL = 'https://YOUR_PRODUCTION_API_URL/api';

function normalizeApiUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return PRODUCTION_API_URL;
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

export const API_URL = normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL ?? PRODUCTION_API_URL);

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

// ── Stats ─────────────────────────────────────────────────────────────
export async function getEnhancedStats(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_enhanced_user_stats?user_id=${encodeURIComponent(userId)}`, { headers });
  return res.json(); // { streak, hours, totalChatSessions, totalFlashcards, totalNotes, ... }
}

export async function getWeeklyBingo(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/get_weekly_bingo_stats?user_id=${encodeURIComponent(userId)}`, { headers });
  return res.json();
}

// ── Session time tracking ─────────────────────────────────────────────
export async function startSession(userId: string, sessionType = 'mobile_app') {
  const headers = await authHeaders();
  const body = new URLSearchParams({ user_id: userId, session_type: sessionType });
  const res = await fetch(`${API_URL}/start_session`, {
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
  });
  const res = await fetch(`${API_URL}/end_session`, {
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

export async function generateFlashcards(payload: {
  userId: string;
  topic: string;
  cardCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
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
  noteId: number;
  title: string;
  content: string;
  customFont?: string;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/update_note`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      note_id: payload.noteId,
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
  noteId: number;
  isFavorite: boolean;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/toggle_favorite`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      note_id: payload.noteId,
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
  noteId: number;
  folderId: number | null;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/move_note_to_folder`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      note_id: payload.noteId,
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
export async function getFriendsLeaderboard(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/leaderboard?user_id=${encodeURIComponent(userId)}`, { headers });
  return res.json(); // { leaderboard: [{rank, username, score, streak, is_current_user}], current_user_rank }
}

export async function getGlobalLeaderboard(limit = 20) {
  const res = await fetch(`${API_URL}/get_global_leaderboard?limit=${limit}`);
  return res.json(); // { leaderboard: [{rank, username, total_points, streak}] }
}

// ── Quiz Battles ──────────────────────────────────────────────────────
export async function getQuizBattles(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/quiz_battles?user_id=${encodeURIComponent(userId)}`, { headers });
  return res.json(); // { battles: [{id, subject, status, challenger, opponent, ...}] }
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
  return res.json(); // { battle_id, message }
}

export async function acceptQuizBattle(battleId: number, userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/accept_quiz_battle`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ battle_id: battleId, user_id: userId }),
  });
  return res.json();
}

export async function declineQuizBattle(battleId: number, userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/decline_quiz_battle`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ battle_id: battleId, user_id: userId }),
  });
  return res.json();
}

export async function getBattleDetails(battleId: number) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/quiz_battle/${battleId}`, { headers });
  return res.json();
}

// ── Challenges ────────────────────────────────────────────────────────
export async function getChallenges(userId: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/challenges?user_id=${encodeURIComponent(userId)}`, { headers });
  return res.json(); // { challenges: [{id, title, subject, participants, ...}] }
}

export async function createChallenge(payload: {
  creator_id: string;
  title: string;
  subject: string;
  difficulty?: string;
  question_count?: number;
  time_limit_hours?: number;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/create_challenge`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ difficulty: 'medium', question_count: 10, time_limit_hours: 24, ...payload }),
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
