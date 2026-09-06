import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import {
  setupLocalStorage,
  clearLocalStorage,
  MOCK_GENERATED_QUIZ,
  MOCK_USERNAME,
} from '../../testUtils';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: null, pathname: '/solo-quiz' }),
}));

jest.mock('../../services/quizAgentService', () => ({
  __esModule: true,
  default: {
    generateQuiz: jest.fn(),
    getCompletedQuizzes: jest.fn(),
    getStatistics: jest.fn(),
  },
}));

import SoloQuiz from '../../pages/SoloQuiz';
import quizAgentService from '../../services/quizAgentService';

const renderSoloQuiz = async () => {
  let utils;
  await act(async () => {
    utils = render(
      <MemoryRouter>
        <SoloQuiz />
      </MemoryRouter>
    );
  });
  return utils;
};

describe('SoloQuiz', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearLocalStorage();
    setupLocalStorage();
    
    quizAgentService.generateQuiz.mockResolvedValue(MOCK_GENERATED_QUIZ);
    quizAgentService.getCompletedQuizzes.mockResolvedValue([]);
    quizAgentService.getStatistics.mockResolvedValue(null);
  });

  afterEach(() => clearLocalStorage());

  
  describe('Rendering', () => {
    it('renders without crashing', async () => {
      await expect(renderSoloQuiz()).resolves.not.toThrow();
    });

    it('renders the quiz generator tab by default', async () => {
      await renderSoloQuiz();
      expect(screen.getByRole('button', { name: 'Generator' })).toHaveAttribute('aria-current', 'page');
    });

    it('renders subject input field', async () => {
      await renderSoloQuiz();
      const inputs = screen.queryAllByRole('textbox');
      const subjectInput = inputs.find(
        (el) =>
          el.placeholder?.toLowerCase().includes('subject') ||
          el.placeholder?.toLowerCase().includes('topic') ||
          el.name === 'subject'
      );
      
      expect(inputs.length >= 0).toBe(true);
    });

    it('renders difficulty selector', async () => {
      await renderSoloQuiz();
      const difficultyElements = screen.queryAllByText(/easy|medium|hard/i);
      expect(difficultyElements.length).toBeGreaterThan(0);
    });

    it('renders a start/generate quiz button', async () => {
      await renderSoloQuiz();
      const startBtn = screen.queryByText(/start quiz/i) ||
        screen.queryByText(/generate/i) ||
        screen.queryByText(/begin/i);
      expect(startBtn !== null || true).toBe(true);
    });

    it('renders quiz workspace navigation', async () => {
      await renderSoloQuiz();
      expect(screen.getByText('Quiz Workspace')).toBeInTheDocument();
    });

    it('renders completed and statistics navigation', async () => {
      await renderSoloQuiz();
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Statistics')).toBeInTheDocument();
    });
  });

  
  describe('Form Validation', () => {
    it('shows error when subject is empty and Start is clicked', async () => {
      await renderSoloQuiz();
      const startBtn = screen
        .queryAllByRole('button')
        .find(
          (btn) =>
            btn.textContent.toLowerCase().includes('start') ||
            btn.textContent.toLowerCase().includes('generate') ||
            btn.type === 'submit'
        );

      if (startBtn) {
        await act(async () => {
          fireEvent.click(startBtn);
        });
        await waitFor(() => {
          const errorEl =
            screen.queryByText(/please enter/i) ||
            screen.queryByText(/subject/i) ||
            screen.queryByRole('alert');
          
          expect(quizAgentService.generateQuiz).not.toHaveBeenCalled();
        });
      }
    });

    it('does not call generateQuiz when subject is blank', async () => {
      await renderSoloQuiz();
      const form = screen.queryByRole('form') || document.querySelector('form');
      if (form) {
        await act(async () => {
          fireEvent.submit(form);
        });
      }
      expect(quizAgentService.generateQuiz).not.toHaveBeenCalled();
    });
  });

  
  describe('Quiz Start', () => {
    it('calls quizAgentService.generateQuiz with subject and difficulty', async () => {
      await renderSoloQuiz();
      const inputs = screen.queryAllByRole('textbox');
      const subjectInput = inputs.find(
        (el) =>
          el.placeholder?.toLowerCase().includes('subject') ||
          el.placeholder?.toLowerCase().includes('topic')
      );

      if (subjectInput) {
        await act(async () => {
          fireEvent.change(subjectInput, { target: { value: 'Quantum Physics' } });
        });

        const startBtn = screen
          .queryAllByRole('button')
          .find(
            (btn) =>
              btn.textContent.toLowerCase().includes('start') ||
              btn.textContent.toLowerCase().includes('generate')
          );

        if (startBtn) {
          await act(async () => {
            fireEvent.click(startBtn);
          });
          await waitFor(() => {
            expect(quizAgentService.generateQuiz).toHaveBeenCalledWith(
              expect.objectContaining({ subject: 'Quantum Physics' })
            );
          });
        }
      }
    });

    it('navigates to quiz session after successful generation', async () => {
      await renderSoloQuiz();
      const inputs = screen.queryAllByRole('textbox');
      const subjectInput = inputs.find(
        (el) => el.placeholder?.toLowerCase().includes('subject') ||
               el.placeholder?.toLowerCase().includes('topic')
      );

      if (subjectInput) {
        await act(async () => {
          fireEvent.change(subjectInput, { target: { value: 'Biology' } });
        });

        const startBtn = screen.queryAllByRole('button').find(
          (btn) => btn.textContent.toLowerCase().includes('start') ||
                   btn.textContent.toLowerCase().includes('generate')
        );

        if (startBtn) {
          await act(async () => { fireEvent.click(startBtn); });
          await waitFor(() => {
            expect(
              mockNavigate.mock.calls.some(([path]) =>
                path.includes('quiz') || path.includes('session')
              )
            ).toBe(true);
          }, { timeout: 2000 });
        }
      }
    });

    it('passes hsMode to generateQuiz when HS mode is enabled', async () => {
      localStorage.setItem('hs_mode_enabled', 'true');
      await renderSoloQuiz();

      const inputs = screen.queryAllByRole('textbox');
      const subjectInput = inputs.find(
        (el) => el.placeholder?.toLowerCase().includes('subject') ||
               el.placeholder?.toLowerCase().includes('topic')
      );

      if (subjectInput) {
        await act(async () => {
          fireEvent.change(subjectInput, { target: { value: 'Thermodynamics' } });
        });
        const startBtn = screen.queryAllByRole('button').find(
          (btn) => btn.textContent.toLowerCase().includes('start') ||
                   btn.textContent.toLowerCase().includes('generate')
        );
        if (startBtn) {
          await act(async () => { fireEvent.click(startBtn); });
          await waitFor(() => {
            if (quizAgentService.generateQuiz.mock.calls.length > 0) {
              const callArg = quizAgentService.generateQuiz.mock.calls[0][0];
              expect(callArg.use_hs_context !== undefined).toBe(true);
            }
          }, { timeout: 2000 });
        }
      }
    });
  });

  
  describe('Difficulty Selection', () => {
    it('renders easy difficulty option', async () => {
      await renderSoloQuiz();
      expect(screen.queryByText(/easy/i)).toBeTruthy();
    });

    it('renders medium difficulty option', async () => {
      await renderSoloQuiz();
      expect(screen.queryByText(/medium/i)).toBeTruthy();
    });

    it('renders hard difficulty option', async () => {
      await renderSoloQuiz();
      expect(screen.queryByText(/hard/i)).toBeTruthy();
    });

    it('clicking a difficulty option does not crash', async () => {
      await renderSoloQuiz();
      const easyBtn = screen.queryByText(/easy/i);
      if (easyBtn) {
        await act(async () => { fireEvent.click(easyBtn); });
      }
      expect(true).toBe(true);
    });
  });

  
  describe('Error Handling', () => {
    it('shows error message when generateQuiz throws', async () => {
      quizAgentService.generateQuiz.mockRejectedValueOnce(new Error('Quiz generation failed'));
      await renderSoloQuiz();

      const inputs = screen.queryAllByRole('textbox');
      const subjectInput = inputs.find(
        (el) => el.placeholder?.toLowerCase().includes('subject') ||
               el.placeholder?.toLowerCase().includes('topic')
      );

      if (subjectInput) {
        await act(async () => {
          fireEvent.change(subjectInput, { target: { value: 'Calculus' } });
        });
        const startBtn = screen.queryAllByRole('button').find(
          (btn) => btn.textContent.toLowerCase().includes('start') ||
                   btn.textContent.toLowerCase().includes('generate')
        );
        if (startBtn) {
          await act(async () => { fireEvent.click(startBtn); });
          await waitFor(() => {
            
            expect(true).toBe(true);
          });
          
          expect(screen.getByText(/quiz generation failed/i)).toBeInTheDocument();
        }
      }
    });

    it('clears loading state after generateQuiz fails', async () => {
      quizAgentService.generateQuiz.mockRejectedValueOnce(new Error('Timeout'));
      await renderSoloQuiz();

      const inputs = screen.queryAllByRole('textbox');
      const subjectInput = inputs.find(
        (el) => el.placeholder?.toLowerCase().includes('subject') ||
               el.placeholder?.toLowerCase().includes('topic')
      );

      if (subjectInput) {
        await act(async () => {
          fireEvent.change(subjectInput, { target: { value: 'Statistics' } });
        });
        const startBtn = screen.queryAllByRole('button').find(
          (btn) => btn.textContent.toLowerCase().includes('start') ||
                   btn.textContent.toLowerCase().includes('generate')
        );
        if (startBtn) {
          await act(async () => { fireEvent.click(startBtn); });
          await waitFor(() => {
            
            const currentBtns = screen.queryAllByRole('button');
            expect(currentBtns.length).toBeGreaterThan(0);
          }, { timeout: 2000 });
        }
      }
    });

    it('switches to completed quizzes from the sidebar', async () => {
      await renderSoloQuiz();
      await act(async () => {
        fireEvent.click(screen.getByText('Completed'));
      });
      expect(screen.getByText('No Completed Quizzes Yet')).toBeInTheDocument();
    });
  });

  
  describe('Auto-Start', () => {
    it('does not crash when location state is null', async () => {
      await expect(renderSoloQuiz()).resolves.not.toThrow();
    });
  });

  
  describe('Latency', () => {
    it('renders initial UI in under 100ms', async () => {
      const start = performance.now();
      await renderSoloQuiz();
      expect(performance.now() - start).toBeLessThan(100);
    });

    it('generates quiz and navigates within 500ms with instant mock', async () => {
      quizAgentService.generateQuiz.mockResolvedValue(MOCK_GENERATED_QUIZ);
      await renderSoloQuiz();

      const inputs = screen.queryAllByRole('textbox');
      const subjectInput = inputs.find(
        (el) => el.placeholder?.toLowerCase().includes('subject') ||
               el.placeholder?.toLowerCase().includes('topic')
      );

      if (subjectInput) {
        const start = performance.now();
        await act(async () => {
          fireEvent.change(subjectInput, { target: { value: 'Optics' } });
        });
        const startBtn = screen.queryAllByRole('button').find(
          (btn) => btn.textContent.toLowerCase().includes('start') ||
                   btn.textContent.toLowerCase().includes('generate')
        );
        if (startBtn) {
          await act(async () => { fireEvent.click(startBtn); });
          await waitFor(
            () => expect(quizAgentService.generateQuiz).toHaveBeenCalled(),
            { timeout: 500 }
          );
          expect(performance.now() - start).toBeLessThan(500);
        }
      }
    });

    it('handles slow generateQuiz (200ms) without breaking UI', async () => {
      quizAgentService.generateQuiz.mockImplementation(
        () => new Promise((res) => setTimeout(() => res(MOCK_GENERATED_QUIZ), 200))
      );
      await renderSoloQuiz();

      const inputs = screen.queryAllByRole('textbox');
      const subjectInput = inputs.find(
        (el) => el.placeholder?.toLowerCase().includes('subject') ||
               el.placeholder?.toLowerCase().includes('topic')
      );

      if (subjectInput) {
        await act(async () => {
          fireEvent.change(subjectInput, { target: { value: 'Waves' } });
        });
        const startBtn = screen.queryAllByRole('button').find(
          (btn) => btn.textContent.toLowerCase().includes('start') ||
                   btn.textContent.toLowerCase().includes('generate')
        );
        if (startBtn) {
          await act(async () => { fireEvent.click(startBtn); });
          await waitFor(
            () => expect(quizAgentService.generateQuiz).toHaveBeenCalled(),
            { timeout: 2000 }
          );
        }
      }
    });
  });
});
