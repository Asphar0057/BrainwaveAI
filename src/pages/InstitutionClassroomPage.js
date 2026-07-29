import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  BookOpenCheck,
  Check,
  ChevronRight,
  ClipboardList,
  FilePenLine,
  GraduationCap,
  Inbox,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  UsersRound,
} from 'lucide-react';
import { apiRequest } from '../config/api';
import ClassWorkspaceDialog from '../components/ClassWorkspaceDialog';
import { SubmissionDialog } from './StudentDashboard';
import { AssignmentDialog, ReviewDialog } from './EducatorDashboard';
import './InstitutionClassroomPage.css';

const VIEW_COPY = {
  classes: ['Classes', 'The live structure of your teaching and learning term.'],
  assignments: ['Assignments', 'Plan, complete, review, and publish classroom work.'],
  gradebook: ['Gradebook', 'A section-wide record of evidence, progress, and outcomes.'],
  messages: ['Messages', 'Private, class-bound communication between students and educators.'],
  notifications: ['Notifications', 'Deadlines, feedback, materials, and classroom changes.'],
};

const formatDate = (value) => value
  ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
  : 'No deadline';

function InstitutionClassroomPage({ role, view }) {
  const navigate = useNavigate();
  const isEducator = role === 'educator';
  const homeRoute = isEducator ? '/educator' : '/student';
  const [dashboard, setDashboard] = useState({ status: 'loading', data: null, error: '' });
  const [resource, setResource] = useState({ status: 'idle', data: null, error: '' });
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [classDialogId, setClassDialogId] = useState(null);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [reviewAssignment, setReviewAssignment] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [messageForm, setMessageForm] = useState({ recipient_id: '', subject: '', body: '' });
  const [messageStatus, setMessageStatus] = useState({ saving: false, error: '', message: '' });
  const [editDraft, setEditDraft] = useState(null);
  const [editStatus, setEditStatus] = useState({ saving: false, error: '' });
  const editorRef = useRef(null);
  const editorReturnFocusRef = useRef(null);
  const editOpen = Boolean(editDraft);

  const loadDashboard = async () => {
    setDashboard((current) => ({ ...current, status: 'loading', error: '' }));
    try {
      const data = await apiRequest(`/institution/${role}/dashboard`);
      setDashboard({ status: 'ready', data, error: '' });
      const firstId = isEducator ? data.class_health?.[0]?.section_id : data.courses?.[0]?.section_id;
      setSelectedSectionId((current) => current || firstId || null);
    } catch (error) {
      setDashboard({ status: 'error', data: null, error: error.message });
    }
  };

  const loadResource = async () => {
    if (dashboard.status !== 'ready') return;
    let endpoint = null;
    if (view === 'assignments' && isEducator) endpoint = '/institution/educator/assignments?include_archived=true';
    if (view === 'gradebook' && selectedSectionId) endpoint = `/institution/educator/sections/${selectedSectionId}/gradebook`;
    if (view === 'messages') endpoint = `/institution/messages${selectedSectionId ? `?section_id=${selectedSectionId}` : ''}`;
    if (view === 'notifications') endpoint = '/institution/notifications';
    if (view === 'messages' && selectedSectionId) {
      try {
        const [messages, section] = await Promise.all([
          apiRequest(endpoint),
          apiRequest(`/institution/sections/${selectedSectionId}`),
        ]);
        setResource({ status: 'ready', data: { ...messages, section }, error: '' });
      } catch (error) {
        setResource({ status: 'error', data: null, error: error.message });
      }
      return;
    }
    if (!endpoint) {
      setResource({ status: 'ready', data: null, error: '' });
      return;
    }
    setResource((current) => ({ ...current, status: 'loading', error: '' }));
    try {
      setResource({ status: 'ready', data: await apiRequest(endpoint), error: '' });
    } catch (error) {
      setResource({ status: 'error', data: null, error: error.message });
    }
  };

  useEffect(() => { loadDashboard(); }, [role]);
  useEffect(() => { loadResource(); }, [view, selectedSectionId, dashboard.status]);
  useEffect(() => {
    setMessageForm((current) => ({ ...current, recipient_id: '' }));
  }, [selectedSectionId]);
  useEffect(() => {
    if (!editOpen) return undefined;
    const editor = editorRef.current;
    const selector = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)';
    editor?.querySelector(selector)?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setEditDraft(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(editor?.querySelectorAll(selector) || [])];
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
      editorReturnFocusRef.current?.focus?.();
    };
  }, [editOpen]);

  const sections = useMemo(() => (
    isEducator
      ? (dashboard.data?.class_health || []).map((row) => ({
        section_id: row.section_id,
        course_code: row.course_code,
        course_title: row.course_title,
        students: row.students,
        progress: row.on_track_percent,
      }))
      : (dashboard.data?.courses || []).map((row) => ({
        section_id: row.section_id,
        course_code: row.code,
        course_title: row.title,
        students: null,
        progress: row.progress_percent,
        teacher: row.teacher,
        schedule: row.schedule,
      }))
  ), [dashboard.data, isEducator]);

  const assignments = useMemo(() => {
    const rows = isEducator
      ? resource.data?.assignments || []
      : dashboard.data?.assignments || [];
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => (
      (!normalized || `${row.title} ${row.course_code} ${row.description || ''}`.toLowerCase().includes(normalized))
      && (statusFilter === 'all' || (isEducator ? row.published_status : row.status) === statusFilter)
    ));
  }, [dashboard.data, resource.data, isEducator, query, statusFilter]);

  const refresh = async () => {
    await loadDashboard();
    await loadResource();
  };

  const saveEdit = async () => {
    if (!editDraft) return;
    setEditStatus({ saving: true, error: '' });
    try {
      await apiRequest(`/institution/educator/assignments/${editDraft.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editDraft.title,
          description: editDraft.description || '',
          assignment_type: editDraft.assignment_type,
          due_at: editDraft.due_at || null,
          start_at: editDraft.start_at || null,
          rubric_text: editDraft.rubric_text || '',
          points_possible: Number(editDraft.points_possible),
          estimated_minutes: Number(editDraft.estimated_minutes),
          weight_percent: Number(editDraft.weight_percent || 0),
          max_attempts: Number(editDraft.max_attempts || 1),
          allow_resubmission: Boolean(editDraft.allow_resubmission),
          ai_policy: editDraft.ai_policy,
          status: editDraft.published_status,
        }),
      });
      setEditDraft(null);
      setEditStatus({ saving: false, error: '' });
      loadResource();
    } catch (error) {
      setEditStatus({ saving: false, error: error.message });
    }
  };

  const archiveAssignment = async (id) => {
    try {
      await apiRequest(`/institution/educator/assignments/${id}`, { method: 'DELETE' });
      loadResource();
    } catch (error) {
      setResource((current) => ({ ...current, error: error.message, status: 'error' }));
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    setMessageStatus({ saving: true, error: '', message: '' });
    try {
      await apiRequest('/institution/messages', {
        method: 'POST',
        body: JSON.stringify({
          section_id: selectedSectionId,
          recipient_id: Number(messageForm.recipient_id),
          subject: messageForm.subject,
          body: messageForm.body,
        }),
      });
      setMessageForm({ recipient_id: '', subject: '', body: '' });
      setMessageStatus({ saving: false, error: '', message: 'Private message sent.' });
      loadResource();
    } catch (error) {
      setMessageStatus({ saving: false, error: error.message, message: '' });
    }
  };

  const markRead = async (id) => {
    try {
      await apiRequest(`/institution/notifications/${id}/read`, { method: 'PATCH' });
      loadResource();
    } catch (error) {
      setResource((current) => ({ ...current, error: error.message, status: 'error' }));
    }
  };

  if (dashboard.status === 'loading') return <main className="icp-state"><span className="ci-loader" /> Loading classroom workspace…</main>;
  if (dashboard.status === 'error') return <main className="icp-state"><h1>Classroom unavailable.</h1><p>{dashboard.error}</p><button onClick={loadDashboard}>Try again</button></main>;

  const [title, description] = VIEW_COPY[view] || VIEW_COPY.classes;
  const userName = dashboard.data?.user?.first_name || (isEducator ? 'Educator' : 'Student');
  const messageRecipients = isEducator
    ? resource.data?.section?.roster?.map((row) => row.student) || []
    : resource.data?.section?.instructor ? [resource.data.section.instructor] : [];

  return (
    <div className={`icp-root icp-root--${role}`}>
      <header className="icp-topbar">
        <button type="button" onClick={() => navigate(homeRoute)}><ArrowLeft size={15} /> Dashboard</button>
        <div><strong>cerbyl</strong><span>{isEducator ? 'educator' : 'student'}</span></div>
        <button type="button" onClick={() => navigate('/profile')}>{userName}</button>
      </header>

      <aside className="icp-nav">
        <div><span>CLASSROOM</span><strong>{dashboard.data?.organization?.name}</strong></div>
        {(isEducator
          ? [['classes', GraduationCap], ['assignments', ClipboardList], ['gradebook', BookOpenCheck], ['messages', MessageCircle], ['notifications', Bell]]
          : [['classes', GraduationCap], ['assignments', ClipboardList], ['messages', MessageCircle], ['notifications', Bell]]
        ).map(([item, Icon]) => (
          <button className={view === item ? 'is-active' : ''} type="button" key={item} onClick={() => navigate(`/${role}/${item}`)}>
            <Icon size={15} /><span>{VIEW_COPY[item][0]}</span><ChevronRight size={13} />
          </button>
        ))}
        <button type="button" onClick={() => navigate('/profile')}><UsersRound size={15} /><span>Profile</span><ChevronRight size={13} /></button>
      </aside>

      <main className="icp-main">
        <section className="icp-heading">
          <div><span>{isEducator ? 'TEACHING OPERATIONS' : 'STUDENT CLASSROOM'}</span><h1>{title}<em>.</em></h1><p>{description}</p></div>
          <button type="button" onClick={refresh}><RefreshCw size={14} /> Refresh</button>
        </section>
        {resource.status === 'error' && <div className="icp-error" role="alert">{resource.error}</div>}

        {sections.length > 1 && ['gradebook', 'messages'].includes(view) && (
          <div className="icp-section-switcher">
            {sections.map((section) => <button className={selectedSectionId === section.section_id ? 'is-active' : ''} type="button" key={section.section_id} onClick={() => setSelectedSectionId(section.section_id)}>{section.course_code}</button>)}
          </div>
        )}

        {view === 'classes' && (
          <section className="icp-class-list">
            {sections.map((section) => (
              <button type="button" key={section.section_id} onClick={() => setClassDialogId(section.section_id)}>
                <span>{section.course_code}</span>
                <div><h2>{section.course_title}</h2><p>{section.teacher || `${section.students} enrolled students`} · {section.schedule || 'Current term'}</p></div>
                <strong>{section.progress}%</strong><ChevronRight size={18} />
              </button>
            ))}
          </section>
        )}

        {view === 'assignments' && (
          <>
            <div className="icp-toolbar">
              <label><Search size={15} /><input aria-label="Search assignments" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search coursework…" /></label>
              <select aria-label="Filter assignments by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All states</option>
                {(isEducator ? ['published', 'draft', 'archived'] : ['scheduled', 'not_started', 'draft', 'submitted', 'graded']).map((item) => <option value={item} key={item}>{item.replaceAll('_', ' ')}</option>)}
              </select>
              {isEducator && <button className="icp-primary" type="button" onClick={() => setCreateOpen(true)}><Plus size={15} /> New assignment</button>}
            </div>
            <section className="icp-assignment-list">
              {assignments.map((assignment) => (
                <article key={assignment.id}>
                  <div><span>{assignment.course_code} · {formatDate(assignment.due_at)}</span><h2>{assignment.title}</h2><p>{assignment.description || 'No additional instructions.'}</p></div>
                  <div className="icp-assignment-meta">
                    <span>{assignment.points_possible} pts</span><span>{assignment.estimated_minutes} min</span><span>AI {assignment.ai_policy}</span>
                    <strong>{(isEducator ? assignment.published_status : assignment.status).replaceAll('_', ' ')}</strong>
                  </div>
                  <div className="icp-row-actions">
                    {isEducator ? (
                      <>
                        <button type="button" onClick={() => setReviewAssignment({ ...assignment, assignment_id: assignment.id })}>Review {assignment.submitted_count || 0}</button>
                        <button type="button" onClick={(event) => { editorReturnFocusRef.current = event.currentTarget; setEditDraft({ ...assignment }); }}><FilePenLine size={14} /> Edit</button>
                        <button type="button" aria-label={`Archive ${assignment.title}`} onClick={() => archiveAssignment(assignment.id)}><Trash2 size={14} /></button>
                      </>
                    ) : (
                      <button type="button" disabled={assignment.status === 'scheduled'} onClick={() => setSelectedAssignment(assignment)}>
                        {assignment.status === 'scheduled' ? `Opens ${formatDate(assignment.start_at)}` : 'Open work'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!assignments.length && <div className="icp-empty">No assignments match this view.</div>}
            </section>
          </>
        )}

        {view === 'gradebook' && (
          <section className="icp-gradebook">
            {resource.status === 'loading' && <div className="icp-empty">Calculating gradebook…</div>}
            {resource.data && (
              <table><thead><tr><th>Student</th>{resource.data.assignments.map((item) => <th key={item.id}>{item.title}<small>{item.points_possible} pts</small></th>)}<th>Average</th></tr></thead>
                <tbody>{resource.data.rows.map((row) => <tr key={row.student.id}><th>{row.student.display_name}<small>{row.mastery_percent}% mastery</small></th>{resource.data.assignments.map((item) => <td key={item.id}>{row.scores[item.id]?.score ?? '—'}<small>{row.scores[item.id]?.status.replaceAll('_', ' ')}</small></td>)}<td><strong>{row.average_percent ?? '—'}{row.average_percent !== null ? '%' : ''}</strong></td></tr>)}</tbody>
              </table>
            )}
          </section>
        )}

        {view === 'messages' && (
          <div className="icp-message-layout">
            <section className="icp-inbox">
              <div><Inbox size={15} /><strong>Conversation history</strong></div>
              {(resource.data?.messages || []).map((message) => <article className={message.is_mine ? 'is-mine' : ''} key={message.id}><span>{message.course_code} · {message.is_mine ? `To ${message.recipient.display_name}` : `From ${message.sender.display_name}`}</span><h3>{message.subject}</h3><p>{message.body}</p><small>{formatDate(message.created_at)}</small></article>)}
              {!resource.data?.messages?.length && <div className="icp-empty">No private messages in this class yet.</div>}
            </section>
            <form className="icp-compose" onSubmit={sendMessage}>
              <span>NEW PRIVATE MESSAGE</span><h2>Write with context.</h2>
              <label>Recipient<select required value={messageForm.recipient_id} onChange={(event) => setMessageForm({ ...messageForm, recipient_id: event.target.value })}><option value="">Choose recipient</option>{messageRecipients.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select></label>
              <label>Subject<input minLength={3} maxLength={180} required value={messageForm.subject} onChange={(event) => setMessageForm({ ...messageForm, subject: event.target.value })} /></label>
              <label>Message<textarea rows={7} minLength={3} maxLength={5000} required value={messageForm.body} onChange={(event) => setMessageForm({ ...messageForm, body: event.target.value })} /></label>
              {messageStatus.error && <p role="alert">{messageStatus.error}</p>}{messageStatus.message && <p role="status">{messageStatus.message}</p>}
              <button className="icp-primary" disabled={messageStatus.saving} type="submit"><Send size={14} /> {messageStatus.saving ? 'Sending…' : 'Send privately'}</button>
            </form>
          </div>
        )}

        {view === 'notifications' && (
          <section className="icp-notification-list">
            <div className="icp-notification-summary"><Bell size={18} /><strong>{resource.data?.unread_count || 0} unread classroom updates</strong></div>
            {(resource.data?.notifications || []).map((item) => <article className={item.is_read ? '' : 'is-unread'} key={item.id}><span><Bell size={14} /></span><div><strong>{item.title}</strong><p>{item.message}</p><small>{formatDate(item.created_at)}</small></div>{!item.is_read && <button type="button" onClick={() => markRead(item.id)}><Check size={14} /> Mark read</button>}</article>)}
            {!resource.data?.notifications?.length && <div className="icp-empty">No classroom notifications yet.</div>}
          </section>
        )}
      </main>

      {classDialogId && <ClassWorkspaceDialog role={role} sectionId={classDialogId} onClose={() => setClassDialogId(null)} onAssignmentOpen={(item) => { setClassDialogId(null); setSelectedAssignment(item); }} onReviewOpen={(item) => { setClassDialogId(null); setReviewAssignment(item); }} onChanged={refresh} />}
      {selectedAssignment && <SubmissionDialog assignment={selectedAssignment} onClose={() => setSelectedAssignment(null)} onSubmitted={() => { setSelectedAssignment(null); refresh(); }} />}
      {reviewAssignment && <ReviewDialog assignment={reviewAssignment} onClose={() => setReviewAssignment(null)} onChanged={refresh} />}
      {createOpen && <AssignmentDialog sections={sections} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); refresh(); }} />}
      {editDraft && (
        <div className="icp-editor-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setEditDraft(null)}>
          <section ref={editorRef} className="icp-editor" role="dialog" aria-modal="true" aria-label="Edit assignment">
            <header><span>ASSIGNMENT CONTROL</span><h2>Edit and publish.</h2></header>
            <label>Title<input value={editDraft.title} onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })} /></label>
            <label>Instructions<textarea rows={4} value={editDraft.description || ''} onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })} /></label>
            <label>Rubric<textarea rows={4} value={editDraft.rubric_text || ''} onChange={(event) => setEditDraft({ ...editDraft, rubric_text: event.target.value })} /></label>
            <label>Due date<input type="datetime-local" value={editDraft.due_at ? editDraft.due_at.slice(0, 16) : ''} onChange={(event) => setEditDraft({ ...editDraft, due_at: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label>
            <label>Available from<input type="datetime-local" value={editDraft.start_at ? editDraft.start_at.slice(0, 16) : ''} onChange={(event) => setEditDraft({ ...editDraft, start_at: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label>
            <div><label>Points<input type="number" value={editDraft.points_possible} onChange={(event) => setEditDraft({ ...editDraft, points_possible: event.target.value })} /></label><label>Minutes<input type="number" min="5" max="600" value={editDraft.estimated_minutes} onChange={(event) => setEditDraft({ ...editDraft, estimated_minutes: event.target.value })} /></label><label>Weight %<input type="number" value={editDraft.weight_percent || 0} onChange={(event) => setEditDraft({ ...editDraft, weight_percent: event.target.value })} /></label></div>
            <div><label>Attempts<input type="number" min="1" max="20" value={editDraft.max_attempts || 1} onChange={(event) => setEditDraft({ ...editDraft, max_attempts: event.target.value })} /></label><label className="icp-checkbox"><input type="checkbox" checked={editDraft.allow_resubmission} onChange={(event) => setEditDraft({ ...editDraft, allow_resubmission: event.target.checked })} />Allow resubmission</label></div>
            <div><label>Type<select value={editDraft.assignment_type} onChange={(event) => setEditDraft({ ...editDraft, assignment_type: event.target.value })}><option value="practice">Practice</option><option value="quiz">Quiz</option><option value="problem_set">Problem set</option><option value="reflection">Reflection</option><option value="writing">Writing</option></select></label><label>Status<select value={editDraft.published_status} onChange={(event) => setEditDraft({ ...editDraft, published_status: event.target.value })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label><label>AI policy<select value={editDraft.ai_policy} onChange={(event) => setEditDraft({ ...editDraft, ai_policy: event.target.value })}><option value="guided">Guided</option><option value="open">Open</option><option value="restricted">Restricted</option></select></label></div>
            {editStatus.error && <p className="icp-editor-error" role="alert">{editStatus.error}</p>}
            <footer><button type="button" onClick={() => setEditDraft(null)}>Cancel</button><button className="icp-primary" type="button" disabled={editStatus.saving} onClick={saveEdit}>{editStatus.saving ? 'Saving…' : 'Save changes'}</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}

export default InstitutionClassroomPage;
