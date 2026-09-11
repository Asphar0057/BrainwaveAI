import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import LoadingSpinner from './LoadingSpinner';
import { fetchAccountSession } from '../utils/institutionSession';

// Resolve the account before mounting the consumer profile and its autosave effects.
export default function ProfileEntry({ children }) {
  const [role, setRole] = useState(null), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError(false);
    fetchAccountSession().then(session => { if (active) setRole(session.role); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [retry]);
  if (error) return <main className="error-boundary"><section className="error-boundary-card"><h1>Profile unavailable</h1><p role="alert">We could not check your account workspace.</p><button onClick={() => setRetry(n => n + 1)}>Try again</button></section></main>;
  if (!role) return <LoadingSpinner/>;
  if (role === 'student' || role === 'educator') return <Navigate to={`/${role}/profile`} replace/>;
  return children;
}
