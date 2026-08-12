import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, FileText, X, Edit2, Check, LayoutDashboard, StickyNote, PenTool, ArrowUpRight } from 'lucide-react';
import CanvasMode from '../components/CanvasMode';
import { getRelativeTime } from '../utils/dateUtils';
import { API_URL } from '../config';
import './CanvasHub.css';
import '../components/SocialHubChrome.css';

const STORAGE_KEY = 'cerbyl_canvases';

const encodePayload = (value) => {
  if (!value) return '';
  try { return btoa(unescape(encodeURIComponent(value))); } catch { return ''; }
};

const CanvasHub = () => {
  const navigate = useNavigate();
  const [canvases, setCanvases] = useState([]);
  const [activeCanvas, setActiveCanvas] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [addingToNotes, setAddingToNotes] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/login'); return; }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setCanvases(JSON.parse(stored)); } catch {}
    }
  }, [navigate]);

  const saveToStorage = (list) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setCanvases(list);
  };

  const createCanvas = () => {
    const name = newName.trim() || 'Untitled Canvas';
    const id = `canvas_${Date.now()}`;
    const now = new Date().toISOString();
    const newCanvas = { id, name, data: '', preview: '', created_at: now, updated_at: now };
    const updated = [newCanvas, ...canvases];
    saveToStorage(updated);
    setNewName('');
    setShowNewModal(false);
    setActiveCanvas(newCanvas);
  };

  const handleSave = (newData, shouldClose, previewData) => {
    if (!activeCanvas) return;
    const now = new Date().toISOString();
    const updated = canvases.map(c =>
      c.id === activeCanvas.id
        ? { ...c, data: newData, preview: previewData !== undefined ? previewData : c.preview, updated_at: now }
        : c
    );
    saveToStorage(updated);
    setActiveCanvas(prev => ({
      ...prev,
      data: newData,
      preview: previewData !== undefined ? previewData : prev.preview,
    }));
    if (shouldClose) setActiveCanvas(null);
  };

  const deleteCanvas = (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this canvas?')) return;
    saveToStorage(canvases.filter(c => c.id !== id));
  };

  const startRename = (canvas, e) => {
    e.stopPropagation();
    setRenamingId(canvas.id);
    setRenameValue(canvas.name);
  };

  const commitRename = (id) => {
    const name = renameValue.trim() || 'Untitled Canvas';
    saveToStorage(canvases.map(c => c.id === id ? { ...c, name } : c));
    setRenamingId(null);
  };

  const addToNotes = async (canvas, e) => {
    e.stopPropagation();
    const token = localStorage.getItem('token');
    const userName = localStorage.getItem('username');
    if (!token || !userName || !canvas.data) return;
    setAddingToNotes(canvas.id);
    try {
      const content = `<div class="canvas-block" data-block-type="canvas" data-canvas="${encodePayload(canvas.data)}" data-thumb="${encodePayload(canvas.preview)}"></div>`;
      const res = await fetch(`${API_URL}/create_note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: userName, title: canvas.name, content }),
      });
      if (res.ok) {
        const data = await res.json();
        navigate(`/notes/editor/${data.id}`);
      }
    } catch {}
    setAddingToNotes(null);
  };

  if (activeCanvas) {
    return (
      <div className="ch-canvas-fullscreen">
        <CanvasMode
          initialContent={activeCanvas.data}
          onClose={() => setActiveCanvas(null)}
          onSave={handleSave}
        />
      </div>
    );
  }

  return (
    <div className="ch-root">
      <div className="shc-topbar">
        <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
        <div className="shc-topbar-right">
          <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
        </div>
      </div>
      <div className="ch-shell">
        <aside className="ch-sidebar">
          <div className="ch-brand">
            <strong>cerbyl</strong>
            <span>CANVAS</span>
          </div>
          <button className="ch-new-btn ch-new-btn-wide" onClick={() => setShowNewModal(true)}>
            <Plus size={16} />
            New Canvas
          </button>
          <div className="ch-side-group">
            <span className="ch-side-label">Workspace</span>
            <button className="ch-side-link active" type="button">
              <PenTool size={17} />
              <span>My canvases</span>
              <small>{canvases.length}</small>
            </button>
            <button className="ch-side-link" type="button" onClick={() => navigate('/notes')}>
              <StickyNote size={17} />
              <span>Notes</span>
              <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="ch-side-note">
            <span>Canvas → Notes</span>
            <p>Sketch the idea first, then attach the finished canvas to a note without exporting it.</p>
          </div>
          <button className="ch-side-link ch-side-dashboard" type="button" onClick={() => navigate('/dashboard-cerbyl')}>
            <LayoutDashboard size={17} />
            <span>Dashboard</span>
          </button>
        </aside>
        <main className="ch-body">
        <div className="ch-page-header">
          <div className="ch-page-header-left">
            <div>
              <span className="ch-eyebrow">Visual workspace</span>
              <h2 className="ch-page-title">Think beyond the page.</h2>
              <p className="ch-page-subtitle">Map a concept, diagram a process, or make a rough idea visible.</p>
            </div>
            <span className="ch-count">{String(canvases.length).padStart(2, '0')} saved</span>
          </div>
          <button className="ch-new-btn" onClick={() => setShowNewModal(true)}>
            <Plus size={15} />
            New Canvas
          </button>
        </div>

        {canvases.length === 0 ? (
          <div className="ch-empty">
            <div className="ch-empty-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="6" y="6" width="36" height="36" rx="4" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3"/>
                <path d="M16 32 L20 24 L26 30 L30 22 L34 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="18" cy="18" r="2" fill="currentColor"/>
              </svg>
            </div>
            <span className="ch-empty-index">CANVAS 01</span>
            <p className="ch-empty-title">Give the first idea some room.</p>
            <p className="ch-empty-sub">Start with an open surface for diagrams, annotations, and spatial notes. Nothing needs to be polished yet.</p>
            <button className="ch-new-btn" onClick={() => setShowNewModal(true)}>
              <Plus size={15} />
              New Canvas
            </button>
          </div>
        ) : (
          <div className="ch-grid">
            {canvases.map(canvas => (
              <div key={canvas.id} className="ch-card" onClick={() => setActiveCanvas(canvas)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveCanvas(canvas); } }}>
                <div className="ch-card-preview">
                  {canvas.preview ? (
                    <img src={canvas.preview} alt="" />
                  ) : (
                    <div className="ch-card-blank">
                      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                        <path d="M8 22 L12 14 L18 20 L22 12 L26 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"/>
                      </svg>
                    </div>
                  )}
                </div>
                <div className="ch-card-footer">
                  <div className="ch-card-meta">
                    {renamingId === canvas.id ? (
                      <div className="ch-rename-row" onClick={e => e.stopPropagation()}>
                        <input
                          className="ch-rename-input"
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') commitRename(canvas.id); if (e.key === 'Escape') setRenamingId(null); }}
                          autoFocus
                        />
                        <button className="ch-icon-btn" onClick={() => commitRename(canvas.id)}>
                          <Check size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="ch-name-row">
                        <span className="ch-card-name">{canvas.name}</span>
                        <button className="ch-icon-btn ch-icon-btn-ghost" onClick={e => startRename(canvas, e)} title="Rename">
                          <Edit2 size={12} />
                        </button>
                      </div>
                    )}
                    <span className="ch-card-date">{getRelativeTime(canvas.updated_at)}</span>
                  </div>
                  <div className="ch-card-actions" onClick={e => e.stopPropagation()}>
                    <button
                      className="ch-icon-btn"
                      title={canvas.data ? 'Add to Notes' : 'Draw something first'}
                      disabled={!canvas.data || addingToNotes === canvas.id}
                      onClick={e => addToNotes(canvas, e)}
                    >
                      <FileText size={14} />
                    </button>
                    <button className="ch-icon-btn ch-icon-btn-danger" title="Delete" onClick={e => deleteCanvas(canvas.id, e)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </main>
      </div>

      {showNewModal && (
        <div className="ch-modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="ch-modal" onClick={e => e.stopPropagation()}>
            <div className="ch-modal-header">
              <h3>New Canvas</h3>
              <button className="ch-modal-close" onClick={() => setShowNewModal(false)}>
                <X size={18} />
              </button>
            </div>
            <input
              className="ch-modal-input"
              placeholder="Canvas name..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createCanvas()}
              autoFocus
            />
            <div className="ch-modal-actions">
              <button className="ch-modal-cancel" onClick={() => setShowNewModal(false)}>Cancel</button>
              <button className="ch-modal-create" onClick={createCanvas}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CanvasHub;
