import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sparkles, Clock, Users, BookOpen, FileText, Layers, ChevronRight, ChevronLeft, X, Filter, Calendar, Play, HelpCircle, RefreshCw, Edit, MessageCircle, Target, Brain, BarChart3, LogIn, UserPlus, LogOut, AlertTriangle } from 'lucide-react';
import './SearchHub.css';
import SocialHubChrome from '../components/SocialHubChrome';
import { API_URL } from '../config/api';
import { signOutAppSession } from '../utils/authSession';
import ContextSelector from '../components/ContextSelector';
import ContextPanel from '../components/ContextPanel';
import contextService from '../services/contextService';
import MathRenderer from '../components/MathRenderer';
import { queueLegacyAIEndpoint, queuedAIFormFetch, queuedAIJsonFetch, USE_AI_JOB_QUEUE } from '../services/aiJobService';
import { buildSearchHubChatHandoff } from '../utils/searchHubHandoff';

const COMMAND_HIGHLIGHT_PALETTE = [
  '#7dd3fc',
  '#fda4af',
  '#86efac',
  '#f9a8d4',
  '#fcd34d',
  '#a5b4fc',
  '#fca5a5',
  '#6ee7b7',
  '#c4b5fd',
  '#fb923c',
  '#67e8f9',
  '#bef264',
];

const DEFAULT_COMMANDS = [
  'flashcards',
  'notes',
  'questions',
  'quiz',
  'path',
  'chat',
  'explain',
  'search',
  'progress',
  'weak',
  'achievements',
  'learning-paths',
  'review',
  'help',
];

const normalizeCommandToken = (value = '') => String(value || '').trim().replace(/^\/+/, '').toLowerCase();

const extractCommandFromQuery = (value = '') => {
  const match = String(value || '').trimStart().match(/^[/:>!]([a-z0-9][a-z0-9-]*)/i);
  return match ? normalizeCommandToken(match[1]) : '';
};

const SUGGESTION_COMMANDS = [
  { pattern: 'create', suggestions: [
    { text: 'create a learning path on {topic}', icon: '', action: 'create_learning_path', description: 'AI generates a structured path' },
    { text: 'create a path on {topic}', icon: '', action: 'create_learning_path', description: 'AI generates a structured path' },
    { text: 'create a knowledge map for {topic}', icon: '', action: 'create_knowledge_map', description: 'AI generates a structured map' },
    { text: 'create a note on {topic}', icon: '', action: 'create_note', description: 'AI writes comprehensive notes' },
    { text: 'create 10 flashcards on {topic}', icon: '', action: 'create_flashcards', description: 'AI generates study cards' },
    { text: 'create 15 flashcards on {topic}', icon: '', action: 'create_flashcards', description: 'More cards for deeper study' },
    { text: 'create questions on {topic}', icon: '', action: 'create_questions', description: 'AI creates practice questions' },
    { text: 'create a quiz on {topic}', icon: '', action: 'create_quiz', description: 'Start quiz immediately' },
  ]},
  { pattern: 'make', suggestions: [
    { text: 'make a learning path for {topic}', icon: '', action: 'create_learning_path', description: 'AI generates a structured path' },
    { text: 'make a path for {topic}', icon: '', action: 'create_learning_path', description: 'AI generates a structured path' },
    { text: 'make a knowledge map for {topic}', icon: '', action: 'create_knowledge_map', description: 'AI generates a structured map' },
    { text: 'make a note about {topic}', icon: '', action: 'create_note', description: 'AI writes comprehensive notes' },
    { text: 'make flashcards for {topic}', icon: '', action: 'create_flashcards', description: 'AI generates study cards' },
    { text: 'make a quiz about {topic}', icon: '', action: 'create_quiz', description: 'Start quiz immediately' },
    { text: 'make questions about {topic}', icon: '', action: 'create_questions', description: 'AI creates practice questions' },
  ]},
  { pattern: 'generate', suggestions: [
    { text: 'generate a learning path for {topic}', icon: '', action: 'create_learning_path', description: 'AI generates a structured path' },
    { text: 'generate a path for {topic}', icon: '', action: 'create_learning_path', description: 'AI generates a structured path' },
    { text: 'generate a knowledge map for {topic}', icon: '', action: 'create_knowledge_map', description: 'AI generates a structured map' },
    { text: 'generate flashcards on {topic}', icon: '', action: 'create_flashcards', description: 'AI generates study cards' },
    { text: 'generate questions on {topic}', icon: '', action: 'create_questions', description: 'AI creates practice questions' },
    { text: 'generate a study guide for {topic}', icon: '', action: 'create_note', description: 'Comprehensive study guide' },
  ]},
  { pattern: 'write', suggestions: [
    { text: 'write a note on {topic}', icon: '', action: 'create_note', description: 'AI writes comprehensive notes' },
    { text: 'write about {topic}', icon: '', action: 'create_note', description: 'AI writes comprehensive notes' },
  ]},
  { pattern: 'learn', suggestions: [
    { text: 'learn {topic} step by step', icon: '', action: 'create_learning_path', description: 'Structured learning path' },
    { text: 'learn about {topic}', icon: '', action: 'explain', description: 'Get AI explanation' },
    { text: 'learn {topic} from scratch', icon: '', action: 'create_learning_path', description: 'Beginner-friendly path' },
  ]},
  { pattern: 'path', suggestions: [
    { text: 'path on {topic}', icon: '', action: 'create_learning_path', description: 'Create learning path' },
    { text: 'path for {topic}', icon: '', action: 'create_learning_path', description: 'Create learning path' },
    { text: 'learning path on {topic}', icon: '', action: 'create_learning_path', description: 'Structured path' },
  ]},
  { pattern: 'map', suggestions: [
    { text: 'knowledge map for {topic}', icon: '', action: 'create_knowledge_map', description: 'Create knowledge map' },
    { text: 'knowledge map on {topic}', icon: '', action: 'create_knowledge_map', description: 'Create knowledge map' },
    { text: 'study map for {topic}', icon: '', action: 'create_knowledge_map', description: 'Structured study map' },
  ]},
  { pattern: 'teach', suggestions: [
    { text: 'teach me {topic}', icon: '', action: 'explain', description: 'Interactive AI tutoring' },
    { text: 'teach me about {topic}', icon: '', action: 'explain', description: 'Interactive AI tutoring' },
  ]},
  { pattern: 'study', suggestions: [
    { text: 'study {topic} systematically', icon: '', action: 'create_learning_path', description: 'Structured learning path' },
    { text: 'study {topic}', icon: '', action: 'create_flashcards', description: 'Create flashcards to study' },
    { text: 'study my flashcards', icon: '', action: 'review_flashcards', description: 'Review your cards' },
    { text: 'study weak areas', icon: '', action: 'show_weak_areas', description: 'Focus on improvements' },
  ]},
  { pattern: 'adapt', suggestions: [
    { text: 'adapt difficulty to my level', icon: '', action: 'adapt_difficulty' },
    { text: 'adapt content for me', icon: '', action: 'adapt_content' },
  ]},
  { pattern: 'review', suggestions: [
    { text: 'review flashcards', icon: '', action: 'review_flashcards' },
    { text: 'review weak flashcards', icon: '', action: 'review_flashcards' },
    { text: "review what I'll forget next", icon: '', action: 'predict_forgetting' },
  ]},
  { pattern: 'show', suggestions: [
    { text: 'show my learning paths', icon: '', action: 'show_learning_paths' },
    { text: 'show my progress', icon: '', action: 'show_progress' },
    { text: 'show weak areas', icon: '', action: 'show_weak_areas' },
    { text: 'show my achievements', icon: '', action: 'show_achievements' },
    { text: 'show my learning style', icon: '', action: 'show_learning_style' },
    { text: 'show knowledge gaps', icon: '', action: 'show_knowledge_gaps' },
  ]},
  { pattern: 'find', suggestions: [
    { text: 'find my knowledge blind spots', icon: '', action: 'show_knowledge_gaps' },
    { text: 'find my study twin', icon: '', action: 'find_study_twin' },
    { text: 'find complementary learners', icon: '', action: 'find_complementary' },
  ]},
  { pattern: 'what', suggestions: [
    { text: 'what is {topic}', icon: '', action: 'explain', description: 'Get AI explanation' },
    { text: 'what am I weak in', icon: '', action: 'show_weak_areas' },
    { text: 'what is my learning style', icon: '', action: 'show_learning_style' },
    { text: "what will I forget next", icon: '', action: 'predict_forgetting' },
    { text: 'what are my knowledge gaps', icon: '', action: 'show_knowledge_gaps' },
    { text: 'what should I study next', icon: '', action: 'suggest_next_topic' },
  ]},
  { pattern: 'how', suggestions: [
    { text: 'how does {topic} work', icon: '', action: 'explain', description: 'Detailed explanation' },
    { text: 'how to {topic}', icon: '', action: 'explain', description: 'Step-by-step guide' },
    { text: 'how am I doing', icon: '', action: 'show_progress', description: 'View your progress' },
  ]},
  { pattern: 'explain', suggestions: [
    { text: 'explain {topic}', icon: '', action: 'explain', description: 'Clear AI explanation' },
    { text: 'explain {topic} step-by-step', icon: '', action: 'explain' },
    { text: "explain like I'm 5", icon: '', action: 'eli5' },
    { text: 'explain with examples', icon: '', action: 'explain_examples' },
  ]},
  { pattern: 'summarize', suggestions: [
    { text: 'summarize {topic}', icon: '', action: 'summarize' },
    { text: 'summarize my notes on {topic}', icon: '', action: 'summarize_notes' },
  ]},
  { pattern: 'quiz', suggestions: [
    { text: 'quiz me on {topic}', icon: '', action: 'create_quiz', description: 'Start quiz immediately' },
    { text: 'quiz me on weak areas', icon: '', action: 'quiz_weak' },
  ]},
  { pattern: 'test', suggestions: [
    { text: 'test me on {topic}', icon: '', action: 'create_quiz', description: 'Start quiz immediately' },
    { text: 'test my knowledge of {topic}', icon: '', action: 'create_quiz' },
  ]},
  { pattern: 'optimize', suggestions: [
    { text: 'optimize my retention', icon: '', action: 'optimize_retention' },
    { text: 'optimize my study schedule', icon: '', action: 'optimize_schedule' },
  ]},
  { pattern: 'predict', suggestions: [
    { text: "predict what I'll forget next", icon: '', action: 'predict_forgetting' },
    { text: 'predict my performance', icon: '', action: 'predict_performance' },
  ]},
  { pattern: 'detect', suggestions: [
    { text: 'detect my burnout risk', icon: '', action: 'detect_burnout' },
    { text: 'detect knowledge gaps', icon: '', action: 'show_knowledge_gaps' },
  ]},
  { pattern: 'chat', suggestions: [
    { text: 'chat about {topic}', icon: '', action: 'start_chat', description: 'Start AI conversation' },
    { text: 'chat with AI about {topic}', icon: '', action: 'start_chat' },
  ]},
  { pattern: 'talk', suggestions: [
    { text: 'talk about {topic}', icon: '', action: 'start_chat', description: 'Start AI conversation' },
  ]},
  { pattern: 'search', suggestions: [
    { text: 'search for {topic}', icon: '', action: 'search', description: 'Search your content' },
    { text: 'search notes about {topic}', icon: '', action: 'search_notes' },
    { text: 'search flashcards about {topic}', icon: '', action: 'search_flashcards' },
  ]},
];

const GENERIC_TOKENS = new Set([
  'flashcards', 'flashcard', 'notes', 'note', 'quiz', 'quizzes',
  'roadmap', 'map', 'path', 'plan', 'study', 'learning', 'guide',
  'review', 'overview', 'summary', 'explain', 'practice',
]);

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'into', 'over',
  'about', 'your', 'their', 'there', 'what', 'which', 'when', 'where',
  'will', 'would', 'could', 'should', 'have', 'has', 'had', 'are', 'was',
  'were', 'been', 'being', 'you', 'your', 'our', 'they', 'them', 'than',
]);

