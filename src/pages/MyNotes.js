import ToolNavigation from '../components/ToolNavigation';
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Plus, Search, Star, Clock, Folder, Trash2, Upload, FolderPlus,
  Grid, List as ListIcon, Layout, Sparkles, ChevronLeft, ChevronRight,
  Home, FileText, RotateCcw, MessageSquare, BookOpen,
  HelpCircle, X
} from 'lucide-react';
import './MyNotes.css';
import './MyNotesSmartFolders.css';
import './MyNotesChatImport.css';
import './MyNotesConvert.css';
import '../components/NotesSidebarSystem.css';
import { API_URL } from '../config';
import MathRenderer from '../components/MathRenderer';
import Templates from '../components/Templates';
import ImportExportModal from '../components/ImportExportModal';
import ContextSelector from '../components/ContextSelector';
import ContextPanel from '../components/ContextPanel';
import contextService from '../services/contextService';
import NotesLineField from '../components/NotesLineField';

const asText = (value) => (value === null || value === undefined ? '' : String(value));
const noteFolderIds = (note) => {
  const ids = Array.isArray(note?.folder_ids) ? note.folder_ids : [];
  if (note?.folder_id !== null && note?.folder_id !== undefined && !ids.includes(note.folder_id)) {
    return [...ids, note.folder_id];
  }
  return ids;
};
const noteIsInFolder = (note, folderId) => noteFolderIds(note).includes(folderId);

