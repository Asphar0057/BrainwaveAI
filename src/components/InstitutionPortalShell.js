/* THESIS: A continuation of Cerbyl Learn, with the next classroom task in reach.
OWN-WORLD: The existing Cerbyl graphite, gold, Inter, tile textures and control sizes.
STORY: Choose a company or cohort, complete one task, see its saved state.
FIRST VIEWPORT: Incumbent context bar and left rail; working content on the right.
FORM: Extension of the existing Cerbyl operating surface; no new visual identity. */
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { signOutAppSession } from '../utils/authSession';
import { getCachedAccountSession } from '../utils/institutionSession';
import CerbylSidebar from './CerbylSidebar';
import useInstitutionSidebar from '../hooks/useInstitutionSidebar';
import useCerbylCardMotion, { INSTITUTION_CARDS } from '../hooks/useCerbylCardMotion';
import '../pages/DashboardCerbyl.css';
import '../pages/InstitutionalDashboard.css';
import '../pages/B2BPortal.css';

export default function InstitutionPortalShell({ role = 'educator', title, subtitle, children, company = 'Company learning', active, className = '', actions, user }) {
  const [sidebarOpen, setSidebarOpen] = useInstitutionSidebar();
  const cardMotion = useCerbylCardMotion(INSTITUTION_CARDS);
  const navigate = useNavigate();
  const base = role === 'student' ? 'student' : 'educator';
  const identity = user || getCachedAccountSession()?.user;
  const displayName = identity?.display_name || identity?.first_name || localStorage.getItem('username') || 'My profile';
  const links = base === 'student'
    ? [['/student', 'My day'], ['/student/learning', 'My learning'], ['/student/classes', 'My classes'], ['/student/library', 'Study Library'], ['/student/assignments', 'Assignments'], ['/student/messages', 'Ask my teacher'], ['/student/notifications', 'Updates']]
    : [['/educator', 'Teaching day'], ['/educator/learning', 'Learning studio'], ['/educator/classes', 'Classes & materials'], ['/educator/assignments', 'Assignments'], ['/educator/gradebook', 'Gradebook'], ['/educator/messages', 'Messages'], ['/educator/notifications', 'Updates'], ['/company', 'Company workspace']];
  return <div className={`cbd-root ci-root b2b-root ${className}`} {...cardMotion}>
    <div className="ci-bg" aria-hidden="true"><div className="ci-bg-wash"/><div className="ci-bg-dots"/><div className="ci-bg-grain"/><div className="ci-bg-vignette"/></div>
    <header className="ci-topbar"><div className="ci-tagline"><span>LEARNING,</span> UNIFIED</div><div className="ci-context-meter"><span>{role === 'company' ? 'Company workspace' : `${base} workspace`}</span><strong>{company}</strong></div><Link className="ci-action" to={`/${base}`}><ArrowLeft size={14}/> My dashboard</Link></header>
    <div className={`ci-shell ci-shell--standard-sidebar ${sidebarOpen ? '' : 'ci-shell--collapsed'}`}>
      <CerbylSidebar
        open={sidebarOpen} onOpenChange={setSidebarOpen} brandKicker={role}
        displayName={displayName} profilePhoto={identity?.picture_url} profileSubtitle={company}
        profileTo={`/${base}/profile`} profileLabel="My profile"
        onEditProfile={() => navigate(`/${base}/profile`)} editProfileLabel="Open my profile" editProfileText="Profile"
        navigationLabel="Classroom navigation"
        quickLinks={links.slice(0, 3).map(([to,label]) => ({ to, label, active: active === to }))}
        workspaceLinks={[
          ...links.slice(3).map(([to,label]) => ({ to, label, active: active === to })),
          { to: '/join-company', label: 'Join a company' },
          { label: 'Sign out', onClick: async () => { await signOutAppSession(); navigate('/login'); } },
        ]}
      />
      <main className="ci-main b2b-main"><header className="b2b-heading"><div className="b2b-heading-copy"><span className="ci-kicker">{company}</span><h1>{title}<span>.</span></h1><p>{subtitle}</p></div>{actions&&<div className="b2b-heading-actions">{actions}</div>}</header>{children}</main></div>
  </div>;
}
