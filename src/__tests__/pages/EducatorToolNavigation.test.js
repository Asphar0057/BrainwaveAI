import { act, render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EducatorDashboard from '../../pages/EducatorDashboard';
import { apiRequest } from '../../config/api';

jest.mock('../../config/api', () => ({ apiRequest: jest.fn() }));
jest.mock('../../components/LearningEvidence', () => () => null);

const sections = [
  { section_id: 4, course_code: 'FOUND101', course_title: 'Probability', section_name: 'Evening', on_track_percent: 80 },
  { section_id: 5, course_code: 'STAT102', course_title: 'Statistics', section_name: 'Morning', on_track_percent: 70 },
];
const dashboard = {
  user: { first_name: 'Taylor' },
  organization: { name: 'Northstar' },
  summary: { active_sections: 2, active_students: 2, needs_attention: 0, submissions_to_review: 0, average_mastery: 75 },
  class_health: sections,
  agenda: [
    { id: 4, time: 'Monday 18:00', title: 'Probability', meta: 'Evening · Room A' },
    { id: 5, time: 'Tuesday 09:00', title: 'Statistics', meta: 'Morning · Room B' },
  ],
};
const workspace = (id) => ({
  ...sections.find((section) => section.section_id === id),
  name: id === 4 ? 'Evening' : 'Morning',
  assignments: [], activity: [],
  roster: [{ student: { id, display_name: id === 4 ? 'Aarav' : 'Maya' }, progress_percent: 20, mastery_percent: 30 }],
  materials: [{ id, title: id === 4 ? 'Probability guide' : 'Statistics guide', material_type: 'document', source_url: 'https://example.com/guide.pdf' }],
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('username', 'ux-teacher');
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (url) => {
    if (url === '/institution/educator/dashboard') return dashboard;
    if (url.endsWith('/leaderboard')) return { leaderboard: [] };
    const match = url.match(/^\/institution\/sections\/(\d+)$/);
    if (match) return workspace(Number(match[1]));
    throw new Error(`Unexpected request: ${url}`);
  });
});

async function openTool(name) {
  render(<MemoryRouter initialEntries={['/educator']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/educator" element={<EducatorDashboard />} />
      <Route path="/educator/gradebook" element={<h1>Gradebook destination</h1>} />
      <Route path="/educator/messages" element={<h1>Messages destination</h1>} />
      <Route path="/educator/classes" element={<h1>Classes destination</h1>} />
    </Routes>
  </MemoryRouter>);
  const tools = await screen.findByRole('region', { name: 'Teaching tools' });
  await act(async () => { fireEvent.click(within(tools).getByRole('button', { name: new RegExp(name) })); });
}

it('opens Students directly at the roster even when nobody needs attention', async () => {
  await openTool('Students');
  const dialog = await screen.findByRole('dialog');
  expect(await within(dialog).findByText('Aarav')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'People' })).toHaveAttribute('aria-current', 'page');
  fireEvent.change(within(dialog).getByRole('combobox', { name: 'Class' }), { target: { value: '5' } });
  expect(await screen.findByText('Maya')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'People' })).toHaveAttribute('aria-current', 'page');
});

it('opens Content directly at materials and preserves that view when changing class', async () => {
  await openTool('Content');
  expect(await screen.findByRole('textbox', { name: 'Material title' })).toBeInTheDocument();
  expect(screen.getByText('Probability guide')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Class' }), { target: { value: '5' } });
  expect(await screen.findByText('Statistics guide')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Materials', exact: true })).toHaveAttribute('aria-current', 'page');
});

it.each(['Gradebook', 'Messages'])('opens the %s page', async (name) => {
  await openTool(name);
  expect(await screen.findByRole('heading', { name: `${name} destination` })).toBeInTheDocument();
});

it('opens the announcement form and closes without publishing', async () => {
  await openTool('Announcements');
  const dialog = screen.getByRole('dialog', { name: 'Class announcement.' });
  expect(within(dialog).getByRole('textbox', { name: 'Headline' })).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Publish to class' })).toBeEnabled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close announcement' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(apiRequest.mock.calls.every(([, options]) => !options?.method)).toBe(true);
});

it('opens all scheduled classes and can open the second class from its schedule', async () => {
  await openTool('Schedule');
  const dialog = screen.getByRole('dialog', { name: 'Teaching schedule.' });
  expect(within(dialog).getByText('Monday 18:00')).toBeInTheDocument();
  expect(within(dialog).getByText('Tuesday 09:00')).toBeInTheDocument();
  fireEvent.click(within(dialog).getAllByRole('button', { name: 'Open class' })[1]);
  expect(await screen.findByRole('dialog', { name: 'STAT102 · Statistics' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
});

it.each(['Students', 'Content'])('%s opens the classes page when no classes are assigned', async (name) => {
  apiRequest.mockResolvedValue({ ...dashboard, class_health: [], agenda: [] });
  await openTool(name);
  expect(await screen.findByRole('heading', { name: 'Classes destination' })).toBeInTheDocument();
});

it('shows a clear empty schedule and supports Escape to close', async () => {
  apiRequest.mockResolvedValue({ ...dashboard, class_health: [], agenda: [] });
  await openTool('Schedule');
  expect(screen.getByText(/No class times have been set yet/)).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
