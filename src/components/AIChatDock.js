import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { MessageCircle, Minimize2, Maximize2, X, Send } from 'lucide-react';
import { API_URL } from '../config';
import { queueChatCompletion, USE_AI_JOB_QUEUE } from '../services/aiJobService';
import MathRenderer from './MathRenderer';
import { renderMarkdownWithMath } from '../utils/mathMarkdown';
import GraphRenderer, { detectGraphLanguage } from './GraphRenderer';
import { disableChatDock, getChatDockState, listenChatDockUpdates } from '../utils/chatDock';
import { formatUsageLimitMessage, getUsageLimitFromError, throwIfUsageLimitResponse } from '../utils/usageLimit';
import './AIChatDock.css';

const GRAPH_REQUEST_RE = /\b(graph|chart|plot|diagram|flowchart|mindmap|visuali[sz]e|trendline|trend line)\b/i;
const CARTESIAN_GRAPH_RE = /\b(x[\s-]?axis|y[\s-]?axis|linear regression|scatter|line graph|slope|intercept|coordinate|cartesian)\b/i;
const GRAPH_WORTHY_RE = /\b(compare|comparison|trend|distribution|correlation|relationship|growth|decline|over time|ratio|proportion|probability|frequency|histogram|timeline|forecast|projection|metrics|analytics|performance)\b/i;
const STEM_GRAPH_DOMAIN_RE = /\b(algebra|geometry|trigonometry|calculus|statistics|probability|equation|matrix|vector|derivative|integral|function|regression|optimization|economics?|gdp|inflation|interest rate|demand|supply|elasticity|market|finance|revenue|cost|profit|physics|mechanics|thermodynamics|electromagnetism|optics|quantum|force|velocity|acceleration|energy|momentum)\b/i;
const INTERNAL_GRAPH_GUIDANCE_MARKERS = [
  'if a visual would materially improve understanding,',
  'when a graph is needed, return a fenced',
  'if a visual helps, include a fenced graph block',
  'prefer ```graphjson for this response',
  'for `graphjson`, use schema:',
  'only include graphjson when necessary.',
  'do not include any graph or diagram block unless the user explicitly asks for one.',
];
const COMPREHENSION_CHECK_RE = /\b(comprehension\s+check|check\s+your\s+understanding|quick\s+(?:understanding\s+)?check|to\s+ensure\s+you'?re\s+following\s+along|can\s+you\s+briefly\s+(?:describe|explain|summari[sz]e)|how\s+(?:would|do)\s+you\s+(?:explain|describe|understand)|what\s+do\s+you\s+understand|try\s+(?:answering|explaining|summari[sz]ing))\b/i;
const NEW_QUESTION_START_RE = /^\s*(what|why|how|when|where|who|which|can|could|would|should|please|explain|tell|show|give|quiz|make|create|generate)\b/i;

const stripInternalGraphGuidance = (text = '') => {
  const raw = String(text || '').replace(/\r\n/g, '\n');
  if (!raw) return raw;
  const lower = raw.toLowerCase();
  let cutAt = -1;
  INTERNAL_GRAPH_GUIDANCE_MARKERS.forEach((marker) => {
    const idx = lower.indexOf(marker);
    if (idx >= 0 && (cutAt === -1 || idx < cutAt)) cutAt = idx;
  });
  if (cutAt === -1) return raw.trim();
  return raw.slice(0, cutAt).replace(/\n{2,}$/g, '').trim();
};

const toUiMessages = (messages) =>
  (Array.isArray(messages) ? messages : [])
    .filter((m) => m?.content)
    .map((m) => ({
      id: String(m.id),
      type: (String(m.type || m.role || '').toLowerCase() === 'user' || String(m.type || m.role || '').toLowerCase() === 'human') ? 'user' : 'ai',
      content: (String(m.type || m.role || '').toLowerCase() === 'user' || String(m.type || m.role || '').toLowerCase() === 'human')
        ? stripInternalGraphGuidance(m.content || '')
        : m.content,
      timestamp: m.timestamp,
    }));

function stripThinking(text) {
  if (!text) return text;
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, '')
    .trim();
}

