import { rememberReturnPath } from '../utils/returnPath';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import LoadingSpinner from './LoadingSpinner';
import {
  canRestoreGoogleSession,
  hasUsableBackendSession,
  restoreGoogleBackendSession,
} from '../utils/authSession';
import { clearBackendSession } from '../utils/backendSession';

const ProtectedRoute = ({ children }) => {
  const [authState, setAuthState] = useState(() => {
    if (hasUsableBackendSession()) return 'authenticated';
    return canRestoreGoogleSession() ? 'checking' : 'unauthenticated';
  });

  useEffect(() => {
    let cancelled = false;

    const resolveSession = async () => {
      if (hasUsableBackendSession()) {
        setAuthState('authenticated');
        return;
      }

      if (!canRestoreGoogleSession()) {
        clearBackendSession();
        setAuthState('unauthenticated');
        return;
      }

      setAuthState('checking');
      try {
        await restoreGoogleBackendSession();
        if (!cancelled) {
          const restored = hasUsableBackendSession();
          if (!restored) clearBackendSession();
          setAuthState(restored ? 'authenticated' : 'unauthenticated');
        }
      } catch (_) {
        clearBackendSession();
        if (!cancelled) setAuthState('unauthenticated');
      }
    };

    resolveSession();
    return () => { cancelled = true; };
  }, []);

  if (authState === 'checking') {
    return <LoadingSpinner />;
  }

  if (authState !== 'authenticated') {
    rememberReturnPath(window.location.pathname + window.location.search + window.location.hash);
    return <Navigate to="/login" replace />;
  }

  const currentSafetyFlag = sessionStorage.getItem('safetyAccepted');

  if (!currentSafetyFlag) {
    sessionStorage.setItem('safetyAccepted', 'true');
  }

  return children;
};

export default ProtectedRoute;
