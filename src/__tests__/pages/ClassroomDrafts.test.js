import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReviewDialog, AssignmentDialog } from '../../pages/EducatorDashboard';
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
