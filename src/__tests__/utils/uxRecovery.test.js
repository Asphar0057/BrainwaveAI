import { renderHook, act } from '@testing-library/react';
import useAccountDraft from '../../hooks/useAccountDraft';
import { readDraft, writeDraft, draftKey } from '../../utils/draftStorage';
import { toLocalDateTime } from '../../utils/dateInput';
import { safeReturnPath, rememberReturnPath, consumeReturnPath } from '../../utils/returnPath';
afterEach(() => { localStorage.clear(); sessionStorage.clear(); });
it('keeps recovery drafts isolated by account and survives remount', () => {
  localStorage.setItem('username','alice');
  const first=renderHook(() => useAccountDraft('note:1',''));
  act(() => first.result.current[1]('Unsaved text'));
  first.unmount();
  const reopened=renderHook(() => useAccountDraft('note:1',''));
  expect(reopened.result.current[0]).toBe('Unsaved text');
  localStorage.setItem('username','bob');
  expect(readDraft('note:1','')).toBe('');
});
it('recovers safely from malformed storage and reports quota failures', () => {
  localStorage.setItem(draftKey('bad'),'{');
  expect(readDraft('bad','fallback')).toBe('fallback');
  const spy=jest.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(writeDraft('bad','new')).toBe(false); spy.mockRestore();
});
it('round trips a local deadline without changing its instant', () => {
  const instant=new Date(2026,8,6,14,30,0);
  expect(new Date(toLocalDateTime(instant.toISOString())).getTime()).toBe(instant.getTime());
  expect(toLocalDateTime('invalid')).toBe('');
});
it('restores internal deep links once and rejects redirect escapes', () => {
  rememberReturnPath('/shared/item?id=123');
  expect(consumeReturnPath()).toBe('/shared/item?id=123');
  expect(consumeReturnPath()).toBeNull();
  for(const path of ['//evil.example','https://evil.example','/\\evil.example','/login']) expect(safeReturnPath(path)).toBeNull();
});