const MyNotes = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const userName = localStorage.getItem('username');

  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  ));

  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [trashedNotes, setTrashedNotes] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  
  
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showChatImport, setShowChatImport] = useState(false);
  const [chatSessions, setChatSessions] = useState([]);
  const [selectedSessions, setSelectedSessions] = useState([]);
  const [importing, setImporting] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [noteToMove, setNoteToMove] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [importTab, setImportTab] = useState('chat');
  const [flashcardSets, setFlashcardSets] = useState([]);
  const [selectedFlashcardSets, setSelectedFlashcardSets] = useState([]);
  const [quizHistory, setQuizHistory] = useState([]);
  const [selectedQuizzes, setSelectedQuizzes] = useState([]);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [hsMode, setHsMode] = useState(() => localStorage.getItem('hs_mode_enabled') === 'true');
  const [userDocCount, setUserDocCount] = useState(0);

  useEffect(() => {
    loadNotes();
    loadFolders();
    loadChatSessions();
  }, []);

  useEffect(() => {
    contextService.listDocuments()
      .then(d => setUserDocCount(d.user_docs?.length || 0))
      .catch(() => {});
  }, []);

  const handleHsModeToggle = (val) => {
    setHsMode(val);
    localStorage.setItem('hs_mode_enabled', String(val));
  };

  
  useEffect(() => {
    const generatedNote = location.state?.generatedNote;
    
    if (generatedNote && userName) {
      
      const createGeneratedNote = async () => {
        try {
          const token = localStorage.getItem('token');
          const response = await fetch(`${API_URL}/create_note`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              user_id: userName,
              title: generatedNote.title,
              content: generatedNote.content,
              folder_id: null
            })
          });

          if (response.ok) {
            const newNote = await response.json();
            
            navigate(`/notes/editor/${newNote.id}`, { replace: true });
          }
        } catch (error) {
          console.error('Error creating generated note:', error);
          alert('Failed to create note from learning path');
        }
      };

      createGeneratedNote();
    }
  }, [location.state, userName, navigate]);

  const loadNotes = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/get_notes?user_id=${userName}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotes((Array.isArray(data) ? data : []).filter(n => !n.is_deleted));
      } else {
        throw new Error(`Failed to load notes: ${res.status}`);
      }
    } catch (error) {
      console.error('Error loading notes:', error);
      setLoadError(error.message || 'Could not load your notes.');
  } finally {
      setLoading(false);
    }
  };

  const loadFolders = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/get_folders?user_id=${userName}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFolders(data.folders || []);
      } else {
        throw new Error(`Failed to load folders: ${res.status}`);
      }
    } catch (error) {
      console.error('Error loading folders:', error);
  }
  };

  const loadChatSessions = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/get_chat_sessions?user_id=${encodeURIComponent(userName)}&limit=200`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setChatSessions(data.sessions || []);
      } else {
        throw new Error(`Failed to load chat sessions: ${res.status}`);
      }
    } catch (error) {
      console.error('Error loading chat sessions:', error);
  }
  };

  const loadFlashcardSets = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/get_flashcard_history?user_id=${userName}&limit=100&offset=0`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFlashcardSets(data.flashcard_history || []);
      } else {
        throw new Error(`Failed to load flashcards: ${res.status}`);
      }
    } catch (error) {
      console.error('Error loading flashcard sets:', error);
  }
  };

  const loadQuizHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/get_quiz_history?user_id=${userName}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setQuizHistory(data.quiz_history || data.quizzes || []);
      } else {
        throw new Error(`Failed to load quizzes: ${res.status}`);
      }
    } catch (error) {
      console.error('Error loading quiz history:', error);
  }
  };

  const loadTrash = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/get_trash?user_id=${userName}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTrashedNotes(data.trash || []);
      } else {
        throw new Error(`Failed to load trash: ${res.status}`);
      }
    } catch (error) {
      console.error('Error loading trash:', error);
  }
  };

  const createNewNote = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/create_note`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: userName,
          title: 'Untitled Note',
          content: '',
          folder_id: selectedFolder
        })
      });

      if (response.ok) {
        const newNote = await response.json();
        navigate(`/notes/editor/${newNote.id}`);
      } else {
        throw new Error(`Failed to create note: ${response.status}`);
      }
    } catch (error) {
      console.error('Error creating note:', error);
      alert('Failed to create note');
  }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/create_folder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: userName,
          name: newFolderName,
          color: '#D7B38C'
        })
      });

      if (res.ok) {
        await loadFolders();
        setNewFolderName('');
        setShowFolderModal(false);
      } else {
        throw new Error(`Failed to create folder: ${res.status}`);
      }
    } catch (error) {
      console.error('Error creating folder:', error);
      alert('Failed to create folder');
  }
  };

  const deleteFolder = async (folderId, folderName) => {
    if (!folderId) return;
    if (!window.confirm(`Delete "${folderName || 'this folder'}"? Notes inside it will stay in your library.`)) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/delete_folder/${folderId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        if (selectedFolder === folderId) {
          setSelectedFolder(null);
          setShowFavorites(false);
          setShowTrash(false);
        }
        setFolders(prev => prev.filter(folder => folder.id !== folderId));
        await loadNotes();
        await loadFolders();
      } else {
        throw new Error(`Failed to delete folder: ${res.status}`);
      }
    } catch (error) {
      console.error('Error deleting folder:', error);
      alert('Failed to delete folder');
    }
  };

  const importFromChat = async () => {
    if (selectedSessions.length === 0) return;
    
    setImporting(true);
    try {
      
      const conversionAgentService = (await import('../services/conversionAgentService')).default;
      const selectedSessionTitles = chatSessions
        .filter((session) => selectedSessions.includes(session.id))
        .map((session) => session.title);
      
      const result = await conversionAgentService.chatToNotes(
        userName,
        selectedSessions,
        { formatStyle: 'structured', sessionTitles: selectedSessionTitles }
      );
      
      if (result.success && result.result) {
        const noteResult = result.result;
        
        
        await loadNotes();
        
        setShowChatImport(false);
        setSelectedSessions([]);
        
        
        if (noteResult.note_id) {
          navigate(`/notes/editor/${noteResult.note_id}`);
        }
      } else {
        throw new Error(result.response || 'Conversion failed');
      }
    } catch (error) {
      console.error('Chat to note conversion error:', error);
      alert('Failed to import chat sessions');
    } finally {
      setImporting(false);
    }
  };

  const importFromFlashcards = async () => {
    if (selectedFlashcardSets.length === 0) return;
    setImporting(true);
    try {
      const conversionAgentService = (await import('../services/conversionAgentService')).default;
      const result = await conversionAgentService.convertFlashcardsToNotes({
        userId: userName,
        setIds: selectedFlashcardSets,
      });
      if (result.success || result.note_id) {
        await loadNotes();
        setShowChatImport(false);
        setSelectedFlashcardSets([]);
        if (result.note_id) navigate(`/notes/editor/${result.note_id}`);
      }
    } catch (error) {
      console.error('Flashcards to notes import error:', error);
      alert('Failed to import flashcards');
    } finally {
      setImporting(false);
    }
  };

  const importFromQuizzes = async () => {
    if (selectedQuizzes.length === 0) return;
    setImporting(true);
    try {
      const conversionAgentService = (await import('../services/conversionAgentService')).default;
      const result = await conversionAgentService.convert({
        sourceType: 'quiz',
        target: 'notes',
        userId: userName,
        sourceIds: selectedQuizzes,
      });
      if (result.success || result.note_id) {
        await loadNotes();
        setShowChatImport(false);
        setSelectedQuizzes([]);
        if (result.note_id) navigate(`/notes/editor/${result.note_id}`);
      }
    } catch (error) {
      console.error('Quiz to notes import error:', error);
      alert('Failed to import quizzes');
    } finally {
      setImporting(false);
    }
  };

  const moveNoteToFolder = async (folderId) => {
    if (!noteToMove) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/move_note_to_folder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ 
          note_id: noteToMove.id, 
          folder_id: folderId 
        })
      });

      if (res.ok) {
        await loadNotes();
        setShowMoveModal(false);
        setNoteToMove(null);
      } else {
        throw new Error(`Failed to move note: ${res.status}`);
      }
    } catch (error) {
      console.error('Error moving note:', error);
      alert('Failed to move note');
  }
  };

  const removeNoteFromFolder = async (noteId, folderId) => {
    if (!folderId) return;
    if (!window.confirm('Remove this note from this folder? The note will stay in your library.')) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/remove_note_from_folder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          note_id: noteId,
          folder_id: folderId
        })
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setNotes((prev) => prev.map((note) => {
          if (note.id !== noteId) return note;
          return {
            ...note,
            folder_id: data.folder_id ?? null,
            folder_ids: data.folder_ids || noteFolderIds(note).filter((id) => id !== folderId)
          };
        }));
        await loadFolders();
      } else {
        throw new Error(`Failed to remove note from folder: ${res.status}`);
      }
    } catch (error) {
      console.error('Error removing note from folder:', error);
      alert('Failed to remove note from folder');
    }
  };

  const deleteNote = async (noteId) => {
    if (!window.confirm('Move this note to trash?')) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/soft_delete_note/${noteId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        await loadNotes();
      } else {
        throw new Error(`Failed to delete note: ${res.status}`);
      }
    } catch (error) {
      console.error('Error deleting note:', error);
      alert('Failed to move note to trash');
  }
  };

  const restoreNote = async (noteId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/restore_note/${noteId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        await loadTrash();
        await loadNotes();
      } else {
        throw new Error(`Failed to restore note: ${res.status}`);
      }
    } catch (error) {
      console.error('Error restoring note:', error);
    }
  };

  const permanentlyDeleteNote = async (noteId) => {
    if (!window.confirm('Permanently delete this note? This cannot be undone.')) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/permanent_delete_note/${noteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        setTrashedNotes(prev => prev.filter(note => note.id !== noteId));
        await loadTrash();
        await loadNotes();
      } else {
        throw new Error(`Failed to permanently delete note: ${res.status}`);
      }
    } catch (error) {
      console.error('Error permanently deleting note:', error);
      alert('Failed to permanently delete note');
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
          folder_id: selectedFolder
        }),
      });
      
      if (res.ok) {
        const newNote = await res.json();
        navigate(`/notes/editor/${newNote.id}`);
      } else {
        throw new Error(`Failed to create note from template: ${res.status}`);
      }
    } catch (error) {
      console.error('Template note creation error:', error);
      alert('Failed to create note from template');
  }
  };

  const blocksToHtml = (blocks) => {
    if (!blocks || blocks.length === 0) return '';
    return blocks.map(block => {
      const content = block.content || '';
      switch (block.type) {
        case 'heading1': return `<h1>${content}</h1>`;
        case 'heading2': return `<h2>${content}</h2>`;
        case 'heading3': return `<h3>${content}</h3>`;
        case 'bulletList': return `<ul><li>${content}</li></ul>`;
        case 'numberedList': return `<ol><li>${content}</li></ol>`;
        case 'quote': return `<blockquote>${content}</blockquote>`;
        case 'code': return `<pre><code>${content}</code></pre>`;
        case 'divider': return '<hr/>';
        default: return `<p>${content}</p>`;
      }
    }).join('\n');
  };

  const getFilteredNotes = () => {
    let filtered = showTrash ? trashedNotes : notes;
    filtered = filtered.filter(note =>
      asText(note.title).toLowerCase().includes(searchTerm.toLowerCase()) ||
      asText(note.content).toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (showFavorites) filtered = filtered.filter(n => n.is_favorite);
    if (selectedFolder && !showTrash && !showFavorites) {
      
      if (selectedFolder === 'source-flashcards') {
        filtered = filtered.filter(n => 
          n.source_type === 'flashcards' || 
          asText(n.title).toLowerCase().includes('flashcard')
        );
      } else if (selectedFolder === 'source-quizzes') {
        filtered = filtered.filter(n => 
          n.source_type === 'quiz' || 
          asText(n.title).toLowerCase().includes('quiz')
        );
      } else if (selectedFolder === 'source-roadmaps') {
        filtered = filtered.filter(n => 
          n.source_type === 'roadmap' || 
          asText(n.title).toLowerCase().includes('roadmap') ||
          asText(n.title).toLowerCase().includes('knowledge map')
        );
      } else {
        
        filtered = filtered.filter(n => noteIsInFolder(n, selectedFolder));
      }
    }
    return filtered;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    if (!dateString || Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffHours < 1) return 'just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };


  const filteredNotes = getFilteredNotes();
  const favoriteCount = notes.filter(n => n.is_favorite).length;
  const flashcardSourceCount = notes.filter(n => n.source_type === 'flashcards' || asText(n.title).toLowerCase().includes('flashcard')).length;
  const quizSourceCount = notes.filter(n => n.source_type === 'quiz' || asText(n.title).toLowerCase().includes('quiz')).length;
  const roadmapSourceCount = notes.filter(n => n.source_type === 'roadmap' || asText(n.title).toLowerCase().includes('roadmap') || asText(n.title).toLowerCase().includes('knowledge map')).length;
  const currentTitle = showTrash ? 'Trash' : showFavorites ? 'Favorites' :
    selectedFolder === 'source-flashcards' ? 'From Flashcards' :
    selectedFolder === 'source-quizzes' ? 'From Quizzes' :
    selectedFolder === 'source-roadmaps' ? 'From Knowledge Maps' :
    selectedFolder ? folders.find(f => f.id === selectedFolder)?.name || 'Folder' : 'All Notes';
  const viewingRealFolder = !showTrash && !showFavorites && selectedFolder && typeof selectedFolder === 'number';

  return (
    <div className="my-notes-page-full">
      <NotesLineField />
      <div className="mn-qb-topbar">
        <ToolNavigation />
        <div className="mn-qb-topbar-right">
          <div className="mn-qb-context-control">
            <ContextSelector hsMode={hsMode} docCount={userDocCount} onOpen={() => setContextPanelOpen(true)} />
          </div>
        </div>
      </div>

      <div className="mn-body mn-qb-body">
        <div className={`mn-qb-shell ${sidebarCollapsed ? 'mn-qb-shell--collapsed' : ''}`}>
          <aside className={`mn-qb-sidebar notes-sidebar-system ${sidebarCollapsed ? 'mn-qb-sidebar--collapsed' : ''}`} aria-label="Notes navigation">
            <div className="notes-sidebar-texture" aria-hidden="true" />
            {sidebarCollapsed ? (
              <div className="mn-qb-collapsed-strip">
                <button className="mn-qb-strip-btn mn-qb-strip-logo" data-tip="Open sidebar" onClick={() => setSidebarCollapsed(false)} type="button">
                  <ChevronRight size={18} />
                </button>
                <button className="mn-qb-strip-btn" data-tip="New Note" onClick={() => { setSidebarCollapsed(false); createNewNote(); }} type="button">
                  <Plus size={18} />
                </button>
                <button className="mn-qb-strip-btn" data-tip="Convert" onClick={() => { setSidebarCollapsed(false); setShowConvertModal(true); }} type="button">
                  <Sparkles size={18} />
                </button>
                <button className={`mn-qb-strip-btn ${!showFavorites && !showTrash && !selectedFolder ? 'active' : ''}`} data-tip="All Notes" onClick={() => { setSidebarCollapsed(false); setShowFavorites(false); setShowTrash(false); setSelectedFolder(null); }} type="button">
                  <Folder size={18} />
                </button>
                <button className={`mn-qb-strip-btn ${showFavorites ? 'active' : ''}`} data-tip="Favorites" onClick={() => { setSidebarCollapsed(false); setShowFavorites(true); setShowTrash(false); setSelectedFolder(null); }} type="button">
                  <Star size={18} />
                </button>
                <button className={`mn-qb-strip-btn ${showTrash ? 'active' : ''}`} data-tip="Trash" onClick={() => { setSidebarCollapsed(false); setShowTrash(true); setShowFavorites(false); setSelectedFolder(null); loadTrash(); }} type="button">
                  <Trash2 size={18} />
                </button>
                <div className="mn-qb-strip-spacer" />
                <button className="mn-qb-strip-btn" data-tip="Dashboard" onClick={() => navigate('/dashboard-cerbyl')} type="button">
                  <Home size={18} />
                </button>
              </div>
            ) : (
            <>
              <div className="mn-qb-side-brand">
                <div className="mn-qb-brand-wrap">
                  <div className="mn-qb-brand">cerbyl</div>
                  <div className="mn-qb-brand-kicker">Notes</div>
                </div>
                <button
                  className="mn-qb-side-close-btn"
                  onClick={() => setSidebarCollapsed(true)}
                  title="Close sidebar"
                  aria-label="Close notes sidebar"
                  type="button"
                >
                  <ChevronLeft size={14} />
                </button>
              </div>

              <button className="mn-qb-new-btn" onClick={createNewNote} type="button">
                <Plus size={16} />
                <span>New Note</span>
              </button>

              <div className="notes-standard-scroll">
              <div className="mn-qb-side-block">
                <div className="mn-qb-side-label">Create</div>
                <nav className="mn-qb-view-nav" aria-label="Notes quick actions">
                  <button className="mn-qb-view-link" onClick={() => setShowConvertModal(true)} type="button">
                    <Sparkles size={16} />
                    <span>Convert</span>
                  </button>
                  <button className="mn-qb-view-link" onClick={() => setShowTemplates(true)} type="button">
                    <Layout size={16} />
                    <span>Templates</span>
                  </button>
                  <button
                    className="mn-qb-view-link"
                    onClick={() => {
                      setShowChatImport(true);
                      setImportTab('chat');
                      setSelectedSessions([]);
                      setSelectedFlashcardSets([]);
                      setSelectedQuizzes([]);
                    }}
                    type="button"
                  >
                    <Upload size={16} />
                    <span>From Chat</span>
                  </button>
                  <button className="mn-qb-view-link" onClick={() => navigate('/notes/ai-media')} type="button">
                    <FileText size={16} />
                    <span>Media Notes</span>
                  </button>
                </nav>
              </div>

              <div className="mn-qb-side-block mn-qb-side-block--grow">
                <div className="mn-qb-side-label">Library</div>
                <nav className="mn-qb-view-nav" aria-label="Notes library">
                  <button
                    className={`mn-qb-view-link ${!showFavorites && !showTrash && !selectedFolder ? 'mn-qb-view-link--active' : ''}`}
                    onClick={() => { setShowFavorites(false); setShowTrash(false); setSelectedFolder(null); }}
                    type="button"
                  >
                    <Folder size={16} />
                    <span>All Notes</span>
                    <span className="mn-qb-nav-count">{notes.length}</span>
                  </button>
                  <button
                    className={`mn-qb-view-link ${showFavorites ? 'mn-qb-view-link--active' : ''}`}
                    onClick={() => { setShowFavorites(true); setShowTrash(false); setSelectedFolder(null); }}
                    type="button"
                  >
                    <Star size={16} />
                    <span>Favorites</span>
                    <span className="mn-qb-nav-count">{favoriteCount}</span>
                  </button>
                  <button
                    className={`mn-qb-view-link ${showTrash ? 'mn-qb-view-link--active' : ''}`}
                    onClick={() => { setShowTrash(true); setShowFavorites(false); setSelectedFolder(null); loadTrash(); }}
                    type="button"
                  >
                    <Trash2 size={16} />
                    <span>Trash</span>
                  </button>
                </nav>
              </div>

              <div className="mn-qb-side-block">
                <div className="mn-qb-side-label mn-qb-side-label--row">
                  <span>Folders</span>
                  <button className="mn-qb-add-folder-btn" onClick={() => setShowFolderModal(true)} title="Create folder" type="button">
                    <FolderPlus size={14} />
                  </button>
                </div>
                <nav className="mn-qb-view-nav" aria-label="Note folders">
                  {folders.length === 0 ? (
                    <div className="mn-qb-empty-line">No folders yet</div>
                  ) : folders.map(folder => (
                    <div
                      key={folder.id}
                      className={`mn-qb-folder-row ${selectedFolder === folder.id ? 'mn-qb-folder-row--active' : ''}`}
                    >
                      <button
                        className={`mn-qb-view-link mn-qb-folder-main ${selectedFolder === folder.id ? 'mn-qb-view-link--active' : ''}`}
                        onClick={() => { setSelectedFolder(folder.id); setShowFavorites(false); setShowTrash(false); }}
                        type="button"
                      >
                        <Folder size={16} />
                        <span>{folder.name}</span>
                        <span className="mn-qb-nav-count">{notes.filter(n => noteIsInFolder(n, folder.id)).length}</span>
                      </button>
                      <button
                        className="mn-qb-folder-delete-btn"
                        onClick={() => deleteFolder(folder.id, folder.name)}
                        title={`Delete ${folder.name}`}
                        aria-label={`Delete folder ${folder.name}`}
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </nav>
              </div>

              <div className="mn-qb-side-block">
                <div className="mn-qb-side-label">By Source</div>
                <nav className="mn-qb-view-nav" aria-label="Notes by source">
                  <button
                    className={`mn-qb-view-link ${selectedFolder === 'source-flashcards' ? 'mn-qb-view-link--active' : ''}`}
                    onClick={() => { setSelectedFolder('source-flashcards'); setShowFavorites(false); setShowTrash(false); }}
                    type="button"
                  >
                    <FileText size={16} />
                    <span>From Flashcards</span>
                    <span className="mn-qb-nav-count">{flashcardSourceCount}</span>
                  </button>
                  <button
                    className={`mn-qb-view-link ${selectedFolder === 'source-quizzes' ? 'mn-qb-view-link--active' : ''}`}
                    onClick={() => { setSelectedFolder('source-quizzes'); setShowFavorites(false); setShowTrash(false); }}
                    type="button"
                  >
                    <FileText size={16} />
                    <span>From Quizzes</span>
                    <span className="mn-qb-nav-count">{quizSourceCount}</span>
                  </button>
                  <button
                    className={`mn-qb-view-link ${selectedFolder === 'source-roadmaps' ? 'mn-qb-view-link--active' : ''}`}
                    onClick={() => { setSelectedFolder('source-roadmaps'); setShowFavorites(false); setShowTrash(false); }}
                    type="button"
                  >
                    <FileText size={16} />
                    <span>From Knowledge Maps</span>
                    <span className="mn-qb-nav-count">{roadmapSourceCount}</span>
                  </button>
                </nav>
              </div>
              </div>

              <div className="mn-qb-side-actions">
                <button className="mn-qb-action-btn" onClick={() => navigate('/dashboard-cerbyl')} type="button">
                  <Home size={14} />
                  <span>Dashboard</span>
                </button>
              </div>
            </>
            )}
          </aside>

          <main className="mn-qb-main">
            <div className="nt-content">
            <div className="nt-library-command">
              <div className="nt-library-title">
                <span className="view-kicker">Notes Library / {currentTitle}</span>
                <h2 className="view-title">{currentTitle}</h2>
                <p className="view-sub">Find a thread, continue writing, or turn existing study material into something reusable.</p>
              </div>
              <div className="nt-library-stats" aria-label="Library summary">
                <div><strong>{filteredNotes.length}</strong><span>in view</span></div>
                <div><strong>{favoriteCount}</strong><span>starred</span></div>
                <div><strong>{folders.length}</strong><span>folders</span></div>
              </div>
              <button className="nt-command-create" onClick={createNewNote} type="button">
                <Plus size={16} /><span>New note</span>
              </button>
            </div>

            <div className="nt-content-controls">
              <label className="nt-search">
                <Search size={16} />
                <span className="nt-search-label">Search this view</span>
                <input
                  type="text"
                  placeholder="Title, phrase, or idea…"
                  aria-label="Search notes"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && <button type="button" onClick={() => setSearchTerm('')} aria-label="Clear search"><X size={14} /></button>}
              </label>
              <div className="nt-view-controls">
                <span>{viewMode === 'grid' ? 'Cards' : 'Index'}</span>
                <button
                  className={`nt-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  type="button"
                  title="Grid view"
                  aria-label="Grid view"
                  aria-pressed={viewMode === 'grid'}
                >
                  <Grid size={16} />
                </button>
                <button
                  className={`nt-view-btn ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => setViewMode('list')}
                  type="button"
                  title="List view"
                  aria-label="List view"
                  aria-pressed={viewMode === 'list'}
                >
                  <ListIcon size={16} />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="nt-loading">
                <div className="nt-spinner"></div>
                <p>Loading notes...</p>
              </div>
            ) : loadError ? (
              <div className="nt-empty-state" role="alert">
                <div className="nt-empty-icon"><FileText size={40} /></div>
                <h2>NOTES COULDN’T LOAD</h2>
                <p>{loadError}</p>
                <button className="nt-modal-btn primary" type="button" onClick={loadNotes}>TRY AGAIN</button>
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="nt-empty-state">
                <div className="nt-empty-icon">{searchTerm ? <Search size={40} /> : <Folder size={40} />}</div>
                <h2>{searchTerm ? 'NO MATCHING NOTES' : 'NO NOTES HERE'}</h2>
                <p>{searchTerm ? `NOTHING MATCHES “${searchTerm}”` : 'CREATE YOUR FIRST NOTE TO GET STARTED'}</p>
                {searchTerm && (
                  <button className="nt-modal-btn primary" type="button" onClick={() => setSearchTerm('')}>CLEAR SEARCH</button>
                )}
              </div>
            ) : (
              <div className={viewMode === 'grid' ? 'nt-notes-grid' : 'nt-notes-list'}>
                {filteredNotes.map(note => (
                  <div
                    key={note.id}
                    className={`nt-note-card ${note.is_favorite ? 'nt-note-card--favorite' : ''}`}
                    onClick={() => {
                      if (!showTrash) navigate(`/notes/editor/${note.id}`);
                    }}
                  >
                    {note.is_favorite && (
                      <div className="nt-favorite-badge"><Star size={14} /></div>
                    )}
                    <div className="nt-note-card-cover">
                      <span className="nt-note-card-type">{note.source_type ? note.source_type.replace('_', ' ') : 'note'}</span>
                      <MathRenderer content={note.content || '<p>Empty note</p>'} className="nt-note-cover-preview" />
                      <span className="nt-note-open-cue">Open <ChevronRight size={13} /></span>
                    </div>
                    <div className="nt-note-card-content">
                      <div className="nt-note-card-header">
                        {showTrash ? (
                          <h3 className="nt-note-title">{note.title || 'Untitled'}</h3>
                        ) : (
                          <h3 className="nt-note-title">
                            <button
                              className="nt-note-title-button"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                navigate(`/notes/editor/${note.id}`);
                              }}
                            >
                              {note.title || 'Untitled'}
                            </button>
                          </h3>
                        )}
                        <div className="nt-note-actions">
                          {showTrash ? (
                            <>
                              <button
                                className="nt-note-action-btn restore"
                                onClick={(e) => { e.stopPropagation(); restoreNote(note.id); }}
                                title="Restore from trash"
                                aria-label="Restore from trash"
                                type="button"
                              >
                                <RotateCcw size={14} />
                              </button>
                              <button
                                className="nt-note-action-btn delete permanent-delete"
                                onClick={(e) => { e.stopPropagation(); permanentlyDeleteNote(note.id); }}
                                title="Delete permanently"
                                aria-label="Delete permanently"
                                type="button"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="nt-note-action-btn"
                                onClick={(e) => { e.stopPropagation(); setNoteToMove(note); setShowMoveModal(true); }}
                                title="Move to folder"
                              >
                                <Folder size={14} />
                              </button>
                              {viewingRealFolder && noteIsInFolder(note, selectedFolder) && (
                                <button
                                  className="nt-note-action-btn remove"
                                  onClick={(e) => { e.stopPropagation(); removeNoteFromFolder(note.id, selectedFolder); }}
                                  title="Remove from this folder"
                                >
                                  <X size={14} />
                                </button>
                              )}
                              <button
                                className="nt-note-action-btn delete"
                                onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="nt-note-footer">
                        <span className="nt-note-date">
                          <Clock size={12} />
                          {formatDate(note.updated_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </main>
        </div>
      </div>

      {showFolderModal && (
        <div className="nt-modal-overlay" onClick={() => setShowFolderModal(false)}>
          <div className="nt-modal" role="dialog" aria-modal="true" aria-labelledby="create-folder-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="create-folder-title">Create New Folder</h3>
            <input
              type="text"
              placeholder="Folder name..."
              aria-label="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createFolder()}
              autoFocus
            />
            <div className="nt-modal-actions">
              <button className="nt-modal-btn cancel" onClick={() => setShowFolderModal(false)}>Cancel</button>
              <button className="nt-modal-btn primary" onClick={createFolder}>Create</button>
            </div>
          </div>
        </div>
      )}

      {showChatImport && (
        <>
          <div className="nt-import-overlay" onClick={() => setShowChatImport(false)} />
          <div className="nt-import-modal" onClick={(e) => e.stopPropagation()}>
            <div className="nt-import-header">
              <div className="nt-import-header-text">
                <span className="nt-import-kicker">Cerbyl</span>
                <h2 className="nt-import-title">Import to Notes</h2>
              </div>
              <button className="nt-import-close" onClick={() => setShowChatImport(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="nt-import-tabs">
              <button
                className={`nt-import-tab ${importTab === 'chat' ? 'active' : ''}`}
                onClick={() => setImportTab('chat')}
              >
                <MessageSquare size={13} /> Chat
              </button>
              <button
                className={`nt-import-tab ${importTab === 'flashcards' ? 'active' : ''}`}
                onClick={() => { setImportTab('flashcards'); loadFlashcardSets(); }}
              >
                <BookOpen size={13} /> Flashcards
              </button>
              <button
                className={`nt-import-tab ${importTab === 'quiz' ? 'active' : ''}`}
                onClick={() => { setImportTab('quiz'); loadQuizHistory(); }}
              >
                <HelpCircle size={13} /> Quiz
              </button>
            </div>

            {importTab === 'chat' && (
              <>
                <p className="nt-import-subtitle">Select AI chat sessions to convert into structured notes</p>
                <div className="nt-import-list">
                  {chatSessions.length === 0 ? (
                    <div className="nt-import-empty">
                      <MessageSquare size={32} />
                      <p>No chat sessions found</p>
                    </div>
                  ) : chatSessions.map(session => (
                    <label key={session.id} className={`nt-import-item ${selectedSessions.includes(session.id) ? 'selected' : ''}`}>
                      <input
                        type="checkbox"
                        className="nt-import-checkbox"
                        checked={selectedSessions.includes(session.id)}
                        onChange={(e) => setSelectedSessions(e.target.checked
                          ? [...selectedSessions, session.id]
                          : selectedSessions.filter(id => id !== session.id))}
                      />
                      <div className="nt-import-item-icon"><MessageSquare size={15} /></div>
                      <div className="nt-import-item-info">
                        <span className="nt-import-item-title">{session.title || 'Untitled Chat'}</span>
                        <span className="nt-import-item-meta">{formatDate(session.created_at)}</span>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="nt-import-footer">
                  <span className="nt-import-count"><span>{selectedSessions.length}</span> selected</span>
                  <div className="nt-import-actions">
                    <button className="nt-import-btn nt-import-btn-cancel" onClick={() => setShowChatImport(false)}>Cancel</button>
                    <button className="nt-import-btn nt-import-btn-primary" onClick={importFromChat} disabled={importing || selectedSessions.length === 0}>
                      {importing ? 'Importing...' : `Import ${selectedSessions.length > 0 ? `(${selectedSessions.length})` : ''}`}
                    </button>
                  </div>
                </div>
              </>
            )}

            {importTab === 'flashcards' && (
              <>
                <p className="nt-import-subtitle">Select flashcard sets to generate notes from</p>
                <div className="nt-import-list">
                  {flashcardSets.length === 0 ? (
                    <div className="nt-import-empty">
                      <BookOpen size={32} />
                      <p>No flashcard sets found</p>
                    </div>
                  ) : flashcardSets.map(set => (
                    <label key={set.id} className={`nt-import-item ${selectedFlashcardSets.includes(set.id) ? 'selected' : ''}`}>
                      <input
                        type="checkbox"
                        className="nt-import-checkbox"
                        checked={selectedFlashcardSets.includes(set.id)}
                        onChange={(e) => setSelectedFlashcardSets(e.target.checked
                          ? [...selectedFlashcardSets, set.id]
                          : selectedFlashcardSets.filter(id => id !== set.id))}
                      />
                      <div className="nt-import-item-icon"><BookOpen size={15} /></div>
                      <div className="nt-import-item-info">
                        <span className="nt-import-item-title">{set.title || 'Untitled Set'}</span>
                        <span className="nt-import-item-meta">
                          {formatDate(set.created_at)}
                          {set.card_count != null && <span className="nt-import-item-badge">{set.card_count} cards</span>}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="nt-import-footer">
                  <span className="nt-import-count"><span>{selectedFlashcardSets.length}</span> selected</span>
                  <div className="nt-import-actions">
                    <button className="nt-import-btn nt-import-btn-cancel" onClick={() => setShowChatImport(false)}>Cancel</button>
                    <button className="nt-import-btn nt-import-btn-primary" onClick={importFromFlashcards} disabled={importing || selectedFlashcardSets.length === 0}>
                      {importing ? 'Importing...' : `Import ${selectedFlashcardSets.length > 0 ? `(${selectedFlashcardSets.length})` : ''}`}
                    </button>
                  </div>
                </div>
              </>
            )}

            {importTab === 'quiz' && (
              <>
                <p className="nt-import-subtitle">Select quiz sessions to generate notes from</p>
                <div className="nt-import-list">
                  {quizHistory.length === 0 ? (
                    <div className="nt-import-empty">
                      <HelpCircle size={32} />
                      <p>No quiz sessions found</p>
                    </div>
                  ) : quizHistory.map(quiz => (
                    <label key={quiz.id} className={`nt-import-item ${selectedQuizzes.includes(quiz.id) ? 'selected' : ''}`}>
                      <input
                        type="checkbox"
                        className="nt-import-checkbox"
                        checked={selectedQuizzes.includes(quiz.id)}
                        onChange={(e) => setSelectedQuizzes(e.target.checked
                          ? [...selectedQuizzes, quiz.id]
                          : selectedQuizzes.filter(id => id !== quiz.id))}
                      />
                      <div className="nt-import-item-icon"><HelpCircle size={15} /></div>
                      <div className="nt-import-item-info">
                        <span className="nt-import-item-title">{quiz.topic || quiz.title || 'Untitled Quiz'}</span>
                        <span className="nt-import-item-meta">
                          {formatDate(quiz.created_at)}
                          {quiz.score != null && <span className="nt-import-item-badge">{quiz.score}%</span>}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="nt-import-footer">
                  <span className="nt-import-count"><span>{selectedQuizzes.length}</span> selected</span>
                  <div className="nt-import-actions">
                    <button className="nt-import-btn nt-import-btn-cancel" onClick={() => setShowChatImport(false)}>Cancel</button>
                    <button className="nt-import-btn nt-import-btn-primary" onClick={importFromQuizzes} disabled={importing || selectedQuizzes.length === 0}>
                      {importing ? 'Importing...' : `Import ${selectedQuizzes.length > 0 ? `(${selectedQuizzes.length})` : ''}`}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {showMoveModal && noteToMove && (
        <div className="nt-modal-overlay" onClick={() => setShowMoveModal(false)}>
          <div className="nt-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Move to Folder</h3>
            <p className="nt-modal-subtitle">Select a folder for "{noteToMove.title || 'Untitled'}"</p>
            <div className="nt-folder-select-list">
              {folders.map(folder => (
                <button
                  key={folder.id}
                  className="nt-folder-select-item"
                  onClick={() => moveNoteToFolder(folder.id)}
                >
                  <Folder size={16} />
                  <span>{folder.name}</span>
                </button>
              ))}
            </div>
            <div className="nt-modal-actions">
              <button className="nt-modal-btn cancel" onClick={() => setShowMoveModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showTemplates && (
        <>
          <div className="nt-modal-overlay" onClick={() => setShowTemplates(false)} />
          <Templates
            onSelectTemplate={handleTemplateSelect}
            onClose={() => setShowTemplates(false)}
            userName={userName}
          />
        </>
      )}

      <ImportExportModal
        isOpen={showConvertModal}
        onClose={() => setShowConvertModal(false)}
        mode="import"
        sourceType="notes"
        onSuccess={(result) => {
          if (result?.shouldNavigate) {
            if (result.destinationType === 'flashcards') {
              if (result.set_id) {
                navigate(`/flashcards?set_id=${result.set_id}&mode=preview`);
              } else {
                navigate('/flashcards');
              }
            } else if (result.destinationType === 'questions') {
              navigate('/question-bank');
            } else if (result.destinationType === 'podcast') {
              const noteIds = Array.isArray(result.note_ids) ? result.note_ids.join(',') : '';
              const route = noteIds ? `/notes/podcast?note_ids=${encodeURIComponent(noteIds)}` : '/notes/podcast';
              navigate(route, { state: { podcastPayload: result } });
            } else if (result.destinationType === 'notes') {
              if (result.note_id) {
                navigate(`/notes/editor/${result.note_id}`);
              }
            }
          } else {
            loadNotes();
          }
        }}
      />

      <ContextPanel
        isOpen={contextPanelOpen}
        onClose={() => setContextPanelOpen(false)}
        hsMode={hsMode}
        onHsModeToggle={handleHsModeToggle}
        onDocUploaded={() => setUserDocCount(p => p + 1)}
      />
    </div>
  );
};

export default MyNotes;
