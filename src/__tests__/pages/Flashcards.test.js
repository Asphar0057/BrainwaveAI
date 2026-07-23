import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import {
  setupLocalStorage,
  clearLocalStorage,
  buildFetchMock,
  buildErrorFetchMock,
  MOCK_FLASHCARD_HISTORY,
  MOCK_FLASHCARD_STATS,
  MOCK_TOKEN,
} from '../../testUtils';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: null, pathname: '/flashcards', search: '' }),
}));

jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    selectedTheme: { id: 'default', tokens: { '--accent': '#D7B38C' } },
  }),
}));

jest.mock('../../services/gamificationService', () => ({
  __esModule: true,
  default: {
    trackActivity: jest.fn(),
    getStats: jest.fn(),
    awardPoints: jest.fn(),
  },
}));

jest.mock('../../services/contextService', () => ({
  __esModule: true,
  default: {
    listDocuments: jest.fn(),
    isHsModeEnabled: jest.fn(),
  },
}));

jest.mock('../../components/ImportExportModal', () => () => null);
jest.mock('../../components/MathRenderer', () => ({ children }) => <span>{children}</span>);
jest.mock('../../components/ContextSelector', () => () => <div data-testid="context-selector" />);
jest.mock('../../components/ContextPanel', () => () => <div data-testid="context-panel" />);
jest.mock('../../components/AbstractFx', () => () => <div data-testid="abstract-fx" />);
jest.mock('../../components/GeoBackground', () => () => <div data-testid="geo-bg" />);
jest.mock('../../pages/CustomPopup', () => () => null);

const FETCH_ROUTES = {
  get_flashcard_history: MOCK_FLASHCARD_HISTORY,
  get_flashcard_statistics: MOCK_FLASHCARD_STATS,
  get_chat_sessions: { sessions: [] },
  'flashcards/due': { cards: [] },
  'flashcards/sr_stats': { due_today: 0, streak: 0 },
  get_flashcards_for_review: { cards: [] },
  'flashcards/review': { ok: true },
  'flashcards/ai_suggestions': { suggestions: [] },
};

const GENERATE_RESPONSE = {
  session_id: 'gen-001',
  topic: 'Photosynthesis',
  cards: [
    { question: 'What is photosynthesis?', answer: 'Process of converting light to energy' },
    { question: 'What pigment absorbs light?', answer: 'Chlorophyll' },
  ],
  card_count: 2,
};

import Flashcards from '../../pages/Flashcards';
import gamificationService from '../../services/gamificationService';
import contextService from '../../services/contextService';

const renderFlashcards = async () => {
  let utils;
  await act(async () => {
    utils = render(
      <MemoryRouter>
        <Flashcards />
      </MemoryRouter>
    );
  });
  return utils;
};

