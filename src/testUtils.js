import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

export const MOCK_TOKEN = 'mock-jwt-token-xyz789';
export const MOCK_USERNAME = 'testuser';

export const setupLocalStorage = (overrides = {}) => {
  const defaults = {
    token: MOCK_TOKEN,
    username: MOCK_USERNAME,
    userProfile: JSON.stringify({
      firstName: 'Test',
      lastName: 'User',
      email: 'testuser@example.com',
      notificationsEnabled: false,
      showStudyInsights: false,
    }),
  };
  const merged = { ...defaults, ...overrides };
  Object.entries(merged).forEach(([k, v]) => localStorage.setItem(k, v));
};

export const clearLocalStorage = () => localStorage.clear();

export const buildFetchMock = (routes = {}, { delay = 0 } = {}) => {
  return jest.fn((url) => {
    const respond = (data, ok = true, status = 200) =>
      new Promise((res) =>
        setTimeout(
          () => res({ ok, status, json: () => Promise.resolve(data) }),
          delay
        )
      );

    for (const [pattern, payload] of Object.entries(routes)) {
      if (url.includes(pattern)) return respond(payload);
    }
    return respond({});
  });
};

export const buildErrorFetchMock = (pattern, status = 500) =>
  jest.fn((url) => {
    if (url.includes(pattern)) {
      return Promise.resolve({
        ok: false,
        status,
        json: () => Promise.resolve({ detail: 'Server error' }),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });

export const MOCK_GAMIFICATION = {
  level: 5,
  xp: 1250,
  xp_to_next: 500,
  streak: 7,
  total_points: 2500,
  total_questions: 145,
  total_minutes: 320,
  badges: [],
};

export const MOCK_DASHBOARD_DATA = {
  recentNotes: [
    { id: 1, title: 'Test Note Alpha', created_at: '2026-01-01T00:00:00Z', content: 'Body A' },
    { id: 2, title: 'Test Note Beta', created_at: '2026-01-02T00:00:00Z', content: 'Body B' },
  ],
  recentFlashcards: [
    { id: 1, title: 'Physics Cards', card_count: 12 },
  ],
  recentActivities: [],
};

export const MOCK_HEATMAP = {
  data: [
    { date: '2026-01-01', count: 3, level: 2 },
    { date: '2026-01-02', count: 5, level: 3 },
  ],
  total_questions: 88,
  current_questions: 5,
  current_sessions: 2,
};

export const MOCK_WEEKLY_PROGRESS = {
  week_data: [
    { date: '2026-01-06', points: 120, ai_chats: 3, notes: 2, flashcards: 8, quizzes: 4, study_minutes: 55 },
  ],
  daily_breakdown: [],
  stats: { total_points: 840, total_sessions: 7, avg_daily: 120 },
};

export const MOCK_HISTORICAL = {
  data: [
    { period: '2026-W01', total_points: 840, total_activities: 40 },
  ],
  period_stats: { totalPoints: 840, totalActivities: 40 },
};

export const MOCK_FLASHCARD_HISTORY = {
  sets: [
    {
      session_id: 'set-abc',
      topic: 'Biology',
      cards: [{ question: 'What is DNA?', answer: 'Deoxyribonucleic acid' }],
      card_count: 1,
      created_at: '2026-01-10T00:00:00Z',
    },
  ],
  total_count: 1,
  has_more: false,
};

export const MOCK_FLASHCARD_STATS = {
  total_sets: 8,
  total_cards: 95,
  mastered: 40,
  learning: 35,
  new: 20,
};

export const MOCK_NOTES = {
  notes: [
    { id: 1, title: 'Intro to Calculus', content: '<p>Derivatives...</p>', created_at: '2026-01-01T00:00:00Z', folder_id: null },
    { id: 2, title: 'Organic Chemistry', content: '<p>Alkanes...</p>', created_at: '2026-01-02T00:00:00Z', folder_id: 1 },
  ],
};

export const MOCK_FOLDERS = {
  folders: [
    { id: 1, name: 'Science', note_count: 1 },
    { id: 2, name: 'Math', note_count: 0 },
  ],
};

export const MOCK_SAVED_NOTE = {
  id: 99,
  title: 'New Note',
  content: '',
  created_at: '2026-05-09T00:00:00Z',
};

export const MOCK_ML_STATS = {
  engagement_score: 82,
  predicted_retention: 0.74,
  study_pattern: 'evening',
  weak_areas: ['Thermodynamics', 'Organic Chemistry'],
  strong_areas: ['Calculus', 'Statistics'],
};

export const MOCK_CHAT_DETAILS = {
  total_sessions: 24,
  avg_messages: 6,
  top_topics: ['Calculus', 'Physics'],
};

export const MOCK_FLASHCARD_DETAILS = {
  total_reviews: 312,
  accuracy_rate: 0.78,
  avg_cards_per_session: 18,
};

export const MOCK_GENERATED_QUIZ = {
  session_id: 'quiz-xyz',
  questions: [
    {
      id: 'q1',
      question: 'What is Newton\'s 2nd law?',
      options: ['F=ma', 'E=mc²', 'PV=nRT', 'a²+b²=c²'],
      correct_answer: 'F=ma',
      difficulty: 'medium',
    },
  ],
  subject: 'Physics',
  difficulty: 'medium',
};

export const renderInRouter = (ui, { route = '/' } = {}) =>
  render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