function buildGraphAwarePrompt(userText = '') {
  const base = String(userText || '').trim();
  if (!base) return base;

  const isGraphRequest = GRAPH_REQUEST_RE.test(base);
  const isCartesianGraphRequest = CARTESIAN_GRAPH_RE.test(base);
  const graphWorthy = isGraphRequest || isCartesianGraphRequest || GRAPH_WORTHY_RE.test(base);
  const inGraphFriendlyDomain = STEM_GRAPH_DOMAIN_RE.test(base);

  const proactiveInstruction = 'If a visual would materially improve understanding, proactively include exactly one fenced graph block. Use `graphjson` for data/x-y charts and `mermaid` for process/concept flows. Do not include a graph when it does not help.';
  const graphJsonHint = 'For `graphjson`, use schema: {"type":"line|scatter|bubble|bar|area|pie|donut","title":"...","xLabel":"...","yLabel":"...","series":[{"name":"...","points":[{"x":number|string,"y":number,"r":number?}]}]}.';

  if (isCartesianGraphRequest) {
    return `${base}\n\n${proactiveInstruction}\nPrefer \`\`\`graphjson for this response with numeric x/y points and axis labels.\n${graphJsonHint}`;
  }
  if (graphWorthy || inGraphFriendlyDomain) {
    return `${base}\n\n${proactiveInstruction}\n${graphJsonHint}`;
  }
  return `${base}\n\nDo not include any graph or diagram block unless the user explicitly asks for one.`;
}

function getLastAiMessage(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.type === 'ai' && message.content) return message.content;
  }
  return '';
}

