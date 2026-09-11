import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { apiRequest } from '../config/api';
import useDialogA11y from '../hooks/useDialogA11y';

export default function TeacherClassDialog({ onClose, onCreated }) {
  const ref = useRef(null);
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useDialogA11y(true, () => { if (!busy) onClose(); }, ref);
  const [company, setCompany] = useState('');
  const [form, setForm] = useState({ code: '', title: '', name: '', schedule: '', student_ids: [] });
  const alive = useRef(true);
  const load = async () => { setError(''); try { const result = await apiRequest('/institution/educator/class-setup'); if (alive.current) { setData(result); setCompany(String(result.companies[0]?.id || '')); } } catch (e) { if (alive.current) setError(e.message); } };
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, []);
  const students = data?.companies.find(c => String(c.id) === company)?.students || [];
  async function save(e) {
    e.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { const result = await apiRequest(`/institution/companies/${company}/sections`, { method: 'POST', body: JSON.stringify({ ...form, instructor_id: data.instructor_id }) }); onCreated(result); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="ci-modal-backdrop" role="presentation"><section ref={ref} className="ci-modal ci-modal--assignment" role="dialog" aria-modal="true" aria-labelledby="teacher-class-title">
    <div className="ci-tile-texture" aria-hidden="true"/><header><div><span>YOUR TEACHING</span><h2 id="teacher-class-title">Create a class</h2></div><button type="button" aria-label="Close class setup" disabled={busy} onClick={onClose}><X size={18}/></button></header>
    {!data ? <div className="ci-inline-state">{error ? <><p role="alert">{error}</p><button className="ci-action" onClick={load}>Retry</button></> : 'Loading your company and students…'}</div> : !data.companies.length ? <div className="ci-inline-state">Join a company as an instructor before creating a class.</div> : <form onSubmit={save}><div className="ci-assignment-body">
      <label>Company<select required value={company} onChange={e => { setCompany(e.target.value); setForm({ ...form, student_ids: [] }); }}>{data.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="ci-form-grid"><label>Course code<input required minLength={2} maxLength={30} pattern="[A-Za-z0-9_-]+" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="PROB101"/></label><label>Course title<input required minLength={3} maxLength={160} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Probability foundations"/></label></div>
      <label>Class name<input required minLength={2} maxLength={80} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="September evening class"/></label>
      <label>Schedule (optional)<input maxLength={120} value={form.schedule} onChange={e => setForm({ ...form, schedule: e.target.value })} placeholder="Tuesdays, 6 pm IST"/></label>
      <fieldset className="b2b-question"><legend>Add company students</legend><p>Choose who joins this class. Ask your company owner to invite anyone who is not listed.</p>{students.map(s => <label className="ci-checkbox-label" key={s.id}><input type="checkbox" checked={form.student_ids.includes(s.id)} onChange={e => setForm({ ...form, student_ids: e.target.checked ? [...form.student_ids, s.id] : form.student_ids.filter(id => id !== s.id) })}/>{s.display_name}</label>)}{!students.length && <p>No active students in this company yet. You can create the class now and ask your owner to add students.</p>}</fieldset>
    </div>{error && <p className="ci-form-error" role="alert">{error}</p>}<footer><button className="ci-action" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="ci-action ci-action--primary" disabled={busy}>{busy ? 'Creating…' : 'Create class'}</button></footer></form>}
  </section></div>;
}
