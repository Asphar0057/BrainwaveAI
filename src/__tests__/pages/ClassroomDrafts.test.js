import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReviewDialog, AssignmentDialog } from '../../pages/EducatorDashboard';
import { SubmissionDialog } from '../../pages/StudentDashboard';
import { apiRequest } from '../../config/api';
jest.mock('../../config/api', () => ({ apiRequest: jest.fn() }));
jest.mock('../../components/ClassWorkspaceDialog', () => () => null);
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));
const rows = [1,2].map(id => ({submission_id:id,student:{id, display_name:`Student ${id}`},status:'submitted',score:null,feedback:'',content_text:'Student response'}));
beforeEach(() => {
  localStorage.clear(); localStorage.setItem('username','ux-teacher');
  apiRequest.mockReset(); apiRequest.mockImplementation((url, options) => options?.method === 'PATCH' ? Promise.resolve({}) : Promise.resolve({assignment:{points_possible:100},submissions:rows}));
});
it('publishing one grade preserves a different learner’s draft', async () => {
  render(<ReviewDialog assignment={{assignment_id:12}} onClose={() => {}} onChanged={() => {}}/>);
  const scores = await screen.findAllByRole('spinbutton');
  const feedback = screen.getAllByRole('textbox');
  fireEvent.change(scores[0],{target:{value:'80'}}); fireEvent.change(feedback[0],{target:{value:'Good reasoning'}});
  fireEvent.change(scores[1],{target:{value:'65'}}); fireEvent.change(feedback[1],{target:{value:'Explain the second step'}});
  fireEvent.click(screen.getAllByRole('button',{name:'Publish grade'})[0]);
  await waitFor(() => expect(screen.getByRole('button',{name:'Update grade'})).toBeInTheDocument());
  expect(scores[1]).toHaveValue(65); expect(feedback[1]).toHaveValue('Explain the second step');
  expect(apiRequest.mock.calls.filter(([,options]) => options?.method==='PATCH')).toHaveLength(1);
});
it('keeps focus while typing and restores an assignment draft after closing', () => {
  const props={sections:[{section_id:4,course_code:'BIO',section_name:'A'}],onClose:()=>{},onCreated:()=>{}};
  const first=render(<AssignmentDialog {...props}/>);
  const title=screen.getByRole('textbox',{name:/title/i}); title.focus();
  fireEvent.change(title,{target:{value:'Cell division'}});
  expect(title).toHaveFocus(); first.unmount();
  render(<AssignmentDialog {...props}/>);
  expect(screen.getByRole('textbox',{name:/title/i})).toHaveValue('Cell division');
});

it('saves assignment settings through the footer and preserves them after an error', async () => {
  const onCreated = jest.fn();
  apiRequest.mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValueOnce({});
  render(<AssignmentDialog sections={[{section_id:4,course_code:'BIO',course_title:'Biology'}]} onClose={() => {}} onCreated={onCreated} />);
  fireEvent.change(screen.getByRole('textbox', {name:'Assignment title'}), {target:{value:'Cell division'}});
  fireEvent.change(screen.getByRole('combobox', {name:'Publishing'}), {target:{value:'draft'}});
  fireEvent.click(screen.getByRole('checkbox', {name:'Allow resubmission'}));
  fireEvent.click(screen.getByRole('button', {name:'Save draft'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');
  expect(screen.getByRole('textbox', {name:'Assignment title'})).toHaveValue('Cell division');
  expect(screen.getByRole('checkbox', {name:'Allow resubmission'})).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', {name:'Save draft'}));
  await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  expect(apiRequest).toHaveBeenLastCalledWith('/institution/educator/assignments', expect.objectContaining({
    method:'POST', body:expect.any(String),
  }));
  expect(JSON.parse(apiRequest.mock.calls[1][1].body)).toMatchObject({section_id:4, title:'Cell division', status:'draft', allow_resubmission:false});
});

it('submits a response through the separate submission action footer', async () => {
  const onSubmitted = jest.fn();
  render(<SubmissionDialog assignment={{id: 31, title: 'Explain your reasoning', status: 'not_started'}} onClose={() => {}} onSubmitted={onSubmitted}/>);
  fireEvent.change(screen.getByRole('textbox', {name: 'Your response'}), {target: {value: 'There are four equally likely outcomes in the bag.'}});
  fireEvent.click(screen.getByRole('button', {name: 'Submit work'}));
  await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
  expect(apiRequest).toHaveBeenCalledWith('/institution/student/assignments/31/submit', expect.objectContaining({method: 'POST', body: expect.stringContaining('four equally likely outcomes')}));
});

it('keeps the response and allows saving a draft after a failed submission', async () => {
  const onSubmitted = jest.fn();
  apiRequest.mockRejectedValueOnce(new Error('Connection interrupted'));
  render(<SubmissionDialog assignment={{id: 32, title: 'Explain your reasoning', status: 'not_started'}} onClose={() => {}} onSubmitted={onSubmitted}/>);
  const response = screen.getByRole('textbox', {name: 'Your response'});
  fireEvent.change(response, {target: {value: 'Count every possible outcome before dividing.'}});
  fireEvent.click(screen.getByRole('button', {name: 'Submit work'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');
  expect(response).toHaveValue('Count every possible outcome before dividing.');
  fireEvent.click(screen.getByRole('button', {name: 'Save draft'}));
  await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
  expect(apiRequest).toHaveBeenCalledWith('/institution/student/assignments/32/draft', expect.objectContaining({method: 'PUT'}));
});
