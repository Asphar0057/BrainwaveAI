import { renderHook, act } from '@testing-library/react';
import useScopedAccountDraft from '../../hooks/useScopedAccountDraft';
beforeEach(()=>{localStorage.clear();localStorage.setItem('username','teacher-a');});
it('restores independent cohort drafts and keeps accounts separate',()=>{
 const {result,rerender}=renderHook(({scope})=>useScopedAccountDraft(scope,''),{initialProps:{scope:'cohort-a'}});
 act(()=>result.current[1]('Algebra lesson draft'));rerender({scope:'cohort-b'});expect(result.current[0]).toBe('');
 act(()=>result.current[1]('Probability lesson draft'));rerender({scope:'cohort-a'});expect(result.current[0]).toBe('Algebra lesson draft');
 localStorage.setItem('username','teacher-b');rerender({scope:'cohort-a'});expect(result.current[0]).toBe('');
});
