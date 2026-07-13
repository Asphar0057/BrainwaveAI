import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactQuill, { Quill } from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import "./NotesRedesign.css";
import "./NotesRedesignSmartFolders.css";
import "./NotesRedesignChatImport.css";
import "./NotesRedesignConvert.css";
import CustomPopup from "./CustomPopup";
import { useTheme } from '../contexts/ThemeContext';
import { signOutAppSession } from '../utils/authSession';
import { 
  Plus, FileText, Upload, Search, Star, Trash2, 
  FolderPlus, Folder, Download, FileDown, Printer, 
  Eye, Edit3, Maximize2, Minimize2, X, 
  ChevronRight, Check, Sparkles, Mic, MicOff, 
  MoreVertical, Archive, RefreshCw, Save, Clock,
  AlignLeft, Bold, Italic, Underline, 
  List, ListOrdered, Link2, Image, Code,
  ChevronLeft, Layout, Filter, Palette, Command, Zap
} from 'lucide-react';
import { API_URL } from '../config';
import { sanitizeHtml, escapeHtml } from '../utils/sanitize';
import {
  applyInlineFontSize,
  clearInlineFontFamilies,
  clearInlineTextColors,
  getRangeBlockFormat,
  getRangeFontSize
} from '../utils/editorFormatting';
import gamificationService from '../services/gamificationService';
import noteAgentService from '../services/noteAgentService';
import ImportExportModal from '../components/ImportExportModal';
import ContextSelector from '../components/ContextSelector';
import ContextPanel from '../components/ContextPanel';
import contextService from '../services/contextService';
import { queueLegacyAIFileEndpoint, USE_AI_JOB_QUEUE } from '../services/aiJobService';

import SimpleBlockEditor from '../components/SimpleBlockEditor';
import AdvancedSearch from '../components/AdvancedSearch';
import Templates from '../components/Templates';
import RecentlyViewed from '../components/RecentlyViewed';
import PageProperties from '../components/PageProperties';
import CanvasMode from '../components/CanvasMode';
import SmartFolders from '../components/SmartFolders';
import KeyboardShortcuts from '../components/KeyboardShortcuts';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

const asText = (value) => (value === null || value === undefined ? '' : String(value));
const NOTE_FONT_SIZES = [
  { label: 'Small', value: '12px' },
  { label: 'Normal', value: '16px' },
  { label: 'Large', value: '24px' },
  { label: 'Huge', value: '32px' }
];
const DEFAULT_NOTE_FONT_SIZE = '16px';
const NOTE_FONT_SIZE_VALUES = NOTE_FONT_SIZES.map((size) => size.value);
const rangesHaveSameCaret = (firstRange, secondRange) => Boolean(
  firstRange &&
  secondRange &&
  firstRange.collapsed &&
  secondRange.collapsed &&
  firstRange.startContainer === secondRange.startContainer &&
  firstRange.startOffset === secondRange.startOffset
);
const noteFolderIds = (note) => {
  const ids = Array.isArray(note?.folder_ids) ? note.folder_ids : [];
  if (note?.folder_id !== null && note?.folder_id !== undefined && !ids.includes(note.folder_id)) {
    return [...ids, note.folder_id];
  }
  return ids;
};
const noteIsInFolder = (note, folderId) => noteFolderIds(note).includes(folderId);

const formatDateTime = (value) => {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toLocaleString() : '';
};

const encodeBlockPayload = (value) => {
  if (!value) return '';
  try {
    return btoa(unescape(encodeURIComponent(value)));
  } catch (e) {
    return '';
  }
};

const decodeBlockPayload = (value) => {
  if (!value) return '';
  try {
    return decodeURIComponent(escape(atob(value)));
  } catch (e) {
    return '';
  }
};

const htmlToBlocks = (html) => {
  if (!html || html.trim() === '') {
    return [{
      id: Date.now(),
      type: 'paragraph',
      content: '',
      properties: {}
    }];
  }
  
  const blocks = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  
  const processNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        blocks.push({
          id: Date.now() + Math.random(),
          type: 'paragraph',
          content: text,
          properties: {}
        });
      }
      return;
    }
    
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();
      const dataBlockType = node.getAttribute('data-block-type');
      if (dataBlockType === 'canvas') {
        const canvasData = decodeBlockPayload(node.getAttribute('data-canvas') || '');
        const canvasPreview = decodeBlockPayload(node.getAttribute('data-thumb') || '');
        blocks.push({
          id: Date.now() + Math.random(),
          type: 'canvas',
          content: '',
          properties: {
            canvasData,
            canvasPreview
          }
        });
        return;
      }
      const content = node.innerHTML || node.textContent || '';
      const textContent = node.textContent.trim();
      
      if (!textContent) return;
      
      switch (tagName) {
        case 'h1':
          blocks.push({
            id: Date.now() + Math.random(),
            type: 'heading1',
            content: textContent,
            properties: {}
          });
          break;
        case 'h2':
          blocks.push({
            id: Date.now() + Math.random(),
            type: 'heading2',
            content: textContent,
            properties: {}
          });
          break;
        case 'h3':
          blocks.push({
            id: Date.now() + Math.random(),
            type: 'heading3',
            content: textContent,
            properties: {}
          });
          break;
        case 'ul':
          
          Array.from(node.querySelectorAll('li')).forEach(li => {
            blocks.push({
              id: Date.now() + Math.random(),
              type: 'bulletList',
              content: li.textContent.trim(),
              properties: {}
            });
          });
          break;
        case 'ol':
          
          Array.from(node.querySelectorAll('li')).forEach(li => {
            blocks.push({
              id: Date.now() + Math.random(),
              type: 'numberedList',
              content: li.textContent.trim(),
              properties: {}
            });
          });
          break;
        case 'blockquote':
          blocks.push({
            id: Date.now() + Math.random(),
            type: 'quote',
            content: textContent,
            properties: {}
          });
          break;
        case 'pre':
        case 'code':
          blocks.push({
            id: Date.now() + Math.random(),
            type: 'code',
            content: textContent,
            properties: {}
          });
          break;
        case 'hr':
          blocks.push({
            id: Date.now() + Math.random(),
            type: 'divider',
            content: '',
            properties: {}
          });
          break;
        case 'p':
          if (textContent) {
            blocks.push({
              id: Date.now() + Math.random(),
              type: 'paragraph',
              content: content,
              properties: {}
            });
          }
          break;
        case 'div':
        case 'section':
        case 'article':
          
          Array.from(node.childNodes).forEach(processNode);
          break;
        default:
          
          if (textContent && !['ul', 'ol', 'li'].includes(tagName)) {
            blocks.push({
              id: Date.now() + Math.random(),
              type: 'paragraph',
              content: content,
              properties: {}
            });
          }
      }
    }
  };
  
  
  Array.from(doc.body.childNodes).forEach(processNode);
  
  
  if (blocks.length === 0) {
    blocks.push({
      id: Date.now(),
      type: 'paragraph',
      content: html.replace(/<[^>]*>/g, ''),
      properties: {}
    });
  }
  
  return blocks;
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
      case 'canvas':
        return `<div class="canvas-block" data-block-type="canvas" data-canvas="${encodeBlockPayload(block.properties?.canvasData || '')}" data-thumb="${encodeBlockPayload(block.properties?.canvasPreview || '')}"></div>`;
      default:
        return `<p>${content}</p>`;
    }
  }).join('\n');
};

const MAX_DIFF_TOKENS = 600;

const normalizeAiText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
};

const isAgentSuccess = (result) => result?.success !== false;

const tokenizeForDiff = (text) => {
  if (!text) return [];
  return String(text).split(/(\s+)/).filter(Boolean);
};

