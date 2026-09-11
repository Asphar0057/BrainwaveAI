import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@testing-library/jest-dom';
import InstitutionProfile from '../../pages/InstitutionProfile';
import ProfileEntry from '../../components/ProfileEntry';
import { institution } from '../../services/institutionService';
import { fetchAccountSession } from '../../utils/institutionSession';

jest.mock('../../services/institutionService', () => ({ institution: jest.fn() }));
jest.mock('../../utils/institutionSession', () => ({ clearAccountSession: jest.fn(), fetchAccountSession: jest.fn() }));
jest.mock('../../components/SocialHubChrome', () => ({ children, sidebarLead, footerItems }) => <div>{sidebarLead}{children}<nav>{footerItems.map(item => <a key={item.label} href={item.path}>{item.label}</a>)}</nav></div>);
const profile = {
  user: {first_name:'Maya',last_name:'Northstar',display_name:'Maya Northstar',username:'northstar.teacher',email:'teacher@example.com'},
  role:'educator',dashboard_route:'/educator',organizations:[{id:1,name:'Northstar',role:'educator',status:'active'}],
  classes:[{id:12,title:'Probability',cohort:'Evening',organization:'Northstar',code:'MATH',instructor:'Maya Northstar'}],
};
beforeEach(() => {
  localStorage.clear();localStorage.setItem('username','northstar.teacher');
  institution.mockReset();fetchAccountSession.mockReset();
  institution.mockImplementation((path,body) => Promise.resolve(body ? {...profile,user:{...profile.user,...body,display_name:`${body.first_name} ${body.last_name}`}} : profile));
});
function page(role='educator') { return render(<MemoryRouter><InstitutionProfile role={role}/></MemoryRouter>); }

it('shows classroom identity and saves only editable names', async () => {
  page();fireEvent.change(await screen.findByLabelText('First name'),{target:{value:'Maya Jane'}});
  expect(screen.getByLabelText('Username')).toHaveAttribute('readonly');
  expect(screen.getByLabelText('Sign-in email')).toHaveAttribute('readonly');
  expect(screen.queryByText(/learning style|Next level|Experience|Learning Goals/i)).not.toBeInTheDocument();
  expect(screen.getByText('Probability')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Save changes'}));
  expect(await screen.findByRole('status')).toHaveTextContent('Profile saved');
  expect(institution).toHaveBeenCalledWith('/profile',{first_name:'Maya Jane',last_name:'Northstar'},'PATCH');
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Maya Jane Northstar');
});

it('preserves an unsaved name through a failed save and a remount', async () => {
  const mounted=page();fireEvent.change(await screen.findByLabelText('First name'),{target:{value:'Updated name'}});
  institution.mockRejectedValueOnce(new Error('Connection interrupted'));
  fireEvent.click(screen.getByRole('button',{name:'Save changes'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');
  mounted.unmount();page();expect(await screen.findByLabelText('First name')).toHaveValue('Updated name');
  fireEvent.click(screen.getByRole('button',{name:'Discard changes'}));
  expect(screen.getByLabelText('First name')).toHaveValue('Maya');
});

it('gives owners their organization workspace without consumer links', async () => {
  institution.mockResolvedValue({...profile,dashboard_route:'/company',organizations:[{id:1,name:'Northstar',role:'owner'}]});
  page();await screen.findByText('Organizations & access');
  expect(screen.getByRole('link',{name:'Dashboard'})).toHaveAttribute('href','/company');
  expect(screen.getByRole('button',{name:/Manage organization/})).toBeInTheDocument();
  expect(screen.queryByRole('link',{name:'Social Hub'})).not.toBeInTheDocument();
});

it('opens a student’s selected class in the class-specific lessons view', async () => {
  const Destination = () => <p>{useLocation().search}</p>;
  render(<MemoryRouter initialEntries={['/student/profile']}><Routes>
    <Route path="/student/profile" element={<InstitutionProfile role="student"/>}/>
    <Route path="/student/learning" element={<Destination/>}/>
  </Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{name:'Open classwork'}));
  expect(await screen.findByText('?section=12&view=Lessons')).toBeInTheDocument();
});

it.each(['student','educator','learner'])('routes legacy profile visits for %s before mounting consumer content', async role => {
  fetchAccountSession.mockResolvedValue({role});
  const consumer = jest.fn(() => <p>Consumer profile</p>);
  const Consumer=consumer;
  render(<MemoryRouter initialEntries={['/profile']}><Routes>
    <Route path="/profile" element={<ProfileEntry><Consumer/></ProfileEntry>}/>
    <Route path="/student/profile" element={<p>Student profile</p>}/>
    <Route path="/educator/profile" element={<p>Teacher profile</p>}/>
  </Routes></MemoryRouter>);
  await screen.findByText(role==='learner'?'Consumer profile':role==='student'?'Student profile':'Teacher profile');
  if(role!=='learner')expect(consumer).not.toHaveBeenCalled();
});
