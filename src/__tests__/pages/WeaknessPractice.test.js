import { render } from '@testing-library/react';
import WeaknessPractice from '../../pages/WeaknessPractice';
const mockNavigate = jest.fn();
let mockState;
jest.mock('react-router-dom', () => ({useNavigate:()=>mockNavigate, useLocation:()=>({state:mockState})}));
beforeEach(()=>{ mockNavigate.mockReset(); sessionStorage.clear(); });
test('AI tutor topic handoff starts focused practice', ()=>{
 mockState={topic:'Fractions',difficulty:'intermediate',source:'ai_tutor'};
 render(<WeaknessPractice/>);
 expect(mockNavigate).toHaveBeenCalledWith('/solo-quiz',{replace:true,state:{autoStart:true,topics:['Fractions'],difficulty:'medium',questionCount:5}});
});
test('existing generated questions still open their session', ()=>{
 mockState={topic:'Fractions',questions:[{question:'1/2?'}],questionSetId:7};
 render(<WeaknessPractice/>);
 expect(mockNavigate).toHaveBeenCalledWith('/solo-quiz/session',{replace:true});
 expect(JSON.parse(sessionStorage.getItem('quizData')).quiz_id).toBe(7);
});
