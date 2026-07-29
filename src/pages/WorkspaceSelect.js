import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import GeometricGrid from '../components/GeometricGrid';
import { fetchAccountSession, getRoleRoute } from '../utils/institutionSession';
import { getWorkspaceDestination } from '../utils/workspace';
import './WorkspaceSelect.css';

function WorkspaceSelect() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const resolveWorkspace = async () => {
    setError('');
    try {
      const session = await fetchAccountSession({ force: true });
      navigate(
        getRoleRoute(session.role, getWorkspaceDestination('learn')),
        { replace: true }
      );
    } catch (requestError) {
      setError(requestError.message || 'Could not load your account workspace.');
    }
  };

  useEffect(() => {
    resolveWorkspace();
  }, []);

  return (
    <main className="ws-page">
      <div className="ws-background" aria-hidden="true">
        <GeometricGrid className="ws-grid" linesClassName="ws-grid-lines" numsClassName="ws-grid-numbers" />
        <div className="ws-light" />
      </div>

      <header className="ws-header">
        <div className="ws-wordmark">cerbyl</div>
        <div className="ws-test-chip"><ShieldCheck size={13} /> Role-secured access</div>
      </header>

      <section className="ws-intro ws-routing" aria-labelledby="workspace-title">
        <p>Signing you into Cerbyl</p>
        <h1 id="workspace-title">
          {error ? 'We could not open your workspace.' : 'Opening the right workspace for your account.'}
        </h1>
        <span>
          {error || 'Learner, student, and educator access is resolved securely from your account.'}
        </span>
        {error && (
          <button type="button" className="ws-retry" onClick={resolveWorkspace}>
            Try again <RefreshCw size={16} />
          </button>
        )}
      </section>

      <footer className="ws-footer">
        Your workspace cannot be changed from the browser. Sign in with another test account to test another role.
      </footer>
    </main>
  );
}

export default WorkspaceSelect;
