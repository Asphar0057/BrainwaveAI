import { useEffect, useCallback } from 'react';
import { useBlocker } from 'react-router-dom';

export const UNSAVED_MESSAGE = 'Your latest changes haven’t saved yet. Leave this note anyway? Choose Cancel to stay and let it finish saving.';

export default function useUnsavedChanges(isDirty) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty && (
    currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search
  ));
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (!isDirty || window.confirm(UNSAVED_MESSAGE)) blocker.proceed();
    else blocker.reset();
  }, [blocker, isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  return useCallback(() => !isDirty || window.confirm(UNSAVED_MESSAGE), [isDirty]);
}
