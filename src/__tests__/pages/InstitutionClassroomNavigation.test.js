import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import InstitutionClassroomPage from '../../pages/InstitutionClassroomPage';
import { apiRequest } from '../../config/api';
import { downloadClassroomFile } from '../../utils/classroomFiles';

jest.mock('../../config/api', () => ({ apiRequest: jest.fn() }));
jest.mock('../../utils/classroomFiles', () => ({ downloadClassroomFile: jest.fn(() => Promise.resolve()), isProtectedClassroomFile: url => Boolean(url?.startsWith('/api/institution/files/')) }));
jest.mock('../../components/ClassWorkspaceDialog', () => ({ sectionId }) => <div role="dialog">Class {sectionId}</div>);
jest.mock('../../pages/StudentDashboard', () => ({ SubmissionDialog: () => <div role="dialog">Student work</div> }));
jest.mock('../../pages/EducatorDashboard', () => ({ AssignmentDialog: () => <div role="dialog">New assignment</div>, ReviewDialog: () => null }));

const course = { section_id: 1, title: 'Probability', code: 'MATH', course_title: 'Probability', course_code: 'MATH', section_name: 'Evening', organization_name: 'Academy', progress_percent: 40, on_track_percent: 40, students: 12 };
const assignment = { id: 8, course_code: 'MATH', title: 'Counting outcomes', points_possible: 10, estimated_minutes: 5, ai_policy: 'guided', status: 'not_started', published_status: 'published' };
const dashboard = { courses: [course, { ...course, section_id: 2, title: 'Biology', course_title: 'Biology' }], class_health: [course], organization: { name: 'Academy' }, assignments: [assignment] };
const gradebook = {
  section: {id:1,course_code:'MATH',course_title:'Probability'},
  assignments: [assignment],
  rows: [
    {student:{id:3,display_name:'Aarav'}, scores:{8:{score:0,status:'graded'}}, average_percent:0, mastery_percent:0},
    {student:{id:4,display_name:'Riya'}, scores:{}, average_percent:null, mastery_percent:0},
  ],
};

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(path => Promise.resolve(
    path.endsWith('/dashboard') ? dashboard :
    path.includes('/educator/assignments') ? { assignments: [assignment] } :
    path.includes('/gradebook') ? { assignments: [], rows: [] } :
    path.includes('/notifications') ? { notifications: [], unread_count: 0 } :
    path.includes('/messages') ? { messages: [] } :
    { instructor: { id: path.endsWith('/2') ? 22 : 11, display_name: path.endsWith('/2') ? 'Biology teacher' : 'Math teacher' }, materials: [{id: 4, title: path.endsWith('/2') ? 'Cell diagram' : 'Counting guide', material_type: 'document', source_url: '/api/institution/files/guide.pdf', original_filename: 'guide.pdf'}] }
  ));
});

function open(role, view) {
  return render(<MemoryRouter initialEntries={[`/${role}/${view}`]}><InstitutionClassroomPage role={role} view={view} /></MemoryRouter>);
}

it.each([
  ['student', 'classes', 'My classes'], ['student', 'assignments', 'Assignments'],
  ['student', 'messages', 'Ask my teacher'], ['student', 'notifications', 'Updates'],
  ['student', 'library', 'Study Library'],
  ['educator', 'classes', 'Classes & materials'], ['educator', 'assignments', 'Assignments'],
  ['educator', 'gradebook', 'Gradebook'], ['educator', 'messages', 'Messages'], ['educator', 'notifications', 'Updates'],
])('keeps shared navigation and a single page heading on %s/%s', async (role, view, label) => {
  open(role, view);
  await waitFor(() => expect(screen.queryByText('Loading classroom workspace…')).not.toBeInTheDocument());
  const navigation = screen.getByRole('navigation', { name: 'Classroom navigation' });
  expect(within(navigation).getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'My dashboard' })).toHaveAttribute('href', `/${role}`);
  expect(screen.getByRole('link', { name: 'My profile' })).toHaveAttribute('href', `/${role}/profile`);
});

