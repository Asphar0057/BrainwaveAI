import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import InstitutionLearning from '../../pages/InstitutionLearning';
import CompanyWorkspace from '../../pages/CompanyWorkspace';
import { institution, parseRoster } from '../../services/institutionService';
jest.mock('../../services/institutionService',()=>({...jest.requireActual('../../services/institutionService'),institution:jest.fn()}));
jest.mock('../../components/InstitutionPortalShell',()=>({children})=><main>{children}</main>);
jest.mock('../../pages/StudentDashboard',()=>({SubmissionDialog:()=>null}));
const course={section_id:1,title:'Probability',code:'MATH',section_name:'Evening',organization_name:'Example Academy'};
const learning={section:{id:1,organization_name:'Example Academy'},lessons:[],followups:[],roster:[],checkpoints:[{id:7,title:'Counting checkpoint',status:'published',questions:[{prompt:'Which number counts every outcome?',options:['Three','Four']}]}]};
beforeEach(()=>{localStorage.clear();localStorage.setItem('username','student-one');institution.mockReset();});
function student(){institution.mockImplementation(path=>Promise.resolve(path==='/student/dashboard'?{courses:[course],assignments:[]}:path==='/student/plan'?{tasks:[],total_tasks:0}:learning));render(<MemoryRouter initialEntries={['/student/learning?section=1&view=Checkpoints']}><InstitutionLearning role="student"/></MemoryRouter>);}
it('keeps checkpoint choices and confidence when changing tabs',async()=>{
 student();const answer=await screen.findByLabelText('Four');fireEvent.click(answer);fireEvent.change(screen.getByLabelText('How sure are you?'),{target:{value:'3'}});
 fireEvent.click(screen.getByRole('button',{name:'Lessons',exact:true}));fireEvent.click(screen.getByRole('button',{name:'Practice',exact:true}));
 expect(await screen.findByLabelText('Four')).toBeChecked();expect(screen.getByLabelText('How sure are you?')).toHaveValue('3');
});
it('preserves answers and exposes a retry when submission fails',async()=>{
 student();fireEvent.click(await screen.findByLabelText('Four'));fireEvent.change(screen.getByLabelText('How sure are you?'),{target:{value:'2'}});
 institution.mockImplementation(path=>path.includes('/submit')?Promise.reject(new Error('Connection interrupted')):Promise.resolve(learning));
 fireEvent.click(screen.getByRole('button',{name:'Submit checkpoint'}));expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');expect(screen.getByLabelText('Four')).toBeChecked();
});
it('clears invited recipients when changing companies',async()=>{
 institution.mockImplementation(path=>Promise.resolve(path==='/companies'?[{id:1,name:'First',role:'owner'},{id:2,name:'Second',role:'owner'}]:{id:Number(path.split('/').pop()),name:path.endsWith('1')?'First':'Second',license:{active:1,reserved:0,seat_limit:25},sections:[],members:[],invitations:[],audit:[]}));
 render(<MemoryRouter><CompanyWorkspace/></MemoryRouter>);fireEvent.click(await screen.findByRole('button',{name:'Invitations',exact:true}));fireEvent.change(screen.getByLabelText('Email'),{target:{value:'first-company@example.com'}});fireEvent.change(screen.getByLabelText('Company'),{target:{value:'2'}});
 await waitFor(()=>expect(screen.getByLabelText('Email')).toHaveValue(''));expect(screen.getByRole('button',{name:'Create invitations for Second'})).toBeInTheDocument();
});
it('validates a roster before sending any invitation',()=>{
 expect(parseRoster('email\na@example.com\nb@example.com')).toEqual(['a@example.com','b@example.com']);
 expect(()=>parseRoster('email\na@example.com\na@example.com')).toThrow(/duplicate/);
 expect(()=>parseRoster('name,email\nAlice,a@example.com')).toThrow(/one email column/);
});
