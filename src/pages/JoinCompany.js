import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import InstitutionPortalShell from '../components/InstitutionPortalShell';
import { institution } from '../services/institutionService';
import { clearAccountSession } from '../utils/institutionSession';
export default function JoinCompany() {
  const [params] = useSearchParams(), navigate = useNavigate();
  const [token,setToken] = useState(params.get('invite') || sessionStorage.getItem('cerbyl.pendingInvite') || '');
  const [error,setError] = useState(''), [busy,setBusy] = useState(false);
  const signedIn = !!localStorage.getItem('token');
  function remember() { sessionStorage.setItem('cerbyl.pendingInvite',token); }
  return <InstitutionPortalShell title="Join your company" subtitle="Use your personal account and the invitation from your company owner."><section className="b2b-panel"><div className="ci-tile-texture" aria-hidden="true"/><h2>Your invitation</h2><form className="b2b-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const result=await institution('/invitations/accept',{token:token.trim()});clearAccountSession();sessionStorage.removeItem('cerbyl.pendingInvite');navigate(`/${result.role}`);}catch(err){setError(err.message);}finally{setBusy(false);}}}><label>Invitation code<input required minLength={30} maxLength={200} value={token} onChange={e=>setToken(e.target.value)} autoComplete="off"/></label><p>Sign in with the exact email address your owner invited. Your account password stays private.</p>{error&&<p role="alert" className="b2b-error">{error}</p>}{signedIn?<button disabled={busy} className="ci-action ci-action--primary">{busy?'Joining…':'Accept invitation'}</button>:<div className="b2b-bar"><Link className="ci-action ci-action--primary" to="/login" onClick={remember}>Sign in to accept</Link><Link className="ci-action" to="/register" onClick={remember}>Create an account</Link></div>}</form></section></InstitutionPortalShell>;
}
