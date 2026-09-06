import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LearningPathDetail from '../../pages/LearningPathDetail';
import LearningPathActivity from '../../components/LearningPathActivity';
import service from '../../services/learningPathService';
jest.mock('../../services/learningPathService', () => ({ __esModule: true, default: {
  getPath: jest.fn(), getNodeNote: jest.fn(), saveNodeNote: jest.fn(),
  generateNodeContent: jest.fn(), updateNodeProgress: jest.fn(), updateDifficultyView: jest.fn(),
} }));
jest.mock('../../components/SocialHubChrome', () => ({ children }) => <div>{children}</div>);
jest.mock('../../components/MathRenderer', () => ({ content }) => <div>{content}</div>);
const node = { id: 'n1', title: 'Invoice validation', description: 'Check invoice totals',
  content_plan: [{ type: 'notes', description: 'Explain the validation checks' }],
  core_sections: [], progress: { status: 'unlocked', evidence: {} } };
beforeEach(() => {
  jest.clearAllMocks();
  Element.prototype.scrollIntoView = jest.fn();
  service.getPath.mockResolvedValue({ path: { id: 'p1', title: 'Invoice agents',
    nodes: [node], progress: { completion_percentage: 0, total_xp_earned: 0 } } });
  service.getNodeNote.mockResolvedValue({ content: 'My existing work' });
  service.saveNodeNote.mockResolvedValue({});
  service.updateNodeProgress.mockResolvedValue({});
});
const renderPath = () => render(<MemoryRouter initialEntries={['/learning-paths/p1']}>
  <Routes><Route path="/learning-paths/:pathId" element={<LearningPathDetail />} /></Routes>
</MemoryRouter>);
it('opens existing node notes without generating content and persists completion only on save', async () => {
  renderPath();
  fireEvent.click(await screen.findByRole('button', { name: /launch activity/i }));
  expect(await screen.findByLabelText('Your lesson notes')).toHaveValue('My existing work');
  expect(service.generateNodeContent).not.toHaveBeenCalled();
  expect(service.updateNodeProgress).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /save note/i }));
  await waitFor(() => expect(service.updateNodeProgress).toHaveBeenCalledWith('p1', 'n1', 'notes', true, expect.any(Object)));
  expect(service.saveNodeNote).toHaveBeenCalledWith('p1', 'n1', 'My existing work');
});
it('shows all done instead of relaunching the first completed activity', async () => {
  service.getPath.mockResolvedValue({ path: { id: 'p1', title: 'Invoice agents', progress: {}, nodes: [{ ...node,
    progress: { status: 'completed', evidence: { notes: { completed: true } } } }] } });
  renderPath();
  expect(await screen.findByRole('button', { name: /all done/i })).toBeDisabled();
});
it('requires reviewing each flashcard before saving and permits retry after failure', async () => {
  const onComplete = jest.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({});
  render(<LearningPathActivity node={node} activity={{ type: 'flashcards', data: { flashcards: [
    { question: 'What is validated?', answer: 'Invoice totals' }, { question: 'Why?', answer: 'Detect mismatches' },
  ] } }} onComplete={onComplete} onClose={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Finish flashcards' })).toBeDisabled();
  fireEvent.click(screen.getByText('Reveal answer'));
  fireEvent.click(screen.getByText('Next card'));
  fireEvent.click(screen.getByText('Reveal answer'));
  fireEvent.click(screen.getByText('Finish flashcards'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
  fireEvent.click(screen.getByText('Finish flashcards'));
  expect(await screen.findByText('Practice saved')).toBeDisabled();
});
it('grades quiz answers before saving evidence', async () => {
  const onComplete = jest.fn().mockResolvedValue({});
  render(<LearningPathActivity node={node} activity={{ type: 'quiz', data: { questions: [
    { question_text: 'Which check?', options: ['Totals', 'Color'], correct_answer: 'Totals', explanation: 'Reconcile totals.' },
  ] } }} onComplete={onComplete} onClose={jest.fn()} />);
  expect(screen.getByText('Check answers')).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Totals'));
  fireEvent.click(screen.getByText('Check answers'));
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith({ score: 100, answers: { 0: 0 } }));
  expect(screen.getByText(/1 of 1 correct/)).toBeInTheDocument();
});

it('replaces the lesson when switching difficulty and never shows the old fallback', async () => {
  service.updateDifficultyView.mockImplementation(async (_path, _node, level) => ({
    lesson: { version: 1, difficulty: level, core_sections: [{
      title: `${level} validation`, content: `${level} specific teaching`,
      example: `${level} worked example`, practice: 'Reconcile these totals', solution: 'Explained result',
    }] },
  }));
  renderPath();
  fireEvent.click(await screen.findByRole('tab', { name: /Learn/ }));
  expect(await screen.findByText('intermediate specific teaching')).toBeInTheDocument();
  for (const level of ['Beginner', 'Advanced']) {
    fireEvent.click(screen.getByRole('button', { name: level, exact: true }));
    expect(await screen.findByText(`${level.toLowerCase()} specific teaching`)).toBeInTheDocument();
    expect(screen.queryByText('intermediate specific teaching')).not.toBeInTheDocument();
  }
  expect(service.updateDifficultyView).toHaveBeenLastCalledWith('p1', 'n1', 'advanced');
  expect(screen.getByText('Show worked solution')).toBeInTheDocument();
});

it('shows a retry when lesson preparation fails', async () => {
  service.updateDifficultyView.mockRejectedValueOnce(new Error('Lesson unavailable'))
    .mockResolvedValueOnce({ lesson: { version: 1, core_sections: [{ title: 'Validation', content: 'Recovered lesson' }] } });
  renderPath();
  fireEvent.click(await screen.findByRole('tab', { name: /Learn/ }));
  expect(await screen.findByText('Lesson unavailable')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry lesson' }));
  expect(await screen.findByText('Recovered lesson')).toBeInTheDocument();
});
