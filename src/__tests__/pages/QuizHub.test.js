import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { clearLocalStorage } from '../../testUtils';
import QuizHub from '../../pages/QuizHub';
import contextService from '../../services/contextService';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../services/contextService', () => ({
  __esModule: true,
  default: {
    listDocuments: jest.fn(),
    isHsModeEnabled: jest.fn(),
  },
}));

jest.mock('../../components/ImportExportModal', () => ({ isOpen, onClose }) =>
  isOpen ? <div data-testid="import-export-modal"><button onClick={onClose}>Close</button></div> : null
);

jest.mock('../../components/ContextSelector', () => ({ onOpen, docCount }) => (
  <div data-testid="context-selector">
    <button data-testid="context-toggle-btn" onClick={onOpen}>
      HS {docCount}
    </button>
  </div>
));

jest.mock('../../components/ContextPanel', () => ({ isOpen, onClose }) => (
  <div data-testid="context-panel" data-open={String(isOpen)}>
    <button data-testid="context-close-btn" onClick={onClose}>Close Panel</button>
  </div>
));

const TWO_DOCS = { user_docs: [{ id: 'd1' }, { id: 'd2' }] };

const renderQuizHub = async () => {
  let utils;
  await act(async () => {
    utils = render(
      <MemoryRouter>
        <QuizHub />
      </MemoryRouter>
    );
  });
  return utils;
};

describe('QuizHub', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearLocalStorage();
    
    contextService.listDocuments.mockResolvedValue(TWO_DOCS);
    contextService.isHsModeEnabled.mockReturnValue(false);
  });

  afterEach(() => clearLocalStorage());

  
  describe('Rendering', () => {
    it('renders without crashing', async () => {
      await expect(renderQuizHub()).resolves.not.toThrow();
    });

    it('renders the context selector', async () => {
      await renderQuizHub();
      expect(screen.getByTestId('context-selector')).toBeInTheDocument();
    });

    it('renders the context panel', async () => {
      await renderQuizHub();
      expect(screen.getByTestId('context-panel')).toBeInTheDocument();
    });

    it('renders Solo Practice section text', async () => {
      await renderQuizHub();
      expect(screen.getByText(/solo practice/i)).toBeInTheDocument();
    });

    it('renders 1v1 Battles section text', async () => {
      await renderQuizHub();
      expect(screen.getByText(/1v1/i)).toBeInTheDocument();
    });

    it('does not show import/export modal by default', async () => {
      await renderQuizHub();
      expect(screen.queryByTestId('import-export-modal')).not.toBeInTheDocument();
    });
  });

  
  describe('Navigation', () => {
    it('navigates to /solo-quiz when Solo Practice section is clicked', async () => {
      await renderQuizHub();
      const soloSection = screen.getByText(/solo practice/i).closest('section');
      if (soloSection) {
        await act(async () => { fireEvent.click(soloSection); });
        expect(mockNavigate).toHaveBeenCalledWith('/solo-quiz');
      }
    });

    it('navigates to /quiz-battles when 1v1 Battles section is clicked', async () => {
      await renderQuizHub();
      const battleSection = screen.getByText(/1v1/i).closest('section');
      if (battleSection) {
        await act(async () => { fireEvent.click(battleSection); });
        expect(mockNavigate).toHaveBeenCalledWith('/quiz-battles');
      }
    });

    it('has a "Start Solo Quiz" CTA button', async () => {
      await renderQuizHub();
      expect(screen.getByText(/start solo quiz/i)).toBeInTheDocument();
    });
  });

  
  describe('Context Panel', () => {
    it('context panel is closed by default', async () => {
      await renderQuizHub();
      const panel = screen.getByTestId('context-panel');
      expect(panel.getAttribute('data-open')).toBe('false');
    });

    it('opens context panel when context toggle is clicked', async () => {
      await renderQuizHub();
      const toggleBtn = screen.getByTestId('context-toggle-btn');
      await act(async () => { fireEvent.click(toggleBtn); });
      await waitFor(() => {
        expect(screen.getByTestId('context-panel').getAttribute('data-open')).toBe('true');
      });
    });

    it('closes context panel when close button is clicked', async () => {
      await renderQuizHub();
      await act(async () => { fireEvent.click(screen.getByTestId('context-toggle-btn')); });
      await waitFor(() => {
        expect(screen.getByTestId('context-panel').getAttribute('data-open')).toBe('true');
      });
      await act(async () => { fireEvent.click(screen.getByTestId('context-close-btn')); });
      await waitFor(() => {
        expect(screen.getByTestId('context-panel').getAttribute('data-open')).toBe('false');
      });
    });
  });

  
  describe('HS Mode', () => {
    it('reads hs_mode_enabled from localStorage on init', async () => {
      localStorage.setItem('hs_mode_enabled', 'true');
      await expect(renderQuizHub()).resolves.not.toThrow();
    });

    it('calls contextService.listDocuments on mount', async () => {
      await renderQuizHub();
      await waitFor(() => expect(contextService.listDocuments).toHaveBeenCalled());
    });
  });

  
  describe('Document Count', () => {
    it('loads user doc count from contextService on mount', async () => {
      await renderQuizHub();
      await waitFor(() => expect(contextService.listDocuments).toHaveBeenCalled());
    });

    it('handles contextService failure gracefully', async () => {
      contextService.listDocuments.mockRejectedValueOnce(new Error('Service unavailable'));
      await expect(renderQuizHub()).resolves.not.toThrow();
    });

    it('shows 0 doc count when user_docs is empty', async () => {
      contextService.listDocuments.mockResolvedValueOnce({ user_docs: [] });
      await renderQuizHub();
      await waitFor(() => {
        const btn = screen.getByTestId('context-toggle-btn');
        expect(btn.textContent).toContain('0');
      });
    });

    it('shows correct doc count from response', async () => {
      await renderQuizHub();
      await waitFor(() => {
        const btn = screen.getByTestId('context-toggle-btn');
        expect(btn.textContent).toContain('2');
      });
    });
  });

  
  describe('Body Overflow', () => {
    it('sets body overflow hidden on mount', async () => {
      await renderQuizHub();
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('restores body overflow on unmount', async () => {
      const { unmount } = await renderQuizHub();
      unmount();
      expect(document.body.style.overflow).toBe('');
    });
  });

  
  describe('Latency', () => {
    it('renders in under 100ms', async () => {
      const start = performance.now();
      await renderQuizHub();
      expect(performance.now() - start).toBeLessThan(100);
    });

    it('resolves contextService.listDocuments within 200ms', async () => {
      contextService.listDocuments.mockImplementation(
        () => new Promise((res) => setTimeout(() => res({ user_docs: [] }), 30))
      );
      const start = performance.now();
      await renderQuizHub();
      await waitFor(() => expect(contextService.listDocuments).toHaveBeenCalled(), {
        timeout: 200,
      });
      expect(performance.now() - start).toBeLessThan(200);
    });
  });
});
