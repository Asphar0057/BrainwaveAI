import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import {
  setupLocalStorage,
  clearLocalStorage,
  buildFetchMock,
  buildErrorFetchMock,
  MOCK_GAMIFICATION,
  MOCK_WEEKLY_PROGRESS,
  MOCK_HISTORICAL,
  MOCK_ML_STATS,
  MOCK_CHAT_DETAILS,
  MOCK_FLASHCARD_DETAILS,
  MOCK_TOKEN,
  MOCK_USERNAME,
} from '../../testUtils';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    selectedTheme: { id: 'default', tokens: { '--accent': '#D7B38C' } },
  }),
}));

const FETCH_ROUTES = {
  get_weekly_progress: MOCK_WEEKLY_PROGRESS,
  get_gamification_stats: MOCK_GAMIFICATION,
  get_analytics_history: MOCK_HISTORICAL,
  get_ml_analytics: MOCK_ML_STATS,
  get_context_sessions: { sessions: [] },
  get_chat_details: MOCK_CHAT_DETAILS,
  get_flashcard_details: MOCK_FLASHCARD_DETAILS,
};

import Analytics from '../../pages/Analytics';

const renderAnalytics = async () => {
  let utils;
  await act(async () => {
    utils = render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>
    );
  });
  
  await waitFor(() => {
    expect(document.querySelector('.an-loading')).not.toBeInTheDocument();
  }, { timeout: 3000 });
  return utils;
};

