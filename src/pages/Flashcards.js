import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import CustomPopup from './CustomPopup';
import './Flashcards.css';
import './FlashcardsConvert.css';
import { API_URL } from '../config';
import { queueChatCompletion, queuedAIFormFetch, queuedAIJsonFetch, USE_AI_JOB_QUEUE } from '../services/aiJobService';
import gamificationService from '../services/gamificationService';
import ImportExportModal from '../components/ImportExportModal';
import MathRenderer from '../components/MathRenderer';
import ContextSelector from '../components/ContextSelector';
import ContextPanel from '../components/ContextPanel';
import contextService from '../services/contextService';
import AbstractFx from '../components/AbstractFx';
import GeoBackground from '../components/GeoBackground';

const CONTEXT_SELECTION_KEY = 'ctx_selected_doc_ids';
const FLASHCARD_HISTORY_LIMIT = 100;
const FLASHCARD_DEFERRED_LOAD_MS = 3500;
const FLASHCARD_CONTEXT_COUNT_DELAY_MS = 5000;

const FC_ICONS = {
  menu: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>,
  fire: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2c.5 2.5 2 4.5 2 7a4 4 0 1 1-8 0c0-2.5 1.5-4.5 2-7 1.5 1.5 2.5 2 4 0z"/></svg>,
  book: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  target: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  cards: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>,
  sparkle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z"/></svg>,
  chart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>,
  bolt: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  chat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  logout: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
  edit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  file: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  play: <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  eye: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  shuffle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
  x: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  arrowRight: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  arrowLeft: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  refresh: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  celebration: (
    <svg
      className="fc-confetti-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path className="fc-confetti-popper" d="m3 21 4.15-10.2 6.05 6.05L3 21Z" />
      <path className="fc-confetti-fold" d="m5.15 15.7 2.15 2.15" />
      <path className="fc-confetti-streamer fc-confetti-streamer--one" d="M9.2 10.4c.55-2.1-.85-3.05.15-4.8.72-1.27 2.1-1.22 2.35-3.1" />
      <path className="fc-confetti-streamer fc-confetti-streamer--two" d="M11.7 12.25c1.7-1.18 1.05-3.2 2.75-4.05 1.38-.7 2.42.2 3.45-1.35" />
      <path className="fc-confetti-streamer fc-confetti-streamer--three" d="M13.45 14.75c2.08-.55 2.22-2.17 4.05-2.17 1.58 0 2.15 1.15 3.7.42" />
      <path className="fc-confetti-piece" d="m16.45 2.25.25 1.45" />
      <path className="fc-confetti-piece" d="m21.15 5.3-1.25.75" />
      <path className="fc-confetti-piece" d="m20.75 17.55-1.4-.35" />
    </svg>
  ),
  chevronRight: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  chevronLeft: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  link: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
};

