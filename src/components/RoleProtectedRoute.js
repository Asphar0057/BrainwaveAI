import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import LoadingSpinner from './LoadingSpinner';
import { fetchAccountSession, getRoleRoute } from '../utils/institutionSession';
import { getWorkspaceDestination } from '../utils/workspace';

function RoleProtectedRoute({ role, children }) {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ status: 'checking', session: null });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'checking', session: null });
    fetchAccountSession()
      .then((session) => {
        if (!cancelled) setState({ status: 'ready', session });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', session: null });
      });
    return () => { cancelled = true; };
  }, [retry]);

  if (state.status === 'checking') return <LoadingSpinner />;
  if (state.status === 'error') return <main className="error-boundary"><section className="error-boundary-card"><h1>Workspace unavailable</h1><p role="alert">We could not check your account workspace. Your work has not been removed.</p><button type="button" onClick={() => setRetry(n => n + 1)}>Try again</button><a href="/workspace">Open workspace recovery</a></section></main>;

  if (state.session?.role !== role) {
    const learnerRoute = getWorkspaceDestination('learn');
    return (
      <Navigate
        to={getRoleRoute(state.session?.role, learnerRoute)}
        replace
      />
    );
  }

  return children;
}

export default RoleProtectedRoute;
