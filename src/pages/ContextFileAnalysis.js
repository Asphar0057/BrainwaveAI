import ToolNavigation from '../components/ToolNavigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft, FileText, Loader2, AlertCircle,
  MessageCircle, Layers, Brain, Target,
  Clock, Folder, BookOpen, CheckSquare, Square,
} from 'lucide-react';
import contextService from '../services/contextService';
import { API_URL } from '../config/api';
import { queuedAIJsonFetch } from '../services/aiJobService';
import './ContextFileAnalysis.css';
import '../components/SocialHubChrome.css';

const FILE_INSIGHTS_KEY = 'ctx_file_action_stats';
const DECK_KEY = 'ctx_selected_doc_ids';
const DECK_SIZE = 8;

const FEATURES = [
  {
    id: 'chat',
    label: 'AI Chat',
    icon: MessageCircle,
    color: '#c084fc',
    bg: 'rgba(192,132,252,0.09)',
    border: 'rgba(192,132,252,0.30)',
    btnLabel: 'Open Chat',
    desc: 'Start a conversation with this file as context',
  },
  {
    id: 'flashcards',
    label: 'Flashcards',
    icon: Layers,
    color: '#34d399',
    bg: 'rgba(52,211,153,0.09)',
    border: 'rgba(52,211,153,0.30)',
    btnLabel: 'Create Flashcards',
    desc: 'Generate memory cards from this file\'s content',
  },
  {
    id: 'notes',
    label: 'Notes',
    icon: FileText,
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.09)',
    border: 'rgba(96,165,250,0.30)',
    btnLabel: 'Create Notes',
    desc: 'Generate structured notes from this file',
  },
  {
    id: 'quiz',
    label: 'Quiz',
    icon: Brain,
    color: '#fb923c',
    bg: 'rgba(251,146,60,0.09)',
    border: 'rgba(251,146,60,0.30)',
    btnLabel: 'Create Quiz',
    desc: 'Practice with questions generated from this file',
  },
  {
    id: 'roadmap',
    label: 'Knowledge Map',
    icon: Target,
    color: '#22d3ee',
    bg: 'rgba(34,211,238,0.09)',
    border: 'rgba(34,211,238,0.30)',
    btnLabel: 'Create Map',
    desc: 'Build a knowledge map from this file\'s topics',
  },
];

const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return '—'; }
};

const loadDeck = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(DECK_KEY) || '[]');
    return Array.isArray(parsed)
      ? Array.from(new Set(parsed.map(String).filter(Boolean))).slice(0, DECK_SIZE)
      : [];
  } catch { return []; }
};

const saveDeck = (ids) => {
  try { localStorage.setItem(DECK_KEY, JSON.stringify(ids)); } catch {}
};

const loadFileActionStats = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(FILE_INSIGHTS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
};

const saveFileActionStats = (payload) => {
  try { localStorage.setItem(FILE_INSIGHTS_KEY, JSON.stringify(payload || {})); } catch {}
};

const subjectLabel = (s) => (s || 'General').replace(/_/g, ' ');

const BgFx = () => (
  <>
    <div className="cfp-line-field" aria-hidden="true" />
    <div className="cfp-bg-fx" aria-hidden="true">
      <div className="cfp-bg-orb cfp-bg-orb-1" />
      <div className="cfp-bg-orb cfp-bg-orb-2" />
      <div className="cfp-bg-dots" />
      <div className="cfp-bg-vignette" />
    </div>
  </>
);

