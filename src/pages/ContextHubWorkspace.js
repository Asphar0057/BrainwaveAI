import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive, Brain, Check, CheckSquare, ChevronRight,
  FileText, Folder, Layers,
  Loader2, Lock, MessageCircle, Pencil, Package,
  Plus, RefreshCw, Search, Square, Target, Trash2, Upload, X
} from 'lucide-react';
import contextService from '../services/contextService';
import { queuedAIJsonFetch } from '../services/aiJobService';
import SocialHubChrome from '../components/SocialHubChrome';
import './ContextHubWorkspace.css';

/*
 * THESIS: Context Hub is a focused source-composition desk, three tabs only.
 * STORY: build a working deck of sources, keep a plain library of everything you've uploaded, add new sources.
 * FORM: standardized shared sidebar (same component every other page uses); no nested browsing UI.
 */

const DECK_KEY = 'ctx_selected_doc_ids';
const DECK_LIMIT = 8;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const SUPPORTED_FILE_EXTENSIONS = ['pdf', 'docx', 'txt', 'md'];

const NAV_ITEMS = [
  { id: 'desk', label: 'My Deck', icon: Package },
  { id: 'library', label: 'My Library', icon: Lock },
  { id: 'upload', label: 'Upload', icon: Upload },
];

const OUTPUTS = [
  { id: 'chat', label: 'Ask', description: 'Grounded conversation', icon: MessageCircle, color: '#caa7ff' },
  { id: 'flashcards', label: 'Cards', description: 'Recall practice', icon: Layers, color: '#79d9ad' },
  { id: 'notes', label: 'Notes', description: 'Structured synthesis', icon: FileText, color: '#8bb9ff' },
  { id: 'quiz', label: 'Quiz', description: 'Test understanding', icon: Brain, color: '#f0ad73' },
  { id: 'roadmap', label: 'Map', description: 'Connect concepts', icon: Target, color: '#65d7df' },
];

const readDeck = () => {
  try {
    const value = JSON.parse(localStorage.getItem(DECK_KEY) || '[]');
    return Array.isArray(value)
      ? Array.from(new Set(value.map(String).filter(Boolean))).slice(0, DECK_LIMIT)
      : [];
  } catch {
    return [];
  }
};

const saveDeck = (ids) => {
  try { localStorage.setItem(DECK_KEY, JSON.stringify(ids)); } catch {}
};

const docId = (doc) => String(doc?.doc_id || doc?.id || '');
const docName = (doc) => doc?.filename || doc?.title || 'Untitled source';
const pretty = (value) => String(value || 'General').replace(/_/g, ' ');
const formatBytes = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

