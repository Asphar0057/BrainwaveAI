import { useCallback, useRef, useState } from 'react';
import { readDraft, writeDraft, clearDraft } from '../utils/draftStorage';

export default function useAccountDraft(scope, initial) {
  const [value, setValue] = useState(() => readDraft(scope, initial));
  const current = useRef(value);
  current.current = value;
  const update = useCallback(next => {
    const resolved = typeof next === 'function' ? next(current.current) : next;
    current.current = resolved;
    if (!writeDraft(scope, resolved)) window.alert('Your browser could not keep a recovery draft. Save your work before leaving this page.');
    setValue(resolved);
  }, [scope]);
  return [value, update, () => clearDraft(scope)];
}
