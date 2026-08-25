import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => ({ battleId: '42' }),
}));

jest.mock('../../hooks/useSharedWebSocket', () => () => ({ isConnected: true }));
jest.mock('../../services/gamificationService', () => ({ trackBattleResult: jest.fn() }));
jest.mock('../../services/aiJobService', () => ({ queuedAIJsonFetch: jest.fn() }));
jest.mock('../../components/SocialHubChrome', () => ({ children }) => <div>{children}</div>);
jest.mock('../../components/MathRenderer', () => ({ content, className }) => (
  <div className={className}>{content}</div>
));

import QuizBattleSession from '../../pages/QuizBattleSession';

const longQuestion = 'In a federal constitutional system, which remedy most directly addresses an executive action that exceeds the authority delegated by the legislature while preserving the valid remainder of the statutory scheme?';
const longOption = 'A narrowly tailored declaration of invalidity combined with severance of the unauthorized executive provision';

const detailResponse = (mode) => ({
  battle: {
    id: 42,
    subject: 'Comparative constitutional law',
    difficulty: 'advanced',
    status: 'active',
    question_count: 5,
    time_limit_seconds: mode === 'blitz' ? 75 : 300,
    game_mode: mode,
    opponent: { username: 'opponent' },
  },
  questions: [{
    id: 7,
    question: longQuestion,
    options: [longOption, 'Mandamus in every case', 'Automatic constitutional amendment', 'No judicial remedy is available'],
    correct_answer: 0,
    explanation: 'Severance preserves the valid statutory remainder.',
  }],
});

const renderMode = async (mode) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => detailResponse(mode),
  });
  render(<MemoryRouter><QuizBattleSession /></MemoryRouter>);
  await screen.findByText(longQuestion);
};

describe.each([
  ['classic', 'Classic'],
  ['speed', 'Speed Battle'],
  ['blitz', 'Blitz'],
  ['sudden_death', 'Sudden Death'],
])('QuizBattleSession %s mode', (mode, label) => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllTimers();
  });

  it('renders the mode and every complete answer without truncating the DOM content', async () => {
    await renderMode(mode);

    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByText(longOption)).toBeInTheDocument();
    expect(screen.getAllByRole('button').filter((button) => button.classList.contains('answer-option'))).toHaveLength(4);
    if (mode === 'blitz') expect(screen.getByText('15s')).toBeInTheDocument();
  });
});

it('submits Sudden Death immediately after the first incorrect answer', async () => {
  jest.useFakeTimers();
  await renderMode('sudden_death');

  fireEvent.click(screen.getByRole('button', { name: /Mandamus in every case/i }));
  await act(async () => { jest.advanceTimersByTime(1200); });

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/complete_quiz_battle'),
    expect.objectContaining({ method: 'POST' }),
  ));
  const submitCall = global.fetch.mock.calls.find(([url]) => url.includes('/complete_quiz_battle'));
  const payload = JSON.parse(submitCall[1].body);
  expect(payload.answers).toHaveLength(1);
  expect(payload.answers[0].is_correct).toBe(false);
  expect(payload).not.toHaveProperty('score');
});

it('opens a completed battle in results instead of replaying its questions', async () => {
  const completed = detailResponse('classic');
  completed.battle = {
    ...completed.battle,
    status: 'completed',
    your_completed: true,
    opponent_completed: true,
    your_score: 1,
    opponent_score: 0,
    your_result: 'win',
    your_answers: [{ selected_answer: 0, is_correct: true }],
    opponent_answers: [{ selected_answer: 1, is_correct: false }],
  };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => completed });

  render(<MemoryRouter><QuizBattleSession /></MemoryRouter>);

  expect(await screen.findByRole('heading', { name: 'Victory!' })).toBeInTheDocument();
  expect(screen.getByText('Question by Question Breakdown')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: new RegExp(longOption, 'i') })).not.toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
