import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SoloQuizSession from '../../pages/SoloQuizSession';
import quizAgentService from '../../services/quizAgentService';
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
jest.mock('../../components/SocialHubChrome', () => ({ children }) => <div>{children}</div>);
jest.mock('../../components/MathRenderer', () => ({ content }) => <span>{content}</span>);
jest.mock('../../services/quizAgentService', () => ({ __esModule: true, default: { gradeQuiz: jest.fn(), analyzePerformance: jest.fn() } }));
const quiz = { questions: [{ id: 42, question: 'Which answer?', question_type: 'multiple_choice', options: ['Alpha', 'Beta'], correct_answer: 'B' }], timingMode: 'untimed', quizMode: 'standard' };
beforeEach(() => {
  localStorage.setItem('username', 'ux-test'); sessionStorage.clear();
  sessionStorage.setItem('quizData', JSON.stringify(quiz));
  quizAgentService.gradeQuiz.mockReset();
  quizAgentService.gradeQuiz.mockResolvedValue({ correct_answers: 1, total_questions: 1, percentage: 100, completion_saved: true });
});
afterEach(() => { jest.useRealTimers(); localStorage.clear(); sessionStorage.clear(); });
it('submits the selected final answer without requiring Next', async () => {
  render(<SoloQuizSession/>);
  fireEvent.click(await screen.findByRole('button', {name: /Beta/}));
  fireEvent.click(screen.getByRole('button', {name: /submit quiz/i}));
  await waitFor(() => expect(quizAgentService.gradeQuiz).toHaveBeenCalledWith(expect.objectContaining({answers: {'42':'B'}})));
});
it('restores answers after leaving and reopening an attempt', async () => {
  const first = render(<SoloQuizSession/>);
  fireEvent.click(await screen.findByRole('button', {name: /Beta/}));
  first.unmount();
  render(<SoloQuizSession/>);
  fireEvent.click(await screen.findByRole('button', {name: /submit quiz/i}));
  await waitFor(() => expect(quizAgentService.gradeQuiz).toHaveBeenCalledWith(expect.objectContaining({answers: {'42':'B'}})));
});
it('retains an attempt after failed persistence and retries the same answers', async () => {
  quizAgentService.gradeQuiz.mockRejectedValueOnce(new Error('Offline'));
  render(<SoloQuizSession/>);
  fireEvent.click(await screen.findByRole('button', {name: /Beta/}));
  fireEvent.click(screen.getByRole('button', {name: /submit quiz/i}));
  fireEvent.click(await screen.findByRole('button', {name: /retry saving result/i}));
  await waitFor(() => expect(quizAgentService.gradeQuiz).toHaveBeenCalledTimes(2));
  expect(quizAgentService.gradeQuiz.mock.calls[1][0].answers).toEqual({'42':'B'});
});
it('includes the last sequential answer when delayed submission runs', async () => {
  sessionStorage.setItem('quizData', JSON.stringify({...quiz, quizMode:'sequential-instant'}));
  jest.useFakeTimers();
  render(<SoloQuizSession/>);
  fireEvent.click(screen.getByRole('button', {name: /Beta/}));
  await act(async () => { jest.advanceTimersByTime(1500); });
  expect(quizAgentService.gradeQuiz).toHaveBeenCalledWith(expect.objectContaining({answers: {'42':'B'}}));
});
