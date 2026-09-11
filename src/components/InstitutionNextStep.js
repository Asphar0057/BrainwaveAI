import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { institution } from '../services/institutionService';
import '../pages/DashboardCerbyl.css';
import '../pages/InstitutionalDashboard.css';
import '../pages/B2BPortal.css';
export default function InstitutionNextStep({role}) {
  const [plan,setPlan] = useState(null), [error,setError] = useState('');
  useEffect(()=>{let active=true;if(role==='student')institution('/student/plan').then(p=>active&&setPlan(p)).catch(e=>active&&setError(e.message));return()=>{active=false;};},[role]);
  if(sessionStorage.getItem('cerbyl.pendingInvite'))return <section className="b2b-panel b2b-next"><div><h2>Your company invitation is ready</h2><p>Finish joining your company with this account.</p></div><Link className="ci-action ci-action--primary" to="/join-company">Accept invitation</Link></section>;
  if(role==='educator')return null;
  const next=plan?.tasks?.[0];
  return <section className="b2b-panel b2b-next"><div className="ci-tile-texture"/><div><h2>{next?.title||'Your learning plan'}</h2><p>{error?'Your plan could not load. Open the learning workspace to retry.':next?.reason||'Your lessons, checkpoints and teacher follow-up, together.'}</p></div><Link className="ci-action ci-action--primary" to="/student/learning">{next?'Start next task':'Open my plan'}</Link></section>;
}
