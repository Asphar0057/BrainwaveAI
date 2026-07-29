import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  BookOpenCheck,
  CalendarCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  Plus,
  RefreshCw,
  UsersRound,
  X,
} from 'lucide-react';
import { apiRequest } from '../config/api';
import { downloadClassroomFile, isProtectedClassroomFile } from '../utils/classroomFiles';
import './ClassWorkspaceDialog.css';

const TABS = [
  { id: 'overview', label: 'Overview', icon: GraduationCap },
  { id: 'work', label: 'Coursework', icon: ClipboardList },
  { id: 'materials', label: 'Materials', icon: FileText },
  { id: 'people', label: 'People', icon: UsersRound },
  { id: 'activity', label: 'Activity', icon: Activity },
];

const formatDate = (value, options = {}) => (
  value
    ? new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      ...options,
    }).format(new Date(value))
    : 'No date'
);

const todayValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

function EmptyState({ children }) {
  return <div className="ci-workspace-empty">{children}</div>;
}

function ClassWorkspaceDialog({
  role,
  sectionId,
  onClose,
  onAssignmentOpen,
  onReviewOpen,
  onChanged,
}) {
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(document.activeElement);
  const [activeTab, setActiveTab] = useState('overview');
  const [state, setState] = useState({ status: 'loading', data: null, error: '' });
  const [attendanceDate, setAttendanceDate] = useState(todayValue());
  const [attendanceDrafts, setAttendanceDrafts] = useState({});
  const [attendanceStatus, setAttendanceStatus] = useState({ saving: false, message: '', error: '' });
  const [materialForm, setMaterialForm] = useState({ title: '', material_type: 'document', source_url: '' });
  const [materialFile, setMaterialFile] = useState(null);
  const [materialStatus, setMaterialStatus] = useState({ saving: false, message: '', error: '' });

  const load = async () => {
    setState((current) => ({ ...current, status: 'loading', error: '' }));
    try {
      const data = await apiRequest(`/institution/sections/${sectionId}`);
      setState({ status: 'ready', data, error: '' });
    } catch (error) {
      setState({ status: 'error', data: null, error: error.message });
    }
  };

  useEffect(() => {
    load();
  }, [sectionId]);

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

  const selectedAttendance = useMemo(() => {
    const existing = state.data?.attendance?.records || [];
    return Object.fromEntries(existing
      .filter((record) => record.class_date === attendanceDate)
      .map((record) => [record.student_id, record.status]));
  }, [state.data, attendanceDate]);

  useEffect(() => {
    if (role !== 'educator' || !state.data?.roster) return;
    setAttendanceDrafts(Object.fromEntries(
      state.data.roster.map(({ student }) => [
        student.id,
        selectedAttendance[student.id] || 'present',
      ]),
    ));
  }, [role, state.data, selectedAttendance]);

  const saveAttendance = async () => {
    setAttendanceStatus({ saving: true, message: '', error: '' });
    try {
      await apiRequest(`/institution/educator/sections/${sectionId}/attendance`, {
        method: 'PUT',
        body: JSON.stringify({
          class_date: attendanceDate,
          entries: Object.entries(attendanceDrafts).map(([studentId, status]) => ({
            student_id: Number(studentId),
            status,
          })),
        }),
      });
      await load();
      onChanged?.();
      setAttendanceStatus({ saving: false, message: 'Attendance saved for this class.', error: '' });
    } catch (error) {
      setAttendanceStatus({ saving: false, message: '', error: error.message });
    }
  };

  const createMaterial = async (event) => {
    event.preventDefault();
    setMaterialStatus({ saving: true, message: '', error: '' });
    try {
      if (materialFile) {
        const body = new FormData();
        body.append('title', materialForm.title);
        body.append('file', materialFile);
        await apiRequest(`/institution/educator/sections/${sectionId}/materials/upload`, { method: 'POST', body });
      } else {
        await apiRequest(`/institution/educator/sections/${sectionId}/materials`, {
          method: 'POST',
          body: JSON.stringify({
            ...materialForm,
            source_url: materialForm.source_url || null,
          }),
        });
      }
      setMaterialForm({ title: '', material_type: 'document', source_url: '' });
      setMaterialFile(null);
      await load();
      onChanged?.();
      setMaterialStatus({ saving: false, message: 'Material published to enrolled students.', error: '' });
    } catch (error) {
      setMaterialStatus({ saving: false, message: '', error: error.message });
    }
  };

  const openMaterial = async (material) => {
    if (!material.source_url) return;
    if (!isProtectedClassroomFile(material.source_url)) {
      window.open(material.source_url, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      setMaterialStatus({ saving: false, message: '', error: '' });
      await downloadClassroomFile(material.source_url, material.original_filename || material.title);
    } catch (error) {
      setMaterialStatus({ saving: false, message: '', error: error.message });
    }
  };

  const data = state.data;

  return (
    <div className="ci-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="ci-modal ci-modal--workspace" role="dialog" aria-modal="true" aria-labelledby="class-workspace-title">
        <div className="ci-tile-texture" />
        <header>
          <div>
            <span>{role === 'educator' ? 'TEACHING WORKSPACE' : 'CLASS WORKSPACE'}</span>
            <h2 id="class-workspace-title">{data ? `${data.course_code} · ${data.course_title}` : 'Opening class…'}</h2>
          </div>
          <button type="button" aria-label="Close class workspace" onClick={onClose}><X size={18} /></button>
        </header>

        {state.status === 'loading' && <div className="ci-inline-state"><span className="ci-loader" /> Loading class workspace…</div>}
        {state.status === 'error' && (
          <div className="ci-workspace-error" role="alert">
            <p>{state.error}</p>
            <button className="ci-action" type="button" onClick={load}><RefreshCw size={14} /> Try again</button>
          </div>
        )}

        {data && (
          <>
            <nav className="ci-workspace-tabs" aria-label="Class workspace sections">
              {TABS.filter((tab) => role === 'educator' || tab.id !== 'people').map(({ id, label, icon: Icon }) => (
                <button className={activeTab === id ? 'is-active' : ''} type="button" key={id} onClick={() => setActiveTab(id)}>
                  <Icon size={14} />{label}
                </button>
              ))}
            </nav>

            <div className="ci-workspace-body">
              {activeTab === 'overview' && (
                <div className="ci-workspace-overview">
                  <div className="ci-workspace-facts">
                    <div><span>Section</span><strong>{data.name}</strong></div>
                    <div><span>Schedule</span><strong>{data.schedule || 'Not scheduled'}</strong></div>
                    <div><span>Room</span><strong>{data.room || 'Room TBA'}</strong></div>
                    <div><span>People</span><strong>{data.student_count} students</strong></div>
                  </div>
                  <article className="ci-workspace-brief">
                    <div>
                      <span>NEXT COURSE ACTION</span>
                      <h3>{data.assignments[0]?.title || 'Everything is currently clear.'}</h3>
                      <p>{data.assignments[0]?.description || 'Your teacher has not published a new assignment yet.'}</p>
                    </div>
                    {data.assignments[0] && (
                      <button className="ci-action ci-action--primary" type="button" onClick={() => (
                        role === 'educator'
                          ? onReviewOpen?.({ ...data.assignments[0], assignment_id: data.assignments[0].id, course_code: data.course_code })
                          : onAssignmentOpen?.({ ...data.assignments[0], course_code: data.course_code })
                      )}>
                        {role === 'educator' ? 'Review class work' : 'Open assignment'} <ArrowUpRight size={15} />
                      </button>
                    )}
                  </article>
                  {role === 'student' && (
                    <div className="ci-attendance-summary">
                      <CalendarCheck size={18} />
                      <span><strong>{data.attendance.summary.percent === null ? '—' : `${data.attendance.summary.percent}%`}</strong> attendance</span>
                      <small>{data.attendance.summary.attended} of {data.attendance.summary.total} recorded classes attended</small>
                    </div>
                  )}
                  {role === 'educator' && (
                    <section className="ci-attendance-editor">
                      <div className="ci-workspace-section-heading">
                        <div><CalendarCheck size={15} /><strong>Attendance register</strong></div>
                        <label>Class date<input type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} /></label>
                      </div>
                      <div className="ci-attendance-list">
                        {data.roster.map(({ student }) => (
                          <label key={student.id}>
                            <span>{student.display_name}</span>
                            <select value={attendanceDrafts[student.id] || 'present'} onChange={(event) => setAttendanceDrafts({ ...attendanceDrafts, [student.id]: event.target.value })}>
                              <option value="present">Present</option>
                              <option value="late">Late</option>
                              <option value="absent">Absent</option>
                              <option value="excused">Excused</option>
                            </select>
                          </label>
                        ))}
                      </div>
                      {attendanceStatus.error && <p className="ci-form-error" role="alert">{attendanceStatus.error}</p>}
                      {attendanceStatus.message && <p className="ci-form-success" role="status">{attendanceStatus.message}</p>}
                      <button className="ci-action ci-action--primary" type="button" disabled={attendanceStatus.saving || !data.roster.length} onClick={saveAttendance}>
                        {attendanceStatus.saving ? 'Saving register…' : 'Save attendance'}
                      </button>
                    </section>
                  )}
                </div>
              )}

              {activeTab === 'work' && (
                <div className="ci-workspace-list">
                  {data.assignments.map((assignment) => (
                    <button type="button" key={assignment.id} onClick={() => (
                      role === 'educator'
                        ? onReviewOpen?.({ ...assignment, assignment_id: assignment.id, course_code: data.course_code })
                        : onAssignmentOpen?.({ ...assignment, course_code: data.course_code })
                    )}>
                      <span className="ci-list-icon"><BookOpenCheck size={13} /></span>
                      <span><strong>{assignment.title}</strong><small>{assignment.assignment_type.replaceAll('_', ' ')} · {assignment.estimated_minutes} min</small></span>
                      <span className={`ci-status ci-status--${assignment.status}`}>{assignment.status.replaceAll('_', ' ')}</span>
                      <em>{assignment.due_at ? `Due ${formatDate(assignment.due_at)}` : 'Open'}</em>
                    </button>
                  ))}
                  {!data.assignments.length && <EmptyState>No coursework has been published for this class.</EmptyState>}
                </div>
              )}

              {activeTab === 'materials' && (
                <div className="ci-workspace-materials">
                  {role === 'educator' && (
                    <form className="ci-material-form" onSubmit={createMaterial}>
                      <div>
                        <label>Material title<input value={materialForm.title} minLength={3} maxLength={180} required onChange={(event) => setMaterialForm({ ...materialForm, title: event.target.value })} placeholder="e.g. Week 4 revision guide" /></label>
                        <label>Type<select value={materialForm.material_type} onChange={(event) => setMaterialForm({ ...materialForm, material_type: event.target.value })}><option value="document">Document</option><option value="video">Video</option><option value="slides">Slides</option><option value="link">Link</option></select></label>
                      </div>
                      <label>Resource URL <small>optional</small><input type="url" value={materialForm.source_url} onChange={(event) => setMaterialForm({ ...materialForm, source_url: event.target.value })} placeholder="https://…" /></label>
                      <label>Or upload a file <small>maximum 50 MB</small><input type="file" onChange={(event) => setMaterialFile(event.target.files?.[0] || null)} /></label>
                      {materialStatus.error && <p className="ci-form-error" role="alert">{materialStatus.error}</p>}
                      {materialStatus.message && <p className="ci-form-success" role="status">{materialStatus.message}</p>}
                      <button className="ci-action ci-action--primary" type="submit" disabled={materialStatus.saving || materialForm.title.trim().length < 3}>
                        <Plus size={14} /> {materialStatus.saving ? 'Publishing…' : 'Publish material'}
                      </button>
                    </form>
                  )}
                  <div className="ci-workspace-list">
                    {data.materials.map((material) => (
                      <button type="button" onClick={() => openMaterial(material)} disabled={!material.source_url} key={material.id}>
                        <span className="ci-list-icon"><FileText size={13} /></span>
                        <span><strong>{material.title}</strong><small>{material.material_type} · added {formatDate(material.created_at)}</small></span>
                        <ArrowUpRight size={15} />
                      </button>
                    ))}
                    {!data.materials.length && <EmptyState>No class materials have been published yet.</EmptyState>}
                  </div>
                </div>
              )}

              {activeTab === 'people' && role === 'educator' && (
                <div className="ci-workspace-roster">
                  {data.roster.map(({ student, progress_percent: progress, mastery_percent: mastery, last_active_at: lastActive }) => (
                    <div key={student.id}>
                      <span className="ci-student-avatar">{student.display_name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
                      <span><strong>{student.display_name}</strong><small>Last active {formatDate(lastActive)}</small></span>
                      <span><small>Progress</small><strong>{progress}%</strong></span>
                      <span><small>Mastery</small><strong>{mastery}%</strong></span>
                    </div>
                  ))}
                  {!data.roster.length && <EmptyState>No active students are enrolled in this section.</EmptyState>}
                </div>
              )}

              {activeTab === 'activity' && (
                <div className="ci-workspace-timeline">
                  {data.activity.map((item) => (
                    <article key={item.id}>
                      <span />
                      <div><strong>{item.title}</strong><p>{item.detail || item.event_type.replaceAll('_', ' ')}</p><small>{item.actor} · {formatDate(item.created_at, { hour: 'numeric', minute: '2-digit' })}</small></div>
                    </article>
                  ))}
                  {!data.activity.length && <EmptyState>Class activity will appear here as work is published and completed.</EmptyState>}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default ClassWorkspaceDialog;