function looksLikeComprehensionAnswer(text = '') {
  const trimmed = String(text || '').trim();
  if (trimmed.length < 3 || !/[a-z]/i.test(trimmed)) return false;
  if (NEW_QUESTION_START_RE.test(trimmed)) return false;
  if (trimmed.endsWith('?') && /\b(what|why|how|can|could|explain|tell|show)\b/i.test(trimmed)) return false;
  if (/\b(i\s+don'?t\s+know|not\s+sure|no\s+idea|idk)\b/i.test(trimmed)) return true;
  const words = trimmed.match(/[a-z][a-z'-]*/gi) || [];
  if (words.length >= 5) return true;
  return /\b(it|this|that|they|wave|particle|means?)\b/i.test(trimmed);
}

function isAnsweringPreviousComprehensionCheck(text = '', messages = []) {
  return COMPREHENSION_CHECK_RE.test(getLastAiMessage(messages)) && looksLikeComprehensionAnswer(text);
}

const renderDockMarkdownWithMath = (text) => renderMarkdownWithMath(text, {
  preprocess: (t) => t
    .replace(/\\([*`>#.!+-])/g, '$1')
    .replace(/(\*\*)\s+(\d+\.\s+\*\*)/g, '$1\n\n$2')
    .replace(/([.:])\s+(\d+\.\s+\*\*)/g, '$1\n\n$2')
    .replace(/\s+(\*\s+\*\*[^*]+:\*\*)/g, '\n$1'),
});

function renderDockMessageContent(content) {
  const cleaned = stripThinking(content || '');
  if (!cleaned) return null;

  const codeBlockRegex = /```([^\n`]*)?\n?([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: cleaned.substring(lastIndex, match.index) });
    }
    parts.push({ type: 'code', language: (match[1] || 'plaintext').trim().toLowerCase(), content: match[2].trim() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < cleaned.length) {
    parts.push({ type: 'text', content: cleaned.substring(lastIndex) });
  }
  if (parts.length === 0) {
    parts.push({ type: 'text', content: cleaned });
  }

  return parts.map((part, idx) => {
    const inferred = part.type === 'code' ? detectGraphLanguage(part.language, part.content) : null;
    if (part.type === 'code' && inferred) {
      return (
        <GraphRenderer
          key={`dock_graph_${idx}`}
          language={inferred}
          content={part.content}
          compact
        />
      );
    }
    if (part.type === 'code') {
      return (
        <div key={`dock_code_${idx}`} className="acd-code-block">
          <div className="acd-code-lang">{part.language.toUpperCase()}</div>
          <pre><code>{part.content}</code></pre>
        </div>
      );
    }
    return (
      <MathRenderer
        key={`dock_text_${idx}`}
        content={renderDockMarkdownWithMath(part.content)}
        className="acd-math-content"
      />
    );
  });
}

const AIChatDock = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [dock, setDock] = useState(() => getChatDockState());
  const [expanded, setExpanded] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const listRef = useRef(null);

  const token = localStorage.getItem('token');
  const userName = localStorage.getItem('username') || '';
  const chatId = dock?.chatId;

  const shouldShow = useMemo(() => {
    if (!token || !dock?.enabled || !chatId) return false;
    const hiddenRoutes = ['/ai-chat', '/login', '/register'];
    return !hiddenRoutes.some((prefix) => location.pathname.startsWith(prefix));
  }, [chatId, dock?.enabled, location.pathname, token]);

  const loadMessages = async () => {
    if (!chatId || !token) return;
    setLoadingMessages(true);
    try {
      const response = await fetch(`${API_URL}/get_chat_messages?chat_id=${chatId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setMessages(toUiMessages(data).slice(-30));
      }
    } catch {
      // silenced
    } finally {
      setLoadingMessages(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !chatId || sending || !token || !userName) return;

    const userMsg = {
      id: `dock_user_${Date.now()}`,
      type: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const formData = new FormData();
      formData.append('user_id', userName);
      const messageForModel = isAnsweringPreviousComprehensionCheck(text, messages)
        ? text
        : buildGraphAwarePrompt(text);
      formData.append('question', messageForModel);
      formData.append('original_question', text);
      formData.append('chat_id', String(chatId));
      formData.append('use_hs_context', String(localStorage.getItem('hs_mode_enabled') === 'true'));

      let data;
      if (USE_AI_JOB_QUEUE) {
        data = await queueChatCompletion({
          prompt: messageForModel,
          user_message: text,
          chat_session_id: Number(chatId),
          use_hs_context: localStorage.getItem('hs_mode_enabled') === 'true',
        });
      } else {
        const response = await fetch(`${API_URL}/ask_simple/`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!response.ok) {
          await throwIfUsageLimitResponse(response);
          throw new Error('Failed to send message');
        }

        data = await response.json();
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `dock_ai_${Date.now()}`,
          type: 'ai',
          content: data?.answer || 'No response received.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      const usageLimit = getUsageLimitFromError(error);
      setMessages((prev) => [
        ...prev,
        {
          id: `dock_err_${Date.now()}`,
          type: 'ai',
          content: usageLimit
            ? formatUsageLimitMessage(usageLimit)
            : 'Could not send message. Try again.',
          timestamp: new Date().toISOString(),
          usageLimit: Boolean(usageLimit),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    setDock(getChatDockState());

    const offCustom = listenChatDockUpdates((next) => setDock(next));
    const onStorage = (event) => {
      if (event.key === 'cerbyl.chatDock') {
        setDock(getChatDockState());
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      offCustom();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    if (!shouldShow) {
      setExpanded(false);
      return;
    }
    loadMessages();
  }, [chatId, shouldShow]);

  useEffect(() => {
    if (!expanded || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [expanded, messages]);

  if (!shouldShow || typeof document === 'undefined') return null;

  return createPortal(
    <div className={`acd-wrap ${expanded ? 'acd-wrap-expanded' : ''}`}>
      {expanded && (
        <div className="acd-panel" role="dialog" aria-label="AI chat dock">
          <div className="acd-head">
            <div className="acd-head-title">AI chat</div>
            <button className="acd-head-btn" onClick={() => navigate(`/ai-chat/${chatId}`)} title="Open full chat" aria-label="Open full chat">
              <Maximize2 size={14} />
            </button>
          </div>

          <div className="acd-messages" ref={listRef}>
            {loadingMessages ? (
              <div className="acd-empty">Loading chat...</div>
            ) : messages.length === 0 ? (
              <div className="acd-empty">No messages yet</div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className={`acd-msg ${message.type} ${message.usageLimit ? 'is-usage-limit' : ''}`}>
                  {renderDockMessageContent(message.content)}
                </div>
              ))
            )}
          </div>

          <div className="acd-input-row">
            <input
              className="acd-input"
              value={input}
              aria-label="Continue this conversation"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Continue this conversation..."
            />
            <button className="acd-send" onClick={sendMessage} disabled={!input.trim() || sending} aria-label="Send chat message">
              <Send size={12} />
            </button>
          </div>
        </div>
      )}

      <button className="acd-pill" onClick={() => setExpanded((prev) => !prev)} title="Toggle chat dock" aria-label={expanded ? 'Collapse chat dock' : 'Expand chat dock'}>
        <span className="acd-pill-icon"><MessageCircle size={15} /></span>
        <span className="acd-pill-text">Continue Chat</span>
        <span className="acd-pill-actions">
          {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </span>
      </button>

      <button
        className="acd-close"
        onClick={() => {
          disableChatDock();
          setExpanded(false);
        }}
        title="Close chat dock"
        aria-label="Close chat dock"
      >
        <X size={12} />
      </button>
    </div>
    ,
    document.body
  );
};

export default AIChatDock;
