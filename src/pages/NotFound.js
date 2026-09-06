import { Link, useNavigate } from 'react-router-dom';
import '../components/ErrorBoundary.css';
export default function NotFound() {
  const navigate = useNavigate();
  return <main className="error-boundary"><section className="error-boundary-card"><h1>Page not found</h1><p>This page may have moved, or the link may be incomplete.</p><button type="button" onClick={() => navigate(-1)}>Go back</button><Link to={localStorage.getItem('token') ? '/workspace' : '/'}>Open {localStorage.getItem('token') ? 'my workspace' : 'Cerbyl home'}</Link></section></main>;
}