it('changes message recipients with the selected class without losing the draft', async () => {
  open('student', 'messages');
  await screen.findByRole('option', { name: 'Math teacher' });
  fireEvent.change(screen.getByLabelText('Recipient'), { target: { value: '11' } });
  fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Need help' } });
  fireEvent.change(screen.getByLabelText('Class'), { target: { value: '2' } });
  await screen.findByRole('option', { name: 'Biology teacher' });
  expect(screen.getByLabelText('Recipient')).toHaveValue('');
  expect(screen.getByLabelText('Subject')).toHaveValue('Need help');
  expect(screen.queryByRole('option', { name: 'Math teacher' })).not.toBeInTheDocument();
});

it('opens teacher materials through authenticated downloads and changes materials with the class', async () => {
  open('student', 'library');
  fireEvent.click(await screen.findByRole('button', {name: 'Download Counting guide'}));
  await waitFor(() => expect(downloadClassroomFile).toHaveBeenCalledWith('/api/institution/files/guide.pdf', 'guide.pdf'));
  fireEvent.change(screen.getByLabelText('Class'), {target: {value: '2'}});
  expect(await screen.findByRole('button', {name: 'Download Cell diagram'})).toBeInTheDocument();
  expect(screen.queryByRole('button', {name: 'Download Counting guide'})).not.toBeInTheDocument();
});

it('opens class materials and the student submission dialog', async () => {
  const page = open('student', 'classes');
  fireEvent.click(await screen.findByRole('button', { name: /MATH Probability/ }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Class 1');
  page.unmount();
  open('student', 'assignments');
  fireEvent.click(await screen.findByRole('button', { name: 'Open work' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Student work');
});

it('retains navigation during a failed load and recovers through Retry', async () => {
  apiRequest.mockRejectedValueOnce(new Error('Classroom offline'));
  open('student', 'classes');
  expect(await screen.findByRole('alert')).toHaveTextContent('Classroom offline');
  expect(screen.getByRole('navigation', { name: 'Classroom navigation' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: /MATH Probability/ })).toBeInTheDocument();
});

it('navigates from Messages to Gradebook without rendering the previous page data', async () => {
  const page = open('educator', 'messages');
  await screen.findByText('No private messages in this class yet.');
  let resolveGrades;
  apiRequest.mockImplementation(path => path.includes('/gradebook')
    ? new Promise(resolve => { resolveGrades = resolve; }) : Promise.resolve(dashboard));
  page.rerender(<MemoryRouter><InstitutionClassroomPage role="educator" view="gradebook" /></MemoryRouter>);
  expect(screen.getByText('Calculating gradebook…')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  await act(async () => resolveGrades(gradebook));
  expect(await screen.findByRole('table')).toHaveTextContent('Aarav');
  const rows = screen.getAllByRole('row');
  expect(rows[1]).toHaveTextContent('0graded');
  expect(rows[1]).toHaveTextContent('0%');
  expect(within(rows[2]).getAllByRole('cell')[1]).toHaveTextContent('—');
  expect(within(rows[2]).getAllByRole('cell')[1]).not.toHaveTextContent('%');
});

it('shows a retryable error for an invalid gradebook response', async () => {
  let invalid = true;
  apiRequest.mockImplementation(path => Promise.resolve(path.endsWith('/dashboard') ? dashboard : invalid ? {messages:[]} : gradebook));
  open('educator', 'gradebook');
  expect(await screen.findByRole('alert')).toHaveTextContent('Gradebook data could not be read');
  invalid = false;
  fireEvent.click(screen.getByRole('button', {name:'Retry'}));
  expect(await screen.findByRole('table')).toHaveTextContent('Aarav');
});

it('explains when a teacher has no classes for the gradebook', async () => {
  apiRequest.mockResolvedValue({...dashboard,class_health:[]});
  open('educator', 'gradebook');
  expect(await screen.findByText('No classes are assigned to you yet.')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