const buildDiffTokens = (beforeText, afterText) => {
  const beforeTokens = tokenizeForDiff(beforeText);
  const afterTokens = tokenizeForDiff(afterText);

  if (beforeTokens.length + afterTokens.length > MAX_DIFF_TOKENS) return null;

  const rows = beforeTokens.length + 1;
  const cols = afterTokens.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = beforeTokens.length - 1; i >= 0; i -= 1) {
    for (let j = afterTokens.length - 1; j >= 0; j -= 1) {
      if (beforeTokens[i] === afterTokens[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const diff = [];
  let i = 0;
  let j = 0;

  while (i < beforeTokens.length && j < afterTokens.length) {
    if (beforeTokens[i] === afterTokens[j]) {
      diff.push({ type: 'equal', value: beforeTokens[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      diff.push({ type: 'remove', value: beforeTokens[i] });
      i += 1;
    } else {
      diff.push({ type: 'add', value: afterTokens[j] });
      j += 1;
    }
  }

  while (i < beforeTokens.length) {
    diff.push({ type: 'remove', value: beforeTokens[i] });
    i += 1;
  }

  while (j < afterTokens.length) {
    diff.push({ type: 'add', value: afterTokens[j] });
    j += 1;
  }

  return diff;
};

const renderDiffHtml = (diffTokens, mode) => {
  if (!diffTokens) return '';

  return diffTokens.map(({ type, value }) => {
    const safe = escapeHtml(value);
    if (type === 'equal') return safe;
    if (type === 'remove') return mode === 'before' ? `<span class="diff-removed">${safe}</span>` : '';
    if (type === 'add') return mode === 'after' ? `<span class="diff-added">${safe}</span>` : '';
    return safe;
  }).join('');
};

const QuickSwitcher = null;
const FormattingToolbar = ({ onAIAssist, showAI, onInsertBlock }) => null;
const SlashMenu = ({ isOpen, position, onSelect, onClose }) => null;
const BacklinksPanel = ({ backlinks, onNoteClick }) => null;

const useQuickSwitcher = (notes, folders, selectNote) => ({ QuickSwitcherComponent: null });
const useBacklinks = (selectedNote, notes) => [];
const useSlashCommands = (quillRef) => ({ 
  showSlashMenu: false, 
  slashMenuPosition: {}, 
  setShowSlashMenu: () => {}, 
  insertBlock: () => {} 
});

const parsePageLinks = (content) => [];

const buildSaveSnapshot = (noteId, title, content, canvasData) => JSON.stringify([
  String(noteId ?? ''),
  title || '',
  content || '',
  canvasData || '',
]);

let QuillTableUI;
try {
  QuillTableUI = require('quill-table-ui');
  if (QuillTableUI && QuillTableUI.default) {
    Quill.register('modules/tableUI', QuillTableUI.default);
  }
} catch (error) { /* silenced */ }

let katex;
try {
  katex = require('katex');
  if (katex) {
    window.katex = katex;
  }
} catch (error) { /* silenced */ }

const NotesRedesign = ({ sharedMode = false }) => {
  const { noteId } = useParams();
  const navigate = useNavigate();
  
  
  const [sharedNoteData, setSharedNoteData] = useState(null);
  const [isSharedContent, setIsSharedContent] = useState(sharedMode);
  const [canEdit, setCanEdit] = useState(false);

  
  const [userName, setUserName] = useState("");
  const [userProfile, setUserProfile] = useState(null);

  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [hsMode, setHsMode] = useState(() => localStorage.getItem('hs_mode_enabled') === 'true');
  const [userDocCount, setUserDocCount] = useState(0);
  
  
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [canvasData, setCanvasData] = useState("");
  const [canvasBlockId, setCanvasBlockId] = useState(null);
  const [pendingFocusBlockId, setPendingFocusBlockId] = useState(null);
  const [typingTextColor, setTypingTextColor] = useState(null);
  const [typingFontSize, setTypingFontSize] = useState(DEFAULT_NOTE_FONT_SIZE);
  const [editorBlockFormat, setEditorBlockFormat] = useState('p');
  const [colorPickerValue, setColorPickerValue] = useState("#000000");
  const [searchTerm, setSearchTerm] = useState("");
  const savedSelectionRef = useRef(null);
  const pendingTypingFontSizeRef = useRef(null);
  
  
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const titleSectionCollapsed = false;
  const [viewMode, setViewMode] = useState("edit");
  
  
  const [showAIDropdown, setShowAIDropdown] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiDropdownPosition, setAiDropdownPosition] = useState({ top: 0, left: 0 });
  const [generatingAI, setGeneratingAI] = useState(false);
  const [showAIButton, setShowAIButton] = useState(false);
  const [aiButtonPosition, setAiButtonPosition] = useState({ top: 0, left: 0 });
  const [selectedRange, setSelectedRange] = useState(null);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [aiAssistAction, setAiAssistAction] = useState("improve");
  const [aiAssistTone, setAiAssistTone] = useState("professional");
  const [selectedText, setSelectedText] = useState("");

  
  const [aiSuggestion, setAiSuggestion] = useState(null); 
  const [showAISuggestionModal, setShowAISuggestionModal] = useState(false);

  
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("#D7B38C");
  
  
  const [showTrash, setShowTrash] = useState(false);
  const [trashedNotes, setTrashedNotes] = useState([]);
  
  
  const [showFavorites, setShowFavorites] = useState(false);
  const [customFont, setCustomFont] = useState("Inter");
  const [draggedNote, setDraggedNote] = useState(null);
  const [dragOverFolder, setDragOverFolder] = useState(null);

  
  const FONTS = [
    { label: 'Inter', family: "'Inter', sans-serif" },
    { label: 'Arial', family: "Arial, Helvetica, sans-serif" },
    { label: 'Georgia', family: "Georgia, 'Times New Roman', serif" },
    { label: 'Times New Roman', family: "'Times New Roman', Times, serif" },
    { label: 'Courier New', family: "'Courier New', Courier, monospace" },
    { label: 'Monaco', family: "Monaco, Consolas, 'Courier New', monospace" },
    { label: 'Roboto', family: "'Roboto', Arial, sans-serif" },
    { label: 'Open Sans', family: "'Open Sans', Arial, sans-serif" },
    { label: 'Lato', family: "'Lato', Arial, sans-serif" },
    { label: 'Montserrat', family: "'Montserrat', Arial, sans-serif" }
  ];
  
  
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  
  
  const [noteBlocks, setNoteBlocks] = useState([{
    id: Date.now(),
    type: 'paragraph',
    content: '',
    properties: {}
  }]);
  const [showAIFloatingButton, setShowAIFloatingButton] = useState(false);
  const [aiFloatingPosition, setAiFloatingPosition] = useState({ top: 0, left: 0 });
  const [selectedTextContent, setSelectedTextContent] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  
  
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [showRecentlyViewed, setShowRecentlyViewed] = useState(false);
  const [pageProperties, setPageProperties] = useState([
    { id: '1', name: 'Created', type: 'date', value: new Date().toISOString().split('T')[0] },
    { id: '2', name: 'Status', type: 'text', value: 'Draft' },
  ]);
  const [showPageProperties, setShowPageProperties] = useState(false);
  const [editorDarkMode, setEditorDarkMode] = useState(false);
  
  
  const [showCanvasMode, setShowCanvasMode] = useState(false);
  const [showSmartFolders, setShowSmartFolders] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  
  const [showChatImport, setShowChatImport] = useState(false);
  const [chatSessions, setChatSessions] = useState([]);
  const [selectedSessions, setSelectedSessions] = useState([]);
  const [showNavigateDialog, setShowNavigateDialog] = useState(false);
  const [newNoteId, setNewNoteId] = useState(null);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [importMode, setImportMode] = useState("summary");
  const [importing, setImporting] = useState(false);
  
  
  const [showImportExport, setShowImportExport] = useState(false);
  
  
  useEffect(() => {
          }, [showChatImport, chatSessions]);

  
  const [isRecording, setIsRecording] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [processingVoice, setProcessingVoice] = useState(false);
  
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const quillRef = useRef(null);
  const saveTimeout = useRef(null);
  const notesRef = useRef([]);
  const lastSavedSnapshotRef = useRef('');
  const aiInputRef = useRef(null);

  
  const [popup, setPopup] = useState({ isOpen: false, title: "", message: "" });
  const showPopup = (title, message) => setPopup({ isOpen: true, title, message });
  const closePopup = () => setPopup({ isOpen: false, title: "", message: "" });
  
  const { selectedTheme } = useTheme();

  const diffView = useMemo(() => {
    if (!aiSuggestion) {
      return { hasInlineDiff: false, beforeHtml: '', afterHtml: '', original: '', suggested: '' };
    }

    const original = normalizeAiText(aiSuggestion.original);
    const suggested = normalizeAiText(aiSuggestion.suggested);

    if (aiSuggestion.action === 'explain' || aiSuggestion.action === 'explain_only') {
      return { hasInlineDiff: false, beforeHtml: '', afterHtml: '', original, suggested };
    }

    const diffTokens = buildDiffTokens(original, suggested);
    if (!diffTokens || diffTokens.length === 0) {
      return { hasInlineDiff: false, beforeHtml: '', afterHtml: '', original, suggested };
    }

    return {
      hasInlineDiff: true,
      beforeHtml: renderDiffHtml(diffTokens, 'before'),
      afterHtml: renderDiffHtml(diffTokens, 'after'),
      original,
      suggested
    };
  }, [aiSuggestion]);
  
  
  useEffect(() => {
          }, [selectedTheme]);

  useEffect(() => {
    if (selectedTheme && selectedTheme.tokens) {
      const root = document.documentElement;
      
      Object.entries(selectedTheme.tokens).forEach(([key, value]) => {
        root.style.setProperty(`--${key}`, value);
      });
      
          }
  }, [selectedTheme]);

  useEffect(() => {
    if (!pendingFocusBlockId) return;
    const timer = setTimeout(() => setPendingFocusBlockId(null), 300);
    return () => clearTimeout(timer);
  }, [pendingFocusBlockId]);

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
    if (typeof Quill !== 'undefined') {
      try {
        const Font = Quill.import('formats/font');
        Font.whitelist = [
          'inter',
          'arial', 
          'times-new-roman',
          'georgia',
          'courier',
          'verdana',
          'helvetica',
          'comic-sans',
          'impact',
          'trebuchet',
          'palatino',
          'garamond',
          'bookman',
          'avant-garde',
          'roboto',
          'open-sans',
          'lato',
          'montserrat',
          'source-sans',
          'merriweather',
          'playfair',
          'eb-garamond'
        ];
        Quill.register(Font, true);
      } catch (error) { /* silenced */ }
    }
  }, []);

  
  const loadSharedNote = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/shared/note/${noteId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSharedNoteData(data);
        setIsSharedContent(true);
        setCanEdit(data.permission === 'edit' || data.is_owner);
        
        
        const normalizedContent = normalizeNoteContent(data.content || '');
        const sharedBlocks = htmlToBlocks(normalizedContent);
        lastSavedSnapshotRef.current = buildSaveSnapshot(
          data.content_id,
          data.title || 'Untitled Note',
          normalizedContent,
          data.canvas_data || ''
        );
        setSaveError(false);

        setSelectedNote({
          id: data.content_id,
          title: data.title || 'Untitled Note',
          content: normalizedContent,
          updated_at: data.updated_at
        });
        setNoteTitle(data.title || 'Untitled Note');
        setNoteContent(normalizedContent);
        setCanvasData(data.canvas_data || "");
        setCanvasBlockId(null);
        setPendingFocusBlockId(null);
        setNoteBlocks(sharedBlocks);
      } else {
        throw new Error('Failed to load shared note');
      }
    } catch (error) {
            showPopup("Error", "Failed to load shared note");
      navigate('/social');
    }
  };

  
  useEffect(() => {
    const token = localStorage.getItem("token");
    const username = localStorage.getItem("username");
    const profile = localStorage.getItem("userProfile");
    const savedFont = localStorage.getItem("preferredFont");

    if (!token) {
      navigate("/login");
      return;
    }
    
    if (savedFont) {
      const savedFontOption = FONTS.find(
        (font) => font.family === savedFont || font.label === savedFont
      );
      if (savedFontOption) setCustomFont(savedFontOption.label);
    }
    
    if (sharedMode && noteId) {
      loadSharedNote();
    } else {
      if (username) setUserName(username);
      if (profile) {
        try {
          setUserProfile(JSON.parse(profile));
        } catch (error) { /* silenced */ }
      }
    }
  }, [navigate, sharedMode, noteId]);

  
  useEffect(() => {
    if (userName && !isSharedContent) {
      loadNotes();
      loadFolders();
      loadChatSessions();
      
      
      const stored = localStorage.getItem(`recentlyViewed_${userName}`);
      if (stored) {
        try {
          setRecentlyViewed(JSON.parse(stored));
        } catch (e) { /* silenced */ }
      }
    }
  }, [userName, isSharedContent]);

  const loadNotes = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/get_notes?user_id=${userName}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const activeNotes = (Array.isArray(data) ? data : []).filter(n => !n.is_deleted);
        setNotes(activeNotes);
        
        
        if (noteId && !sharedMode) {
          const specificNote = activeNotes.find(n => n.id === parseInt(noteId));
          if (specificNote) {
            selectNote(specificNote);
          } else if (activeNotes.length > 0) {
            selectNote(activeNotes[0]);
          }
        } else if (activeNotes.length > 0 && !selectedNote) {
          selectNote(activeNotes[0]);
        }
      } else {
        throw new Error(`Failed to load notes: ${res.status}`);
      }
    } catch (e) {
            showPopup("Error", "Failed to load notes");
    }
  };

  const [quillReady, setQuillReady] = useState(false);

  useEffect(() => {
    const checkEditorReady = setInterval(() => {
      const q = quillRef.current?.getEditor?.();
      if (q) {
        setQuillReady(true);
        clearInterval(checkEditorReady);
      }
    }, 200);
    return () => clearInterval(checkEditorReady);
  }, []);

  const handleTextSelection = useCallback(() => {
    if (!canEdit && isSharedContent) return;
    
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    const selection = quill.getSelection();
    if (selection && selection.length > 0) {
      const text = quill.getText(selection.index, selection.length).trim();

      if (text.length > 3) {
        setSelectedText(text);
        setSelectedRange(selection);

        const bounds = quill.getBounds(selection.index, selection.length);
        const rect = quill.container.getBoundingClientRect();

        const top = rect.top + bounds.bottom + window.scrollY + 8;
        const left = rect.left + bounds.left + bounds.width / 2 + window.scrollX;

        setAiButtonPosition({ top, left });
        setShowAIButton(true);
        return;
      }
    }

    setShowAIButton(false);
    setSelectedText("");
    setSelectedRange(null);
  }, [canEdit, isSharedContent]);

  useEffect(() => {
    if (!quillReady || (isSharedContent && !canEdit)) return;

    const quill = quillRef.current?.getEditor();
    if (!quill || !quill.root) return;

    let debounceTimer = null;

    const onSelectionChange = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => handleTextSelection(), 150);
    };

    quill.root.addEventListener("mouseup", onSelectionChange);
    quill.root.addEventListener("keyup", onSelectionChange);
    document.addEventListener("selectionchange", onSelectionChange);

    const onHide = (e) => {
      if (
        showAIButton &&
        !e.target.closest(".ai-floating-button") &&
        !e.target.closest(".ql-editor")
      ) {
        setShowAIButton(false);
      }
    };

    const onScroll = () => setShowAIButton(false);

    document.addEventListener("mousedown", onHide);
    document.addEventListener("scroll", onScroll);

    return () => {
      clearTimeout(debounceTimer);
      if (quill.root) {
        quill.root.removeEventListener("mouseup", onSelectionChange);
        quill.root.removeEventListener("keyup", onSelectionChange);
      }
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("mousedown", onHide);
      document.removeEventListener("scroll", onScroll);
    };
  }, [handleTextSelection, showAIButton, quillReady, canEdit, isSharedContent]);

  const handleAIButtonClick = () => {
    if (isSharedContent && !canEdit) return;
    setShowAIAssistant(true);
    setShowAIButton(false);
  };

  const processSelectedText = async (action) => {
    if (!selectedText || !selectedText.trim() || (isSharedContent && !canEdit)) {
      showPopup("No Text Selected", "Please select text first");
      return;
    }

    setGeneratingAI(true);

    try {
      
      const result = await noteAgentService.invoke(action, {
        userId: userName,
        content: selectedText,
        tone: aiAssistTone,
        context: noteContent
      });

      if (!isAgentSuccess(result)) throw new Error("AI processing failed");

      const resultContent = normalizeAiText(result.content || result.response);
      const formatted = formatAiOutput(resultContent);

      
      setAiSuggestion({
        original: normalizeAiText(selectedText),
        suggested: formatted.text,
        suggestedHtml: formatted.html,
        suggestedBlocks: formatted.blocks,
        useBlocks: formatted.useBlocks,
        range: selectedRange,
        action: action
      });
      setShowAISuggestionModal(true);
      setShowAIAssistant(false);
      
    } catch (error) {
      console.error("AI processing error:", error);
      showPopup("Error", "Failed to process text");
    } finally {
      setGeneratingAI(false);
    }
  };

  
  const applyAISuggestion = () => {
    if (!aiSuggestion) return;

    
    if (aiSuggestion.isBlockEditor) {
      let updatedBlocks;
      const blockIndex = noteBlocks.findIndex(b => String(b.id) === String(aiSuggestion.blockId));
      const hasStructuredBlocks = aiSuggestion.useBlocks && Array.isArray(aiSuggestion.suggestedBlocks) && aiSuggestion.suggestedBlocks.length > 0;
      const suggestedHtml = aiSuggestion.suggestedHtml || aiSuggestion.suggested || '';
      const insertActions = new Set(['generate', 'key_points', 'outline']);
      
      if (hasStructuredBlocks) {
        const blocksToInsert = aiSuggestion.suggestedBlocks.map((block) => ({
          ...block,
          id: block.id || Date.now() + Math.random()
        }));

        if (insertActions.has(aiSuggestion.action)) {
          const insertIndex = blockIndex !== -1 ? blockIndex + 1 : noteBlocks.length;
          updatedBlocks = [
            ...noteBlocks.slice(0, insertIndex),
            ...blocksToInsert,
            ...noteBlocks.slice(insertIndex)
          ];
        } else if (blockIndex !== -1) {
          updatedBlocks = [
            ...noteBlocks.slice(0, blockIndex),
            ...blocksToInsert,
            ...noteBlocks.slice(blockIndex + 1)
          ];
        } else {
          updatedBlocks = [...noteBlocks, ...blocksToInsert];
        }
      } else if (blockIndex !== -1 && aiSuggestion.blockId) {
        if (aiSuggestion.action === 'continue') {
          updatedBlocks = noteBlocks.map((block, idx) => {
            if (idx === blockIndex) {
              return {
                ...block,
                content: `${block.content || ''} ${suggestedHtml}`.trim()
              };
            }
            return block;
          });
        } else if (aiSuggestion.action === 'generate') {
          const newBlock = {
            id: Date.now() + Math.random(),
            type: 'paragraph',
            content: suggestedHtml,
            properties: {}
          };
          updatedBlocks = [
            ...noteBlocks.slice(0, blockIndex + 1),
            newBlock,
            ...noteBlocks.slice(blockIndex + 1)
          ];
        } else {
          updatedBlocks = noteBlocks.map((block, idx) => {
            if (idx === blockIndex) {
              return {
                ...block,
                content: suggestedHtml
              };
            }
            return block;
          });
        }
      } else {
        const newBlock = {
          id: Date.now() + Math.random(),
          type: 'paragraph',
          content: suggestedHtml,
          properties: {}
        };
        updatedBlocks = [...noteBlocks, newBlock];
      }
      
      
      setNoteBlocks(updatedBlocks);
      
      
      setTimeout(() => {
        handleBlocksChange(updatedBlocks);
      }, 100);
    } else {
      
      const quill = quillRef.current?.getEditor();
      if (quill && aiSuggestion.range) {
        quill.deleteText(aiSuggestion.range.index, aiSuggestion.range.length);
        quill.insertText(aiSuggestion.range.index, aiSuggestion.suggested);
        quill.setSelection(aiSuggestion.range.index + aiSuggestion.suggested.length);
        setNoteContent(quill.root.innerHTML);
      }
    }

    showPopup("Applied", "AI suggestion applied successfully");
    setAiSuggestion(null);
    setShowAISuggestionModal(false);
    setSelectedText("");
    setSelectedRange(null);
    setSelectedBlockId(null);
  };

  
  const rejectAISuggestion = () => {
    setAiSuggestion(null);
    setShowAISuggestionModal(false);
    setSelectedText("");
    setSelectedRange(null);
    setSelectedBlockId(null);
  };

  
  const explainTextOnly = async () => {
    if (!selectedText || !selectedText.trim()) {
      showPopup("No Text Selected", "Please select text first");
      return;
    }

    setGeneratingAI(true);

    try {
      const result = await noteAgentService.invoke('explain', {
        userId: userName,
        content: selectedText,
        context: noteContent
      });

      if (!isAgentSuccess(result)) throw new Error("AI explanation failed");

      const explanation = normalizeAiText(result.content || result.response);
      const formatted = formatAiOutput(explanation);
      
      
      setAiSuggestion({
        original: normalizeAiText(selectedText),
        suggested: formatted.text,
        suggestedHtml: formatted.html,
        suggestedBlocks: formatted.blocks,
        useBlocks: formatted.useBlocks,
        range: null, 
        action: 'explain'
      });
      setShowAISuggestionModal(true);
      setShowAIAssistant(false);
      
    } catch (error) {
      console.error("AI explanation error:", error);
      showPopup("Error", "Failed to explain text");
    } finally {
      setGeneratingAI(false);
    }
  };

  const quickTextAction = async (actionType) => {
    if (isSharedContent && !canEdit) return;
    
    setGeneratingAI(true);

    try {
      
      const actionMap = {
        'explain': 'explain',
        'key_points': 'key_points',
        'guide': 'generate',
        'summary': 'summarize',
        'general': 'generate'
      };
      
      const agentAction = actionMap[actionType] || 'generate';
      
      
      const result = await noteAgentService.invoke(agentAction, {
        userId: userName,
        content: selectedText,
        topic: selectedText,
        context: noteContent
      });

      if (!isAgentSuccess(result)) throw new Error("AI generation failed");

      const resultContent = normalizeAiText(result.content || result.response);
      const formatted = formatAiOutput(resultContent);

      setAiSuggestion({
        original: normalizeAiText(selectedText || ''),
        suggested: formatted.text,
        suggestedHtml: formatted.html,
        suggestedBlocks: formatted.blocks,
        useBlocks: formatted.useBlocks,
        range: selectedRange,
        action: agentAction,
        blockId: selectedBlockId,
        isBlockEditor: true
      });
      setShowAISuggestionModal(true);
      setShowAIAssistant(false);
    } catch (error) {
            showPopup("Error", "Failed to generate content");
    } finally {
      setGeneratingAI(false);
      setSelectedText("");
      setSelectedRange(null);
    }
  };

  const loadFolders = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/get_folders?user_id=${userName}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFolders(data.folders || []);
      }
    } catch (e) { /* silenced */ }
  };

  const loadTrash = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/get_trash?user_id=${userName}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTrashedNotes(data.trash || []);
      }
    } catch (e) { /* silenced */ }
  };

  const loadChatSessions = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/get_chat_sessions?user_id=${encodeURIComponent(userName)}&limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setChatSessions(data.sessions || []);
      }
    } catch (e) { /* silenced */ }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) {
      showPopup("Error", "Folder name cannot be empty");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/create_folder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: userName,
          name: newFolderName,
          color: newFolderColor,
        }),
      });

      if (res.ok) {
        const folder = await res.json();
        setFolders(prev => [...prev, folder]);
        setNewFolderName("");
        setNewFolderColor("#D7B38C");
        setShowFolderModal(false);
        
        setSelectedFolder(folder.id);
        setShowFavorites(false);
        setShowTrash(false);
        
        showPopup("Success", "Folder created successfully");
      } else {
        throw new Error(`Failed to create folder: ${res.status}`);
      }
    } catch (e) {
            showPopup("Error", "Failed to create folder");
    }
  };

  const createNoteInFolder = async (folderId) => {
    if (isSharedContent) return;
    
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/create_note`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: userName,
          title: "Untitled Note",
          content: "",
          folder_id: folderId,
        }),
      });
      
      if (res.ok) {
        const newNote = await res.json();
        setNotes(prev => [newNote, ...prev]);
        selectNote(newNote);
        await loadFolders();

        setTimeout(() => {
          const quill = quillRef.current?.getEditor();
          if (quill) {
            quill.focus();
            quill.setSelection(0, 0);
          }
        }, 150);

        showPopup("Created", "New note created in folder");
      } else {
        throw new Error(`Failed to create note: ${res.status}`);
      }
    } catch (error) {
            showPopup("Error", "Failed to create note");
    }
  };

  const deleteFolder = async (folderId) => {
    if (!window.confirm("Delete this folder? Notes will be moved to root.")) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/delete_folder/${folderId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setFolders(prev => prev.filter(f => f.id !== folderId));
        await loadNotes();
        await loadFolders();
        showPopup("Success", "Folder deleted");
      } else {
        throw new Error(`Failed to delete folder: ${res.status}`);
      }
    } catch (e) {
            showPopup("Error", "Failed to delete folder");
    }
  };

  const moveNoteToFolder = async (noteId, folderId) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/move_note_to_folder`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ note_id: noteId, folder_id: folderId }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setNotes(prev => prev.map(n => n.id === noteId ? {
          ...n,
          folder_id: data.folder_id ?? n.folder_id ?? folderId,
          folder_ids: data.folder_ids || [...new Set([...noteFolderIds(n), folderId].filter(Boolean))]
        } : n));
        
        if (selectedNote?.id === noteId) {
          setSelectedNote(prev => ({
            ...prev,
            folder_id: data.folder_id ?? prev.folder_id ?? folderId,
            folder_ids: data.folder_ids || [...new Set([...noteFolderIds(prev), folderId].filter(Boolean))]
          }));
        }
        
        await loadFolders();
        
        showPopup("Success", "Note moved to folder");
      } else {
        throw new Error(`Failed to move note: ${res.status}`);
      }
    } catch (e) {
            showPopup("Error", "Failed to move note");
    }
  };

  const handleDragStart = (e, note) => {
    if (isSharedContent) return;
    
    e.dataTransfer.effectAllowed = 'move';
    setDraggedNote(note);
    e.target.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    if (e.target) {
      e.target.style.opacity = '1';
    }
    setDraggedNote(null);
    setDragOverFolder(null);
  };

  const handleDragOver = (e, folderId) => {
    if (isSharedContent) return;
    
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolder(folderId);
  };

  const handleDragLeave = (e) => {
    setDragOverFolder(null);
  };

  const handleDrop = async (e, folderId) => {
    if (isSharedContent) return;
    
    e.preventDefault();
    setDragOverFolder(null);
    
    if (draggedNote) {
      await moveNoteToFolder(draggedNote.id, folderId);
      setDraggedNote(null);
    }
  };

  const toggleFavorite = async (noteId) => {
    if (isSharedContent) return;
    
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const newFavoriteStatus = !note.is_favorite;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/toggle_favorite`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ note_id: noteId, is_favorite: newFavoriteStatus }),
      });

      if (res.ok) {
        setNotes(prev => prev.map(n => n.id === noteId ? { ...n, is_favorite: newFavoriteStatus } : n));
        if (selectedNote?.id === noteId) {
          setSelectedNote(prev => ({ ...prev, is_favorite: newFavoriteStatus }));
        }
        showPopup("Success", newFavoriteStatus ? "Added to favorites" : "Removed from favorites");
      } else {
        throw new Error(`Failed to update favorite: ${res.status}`);
      }
    } catch (e) {
      showPopup("Error", "Failed to update favorite");
  }
  };

  const moveToTrash = async (noteId) => {
    if (isSharedContent) return;
    
    try {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
        saveTimeout.current = null;
      }
      
      if (selectedNote?.id === noteId) {
        setSelectedNote(null);
        setNoteTitle("");
        setNoteContent("");
      }
      
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/soft_delete_note/${noteId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setNotes(prev => prev.filter(n => n.id !== noteId));
        
        const remaining = notes.filter(n => n.id !== noteId && !n.is_deleted);
        if (remaining.length > 0) {
          setTimeout(() => selectNote(remaining[0]), 100);
        }
        
        await loadFolders();
        
        showPopup("Moved to Trash", "Note moved to trash (recoverable for 30 days)");
      } else {
        throw new Error(`Failed to move to trash: ${res.status}`);
      }
    } catch (e) {
            showPopup("Error", "Failed to move note to trash");
    }
  };

  const restoreNote = async (noteId) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/restore_note/${noteId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        await loadNotes();
        await loadTrash();
        await loadFolders();
        showPopup("Restored", "Note restored successfully");
      } else {
        throw new Error(`Failed to restore note: ${res.status}`);
      }
    } catch (e) {
            showPopup("Error", "Failed to restore note");
    }
  };

  const permanentDelete = async (noteId) => {
    if (!window.confirm("Permanently delete this note? This cannot be undone!")) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/permanent_delete_note/${noteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setTrashedNotes(prev => prev.filter(n => n.id !== noteId));
        showPopup("Deleted", "Note permanently deleted");
      } else {
        throw new Error(`Failed to delete note: ${res.status}`);
      }
    } catch (e) {
            showPopup("Error", "Failed to delete note");
    }
  };

  
  useEffect(() => {
    if (noteContent) {
      const text = noteContent.replace(/<[^>]+>/g, "").trim();
      const words = text.split(/\s+/).filter((w) => w.length > 0);
      setWordCount(words.length);
      setCharCount(text.length);
    } else {
      setWordCount(0);
      setCharCount(0);
    }
  }, [noteContent]);

  const createNewNote = async () => {
    if (isSharedContent) return;
    
    try {
      const token = localStorage.getItem("token");
      
      const folderId = selectedFolder && selectedFolder !== 0 ? selectedFolder : null;
      
      const res = await fetch(`${API_URL}/create_note`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: userName,
          title: "Untitled Note",
          content: "",
          folder_id: folderId,
        }),
      });
      
      if (res.ok) {
        const newNote = await res.json();
        setNotes(prev => [newNote, ...prev]);
        selectNote(newNote);
        await loadFolders();

        setTimeout(() => {
          const quill = quillRef.current?.getEditor();
          if (quill) {
            quill.focus();
            quill.setSelection(0, 0);
          }
        }, 150);

        const folderName = folders.find(f => f.id === folderId)?.name;
        showPopup("Created", folderName ? `New note created in ${folderName}` : "New note created");
        
        
        gamificationService.trackNoteCreated(userName);
      } else {
        throw new Error(`Failed to create note: ${res.status}`);
      }
    } catch (error) {
            showPopup("Error", "Failed to create note");
    }
  };

  const duplicateNote = async (note) => {
    if (isSharedContent) return;
    
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/create_note`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: userName,
          title: `${note.title || 'Untitled Note'} (Copy)`,
          content: note.content || '',
        }),
      });
      if (res.ok) {
        const newNote = await res.json();
        setNotes(prev => [newNote, ...prev]);
        selectNote(newNote);
        showPopup("Duplicated", "Note duplicated successfully");
      } else {
        throw new Error(`Failed to duplicate note: ${res.status}`);
      }
    } catch (error) {
            showPopup("Error", "Failed to duplicate note");
    }
  };

  const isLikelyHtml = (content) => {
    if (!content) return false;
    if (!/<[a-z][\s\S]*>/i.test(content)) return false;
    return /<\s*(p|h1|h2|h3|h4|h5|h6|ul|ol|li|pre|code|blockquote|div|section|article|br|span|img|a)\b/i.test(content);
  };

  const isLikelyMarkdown = (content) => {
    if (!content || isLikelyHtml(content)) return false;
    return (
      /(^|\n)\s{0,3}(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+|```)/.test(content) ||
      /(\*\*|__)(.*?)\1/.test(content) ||
      /`[^`]+`/.test(content)
    );
  };

  const normalizeNoteContent = (content) => {
    if (!content) return '';
    const text = String(content);
    if (isLikelyHtml(text)) return text;
    if (isLikelyMarkdown(text)) return convertMarkdownToHTML(text);
    return text;
  };

  const formatAiOutput = (content) => {
    const text = normalizeAiText(content);
    if (!text) {
      return { text: '', html: '', blocks: [], useBlocks: false };
    }
    const html = isLikelyHtml(text) ? text : convertMarkdownToHTML(text);
    const blocks = htmlToBlocks(html);
    const useBlocks =
      blocks.length > 1 ||
      /<\s*(h[1-6]|ul|ol|blockquote|pre|code|table)\b/i.test(html);
    return { text, html, blocks, useBlocks };
  };

  const selectNote = (n) => {
    const normalizedContent = normalizeNoteContent(n.content || '');
    lastSavedSnapshotRef.current = buildSaveSnapshot(
      n.id,
      n.title || 'Untitled Note',
      normalizedContent,
      n.canvas_data || ''
    );
    setSaveError(false);
    setSelectedNote(n);
    setNoteTitle(n.title || 'Untitled Note');
    setNoteContent(normalizedContent);
    setCanvasData(n.canvas_data || "");
    setCanvasBlockId(null);
    setPendingFocusBlockId(null);
    
    
    let blocks = htmlToBlocks(normalizedContent);
    
    
    if (!blocks || blocks.length === 0) {
      blocks = [{
        id: Date.now(),
        type: 'paragraph',
        content: '',
        properties: {}
      }];
    }
    
    setNoteBlocks(blocks);
    setViewMode("edit");
    
    
    trackRecentlyViewed(n);
    
    
    if (n.properties) {
      try {
        const props = typeof n.properties === 'string' ? JSON.parse(n.properties) : n.properties;
        if (Array.isArray(props)) {
          setPageProperties(props);
        }
      } catch (e) { /* silenced */ }
    }
  };
  
  
  const trackRecentlyViewed = (note) => {
    const viewedItem = {
      id: note.id,
      title: note.title || 'Untitled Note',
      viewedAt: new Date().toISOString()
    };
    
    
    const updated = [
      viewedItem,
      ...recentlyViewed.filter(item => item.id !== note.id)
    ].slice(0, 10);
    
    setRecentlyViewed(updated);
    localStorage.setItem(`recentlyViewed_${userName}`, JSON.stringify(updated));
  };
  
  
  
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((value) => !value);
  }, []);

  const keyboardHandlers = {
    onSave: () => selectedNote && autoSave(),
    onPrint: () => exportAsPDF(),
    onQuickSearch: () => setShowAdvancedSearch(true),
    onNewNote: () => createNewNote(),
    onDuplicate: () => selectedNote && duplicateNote(selectedNote),
    onExport: () => selectedNote && exportAsText(),
    onShowShortcuts: () => setShowKeyboardShortcuts(!showKeyboardShortcuts),
    onEscape: () => {
      setShowKeyboardShortcuts(false);
      setShowAdvancedSearch(false);
      setShowTemplates(false);
      setShowRecentlyViewed(false);
      setShowPageProperties(false);
      setShowCanvasMode(false);
      setShowSmartFolders(false);
    },
    onPreviousNote: () => {
      const currentIndex = filteredNotes.findIndex(n => n.id === selectedNote?.id);
      if (currentIndex > 0) {
        selectNote(filteredNotes[currentIndex - 1]);
      }
    },
    onNextNote: () => {
      const currentIndex = filteredNotes.findIndex(n => n.id === selectedNote?.id);
      if (currentIndex < filteredNotes.length - 1) {
        selectNote(filteredNotes[currentIndex + 1]);
      }
    },
    onScrollTop: () => {
      const editor = document.querySelector('.block-editor-container');
      if (editor) editor.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onScrollBottom: () => {
      const editor = document.querySelector('.block-editor-container');
      if (editor) editor.scrollTo({ top: editor.scrollHeight, behavior: 'smooth' });
    },
    onToggleSidebar: () => setSidebarOpen(!sidebarOpen),
    onGoToDashboard: () => navigate('/dashboard-cerbyl'),
    onGoToAIChat: () => navigate('/ai-chat'),
    onGoToNotes: () => navigate('/notes/dashboard'),
    onFullscreen: toggleFullscreen,
    onPreviewMode: () => setViewMode('preview'),
    onEditMode: () => setViewMode('edit'),
    onToggleFavorite: () => selectedNote && toggleFavorite(selectedNote.id),
    onDelete: () => selectedNote && moveToTrash(selectedNote.id),
  };

  
  useKeyboardShortcuts(keyboardHandlers);

  useEffect(() => {
    if (isFullscreen) {
      setSidebarOpen(false);
    }
  }, [isFullscreen]);

  
  const handleBlocksChange = (newBlocks) => {
    setNoteBlocks(newBlocks);
    
    const html = blocksToHtml(newBlocks);
    setNoteContent(html);
  };

  const saveEditorSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const element = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
    if (element && element.closest('.block-editor-container')) {
      const pendingFontSize = pendingTypingFontSizeRef.current;
      const preservePendingSize = pendingFontSize && rangesHaveSameCaret(
        range,
        savedSelectionRef.current
      );

      savedSelectionRef.current = range.cloneRange();
      setEditorBlockFormat(getRangeBlockFormat(range));

      if (preservePendingSize) {
        setTypingFontSize(pendingFontSize);
        return;
      }

      pendingTypingFontSizeRef.current = null;
      setTypingFontSize(getRangeFontSize(
        range,
        NOTE_FONT_SIZE_VALUES,
        DEFAULT_NOTE_FONT_SIZE
      ));
    }
  }, []);

  const restoreEditorSelection = useCallback(() => {
    const range = savedSelectionRef.current;
    if (!range) return;
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  const applyEditorFont = useCallback((fontFamily) => {
    const savedRange = savedSelectionRef.current?.cloneRange();
    if (!savedRange) return;

    const container = savedRange.commonAncestorContainer;
    const element = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
    const editable = element?.closest?.('[contenteditable="true"]');
    if (!editable) return;

    editable.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(savedRange);

    if (!savedRange.collapsed) {
      const selectedContent = clearInlineFontFamilies(savedRange.extractContents());
      const fontSpan = document.createElement('span');
      fontSpan.style.fontFamily = fontFamily;
      fontSpan.dataset.noteFont = fontFamily;
      fontSpan.appendChild(selectedContent);
      savedRange.insertNode(fontSpan);
      savedRange.selectNodeContents(fontSpan);
      editable.dispatchEvent(new Event('input', { bubbles: true }));
    }

    selection.removeAllRanges();
    selection.addRange(savedRange);
    savedSelectionRef.current = savedRange.cloneRange();
  }, []);

  const applyEditorColor = useCallback((color) => {
    setTypingTextColor(color);
    setColorPickerValue(color);

    const savedRange = savedSelectionRef.current?.cloneRange();
    if (!savedRange || savedRange.collapsed) return;

    const container = savedRange.commonAncestorContainer;
    const element = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
    const editable = element?.closest?.('[contenteditable="true"]');
    if (!editable) return;

    editable.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(savedRange);

    const selectedContent = clearInlineTextColors(savedRange.extractContents());

    const colorSpan = document.createElement('span');
    colorSpan.style.color = color;
    colorSpan.dataset.noteColor = color;
    colorSpan.appendChild(selectedContent);
    savedRange.insertNode(colorSpan);
    savedRange.selectNodeContents(colorSpan);
    editable.dispatchEvent(new Event('input', { bubbles: true }));

    selection.removeAllRanges();
    selection.addRange(savedRange);
    savedSelectionRef.current = savedRange.cloneRange();
  }, []);

  const applyEditorFontSize = useCallback((fontSize) => {
    setTypingFontSize(fontSize);

    const savedRange = savedSelectionRef.current?.cloneRange();
    if (!savedRange) return;

    const container = savedRange.commonAncestorContainer;
    const element = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
    const editable = element?.closest?.('[contenteditable="true"]');
    if (!editable) return;

    editable.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(savedRange);

    if (!savedRange.collapsed) {
      applyInlineFontSize(savedRange, fontSize);
      editable.dispatchEvent(new Event('input', { bubbles: true }));
    }

    selection.removeAllRanges();
    selection.addRange(savedRange);
    savedSelectionRef.current = savedRange.cloneRange();
    pendingTypingFontSizeRef.current = savedRange.collapsed ? fontSize : null;
    setTypingFontSize(fontSize);
  }, []);

  const applyEditorCommand = useCallback((command, value = null) => {
    restoreEditorSelection();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const element = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
    const editable = element?.closest?.('[contenteditable="true"]');
    if (editable) editable.focus();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(command, false, value);
    saveEditorSelection();
  }, [restoreEditorSelection, saveEditorSelection]);

  useEffect(() => {
    const handleSelectionChange = () => saveEditorSelection();
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [saveEditorSelection]);

  const handleOpenCanvasBlock = (blockId) => {
    if (viewMode === 'preview' || (isSharedContent && !canEdit)) return;
    setCanvasBlockId(blockId);
    setShowCanvasMode(true);
  };

  const getCanvasBlockContent = (blockId) => {
    const block = noteBlocks.find((b) => String(b.id) === String(blockId));
    return block?.properties?.canvasData || '';
  };

  const handleInsertBlock = (blockType) => {
    
    const newBlock = {
      id: Date.now() + Math.random(),
      type: blockType,
      content: '',
      properties: {}
    };
    const newBlocks = [...noteBlocks, newBlock];
    setNoteBlocks(newBlocks);
    handleBlocksChange(newBlocks);
  };

  const handleTemplateSelect = (template) => {
    
    const hasExistingContent = noteContent && noteContent.trim().length > 0;
    
    if (hasExistingContent) {
      const confirmOverwrite = window.confirm(
        'This will replace your current note content with the template. Do you want to continue?\n\n' +
        'Tip: You can create a new note first, then apply the template to avoid losing your work.'
      );
      
      if (!confirmOverwrite) {
        setShowTemplates(false);
        return;
      }
    }
    
    setNoteTitle(template.title);
    
    
    if (template.blocks && template.blocks.length > 0) {
      setNoteBlocks(template.blocks);
      
      const html = blocksToHtml(template.blocks);
      setNoteContent(html);
    } else {
      
      const blocks = htmlToBlocks(template.content);
      setNoteBlocks(blocks);
      setNoteContent(template.content);
    }
  };

  
  const { QuickSwitcherComponent } = useQuickSwitcher(notes, folders, selectNote);
  const backlinks = useBacklinks(selectedNote, notes);
  const { 
    showSlashMenu, 
    slashMenuPosition, 
    setShowSlashMenu, 
    insertBlock 
  } = useSlashCommands(quillRef);

  const autoSave = useCallback(async () => {
    if (!selectedNote) return;

    const targetNoteId = selectedNote.id;
    const saveSnapshot = buildSaveSnapshot(targetNoteId, noteTitle, noteContent, canvasData);
    if (saveSnapshot === lastSavedSnapshotRef.current) return;

    
    if (isSharedContent) {
      if (!canEdit) return;
      
      setSaving(true);
      setSaveError(false);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/update_shared_note/${targetNoteId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: noteTitle,
            content: noteContent,
            canvas_data: canvasData,
          }),
        });

        if (res.ok) {
          lastSavedSnapshotRef.current = saveSnapshot;
          setSaving(false);
          setSaveError(false);
          setAutoSaved(true);
          setTimeout(() => setAutoSaved(false), 2000);
        } else {
          throw new Error(`Save failed: ${res.status}`);
        }
      } catch (error) {
        setSaving(false);
        setAutoSaved(false);
        setSaveError(true);
        console.warn('Shared note autosave failed:', error);
      }
    } else {
      
      const noteStillExists = notesRef.current.find(n => n.id === targetNoteId);
      if (!noteStillExists) return;
      
      if (selectedNote.is_deleted || noteStillExists.is_deleted) return;
      
      setSaving(true);
      setSaveError(false);
      
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_URL}/update_note`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            note_id: targetNoteId,
            title: noteTitle,
            content: noteContent,
            canvas_data: canvasData,
          }),
        });
        
        if (res.ok) {
          lastSavedSnapshotRef.current = saveSnapshot;
          setSaving(false);
          setSaveError(false);
          setAutoSaved(true);
          setTimeout(() => setAutoSaved(false), 2000);

          setNotes((prev) =>
            prev.map((n) =>
              n.id === targetNoteId ? { ...n, title: noteTitle, content: noteContent, canvas_data: canvasData } : n
            )
          );
          setSelectedNote((prev) => (
            prev?.id === targetNoteId
              ? { ...prev, title: noteTitle, content: noteContent, canvas_data: canvasData }
              : prev
          ));
        } else if (res.status === 400) {
          setSaving(false);
          
          setNotes(prev => prev.filter(n => n.id !== targetNoteId));
          setSelectedNote(null);
          setNoteTitle("");
          setNoteContent("");
          
          showPopup("Note Deleted", "This note has been moved to trash");
        } else {
          throw new Error(`Save failed: ${res.status}`);
        }
      } catch (error) {
        setSaving(false);
        setAutoSaved(false);
        setSaveError(true);
        console.warn('Note autosave failed:', error);
      }
    }
  }, [selectedNote, noteTitle, noteContent, canvasData, isSharedContent, canEdit]);

  
  useEffect(() => {
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
      saveTimeout.current = null;
    }
    
    const currentSnapshot = selectedNote
      ? buildSaveSnapshot(selectedNote.id, noteTitle, noteContent, canvasData)
      : '';
    const hasUnsavedChanges = currentSnapshot !== lastSavedSnapshotRef.current;

    if (selectedNote && hasUnsavedChanges && (isSharedContent ? canEdit : !selectedNote.is_deleted)) {
      setAutoSaved(false);
      saveTimeout.current = setTimeout(() => {
        if (selectedNote && (isSharedContent ? canEdit : !selectedNote.is_deleted)) {
          autoSave();
        }
      }, 1500);
    }
    
    return () => {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
        saveTimeout.current = null;
      }
    };
  }, [noteContent, noteTitle, canvasData, selectedNote, autoSave, isSharedContent, canEdit]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  
  useEffect(() => {
    const handleKey = (e) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        autoSave();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [autoSave]);

  
  useEffect(() => {
    const handleFullscreenKey = (e) => {
      if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleFullscreenKey);
    return () => window.removeEventListener("keydown", handleFullscreenKey);
  }, [isFullscreen, toggleFullscreen]);

  
  useEffect(() => {
    const handlePageLinkClick = (e) => {
      if (e.target.classList.contains('page-link')) {
        const noteId = parseInt(e.target.dataset.noteId);
        const note = notes.find(n => n.id === noteId);
        if (note) selectNote(note);
      }
    };

    const editor = quillRef.current?.getEditor();
    if (editor && editor.root) {
      editor.root.addEventListener('click', handlePageLinkClick);
      return () => editor.root.removeEventListener('click', handlePageLinkClick);
    }
  }, [notes, quillRef]);

  
  useEffect(() => {
    if (isSharedContent && !canEdit) return;

    const handleSelection = () => {
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();

      if (selectedText && selectedText.length > 3) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        
        let blockId = null;
        let node = range.startContainer;
        while (node && node !== document.body) {
          if (node.nodeType === 1) { 
            const blockWrapper = node.closest('[data-block-id]');
            if (blockWrapper) {
              blockId = blockWrapper.getAttribute('data-block-id');
              break;
            }
          }
          node = node.parentNode;
        }

        setAiFloatingPosition({
          top: rect.bottom + window.scrollY + 8,
          left: rect.left + rect.width / 2 + window.scrollX
        });
        setSelectedTextContent(selectedText);
        setSelectedBlockId(blockId);
        setShowAIFloatingButton(true);
      } else {
        setShowAIFloatingButton(false);
        setSelectedTextContent('');
        setSelectedBlockId(null);
      }
    };

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('keyup', handleSelection);

    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('keyup', handleSelection);
    };
  }, [isSharedContent, canEdit]);

  const handleEditorChange = (content, delta, source, editor) => {
    if (isSharedContent && !canEdit) return;
    
    setNoteContent(content);

    if (source === "user" && delta && delta.ops) {
      const lastOp = delta.ops[delta.ops.length - 1];
      if (lastOp.insert === "/") {
        const quill = quillRef.current?.getEditor();
        if (quill) {
          const selection = quill.getSelection();
          if (selection) {
            const bounds = quill.getBounds(selection.index);
            const editorRect = quill.container.getBoundingClientRect();
            setAiDropdownPosition({
              top: editorRect.top + bounds.top + 30,
              left: editorRect.left + bounds.left,
            });
            setShowAIDropdown(true);
            setAiPrompt("");
            quill.deleteText(selection.index - 1, 1);

            setTimeout(() => aiInputRef.current?.focus(), 100);
          }
        }
      }
    }
  };

  const generateAIContent = async () => {
    if (!aiPrompt.trim() || (isSharedContent && !canEdit)) {
      showPopup("Empty Prompt", "Please enter a prompt for AI generation");
      return;
    }

    setGeneratingAI(true);
    try {
      
      let actionType = "generate";
      if (aiPrompt.toLowerCase().includes("explain")) {
        actionType = "explain";
      } else if (aiPrompt.toLowerCase().includes("key points")) {
        actionType = "key_points";
      } else if (aiPrompt.toLowerCase().includes("outline")) {
        actionType = "outline";
      } else if (aiPrompt.toLowerCase().includes("summarize")) {
        actionType = "summarize";
      }

      
      const result = await noteAgentService.invoke(actionType, {
        userId: userName,
        topic: aiPrompt,
        content: aiPrompt,
        context: noteContent
      });

      if (!isAgentSuccess(result)) throw new Error("AI generation failed");

      const resultContent = normalizeAiText(result.content || result.response);
      const formatted = formatAiOutput(resultContent);
      
      setAiSuggestion({
        original: '',
        suggested: formatted.text,
        suggestedHtml: formatted.html,
        suggestedBlocks: formatted.blocks,
        useBlocks: formatted.useBlocks,
        range: selectedRange,
        action: actionType,
        blockId: selectedBlockId,
        isBlockEditor: true
      });
      setShowAISuggestionModal(true);
      setShowAIAssistant(false);
    } catch (error) {
            showPopup("Error", "Failed to generate AI content");
    } finally {
      setGeneratingAI(false);
      setShowAIDropdown(false);
      setAiPrompt("");
    }
  };

  const quickAIAction = async (actionType) => {
    if (isSharedContent && !canEdit) return;
    
    setGeneratingAI(true);
    try {
      
      const actionMap = {
        'explain': 'explain',
        'key_points': 'key_points',
        'guide': 'generate',
        'summary': 'summarize',
        'general': 'generate'
      };
      
      const agentAction = actionMap[actionType] || 'generate';
      
      
      const result = await noteAgentService.invoke(agentAction, {
        userId: userName,
        topic: aiPrompt || "Generate content",
        content: aiPrompt || "Generate content",
        context: noteContent
      });

      if (!isAgentSuccess(result)) throw new Error("AI generation failed");

      const resultContent = normalizeAiText(result.content || result.response);
      const formatted = formatAiOutput(resultContent);
      
      setAiSuggestion({
        original: '',
        suggested: formatted.text,
        suggestedHtml: formatted.html,
        suggestedBlocks: formatted.blocks,
        useBlocks: formatted.useBlocks,
        range: selectedRange,
        action: agentAction,
        blockId: selectedBlockId,
        isBlockEditor: true
      });
      setShowAISuggestionModal(true);
      setShowAIAssistant(false);
    } catch (error) {
            showPopup("Error", "Failed to generate content");
    } finally {
      setGeneratingAI(false);
      setShowAIDropdown(false);
    }
  };

  const convertMarkdownToHTML = (markdown) => {
    let html = markdown || '';

    html = html.replace(/\r\n/g, '\n');
    html = html.replace(/^[=\-*]{3,}\s*$/gim, '<hr>');
    html = html.replace(/\n{3,}/g, '\n\n');
    html = html.replace(/^######\s+(.*$)/gim, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.*$)/gim, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.*$)/gim, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.*$)/gim, '<h1>$1</h1>');
    html = html.replace(/^>\s+(.*$)/gim, '<blockquote>$1</blockquote>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
    html = html.replace(/(?<!\*)\*(?!\*)([^\*]+?)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/(?<!_)_(?!_)([^_]+?)_(?!_)/g, '<em>$1</em>');
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    html = html.replace(/^\s*(\d+)\.\s+(.*)$/gim, '<li data-ol="true">$2</li>');
    html = html.replace(/^\s*[-*+]\s+(.*)$/gim, '<li data-ul="true">$1</li>');
    html = html.replace(/(<li data-ol="true">.*?<\/li>\s*)+/gis, (match) =>
      `<ol>${match.replace(/ data-ol="true"/g, '')}</ol>`
    );
    html = html.replace(/(<li data-ul="true">.*?<\/li>\s*)+/gis, (match) =>
      `<ul>${match.replace(/ data-ul="true"/g, '')}</ul>`
    );

    const blocks = html.split(/\n\n+/);
    
    html = blocks.map(block => {
      block = block.trim();
      if (!block) return '';
      if (block.startsWith('<h') || 
          block.startsWith('<ul>') || 
          block.startsWith('<ol>') || 
          block.startsWith('<pre>') ||
          block.startsWith('<blockquote>') ||
          block === '<li>' ||
          block.startsWith('<div>')) {
        return block;
      }
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    }).filter(block => block).join('\n\n');

    html = html.replace(/\n{3,}/g, '\n\n');
    html = html.trim();

    return html;
  };

  const startVoiceRecording = async () => {
    if (isSharedContent && !canEdit) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const options = { mimeType: 'audio/webm' };
      const mediaRecorder = new MediaRecorder(stream, options);
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                
        if (audioBlob.size === 0) {
          showPopup("Error", "No audio was recorded. Please try again.");
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        
        await processVoiceToText(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
            showPopup("Recording", "Voice recording started");
    } catch (error) {
            showPopup("Error", "Failed to start recording. Please check microphone permissions.");
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processVoiceToText = async (audioBlob) => {
    setProcessingVoice(true);
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("audio_file", audioBlob, "recording.webm");
      formData.append("user_id", userName);

                  
      const transcribeData = USE_AI_JOB_QUEUE
        ? await queueLegacyAIFileEndpoint(
            '/api/transcribe_audio/',
            { user_id: userName },
            [{ fieldName: 'audio_file', file: audioBlob, filename: 'recording.webm' }],
            { timeoutMs: 180000 }
          )
        : await (async () => {
            const transcribeRes = await fetch(`${API_URL}/transcribe_audio/`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`
              },
              body: formData,
            });


            if (!transcribeRes.ok) {
              const errorText = await transcribeRes.text();
                      throw new Error(`Transcription failed: ${transcribeRes.status} - ${errorText}`);
            }

            return transcribeRes.json();
          })();
            
      const transcript = transcribeData.transcript;
      setVoiceTranscript(transcript);

      
      // Use the note agent service for voice transcription processing
      const result = await noteAgentService.invoke('generate', {
        userId: userName,
        topic: transcript,
        content: transcript,
        context: noteContent
      });

      if (!isAgentSuccess(result)) {
        throw new Error("AI response failed");
      }

      const formatted = formatAiOutput(result.content || result.response);
      const blocksToInsert = formatted.useBlocks && formatted.blocks.length > 0
        ? formatted.blocks
        : [{
            id: Date.now() + Math.random(),
            type: 'paragraph',
            content: formatted.html || formatted.text,
            properties: {}
          }];
      const updatedBlocks = [...noteBlocks, ...blocksToInsert.map(block => ({
        ...block,
        id: block.id || Date.now() + Math.random()
      }))];

      handleBlocksChange(updatedBlocks);
      showPopup("Success", "Voice transcribed and AI response added to note");
      setVoiceTranscript("");
    } catch (error) {
            showPopup("Error", error.message || "Failed to process voice input");
    } finally {
      setProcessingVoice(false);
    }
  };

  const aiWritingAssist = async (actionOverride = null, textOverride = null) => {
    const action = actionOverride || aiAssistAction;
    
    if (isSharedContent && !canEdit && action !== 'explain_only') return;
    
    // Handle explain_only action separately
    if (action === 'explain_only') {
      await explainTextOnly();
      return;
    }
    
    // Get text to process
    let textToProcess = textOverride ?? selectedText;
    
    // For generate action, we don't need selected text
    if (action !== 'generate' && (!textToProcess || !textToProcess.trim())) {
      // Try to get selected text from the editor
      const selection = window.getSelection();
      if (selection && selection.toString()) {
        textToProcess = selection.toString();
      }
    }

    if (action !== 'generate' && (!textToProcess || !textToProcess.trim()) && selectedTextContent) {
      textToProcess = selectedTextContent;
    }

    if (action !== 'generate' && (!textToProcess || !textToProcess.trim())) {
      showPopup("No Text Selected", "Please select text or enter text to process");
      return;
    }

    setGeneratingAI(true);
    try {
      // Map actions to note agent actions
      const actionMap = {
        'generate': 'generate',
        'continue': 'continue',
        'improve': 'improve',
        'simplify': 'simplify',
        'expand': 'expand',
        'summarize': 'summarize',
        'fix_grammar': 'grammar',
        'grammar': 'grammar',
        'tone_change': 'tone_change',
        'translate': 'improve'  // Use improve as fallback for translate
      };
      
      const agentAction = actionMap[action] || action;
      const shouldIncludeNoteContext = agentAction !== 'grammar';
      
      // Use the note agent service
      const result = await noteAgentService.invoke(agentAction, {
        userId: userName,
        content: textToProcess || selectedText,
        topic: textToProcess || selectedText,
        tone: aiAssistTone,
        context: shouldIncludeNoteContext
          ? noteBlocks.map(b => b.content).join('\n')
          : null
      });

      if (!isAgentSuccess(result)) throw new Error("AI assist failed");

      const resultText = normalizeAiText(result.content || result.response);
      const formatted = formatAiOutput(resultText);
      
      if (!resultText || resultText.trim() === '') {
        showPopup("Error", "AI returned empty response");
        setGeneratingAI(false);
        return;
      }
      
      // Show suggestion modal for user approval instead of directly applying
      setAiSuggestion({
        original: normalizeAiText(textToProcess || selectedText),
        suggested: formatted.text.trim(),
        suggestedHtml: formatted.html,
        suggestedBlocks: formatted.blocks,
        useBlocks: formatted.useBlocks,
        range: selectedRange,
        action: action,
        blockId: selectedBlockId,
        isBlockEditor: true
      });
      setShowAISuggestionModal(true);
      setShowAIAssistant(false);
      
    } catch (error) {
      console.error("AI processing error:", error);
      showPopup("Error", "Failed to process text");
    } finally {
      setGeneratingAI(false);
    }
  };

  // Quick action handler - executes AI action immediately
  const handleQuickAction = async (action) => {
    setAiAssistAction(action);
    
    // For actions that need text selection, validate first
    if (action !== 'generate' && (!selectedText || !selectedText.trim())) {
      const selection = window.getSelection();
      const selected = selection && selection.toString() ? selection.toString() : '';
      if (!selected) {
        showPopup("No Text Selected", "Please select text in the editor or enter text in the input field");
        return;
      }
      setSelectedText(selected);
      await aiWritingAssist(action, selected);
      return;
    }
    
    // Execute immediately
    await aiWritingAssist(action, selectedText);
  };

  const handleSessionToggle = (sid) =>
    setSelectedSessions((prev) => (prev.includes(sid) ? prev.filter((id) => id !== sid) : [...prev, sid]));

  const selectAllSessions = () => setSelectedSessions(chatSessions.map((s) => s.id));
  const clearAllSessions = () => setSelectedSessions([]);

  const convertChatToNote = async () => {
                
    if (selectedSessions.length === 0) {
      showPopup("No Sessions Selected", "Please select at least one chat session.");
      return;
    }
    setImporting(true);
    try {
      const token = localStorage.getItem("token");
      
      // Use the conversion agent service for chat-to-notes conversion
      const conversionAgentService = (await import('../services/conversionAgentService')).default;
      const selectedSessionTitles = chatSessions
        .filter((session) => selectedSessions.includes(session.id))
        .map((session) => session.title);
      
      const result = await conversionAgentService.chatToNotes(
        userName,
        selectedSessions,
        {
          formatStyle: importMode === 'summary' ? 'summary' : 'structured',
          sessionTitles: selectedSessionTitles
        }
      );
      
      
      if (result.success) {
        // Refresh notes list
        await loadNotes();
        
        setShowChatImport(false);
        setSelectedSessions([]);
        
        // Get note data from result
        const noteData = result.result || result;
        
        
        // Check for note_id in various possible locations
        const noteId = noteData.note_id || result.note_id || noteData.id || result.id;
        const noteTitle = noteData.note_title || result.note_title || noteData.title || result.title || 'New Note';
        
        
        if (noteId) {
          setNewNoteId(noteId);
          setNewNoteTitle(noteTitle);
          setShowNavigateDialog(true);
        } else {
          showPopup("Conversion Successful", `"${noteTitle}" created successfully via AI Agent.`);
        }
      } else {
        throw new Error(result.response || result.error || 'Conversion failed');
      }
    } catch (err) {
      console.error('Chat to note conversion error:', err);
      showPopup("Conversion Failed", "Unable to convert chat to note.");
    }
    setImporting(false);
  };

  const handleNavigateToNewNote = () => {
    if (newNoteId) {
      // Close dialog first
      setShowNavigateDialog(false);
      setNewNoteId(null);
      setNewNoteTitle('');
      
      navigate(`/notes/editor/${newNoteId}`);
    } else {
      console.error('No note ID to navigate to');
      setShowNavigateDialog(false);
    }
  };

  const handleStayOnCurrentNote = () => {
    showPopup("Note Created", `"${newNoteTitle}" has been created successfully. You can find it in your notes list.`);
    setShowNavigateDialog(false);
    setNewNoteId(null);
    setNewNoteTitle('');
  };

  const exportAsPDF = () => {
    if (!selectedNote) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showPopup("Export Blocked", "Please allow popups to export this note.");
      return;
    }
    
    const styles = `
      <style>
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          padding: 40px;
          max-width: 800px;
          margin: 0 auto;
          color: #1a1a1a;
          line-height: 1.8;
          position: relative;
        }
        
        body::before {
          content: 'cerbylAI';
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-45deg);
          font-size: 120px;
          font-weight: 900;
          color: #d3d3d3;
          opacity: 0.15;
          z-index: -1;
          white-space: nowrap;
          pointer-events: none;
          letter-spacing: 8px;
          text-transform: uppercase;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        
        h1 {
          font-size: 32px;
          font-weight: 700;
          margin-bottom: 20px;
          color: #000;
          position: relative;
          z-index: 1;
        }
        
        .metadata {
          color: #666;
          font-size: 12px;
          margin-bottom: 30px;
          padding-bottom: 15px;
          border-bottom: 2px solid #e0e0e0;
          position: relative;
          z-index: 1;
        }
        
        .content {
          position: relative;
          z-index: 1;
        }
        
        img { 
          max-width: 100%; 
          height: auto; 
        }
        
        pre { 
          background: #f5f5f5; 
          padding: 15px; 
          border-radius: 0; 
          overflow-x: auto; 
        }
        
        code { 
          background: #f5f5f5; 
          padding: 2px 6px; 
          border-radius: 0; 
          font-family: 'Courier New', monospace; 
        }
        
        blockquote { 
          border-left: 4px solid #2196f3; 
          padding-left: 15px; 
          color: #666; 
          font-style: italic; 
        }
        
        a { 
          color: #2196f3; 
        }
        
        ul, ol { 
          margin: 12px 0; 
          padding-left: 30px; 
        }
        
        li { 
          margin: 6px 0; 
          line-height: 1.6; 
        }
        
        table { 
          border-collapse: collapse; 
          width: 100%; 
          margin: 20px 0; 
        }
        
        th, td { 
          border: 1px solid #ddd; 
          padding: 12px; 
          text-align: left; 
        }
        
        th { 
          background-color: #f5f5f5; 
          font-weight: 600; 
        }
        
        @media print {
          body::before {
            content: 'cerbylAI';
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 120px;
            font-weight: 900;
            color: #d3d3d3;
            opacity: 0.15;
            z-index: -1;
            white-space: nowrap;
            pointer-events: none;
            letter-spacing: 8px;
            text-transform: uppercase;
          }
          
          @page {
            margin: 0.5in;
          }
          
          h1, h2, h3, h4, h5, h6 {
            page-break-after: avoid;
          }
          
          table, pre, blockquote, img {
            page-break-inside: avoid;
          }
        }
      </style>
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${escapeHtml(noteTitle || 'Note')}</title>
          ${styles}
        </head>
        <body>
          <h1>${escapeHtml(noteTitle || 'Untitled Note')}</h1>
          <div class="metadata">
            Last edited: ${escapeHtml(formatDateTime(selectedNote.updated_at) || 'Unknown')}<br>
            ${wordCount} words - ${charCount} characters
          </div>
          <div class="content">
            ${sanitizeHtml(noteContent)}
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();

    setTimeout(() => {
      printWindow.print();
    }, 250);

    showPopup("Export", "Print dialog opened - Save as PDF with cerbylAI watermark");
  };

  const exportAsText = () => {
    const text = noteContent.replace(/<[^>]+>/g, "");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${noteTitle || "note"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showPopup("Exported", "Note exported as text");
  };

  const getFilteredNotes = () => {
    let filtered = notes.filter(
      (n) =>
        !n.is_deleted &&
        (asText(n.title).toLowerCase().includes(searchTerm.toLowerCase()) ||
        asText(n.content).toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (showFavorites) {
      filtered = filtered.filter(n => n.is_favorite);
    } else if (selectedFolder) {
      filtered = filtered.filter(n => noteIsInFolder(n, selectedFolder));
    } else if (selectedFolder === 0) {
      filtered = filtered.filter(n => noteFolderIds(n).length === 0);
    }

    return filtered;
  };

  const filteredNotes = getFilteredNotes();

  const modules = {
    toolbar: {
      container: [
        [{ header: [1, 2, 3, 4, 5, 6, false] }],
        [{ font: [
          'inter', 'arial', 'times-new-roman', 'georgia', 'courier', 'verdana',
          'helvetica', 'comic-sans', 'impact', 'trebuchet', 'palatino', 'garamond',
          'bookman', 'avant-garde', 'roboto', 'open-sans', 'lato', 'montserrat',
          'source-sans', 'merriweather', 'playfair', 'eb-garamond'
        ] }],
        [{ size: ["small", false, "large", "huge"] }],
        ["bold", "italic", "underline", "strike"],
        [{ color: [] }, { background: [] }],
        [{ script: "sub" }, { script: "super" }],
        [{ list: "ordered" }, { list: "bullet" }, { indent: "-1" }, { indent: "+1" }],
        [{ direction: "rtl" }],
        ["blockquote", "code-block"],
        ["link", "image", "video", "formula"],
        ["clean"],
      ]
    },
    formula: true,
  };

  const formats = [
    "header",
    "font",
    "size",
    "bold",
    "italic",
    "underline",
    "strike",
    "color",
    "background",
    "script",
    "list",
    "bullet",
    "indent",
    "direction",
    "blockquote",
    "code-block",
    "link",
    "image",
    "video",
    "formula",
    "table",
  ];

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) {
      void signOutAppSession();
      localStorage.clear();
      navigate("/");
    }
  };

  return (
    <div className={`notes-redesign ${selectedNote ? "nr-note-selected" : ""} ${viewMode === "preview" ? "preview-mode" : ""} ${isFullscreen ? "fullscreen-mode" : ""}`}>
      <svg className="geo-bg" viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="600" cy="400" r="360" fill="none" stroke="currentColor" strokeWidth="1"/>
        <circle cx="600" cy="400" r="260" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <circle cx="600" cy="400" r="168" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <circle cx="600" cy="400" r="90" fill="none" stroke="currentColor" strokeWidth="1"/>
        <line x1="600" y1="40" x2="600" y2="760" stroke="currentColor" strokeWidth="0.5"/>
        <line x1="240" y1="400" x2="960" y2="400" stroke="currentColor" strokeWidth="0.5"/>
        <line x1="346" y1="146" x2="854" y2="654" stroke="currentColor" strokeWidth="0.3"/>
        <line x1="854" y1="146" x2="346" y2="654" stroke="currentColor" strokeWidth="0.3"/>
        <circle cx="600" cy="40" r="4" fill="currentColor"/>
        <circle cx="960" cy="400" r="4" fill="currentColor"/>
        <circle cx="600" cy="760" r="4" fill="currentColor"/>
        <circle cx="240" cy="400" r="4" fill="currentColor"/>
        <rect x="580" y="20" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <rect x="940" y="380" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <circle cx="854" cy="146" r="3" fill="currentColor" opacity="0.5"/>
        <circle cx="346" cy="146" r="3" fill="currentColor" opacity="0.5"/>
        <circle cx="854" cy="654" r="3" fill="currentColor" opacity="0.5"/>
        <circle cx="346" cy="654" r="3" fill="currentColor" opacity="0.5"/>
        <circle cx="120" cy="160" r="2" fill="currentColor" opacity="0.4"/>
        <circle cx="1050" cy="200" r="2" fill="currentColor" opacity="0.4"/>
        <circle cx="80" cy="600" r="2" fill="currentColor" opacity="0.4"/>
        <circle cx="1100" cy="580" r="2" fill="currentColor" opacity="0.4"/>
      </svg>
      {QuickSwitcherComponent}
      
      {/* Slash Menu */}
      <SlashMenu
        isOpen={showSlashMenu}
        position={slashMenuPosition}
        onSelect={insertBlock}
        onClose={() => setShowSlashMenu(false)}
      />

      {selectedNote && !isFullscreen && (
        <div className="nr-qb-topbar">
          <div className="nr-qb-tagline"><span>LEARNING,</span> UNIFIED</div>
          <div className="nr-qb-topbar-right">
            {!isSharedContent && (
              <button className="nr-qb-top-btn" onClick={() => navigate('/notes/my-notes')} type="button">
                My Notes
              </button>
            )}
            <button className="nr-qb-top-btn" onClick={() => setSidebarOpen((prev) => !prev)} type="button">
              {sidebarOpen && !isSharedContent ? 'Hide Sidebar' : 'Show Sidebar'}
            </button>
            <button className="nr-qb-top-btn nr-qb-top-btn--accent" onClick={() => setShowImportExport(true)} type="button">
              Convert
            </button>
            <div className="nr-qb-context-control">
              <ContextSelector hsMode={hsMode} docCount={userDocCount} onOpen={() => setContextPanelOpen(true)} />
            </div>
          </div>
        </div>
      )}

      {/* Body - Sidebar + Content */}
      <div className="nr-body">
        {selectedNote ? (
          <div className={`nr-qb-shell ${sidebarOpen && !isSharedContent ? "" : "nr-qb-shell--collapsed"}`}>
            {sidebarOpen && !isSharedContent && (
              <aside className="nr-qb-sidebar" aria-label="Notes tools">
                <div className="cb-tile-texture" aria-hidden />
                <div className="nr-qb-side-brand">
                  <div className="nr-qb-brand-wrap">
                    <div className="nr-qb-brand">cerbyl</div>
                    <div className="nr-qb-brand-kicker">Notes</div>
                  </div>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="nr-qb-side-close-btn"
                    type="button"
                    title="Close sidebar"
                    aria-label="Close notes sidebar"
                  >
                    <ChevronLeft size={14} />
                  </button>
                </div>

                <div className="nr-qb-side-block">
                  <div className="nr-qb-side-label">Notes Workspace</div>
                  <nav className="nr-qb-view-nav" aria-label="Note view mode">
                    <button
                      className={`nr-qb-view-link ${viewMode === "edit" ? "nr-qb-view-link--active" : ""}`}
                      onClick={() => setViewMode("edit")}
                      title="Edit mode"
                      type="button"
                    >
                      <Edit3 size={16} />
                      <span>Edit</span>
                    </button>
                    <button
                      className={`nr-qb-view-link ${viewMode === "preview" ? "nr-qb-view-link--active" : ""}`}
                      onClick={() => setViewMode("preview")}
                      title="Preview note"
                      type="button"
                    >
                      <Eye size={16} />
                      <span>Preview</span>
                    </button>
                  </nav>
                </div>

                <div className="nr-qb-side-block nr-qb-side-block--grow">
                  <div className="nr-qb-side-label">Editor</div>
                  <nav className="nr-qb-view-nav" aria-label="Editor tools">
                    <button
                      className={`nr-qb-view-link ${editorDarkMode ? "nr-qb-view-link--active" : ""}`}
                      onClick={() => setEditorDarkMode((value) => !value)}
                      title={editorDarkMode ? "Use light paper" : "Use dark paper"}
                      type="button"
                    >
                      <Palette size={16} />
                      <span>{editorDarkMode ? "Dark Paper" : "Light Paper"}</span>
                    </button>
                    {!isSharedContent && (
                      <button
                        className={`nr-qb-view-link ${showPageProperties ? "nr-qb-view-link--active" : ""}`}
                        onClick={() => setShowPageProperties((value) => !value)}
                        title="Page properties"
                        type="button"
                      >
                        <Layout size={16} />
                        <span>Page Setup</span>
                      </button>
                    )}
                    <button
                      className={`nr-qb-view-link ${isFullscreen ? "nr-qb-view-link--active" : ""}`}
                      onClick={toggleFullscreen}
                      title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                      type="button"
                    >
                      {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                      <span>{isFullscreen ? "Exit Full" : "Fullscreen"}</span>
                    </button>
                    <button
                      className="nr-qb-view-link"
                      onClick={() => setShowKeyboardShortcuts(true)}
                      title="Keyboard shortcuts"
                      type="button"
                    >
                      <Command size={16} />
                      <span>Shortcuts</span>
                    </button>
                  </nav>
                </div>

                <div className="nr-qb-side-block">
                  <div className="nr-qb-side-label">Export</div>
                  <nav className="nr-qb-view-nav" aria-label="Export note">
                    <button 
                      className="nr-qb-view-link"
                      onClick={exportAsPDF} 
                      title="Export as PDF"
                      type="button"
                    >
                      <FileDown size={16} />
                      <span>PDF</span>
                    </button>
                    <button 
                      className="nr-qb-view-link"
                      onClick={exportAsText} 
                      title="Export as Text"
                      type="button"
                    >
                      <Download size={16} />
                      <span>TXT</span>
                    </button>
                  </nav>
                </div>

                <div className="nr-qb-side-block">
                  <div className="nr-qb-side-label">AI Tools</div>
                  <nav className="nr-qb-view-nav" aria-label="AI note tools">
                    <button
                      className="nr-qb-view-link"
                      onClick={() => setShowAIAssistant(true)}
                      title="AI Writing Assistant"
                      type="button"
                    >
                      <Sparkles size={16} />
                      <span>AI Assist</span>
                    </button>
                    <button
                      className="nr-qb-view-link"
                      onClick={() => {
                                                                        setShowChatImport(true);
                      }}
                      title="Import from AI Chat"
                      type="button"
                    >
                      <Upload size={16} />
                      <span>From Chat</span>
                    </button>
                    <button
                      className="nr-qb-view-link nr-qb-view-link--accent"
                      onClick={() => setShowImportExport(true)}
                      title="Convert Notes"
                      type="button"
                    >
                      <Zap size={16} />
                      <span>Convert</span>
                    </button>
                  </nav>
                </div>

                <nav className="nr-qb-side-nav-groups" aria-label="More note tools">
                  <div className="nr-qb-side-group">
                    <div className="nr-qb-side-group-title">Quick Actions</div>
                    <button
                      className="nr-qb-side-link"
                      onClick={() => setShowAdvancedSearch(true)}
                      title="Advanced Search"
                      type="button"
                    >
                      <span className="nr-qb-side-link-dot" />
                      Search
                    </button>
                    <button
                      className="nr-qb-side-link"
                      onClick={() => setShowTemplates(true)}
                      title="Templates"
                      type="button"
                    >
                      <span className="nr-qb-side-link-dot" />
                      Templates
                    </button>
                  </div>
                  <div className="nr-qb-side-group">
                    <div className="nr-qb-side-group-title">Visual Tools</div>
                    <button 
                      onClick={() => setShowCanvasMode(true)}
                      className="nr-qb-side-link"
                      title="Canvas Mode - Draw and brainstorm"
                      type="button"
                    >
                      <span className="nr-qb-side-link-dot" />
                      Canvas
                    </button>
                  </div>
                </nav>

                <div className="nr-qb-side-actions">
                  <button className="nr-qb-action-btn" onClick={() => setShowImportExport(true)} type="button">Convert</button>
                  <button className="nr-qb-action-btn nr-qb-action-btn--ghost" onClick={() => navigate('/notes/my-notes')} type="button">My Notes</button>
                </div>
              </aside>
            )}

            <main className="nr-qb-main">
            <div className={`editor-content ${editorDarkMode ? 'dark-mode' : ''} ${titleSectionCollapsed ? 'toolbar-hidden' : ''} ${!sidebarOpen ? 'sidebar-closed' : ''}`}>
              {isSharedContent && !canEdit && (
                <div className="view-only-banner">
                  <Eye size={16} />
                  <span>View Only - You don't have permission to edit this shared note</span>
                </div>
              )}
              
              <div className={`title-section ${titleSectionCollapsed ? 'collapsed' : ''}`}>
              <div className="title-section-header">
                <div className="title-section-content">
                  <input
                    type="text"
                    className="title-input-new"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="Untitled Note"
                    disabled={isSharedContent && !canEdit}
                  />
                  <div className="title-meta">
                    <span className="last-edited">
                      Last edited: {formatDateTime(selectedNote.updated_at) || 'Unknown'}
                    </span>
                  </div>
                </div>
                <div className="title-actions">
                  <button
                    className={`title-action-btn ${isFullscreen ? 'title-action-btn--fullscreen' : ''}`}
                    type="button"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                  >
                    {isFullscreen ? (
                      <>
                        <Minimize2 size={16} />
                        <span>Exit Fullscreen</span>
                      </>
                    ) : (
                      <Maximize2 size={16} />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="block-editor-wrapper" style={{ position: 'relative' }}>
              {viewMode === "edit" && (!isSharedContent || canEdit) && (
                <div className="formatting-toolbar-wrapper">
                  <div className="formatting-toolbar">
                    {/* Headers */}
                    <select 
                      className="format-select"
                      value={editorBlockFormat}
                      onMouseDown={saveEditorSelection}
                      onChange={(e) => {
                        const value = e.target.value;
                        setEditorBlockFormat(value);
                        applyEditorCommand('formatBlock', value);
                      }}
                      title="Text Style"
                    >
                      <option value="p">Normal</option>
                      <option value="h1">Heading 1</option>
                      <option value="h2">Heading 2</option>
                      <option value="h3">Heading 3</option>
                      <option value="h4">Heading 4</option>
                      <option value="h5">Heading 5</option>
                      <option value="h6">Heading 6</option>
                    </select>
                    
                    {/* Font Family */}
                    <select 
                      className="format-select"
                      value={customFont}
                      onMouseDown={saveEditorSelection}
                      onChange={(e) => {
                        const font = FONTS.find((option) => option.label === e.target.value);
                        if (font) {
                          setCustomFont(font.label);
                          localStorage.setItem("preferredFont", font.label);
                          applyEditorFont(font.family);
                        }
                      }}
                      title="Font Family"
                    >
                      {FONTS.map(font => (
                        <option key={font.label} value={font.label}>{font.label}</option>
                      ))}
                    </select>
                    
                    {/* Font Size */}
                    <select 
                      className="format-select"
                      value={typingFontSize}
                      onMouseDown={saveEditorSelection}
                      onChange={(e) => {
                        applyEditorFontSize(e.target.value);
                      }}
                      title="Font Size"
                    >
                      {NOTE_FONT_SIZES.map((size) => (
                        <option key={size.value} value={size.value}>{size.label}</option>
                      ))}
                    </select>
                    
                    <div className="toolbar-divider"></div>
                    
                    {/* Text Formatting */}
                    <button 
                      className="format-btn" 
                      onClick={() => applyEditorCommand('bold')}
                      title="Bold (Ctrl+B)"
                    >
                      <Bold size={16} />
                    </button>
                    <button 
                      className="format-btn" 
                      onClick={() => applyEditorCommand('italic')}
                      title="Italic (Ctrl+I)"
                    >
                      <Italic size={16} />
                    </button>
                    <button 
                      className="format-btn" 
                      onClick={() => applyEditorCommand('underline')}
                      title="Underline (Ctrl+U)"
                    >
                      <Underline size={16} />
                    </button>
                    <button 
                      className="format-btn" 
                      onClick={() => applyEditorCommand('strikeThrough')}
                      title="Strikethrough"
                    >
                      <span style={{ textDecoration: 'line-through', fontSize: '14px', fontWeight: 'bold' }}>S</span>
                    </button>
                    
                    <div className="toolbar-divider"></div>
                    
                    {/* Colors */}
                    <input
                      type="color"
                      className="format-color"
                      value={colorPickerValue}
                      onMouseDown={saveEditorSelection}
                      onChange={(e) => applyEditorColor(e.target.value)}
                      title="Text Color"
                    />
                    
                    <div className="toolbar-divider"></div>
                    
                    {/* Lists */}
                    <button 
                      className="format-btn" 
                      onClick={() => applyEditorCommand('insertUnorderedList')}
                      title="Bullet List"
                    >
                      <List size={16} />
                    </button>
                    <button 
                      className="format-btn" 
                      onClick={() => applyEditorCommand('insertOrderedList')}
                      title="Numbered List"
                    >
                      <ListOrdered size={16} />
                    </button>
                    
                    {/* Alignment */}
                    <button 
                      className="format-btn" 
                      onClick={() => applyEditorCommand('justifyLeft')}
                      title="Align Left"
                    >
                      <AlignLeft size={16} />
                    </button>
                    <button 
                      className="format-btn" 
                      onClick={() => applyEditorCommand('justifyCenter')}
                      title="Align Center"
                    >
                      <span style={{ fontSize: '16px' }}>≡</span>
                    </button>
                    <button 
                      className="format-btn" 
                      onClick={() => applyEditorCommand('justifyRight')}
                      title="Align Right"
                    >
                      <span style={{ fontSize: '16px' }}>≣</span>
                    </button>
                    
                    <div className="toolbar-divider"></div>
                    
                    {/* Media & Code */}
                    <button 
                      className="format-btn" 
                      onClick={() => {
                        saveEditorSelection();
                        const url = prompt('Enter URL:');
                        if (url) applyEditorCommand('createLink', url);
                      }}
                      title="Insert Link"
                    >
                      <Link2 size={16} />
                    </button>
                    <button 
                      className="format-btn" 
                      onClick={() => {
                        saveEditorSelection();
                        const url = prompt('Enter image URL:');
                        if (url) applyEditorCommand('insertImage', url);
                      }}
                      title="Insert Image"
                    >
                      <Image size={16} />
                    </button>
                    <button 
                      className="format-btn" 
                      onClick={() => {
                        // Insert a new code block
                        const newBlock = {
                          id: Date.now() + Math.random(),
                          type: 'code',
                          content: '',
                          properties: { language: 'javascript' }
                        };
                        const newBlocks = [...noteBlocks, newBlock];
                        setNoteBlocks(newBlocks);
                        handleBlocksChange(newBlocks);
                      }}
                      title="Insert Code Block"
                    >
                      <Code size={16} />
                    </button>
                    
                    <div className="toolbar-divider"></div>
                    
                    {/* AI */}
                    <button 
                      className="format-btn" 
                      onClick={() => setShowAIAssistant(true)}
                      title="AI Assistant"
                    >
                      <Sparkles size={16} />
                    </button>
                  </div>
                </div>
              )}
              
              {/* Page Properties */}
              {showPageProperties && !isSharedContent && (
                <PageProperties
                  properties={pageProperties}
                  onChange={(newProps) => {
                    setPageProperties(newProps);
                    // Save properties with note
                    if (selectedNote) {
                      // You can save this to the note's properties field
                                          }
                  }}
                  readOnly={viewMode === "preview"}
                />
              )}

              {/* Exit Preview Button */}
              {viewMode === "preview" && (
                <button
                  className="exit-preview-btn"
                  onClick={() => setViewMode("edit")}
                  title="Exit preview mode"
                >
                  <X size={18} />
                  Exit Preview
                </button>
              )}

              <div className={`block-editor-container ${editorDarkMode ? 'dark-mode' : ''}`}>
                <SimpleBlockEditor
                  blocks={noteBlocks}
                  onChange={handleBlocksChange}
                  onOpenCanvas={handleOpenCanvasBlock}
                  focusBlockId={pendingFocusBlockId}
                  readOnly={viewMode === "preview" || (isSharedContent && !canEdit)}
                  darkMode={editorDarkMode}
                  typingFontFamily={
                    FONTS.find((font) => font.label === customFont)?.family || "'Inter', sans-serif"
                  }
                  typingTextColor={typingTextColor}
                  typingFontSize={typingFontSize}
                />
              </div>

              {/* AI Floating Button on Selection */}
              {showAIFloatingButton && !isSharedContent && (
                <div
                  className="ai-floating-button"
                  style={{
                    position: 'fixed',
                    top: aiFloatingPosition.top,
                    left: aiFloatingPosition.left,
                    transform: 'translateX(-50%)',
                    zIndex: 1000
                  }}
                >
                  <button
                    onClick={() => {
                      setSelectedText(selectedTextContent);
                      setShowAIAssistant(true);
                      setShowAIFloatingButton(false);
                    }}
                    className={`ai-assist-btn ${editorDarkMode ? 'dark' : 'light'}`}
                  >
                    <Sparkles size={16} />
                    AI Assist
                  </button>
                </div>
              )}
            </div>

            <div className="note-footer">
              <div className="footer-left">
                <span className="stat-item">
                  {wordCount} {wordCount === 1 ? "word" : "words"}
                </span>
                <span className="stat-divider">-</span>
                <span className="stat-item">
                  {charCount} {charCount === 1 ? "character" : "characters"}
                </span>
              </div>
              <div className="footer-right">
                {saving ? (
                  <span className="saving-indicator">Saving...</span>
                ) : saveError ? (
                  <span className="save-error-indicator">Save interrupted — edit to retry</span>
                ) : autoSaved ? (
                  <span className="saved-indicator">Saved <Check size={14} /></span>
                ) : (
                  <span className="unsaved-indicator">Unsaved</span>
                )}
              </div>
            </div>

              {/* Backlinks Panel */}
              {selectedNote && backlinks.length > 0 && !isSharedContent && (
                <div className="nr-backlinks-wrap">
                  <BacklinksPanel
                    backlinks={backlinks}
                    onNoteClick={selectNote}
                  />
                </div>
              )}
            </div>

            </main>
          </div>
        ) : (
          <div className="empty-state-new">
            <div className="empty-icon-large"></div>
            <h2>No Note Selected</h2>
            <p>Select a note from the sidebar or create a new one to get started</p>
            {!isSharedContent && (
              <button className="btn-create-empty" onClick={createNewNote}>
                Create New Note
              </button>
            )}
          </div>
        )}
      </div> {/* Close nr-body */}

      {showAIButton && (
        <div
          className="ai-floating-button"
          style={{
            position: "absolute",
            top: `${aiButtonPosition.top}px`,
            left: `${aiButtonPosition.left}px`,
            opacity: showAIButton ? 1 : 0,
          }}
          onClick={handleAIButtonClick}
        >
          <span className="ai-button-icon"></span>
          <span className="ai-button-text">Ask AI</span>
        </div>
      )}

      {showAIDropdown && (
        <>
          <div className="ai-overlay" onClick={() => setShowAIDropdown(false)} />
          <div
            className="ai-dropdown-new"
            style={{
              position: "fixed",
              top: `${aiDropdownPosition.top}px`,
              left: `${aiDropdownPosition.left}px`,
            }}
          >
            <div className="ai-dropdown-header">
              <span className="ai-icon"></span>
              <span>AI Content Generator</span>
            </div>
            <input
              ref={aiInputRef}
              type="text"
              className="ai-prompt-input"
              value={aiPrompt}
              placeholder="e.g., Explain quantum entanglement, Write a summary about..."
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !generatingAI) generateAIContent();
                if (e.key === "Escape") setShowAIDropdown(false);
              }}
              disabled={generatingAI}
            />
            <div className="ai-examples">
              <button 
                onClick={() => {
                  setAiPrompt("Explain this concept in simple terms");
                  quickAIAction("explain");
                }}
                disabled={generatingAI}
              >
                Explain
              </button>
              <button 
                onClick={() => {
                  setAiPrompt("Give me 5 key points");
                  quickAIAction("key_points");
                }}
                disabled={generatingAI}
              >
                Key Points
              </button>
              <button 
                onClick={() => {
                  setAiPrompt("Write a detailed guide");
                  quickAIAction("guide");
                }}
                disabled={generatingAI}
              >
                Guide
              </button>
              <button 
                onClick={() => quickAIAction("summary")}
                disabled={generatingAI}
              >
                Summarize
              </button>
            </div>
            <div className="ai-dropdown-actions">
              <button
                className="ai-btn-cancel"
                onClick={() => setShowAIDropdown(false)}
                disabled={generatingAI}
              >
                Cancel
              </button>
              <button
                className="ai-btn-generate"
                onClick={generateAIContent}
                disabled={generatingAI || !aiPrompt.trim()}
              >
                {generatingAI ? (
                  <>
                    <span className="spinner"></span> Generating...
                  </>
                ) : (
                  <>Generate</>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {showAIAssistant && (
        <>
          <div className="ai-overlay" onClick={() => setShowAIAssistant(false)} />
          <div className="ai-assistant-modal">
            <div className="ai-assistant-header">
              <h3>AI Writing Assistant</h3>
              <button
                className="modal-close-btn"
                onClick={() => setShowAIAssistant(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="ai-assistant-content">
              <div className="ai-assistant-section">
                <label>Quick Actions (Click to Execute):</label>
                <div className="ai-action-buttons">
                  <button
                    className={`ai-action-btn ${aiAssistAction === 'grammar' ? 'active' : ''}`}
                    onClick={() => handleQuickAction('grammar')}
                    disabled={generatingAI}
                    title="Fix grammar and spelling errors"
                  >
                    Fix Grammar
                  </button>
                  <button
                    className={`ai-action-btn ${aiAssistAction === 'improve' ? 'active' : ''}`}
                    onClick={() => handleQuickAction('improve')}
                    disabled={generatingAI}
                    title="Improve clarity and style"
                  >
                    Improve
                  </button>
                  <button
                    className={`ai-action-btn ${aiAssistAction === 'simplify' ? 'active' : ''}`}
                    onClick={() => handleQuickAction('simplify')}
                    disabled={generatingAI}
                    title="Make text simpler and easier to understand"
                  >
                    Simplify
                  </button>
                  <button
                    className={`ai-action-btn ${aiAssistAction === 'expand' ? 'active' : ''}`}
                    onClick={() => handleQuickAction('expand')}
                    disabled={generatingAI}
                    title="Add more details and examples"
                  >
                    Expand
                  </button>
                  <button
                    className={`ai-action-btn ${aiAssistAction === 'summarize' ? 'active' : ''}`}
                    onClick={() => handleQuickAction('summarize')}
                    disabled={generatingAI}
                    title="Create a concise summary"
                  >
                    Summarize
                  </button>
                  <button
                    className={`ai-action-btn ${aiAssistAction === 'continue' ? 'active' : ''}`}
                    onClick={() => handleQuickAction('continue')}
                    disabled={generatingAI}
                    title="Continue writing from where text ends"
                  >
                    Continue Writing
                  </button>
                </div>
              </div>

              <div className="ai-assistant-divider"></div>

              <div className="ai-assistant-section">
                <label>Advanced Actions:</label>
                <div className="ai-action-buttons">
                  <button
                    className={`ai-action-btn ${aiAssistAction === 'generate' ? 'active' : ''}`}
                    onClick={() => setAiAssistAction('generate')}
                    disabled={generatingAI}
                  >
                    <Sparkles size={14} style={{ marginRight: '4px', display: 'inline' }} />
                    Generate Content
                  </button>
                  <button
                    className={`ai-action-btn ${aiAssistAction === 'tone_change' ? 'active' : ''}`}
                    onClick={() => setAiAssistAction('tone_change')}
                    disabled={generatingAI}
                  >
                    Change Tone
                  </button>
                  <button
                    className={`ai-action-btn ${aiAssistAction === 'code' ? 'active' : ''}`}
                    onClick={() => setAiAssistAction('code')}
                    disabled={generatingAI}
                  >
                    <Code size={14} style={{ marginRight: '4px', display: 'inline' }} />
                    Code
                  </button>
                  <button
                    className={`ai-action-btn explain-only ${aiAssistAction === 'explain_only' ? 'active' : ''}`}
                    onClick={() => setAiAssistAction('explain_only')}
                    disabled={generatingAI}
                    title="Get explanation without modifying text"
                  >
                    <Eye size={14} style={{ marginRight: '4px', display: 'inline' }} />
                    Explain Only
                  </button>
                </div>
              </div>

              {aiAssistAction === 'tone_change' && (
                <div className="ai-assistant-section">
                  <label>Select Tone:</label>
                  <select
                    value={aiAssistTone}
                    onChange={(e) => setAiAssistTone(e.target.value)}
                    className="tone-selector"
                  >
                    <option value="professional">Professional</option>
                    <option value="casual">Casual</option>
                    <option value="formal">Formal</option>
                    <option value="friendly">Friendly</option>
                    <option value="academic">Academic</option>
                    <option value="creative">Creative</option>
                    <option value="persuasive">Persuasive</option>
                  </select>
                </div>
              )}

              <div className="ai-assistant-section">
                <label>{aiAssistAction === 'generate' ? 'Topic or Prompt:' : 'Text to Process:'}</label>
                <textarea
                  className={`ai-text-input ${aiAssistAction === 'code' ? 'code-mode' : ''}`}
                  placeholder={
                    aiAssistAction === 'generate' 
                      ? 'Enter a topic or prompt to generate content about...' 
                      : aiAssistAction === 'code' 
                        ? 'Enter or paste your code here...' 
                        : 'Enter text or select text in the editor...'
                  }
                  value={selectedText}
                  onChange={(e) => setSelectedText(e.target.value)}
                  rows={8}
                />
              </div>

              <div className="ai-assistant-section">
                <label>Voice to Text:</label>
                <div className="voice-to-text-container">
                  <button
                    className={`voice-record-btn ${isRecording ? 'recording' : ''}`}
                    onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                    disabled={processingVoice}
                  >
                    {isRecording ? (
                      <>
                        <MicOff size={18} />
                        <span className="recording-indicator"></span>
                        Stop Recording
                      </>
                    ) : processingVoice ? (
                      <>
                        <span className="spinner"></span>
                        Processing...
                      </>
                    ) : (
                      <>
                        <Mic size={18} />
                        Start Voice Recording
                      </>
                    )}
                  </button>
                  {voiceTranscript && (
                    <div className="voice-transcript-preview">
                      <label>Transcript:</label>
                      <p>{voiceTranscript}</p>
                    </div>
                  )}
                  <p className="voice-help-text">
                    Click to record your voice. AI will transcribe and respond to your question.
                  </p>
                </div>
              </div>

              <div className="ai-assistant-actions">
                <button
                  className="ai-btn-cancel"
                  onClick={() => setShowAIAssistant(false)}
                  disabled={generatingAI || processingVoice}
                >
                  Cancel
                </button>
                {/* Only show Process button for advanced actions that need configuration */}
                {(aiAssistAction === 'generate' || aiAssistAction === 'tone_change' || aiAssistAction === 'code' || aiAssistAction === 'explain_only') && (
                  <button
                    className="ai-btn-generate"
                    onClick={() => aiWritingAssist()}
                    disabled={generatingAI || processingVoice}
                  >
                    {generatingAI ? (
                      <>
                        <span className="spinner"></span> Processing...
                      </>
                    ) : (
                      <>Process Text</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* AI Suggestion Modal - Shows AI changes for approval with inline diff */}
      {showAISuggestionModal && aiSuggestion && (
        <>
          <div className="ai-overlay" onClick={rejectAISuggestion} />
          <div className="ai-suggestion-modal">
            <div className="ai-suggestion-header">
              <h3>
                <Sparkles size={20} />
                {aiSuggestion.action === 'explain' || aiSuggestion.action === 'explain_only' 
                  ? 'AI Explanation' 
                  : `AI ${aiSuggestion.action?.charAt(0).toUpperCase() + aiSuggestion.action?.slice(1) || 'Suggestion'}`}
              </h3>
              <button
                className="modal-close-btn"
                onClick={rejectAISuggestion}
              >
                <X size={20} />
              </button>
            </div>

            <div className="ai-suggestion-content">
              {/* Show original text with strikethrough for non-explain actions */}
              {aiSuggestion.action !== 'explain' && aiSuggestion.action !== 'explain_only' && (
                <div className="ai-suggestion-section">
                  <label className="ai-suggestion-label">
                    <span className="label-icon remove">−</span>
                    Before
                  </label>
                  <div className="ai-suggestion-text original">
                    <span
                      dangerouslySetInnerHTML={{
                        __html: sanitizeHtml(
                          diffView.hasInlineDiff
                            ? (diffView.beforeHtml.trim() ? diffView.beforeHtml : '<span class="ai-empty-state">No existing text selected.</span>')
                            : (diffView.original?.trim()
                              ? `<span class="diff-removed">${escapeHtml(diffView.original)}</span>`
                              : '<span class="ai-empty-state">No existing text selected.</span>')
                        )
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Show suggested/new text with highlight - render HTML properly */}
              <div className="ai-suggestion-section">
                <label className="ai-suggestion-label">
                  <span className={`label-icon ${aiSuggestion.action === 'explain' || aiSuggestion.action === 'explain_only' ? 'info' : 'add'}`}>
                    {aiSuggestion.action === 'explain' || aiSuggestion.action === 'explain_only' ? 'i' : '+'}
                  </span>
                  {aiSuggestion.action === 'explain' || aiSuggestion.action === 'explain_only' 
                    ? 'Explanation' 
                    : 'After'}
                </label>
                <div 
                  className={`ai-suggestion-text suggested ${aiSuggestion.action === 'explain' || aiSuggestion.action === 'explain_only' ? 'explanation-only' : ''}`}
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(
                      aiSuggestion.action === 'explain' || aiSuggestion.action === 'explain_only'
                        ? `<div>${aiSuggestion.suggested}</div>`
                        : (diffView.hasInlineDiff
                          ? diffView.afterHtml
                          : `<div class="diff-added-content">${aiSuggestion.suggestedHtml || diffView.suggested}</div>`)
                    )
                  }}
                />
              </div>

              {/* Hint text */}
              {aiSuggestion.action !== 'explain' && aiSuggestion.action !== 'explain_only' && (
                <p className="ai-suggestion-hint">
                  Review the changes above. The <span className="hint-removed">red text</span> will be replaced with the <span className="hint-added">green text</span>.
                </p>
              )}
            </div>

            <div className="ai-suggestion-actions">
              <button
                className="ai-suggestion-btn reject"
                onClick={rejectAISuggestion}
              >
                <X size={16} />
                {aiSuggestion.action === 'explain' || aiSuggestion.action === 'explain_only' ? 'Close' : 'Reject'}
              </button>
              {aiSuggestion.action !== 'explain' && aiSuggestion.action !== 'explain_only' && (
                <button
                  className="ai-suggestion-btn apply"
                  onClick={applyAISuggestion}
                >
                  <Check size={16} />
                  Accept
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {showFolderModal && (
        <>
          <div className="ai-overlay" onClick={() => setShowFolderModal(false)} />
          <div className="folder-modal">
            <div className="folder-modal-header">
              <h3>Create New Folder</h3>
              <button
                className="modal-close-btn"
                onClick={() => setShowFolderModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="folder-modal-content">
              <input
                type="text"
                className="folder-name-input"
                placeholder="Folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createFolder();
                }}
              />
              <div className="color-picker-section">
                <label>Folder Color:</label>
                <div className="color-picker-options">
                  {['#D7B38C', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE'].map(color => (
                    <button
                      key={color}
                      className={`color-option ${newFolderColor === color ? 'active' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setNewFolderColor(color)}
                    />
                  ))}
                </div>
              </div>
              <div className="folder-modal-actions">
                <button
                  className="ai-btn-cancel"
                  onClick={() => setShowFolderModal(false)}
                >
                  Cancel
                </button>
                <button className="ai-btn-generate" onClick={createFolder}>
                  Create Folder
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {showChatImport && (
        <>
          <div className="chat-import-overlay" onClick={() => setShowChatImport(false)} />
          <div className="chat-import-modal-new" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-new">
              <h2>Convert Chat to Notes</h2>
              <button className="modal-close-btn" onClick={() => setShowChatImport(false)}><X size={20} /></button>
            </div>
            <div className="modal-content-new">
              <div className="import-mode-section-new">
                <h3>Choose Import Style</h3>
                <div className="import-mode-options-new">
                  {["summary", "exam_prep", "full"].map((mode) => (
                    <label
                      key={mode}
                      className={`mode-option-new ${importMode === mode ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        value={mode}
                        checked={importMode === mode}
                        onChange={(e) => setImportMode(e.target.value)}
                      />
                      <div className="mode-content-new">
                        <strong>
                          {mode === "summary"
                            ? "Study Notes"
                            : mode === "exam_prep"
                            ? "Exam Prep Guide"
                            : "Full Transcript"}
                        </strong>
                        <p>
                          {mode === "summary"
                            ? "Organized key concepts and explanations."
                            : mode === "exam_prep"
                            ? "Comprehensive structured study guide."
                            : "Complete conversation record."}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="sessions-section-new">
                <div className="sessions-header-new">
                  <h3>Select Chat Sessions ({selectedSessions.length} selected)</h3>
                  <div className="selection-actions-new">
                    <button onClick={selectAllSessions} className="select-all-btn-new">
                      Select All
                    </button>
                    <button onClick={clearAllSessions} className="clear-all-btn-new">
                      Clear All
                    </button>
                  </div>
                </div>
                <div className="sessions-list-new">
                  {chatSessions.length === 0 ? (
                    <div className="no-sessions-new">
                      <p>No chat sessions available</p>
                    </div>
                  ) : (
                    chatSessions.map((session) => (
                      <label
                        key={session.id}
                        className={`session-item-new ${selectedSessions.includes(session.id) ? "selected" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSessions.includes(session.id)}
                          onChange={() => handleSessionToggle(session.id)}
                        />
                        <div className="session-info-new">
                          <div className="session-title-new">{session.title || "Untitled Session"}</div>
                          <div className="session-date-new">
                            {formatDateTime(session.updated_at || session.created_at) || 'Unknown'}
                          </div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="modal-footer-new">
              <button
                className="cancel-btn-new"
                onClick={() => setShowChatImport(false)}
                disabled={importing}
              >
                Cancel
              </button>
              <button
                className="import-btn-new"
                onClick={convertChatToNote}
                disabled={importing || selectedSessions.length === 0}
              >
                {importing ? (
                  <>
                    <span className="spinner"></span> Converting...
                  </>
                ) : (
                  <>Convert to Note</>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      <CustomPopup
        isOpen={popup.isOpen}
        onClose={closePopup}
        title={popup.title}
        message={popup.message}
      />

      {/* Advanced Search */}
      {showAdvancedSearch && !isSharedContent && (
        <>
          <div className="ai-overlay" onClick={() => setShowAdvancedSearch(false)} />
          <AdvancedSearch
            notes={notes}
            folders={folders}
            onSelectNote={selectNote}
            onClose={() => setShowAdvancedSearch(false)}
          />
        </>
      )}

      {/* Templates */}
      {showTemplates && !isSharedContent && (
        <>
          <div className="ai-overlay" onClick={() => setShowTemplates(false)} />
          <Templates
            onSelectTemplate={handleTemplateSelect}
            onClose={() => setShowTemplates(false)}
            userName={userName}
            hasExistingContent={noteContent && noteContent.trim().length > 0}
          />
        </>
      )}

      {/* Recently Viewed */}
      {showRecentlyViewed && !isSharedContent && (
        <>
          <div className="ai-overlay" onClick={() => setShowRecentlyViewed(false)} />
          <div className="recently-viewed-modal">
            <RecentlyViewed
              items={recentlyViewed}
              onSelect={(id) => {
                const note = notes.find(n => n.id === id);
                if (note) {
                  selectNote(note);
                }
                setShowRecentlyViewed(false);
              }}
              onClose={() => setShowRecentlyViewed(false)}
            />
          </div>
        </>
      )}

      {/* Canvas Mode */}
      {showCanvasMode && !isSharedContent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}>
          <CanvasMode
            initialContent={canvasBlockId ? getCanvasBlockContent(canvasBlockId) : canvasData}
            onClose={() => {
              setShowCanvasMode(false);
              setCanvasBlockId(null);
            }}
            onSave={(newCanvasData, shouldClose = false, previewData) => {
              if (canvasBlockId) {
                const updatedBlocks = noteBlocks.map((block) => {
                  if (String(block.id) !== String(canvasBlockId)) return block;
                  return {
                    ...block,
                    properties: {
                      ...block.properties,
                      canvasData: newCanvasData,
                      canvasPreview: previewData !== undefined
                        ? previewData
                        : (block.properties?.canvasPreview || '')
                    }
                  };
                });

                let finalBlocks = updatedBlocks;
                if (shouldClose) {
                  const currentIndex = updatedBlocks.findIndex((block) => String(block.id) === String(canvasBlockId));
                  let nextBlock = updatedBlocks[currentIndex + 1];
                  if (!nextBlock) {
                    const currentBlock = updatedBlocks[currentIndex];
                    const newBlock = {
                      id: Date.now() + Math.random(),
                      type: 'paragraph',
                      content: '',
                      properties: {},
                      parent_block_id: currentBlock?.parent_block_id || null
                    };
                    finalBlocks = [...updatedBlocks, newBlock];
                    nextBlock = newBlock;
                  }
                  setPendingFocusBlockId(nextBlock?.id || null);
                }
                handleBlocksChange(finalBlocks);
              } else {
                setCanvasData(newCanvasData);
              }

              if (shouldClose) {
                setShowCanvasMode(false);
                setCanvasBlockId(null);
                autoSave();
              }
            }}
          />
        </div>
      )}

      {/* Smart Folders */}
      {showSmartFolders && !isSharedContent && (
        <>
          <div 
            className="ai-overlay" 
            style={{ zIndex: 10000 }} 
            onClick={() => setShowSmartFolders(false)} 
          />
          <SmartFolders
            notes={notes}
            onFolderSelect={(filteredNotes, folderName) => {
                            // You can add logic here to display filtered notes
              setShowSmartFolders(false);
            }}
            onClose={() => setShowSmartFolders(false)}
          />
        </>
      )}

      {/* Keyboard Shortcuts Panel */}
      <KeyboardShortcuts
        isOpen={showKeyboardShortcuts}
        onClose={() => setShowKeyboardShortcuts(false)}
      />
      
      {/* Import/Export Modal */}
      <ImportExportModal
        isOpen={showImportExport}
        onClose={() => setShowImportExport(false)}
        mode="import"
        sourceType="notes"
        onSuccess={(result) => {
          if (result.shouldNavigate) {
            // Navigate based on destination type
            if (result.destinationType === 'flashcards') {
              // Navigate to flashcards with the set ID
              if (result.set_id) {
                navigate(`/flashcards?set_id=${result.set_id}&mode=preview`);
              } else {
                navigate('/flashcards');
              }
            } else if (result.destinationType === 'questions') {
              // Navigate to question bank
              navigate('/question-bank');
            } else if (result.destinationType === 'podcast') {
              const noteIds = Array.isArray(result.note_ids) ? result.note_ids.join(',') : '';
              const route = noteIds ? `/notes/podcast?note_ids=${encodeURIComponent(noteIds)}` : '/notes/podcast';
              navigate(route, { state: { podcastPayload: result } });
            } else if (result.destinationType === 'notes') {
              // Navigate to the created note
              if (result.note_id) {
                navigate(`/notes/editor/${result.note_id}`);
              } else {
                loadNotes();
              }
            }
          } else {
            showPopup("Success", `Successfully converted notes!`);
            loadNotes();
          }
        }}
      />

      {/* Navigate to New Note Dialog */}
      {showNavigateDialog && (
        <>
          <div className="ai-overlay" onClick={handleStayOnCurrentNote}></div>
          <div className="navigate-dialog-modal">
            <div className="navigate-dialog-header">
              <h3>Note Created Successfully!</h3>
            </div>
            <div className="navigate-dialog-content">
              <p>
                Your note <strong>"{newNoteTitle}"</strong> has been created from the chat conversation.
              </p>
              <p>Would you like to open the new note now?</p>
            </div>
            <div className="navigate-dialog-actions">
              <button
                className="navigate-btn-secondary"
                onClick={handleStayOnCurrentNote}
              >
                Stay Here
              </button>
              <button
                className="navigate-btn-primary"
                onClick={handleNavigateToNewNote}
              >
                Open New Note
              </button>
            </div>
          </div>
        </>
      )}

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

export default NotesRedesign;
