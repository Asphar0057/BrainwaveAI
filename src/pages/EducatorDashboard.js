import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpenCheck,
  CalendarDays,
  ChevronRight,
  CirclePlus,
  ClipboardCheck,
  FileStack,
  GraduationCap,
  LogOut,
  Megaphone,
  MessageCircle,
  RefreshCw,
  Search,
  Sparkles,
  Trophy,
  UsersRound,
  X,
} from 'lucide-react';
import { apiRequest } from '../config/api';
import ClassWorkspaceDialog from '../components/ClassWorkspaceDialog';
import { signOutAppSession } from '../utils/authSession';
import { downloadClassroomFile, isProtectedClassroomFile } from '../utils/classroomFiles';
import './InstitutionalDashboard.css';

const EDUCATOR_TOOLS = [
  { label: 'Classes', sub: 'TEACHING DAY', icon: GraduationCap },
  { label: 'Create', sub: 'PUBLISH WORK', icon: CirclePlus },
  { label: 'Review', sub: 'FEEDBACK', icon: ClipboardCheck },
  { label: 'Students', sub: 'LEARNER SIGNALS', icon: UsersRound },
  { label: 'Content', sub: 'MATERIALS', icon: FileStack },
  { label: 'Gradebook', sub: 'CLASS OUTCOMES', icon: BarChart3 },
  { label: 'Messages', sub: 'PRIVATE CLASS CHAT', icon: MessageCircle },
  { label: 'Announcements', sub: 'COMMUNICATE', icon: Megaphone },
  { label: 'Schedule', sub: 'CALENDAR', icon: CalendarDays },
];

const formatToday = () => new Intl.DateTimeFormat('en-IN', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
}).format(new Date());

function useDialogFocus(onClose) {
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(document.activeElement);

  useEffect(() => {
    const dialog = dialogRef.current;
    const focusableSelector = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href]';
    dialog?.querySelector(focusableSelector)?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll(focusableSelector)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      returnFocusRef.current?.focus?.();
    };
  }, [onClose]);

  return dialogRef;
}