function ContextHubWorkspace() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [view, setView] = useState('desk');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window === 'undefined' ? false : window.innerWidth <= 768
  ));
  const [userDocs, setUserDocs] = useState([]);
  const [curriculumDocs, setCurriculumDocs] = useState([]);
  const [folders, setFolders] = useState([]);
  const [deckIds, setDeckIds] = useState(readDeck);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [activeFolder, setActiveFolder] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [newFolder, setNewFolder] = useState('');
  const [newFolderParent, setNewFolderParent] = useState('');
  const [bulkMoveFolder, setBulkMoveFolder] = useState('');
  const [folderBusy, setFolderBusy] = useState(false);
  const [progressMap, setProgressMap] = useState({});
  const [uploadSubject, setUploadSubject] = useState('');
  const [uploadFolder, setUploadFolder] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [actionBusy, setActionBusy] = useState('');
  const [rowBusy, setRowBusy] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError('');
    const [documentResult, folderResult, progressResult] = await Promise.allSettled([
        contextService.listDocuments(),
        contextService.listFolders(),
        contextService.getProgress(),
      ]);

    if (documentResult.status === 'fulfilled') {
      setUserDocs(Array.isArray(documentResult.value?.user_docs) ? documentResult.value.user_docs : []);
      setCurriculumDocs(Array.isArray(documentResult.value?.hs_docs) ? documentResult.value.hs_docs : []);
    } else {
      setUserDocs([]);
      setCurriculumDocs([]);
      setError(documentResult.reason?.message || 'Your sources could not be loaded.');
    }
    if (folderResult.status === 'fulfilled') {
      setFolders(Array.isArray(folderResult.value?.folders) ? folderResult.value.folders : []);
    } else if (documentResult.status === 'fulfilled') {
      setError('Sources loaded, but folder information is temporarily unavailable.');
    }
    if (progressResult.status === 'fulfilled') {
      const nextProgress = {};
      (progressResult.value?.doc_progress || []).forEach((item) => {
        if (item?.doc_id) nextProgress[String(item.doc_id)] = item;
      });
      setProgressMap(nextProgress);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);

  useEffect(() => {
    if (sidebarCollapsed) return undefined;
    if (typeof window === 'undefined' || window.innerWidth > 768) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSidebarCollapsed(true);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [sidebarCollapsed]);

  const allDocs = useMemo(() => {
    const map = new Map();
    [...userDocs, ...curriculumDocs].forEach((doc) => map.set(docId(doc), doc));
    return map;
  }, [userDocs, curriculumDocs]);

  useEffect(() => {
    if (loading) return;
    const valid = deckIds.filter((id) => {
      const source = allDocs.get(String(id));
      return source && (!source.status || source.status === 'ready');
    });
    if (valid.length !== deckIds.length) {
      setDeckIds(valid);
      saveDeck(valid);
    }
  }, [allDocs, deckIds, loading]);

  const deckDocs = useMemo(
    () => deckIds.map((id) => allDocs.get(String(id))).filter(Boolean),
    [allDocs, deckIds]
  );

  const deckChunks = deckDocs.reduce((sum, doc) => sum + Number(doc.chunk_count || 0), 0);
  const deckSet = useMemo(() => new Set(deckIds), [deckIds]);

  const folderCounts = useMemo(() => {
    const counts = { uncategorized: 0 };
    userDocs.forEach((doc) => {
      const key = doc.folder_id == null ? 'uncategorized' : String(doc.folder_id);
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [userDocs]);

  const filteredUserDocs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return userDocs.filter((doc) => {
      const folderMatch = activeFolder === 'all'
        || (activeFolder === 'uncategorized' && doc.folder_id == null)
        || String(doc.folder_id) === String(activeFolder);
      const searchMatch = !needle || [
        docName(doc), doc.subject, doc.folder_name, ...(doc.topic_tags || []),
      ].join(' ').toLowerCase().includes(needle);
      return folderMatch && searchMatch;
    });
  }, [activeFolder, query, userDocs]);

  const filteredCurriculumDocs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return curriculumDocs.filter((doc) => {
      const searchMatch = !needle || [docName(doc), doc.subject, ...(doc.topic_tags || [])]
        .join(' ').toLowerCase().includes(needle);
      return searchMatch;
    });
  }, [curriculumDocs, query]);

  const deskSources = useMemo(() => {
    if (scope === 'mine') return filteredUserDocs;
    if (scope === 'curriculum') return filteredCurriculumDocs;
    return [...filteredUserDocs, ...filteredCurriculumDocs];
  }, [filteredCurriculumDocs, filteredUserDocs, scope]);

  const pickerCandidates = useMemo(() => {
    const needle = pickerQuery.trim().toLowerCase();
    return [...userDocs, ...curriculumDocs].filter((doc) => {
      const id = docId(doc);
      if (!id || deckSet.has(id)) return false;
      if (!needle) return true;
      return [docName(doc), doc.subject, ...(doc.topic_tags || [])]
        .join(' ').toLowerCase().includes(needle);
    });
  }, [curriculumDocs, deckSet, pickerQuery, userDocs]);

  const updateDeck = (next) => {
    const normalized = Array.from(new Set(next.map(String))).slice(0, DECK_LIMIT);
    setDeckIds(normalized);
    saveDeck(normalized);
  };

  const toggleDeck = (id) => {
    const key = String(id);
    if (deckSet.has(key)) updateDeck(deckIds.filter((item) => item !== key));
    else if (deckIds.length < DECK_LIMIT) {
      updateDeck([...deckIds, key]);
      recordAction([key], 'deck');
    }
  };

  const recordAction = (ids, action) => {
    if (!action) return;
    try {
      const key = 'ctx_file_action_stats';
      const stored = JSON.parse(localStorage.getItem(key) || '{}');
      const now = new Date().toISOString();
      ids.forEach((id) => {
        const current = stored[String(id)] || {};
        const actions = { ...(current.actions || {}) };
        actions[action] = Number(actions[action] || 0) + 1;
        stored[String(id)] = {
          ...current,
          actions,
          total_actions: Number(current.total_actions || 0) + 1,
          first_used_at: current.first_used_at || now,
          last_used_at: now,
        };
      });
      localStorage.setItem(key, JSON.stringify(stored));
    } catch {}
  };

  const toggleSelected = (id) => {
    const key = String(id);
    setSelectedIds((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key]);
  };

  const runOutput = useCallback(async (target, docs = deckDocs) => {
    const ids = Array.from(new Set(docs.map(docId).filter(Boolean))).slice(0, DECK_LIMIT);
    if (!ids.length || actionBusy) return;
    saveDeck(ids);
    setDeckIds(ids);
    const normalizedDocs = ids.map((id) => allDocs.get(String(id))).filter(Boolean);
    const names = normalizedDocs.map(docName).slice(0, 6).join(', ');
    if (target === 'chat') {
      recordAction(ids, target);
      navigate('/ai-chat', { state: { contextDocIds: ids, initialMessage: `Use these context sources: ${names}. Help me study what matters most.` } });
      return;
    }
    if (target === 'flashcards') {
      recordAction(ids, target);
      navigate('/flashcards', { state: { contextDocIds: ids, initialTopic: names, generationMode: 'topic', openPanel: 'generator', autoGenerateFromContext: true } });
      return;
    }
    if (target === 'quiz') {
      recordAction(ids, target);
      navigate('/question-bank', { state: { contextDocIds: ids, topic: names || 'Selected context files', openView: 'custom', autoGenerateFromContext: true } });
      return;
    }
    if (target === 'roadmap') {
      recordAction(ids, target);
      navigate('/knowledge-map', { state: { contextDocIds: ids, sourceSummary: names, autoCreateFromContext: true } });
      return;
    }

    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('username') || localStorage.getItem('user_id') || localStorage.getItem('email');
    if (!token || !userId) {
      setError('Your session expired. Sign in again before creating notes.');
      return;
    }
    setActionBusy('notes');
    try {
      const response = await queuedAIJsonFetch('/create_note_from_context_docs', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          context_doc_ids: ids,
          title: names ? `Notes: ${names}` : 'Study Notes',
          depth: 'deep',
          tone: 'professional',
        }),
      });
      if (!response.ok) throw new Error(`Notes could not be created (${response.status}).`);
      const data = await response.json();
      if (!data?.id) throw new Error('Notes were created, but the editor could not be opened.');
      recordAction(ids, target);
      navigate(`/notes/editor/${data.id}`);
    } catch (err) {
      setError(err?.message || 'Notes could not be created. Try again.');
    } finally {
      setActionBusy('');
    }
  }, [actionBusy, allDocs, deckDocs, navigate]);

  const handleUpload = async (file) => {
    if (!file || uploading) return;
    const extension = String(file.name || '').split('.').pop().toLowerCase();
    if (!SUPPORTED_FILE_EXTENSIONS.includes(extension)) {
      setUploadMessage('');
      setUploadError('Unsupported file type. Choose a PDF, DOCX, TXT, or Markdown file.');
      setDragging(false);
      return;
    }
    if (file.size === 0) {
      setUploadMessage('');
      setUploadError('This file is empty. Choose a file that contains study material.');
      setDragging(false);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadMessage('');
      setUploadError('This file is larger than 50 MB. Choose a smaller file.');
      setDragging(false);
      return;
    }
    setUploading(true);
    setUploadError('');
    setUploadMessage('');
    try {
      const rawFolderId = uploadFolder === '' ? null : Number(uploadFolder);
      const remoteFolderId = rawFolderId && rawFolderId > 0 ? rawFolderId : null;
      const result = await contextService.uploadDocument(file, uploadSubject, '', 'private', { folderId: remoteFolderId });
      if (result?.doc_id && rawFolderId && rawFolderId !== remoteFolderId) {
        await contextService.moveDocumentToFolder(result.doc_id, rawFolderId);
      }
      setUploadMessage(`${file.name} was uploaded and is ready to use.`);
      setUploadSubject('');
      await loadWorkspace();
    } catch (err) {
      setUploadError(err?.message || 'Upload failed. Check the file and try again.');
    } finally {
      setUploading(false);
      setDragging(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const createFolder = async () => {
    const name = newFolder.trim();
    if (!name || folderBusy) return;
    setFolderBusy(true);
    try {
      await contextService.createFolder({
        name,
        parentId: newFolderParent === '' ? null : Number(newFolderParent),
      });
      setNewFolder('');
      setNewFolderParent('');
      await loadWorkspace();
    } catch (err) {
      setError(err?.message || 'Folder could not be created.');
    } finally {
      setFolderBusy(false);
    }
  };

  const renameFolder = async (folder) => {
    const name = window.prompt('Rename folder', folder.name);
    if (!name?.trim() || name.trim() === folder.name) return;
    try {
      await contextService.updateFolder(folder.id, { name: name.trim() });
      await loadWorkspace();
    } catch (err) {
      setError(err?.message || 'Folder could not be renamed.');
    }
  };

  const deleteFolder = async (folder) => {
    if (!window.confirm(`Delete “${folder.name}”? Its documents will become uncategorized.`)) return;
    try {
      await contextService.deleteFolder(folder.id);
      if (String(activeFolder) === String(folder.id)) setActiveFolder('all');
      if (String(uploadFolder) === String(folder.id)) setUploadFolder('');
      if (String(newFolderParent) === String(folder.id)) setNewFolderParent('');
      await loadWorkspace();
    } catch (err) {
      setError(err?.message || 'Folder could not be deleted.');
    }
  };

  const moveDocument = async (id, folderId) => {
    setRowBusy(String(id));
    try {
      const nextFolder = folderId === '' ? null : Number(folderId);
      await contextService.moveDocumentToFolder(id, Number.isFinite(nextFolder) ? nextFolder : null);
      await loadWorkspace();
    } catch (err) {
      setError(err?.message || 'Document could not be moved.');
    } finally {
      setRowBusy('');
    }
  };

  const deleteDocument = async (doc) => {
    const id = docId(doc);
    if (!window.confirm(`Delete “${docName(doc)}”?`)) return;
    setRowBusy(id);
    try {
      await contextService.deleteDocument(id);
      updateDeck(deckIds.filter((item) => item !== id));
      setSelectedIds((current) => current.filter((item) => item !== id));
      await loadWorkspace();
    } catch (err) {
      setError(err?.message || 'Document could not be deleted.');
    } finally {
      setRowBusy('');
    }
  };

  const moveSelected = async () => {
    if (!selectedIds.length) return;
    setRowBusy('bulk');
    try {
      const destination = bulkMoveFolder === '' ? null : Number(bulkMoveFolder);
      await Promise.all(selectedIds.map((id) => contextService.moveDocumentToFolder(id, destination)));
      setSelectedIds([]);
      await loadWorkspace();
    } catch (err) {
      setError(err?.message || 'Selected documents could not be moved.');
    } finally {
      setRowBusy('');
    }
  };

  const deleteSelected = async () => {
    if (!selectedIds.length || !window.confirm(`Delete ${selectedIds.length} selected document${selectedIds.length === 1 ? '' : 's'}?`)) return;
    setRowBusy('bulk');
    try {
      await Promise.all(selectedIds.map((id) => contextService.deleteDocument(id)));
      updateDeck(deckIds.filter((id) => !selectedIds.includes(id)));
      setSelectedIds([]);
      await loadWorkspace();
    } catch (err) {
      setError(err?.message || 'Selected documents could not be deleted.');
    } finally {
      setRowBusy('');
    }
  };

  const switchView = (next) => {
    setView(next);
    if (typeof window !== 'undefined' && window.innerWidth <= 768) setSidebarCollapsed(true);
    setSelectedIds([]);
    setQuery('');
    setActiveFolder('all');
    setPickerOpen(false);
  };

  const renderSourceRow = (doc, curriculum = false) => {
    const id = docId(doc);
    const selected = deckSet.has(id);
    const deckFull = !selected && deckIds.length >= DECK_LIMIT;
    const sourceReady = !doc.status || doc.status === 'ready';
    return (
      <button
        type="button"
        className={`cxh-source-row ${selected ? 'is-selected' : ''}`}
        key={id}
        onClick={() => toggleDeck(id)}
        disabled={deckFull || !sourceReady}
        aria-pressed={selected}
      >
        <span className="cxh-source-toggle">{selected ? <Check size={14} /> : <Plus size={14} />}</span>
        <span className="cxh-source-file"><FileText size={17} /></span>
        <span className="cxh-source-copy">
          <strong>{docName(doc)}</strong>
          <small>
            {curriculum ? 'Curriculum' : (doc.folder_name || 'Your library')}
            {doc.subject ? ` · ${pretty(doc.subject)}` : ''}
            {doc.chunk_count ? ` · ${doc.chunk_count} chunks` : ''}
          </small>
        </span>
        <span className="cxh-source-action">{selected ? 'Remove' : !sourceReady ? (doc.status === 'failed' ? 'Index failed' : 'Indexing') : deckFull ? 'Stack full' : 'Add to stack'}</span>
      </button>
    );
  };

  const renderDesk = () => (
    <div className="cxh-desk">
      <section className="cxh-ledger" aria-labelledby="source-ledger-title">
        <header className="cxh-pane-head">
          <div>
            <p>Browse sources</p>
            <h2 id="source-ledger-title">Find your sources</h2>
          </div>
          <span>{deskSources.length} available</span>
        </header>
        <div className="cxh-ledger-tools">
          <label className="cxh-search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, subjects, or topics" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={13} /></button>}
          </label>
          <div className="cxh-segments" aria-label="Source type">
            {[
              ['all', 'All', userDocs.length + curriculumDocs.length],
              ['mine', 'Mine', userDocs.length],
              ['curriculum', 'Curriculum', curriculumDocs.length],
            ].map(([id, label, count]) => (
              <button key={id} type="button" className={scope === id ? 'active' : ''} onClick={() => setScope(id)} aria-pressed={scope === id}>
                {label}<span>{count}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="cxh-ledger-list">
          {loading ? (
            <div className="cxh-state"><Loader2 className="cxh-spin" /><span>Loading sources</span></div>
          ) : deskSources.length ? (
            deskSources.map((doc) => renderSourceRow(doc, curriculumDocs.some((item) => docId(item) === docId(doc))))
          ) : (
            <div className="cxh-state">
              <Search />
              <strong>No matching sources</strong>
              <span>Clear the search or add a source to your library.</span>
              <button type="button" onClick={() => query ? setQuery('') : switchView('upload')}>{query ? 'Clear search' : 'Add source'}</button>
            </div>
          )}
        </div>
      </section>

      <aside className="cxh-stack" aria-labelledby="working-stack-title">
        <header className="cxh-pane-head">
          <div>
            <p>Working context</p>
            <h2 id="working-stack-title">Your Deck</h2>
          </div>
          <span className="cxh-stack-count">{deckIds.length}/{DECK_LIMIT}</span>
        </header>
        <div className="cxh-slots" aria-label={`${deckIds.length} of ${DECK_LIMIT} sources selected`}>
          {Array.from({ length: DECK_LIMIT }, (_, index) => {
            const doc = deckDocs[index];
            return doc ? (
              <div className="cxh-slot cxh-slot--filled" key={docId(doc)}>
                <FileText size={15} />
                <span title={docName(doc)}>{docName(doc)}</span>
                <button type="button" onClick={() => toggleDeck(docId(doc))} aria-label={`Remove ${docName(doc)}`}><X size={12} /></button>
              </div>
            ) : (
              <button
                type="button"
                className="cxh-slot cxh-slot--empty"
                key={`slot-${index}`}
                onClick={() => { setPickerOpen(true); setPickerQuery(''); }}
                aria-label="Add a source"
              >
                <Plus size={18} />
              </button>
            );
          })}
        </div>

        {pickerOpen && (
          <div className="cxh-slot-picker" role="dialog" aria-label="Add a source to your deck">
            <div className="cxh-slot-picker-head">
              <label className="cxh-search">
                <Search size={15} />
                <input
                  autoFocus
                  value={pickerQuery}
                  onChange={(event) => setPickerQuery(event.target.value)}
                  onKeyDown={(event) => event.key === 'Escape' && setPickerOpen(false)}
                  placeholder="Search your sources"
                />
                {pickerQuery && <button type="button" onClick={() => setPickerQuery('')} aria-label="Clear search"><X size={13} /></button>}
              </label>
              <button type="button" className="cxh-slot-picker-close" onClick={() => setPickerOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="cxh-slot-picker-list">
              {pickerCandidates.length ? pickerCandidates.map((doc) => (
                <button
                  type="button"
                  key={docId(doc)}
                  onClick={() => { toggleDeck(docId(doc)); setPickerOpen(false); }}
                >
                  <FileText size={14} />
                  <span>
                    <strong>{docName(doc)}</strong>
                    <small>{doc.subject ? pretty(doc.subject) : 'General'}{doc.chunk_count ? ` · ${doc.chunk_count} chunks` : ''}</small>
                  </span>
                </button>
              )) : (
                <div className="cxh-state"><Search /><strong>No matching sources</strong><span>Try a different search, or add a new one.</span></div>
              )}
            </div>
          </div>
        )}
        <div className="cxh-stack-summary">
          <span className={deckDocs.length ? 'ready' : ''} />
          <div><strong>{deckDocs.length ? 'Context ready' : 'No active context'}</strong><small>{deckChunks} searchable chunks</small></div>
          {deckDocs.length > 0 && <button type="button" onClick={() => updateDeck([])}>Clear</button>}
        </div>
        <div className="cxh-output-rack">
          <p>Make from this context</p>
          <div>
            {OUTPUTS.map((output) => {
              const Icon = output.icon;
              return (
                <button
                  type="button"
                  key={output.id}
                  disabled={!deckDocs.length || Boolean(actionBusy)}
                  onClick={() => runOutput(output.id)}
                  style={{ '--cxh-output': output.color }}
                  title={output.description}
                >
                  {actionBusy === output.id ? <Loader2 className="cxh-spin" size={16} /> : <Icon size={16} />}
                  <span>{output.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );

  const renderLibrary = () => (
    <div className="cxh-library">
      <aside className="cxh-folder-rail">
        <div className="cxh-folder-create">
          <label htmlFor="cxh-folder-name">New folder</label>
          <div>
            <input id="cxh-folder-name" value={newFolder} maxLength={255} onChange={(event) => setNewFolder(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && createFolder()} placeholder="Folder name" />
            <button type="button" onClick={createFolder} disabled={!newFolder.trim() || folderBusy}>{folderBusy ? <Loader2 className="cxh-spin" /> : <Plus />}</button>
          </div>
          <select aria-label="Parent folder" value={newFolderParent} onChange={(event) => setNewFolderParent(event.target.value)}>
            <option value="">At library root</option>
            {folders.map((folder) => <option key={folder.id} value={folder.id}>Inside {folder.name}</option>)}
          </select>
        </div>
        <nav aria-label="Library folders">
          <button type="button" className={activeFolder === 'all' ? 'active' : ''} onClick={() => setActiveFolder('all')}>
            <Archive size={15} /><span>All documents</span><small>{userDocs.length}</small>
          </button>
          <button type="button" className={activeFolder === 'uncategorized' ? 'active' : ''} onClick={() => setActiveFolder('uncategorized')}>
            <Folder size={15} /><span>Uncategorized</span><small>{folderCounts.uncategorized || 0}</small>
          </button>
          {folders.map((folder) => (
            <div className="cxh-folder-entry" key={folder.id}>
              <button type="button" className={String(activeFolder) === String(folder.id) ? 'active' : ''} onClick={() => setActiveFolder(String(folder.id))}>
                <Folder size={15} style={{ color: folder.color || 'var(--cxh-accent)' }} />
                <span>{folder.name}</span><small>{folderCounts[String(folder.id)] || 0}</small>
              </button>
              <div>
                <button type="button" onClick={() => renameFolder(folder)} aria-label={`Rename ${folder.name}`}><Pencil size={12} /></button>
                <button type="button" onClick={() => deleteFolder(folder)} aria-label={`Delete ${folder.name}`}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <section className="cxh-library-table" aria-labelledby="library-title">
        <header className="cxh-library-head">
          <div><p>My library</p><h2 id="library-title">{activeFolder === 'all' ? 'All documents' : activeFolder === 'uncategorized' ? 'Uncategorized' : folders.find((folder) => String(folder.id) === String(activeFolder))?.name || 'Folder'}</h2></div>
          <div className="cxh-library-tools">
            <button type="button" onClick={() => setSelectedIds(filteredUserDocs.map(docId))} disabled={!filteredUserDocs.length}>Select visible</button>
            <label className="cxh-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search library" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear library search"><X size={13} /></button>}</label>
          </div>
        </header>

        {selectedIds.length > 0 && (
          <div className="cxh-bulk-bar">
            <strong>{selectedIds.length} selected</strong>
            <select aria-label="Move selected documents" value={bulkMoveFolder} onChange={(event) => setBulkMoveFolder(event.target.value)}>
              <option value="">Move to uncategorized</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>Move to {folder.name}</option>)}
            </select>
            <button type="button" onClick={moveSelected} disabled={rowBusy === 'bulk'}><Folder size={13} />Move</button>
            <button type="button" onClick={deleteSelected} disabled={rowBusy === 'bulk'}><Trash2 size={13} />Delete</button>
            <button type="button" onClick={() => setSelectedIds([])} aria-label="Clear selection"><X size={14} /></button>
          </div>
        )}

        <div className="cxh-table-head" aria-hidden>
          <span>Source</span><span>Folder</span><span>Actions</span>
        </div>
        <div className="cxh-table-body">
          {loading ? (
            <div className="cxh-state"><Loader2 className="cxh-spin" /><span>Loading library</span></div>
          ) : filteredUserDocs.length ? filteredUserDocs.map((doc) => {
            const id = docId(doc);
            const selected = selectedIds.includes(id);
            return (
              <article className={`cxh-doc-row ${selected ? 'is-selected' : ''}`} key={id}>
                <button type="button" className="cxh-select" onClick={() => toggleSelected(id)} aria-label={`${selected ? 'Deselect' : 'Select'} ${docName(doc)}`}>
                  {selected ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
                <button type="button" className="cxh-doc-main" onClick={() => navigate(`/contexthub/file/${encodeURIComponent(id)}`)}>
                  <FileText size={18} />
                  <span><strong>{docName(doc)}</strong><small>{pretty(doc.subject)}{doc.chunk_count ? ` · ${doc.chunk_count} chunks` : ''}{doc.file_size ? ` · ${formatBytes(doc.file_size)}` : ''}{progressMap[id]?.mastered_topics != null ? ` · ${Array.isArray(progressMap[id].mastered_topics) ? progressMap[id].mastered_topics.length : Number(progressMap[id].mastered_topics) || 0} mastered` : ''}</small></span>
                  <ChevronRight size={14} />
                </button>
                <select aria-label={`Move ${docName(doc)} to folder`} value={doc.folder_id == null ? '' : String(doc.folder_id)} onChange={(event) => moveDocument(id, event.target.value)} disabled={rowBusy === id}>
                  <option value="">Uncategorized</option>
                  {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                </select>
                <div className="cxh-row-actions">
                  <button type="button" onClick={() => deleteDocument(doc)} aria-label={`Delete ${docName(doc)}`}>{rowBusy === id ? <Loader2 className="cxh-spin" size={14} /> : <Trash2 size={14} />}</button>
                </div>
              </article>
            );
          }) : (
            <div className="cxh-state"><Archive /><strong>No documents here</strong><span>Try another folder or add a source.</span><button type="button" onClick={() => switchView('upload')}>Add source</button></div>
          )}
        </div>
      </section>
    </div>
  );

  const renderUpload = () => (
    <section className="cxh-ingest" aria-labelledby="upload-title">
      <div className="cxh-ingest-copy">
        <p>Add a new source</p>
        <h2 id="upload-title">Drop in the material you actually study from.</h2>
        <span>PDF, DOCX, TXT, or Markdown up to 50 MB. Cerbyl indexes the source so every generated artifact can stay grounded.</span>
        <div className="cxh-file-spec">
          <span><strong>01</strong> Choose a file</span>
          <span><strong>02</strong> Add context</span>
          <span><strong>03</strong> Use it anywhere</span>
        </div>
      </div>
      <div className="cxh-ingest-form">
        <div
          className={`cxh-dropzone ${dragging ? 'is-dragging' : ''} ${uploading ? 'is-busy' : ''}`}
          aria-busy={uploading}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault();
            if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
          }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); handleUpload(event.dataTransfer.files?.[0]); }}
        >
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.md" aria-label="Upload document" onChange={(event) => handleUpload(event.target.files?.[0])} />
          {uploading ? <Loader2 className="cxh-spin" /> : <Upload />}
          <strong>{uploading ? 'Indexing your source…' : dragging ? 'Release to add this source' : 'Drop a document here'}</strong>
          <span>or</span>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>Browse files</button>
        </div>
        <div className="cxh-ingest-fields">
          <label>Subject <input value={uploadSubject} maxLength={100} onChange={(event) => setUploadSubject(event.target.value)} placeholder="Optional, e.g. Biology" /></label>
          <label>Folder
            <select value={uploadFolder} onChange={(event) => setUploadFolder(event.target.value)}>
              <option value="">Uncategorized</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
          </label>
        </div>
        {uploadMessage && <div className="cxh-notice success" role="status" aria-live="polite"><Check size={15} />{uploadMessage}<button type="button" onClick={() => switchView('library')}>Open library</button></div>}
        {uploadError && <div className="cxh-notice error" role="alert"><X size={15} />{uploadError}</div>}
      </div>
    </section>
  );

  const activeNav = NAV_ITEMS.find((item) => item.id === view);

  return (
    <div className="cxh-root with-social-chrome" data-view={view}>
      <SocialHubChrome
          brandKicker="Context Hub"
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          sidebarLead={(
            <button className="cxh-side-add" type="button" onClick={() => switchView('upload')}>
              <Plus size={15} />
              <span>Add source</span>
            </button>
          )}
          collapsedLeadItems={[
            { icon: Plus, label: 'Add source', onClick: () => switchView('upload') },
          ]}
          sideSections={[
            {
              label: 'Workspace',
              items: NAV_ITEMS.map((item) => ({
                icon: item.icon,
                label: item.label,
                active: view === item.id,
                count: item.id === 'desk' ? deckIds.length : item.id === 'library' ? userDocs.length : null,
                onClick: () => switchView(item.id),
              })),
            },
          ]}
          sidebarTail={(
            <section className="cxh-side-block cxh-sidebar-stack">
              <div className="cxh-context-head"><p className="cxh-side-label">Active context</p><strong>{deckIds.length}/{DECK_LIMIT}</strong></div>
              <div className="cxh-sidebar-meter">{Array.from({ length: DECK_LIMIT }, (_, index) => <i key={index} className={index < deckIds.length ? 'filled' : ''} />)}</div>
              <div className="cxh-context-list">
                {deckDocs.length ? deckDocs.slice(0, 3).map((doc) => <span key={docId(doc)} title={docName(doc)}><FileText size={12} />{docName(doc)}</span>) : <p>No sources selected</p>}
                {deckDocs.length > 3 && <small>+{deckDocs.length - 3} more</small>}
              </div>
            </section>
          )}
        >
        <div className="cxh-main">
          <header className="cxh-main-head">
            <div>
              <span>Context Hub / {activeNav?.label}</span>
              <h1>{view === 'desk' ? 'Work with what matters.' : view === 'library' ? 'Your documents, organized.' : 'Add a source.'}</h1>
            </div>
            <div className="cxh-main-meta">
              <span><strong>{userDocs.length}</strong> documents</span>
              <span><strong>{deckChunks}</strong> active chunks</span>
              <button type="button" onClick={loadWorkspace} aria-label="Refresh Context Hub"><RefreshCw size={15} /></button>
            </div>
          </header>

          {error && <div className="cxh-error-banner" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')}><X size={14} /></button></div>}
          <div className="cxh-view-stage" key={view}>
            {view === 'desk' && renderDesk()}
            {view === 'library' && renderLibrary()}
            {view === 'upload' && renderUpload()}
          </div>
        </div>
      </SocialHubChrome>
    </div>
  );
}

export default ContextHubWorkspace;