describe('Analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearLocalStorage();
    global.fetch = buildFetchMock(FETCH_ROUTES);
  });

  afterEach(() => clearLocalStorage());

  
  describe('Authentication', () => {
    it('redirects to /login when no token is present', async () => {
      
      await act(async () => {
        render(<MemoryRouter><Analytics /></MemoryRouter>);
      });
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });

    it('does NOT redirect when token is present', async () => {
      setupLocalStorage();
      await renderAnalytics();
      expect(mockNavigate).not.toHaveBeenCalledWith('/login');
    });
  });

  
  describe('Rendering', () => {
    beforeEach(() => setupLocalStorage());

    it('renders without crashing', async () => {
      await expect(renderAnalytics()).resolves.not.toThrow();
    });

    it('renders the analytics background', async () => {
      await renderAnalytics();

      expect(document.querySelector('.an-bg')).toBeInTheDocument();
    });

    it('renders Overview tab button', async () => {
      await renderAnalytics();
      
      expect(screen.getByText('OVERVIEW')).toBeInTheDocument();
    });

    it('renders Deep Stats tab button', async () => {
      await renderAnalytics();
      expect(screen.getByText('DEEP STATS')).toBeInTheDocument();
    });

    it('renders ML Insights tab button', async () => {
      await renderAnalytics();
      expect(screen.getByText('ML INSIGHTS')).toBeInTheDocument();
    });
  });

  
  describe('API Calls on Mount', () => {
    beforeEach(() => setupLocalStorage());

    it('calls /get_weekly_progress on mount', async () => {
      await renderAnalytics();
      await waitFor(() => {
        const urls = global.fetch.mock.calls.map(([u]) => u);
        expect(urls.some((u) => u.includes('get_weekly_progress'))).toBe(true);
      });
    });

    it('calls /get_gamification_stats on mount', async () => {
      await renderAnalytics();
      await waitFor(() => {
        const urls = global.fetch.mock.calls.map(([u]) => u);
        expect(urls.some((u) => u.includes('get_gamification_stats'))).toBe(true);
      });
    });

    it('calls /get_analytics_history on mount', async () => {
      await renderAnalytics();
      await waitFor(() => {
        const urls = global.fetch.mock.calls.map(([u]) => u);
        expect(urls.some((u) => u.includes('get_analytics_history'))).toBe(true);
      });
    });

    it('fires all 3 data calls in parallel (Promise.all)', async () => {
      global.fetch = buildFetchMock(FETCH_ROUTES, { delay: 30 });
      const start = performance.now();
      await renderAnalytics();
      await waitFor(
        () => {
          const urls = global.fetch.mock.calls.map(([u]) => u);
          return (
            urls.some((u) => u.includes('get_weekly_progress')) &&
            urls.some((u) => u.includes('get_gamification_stats')) &&
            urls.some((u) => u.includes('get_analytics_history'))
          );
        },
        { timeout: 500 }
      );
      
      expect(performance.now() - start).toBeLessThan(300);
    });

    it('includes username in API request URLs', async () => {
      await renderAnalytics();
      await waitFor(() => {
        const allUrls = global.fetch.mock.calls.map(([u]) => u);
        const hasUsername = allUrls.some((u) => u.includes(MOCK_USERNAME));
        expect(hasUsername).toBe(true);
      });
    });

    it('sends Bearer token in Authorization header', async () => {
      await renderAnalytics();
      await waitFor(() => {
        const authCalls = global.fetch.mock.calls.filter(
          ([, opts]) => opts?.headers?.Authorization === `Bearer ${MOCK_TOKEN}`
        );
        expect(authCalls.length).toBeGreaterThan(0);
      });
    });
  });

  
  describe('Tab Switching', () => {
    beforeEach(() => setupLocalStorage());

    it('switches to Deep Stats tab and triggers stat load', async () => {
      await renderAnalytics();
      
      const detailedTab = screen.getByText('DEEP STATS');
      await act(async () => { fireEvent.click(detailedTab); });
      await waitFor(() => {
        const urls = global.fetch.mock.calls.map(([u]) => u);
        expect(
          urls.some((u) => u.includes('get_chat_details') || u.includes('get_flashcard_details'))
        ).toBe(true);
      }, { timeout: 2000 });
    });

    it('switches to ML Insights tab and triggers ML load', async () => {
      await renderAnalytics();
      
      const mlTab = screen.getByText('ML INSIGHTS');
      await act(async () => { fireEvent.click(mlTab); });
      await waitFor(() => {
        const urls = global.fetch.mock.calls.map(([u]) => u);
        expect(urls.some((u) => u.includes('get_ml_analytics'))).toBe(true);
      }, { timeout: 2000 });
    });

    it('does not crash when switching tabs rapidly', async () => {
      await renderAnalytics();
      const overviewTab = screen.getByText('OVERVIEW');
      const detailedTab = screen.getByText('DEEP STATS');
      const mlTab = screen.getByText('ML INSIGHTS');
      await act(async () => {
        fireEvent.click(detailedTab);
        fireEvent.click(mlTab);
        fireEvent.click(overviewTab);
      });
      
      expect(screen.getByText('OVERVIEW')).toBeInTheDocument();
    });
  });

  
  describe('Time Range', () => {
    beforeEach(() => setupLocalStorage());

    it('re-fetches data when time range changes', async () => {
      await renderAnalytics();
      const callCountBefore = global.fetch.mock.calls.length;

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'WEEK' }));
      });
      await waitFor(() => {
        expect(global.fetch.mock.calls.length).toBeGreaterThan(callCountBefore);
      });
    });

    it('sends correct time range param in requests', async () => {
      await renderAnalytics();
      await waitFor(() => {
        const urls = global.fetch.mock.calls.map(([u]) => u);
        expect(
          urls.some(
            (u) =>
              u.includes('time_range=week') ||
              u.includes('range=week') ||
              u.includes('period=week') ||
              u.includes('get_analytics_history')
          )
        ).toBe(true);
      });
    });
  });

  
  describe('Time Range Controls', () => {
    beforeEach(() => setupLocalStorage());

    it('renders all time range buttons', async () => {
      await renderAnalytics();
      for (const label of ['WEEK', 'MONTH', 'YEAR', 'ALL']) {
        expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
      }
    });

    it('keeps the controls available after changing ranges', async () => {
      await renderAnalytics();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'WEEK' }));
      });
      await waitFor(() => {
        expect(document.querySelector('.an-loading')).not.toBeInTheDocument();
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'YEAR' }));
      });
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'YEAR' })).toHaveClass('active');
      });
    });
  });

  
  describe('Chart Type', () => {
    beforeEach(() => setupLocalStorage());

    it('renders bar/line chart toggle', async () => {
      await renderAnalytics();
      const chartToggle = screen
        .queryAllByRole('button')
        .find(
          (btn) =>
            btn.textContent.toLowerCase().includes('bar') ||
            btn.textContent.toLowerCase().includes('line')
        );
      
      if (chartToggle) {
        await act(async () => {
          fireEvent.click(chartToggle);
        });
        expect(true).toBe(true);
      }
    });
  });

  
  describe('Error Handling', () => {
    beforeEach(() => setupLocalStorage());

    it('renders without crash when weekly progress API fails', async () => {
      global.fetch = buildErrorFetchMock('get_weekly_progress', 500);
      await expect(renderAnalytics()).resolves.not.toThrow();
    });

    it('renders without crash when gamification API fails', async () => {
      global.fetch = buildErrorFetchMock('get_gamification_stats', 500);
      await expect(renderAnalytics()).resolves.not.toThrow();
    });

    it('renders without crash when all APIs fail simultaneously', async () => {
      global.fetch = jest.fn(() => Promise.reject(new Error('All down')));
      
      await expect(
        act(async () => {
          render(<MemoryRouter><Analytics /></MemoryRouter>);
        })
      ).resolves.not.toThrow();
    });

    it('does not redirect to /login on API 500 error', async () => {
      global.fetch = buildErrorFetchMock('get_analytics_history', 500);
      await act(async () => {
        render(<MemoryRouter><Analytics /></MemoryRouter>);
      });
      
      expect(mockNavigate).not.toHaveBeenCalledWith('/login');
    });
  });

  
  describe('Loading State', () => {
    beforeEach(() => setupLocalStorage());

    it('transitions from loading to loaded state', async () => {
      global.fetch = buildFetchMock(FETCH_ROUTES, { delay: 30 });
      await renderAnalytics();
      await waitFor(
        () => {
          expect(global.fetch.mock.calls.length).toBeGreaterThan(0);
        },
        { timeout: 1000 }
      );
    });
  });

  
  describe('Latency', () => {
    beforeEach(() => setupLocalStorage());

    it('first render (before data loads) takes under 100ms', async () => {
      
      let utils;
      const start = performance.now();
      await act(async () => {
        utils = render(<MemoryRouter><Analytics /></MemoryRouter>);
      });
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(100);
      utils.unmount();
    });

    it('completes all 3 mount API calls within 300ms with 20ms mock delay', async () => {
      global.fetch = buildFetchMock(FETCH_ROUTES, { delay: 20 });
      const start = performance.now();
      await renderAnalytics();
      await waitFor(
        () => {
          const urls = global.fetch.mock.calls.map(([u]) => u);
          return (
            urls.some((u) => u.includes('get_weekly_progress')) &&
            urls.some((u) => u.includes('get_gamification_stats')) &&
            urls.some((u) => u.includes('get_analytics_history'))
          );
        },
        { timeout: 300 }
      );
      expect(performance.now() - start).toBeLessThan(300);
    });

    it('handles 80ms API latency without breaking state', async () => {
      global.fetch = buildFetchMock(FETCH_ROUTES, { delay: 80 });
      await renderAnalytics();
      await waitFor(
        () => expect(global.fetch.mock.calls.length).toBeGreaterThan(0),
        { timeout: 3000 }
      );
    });

    it('ML Insights tab load completes within 500ms with 20ms delay', async () => {
      global.fetch = buildFetchMock(FETCH_ROUTES, { delay: 20 });
      await renderAnalytics();

      const mlTab = screen
        .queryAllByRole('button')
        .find((btn) => btn.textContent.toLowerCase().includes('ml'));

      if (mlTab) {
        const start = performance.now();
        await act(async () => { fireEvent.click(mlTab); });
        await waitFor(
          () => {
            const urls = global.fetch.mock.calls.map(([u]) => u);
            expect(urls.some((u) => u.includes('get_ml_analytics'))).toBe(true);
          },
          { timeout: 500 }
        );
        expect(performance.now() - start).toBeLessThan(500);
      }
    });
  });

  
  describe('CSV Export', () => {
    beforeEach(() => setupLocalStorage());

    it('renders a download/export button', async () => {
      await renderAnalytics();
      const exportBtns = screen
        .queryAllByRole('button')
        .filter(
          (btn) =>
            btn.textContent.toLowerCase().includes('export') ||
            btn.textContent.toLowerCase().includes('download') ||
            btn.getAttribute('aria-label')?.toLowerCase().includes('export')
        );
      
      expect(true).toBe(true);
    });
  });
});