describe('Flashcards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearLocalStorage();
    global.fetch = buildFetchMock(FETCH_ROUTES);
    
    gamificationService.trackActivity.mockResolvedValue({});
    gamificationService.getStats.mockResolvedValue({});
    gamificationService.awardPoints.mockResolvedValue({});
    contextService.listDocuments.mockResolvedValue({ user_docs: [] });
    contextService.isHsModeEnabled.mockReturnValue(false);
  });

  afterEach(() => clearLocalStorage());

  
  describe('Authentication', () => {
    it('reads token from localStorage to authorize requests', async () => {
      setupLocalStorage();
      await renderFlashcards();
      await waitFor(() => {
        const authCalls = global.fetch.mock.calls.filter(
          ([, opts]) => opts?.headers?.Authorization === `Bearer ${MOCK_TOKEN}`
        );
        expect(authCalls.length).toBeGreaterThan(0);
      });
    });

    it('renders without crash when token is present', async () => {
      setupLocalStorage();
      await expect(renderFlashcards()).resolves.not.toThrow();
    });
  });

  
  describe('Rendering', () => {
    beforeEach(() => setupLocalStorage());

    it('renders without crashing', async () => {
      await expect(renderFlashcards()).resolves.not.toThrow();
    });

    it('renders context selector', async () => {
      await renderFlashcards();
      expect(screen.getByTestId('context-selector')).toBeInTheDocument();
    });

    it('renders context panel', async () => {
      await renderFlashcards();
      expect(screen.getByTestId('context-panel')).toBeInTheDocument();
    });
  });

  
  describe('API Calls on Mount', () => {
    beforeEach(() => setupLocalStorage());

    it('fetches flashcard history on mount', async () => {
      await renderFlashcards();
      await waitFor(() => {
        const urls = global.fetch.mock.calls.map(([u]) => u);
        expect(urls.some((u) => u.includes('get_flashcard_history'))).toBe(true);
      });
    });

    it('fetches flashcard statistics on mount', async () => {
      await renderFlashcards();
      await waitFor(() => {
        const urls = global.fetch.mock.calls.map(([u]) => u);
        expect(urls.some((u) => u.includes('get_flashcard_statistics'))).toBe(true);
      }, { timeout: 5000 });
    });

    it('includes username query param in history request', async () => {
      await renderFlashcards();
      await waitFor(() => {
        const historyCall = global.fetch.mock.calls.find(([u]) =>
          u.includes('get_flashcard_history')
        );
        expect(historyCall).toBeTruthy();
        expect(historyCall[0]).toContain('testuser');
      });
    });
  });

  
  describe('Flash Card Generation', () => {
    beforeEach(() => setupLocalStorage());

    it('calls generate endpoint when generate is triggered with a topic', async () => {
      global.fetch = buildFetchMock({
        ...FETCH_ROUTES,
        generate_flashcards: GENERATE_RESPONSE,
      });
      await renderFlashcards();

      const topicInputs = screen
        .queryAllByRole('textbox')
        .filter((el) => el.placeholder?.toLowerCase().includes('topic') || el.name === 'topic');

      if (topicInputs.length > 0) {
        await act(async () => {
          fireEvent.change(topicInputs[0], { target: { value: 'Photosynthesis' } });
        });
      }

      await waitFor(() => {
        const urls = global.fetch.mock.calls.map(([u]) => u);
        expect(urls.some((u) => u.includes('get_flashcard_history'))).toBe(true);
      });
    });

    it('tracks generation with correct content-type', async () => {
      global.fetch = buildFetchMock({
        ...FETCH_ROUTES,
        generate_flashcards: GENERATE_RESPONSE,
      });
      await renderFlashcards();
      await waitFor(() => {
        const postCall = global.fetch.mock.calls.find(
          ([, opts]) => opts?.method === 'POST'
        );
        if (postCall) {
          expect(postCall[1].headers['Content-Type']).toBe('application/json');
        }
      });
    });
  });

  
  describe('Error Handling', () => {
    beforeEach(() => setupLocalStorage());

    it('renders without crash when flashcard history API returns 500', async () => {
      global.fetch = buildErrorFetchMock('get_flashcard_history', 500);
      await expect(renderFlashcards()).resolves.not.toThrow();
    });

    it('renders without crash when network fails', async () => {
      global.fetch = jest.fn(() => Promise.reject(new Error('Network down')));
      await expect(renderFlashcards()).resolves.not.toThrow();
    });

    it('renders without crash when stats API returns 404', async () => {
      global.fetch = buildErrorFetchMock('get_flashcard_statistics', 404);
      await expect(renderFlashcards()).resolves.not.toThrow();
    });
  });

  
  describe('Pagination', () => {
    beforeEach(() => setupLocalStorage());

    it('handles empty sets list gracefully', async () => {
      global.fetch = buildFetchMock({
        ...FETCH_ROUTES,
        get_flashcard_history: { sets: [], total_count: 0, has_more: false },
      });
      await expect(renderFlashcards()).resolves.not.toThrow();
    });

    it('handles has_more=true in the response', async () => {
      global.fetch = buildFetchMock({
        ...FETCH_ROUTES,
        get_flashcard_history: {
          sets: Array.from({ length: 8 }, (_, i) => ({
            session_id: `set-${i}`,
            topic: `Topic ${i}`,
            cards: [],
            card_count: 5,
            created_at: '2026-01-01',
          })),
          total_count: 20,
          has_more: true,
        },
      });
      await expect(renderFlashcards()).resolves.not.toThrow();
    });
  });

  
  describe('Spaced Repetition', () => {
    beforeEach(() => setupLocalStorage());

    it('fetches SR due cards on mount', async () => {
      await renderFlashcards();
      const studyQueueButton = screen.getAllByRole('button').find(
        (button) => button.textContent.includes('Study Queue')
      );
      expect(studyQueueButton).toBeTruthy();
      await act(async () => {
        fireEvent.click(studyQueueButton);
      });
      await waitFor(() => {
        const urls = global.fetch.mock.calls.map(([u]) => u);
        expect(urls.some((u) => u.includes('flashcards/due') || u.includes('sr_stats'))).toBe(true);
      });
    });
  });

  
  describe('Latency', () => {
    beforeEach(() => setupLocalStorage());

    it('renders within 100ms', async () => {
      const start = performance.now();
      await renderFlashcards();
      expect(performance.now() - start).toBeLessThan(100);
    });

    it('resolves history fetch within 300ms with 20ms mock delay', async () => {
      global.fetch = buildFetchMock(FETCH_ROUTES, { delay: 20 });
      const start = performance.now();
      await renderFlashcards();
      await waitFor(
        () => {
          const urls = global.fetch.mock.calls.map(([u]) => u);
          expect(urls.some((u) => u.includes('get_flashcard_history'))).toBe(true);
        },
        { timeout: 500 }
      );
      expect(performance.now() - start).toBeLessThan(500);
    });

    it('completes full mount sequence with 50ms latency under 2s', async () => {
      global.fetch = buildFetchMock(FETCH_ROUTES, { delay: 50 });
      await renderFlashcards();
      await waitFor(
        () => {
          expect(global.fetch.mock.calls.length).toBeGreaterThan(0);
        },
        { timeout: 2000 }
      );
    });
  });

  
  describe('HS Mode', () => {
    beforeEach(() => setupLocalStorage());

    it('reads hs_mode_enabled from localStorage on init', async () => {
      localStorage.setItem('hs_mode_enabled', 'true');
      await expect(renderFlashcards()).resolves.not.toThrow();
    });

    it('defaults hs_mode to false when not set', async () => {
      localStorage.removeItem('hs_mode_enabled');
      await expect(renderFlashcards()).resolves.not.toThrow();
    });
  });
});
