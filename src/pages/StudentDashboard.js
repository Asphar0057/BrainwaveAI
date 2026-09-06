import useAccountDraft from '../hooks/useAccountDraft';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  GraduationCap,
  Library,
  LogOut,
  MessageCircle,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react';
import { apiRequest } from '../config/api';
import ClassWorkspaceDialog from '../components/ClassWorkspaceDialog';
import { signOutAppSession } from '../utils/authSession';
import './InstitutionalDashboard.css';

const STUDENT_TOOLS = [
  { label: 'Classes', sub: 'COURSEWORK', route: '/student/classes', icon: GraduationCap },
  { label: 'Assignments', sub: 'DEADLINES', route: '/student/assignments', icon: ClipboardList },
  { label: 'Course Tutor', sub: 'ASK WITH CONTEXT', route: '/ai-chat', icon: MessageCircle },
  { label: 'Messages', sub: 'PRIVATE CLASS CHAT', route: '/student/messages', icon: MessageCircle },
  { label: 'Practice', sub: 'STRENGTHEN', route: '/quiz-hub', icon: Target },
  { label: 'Study Library', sub: 'MATERIALS', route: '/notes', icon: Library },
  { label: 'Progress', sub: 'MASTERY', route: '/analytics', icon: TrendingUp },
  { label: 'Flashcards', sub: 'RECALL', route: '/flashcards', icon: BookOpen },
  { label: 'Knowledge Map', sub: 'CONNECTIONS', route: '/knowledge-map', icon: CircleHelp },
];

const formatDate = (value) => {
  if (!value) return 'OPEN';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value)).toUpperCase();
};

const formatToday = () => new Intl.DateTimeFormat('en-IN', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
}).format(new Date());

function useDialogFocus(onClose) {
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(document.activeElement);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    const focusableSelector = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href]';
    dialog?.querySelector(focusableSelector)?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
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
  }, []);

  return dialogRef;
}