export function AssignmentDialog({ sections, onClose, onCreated }) {
  const dialogRef = useDialogFocus(onClose);
  const [form, setForm] = useState({
    section_id: sections[0]?.section_id || '',
    title: '',
    description: '',
    due_at: '',
    estimated_minutes: 30,
    points_possible: 100,
    assignment_type: 'practice',
    ai_policy: 'guided',
    rubric_text: '',
    weight_percent: 0,
    start_at: '',
    allow_resubmission: true,
    max_attempts: 3,
    status: 'published',
  });
  const [status, setStatus] = useState({ saving: false, error: '' });

  const submit = async (event) => {
    event.preventDefault();
    setStatus({ saving: true, error: '' });
    try {
      await apiRequest('/institution/educator/assignments', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          section_id: Number(form.section_id),
          estimated_minutes: Number(form.estimated_minutes),
          points_possible: Number(form.points_possible),
          weight_percent: Number(form.weight_percent),
          max_attempts: Number(form.max_attempts),
          due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
          start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        }),
      });
      onCreated();
    } catch (error) {
      setStatus({ saving: false, error: error.message });
    }
  };

  return (
    <div className="ci-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="ci-modal" role="dialog" aria-modal="true" aria-labelledby="assignment-dialog-title">
        <div className="ci-tile-texture" />
        <header>
          <div><span>CREATE FOR A CLASS</span><h2 id="assignment-dialog-title">New assignment.</h2></div>
          <button type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>
        <form onSubmit={submit}>
          <label>Class
            <select value={form.section_id} onChange={(event) => setForm({ ...form, section_id: event.target.value })} required>
              {sections.map((section) => <option value={section.section_id} key={section.section_id}>{section.course_code} · {section.course_title}</option>)}
            </select>
          </label>
          <label>Assignment title
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} minLength={3} maxLength={180} required placeholder="e.g. Graph traversal checkpoint" />
          </label>
          <label>Instructions
            <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} placeholder="What should students complete?" />
          </label>
          <label>Rubric and success criteria
            <textarea value={form.rubric_text} onChange={(event) => setForm({ ...form, rubric_text: event.target.value })} rows={3} placeholder="Describe what excellent, satisfactory, and incomplete work looks like." />
          </label>
          <div className="ci-form-grid">
            <label>Available from
              <input type="datetime-local" value={form.start_at} onChange={(event) => setForm({ ...form, start_at: event.target.value })} />
            </label>
            <label>Due date
              <input type="datetime-local" value={form.due_at} onChange={(event) => setForm({ ...form, due_at: event.target.value })} />
            </label>
            <label>Estimated minutes
              <input type="number" min="5" max="600" value={form.estimated_minutes} onChange={(event) => setForm({ ...form, estimated_minutes: event.target.value })} />
            </label>
          </div>
          <div className="ci-form-grid ci-form-grid--three">
            <label>Activity type
              <select value={form.assignment_type} onChange={(event) => setForm({ ...form, assignment_type: event.target.value })}>
                <option value="practice">Practice</option>
                <option value="quiz">Quiz</option>
                <option value="problem_set">Problem set</option>
                <option value="reflection">Reflection</option>
                <option value="writing">Writing</option>
              </select>
            </label>
            <label>Points
              <input type="number" min="1" max="1000" value={form.points_possible} onChange={(event) => setForm({ ...form, points_possible: event.target.value })} />
            </label>
            <label>Grade weight %
              <input type="number" min="0" max="100" step="0.5" value={form.weight_percent} onChange={(event) => setForm({ ...form, weight_percent: event.target.value })} />
            </label>
            <label>AI policy
              <select value={form.ai_policy} onChange={(event) => setForm({ ...form, ai_policy: event.target.value })}>
                <option value="guided">Guided help</option>
                <option value="open">Open use</option>
                <option value="restricted">Restricted</option>
              </select>
            </label>
          </div>
          <div className="ci-form-grid ci-form-grid--three">
            <label>Attempts
              <input type="number" min="1" max="20" value={form.max_attempts} onChange={(event) => setForm({ ...form, max_attempts: event.target.value })} />
            </label>
            <label>Publishing
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option value="published">Publish now</option>
                <option value="draft">Save as draft</option>
              </select>
            </label>
            <label className="ci-checkbox-label">
              <input type="checkbox" checked={form.allow_resubmission} onChange={(event) => setForm({ ...form, allow_resubmission: event.target.checked })} />
              Allow resubmission
            </label>
          </div>
          {status.error && <p className="ci-form-error" role="alert">{status.error}</p>}
          <footer>
            <button className="ci-action" type="button" onClick={onClose}>Cancel</button>
            <button className="ci-action ci-action--primary" type="submit" disabled={status.saving || !sections.length}>
              {status.saving ? 'Saving…' : form.status === 'draft' ? 'Save draft' : 'Publish assignment'} <ArrowUpRight size={15} />
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function AnnouncementDialog({ sections, onClose, onCreated }) {
  const dialogRef = useDialogFocus(onClose);
  const [form, setForm] = useState({
    section_id: sections[0]?.section_id || '',
    title: '',
    body: '',
  });
  const [status, setStatus] = useState({ saving: false, error: '' });

  const submit = async (event) => {
    event.preventDefault();
    setStatus({ saving: true, error: '' });
    try {
      await apiRequest('/institution/educator/announcements', {
        method: 'POST',
        body: JSON.stringify({ ...form, section_id: Number(form.section_id) }),
      });
      onCreated();
    } catch (error) {
      setStatus({ saving: false, error: error.message });
    }
  };

  return (
    <div className="ci-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="ci-modal" role="dialog" aria-modal="true" aria-labelledby="announcement-dialog-title">
        <div className="ci-tile-texture" />
        <header>
          <div><span>PUBLISH TO ENROLLED STUDENTS</span><h2 id="announcement-dialog-title">Class announcement.</h2></div>
          <button type="button" aria-label="Close announcement" onClick={onClose}><X size={18} /></button>
        </header>
        <form onSubmit={submit}>
          <label>Class
            <select value={form.section_id} onChange={(event) => setForm({ ...form, section_id: event.target.value })} required>
              {sections.map((section) => <option value={section.section_id} key={section.section_id}>{section.course_code} · {section.course_title}</option>)}
            </select>
          </label>
          <label>Headline
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} minLength={3} maxLength={180} required placeholder="What should the class know?" />
          </label>
          <label>Message
            <textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} minLength={3} maxLength={5000} rows={5} required placeholder="Give students the context and next action…" />
          </label>
          {status.error && <p className="ci-form-error" role="alert">{status.error}</p>}
          <footer>
            <button className="ci-action" type="button" onClick={onClose}>Cancel</button>
            <button className="ci-action ci-action--primary" type="submit" disabled={status.saving || !sections.length}>
              {status.saving ? 'Publishing…' : 'Publish to class'} <ArrowUpRight size={15} />
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function ReviewDialog({ assignment, onClose, onChanged }) {
  const dialogRef = useDialogFocus(onClose);
  const [state, setState] = useState({ status: 'loading', data: null, error: '' });
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);

  const load = async () => {
    setState({ status: 'loading', data: null, error: '' });
    try {
      const data = await apiRequest(`/institution/educator/assignments/${assignment.assignment_id}/submissions`);
      setState({ status: 'ready', data, error: '' });
      setDrafts(Object.fromEntries(data.submissions.map((row) => [
        row.student.id,
        { score: row.score ?? '', feedback: row.feedback || '' },
      ])));
    } catch (error) {
      setState({ status: 'error', data: null, error: error.message });
    }
  };

  useEffect(() => {
    load();
  }, [assignment.assignment_id]);

  const saveGrade = async (row) => {
    const draft = drafts[row.student.id];
    setSavingId(row.submission_id);
    try {
      await apiRequest(`/institution/educator/submissions/${row.submission_id}/grade`, {
        method: 'PATCH',
        body: JSON.stringify({ score: Number(draft.score), feedback: draft.feedback }),
      });
      await load();
      onChanged();
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    } finally {
      setSavingId(null);
    }
  };

  const openAttachment = (row) => {
    if (isProtectedClassroomFile(row.attachment_url)) {
      downloadClassroomFile(row.attachment_url, row.attachment_name || `${row.student.display_name}-submission`)
        .catch((error) => setState((current) => ({ ...current, error: error.message })));
      return;
    }
    window.open(row.attachment_url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="ci-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="ci-modal ci-modal--review" role="dialog" aria-modal="true" aria-labelledby="review-dialog-title">
        <div className="ci-tile-texture" />
        <header>
          <div><span>{assignment.course_code} · SUBMISSION REVIEW</span><h2 id="review-dialog-title">{assignment.title}</h2></div>
          <button type="button" aria-label="Close review" onClick={onClose}><X size={18} /></button>
        </header>
        {state.status === 'loading' && <div className="ci-inline-state"><span className="ci-loader" /> Loading student work…</div>}
        {state.status === 'error' && !state.data && <div className="ci-inline-state ci-inline-state--error">{state.error}</div>}
        {state.data && (
          <div className="ci-review-list">
            {state.data.submissions.map((row) => {
              const draft = drafts[row.student.id] || { score: '', feedback: '' };
              const canGrade = Boolean(row.submission_id) && ['submitted', 'graded'].includes(row.status);
              return (
                <article key={row.student.id}>
                  <div className="ci-review-student">
                    <span className="ci-student-avatar">{row.student.display_name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
                    <span><strong>{row.student.display_name}</strong><small>{row.status.replace('_', ' ')}</small></span>
                  </div>
                  <p className="ci-review-response">{row.content_text || 'No work submitted yet.'}</p>
                  {row.attachment_url && (
                    <button
                      className="ci-action"
                      type="button"
                      onClick={() => openAttachment(row)}
                    >
                      Download {row.attachment_name || 'attachment'}
                    </button>
                  )}
                  <div className="ci-grade-fields">
                    <label>Score / {state.data.assignment.points_possible}
                      <input type="number" min="0" max={state.data.assignment.points_possible} value={draft.score} disabled={!canGrade} onChange={(event) => setDrafts({ ...drafts, [row.student.id]: { ...draft, score: event.target.value } })} />
                    </label>
                    <label>Feedback
                      <input value={draft.feedback} disabled={!canGrade} onChange={(event) => setDrafts({ ...drafts, [row.student.id]: { ...draft, feedback: event.target.value } })} placeholder={canGrade ? 'Specific next step for this student' : 'Available after submission'} />
                    </label>
                    <button className="ci-action ci-action--primary" type="button" disabled={!canGrade || savingId === row.submission_id || draft.score === '' || draft.feedback.trim().length < 3} onClick={() => saveGrade(row)}>
                      {row.submission_id && savingId === row.submission_id ? 'Saving…' : row.status === 'graded' ? 'Update grade' : 'Publish grade'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {state.error && state.data && <p className="ci-form-error" role="alert">{state.error}</p>}
      </section>
    </div>
  );
}

function EducatorDashboard() {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [reviewAssignment, setReviewAssignment] = useState(null);
  const [state, setState] = useState({ status: 'loading', data: null, error: '' });
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [classWorkspaceId, setClassWorkspaceId] = useState(null);
  const [leaderboard, setLeaderboard] = useState({ status: 'idle', data: null, error: '' });

  const loadDashboard = async () => {
    setState((current) => ({ ...current, status: 'loading', error: '' }));
    try {
      const data = await apiRequest('/institution/educator/dashboard');
      setState({ status: 'ready', data, error: '' });
    } catch (error) {
      setState({ status: 'error', data: null, error: error.message });
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    const firstSectionId = state.data?.class_health?.[0]?.section_id;
    if (firstSectionId && !selectedSectionId) setSelectedSectionId(firstSectionId);
  }, [state.data, selectedSectionId]);

  useEffect(() => {
    if (!selectedSectionId) return;
    let active = true;
    setLeaderboard((current) => ({ ...current, status: 'loading', error: '' }));
    apiRequest(`/institution/sections/${selectedSectionId}/leaderboard`)
      .then((data) => active && setLeaderboard({ status: 'ready', data, error: '' }))
      .catch((error) => active && setLeaderboard({ status: 'error', data: null, error: error.message }));
    return () => { active = false; };
  }, [selectedSectionId, state.data]);

  const firstName = state.data?.user?.first_name || 'Educator';
  const initials = useMemo(() => firstName.replace('Dr. ', '').slice(0, 2).toUpperCase(), [firstName]);
  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return EDUCATOR_TOOLS.filter((tool) => (
      `${tool.label} ${tool.sub}`.toLowerCase().includes(normalized)
    )).slice(0, 5);
  }, [query]);

  const signOutAndSwitch = async () => {
    await signOutAppSession();
    navigate('/login', { replace: true });
  };

  const openEducatorTool = (label) => {
    if (label === 'Classes') {
      navigate('/educator/classes');
      return;
    }
    if (label === 'Create') {
      setDialogOpen(true);
      return;
    }
    if (label === 'Announcements') {
      setAnnouncementOpen(true);
      return;
    }
    if (label === 'Content') {
      if (selectedSectionId) setClassWorkspaceId(selectedSectionId);
      return;
    }
    if (label === 'Gradebook') {
      navigate('/educator/gradebook');
      return;
    }
    if (label === 'Messages') {
      navigate('/educator/messages');
      return;
    }
    const sectionIds = {
      Review: 'educator-review',
      Students: 'educator-students',
      Schedule: 'educator-schedule',
    };
    const sectionId = sectionIds[label];
    if (sectionId) {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const focusStudentSignal = (student) => {
    const section = classHealth.find((item) => item.course_code === student.course_code);
    if (section) setSelectedSectionId(section.section_id);
    window.requestAnimationFrame(() => {
      document.getElementById('educator-leaderboard')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  if (state.status === 'loading') {
    return (
      <main className="ci-root ci-state-page">
        <div className="ci-state-panel" role="status"><span className="ci-loader" /><p>Reading the teaching day…</p></div>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="ci-root ci-state-page">
        <div className="ci-state-panel" role="alert">
          <span className="ci-kicker">EDUCATOR WORKSPACE</span>
          <h1>We could not load your teaching day.</h1>
          <p>{state.error}</p>
          <div className="ci-state-actions">
            <button className="ci-action ci-action--primary" type="button" onClick={loadDashboard}>Try again <RefreshCw size={15} /></button>
            <button className="ci-action" type="button" onClick={signOutAndSwitch}>Switch account</button>
          </div>
        </div>
      </main>
    );
  }

  const data = state.data;
  const classHealth = data.class_health || [];
  const reviewWorkload = data.review_workload || [];
  const attention = data.attention_queue || [];
  const agenda = data.agenda || [];

  return (
    <div className="ci-root ci-root--educator">
      <div className="ci-bg" aria-hidden>
        <div className="ci-bg-wash" />
        <div className="ci-bg-dots" />
        <div className="ci-bg-grain" />
        <div className="ci-bg-vignette" />
      </div>

      <header className="ci-topbar">
        <div className="ci-tagline"><span>TEACHING,</span> UNIFIED</div>
        <div className="ci-context-meter">
          <span>Teaching context</span>
          <strong>{data.organization?.name || 'Institution workspace'}</strong>
          <small>{data.term?.name || 'Current term'}</small>
        </div>
        <div className="ci-topbar-right">
          <span className="ci-date">{formatToday()}</span>
          <button className="ci-round-button" type="button" aria-label="Open teaching notifications" onClick={() => navigate('/educator/notifications')}><Bell size={15} /></button>
          <button className="ci-profile-button" type="button" aria-label="Open educator profile" onClick={() => navigate('/profile')}>{initials}</button>
        </div>
      </header>

      <div className="ci-shell">
        <aside className="ci-side">
          <div className="ci-tile-texture" />
          <div className="ci-brand">cerbyl <span>educator</span></div>
          <div className="ci-identity-orbit">
            <div className="ci-identity-avatar">{initials}</div>
            <span className="ci-orbit ci-orbit--one" />
            <span className="ci-orbit ci-orbit--two" />
          </div>

          <div className="ci-side-primary">
            {EDUCATOR_TOOLS.slice(0, 3).map(({ label }) => (
              <button type="button" key={label} onClick={() => openEducatorTool(label)}>
                <span className="ci-side-dot" />{label}<span>+</span>
              </button>
            ))}
          </div>

          <nav className="ci-side-nav" aria-label="Educator tools">
            {EDUCATOR_TOOLS.slice(3).map(({ label }) => (
              <button
                type="button"
                key={label}
                onClick={() => openEducatorTool(label)}
              >
                <span className="ci-side-dot" />{label}
              </button>
            ))}
          </nav>

          <div className="ci-side-bottom">
            <button className="ci-user-chip" type="button" onClick={() => navigate('/profile')}>
              <strong>{firstName}</strong>
              <span>{data.summary.active_sections} sections · {data.summary.active_students} students</span>
            </button>
            <button className="ci-signout" type="button" onClick={signOutAndSwitch} aria-label="Sign out and switch account"><LogOut size={14} /></button>
          </div>
        </aside>

        <main className="ci-main">
          <section className="ci-hero">
            <div className="ci-kicker">GOOD {new Date().getHours() < 12 ? 'MORNING' : new Date().getHours() < 17 ? 'AFTERNOON' : 'EVENING'}</div>
            <h1>{firstName}<span>.</span></h1>

            <div className="ci-search">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setShowSearch(true);
                }}
                onFocus={() => setShowSearch(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && searchResults[0]) {
                    event.preventDefault();
                    setShowSearch(false);
                    openEducatorTool(searchResults[0].label);
                  }
                }}
                placeholder="Search classes, students, assignments, teaching tools..."
                aria-label="Search educator tools"
              />
              {showSearch && query && (
                <div className="ci-search-results">
                  {searchResults.length ? searchResults.map((tool) => (
                    <button type="button" key={tool.label} onClick={() => {
                      setShowSearch(false);
                      openEducatorTool(tool.label);
                    }}>{tool.label}<ChevronRight size={13} /></button>
                  )) : <span>No educator tools match “{query}”</span>}
                </div>
              )}
            </div>

            <div className="ci-metric-row">
              <div className="ci-metric"><strong>{String(data.summary.active_sections).padStart(2, '0')}</strong><span>SECTIONS</span></div>
              <div className="ci-metric"><strong>{String(data.summary.active_students).padStart(2, '0')}</strong><span>STUDENTS</span></div>
              <div className="ci-metric"><strong>{String(data.summary.needs_attention).padStart(2, '0')}</strong><span>ATTENTION</span></div>
              <div className="ci-metric"><strong>{String(data.summary.submissions_to_review).padStart(2, '0')}</strong><span>TO REVIEW</span></div>
              <button className="ci-action ci-action--primary" type="button" onClick={() => setDialogOpen(true)}><CirclePlus size={15} /> Create assignment <ArrowUpRight size={16} /></button>
              <button className="ci-action" type="button" onClick={() => setAnnouncementOpen(true)}><Megaphone size={15} /> Announce</button>
            </div>
            <div className="ci-progress-line"><span style={{ width: `${data.summary.average_mastery}%` }} /></div>
          </section>

          <section className="ci-feature-grid" aria-label="Educator workspace">
            <article className="ci-feature ci-feature--classes" id="educator-classes">
              <div className="ci-tile-texture" />
              <div className="ci-feature-tag">CLASSES</div>
              <h2>Run your<br />teaching day</h2>
              <p>Section health and pace at a glance.</p>
              <div className="ci-feature-list">
                {classHealth.slice(0, 3).map((course) => (
                  <button className={`ci-feature-list-row ${selectedSectionId === course.section_id ? 'is-selected' : ''}`} type="button" key={course.section_id} onClick={() => {
                    setSelectedSectionId(course.section_id);
                    setClassWorkspaceId(course.section_id);
                  }}>
                    <span className="ci-list-icon"><GraduationCap size={12} /></span>
                    <span><strong>{course.course_code}</strong>{course.course_title}</span>
                    <em>{course.on_track_percent}%</em>
                  </button>
                ))}
              </div>
            </article>

            <article className="ci-feature ci-feature--create">
              <div className="ci-tile-texture" />
              <div className="ci-feature-tag">CREATE</div>
              <h2>Build and<br />publish</h2>
              <p>Turn course material into the next useful activity.</p>
              <div className="ci-create-visual" aria-hidden>
                <span><Sparkles size={14} /> Material</span>
                <i />
                <span><BookOpenCheck size={14} /> Assignment</span>
                <i />
                <span><Megaphone size={14} /> Class</span>
              </div>
              <button className="ci-inline-action" type="button" onClick={(event) => { event.stopPropagation(); setDialogOpen(true); }}>
                Create assignment <ArrowUpRight size={14} />
              </button>
            </article>

            <article className="ci-feature ci-feature--review" id="educator-review">
              <div className="ci-tile-texture" />
              <div className="ci-feature-tag">REVIEW</div>
              <h2>Respond with<br />evidence</h2>
              <p>Submissions waiting for a teaching decision.</p>
              <div className="ci-feature-list">
                {reviewWorkload.slice(0, 3).map((item) => (
                  <button className="ci-feature-list-row" type="button" key={item.assignment_id} onClick={() => setReviewAssignment(item)}>
                    <span className="ci-list-icon"><ClipboardCheck size={12} /></span>
                    <span><strong>{item.course_code}</strong>{item.title}</span>
                    <em>{item.needs_review} LEFT</em>
                  </button>
                ))}
                {!reviewWorkload.length && <div className="ci-feature-empty">Nothing is waiting for review.</div>}
              </div>
            </article>
          </section>

          <section className="ci-module-strip">
            <div className="ci-strip-title">YOUR TEACHING TOOLS</div>
            <div className="ci-module-track">
              {EDUCATOR_TOOLS.slice(3).map(({ label, sub, icon: Icon }, index) => (
                <button
                  type="button"
                  className="ci-module"
                  key={label}
                  onClick={() => openEducatorTool(label)}
                >
                  <div className="ci-tile-texture" />
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <Icon size={15} />
                  <strong>{label}</strong>
                  <small>{sub}</small>
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
          </section>

          <section className="ci-lower-grid">
            <div className="ci-lower-panel" id="educator-students">
              <div className="ci-panel-heading"><strong>Students requiring attention</strong><span>{data.summary.needs_attention} current signals</span></div>
              <div className="ci-student-row">
                {attention.slice(0, 4).map((student) => (
                  <button type="button" key={`${student.student_id}-${student.course_code}`} onClick={() => focusStudentSignal(student)} aria-label={`Open ${student.course_code} evidence for ${student.student_name}`}>
                    <span className="ci-student-avatar">{student.student_name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
                    <span><strong>{student.student_name}</strong><small>{student.course_code} · {student.signal}</small></span>
                    <em>{student.mastery_percent}%</em>
                  </button>
                ))}
              </div>
            </div>
            <div className="ci-focus-panel" id="educator-schedule">
              <div><span>TODAY’S TEACHING</span><strong>{agenda[0]?.title || 'Your schedule is clear.'}</strong><small>{agenda[0]?.meta || 'No scheduled class'}</small></div>
              <div className="ci-focus-score">{data.focus?.average_mastery || 0}%</div>
              <CalendarDays size={18} />
            </div>
          </section>

          <section className="ci-leaderboard-panel" id="educator-leaderboard" aria-live="polite">
            <div className="ci-panel-heading">
              <div><Trophy size={15} /><strong>Section leaderboard</strong></div>
              <span>{leaderboard.data?.section?.course_code || 'Choose a class'} · live from class outcomes</span>
            </div>
            {leaderboard.status === 'loading' && <div className="ci-inline-state"><span className="ci-loader" /> Calculating section outcomes…</div>}
            {leaderboard.status === 'error' && <div className="ci-inline-state ci-inline-state--error">{leaderboard.error}</div>}
            {leaderboard.status === 'ready' && (
              <>
                <div className="ci-ranking-list">
                  {leaderboard.data.leaderboard.map((row) => (
                    <div key={row.student.id}>
                      <strong>#{row.rank}</strong>
                      <span className="ci-student-avatar">{row.student.display_name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
                      <span><b>{row.student.display_name}</b><small>{row.mastery_percent}% mastery · {row.completion_rate}% complete</small></span>
                      <em>{row.score} pts</em>
                    </div>
                  ))}
                </div>
                <p className="ci-ranking-note">Publishing a grade updates mastery, progress, and this ranking for the same enrolled section.</p>
              </>
            )}
          </section>
        </main>
      </div>

      {dialogOpen && (
        <AssignmentDialog
          sections={classHealth}
          onClose={() => setDialogOpen(false)}
          onCreated={() => {
            setDialogOpen(false);
            loadDashboard();
          }}
        />
      )}
      {announcementOpen && (
        <AnnouncementDialog
          sections={classHealth}
          onClose={() => setAnnouncementOpen(false)}
          onCreated={() => {
            setAnnouncementOpen(false);
            loadDashboard();
          }}
        />
      )}
      {reviewAssignment && (
        <ReviewDialog
          assignment={reviewAssignment}
          onClose={() => setReviewAssignment(null)}
          onChanged={loadDashboard}
        />
      )}
      {classWorkspaceId && (
        <ClassWorkspaceDialog
          role="educator"
          sectionId={classWorkspaceId}
          onClose={() => setClassWorkspaceId(null)}
          onReviewOpen={(assignment) => {
            setClassWorkspaceId(null);
            setReviewAssignment(assignment);
          }}
          onChanged={loadDashboard}
        />
      )}
    </div>
  );
}

export default EducatorDashboard;
