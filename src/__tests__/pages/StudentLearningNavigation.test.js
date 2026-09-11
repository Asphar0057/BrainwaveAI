import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import InstitutionLearning from '../../pages/InstitutionLearning';
import { institution } from '../../services/institutionService';

jest.mock('../../services/institutionService', () => ({ institution: jest.fn() }));
jest.mock('../../components/InstitutionPortalShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../../pages/StudentDashboard', () => ({ SubmissionDialog: ({ assignment }) => <div role="dialog">{assignment.title}</div> }));

const courses = [
  { section_id: 1, title: 'Probability', code: 'MATH', section_name: 'Evening', organization_name: 'Example Academy' },
  { section_id: 2, title: 'Biology', code: 'BIO', section_name: 'Morning', organization_name: 'Second Academy' },
];
const tasks = [
  { id: 11, section_id: 1, type: 'assignment', title: 'Explain the denominator', minutes: 10, due_at: '2027-09-14T00:00:00', reason: 'Finish your assigned coursework.' },
  { id: 22, section_id: 2, type: 'lesson', title: 'Understand cells', minutes: 5, reason: 'Learn the parts of a cell.' },
];
const classwork = id => ({ section: { id }, lessons: [{ id: id === 2 ? 22 : 12, position: 1, title: id === 2 ? 'Understand cells' : 'Count outcomes', content: 'The reading opens here.', minutes: 5 }], checkpoints: [], followups: [] });

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = jest.fn();
  institution.mockImplementation(path => Promise.resolve(
    path === '/student/dashboard' ? { courses, assignments: [{ id: 11, title: tasks[0].title }] } :
    path === '/student/plan' ? { tasks, total_tasks: 2 } : classwork(Number(path.split('/')[2]))
  ));
});

function renderLearning() {
  render(<MemoryRouter initialEntries={['/student/learning']}><InstitutionLearning role="student" /></MemoryRouter>);
}

it('shows the class and deadline on Today and opens the named assignment', async () => {
  renderLearning();
  fireEvent.click(await screen.findByRole('button', { name: 'Open assignment', exact: true }));
  expect(screen.getByText('Probability · Evening · Example Academy')).toBeInTheDocument();
  expect(screen.getByText('Biology · Morning · Second Academy')).toBeInTheDocument();
  expect(screen.getByText(/Due/)).toHaveTextContent('Sep 14');
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.getByRole('dialog')).toHaveTextContent('Explain the denominator');
});

it('opens a lesson in its own class and keeps Lessons selected when changing classes', async () => {
  renderLearning();
  fireEvent.click(await screen.findByRole('button', { name: 'Read lesson: Understand cells' }));
  expect(await screen.findByText('The reading opens here.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Lessons', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Class')).toHaveValue('2');
  fireEvent.change(screen.getByLabelText('Class'), { target: { value: '1' } });
  await waitFor(() => expect(screen.getByText('1. Count outcomes')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Lessons', exact: true })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Today', exact: true }));
  expect(await screen.findByRole('button', { name: 'Open assignment', exact: true })).toBeInTheDocument();
});