export function SubmissionDialog({ assignment, onClose, onSubmitted }) {
  const dialogRef = useDialogFocus(() => { if (!status.saving && (!attachmentFile || window.confirm('The selected file is not saved yet. Close this draft?'))) onClose(); });
  const [content, setContent, clearContentDraft] = useAccountDraft(`submission:${assignment.id}`, assignment.content_text || '');
  const [attachmentUrl, setAttachmentUrl] = useState(assignment.attachment_url || '');
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [status, setStatus] = useState({ saving: false, error: '' });
  const wasSubmitted = ['submitted', 'graded'].includes(assignment.status);
  const attemptsUsed = assignment.attempt_number || 0;
  const canResubmit = !wasSubmitted || (
    assignment.allow_resubmission
    && attemptsUsed < assignment.max_attempts
  );
  const hasSubmittableWork = content.trim().length >= 20 || Boolean(attachmentFile || attachmentUrl);

  const resolveAttachment = async () => {
    if (!attachmentFile) return attachmentUrl || null;
    const body = new FormData();
    body.append('file', attachmentFile);
    const uploaded = await apiRequest(`/institution/student/assignments/${assignment.id}/file`, {
      method: 'POST',
      body,
    });
    setAttachmentUrl(uploaded.url);
    return uploaded.url;
  };

  const submit = async (event) => {
    event.preventDefault();
    setStatus({ saving: true, error: '' });
    try {
      const resolvedAttachment = await resolveAttachment();
      await apiRequest(`/institution/student/assignments/${assignment.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          content_text: content,
          attachment_url: resolvedAttachment,
        }),
      });
      clearContentDraft();
      onSubmitted();
    } catch (error) {
      setStatus({ saving: false, error: error.message });
    }
  };

  const saveDraft = async () => {
    setStatus({ saving: true, error: '' });
    try {
      const resolvedAttachment = await resolveAttachment();
      await apiRequest(`/institution/student/assignments/${assignment.id}/draft`, {
        method: 'PUT',
        body: JSON.stringify({
          content_text: content,
          attachment_url: resolvedAttachment,
        }),
      });
      clearContentDraft();
      onSubmitted();
    } catch (error) {
      setStatus({ saving: false, error: error.message });
    }
  };

  return (
    <div className="ci-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !status.saving && (!attachmentFile || window.confirm('The selected file is not saved yet. Close this draft?')) && onClose()}>
      <section ref={dialogRef} className="ci-modal ci-modal--submission" role="dialog" aria-modal="true" aria-labelledby="submission-dialog-title">
        <div className="ci-tile-texture" />
        <header>
          <div>
            <span>{assignment.course_code} · DUE {formatDate(assignment.due_at)}</span>
            <h2 id="submission-dialog-title">{assignment.title}</h2>
          </div>
          <button type="button" aria-label="Close submission" onClick={() => { if (!status.saving && (!attachmentFile || window.confirm('The selected file is not saved yet. Close this draft?'))) onClose(); }}><X size={18} /></button>
        </header>
        <form onSubmit={submit}>
          <div className="ci-assignment-brief">
            <p>{assignment.description || 'Complete the assigned work and explain your reasoning clearly.'}</p>
            <span>{assignment.points_possible} points</span>
            <span>{assignment.estimated_minutes} minutes</span>
            <span>AI: {assignment.ai_policy}</span>
          </div>
          {assignment.rubric_text && (
            <div className="ci-rubric-note">
              <strong>Success criteria</strong>
              <p>{assignment.rubric_text}</p>
            </div>
          )}
          <label>Your response
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={8}
              maxLength={20000}
              placeholder="Show your reasoning, answer, and what you checked…"
            />
          </label>
          <label>Supporting link <small>optional</small>
            <input type="url" value={attachmentUrl} onChange={(event) => setAttachmentUrl(event.target.value)} placeholder="https://docs.example.com/your-work" />
          </label>
          <label>Upload work <small>PDF, document, image or archive · maximum 25 MB</small>
            <input type="file" disabled={wasSubmitted} onChange={(event) => setAttachmentFile(event.target.files?.[0] || null)} />
          </label>
          {wasSubmitted && <p className="ci-upload-note">Submitted files are locked for academic integrity. You can resubmit revised text or a new supporting link.</p>}
          {assignment.feedback && (
            <div className="ci-feedback-note">
              <strong>Teacher feedback · {assignment.score}/{assignment.points_possible}</strong>
              <p>{assignment.feedback}</p>
            </div>
          )}
          {status.error && <p className="ci-form-error" role="alert">{status.error}</p>}
          <footer>
            <button className="ci-action" type="button" onClick={() => { if (!status.saving && (!attachmentFile || window.confirm('The selected file is not saved yet. Close this draft?'))) onClose(); }}>Cancel</button>
            {!wasSubmitted && (
              <button className="ci-action" type="button" onClick={saveDraft} disabled={status.saving}>
                {status.saving ? 'Saving…' : 'Save draft'}
              </button>
            )}
            {canResubmit ? (
              <button className="ci-action ci-action--primary" type="submit" disabled={status.saving || !hasSubmittableWork}>
                {status.saving ? 'Submitting…' : wasSubmitted ? `Resubmit · attempt ${attemptsUsed + 1}/${assignment.max_attempts}` : 'Submit work'} <ArrowUpRight size={15} />
              </button>
            ) : (
              <span className="ci-submission-locked">
                {!assignment.allow_resubmission ? 'Resubmission is disabled.' : `All ${assignment.max_attempts} attempts have been used.`}
              </span>
            )}
          </footer>
        </form>
      </section>
    </div>
  );
}

function StudentDashboard() {
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading', data: null, error: '' });
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [classWorkspaceId, setClassWorkspaceId] = useState(null);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [leaderboard, setLeaderboard] = useState({ status: 'idle', data: null, error: '' });

  const loadDashboard = async () => {
    setState((current) => ({ ...current, status: 'loading', error: '' }));
    try {
      const data = await apiRequest('/institution/student/dashboard');
      setState({ status: 'ready', data, error: '' });
    } catch (error) {
      setState({ status: 'error', data: null, error: error.message });
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    const firstSectionId = state.data?.courses?.[0]?.section_id;
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

  const firstName = state.data?.user?.first_name || 'Student';
  const initials = useMemo(() => firstName.slice(0, 2).toUpperCase(), [firstName]);
  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return STUDENT_TOOLS.filter((tool) => (
      `${tool.label} ${tool.sub}`.toLowerCase().includes(normalized)
    )).slice(0, 5);
  }, [query]);

  const signOutAndSwitch = async () => {
    await signOutAppSession();
    navigate('/login', { replace: true });
  };

  const openStudentTool = async (label, route) => {
    if (label !== 'Course Tutor') { navigate(route); return; }
    if (!selectedSectionId) { navigate('/student/classes'); return; }
    try {
      const section = await apiRequest(`/institution/sections/${selectedSectionId}`);
      const materials = section.materials || [];
      const courseScope = { sectionId: selectedSectionId, label: `${section.course_code} · ${section.course_title}`, materials };
      const conversationContext = `Course: ${courseScope.label}. Section: ${section.name}. Published course material references: ${materials.map(item => `${item.title} (${item.source_url || 'classroom file'})`).join('; ') || 'None available'}. These are references only; do not claim to have read material contents that were not supplied. Ask the student to provide the relevant material before source-specific answers.`;
      navigate(route, { state: { courseScope, conversationContext } });
    } catch { window.alert('Course context could not be loaded. Try opening Course Tutor again.'); }
  };

  if (state.status === 'loading') {
    return (
      <main className="ci-root ci-state-page">
        <div className="ci-state-panel" role="status">
          <span className="ci-loader" />
          <p>Bringing your classes into focus…</p>
        </div>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="ci-root ci-state-page">
        <div className="ci-state-panel" role="alert">
          <span className="ci-kicker">STUDENT WORKSPACE</span>
          <h1>We could not load your learning day.</h1>
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
  const courses = data.courses || [];
  const assignments = data.upcoming_assignments || [];
  const focus = data.recommended_focus;
  const announcements = data.announcements || [];

  return (
    <div className="ci-root ci-root--student">
      <div className="ci-bg" aria-hidden>
        <div className="ci-bg-wash" />
        <div className="ci-bg-dots" />
        <div className="ci-bg-grain" />
        <div className="ci-bg-vignette" />
      </div>

      <header className="ci-topbar">
        <div className="ci-tagline"><span>LEARNING,</span> TOGETHER</div>
        <div className="ci-context-meter">
          <span>Current term</span>
          <strong>{data.term?.name || 'No active term'}</strong>
          <small>{data.organization?.name || 'Institution workspace'}</small>
        </div>
        <div className="ci-topbar-right">
          <span className="ci-date">{formatToday()}</span>
          <button className="ci-round-button" type="button" aria-label="Open class notifications" onClick={() => navigate('/student/notifications')}><Bell size={15} /></button>
          <button className="ci-profile-button" type="button" aria-label="Open student profile" onClick={() => navigate('/profile')}>{initials}</button>
        </div>
      </header>

      <div className="ci-shell">
        <aside className="ci-side">
          <div className="ci-tile-texture" />
          <div className="ci-brand">cerbyl <span>student</span></div>
          <div className="ci-identity-orbit">
            <div className="ci-identity-avatar">{initials}</div>
            <span className="ci-orbit ci-orbit--one" />
            <span className="ci-orbit ci-orbit--two" />
          </div>

          <div className="ci-side-primary">
            {STUDENT_TOOLS.slice(0, 3).map(({ label, route }) => (
              <button type="button" key={label} onClick={() => openStudentTool(label, route)}>
                <span className="ci-side-dot" />{label}<span>+</span>
              </button>
            ))}
          </div>

          <nav className="ci-side-nav" aria-label="Student tools">
            {STUDENT_TOOLS.slice(3).map(({ label, route }) => (
              <button type="button" key={label} onClick={() => navigate(route)}>
                <span className="ci-side-dot" />{label}
              </button>
            ))}
          </nav>

          <div className="ci-side-bottom">
            <button className="ci-user-chip" type="button" onClick={() => navigate('/profile')}>
              <strong>{firstName}</strong>
              <span>{courses.length} classes · {data.summary.average_mastery}% mastery</span>
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
                    openStudentTool(searchResults[0].label, searchResults[0].route);
                  }
                }}
                placeholder="Find a study tool"
                aria-label="Search student tools"
              />
              {showSearch && query && (
                <div className="ci-search-results">
                  {searchResults.length ? searchResults.map((tool) => (
                    <button type="button" key={tool.label} onClick={() => openStudentTool(tool.label, tool.route)}>
                      {tool.label}<ChevronRight size={13} />
                    </button>
                  )) : <span>No student tools match “{query}”</span>}
                </div>
              )}
            </div>

            <div className="ci-metric-row">
              <div className="ci-metric"><strong>{String(data.summary.active_courses).padStart(2, '0')}</strong><span>CLASSES</span></div>
              <div className="ci-metric"><strong>{String(data.summary.upcoming_assignments).padStart(2, '0')}</strong><span>TO DO</span></div>
              <div className="ci-metric"><strong>{data.summary.average_mastery}%</strong><span>MASTERY</span></div>
              <div className="ci-metric"><strong>{String(data.summary.completed_assignments).padStart(2, '0')}</strong><span>DONE</span></div>
              {data.summary.attendance_percent !== null && (
                <div className="ci-metric"><strong>{data.summary.attendance_percent}%</strong><span>ATTENDANCE</span></div>
              )}
              <button className="ci-action ci-action--primary" type="button" onClick={() => navigate('/quiz-hub')}><Target size={15} /> Start practice <ArrowUpRight size={16} /></button>
              <button className="ci-action" type="button" onClick={() => navigate('/notes')}><Library size={15} /> Study library <ArrowUpRight size={16} /></button>
            </div>
            <div className="ci-progress-line"><span style={{ width: `${data.summary.average_mastery}%` }} /></div>
          </section>

          <section className="ci-feature-grid" aria-label="Student workspace">
            <article className="ci-feature ci-feature--classes" id="student-classes">
              <div className="ci-tile-texture" />
              <div className="ci-feature-tag">CLASSES</div>
              <h2>Stay with<br />your course</h2>
              <p>Schedules, teachers and progress in one place.</p>
              <div className="ci-feature-list">
                {courses.slice(0, 3).map((course) => (
                  <button className={`ci-feature-list-row ${selectedSectionId === course.section_id ? 'is-selected' : ''}`} type="button" key={course.section_id} onClick={() => {
                    setSelectedSectionId(course.section_id);
                    setClassWorkspaceId(course.section_id);
                  }}>
                    <span className="ci-list-icon"><GraduationCap size={12} /></span>
                    <span><strong>{course.code}</strong>{course.title}</span>
                    <em>{course.progress_percent}%</em>
                  </button>
                ))}
              </div>
            </article>

            <article className="ci-feature ci-feature--assignments" id="student-assignments">
              <div className="ci-tile-texture" />
              <div className="ci-feature-tag">ASSIGNMENTS</div>
              <h2>Finish what<br />matters</h2>
              <p>Your next submissions, already ordered.</p>
              <div className="ci-feature-list">
                {assignments.slice(0, 3).map((assignment) => (
                  <button className="ci-feature-list-row" type="button" key={assignment.id} disabled={assignment.status === 'scheduled'} onClick={() => setSelectedAssignment(assignment)}>
                    <span className="ci-list-icon"><ClipboardList size={12} /></span>
                    <span><strong>{assignment.course_code}</strong>{assignment.title}</span>
                    <em>{assignment.status === 'scheduled' ? `Opens ${formatDate(assignment.start_at)}` : formatDate(assignment.due_at)}</em>
                  </button>
                ))}
                {!assignments.length && <div className="ci-feature-empty">Nothing open. You are caught up.</div>}
              </div>
            </article>

            <button type="button" className="ci-feature ci-feature--tutor" onClick={() => navigate('/ai-chat')}>
              <div className="ci-tile-texture" />
              <span className="ci-feature-arrow"><ArrowUpRight size={16} /></span>
              <div className="ci-feature-tag">COURSE TUTOR</div>
              <h2>Ask with<br />context</h2>
              <p>Get help grounded in the class you are taking.</p>
              <div className="ci-tutor-prompt">
                <Sparkles size={13} />
                <span>{focus ? `Help me strengthen ${focus.course_code}` : 'Ask about any enrolled course'}</span>
              </div>
              <div className="ci-tutor-answer">
                {focus?.description || 'Choose a class and Cerbyl will bring the right material into the conversation.'}
              </div>
            </button>
          </section>

          <section className="ci-module-strip">
            <div className="ci-strip-title">YOUR STUDENT TOOLS</div>
            <div className="ci-module-track">
              {STUDENT_TOOLS.slice(3).map(({ label, sub, route, icon: Icon }, index) => (
                <button type="button" className="ci-module" key={label} onClick={() => navigate(route)}>
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
            <div className="ci-lower-panel" id="student-announcements">
              <div className="ci-panel-heading"><strong>Latest from your classes</strong><span>{announcements.length} announcements</span></div>
              <div className="ci-announcement-row">
                {announcements.slice(0, 3).map((item) => (
                  <div key={item.id}><span>{item.course_code}</span><strong>{item.title}</strong><p>{item.body}</p></div>
                ))}
                {!announcements.length && <div className="ci-feature-empty">No new class announcements.</div>}
              </div>
            </div>
            <button className="ci-focus-panel" type="button" onClick={() => focus && navigate(focus.route)} disabled={!focus}>
              <div><span>NEXT BEST MOVE</span><strong>{focus?.title || 'You are ready for your next class activity.'}</strong></div>
              <div className="ci-focus-score">{focus?.mastery_percent || 0}%</div>
              <ArrowUpRight size={18} />
            </button>
          </section>

          <section className="ci-leaderboard-panel" aria-live="polite">
            <div className="ci-panel-heading">
              <div><Trophy size={15} /><strong>Class leaderboard</strong></div>
              <span>{leaderboard.data?.section?.course_code || 'Choose a class'} · enrolled students only</span>
            </div>
            {leaderboard.status === 'loading' && <div className="ci-inline-state"><span className="ci-loader" /> Calculating this class…</div>}
            {leaderboard.status === 'error' && <div className="ci-inline-state ci-inline-state--error">{leaderboard.error}</div>}
            {leaderboard.status === 'ready' && (
              <>
                <div className="ci-ranking-list">
                  {leaderboard.data.leaderboard.slice(0, 5).map((row) => (
                    <div className={row.is_current_user ? 'is-current' : ''} key={row.student.id}>
                      <strong>#{row.rank}</strong>
                      <span className="ci-student-avatar">{row.student.display_name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
                      <span><b>{row.student.display_name}</b><small>{row.mastery_percent}% mastery · {row.completion_rate}% complete</small></span>
                      <em>{row.score} pts</em>
                    </div>
                  ))}
                </div>
                <p className="ci-ranking-note">Your class rank uses mastery, progress, grades, and assignment completion. Only students enrolled in {leaderboard.data.section.course_code} appear here.</p>
              </>
            )}
          </section>
        </main>
      </div>
      {selectedAssignment && (
        <SubmissionDialog
          assignment={selectedAssignment}
          onClose={() => setSelectedAssignment(null)}
          onSubmitted={() => {
            setSelectedAssignment(null);
            loadDashboard();
          }}
        />
      )}
      {classWorkspaceId && (
        <ClassWorkspaceDialog
          role="student"
          sectionId={classWorkspaceId}
          onClose={() => setClassWorkspaceId(null)}
          onAssignmentOpen={(assignment) => {
            setClassWorkspaceId(null);
            setSelectedAssignment(assignment);
          }}
          onChanged={loadDashboard}
        />
      )}
    </div>
  );
}

export default StudentDashboard;