const cleanFlashcardChoiceText = (value) => {
  return String(value || '')
    .replace(/^```(?:[a-zA-Z0-9_-]+)?\s*/g, '')
    .replace(/\s*```$/g, '')
    .replace(/\\n/g, '\n')
    .replace(/^[\s"'`“”]+|[\s"'`“”]+$/g, '')
    .replace(/^\s*(?:[A-D]|\d+)[).:-]\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const Flashcards = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [userName, setUserName] = useState('');
  const [userProfile, setUserProfile] = useState(null);
  const [activePanel, setActivePanel] = useState('cards');
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [hsMode, setHsMode] = useState(() => localStorage.getItem('hs_mode_enabled') === 'true');
  const [userDocCount, setUserDocCount] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  
  const [flashcards, setFlashcards] = useState([]);
  const [flashcardHistory, setFlashcardHistory] = useState([]);
  const [flashcardStats, setFlashcardStats] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [currentSetInfo, setCurrentSetInfo] = useState(null);
  
  
  const [hasMoreSets, setHasMoreSets] = useState(true);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const SETS_PER_PAGE = 8; 
  const [displayedSets, setDisplayedSets] = useState([]); 
  
  
  const [currentCard, setCurrentCard] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [mcqOptions, setMcqOptions] = useState([]);
  
  
  const [generating, setGenerating] = useState(false);
  const [generationMode, setGenerationMode] = useState('topic');
  const [topic, setTopic] = useState('');
  const [cardCount, setCardCount] = useState(10);
  const [difficultyLevel, setDifficultyLevel] = useState('medium');
  const [depthLevel, setDepthLevel] = useState('standard');
  const [autoSave, setAutoSave] = useState(true);
  const [isPublic, setIsPublic] = useState(false);
  const [additionalSpecs, setAdditionalSpecs] = useState('');

  const [uploadedDocuments, setUploadedDocuments] = useState([]);
  const [selectedPDFs, setSelectedPDFs] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  
  const [customCards, setCustomCards] = useState([{ question: '', answer: '' }]);
  const [customSetTitle, setCustomSetTitle] = useState('');
  const [customCreateMode, setCustomCreateMode] = useState(false);
  
  
  const [editMode, setEditMode] = useState(false);
  const [editingCards, setEditingCards] = useState([]);
  const [editingSetTitle, setEditingSetTitle] = useState('');
  
  
  const [publicSearchQuery, setPublicSearchQuery] = useState('');
  const [publicFlashcards, setPublicFlashcards] = useState([]);
  const [loadingPublic, setLoadingPublic] = useState(false);
  
  
  const [chatSessions, setChatSessions] = useState([]);
  const [selectedSessions, setSelectedSessions] = useState([]);
  
  
  const [studyMode, setStudyMode] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [studySessionStats, setStudySessionStats] = useState({ correct: 0, incorrect: 0, skipped: 0 });
  const gradedCardsRef = useRef(new Set()); 
  const [showStudyResults, setShowStudyResults] = useState(false);
  const [shuffledCards, setShuffledCards] = useState([]);
  const [studySettings, setStudySettings] = useState({ shuffle: false });
  const [currentStreak, setCurrentStreak] = useState(0);
  
  const [loadingSetId, setLoadingSetId] = useState(null); 

  
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [editingSetId, setEditingSetId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [showImportExport, setShowImportExport] = useState(false);
  const [isRearranging, setIsRearranging] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [difficultyDropdownOpen, setDifficultyDropdownOpen] = useState(false);
  const [depthDropdownOpen, setDepthDropdownOpen] = useState(false);
  
  
  const [reviewCards, setReviewCards] = useState({ total_cards: 0, sets: [] });
  const [loadingReviewCards, setLoadingReviewCards] = useState(false);

  
  const [dueCards, setDueCards] = useState({ due_count: 0, new_count: 0, review_count: 0, learning_count: 0, relearning_count: 0, cards: [] });
  const [srStudyMode, setSrStudyMode] = useState(false);
  const [srCurrentCard, setSrCurrentCard] = useState(0);
  const [srFlipped, setSrFlipped] = useState(false);
  const [srSessionStats, setSrSessionStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [showSrResults, setShowSrResults] = useState(false);
  const [srStats, setSrStats] = useState(null);
  const [loadingSrStats, setLoadingSrStats] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const [askAiOpen, setAskAiOpen] = useState(false);
  const [askAiQuestion, setAskAiQuestion] = useState('');
  const [askAiMessages, setAskAiMessages] = useState([]);
  const [askAiLoading, setAskAiLoading] = useState(false);


  const [agentSessionActive, setAgentSessionActive] = useState(false);
  const [agentSessionId, setAgentSessionId] = useState(null);
  const [cardMetrics, setCardMetrics] = useState({});
  const [weaknessAnalysis, setWeaknessAnalysis] = useState([]);
  const [studyRecommendations, setStudyRecommendations] = useState([]);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [showAgentInsights, setShowAgentInsights] = useState(false);
  
  const [popup, setPopup] = useState({ isOpen: false, message: '', title: '' });
  const autoGenerateKeyRef = useRef('');
  const getSelectedContextDocIds = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(CONTEXT_SELECTION_KEY) || '[]');
      return Array.isArray(raw) ? raw.map((v) => String(v).trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  };

  const showPopup = (title, message) => setPopup({ isOpen: true, title, message });
  const closePopup = () => setPopup({ isOpen: false, message: '', title: '' });



  const formatTitle = (title) => {
    if (!title) return '';
    
    let cleaned = title.replace(/^(Cerbyl:\s*|AI Generated:\s*|Flashcards:\s*)/i, '');
    
    return cleaned.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  const askAiAboutSet = (set) => {
    const setTitle = formatTitle(set?.title) || 'this flashcard set';
    navigate('/ai-chat', {
      state: {
        initialMessage: `I'm studying my flashcard set "${setTitle}" (${set?.card_count || 0} cards). Can you help explain the topics it covers and answer any questions I have about it?`
      }
    });
  };

  const sendAskAiQuestion = async (cardForContext) => {
    const question = askAiQuestion.trim();
    if (!question || askAiLoading) return;

    const userEntry = { role: 'user', content: question };
    setAskAiMessages(prev => [...prev, userEntry]);
    setAskAiQuestion('');
    setAskAiLoading(true);

    try {
      const token = localStorage.getItem('token');
      const cardContext = cardForContext
        ? `The student is currently looking at this flashcard — Question: "${cardForContext.question || ''}" Answer: "${cardForContext.answer || ''}". `
        : '';
      const setTitle = formatTitle(currentSetInfo?.setTitle) || 'their flashcard set';
      const prompt = `${cardContext}They are studying the flashcard set "${setTitle}" and asked: ${question}\n\nGive a clear, concise explanation that helps them understand the concept (not just repeat the flashcard answer).`;

      const formData = new FormData();
      formData.append('user_id', userName);
      formData.append('question', prompt);
      formData.append('original_question', question);

      let data;
      if (USE_AI_JOB_QUEUE) {
        data = await queueChatCompletion({
          prompt,
          user_message: question,
          use_hs_context: localStorage.getItem('hs_mode_enabled') === 'true',
        });
      } else {
        const response = await fetch(`${API_URL}/ask_simple/`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });

        if (!response.ok) throw new Error('Failed to get an answer');
        data = await response.json();
      }
      setAskAiMessages(prev => [...prev, { role: 'ai', content: data.answer || "I couldn't find an answer to that." }]);
    } catch (error) {
      setAskAiMessages(prev => [...prev, { role: 'ai', content: "Sorry, I couldn't reach the AI right now. Please try again." }]);
    } finally {
      setAskAiLoading(false);
    }
  };

  const renderAskAiPanel = (cardForContext) => {
    if (!askAiOpen) return null;
    const setLabel = formatTitle(currentSetInfo?.setTitle) || 'this set';
    return (
      <>
        <div className="fc-ask-ai-backdrop" onClick={() => setAskAiOpen(false)} />
        <div className="fc-ask-ai-dock">
          <div className="fc-ask-ai-dock-glow" />
          <div className="fc-ask-ai-dock-handle" onClick={() => setAskAiOpen(false)}>
            <span className="fc-ask-ai-dock-grip" />
          </div>
          <div className="fc-ask-ai-header">
            <div className="fc-ask-ai-avatar">{FC_ICONS.sparkle}</div>
            <div className="fc-ask-ai-heading">
              <div className="fc-ask-ai-title">Ask AI</div>
              <div className="fc-ask-ai-subtitle">Studying <strong>{setLabel}</strong> &middot; ask anything about this card</div>
            </div>
            <button className="fc-ask-ai-close" onClick={() => setAskAiOpen(false)} type="button" aria-label="Close Ask AI panel">
              {FC_ICONS.x}
            </button>
          </div>
          <div className="fc-ask-ai-body">
            {askAiMessages.length === 0 ? (
              <div className="fc-ask-ai-empty">
                <div className="fc-ask-ai-empty-icon">{FC_ICONS.sparkle}</div>
                <p>Stuck on this card? Ask anything — like &ldquo;explain this differently&rdquo; or &ldquo;why is this the answer?&rdquo; — and the AI will walk you through it.</p>
                <div className="fc-ask-ai-suggestions">
                  {['Explain this simply', 'Give me an example', 'Why is this the answer?'].map((s) => (
                    <button key={s} type="button" className="fc-ask-ai-suggestion" onClick={() => setAskAiQuestion(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              askAiMessages.map((msg, idx) => (
                <div key={idx} className={`fc-ask-ai-msg fc-ask-ai-msg--${msg.role}`}>
                  <div className="fc-ask-ai-msg-avatar">{msg.role === 'user' ? (userName?.[0]?.toUpperCase() || 'Y') : FC_ICONS.sparkle}</div>
                  <MathRenderer content={msg.content} className="fc-ask-ai-msg-text" />
                </div>
              ))
            )}
            {askAiLoading && (
              <div className="fc-ask-ai-msg fc-ask-ai-msg--ai fc-ask-ai-msg--loading">
                <div className="fc-ask-ai-msg-avatar">{FC_ICONS.sparkle}</div>
                <div className="fc-ask-ai-msg-text">
                  <span className="fc-ask-ai-dot" /><span className="fc-ask-ai-dot" /><span className="fc-ask-ai-dot" />
                </div>
              </div>
            )}
          </div>
          <form
            className="fc-ask-ai-input-row"
            onSubmit={(e) => { e.preventDefault(); sendAskAiQuestion(cardForContext); }}
          >
            <input
              type="text"
              value={askAiQuestion}
              onChange={(e) => setAskAiQuestion(e.target.value)}
              placeholder="Ask a question about this card..."
              disabled={askAiLoading}
            />
            <button type="submit" disabled={askAiLoading || !askAiQuestion.trim()} aria-label="Send question">
              {FC_ICONS.arrowRight}
            </button>
          </form>
        </div>
      </>
    );
  };


  const loadChatSessions = useCallback(async () => {
    if (!userName) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/get_chat_sessions?user_id=${encodeURIComponent(userName)}&limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setChatSessions(data.sessions || []);
      }
    } catch (error) { /* silenced */ }
  }, [userName]);

  const loadFlashcardHistory = useCallback(async (reset = false) => {
    if (!userName) return;
    
    
    if (loadingHistory) return;
    
    setLoadingHistory(true);
    
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(
        `${API_URL}/get_flashcard_history?user_id=${userName}&limit=${FLASHCARD_HISTORY_LIMIT}&offset=0`, 
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        const newSets = Array.isArray(data.flashcard_history) ? data.flashcard_history : [];
        setFlashcardHistory(newSets);
        
        
        setDisplayedSets(newSets.slice(0, SETS_PER_PAGE));
        setHasMoreSets(newSets.length > SETS_PER_PAGE);
      } else {
        setFlashcardHistory([]);
        setDisplayedSets([]);
      }
    } catch (error) {
      setFlashcardHistory([]);
      setDisplayedSets([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [userName, loadingHistory]);

  const loadFlashcardStats = useCallback(async () => {
    if (!userName) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/get_flashcard_statistics?user_id=${userName}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setFlashcardStats(data);
      }
    } catch (error) { /* silenced */ }
  }, [userName]);

  const loadUploadedDocuments = useCallback(async () => {
    if (!userName) return;
    setLoadingDocuments(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/qb/get_uploaded_documents?user_id=${encodeURIComponent(userName)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setUploadedDocuments(Array.isArray(data.documents) ? data.documents : []);
      } else {
        setUploadedDocuments([]);
      }
    } catch (error) {
      setUploadedDocuments([]);
    } finally {
      setLoadingDocuments(false);
    }
  }, [userName]);

  const handlePDFUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !userName) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      showPopup('PDF Required', 'Please upload a PDF file.');
      event.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploadingDocument(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/qb/upload_pdf?user_id=${encodeURIComponent(userName)}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to upload PDF');
      }

      const data = await response.json();
      await loadUploadedDocuments();
      showPopup('PDF Uploaded', `${data.filename || file.name} is ready to convert into flashcards.`);
    } catch (error) {
      showPopup('Upload Failed', error.message || 'Failed to upload PDF.');
    } finally {
      setUploadingDocument(false);
      event.target.value = '';
    }
  };

  const togglePDFSelection = (doc) => {
    setSelectedPDFs((current) => {
      const isSelected = current.some((item) => item.id === doc.id);
      return isSelected ? current.filter((item) => item.id !== doc.id) : [...current, doc];
    });
  };

  const clearPDFSelection = () => {
    setSelectedPDFs([]);
  };

  const deleteUploadedDocument = async (docId, event) => {
    event.stopPropagation();

    if (!window.confirm('Delete this PDF source? This removes it from Question Hub and Flashcards.')) {
      return;
    }

    try {
      setLoadingDocuments(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/qb/delete_document/${docId}?user_id=${encodeURIComponent(userName)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to delete PDF');
      }

      setSelectedPDFs((current) => current.filter((doc) => doc.id !== docId));
      await loadUploadedDocuments();
      showPopup('PDF Deleted', 'The source was removed.');
    } catch (error) {
      showPopup('Delete Failed', error.message || 'Could not delete this PDF source.');
    } finally {
      setLoadingDocuments(false);
    }
  };

  const loadReviewCards = useCallback(async () => {
    if (!userName) return;
    setLoadingReviewCards(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/get_flashcards_for_review?user_id=${userName}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        
        setReviewCards({
          total_cards: data.total_cards || 0,
          sets: Array.isArray(data.sets) ? data.sets : []
        });
      }
    } catch (error) {
            setReviewCards({ total_cards: 0, sets: [] });
    }
    setLoadingReviewCards(false);
  }, [userName]);

  

  const loadDueCards = useCallback(async () => {
    if (!userName) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/flashcards/due?user_id=${userName}&limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setDueCards(data);
      }
    } catch (error) {
      console.error('Failed to load due cards:', error);
    }
  }, [userName]);

  const loadSrStats = useCallback(async () => {
    if (!userName) return;
    setLoadingSrStats(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/flashcards/sr_stats?user_id=${userName}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSrStats(data);
      }
    } catch (error) {
      console.error('Failed to load SR stats:', error);
    }
    setLoadingSrStats(false);
  }, [userName]);

  const loadAiSuggestions = async () => {
    if (!userName) return;
    setLoadingSuggestions(true);
    try {
      const token = localStorage.getItem('token');
      const response = await queuedAIJsonFetch(`/flashcards/ai_suggestions?user_id=${userName}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAiSuggestions(data);
      }
    } catch (error) {
      console.error('Failed to load AI suggestions:', error);
    }
    setLoadingSuggestions(false);
  };

  const handleSrReview = async (grade) => {
    const cards = dueCards.cards;
    if (!cards || cards.length === 0) return;
    const card = cards[srCurrentCard];

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/flashcards/sr_review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ user_id: userName, card_id: card.id, grade })
      });

      if (response.ok) {
        setSrSessionStats(prev => ({ ...prev, [grade]: prev[grade] + 1 }));

        if (srCurrentCard < cards.length - 1) {
          setSrCurrentCard(srCurrentCard + 1);
          setSrFlipped(false);
        } else {
          setShowSrResults(true);
        }
      }
    } catch (error) {
      console.error('SR review failed:', error);
    }
  };

  const startSrStudy = () => {
    setSrStudyMode(true);
    setSrCurrentCard(0);
    setSrFlipped(false);
    setSrSessionStats({ again: 0, hard: 0, good: 0, easy: 0 });
    setShowSrResults(false);
  };

  const exitSrStudy = () => {
    setSrStudyMode(false);
    setShowSrResults(false);
    setSrCurrentCard(0);
    setSrFlipped(false);
    loadDueCards();
    loadSrStats();
  };

  const markCardForReview = async (flashcardId, marked = true) => {
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('flashcard_id', flashcardId);
      formData.append('marked', marked.toString());
      
      const response = await fetch(`${API_URL}/mark_flashcard_for_review`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      if (response.ok) {
        
        loadReviewCards();
        return true;
      }
      return false;
    } catch (error) {
            return false;
    }
  };

  
  const startAgentSession = async () => {
    try {
      const token = localStorage.getItem('token');
      
      
      const response = await fetch(`${API_URL}/agents/flashcards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: userName,
          action: 'recommend',
          session_id: `review_${Date.now()}`
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setAgentSessionActive(true);
        setAgentSessionId(`session_${Date.now()}`);
        setSessionStartTime(Date.now());
                
        
        if (result.recommendations) {
          setStudyRecommendations(result.recommendations);
        }
        
        return result;
      }
    } catch (error) { /* silenced */ }
  };

  const reviewCardWithAgent = async (cardId, quality, responseTime) => {
    try {
      const token = localStorage.getItem('token');
      
      
      const response = await fetch(`${API_URL}/agents/flashcards/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: userName,
          review_results: [{
            card_id: cardId,
            quality: quality === 5 ? 'easy' : quality === 1 ? 'again' : 'good',
            correct: quality >= 3,
            response_time_ms: responseTime * 1000
          }]
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        const data = result.data || result;
        
        
        setCardMetrics(prev => ({
          ...prev,
          [cardId]: {
            retention: data.session_stats?.accuracy || 0,
            confidence: quality / 5,
            streak: data.session_stats?.correct || 0
          }
        }));
        
        return data;
      }
    } catch (error) { /* silenced */ }
  };

  
  
  const updateCardMastery = async (cardId, wasCorrect, mode = 'preview') => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/flashcards/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: userName,
          card_id: cardId.toString(),
          was_correct: wasCorrect,
          mode: mode,
          response_time: 5.0 
        })
      });
      
      const result = await response.json();
      if (result.success) {
        
        if (result.adaptive_feedback) {
          const feedback = result.adaptive_feedback;
          
          
          if (feedback.cognitive_load === 'high' || feedback.cognitive_load === 'very_high' || feedback.cognitive_load === 'overload') {
            const recommendations = feedback.recommendations?.slice(0, 2).join('. ') || 'Consider taking a break';
            showPopup('Cognitive Load Alert', `Your cognitive load is ${feedback.cognitive_load}. ${recommendations}`);
          }
          
          
          if (feedback.current_difficulty && mode === 'study') {
          }
        }
      }
      return result;
    } catch (error) {
      console.error('Error updating card mastery:', error);
    }
  };

  const endAgentSession = async () => {
    try {
      const token = localStorage.getItem('token');
      
      
      const response = await fetch(`${API_URL}/agents/flashcards/analyze?user_id=${userName}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const result = await response.json();
      
      if (result.success) {
        setAgentSessionActive(false);
        setShowAgentInsights(true);
        
        const sessionDuration = sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 60000) : 0;
        
        
        showPopup('Session Complete!', 
          `Duration: ${sessionDuration} min\n` +
          `${result.response || 'Great study session!'}`
        );
        
        return result;
      }
    } catch (error) {
            setAgentSessionActive(false);
    }
  };

  const getFlashcardReport = async () => {
    try {
      const token = localStorage.getItem('token');
      
      
      const response = await fetch(`${API_URL}/agents/flashcards/analyze?user_id=${userName}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const result = await response.json();
      
      if (result.success) {
        return result.analysis || result;
      }
    } catch (error) { /* silenced */ }
  };

  
  const getAgentRecommendations = async () => {
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API_URL}/agents/flashcards/recommendations?user_id=${userName}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const result = await response.json();
      
      if (result.success && result.recommendations) {
        setStudyRecommendations(result.recommendations);
        return result.recommendations;
      }
    } catch (error) { /* silenced */ }
  };

  
  const explainConcept = async (concept) => {
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API_URL}/agents/flashcards/explain`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: userName,
          concept: concept
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        return result.explanation;
      }
    } catch (error) { /* silenced */ }
  };

  
  const addCustomCard = () => {
    setCustomCards([...customCards, { question: '', answer: '' }]);
  };

  const removeCustomCard = (index) => {
    if (customCards.length > 1) {
      setCustomCards(customCards.filter((_, i) => i !== index));
    }
  };

  const updateCustomCard = (index, field, value) => {
    const updated = [...customCards];
    updated[index][field] = value;
    setCustomCards(updated);
  };

  
  const enterCustomCreateMode = () => {
    setCustomCards([{ question: '', answer: '', isNew: true }]);
    setCustomSetTitle('');
    setCurrentCard(0);
    setCustomCreateMode(true);
  };

  const exitCustomCreateMode = () => {
    setCustomCreateMode(false);
    setCustomCards([{ question: '', answer: '' }]);
    setCustomSetTitle('');
    setCurrentCard(0);
  };

  const addCustomCardInEditor = () => {
    setCustomCards([...customCards, { question: '', answer: '', isNew: true }]);
  };

  const updateCustomCardInEditor = (index, field, value) => {
    const updated = [...customCards];
    updated[index][field] = value;
    setCustomCards(updated);
  };

  const removeCustomCardInEditor = (index) => {
    if (customCards.length > 1) {
      const newCards = customCards.filter((_, i) => i !== index);
      setCustomCards(newCards);
      if (currentCard >= newCards.length) {
        setCurrentCard(Math.max(0, newCards.length - 1));
      }
    }
  };

  const saveCustomFlashcards = async () => {
    const validCards = customCards.filter(c => c.question.trim() && c.answer.trim());
    if (validCards.length === 0) {
      showPopup('Error', 'Please add at least one card with both question and answer');
      return;
    }
    if (!customSetTitle.trim()) {
      showPopup('Error', 'Please enter a title for your flashcard set');
      return;
    }

    setGenerating(true);
    try {
      const token = localStorage.getItem('token');
      
      
      const setResponse = await fetch(`${API_URL}/flashcards/sets/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: userName,
          title: customSetTitle,
          description: `Custom set with ${validCards.length} cards`,
          is_public: isPublic
        })
      });

      if (!setResponse.ok) throw new Error('Failed to create set');
      const setData = await setResponse.json();

      
      for (const card of validCards) {
        await fetch(`${API_URL}/flashcards/cards/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            set_id: setData.set_id,
            question: card.question,
            answer: card.answer,
            difficulty: 'medium'
          })
        });
      }

      showPopup('Created Successfully', `"${customSetTitle}" with ${validCards.length} cards has been created.`);
      setCustomCreateMode(false);
      setCustomCards([{ question: '', answer: '' }]);
      setCustomSetTitle('');
      setCurrentCard(0);
      loadFlashcardHistory(true); 
      loadFlashcardStats();
    } catch (error) {
      showPopup('Error', 'Failed to save flashcards');
    }
    setGenerating(false);
  };

  
  const enterEditMode = async (setId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/get_flashcards_in_set?set_id=${setId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setEditingCards(data.flashcards.map(c => ({ ...c, isNew: false, isDeleted: false })));
        setEditingSetTitle(data.set_title || 'Flashcard Set');
        setCurrentSetInfo({
          saved: true,
          setId: setId,
          shareCode: data.share_code,
          setTitle: data.set_title,
          cardCount: data.flashcards.length
        });
        setCurrentCard(0);
        setEditMode(true);  
      }
    } catch (error) {
      showPopup('Error', 'Failed to load flashcard set for editing');
    }
  };

  const addCardToEdit = () => {
    setEditingCards([...editingCards, { question: '', answer: '', isNew: true, isDeleted: false }]);
  };

  const updateEditingCard = (index, field, value) => {
    const updated = [...editingCards];
    updated[index][field] = value;
    updated[index].wasModified = true; 
    setEditingCards(updated);
  };

  const markCardForDeletion = (index) => {
    const updated = [...editingCards];
    if (updated[index].isNew) {
      
      setEditingCards(editingCards.filter((_, i) => i !== index));
    } else {
      
      updated[index].isDeleted = !updated[index].isDeleted;
      setEditingCards(updated);
    }
  };

  const saveEditedFlashcards = async () => {
    if (!currentSetInfo?.setId) return;
    
    setGenerating(true);
    try {
      const token = localStorage.getItem('token');
      
      
      if (editingSetTitle !== currentSetInfo.setTitle) {
        await fetch(`${API_URL}/update_flashcard_set`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            set_id: currentSetInfo.setId, 
            title: editingSetTitle.trim(),
            description: ''
          })
        });
      }

      await Promise.all(editingCards.map(card => {
        if (card.isDeleted && card.id) {
          return fetch(`${API_URL}/flashcards/cards/${card.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
        }
        if (card.isNew && card.question.trim() && card.answer.trim()) {
          return fetch(`${API_URL}/flashcards/cards/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              set_id: currentSetInfo.setId,
              question: card.question,
              answer: card.answer,
              difficulty: card.difficulty || 'medium'
            })
          });
        }
        if (!card.isNew && !card.isDeleted && card.id && card.wasModified) {
          return fetch(`${API_URL}/flashcards/cards/${card.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              question: card.question,
              answer: card.answer,
              difficulty: card.difficulty || 'medium'
            })
          });
        }
        return Promise.resolve();
      }));

      showPopup('Updated Successfully', 'Your flashcard set has been updated.');
      setEditMode(false);
      setEditingCards([]);
      setCurrentCard(0);
      loadFlashcardHistory(true); 
    } catch (error) {
      showPopup('Error', 'Failed to save changes');
    }
    setGenerating(false);
  };

  const cancelEditMode = () => {
    setEditMode(false);
    setEditingCards([]);
    setCurrentCard(0);
    setCurrentSetInfo(null);
    
    window.history.replaceState({}, '', '/flashcards');
  };

  
  const searchPublicFlashcards = async (query = '') => {
    setLoadingPublic(true);
    try {
      const token = localStorage.getItem('token');
      const searchTerm = query || publicSearchQuery;
      const response = await fetch(`${API_URL}/flashcards/public/search?query=${encodeURIComponent(searchTerm)}&limit=50`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPublicFlashcards(data.sets || []);
      }
    } catch (error) {
      setPublicFlashcards([]);
    }
    setLoadingPublic(false);
  };

  const loadAllPublicFlashcards = async () => {
    setLoadingPublic(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/flashcards/public?limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPublicFlashcards(data.sets || []);
      }
    } catch (error) {
      setPublicFlashcards([]);
    }
    setLoadingPublic(false);
  };

  const copyPublicSet = async (setId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/flashcards/public/copy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: userName,
          source_set_id: setId
        })
      });
      if (response.ok) {
        const data = await response.json();
        showPopup('Copied Successfully', `"${data.title}" has been added to your flashcard sets.`);
        loadFlashcardHistory(true); 
      }
    } catch (error) {
      showPopup('Error', 'Failed to copy flashcard set');
    }
  };

  
  useEffect(() => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    const profile = localStorage.getItem('userProfile');

    if (!token) {
      navigate('/login');
      return;
    }
    if (username) setUserName(username);
    if (profile) {
      try {
        setUserProfile(JSON.parse(profile));
      } catch (error) { /* silenced */ }
    }
  }, [navigate]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      contextService.listDocuments()
        .then(d => setUserDocCount(d.user_docs?.length || 0))
        .catch(() => {});
    }, FLASHCARD_CONTEXT_COUNT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const handleHsModeToggle = (val) => {
    setHsMode(val);
    localStorage.setItem('hs_mode_enabled', String(val));
  };

  
  const loadFlashcardSetByCode = useCallback(async (shareCode, mode = 'preview') => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/flashcards/by-code/${shareCode}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setFlashcards(data.flashcards);
        setCurrentCard(0);
        setIsFlipped(false);
        setCurrentSetInfo({
          saved: true,
          setId: data.set.id,
          shareCode: data.set.share_code,
          setTitle: data.set.title,
          cardCount: data.flashcards.length
        });
        
        if (mode === 'preview') {
          const cards = studySettings.shuffle ? [...data.flashcards].sort(() => Math.random() - 0.5) : data.flashcards;
          setShuffledCards(cards);
          setPreviewMode(true);
        } else if (mode === 'study') {
          
          let cards = [...data.flashcards].sort((a, b) => {
            
            if (a.marked_for_review && !b.marked_for_review) return -1;
            if (!a.marked_for_review && b.marked_for_review) return 1;
            return 0;
          });
          if (studySettings.shuffle) {
            
            const reviewCards = cards.filter(c => c.marked_for_review);
            const otherCards = cards.filter(c => !c.marked_for_review);
            cards = [
              ...reviewCards.sort(() => Math.random() - 0.5),
              ...otherCards.sort(() => Math.random() - 0.5)
            ];
          }
          setStudySessionStats({ correct: 0, incorrect: 0, skipped: 0 });
          setShowStudyResults(false);
          setShuffledCards(cards);
          generateMCQOptions(cards, 0);
          setStudyMode(true);
          updateStreak();
        }
      }
    } catch (error) {
            showPopup('Error', 'Failed to load flashcard set');
    }
  }, [studySettings.shuffle]);

  useEffect(() => {
    if (userName) {
      loadFlashcardHistory(true); 
      const deferredLoad = window.setTimeout(() => {
        loadFlashcardStats();
        loadChatSessions();
        loadReviewCards();
      }, FLASHCARD_DEFERRED_LOAD_MS);
      
      
      const params = new URLSearchParams(location.search);
      const shareCode = params.get('code');
      const mode = params.get('mode') || 'preview';
      const setId = params.get('set_id');
      
      if (shareCode) {
                loadFlashcardSetByCode(shareCode, mode);
        setActivePanel('cards');
      } else if (setId) {
                loadFlashcardSet(parseInt(setId), mode);
        setActivePanel('cards');
      }
      return () => window.clearTimeout(deferredLoad);
    }
    return undefined;
  }, [userName, location.search, loadChatSessions, loadFlashcardStats, loadReviewCards, loadFlashcardSetByCode]);

  useEffect(() => {
    if (activePanel !== 'sources' || !userName || loadingDocuments || uploadedDocuments.length > 0) return;
    loadUploadedDocuments();
  }, [activePanel, userName, loadingDocuments, uploadedDocuments.length, loadUploadedDocuments]);

  useEffect(() => {
    const openPanel = location.state?.openPanel;
    const initialTopic = location.state?.initialTopic;
    const requestedMode = location.state?.generationMode;
    const contextDocIds = location.state?.contextDocIds;
    const autoGenerateFromContext = Boolean(location.state?.autoGenerateFromContext);

    if (Array.isArray(contextDocIds) && contextDocIds.length > 0) {
      try {
        localStorage.setItem(CONTEXT_SELECTION_KEY, JSON.stringify(contextDocIds));
      } catch {
        
      }
    }

    if (!userName || openPanel !== 'generator') return;

    const mode = requestedMode === 'chat_history' ? 'chat_history' : 'topic';
    const topicText = typeof initialTopic === 'string' ? initialTopic.trim() : '';

    setActivePanel('generator');
    setGenerationMode(mode);
    if (topicText) setTopic(topicText);

    if (autoGenerateFromContext && mode === 'topic' && topicText && !generating) {
      const contextKey = Array.isArray(contextDocIds) ? contextDocIds.map((id) => String(id)).join(',') : '';
      const runKey = `${mode}|${topicText}|${contextKey}`;
      if (autoGenerateKeyRef.current !== runKey) {
        autoGenerateKeyRef.current = runKey;
        generateFlashcards({
          mode: 'topic',
          topic: topicText,
          skipValidation: true,
        });
      }
    }

    navigate('/flashcards', { replace: true, state: {} });
  }, [location.state, userName, navigate, generating]);

  useEffect(() => {
    const savedStreak = localStorage.getItem('flashcardStreak');
    const lastStudyDate = localStorage.getItem('lastFlashcardStudy');
    const today = new Date().toDateString();
    
    if (savedStreak && lastStudyDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (lastStudyDate === today || lastStudyDate === yesterday.toDateString()) {
        setCurrentStreak(parseInt(savedStreak) || 0);
      } else {
        setCurrentStreak(0);
        localStorage.setItem('flashcardStreak', '0');
      }
    }
  }, []);

  
  useEffect(() => {
    const generatedFlashcards = location.state?.generatedFlashcards;
    
    if (generatedFlashcards && userName) {
      const createGeneratedFlashcards = async () => {
        try {
          const token = localStorage.getItem('token');
          const formData = new FormData();
          formData.append('user_id', userName);
          formData.append('action', 'save');
          formData.append('set_title', generatedFlashcards.title);
          formData.append('cards', JSON.stringify(generatedFlashcards.cards));
          formData.append('is_public', 'false');
          
          const response = await fetch(`${API_URL}/flashcard_agent/`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
          });
          
          if (response.ok) {
            const data = await response.json();
            
            
            setFlashcards(generatedFlashcards.cards);
            setCurrentCard(0);
            setIsFlipped(false);
            
            setCurrentSetInfo({
              saved: true,
              setId: data.set_id || data.data?.set_id,
              shareCode: data.share_code || data.data?.share_code,
              setTitle: generatedFlashcards.title,
              cardCount: generatedFlashcards.cards.length
            });
            
            
            const shuffledCards = studySettings.shuffle ? [...generatedFlashcards.cards].sort(() => Math.random() - 0.5) : generatedFlashcards.cards;
            setShuffledCards(shuffledCards);
            setPreviewMode(true);
            
            loadFlashcardHistory(true);
            loadFlashcardStats();
            
            
            navigate('/flashcards', { replace: true, state: {} });
          }
        } catch (error) {
          console.error('Error creating generated flashcards:', error);
          showPopup('Error', 'Failed to create flashcards from learning path');
        }
      };
      
      createGeneratedFlashcards();
    }
  }, [location.state, userName, navigate, studySettings.shuffle]);

  
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.fc-custom-select-wrapper')) {
        setSortDropdownOpen(false);
        setDifficultyDropdownOpen(false);
        setDepthDropdownOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  
  useEffect(() => {
    if (flashcardHistory && flashcardHistory.length > 0) {
      const allSets = getFilteredAndSortedSets();
      setDisplayedSets(allSets.slice(0, SETS_PER_PAGE));
    } else {
      setDisplayedSets([]);
    }
  }, [flashcardHistory, searchQuery, sortBy]);

  
  const loadMoreSets = useCallback(() => {
    const allSets = getFilteredAndSortedSets();
    const currentLength = displayedSets.length;
    
    if (currentLength >= allSets.length) {
      setHasMoreSets(false);
      return;
    }
    
    const nextBatch = allSets.slice(currentLength, currentLength + SETS_PER_PAGE);
    setDisplayedSets(prev => [...prev, ...nextBatch]);
    setHasMoreSets(currentLength + SETS_PER_PAGE < allSets.length);
  }, [displayedSets, flashcardHistory, searchQuery, sortBy]);

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


  useEffect(() => {
    if (activePanel !== 'cards') return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting && !isLoadingMore) {
          const allSets = getFilteredAndSortedSets();
          if (displayedSets.length < allSets.length) {
            setIsLoadingMore(true);
            
            setTimeout(() => {
              loadMoreSets();
              setIsLoadingMore(false);
            }, 300);
          }
        }
      },
      {
        root: null,
        rootMargin: '100px', 
        threshold: 0.1
      }
    );

    const sentinel = document.querySelector('.fc-load-more-sentinel');
    if (sentinel) {
      observer.observe(sentinel);
    }

    return () => {
      if (sentinel) {
        observer.unobserve(sentinel);
      }
    };
  }, [activePanel, displayedSets, isLoadingMore, loadMoreSets]);

  
  const getDisplayName = () => {
    if (userProfile?.name) return userProfile.name.split(' ')[0];
    if (userName) return userName.charAt(0).toUpperCase() + userName.slice(1);
    return 'Student';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor(Math.abs(now - date) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const getMasteryLevel = (accuracy) => {
    if (accuracy >= 90) return { level: 'Master', color: '#22c55e' };
    if (accuracy >= 70) return { level: 'Proficient', color: '#3b82f6' };
    if (accuracy >= 50) return { level: 'Learning', color: '#f59e0b' };
    return { level: 'Beginner', color: '#ef4444' };
  };

  const getFilteredAndSortedSets = () => {
    let filtered = flashcardHistory || [];
    if (searchQuery) {
      filtered = filtered.filter(set => 
        set.title?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    switch (sortBy) {
      case 'alphabetical':
        filtered = [...filtered].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
      case 'cards':
        filtered = [...filtered].sort((a, b) => (b.card_count || 0) - (a.card_count || 0));
        break;
      case 'accuracy':
        filtered = [...filtered].sort((a, b) => (b.accuracy_percentage || 0) - (a.accuracy_percentage || 0));
        break;
      default:
        break;
    }
    return filtered;
  };

  
  const getSetsToDisplay = () => {
    const allSets = getFilteredAndSortedSets();
    return allSets.slice(0, displayedSets.length || SETS_PER_PAGE);
  };

  
  const loadChatHistoryData = async () => {
    if (selectedSessions.length === 0) return [];
    try {
      const token = localStorage.getItem('token');
      const allMessages = [];
      for (const sessionId of selectedSessions) {
        const response = await fetch(`${API_URL}/get_chat_history/${sessionId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          allMessages.push(...data.messages);
        }
      }
      return allMessages;
    } catch (error) {
            return [];
    }
  };

  const generateChatSummaryTitle = async (chatHistory, flashcardsData = null) => {
    try {
      let textToAnalyze = '';
      if (flashcardsData && flashcardsData.length > 0) {
        textToAnalyze = flashcardsData.map(card => `${card.question} ${card.answer}`).join(' ').slice(0, 1500);
      } else if (chatHistory && chatHistory.length > 0) {
        textToAnalyze = chatHistory
          .filter(msg => (msg.user_message || msg.content) && (msg.ai_response || ''))
          .map(msg => `${msg.user_message || msg.content} ${msg.ai_response || ''}`)
          .join(' ').slice(0, 1500);
      }
      if (!textToAnalyze.trim()) return 'Study Session Cards';
      
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('chat_data', textToAnalyze);
      formData.append('max_words', '4');
      formData.append('format', 'title');
      
      const response = await queuedAIFormFetch('/generate_chat_summary', Object.fromEntries(formData.entries()));

      if (response.ok) {
        const data = await response.json();
        return data.summary || 'AI Study Session';
      }
      return 'Study Session Cards';
    } catch (error) {
      return 'Study Session Cards';
    }
  };

  const generateFlashcards = async (options = {}) => {
    const mode = options.mode || generationMode;
    const topicValue = typeof options.topic === 'string' ? options.topic : topic;
    const skipValidation = Boolean(options.skipValidation);

    if (!skipValidation && mode === 'topic' && !topicValue.trim()) return;
    if (mode === 'chat_history' && selectedSessions.length === 0) {
      showPopup('No Sessions Selected', 'Please select at least one chat session.');
      return;
    }

    setGenerating(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('user_id', userName);
      formData.append('card_count', cardCount.toString());
      formData.append('difficulty', difficultyLevel);
      formData.append('depth_level', depthLevel);
      formData.append('additional_specs', additionalSpecs);
      formData.append('is_public', isPublic.toString());
      formData.append('use_hs_context', hsMode.toString());
      const selectedContextDocIds = getSelectedContextDocIds();
      if (selectedContextDocIds.length > 0) {
        formData.append('context_doc_ids', selectedContextDocIds.join(','));
      }

      if (mode === 'topic') {
        formData.append('topic', topicValue);
        formData.append('generation_type', 'topic');
        formData.append('set_title', `Flashcards: ${topicValue}`);
      } else {
        const chatHistory = await loadChatHistoryData();
        const chatContent = chatHistory
          .map(msg => `Q: ${msg.user_message || msg.content}\nA: ${msg.ai_response || ''}`)
          .join('\n\n');
        formData.append('content', chatContent);
        formData.append('generation_type', 'chat_history');
        const summaryTitle = await generateChatSummaryTitle(chatHistory);
        formData.append('set_title', summaryTitle);
        formData.append('topic', summaryTitle);
      }

      const response = await queuedAIFormFetch('/generate_flashcards', Object.fromEntries(formData.entries()), {
        timeoutMs: 240000,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.error || 'Failed to generate flashcards');
      }

      const data = await response.json();
      const cards = data.cards || data.flashcards;

      if (!cards || cards.length === 0) {
        showPopup('No Cards Generated', 'Unable to generate flashcards. Try a different topic.');
        setGenerating(false);
        return;
      }

      setFlashcards(cards);
      setCurrentCard(0);
      setIsFlipped(false);

      setCurrentSetInfo({
        saved: true,
        setId: data.set_id,
        shareCode: data.share_code,
        setTitle: data.set_title || (mode === 'topic' ? `Flashcards: ${topicValue}` : 'Chat Study Cards'),
        cardCount: cards.length
      });

      loadFlashcardHistory(true);
      loadFlashcardStats();
      gamificationService.trackFlashcardSet(userName, cards.length);

      if (data.share_code) {
        window.history.replaceState({}, '', `/flashcards?code=${data.share_code}&mode=preview`);
      }

      const shuffledCards = studySettings.shuffle ? [...cards].sort(() => Math.random() - 0.5) : cards;
      setShuffledCards(shuffledCards);
      setPreviewMode(true);
    } catch (error) {
      showPopup('Error', error.message || 'Failed to generate flashcards. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const generateFlashcardsFromPDFs = async () => {
    if (selectedPDFs.length === 0) {
      showPopup('No PDFs Selected', 'Select at least one PDF source to convert into flashcards.');
      return;
    }

    setGenerating(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      const title = selectedPDFs.length === 1
        ? `Flashcards from ${selectedPDFs[0].filename}`
        : `Flashcards from ${selectedPDFs.length} PDFs`;

      formData.append('user_id', userName);
      formData.append('topic', selectedPDFs.map((doc) => doc.filename).join(', '));
      formData.append('generation_type', 'document_sources');
      formData.append('document_ids', selectedPDFs.map((doc) => doc.id).join(','));
      formData.append('card_count', cardCount.toString());
      formData.append('difficulty', difficultyLevel);
      formData.append('depth_level', depthLevel);
      formData.append('additional_specs', additionalSpecs);
      formData.append('is_public', isPublic.toString());
      formData.append('use_hs_context', hsMode.toString());
      formData.append('set_title', title);

      const response = await queuedAIFormFetch('/generate_flashcards', Object.fromEntries(formData.entries()), {
        timeoutMs: 240000,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to convert PDFs to flashcards');
      }

      const data = await response.json();
      const cards = data.cards || data.flashcards || [];

      if (!cards.length) {
        showPopup('No Cards Generated', 'The selected PDFs did not produce flashcards. Try another source or add instructions.');
        return;
      }

      setFlashcards(cards);
      setCurrentCard(0);
      setIsFlipped(false);
      setCurrentSetInfo({
        saved: true,
        setId: data.set_id,
        shareCode: data.share_code,
        setTitle: data.set_title || title,
        cardCount: cards.length
      });

      await loadFlashcardHistory(true);
      await loadFlashcardStats();
      gamificationService.trackFlashcardSet(userName, cards.length);

      const cardsForPreview = studySettings.shuffle ? [...cards].sort(() => Math.random() - 0.5) : cards;
      setShuffledCards(cardsForPreview);
      setPreviewMode(true);
    } catch (error) {
      showPopup('Conversion Failed', error.message || 'Failed to convert selected PDFs into flashcards.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyShareLink = () => {
    const token = currentSetInfo?.publicToken;
    if (!token) return;
    const url = `${window.location.origin}/flashcards/share/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareLinkCopied(true);
      setTimeout(() => setShareLinkCopied(false), 2000);
    }).catch(() => {
      showPopup('Share Link', url);
    });
  };

  const loadFlashcardSet = async (setId, mode = 'study') => {
    setLoadingSetId(setId);
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API_URL}/get_flashcards_in_set?set_id=${setId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setFlashcards(data.flashcards);
        setCurrentCard(0);
        setIsFlipped(false);
        
        setCurrentSetInfo({
          saved: true,
          setId: setId,
          shareCode: data.share_code,
          publicToken: data.public_token,
          setTitle: data.set_title || 'Flashcard Set',
          cardCount: data.flashcards.length
        });
        
        
        if (data.share_code) {
          const newUrl = `/flashcards?code=${data.share_code}&mode=${mode}`;
          window.history.replaceState({}, '', newUrl);
        }
        
        if (mode === 'preview') {
          
          const cards = studySettings.shuffle ? [...data.flashcards].sort(() => Math.random() - 0.5) : data.flashcards;
          setShuffledCards(cards);
          setPreviewMode(true);
        } else if (mode === 'study') {
          
          
          let cards = [...data.flashcards].sort((a, b) => {
            
            if (a.marked_for_review && !b.marked_for_review) return -1;
            if (!a.marked_for_review && b.marked_for_review) return 1;
            return 0;
          });
          if (studySettings.shuffle) {
            
            const reviewCards = cards.filter(c => c.marked_for_review);
            const otherCards = cards.filter(c => !c.marked_for_review);
            cards = [
              ...reviewCards.sort(() => Math.random() - 0.5),
              ...otherCards.sort(() => Math.random() - 0.5)
            ];
          }
          setStudySessionStats({ correct: 0, incorrect: 0, skipped: 0 });
          setShowStudyResults(false);
          setShuffledCards(cards);
          generateMCQOptions(cards, 0);
          setStudyMode(true);
          updateStreak();
        }
      }
    } catch (error) {
            showPopup('Error', 'Failed to load flashcard set');
    } finally {
      setLoadingSetId(null);
    }
  };

  const deleteFlashcardSet = async (setId, event) => {
    event?.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this flashcard set?')) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/flashcards/sets/${setId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        showPopup('Deleted Successfully', 'The flashcard set has been removed.');
        loadFlashcardHistory(true); 
        loadFlashcardStats();
        if (currentSetInfo && currentSetInfo.setId === setId) {
          setFlashcards([]);
          setCurrentSetInfo(null);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        showPopup('Error', errorData.detail || 'Failed to delete flashcard set');
      }
    } catch (error) {
      showPopup('Error', 'Failed to delete flashcard set');
    }
  };

  const handleRenameSubmit = async (setId) => {
    if (!editingTitle.trim()) {
      setEditingSetId(null);
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/update_flashcard_set`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ set_id: setId, title: editingTitle.trim(), description: '' })
      });
      if (response.ok) {
        loadFlashcardHistory(true); 
        showPopup('Renamed Successfully', 'The flashcard set has been renamed.');
      }
    } catch (error) { /* silenced */ }
    setEditingSetId(null);
    setEditingTitle('');
  };

  
  const updateStreak = () => {
    const today = new Date().toDateString();
    const lastStudy = localStorage.getItem('lastFlashcardStudy');
    if (lastStudy !== today) {
      const newStreak = currentStreak + 1;
      setCurrentStreak(newStreak);
      localStorage.setItem('flashcardStreak', newStreak.toString());
      localStorage.setItem('lastFlashcardStudy', today);
    }
  };

  const generateMCQOptions = (cards, cardIndex) => {
    if (!cards || !cards[cardIndex]) return;
    
    const currentCardData = cards[cardIndex];
    const correctAnswer = cleanFlashcardChoiceText(currentCardData.answer);
    
    
    if (currentCardData.wrong_options && currentCardData.wrong_options.length >= 3) {
      
      const allOptions = [
        { id: 'correct', text: correctAnswer, isCorrect: true },
        ...currentCardData.wrong_options.slice(0, 3).map((option, index) => ({
          id: `wrong-${index}`,
          text: cleanFlashcardChoiceText(option),
          isCorrect: false,
        })),
      ].sort(() => Math.random() - 0.5);
      setMcqOptions(allOptions);
    } else {
      
      const otherCards = cards.filter((_, idx) => idx !== cardIndex);
      const shuffledOthers = [...otherCards].sort(() => Math.random() - 0.5);
      const wrongAnswers = shuffledOthers.slice(0, 3).map(card => cleanFlashcardChoiceText(card.answer));
      
      
      const allOptions = [
        { id: 'correct', text: correctAnswer, isCorrect: true },
        ...wrongAnswers.map((option, index) => ({
          id: `wrong-${index}`,
          text: option,
          isCorrect: false,
        })),
      ].sort(() => Math.random() - 0.5);
      setMcqOptions(allOptions);
    }
    setSelectedOption(null);
    setShowAnswer(false);
  };

  const handleMCQSelection = async (option) => {
    if (showAnswer) return; 
    
    setSelectedOption(option.id);
    setShowAnswer(true);
    
    const isCorrect = Boolean(option.isCorrect);
    
    
    setStudySessionStats(prev => ({
      ...prev,
      correct: isCorrect ? prev.correct + 1 : prev.correct,
      incorrect: !isCorrect ? prev.incorrect + 1 : prev.incorrect
    }));
    
    
    const cards = shuffledCards.length > 0 ? shuffledCards : flashcards;
    const card = cards[currentCard];
    if (card?.id) {
      await updateCardMastery(card.id, isCorrect, 'study');
      if (!isCorrect) {
        await markCardForReview(card.id, true);
      }
    }
  };

  const handleNextMCQ = () => {
    const cards = shuffledCards.length > 0 ? shuffledCards : flashcards;
    
    
    const studyContent = document.querySelector('.fc-study-content');
    if (studyContent) {
      studyContent.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    if (currentCard < cards.length - 1) {
      const nextIndex = currentCard + 1;
      setCurrentCard(nextIndex);
      generateMCQOptions(cards, nextIndex);
      setIsFlipped(false);
    } else {
      setShowStudyResults(true);
    }
  };

  const handleStudyResponse = async (response) => {
    setStudySessionStats(prev => ({ ...prev, [response]: prev[response] + 1 }));
    const cards = studySettings.shuffle ? shuffledCards : flashcards;
    
    
    if (agentSessionActive && cards[currentCard]) {
      const quality = response === 'correct' ? 5 : response === 'incorrect' ? 1 : 3;
      const responseTime = sessionStartTime ? (Date.now() - sessionStartTime) / 1000 : 5;
      await reviewCardWithAgent(cards[currentCard].id, quality, responseTime);
      setSessionStartTime(Date.now()); 
    }
    
    if (currentCard < cards.length - 1) {
      setCurrentCard(currentCard + 1);
      setIsFlipped(false);
    } else {
      setShowStudyResults(true);
      if (agentSessionActive) {
        await endAgentSession();
      }
    }
  };

  const exitStudyMode = () => {
    if (agentSessionActive) {
      endAgentSession();
    }
    setStudyMode(false);
    setPreviewMode(false);
    setShowStudyResults(false);
    setStudySessionStats({ correct: 0, incorrect: 0, skipped: 0 });
    setCurrentCard(0);
    setIsFlipped(false);
    setSelectedOption(null);
    setShowAnswer(false);
    setMcqOptions([]);
    
    
    loadFlashcardHistory(true); 
    
    
    window.history.replaceState({}, '', '/flashcards');
  };

  const restartStudy = () => {
    setCurrentCard(0);
    setIsFlipped(false);
    setShowStudyResults(false);
    setStudySessionStats({ correct: 0, incorrect: 0, skipped: 0 });
    gradedCardsRef.current = new Set();
    setSelectedOption(null);
    setShowAnswer(false);
    
    
    if (previewMode) {
      const cards = studySettings.shuffle ? [...flashcards].sort(() => Math.random() - 0.5) : flashcards;
      setShuffledCards(cards);
    } else {
      
      const cards = studySettings.shuffle ? [...flashcards].sort(() => Math.random() - 0.5) : flashcards;
      setShuffledCards(cards);
      
      generateMCQOptions(cards, 0);
    }
  };

  const handleNext = () => {
    if (currentCard < flashcards.length - 1) {
      setCurrentCard(currentCard + 1);
      setIsFlipped(false);
    }
  };

  const handlePrevious = () => {
    if (currentCard > 0) {
      setCurrentCard(currentCard - 1);
      setIsFlipped(false);
    }
  };

  const currentStudyCards = studySettings.shuffle ? shuffledCards : flashcards;

  
  if (customCreateMode) {
    const currentCustomCard = customCards[currentCard] || customCards[0];
    
    
    const autoSaveCustomCards = async () => {
      const validCards = customCards.filter(c => c.question.trim() && c.answer.trim());
      if (validCards.length === 0 || !customSetTitle.trim()) return;
      
      try {
        const token = localStorage.getItem('token');
        
        
        const setResponse = await fetch(`${API_URL}/flashcards/sets/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            user_id: userName,
            title: customSetTitle,
            description: `Custom set with ${validCards.length} cards`,
            is_public: isPublic
          })
        });

        if (!setResponse.ok) return;
        const setData = await setResponse.json();

        
        for (const card of validCards) {
          await fetch(`${API_URL}/flashcards/cards/create`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              set_id: setData.set_id,
              question: card.question,
              answer: card.answer,
              difficulty: 'medium'
            })
          });
        }

        loadFlashcardHistory(true); 
        loadFlashcardStats();
      } catch (error) { /* silenced */ }
    };
    
    
    const hasValidCard = customCards.some(c => c.question.trim() && c.answer.trim());
    const canSave = !generating && customSetTitle.trim() && hasValidCard;
    
    return (
      <div className="flashcards-page">
        <div className="fc-study-mode fc-edit-mode">
          <div className="fc-study-header fc-create-header">
            <div className="fc-header-actions fc-header-left">
              <button 
                className="fc-header-btn fc-done-btn"
                onClick={async () => {
                  await saveCustomFlashcards();
                  setActivePanel('cards');
                }}
                disabled={!canSave}
              >
                DONE
              </button>
              <button 
                className="fc-header-btn fc-save-btn-small"
                onClick={saveCustomFlashcards}
                disabled={!canSave}
              >
                {generating ? 'SAVING...' : 'SAVE'}
              </button>
              <button 
                className="fc-header-btn fc-autosave-btn"
                onClick={autoSaveCustomCards}
                disabled={!canSave}
              >
                AUTO SAVE
              </button>
            </div>
            <div className="fc-create-title-area">
              <input
                type="text"
                className="fc-edit-title-input fc-create-title-input"
                value={customSetTitle}
                onChange={(e) => setCustomSetTitle(e.target.value)}
                placeholder="Enter set title..."
              />
            </div>
            <button className="fc-exit-btn fc-exit-styled" onClick={exitCustomCreateMode}>
              EXIT {FC_ICONS.chevronRight}
            </button>
          </div>

          <div className="fc-study-progress">
            <div 
              className="fc-study-progress-fill" 
              style={{ width: `${((currentCard + 1) / customCards.length) * 100}%` }}
            />
          </div>

          <div className="fc-study-content fc-edit-content">
            <div className="fc-edit-card-container">
              <button 
                className="fc-arrow-btn fc-arrow-left"
                onClick={() => {
                  if (currentCard > 0) {
                    setCurrentCard(currentCard - 1);
                  }
                }}
                disabled={currentCard === 0}
              >
                ◀
              </button>
              
              <div className="fc-edit-card">
                <div className="fc-edit-card-header">
                  <span className="fc-edit-card-number">Card {currentCard + 1}</span>
                  <div className="fc-edit-card-actions">
                    <span className="fc-edit-badge fc-badge-new">NEW</span>
                    <button 
                      className="fc-edit-delete-btn"
                      onClick={() => removeCustomCardInEditor(currentCard)}
                      disabled={customCards.length === 1}
                      title="Delete this card"
                    >
                      {FC_ICONS.trash}
                    </button>
                  </div>
                </div>
                
                <div className="fc-edit-field">
                  <label className="fc-edit-label">Question / Front</label>
                  <textarea
                    className="fc-edit-textarea"
                    value={currentCustomCard?.question || ''}
                    onChange={(e) => updateCustomCardInEditor(currentCard, 'question', e.target.value)}
                    placeholder="Enter the question..."
                    rows={4}
                  />
                </div>
                
                <div className="fc-edit-field">
                  <label className="fc-edit-label">Answer / Back</label>
                  <textarea
                    className="fc-edit-textarea"
                    value={currentCustomCard?.answer || ''}
                    onChange={(e) => updateCustomCardInEditor(currentCard, 'answer', e.target.value)}
                    placeholder="Enter the answer..."
                    rows={4}
                  />
                </div>
              </div>
              
              <button 
                className="fc-arrow-btn fc-arrow-right"
                onClick={() => {
                  if (currentCard < customCards.length - 1) {
                    setCurrentCard(currentCard + 1);
                  }
                }}
                disabled={currentCard === customCards.length - 1}
              >
                ▶
              </button>
            </div>

            <div className="fc-edit-bottom-actions">
              <button 
                className="fc-btn fc-btn-secondary fc-add-card-btn"
                onClick={() => {
                  addCustomCardInEditor();
                  setTimeout(() => setCurrentCard(customCards.length), 50);
                }}
              >
                + Add New Card
              </button>
            </div>

            <div className="fc-edit-card-dots">
              {customCards.map((_, idx) => (
                <button
                  key={idx}
                  className={`fc-edit-dot ${idx === currentCard ? 'active' : ''}`}
                  onClick={() => setCurrentCard(idx)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  
  if (editMode && editingCards.length > 0) {
    const activeCards = editingCards.filter(c => !c.isDeleted);
    const currentEditCard = activeCards[currentCard] || activeCards[0];
    const currentEditIndex = editingCards.findIndex(c => c === currentEditCard);
    
    return (
      <div className="flashcards-page">
        <AbstractFx variant="circles" />
        <div className="fc-study-mode fc-edit-mode">
          <div className="fc-study-header fc-create-header">
            <div className="fc-study-title">
              <input
                type="text"
                className="fc-edit-title-input"
                value={editingSetTitle}
                onChange={(e) => setEditingSetTitle(e.target.value)}
                placeholder="Set Title..."
              />
              <span className="fc-card-counter">EDITING {activeCards.length} CARDS</span>
            </div>
            <div className="fc-header-actions">
              <button 
                className="fc-btn fc-btn-primary fc-save-btn"
                onClick={saveEditedFlashcards}
                disabled={generating}
              >
                {generating ? 'SAVING...' : <>{FC_ICONS.check} SAVE</>}
              </button>
              <button className="fc-exit-btn fc-exit-styled" onClick={cancelEditMode}>
                EXIT {FC_ICONS.chevronRight}
              </button>
            </div>
          </div>

          <div className="fc-study-progress">
            <div 
              className="fc-study-progress-fill" 
              style={{ width: `${((currentCard + 1) / activeCards.length) * 100}%` }}
            />
          </div>

          <div className="fc-study-content fc-edit-content">
            <div className="fc-edit-card-container">
              <button 
                className="fc-arrow-btn fc-arrow-left"
                onClick={() => {
                  if (currentCard > 0) {
                    setCurrentCard(currentCard - 1);
                  }
                }}
                disabled={currentCard === 0}
              >
                ◀
              </button>
              
              <div className="fc-edit-card">
                <div className="fc-edit-card-header">
                  <span className="fc-edit-card-number">Card {currentCard + 1}</span>
                  <div className="fc-edit-card-actions">
                    {currentEditCard?.isNew && (
                      <span className="fc-edit-badge fc-badge-new">NEW</span>
                    )}
                    {currentEditCard?.is_edited && !currentEditCard?.isNew && (
                      <span className="fc-edit-badge fc-badge-edited" title={`Edited ${currentEditCard?.edited_at ? new Date(currentEditCard.edited_at).toLocaleString() : ''}`}>EDITED</span>
                    )}
                    <button 
                      className="fc-edit-delete-btn"
                      onClick={() => {
                        if (currentEditIndex >= 0) {
                          markCardForDeletion(currentEditIndex);
                          if (currentCard >= activeCards.length - 1 && currentCard > 0) {
                            setCurrentCard(currentCard - 1);
                          }
                        }
                      }}
                      title="Delete this card"
                    >
                      {FC_ICONS.trash}
                    </button>
                  </div>
                </div>
                
                <div className="fc-edit-field">
                  <label className="fc-edit-label">Question / Front</label>
                  <textarea
                    className="fc-edit-textarea"
                    value={currentEditCard?.question || ''}
                    onChange={(e) => {
                      if (currentEditIndex >= 0) {
                        updateEditingCard(currentEditIndex, 'question', e.target.value);
                      }
                    }}
                    placeholder="Enter the question..."
                    rows={4}
                  />
                </div>
                
                <div className="fc-edit-field">
                  <label className="fc-edit-label">Answer / Back</label>
                  <textarea
                    className="fc-edit-textarea"
                    value={currentEditCard?.answer || ''}
                    onChange={(e) => {
                      if (currentEditIndex >= 0) {
                        updateEditingCard(currentEditIndex, 'answer', e.target.value);
                      }
                    }}
                    placeholder="Enter the answer..."
                    rows={4}
                  />
                </div>
              </div>
              
              <button 
                className="fc-arrow-btn fc-arrow-right"
                onClick={() => {
                  if (currentCard < activeCards.length - 1) {
                    setCurrentCard(currentCard + 1);
                  }
                }}
                disabled={currentCard === activeCards.length - 1}
              >
                ▶
              </button>
            </div>

            <div className="fc-edit-bottom-actions">
              <button 
                className="fc-btn fc-btn-secondary fc-add-card-btn"
                onClick={() => {
                  addCardToEdit();
                  
                  setTimeout(() => {
                    setCurrentCard(editingCards.filter(c => !c.isDeleted).length);
                  }, 50);
                }}
              >
                + Add New Card
              </button>
            </div>

            <div className="fc-edit-card-dots">
              {activeCards.map((_, idx) => (
                <button
                  key={idx}
                  className={`fc-edit-dot ${idx === currentCard ? 'active' : ''}`}
                  onClick={() => setCurrentCard(idx)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  
  if (previewMode && flashcards.length > 0) {
    const previewCards = shuffledCards.length > 0 ? shuffledCards : flashcards;
    
    const ChevronLeft = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>;
    const ChevronRight = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>;
    
    const handleCardClick = (e) => {
      e.stopPropagation();
      setIsFlipped(prev => !prev);
    };
    
    
    if (showStudyResults) {
      const totalReviewed = studySessionStats.correct + studySessionStats.incorrect;
      const knownPercentage = totalReviewed > 0 ? Math.round((studySessionStats.correct / totalReviewed) * 100) : 0;
      const ringRadius = 52;
      const ringCircumference = 2 * Math.PI * ringRadius;
      const ringOffset = ringCircumference - (knownPercentage / 100) * ringCircumference;
      const ringColor = totalReviewed === 0
        ? 'var(--fc-accent)'
        : knownPercentage >= 70 ? '#22c55e'
        : knownPercentage >= 50 ? '#f59e0b'
        : 'var(--fc-danger)';
      const performanceTier = totalReviewed === 0 ? null
        : knownPercentage >= 90 ? { label: 'Perfect', color: '#22c55e' }
        : knownPercentage >= 70 ? { label: 'Great', color: 'var(--fc-accent)' }
        : knownPercentage >= 50 ? { label: 'Good', color: '#f59e0b' }
        : { label: 'Keep Going', color: 'var(--fc-danger)' };

      return (
        <div className="flashcards-page">
          <AbstractFx variant="circles" />
          <div className="fc-study-mode">
            <div className="fc-results">
              <div className="fc-results-card">
                <div className="fc-results-orb fc-results-orb--tl" />
                <div className="fc-results-orb fc-results-orb--br" />

                <div className="fc-results-header">
                  <div className="fc-results-icon">{FC_ICONS.celebration}</div>
                  <h2>Review Complete!</h2>
                  <p className="fc-results-subtitle">{currentSetInfo?.setTitle || 'Preview Session'}</p>
                </div>

                <div className="fc-results-score-section">
                  <div
                    className="fc-results-ring-wrap"
                    style={{ '--ring-color': ringColor }}
                  >
                    <svg className="fc-results-ring" viewBox="0 0 120 120">
                      <circle className="fc-ring-track" cx="60" cy="60" r={ringRadius} />
                      <circle
                        className="fc-ring-fill"
                        cx="60" cy="60" r={ringRadius}
                        strokeDasharray={ringCircumference}
                        style={{ strokeDashoffset: ringOffset, '--dash-offset': ringOffset }}
                      />
                    </svg>
                    <div className="fc-ring-center">
                      <span className="fc-ring-pct">{knownPercentage}%</span>
                      <span className="fc-ring-lbl">mastered</span>
                    </div>
                  </div>
                  {performanceTier && (
                    <div className="fc-results-badge" style={{ '--badge-color': performanceTier.color }}>
                      {performanceTier.label}
                    </div>
                  )}
                </div>

                <div className="fc-results-stats">
                  <div className="fc-result-stat correct">
                    <div className="fc-result-stat-icon">{FC_ICONS.check}</div>
                    <div className="fc-result-stat-num">{studySessionStats.correct}</div>
                    <div className="fc-result-stat-label">I Know This</div>
                  </div>
                  <div className="fc-result-stat incorrect">
                    <div className="fc-result-stat-icon">{FC_ICONS.x}</div>
                    <div className="fc-result-stat-num">{studySessionStats.incorrect}</div>
                    <div className="fc-result-stat-label">Don't Know</div>
                  </div>
                  <div className="fc-result-stat skipped">
                    <div className="fc-result-stat-icon">{FC_ICONS.eye}</div>
                    <div className="fc-result-stat-num">{totalReviewed}</div>
                    <div className="fc-result-stat-label">Cards Reviewed</div>
                  </div>
                </div>

                <div className="fc-results-message">
                  {totalReviewed === 0 ? (
                    <p>You viewed the cards but didn't mark any as known or unknown. Try reviewing them to track your progress.</p>
                  ) : knownPercentage >= 80 ? (
                    <p>Excellent! You know {knownPercentage}% of these cards. Keep up the great work!</p>
                  ) : knownPercentage >= 50 ? (
                    <p>Good progress! You know {knownPercentage}% of these cards. Keep studying!</p>
                  ) : (
                    <p>You know {knownPercentage}% of these cards. Practice makes perfect!</p>
                  )}
                </div>

                <div className="fc-results-actions">
                  <button className="fc-btn fc-btn-secondary" onClick={restartStudy}>
                    {FC_ICONS.refresh} Review Again
                  </button>
                  <button
                    className="fc-btn fc-btn-primary"
                    onClick={() => {
                      setPreviewMode(false);
                      setShowStudyResults(false);
                      setStudySessionStats({ correct: 0, incorrect: 0, skipped: 0 });
                      setCurrentCard(0);
                      const cards = studySettings.shuffle ? [...previewCards].sort(() => Math.random() - 0.5) : previewCards;
                      setShuffledCards(cards);
                      generateMCQOptions(cards, 0);
                      setStudyMode(true);
                    }}
                  >
                    {FC_ICONS.target} Start Quiz
                  </button>
                  <button className="fc-btn fc-btn-secondary" onClick={exitStudyMode}>
                    Exit
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    return (
      <div className="flashcards-page">
        <AbstractFx variant="circles" />
        <div className="fc-study-mode">
          <div className="fc-study-header fc-create-header">
            <div className="fc-study-title">
              <h2>{formatTitle(currentSetInfo?.setTitle) || 'Preview Mode'}</h2>
              <span className="fc-card-counter">CARD {currentCard + 1} OF {previewCards.length}</span>
            </div>
            <div className="fc-study-header-actions">
              <button
                className="fc-ask-ai-toggle-btn"
                onClick={handleCopyShareLink}
                type="button"
                disabled={!currentSetInfo?.publicToken}
                title="Copy shareable link to this flashcard set"
              >
                {shareLinkCopied ? FC_ICONS.check : FC_ICONS.link}
                <span>{shareLinkCopied ? 'Link Copied' : 'Share'}</span>
              </button>
              <button className="fc-ask-ai-toggle-btn" onClick={() => setAskAiOpen(prev => !prev)} type="button">
                {FC_ICONS.chat}
                <span>Ask AI</span>
              </button>
              <button className="fc-exit-btn fc-exit-styled" onClick={() => {

                setShowStudyResults(true);
              }}>
                EXIT {FC_ICONS.chevronRight}
              </button>
            </div>
          </div>

          <div className="fc-study-progress">
            <div 
              className="fc-study-progress-fill" 
              style={{ width: `${((currentCard + 1) / previewCards.length) * 100}%` }}
            />
          </div>

          <div className="fc-study-content">
            <div className="fc-preview-card-container">
              <button 
                className="fc-arrow-btn fc-arrow-left"
                onClick={(e) => {
                  e.stopPropagation();
                  if (currentCard > 0) {
                    setCurrentCard(currentCard - 1);
                    setIsFlipped(false);
                  }
                }}
                disabled={currentCard === 0}
              >
                ◀
              </button>
              <div 
                className={`fc-study-card ${isFlipped ? 'flipped' : ''}`}
                onClick={handleCardClick}
              >
                <div className="fc-study-card-inner">
                  <div className="fc-study-card-front">
                    <div className="fc-study-badge">Question</div>
                    <div className="fc-study-card-scroll">
                      <MathRenderer content={previewCards[currentCard]?.question || ''} className="fc-study-card-text" />
                      {previewCards[currentCard]?.is_edited && (
                        <div className="fc-edited-badge" title={`Edited ${previewCards[currentCard]?.edited_at ? new Date(previewCards[currentCard].edited_at).toLocaleString() : ''}`}>
                          EDITED
                        </div>
                      )}
                    </div>
                    <div className="fc-study-hint">Click to flip</div>
                  </div>
                  <div className="fc-study-card-back">
                    <div className="fc-study-badge">Answer</div>
                    <div className="fc-study-card-scroll">
                      <MathRenderer content={previewCards[currentCard]?.answer || ''} className="fc-study-card-text" />
                    </div>
                    <div className="fc-study-hint">Click to flip back</div>
                  </div>
                </div>
              </div>
              <button 
                className="fc-arrow-btn fc-arrow-right"
                onClick={(e) => {
                  e.stopPropagation();
                  if (currentCard < previewCards.length - 1) {
                    setCurrentCard(currentCard + 1);
                    setIsFlipped(false);
                  }
                }}
                disabled={currentCard === previewCards.length - 1}
              >
                ▶
              </button>
            </div>

            <div className="fc-knowledge-btns">
              <button
                className="fc-knowledge-btn fc-dont-know"
                onClick={async (e) => {
                  e.stopPropagation();
                  const alreadyGraded = gradedCardsRef.current.has(currentCard);
                  if (!alreadyGraded) {
                    gradedCardsRef.current.add(currentCard);
                    setStudySessionStats(prev => ({ ...prev, incorrect: prev.incorrect + 1 }));
                    const card = previewCards[currentCard];
                    if (card?.id) {
                      await updateCardMastery(card.id, false, 'preview');
                      await markCardForReview(card.id, true);
                    }
                  }
                  if (currentCard < previewCards.length - 1) {
                    setCurrentCard(currentCard + 1);
                    setIsFlipped(false);
                  } else {
                    setShowStudyResults(true);
                  }
                }}
              >
                {FC_ICONS.x}
                <span>I don't know this</span>
              </button>
              <button
                className="fc-knowledge-btn fc-know"
                onClick={async (e) => {
                  e.stopPropagation();
                  const alreadyGraded = gradedCardsRef.current.has(currentCard);
                  if (!alreadyGraded) {
                    gradedCardsRef.current.add(currentCard);
                    setStudySessionStats(prev => ({ ...prev, correct: prev.correct + 1 }));
                    const card = previewCards[currentCard];
                    if (card?.id) {
                      await updateCardMastery(card.id, true, 'preview');
                      if (card?.marked_for_review) {
                        await markCardForReview(card.id, false);
                      }
                    }
                  }
                  if (currentCard < previewCards.length - 1) {
                    setCurrentCard(currentCard + 1);
                    setIsFlipped(false);
                  } else {
                    setShowStudyResults(true);
                  }
                }}
              >
                {FC_ICONS.check}
                <span>I know this</span>
              </button>
            </div>
          </div>
          {renderAskAiPanel(previewCards[currentCard])}
        </div>
      </div>
    );
  }

  // Spaced Repetition Study Mode UI
  if (srStudyMode && dueCards.cards && dueCards.cards.length > 0) {
    const cards = dueCards.cards;
    const card = cards[srCurrentCard];
    const totalReviewed = srSessionStats.again + srSessionStats.hard + srSessionStats.good + srSessionStats.easy;
    const srProgress = Math.round(((srCurrentCard + (showSrResults ? 1 : 0)) / cards.length) * 100);

    if (showSrResults) {
      const totalGraded = srSessionStats.again + srSessionStats.hard + srSessionStats.good + srSessionStats.easy;
      const successRate = totalGraded > 0 ? Math.round(((srSessionStats.good + srSessionStats.easy) / totalGraded) * 100) : 0;

      return (
        <div className="flashcards-page">
          <div className="fc-study-mode">
            <div className="fc-sr-results">
              <h2 className="fc-sr-results-title">Session Complete</h2>
              <p className="fc-sr-results-subtitle">{totalGraded} Cards Reviewed</p>

              <div className="fc-sr-results-grid">
                <div className="fc-sr-result-item fc-sr-again">
                  <span className="fc-sr-result-count">{srSessionStats.again}</span>
                  <span className="fc-sr-result-label">Again</span>
                </div>
                <div className="fc-sr-result-item fc-sr-hard">
                  <span className="fc-sr-result-count">{srSessionStats.hard}</span>
                  <span className="fc-sr-result-label">Hard</span>
                </div>
                <div className="fc-sr-result-item fc-sr-good">
                  <span className="fc-sr-result-count">{srSessionStats.good}</span>
                  <span className="fc-sr-result-label">Good</span>
                </div>
                <div className="fc-sr-result-item fc-sr-easy">
                  <span className="fc-sr-result-count">{srSessionStats.easy}</span>
                  <span className="fc-sr-result-label">Easy</span>
                </div>
              </div>

              <div className="fc-sr-retention-bar">
                <div className="fc-sr-retention-fill" style={{ width: `${successRate}%` }}></div>
                <span className="fc-sr-retention-text">{successRate}% success rate</span>
              </div>

              <div className="fc-sr-results-actions">
                <button className="fc-btn fc-btn-primary" onClick={exitSrStudy}>
                  Back to Study Queue
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flashcards-page">
        <div className="fc-study-mode">
          <div className="fc-study-header">
            <button className="fc-btn fc-btn-ghost" onClick={exitSrStudy}>
              {FC_ICONS.back} Exit
            </button>
            <div className="fc-study-progress">
              <span>{srCurrentCard + 1} / {cards.length}</span>
              <div className="fc-progress-bar">
                <div className="fc-progress-fill" style={{ width: `${srProgress}%` }}></div>
              </div>
            </div>
            <div className="fc-sr-session-counts">
              <span className="fc-sr-mini-count fc-sr-again">{srSessionStats.again}</span>
              <span className="fc-sr-mini-count fc-sr-hard">{srSessionStats.hard}</span>
              <span className="fc-sr-mini-count fc-sr-good">{srSessionStats.good}</span>
              <span className="fc-sr-mini-count fc-sr-easy">{srSessionStats.easy}</span>
            </div>
            <button className="fc-ask-ai-toggle-btn" onClick={() => setAskAiOpen(prev => !prev)} type="button">
              {FC_ICONS.chat}
              <span>Ask AI</span>
            </button>
          </div>

          <div className="fc-sr-body">
            <div className="fc-sr-card-area">
              {card && (
                <div className={`fc-sr-card ${srFlipped ? 'fc-sr-card-flipped' : ''}`} onClick={() => !srFlipped && setSrFlipped(true)}>
                  <div className="fc-sr-card-inner">
                    <div className="fc-sr-card-front">
                      <div className="fc-sr-card-badge">{card.sr_state === 'new' ? 'NEW' : card.sr_state?.toUpperCase()}</div>
                      <div className="fc-sr-card-set">{card.set_title}</div>
                      <MathRenderer content={card.question || ''} className="fc-sr-card-content" />
                      <div className="fc-sr-tap-hint">Tap to reveal answer</div>
                    </div>
                    <div className="fc-sr-card-back">
                      <div className="fc-sr-card-label">Answer</div>
                      <MathRenderer content={card.answer || ''} className="fc-sr-card-content" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {srFlipped && card && (
              <div className="fc-sr-grade-buttons">
                <button className="fc-sr-grade fc-sr-again" onClick={() => handleSrReview('again')}>
                  <span className="fc-sr-grade-interval">{card.interval_preview?.again || '1m'}</span>
                  <span className="fc-sr-grade-label">Again</span>
                </button>
                <button className="fc-sr-grade fc-sr-hard" onClick={() => handleSrReview('hard')}>
                  <span className="fc-sr-grade-interval">{card.interval_preview?.hard || '6m'}</span>
                  <span className="fc-sr-grade-label">Hard</span>
                </button>
                <button className="fc-sr-grade fc-sr-good" onClick={() => handleSrReview('good')}>
                  <span className="fc-sr-grade-interval">{card.interval_preview?.good || '1d'}</span>
                  <span className="fc-sr-grade-label">Good</span>
                </button>
                <button className="fc-sr-grade fc-sr-easy" onClick={() => handleSrReview('easy')}>
                  <span className="fc-sr-grade-interval">{card.interval_preview?.easy || '4d'}</span>
                  <span className="fc-sr-grade-label">Easy</span>
                </button>
              </div>
            )}

            <div className="fc-sr-nav-row">
              <button
                className="fc-sr-nav-btn"
                onClick={() => { setSrCurrentCard(Math.max(0, srCurrentCard - 1)); setSrFlipped(false); }}
                disabled={srCurrentCard === 0}
              >
                ← Prev
              </button>
              <button
                className="fc-sr-nav-btn"
                onClick={() => { setSrCurrentCard(Math.min(cards.length - 1, srCurrentCard + 1)); setSrFlipped(false); }}
                disabled={srCurrentCard === cards.length - 1}
              >
                Next →
              </button>
            </div>
          </div>
          {renderAskAiPanel(card)}
        </div>
      </div>
    );
  }

  // Study Mode UI (MCQ Quiz)
  if (studyMode && flashcards.length > 0) {
    return (
      <div className="flashcards-page">
        <div className="fc-study-mode">
          {showStudyResults ? (
            <div className="fc-results">
              <div className="fc-results-card">
                <div className="fc-results-icon">{FC_ICONS.celebration}</div>
                <h2>Quiz Complete!</h2>
                <p className="fc-results-subtitle">{currentSetInfo?.setTitle || 'Study Session'}</p>
                
                <div className="fc-results-stats">
                  <div className="fc-result-stat correct">
                    <div className="fc-result-stat-icon">{FC_ICONS.check}</div>
                    <div className="fc-result-stat-num">{studySessionStats.correct}</div>
                    <div className="fc-result-stat-label">Correct</div>
                  </div>
                  <div className="fc-result-stat incorrect">
                    <div className="fc-result-stat-icon">{FC_ICONS.x}</div>
                    <div className="fc-result-stat-num">{studySessionStats.incorrect}</div>
                    <div className="fc-result-stat-label">Incorrect</div>
                  </div>
                  <div className="fc-result-stat skipped">
                    <div className="fc-result-stat-icon">{FC_ICONS.eye}</div>
                    <div className="fc-result-stat-num">{currentStudyCards.length}</div>
                    <div className="fc-result-stat-label">Total Questions</div>
                  </div>
                </div>

                <div className="fc-results-message">
                  {(() => {
                    const total = studySessionStats.correct + studySessionStats.incorrect;
                    const percentage = total > 0 ? Math.round((studySessionStats.correct / total) * 100) : 0;
                    
                    if (percentage === 100) {
                      return <p>Perfect score! You're a master of this topic!</p>;
                    } else if (percentage >= 90) {
                      return <p>Outstanding! You got {percentage}% correct. Almost perfect!</p>;
                    } else if (percentage >= 80) {
                      return <p>Excellent work! You scored {percentage}%. Keep it up!</p>;
                    } else if (percentage >= 70) {
                      return <p>Good job! You got {percentage}% correct. You're making progress!</p>;
                    } else if (percentage >= 60) {
                      return <p>Not bad! You scored {percentage}%. Review the material and try again!</p>;
                    } else {
                      return <p>You scored {percentage}%. Don't give up - practice makes perfect!</p>;
                    }
                  })()}
                </div>

                <div className="fc-results-actions">
                  <button className="fc-btn fc-btn-secondary" onClick={restartStudy}>
                    {FC_ICONS.refresh} Study Again
                  </button>
                  <button className="fc-btn fc-btn-primary" onClick={exitStudyMode}>
                    Back to Flashcards
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="fc-study-header fc-create-header">
                <div className="fc-study-title">
                  <h2>{formatTitle(currentSetInfo?.setTitle) || 'Study Session'}</h2>
                  <span className="fc-card-counter">CARD {currentCard + 1} OF {currentStudyCards.length}</span>
                </div>
                <div className="fc-study-header-actions">
                  <button
                    className="fc-ask-ai-toggle-btn"
                    onClick={handleCopyShareLink}
                    type="button"
                    disabled={!currentSetInfo?.publicToken}
                    title="Copy shareable link to this flashcard set"
                  >
                    {shareLinkCopied ? FC_ICONS.check : FC_ICONS.link}
                    <span>{shareLinkCopied ? 'Link Copied' : 'Share'}</span>
                  </button>
                  <button className="fc-ask-ai-toggle-btn" onClick={() => setAskAiOpen(prev => !prev)} type="button">
                    {FC_ICONS.chat}
                    <span>Ask AI</span>
                  </button>
                  <button className="fc-exit-btn fc-exit-styled" onClick={exitStudyMode}>
                    EXIT {FC_ICONS.chevronRight}
                  </button>
                </div>
              </div>

              <div className="fc-study-progress">
                <div 
                  className="fc-study-progress-fill" 
                  style={{ width: `${((currentCard + 1) / currentStudyCards.length) * 100}%` }}
                />
              </div>

              <div className="fc-study-content">
                <div className="fc-study-mcq-area">
                  <div className="fc-mcq-question-container">
                      <div className="fc-study-question-card">
                        <div className="fc-study-badge">Question</div>
                      <MathRenderer
                        content={cleanFlashcardChoiceText(currentStudyCards[currentCard]?.question)}
                        className="fc-study-question-text"
                      />
                    </div>
                  </div>

                  <div className="fc-mcq-options">
                    {mcqOptions.map((option, index) => {
                      const isCorrect = Boolean(option.isCorrect);
                      const isSelected = option.id === selectedOption;
                      let optionClass = 'fc-mcq-option';
                      
                      if (showAnswer) {
                        if (isCorrect) {
                          optionClass += ' correct';
                        } else if (isSelected && !isCorrect) {
                          optionClass += ' incorrect';
                        } else {
                          optionClass += ' disabled';
                        }
                      }
                      
                      return (
                        <button
                          key={option.id || index}
                          className={optionClass}
                          onClick={() => handleMCQSelection(option)}
                          aria-disabled={showAnswer}
                        >
                          <span className="fc-mcq-letter">{String.fromCharCode(65 + index)}</span>
                          <MathRenderer content={option.text || ''} className="fc-mcq-text" />
                          {showAnswer && isCorrect && <span className="fc-mcq-icon">{FC_ICONS.check}</span>}
                          {showAnswer && isSelected && !isCorrect && <span className="fc-mcq-icon">{FC_ICONS.x}</span>}
                        </button>
                      );
                    })}
                  </div>

                  {showAnswer && (
                    <button className="fc-next-question-btn" onClick={handleNextMCQ}>
                      {currentCard < currentStudyCards.length - 1 ? 'NEXT QUESTION' : 'FINISH'}
                      {FC_ICONS.chevronRight}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
          {renderAskAiPanel(currentStudyCards[currentCard])}
        </div>
      </div>
    );
  }


  return (
    <div className="flashcards-page">
      <GeoBackground />
      <div className="fc-qb-topbar">
        <div className="fc-qb-tagline"><span>LEARNING,</span> UNIFIED</div>
        <div className="fc-qb-topbar-right">
          <div className="fc-qb-context-control">
            <ContextSelector hsMode={hsMode} docCount={userDocCount} onOpen={() => setContextPanelOpen(true)} />
          </div>
        </div>
      </div>

      <div className="fc-layout fc-qb-body">
        <div className={`fc-qb-shell ${sidebarCollapsed ? 'fc-qb-shell--collapsed' : ''}`}>
          <aside className={`fc-qb-sidebar ${sidebarCollapsed ? 'fc-qb-sidebar--collapsed' : ''}`} aria-label="Flashcards navigation">
            <div className="cb-tile-texture" aria-hidden />
            {sidebarCollapsed ? (
              <div className="fc-qb-collapsed-strip">
                <button className="fc-qb-strip-btn fc-qb-strip-logo" data-tip="Open sidebar" onClick={() => setSidebarCollapsed(false)} type="button">
                  {FC_ICONS.chevronRight}
                </button>
                <button className={`fc-qb-strip-btn ${activePanel === 'generator' ? 'active' : ''}`} data-tip="Generator" onClick={() => { setSidebarCollapsed(false); setActivePanel('generator'); }} type="button">
                  {FC_ICONS.sparkle}
                </button>
                <button className={`fc-qb-strip-btn ${activePanel === 'cards' ? 'active' : ''}`} data-tip="My Flashcards" onClick={() => { setSidebarCollapsed(false); setActivePanel('cards'); }} type="button">
                  {FC_ICONS.cards}
                </button>
                <button className={`fc-qb-strip-btn ${activePanel === 'sr_study' ? 'active' : ''}`} data-tip="Study Queue" onClick={() => { setSidebarCollapsed(false); setActivePanel('sr_study'); loadDueCards(); loadSrStats(); }} type="button">
                  {FC_ICONS.target}
                </button>
                <button className={`fc-qb-strip-btn ${activePanel === 'review' ? 'active' : ''}`} data-tip="Needs Review" onClick={() => { setSidebarCollapsed(false); setActivePanel('review'); }} type="button">
                  {FC_ICONS.refresh}
                </button>
                <button className={`fc-qb-strip-btn ${activePanel === 'sources' ? 'active' : ''}`} data-tip="PDF Sources" onClick={() => { setSidebarCollapsed(false); setActivePanel('sources'); loadUploadedDocuments(); }} type="button">
                  {FC_ICONS.file}
                </button>
                <button className={`fc-qb-strip-btn ${activePanel === 'statistics' ? 'active' : ''}`} data-tip="Statistics" onClick={() => { setSidebarCollapsed(false); setActivePanel('statistics'); }} type="button">
                  {FC_ICONS.chart}
                </button>
                <div className="fc-qb-strip-spacer" />
                <button className="fc-qb-strip-btn" data-tip="Dashboard" onClick={() => navigate('/dashboard-cerbyl')} type="button">
                  {FC_ICONS.home}
                </button>
              </div>
            ) : (
            <>
              <div className="fc-qb-side-brand">
                <div className="fc-qb-brand-wrap">
                  <div className="fc-qb-brand">cerbyl</div>
                  <div className="fc-qb-brand-kicker">Flashcards</div>
                </div>
                <button
                  className="fc-qb-side-close-btn"
                  onClick={() => setSidebarCollapsed(true)}
                  title="Close sidebar"
                  aria-label="Close flashcards sidebar"
                  type="button"
                >
                  {FC_ICONS.chevronLeft}
                </button>
              </div>

              <button className="fc-qb-new-btn" onClick={() => setActivePanel('generator')} type="button">
                {FC_ICONS.sparkle}
                <span>Generate</span>
              </button>

              <div className="fc-qb-side-block fc-qb-side-block--grow">
                <div className="fc-qb-side-label">Practice</div>
                <nav className="fc-qb-view-nav" aria-label="Flashcards practice">
                  <button className={`fc-qb-view-link ${activePanel === 'cards' ? 'fc-qb-view-link--active' : ''}`} onClick={() => setActivePanel('cards')} type="button">
                    {FC_ICONS.cards}
                    <span>My Flashcards</span>
                  </button>
                  <button className={`fc-qb-view-link ${activePanel === 'sr_study' ? 'fc-qb-view-link--active' : ''}`} onClick={() => { setActivePanel('sr_study'); loadDueCards(); loadSrStats(); }} type="button">
                    {FC_ICONS.target}
                    <span>Study Queue</span>
                  </button>
                  <button className={`fc-qb-view-link ${activePanel === 'review' ? 'fc-qb-view-link--active' : ''}`} onClick={() => setActivePanel('review')} type="button">
                    {FC_ICONS.refresh}
                    <span>Needs Review</span>
                  </button>
                </nav>
              </div>

              <div className="fc-qb-side-block">
                <div className="fc-qb-side-label">Library</div>
                <nav className="fc-qb-view-nav" aria-label="Flashcard library">
                  <button className={`fc-qb-view-link ${activePanel === 'sources' ? 'fc-qb-view-link--active' : ''}`} onClick={() => { setActivePanel('sources'); loadUploadedDocuments(); }} type="button">
                    {FC_ICONS.file}
                    <span>PDF Sources</span>
                  </button>
                  <button className={`fc-qb-view-link ${activePanel === 'explore' ? 'fc-qb-view-link--active' : ''}`} onClick={() => { setActivePanel('explore'); loadAllPublicFlashcards(); }} type="button">
                    {FC_ICONS.search}
                    <span>Explore Public</span>
                  </button>
                  <button className={`fc-qb-view-link ${activePanel === 'statistics' ? 'fc-qb-view-link--active' : ''}`} onClick={() => setActivePanel('statistics')} type="button">
                    {FC_ICONS.chart}
                    <span>Statistics</span>
                  </button>
                </nav>
              </div>

              <div className="fc-qb-side-actions">
                <button
                  className="fc-qb-action-btn"
                  onClick={() => navigate('/dashboard-cerbyl')}
                  type="button"
                >
                  {FC_ICONS.home}
                  <span>Dashboard</span>
                </button>
              </div>
            </>
            )}
          </aside>

          <main className="fc-main fc-qb-main">
          {activePanel === 'cards' && (
            <>

              <div className="fc-content fc-cards-panel">
                {loadingHistory && flashcardHistory.length === 0 ? (
                  <div className="fc-loading">
                    <div className="fc-pulse-loader">
                      <div className="fc-pulse-square fc-pulse-1"></div>
                      <div className="fc-pulse-square fc-pulse-2"></div>
                      <div className="fc-pulse-square fc-pulse-3"></div>
                    </div>
                    <p>Loading your flashcards...</p>
                  </div>
                ) : flashcardHistory.length === 0 ? (
                  <div className="fc-empty">
                    <h3>No Flashcard Sets Yet</h3>
                    <p>Create your first set to start learning!</p>
                    <button className="fc-btn fc-btn-primary" onClick={() => setActivePanel('generator')}>
                      {FC_ICONS.sparkle} Create Your First Set
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="fc-view-header">
                      <span className="fc-view-kicker">Your Collection</span>
                      <h2 className="fc-view-title">My Flashcards</h2>
                      <p className="fc-view-sub">{flashcardHistory.length} {flashcardHistory.length === 1 ? 'set' : 'sets'} · {flashcardStats?.total_cards || 0} cards total</p>
                    </div>
                    
                    <div className={`fc-grid ${isRearranging ? 'fc-grid-rearranging' : ''}`}>
                      {displayedSets.map((set, index) => {
                        const mastery = getMasteryLevel(set.accuracy_percentage || 0);
                        
                        const colors = [
                          '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
                          '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788'
                        ];
                        const cardColor = colors[index % colors.length];
                        return (
                          <div key={set.id} className="fc-set-card-new" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
                            <div className="cb-tile-texture" aria-hidden="true" />
                            <div className="fc-set-thumbnail" style={{ background: `linear-gradient(135deg, ${cardColor} 0%, ${cardColor}dd 100%)` }}>
                              <div className="fc-set-thumbnail-content">
                                {editingSetId === set.id ? (
                                  <input
                                    type="text"
                                    className="fc-input-title-thumb"
                                    value={editingTitle}
                                    onChange={(e) => setEditingTitle(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(set.id)}
                                    onBlur={() => handleRenameSubmit(set.id)}
                                    autoFocus
                                  />
                                ) : (
                                  <>
                                    <h2 className="fc-thumbnail-title">{(set.title || 'Untitled Set').replace(/^(Cerbyl:\s*|AI Generated:\s*|Flashcards:\s*)/i, '')}</h2>
                                    <div className="fc-thumbnail-card-count">{set.card_count} CARDS</div>
                                  </>
                                )}
                              </div>
                              <button 
                                className="fc-delete-btn-thumb" 
                                onClick={(e) => deleteFlashcardSet(set.id, e)}
                                type="button"
                                style={{ 
                                  background: 'rgba(0, 0, 0, 0.3)',
                                  borderColor: 'rgba(0, 0, 0, 0.5)',
                                  color: 'white'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
                                  e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.8)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.3)';
                                  e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.5)';
                                }}
                              >
                                {FC_ICONS.trash}
                              </button>
                            </div>

                            <div className="fc-set-content-new">
                              <div className="fc-set-meta-new">
                              </div>
                              
                              <div className="fc-mastery-section">
                                <div className="fc-mastery-info">
                                  <span className="fc-mastery-label">Mastery:</span>
                                  <span className="fc-mastery-value" style={{ color: mastery.color }}>{mastery.level}</span>
                                </div>
                                <div className="fc-set-progress-new">
                                  <div className="fc-set-progress-fill-new" style={{ width: `${set.accuracy_percentage || 0}%`, background: mastery.color }} />
                                </div>
                                <span className="fc-mastery-percentage">{set.accuracy_percentage || 0}%</span>
                              </div>
                              
                              <p className="fc-set-date-new">Created: {formatDate(set.created_at)}</p>
                              {(set.share_code || set.id) && (
                                <span className="fc-set-uid">#{set.share_code || set.id?.toString().padStart(6, '0')}</span>
                              )}
                            </div>

                            <div className="fc-set-actions-new">
                              <button className="fc-action-btn-new fc-action-edit" onClick={() => enterEditMode(set.id)} disabled={loadingSetId === set.id}>
                                <span>EDIT</span>
                              </button>
                              <button className="fc-action-btn-new fc-action-preview" onClick={() => loadFlashcardSet(set.id, 'preview')} disabled={loadingSetId !== null}>
                                <span>{loadingSetId === set.id ? '...' : 'PREVIEW'}</span>
                              </button>
                              <button className="fc-action-btn-new fc-action-study" onClick={() => loadFlashcardSet(set.id, 'study')} disabled={loadingSetId !== null}>
                                <span>{loadingSetId === set.id ? '...' : 'STUDY'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    <div className="fc-load-more-sentinel" style={{ height: '20px', margin: '20px 0' }} />
                    
                    {isLoadingMore && (
                      <div className="fc-loading-more">
                        <div className="fc-spinner-small">
                          <span></span>
                          <span></span>
                          <span></span>
                        </div>
                        <p>Loading more sets...</p>
                      </div>
                    )}
                    
                    {displayedSets.length >= getFilteredAndSortedSets().length && displayedSets.length > 0 && (
                      <div className="fc-end-of-list">
                        <p>You've reached the end of your flashcard sets</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {/* Generator Panel */}
          {activePanel === 'generator' && (
            <>
              <div className="fc-content">
                <div className="fc-view-header">
                  <span className="fc-view-kicker">AI-Powered</span>
                  <h2 className="fc-view-title">Create Flashcards</h2>
                  <p className="fc-view-sub">Generate with AI by topic, from chat history, or build your own</p>
                </div>
                
                <div className="fc-generator">
                  <div className="fc-mode-selector fc-mode-selector-3">
                    <button 
                      className={`fc-mode-btn ${generationMode === 'topic' ? 'active' : ''}`}
                      onClick={() => setGenerationMode('topic')}
                    >
                      <div className="fc-mode-icon">{FC_ICONS.sparkle}</div>
                      <span className="fc-mode-label">AI BY TOPIC</span>
                      <span className="fc-mode-desc">Generate cards from any topic</span>
                    </button>
                    <button 
                      className={`fc-mode-btn ${generationMode === 'chat_history' ? 'active' : ''}`}
                      onClick={() => setGenerationMode('chat_history')}
                    >
                      <div className="fc-mode-icon">{FC_ICONS.chat}</div>
                      <span className="fc-mode-label">FROM CHAT</span>
                      <span className="fc-mode-desc">Convert AI conversations</span>
                    </button>
                    <button 
                      className="fc-mode-btn"
                      onClick={enterCustomCreateMode}
                    >
                      <div className="fc-mode-icon">{FC_ICONS.edit}</div>
                      <span className="fc-mode-label">CREATE CUSTOM</span>
                      <span className="fc-mode-desc">Make your own flashcards</span>
                    </button>
                  </div>

                  {generationMode === 'topic' ? (
                    <>
                      <div className="fc-form-group">
                        <label className="fc-label">What would you like to learn?</label>
                        <input
                          type="text"
                          className="fc-input"
                          placeholder="e.g., Quantum Physics, Spanish Vocabulary..."
                          value={topic}
                          onChange={(e) => setTopic(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && !generating && generateFlashcards()}
                        />
                      </div>

                      <div className="fc-form-row">
                        <div className="fc-form-group">
                          <label className="fc-label">Number of Cards</label>
                          <div className="fc-number-input">
                            <button className="fc-number-btn" onClick={() => setCardCount(Math.max(1, cardCount - 1))}>−</button>
                            <input type="number" value={cardCount} onChange={(e) => setCardCount(Math.min(15, Math.max(1, parseInt(e.target.value) || 1)))} />
                            <button className="fc-number-btn" onClick={() => setCardCount(Math.min(15, cardCount + 1))}>+</button>
                          </div>
                        </div>
                        <div className="fc-form-group">
                          <label className="fc-label">Difficulty</label>
                          <div className="fc-custom-select-wrapper">
                            <button 
                              className="fc-custom-select" 
                              onClick={() => {
                                setDifficultyDropdownOpen(!difficultyDropdownOpen);
                                setDepthDropdownOpen(false);
                              }}
                            >
                              <span className="fc-custom-select-text">
                                {difficultyLevel === 'easy' && 'EASY'}
                                {difficultyLevel === 'medium' && 'MEDIUM'}
                                {difficultyLevel === 'hard' && 'HARD'}
                              </span>
                              <span className="fc-custom-select-arrow">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                              </span>
                            </button>
                            {difficultyDropdownOpen && (
                              <div className="fc-custom-dropdown">
                                <button 
                                  className={`fc-custom-option ${difficultyLevel === 'easy' ? 'active' : ''}`}
                                  onClick={() => { setDifficultyLevel('easy'); setDifficultyDropdownOpen(false); }}
                                >
                                  EASY
                                </button>
                                <button 
                                  className={`fc-custom-option ${difficultyLevel === 'medium' ? 'active' : ''}`}
                                  onClick={() => { setDifficultyLevel('medium'); setDifficultyDropdownOpen(false); }}
                                >
                                  MEDIUM
                                </button>
                                <button 
                                  className={`fc-custom-option ${difficultyLevel === 'hard' ? 'active' : ''}`}
                                  onClick={() => { setDifficultyLevel('hard'); setDifficultyDropdownOpen(false); }}
                                >
                                  HARD
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="fc-form-group">
                          <label className="fc-label">Depth</label>
                          <div className="fc-custom-select-wrapper">
                            <button 
                              className="fc-custom-select" 
                              onClick={() => {
                                setDepthDropdownOpen(!depthDropdownOpen);
                                setDifficultyDropdownOpen(false);
                              }}
                            >
                              <span className="fc-custom-select-text">
                                {depthLevel === 'surface' && 'SURFACE'}
                                {depthLevel === 'standard' && 'STANDARD'}
                                {depthLevel === 'deep' && 'DEEP'}
                              </span>
                              <span className="fc-custom-select-arrow">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                              </span>
                            </button>
                            {depthDropdownOpen && (
                              <div className="fc-custom-dropdown">
                                <button 
                                  className={`fc-custom-option ${depthLevel === 'surface' ? 'active' : ''}`}
                                  onClick={() => { setDepthLevel('surface'); setDepthDropdownOpen(false); }}
                                >
                                  SURFACE
                                </button>
                                <button 
                                  className={`fc-custom-option ${depthLevel === 'standard' ? 'active' : ''}`}
                                  onClick={() => { setDepthLevel('standard'); setDepthDropdownOpen(false); }}
                                >
                                  STANDARD
                                </button>
                                <button 
                                  className={`fc-custom-option ${depthLevel === 'deep' ? 'active' : ''}`}
                                  onClick={() => { setDepthLevel('deep'); setDepthDropdownOpen(false); }}
                                >
                                  DEEP
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="fc-form-group">
                        <label className="fc-label">Visibility</label>
                        <div className="fc-visibility-toggle">
                          <button 
                            className={`fc-visibility-btn ${!isPublic ? 'active' : ''}`}
                            onClick={() => setIsPublic(false)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            </svg>
                            Private
                          </button>
                          <button 
                            className={`fc-visibility-btn ${isPublic ? 'active' : ''}`}
                            onClick={() => setIsPublic(true)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                              <circle cx="12" cy="12" r="10"/>
                              <path d="M2 12h20"/>
                              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                            </svg>
                            Public
                          </button>
                        </div>
                        <p className="fc-visibility-hint">
                          {isPublic ? 'Anyone can find and copy this set' : 'Only you can see this set'}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="fc-sessions-header">
                        <h3>Select Chat Sessions</h3>
                        <div className="fc-sessions-actions">
                          <button className="fc-btn fc-btn-secondary" onClick={() => setSelectedSessions((chatSessions || []).map(s => s.id))}>Select All</button>
                          <button className="fc-btn fc-btn-secondary" onClick={() => setSelectedSessions([])}>Clear</button>
                        </div>
                      </div>

                      {chatSessions.length === 0 ? (
                        <div className="fc-empty">
                          <div className="fc-empty-icon">{FC_ICONS.chat}</div>
                          <h3>No Chat Sessions</h3>
                          <p>Start a conversation with AI to generate flashcards from it.</p>
                          <button className="fc-btn fc-btn-primary" onClick={() => navigate('/ai-chat')}>Go to AI Chat</button>
                        </div>
                      ) : (
                        <div className="fc-sessions-list">
                          {(chatSessions || []).map((session) => (
                            <div
                              key={session.id}
                              className={`fc-session-item ${selectedSessions.includes(session.id) ? 'selected' : ''}`}
                              onClick={() => setSelectedSessions(prev => 
                                prev.includes(session.id) ? prev.filter(id => id !== session.id) : [...prev, session.id]
                              )}
                            >
                              <input 
                                type="checkbox" 
                                className="fc-session-checkbox"
                                checked={selectedSessions.includes(session.id)}
                                onChange={() => {}}
                              />
                              <div className="fc-session-info">
                                <div className="fc-session-title">{session.title}</div>
                                <div className="fc-session-date">{new Date(session.created_at).toLocaleDateString()}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="fc-form-row">
                        <div className="fc-form-group">
                          <label className="fc-label">Number of Cards</label>
                          <div className="fc-number-input">
                            <button className="fc-number-btn" onClick={() => setCardCount(Math.max(1, cardCount - 1))}>−</button>
                            <input type="number" value={cardCount} onChange={(e) => setCardCount(Math.min(15, Math.max(1, parseInt(e.target.value) || 1)))} />
                            <button className="fc-number-btn" onClick={() => setCardCount(Math.min(15, cardCount + 1))}>+</button>
                          </div>
                        </div>
                        <div className="fc-form-group">
                          <label className="fc-label">Difficulty</label>
                          <div className="fc-custom-select-wrapper">
                            <button 
                              className="fc-custom-select" 
                              onClick={() => {
                                setDifficultyDropdownOpen(!difficultyDropdownOpen);
                                setDepthDropdownOpen(false);
                              }}
                            >
                              <span className="fc-custom-select-text">
                                {difficultyLevel === 'easy' && 'EASY'}
                                {difficultyLevel === 'medium' && 'MEDIUM'}
                                {difficultyLevel === 'hard' && 'HARD'}
                              </span>
                              <span className="fc-custom-select-arrow">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                              </span>
                            </button>
                            {difficultyDropdownOpen && (
                              <div className="fc-custom-dropdown">
                                <button 
                                  className={`fc-custom-option ${difficultyLevel === 'easy' ? 'active' : ''}`}
                                  onClick={() => { setDifficultyLevel('easy'); setDifficultyDropdownOpen(false); }}
                                >
                                  EASY
                                </button>
                                <button 
                                  className={`fc-custom-option ${difficultyLevel === 'medium' ? 'active' : ''}`}
                                  onClick={() => { setDifficultyLevel('medium'); setDifficultyDropdownOpen(false); }}
                                >
                                  MEDIUM
                                </button>
                                <button 
                                  className={`fc-custom-option ${difficultyLevel === 'hard' ? 'active' : ''}`}
                                  onClick={() => { setDifficultyLevel('hard'); setDifficultyDropdownOpen(false); }}
                                >
                                  HARD
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="fc-form-group">
                          <label className="fc-label">Depth</label>
                          <div className="fc-custom-select-wrapper">
                            <button 
                              className="fc-custom-select" 
                              onClick={() => {
                                setDepthDropdownOpen(!depthDropdownOpen);
                                setDifficultyDropdownOpen(false);
                              }}
                            >
                              <span className="fc-custom-select-text">
                                {depthLevel === 'surface' && 'SURFACE'}
                                {depthLevel === 'standard' && 'STANDARD'}
                                {depthLevel === 'deep' && 'DEEP'}
                              </span>
                              <span className="fc-custom-select-arrow">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                              </span>
                            </button>
                            {depthDropdownOpen && (
                              <div className="fc-custom-dropdown">
                                <button 
                                  className={`fc-custom-option ${depthLevel === 'surface' ? 'active' : ''}`}
                                  onClick={() => { setDepthLevel('surface'); setDepthDropdownOpen(false); }}
                                >
                                  SURFACE
                                </button>
                                <button 
                                  className={`fc-custom-option ${depthLevel === 'standard' ? 'active' : ''}`}
                                  onClick={() => { setDepthLevel('standard'); setDepthDropdownOpen(false); }}
                                >
                                  STANDARD
                                </button>
                                <button 
                                  className={`fc-custom-option ${depthLevel === 'deep' ? 'active' : ''}`}
                                  onClick={() => { setDepthLevel('deep'); setDepthDropdownOpen(false); }}
                                >
                                  DEEP
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="fc-form-group" style={{ marginTop: '12px' }}>
                        <label className="fc-label">Additional Instructions (optional)</label>
                        <textarea
                          className="fc-input"
                          style={{
                            minHeight: '60px',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            padding: '10px 12px',
                          }}
                          placeholder="e.g., Focus on practical examples, include code snippets, use real-world scenarios..."
                          value={additionalSpecs}
                          onChange={(e) => setAdditionalSpecs(e.target.value)}
                          rows={2}
                        />
                      </div>
                    </>
                  )}

                  <button
                    className="fc-generate-btn"
                    onClick={generateFlashcards}
                    disabled={generating || (generationMode === 'topic' ? !topic.trim() : selectedSessions.length === 0)}
                  >
                    {generating ? 'GENERATING...' : `GENERATE ${cardCount} FLASHCARDS`}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* PDF Sources Panel */}
          {activePanel === 'sources' && (
            <>
              <div className="fc-content fc-sources-panel">
                <div className="fc-view-header">
                  <span className="fc-view-kicker">Question Hub Sources</span>
                  <h2 className="fc-view-title">PDF Sources</h2>
                  <p className="fc-view-sub">Use the same uploaded PDFs from Question Hub and convert selected sources into flashcards</p>
                </div>

                <div className="fc-source-layout">
                  <section className="fc-source-upload-card">
                    <div className="fc-source-upload-icon">{FC_ICONS.file}</div>
                    <h3>Add PDF Source</h3>
                    <p>Uploaded PDFs appear in both Question Hub and Flashcards.</p>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handlePDFUpload}
                      style={{ display: 'none' }}
                      id="fc-pdf-upload-input"
                    />
                    <label htmlFor="fc-pdf-upload-input" className={`fc-btn fc-btn-primary ${uploadingDocument ? 'disabled' : ''}`}>
                      {uploadingDocument ? 'Uploading...' : 'Add PDF'}
                    </label>
                  </section>

                  <section className="fc-source-library">
                    <div className="fc-source-toolbar">
                      <div>
                        <h3>Your Sources ({uploadedDocuments.length})</h3>
                        <p>Click PDFs to select multiple sources for flashcard generation.</p>
                      </div>
                      <div className="fc-source-toolbar-actions">
                        {selectedPDFs.length > 0 && (
                          <button className="fc-btn fc-btn-secondary" onClick={clearPDFSelection}>
                            Clear Selection
                          </button>
                        )}
                        <button className="fc-btn fc-btn-secondary" onClick={loadUploadedDocuments} disabled={loadingDocuments}>
                          {loadingDocuments ? 'Refreshing...' : 'Refresh'}
                        </button>
                      </div>
                    </div>

                    {loadingDocuments && uploadedDocuments.length === 0 ? (
                      <div className="fc-source-loading">
                        <div className="fc-pulse-loader">
                          <div className="fc-pulse-square fc-pulse-1"></div>
                          <div className="fc-pulse-square fc-pulse-2"></div>
                          <div className="fc-pulse-square fc-pulse-3"></div>
                        </div>
                        <p>Loading PDF sources...</p>
                      </div>
                    ) : uploadedDocuments.length === 0 ? (
                      <div className="fc-source-empty">
                        <h3>No PDF Sources Yet</h3>
                        <p>Upload a PDF here or in Question Hub. It will show in both places.</p>
                      </div>
                    ) : (
                      <div className="fc-source-grid">
                        {uploadedDocuments.map((doc) => {
                          const isSelected = selectedPDFs.some((pdf) => pdf.id === doc.id);
                          const topics = doc.analysis?.main_topics || [];
                          return (
                            <div
                              key={doc.id}
                              role="button"
                              tabIndex={0}
                              className={`fc-source-card ${isSelected ? 'selected' : ''}`}
                              onClick={() => togglePDFSelection(doc)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  togglePDFSelection(doc);
                                }
                              }}
                            >
                              <span className="fc-source-check">{isSelected ? FC_ICONS.check : null}</span>
                              <button
                                type="button"
                                className="fc-source-delete"
                                onClick={(event) => deleteUploadedDocument(doc.id, event)}
                                aria-label={`Delete ${doc.filename}`}
                              >
                                {FC_ICONS.trash}
                              </button>
                              <div className="fc-source-card-head">
                                <span className="fc-source-file-icon">{FC_ICONS.file}</span>
                                <div>
                                  <h4>{doc.filename}</h4>
                                  <p>{doc.document_type || 'PDF source'}</p>
                                </div>
                              </div>
                              {topics.length > 0 && (
                                <div className="fc-source-topics">
                                  {topics.slice(0, 3).map((item, index) => (
                                    <span key={`${doc.id}-${item}-${index}`}>{item}</span>
                                  ))}
                                </div>
                              )}
                              <div className="fc-source-date">
                                {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'Uploaded source'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>

                {selectedPDFs.length > 0 && (
                  <section className="fc-source-settings">
                    <div className="fc-source-selected-head">
                      <div>
                        <span className="fc-view-kicker">Selected Sources</span>
                        <h3>{selectedPDFs.length} PDF{selectedPDFs.length === 1 ? '' : 's'} ready to convert</h3>
                      </div>
                    </div>

                    <div className="fc-selected-source-list">
                      {selectedPDFs.map((doc) => (
                        <div key={doc.id} className="fc-selected-source-pill">
                          {FC_ICONS.file}
                          <span>{doc.filename}</span>
                          <button type="button" onClick={() => togglePDFSelection(doc)}>×</button>
                        </div>
                      ))}
                    </div>

                    <div className="fc-form-row fc-source-settings-row">
                      <div className="fc-form-group">
                        <label className="fc-label">Number of Cards</label>
                        <div className="fc-number-input">
                          <button className="fc-number-btn" onClick={() => setCardCount(Math.max(1, cardCount - 1))}>−</button>
                          <input type="number" value={cardCount} onChange={(e) => setCardCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))} />
                          <button className="fc-number-btn" onClick={() => setCardCount(Math.min(50, cardCount + 1))}>+</button>
                        </div>
                      </div>

                      <div className="fc-form-group">
                        <label className="fc-label">Difficulty</label>
                        <select className="fc-input" value={difficultyLevel} onChange={(e) => setDifficultyLevel(e.target.value)}>
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                      </div>

                      <div className="fc-form-group">
                        <label className="fc-label">Depth</label>
                        <select className="fc-input" value={depthLevel} onChange={(e) => setDepthLevel(e.target.value)}>
                          <option value="surface">Surface</option>
                          <option value="standard">Standard</option>
                          <option value="deep">Deep</option>
                        </select>
                      </div>
                    </div>

                    <div className="fc-form-group">
                      <label className="fc-label">Custom Instructions (optional)</label>
                      <textarea
                        className="fc-input fc-source-textarea"
                        placeholder="e.g., Focus on formulas, generate exam revision cards, cover definitions first..."
                        value={additionalSpecs}
                        onChange={(e) => setAdditionalSpecs(e.target.value)}
                        rows={3}
                      />
                    </div>

                    <div className="fc-form-group">
                      <label className="fc-label">Visibility</label>
                      <div className="fc-visibility-toggle">
                        <button className={`fc-visibility-btn ${!isPublic ? 'active' : ''}`} onClick={() => setIsPublic(false)}>
                          Private
                        </button>
                        <button className={`fc-visibility-btn ${isPublic ? 'active' : ''}`} onClick={() => setIsPublic(true)}>
                          Public
                        </button>
                      </div>
                    </div>

                    <button
                      className="fc-generate-btn"
                      onClick={generateFlashcardsFromPDFs}
                      disabled={generating || selectedPDFs.length === 0}
                    >
                      {generating ? 'CONVERTING PDFS...' : `CONVERT ${selectedPDFs.length} PDF${selectedPDFs.length === 1 ? '' : 'S'} TO ${cardCount} FLASHCARDS`}
                    </button>
                  </section>
                )}
              </div>
            </>
          )}

          {/* Needs Review Panel */}
          {activePanel === 'review' && (
            <>
              <div className="fc-content">
                {loadingReviewCards ? (
                  <div className="fc-loading">
                    <div className="fc-pulse-loader">
                      <div className="fc-pulse-square fc-pulse-1"></div>
                      <div className="fc-pulse-square fc-pulse-2"></div>
                      <div className="fc-pulse-square fc-pulse-3"></div>
                    </div>
                    <p>Loading cards for review...</p>
                  </div>
                ) : reviewCards.total_cards === 0 ? (
                  <div className="fc-empty">
                    <h3>No Cards Need Review</h3>
                    <p>Great job! You haven't marked any cards as "I don't know this" yet.</p>
                    <button className="fc-btn fc-btn-primary" onClick={() => setActivePanel('cards')}>
                      Study Flashcards
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="fc-view-header">
                      <span className="fc-view-kicker">Weak Cards</span>
                      <h2 className="fc-view-title">Needs Review</h2>
                      <p className="fc-view-sub">Cards you marked as "I don't know this" — practice them to mastery</p>
                    </div>
                    
                    <div className="fc-review-section">
                      <div className="fc-review-summary">
                        <span className="fc-review-count">{reviewCards.total_cards} cards</span> need your attention
                      </div>
                      
                      {(reviewCards.sets || []).map((setData) => (
                        <div key={setData.set_id} className="fc-review-set">
                          <div className="fc-review-set-header">
                            <h3>{setData.set_title}</h3>
                            <span className="fc-review-set-count">{(setData.cards || []).length} cards</span>
                          </div>
                          <div className="fc-review-cards-list">
                            {(setData.cards || []).map((card) => (
                              <div key={card.id} className="fc-review-card-item">
                                <div className="fc-review-card-content">
                                  <div className="fc-review-card-question">
                                    <span className="fc-review-label">Q:</span>
                                    {card.question}
                                </div>
                                <div className="fc-review-card-answer">
                                  <span className="fc-review-label">A:</span>
                                  {card.answer}
                                </div>
                              </div>
                              <div className="fc-review-card-actions">
                                <button 
                                  className="fc-btn fc-btn-small fc-btn-success"
                                  onClick={async () => {
                                    await markCardForReview(card.id, false);
                                  }}
                                  title="I know this now"
                                >
                                  {FC_ICONS.check}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <button 
                          className="fc-btn fc-btn-primary fc-review-study-btn"
                          onClick={() => {
                            
                            const reviewCardsForSet = setData.cards || [];
                            setFlashcards(reviewCardsForSet);
                            setShuffledCards(reviewCardsForSet);
                            setCurrentCard(0);
                            setIsFlipped(false);
                            setCurrentSetInfo({
                              saved: true,
                              setId: setData.set_id,
                              setTitle: `Review: ${setData.set_title}`,
                              cardCount: reviewCardsForSet.length
                            });
                            setPreviewMode(true);
                          }}
                        >
                          {FC_ICONS.play} Study These Cards
                        </button>
                      </div>
                    ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {activePanel === 'explore' && (
            <>
              <div className="fc-content fc-cards-panel">
                {loadingPublic ? (
                  <div className="fc-loading">
                    <div className="fc-pulse-loader">
                      <div className="fc-pulse-square fc-pulse-1"></div>
                      <div className="fc-pulse-square fc-pulse-2"></div>
                      <div className="fc-pulse-square fc-pulse-3"></div>
                    </div>
                    <p>Searching public flashcards...</p>
                  </div>
                ) : publicFlashcards.length === 0 ? (
                  <>
                    <div className="fc-view-header">
                      <span className="fc-view-kicker">Community</span>
                      <h2 className="fc-view-title">Explore Public</h2>
                      <p className="fc-view-sub">Discover and copy flashcard sets shared by the community</p>
                    </div>
                    <div className="fc-explore-search-landing">
                      <div className="fc-explore-searchbar">
                        <span className="fc-explore-search-icon">{FC_ICONS.search}</span>
                        <input
                          type="text"
                          className="fc-explore-search-input"
                          placeholder="Search public flashcard sets..."
                          value={publicSearchQuery}
                          onChange={(e) => setPublicSearchQuery(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && searchPublicFlashcards()}
                        />
                        <button className="fc-explore-search-btn" onClick={() => searchPublicFlashcards()} type="button">
                          Search
                        </button>
                      </div>
                      <button className="fc-btn fc-btn-secondary fc-explore-browse-btn" onClick={loadAllPublicFlashcards}>
                        Browse All Public Sets
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="fc-view-header">
                      <span className="fc-view-kicker">Community</span>
                      <h2 className="fc-view-title">Explore Public</h2>
                      <p className="fc-view-sub">Discover and copy flashcard sets shared by the community</p>
                    </div>
                    
                    <div className="fc-public-search-bar">
                      <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                        <div className="fc-search fc-search-large">
                          <span className="fc-search-icon">{FC_ICONS.search}</span>
                          <input 
                            type="text"
                            placeholder="Search public flashcard sets..."
                            value={publicSearchQuery}
                            onChange={(e) => setPublicSearchQuery(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && searchPublicFlashcards()}
                          />
                        </div>
                        <button className="fc-btn fc-btn-primary" onClick={() => searchPublicFlashcards()}>
                          Search
                        </button>
                        <button className="fc-btn fc-btn-secondary" onClick={loadAllPublicFlashcards}>
                          Show All
                        </button>
                      </div>
                    </div>
                    
                    <div className="fc-grid">
                      {publicFlashcards.map((set, index) => {
                      const colors = [
                        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
                        '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788'
                      ];
                      const cardColor = colors[index % colors.length];
                      
                      return (
                        <div key={set.id} className="fc-set-card-new fc-public-card">
                          <div className="fc-set-thumbnail" style={{ background: `linear-gradient(135deg, ${cardColor} 0%, ${cardColor}dd 100%)` }}>
                            <div className="fc-set-thumbnail-content">
                              <h2 className="fc-thumbnail-title">{(set.title || 'Untitled Set').replace(/^(Cerbyl:\s*|AI Generated:\s*|Flashcards:\s*)/i, '')}</h2>
                            </div>
                            <div className="fc-public-badge">PUBLIC</div>
                          </div>

                          <div className="fc-set-content-new">
                            <div className="fc-set-meta-new">
                              <div className="fc-meta-item-new">
                                <span className="fc-meta-label">Cards:</span>
                                <span className="fc-meta-value">{set.card_count}</span>
                              </div>
                              <div className="fc-meta-item-new">
                                <span className="fc-meta-label">By:</span>
                                <span className="fc-meta-value">{set.creator || 'Anonymous'}</span>
                              </div>
                            </div>
                            
                            <p className="fc-set-date-new">Created: {formatDate(set.created_at)}</p>
                          </div>

                          <div className="fc-set-actions-new">
                            <button className="fc-action-btn-new fc-action-preview" onClick={() => loadFlashcardSet(set.id, 'preview')} disabled={loadingSetId !== null}>
                              <span>{loadingSetId === set.id ? '...' : 'PREVIEW'}</span>
                            </button>
                            <button className="fc-action-btn-new fc-action-copy" onClick={() => copyPublicSet(set.id)}>
                              <span>COPY TO MY SETS</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {activePanel === 'sr_study' && (
            <div className="fc-content">
              <div className="fc-view-header">
                <span className="fc-view-kicker">Spaced Repetition Algorithm</span>
                <h2 className="fc-view-title">Study Queue</h2>
                <p className="fc-view-sub">
                  {dueCards.due_count > 0
                    ? `${dueCards.due_count} card${dueCards.due_count !== 1 ? 's' : ''} due today`
                    : "You're all caught up — no cards due right now"}
                </p>
              </div>

              <div className="fc-sr-queue-row">
                <div className="fc-sr-summary-item">
                  <span className="fc-sr-dot fc-sr-dot-new"></span>
                  <span className="fc-sr-count">{dueCards.new_count || 0}</span>
                  <span className="fc-sr-label">New</span>
                </div>
                <div className="fc-sr-summary-item">
                  <span className="fc-sr-dot fc-sr-dot-review"></span>
                  <span className="fc-sr-count">{dueCards.review_count || 0}</span>
                  <span className="fc-sr-label">Review</span>
                </div>
                <div className="fc-sr-summary-item">
                  <span className="fc-sr-dot fc-sr-dot-learning"></span>
                  <span className="fc-sr-count">{dueCards.learning_count || 0}</span>
                  <span className="fc-sr-label">Learning</span>
                </div>
                <div className="fc-sr-summary-item">
                  <span className="fc-sr-dot fc-sr-dot-relearning"></span>
                  <span className="fc-sr-count">{dueCards.relearning_count || 0}</span>
                  <span className="fc-sr-label">Relearning</span>
                </div>

                {dueCards.due_count > 0 && (
                  <button className="fc-btn fc-btn-primary fc-sr-start-btn-inline" onClick={startSrStudy}>
                    {FC_ICONS.bolt} Start Review ({dueCards.due_count})
                  </button>
                )}
              </div>

              {dueCards.due_count === 0 && (
                <div className="fc-sr-empty">
                  <div className="fc-sr-empty-icon">{FC_ICONS.check}</div>
                  <h3>You're all caught up!</h3>
                  <p>No cards due for review right now. Great job!</p>
                </div>
              )}

              {/* SR Stats Section */}
              {srStats && (
                <div className="fc-sr-stats-panel">
                  <div className="fc-sr-stats-heading">
                    <span className="fc-view-kicker" style={{opacity:1}}>Algorithm Data</span>
                    <h3 className="fc-sr-stats-title">Your Learning Stats</h3>
                  </div>

                  <div className="fc-sr-stats-grid">
                    <div className="fc-sr-stat-card">
                      <span className="fc-sr-stat-value">{srStats.retention_rate || 0}%</span>
                      <span className="fc-sr-stat-label">Retention Rate</span>
                    </div>
                    <div className="fc-sr-stat-card">
                      <span className="fc-sr-stat-value">{srStats.total_reviews || 0}</span>
                      <span className="fc-sr-stat-label">Total Reviews</span>
                    </div>
                    <div className="fc-sr-stat-card">
                      <span className="fc-sr-stat-value">{srStats.maturity?.mature_count || 0}</span>
                      <span className="fc-sr-stat-label">Mature Cards</span>
                    </div>
                    <div className="fc-sr-stat-card">
                      <span className="fc-sr-stat-value">{srStats.maturity?.average_interval ? `${Math.round(srStats.maturity.average_interval)}d` : '0d'}</span>
                      <span className="fc-sr-stat-label">Avg Interval</span>
                    </div>
                  </div>

                  {/* Card State Distribution */}
                  {srStats.state_distribution && (
                    <div className="fc-sr-state-dist">
                      <h4>Card States</h4>
                      <div className="fc-sr-state-bars">
                        {Object.entries(srStats.state_distribution).map(([state, count]) => (
                          <div key={state} className="fc-sr-state-bar-row">
                            <span className="fc-sr-state-bar-label">{state}</span>
                            <div className="fc-sr-state-bar-track">
                              <div
                                className={`fc-sr-state-bar-fill fc-sr-bar-${state}`}
                                style={{ width: `${srStats.total_cards > 0 ? (count / srStats.total_cards * 100) : 0}%` }}
                              ></div>
                            </div>
                            <span className="fc-sr-state-bar-count">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Review Forecast */}
                  {srStats.review_forecast && srStats.review_forecast.length > 0 && (
                    <div className="fc-sr-forecast">
                      <h4>14-Day Review Forecast</h4>
                      <div className="fc-sr-forecast-chart">
                        {srStats.review_forecast.map((day, idx) => {
                          const maxCount = Math.max(...srStats.review_forecast.map(d => d.count), 1);
                          const height = Math.max(4, (day.count / maxCount) * 80);
                          return (
                            <div key={idx} className="fc-sr-forecast-bar-wrapper">
                              <div className="fc-sr-forecast-bar" style={{ height: `${height}px` }}>
                                {day.count > 0 && <span className="fc-sr-forecast-count">{day.count}</span>}
                              </div>
                              <span className="fc-sr-forecast-label">{day.day_label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Ease Distribution */}
                  {srStats.ease_distribution && (
                    <div className="fc-sr-ease-dist">
                      <h4>Ease Distribution</h4>
                      <div className="fc-sr-ease-bars">
                        {srStats.ease_distribution.map((bucket, idx) => (
                          <div key={idx} className="fc-sr-ease-bar-row">
                            <span className="fc-sr-ease-label">{bucket.label}</span>
                            <div className="fc-sr-ease-bar-track">
                              <div
                                className="fc-sr-ease-bar-fill"
                                style={{ width: `${srStats.total_cards > 0 ? (bucket.count / srStats.total_cards * 100) : 0}%` }}
                              ></div>
                            </div>
                            <span className="fc-sr-ease-count">{bucket.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* AI Suggestions Section */}
              <div className="fc-sr-ai-section">
                <div className="fc-sr-stats-heading">
                  <span className="fc-view-kicker" style={{opacity:1}}>Personalized</span>
                  <h3 className="fc-sr-stats-title">AI Study Coach</h3>
                </div>
                <button
                  className="fc-btn fc-btn-secondary fc-sr-ai-btn"
                  onClick={loadAiSuggestions}
                  disabled={loadingSuggestions}
                >
                  {loadingSuggestions ? 'Analyzing...' : 'Get AI Study Suggestions'}
                </button>

                {aiSuggestions && (
                  <div className="fc-sr-suggestions">
                    {aiSuggestions.encouragement && (
                      <div className="fc-sr-suggestion-card fc-sr-encouragement">
                        <p>{aiSuggestions.encouragement}</p>
                      </div>
                    )}

                    <div className="fc-sr-suggestion-stats">
                      {aiSuggestions.daily_target && (
                        <div className="fc-sr-suggestion-stat">
                          <span className="fc-sr-suggestion-stat-value">{aiSuggestions.daily_target}</span>
                          <span className="fc-sr-suggestion-stat-label">Daily Target</span>
                        </div>
                      )}
                      {aiSuggestions.optimal_new_cards_per_day !== undefined && (
                        <div className="fc-sr-suggestion-stat">
                          <span className="fc-sr-suggestion-stat-value">{aiSuggestions.optimal_new_cards_per_day}</span>
                          <span className="fc-sr-suggestion-stat-label">New Cards/Day</span>
                        </div>
                      )}
                    </div>

                    {aiSuggestions.study_tips && aiSuggestions.study_tips.length > 0 && (
                      <div className="fc-sr-tips">
                        <h4>Study Tips</h4>
                        <ul>
                          {aiSuggestions.study_tips.map((tip, idx) => (
                            <li key={idx}>{tip}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {aiSuggestions.problem_areas && aiSuggestions.problem_areas.length > 0 && (
                      <div className="fc-sr-problem-areas">
                        <h4>Problem Areas</h4>
                        {aiSuggestions.problem_areas.map((area, idx) => (
                          <div key={idx} className={`fc-sr-problem-card fc-sr-priority-${area.priority}`}>
                            <div className="fc-sr-problem-header">
                              <span className="fc-sr-problem-topic">{area.topic}</span>
                              <span className={`fc-sr-priority-badge`}>{area.priority}</span>
                            </div>
                            <p>{area.suggestion}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Statistics Panel */}
          {activePanel === 'statistics' && (
            <>
              <div className="fc-content">
                <div className="fc-view-header">
                  <span className="fc-view-kicker">Performance</span>
                  <h2 className="fc-view-title">Statistics</h2>
                  <p className="fc-view-sub">Track your learning progress and mastery over time</p>
                </div>
                
                {flashcardStats ? (
                  <>
                    <div className="fc-stats-grid">
                      <div className="fc-stat-card">
                        <div className="fc-stat-icon">{FC_ICONS.book}</div>
                        <div className="fc-stat-value">{flashcardStats.total_sets}</div>
                        <div className="fc-stat-label">TOTAL SETS</div>
                      </div>
                      <div className="fc-stat-card">
                        <div className="fc-stat-icon">{FC_ICONS.cards}</div>
                        <div className="fc-stat-value">{flashcardStats.total_cards}</div>
                        <div className="fc-stat-label">TOTAL CARDS</div>
                      </div>
                      <div className="fc-stat-card">
                        <div className="fc-stat-icon">{FC_ICONS.target}</div>
                        <div className="fc-stat-value">{flashcardStats.overall_accuracy}%</div>
                        <div className="fc-stat-label">ACCURACY</div>
                      </div>
                      <div className="fc-stat-card">
                        <div className="fc-stat-icon">{FC_ICONS.fire}</div>
                        <div className="fc-stat-value">{currentStreak}</div>
                        <div className="fc-stat-label">Day Streak</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="fc-empty">
                    <div className="fc-empty-icon">{FC_ICONS.chart}</div>
                    <h3>No Statistics Yet</h3>
                    <p>Start studying flashcards to see your analytics here!</p>
                    <button className="fc-btn fc-btn-primary" onClick={() => setActivePanel('cards')}>
                      View My Flashcards
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
        </div>
      </div>

      <CustomPopup
        isOpen={popup.isOpen}
        onClose={closePopup}
        title={popup.title}
        message={popup.message}
      />
      
      <ImportExportModal
        isOpen={showImportExport}
        onClose={() => setShowImportExport(false)}
        mode="import"
        sourceType="flashcards"
        onSuccess={(result) => {
          if (result.shouldNavigate) {
            // Navigate based on destination type
            if (result.destinationType === 'questions') {
              // Navigate to question bank
              navigate('/question-bank');
            } else if (result.destinationType === 'notes') {
              // Navigate to the created note
              if (result.note_id) {
                navigate(`/notes/editor/${result.note_id}`);
              } else {
                navigate('/notes');
              }
            } else {
              loadFlashcardHistory(true);
            }
          } else {
            showPopup("Converted Successfully", "Your flashcards have been converted.");
            loadFlashcardHistory(true); // Reset pagination after conversion
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

export default Flashcards;
