import { readLibraryState, writeLibraryState } from '../utils/libraryState';
import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Search, Filter, FileText, Layout, Settings, ArrowLeft, MessageSquare, LayoutDashboard, LogOut, Menu, ChevronRight, Headphones, PenTool} from 'lucide-react';
import './NotesDashboard.css';
import '../components/NotesSidebarSystem.css';
import '../components/SocialHubChrome.css';
import DatabaseViews from '../components/DatabaseViews';
import AdvancedSearch from '../components/AdvancedSearch';
import Templates from '../components/Templates';
import { API_URL } from '../config';
import { signOutAppSession } from '../utils/authSession';
import NotesLineField from '../components/NotesLineField';

const FONTS = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Monaco', label: 'Monaco' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Lato', label: 'Lato' },
  { value: 'Montserrat', label: 'Montserrat' },
];

const NotesDashboard = () => {
  const navigate = useNavigate();
  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [searchTerm, setSearchTerm] = useState(() => readLibraryState('notes').searchTerm || '');
  const libraryMainRef = useRef(null);
  const restoredScrollRef = useRef(false);
  useEffect(() => { writeLibraryState('notes', { searchTerm }); }, [searchTerm]);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedFont, setSelectedFont] = useState('Inter');
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [creatingNote, setCreatingNote] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  ));

  useLayoutEffect(() => {
    if (!loading && !loadError && libraryMainRef.current && !restoredScrollRef.current) {
      libraryMainRef.current.scrollTop = readLibraryState('notes').mainScrollTop || 0;
      restoredScrollRef.current = true;
    }
  }, [loading, loadError]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    
    if (!token) {
      navigate('/login');
      return;
    }
    
    setUserName(username);
    loadNotes(username);
    loadFolders(username);
    
    
    const savedFont = localStorage.getItem('preferredFont');
    if (savedFont) setSelectedFont(savedFont);
  }, [navigate]);

  const loadNotes = async (username) => {
    setLoading(true);
    setLoadError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/get_notes?user_id=${encodeURIComponent(username || '')}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotes((Array.isArray(data) ? data : []).filter(n => !n.is_deleted));
      } else {
        throw new Error(`Failed to load notes (${res.status})`);
      }
    } catch (error) {
      setLoadError(error.message || 'Could not load your notes.');
    } finally {
      setLoading(false);
    }
  };

  const loadFolders = async (username) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/get_folders?user_id=${username}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFolders(data.folders || []);
      }
    } catch (error) { /* silenced */ }
  };

  const handleSelectNote = (note) => {
    navigate(`/notes/editor/${note.id}`);
  };

  const handleCreateNote = async () => {
    if (creatingNote) return;
    setCreatingNote(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/create_note`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: userName,
          title: 'Untitled Note',
          content: '',
        }),
      });
      
      if (res.ok) {
        const newNote = await res.json();
        navigate(`/notes/editor/${newNote.id}`);
      } else {
        throw new Error(`Failed to create note (${res.status})`);
      }
    } catch (error) {
      setLoadError(error.message || 'Could not create a new note.');
    } finally {
      setCreatingNote(false);
    }
  };

  const handleTemplateSelect = async (template) => {
    try {
      const token = localStorage.getItem('token');
      
      
      let content = template.content;
      if (template.blocks && template.blocks.length > 0) {
        content = blocksToHtml(template.blocks);
      }
      
      const res = await fetch(`${API_URL}/create_note`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: userName,
          title: template.title,
          content: content,
        }),
      });
      
      if (res.ok) {
        const newNote = await res.json();
        navigate(`/notes/editor/${newNote.id}`);
      }
    } catch (error) { /* silenced */ }
  };

  
  const blocksToHtml = (blocks) => {
    if (!blocks || blocks.length === 0) return '';
    
    return blocks.map(block => {
      const content = block.content || '';
      
      switch (block.type) {
        case 'heading1':
          return `<h1>${content}</h1>`;
        case 'heading2':
          return `<h2>${content}</h2>`;
        case 'heading3':
          return `<h3>${content}</h3>`;
        case 'bulletList':
          return `<ul><li>${content}</li></ul>`;
        case 'numberedList':
          return `<ol><li>${content}</li></ol>`;
        case 'quote':
          return `<blockquote>${content}</blockquote>`;
        case 'code':
          return `<pre><code>${content}</code></pre>`;
        case 'divider':
          return '<hr/>';
        case 'todo':
          return `<div><input type="checkbox" ${block.properties?.checked ? 'checked' : ''}/> ${content}</div>`;
        case 'callout':
        case 'info':
        case 'warning':
        case 'success':
        case 'tip':
          return `<div class="callout ${block.type}">${content}</div>`;
        default:
          return `<p>${content}</p>`;
      }
    }).join('\n');
  };

  const handleTileMove = useCallback((e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = x / rect.width - 0.5;
    const cy = y / rect.height - 0.5;
    card.style.setProperty('--mx', `${x}px`);
    card.style.setProperty('--my', `${y}px`);
    card.style.setProperty('--rx', `${(-cy * 7).toFixed(2)}deg`);
    card.style.setProperty('--ry', `${(cx * 9).toFixed(2)}deg`);
  }, []);
  const handleTileLeave = useCallback((e) => {
    const card = e.currentTarget;
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  }, []);

  const handleFontChange = (font) => {
    setSelectedFont(font);
    localStorage.setItem('preferredFont', font);
  };

  const filteredNotes = notes.filter(note =>
    String(note?.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(note?.content || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const thisWeekCount = notes.filter(n => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return new Date(n.updated_at) > weekAgo;
  }).length;

  return (
    <div className="notes-dashboard" style={{ fontFamily: selectedFont }}>
      <NotesLineField />
      <div className="shc-topbar">
        <nav className="ndb-breadcrumbs" aria-label="Breadcrumb">
          <Link to="/dashboard-cerbyl"><LayoutDashboard size={16} />Dashboard</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <Link to="/notes">Notes</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span aria-current="page">My notes</span>
        </nav>
      </div>
      <div className="ndb-qb-body">
        <button
          className="ndb-qb-mobile-menu-btn"
          type="button"
          onClick={() => setSidebarCollapsed(false)}
          aria-label="Open notes dashboard sidebar"
        >
          <Menu size={18} />
        </button>
        {!sidebarCollapsed && (
          <button
            className="ndb-qb-mobile-sidebar-backdrop"
            type="button"
            onClick={() => setSidebarCollapsed(true)}
            aria-label="Close notes dashboard sidebar"
          />
        )}
        <div className={`ndb-qb-shell ${sidebarCollapsed ? 'ndb-qb-shell--collapsed' : ''}`}>
          <aside className={`ndb-qb-sidebar notes-sidebar-system ${sidebarCollapsed ? 'ndb-qb-sidebar--collapsed' : ''}`} aria-label="Notes Dashboard navigation">
            <div className="notes-sidebar-texture" aria-hidden="true" />
            {sidebarCollapsed ? (
              <div className="ndb-qb-collapsed-strip">
                <button className="ndb-qb-strip-btn ndb-qb-strip-logo" data-tip="Open sidebar" onClick={() => setSidebarCollapsed(false)} type="button">
                  cb
                </button>
                <button className="ndb-qb-strip-btn" data-tip="New Note" onClick={handleCreateNote} disabled={creatingNote} type="button">
                  <Plus size={18} />
                </button>
                <Link className="ndb-qb-strip-btn" data-tip="My notes" aria-label="My notes" aria-current="page" to="/notes/dashboard"><FileText size={18} /></Link>
                <Link className="ndb-qb-strip-btn" data-tip="Overview" aria-label="Notes overview" to="/notes"><LayoutDashboard size={18} /></Link>
                <button className="ndb-qb-strip-btn" data-tip="Templates" onClick={() => { setSidebarCollapsed(false); setShowTemplates(true); }} type="button">
                  <Layout size={18} />
                </button>
                <button className="ndb-qb-strip-btn" data-tip="Advanced Search" onClick={() => { setSidebarCollapsed(false); setShowAdvancedSearch(true); }} type="button">
                  <Filter size={18} />
                </button>
                <div className="ndb-qb-strip-spacer" />
                <button className="ndb-qb-strip-btn" data-tip="AI Chat" onClick={() => navigate('/ai-chat')} type="button">
                  <MessageSquare size={18} />
                </button>
                <button className="ndb-qb-strip-btn" data-tip="Dashboard" onClick={() => navigate('/dashboard-cerbyl')} type="button">
                  <LayoutDashboard size={18} />
                </button>
                <button
                  className="ndb-qb-strip-btn"
                  data-tip="Logout"
                  onClick={() => {
                    void signOutAppSession();
                    localStorage.removeItem('token');
                    localStorage.removeItem('username');
                    navigate('/');
                  }}
                  type="button"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
            <>
              <div className="ndb-qb-side-brand">
                <div className="ndb-qb-brand-wrap">
                  <div className="ndb-qb-brand">cerbyl</div>
                  <div className="ndb-qb-current-title">Notes workspace</div>
                </div>
                <button
                  className="ndb-qb-side-close-btn"
                  onClick={() => setSidebarCollapsed(true)}
                  title="Close sidebar"
                  aria-label="Close notes dashboard sidebar"
                  type="button"
                >
                  <ArrowLeft size={14} />
                </button>
              </div>

              <div className="notes-standard-scroll">
              <div className="ndb-qb-side-block">
                <div className="ndb-qb-side-label">Workspace</div>
                <nav className="ndb-qb-view-nav" aria-label="Notes workspace">
                  <Link className="ndb-qb-view-link" to="/notes"><LayoutDashboard size={16} /><span>Overview</span></Link>
                  <Link className="ndb-qb-view-link" to="/notes/dashboard" aria-current="page"><FileText size={16} /><span>My notes</span><span className="ndb-nav-count">{notes.length}</span></Link>
                  <Link className="ndb-qb-view-link" to="/notes/ai-media/my-notes"><Headphones size={16} /><span>Media notes</span></Link>
                  <Link className="ndb-qb-view-link" to="/canvas"><PenTool size={16} /><span>Canvases</span></Link>
                </nav>
              </div>
              <div className="ndb-qb-side-block">
                <div className="ndb-qb-side-label">Library tools</div>
                <nav className="ndb-qb-view-nav" aria-label="Library tools">
                  <button className="ndb-qb-view-link" onClick={() => setShowTemplates(true)} type="button">
                    <Layout size={16} />
                    <span>Templates</span>
                  </button>
                </nav>
              </div>

              <div className="ndb-qb-side-block">
                <div className="ndb-qb-side-label">Preferences</div>
                <nav className="ndb-qb-view-nav" aria-label="Notes search and filter">
                  <div className="ndb-qb-side-font">
                    <Settings size={16} />
                    <select
                      aria-label="Library font"
                      className="ndb-qb-font-selector"
                      value={selectedFont}
                      onChange={(e) => handleFontChange(e.target.value)}
                    >
                      {FONTS.map(font => (
                        <option key={font.value} value={font.value}>
                          {font.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </nav>
              </div>

              <div className="ndb-qb-side-block">
                <div className="ndb-qb-side-label">Overview</div>
                <div className="ndb-qb-stat-grid">
                  <div className="ndb-qb-stat-card" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
                    <div className="cb-tile-texture" />
                    <span>{notes.length}</span>
                    <small>Notes</small>
                  </div>
                  <div className="ndb-qb-stat-card" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
                    <div className="cb-tile-texture" />
                    <span>{folders.length}</span>
                    <small>Folders</small>
                  </div>
                  <div className="ndb-qb-stat-card" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
                    <div className="cb-tile-texture" />
                    <span>{thisWeekCount}</span>
                    <small>This Week</small>
                  </div>
                </div>
              </div>
              </div>

              <div className="ndb-qb-side-actions">
                <button
                  className="ndb-qb-action-btn ndb-qb-action-btn--ghost"
                  onClick={() => navigate('/dashboard-cerbyl')}
                  type="button"
                >
                  <LayoutDashboard size={14} />
                  <span>Dashboard</span>
                </button>
                <button
                  className="ndb-qb-action-btn ndb-qb-action-btn--ghost"
                  onClick={() => navigate('/ai-chat')}
                  type="button"
                >
                  <MessageSquare size={14} />
                  <span>AI Chat</span>
                </button>
                <button
                  className="ndb-qb-action-btn ndb-qb-action-btn--ghost"
                  onClick={() => {
                    void signOutAppSession();
                    localStorage.removeItem('token');
                    localStorage.removeItem('username');
                    navigate('/');
                  }}
                  type="button"
                >
                  <LogOut size={14} />
                  <span>Logout</span>
                </button>
              </div>
            </>
            )}
          </aside>

          <main className="ndb-qb-main" ref={libraryMainRef} onScroll={(event) => { if (restoredScrollRef.current) writeLibraryState('notes', { mainScrollTop: event.currentTarget.scrollTop }); }}>
            <header className="ndb-library-header">
              <div><h1>My notes</h1><p>{loading ? 'Loading your library…' : `${notes.length} notes · ${thisWeekCount} updated this week`}</p></div>
              <button className="ndb-qb-new-btn" onClick={handleCreateNote} disabled={creatingNote} type="button"><Plus size={17} /><span>{creatingNote ? 'Creating…' : 'New note'}</span></button>
            </header>
            <div className="ndb-library-search">                  <div className="ndb-qb-side-search">
                    <Search size={16} className="ndb-qb-side-search-icon" />
                    <input
                      type="text"
                      placeholder="Search notes..."
                      aria-label="Search notes"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
<button className="ndb-filter-btn" aria-label="Advanced search" type="button" onClick={() => setShowAdvancedSearch(true)}><Filter size={16} /><span>Advanced search</span></button></div>
      <div className="dashboard-content">
        {loading ? (
          <div className="empty-dashboard" aria-live="polite">
            <FileText size={48} />
            <h2>Loading your notes…</h2>
            <p>Gathering your library and folders.</p>
          </div>
        ) : loadError ? (
          <div className="empty-dashboard" role="alert">
            <FileText size={48} />
            <h2>Notes couldn’t load</h2>
            <p>{loadError}</p>
            <button className="dashboard-btn primary" type="button" onClick={() => loadNotes(userName)}>Try Again</button>
          </div>
        ) : filteredNotes.length > 0 ? (
          <DatabaseViews
            persistenceKey="notes"
            notes={filteredNotes}
            folders={folders}
            onSelectNote={handleSelectNote}
          />
        ) : (
          <div className="empty-dashboard">
            <FileText size={64} />
            <h2>{searchTerm ? 'No matching notes' : 'No notes yet'}</h2>
            <p>{searchTerm ? `Nothing matches “${searchTerm}”. Try a different phrase.` : 'Create your first note or use a template to get started.'}</p>
            <button className="dashboard-btn primary" type="button" onClick={searchTerm ? () => setSearchTerm('') : handleCreateNote}>
              <Plus size={18} />
              {searchTerm ? 'Clear Search' : 'Create First Note'}
            </button>
          </div>
        )}
      </div>
          </main>
        </div>
      </div>

      {showAdvancedSearch && (
        <>
          <div className="ai-overlay" style={{ 
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 9999
          }} onClick={() => setShowAdvancedSearch(false)} />
          <AdvancedSearch
            notes={notes}
            folders={folders}
            onSelectNote={handleSelectNote}
            onClose={() => setShowAdvancedSearch(false)}
          />
        </>
      )}

      {showTemplates && (
        <>
          <div className="ai-overlay" style={{ 
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 9999
          }} onClick={() => setShowTemplates(false)} />
          <Templates
            onSelectTemplate={handleTemplateSelect}
            onClose={() => setShowTemplates(false)}
            userName={userName}
          />
        </>
      )}
    </div>
  );
};

export default NotesDashboard;
