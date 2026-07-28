import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, FileText, Search, Library, Lock, Users, Trash2,
  Upload, Layers, GraduationCap, Plus, X, Check, Clock, MessageCircle,
  Zap, Brain, ChevronRight, Sparkles, RefreshCw, AlertCircle, Loader2,
  Target, Package, Folder, FolderPlus, PencilLine, Save, CheckSquare, Square,
  MessageSquare, LayoutDashboard, LogOut
} from 'lucide-react';
import contextService from '../services/contextService';
import { API_URL } from '../config/api';
import { queuedAIJsonFetch } from '../services/aiJobService';
import { signOutAppSession } from '../utils/authSession';
import AbstractFx from '../components/AbstractFx';
import { SidebarShell, SidebarSection, SidebarMenuItem, SidebarPrimaryButton, SidebarActions, SidebarAction, SidebarStripButton, SidebarStripSpacer } from '../components/Sidebar';
import './Vault.css';
import '../components/SocialHubChrome.css';

/*
 * CONTEXT HUB DIRECTION
 * Thesis: a focused source-composition desk, not a storage dashboard.
 * Hierarchy: choose a workspace → find evidence → assemble a working context → create with it.
 * Signature: the live context rail behaves like a set of eight physical source slots.
 * Density: compact and operational, with detail revealed by selection instead of oversized cards.
 */
const DECK_SIZE = 8;
const DECK_KEY  = 'ctx_selected_doc_ids';
const FILE_INSIGHTS_KEY = 'ctx_file_action_stats';

const TABS = [
  { id: 'deck',       label: 'CONTEXT DECK', icon: Package },
  { id: 'mydocs',     label: 'YOUR DOCS',    icon: Lock },
  { id: 'upload',     label: 'UPLOAD',       icon: Upload },
  { id: 'curriculum', label: 'CURRICULUM',   icon: GraduationCap },
];

const FEAT = [
  { id: 'chat',       color: '#c084fc', label: 'Chat',  icon: MessageCircle },
  { id: 'flashcards', color: '#34d399', label: 'Cards', icon: Layers },
  { id: 'notes',      color: '#60a5fa', label: 'Notes', icon: FileText },
  { id: 'quiz',       color: '#fb923c', label: 'Quiz',  icon: Brain },
  { id: 'roadmap',    color: '#22d3ee', label: 'Map',   icon: Target },
];

const UK_SUBJECTS = [
  { id: 'maths',            name: 'Mathematics',        cat: 'STEM' },
  { id: 'english_lang',     name: 'English Language',   cat: 'Humanities' },
  { id: 'english_lit',      name: 'English Literature', cat: 'Humanities' },
  { id: 'biology',          name: 'Biology',            cat: 'STEM' },
  { id: 'chemistry',        name: 'Chemistry',          cat: 'STEM' },
  { id: 'physics',          name: 'Physics',            cat: 'STEM' },
  { id: 'combined_science', name: 'Combined Science',   cat: 'STEM' },
  { id: 'history',          name: 'History',            cat: 'Humanities' },
  { id: 'geography',        name: 'Geography',          cat: 'Humanities' },
  { id: 'computer_science', name: 'Computer Science',   cat: 'STEM' },
  { id: 'business',         name: 'Business Studies',   cat: 'Social' },
  { id: 'economics',        name: 'Economics',          cat: 'Social' },
  { id: 'psychology',       name: 'Psychology',         cat: 'Social' },
  { id: 'sociology',        name: 'Sociology',          cat: 'Social' },
  { id: 'rs',               name: 'Religious Studies',  cat: 'Humanities' },
  { id: 'art',              name: 'Art & Design',       cat: 'Arts' },
  { id: 'pe',               name: 'Phys. Education',    cat: 'Arts' },
  { id: 'french',           name: 'French',             cat: 'Languages' },
  { id: 'spanish',          name: 'Spanish',            cat: 'Languages' },
  { id: 'german',           name: 'German',             cat: 'Languages' },
  { id: 'music',            name: 'Music',              cat: 'Arts' },
  { id: 'drama',            name: 'Drama',              cat: 'Arts' },
  { id: 'media',            name: 'Media Studies',      cat: 'Arts' },
  { id: 'dt',               name: 'Design & Technology',cat: 'STEM' },
];

const US_SUBJECTS = [
  { id: 'algebra1',         name: 'Algebra I',            cat: 'Mathematics' },
  { id: 'algebra2',         name: 'Algebra II',           cat: 'Mathematics' },
  { id: 'geometry',         name: 'Geometry',             cat: 'Mathematics' },
  { id: 'precalc',          name: 'Pre-Calculus',         cat: 'Mathematics' },
  { id: 'ap_calc_ab',       name: 'AP Calc AB',           cat: 'Mathematics' },
  { id: 'ap_calc_bc',       name: 'AP Calc BC',           cat: 'Mathematics' },
  { id: 'ap_stats',         name: 'AP Statistics',        cat: 'Mathematics' },
  { id: 'biology',          name: 'Biology',              cat: 'Sciences' },
  { id: 'chemistry',        name: 'Chemistry',            cat: 'Sciences' },
  { id: 'physics',          name: 'Physics',              cat: 'Sciences' },
  { id: 'ap_bio',           name: 'AP Biology',           cat: 'Sciences' },
  { id: 'ap_chem',          name: 'AP Chemistry',         cat: 'Sciences' },
  { id: 'ap_physics_1',     name: 'AP Physics 1',         cat: 'Sciences' },
  { id: 'computer_science', name: 'Computer Science',     cat: 'Sciences' },
  { id: 'ap_cs_a',          name: 'AP CS A (Java)',        cat: 'Sciences' },
  { id: 'us_history',       name: 'US History',           cat: 'Social Studies' },
  { id: 'world_history',    name: 'World History',        cat: 'Social Studies' },
  { id: 'ap_us_history',    name: 'AP US History',        cat: 'Social Studies' },
  { id: 'economics',        name: 'Economics',            cat: 'Social Studies' },
  { id: 'ap_gov',           name: 'AP Government',        cat: 'Social Studies' },
  { id: 'psychology',       name: 'Psychology',           cat: 'Social Studies' },
  { id: 'ap_psych',         name: 'AP Psychology',        cat: 'Social Studies' },
  { id: 'english9',         name: 'English 9',            cat: 'Language Arts' },
  { id: 'english10',        name: 'English 10',           cat: 'Language Arts' },
  { id: 'english11',        name: 'American Literature',  cat: 'Language Arts' },
  { id: 'english12',        name: 'English 12',           cat: 'Language Arts' },
  { id: 'ap_english_lang',  name: 'AP English Language',  cat: 'Language Arts' },
  { id: 'ap_english_lit',   name: 'AP English Lit',       cat: 'Language Arts' },
];

const CAT_COLORS = {
  STEM: '#22c55e', Mathematics: '#22c55e', Sciences: '#06b6d4',
  Humanities: '#3b82f6', 'Social Studies': '#f97316', Social: '#f97316',
  'Language Arts': '#a855f7', Languages: '#a855f7', Arts: '#ec4899',
};

const fmtDate = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch { return ''; }
};

const fmtBytes = (b) => {
  if (!b) return '';
  if (b < 1024) return `${b}B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)}KB`;
  return `${(b/1048576).toFixed(1)}MB`;
};

const subjectLabel = (s) => (s || 'General').replace(/_/g, ' ');

const loadDeck = () => {
  try { return JSON.parse(localStorage.getItem(DECK_KEY) || '[]'); }
  catch { return []; }
};

const saveDeck = (ids) => localStorage.setItem(DECK_KEY, JSON.stringify(ids));