const SearchHub = () => {
  const navigate = useNavigate();
  const searchInputRef = useRef(null);
  const searchHighlightRef = useRef(null);
  const mainScrollRef = useRef(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [recentSearches, setRecentSearches] = useState([]);
  const [userName, setUserName] = useState('');
  
  const [isCreating, setIsCreating] = useState(false);
  const [creatingMessage, setCreatingMessage] = useState('');
  
  const [personalizedPrompts, setPersonalizedPrompts] = useState([]);
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(true);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpContext, setFollowUpContext] = useState(null);
  const [commandCatalog, setCommandCatalog] = useState([]);
  const [showCommandGuide, setShowCommandGuide] = useState(false);
  
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    content_types: 'all',
    sort_by: 'relevance',
    date_from: '',
    date_to: ''
  });
  
  const [didYouMean, setDidYouMean] = useState(null);
  const [relatedSearches, setRelatedSearches] = useState([]);
  
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);  
  const [autocompleteResults, setAutocompleteResults] = useState([]);
  const [selectedAutocompleteIndex, setSelectedAutocompleteIndex] = useState(-1);
  const autocompleteDebounceRef = useRef(null);
  const [showLoginMessage, setShowLoginMessage] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [hsMode, setHsMode] = useState(() => localStorage.getItem('hs_mode_enabled') === 'true');
  const [userDocCount, setUserDocCount] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth > 768 : true
  ));
  const handleSidebarCollapsedChange = useCallback((collapsed) => {
    setIsSidebarOpen(!collapsed);
  }, []);

  
  const [sessionId] = useState(() => `searchhub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const CREATE_TIMEOUT_MS = 30000;

  const commandAliasMap = useMemo(() => {
    const aliasMap = new Map();
    commandCatalog.forEach((cmd) => {
      const canonical = normalizeCommandToken(cmd.command);
      if (!canonical) return;
      aliasMap.set(canonical, canonical);
      (cmd.aliases || []).forEach((alias) => {
        const normalizedAlias = normalizeCommandToken(alias);
        if (normalizedAlias) {
          aliasMap.set(normalizedAlias, canonical);
        }
      });
    });

    DEFAULT_COMMANDS.forEach((name) => {
      const normalized = normalizeCommandToken(name);
      if (!aliasMap.has(normalized)) {
        aliasMap.set(normalized, normalized);
      }
    });

    return aliasMap;
  }, [commandCatalog]);

  const commandColorMap = useMemo(() => {
    const namesFromCatalog = commandCatalog
      .map((cmd) => normalizeCommandToken(cmd.command))
      .filter(Boolean);
    const uniqueNames = [...new Set(namesFromCatalog.length > 0 ? namesFromCatalog : DEFAULT_COMMANDS)];
    const colorMap = new Map();

    uniqueNames.forEach((name, index) => {
      colorMap.set(name, COMMAND_HIGHLIGHT_PALETTE[index % COMMAND_HIGHLIGHT_PALETTE.length]);
    });

    return colorMap;
  }, [commandCatalog]);

  const getCommandColorFromName = (commandName = '') => {
    const normalized = normalizeCommandToken(commandName);
    if (!normalized) return null;
    const canonical = commandAliasMap.get(normalized) || normalized;
    return commandColorMap.get(canonical) || null;
  };

  const getCommandColorFromText = (value = '') => {
    const commandName = extractCommandFromQuery(value);
    return getCommandColorFromName(commandName);
  };

  const renderHighlightedSearchQuery = (value) => {
    if (!value) return null;

    const query = String(value);
    const commandMatch = query.match(/^(\s*)([/:>!])([a-z0-9-]*)(.*)$/i);
    if (!commandMatch) {
      return <span className="sh-hl-text">{query}</span>;
    }

    const [, leading = '', prefix = '', command = '', rest = ''] = commandMatch;
    const commandColor = getCommandColorFromName(command) || 'var(--accent)';
    const commandTail = rest ? rest.split(/(\s+)/) : [];

    return (
      <>
        {leading && <span className="sh-hl-text">{leading}</span>}
        <span className="sh-hl-command" style={{ color: commandColor }}>{prefix}{command}</span>
        {commandTail.map((token, idx) => {
          if (!token) return null;
          if (/^\s+$/.test(token)) {
            return <span key={`ws-${idx}`} className="sh-hl-text">{token}</span>;
          }
          if (/^--[a-z0-9-]+$/i.test(token)) {
            return <span key={`flag-${idx}`} className="sh-hl-flag">{token}</span>;
          }
          if (/^\d+(?:\.\d+)?$/.test(token)) {
            return <span key={`num-${idx}`} className="sh-hl-number">{token}</span>;
          }
          return <span key={`txt-${idx}`} className="sh-hl-text">{token}</span>;
        })}
      </>
    );
  };

  const syncSearchHighlightScroll = (event) => {
    if (searchHighlightRef.current) {
      searchHighlightRef.current.scrollLeft = event.target.scrollLeft;
    }
  };

  const fetchWithTimeout = async (url, options = {}, timeoutMs = CREATE_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const safeJson = async (response) => {
    try {
      return await response.json();
    } catch (error) {
      return null;
    }
  };

  const navigateToCreateFallback = (type, topic, count = 10) => {
    if (type === 'flashcards') {
      navigate('/flashcards');
      return;
    }
    if (type === 'notes') {
      navigate('/notes');
      return;
    }
    if (type === 'questions' || type === 'quiz') {
      navigate('/question-bank');
      return;
    }
    if (type === 'ai-chat') {
      navigate('/ai-chat', { state: { initialMessage: topic } });
    }
  };

  const loadRecentSearches = (username) => {
    const saved = localStorage.getItem(`recentSearches_${username}`);
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch (error) { /* silenced */ }
    }
  };

  const getUsedRecommendationKeys = (username) => {
    if (!username) return new Set();
    const raw = localStorage.getItem(`searchhub_used_recs_${username}`);
    if (!raw) return new Set();
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.map(key => String(key)));
      }
    } catch (error) { /* silenced */ }
    return new Set();
  };

  const markRecommendationUsed = (username, rec) => {
    if (!username || !rec) return;
    const topic = (rec.topic || extractTopicName(rec.text || '') || '').toLowerCase();
    const action = inferActionType(rec.text || '');
    if (!topic || !action) return;
    const key = `${topic}:${action}`;
    const used = getUsedRecommendationKeys(username);
    if (used.has(key)) return;
    used.add(key);
    localStorage.setItem(`searchhub_used_recs_${username}`, JSON.stringify(Array.from(used)));
  };

  useEffect(() => {
    const username = localStorage.getItem('username');
    const token = localStorage.getItem('token');

    if (username && token) {
      setUserName(username);
      loadRecentSearches(username);
      loadPersonalizedPrompts(username);
    } else {
      setUserName('');
      const defaultPrompts = [
        { text: '/chat', reason: 'AI tutor ready to help', priority: 'high' },
        { text: '/notes', reason: 'Capture notes', priority: 'medium' },
        { text: '/flashcards', reason: 'Study with flashcards', priority: 'medium' },
        { text: '/weak', reason: 'Identify gaps', priority: 'high' },
        { text: '/progress', reason: 'Track your journey', priority: 'low' },
      ];
      setPersonalizedPrompts(finalizeRecommendations(defaultPrompts));
      setIsLoadingPrompts(false);
    }

    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }

    loadCommandCatalog();
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
    const handleKeyPress = (e) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      if (e.key === '?' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        setShowCommandGuide(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  useEffect(() => {
    
    const handleClickOutside = (e) => {
      const searchWrapper = searchInputRef.current?.closest('.sh-search-wrap');
      if (searchWrapper && !searchWrapper.contains(e.target)) {
        setShowAutocomplete(false);
        setShowSuggestions(false);
        setSelectedAutocompleteIndex(-1);
      }
    };

    if (showAutocomplete || showSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showAutocomplete, showSuggestions]);

  useEffect(() => {
    
    let scrollTimeout;
    const pageElement = document.querySelector('.sh-root');
    
    const handleScroll = () => {
      if (pageElement) {
        pageElement.classList.add('is-scrolling');
        
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          pageElement.classList.remove('is-scrolling');
        }, 1000); 
      }
    };

    if (pageElement) {
      pageElement.addEventListener('scroll', handleScroll);
      return () => {
        pageElement.removeEventListener('scroll', handleScroll);
        clearTimeout(scrollTimeout);
      };
    }
  }, []);

  const GENERIC_TOKENS = new Set([
    'flashcards', 'flashcard', 'notes', 'note', 'quiz', 'quizzes',
    'roadmap', 'map', 'path', 'plan', 'study', 'learning', 'guide',
    'review', 'overview', 'summary', 'explain', 'practice'
  ]);

  const stripHtml = (text = '') => text.replace(/<[^>]*>/g, ' ');

  const extractTopicFromFreeText = (text) => {
    if (!text) return null;
    const cleaned = text
      .toLowerCase()
      .replace(/[?!.,:;(){}[\]"'`~]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return null;
    const words = cleaned
      .split(' ')
      .filter(word => word.length > 2 && !STOPWORDS.has(word) && !GENERIC_TOKENS.has(word));

    if (!words.length) return null;
    const topicWords = words.slice(0, 3);
    return topicWords.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const extractTopicFromNote = (note) => {
    if (!note) return null;
    const title = (note.title || '').trim();
    const titleTopic = extractTopicName(title);
    if (titleTopic && titleTopic.toLowerCase() !== 'new note') return titleTopic;

    const content = stripHtml(note.content || note.preview || '');
    const headingMatch = content.match(/^\s*#+\s+(.+)$/m);
    if (headingMatch && headingMatch[1]) {
      const headingTopic = extractTopicFromFreeText(headingMatch[1]);
      if (headingTopic) return headingTopic;
    }

    const firstLine = content.split('\n').map(line => line.trim()).find(Boolean) || '';
    return extractTopicFromFreeText(firstLine) || extractTopicFromFreeText(content);
  };

  const extractTopicFromTitle = (title) => {
    if (!title) return null;
    const trimmed = title.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (['new chat', 'chat', 'untitled', 'session'].includes(lower)) return null;
    const cleaned = trimmed.replace(/^(practice:|quiz:|set:|flashcards?:|notes?:|chat:)\s*/i, '').trim();
    return extractTopicName(cleaned) || extractTopicFromFreeText(cleaned);
  };

  const extractTopicName = (text) => {
    if (!text) return null;
    
    
    let cleaned = text
      .toLowerCase()
      .replace(/[?!.,:;]+/g, ' ')
      .replace(/^(explain|create|make|generate|write|what is|tell me about|learn about|study|understand|summarize|summary|overview|review|practice|quiz on|notes on|flashcards on|about|a quiz on|a note on)\s+/gi, '')
      .replace(/\s+(flashcards?|notes?|quiz|quizzes|roadmap|knowledge map|map|export|step-by-step)$/gi, '')
      .trim();

    
    if (cleaned.startsWith('/')) {
      const parts = cleaned.replace(/^\/+/, '').split(/\s+/);
      if (parts.length >= 2) {
        cleaned = parts.slice(1).join(' ').trim();
      } else {
        return null;
      }
    }
    
    
    const prefixMatch = cleaned.match(/^(?:learning path|study plan|study guide|flashcards?|notes?|quiz(?:zes)?|roadmap|knowledge map|map|path)\s+(?:on|about|for|of)?\s*(.+)$/i);
    if (prefixMatch && prefixMatch[1]) {
      cleaned = prefixMatch[1].trim();
    }

    
    const onMatch = cleaned.match(/(?:on|about|for|of)\s+(.+)/i);
    if (onMatch && onMatch[1]) {
      cleaned = onMatch[1].trim();
    }
    
    
    const words = cleaned.split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) return null;
    
    
    if (words.every(word => GENERIC_TOKENS.has(word))) {
      return null;
    }

    const topicWords = words.slice(0, 4);
    return topicWords.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const inferActionType = (text = '') => {
    const safeText = typeof text === 'string' ? text.trim() : '';
    const lower = safeText.toLowerCase();
    const command = lower.startsWith('/') ? lower.slice(1).split(/\s+/)[0] : '';

    if (command) {
      if (command === 'flashcards') return 'flashcards';
      if (command === 'notes') return 'notes';
      if (command === 'quiz') return 'quiz';
      if (command === 'path') return 'path';
      if (command === 'chat') return 'chat';
      if (command === 'weak') return 'weak';
      if (command === 'progress') return 'progress';
      if (command === 'review') return 'review';
    }

    if (lower.includes('flashcard')) return 'flashcards';
    if (lower.includes('note')) return 'notes';
    if (lower.includes('quiz')) return 'quiz';
    if (lower.includes('path') || lower.includes('roadmap') || lower.includes('knowledge map') || lower.includes('study plan')) return 'path';
    if (lower.includes('chat') || lower.includes('talk')) return 'chat';
    if (lower.includes('weak')) return 'weak';
    if (lower.includes('progress')) return 'progress';
    if (lower.includes('review')) return 'review';
    if (lower.startsWith('explain') || lower.includes(' explain ')) return 'explain';
    if (lower.startsWith('learn') || lower.includes(' learn ')) return 'learn';

    return '';
  };

  const actionLabelForType = (type) => {
    switch (type) {
      case 'flashcards':
        return 'Flashcards';
      case 'notes':
        return 'Notes';
      case 'quiz':
        return 'Quiz';
      case 'path':
        return 'Path';
      case 'chat':
        return 'Chat';
      case 'weak':
        return 'Weakness';
      case 'progress':
        return 'Progress';
      case 'review':
        return 'Review';
      case 'explain':
        return 'Explain';
      case 'learn':
        return 'Learn';
      default:
        return '';
    }
  };

  const buildActionCommand = (type, topic) => {
    const safeTopic = (topic || '').trim();
    switch (type) {
      case 'flashcards':
      case 'notes':
      case 'quiz':
      case 'path':
      case 'chat':
        return safeTopic ? `/${type} ${safeTopic}` : `/${type}`;
      case 'review':
        return '/review';
      case 'weak':
        return '/weak';
      case 'progress':
        return '/progress';
      case 'explain':
        return safeTopic ? `/explain ${safeTopic}` : '/explain';
      case 'learn':
        return safeTopic ? `learn ${safeTopic}` : 'learn';
      default:
        return safeTopic ? safeTopic : '/chat';
    }
  };

  const extractTopicFromContextResult = (result) => {
    const meta = result?.metadata || {};
    const subject = (meta.subject || '').trim();
    if (subject && subject.toLowerCase() !== 'general') {
      return subject
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }

    const filename = (meta.filename || '').trim();
    if (filename) {
      const base = filename.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
      const cleaned = base.replace(/\b(chapter|unit|lesson|notes?|doc|document|slides?)\b/gi, ' ');
      const fromFile = extractTopicName(cleaned);
      if (fromFile) return fromFile;
    }

    return extractTopicName(result?.text || '');
  };

  const buildRecommendationLabel = (text, topic) => {
    const safeText = typeof text === 'string' ? text.trim() : '';
    const topicName = (topic || extractTopicName(safeText) || '').trim();
    const topicWords = topicName ? topicName.split(/\s+/) : [];

    const pickTopic = (maxWords) => topicWords.slice(0, maxWords).join(' ');
    const topicLabel = topicName ? pickTopic(2) : '';

    const actionType = inferActionType(safeText);
    const actionLabel = actionLabelForType(actionType);

    if (topicLabel && actionLabel) return `${topicLabel} ${actionLabel}`;
    if (topicLabel) return topicLabel;
    if (actionLabel) return actionLabel;

    return 'Suggested Topic';
  };

  const finalizeRecommendations = (items) => items.map(item => ({
    ...item,
    label: item.label || buildRecommendationLabel(item.text, item.topic)
  }));

  const loadPersonalizedPrompts = async (username) => {
    setIsLoadingPrompts(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('user_id', username);
      
      const response = await fetch(`${API_URL}/get_personalized_prompts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        
        
        const backendPrompts = (data.prompts || []).map(prompt => ({
          text: typeof prompt.text === 'string' ? prompt.text : (prompt.text?.label || ''),
          reason: typeof prompt.reason === 'string' ? prompt.reason : (prompt.reason?.label || 'Based on your activity'),
          priority: prompt.priority || 'medium',
          topic: extractTopicName(typeof prompt.text === 'string' ? prompt.text : (prompt.text?.label || ''))
        })).filter(p => p.text);

        const topicSignals = new Map();
        const usedRecommendationKeys = getUsedRecommendationKeys(username);
        const addTopicSignal = (topic, { score = 1, action = '', source = 'activity' } = {}) => {
          const topicKey = (topic || '').trim();
          if (!topicKey) return;
          const key = topicKey.toLowerCase();
          const entry = topicSignals.get(key) || {
            topic: topicKey,
            score: 0,
            actionCounts: {},
            sources: new Set(),
            sourceActions: {}
          };
          entry.score += score;
          if (action) {
            entry.actionCounts[action] = (entry.actionCounts[action] || 0) + 1;
          }
          if (source) {
            entry.sources.add(source);
            if (action) entry.sourceActions[source] = action;
          }
          topicSignals.set(key, entry);
        };

        backendPrompts.forEach(prompt => {
          if (prompt.topic) {
            const action = inferActionType(prompt.text);
            addTopicSignal(prompt.topic, { score: 1, action, source: 'activity' });
          }
        });

        const savedRecent = localStorage.getItem(`recentSearches_${username}`);
        let recentSeeds = [];
        if (savedRecent) {
          try {
            recentSeeds = JSON.parse(savedRecent);
          } catch (error) {
            recentSeeds = [];
          }
        }
        if (!recentSeeds.length) {
          recentSeeds = recentSearches;
        }

        recentSeeds.forEach((query, index) => {
          const topic = extractTopicName(query);
          if (topic) {
            const action = inferActionType(query);
            addTopicSignal(topic, { score: Math.max(1, 3 - index), action, source: 'recent' });
          }
        });

        const fetchNoteTopics = async () => {
          try {
            const response = await fetch(`${API_URL}/get_notes?user_id=${encodeURIComponent(username)}&summary=true&limit=50`, {
              headers: { Authorization: `Bearer ${token}` },
              cache: 'no-store'
            });
            if (!response.ok) return [];
            const data = await response.json();
            const notes = (data || [])
              .filter(note => !note.is_deleted)
              .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
            const topics = [];
            const seen = new Set();
            for (const note of notes) {
              const topic = extractTopicFromNote(note);
              if (!topic) continue;
              const key = topic.toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);
              topics.push({
                topic,
                updatedAt: note.updated_at || note.created_at || null
              });
              if (topics.length >= 8) break;
            }
            return topics;
          } catch (error) {
            return [];
          }
        };

        const fetchDocumentTopics = async () => {
          try {
            const docData = await contextService.listDocuments();
            const docs = docData?.user_docs || [];
            const sortedDocs = docs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            const topics = [];
            const seen = new Set();
            for (const doc of sortedDocs) {
              const topic = doc.subject && doc.subject.trim()
                ? doc.subject.trim()
                : extractTopicName(doc.filename || '');
              if (!topic) continue;
              const key = topic.toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);
              topics.push({
                topic,
                createdAt: doc.created_at || null
              });
              if (topics.length >= 8) break;
            }
            return topics;
          } catch (error) {
            return [];
          }
        };

        const fetchFlashcardTopics = async () => {
          try {
            const response = await fetch(`${API_URL}/get_flashcard_history?user_id=${username}&limit=20`, {
              headers: { Authorization: `Bearer ${token}` },
              cache: 'no-store'
            });
            if (!response.ok) return [];
            const data = await response.json();
            const history = data?.flashcard_history || [];
            const topics = [];
            const seen = new Set();
            for (const set of history) {
              const topic = extractTopicFromTitle(set.title) || extractTopicFromFreeText(set.description || '');
              if (!topic) continue;
              const key = topic.toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);
              topics.push({
                topic,
                updatedAt: set.updated_at || set.created_at || null
              });
              if (topics.length >= 8) break;
            }
            return topics;
          } catch (error) {
            return [];
          }
        };

        const fetchQuestionSetTopics = async () => {
          try {
            const response = await fetch(`${API_URL}/get_question_sets?user_id=${username}`, {
              headers: { Authorization: `Bearer ${token}` },
              cache: 'no-store'
            });
            if (!response.ok) return [];
            const data = await response.json();
            const sets = data?.question_sets || [];
            const topics = [];
            const seen = new Set();
            for (const set of sets) {
              const topic = extractTopicFromTitle(set.title) || extractTopicFromFreeText(set.description || '');
              if (!topic) continue;
              const key = topic.toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);
              topics.push({
                topic,
                updatedAt: set.updated_at || set.created_at || null
              });
              if (topics.length >= 8) break;
            }
            return topics;
          } catch (error) {
            return [];
          }
        };

        const fetchChatTopics = async () => {
          try {
            const response = await fetch(`${API_URL}/get_chat_sessions?user_id=${encodeURIComponent(username)}&limit=50`, {
              headers: { Authorization: `Bearer ${token}` },
              cache: 'no-store'
            });
            if (!response.ok) return [];
            const data = await response.json();
            const sessions = data?.sessions || [];
            const topics = [];
            const seen = new Set();
            for (const session of sessions) {
              const topic = extractTopicFromTitle(session.title);
              if (!topic) continue;
              const key = topic.toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);
              topics.push({
                topic,
                updatedAt: session.updated_at || session.created_at || null
              });
              if (topics.length >= 8) break;
            }
            return topics;
          } catch (error) {
            return [];
          }
        };

        const fetchLearningPathTopics = async () => {
          try {
            const response = await fetch(`${API_URL}/learning-paths`, {
              headers: { Authorization: `Bearer ${token}` },
              cache: 'no-store'
            });
            if (!response.ok) return [];
            const data = await response.json();
            const paths = data?.paths || [];
            const topics = [];
            const seen = new Set();
            for (const path of paths) {
              const topic = extractTopicFromTitle(path.title) || extractTopicFromFreeText(path.topic_prompt || path.description || '');
              if (!topic) continue;
              const key = topic.toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);
              topics.push({
                topic,
                updatedAt: path.updated_at || path.created_at || null
              });
              if (topics.length >= 8) break;
            }
            return topics;
          } catch (error) {
            return [];
          }
        };

        const fetchPlaylistTopics = async () => {
          try {
            const response = await fetch(`${API_URL}/playlists?my_playlists=true`, {
              headers: { Authorization: `Bearer ${token}` },
              cache: 'no-store'
            });
            if (!response.ok) return [];
            const data = await response.json();
            const playlists = data?.playlists || [];
            const topics = [];
            const seen = new Set();
            for (const playlist of playlists) {
              const topic = extractTopicFromTitle(playlist.title) || extractTopicFromFreeText(playlist.description || playlist.category || '');
              if (!topic) continue;
              const key = topic.toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);
              topics.push({
                topic,
                updatedAt: playlist.created_at || null
              });
              if (topics.length >= 8) break;
            }
            return topics;
          } catch (error) {
            return [];
          }
        };

        const [
          noteTopics,
          documentTopics,
          flashcardTopics,
          questionTopics,
          chatTopics,
          learningPathTopics,
          playlistTopics
        ] = await Promise.all([
          fetchNoteTopics(),
          fetchDocumentTopics(),
          fetchFlashcardTopics(),
          fetchQuestionSetTopics(),
          fetchChatTopics(),
          fetchLearningPathTopics(),
          fetchPlaylistTopics()
        ]);

        noteTopics.forEach(entry => {
          const updatedAt = entry.updatedAt ? new Date(entry.updatedAt).getTime() : Date.now();
          const ageDays = Math.max(0, (Date.now() - updatedAt) / (1000 * 60 * 60 * 24));
          const score = ageDays <= 3 ? 5 : ageDays <= 10 ? 4 : ageDays <= 30 ? 3 : 2;
          addTopicSignal(entry.topic, { score, action: 'notes', source: 'notes' });
        });

        flashcardTopics.forEach(entry => {
          const updatedAt = entry.updatedAt ? new Date(entry.updatedAt).getTime() : Date.now();
          const ageDays = Math.max(0, (Date.now() - updatedAt) / (1000 * 60 * 60 * 24));
          const score = ageDays <= 5 ? 4 : ageDays <= 20 ? 3 : 2;
          addTopicSignal(entry.topic, { score, action: 'flashcards', source: 'flashcards' });
        });

        questionTopics.forEach(entry => {
          const updatedAt = entry.updatedAt ? new Date(entry.updatedAt).getTime() : Date.now();
          const ageDays = Math.max(0, (Date.now() - updatedAt) / (1000 * 60 * 60 * 24));
          const score = ageDays <= 7 ? 4 : ageDays <= 25 ? 3 : 2;
          addTopicSignal(entry.topic, { score, action: 'quiz', source: 'questions' });
        });

        chatTopics.forEach(entry => {
          const updatedAt = entry.updatedAt ? new Date(entry.updatedAt).getTime() : Date.now();
          const ageDays = Math.max(0, (Date.now() - updatedAt) / (1000 * 60 * 60 * 24));
          const score = ageDays <= 3 ? 3 : ageDays <= 14 ? 2 : 1;
          addTopicSignal(entry.topic, { score, action: 'chat', source: 'chat' });
        });

        learningPathTopics.forEach(entry => {
          const updatedAt = entry.updatedAt ? new Date(entry.updatedAt).getTime() : Date.now();
          const ageDays = Math.max(0, (Date.now() - updatedAt) / (1000 * 60 * 60 * 24));
          const score = ageDays <= 7 ? 4 : ageDays <= 30 ? 3 : 2;
          addTopicSignal(entry.topic, { score, action: 'path', source: 'paths' });
        });

        playlistTopics.forEach(entry => {
          const updatedAt = entry.updatedAt ? new Date(entry.updatedAt).getTime() : Date.now();
          const ageDays = Math.max(0, (Date.now() - updatedAt) / (1000 * 60 * 60 * 24));
          const score = ageDays <= 7 ? 3 : ageDays <= 30 ? 2 : 1;
          addTopicSignal(entry.topic, { score, action: 'notes', source: 'playlists' });
        });

        documentTopics.forEach(entry => {
          const createdAt = entry.createdAt ? new Date(entry.createdAt).getTime() : Date.now();
          const ageDays = Math.max(0, (Date.now() - createdAt) / (1000 * 60 * 60 * 24));
          const score = ageDays <= 7 ? 3 : ageDays <= 30 ? 2 : 1;
          addTopicSignal(entry.topic, { score, action: 'flashcards', source: 'docs' });
        });

        const seedQueries = Array.from(
          new Set([
            ...(recentSeeds || []).filter(q => typeof q === 'string' && q.trim().length >= 2),
            ...backendPrompts.map(p => p.topic).filter(Boolean),
            ...noteTopics.map(entry => entry.topic),
            ...documentTopics.map(entry => entry.topic),
            ...flashcardTopics.map(entry => entry.topic),
            ...questionTopics.map(entry => entry.topic),
            ...chatTopics.map(entry => entry.topic),
            ...learningPathTopics.map(entry => entry.topic),
            ...playlistTopics.map(entry => entry.topic),
          ])
        ).slice(0, 5);

        const fetchContextTopics = async () => {
          if (!seedQueries.length) return [];
          const responses = await Promise.all(
            seedQueries.map(query =>
              contextService.searchContext(query, hsMode, 6).catch(() => null)
            )
          );
          const rawResults = responses.flatMap(res => res?.results || []);
          const sorted = rawResults.sort((a, b) => {
            if (a.source === b.source) return 0;
            return a.source === 'private' ? -1 : 1;
          });
          const topics = [];
          const seen = new Set();
          for (const result of sorted) {
            const topic = extractTopicFromContextResult(result);
            if (!topic) continue;
            const key = topic.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            topics.push({ topic, source: result.source });
            if (topics.length >= 6) break;
          }
          return topics;
        };

        const contextTopics = await fetchContextTopics();
        contextTopics.forEach(({ topic, source }) => {
          const score = source === 'private' ? 6 : 3;
          addTopicSignal(topic, { score, source });
        });

        const fetchRelatedTopics = async (seedTopics) => {
          if (!seedTopics.length) return [];
          try {
            const response = await fetch(`${API_URL}/context/related-topics`, {
              method: 'POST',
              headers: { 
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                topics: seedTopics,
                use_hs: hsMode,
                top_k: 5,
                max_related: 6
              }),
              cache: 'no-store'
            });
            if (!response.ok) return [];
            const data = await response.json();
            return data?.topics || [];
          } catch (error) {
            return [];
          }
        };

        const relatedSeeds = Array.from(topicSignals.values())
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map(entry => entry.topic);

        const relatedTopics = await fetchRelatedTopics(relatedSeeds);
        relatedTopics.forEach((topic, index) => {
          const relatedActions = ['flashcards', 'notes', 'quiz', 'chat'];
          const action = relatedActions[index % relatedActions.length];
          addTopicSignal(topic, { score: 2, action, source: 'related' });
        });

        const sourcePriority = ['private', 'notes', 'flashcards', 'questions', 'chat', 'paths', 'playlists', 'docs', 'related', 'hs', 'recent', 'activity'];
        const rankedTopics = Array.from(topicSignals.values()).sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          const aRank = sourcePriority.findIndex(src => a.sources.has(src));
          const bRank = sourcePriority.findIndex(src => b.sources.has(src));
          return (aRank === -1 ? 99 : aRank) - (bRank === -1 ? 99 : bRank);
        });

        const pickPrimarySource = (entry) => {
          for (const src of sourcePriority) {
            if (entry.sources.has(src)) return src;
          }
          return 'activity';
        };

        const pickActionForEntry = (entry, fallbackAction, preferredAction = '') => {
          if (preferredAction) return preferredAction;
          const actions = entry.actionCounts || {};
          const sorted = Object.entries(actions).sort((a, b) => b[1] - a[1]);
          if (sorted.length > 0) return sorted[0][0];
          return fallbackAction;
        };

        const actionCycle = ['flashcards', 'notes', 'quiz', 'chat'];
        let actionIndex = 0;

        const recommendations = [];
        const maxRecommendations = 8;
        const recommendationKeys = new Set();

        const getRecommendationKey = (rec) => {
          const action = inferActionType(rec.text);
          const topicKey = (rec.topic || extractTopicName(rec.text) || '').toLowerCase();
          if (topicKey && action) return `${topicKey}:${action}`;
          return (rec.text || rec.label || '').toLowerCase();
        };

        const addRecommendation = (rec) => {
          if (recommendations.length >= maxRecommendations) return;
          const key = getRecommendationKey(rec);
          if (key && usedRecommendationKeys.has(key)) return;
          if (key && recommendationKeys.has(key)) return;
          if (key) recommendationKeys.add(key);
          recommendations.push(rec);
        };

        const pickForSource = (source) => {
          if (recommendations.length >= maxRecommendations) return;
          const candidate = rankedTopics.find(entry => entry.sources.has(source) && !(entry._usedSources?.has(source)));
          if (!candidate) return;
          const fallbackAction = actionCycle[actionIndex++ % actionCycle.length];
          const preferredAction = candidate.sourceActions?.[source];
          const action = pickActionForEntry(candidate, fallbackAction, preferredAction);
          const reason = source === 'private'
            ? 'From your context'
            : source === 'notes'
              ? 'From your notes'
              : source === 'flashcards'
                ? 'From your flashcards'
                : source === 'questions'
                  ? 'From your quizzes'
                  : source === 'chat'
                    ? 'From your chats'
                    : source === 'paths'
                      ? 'From your learning paths'
                      : source === 'playlists'
                        ? 'From your playlists'
                        : source === 'related'
                          ? 'Related to your topics'
                    : source === 'docs'
                      ? 'From your uploads'
                      : source === 'hs'
                        ? 'From curriculum'
                        : source === 'recent'
                          ? 'From your searches'
                          : 'Based on your activity';
          addRecommendation({
            text: buildActionCommand(action, candidate.topic),
            reason,
            priority: 'high',
            topic: candidate.topic
          });
          candidate._usedSources = candidate._usedSources || new Set();
          candidate._usedSources.add(source);
        };

        ['private', 'notes', 'flashcards', 'questions', 'chat', 'paths', 'playlists', 'docs', 'related', 'hs', 'recent'].forEach(pickForSource);

        for (const entry of rankedTopics) {
          if (recommendations.length >= maxRecommendations) break;
          const fallbackAction = actionCycle[actionIndex++ % actionCycle.length];
          const action = pickActionForEntry(entry, fallbackAction);
          const source = pickPrimarySource(entry);
          const reason = source === 'private'
            ? 'From your context'
            : source === 'notes'
              ? 'From your notes'
              : source === 'flashcards'
                ? 'From your flashcards'
                : source === 'questions'
                  ? 'From your quizzes'
                  : source === 'chat'
                    ? 'From your chats'
                    : source === 'paths'
                      ? 'From your learning paths'
                      : source === 'playlists'
                        ? 'From your playlists'
                        : source === 'related'
                          ? 'Related to your topics'
                : source === 'docs'
                  ? 'From your uploads'
                  : source === 'hs'
                    ? 'From curriculum'
                    : 'Based on your activity';
          addRecommendation({
            text: buildActionCommand(action, entry.topic),
            reason,
            priority: 'high',
            topic: entry.topic
          });
        }
        
        
        const weakAreaPrompts = backendPrompts.filter(p => 
          p.text.toLowerCase().includes('weak') || 
          p.reason.toLowerCase().includes('weak')
        );
        
        if (weakAreaPrompts.length > 0) {
          addRecommendation({
            text: '/weak',
            reason: 'Focus on weak areas',
            priority: 'high'
          });
        }
        
        
        const reviewPrompt = backendPrompts.find(p => 
          p.text.toLowerCase().includes('review') && 
          !p.text.toLowerCase().includes('weak')
        );
        if (reviewPrompt) {
          addRecommendation({
            text: '/review',
            reason: 'Quick review session',
            priority: 'medium',
          });
        }

        const fallbackActions = [
          { text: '/progress', reason: 'Track your journey', priority: 'low' },
          { text: '/chat', reason: 'Ask your AI tutor', priority: 'low' }
        ];

        for (const fallback of fallbackActions) {
          addRecommendation(fallback);
        }
        
        setPersonalizedPrompts(finalizeRecommendations(recommendations));
      } else {
        
      setPersonalizedPrompts(finalizeRecommendations([
        { text: '/chat', reason: 'AI tutor ready to help', priority: 'high' },
        { text: '/weak', reason: 'Identify knowledge gaps', priority: 'high' },
        { text: '/progress', reason: 'Track your journey', priority: 'medium' }
      ]));
    }
  } catch (error) {
    console.error('Error loading prompts:', error);
    
    setPersonalizedPrompts(finalizeRecommendations([
      { text: '/chat', reason: 'AI tutor ready to help', priority: 'high' },
      { text: '/weak', reason: 'Identify knowledge gaps', priority: 'high' },
      { text: '/progress', reason: 'Track your journey', priority: 'medium' }
    ]));
  } finally {
      setIsLoadingPrompts(false);
    }
  };

  const loadCommandCatalog = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/agents/searchhub/commands`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.commands) {
          setCommandCatalog(data.commands);
        }
      }
    } catch (error) {
    // silenced
  }
  };

  const saveRecentSearch = (query) => {
    const updated = [query, ...recentSearches.filter(q => q !== query)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem(`recentSearches_${userName}`, JSON.stringify(updated));
  };

  const generateSuggestions = (input) => {
    if (!input || input.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const inputLower = input.toLowerCase();
    const commandSuggestions = [];

    for (const command of SUGGESTION_COMMANDS) {
      if (inputLower.includes(command.pattern)) {
        const words = inputLower.split(' ');
        const patternIndex = words.indexOf(command.pattern);
        const topic = words.slice(patternIndex + 1).join(' ');

        command.suggestions.forEach(suggestion => {
          const finalText = suggestion.text.replace('{topic}', topic || '...');
          commandSuggestions.push({
            ...suggestion,
            text: finalText
          });
        });
        break;
      }
    }

    if (commandSuggestions.length > 0) {
      setSuggestions(commandSuggestions.slice(0, 5));
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const isCommandMode = (value) => /^[/:>!]/.test((value || '').trim());

  const buildCommandAutocomplete = (value) => {
    if (!commandCatalog || commandCatalog.length === 0) {
      return [];
    }
    
    const trimmed = (value || '').trim().replace(/^[/:>!]+/, '').toLowerCase();
    const matches = commandCatalog.filter(cmd => {
      const command = (cmd.command || '').toLowerCase();
      const aliases = (cmd.aliases || []).map(a => a.toLowerCase());
      const desc = (cmd.description || '').toLowerCase();
      
      if (!trimmed) return true;
      return (
        command.startsWith(trimmed) ||
        aliases.some(alias => alias.startsWith(trimmed)) ||
        desc.includes(trimmed)
      );
    });

    return matches.slice(0, 8).map(cmd => ({
      text: (cmd.examples && cmd.examples[0]) ? cmd.examples[0] : (cmd.syntax || `/${cmd.command}`),
      type: 'command',
      category: 'Command',
      source: 'commands'
    }));
  };

  const handleSearch = async (query = searchQuery) => {
    if (!query || !query.trim()) {
      return;
    }

    const finalQuery = query.trim();
    setSearchError(null);
    setIsSearching(true);
    setShowSuggestions(false);
    setShowAutocomplete(false);
    saveRecentSearch(finalQuery);

    
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const token = localStorage.getItem('token');
      
      
      let data = null;
      if (USE_AI_JOB_QUEUE) {
        data = await queueLegacyAIEndpoint('/api/agents/searchhub', {
          jsonBody: {
            user_id: userName || 'guest',
            query: finalQuery,
            session_id: sessionId,
            use_hs_context: hsMode
          },
        });
      } else {
        const response = await fetchWithTimeout(`${API_URL}/agents/searchhub`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            user_id: userName || 'guest',
            query: finalQuery,
            session_id: sessionId,
            use_hs_context: hsMode
          })
        });

        if (!response.ok) {
          throw new Error(`Search failed: ${response.status}`);
        }
        data = await safeJson(response) || {};
      }

      if (data) {
        if (data.navigate_to) {
          setIsCreating(true);
          
          
          const confidenceLevel = data.metadata?.confidence || 0;
          let message = data.metadata?.chatbot_message || data.message || 'Processing...';
          
          
          if (confidenceLevel < 0.6 && confidenceLevel > 0) {
            message = `I think you want to: ${message}`;
          }
          setCreatingMessage(message);
          
          
          setTimeout(() => {
            setIsCreating(false);
            
            
            if (data.navigate_params && Object.keys(data.navigate_params).length > 0) {
              navigate(data.navigate_to, { state: data.navigate_params });
            } else {
              navigate(data.navigate_to);
            }
          }, 800);
          return;
        }

        if (data.metadata?.action === 'explain') {
          if (!userName) {
            setShowLoginModal(true);
            return;
          }

          const explainTopic = data.metadata?.topic || finalQuery;
          setIsCreating(true);
          setCreatingMessage(`Opening AI chat for ${explainTopic}...`);
          setTimeout(() => {
            setIsCreating(false);
            navigate('/ai-chat', { state: { initialMessage: `Explain ${explainTopic}` } });
          }, 400);
          return;
        }
        
        
        if (data.metadata?.response_type === 'chat' || data.metadata?.action === 'greeting' || data.metadata?.action === 'show_help') {
          setAiSuggestion({
            description: data.ai_response || data.message,
            suggestions: data.suggestions || data.metadata?.suggestions || [],
            action_buttons: [],
            nlp_metadata: data.metadata,
            isGreeting: data.metadata?.action === 'greeting'
          });
          setSearchResults({
            results: [],
            total_results: 0,
            query: finalQuery,
            has_ai_description: true,
            nlp_action: data.metadata?.action,
            nlp_confidence: data.metadata?.confidence,
            isConversational: true
          });
          return;
        }
        
        
        if (data.search_results && data.search_results.length > 0) {
          setSearchResults({
            results: data.search_results,
            total_results: data.search_results.length,
            query: finalQuery,
            nlp_action: data.metadata?.action,
            nlp_confidence: data.metadata?.confidence
          });
          setAiSuggestion(data.ai_response ? {
            description: data.ai_response,
            suggestions: data.suggestions || data.metadata?.suggestions || [],
            nlp_metadata: data.metadata
          } : null);
        }
        
        else if (data.ai_response) {
          setAiSuggestion({
            description: data.ai_response,
            suggestions: data.suggestions || data.metadata?.suggestions || [],
            action_buttons: data.action_buttons || [],
            nlp_metadata: data.metadata
          });
          setSearchResults({
            results: [],
            total_results: 0,
            query: finalQuery,
            has_ai_description: true,
            nlp_action: data.metadata?.action,
            nlp_confidence: data.metadata?.confidence
          });
        }
        
        else {
          await getAiDescription(finalQuery);
        }
      } else {
        
        console.warn('SearchHub agent failed, falling back to legacy search');
          await legacySearch(finalQuery);
      }
    } catch (error) {
      console.error('Search error:', error);
      setAiSuggestion(null);
      setSearchError({
        title: 'Search is temporarily unavailable',
        message: 'Your request was not completed, so no generated overview is being shown as a substitute. Please retry.',
        detail: error?.message || 'Search service unavailable',
      });
      setSearchResults({ results: [], total_results: 0, query: finalQuery, failed: true });
    } finally {
      setIsSearching(false);
    }
  };

  
  const legacySearch = async (finalQuery) => {
    try {
      const token = localStorage.getItem('token');
      
      
      const intentFormData = new FormData();
      intentFormData.append('user_id', userName || 'guest');
      intentFormData.append('query', finalQuery);
      
      const intentResponse = await fetch(`${API_URL}/detect_search_intent`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: intentFormData
      });
      
      if (intentResponse.ok) {
        const intentData = await intentResponse.json();
        
        
        if (intentData.intent === 'action') {
          await executeAction(intentData);
          return;
        }
      }
      
      
      const formData = new FormData();
      formData.append('user_id', userName || 'guest');
      formData.append('query', finalQuery);
      formData.append('content_types', filters.content_types);
      formData.append('sort_by', filters.sort_by);
      if (filters.date_from) formData.append('date_from', filters.date_from);
      if (filters.date_to) formData.append('date_to', filters.date_to);

      const response = await fetch(`${API_URL}/search_content`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setSearchResults(data);
        setDidYouMean(data.did_you_mean || null);
        setRelatedSearches(data.related_searches || []);
        
        if (data.total_results === 0 || !data.results || data.results.length === 0) {
          await getAiDescription(finalQuery);
        } else {
          setAiSuggestion(data.ai_suggestion || null);
        }
      } else {
        throw new Error('Search failed');
      }
    } catch (error) {
      throw error;
    }
  };

  const getAiDescription = async (topic) => {
    try {
                  const token = localStorage.getItem('token');
      
      
      const formData = new FormData();
      formData.append('user_id', userName || 'guest');
      formData.append('topic', topic);
      
      const response = await queuedAIFormFetch('/generate_topic_description', Object.fromEntries(formData.entries()));
      
            
      if (response.ok) {
        const data = await response.json();
                setAiSuggestion({
          description: data.description || data.summary || `Let me help you learn about ${topic}.`,
          suggestions: [
            `create flashcards on ${topic}`,
            `create a note on ${topic}`,
            `explain ${topic} in detail`,
            `quiz me on ${topic}`
          ]
        });
        
        
        setSearchResults({
          results: [],
          total_results: 0,
          query: topic,
          has_ai_description: true
        });
      } else {
        throw new Error(`AI overview failed: ${response.status}`);
      }
    } catch (error) {
      setAiSuggestion(null);
      setSearchError({
        title: 'AI overview is unavailable',
        message: 'No overview was generated. Your existing search results, if any, are unchanged.',
        detail: error?.message || 'Overview service unavailable',
      });
      setSearchResults(prev => prev || { results: [], total_results: 0, query: topic, failed: true });
    }
  };

  const executeAction = async (intentData) => {
    const { action, parameters } = intentData;
    
    
    if (!userName && ['create_note', 'create_flashcards', 'create_questions', 'create_quiz', 'create_learning_path', 'create_knowledge_map'].includes(action)) {
      setShowLoginModal(true);
      setIsSearching(false);
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      
      switch (action) {
        case 'create_note':
          setIsCreating(true);
          setCreatingMessage(`Creating comprehensive note on ${parameters.topic || 'your topic'}...`);
          
          
          try {
            const noteResponse = await queuedAIJsonFetch('/agents/searchhub/create-note', {
              method: 'POST',
              headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                user_id: userName,
                topic: parameters.topic || searchQuery,
                use_hs_context: hsMode
              })
            });

            if (noteResponse.ok) {
              const noteData = await safeJson(noteResponse);
              if (noteData?.success && noteData.navigate_to) {
                setCreatingMessage(`Created "${noteData.content_title}"! Opening...`);
                setTimeout(() => {
                  setIsCreating(false);
                  navigate(noteData.navigate_to);
                }, 500);
                break;
              }
            }

            setIsCreating(false);
            navigate('/notes');
          } catch (error) {
            console.error('Create note error:', error);
            setIsCreating(false);
            navigate('/notes');
          }
          break;
          
        case 'create_flashcards':
          setIsCreating(true);
          setCreatingMessage(`Creating ${parameters.count || 10} flashcards on ${parameters.topic}...`);
          
          try {
            const fcResponse = await queuedAIJsonFetch('/agents/searchhub/create-flashcards', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                user_id: userName,
                topic: parameters.topic || searchQuery,
                count: parameters.count || 10,
                use_hs_context: hsMode
              })
            });
            
            if (fcResponse.ok) {
              const fcData = await safeJson(fcResponse);
              if (fcData?.success && fcData.navigate_to) {
                setCreatingMessage(`Created "${fcData.content_title}"! Opening...`);
                setTimeout(() => {
                  setIsCreating(false);
                  navigate(fcData.navigate_to);
                }, 500);
                break;
              }
            }
          } catch (error) {
            console.error('Create flashcards error:', error);
          }

          setIsCreating(false);
          navigate('/flashcards');
          break;
          
        case 'create_questions':
          setIsCreating(true);
          setCreatingMessage(`Creating ${parameters.count || 10} questions on ${parameters.topic}...`);
          
          try {
            const qResponse = await queuedAIJsonFetch('/agents/searchhub/create-questions', {
              method: 'POST',
              headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                user_id: userName,
                topic: parameters.topic || searchQuery,
                count: parameters.count || 10,
                use_hs_context: hsMode
              })
            });

            if (qResponse.ok) {
              const qData = await safeJson(qResponse);
              if (qData?.success && qData.navigate_to) {
                setCreatingMessage(`Created "${qData.content_title}"! Opening...`);
                setTimeout(() => {
                  setIsCreating(false);
                  navigate(qData.navigate_to);
                }, 500);
                break;
              }
            }
          } catch (error) {
            console.error('Create questions error:', error);
          }

          setIsCreating(false);
          navigate('/question-bank');
          break;
          
        case 'create_quiz':
          setIsCreating(true);
          setCreatingMessage(`Creating quiz on ${parameters.topic}...`);
          
          try {
            const quizResponse = await queuedAIJsonFetch('/agents/searchhub/create-questions', {
              method: 'POST',
              headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                user_id: userName,
                topic: parameters.topic || searchQuery,
                count: parameters.count || 10,
                use_hs_context: hsMode
              })
            });
            
            if (quizResponse.ok) {
              const quizData = await safeJson(quizResponse);
              if (quizData?.success) {
                const target =
                  quizData.navigate_to ||
                  (quizData.content_id
                    ? `/question-bank?set_id=${quizData.content_id}`
                    : '/question-bank');
                setCreatingMessage('Quiz ready! Starting...');
                setTimeout(() => {
                  setIsCreating(false);
                  navigate(target);
                }, 500);
                break;
              }
            }
          } catch (error) {
            console.error('Create quiz error:', error);
          }

          setIsCreating(false);
          navigate('/question-bank');
          break;

        case 'explain': {
          if (!userName) {
            setShowLoginModal(true);
            setIsSearching(false);
            return;
          }
          const explainTopic = parameters?.topic || searchQuery;
          setIsCreating(true);
          setCreatingMessage(`Opening AI chat for ${explainTopic || 'your topic'}...`);
          setTimeout(() => {
            setIsCreating(false);
            navigate('/ai-chat', {
              state: { initialMessage: `Explain ${explainTopic || 'this topic'}` }
            });
          }, 400);
          break;
        }
          
        case 'start_chat':
          navigate('/ai-chat', { 
            state: { 
              initialMessage: parameters.message || parameters.topic
            } 
          });
          break;
          
        case 'show_progress':
          navigate('/study-insights');
          break;
          
        case 'show_achievements':
          navigate('/study-insights?tab=achievements');
          break;
          
        case 'show_weak_areas':
          navigate('/study-insights?tab=weak');
          break;
          
        case 'review_flashcards':
          navigate('/flashcards');
          break;
          
        case 'create_learning_path':
          setIsCreating(true);
          setCreatingMessage(`Generating learning path for ${parameters.topic}...`);
          
          
          setTimeout(() => {
            setIsCreating(false);
            navigate('/learning-paths', { 
              state: { 
                autoGenerate: true,
                topic: parameters.topic || searchQuery,
                difficulty: parameters.difficulty || 'intermediate',
                length: parameters.length || 'medium'
              } 
            });
          }, 800);
          break;

        case 'create_knowledge_map': {
          const mapTopic = parameters.topic || searchQuery;
          setIsCreating(true);
          setCreatingMessage(`Creating knowledge map for ${mapTopic}...`);

          try {
            const mapResponse = await queuedAIJsonFetch('/create_knowledge_roadmap', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                user_id: userName,
                root_topic: mapTopic
              })
            });

            if (mapResponse.ok) {
              const mapData = await safeJson(mapResponse);
              setIsCreating(false);
              navigate(mapData?.roadmap_id ? `/knowledge-map/${mapData.roadmap_id}` : '/knowledge-map');
              break;
            }
          } catch (error) {
            console.error('Create knowledge map error:', error);
          }

          setIsCreating(false);
          navigate('/knowledge-map');
          break;
        }
          
        case 'show_learning_paths':
          navigate('/learning-paths');
          break;
          
        default:
          
          setIsSearching(false);
          break;
      }
    } catch (error) {
      console.error('Action execution error:', error);
      setIsCreating(false);
      setIsSearching(false);
    }
  };

  const handleAutocomplete = async (query) => {
    
    if (!query || query.trim() === '') {
      showPersonalizedRecommendations();
      return;
    }

    if (isCommandMode(query)) {
      const commandMatches = buildCommandAutocomplete(query);
      if (commandMatches.length > 0) {
        setAutocompleteResults(commandMatches);
        setShowAutocomplete(true);
        return;
      }
    }
    
    if (query.length < 2) {
      setShowAutocomplete(false);
      setAutocompleteResults([]);
      return;
    }

    if (autocompleteDebounceRef.current) {
      clearTimeout(autocompleteDebounceRef.current);
    }

    autocompleteDebounceRef.current = setTimeout(async () => {
      try {
        const token = localStorage.getItem('token');
        
        
        const response = await fetch(`${API_URL}/agents/searchhub/suggestions?query=${encodeURIComponent(query)}&user_id=${encodeURIComponent(userName || 'guest')}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.suggestions && data.suggestions.length > 0) {
            
            const formattedSuggestions = data.suggestions.map(suggestion => {
              const suggestionLower = suggestion.toLowerCase();
              let type = 'nlp_suggestion';
              let category = 'AI Suggestion';

              if (suggestionLower.startsWith('/') || suggestionLower.startsWith(':') || suggestionLower.startsWith('>')) {
                type = 'command';
                category = 'Command';
              }
              
              else if (suggestionLower.includes('knowledge map') || suggestionLower.includes('roadmap')) {
                type = 'create_knowledge_map';
                category = 'Knowledge Map';
              }
              else if (suggestionLower.includes('learning path') || suggestionLower.includes('step by step') || 
                  (suggestionLower.includes('path') && (suggestionLower.includes('create') || suggestionLower.includes('make') || suggestionLower.includes('generate'))) ||
                  suggestionLower.includes('study plan')) {
                type = 'create_learning_path';
                category = 'Learning Path';
              } else if (suggestionLower.includes('flashcard') || suggestionLower.includes('card')) {
                type = 'create_flashcards';
                category = 'Create';
              } else if (suggestionLower.includes('note') || suggestionLower.includes('write')) {
                type = 'create_note';
                category = 'Create';
              } else if (suggestionLower.includes('quiz') || suggestionLower.includes('test')) {
                type = 'create_quiz';
                category = 'Quiz';
              } else if (suggestionLower.includes('question')) {
                type = 'create_questions';
                category = 'Create';
              } else if (suggestionLower.includes('explain') || suggestionLower.includes('what is') || suggestionLower.includes('how does')) {
                type = 'explain';
                category = 'Learn';
              } else if (suggestionLower.includes('progress') || suggestionLower.includes('stats') || suggestionLower.includes('analytics')) {
                type = 'show_progress';
                category = 'Progress';
              } else if (suggestionLower.includes('weak') || suggestionLower.includes('struggle') || suggestionLower.includes('improve')) {
                type = 'show_weak_areas';
                category = 'Weak Areas';
              } else if (suggestionLower.includes('review') || suggestionLower.includes('study') || suggestionLower.includes('practice')) {
                type = 'review';
                category = 'Review';
              } else if (suggestionLower.includes('chat') || suggestionLower.includes('talk') || suggestionLower.includes('discuss')) {
                type = 'chat';
                category = 'Chat';
              } else if (suggestionLower.includes('path')) {
                type = 'show_learning_paths';
                category = 'Learning Path';
              } else {
                type = 'nlp_suggestion';
                category = 'AI';
              }
              
              return { 
                text: suggestion, 
                type, 
                category,
                source: 'nlp' 
              };
            });
            
            setAutocompleteResults(formattedSuggestions.slice(0, 8));
            setShowAutocomplete(true);
            return;
          }
        }
        
        
        const smartSuggestions = generateSmartSuggestions(query);
        if (smartSuggestions.length > 0) {
          setAutocompleteResults(smartSuggestions);
          setShowAutocomplete(true);
          return;
        }
        
        
        const queryLower = query.toLowerCase();
        const filteredRecent = recentSearches
          .filter(search => search.toLowerCase().includes(queryLower))
          .slice(0, 3)
          .map(text => ({ text, type: 'recent', category: 'Recent', source: 'history' }));
        
        const filteredPrompts = personalizedPrompts
          .filter(prompt => prompt.text.toLowerCase().includes(queryLower))
          .slice(0, 5)
          .map(prompt => ({ 
            text: prompt.text, 
            type: 'suggestion', 
            category: 'Suggested',
            source: 'personalized' 
          }));

        const combined = [...filteredRecent, ...filteredPrompts].slice(0, 8);
        
        if (combined.length > 0) {
          setAutocompleteResults(combined);
          setShowAutocomplete(true);
        } else {
          setShowAutocomplete(false);
        }
      } catch (error) {
        setShowAutocomplete(false);
      }
    }, 200);
  };

  const generateSmartSuggestions = (query) => {
    const queryLower = query.toLowerCase();
    const suggestions = [];
    
    
    if (queryLower.includes('create') || queryLower.includes('make') || queryLower.includes('generate')) {
      
      let topic = queryLower
        .replace(/^(create|make|generate)\s+(a\s+)?(learning\s+)?(path|roadmap|knowledge\s+map|study\s+plan)\s+(on|for|about)\s+/i, '')
        .replace(/^(create|make|generate)\s+(a\s+)?/i, '')
        .trim();
      
      
      const pathMatch = topic.match(/(?:path|roadmap|knowledge\s+map|study\s+plan)\s+(?:on|for|about)\s+(.+)/i);
      if (pathMatch) {
        topic = pathMatch[1].trim();
      }
      
      if (topic && topic.length > 2) {
        const mapQuery = queryLower.includes('knowledge map') || queryLower.includes('roadmap');
        suggestions.push(
          mapQuery
            ? { text: `/map ${topic}`, type: 'create_knowledge_map', category: 'Knowledge Map', source: 'smart' }
            : { text: `/path ${topic}`, type: 'create_learning_path', category: 'Learning Path', source: 'smart' },
          { text: `/flashcards ${topic}`, type: 'create_flashcards', category: 'Create', source: 'smart' },
          { text: `/notes ${topic}`, type: 'create_note', category: 'Create', source: 'smart' },
          { text: `/quiz ${topic}`, type: 'create_quiz', category: 'Quiz', source: 'smart' },
          { text: `/questions ${topic}`, type: 'create_questions', category: 'Create', source: 'smart' }
        );
      }
    } else if (queryLower.includes('explain') || queryLower.includes('what is') || queryLower.includes('how')) {
      const topic = queryLower.replace(/^(explain|what is|how does|how to)\s+/i, '').trim();
      if (topic) {
        suggestions.push(
          { text: `/explain ${topic}`, type: 'explain', category: 'Learn', source: 'smart' },
          { text: `/notes ${topic}`, type: 'create_note', category: 'Create', source: 'smart' },
          { text: `/chat ${topic}`, type: 'chat', category: 'Chat', source: 'smart' }
        );
      }
    } else if (queryLower.includes('weak') || queryLower.includes('struggle') || queryLower.includes('improve')) {
      suggestions.push(
        { text: '/weak', type: 'show_weak_areas', category: 'Weak Areas', source: 'smart' },
        { text: '/progress', type: 'show_progress', category: 'Progress', source: 'smart' },
        { text: '/review', type: 'review', category: 'Review', source: 'smart' }
      );
    } else if (queryLower.includes('progress') || queryLower.includes('stats') || queryLower.includes('how am i')) {
      suggestions.push(
        { text: '/progress', type: 'show_progress', category: 'Progress', source: 'smart' },
        { text: '/weak', type: 'show_weak_areas', category: 'Weak Areas', source: 'smart' },
        { text: '/achievements', type: 'show_achievements', category: 'Progress', source: 'smart' }
      );
    } else {
      
      let topic = query.trim();
      
      
      const pathPatternMatch = topic.match(/^(path|roadmap|knowledge\s+map|study\s+plan)\s+(on|for|about)\s+(.+)/i);
      if (pathPatternMatch) {
        const actualTopic = pathPatternMatch[3].trim();
        suggestions.push(
          { text: `/path ${actualTopic}`, type: 'create_learning_path', category: 'Learning Path', source: 'smart' },
          { text: `/explain ${actualTopic}`, type: 'explain', category: 'Learn', source: 'smart' },
          { text: `/flashcards ${actualTopic}`, type: 'create_flashcards', category: 'Create', source: 'smart' },
          { text: `/notes ${actualTopic}`, type: 'create_note', category: 'Create', source: 'smart' }
        );
      } else if (topic.length > 2) {
        suggestions.push(
          { text: `/path ${topic}`, type: 'create_learning_path', category: 'Learning Path', source: 'smart' },
          { text: `/flashcards ${topic}`, type: 'create_flashcards', category: 'Create', source: 'smart' },
          { text: `/explain ${topic}`, type: 'explain', category: 'Learn', source: 'smart' },
          { text: `/notes ${topic}`, type: 'create_note', category: 'Create', source: 'smart' },
          { text: `/quiz ${topic}`, type: 'create_quiz', category: 'Quiz', source: 'smart' },
          { text: `/questions ${topic}`, type: 'create_questions', category: 'Create', source: 'smart' }
        );
      }
    }
    
    return suggestions.slice(0, 6);
  };

  const showPersonalizedRecommendations = async () => {
    
    try {
      const token = localStorage.getItem('token');
      
      
      const promptsResponse = await fetch(`${API_URL}/get_personalized_prompts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: (() => {
          const formData = new FormData();
          formData.append('user_id', userName || 'guest');
          return formData;
        })()
      });

      if (promptsResponse.ok) {
        const promptsData = await promptsResponse.json();
        const userPrompts = promptsData.prompts || [];
        
        
        const topicSuggestions = [];
        
        for (const prompt of userPrompts) {
          const text = typeof prompt.text === 'string' ? prompt.text : (prompt.text?.label || '');
          const textLower = text.toLowerCase();
          
          
          let topic = null;
          
          
          const onMatch = text.match(/(?:on|about|for)\s+(.+?)(?:\s*$|flashcards?|notes?|quiz)/i);
          if (onMatch && onMatch[1]) {
            topic = onMatch[1].trim();
          }

          
          if (!topic && text.trim().startsWith('/')) {
            const parts = text.trim().replace(/^\/+/, '').split(/\s+/);
            if (parts.length >= 2) {
              topic = parts.slice(1).join(' ').trim();
            }
          }
          
          
          if (topic && topic.length > 2) {
            topicSuggestions.push(
              { text: `/path ${topic}`, type: 'create_learning_path', category: 'Learning Path', source: 'personalized' },
              { text: `/flashcards ${topic}`, type: 'create_flashcards', category: 'Create', source: 'personalized' },
              { text: `/explain ${topic}`, type: 'explain', category: 'Learn', source: 'personalized' },
              { text: `/quiz ${topic}`, type: 'create_quiz', category: 'Quiz', source: 'personalized' }
            );
          }
        }
        
        
        const recentItems = recentSearches
          .slice(0, 2)
          .map(text => ({ text, type: 'recent', category: 'Recent', source: 'history' }));
        
        
        const genericSuggestions = [
          { text: '/weak', type: 'show_weak_areas', category: 'Weak Areas', source: 'generic' },
          { text: '/progress', type: 'show_progress', category: 'Progress', source: 'generic' },
          { text: '/chat', type: 'chat', category: 'Chat', source: 'generic' }
        ];
        
        
        const combined = [
          ...recentItems,
          ...topicSuggestions.slice(0, 4),
          ...genericSuggestions
        ].slice(0, 8);
        
        if (combined.length > 0) {
          setAutocompleteResults(combined);
          setShowAutocomplete(true);
          return;
        }
      }
    } catch (error) {
    // silenced
  }
    
    
    const recentItems = recentSearches
      .slice(0, 3)
      .map(text => ({ text, type: 'recent', category: 'Recent', source: 'history' }));
    
    const promptItems = personalizedPrompts
      .slice(0, 5)
      .map(prompt => {
        const textLower = prompt.text.toLowerCase();
        let type = 'suggestion';
        let category = 'Suggested';
        
        if (textLower.includes('knowledge map') || textLower.includes('roadmap')) {
          type = 'create_knowledge_map';
          category = 'Knowledge Map';
        } else if (textLower.includes('learning path') || 
            (textLower.includes('path') && (textLower.includes('create') || textLower.includes('make'))) ||
            textLower.includes('study plan')) {
          type = 'create_learning_path';
          category = 'Learning Path';
        } else if (textLower.includes('flashcard')) {
          type = 'create_flashcards';
          category = 'Create';
        } else if (textLower.includes('note')) {
          type = 'create_note';
          category = 'Create';
        } else if (textLower.includes('quiz')) {
          type = 'create_quiz';
          category = 'Quiz';
        } else if (textLower.includes('weak')) {
          type = 'show_weak_areas';
          category = 'Weak Areas';
        } else if (textLower.includes('progress')) {
          type = 'show_progress';
          category = 'Progress';
        } else if (textLower.includes('chat')) {
          type = 'chat';
          category = 'Chat';
        }
        
        return { text: prompt.text, type, category, source: 'personalized' };
      });

    const combined = [...recentItems, ...promptItems].slice(0, 8);
    
    if (combined.length > 0) {
      setAutocompleteResults(combined);
      setShowAutocomplete(true);
    }
  };

  const getQuickCommands = () => {
    const quickOrder = ['flashcards', 'notes', 'quiz', 'path', 'chat', 'progress', 'weak'];
    const fromCatalog = quickOrder
      .map(name => commandCatalog.find(cmd => cmd.command === name))
      .filter(Boolean)
      .map(cmd => ({
        command: cmd.command,
        syntax: cmd.syntax || `/${cmd.command}`,
        label: cmd.description || ''
      }));

    if (fromCatalog.length > 0) {
      return fromCatalog;
    }

    return [
      { command: 'flashcards', syntax: '/flashcards <topic>', label: 'Study cards' },
      { command: 'notes', syntax: '/notes <topic>', label: 'Study notes' },
      { command: 'quiz', syntax: '/quiz <topic>', label: 'Quick quiz' },
      { command: 'path', syntax: '/path <topic>', label: 'Learning path' },
      { command: 'map', syntax: '/map <topic>', label: 'Knowledge map' },
      { command: 'chat', syntax: '/chat <topic>', label: 'Talk to AI' },
      { command: 'progress', syntax: '/progress', label: 'Your progress' },
      { command: 'weak', syntax: '/weak', label: 'Weak areas' }
    ];
  };

  const handleLogout = () => {
    void signOutAppSession();
    setUserName('');
    window.location.reload();
  };

  const handleShowLoginMessage = () => {
    setShowLoginMessage(true);
    setTimeout(() => setShowLoginMessage(false), 3000);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    generateSuggestions(value);
    handleAutocomplete(value);
  };

  const handleKeyDown = (e) => {
    if (showAutocomplete && autocompleteResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedAutocompleteIndex(prev => 
          prev < autocompleteResults.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedAutocompleteIndex(prev => 
          prev > 0 ? prev - 1 : autocompleteResults.length - 1
        );
      } else if (e.key === 'Enter' && selectedAutocompleteIndex >= 0) {
        e.preventDefault();
        const selected = autocompleteResults[selectedAutocompleteIndex];
        setSearchQuery(selected.text);
        handleSearch(selected.text);
        setShowAutocomplete(false);
      }
    } else if (e.key === 'Enter') {
      handleSearch();
    } else if (e.key === 'Escape') {
      setShowAutocomplete(false);
      setShowSuggestions(false);
    }
  };

  const handleResultClick = (result) => {
    
    if (result.navigate_to) {
      navigate(result.navigate_to);
      return;
    }
    
    
    if (result.type === 'flashcards' || result.type === 'flashcard_deck' || result.type === 'flashcard_set') {
      navigate(`/flashcards?set_id=${result.id}`);
    } else if (result.type === 'notes' || result.type === 'note') {
      navigate(`/notes/editor/${result.id}`);
    } else if (result.type === 'questions' || result.type === 'question_set') {
      navigate(`/question-bank?set_id=${result.id}`);
    } else if (result.type === 'chats' || result.type === 'chat') {
      navigate(`/ai-chat?session_id=${result.id}`);
    } else if (result.type === 'roadmap') {
      navigate(`/knowledge-map/${result.id}`);
    }
  };

  const handleSmartAction = async (e, result, action) => {
    e.stopPropagation();

    if (action.type === 'review') {
      navigate(`/flashcards/${result.id}`);
    } else if (action.type === 'continue_chat') {
      navigate(`/chat/${result.id}`);
    } else if (action.type === 'edit_note') {
      navigate(`/notes/editor/${result.id}`);
    } else if (action.type === 'view_progress') {
      navigate(`/progress`);
    }
  };

  const continueInAIChat = () => {
    if (!userName) {
      setShowLoginModal(true);
      return;
    }

    const handoff = buildSearchHubChatHandoff({
      query: searchQuery,
      aiSuggestion,
      searchResults,
      filters,
      relatedSearches,
      didYouMean,
      hsMode,
    });

    navigate('/ai-chat', {
      state: {
        initialMessage: handoff.displayMessage,
        conversationContext: handoff.conversationContext,
        initialModelMessage: handoff.modelMessage,
      },
    });
  };

  const getSmartActionIcon = (iconName) => {
    const icons = {
      'play': <Play size={14} />,
      'message': <MessageCircle size={14} />,
      'edit': <Edit size={14} />,
      'chart': <BarChart3 size={14} />,
      'target': <Target size={14} />
    };
    return icons[iconName] || <ChevronRight size={14} />;
  };

  const handleCreateContent = async (type) => {
    
    if (!userName) {
      setShowLoginModal(true);
      return;
    }
    
    setIsCreating(true);
    const topic = searchQuery || 'your topic';
    
    const messages = {
      flashcards: `Creating flashcards on ${topic}...`,
      notes: `Creating comprehensive note on ${topic}...`,
      questions: `Creating practice questions on ${topic}...`,
      'ai-chat': 'Starting AI chat...'
    };
    
    setCreatingMessage(messages[type] || 'Creating content...');

    try {
      const token = localStorage.getItem('token');
      
      if (type === 'flashcards') {
        
        const response = await queuedAIJsonFetch('/agents/searchhub/create-flashcards', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            user_id: userName,
            topic: topic,
            count: 10,
            use_hs_context: hsMode
          })
        });

        if (response.ok) {
          const data = await safeJson(response);
          if (data?.success && data.navigate_to) {
            setCreatingMessage(`Created "${data.content_title}"! Opening...`);
            setTimeout(() => {
              setIsCreating(false);
              navigate(data.navigate_to);
            }, 500);
            return;
          }
        }
        
        navigate('/flashcards');

      } else if (type === 'notes') {
        
        const response = await queuedAIJsonFetch('/agents/searchhub/create-note', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            user_id: userName,
            topic: topic,
            use_hs_context: hsMode
          })
        });

        if (response.ok) {
          const data = await safeJson(response);
          if (data?.success && data.navigate_to) {
            setCreatingMessage(`Created "${data.content_title}"! Opening...`);
            setTimeout(() => {
              setIsCreating(false);
              navigate(data.navigate_to);
            }, 500);
            return;
          }
        }
        
        navigate('/notes');
        
      } else if (type === 'questions') {
        
        const response = await queuedAIJsonFetch('/agents/searchhub/create-questions', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            user_id: userName,
            topic: topic,
            count: 10,
            use_hs_context: hsMode
          })
        });

        if (response.ok) {
          const data = await safeJson(response);
          if (data?.success && data.navigate_to) {
            setCreatingMessage(`Created "${data.content_title}"! Opening...`);
            setTimeout(() => {
              setIsCreating(false);
              navigate(data.navigate_to);
            }, 500);
            return;
          }
        }
        
        navigate('/question-bank');
        
      } else if (type === 'ai-chat') {
        navigate('/ai-chat', { state: { initialMessage: topic } });
      }
    } catch (error) {
      console.error('Create content error:', error);
      navigateToCreateFallback(type, topic);
    } finally {
      setIsCreating(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return date.toLocaleDateString();
  };

  const getContentTypeIcon = (type) => {
    const icons = {
      flashcards: <Layers size={20} />,
      flashcard_deck: <Layers size={20} />,
      notes: <FileText size={20} />,
      note: <FileText size={20} />,
      chats: <MessageCircle size={20} />,
      chat: <MessageCircle size={20} />,
      roadmap: <Target size={20} />,
      default: <Search size={20} />
    };
    return icons[type] || icons.default;
  };

  const activeFilterCount = () => {
    let count = 0;
    if (filters.content_types !== 'all') count++;
    if (filters.sort_by !== 'relevance') count++;
    if (filters.date_from) count++;
    if (filters.date_to) count++;
    return count;
  };

  const resetWorkspace = () => {
    setSearchResults(null);
    setAiSuggestion(null);
    setSearchError(null);
    setSearchQuery('');
    setShowFilters(false);
    setShowCommandGuide(false);
    requestAnimationFrame(() => {
      mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      searchInputRef.current?.focus();
    });
  };

  const openCommands = () => {
    setSearchResults(null);
    setAiSuggestion(null);
    setShowCommandGuide(true);
    requestAnimationFrame(() => mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }));
  };

  const sideSections = [
    {
      label: 'Search workspace',
      items: [
        { icon: Search, label: 'Explore', active: !searchResults && !showCommandGuide, onClick: resetWorkspace },
        { icon: Sparkles, label: 'Commands', active: showCommandGuide, pressed: showCommandGuide, onClick: openCommands },
        { icon: Clock, label: 'Recent searches', count: recentSearches.length, onClick: resetWorkspace },
      ],
    },
  ];

  const sidebarLead = (
    <button className="sh-side-primary" type="button" onClick={resetWorkspace}>
      <Search size={15} />
      <span>New search</span>
    </button>
  );

  const sidebarTail = (
    <div className="sh-side-tail">
      <div className="sh-side-context">
        <div>
          <span>Study context</span>
          <strong>{hsMode ? `${userDocCount} sources active` : 'Workspace only'}</strong>
        </div>
        <ContextSelector hsMode={hsMode} docCount={userDocCount} onOpen={() => setContextPanelOpen(true)} />
      </div>
      {userName ? (
        <button className="sh-side-session" type="button" onClick={handleLogout}>
          <LogOut size={14} /> Sign out
        </button>
      ) : (
        <div className="sh-side-auth">
          <button type="button" onClick={() => navigate('/login')}><LogIn size={14} /> Sign in</button>
          <button type="button" onClick={() => navigate('/register')}><UserPlus size={14} /> Join</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="sh-root with-social-chrome">
      {showLoginMessage && (
        <div className="sh-login-msg">PLEASE LOGIN TO CONTINUE</div>
      )}
      <SocialHubChrome
        brandKicker="Search"
        sideSections={sideSections}
        sidebarLead={sidebarLead}
        sidebarTail={sidebarTail}
        collapsed={isSidebarOpen === false}
        onCollapsedChange={handleSidebarCollapsedChange}
        collapsedLeadItems={[{ icon: Search, label: 'New search', onClick: resetWorkspace }]}
        collapsedTailItems={userName ? [{ icon: LogOut, label: 'Sign out', onClick: handleLogout }] : [{ icon: LogIn, label: 'Sign in', onClick: () => navigate('/login') }]}
      >
        <main ref={mainScrollRef} className="sh-main">
        {!searchResults && !isSearching && !isCreating ? (
          isLoadingPrompts ? (
            <div className="sh-loading-init">
              <div className="sh-pulse"><i /><i /><i /></div>
            </div>
          ) : (
            <div className="sh-hero">
              <header className="sh-hero-copy">
                <div className="sh-eyebrow">AI LEARNING COMMAND CENTER</div>
                <h1 className="sh-brand">cerbyl<span className="sh-period">.</span></h1>
              </header>

              <div className="sh-search-wrap sh-search-surface">
                <form
                  onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
                  className={`sh-form ${showAutocomplete && autocompleteResults.length > 0 ? 'sh-form--open' : ''}`}
                >
                  <Search size={15} className="sh-search-icon" />
                  <div className="sh-input-shell">
                    <div ref={searchHighlightRef} className="sh-input-highlight" aria-hidden="true">
                      {renderHighlightedSearchQuery(searchQuery)}
                    </div>
                    <input
                      ref={searchInputRef}
                      id="search-input"
                      type="text"
                      value={searchQuery}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      onScroll={syncSearchHighlightScroll}
                      onClick={() => {
                        setHasUserInteracted(true);
                        if (!searchQuery || searchQuery.trim() === '') {
                          showPersonalizedRecommendations();
                        } else {
                          handleAutocomplete(searchQuery);
                        }
                      }}
                      onFocus={() => {
                        if (hasUserInteracted) {
                          if (!searchQuery || searchQuery.trim() === '') {
                            showPersonalizedRecommendations();
                          } else {
                            handleAutocomplete(searchQuery);
                          }
                        }
                      }}
                      placeholder="Ask me anything... or type /help"
                      className="sh-input sh-input--syntax"
                      autoComplete="off"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={showAutocomplete && autocompleteResults.length > 0}
                      aria-controls="search-autocomplete-list"
                      aria-activedescendant={selectedAutocompleteIndex >= 0 ? `search-autocomplete-option-${selectedAutocompleteIndex}` : undefined}
                    />
                  </div>
                  <button type="submit" className="sh-submit" aria-label="Search">
                    <ChevronRight size={16} />
                  </button>
                </form>

                {showAutocomplete && autocompleteResults.length > 0 && (
                  <div id="search-autocomplete-list" className="sh-autocomplete" role="listbox" aria-label="Search suggestions">
                    {autocompleteResults.map((suggestion, index) => {
                      const commandColor = getCommandColorFromText(suggestion.text);
                      return (
                      <button
                        key={index}
                        id={`search-autocomplete-option-${index}`}
                        type="button"
                        role="option"
                        aria-selected={index === selectedAutocompleteIndex}
                        className={`sh-ac-item ${index === selectedAutocompleteIndex ? 'sh-ac-item--sel' : ''} ${suggestion.source === 'nlp' ? 'sh-ac-item--nlp' : ''}`}
                        onClick={() => {
                          setSearchQuery(suggestion.text);
                          handleSearch(suggestion.text);
                          setShowAutocomplete(false);
                        }}
                      >
                        <span
                          className={`sh-ac-text ${commandColor ? 'sh-ac-text--command' : ''}`}
                          style={commandColor ? { '--sh-cmd-color': commandColor } : undefined}
                        >
                          {suggestion.text}
                        </span>
                        {suggestion.category && (
                          <span className={`sh-ac-badge ${suggestion.type}`}>{suggestion.category}</span>
                        )}
                      </button>
                      );
                    })}
                    <div className="sh-ac-footer">
                      <kbd>↑↓</kbd> Navigate <kbd>↵</kbd> Select <kbd>Esc</kbd> Close
                    </div>
                  </div>
                )}
              </div>

              <p className="sh-helper">
                Type a command or ask naturally · <code>/flashcards</code> · <code>/notes</code> · <code>/quiz</code> · press <kbd>?</kbd> for all commands
              </p>

              <button
                type="button"
                className="sh-cmd-toggle"
                onClick={() => setShowCommandGuide(prev => !prev)}
                aria-expanded={showCommandGuide}
              >
                Commands <span className="sh-cmd-hint">?</span>
              </button>

              {showCommandGuide && (
                <div className="sh-cmd-console">
                  <div className="sh-cmd-header">COMMANDS</div>
                  <div className="sh-cmd-body">
                    {getQuickCommands().map((cmd, index) => (
                      <div key={`${cmd.syntax}-${index}`} className="sh-cmd-line">
                        <span
                          className="sh-cmd-syntax"
                          style={{ '--sh-cmd-color': getCommandColorFromName(cmd.command || extractCommandFromQuery(cmd.syntax)) }}
                        >
                          {cmd.syntax}
                        </span>
                        <span className="sh-cmd-desc">{cmd.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {personalizedPrompts.length > 0 && (
                <div className="sh-chips-wrap">
                  <div className="sh-chips-eyebrow">SUGGESTED FOR YOU</div>
                  <div className="sh-chips">
                    {personalizedPrompts.map((prompt, index) => {
                      const chipLabel = prompt.label || (
                        prompt.text?.startsWith('/')
                          ? prompt.text.slice(1)
                          : prompt.text?.startsWith('> ')
                            ? prompt.text.slice(2)
                            : prompt.text
                      );
                      const chipPreview = prompt.reason
                        ? `${chipLabel} — ${prompt.reason}`
                        : chipLabel;

                      return (
                        <button
                          key={index}
                          className={`sh-chip sh-chip--${prompt.priority || 'medium'}`}
                          title={chipPreview}
                          onClick={() => {
                            markRecommendationUsed(userName, prompt);
                            setSearchQuery(prompt.text);
                            handleSearch(prompt.text);
                          }}
                        >
                          <span className="sh-chip-num">{String(index + 1).padStart(2, '0')}</span>
                          <span className="sh-chip-main">
                            <span className="sh-chip-text">{chipLabel}</span>
                            {prompt.reason && <span className="sh-chip-reason">{prompt.reason}</span>}
                          </span>
                          <ChevronRight size={11} className="sh-chip-arrow" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        ) : isCreating ? (
          <div className="sh-creating">
            <div className="sh-pulse"><i /><i /><i /></div>
            <div className="sh-creating-msg">{creatingMessage}</div>
            <p className="sh-creating-sub">Setting things up...</p>
          </div>
        ) : isSearching ? (
          <div className="sh-searching">
            <div className="sh-pulse"><i /><i /><i /></div>
            <p className="sh-searching-text">Searching...</p>
          </div>
        ) : (
          <div className="sh-results">
            <div className="sh-results-header">
              <div className="sh-results-info">
                {aiSuggestion && searchResults?.has_ai_description ? (
                  <p>Exploring <strong>"{searchQuery}"</strong></p>
                ) : (
                  <p>Found <strong>{searchResults?.total_results || 0}</strong> results for <strong>"{searchQuery}"</strong></p>
                )}
              </div>
              <div className="sh-results-actions">
                <button
                  className="sh-back-btn"
                  onClick={() => {
                    setSearchResults(null);
                    setAiSuggestion(null);
                    setSearchError(null);
                    setSearchQuery('');
                    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  <ChevronLeft size={14} /> Back
                </button>
                <button
                  className={`sh-filter-btn ${showFilters ? 'sh-filter-btn--active' : ''}`}
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter size={13} />
                  Filters
                  {activeFilterCount() > 0 && <span className="sh-filter-badge">{activeFilterCount()}</span>}
                </button>
              </div>
            </div>

            {showFilters && (
              <div className="sh-filters">
                <div className="sh-filter-group">
                  <label>Content Type</label>
                  <select value={filters.content_types} onChange={(e) => setFilters({...filters, content_types: e.target.value})}>
                    <option value="all">All</option>
                    <option value="flashcards">Flashcards</option>
                    <option value="notes">Notes</option>
                    <option value="chats">Chats</option>
                    <option value="roadmaps">Knowledge Maps</option>
                  </select>
                </div>
                <div className="sh-filter-group">
                  <label>Sort By</label>
                  <select value={filters.sort_by} onChange={(e) => setFilters({...filters, sort_by: e.target.value})}>
                    <option value="relevance">Relevance</option>
                    <option value="date">Date</option>
                    <option value="name">Name</option>
                  </select>
                </div>
                <div className="sh-filter-group">
                  <label>Date From</label>
                  <input type="date" value={filters.date_from} onChange={(e) => setFilters({...filters, date_from: e.target.value})} />
                </div>
                <div className="sh-filter-group">
                  <label>Date To</label>
                  <input type="date" value={filters.date_to} onChange={(e) => setFilters({...filters, date_to: e.target.value})} />
                </div>
                <button className="sh-apply-filters" onClick={() => handleSearch()}>
                  <RefreshCw size={13} /> Apply Filters
                </button>
              </div>
            )}

            <div className="sh-results-content">
              {searchError && (
                <div className="sh-error-panel" role="alert">
                  <div className="sh-error-panel-head"><AlertTriangle size={16} /> {searchError.title}</div>
                  <p>{searchError.message}</p>
                  <small>{searchError.detail}</small>
                  <button type="button" onClick={() => handleSearch(searchQuery)}>
                    <RefreshCw size={13} /> Retry search
                  </button>
                </div>
              )}
              {aiSuggestion && aiSuggestion.description && (
                <div className="sh-ai-panel">
                  <div className="sh-ai-panel-head">
                    <Sparkles size={14} />
                    <span>AI Overview</span>
                  </div>
                  <MathRenderer content={aiSuggestion.description} className="sh-ai-text" />
                  {aiSuggestion?.nlp_metadata?.action !== 'need_topic' && (
                    <button
                      className="sh-ai-chat-btn"
                      onClick={continueInAIChat}
                    >
                      <MessageCircle size={13} /> Continue in AI Chat
                    </button>
                  )}
                  {searchResults?.isConversational && aiSuggestion?.suggestions?.length > 0 && (
                    <div className="sh-related-list" aria-label="Suggested commands">
                      {aiSuggestion.suggestions.map((suggestion, index) => (
                        <button
                          key={`${suggestion}-${index}`}
                          type="button"
                          className="sh-related-btn"
                          onClick={() => {
                            setSearchQuery(suggestion);
                            handleSearch(suggestion);
                          }}
                        >
                          <ChevronRight size={11} /> {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {searchResults && searchResults.results && searchResults.results.length > 0 ? (
                <>
                  <div className="sh-results-section-head">
                    <span className="sh-results-section-title">Results</span>
                    <span className="sh-results-section-sub">Community study materials</span>
                  </div>
                  <div className="sh-results-grid">
                    {searchResults.results.map((result, index) => (
                      <div
                        key={result.id || index}
                        className={`sh-result-card ${result.featured ? 'sh-result-card--featured' : ''}`}
                        onClick={() => handleResultClick(result)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleResultClick(result);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`Open ${result.title || result.name}`}
                      >
                        <div className="sh-result-icon">{getContentTypeIcon(result.type)}</div>
                        <div className="sh-result-details">
                          <h3 className="sh-result-title">{result.title || result.name}</h3>
                          {result.description && <p className="sh-result-desc">{result.description}</p>}
                          {result.card_count !== undefined && <p className="sh-result-count">{result.card_count} cards</p>}
                          {result.question_count !== undefined && <p className="sh-result-count">{result.question_count} questions</p>}
                          <div className="sh-result-meta">
                            {result.author && <span><Users size={11} /> {result.is_own ? 'You' : result.author}</span>}
                            {result.created_at && <span><Clock size={11} /> {formatDate(result.created_at)}</span>}
                            {result.is_public !== undefined && <span>{result.is_public ? '🌍 Public' : '🔒 Private'}</span>}
                          </div>
                          <span className="sh-result-badge">{result.type.replace('_', ' ')}</span>
                          {result.smart_actions && result.smart_actions.length > 0 && (
                            <div className="sh-smart-actions">
                              {result.smart_actions.map((action, ai) => (
                                <button key={ai} className="sh-smart-btn" onClick={(e) => handleSmartAction(e, result, action)}>
                                  {getSmartActionIcon(action.icon)} {action.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <ChevronRight size={15} className="sh-result-arrow" />
                      </div>
                    ))}
                  </div>
                  {relatedSearches && relatedSearches.length > 0 && (
                    <div className="sh-related">
                      <div className="sh-related-head">Related Searches</div>
                      <div className="sh-related-list">
                        {relatedSearches.map((related, index) => (
                          <button key={index} className="sh-related-btn" onClick={() => { setSearchQuery(related); handleSearch(related); }}>
                            <Search size={11} /> {related}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : searchResults?.has_ai_description && !searchResults?.isConversational ? (
                <div className="sh-create-options">
                  <div className="sh-create-options-head">Create study materials or explore this topic:</div>
                  <div className="sh-create-grid">
                    {[
                      { icon: <Target size={22} />, label: 'Learning Path', desc: 'Structured path', num: '01', action: () => {
                        if (!userName) { setShowLoginModal(true); return; }
                        setIsCreating(true);
                        setCreatingMessage(`Generating learning path for ${searchQuery}...`);
                        setTimeout(() => {
                          setIsCreating(false);
                          navigate('/learning-paths', { state: { autoGenerate: true, topic: searchQuery, difficulty: 'intermediate', length: 'medium' } });
                        }, 800);
                      }},
                      { icon: <Layers size={22} />, label: 'Flashcards', desc: 'Build a study deck', num: '02', action: () => handleCreateContent('flashcards') },
                      { icon: <FileText size={22} />, label: 'Notes', desc: 'Document your learning', num: '03', action: () => handleCreateContent('notes') },
                      { icon: <MessageCircle size={22} />, label: 'Ask AI', desc: 'Talk to your tutor', num: '04', action: () => handleCreateContent('ai-chat') },
                      { icon: <BarChart3 size={22} />, label: 'Progress', desc: 'Track your journey', num: '05', action: () => { if (!userName) { setShowLoginModal(true); return; } navigate('/dashboard-cerbyl'); } },
                    ].map((opt, i) => (
                      <button key={i} className="sh-create-card" onClick={opt.action}>
                        <span className="sh-create-card-num">{opt.num}</span>
                        {opt.icon}
                        <span className="sh-create-label">{opt.label}</span>
                        <span className="sh-create-desc">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : searchResults?.action_executed ? (
                <div className="sh-ai-response">
                  <div className="sh-ai-panel">
                    <div className="sh-ai-panel-head"><Sparkles size={14} /> <span>AI Assistant</span></div>
                    <MathRenderer content={aiSuggestion?.description || ''} className="sh-ai-text" />
                  </div>
                  <div className="sh-create-grid sh-create-grid--sm">
                    {[
                      { icon: <Layers size={22} />, label: 'Flashcards', desc: 'Study deck', num: '01', action: () => handleCreateContent('flashcards') },
                      { icon: <FileText size={22} />, label: 'Notes', desc: 'Document it', num: '02', action: () => handleCreateContent('notes') },
                      { icon: <Sparkles size={22} />, label: 'Ask AI', desc: 'Get help', num: '03', action: () => handleCreateContent('ai-chat') },
                    ].map((opt, i) => (
                      <button key={i} className="sh-create-card" onClick={opt.action}>
                        <span className="sh-create-card-num">{opt.num}</span>
                        {opt.icon}
                        <span className="sh-create-label">{opt.label}</span>
                        <span className="sh-create-desc">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : searchResults?.isConversational ? null : (
                <div className="sh-no-results">
                  <div className="sh-no-results-icon">
                    {searchResults.action_executed === 'show_weak_areas' ? <Sparkles size={34} /> : <Search size={34} />}
                  </div>
                  <h2 className="sh-no-results-title">
                    {searchResults.action_executed === 'show_weak_areas'
                      ? "No weak areas yet — great work!"
                      : `No results for "${searchQuery}"`}
                  </h2>
                  {didYouMean && (
                    <div className="sh-did-you-mean">
                      Did you mean: <button className="sh-dym-btn" onClick={() => { setSearchQuery(didYouMean); handleSearch(didYouMean); }}>{didYouMean}</button>
                    </div>
                  )}
                  {aiSuggestion && (
                    <div className="sh-ai-panel">
                      <div className="sh-ai-panel-head">
                        <Sparkles size={14} />
                        <span>{searchResults.action_executed === 'show_weak_areas' ? 'Recommended Next Steps' : 'AI Assistant'}</span>
                      </div>
                      <MathRenderer content={aiSuggestion.description} className="sh-ai-text" />
                      <div className="sh-create-grid sh-create-grid--sm">
                        {[
                          { icon: <Layers size={22} />, label: 'Flashcards', desc: 'Study deck', num: '01', action: () => handleCreateContent('flashcards') },
                          { icon: <FileText size={22} />, label: 'Notes', desc: 'Document it', num: '02', action: () => handleCreateContent('notes') },
                          { icon: <Sparkles size={22} />, label: 'Ask AI', desc: 'Get help', num: '03', action: () => handleCreateContent('ai-chat') },
                        ].map((opt, i) => (
                          <button key={i} className="sh-create-card" onClick={opt.action}>
                            <span className="sh-create-card-num">{opt.num}</span>
                            {opt.icon}
                            <span className="sh-create-label">{opt.label}</span>
                            <span className="sh-create-desc">{opt.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        </main>
      </SocialHubChrome>

      {showLoginModal && (
        <div className="sh-modal-overlay" onClick={() => setShowLoginModal(false)}>
          <div className="sh-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sh-modal-head">
              <Sparkles size={20} />
              <h3>Sign In Required</h3>
            </div>
            <p className="sh-modal-text">
              Unlock personalized learning with AI-powered flashcards, notes, quizzes, and progress tracking — all tailored to you.
            </p>
            <div className="sh-modal-actions">
              <button className="sh-modal-btn" onClick={() => { setShowLoginModal(false); navigate('/login'); }}>
                <LogIn size={14} /> Sign In
              </button>
              <button className="sh-modal-btn sh-modal-btn--sec" onClick={() => { setShowLoginModal(false); navigate('/register'); }}>
                <UserPlus size={14} /> Create Account
              </button>
            </div>
          </div>
        </div>
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

export default SearchHub;
