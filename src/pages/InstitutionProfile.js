/* THESIS: A classroom identity with only the details needed to work together.
OWN-WORLD: Inherit ProfileNew's SocialHubChrome, portrait, panels, textures and type.
STORY: Confirm who you are, edit your name, and see your organization and classes.
FIRST VIEWPORT: Existing profile rail, name and portrait, access summary, identity form.
FORM: The user's pinned profile composition, adapted to teacher and student accounts. */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Building2, GraduationCap, LayoutGrid, LogOut, Pencil, User } from 'lucide-react';
import SocialHubChrome from '../components/SocialHubChrome';
import useScopedAccountDraft from '../hooks/useScopedAccountDraft';
import { institution } from '../services/institutionService';
import { clearAccountSession } from '../utils/institutionSession';
import { signOutAppSession } from '../utils/authSession';
import './ProfileNew.css';
import './ProfileWorkspace.css';
import './InstitutionProfile.css';

const roleLabels = { student: 'Student', educator: 'Teacher', owner: 'Company owner' };

export default function InstitutionProfile({ role }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [saving, setSaving] = useState(false), [notice, setNotice] = useState(''), [saveError, setSaveError] = useState('');
  const [draft, setDraft] = useScopedAccountDraft('institution-profile', null);
  const [collapsed, setCollapsed] = useState(false), [active, setActive] = useState('overview');
  const firstNameRef = useRef(null);
  async function load() {
    setLoading(true); setError('');
    try { setData(await institution('/profile')); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [role]);
  const values = draft || { first_name: data?.user.first_name || '', last_name: data?.user.last_name || '' };
  const dirty = Boolean(data && (values.first_name !== (data.user.first_name || '') || values.last_name !== (data.user.last_name || '')));
  const owner = data?.organizations.some(o => o.role === 'owner');
  const roleLabel = roleLabels[owner ? 'owner' : role];
  const dashboard = data?.dashboard_route || `/${role}`;
  const name = data?.user.display_name || 'Your profile';
  const initials = data ? [data.user.first_name, data.user.last_name].filter(Boolean).map(n => n[0]).join('').toUpperCase() || data.user.username[0].toUpperCase() : '—';
  function showSection(id) {
    setActive(id);
    const section = document.getElementById(`b2bp-${id}`);
    section?.scrollIntoView({ block: 'start', behavior: 'auto' });
    if (id === 'identity') firstNameRef.current?.focus({ preventScroll: true });
    else section?.focus({ preventScroll: true });
  }
  async function save(event) {
    event.preventDefault();
    if (saving || !dirty) return;
    setSaving(true); setSaveError(''); setNotice('');
    try {
      const updated = await institution('/profile', { first_name: values.first_name.trim(), last_name: values.last_name.trim() }, 'PATCH');
      setData(updated); setDraft(null); clearAccountSession(); setNotice('Profile saved. Your name is updated across your classroom.');
    } catch (e) { setSaveError(e.message); }
    finally { setSaving(false); }
  }
  async function signOut() { await signOutAppSession(); navigate('/login'); }
  const sections = [{ label: 'Profile', items: [
    { icon: User, label: 'Overview', active: active === 'overview', onClick: () => showSection('overview') },
    { icon: Pencil, label: 'Identity', active: active === 'identity', onClick: () => showSection('identity') },
    { icon: Building2, label: 'Organizations', active: active === 'organizations', onClick: () => showSection('organizations') },
    { icon: GraduationCap, label: 'My classes', active: active === 'classes', onClick: () => showSection('classes') },
  ] }];

  return <div className="pn-root pn-profile-workspace with-social-chrome b2bp-root">
    <SocialHubChrome brandKicker={`${roleLabel} profile`} sideSections={sections} collapsed={collapsed} onCollapsedChange={setCollapsed}
      topbarAction={{ label: 'Dashboard', path: dashboard }}
      footerItems={[{ icon: LayoutGrid, label: 'Dashboard', path: dashboard }, { icon: GraduationCap, label: 'Classroom', path: `/${role}/classes` }]}
      sidebarLead={<button className="pnw-side-primary" disabled={!data} onClick={() => showSection('identity')}><Pencil size={15}/>Edit profile</button>}
      collapsedLeadItems={[{ icon: Pencil, label: 'Edit profile', onClick: () => showSection('identity') }]}
      collapsedTailItems={[{ icon: LogOut, label: 'Sign out', onClick: signOut }]}
      sidebarTail={<div className="pnw-sidebar-tail"><button onClick={signOut}><LogOut size={15}/><span>Sign out</span><ArrowUpRight size={13}/></button></div>}>
      <main className="pnw-main"><div className="pnw-canvas">
        {loading && <p role="status">Loading your classroom profile…</p>}
        {error && <section className="pnw-panel"><h1>Profile unavailable</h1><p role="alert">{error}</p><button className="pnw-primary-action" onClick={load}>Try again</button></section>}
        {data && <>
          <section className="pnw-identity pnw-identity--no-photo" id="b2bp-overview" tabIndex={-1}>
            <div className="pnw-identity-nameplate" aria-hidden="true">{name}</div>
            <div className="pnw-identity-copy"><p className="pnw-kicker">Your {roleLabel.toLowerCase()} identity</p><h1>{name}<span>.</span></h1>
              <p className="pnw-identity-summary">{role === 'student' ? 'Your name, classroom access, and enrolled classes.' : owner ? 'Your identity and the organizations you manage.' : 'Your name, organization access, and teaching assignments.'}</p>
              <div className="pnw-identity-actions"><button className="pnw-primary-action" onClick={() => showSection('identity')}>Edit identity <ArrowUpRight size={15}/></button><button className="pnw-secondary-action" onClick={() => showSection('classes')}>View my classes</button></div>
            </div>
            <div className="pnw-portrait"><div className="pnw-photo-button b2bp-portrait" aria-label={`${name}'s profile picture`}>
              {data.user.picture_url ? <img src={data.user.picture_url} alt="" referrerPolicy="no-referrer"/> : <span>{initials}</span>}
            </div><div className="pnw-portrait-caption"><span>Classroom identity</span><strong>{roleLabel}</strong></div></div>
          </section>
          <section className="pnw-status-band" aria-label="Classroom account summary">
            <div><span>Account role</span><strong>{roleLabel}</strong></div><div><span>Organizations</span><strong>{data.organizations.length}</strong></div><div><span>{role === 'student' ? 'Enrolled classes' : 'Teaching classes'}</span><strong>{data.classes.length}</strong></div>
          </section>
          <div className="pnw-work-grid">
            <section className="pnw-panel pnw-identity-form" id="b2bp-identity" tabIndex={-1}>
              <div className="pnw-section-heading"><div><h2>Profile details</h2></div><small>{dirty ? 'Unsaved changes' : 'Account identity'}</small></div>
              <form onSubmit={save}>
                <div className="pnw-form-grid">
                  <label><span>First name</span><input ref={firstNameRef} required maxLength={50} autoComplete="given-name" disabled={saving} value={values.first_name} onChange={e => { setDraft({ ...values, first_name: e.target.value }); setNotice(''); }}/></label>
                  <label><span>Last name</span><input maxLength={50} autoComplete="family-name" disabled={saving} value={values.last_name} onChange={e => { setDraft({ ...values, last_name: e.target.value }); setNotice(''); }}/></label>
                  <label><span>Username</span><input readOnly value={data.user.username} autoComplete="username"/></label>
                  <label><span>Sign-in email</span><input readOnly value={data.user.email || ''} autoComplete="email"/></label>
                </div>
                <p className="b2bp-note">Your name appears on classwork and messages. Your sign-in details and organization role are managed separately.</p>
                {saveError && <p className="b2bp-error" role="alert">{saveError}</p>}{notice && <p className="b2bp-notice" role="status">{notice}</p>}
                <div className="b2bp-actions"><button className="pnw-primary-action" disabled={saving || !dirty || !values.first_name.trim()}>{saving ? 'Saving…' : 'Save changes'}</button><button className="pnw-secondary-action" type="button" disabled={saving || !dirty} onClick={() => { setDraft(null); setSaveError(''); setNotice(''); }}>Discard changes</button></div>
              </form>
            </section>
            <section className="pnw-panel" id="b2bp-organizations" tabIndex={-1}>
              <div className="pnw-section-heading"><div><h2>Organizations & access</h2></div></div>
              {data.organizations.map(org => <article className="b2bp-record" key={org.id}><h3>{org.name}</h3><p>{roleLabels[org.role]} · Active membership</p>{org.role === 'owner' && <button className="pnw-text-action" onClick={() => navigate('/company')}>Manage organization <ArrowUpRight size={14}/></button>}</article>)}
              {!data.organizations.length && <p className="b2bp-note">No active organization membership. Accept an invitation to connect your classroom account.</p>}
              <p className="b2bp-note">Roles and class access are managed by your company owner.</p>
              <button className="pnw-text-action" onClick={() => navigate('/join-company')}>Accept an invitation <ArrowUpRight size={14}/></button>
            </section>
          </div>
          <section className="pnw-panel" id="b2bp-classes" tabIndex={-1}>
            <div className="pnw-section-heading"><div><h2>{role === 'student' ? 'My classes' : 'Teaching assignments'}</h2></div></div>
            {data.classes.map(course => <article className="b2bp-record b2bp-class" key={course.id}><div><h3>{course.title}</h3><p>{course.code} · {course.cohort} · {course.organization}</p><p>{role === 'student' ? `Teacher: ${course.instructor}` : 'You teach this class'}{course.schedule ? ` · ${course.schedule}` : ''}</p></div><button className="pnw-secondary-action" onClick={() => navigate(`/${role}/learning?section=${course.id}&view=Lessons`)}>{role === 'student' ? 'Open classwork' : 'Open learning studio'}<ArrowUpRight size={14}/></button></article>)}
            {!data.classes.length && <p className="b2bp-note">No active classes assigned. {owner ? 'Assign teaching responsibilities from your company workspace.' : 'Ask your company owner to check your class access.'}</p>}
          </section>
        </>}
      </div></main>
    </SocialHubChrome>
  </div>;
}
