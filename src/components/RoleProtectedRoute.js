import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import LoadingSpinner from './LoadingSpinner';
import { fetchAccountSession, getRoleRoute } from '../utils/institutionSession';
import { getWorkspaceDestination } from '../utils/workspace';

function RoleProtectedRoute({ role, children }) {
  const [state, setState] = useState({ status: 'checking', session: null });

  useEffect(() => {
    let cancelled = false;
    fetchAccountSession()
      .then((session) => {
        if (!cancelled) setState({ status: 'ready', session });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', session: null });
      });
    return () => { cancelled = true; };
  }, []);

  if (state.status === 'checking') return <LoadingSpinner />;
  if (state.status === 'error') return <Navigate to="/login" replace />;

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