const ContextFileAnalysis = () => {
  const navigate = useNavigate();
  const { docId } = useParams();
  const resolvedDocId = useMemo(() => decodeURIComponent(docId || ''), [docId]);

  const userId = localStorage.getItem('username') || localStorage.getItem('user_id') || localStorage.getItem('email');
  const token = localStorage.getItem('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [doc, setDoc] = useState(null);
  const [deckIds, setDeckIds] = useState(loadDeck);
  const [actionStats, setActionStats] = useState(loadFileActionStats);
  const [notesLoading, setNotesLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  const recordAction = useCallback((actionId) => {
    if (!actionId || !doc) return;
    const targetId = String(doc.doc_id || doc.id);
    const now = new Date().toISOString();
    setActionStats((prev) => {
      const base = prev && typeof prev === 'object' ? prev : {};
      const next = { ...base };
      const current = next[targetId] && typeof next[targetId] === 'object' ? next[targetId] : {};
      const actions = current.actions && typeof current.actions === 'object' ? { ...current.actions } : {};
      actions[actionId] = (actions[actionId] || 0) + 1;
      next[targetId] = {
        first_used_at: current.first_used_at || now,
        last_used_at: now,
        total_actions: (Number(current.total_actions) || 0) + 1,
        actions,
      };
      saveFileActionStats(next);
      return next;
    });
  }, [doc]);

  const loadDoc = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const docData = await contextService.listDocuments();
      const userDocs = Array.isArray(docData?.user_docs) ? docData.user_docs : [];
      const matched = userDocs.find((item) => String(item.doc_id || item.id) === String(resolvedDocId));
      if (!matched) {
        setDoc(null);
        setError('File not found. It may have been deleted or moved.');
        return;
      }
      setDoc(matched);
      setActionStats(loadFileActionStats());
      setDeckIds(loadDeck());
    } catch (e) {
      setDoc(null);
      setError(e.message || 'Failed to load file.');
    } finally {
      setLoading(false);
    }
  }, [resolvedDocId]);

  useEffect(() => { loadDoc(); }, [loadDoc]);

  useEffect(() => {
    const handleFocus = () => loadDoc();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadDoc]);

  const inDeck = useMemo(() => {
    if (!doc) return false;
    return deckIds.map((id) => String(id)).includes(String(doc.doc_id || doc.id));
  }, [deckIds, doc]);

  const addToDeck = useCallback(() => {
    if (!doc) return;
    const targetId = doc.doc_id || doc.id;
    if (deckIds.map((id) => String(id)).includes(String(targetId))) return;
    if (deckIds.length >= DECK_SIZE) {
      setActionMessage({ type: 'error', text: `Your Context Deck is full (${DECK_SIZE}/${DECK_SIZE}). Remove one source before adding this file.` });
      return;
    }
    const next = [...deckIds, targetId];
    setDeckIds(next);
    saveDeck(next);
    setActionMessage({ type: 'success', text: 'Added to your Context Deck.' });
  }, [deckIds, doc]);

  const removeFromDeck = useCallback(() => {
    if (!doc) return;
    const targetId = String(doc.doc_id || doc.id);
    const next = deckIds.filter((id) => String(id) !== targetId);
    setDeckIds(next);
    saveDeck(next);
    setActionMessage({ type: 'success', text: 'Removed from your Context Deck.' });
  }, [deckIds, doc]);

  const usageCounts = useMemo(() => {
    if (!doc) return {};
    const targetId = String(doc.doc_id || doc.id);
    const tracked = actionStats[targetId] || {};
    const actions = tracked.actions && typeof tracked.actions === 'object' ? tracked.actions : {};
    return {
      chat: Number(actions.chat || 0),
      flashcards: Number(actions.flashcards || 0),
      notes: Number(actions.notes || 0),
      quiz: Number(actions.quiz || 0),
      roadmap: Number(actions.roadmap || 0),
      lastUsedAt: tracked.last_used_at || '',
    };
  }, [actionStats, doc]);

  const runAction = useCallback(async (featureId) => {
    if (!doc) return;
    const targetId = doc.doc_id || doc.id;
    const sourceName = doc.filename || doc.title || 'Untitled';
    setActionMessage(null);

    if (featureId === 'chat') {
      recordAction('chat');
      navigate('/ai-chat', {
        state: { contextDocIds: [String(targetId)], initialMessage: `Use this context file: ${sourceName}. Help me study what matters most.` },
      });
      return;
    }
    if (featureId === 'flashcards') {
      recordAction('flashcards');
      navigate('/flashcards', {
        state: {
          contextDocIds: [targetId],
          initialTopic: sourceName,
          generationMode: 'topic',
          openPanel: 'generator',
          autoGenerateFromContext: true,
        },
      });
      return;
    }
    if (featureId === 'quiz') {
      recordAction('quiz');
      navigate('/question-bank', {
        state: {
          contextDocIds: [targetId],
          topic: sourceName,
          openView: 'custom',
          autoGenerateFromContext: true,
        },
      });
      return;
    }
    if (featureId === 'notes') {
      if (!token || !userId) {
        setActionMessage({ type: 'error', text: 'Your session expired. Sign in again before creating notes.' });
        return;
      }
      setNotesLoading(true);
      try {
        const response = await queuedAIJsonFetch('/create_note_from_context_docs', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            context_doc_ids: [targetId],
            title: `Notes: ${sourceName}`,
            depth: 'deep',
            tone: 'professional',
          }),
        });
        if (!response.ok) throw new Error(`Failed (${response.status})`);
        const data = await response.json();
        if (data?.id) {
          recordAction('notes');
          navigate(`/notes/editor/${data.id}`);
        } else {
          setActionMessage({ type: 'error', text: 'Notes were created, but the editor could not be opened. Return to Notes to find them.' });
        }
      } catch (err) {
        setActionMessage({ type: 'error', text: err?.message || 'Notes could not be generated from this file. Try again.' });
      } finally {
        setNotesLoading(false);
      }
      return;
    }
    if (featureId === 'roadmap') {
      recordAction('roadmap');
      navigate('/knowledge-map', {
        state: {
          contextDocIds: [targetId],
          sourceSummary: sourceName,
          autoCreateFromContext: true,
        },
      });
    }
  }, [doc, navigate, recordAction, token, userId]);

  if (loading) {
    return (
      <div className="cfp-root">
        <BgFx />
        <div className="cfp-state">
          <Loader2 size={28} className="cfp-spin" />
          <p>Loading file…</p>
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="cfp-root">
        <BgFx />
        <div className="cfp-inner">
          <div className="cfp-topbar">
            <button className="cfp-back-btn" type="button" onClick={() => navigate('/contexthub')}>
              <ChevronLeft size={16} /> Back
            </button>
          </div>
        </div>
        <div className="cfp-state cfp-state-error">
          <AlertCircle size={26} />
          <p>{error || 'Could not open this file.'}</p>
          <button className="cfp-retry-btn" type="button" onClick={loadDoc}>Try again</button>
        </div>
      </div>
    );
  }

  const totalUsed = FEATURES.reduce((a, f) => a + (usageCounts[f.id] || 0), 0);
  const sourceReady = !doc.status || doc.status === 'ready';

  return (
    <div className="cfp-root">
      <div className="shc-topbar">
        <ToolNavigation />
      </div>
      <BgFx />
      <div className="cfp-inner">
        <div className="cfp-topbar">
          <button className="cfp-back-btn" type="button" onClick={() => navigate('/contexthub')}>
            <ChevronLeft size={16} /> Back
          </button>
        </div>

        <main className="cfp-main">
          <section className="cfp-hero">
            <p className="cfp-eyebrow">Context File</p>
            <h1>{doc.filename || doc.title || 'Untitled file'}</h1>
            <div className="cfp-badges">
              <span><BookOpen size={12} /> {subjectLabel(doc.subject || 'General')}</span>
              <span><Folder size={12} /> {doc.folder_name || 'Uncategorized'}</span>
              <span><FileText size={12} /> {doc.chunk_count || 0} chunks</span>
              <span><Clock size={12} /> {fmtDate(doc.created_at)}</span>
              {totalUsed > 0 && (
                <span className="cfp-badge-used">
                  Used {totalUsed} {totalUsed === 1 ? 'time' : 'times'} total
                </span>
              )}
            </div>
          </section>

          <div className="cfp-deck-row">
            <button
              className={`cfp-deck-btn ${inDeck ? 'cfp-deck-btn--active' : ''}`}
              type="button"
              onClick={() => (inDeck ? removeFromDeck() : addToDeck())}
              disabled={!sourceReady}
            >
              {inDeck ? <CheckSquare size={15} /> : <Square size={15} />}
              {inDeck ? 'In Context Deck — Remove' : 'Add to Context Deck'}
            </button>
            {inDeck && (
              <p className="cfp-deck-hint">Prioritized in all AI features</p>
            )}
          </div>

          {!sourceReady && (
            <div className="cfp-notice" role="status">
              {doc.status === 'failed'
                ? 'This source could not be indexed. Delete it from your library and upload it again.'
                : 'This source is still being indexed. Its study actions will unlock when processing finishes.'}
            </div>
          )}

          {actionMessage && (
            <div className={`cfp-notice cfp-notice--${actionMessage.type}`} role={actionMessage.type === 'error' ? 'alert' : 'status'}>
              {actionMessage.text}
            </div>
          )}

          {(doc.ai_summary || doc.key_concepts?.length || doc.topic_tags?.length) && (
            <section className="cfp-insights" aria-labelledby="cfp-insights-title">
              <div>
                <p className="cfp-eyebrow">Source analysis</p>
                <h2 id="cfp-insights-title">What this source covers</h2>
                <p>{doc.ai_summary || 'Key ideas identified while this source was indexed.'}</p>
              </div>
              {(doc.key_concepts?.length || doc.topic_tags?.length) && (
                <ul aria-label="Key concepts">
                  {Array.from(new Set([...(doc.key_concepts || []), ...(doc.topic_tags || [])])).slice(0, 12).map((concept) => (
                    <li key={concept}>{concept}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="cfp-section">
            <h2 className="cfp-section-label">Use as Context</h2>
            <div className="cfp-features-grid">
              {FEATURES.map((feature) => {
                const count = usageCounts[feature.id] || 0;
                const Icon = feature.icon;
                const isLoading = feature.id === 'notes' && notesLoading;
                return (
                  <div
                    key={feature.id}
                    className="cfp-feature-card"
                    style={{
                      '--fc': feature.color,
                      '--fb': feature.bg,
                      '--fbd': feature.border,
                    }}
                  >
                    <div className="cfp-feature-top">
                      <div className="cfp-feature-icon">
                        <Icon size={18} />
                      </div>
                      <div className="cfp-feature-count">
                        <span className="cfp-count-num">{count}</span>
                        <span className="cfp-count-label">{count === 1 ? 'time' : 'times'}</span>
                      </div>
                    </div>
                    <div className="cfp-feature-body">
                      <p className="cfp-feature-name">{feature.label}</p>
                      <p className="cfp-feature-desc">{feature.desc}</p>
                    </div>
                    <button
                      className="cfp-feature-btn"
                      type="button"
                      onClick={() => runAction(feature.id)}
                      disabled={!sourceReady || notesLoading}
                    >
                      {isLoading && <Loader2 size={13} className="cfp-spin" />}
                      {feature.btnLabel}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {usageCounts.lastUsedAt && (
            <p className="cfp-last-used">
              <Clock size={11} /> Last used {fmtDate(usageCounts.lastUsedAt)}
            </p>
          )}
        </main>
      </div>
    </div>
  );
};

export default ContextFileAnalysis;