const loadFileActionStats = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(FILE_INSIGHTS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const saveFileActionStats = (payload) => {
  try {
    localStorage.setItem(FILE_INSIGHTS_KEY, JSON.stringify(payload || {}));
  } catch {
    
  }
};

const buildFolderTree = (folders) => {
  const folderById = new Map();
  folders.forEach((folder) => {
    folderById.set(folder.id, { ...folder, children: [] });
  });

  const roots = [];
  folderById.forEach((folder) => {
    if (folder.parent_id && folderById.has(folder.parent_id)) {
      folderById.get(folder.parent_id).children.push(folder);
    } else {
      roots.push(folder);
    }
  });

  const sortTree = (items) => {
    items.sort((a, b) => a.name.localeCompare(b.name));
    items.forEach((item) => sortTree(item.children));
  };
  sortTree(roots);
  return roots;
};

const flattenFolderTree = (nodes, depth = 0) => {
  const flat = [];
  nodes.forEach((node) => {
    flat.push({ ...node, depth });
    flat.push(...flattenFolderTree(node.children, depth + 1));
  });
  return flat;
};

function VaultDocCard({ doc, acts, inDeck, deckFull, onDeckToggle, onAction, onDelete, onNavigate }) {
  const id         = doc.doc_id || doc.id;
  const name       = doc.filename || doc.title || 'Untitled';
  const total      = FEAT.reduce((a, f) => a + (Number(acts[f.id] || 0)), 0);
  const coverColor = CAT_COLORS[doc.subject] || 'var(--accent)';

  return (
    <article
      className={`vlt-doccard ${inDeck ? 'vlt-doccard--deck' : ''}`}
      onClick={() => onNavigate(id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onNavigate(id)}
    >
      {}
      <div
        className="vlt-doccard-cover"
        style={{ background: `linear-gradient(135deg, ${coverColor}20 0%, ${coverColor}50 100%)` }}
      >
        <div className="vlt-doccard-cover-icon" style={{ color: coverColor }}>
          <FileText size={32} strokeWidth={1.5} />
        </div>
        {inDeck && (
          <div className="vlt-doccard-deck-badge"><Zap size={10} /> In Deck</div>
        )}
        {doc.scope === 'public' && (
          <div className="vlt-doccard-pub-badge">Community</div>
        )}
      </div>

      {}
      <div className="vlt-doccard-body">
        <h3 className="vlt-doccard-title" title={name}>{name}</h3>

        <div className="vlt-doccard-meta">
          {doc.subject
            ? <span style={{ color: coverColor }}>{subjectLabel(doc.subject)}</span>
            : <span>General</span>}
          {doc.chunk_count > 0 && <span>{doc.chunk_count} chunks</span>}
          {doc.created_at && <span>{fmtDate(doc.created_at)}</span>}
        </div>

        <div className="vlt-doccard-usage">
          {FEAT.map(f => {
            const count = Number(acts[f.id] || 0);
            const FIcon = f.icon;
            return (
              <div key={f.id} className="vlt-doccard-usage-item"
                style={{ '--uc': f.color, opacity: count > 0 ? 1 : 0.22 }}
                title={`${f.label}: ${count}×`}>
                <FIcon size={10} /><span>{count}</span>
              </div>
            );
          })}
          {total > 0 && <span className="vlt-doccard-total">{total}×</span>}
        </div>

        <div className="vlt-doccard-actions" onClick={e => e.stopPropagation()}>
          <div className="vlt-doccard-actions-left">
            <button className="vlt-doccard-action-btn" onClick={() => onAction('chat', id, doc)}>
              <MessageCircle size={13} /><span>AI Chat</span>
            </button>
            <button className="vlt-doccard-action-btn" onClick={() => onAction('flashcards', id, doc)}>
              <Layers size={13} /><span>Flashcards</span>
            </button>
          </div>
          <div className="vlt-doccard-actions-right">
            <button
              className={`vlt-doccard-icon-btn ${inDeck ? 'vlt-doccard-icon-btn--deck' : ''}`}
              onClick={() => onDeckToggle(id)}
              disabled={!inDeck && deckFull}
              title={inDeck ? 'Remove from deck' : deckFull ? 'Deck full' : 'Add to deck'}
            >
              {inDeck ? <X size={14} /> : <Plus size={14} />}
            </button>
            <button className="vlt-doccard-icon-btn vlt-doccard-icon-btn--del"
              onClick={() => onDelete(id, name)} title="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

const Vault = () => {
  const navigate = useNavigate();
  const fileRef = useRef(null);

  
  const [userDocs, setUserDocs] = useState([]);
  const [hsDocs,   setHsDocs]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [deleting, setDeleting] = useState(null);

  
  const [deckIds, setDeckIds] = useState(loadDeck);

  
  const [recent, setRecent] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentKey, setRecentKey] = useState(0);

  
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState('');
  const [uploadOk,     setUploadOk]     = useState('');
  const [uploadSubject,setUploadSubject]= useState('');
  const [uploadFolderId, setUploadFolderId] = useState('');

  
  const [folders, setFolders] = useState([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [folderError, setFolderError] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState('');
  const [newFolderLocationMode, setNewFolderLocationMode] = useState('current');
  const [activeFolderId, setActiveFolderId] = useState('all');
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [editingFolderParentId, setEditingFolderParentId] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [savingFolderEdit, setSavingFolderEdit] = useState(false);
  const [deletingFolderId, setDeletingFolderId] = useState(null);
  const [movingDocId, setMovingDocId] = useState(null);
  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [bulkMoveFolderId, setBulkMoveFolderId] = useState('');
  const [expandedNodes, setExpandedNodes] = useState({ all: true, uncategorized: true });
  const [bulkActionLoading, setBulkActionLoading] = useState('');
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState('');
  const [docProgressMap, setDocProgressMap] = useState({});
  const [folderProgressMap, setFolderProgressMap] = useState({});
  const [overallProgress, setOverallProgress] = useState(null);


  const [activeTab, setActiveTab] = useState('deck');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  ));
  const [docSearch, setDocSearch] = useState('');
  const [sourceScope, setSourceScope] = useState('all');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [currMode, setCurrMode]   = useState('uk');  
  const [currSubject, setCurrSubject] = useState(null);
  const [fileActionStats, setFileActionStats] = useState(loadFileActionStats);

  
  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await contextService.listDocuments();
      setUserDocs(Array.isArray(data.user_docs) ? data.user_docs : []);
      setHsDocs(Array.isArray(data.hs_docs) ? data.hs_docs : []);
    } catch { setUserDocs([]); setHsDocs([]); }
    finally { setLoading(false); }
  }, []);

  const loadFolders = useCallback(async () => {
    setFoldersLoading(true);
    setFolderError('');
    try {
      const data = await contextService.listFolders();
      setFolders(Array.isArray(data.folders) ? data.folders : []);
    } catch (e) {
      setFolderError(e.message || 'Failed to load folders');
      setFolders([]);
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  const loadProgress = useCallback(async () => {
    setProgressLoading(true);
    setProgressError('');
    try {
      const data = await contextService.getProgress();
      const docMap = {};
      const folderMap = {};
      (data?.doc_progress || []).forEach((item) => {
        if (item?.doc_id) docMap[item.doc_id] = item;
      });
      (data?.folder_progress || []).forEach((item) => {
        const key = item?.folder_id === null || item?.folder_id === undefined
          ? 'uncategorized'
          : String(item.folder_id);
        folderMap[key] = item;
      });
      setDocProgressMap(docMap);
      setFolderProgressMap(folderMap);
      setOverallProgress(data?.overall || null);
    } catch (e) {
      setProgressError(e.message || 'Failed to load progress');
      setDocProgressMap({});
      setFolderProgressMap({});
      setOverallProgress(null);
    } finally {
      setProgressLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
    loadFolders();
    loadProgress();
  }, [loadDocs, loadFolders, loadProgress]);

  
  useEffect(() => {
    if (activeTab !== 'recent') return;
    
    const fetch = async () => {
      setRecentLoading(true);
      const token = localStorage.getItem('token');
      const uid   = localStorage.getItem('username');
      const h     = { Authorization: `Bearer ${token}` };
      const items = [];
      try {
        const r = await fetch(`${API_URL}/get_notes?user_id=${encodeURIComponent(uid)}&summary=true&limit=8`, { headers: h });
        if (r.ok) {
          const d = await r.json();
          const notes = Array.isArray(d) ? d : (d.notes || []);
          notes.slice(0, 8).forEach(n => items.push({
            type: 'note', icon: 'note', id: n.id,
            title: n.title || 'Untitled note',
            date: n.updated_at || n.created_at,
            route: `/notes/editor/${n.id}`,
          }));
        }
      } catch {  }
      try {
        const r = await fetch(`${API_URL}/get_flashcard_history?user_id=${uid}&limit=8`, { headers: h });
        if (r.ok) {
          const d = await r.json();
          (d.flashcard_history || []).slice(0, 6).forEach(s => items.push({
            type: 'flashcards', icon: 'flashcard', id: s.set_id || s.id,
            title: s.title || 'Flashcard set',
            meta: `${s.card_count || 0} cards`,
            date: s.updated_at || s.created_at,
            route: '/flashcards',
          }));
        }
      } catch {  }
      try {
        const r = await fetch(`${API_URL}/get_chat_sessions?user_id=${encodeURIComponent(uid)}&limit=6`, { headers: h });
        if (r.ok) {
          const d = await r.json();
          (d.sessions || []).slice(0, 6).forEach(s => items.push({
            type: 'chat', icon: 'chat', id: s.session_id || s.id,
            title: s.title || 'AI Chat session',
            date: s.updated_at || s.created_at,
            route: `/ai-chat${s.session_id ? `?session_id=${s.session_id}` : ''}`,
          }));
        }
      } catch {  }
      try {
        const r = await fetch(`${API_URL}/get_question_sets?user_id=${uid}`, { headers: h });
        if (r.ok) {
          const d = await r.json();
          (d.question_sets || []).slice(0, 4).forEach(s => items.push({
            type: 'quiz', icon: 'quiz', id: s.id,
            title: s.title || 'Quiz set',
            meta: `${s.question_count || 0} questions`,
            date: s.created_at,
            route: `/question-bank?set_id=${s.id}`,
          }));
        }
      } catch {  }
      items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setRecent(items);
      setRecentLoading(false);
    };
    fetch();
  }, [activeTab, recentKey]);

  const recordDocActions = useCallback((docIds, actionId) => {
    if (!actionId) return;
    const normalizedIds = Array.from(new Set((docIds || []).filter(Boolean).map((id) => String(id))));
    if (normalizedIds.length === 0) return;

    setFileActionStats((prev) => {
      const now = new Date().toISOString();
      const base = prev && typeof prev === 'object' ? prev : {};
      const next = { ...base };

      normalizedIds.forEach((id) => {
        const current = next[id] && typeof next[id] === 'object' ? next[id] : {};
        const actions = current.actions && typeof current.actions === 'object' ? { ...current.actions } : {};
        actions[actionId] = (actions[actionId] || 0) + 1;

        next[id] = {
          first_used_at: current.first_used_at || now,
          last_used_at: now,
          total_actions: (Number(current.total_actions) || 0) + 1,
          actions,
        };
      });

      saveFileActionStats(next);
      return next;
    });
  }, []);

  
  const deckSet = useMemo(() => new Set(deckIds), [deckIds]);

  const addToDeck = (id) => {
    if (deckIds.includes(id)) return;
    if (deckIds.length >= DECK_SIZE) return;
    const next = [...deckIds, id];
    setDeckIds(next);
    saveDeck(next);
    recordDocActions([id], 'deck');
  };

  const removeFromDeck = (id) => {
    const next = deckIds.filter(d => d !== id);
    setDeckIds(next);
    saveDeck(next);
  };

  const clearDeck = () => { setDeckIds([]); saveDeck([]); };

  
  const allDocs = useMemo(() => {
    const m = new Map();
    [...userDocs, ...hsDocs].forEach(d => {
      const id = d.doc_id || d.id;
      if (id) m.set(id, d);
    });
    return m;
  }, [userDocs, hsDocs]);

  
  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadError('');
    setUploadOk('');
    try {
      const parsedFolderId = uploadFolderId ? Number(uploadFolderId) : null;
      const backendFolderId = Number.isFinite(parsedFolderId) && parsedFolderId > 0 ? parsedFolderId : null;
      const result = await contextService.uploadDocument(file, uploadSubject, '', 'private', {
        folderId: backendFolderId,
      });
      const uploadedDocId = result?.doc_id || null;
      if (uploadedDocId && Number.isFinite(parsedFolderId) && parsedFolderId !== backendFolderId) {
        await contextService.moveDocumentToFolder(uploadedDocId, parsedFolderId);
      }
      setUploadOk(`"${file.name}" uploaded successfully.`);
      await loadDocs();
      await loadProgress();
    } catch (e) {
      setUploadError(e.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setFolderError('Enter a folder name before creating.');
      return;
    }
    setCreatingFolder(true);
    setFolderError('');
    try {
      await contextService.createFolder({
        name,
        parentId: createFolderResolvedParentId,
      });
      setNewFolderName('');
      setNewFolderParentId('');
      await loadFolders();
      await loadProgress();
    } catch (e) {
      setFolderError(e.message || 'Failed to create folder');
    } finally {
      setCreatingFolder(false);
    }
  };

  const startEditingFolder = (folder) => {
    setEditingFolderId(folder.id);
    setEditingFolderName(folder.name || '');
    setEditingFolderParentId(folder.parent_id ? String(folder.parent_id) : '');
  };

  const cancelEditingFolder = () => {
    setEditingFolderId(null);
    setEditingFolderName('');
    setEditingFolderParentId('');
  };

  const handleSaveFolderEdit = async () => {
    if (!editingFolderId) return;
    const name = editingFolderName.trim();
    if (!name) return;
    setSavingFolderEdit(true);
    setFolderError('');
    try {
      await contextService.updateFolder(editingFolderId, {
        name,
        parentId: editingFolderParentId ? Number(editingFolderParentId) : null,
      });
      cancelEditingFolder();
      await loadFolders();
      await loadDocs();
      await loadProgress();
    } catch (e) {
      setFolderError(e.message || 'Failed to update folder');
    } finally {
      setSavingFolderEdit(false);
    }
  };

  const handleDeleteFolder = async (folder) => {
    if (!window.confirm(`Delete folder "${folder.name}"? Files will be moved to the parent folder (or uncategorized).`)) return;
    setDeletingFolderId(folder.id);
    setFolderError('');
    try {
      await contextService.deleteFolder(folder.id, { moveToFolderId: folder.parent_id || null });
      if (String(activeFolderId) === String(folder.id)) {
        setActiveFolderId('all');
      }
      if (String(uploadFolderId) === String(folder.id)) {
        setUploadFolderId('');
      }
      await loadFolders();
      await loadDocs();
      await loadProgress();
    } catch (e) {
      setFolderError(e.message || 'Failed to delete folder');
    } finally {
      setDeletingFolderId(null);
    }
  };

  const handleMoveDocument = async (docId, folderIdRaw) => {
    const nextFolderId = folderIdRaw ? Number(folderIdRaw) : null;
    setMovingDocId(docId);
    try {
      await contextService.moveDocumentToFolder(docId, Number.isFinite(nextFolderId) ? nextFolderId : null);
      const nextFolder = Number.isFinite(nextFolderId)
        ? folders.find((folder) => folder.id === nextFolderId)
        : null;
      setUserDocs((prev) => prev.map((doc) => (
        (doc.doc_id || doc.id) === docId
          ? {
              ...doc,
              folder_id: Number.isFinite(nextFolderId) ? nextFolderId : null,
              folder_name: nextFolder?.name || '',
            }
          : doc
      )));
      await loadProgress();
    } catch (e) {
      alert(e.message || 'Failed to move document');
    } finally {
      setMovingDocId(null);
    }
  };

  const handleDelete = async (docId, filename) => {
    if (!window.confirm(`Delete "${filename}"?`)) return;
    setDeleting(docId);
    try {
      await contextService.deleteDocument(docId);
      setUserDocs(prev => prev.filter(d => (d.doc_id || d.id) !== docId));
      removeFromDeck(docId);
      await loadProgress();
    } catch (e) { alert(e.message || 'Delete failed'); }
    finally { setDeleting(null); }
  };

  const persistSelectedDocs = useCallback((ids) => {
    try {
      localStorage.setItem(DECK_KEY, JSON.stringify(ids));
    } catch {
      
    }
  }, []);

  const toggleFileSelection = useCallback((docId) => {
    setSelectedFileIds((prev) => (
      prev.includes(docId)
        ? prev.filter((id) => id !== docId)
        : [...prev, docId]
    ));
  }, []);

  const clearFileSelection = useCallback(() => {
    setSelectedFileIds([]);
  }, []);

  const selectVisibleFiles = useCallback(() => {
    let docs = userDocs;
    if (activeFolderId === 'uncategorized') {
      docs = docs.filter((doc) => !doc.folder_id);
    } else if (activeFolderId !== 'all') {
      docs = docs.filter((doc) => String(doc.folder_id || '') === String(activeFolderId));
    }
    if (docSearch.trim()) {
      const q = docSearch.toLowerCase();
      docs = docs.filter((doc) =>
        [doc.filename, doc.subject, doc.folder_name, ...(doc.topic_tags || [])]
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }
    const ids = docs.map((doc) => doc.doc_id || doc.id).filter(Boolean);
    setSelectedFileIds((prev) => Array.from(new Set([...prev, ...ids])));
  }, [userDocs, activeFolderId, docSearch]);

  const selectFolderFiles = useCallback((folderId) => {
    const ids = userDocs
      .filter((doc) => {
        if (folderId === 'uncategorized') return !doc.folder_id;
        return String(doc.folder_id || '') === String(folderId);
      })
      .map((doc) => doc.doc_id || doc.id)
      .filter(Boolean);
    setSelectedFileIds((prev) => Array.from(new Set([...prev, ...ids])));
  }, [userDocs]);

  const selectedUserDocs = useMemo(() => {
    const selectedSet = new Set(selectedFileIds);
    return userDocs.filter((doc) => selectedSet.has(doc.doc_id || doc.id));
  }, [selectedFileIds, userDocs]);

  const runContextAction = useCallback(async (target, docIds, sourceDocs) => {
    const validDocIds = Array.from(new Set((docIds || []).filter(Boolean)));
    if (validDocIds.length === 0) {
      alert('Select one or more files first.');
      return;
    }
    if (bulkActionLoading) return;

    persistSelectedDocs(validDocIds);
    const sourceNames = (sourceDocs || [])
      .map((doc) => doc.filename || doc.title || 'Untitled')
      .slice(0, 6)
      .join(', ');

    if (target === 'chat') {
      recordDocActions(validDocIds, 'chat');
      navigate('/ai-chat', {
        state: {
          initialMessage: `Use my selected context files (${validDocIds.length}): ${sourceNames}. Help me study what matters most.`,
        },
      });
      return;
    }
    if (target === 'flashcards') {
      recordDocActions(validDocIds, 'flashcards');
      navigate('/flashcards', {
        state: {
          contextDocIds: validDocIds,
          initialTopic: sourceNames,
          generationMode: 'topic',
          openPanel: 'generator',
          autoGenerateFromContext: true,
        },
      });
      return;
    }
    if (target === 'quiz') {
      recordDocActions(validDocIds, 'quiz');
      navigate('/question-bank', {
        state: {
          contextDocIds: validDocIds,
          topic: sourceNames || 'Selected context files',
          openView: 'custom',
          autoGenerateFromContext: true,
        },
      });
      return;
    }
    if (target === 'notes') {
      const token = localStorage.getItem('token');
      const userId = localStorage.getItem('username') || localStorage.getItem('user_id') || localStorage.getItem('email');
      if (!token || !userId) {
        alert('Please log in again.');
        return;
      }
      setBulkActionLoading('notes');
      try {
        const response = await queuedAIJsonFetch('/create_note_from_context_docs', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: userId,
            context_doc_ids: validDocIds,
            title: sourceNames ? `Notes: ${sourceNames}` : 'Study Notes',
            depth: 'deep',
            tone: 'professional',
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed (${response.status})`);
        }
        const data = await response.json();
        if (data?.id) {
          recordDocActions(validDocIds, 'notes');
          navigate(`/notes/editor/${data.id}`);
        } else {
          alert('Notes were generated, but opening the editor failed.');
        }
      } catch (err) {
        alert('Failed to generate notes from selected files. Please try again.');
      } finally {
        setBulkActionLoading('');
      }
      return;
    }

    recordDocActions(validDocIds, 'roadmap');
    navigate('/knowledge-map', {
      state: {
        contextDocIds: validDocIds,
        sourceSummary: sourceNames,
        autoCreateFromContext: true,
      },
    });
  }, [bulkActionLoading, navigate, persistSelectedDocs, recordDocActions]);

  const openSelectedDocsAction = useCallback((target) => {
    runContextAction(target, selectedFileIds, selectedUserDocs);
  }, [runContextAction, selectedFileIds, selectedUserDocs]);

  
  const stats = useMemo(() => ({
    books:   hsDocs.length,
    myDocs:  userDocs.length,
    deck:    deckIds.length,
    chunks:  [...userDocs, ...hsDocs].reduce((a, d) => a + (d.chunk_count || 0), 0),
  }), [userDocs, hsDocs, deckIds]);

  
  const currSubjects = currMode === 'uk' ? UK_SUBJECTS : US_SUBJECTS;
  const filteredHsDocs = useMemo(() => {
    if (!currSubject) return hsDocs;
    return hsDocs.filter(d =>
      (d.subject || '').toLowerCase().replace(/ /g, '_') === currSubject ||
      (d.subject || '').toLowerCase().includes(currSubject.replace(/_/g, ' '))
    );
  }, [hsDocs, currSubject]);

  
  const filteredUserDocs = useMemo(() => {
    let docs = userDocs;
    if (activeFolderId === 'uncategorized') {
      docs = docs.filter((doc) => !doc.folder_id);
    } else if (activeFolderId !== 'all') {
      docs = docs.filter((doc) => String(doc.folder_id || '') === String(activeFolderId));
    }
    if (!docSearch.trim()) return docs;
    const q = docSearch.toLowerCase();
    return docs.filter(d =>
      [d.filename, d.subject, d.folder_name, ...(d.topic_tags || [])].join(' ').toLowerCase().includes(q)
    );
  }, [userDocs, docSearch, activeFolderId]);

  const sidebarDocs = useMemo(() => {
    const query = sidebarSearch.trim().toLowerCase();
    if (!query) return userDocs;
    return userDocs.filter((doc) => (
      [doc.filename, doc.title, doc.subject, doc.folder_name, ...(doc.topic_tags || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    ));
  }, [sidebarSearch, userDocs]);

  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);
  const flatFolders = useMemo(() => flattenFolderTree(folderTree), [folderTree]);
  const folderDocCounts = useMemo(() => {
    const counts = { uncategorized: 0 };
    userDocs.forEach((doc) => {
      if (!doc.folder_id) {
        counts.uncategorized += 1;
      } else {
        const key = String(doc.folder_id);
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    return counts;
  }, [userDocs]);

  const canUseCurrentFolderAsParent = useMemo(() => {
    if (activeFolderId === 'all' || activeFolderId === 'uncategorized') return false;
    return folders.some((folder) => String(folder.id) === String(activeFolderId));
  }, [activeFolderId, folders]);

  const createFolderResolvedParentId = useMemo(() => {
    if (newFolderLocationMode === 'custom') {
      const parsed = newFolderParentId ? Number(newFolderParentId) : null;
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (newFolderLocationMode === 'current') {
      if (!canUseCurrentFolderAsParent) return null;
      const parsed = Number(activeFolderId);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }, [activeFolderId, canUseCurrentFolderAsParent, newFolderLocationMode, newFolderParentId]);

  const createFolderLocationLabel = useMemo(() => {
    if (newFolderLocationMode === 'custom') {
      if (!createFolderResolvedParentId) return 'Root folder';
      const target = folders.find((folder) => folder.id === createFolderResolvedParentId);
      return target?.name ? `"${target.name}"` : 'Selected folder';
    }
    if (newFolderLocationMode === 'current') {
      if (!canUseCurrentFolderAsParent) return 'Root folder';
      const target = folders.find((folder) => String(folder.id) === String(activeFolderId));
      return target?.name ? `"${target.name}"` : 'Current folder';
    }
    return 'Root folder';
  }, [activeFolderId, canUseCurrentFolderAsParent, createFolderResolvedParentId, folders, newFolderLocationMode]);

  const docsByFolder = useMemo(() => {
    const map = { uncategorized: [] };
    folders.forEach((folder) => {
      map[String(folder.id)] = [];
    });
    userDocs.forEach((doc) => {
      const key = doc.folder_id ? String(doc.folder_id) : 'uncategorized';
      if (!map[key]) map[key] = [];
      map[key].push(doc);
    });
    Object.values(map).forEach((docs) => {
      docs.sort((a, b) => (a.filename || a.title || '').localeCompare(b.filename || b.title || ''));
    });
    return map;
  }, [folders, userDocs]);

  useEffect(() => {
    if (activeFolderId === 'all' || activeFolderId === 'uncategorized') return;
    const exists = folders.some((folder) => String(folder.id) === String(activeFolderId));
    if (!exists) {
      setActiveFolderId('all');
    }
  }, [folders, activeFolderId]);

  useEffect(() => {
    if (!uploadFolderId) return;
    const exists = folders.some((folder) => String(folder.id) === String(uploadFolderId));
    if (!exists) {
      setUploadFolderId('');
    }
  }, [folders, uploadFolderId]);

  useEffect(() => {
    const validIds = new Set(userDocs.map((doc) => doc.doc_id || doc.id).filter(Boolean));
    setSelectedFileIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [userDocs]);

  useEffect(() => {
    setExpandedNodes((prev) => {
      let changed = false;
      const next = { ...prev };
      if (next.all === undefined) {
        next.all = true;
        changed = true;
      }
      if (next.uncategorized === undefined) {
        next.uncategorized = true;
        changed = true;
      }
      folders.forEach((folder) => {
        const key = String(folder.id);
        if (next[key] === undefined) {
          next[key] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [folders]);

  
  const recentIcon = (type) => {
    if (type === 'note')      return <FileText size={16} />;
    if (type === 'flashcard') return <Layers size={16} />;
    if (type === 'chat')      return <MessageCircle size={16} />;
    if (type === 'quiz')      return <Brain size={16} />;
    return <Sparkles size={16} />;
  };

  const recentColor = (type) => {
    if (type === 'note')      return '#3b82f6';
    if (type === 'flashcard') return '#22c55e';
    if (type === 'chat')      return '#a855f7';
    if (type === 'quiz')      return '#f97316';
    return 'var(--accent)';
  };

  const isNodeExpanded = (key) => expandedNodes[key] !== false;

  const toggleNodeExpanded = (key) => {
    setExpandedNodes((prev) => {
      const current = prev[key] !== false;
      return { ...prev, [key]: !current };
    });
  };

  const expandAllNodes = useCallback(() => {
    setExpandedNodes(() => {
      const next = { all: true, uncategorized: true };
      folders.forEach((folder) => {
        next[String(folder.id)] = true;
      });
      return next;
    });
  }, [folders]);

  const collapseAllNodes = useCallback(() => {
    setExpandedNodes(() => {
      const next = { all: true, uncategorized: false };
      folders.forEach((folder) => {
        next[String(folder.id)] = false;
      });
      return next;
    });
  }, [folders]);

  const handleBulkMoveSelected = useCallback(async () => {
    if (selectedFileIds.length === 0) {
      alert('Select one or more files first.');
      return;
    }
    const parsedFolderId = bulkMoveFolderId ? Number(bulkMoveFolderId) : null;
    const nextFolderId = Number.isFinite(parsedFolderId) ? parsedFolderId : null;
    const selectedSet = new Set(selectedFileIds.map((id) => String(id)));
    setMovingDocId('bulk');
    try {
      await Promise.all(
        selectedFileIds.map((docId) => contextService.moveDocumentToFolder(docId, nextFolderId))
      );
      const nextFolder = Number.isFinite(nextFolderId)
        ? folders.find((folder) => folder.id === nextFolderId)
        : null;
      setUserDocs((prev) => prev.map((doc) => {
        const docId = doc.doc_id || doc.id;
        if (!selectedSet.has(String(docId))) return doc;
        return {
          ...doc,
          folder_id: Number.isFinite(nextFolderId) ? nextFolderId : null,
          folder_name: nextFolder?.name || '',
        };
      }));
      await loadProgress();
      setBulkMoveFolderId('');
    } catch (e) {
      alert(e.message || 'Failed to move selected files');
    } finally {
      setMovingDocId(null);
    }
  }, [bulkMoveFolderId, folders, loadProgress, selectedFileIds]);

  const renderFolderTree = (nodes, depth = 1) => nodes.map((folder) => {
    const folderId = String(folder.id);
    const hasChildren = folder.children.length > 0;
    const expanded = isNodeExpanded(folderId);

    return (
      <div
        key={`ws-folder-tree-node-${folder.id}`}
        className={`vlt-ws-tree-node ${String(activeFolderId) === folderId ? 'active' : ''}`}
        style={{ '--folder-depth': depth }}
        data-has-children={hasChildren ? 'true' : 'false'}
      >
        {editingFolderId === folder.id ? (
          <div className="vlt-folder-edit-wrap">
            <input
              className="vlt-folder-input"
              value={editingFolderName}
              onChange={(e) => setEditingFolderName(e.target.value)}
            />
            <select
              className="vlt-folder-parent-select"
              value={editingFolderParentId}
              onChange={(e) => setEditingFolderParentId(e.target.value)}
            >
              <option value="">Root folder</option>
              {flatFolders
                .filter((opt) => opt.id !== folder.id)
                .map((opt) => (
                  <option key={`edit-parent-${folder.id}-${opt.id}`} value={opt.id}>
                    {'\u00A0'.repeat(opt.depth * 2)}{opt.name}
                  </option>
                ))}
            </select>
            <div className="vlt-folder-edit-actions">
              <button className="vlt-folder-action-btn" onClick={handleSaveFolderEdit} disabled={savingFolderEdit} aria-label="Save folder changes" title="Save folder changes">
                {savingFolderEdit ? <Loader2 size={11} className="vlt-spin" /> : <Save size={11} />}
              </button>
              <button className="vlt-folder-action-btn" onClick={cancelEditingFolder} aria-label="Cancel folder editing" title="Cancel folder editing"><X size={11} /></button>
            </div>
          </div>
        ) : (
          <>
            <div className="vlt-ws-tree-row">
              <button
                className={`vlt-ws-tree-toggle ${expanded ? 'expanded' : ''}`}
                onClick={() => hasChildren && toggleNodeExpanded(folderId)}
                disabled={!hasChildren}
                aria-label={expanded ? 'Collapse folder' : 'Expand folder'}
                aria-expanded={hasChildren ? expanded : undefined}
              >
                {hasChildren ? <ChevronRight size={12} /> : <span className="vlt-ws-tree-toggle-spacer" />}
              </button>
              <button
                className={`vlt-ws-folder-row ${String(activeFolderId) === folderId ? 'active' : ''}`}
                onClick={() => {
                  setActiveFolderId(folderId);
                  if (hasChildren) toggleNodeExpanded(folderId);
                }}
              >
                <span className="vlt-ws-folder-name"><Folder size={13} /> {folder.name}</span>
                <span className="vlt-ws-folder-count">{folderDocCounts[folderId] || 0}</span>
              </button>
              <div className="vlt-ws-folder-actions">
                <button className="vlt-folder-action-btn" onClick={() => selectFolderFiles(folder.id)} title="Select all files in folder">
                  <CheckSquare size={11} />
                </button>
                <button className="vlt-folder-action-btn" onClick={() => startEditingFolder(folder)} title="Rename or move folder"><PencilLine size={11} /></button>
                <button className="vlt-folder-action-btn danger" onClick={() => handleDeleteFolder(folder)} disabled={deletingFolderId === folder.id}>
                  {deletingFolderId === folder.id ? <Loader2 size={11} className="vlt-spin" /> : <Trash2 size={11} />}
                </button>
              </div>
            </div>
            {folderProgressMap[folderId] && (
              <div className="vlt-folder-progress-inline">
                Mastered {folderProgressMap[folderId].mastered_docs}/{folderProgressMap[folderId].docs_with_topics || folderProgressMap[folderId].total_docs}
                <button className="vlt-folder-mini-select" onClick={() => selectFolderFiles(folder.id)}>Select files</button>
              </div>
            )}
            {expanded && hasChildren && (
              <div className="vlt-ws-tree-children">
                {renderFolderTree(folder.children, depth + 1)}
              </div>
            )}
          </>
        )}
      </div>
    );
  });

  

  
  const DeckTab = () => {
    const deckDocs = deckIds.map((id) => allDocs.get(id)).filter(Boolean);
    const deckChunks = deckDocs.reduce((total, doc) => total + (doc.chunk_count || 0), 0);
    const shelfCurriculumDocs = hsDocs.filter(d =>
      !docSearch || [d.filename, d.title, d.subject, ...(d.topic_tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(docSearch.toLowerCase())
    );
    const shelfHasResults =
      (sourceScope !== 'curriculum' && filteredUserDocs.length > 0) ||
      (sourceScope !== 'mydocs' && shelfCurriculumDocs.length > 0);

    return (
    <div className="vlt-deck-layout">
      <div className="vlt-composer-intro">
        <div>
          <span>01 · SOURCE COMPOSER</span>
          <h2>Build a grounded working set.</h2>
          <p>Choose only the material Cerbyl should use for the next output.</p>
        </div>
        <div className={`vlt-composer-status ${deckDocs.length ? 'ready' : ''}`}>
          <span>{deckDocs.length ? 'Context online' : 'Waiting for sources'}</span>
          <strong>{deckChunks} chunks</strong>
        </div>
      </div>
      {}
      <div className="vlt-deck-panel">
        <div className="vlt-deck-panel-head">
          <div className="vlt-deck-panel-title">
            <span className="vlt-panel-index">B</span>
            <span>Working Context</span>
          </div>
          <div className="vlt-deck-count">
            <span className={`vlt-deck-count-num ${deckIds.length === DECK_SIZE ? 'full' : ''}`}>
              {deckIds.length}<span className="vlt-deck-count-of">/{DECK_SIZE}</span>
            </span>
            {deckIds.length > 0 && (
              <button className="vlt-deck-clear" onClick={clearDeck}>
                <X size={12} /> Clear deck
              </button>
            )}
          </div>
        </div>

        <div className="vlt-deck-capacity" aria-label={`${deckDocs.length} of ${DECK_SIZE} context sources selected`}>
          <div className="vlt-deck-capacity-copy">
            <span>Source capacity</span>
            <strong>{DECK_SIZE - deckDocs.length} available</strong>
          </div>
          <div className="vlt-deck-capacity-track" aria-hidden="true">
            {Array.from({ length: DECK_SIZE }, (_, index) => (
              <span key={index} className={index < deckDocs.length ? 'filled' : ''} />
            ))}
          </div>
        </div>

        {deckDocs.length === 0 ? (
          <div className="vlt-deck-empty-state">
            <div className="vlt-empty-slot-stack" aria-hidden><span>01</span><span>02</span><span>03</span></div>
            <h3>Your working set is empty</h3>
            <p>Add a source from the shelf. Cerbyl will stay grounded in only what you place here.</p>
          </div>
        ) : (
          <div className="vlt-active-source-list">
            {deckDocs.map((doc, index) => {
              const id = doc.doc_id || doc.id;
              const isHs = !userDocs.some((item) => (item.doc_id || item.id) === id);
              return (
                <article className="vlt-active-source" key={id}>
                  <span className="vlt-active-source-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="vlt-active-source-icon">{isHs ? <Users size={15} /> : <FileText size={15} />}</span>
                  <div className="vlt-active-source-copy">
                    <strong title={doc.filename || doc.title}>{doc.filename || doc.title || 'Untitled'}</strong>
                    <div>
                      <span>{isHs ? 'Curriculum' : 'Your document'}</span>
                      {doc.subject && <span>{subjectLabel(doc.subject)}</span>}
                      {doc.chunk_count > 0 && <span>{doc.chunk_count} chunks</span>}
                    </div>
                  </div>
                  <button onClick={() => removeFromDeck(id)} aria-label={`Remove ${doc.filename || doc.title || 'source'} from context`}>
                    <X size={14} />
                  </button>
                </article>
              );
            })}
          </div>
        )}

        <div className={`vlt-context-ready ${deckDocs.length ? 'ready' : ''}`}>
          <div className="vlt-context-ready-copy">
            <span className="vlt-context-ready-dot" />
            <div>
              <strong>{deckDocs.length ? 'Context ready' : 'Context not configured'}</strong>
              <span>{deckDocs.length ? `${deckDocs.length} source${deckDocs.length === 1 ? '' : 's'} · ${deckDocs.reduce((total, doc) => total + (doc.chunk_count || 0), 0)} chunks` : 'Add at least one source to ask grounded questions'}</span>
            </div>
          </div>
          <span className="vlt-context-ready-count">{deckIds.length}/{DECK_SIZE}</span>
        </div>

        <div className="vlt-context-actions" aria-label="Use working context">
          <div className="vlt-context-actions-copy">
            <span>02 · USE CONTEXT</span>
            <strong>{deckDocs.length ? 'Choose an output' : 'Add a source to unlock'}</strong>
          </div>
          <div className="vlt-context-action-grid">
            {FEAT.map((feature) => {
              const FeatureIcon = feature.icon;
              return (
                <button
                  type="button"
                  key={feature.id}
                  disabled={!deckDocs.length}
                  onClick={() => runContextAction(feature.id, deckIds, deckDocs)}
                  style={{ '--feature-color': feature.color }}
                >
                  <FeatureIcon size={15} /><span>{feature.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {}
      <div className="vlt-deck-browser">
        <div className="vlt-deck-browser-head">
          <span><b className="vlt-panel-index">A</b> Source Shelf</span>
          <div className="vlt-deck-browser-search">
            <Search size={13} />
            <input
              placeholder="Find a source"
              value={docSearch}
              onChange={e => setDocSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="vlt-source-scopes" aria-label="Filter source library">
          {[
            { id: 'all', label: 'All', count: userDocs.length + hsDocs.length },
            { id: 'mydocs', label: 'My docs', count: userDocs.length },
            { id: 'curriculum', label: 'Curriculum', count: hsDocs.length },
          ].map((scope) => (
            <button
              key={scope.id}
              className={sourceScope === scope.id ? 'active' : ''}
              onClick={() => setSourceScope(scope.id)}
              aria-pressed={sourceScope === scope.id}
            >
              {scope.label}<span>{scope.count}</span>
            </button>
          ))}
        </div>

        {}
        {sourceScope !== 'curriculum' && filteredUserDocs.length > 0 && (
          <div className="vlt-browser-section">
            <div className="vlt-browser-section-label">
              <Lock size={11} /> Your Documents
            </div>
            {filteredUserDocs.map(doc => {
              const id  = doc.doc_id || doc.id;
              const sel = deckSet.has(id);
              const full = !sel && deckIds.length >= DECK_SIZE;
              return (
                <button
                  key={id}
                  className={`vlt-browser-item ${sel ? 'vlt-browser-item--sel' : ''} ${full ? 'vlt-browser-item--full' : ''}`}
                  onClick={() => sel ? removeFromDeck(id) : addToDeck(id)}
                  disabled={full}
                >
                  <div className="vlt-browser-check">
                    {sel ? <Check size={13} /> : <Plus size={13} />}
                  </div>
                  <div className="vlt-browser-info">
                    <div className="vlt-browser-name">{doc.filename || 'Untitled'}</div>
                    <div className="vlt-browser-meta">
                      {doc.subject && <span>{subjectLabel(doc.subject)}</span>}
                      {doc.chunk_count > 0 && <span>{doc.chunk_count} chunks</span>}
                      {doc.file_size && <span>{fmtBytes(doc.file_size)}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {}
        {sourceScope !== 'mydocs' && hsDocs.length > 0 && (
          <div className="vlt-browser-section">
            <div className="vlt-browser-section-label">
              <Users size={11} /> Curriculum Books
            </div>
            {shelfCurriculumDocs.map(doc => {
                const id  = doc.doc_id || doc.id;
                const sel = deckSet.has(id);
                const full = !sel && deckIds.length >= DECK_SIZE;
                return (
                  <button
                    key={id}
                    className={`vlt-browser-item ${sel ? 'vlt-browser-item--sel' : ''} ${full ? 'vlt-browser-item--full' : ''}`}
                    onClick={() => sel ? removeFromDeck(id) : addToDeck(id)}
                    disabled={full}
                  >
                    <div className="vlt-browser-check">
                      {sel ? <Check size={13} /> : <Plus size={13} />}
                    </div>
                    <div className="vlt-browser-info">
                      <div className="vlt-browser-name">{doc.filename || 'Untitled'}</div>
                      <div className="vlt-browser-meta">
                        {doc.subject && <span style={{ color: CAT_COLORS[doc.subject] || 'var(--accent)' }}>{subjectLabel(doc.subject)}</span>}
                        {doc.grade_level && <span>Yr {doc.grade_level}</span>}
                        {doc.chunk_count > 0 && <span>{doc.chunk_count} chunks</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>
        )}

        {!shelfHasResults && !loading && (
          <div className="vlt-browser-empty">
            <Library size={28} />
            <p>{docSearch ? `No sources match “${docSearch}”.` : 'No sources yet. Upload your first document.'}</p>
            {docSearch ? (
              <button type="button" onClick={() => { setDocSearch(''); setSidebarSearch(''); }}>Clear search</button>
            ) : (
              <button type="button" onClick={() => setActiveTab('upload')}><Upload size={13} /> Upload source</button>
            )}
          </div>
        )}
      </div>
    </div>
    );
  };

  
  const RecentTab = () => (
    <div className="vlt-recent">
      <div className="vlt-recent-head">
        <span>Activity Feed</span>
        <button className="vlt-recent-refresh" onClick={() => setRecentKey(k => k + 1)}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
      {recentLoading ? (
        <div className="vlt-state-center">
          <Loader2 size={24} className="vlt-spin" />
          <p>Loading activity…</p>
        </div>
      ) : recent.length === 0 ? (
        <div className="vlt-state-center">
          <Clock size={32} />
          <p>No recent activity yet.</p>
        </div>
      ) : (
        <div className="vlt-recent-list">
          {recent.map((item, i) => (
            <div
              key={i}
              className="vlt-recent-item"
              onClick={() => navigate(item.route)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  navigate(item.route);
                }
              }}
            >
              <div className="vlt-recent-icon" style={{ background: `${recentColor(item.icon)}18`, color: recentColor(item.icon) }}>
                {recentIcon(item.icon)}
              </div>
              <div className="vlt-recent-body">
                <div className="vlt-recent-title">{item.title}</div>
                <div className="vlt-recent-meta">
                  <span className="vlt-recent-type"
                    style={{ color: recentColor(item.icon) }}>
                    {item.type}
                  </span>
                  {item.meta && <span>{item.meta}</span>}
                  {item.date && <span>{fmtDate(item.date)}</span>}
                </div>
              </div>
              <ChevronRight size={15} className="vlt-recent-arrow" />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  
  const UploadTab = () => (
    <div className="vlt-upload-tab">
      <div className="vlt-upload-tab-inner">
        <div className="vlt-upload-hero">
          <div className="vlt-upload-icon-wrap">
            {uploading ? <Loader2 size={44} className="vlt-spin" /> : <Upload size={44} />}
          </div>
          <h2 className="vlt-upload-hero-title">Upload a Document</h2>
          <p className="vlt-upload-hero-sub">PDF · DOCX · TXT · Markdown · max 50 MB</p>
        </div>

        <div className="vlt-upload-form-card">
          <div className="vlt-upload-fields">
            <input
              className="vlt-dz-input"
              placeholder="Subject (optional)"
              aria-label="Document subject (optional)"
              value={uploadSubject}
              onChange={e => setUploadSubject(e.target.value)}
            />
            <select
              className="vlt-dz-input"
              aria-label="Destination folder"
              value={uploadFolderId}
              onChange={e => setUploadFolderId(e.target.value)}
            >
              <option value="">No folder</option>
              {flatFolders.map(folder => (
                <option key={`up-${folder.id}`} value={folder.id}>
                  {' '.repeat(folder.depth * 2)}{folder.name}
                </option>
              ))}
            </select>
          </div>

          <label className={`vlt-upload-file-btn ${uploading ? 'vlt-upload-file-btn--busy' : ''}`}>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.docx,.md"
              className="vlt-visually-hidden-file"
              onChange={e => handleUpload(e.target.files[0])}
              disabled={uploading}
            />
            <Upload size={16} />
            {uploading ? 'Uploading…' : 'Choose File'}
          </label>

          {uploadError && (
            <div className="vlt-upload-msg vlt-upload-msg--error"><AlertCircle size={13} />{uploadError}</div>
          )}
          {uploadOk && (
            <div className="vlt-upload-msg vlt-upload-msg--ok"><Check size={13} />{uploadOk}</div>
          )}
        </div>

        <p className="vlt-upload-note">
          After uploading, your file will appear in <strong>Your Docs</strong> tab automatically.
        </p>
      </div>
    </div>
  );

  
  const MyDocsTab = () => (
    <div className="vlt-docs-layout vlt-docs-layout--mydocs">
      <aside className="vlt-docs-sidebar">
        {}
        <div className="vlt-docs-sidebar-section">
          <p className="vlt-sidebar-label"><FolderPlus size={13} /> New Folder</p>
          <div className="vlt-sidebar-create">
            <div className="vlt-ws-create-input-wrap">
              <input
                className="vlt-sidebar-input"
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => { setNewFolderName(e.target.value); if (folderError) setFolderError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); }}
              />
              {newFolderName && (
                <button className="vlt-ws-input-clear" onClick={() => setNewFolderName('')}><X size={11} /></button>
              )}
            </div>
            <button className="vlt-sidebar-create-btn" onClick={handleCreateFolder} disabled={creatingFolder}>
              {creatingFolder ? <Loader2 size={12} className="vlt-spin" /> : <FolderPlus size={12} />}
              {creatingFolder ? '' : 'Create'}
            </button>
          </div>
          <div className="vlt-ws-location-modes">
            <button className={`vlt-ws-mode-btn ${newFolderLocationMode === 'root' ? 'active' : ''}`} onClick={() => setNewFolderLocationMode('root')}>Root</button>
            <button className={`vlt-ws-mode-btn ${newFolderLocationMode === 'current' ? 'active' : ''}`} onClick={() => setNewFolderLocationMode('current')} disabled={!canUseCurrentFolderAsParent}>Current</button>
            <button className={`vlt-ws-mode-btn ${newFolderLocationMode === 'custom' ? 'active' : ''}`} onClick={() => setNewFolderLocationMode('custom')}>Choose</button>
          </div>
          {newFolderLocationMode === 'custom' && (
            <select className="vlt-sidebar-select" value={newFolderParentId} onChange={(e) => setNewFolderParentId(e.target.value)}>
              <option value="">Root folder</option>
              {flatFolders.map((folder) => (
                <option key={`create-parent-${folder.id}`} value={folder.id}>{' '.repeat(folder.depth * 2)}{folder.name}</option>
              ))}
            </select>
          )}
          <p className="vlt-sidebar-hint">In: <strong>{createFolderLocationLabel}</strong></p>
          {folderError && <p className="vlt-folder-note vlt-folder-note--error">{folderError}</p>}
        </div>

        {}
        <div className="vlt-docs-sidebar-nav">
          <div className="vlt-docs-sidebar-nav-head">
            <p className="vlt-sidebar-label"><Folder size={13} /> Folders</p>
            <div className="vlt-sidebar-nav-actions">
              <button className="vlt-sidebar-nav-action" onClick={selectVisibleFiles} title="Select all visible">All</button>
              <button className="vlt-sidebar-nav-action" onClick={expandAllNodes} title="Expand all">+</button>
              <button className="vlt-sidebar-nav-action" onClick={collapseAllNodes} title="Collapse all">−</button>
            </div>
          </div>
          <nav className="vlt-folder-nav">
            <button className={`vlt-folder-nav-item ${activeFolderId === 'all' ? 'active' : ''}`} onClick={() => setActiveFolderId('all')}>
              <Folder size={14} className="vlt-folder-nav-icon" />
              <span className="vlt-folder-nav-name">All files</span>
              <span className="vlt-folder-nav-count">{userDocs.length}</span>
            </button>
            <button className={`vlt-folder-nav-item ${activeFolderId === 'uncategorized' ? 'active' : ''}`} onClick={() => setActiveFolderId('uncategorized')}>
              <Folder size={14} className="vlt-folder-nav-icon" />
              <span className="vlt-folder-nav-name">Uncategorized</span>
              <span className="vlt-folder-nav-count">{folderDocCounts.uncategorized || 0}</span>
            </button>
            <div className="vlt-ws-tree-root">{renderFolderTree(folderTree, 0)}</div>
          </nav>
          {foldersLoading && <p className="vlt-folder-note">Loading…</p>}
        </div>

        {}
        <div className="vlt-docs-sidebar-footer">
          <p className="vlt-sidebar-label">Move Files</p>
          <p className="vlt-sidebar-hint">{selectedFileIds.length > 0 ? `${selectedFileIds.length} selected` : 'Select files to move'}</p>
          <div className="vlt-sidebar-move">
            <select className="vlt-sidebar-select" value={bulkMoveFolderId} onChange={(e) => setBulkMoveFolderId(e.target.value)}>
              <option value="">Uncategorized</option>
              {flatFolders.map((folder) => (
                <option key={`bulk-move-folder-${folder.id}`} value={folder.id}>{' '.repeat(folder.depth * 2)}{folder.name}</option>
              ))}
            </select>
            <button className="vlt-sidebar-create-btn" onClick={handleBulkMoveSelected} disabled={selectedFileIds.length === 0 || movingDocId === 'bulk'}>
              {movingDocId === 'bulk' ? <Loader2 size={12} className="vlt-spin" /> : <Folder size={12} />}
              Move
            </button>
          </div>
        </div>
      </aside>

      {}
      <div className="vlt-docs-main">

        {}
        <div className="vlt-docs-toolbar">
          <div className="vlt-docs-toolbar-left">
            <span className="vlt-docs-count">
              {filteredUserDocs.length} doc{filteredUserDocs.length !== 1 ? 's' : ''}
              {selectedFileIds.length > 0 && (
                <span className="vlt-docs-selected"> · {selectedFileIds.length} selected</span>
              )}
            </span>
            <button className="vlt-action-link" onClick={selectVisibleFiles}>Select all</button>
            {selectedFileIds.length > 0 && (
              <button className="vlt-action-link" onClick={clearFileSelection}>Clear</button>
            )}
          </div>
          <div className="vlt-docs-toolbar-right">
            <div className="vlt-doc-search">
              <Search size={13} />
              <input placeholder="Search…" value={docSearch} onChange={e => setDocSearch(e.target.value)} />
              {docSearch && <button className="vlt-doc-search-clear" onClick={() => setDocSearch('')}><X size={12}/></button>}
            </div>
            <button className="vlt-icon-btn" onClick={() => { loadDocs(); loadProgress(); }} title="Refresh"><RefreshCw size={13} /></button>
          </div>
        </div>

        {}
        {selectedFileIds.length > 0 && (
          <div className="vlt-bulk-bar">
            <span className="vlt-bulk-label">{selectedFileIds.length} file{selectedFileIds.length !== 1 ? 's' : ''} — use as context:</span>
            <button className="vlt-action-btn vlt-action-btn--chat" onClick={() => openSelectedDocsAction('chat')}><MessageCircle size={12} /> Chat</button>
            <button className="vlt-action-btn vlt-action-btn--flash" onClick={() => openSelectedDocsAction('flashcards')}><Layers size={12} /> Flashcards</button>
            <button className="vlt-action-btn vlt-action-btn--notes" onClick={() => openSelectedDocsAction('notes')} disabled={bulkActionLoading === 'notes'}>
              {bulkActionLoading === 'notes' ? <Loader2 size={12} className="vlt-spin" /> : <FileText size={12} />} Notes
            </button>
            <button className="vlt-action-btn vlt-action-btn--quiz" onClick={() => openSelectedDocsAction('quiz')}><Brain size={12} /> Quiz</button>
            <button className="vlt-action-btn vlt-action-btn--roadmap" onClick={() => openSelectedDocsAction('roadmap')}><Target size={12} /> Knowledge Map</button>
            <button className="vlt-bulk-clear" onClick={clearFileSelection} aria-label="Clear selected files" title="Clear selected files"><X size={12} /></button>
          </div>
        )}

        {}
        {loading ? (
          <div className="vlt-state-center"><Loader2 size={24} className="vlt-spin" /><p>Loading…</p></div>
        ) : filteredUserDocs.length === 0 ? (
          <div className="vlt-state-center">
            <Library size={36} />
            <h3>{userDocs.length === 0 ? 'No documents yet' : 'No results'}</h3>
            <p>
              {userDocs.length === 0
                ? 'Go to the Upload tab to add your first document.'
                : 'Try a different search or folder.'}
            </p>
            {userDocs.length === 0 && (
              <button className="vlt-empty-upload-btn" onClick={() => setActiveTab('upload')}>
                <Upload size={14} /> Upload a Document
              </button>
            )}
          </div>
        ) : (
          <div className="vlt-doccard-grid">
            {filteredUserDocs.map(doc => {
              const id   = String(doc.doc_id || doc.id);
              const acts = fileActionStats[id]?.actions || {};
              return (
                <VaultDocCard
                  key={id}
                  doc={doc}
                  acts={acts}
                  inDeck={deckSet.has(doc.doc_id || doc.id)}
                  deckFull={deckIds.length >= DECK_SIZE}
                  onDeckToggle={(docId) => deckSet.has(docId) ? removeFromDeck(docId) : addToDeck(docId)}
                  onAction={(target, docId, d) => runContextAction(target, [docId], [d])}
                  onDelete={handleDelete}
                  onNavigate={(docId) => navigate(`/contexthub/file/${encodeURIComponent(String(docId))}`)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  
  const currSubjectCats = useMemo(() => {
    const cats = new Map();
    currSubjects.forEach(s => {
      if (!cats.has(s.cat)) cats.set(s.cat, []);
      cats.get(s.cat).push(s);
    });
    return Array.from(cats.entries());
  }, [currSubjects]);

  const CurriculumTab = () => {
    const selectedSubjectInfo = currSubject
      ? currSubjects.find(s => s.id === currSubject)
      : null;

    return (
      <div className="vlt-docs-layout">
        {}
        <aside className="vlt-docs-sidebar">
          {}
          <div className="vlt-docs-sidebar-section">
            <p className="vlt-sidebar-label"><GraduationCap size={13} /> Curriculum</p>
            <div className="vlt-curr-toggle">
              {['uk', 'us'].map(c => (
                <button
                  key={c}
                  className={`vlt-curr-toggle-btn ${currMode === c ? 'active' : ''}`}
                  onClick={() => { setCurrMode(c); setCurrSubject(null); }}
                  aria-pressed={currMode === c}
                >
                  {c === 'uk' ? '🇬🇧 UK' : '🇺🇸 US'}
                </button>
              ))}
            </div>
            <p className="vlt-sidebar-hint">{hsDocs.length} books available</p>
          </div>

          {}
          <div className="vlt-docs-sidebar-nav">
            <div className="vlt-docs-sidebar-nav-head">
              <p className="vlt-sidebar-label"><BookOpen size={13} /> Subjects</p>
            </div>
            <nav className="vlt-folder-nav">
              {}
              <button
                className={`vlt-folder-nav-item ${!currSubject ? 'active' : ''}`}
                onClick={() => setCurrSubject(null)}
              >
                <Layers size={14} className="vlt-folder-nav-icon" />
                <span className="vlt-folder-nav-name">All Subjects</span>
                <span className="vlt-folder-nav-count">{hsDocs.length}</span>
              </button>

              {}
              {currSubjectCats.map(([cat, subs]) => {
                const catBooks = subs.reduce((n, s) => n + hsDocs.filter(d =>
                  (d.subject || '').toLowerCase().replace(/ /g, '_') === s.id ||
                  (d.subject || '').toLowerCase().includes(s.name.toLowerCase())
                ).length, 0);
                if (catBooks === 0) return null;
                return (
                  <div key={cat} className="vlt-curr-cat-group">
                    <p className="vlt-curr-cat-label" style={{ color: CAT_COLORS[cat] || 'var(--accent)' }}>{cat}</p>
                    {subs.map(s => {
                      const matchCount = hsDocs.filter(d =>
                        (d.subject || '').toLowerCase().replace(/ /g, '_') === s.id ||
                        (d.subject || '').toLowerCase().includes(s.name.toLowerCase())
                      ).length;
                      if (matchCount === 0) return null;
                      return (
                        <button
                          key={s.id}
                          className={`vlt-folder-nav-item ${currSubject === s.id ? 'active' : ''}`}
                          onClick={() => setCurrSubject(currSubject === s.id ? null : s.id)}
                          style={currSubject === s.id ? { '--nav-active-color': CAT_COLORS[s.cat] } : {}}
                        >
                          <BookOpen size={13} className="vlt-folder-nav-icon" style={{ color: CAT_COLORS[s.cat] || 'var(--accent)' }} />
                          <span className="vlt-folder-nav-name">{s.name}</span>
                          <span className="vlt-folder-nav-count">{matchCount}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
          </div>
        </aside>

        {}
        <div className="vlt-docs-main">
          {}
          <div className="vlt-curr-main-header">
            <div className="vlt-curr-main-title">
              <BookOpen size={16} />
              <span>{selectedSubjectInfo ? selectedSubjectInfo.name : 'All Subjects'}</span>
              {selectedSubjectInfo && (
                <span className="vlt-curr-main-cat" style={{ color: CAT_COLORS[selectedSubjectInfo.cat] || 'var(--accent)' }}>
                  {selectedSubjectInfo.cat}
                </span>
              )}
            </div>
            <span className="vlt-curr-main-count">{filteredHsDocs.length} book{filteredHsDocs.length !== 1 ? 's' : ''}</span>
          </div>

          {}
          {filteredHsDocs.length === 0 ? (
            <div className="vlt-state-center">
              <BookOpen size={36} />
              <h3>{currSubject ? 'No books for this subject' : 'No curriculum books available'}</h3>
              <p>{currSubject ? 'Try selecting a different subject.' : 'Curriculum books appear here once loaded.'}</p>
            </div>
          ) : (
            <div className="vlt-curr-books-grid">
              {filteredHsDocs.map(doc => {
                const id  = doc.doc_id || doc.id;
                const sel = deckSet.has(id);
                const full = !sel && deckIds.length >= DECK_SIZE;
                const catColor = CAT_COLORS[doc.subject] || 'var(--accent)';
                return (
                  <div key={id} className={`vlt-curr-book-card ${sel ? 'vlt-curr-book-card--decked' : ''}`}>
                    <div className="vlt-curr-book-top">
                      <div className="vlt-curr-book-icon" style={{ background: `color-mix(in srgb, ${catColor} 12%, transparent)`, color: catColor }}>
                        <BookOpen size={18} />
                      </div>
                      <button
                        className={`vlt-doc-deck-btn ${sel ? 'vlt-doc-deck-btn--remove' : ''}`}
                        onClick={() => sel ? removeFromDeck(id) : addToDeck(id)}
                        disabled={full}
                        title={sel ? 'Remove from deck' : full ? 'Deck full' : 'Add to deck'}
                      >
                        {sel ? <><Check size={11} /> In Deck</> : <><Plus size={11} /> Add</>}
                      </button>
                    </div>
                    <div className="vlt-curr-book-name" title={doc.filename}>{doc.filename || 'Untitled'}</div>
                    <div className="vlt-curr-book-meta">
                      {doc.subject && <span style={{ color: catColor }}>{subjectLabel(doc.subject)}</span>}
                      {doc.grade_level && <span>Yr {doc.grade_level}</span>}
                      {doc.chunk_count > 0 && <span>{doc.chunk_count} chunks</span>}
                    </div>
                    {doc.ai_summary && <p className="vlt-curr-book-summary">{doc.ai_summary}</p>}
                    {Array.isArray(doc.topic_tags) && doc.topic_tags.length > 0 && (
                      <div className="vlt-curr-book-tags">
                        {doc.topic_tags.slice(0, 3).map((t, i) => <span key={i} className="vlt-pill">{t}</span>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  

  return (
    <div className="vlt-root">
      <div className="shc-topbar">
        <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
        <div className="shc-topbar-right">
          <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
        </div>
      </div>
      <AbstractFx variant="circles" />

      <div className="vlt-bg-fx" aria-hidden>
        <div className="vlt-bg-orb vlt-bg-orb-1" />
        <div className="vlt-bg-orb vlt-bg-orb-2" />
        <div className="vlt-bg-dots" />
        <div className="vlt-bg-vignette" />
      </div>

      <div className="vlt-qb-body">
        <div className={`vlt-qb-shell ${sidebarCollapsed ? 'vlt-qb-shell--collapsed' : ''}`}>
          <SidebarShell
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
            brandKicker="CONTEXT HUB"
            ariaLabel="ContextHub navigation"
            collapsedContent={(
              <>
                <SidebarStripButton icon={<Upload size={18} />} tip="Add source" onClick={() => { setSidebarCollapsed(false); setActiveTab('upload'); }} />
                <SidebarStripButton icon={<Search size={18} />} tip="Search sources" onClick={() => setSidebarCollapsed(false)} />
                <SidebarStripButton icon={<Package size={18} />} tip="Context deck" active={activeTab === 'deck'} onClick={() => { setSidebarCollapsed(false); setActiveTab('deck'); }} />
                <SidebarStripButton icon={<Lock size={18} />} tip="Your docs" active={activeTab === 'mydocs'} onClick={() => { setSidebarCollapsed(false); setActiveTab('mydocs'); }} />
                <SidebarStripButton icon={<GraduationCap size={18} />} tip="Curriculum" active={activeTab === 'curriculum'} onClick={() => { setSidebarCollapsed(false); setActiveTab('curriculum'); }} />
                <SidebarStripSpacer />
                <SidebarStripButton icon={<MessageSquare size={18} />} tip="AI Chat" onClick={() => navigate('/ai-chat')} />
                <SidebarStripButton icon={<LayoutDashboard size={18} />} tip="Dashboard" onClick={() => navigate('/dashboard-cerbyl')} />
                <SidebarStripButton
                  icon={<LogOut size={18} />}
                  tip="Logout"
                  onClick={() => {
                    void signOutAppSession();
                    localStorage.removeItem('token');
                    localStorage.removeItem('username');
                    navigate('/');
                  }}
                />
              </>
            )}
          >
            <div className="vlt-sidebar-create">
              <SidebarPrimaryButton
                icon={<Plus size={15} />}
                label="Add source"
                onClick={() => setActiveTab('upload')}
              />
              <div className="vlt-sidebar-search">
                <Search size={14} />
                <input
                  value={sidebarSearch}
                  onChange={(event) => {
                    setSidebarSearch(event.target.value);
                    setDocSearch(event.target.value);
                    setActiveTab('deck');
                  }}
                  placeholder="Search sources..."
                  aria-label="Search ContextHub sources"
                />
                {sidebarSearch && (
                  <button type="button" onClick={() => { setSidebarSearch(''); setDocSearch(''); }} aria-label="Clear source search"><X size={12} /></button>
                )}
              </div>
            </div>

            <SidebarSection heading="Workspace">
              {TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <SidebarMenuItem
                    key={t.id}
                    icon={<Icon size={16} />}
                    label={t.label}
                    active={activeTab === t.id}
                    onClick={() => setActiveTab(t.id)}
                    badge={t.id === 'deck' && deckIds.length > 0 ? <span className="vlt-qb-nav-count">{deckIds.length}</span> : null}
                  />
                );
              })}
            </SidebarSection>

            {folders.length > 0 && (
              <div className="vlt-sidebar-folders">
                <div className="vlt-sidebar-section-head">
                  <span>Folders</span>
                  <strong>{folders.length}</strong>
                </div>
                <div className="vlt-sidebar-folder-list">
                  <button
                    type="button"
                    className={activeFolderId === 'all' ? 'active' : ''}
                    onClick={() => { setActiveFolderId('all'); setActiveTab('mydocs'); }}
                  >
                    <Folder size={13} /><span>All documents</span><small>{userDocs.length}</small>
                  </button>
                  {folders.map((folder) => (
                    <button
                      type="button"
                      key={folder.id}
                      className={String(activeFolderId) === String(folder.id) ? 'active' : ''}
                      onClick={() => { setActiveFolderId(String(folder.id)); setActiveTab('mydocs'); }}
                    >
                      <Folder size={13} /><span>{folder.name}</span><small>{folderDocCounts[String(folder.id)] || 0}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="vlt-sidebar-context">
              <div className="vlt-sidebar-section-head">
                <span>Working context</span>
                <strong>{deckIds.length}/{DECK_SIZE}</strong>
              </div>
              <div className="vlt-sidebar-context-track" aria-hidden>
                {Array.from({ length: DECK_SIZE }, (_, index) => (
                  <span key={index} className={index < deckIds.length ? 'filled' : ''} />
                ))}
              </div>
              <div className="vlt-sidebar-context-list">
                {deckIds.length === 0 ? (
                  <button type="button" className="vlt-sidebar-context-empty" onClick={() => setActiveTab('deck')}>
                    <Plus size={15} /><span>Select sources in the composer</span>
                  </button>
                ) : deckIds.map((sourceId) => {
                  const doc = allDocs.get(sourceId);
                  if (!doc) return null;
                  const id = doc.doc_id || doc.id;
                  return (
                    <div className="vlt-sidebar-context-item" key={id}>
                      <span><FileText size={12} /></span>
                      <strong title={doc.filename || doc.title}>{doc.filename || doc.title || 'Untitled'}</strong>
                      <button type="button" onClick={() => removeFromDeck(id)} aria-label={`Remove ${doc.filename || doc.title || 'source'}`}>
                        <X size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <SidebarActions>
              <SidebarAction icon={<LayoutDashboard size={14} />} label="Dashboard" onClick={() => navigate('/dashboard-cerbyl')} />
              <SidebarAction icon={<MessageSquare size={14} />} label="AI Chat" onClick={() => navigate('/ai-chat')} />
              <SidebarAction
                icon={<LogOut size={14} />}
                label="Logout"
                onClick={() => {
                  void signOutAppSession();
                  localStorage.removeItem('token');
                  localStorage.removeItem('username');
                  navigate('/');
                }}
              />
            </SidebarActions>
          </SidebarShell>

          <main className="vlt-main vlt-qb-main">
        {}
        <section className="vlt-command-header">
          <div className="vlt-command-copy">
            <span>CONTEXT HUB / {TABS.find(tab => tab.id === activeTab)?.label}</span>
            <h1>{activeTab === 'deck' ? 'Context, composed.' : activeTab === 'mydocs' ? 'Your source archive.' : activeTab === 'upload' ? 'Bring in new evidence.' : 'Curriculum, ready to use.'}</h1>
          </div>
          <div className="vlt-command-stats" aria-label="Context Hub summary">
            <span><strong>{String(stats.deck).padStart(2, '0')}</strong> active</span>
            <span><strong>{String(stats.myDocs).padStart(2, '0')}</strong> documents</span>
            <span><strong>{stats.chunks}</strong> chunks</span>
          </div>
          <button className="vlt-command-add" type="button" onClick={() => setActiveTab('upload')}>
            <Plus size={15} /> Add source
          </button>
        </section>

        {}
        <div className={`vlt-tab-content ${activeTab === 'deck' ? 'vlt-tab-content--deck' : ''}`}>
          {activeTab === 'deck'       && DeckTab()}
          {activeTab === 'mydocs'     && MyDocsTab()}
          {activeTab === 'upload'     && UploadTab()}
          {activeTab === 'curriculum' && CurriculumTab()}
        </div>
        {activeTab === 'deck' && <RecentTab />}
          </main>
        </div>
      </div>
    </div>
  );
};

export default Vault;
