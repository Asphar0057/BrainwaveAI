import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Filter, FileText, Layout, Settings, ArrowLeft, MessageSquare, LayoutDashboard, LogOut, Menu} from 'lucide-react';
import './NotesDashboard.css';
import '../components/SocialHubChrome.css';
import DatabaseViews from '../components/DatabaseViews';
import AdvancedSearch from '../components/AdvancedSearch';
import Templates from '../components/Templates';
import { API_URL } from '../config';
import { signOutAppSession } from '../utils/authSession';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedFont, setSelectedFont] = useState('Inter');
  const [userName, setUserName] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  ));

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
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/get_notes?user_id=${username}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.filter(n => !n.is_deleted));
      }
    } catch (error) { /* silenced */ }
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
      }
    } catch (error) { /* silenced */ }
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
    note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    note.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const thisWeekCount = notes.filter(n => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return new Date(n.updated_at) > weekAgo;
  }).length;

  return (
    <div className="notes-dashboard" style={{ fontFamily: selectedFont }}>
      <div className="shc-topbar">
        <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
        <div className="shc-topbar-right">
          <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
        </div>
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
          <aside className={`ndb-qb-sidebar ${sidebarCollapsed ? 'ndb-qb-sidebar--collapsed' : ''}`} aria-label="Notes Dashboard navigation">
            {sidebarCollapsed ? (
              <div className="ndb-qb-collapsed-strip">
                <button className="ndb-qb-strip-btn ndb-qb-strip-logo" data-tip="Open sidebar" onClick={() => setSidebarCollapsed(false)} type="button">
                  cb
                </button>
                <button className="ndb-qb-strip-btn" data-tip="New Note" onClick={handleCreateNote} type="button">
                  <Plus size={18} />
                </button>
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
                  <div className="ndb-qb-current-title">Notes Dashboard</div>
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

              <div className="ndb-qb-side-block">
                <div className="ndb-qb-side-label">Quick Actions</div>
                <nav className="ndb-qb-view-nav" aria-label="Notes quick actions">
                  <button className="ndb-qb-view-link ndb-qb-view-link--accent" onClick={handleCreateNote} type="button">
                    <Plus size={16} />
                    <span>New Note</span>
                  </button>
                  <button className="ndb-qb-view-link" onClick={() => setShowTemplates(true)} type="button">
                    <Layout size={16} />
                    <span>Templates</span>
                  </button>
                </nav>
              </div>

              <div className="ndb-qb-side-block">
                <div className="ndb-qb-side-label">Search & Filter</div>
                <nav className="ndb-qb-view-nav" aria-label="Notes search and filter">
                  <div className="ndb-qb-side-search">
                    <Search size={16} className="ndb-qb-side-search-icon" />
                    <input
                      type="text"
                      placeholder="Search notes..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <button className="ndb-qb-view-link" onClick={() => setShowAdvancedSearch(true)} type="button">
                    <Filter size={16} />
                    <span>Advanced Search</span>
                  </button>
                  <div className="ndb-qb-side-font">
                    <Settings size={16} />
                    <select
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

          <main className="ndb-qb-main">
      <div className="dashboard-content">
        {filteredNotes.length > 0 ? (
          <DatabaseViews
            notes={filteredNotes}
            folders={folders}
            onSelectNote={handleSelectNote}
          />
        ) : (
          <div className="empty-dashboard">
            <FileText size={64} />
            <h2>No Notes Yet</h2>
            <p>Create your first note or use a template to get started</p>
            <button className="dashboard-btn primary" onClick={handleCreateNote}>
              <Plus size={18} />
              Create First Note
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
