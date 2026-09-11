import { useRef, useState } from 'react';
import { readDraft, writeDraft } from '../utils/draftStorage';
// Unlike the older draft hook, this also switches the draft when the cohort changes.
export default function useScopedAccountDraft(scope, initial) {
  scope = `${localStorage.getItem('username') || 'signed-out'}:${scope}`;
  const [values,setValues] = useState({});
  const value = Object.prototype.hasOwnProperty.call(values,scope) ? values[scope] : readDraft(scope,initial);
  const current = useRef(value); current.current = value;
  const update = next => {
    const resolved = typeof next==='function' ? next(current.current) : next;
    current.current = resolved;
    if(!writeDraft(scope,resolved)) window.alert('Your browser could not save a recovery draft. Save your work before leaving.');
    setValues(v=>({...v,[scope]:resolved}));
  };
  return [value,update];
}
