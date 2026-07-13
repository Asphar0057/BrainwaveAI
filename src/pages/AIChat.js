import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  Brain,
  Clapperboard,
  FileQuestion,
  FileText,
  Gamepad2,
  HelpCircle,
  Layers,
  Library,
  Map,
  MessageCircle,
  Network,
  Route,
  Search,
  Sparkles,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { API_URL } from '../config';
import { escapeHtml, safeInternalPath } from '../utils/sanitize';
import { signOutAppSession } from '../utils/authSession';
import gamificationService from '../services/gamificationService';
import MathRenderer from '../components/MathRenderer';
import GraphRenderer, { detectGraphLanguage } from '../components/GraphRenderer';
import { marked } from 'marked';

import './AIChat.css';
import ContextSelector from '../components/ContextSelector';
import ContextPanel from '../components/ContextPanel';
import GeometricGrid from '../components/GeometricGrid';
import contextService from '../services/contextService';
import { enableChatDock } from '../utils/chatDock';
import { queueChatCompletion, queueLegacyAIFileEndpoint, queuedAIJsonFetch, USE_AI_JOB_QUEUE } from '../services/aiJobService';
import { formatUsageLimitMessage, getUsageLimitFromError, throwIfUsageLimitResponse } from '../utils/usageLimit';

const CONTEXT_SELECTION_KEY = 'ctx_selected_doc_ids';
const chatContextSelectionKey = (chatId) => (
  chatId
    ? `${CONTEXT_SELECTION_KEY}:chat:${chatId}`
    : `${CONTEXT_SELECTION_KEY}:pending-chat`
);

const loadContextSelection = (chatId) => {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(chatContextSelectionKey(chatId)) || '[]'
    );
    return Array.isArray(parsed)
      ? parsed.map((value) => String(value).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
};
const TUTOR_MODE_KEY = 'ai_chat_tutor_mode_enabled';
const TUTOR_REPLY_MODE_KEY = 'ai_chat_tutor_reply_mode';
const TUTOR_REPLY_MODES = [
  { id: 'hint', label: 'Nudge' },
  { id: 'guided', label: 'Teach' },
  { id: 'check', label: 'Check Me' },
  { id: 'quiz', label: 'Drill' },
];

const SMART_ACTION_LIMIT = 8;

const CORE_SMART_ACTIONS = [
  { id: 'save_note', kind: 'create_note', label: 'Make Note', description: 'Turn this answer into a structured note', icon: 'note', category: 'creation', baseScore: 120, intents: ['explain', 'review', 'memory', 'planning', 'general'] },
  { id: 'quiz_me', kind: 'quiz_on_topic', label: 'Quiz Me', description: 'Start a focused quiz on this topic', icon: 'quiz', category: 'assessment', baseScore: 116, intents: ['explain', 'assessment', 'review', 'general'] },
  { id: 'go_deeper', kind: 'deepen_topic', label: 'Go Deeper', description: 'Push into advanced understanding', icon: 'depth', category: 'depth', baseScore: 112, intents: ['explain', 'planning', 'general'] },
  { id: 'build_path', kind: 'create_learning_path', label: 'Build Learning Path', description: 'Create a guided plan from beginner to advanced', icon: 'path', category: 'planning', baseScore: 108, intents: ['planning', 'explain', 'review'] },
  { id: 'build_roadmap', kind: 'create_roadmap', label: 'Create Knowledge Map', description: 'Generate a visual knowledge graph from this chat', icon: 'roadmap', category: 'planning', baseScore: 106, intents: ['planning', 'explain', 'review'] },
  { id: 'flashcards_now', kind: 'open_route', route: '/flashcards', label: 'Build Flashcards', description: 'Convert this topic into spaced-repetition cards', icon: 'flashcard', category: 'memory', baseScore: 102, intents: ['review', 'memory', 'assessment'] },
];

const TUTOR_SMART_ACTIONS = [
  { id: 'tutor_practice_weakness', kind: 'practice_weakness', label: 'Practice Weakness', description: 'Train the exact mistake area', icon: 'practice' },
  { id: 'tutor_make_flashcards', kind: 'create_flashcards', label: 'Make Flashcards', description: 'Save these gaps for spaced repetition', icon: 'flashcard' },
  { id: 'tutor_quiz_me', kind: 'quiz_on_topic', label: 'Create Quiz', description: 'Generate a short check on this skill', icon: 'quiz' },
  { id: 'tutor_open_map', kind: 'create_roadmap', label: 'Open Knowledge Map', description: 'See this concept in context', icon: 'roadmap' },
  { id: 'tutor_continue_path', kind: 'create_learning_path', label: 'Continue Path', description: 'Build a guided plan from here', icon: 'path' },
  { id: 'tutor_save_note', kind: 'create_note', label: 'Save as Note', description: 'Capture this tutor step in notes', icon: 'note' },
  { id: 'tutor_review', kind: 'open_route', route: '/learning-review', label: 'Learning Review', description: 'Review connected study work', icon: 'review' },
];

const FEATURE_ROUTE_ACTIONS = [
  { id: 'feature_search_hub', kind: 'open_route', route: '/search-hub', label: 'Search Hub', description: 'Universal command center for all tools', icon: 'search', category: 'platform', baseScore: 84, intents: ['general'] },
  { id: 'feature_learning_review', kind: 'open_route', route: '/learning-review', label: 'Learning Review', description: 'Review your learning artifacts together', icon: 'review', category: 'review', baseScore: 82, intents: ['review', 'general'] },
  { id: 'feature_study_insights', kind: 'open_route', route: '/study-insights', label: 'Study Insights', description: 'Understand performance trends', icon: 'insights', category: 'analytics', baseScore: 80, intents: ['analytics', 'review'] },
  { id: 'feature_weaknesses', kind: 'open_route', route: '/weaknesses', label: 'Weakness Analysis', description: 'Target weak concepts and improve faster', icon: 'weakness', category: 'analytics', baseScore: 94, intents: ['assessment', 'analytics', 'review'] },
  { id: 'feature_weakness_practice', kind: 'open_route', route: '/weakness-practice', label: 'Weakness Practice', description: 'Train on weak areas with adaptive questions', icon: 'practice', category: 'assessment', baseScore: 96, intents: ['assessment', 'review'] },
  { id: 'feature_quiz_hub', kind: 'open_route', route: '/quiz-hub', label: 'Quiz Hub', description: 'Access all quiz modes', icon: 'quiz', category: 'assessment', baseScore: 88, intents: ['assessment'] },
  { id: 'feature_solo_quiz', kind: 'open_route', route: '/solo-quiz', label: 'Solo Quiz', description: 'Generate a fresh solo quiz', icon: 'quiz', category: 'assessment', baseScore: 90, intents: ['assessment', 'review'] },
  { id: 'feature_question_bank', kind: 'open_route', route: '/question-bank', label: 'Question Bank', description: 'Generate and manage question sets', icon: 'bank', category: 'assessment', baseScore: 89, intents: ['assessment', 'review'] },
  { id: 'feature_knowledge_roadmap', kind: 'open_route', route: '/knowledge-map', label: 'Knowledge Map', description: 'Explore topics as connected maps', icon: 'roadmap', category: 'planning', baseScore: 92, intents: ['planning', 'explain'] },
  { id: 'feature_learning_paths', kind: 'open_route', route: '/learning-paths', label: 'Learning Paths', description: 'Generate structured step-by-step plans', icon: 'path', category: 'planning', baseScore: 94, intents: ['planning', 'review'] },
  { id: 'feature_xp_roadmap', kind: 'open_route', route: '/xp-roadmap', label: 'XP Roadmap', description: 'Track milestone progress and streaks', icon: 'xp', category: 'planning', baseScore: 79, intents: ['planning', 'analytics'] },
  { id: 'feature_concept_web', kind: 'open_route', route: '/concept-web', label: 'Concept Web', description: 'Visualize concept relationships', icon: 'concept', category: 'planning', baseScore: 78, intents: ['planning', 'explain'] },
  { id: 'feature_notes_hub', kind: 'open_route', route: '/notes', label: 'Notes Hub', description: 'Capture and organize knowledge', icon: 'note', category: 'creation', baseScore: 90, intents: ['explain', 'review', 'memory'] },
  { id: 'feature_my_notes', kind: 'open_route', route: '/notes/my-notes', label: 'My Notes', description: 'Jump directly into your note library', icon: 'note', category: 'creation', baseScore: 88, intents: ['review', 'memory'] },
  { id: 'feature_notes_dashboard', kind: 'open_route', route: '/notes/dashboard', label: 'Notes Dashboard', description: 'Open note workspace overview', icon: 'note', category: 'creation', baseScore: 78, intents: ['general'] },
  { id: 'feature_ai_media_notes', kind: 'open_route', route: '/notes/ai-media', label: 'AI Media Notes', description: 'Convert media into rich notes', icon: 'media', category: 'media', baseScore: 92, intents: ['media', 'review'] },
  { id: 'feature_audio_video_notes', kind: 'open_route', route: '/notes/audio-video', label: 'Audio/Video Notes', description: 'Process lectures and recordings', icon: 'media', category: 'media', baseScore: 87, intents: ['media'] },
  { id: 'feature_slide_explorer', kind: 'open_route', route: '/slide-explorer', label: 'Slide Explorer', description: 'Extract knowledge from decks', icon: 'slides', category: 'media', baseScore: 90, intents: ['media', 'explain'] },
  { id: 'feature_vault', kind: 'open_route', route: '/contexthub', label: 'Vault', description: 'Manage your context and assets', icon: 'vault', category: 'workspace', baseScore: 78, intents: ['general', 'planning'] },
  { id: 'feature_canvas', kind: 'open_route', route: '/canvas', label: 'Canvas', description: 'Work visually on complex ideas', icon: 'canvas', category: 'workspace', baseScore: 82, intents: ['planning', 'creation'] },
  { id: 'feature_social', kind: 'open_route', route: '/social', label: 'Social', description: 'Collaborate with friends and groups', icon: 'social', category: 'social', baseScore: 84, intents: ['social', 'general'] },
  { id: 'feature_friends', kind: 'open_route', route: '/friends', label: 'Friends Dashboard', description: 'Manage your study network', icon: 'social', category: 'social', baseScore: 81, intents: ['social'] },
  { id: 'feature_activity_feed', kind: 'open_route', route: '/activity-feed', label: 'Activity Feed', description: 'See collaborative activity and updates', icon: 'social', category: 'social', baseScore: 78, intents: ['social', 'analytics'] },
  { id: 'feature_leaderboards', kind: 'open_route', route: '/leaderboards', label: 'Leaderboards', description: 'Compete with your learning cohort', icon: 'social', category: 'social', baseScore: 76, intents: ['social'] },
  { id: 'feature_quiz_battles', kind: 'open_route', route: '/quiz-battles', label: 'Quiz Battles', description: 'Challenge others in quiz battles', icon: 'social', category: 'social', baseScore: 83, intents: ['social', 'assessment'] },
  { id: 'feature_challenges', kind: 'open_route', route: '/challenges', label: 'Challenges', description: 'Join time-bound group challenges', icon: 'social', category: 'social', baseScore: 80, intents: ['social', 'assessment'] },
  { id: 'feature_playlists', kind: 'open_route', route: '/playlists', label: 'Playlists', description: 'Curate learning journeys and resources', icon: 'playlist', category: 'social', baseScore: 74, intents: ['planning', 'review'] },
  { id: 'feature_games', kind: 'open_route', route: '/games', label: 'Games', description: 'Gamified practice loops', icon: 'games', category: 'social', baseScore: 70, intents: ['assessment', 'social'] },
  { id: 'feature_analytics', kind: 'open_route', route: '/analytics', label: 'Analytics', description: 'Deep analytics for study behavior', icon: 'analytics', category: 'analytics', baseScore: 86, intents: ['analytics', 'review'] },
  { id: 'feature_statistics', kind: 'open_route', route: '/statistics', label: 'Statistics', description: 'Track and inspect statistics', icon: 'analytics', category: 'analytics', baseScore: 78, intents: ['analytics'] },
  { id: 'feature_activity_timeline', kind: 'open_route', route: '/activity-timeline', label: 'Activity Timeline', description: 'View chronological learning history', icon: 'analytics', category: 'analytics', baseScore: 76, intents: ['analytics', 'review'] },
];

const INTENT_KEYWORDS = {
  explain: ['explain', 'understand', 'clarify', 'why', 'how', 'example', 'concept', 'neural', 'theory'],
  assessment: ['quiz', 'test', 'questions', 'mcq', 'practice', 'evaluate', 'check'],
  planning: ['roadmap', 'path', 'plan', 'schedule', 'milestone', 'step by step'],
  review: ['review', 'revise', 'summary', 'summarize', 'recap', 'remember'],
  memory: ['flashcard', 'memorize', 'memory', 'retain'],
  media: ['video', 'audio', 'podcast', 'youtube', 'slide', 'pdf', 'lecture'],
  social: ['friends', 'battle', 'challenge', 'team', 'leaderboard', 'group'],
  analytics: ['progress', 'stats', 'analytics', 'accuracy', 'weakness', 'performance'],
};

const TOPIC_PATTERN = /\b(?:about|on|for|of|regarding)\s+([a-zA-Z0-9\s\-_,]{3,80})/i;
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

function stripInternalGraphGuidance(text = '') {
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
}

const COMPREHENSION_CHECK_RE = /\b(comprehension\s+check|check\s+your\s+understanding|quick\s+(?:understanding\s+)?check|to\s+ensure\s+you'?re\s+following\s+along|can\s+you\s+(?:briefly\s+)?(?:describe|explain|summari[sz]e|integrate|differentiate|solve|calculate|compute|find|apply)|how\s+(?:would|do)\s+you\s+(?:explain|describe|understand|solve|calculate|compute|find|apply)|what\s+do\s+you\s+understand|try\s+(?:answering|explaining|summari[sz]ing|solving|calculating|computing|finding|integrating|differentiating))\b/i;
const MATH_ATTEMPT_RE = /(?:\d|[a-z]\s*(?:\^|\*\*|²|³)|\\frac|\\int|[=+\-*/^()])/i;
const NEW_QUESTION_START_RE = /^\s*(what|why|how|when|where|who|which|can|could|would|should|please|explain|tell|show|give|quiz|make|create|generate)\b/i;

function getLastAiMessage(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.type === 'ai' && message.content) {
      return message.content;
    }
  }
  return '';
}

function looksLikeComprehensionAnswer(text = '') {
  const trimmed = String(text || '').trim();
  if (trimmed.length < 1) return false;

  const lower = trimmed.toLowerCase();
  if (NEW_QUESTION_START_RE.test(trimmed)) return false;
  if (trimmed.endsWith('?') && /\b(what|why|how|can|could|explain|tell|show)\b/i.test(trimmed)) {
    return false;
  }

  if (/\b(i\s+don'?t\s+know|not\s+sure|no\s+idea|idk)\b/i.test(lower)) return true;
  if (MATH_ATTEMPT_RE.test(trimmed) && trimmed.length <= 80) return true;
  const words = trimmed.match(/[a-z][a-z'-]*/gi) || [];
  if (words.length >= 5) return true;

  return /\b(it|this|that|they|wave|particle|means?)\b/i.test(trimmed);
}

function isAnsweringPreviousComprehensionCheck(text = '', messages = []) {
  const previousAiMessage = getLastAiMessage(messages);
  return COMPREHENSION_CHECK_RE.test(previousAiMessage) && looksLikeComprehensionAnswer(text);
}

function isAnsweringTutorStep(text = '', messages = []) {
  const trimmed = String(text || '').trim();
  if (!looksLikeComprehensionAnswer(trimmed)) return false;

  const previousAi = [...messages].reverse().find((message) => message?.type === 'ai');
  if (!previousAi) return false;
  if (previousAi.tutorMode || previousAi.tutorState || (Array.isArray(previousAi.tutorOptions) && previousAi.tutorOptions.length > 0)) {
    return true;
  }

  return COMPREHENSION_CHECK_RE.test(previousAi.content || '');
}

function stripTutorOptionMarkers(text = '') {
  return String(text || '').replace(/^\s*TUTOR_OPTIONS\s*:\s*\[[^\n]*\]\s*$/gim, '').trim();
}

function stripTutorJsonFence(text = '') {
  let raw = String(text || '').trim();
  if (raw.startsWith('```')) {
    raw = raw.split('\n').slice(1).join('\n');
    if (raw.trimEnd().endsWith('```')) {
      raw = raw.replace(/```\s*$/, '');
    }
  }
  return raw.trim();
}

function escapeLatexBackslashesForJson(text = '') {
  const raw = String(text || '');
  let output = '';
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const previous = raw[index - 1] || '';
    const next = raw[index + 1] || '';
    output += char === '\\' && previous !== '\\' && /[A-Za-z]/.test(next) ? '\\\\' : char;
  }
  return output;
}

function normalizeTutorJsonishText(text = '') {
  return String(text || '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function coerceTutorAnswer(answer) {
  if (typeof answer === 'string') return answer.trim();
  if (Array.isArray(answer)) {
    return answer
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function parseTutorJsonLenient(text = '') {
  const raw = normalizeTutorJsonishText(stripTutorJsonFence(text));
  const escaped = escapeLatexBackslashesForJson(raw);
  const candidates = escaped === raw ? [raw] : [escaped, raw];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next representation.
    }
  }
  return null;
}

function decodeJsonishTutorString(value = '') {
  const escaped = escapeLatexBackslashesForJson(value);
  try {
    return JSON.parse(`"${escaped}"`).trim();
  } catch {
    return String(value || '').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
  }
}

function coercePseudoArrayLines(bracketed = '') {
  const inner = String(bracketed || '').trim().replace(/^\[/, '').replace(/\]$/, '');
  const lines = inner
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      const hadBullet = /^[*\-]\s*/.test(trimmed);
      const cleaned = trimmed.replace(/^[*\-]\s*/, '').replace(/^"|",?$|,$/g, '').trim();
      return cleaned && hadBullet ? `- ${cleaned}` : cleaned;
    })
    .filter(Boolean);
  return lines.join('\n').trim();
}

function parseTutorResponseContract(text = '') {
  const raw = normalizeTutorJsonishText(stripTutorJsonFence(text));
  if (!/"answer"\s*:/.test(raw) || !/"tutor_state"\s*:/.test(raw)) return null;

  const parsed = parseTutorJsonLenient(raw);
  if (parsed && typeof parsed === 'object') {
    const answer = coerceTutorAnswer(parsed.answer);
    if (!answer) return null;
    return {
      answer,
      tutorState: parsed.tutor_state || null,
      tutorOptions: normalizeTutorOptions(parsed.options || []),
    };
  }

  const answerArrayMatch = raw.match(/"answer"\s*:\s*(\[[\s\S]*?\])\s*,\s*"tutor_state"\s*:/i);
  const answerMatch = raw.match(/"answer"\s*:\s*"([\s\S]*?)"\s*,\s*"tutor_state"\s*:/i);
  const parsedAnswer = answerArrayMatch
    ? (coerceTutorAnswer(parseTutorJsonLenient(answerArrayMatch[1])) || coercePseudoArrayLines(answerArrayMatch[1]))
    : (answerMatch ? decodeJsonishTutorString(answerMatch[1]) : '');
  if (!parsedAnswer) return null;

  const stateMatch = raw.match(/"tutor_state"\s*:\s*(\{[\s\S]*?\})\s*,\s*"options"\s*:/i);
  const optionsMatch = raw.match(/"options"\s*:\s*(\[[\s\S]*?\])/i);
  const tutorState = stateMatch ? parseTutorJsonLenient(stateMatch[1]) : null;
  const tutorOptions = optionsMatch ? normalizeTutorOptions(parseTutorJsonLenient(optionsMatch[1]) || []) : [];

  return {
    answer: parsedAnswer,
    tutorState,
    tutorOptions,
  };
}

function normalizeTutorOptions(rawOptions = []) {
  if (!Array.isArray(rawOptions)) return [];
  return rawOptions.slice(0, 6).map((option, index) => {
    const fallbackLabel = String.fromCharCode(65 + index);
    if (option && typeof option === 'object') {
      const text = String(option.text || option.value || option.label || '').replace(/^[A-F][).:-]\s*/i, '').trim();
      const label = String(option.label || option.id || fallbackLabel).slice(0, 1).toUpperCase();
      return text ? { id: label, label, text, value: `${label}. ${text}` } : null;
    }
    const raw = String(option || '').trim();
    const match = raw.match(/^([A-F])[).:-]\s*(.+)$/i);
    const label = match ? match[1].toUpperCase() : fallbackLabel;
    const text = (match ? match[2] : raw).trim();
    return text ? { id: label, label, text, value: `${label}. ${text}` } : null;
  }).filter(Boolean);
}

function extractTutorOptionsFromText(text = '') {
  const content = String(text || '');
  const markerMatch = content.match(/^\s*TUTOR_OPTIONS\s*:\s*(\[[^\n]*\])\s*$/im);
  if (markerMatch) {
    try {
      const parsed = JSON.parse(markerMatch[1]);
      const normalized = normalizeTutorOptions(parsed);
      if (normalized.length >= 2) return normalized;
    } catch {
      // Ignore malformed model markers and fall back to visible option lines.
    }
  }

  const optionMatches = [...content.matchAll(/^\s*([A-F])[).:-]\s+(.{2,220})\s*$/gim)];
  const hasMcqCue = /\b(mcq|multiple choice|choose|which option|select one|quick check)\b/i.test(content);
  if (optionMatches.length >= 3 || (optionMatches.length >= 2 && hasMcqCue)) {
    return normalizeTutorOptions(optionMatches.map((match) => `${match[1].toUpperCase()}. ${match[2].trim()}`));
  }
  return [];
}

function normalizeTutorLessonPlan(rawPlan = null) {
  if (!rawPlan || typeof rawPlan !== 'object') return null;
  const rawSteps = Array.isArray(rawPlan.steps) ? rawPlan.steps : [];
  const steps = rawSteps.slice(0, 8).map((step, index) => {
    if (!step || typeof step !== 'object') return null;
    const id = Number.isFinite(Number(step.id)) ? Number(step.id) : index + 1;
    const title = String(step.title || `Step ${id}`).trim().slice(0, 80);
    const expected = String(step.expected || '').trim().slice(0, 180);
    const skill = String(step.skill || '').trim().slice(0, 80);
    const misconception = String(step.misconception || '').trim().slice(0, 120);
    return { id, title, expected, skill, misconception };
  }).filter(Boolean);
  const currentStep = Number.isFinite(Number(rawPlan.current_step))
    ? Math.max(1, Number(rawPlan.current_step))
    : 1;

  return {
    goal: String(rawPlan.goal || 'Build understanding step by step').trim().slice(0, 120),
    currentStep,
    totalSteps: steps.length || Math.max(0, Number(rawPlan.total_steps || 0)),
    steps,
    finalAnswer: String(rawPlan.final_answer || '').trim().slice(0, 240),
  };
}

function normalizeTutorState(rawState = null, replyMode = 'guided') {
  if (!rawState || typeof rawState !== 'object') return null;

  const normalizedLevel = String(rawState.level || '').trim().toLowerCase();
  const normalizedPhase = String(rawState.phase || '').trim().toLowerCase();
  const normalizedVerdict = String(rawState.verdict || '').trim().toLowerCase();
  const levelAliases = { introductory: 'beginner' };
  const phaseAliases = { exploration: 'teach' };
  const verdictAliases = { in_progress: 'not_applicable', pending: 'needs_attempt' };

  const level = ['beginner', 'intermediate', 'advanced'].includes(levelAliases[normalizedLevel] || normalizedLevel)
    ? (levelAliases[normalizedLevel] || normalizedLevel)
    : 'intermediate';
  const phase = ['diagnose', 'teach', 'practice', 'check', 'review'].includes(phaseAliases[normalizedPhase] || normalizedPhase)
    ? (phaseAliases[normalizedPhase] || normalizedPhase)
    : (replyMode === 'quiz' ? 'practice' : replyMode === 'check' ? 'check' : 'teach');
  const verdict = ['correct', 'partly_correct', 'not_yet', 'needs_attempt', 'not_applicable'].includes(verdictAliases[normalizedVerdict] || normalizedVerdict)
    ? (verdictAliases[normalizedVerdict] || normalizedVerdict)
    : 'not_applicable';
  const confidence = Number.isFinite(Number(rawState.confidence))
    ? Math.max(0, Math.min(1, Number(rawState.confidence)))
    : 0.65;
  const hintLevel = Number.isFinite(Number(rawState.hint_level))
    ? Math.max(1, Math.min(3, Number(rawState.hint_level)))
    : (replyMode === 'hint' ? 1 : 2);

  const rawAttempts = Number.isFinite(Number(rawState.attempts)) ? Math.max(0, Number(rawState.attempts)) : 0;
  const rawCorrectCount = Number.isFinite(Number(rawState.correct_count)) ? Math.max(0, Number(rawState.correct_count)) : 0;
  const attempts = verdict === 'correct' ? Math.max(1, rawAttempts) : rawAttempts;
  const correctCount = verdict === 'correct' ? Math.max(1, rawCorrectCount) : Math.min(rawCorrectCount, Math.max(rawAttempts, rawCorrectCount));
  const currentStep = Number.isFinite(Number(rawState.current_step)) ? Math.max(1, Number(rawState.current_step)) : 1;
  const totalSteps = Number.isFinite(Number(rawState.total_steps)) ? Math.max(0, Number(rawState.total_steps)) : 0;
  const masteryScore = Number.isFinite(Number(rawState.mastery_score))
    ? Math.max(0, Math.min(1, Number(rawState.mastery_score)))
    : null;
  const lessonPlan = normalizeTutorLessonPlan(rawState.lesson_plan);
  const correctStreak = Number.isFinite(Number(rawState.correct_streak)) ? Math.max(0, Number(rawState.correct_streak)) : 0;
  const wrongStreak = Number.isFinite(Number(rawState.wrong_streak)) ? Math.max(0, Number(rawState.wrong_streak)) : 0;

  return {
    level,
    phase,
    verdict,
    confidence,
    hintLevel,
    objective: String(rawState.objective || 'Build understanding step by step').trim().slice(0, 96),
    nextAction: String(rawState.next_action || 'Try the next small step').trim().slice(0, 120),
    attempts,
    correctCount,
    currentStep,
    totalSteps,
    expectedStepAnswer: String(rawState.expected_step_answer || '').trim().slice(0, 180),
    finalAnswer: String(rawState.final_answer || '').trim().slice(0, 240),
    skillsUsed: Array.isArray(rawState.skills_used) ? rawState.skills_used.slice(0, 6) : [],
    misconceptions: Array.isArray(rawState.misconceptions) ? rawState.misconceptions.slice(0, 6) : [],
    autoWeaknessTopics: Array.isArray(rawState.auto_weakness_topics) ? rawState.auto_weakness_topics.slice(0, 6) : [],
    lessonPlan,
    correctStreak,
    wrongStreak,
    masteryScore,
  };
}

function normalizeLoadedMessage(message) {
  if (!message || typeof message !== 'object') return message;
  const msgType = String(message.type || message.role || '').toLowerCase();
  const isUserMessage = msgType === 'user' || msgType === 'human';
  if (!isUserMessage) {
    const contract = parseTutorResponseContract(message.content || '');
    const cleanContent = contract?.answer || stripTutorOptionMarkers(message.content || '');
    const tutorOptions = normalizeTutorOptions(
      message.tutorOptions || message.tutor_options || contract?.tutorOptions || []
    );
    const inferredTutorOptions = tutorOptions.length ? tutorOptions : extractTutorOptionsFromText(cleanContent);
    const tutorState = normalizeTutorState(
      message.tutorState || message.tutor_state || contract?.tutorState,
      message.tutorReplyMode || message.tutor_reply_style
    );
    const isTutorMessage = Boolean(message.tutorMode || message.tutor_mode || tutorState || inferredTutorOptions.length > 0);
    return {
      ...message,
      content: cleanContent,
      ...(isTutorMessage ? { actionButtons: [], smartActions: [], tutorMode: true } : {}),
      ...(inferredTutorOptions.length > 0 ? { tutorOptions: inferredTutorOptions } : {}),
      ...(tutorState ? { tutorState } : {}),
    };
  }
  return {
    ...message,
    content: stripInternalGraphGuidance(message.content || ''),
  };
}

function normalizeTopic(topic = '') {
  return topic.replace(/[^\w\s\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function inferTopicFromText(userText = '', aiText = '') {
  const merged = `${userText} ${aiText}`.trim();
  const patternMatch = merged.match(TOPIC_PATTERN);
  if (patternMatch?.[1]) {
    return normalizeTopic(patternMatch[1]).slice(0, 60);
  }

  const raw = normalizeTopic(userText || aiText);
  if (!raw) return 'this topic';
  const words = raw.split(' ').filter(Boolean);
  return words.slice(0, 6).join(' ').slice(0, 60) || 'this topic';
}

function detectIntents(text = '') {
  const lower = text.toLowerCase();
  const intents = Object.entries(INTENT_KEYWORDS)
    .filter(([, keywords]) => keywords.some((kw) => lower.includes(kw)))
    .map(([intent]) => intent);
  return intents.length ? intents : ['general'];
}

function textHash(text = '') {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const CASUAL_RE = /^\s*(hi+|hey+|hello+|sup|yo+|hola|bye|goodbye|thanks|thank you|ok|okay|cool|nice|great|lol|lmao|haha|sure|yes|no|nope|yep|k|ty|np|bruh|damn|wtf|omg|lgtm|got it|sounds good|perfect|alright|fine|good|bad|what'?s up|whats up|howdy|good morning|good evening|good night|morning|evening|night|hmm+|uh+|um+|makes sense|interesting)\s*[!.?]*\s*$/i;

const INSTRUCTION_RE = /\b(don'?t|do not|stop|no more|never|please don'?t|i told you|remember that i|keep your|be more concise|always|from now on|i (don'?t|do not) want|i said)\b/i;
const META_RE = /\b(do you remember|what did we|earlier you|last time|our conversation|you said|recall|prior|previous (session|conversation|message)|what (is|was) my name|who am i|what do you know about me|where did we leave off)\b/i;
const EMOTIONAL_RE = /\b(i give up|so frustrated|this is (too )?hard|i hate (this|it)|i'?m so lost|makes no sense( to me)?|totally lost|i'?m stressed|can'?t understand)\b/i;

const EDUCATIONAL_INTENT_CLASSES = new Set(['LEARN_CONCEPT', 'ASSESS', 'REVIEW']);

function pickSmartActions({ userMessage, aiResponse, recentActionIds = [], intentClass = null, contextSummary = '', contextLabel = '' }) {
  const userMsg = (userMessage || '').trim();
  const userOnlyIntents = detectIntents(userMsg);
  const hasSpecificIntent = userOnlyIntents.some((i) => i !== 'general');

  // Backend classification is usually authoritative, but the model prompt can add
  // internal guidance that makes the backend intent noisy.
  if (intentClass && !EDUCATIONAL_INTENT_CLASSES.has(intentClass) && !hasSpecificIntent) return [];

  // Hard lexical gates (catch what backend might miss on first message)
  if (CASUAL_RE.test(userMsg)) return [];
  if (INSTRUCTION_RE.test(userMsg)) return [];
  if (META_RE.test(userMsg)) return [];
  if (EMOTIONAL_RE.test(userMsg)) return [];

  // Require at least one specific educational intent keyword in user message
  if (!hasSpecificIntent) return [];

  const combined = `${userMsg} ${aiResponse || ''}`.trim();
  const intents = detectIntents(combined);
  const actionContext = String(contextSummary || userMsg || aiResponse || '').trim();
  const topic = normalizeTopic(contextLabel) || inferTopicFromText(actionContext, '');
  const recentSet = new Set(recentActionIds);
  const actionPool = [...CORE_SMART_ACTIONS, ...FEATURE_ROUTE_ACTIONS];

  const scored = actionPool.map((action) => {
    const intentOverlap = (action.intents || []).filter((intent) => intents.includes(intent)).length;
    const topicBoost = actionContext.toLowerCase().includes(topic.toLowerCase()) ? 3 : 0;
    const repetitionPenalty = recentSet.has(action.id) ? 12 : 0;
    const score = (action.baseScore || 0) + intentOverlap * 12 + topicBoost - repetitionPenalty;
    return { ...action, score, topic, contextSummary: actionContext };
  });

  scored.sort((a, b) => b.score - a.score);

  const chosen = [];
  const chosenCategories = new Set();
  const seenIds = new Set();
  for (const action of scored) {
    if (chosen.length >= SMART_ACTION_LIMIT) break;
    if (seenIds.has(action.id)) continue;

    if (chosen.length < 4 || !chosenCategories.has(action.category)) {
      chosen.push(action);
      chosenCategories.add(action.category);
      seenIds.add(action.id);
    }
  }

  if (chosen.length < SMART_ACTION_LIMIT) {
    const seed = textHash(`${combined}|${intents.join(',')}`);
    const leftovers = scored.filter((a) => !seenIds.has(a.id));
    for (let i = 0; i < leftovers.length && chosen.length < SMART_ACTION_LIMIT; i += 1) {
      const pickIndex = (seed + i * 7) % leftovers.length;
      const pick = leftovers[pickIndex];
      if (!pick || seenIds.has(pick.id)) continue;
      chosen.push(pick);
      seenIds.add(pick.id);
    }
  }

  return chosen.slice(0, SMART_ACTION_LIMIT).map((action) => ({
    id: action.id,
    label: action.label,
    description: action.description,
    icon: action.icon,
    kind: action.kind,
    route: action.route || null,
    topic: action.topic,
  }));
}

const CHAT_GREETINGS = [
  "Welcome back! How can I help you today?",
  "Ready to explore new topics together?",
  "Let's dive into learning something new",
  "Your personal AI tutor is here to help",
  "What would you like to learn today?",
  "Hello {name}! I'm excited to help you learn",
  "{name}, ready to unlock new knowledge?",
  "Welcome back, {name}! Let's continue your learning",
  "Hey {name}! What would you like to explore?",
  "{name}, let's make today a learning adventure",
  "Good day, {name}! Ready to expand your horizons?",
  "Hi {name}! Let's tackle your questions together",
  "Welcome, {name}! Your AI learning companion is here",
  "{name}, let's turn curiosity into understanding",
  "Hello {name}! What fascinating topic shall we discuss?",
];

const SYMBOL_MAP = {
  '*alpha*': 'α', '*Alpha*': 'Α',
  '*beta*': 'β', '*Beta*': 'Β',
  '*gamma*': 'γ', '*Gamma*': 'Γ',
  '*delta*': 'δ', '*Delta*': 'Δ',
  '*epsilon*': 'ε', '*Epsilon*': 'Ε',
  '*zeta*': 'ζ', '*Zeta*': 'Ζ',
  '*eta*': 'η', '*Eta*': 'Η',
  '*theta*': 'θ', '*Theta*': 'Θ',
  '*iota*': 'ι', '*Iota*': 'Ι',
  '*kappa*': 'κ', '*Kappa*': 'Κ',
  '*lambda*': 'λ', '*Lambda*': 'Λ',
  '*mu*': 'μ', '*Mu*': 'Μ',
  '*nu*': 'ν', '*Nu*': 'Ν',
  '*xi*': 'ξ', '*Xi*': 'Ξ',
  '*omicron*': 'ο', '*Omicron*': 'Ο',
  '*pi*': 'π', '*Pi*': 'Π',
  '*rho*': 'ρ', '*Rho*': 'Ρ',
  '*sigma*': 'σ', '*Sigma*': 'Σ',
  '*tau*': 'τ', '*Tau*': 'Τ',
  '*upsilon*': 'υ', '*Upsilon*': 'Υ',
  '*phi*': 'φ', '*Phi*': 'Φ',
  '*chi*': 'χ', '*Chi*': 'Χ',
  '*psi*': 'ψ', '*Psi*': 'Ψ',
  '*omega*': 'ω', '*Omega*': 'Ω',
  '*infinity*': '∞',
  '*sum*': '∑', '*Sum*': '∑', '*summation*': '∑', '*Summation*': '∑',
  '*product*': '∏', '*Product*': '∏',
  '*integral*': '∫', '*Integral*': '∫',
  '*partial*': '∂', '*nabla*': '∇', '*sqrt*': '√',
  '*approx*': '≈', '*neq*': '≠', '*leq*': '≤', '*geq*': '≥',
  '*times*': '×', '*divide*': '÷', '*plusminus*': '±', '*degree*': '°',
  '*therefore*': '∴', '*because*': '∵',
  '*forall*': '∀', '*exists*': '∃',
  '*in*': '∈', '*notin*': '∉',
  '*subset*': '⊂', '*supset*': '⊃',
  '*union*': '∪', '*intersection*': '∩',
  '*angle*': '∠', '*perpendicular*': '⊥', '*parallel*': '∥',
  '*arrow*': '→', '*leftarrow*': '←', '*rightarrow*': '→',
  '*uparrow*': '↑', '*downarrow*': '↓',
  '*mean*': 'x̄', '*variance*': 'σ²', '*stddev*': 'σ',
  '*correlation*': 'ρ', '*proportion*': 'p̂',
  '*emptyset*': '∅', '*element*': '∈', '*notelement*': '∉',
  '*contains*': '∋', '*notcontains*': '∌',
  '*and*': '∧', '*or*': '∨', '*not*': '¬',
  '*implies*': '⇒', '*iff*': '⇔', '*equivalent*': '≡',
  '*limit*': 'lim', '*derivative*': 'd/dx', '*del*': '∂',
  '*much_less*': '≪', '*much_greater*': '≫',
  '*less_equal*': '≤', '*greater_equal*': '≥', '*not_equal*': '≠',
  '*implies_arrow*': '⇒', '*iff_arrow*': '⇔',
  '*maps_to*': '↦', '*left_right_arrow*': '↔',
  '*half*': '½', '*third*': '⅓', '*quarter*': '¼',
  '*two_thirds*': '⅔', '*three_quarters*': '¾',
  '*squared*': '²', '*cubed*': '³',
  '*planck*': 'ℏ', '*angstrom*': 'Å', '*ohm*': 'Ω', '*micro*': 'μ',
  '*euro*': '€', '*pound*': '£', '*yen*': '¥', '*cent*': '¢',
  '*check*': '✓', '*cross*': '✗', '*star*': '★', '*bullet*': '•',
  '*ellipsis*': '…', '*dagger*': '†', '*double_dagger*': '‡',
  '*section*': '§', '*paragraph*': '¶',
  '*copyright*': '©', '*registered*': '®', '*trademark*': '™',
  '*circle*': '○', '*filled_circle*': '●', '*square*': '□',
  '*filled_square*': '■', '*triangle*': '△', '*filled_triangle*': '▲',
  '*equilibrium*': '⇌', '*reversible*': '⇄',
  '*real*': 'ℝ', '*complex*': 'ℂ', '*natural*': 'ℕ',
  '*integer*': 'ℤ', '*rational*': 'ℚ',
  '*expected*': 'E', '*probability*': 'P', '*given*': '|',
  '*cdot*': '·', '*ldots*': '…', '*cdots*': '⋯', '*vdots*': '⋮', '*ddots*': '⋱',
};

const AIChat = ({ sharedMode = false }) => {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedTheme } = useTheme();
  const [sharedChatData, setSharedChatData] = useState(null);
  const [isSharedContent, setIsSharedContent] = useState(sharedMode);
  
  const [userName, setUserName] = useState('');
  const [userProfile, setUserProfile] = useState(null);
  const [chatSessions, setChatSessions] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => (
    typeof window === 'undefined' ? true : window.innerWidth > 720
  ));
  const [greeting, setGreeting] = useState('');
  const [folders, setFolders] = useState([]);
  
  const [showFeedbackFor, setShowFeedbackFor] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [improvementSuggestion, setImprovementSuggestion] = useState('');
  
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [chatToDelete, setChatToDelete] = useState(null);
  const [showFolderDeleteConfirmation, setShowFolderDeleteConfirmation] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState(null);
  
  const [selectedFiles, setSelectedFiles] = useState([]);

  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [hsMode, setHsMode] = useState(() => localStorage.getItem('hs_mode_enabled') === 'true');
  const [tutorMode, setTutorMode] = useState(() => localStorage.getItem(TUTOR_MODE_KEY) === 'true');
  const [tutorReplyMode, setTutorReplyMode] = useState(() => {
    const savedMode = localStorage.getItem(TUTOR_REPLY_MODE_KEY);
    return TUTOR_REPLY_MODES.some((mode) => mode.id === savedMode) ? savedMode : 'guided';
  });
  const [userDocCount, setUserDocCount] = useState(0);
  const [contextSelectionRevision, setContextSelectionRevision] = useState(0);
  const [activeActionKey, setActiveActionKey] = useState(null);
  const [actionNotice, setActionNotice] = useState('');
  const actionNoticeTimerRef = useRef(null);
  const _newChatRef = useRef({ id: null, uid: null });

  const handleFolderCreation = async () => {
    if (!folderName.trim()) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/create_chat_folder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: userName,
          name: folderName.trim(),
          color: folderColor
        })
      });

      if (response.ok) {
        const newFolder = await response.json();
        setFolders(prev => [...prev, newFolder]);
        setShowFolderCreation(false);
        setShowFolderDialog(false);
        setFolderName('');
        setFolderColor('#D7B38C');
        loadChatFolders();
      }
    } catch (error) {
    // silenced
  }
  };

  const handleMoveToFolder = async (chatId, folderId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/move_chat_to_folder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          chat_id: chatId,
          folder_id: folderId
        })
      });

      if (response.ok) {
        setChatSessions(prev => prev.map(chat => (
          chat.id === chatId ? { ...chat, folder_id: folderId } : chat
        )));
        setShowMoveMenu(null);
        return true;
      }
      return false;
    } catch (error) {
      return false;
  }
  };

  const handleContextMenu = (e, chatId) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setShowMoveMenu(chatId);
  };

  const clearChatDragState = () => {
    setDraggedChatId(null);
    setDragOverFolderId(null);
  };

  const handleChatDragStart = (event, chatId) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-chat-session', String(chatId));
    event.dataTransfer.setData('text/plain', String(chatId));
    setDraggedChatId(chatId);
  };

  const handleChatDragEnd = () => {
    clearChatDragState();
  };

  const handleFolderDragOver = (event, folderId) => {
    if (!draggedChatId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dragOverFolderId !== folderId) {
      setDragOverFolderId(folderId);
    }
  };

  const handleFolderDragLeave = (event, folderId) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setDragOverFolderId(prev => (prev === folderId ? null : prev));
  };

  const handleFolderDrop = async (event, folderId) => {
    event.preventDefault();
    event.stopPropagation();

    const draggedIdFromEvent = Number(
      event.dataTransfer.getData('application/x-chat-session') ||
      event.dataTransfer.getData('text/plain')
    );
    const chatId = Number.isFinite(draggedIdFromEvent) && draggedIdFromEvent > 0
      ? draggedIdFromEvent
      : draggedChatId;

    if (!chatId) {
      clearChatDragState();
      return;
    }

    const draggedChat = chatSessions.find(session => session.id === chatId);
    if (draggedChat?.folder_id === folderId) {
      clearChatDragState();
      return;
    }

    await handleMoveToFolder(chatId, folderId);
    clearChatDragState();
  };
  const [fileProcessing, setFileProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [processedFiles, setProcessedFiles] = useState([]);
  
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const sidebarNavRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const isLoadingRef = useRef(false);
  const justSentMessageRef = useRef(false);
  const chatLoadRequestRef = useRef(0);
  const chatLoadAbortRef = useRef(null);
  const creatingChatRef = useRef(false);

  const [showFolderCreation, setShowFolderCreation] = useState(false);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderColor, setFolderColor] = useState('#D7B38C');
  const [showMoveMenu, setShowMoveMenu] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [draggedChatId, setDraggedChatId] = useState(null);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const greetings = CHAT_GREETINGS;

  const loadSharedChat = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/shared/chat/${chatId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSharedChatData(data);
        setIsSharedContent(true);
        
        
        setMessages((data.messages || []).map(normalizeLoadedMessage));
        
      } else {
        throw new Error('Failed to load shared chat');
      }
    } catch (error) {
            navigate('/social');
    }
  };

  const getRandomGreeting = (name) => {
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    return randomGreeting.replace(/{name}/g, name);
  };

  
  const scrollToLatestMessage = () => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      
      container.scrollTop = container.scrollHeight;
    }
  };

  
  const scrollToBottom = () => {
    scrollToLatestMessage();
  };

  
  useEffect(() => {
    
    const timer = setTimeout(() => {
      scrollToLatestMessage();
    }, 50);
    return () => clearTimeout(timer);
  }, [messages]);

  useEffect(() => {
    contextService.listDocuments()
      .then(d => setUserDocCount(d.user_docs?.length || 0))
      .catch(() => {});
  }, []);

  const handleHsModeToggle = (val) => {
    setHsMode(val);
    localStorage.setItem('hs_mode_enabled', String(val));
  };

  const handleTutorModeToggle = () => {
    setTutorMode(prev => {
      const next = !prev;
      localStorage.setItem(TUTOR_MODE_KEY, String(next));
      return next;
    });
  };

  const handleTutorReplyModeChange = (modeId) => {
    setTutorReplyMode(modeId);
    localStorage.setItem(TUTOR_REPLY_MODE_KEY, modeId);
  };

  
  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      
      
      setShowScrollToTop(scrollTop > 200);
      
      
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 30;
      setShowScrollToBottom(!isAtBottom && messages.length > 3);
    }
  };

  
  
  const scrollToTop = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: 0,
        left: 0,
        behavior: 'smooth'
      });
      
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = 0;
        }
      }, 500);
    }
  };

  const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const SUPPORTED_DOCX_TYPES = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const SUPPORTED_TEXT_TYPES = ['text/plain', 'text/markdown', 'text/x-markdown'];
  const SUPPORTED_TEXT_EXTENSIONS = ['.txt', '.md', '.markdown'];
  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

  const isImageFile = (file) => {
    const lowerName = (file?.name || '').toLowerCase();
    return SUPPORTED_IMAGE_TYPES.includes((file?.type || '').toLowerCase())
      || SUPPORTED_IMAGE_EXTENSIONS.some(ext => lowerName.endsWith(ext));
  };

  const attachPreviewUrl = (file) => {
    if (isImageFile(file)) {
      file._previewUrl = URL.createObjectURL(file);
    }
    return file;
  };

  const handleFileSelect = (rawFiles) => {
    const incoming = Array.from(rawFiles);
    const valid = [];
    for (const file of incoming) {
      const isImage = isImageFile(file);
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const lowerName = file.name.toLowerCase();
      const isDocx = SUPPORTED_DOCX_TYPES.includes(file.type) || lowerName.endsWith('.docx');
      const isText = SUPPORTED_TEXT_TYPES.includes(file.type) || SUPPORTED_TEXT_EXTENSIONS.some(ext => lowerName.endsWith(ext));
      if (!isImage && !isPdf && !isDocx && !isText) {
        alert(`"${file.name}" is not supported. Upload images, PDFs, DOCX, TXT, or Markdown files.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        alert(`"${file.name}" exceeds the 20 MB limit.`);
        continue;
      }
      valid.push(attachPreviewUrl(file));
    }
    if (valid.length > 0) setSelectedFiles(prev => [...prev, ...valid]);
  };

  const handleFileInputChange = (e) => {
    if (e.target.files) handleFileSelect(e.target.files);
    e.target.value = '';
  };

  const handlePaste = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(item => item.kind === 'file' && item.type.startsWith('image/'));
    if (imageItems.length === 0) return;
    e.preventDefault();
    const files = imageItems.map(item => item.getAsFile()).filter(Boolean);
    handleFileSelect(files);
  };

  const isFileDragEvent = (event) => {
    const types = Array.from(event.dataTransfer?.types || []);
    return types.includes('Files');
  };

  const handleDrop = (e) => {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files) handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    setDragActive(false);
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => {
      const next = [...prev];
      if (next[index]?._previewUrl) URL.revokeObjectURL(next[index]._previewUrl);
      next.splice(index, 1);
      return next;
    });
  };

  const clearAllFiles = () => {
    selectedFiles.forEach(f => { if (f._previewUrl) URL.revokeObjectURL(f._previewUrl); });
    setSelectedFiles([]);
    setProcessedFiles([]);
  };

  const renderSelectedFilePreview = () => {
    if (selectedFiles.length === 0) return null;

    return (
      <div className="ac-file-preview" aria-label="Files ready to send">
        {selectedFiles.map((file, index) => (
          isImageFile(file) && file._previewUrl ? (
            <div key={`${file.name}-${file.size}-${index}`} className="ac-img-thumb-wrap">
              <img src={file._previewUrl} alt={file.name} className="ac-img-thumb" />
              <button
                type="button"
                className="ac-img-thumb-remove"
                onClick={() => removeFile(index)}
                title={`Remove ${file.name}`}
                aria-label={`Remove ${file.name}`}
              >
                {Icons.x}
              </button>
            </div>
          ) : (
            <div key={`${file.name}-${file.size}-${index}`} className="ac-file-tag">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span>{file.name}</span>
              <button
                type="button"
                className="ac-file-remove"
                onClick={() => removeFile(index)}
                title={`Remove ${file.name}`}
                aria-label={`Remove ${file.name}`}
              >
                {Icons.x}
              </button>
            </div>
          )
        ))}
        {selectedFiles.length > 1 && (
          <button type="button" className="ac-file-clear-btn" onClick={clearAllFiles}>
            Clear all
          </button>
        )}
      </div>
    );
  };

  const loadChatFolders = async () => {
    if (!userName) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/get_chat_folders?user_id=${userName}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const foldersData = await response.json();
        setFolders(foldersData.folders || []);
      }
    } catch (error) {
    // silenced
  }
  };

  const loadChatSessions = async () => {
    if (!userName) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/get_chat_sessions?user_id=${encodeURIComponent(userName)}&limit=200`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const sessions = data.sessions || [];
        setChatSessions(sessions);
      }
    } catch (error) {
    // silenced
  }
  };

  const loadChatMessages = async (sessionId) => {
    if (!sessionId) {
      return;
    }

    if (chatLoadAbortRef.current) {
      chatLoadAbortRef.current.abort();
    }
    const controller = new AbortController();
    chatLoadAbortRef.current = controller;
    const requestId = chatLoadRequestRef.current + 1;
    chatLoadRequestRef.current = requestId;
    isLoadingRef.current = true;

    try {
      const token = localStorage.getItem('token');
      const url = `${API_URL}/get_chat_messages?chat_id=${sessionId}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });
      
      if (response.ok) {
        const messagesArray = await response.json();
        if (chatLoadRequestRef.current !== requestId) {
          return;
        }
        setMessages((Array.isArray(messagesArray) ? messagesArray : []).map(normalizeLoadedMessage));
        
        setTimeout(() => {
          scrollToLatestMessage();
        }, 100);
      } else {
        if (chatLoadRequestRef.current === requestId) {
          setMessages([]);
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      if (chatLoadRequestRef.current === requestId) {
        setMessages([]);
      }
    } finally {
      if (chatLoadRequestRef.current === requestId) {
        isLoadingRef.current = false;
      }
    }
  };

  const createNewChat = async () => {
    if (!userName) {
      console.error('❌ createNewChat: No userName');
      return null;
    }
    
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/create_chat_session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: userName,
          title: 'New Chat'
        })
      });

      if (response.ok) {
        const newChat = await response.json();

        const sessionData = {
          id: newChat.session_id || newChat.id,
          uid: newChat.uid || null,
          title: newChat.title,
          folder_id: newChat.folder_id || null,
          created_at: newChat.created_at,
          updated_at: newChat.updated_at || newChat.created_at
        };


        setChatSessions(prev => [sessionData, ...prev]);
        _newChatRef.current = { id: sessionData.id, uid: sessionData.uid };
        return sessionData.uid || sessionData.id;
      } else {
        console.error('❌ Failed to create chat, status:', response.status);
        return null;
      }
    } catch (error) {
      console.error('❌ Exception in createNewChat:', error);
      return null;
    }
  };

  const cleanupEmptyNewChats = async () => {
    
    
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      
      const potentialEmptyChats = chatSessions.filter(
        chat => chat.title === 'New Chat' && chat.id !== activeChatId
      );

      for (const chat of potentialEmptyChats) {
        try {
          const response = await fetch(`${API_URL}/get_chat_messages?chat_id=${chat.id}`, {
            method: 'GET',
            headers: { 
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            const msgs = await response.json();
            
            if (!msgs || msgs.length === 0) {
              const deleteResponse = await fetch(`${API_URL}/delete_chat_session/${chat.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              
              if (deleteResponse.ok) {
                setChatSessions(prev => prev.filter(c => c.id !== chat.id));
              }
            }
          }
        } catch (innerError) {
    // silenced
  }
      }
    } catch (error) {
    // silenced
  }
  };

  const handleNewChat = async () => {
    if (loading || creatingChatRef.current) return;
    creatingChatRef.current = true;

    try {
      if (sidebarNavRef.current) {
        sidebarNavRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
      scrollToTop();

      if (chatLoadAbortRef.current) {
        chatLoadAbortRef.current.abort();
        chatLoadAbortRef.current = null;
      }
      chatLoadRequestRef.current += 1;
      justSentMessageRef.current = false;
      isLoadingRef.current = false;

      setMessages([]);
      setInputMessage('');
      clearAllFiles();
      setSelectedFolder(null);
      setSearchQuery('');
      setShowSearchDialog(false);
      setActiveChatId(null);

      await createNewChat();
      const { id: newNumericId, uid: newChatUid } = _newChatRef.current;
      if (newNumericId) {
        chatLoadRequestRef.current += 1;
        setMessages([]);
        setActiveChatId(newNumericId);
        isLoadingRef.current = false;
        navigate(`/ai-chat/${newChatUid || newNumericId}`);
      }
    } finally {
      creatingChatRef.current = false;
    }
  };

  const selectChat = (chatSessionId, chatUid) => {
    if (chatLoadAbortRef.current) {
      chatLoadAbortRef.current.abort();
      chatLoadAbortRef.current = null;
    }
    chatLoadRequestRef.current += 1;
    setMessages([]);
    clearAllFiles();
    isLoadingRef.current = false;
    setActiveChatId(chatSessionId);
    loadChatMessages(chatSessionId);
    navigate(`/ai-chat/${chatUid || chatSessionId}`);
  };

  
  const sendMessage = async (overrideMessage = null) => {
    const useOverride = typeof overrideMessage === 'string';
    const draftMessage = useOverride ? overrideMessage : inputMessage;
    const sanitizedMessage = (draftMessage || '').trim();
    const hasFiles = !useOverride && selectedFiles.length > 0;
    if ((!sanitizedMessage && !hasFiles) || loading || !userName) return;

    let currentChatId;
    if (chatId) {
      const numericId = Number.parseInt(chatId, 10);
      if (Number.isFinite(numericId) && numericId > 0) {
        currentChatId = numericId;
      } else {
        const match = chatSessions.find(s => s.uid === chatId || String(s.id) === chatId);
        currentChatId = match?.id ?? activeChatId;
      }
    } else {
      currentChatId = activeChatId;
    }
    let isNewChat = false;
    
    
    
    const messageText = sanitizedMessage;
    const effectiveTutorMode = tutorMode || useOverride;
    const answeringComprehensionCheck = isAnsweringPreviousComprehensionCheck(messageText, messages);
    const answeringTutorStep = effectiveTutorMode && isAnsweringTutorStep(messageText, messages);
    const shouldUseGraphPrompt = !effectiveTutorMode && !answeringComprehensionCheck && !answeringTutorStep;
    const messageForModel = shouldUseGraphPrompt ? buildGraphAwarePrompt(messageText) : messageText;
    const messagedFiles = useOverride ? [] : [...selectedFiles];
    
    if (!useOverride) {
      setInputMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = '24px';
      }
    }
    
    if (!currentChatId) {
      await createNewChat();
      const { id: newId, uid: newUid } = _newChatRef.current;

      if (!newId) {
        console.error('❌ Failed to create new chat');
        alert('Error: Failed to create new chat. Please try again.');
        if (!useOverride) setInputMessage(messageText);
        return;
      }
      currentChatId = newId;
      isNewChat = true;

      const pendingContextIds = loadContextSelection(null);
      if (pendingContextIds.length > 0) {
        localStorage.setItem(
          chatContextSelectionKey(newUid || newId),
          JSON.stringify(pendingContextIds)
        );
        localStorage.removeItem(chatContextSelectionKey(null));
      }

      justSentMessageRef.current = true;

      setActiveChatId(newId);

      navigate(`/ai-chat/${newUid || newId}`, { replace: true });
    } else {
      
      justSentMessageRef.current = true;
    }

    const userMessage = {
      id: `user_${Date.now()}`,
      type: 'user',
      content: messageText || '',
      timestamp: new Date().toISOString(),
      files: messagedFiles.map(file => ({
        name: file.name,
        type: file.type,
        size: file.size,
        previewUrl: file._previewUrl || null,
        isImage: isImageFile(file),
      }))
    };

    
    setMessages(prev => [...prev, userMessage]);
    
    
    setLoading(true);

    try {
      let selectedContextDocIds = [];
      selectedContextDocIds = loadContextSelection(currentChatId);

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const formData = new FormData();
      formData.append('user_id', userName);
      formData.append('question', messageForModel || 'Please analyze the uploaded files.');
      formData.append('original_question', messageText || 'Please analyze the uploaded files.');
      formData.append('chat_id', currentChatId.toString());
      formData.append('use_hs_context', hsMode.toString());
      formData.append('tutor_mode', effectiveTutorMode.toString());
      formData.append('tutor_reply_style', tutorReplyMode);
      if (useOverride || answeringTutorStep) {
        formData.append('tutor_choice', messageText);
      }
      if (selectedContextDocIds.length > 0) {
        formData.append('context_doc_ids', selectedContextDocIds.join(','));
      }

      messagedFiles.forEach(file => {
        formData.append('files', file);
      });

      
      let data;
      if (USE_AI_JOB_QUEUE) {
        if (messagedFiles.length > 0) {
          data = await queueLegacyAIFileEndpoint('/api/ask_with_files/', {
            user_id: userName,
            question: messageForModel || 'Please analyze the uploaded files.',
            original_question: messageText || 'Please analyze the uploaded files.',
            chat_id: currentChatId.toString(),
            use_hs_context: hsMode.toString(),
            tutor_mode: effectiveTutorMode.toString(),
            tutor_reply_style: tutorReplyMode,
            ...((useOverride || answeringTutorStep) ? { tutor_choice: messageText } : {}),
            ...(selectedContextDocIds.length > 0 ? { context_doc_ids: selectedContextDocIds.join(',') } : {}),
          }, messagedFiles);
        } else {
          data = await queueChatCompletion({
            prompt: messageForModel || messageText || '',
            user_message: messageText || '',
            chat_session_id: currentChatId,
            use_hs_context: hsMode,
            context_doc_ids: selectedContextDocIds.join(',') || null,
            tutor_mode: effectiveTutorMode,
            tutor_reply_style: tutorReplyMode,
            tutor_choice: (useOverride || answeringTutorStep) ? messageText : null,
          });
        }
      } else {
        const endpoint = messagedFiles.length > 0 ?
          `${API_URL}/ask_with_files/` :
          `${API_URL}/ask_simple/`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });

        if (!response.ok) {
          await throwIfUsageLimitResponse(response);
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }

        data = await response.json();
      }
      
      
      if (data.attachment_error) {
        throw new Error(data.attachment_error);
      }

      if (!data.answer) {
        throw new Error('No answer received from AI');
      }
      
      
      const backendIntentClass = data.intent_class || null;
      const tutorContract = parseTutorResponseContract(data.answer || '');
      const aiAnswerContent = tutorContract?.answer || stripTutorOptionMarkers(data.answer);
      const recentActionIds = messages
        .filter((m) => m.type === 'ai')
        .slice(-2)
        .flatMap((m) => (Array.isArray(m.smartActions) ? m.smartActions.map((action) => action.id) : []));
      const responseTutorMode = data.tutor_mode || effectiveTutorMode;
      const chatActionContext = getChatActionContext([...messages, userMessage], currentChatId);
      const smartActions = responseTutorMode ? [] : pickSmartActions({
        userMessage: messageText,
        aiResponse: aiAnswerContent,
        recentActionIds,
        intentClass: backendIntentClass,
        contextSummary: chatActionContext.summary,
        contextLabel: chatActionContext.label,
      });

      const aiMessage = {
        id: `ai_${Date.now()}`,
        type: 'ai',
        content: aiAnswerContent,
        timestamp: new Date().toISOString(),
        topics: data.topics_discussed || [],
        misconceptionDetected: data.misconception_detected || false,
        filesProcessed: data.files_processed || 0,
        fileSummaries: data.file_summaries || [],
        hasFileContext: data.has_file_context || false,
        actionButtons: responseTutorMode ? [] : (data.action_buttons || []),
        contentFound: data.content_found || null,
        intentClass: backendIntentClass,
        activeRules: data.active_rules || [],
        ragUsed: data.rag_used || false,
        ragResultsCount: data.rag_results_count || 0,
        weakConcepts: data.weak_concepts || [],
        emotionalState: data.emotional_state || 'neutral',
        aiProvider: data.ai_provider || 'AI',
        smartActions,
        tutorMode: responseTutorMode,
        tutorReplyMode: data.tutor_reply_style || tutorReplyMode,
        tutorOptions: normalizeTutorOptions(data.tutor_options || tutorContract?.tutorOptions || []),
        tutorState: normalizeTutorState(data.tutor_state || tutorContract?.tutorState, data.tutor_reply_style || tutorReplyMode),
      };

      setMessages(prev => [...prev, aiMessage]);
      if (!useOverride) clearAllFiles();
      
      
      const actualChatId = data.chat_id;
      if (actualChatId && actualChatId !== currentChatId) {
        console.warn(`⚠️ Chat ID mismatch detected!`);
        console.warn(`   Expected: ${currentChatId}`);
        console.warn(`   Received: ${actualChatId}`);
        console.warn(`   Updating to use backend's chat_id`);
        setActiveChatId(actualChatId);
        const mismatchSession = chatSessions.find(s => s.id === actualChatId);
        navigate(`/ai-chat/${mismatchSession?.uid || actualChatId}`, { replace: true });
        currentChatId = actualChatId;
      } else {
      }
      
      
      if (isNewChat || messageText.trim()) {
        const currentChat = chatSessions.find(chat => chat.id === currentChatId);
        if (!currentChat || currentChat.title === 'New Chat') {
          await autoRenameChat(currentChatId, messageText);
        }
      }
      
      
      await loadChatSessions();
      
      

    } catch (error) {
      console.error('Error in sendMessage:', error);
      const usageLimit = getUsageLimitFromError(error);
      const errorText = error?.message || 'The request could not be completed.';
      const isAttachmentError = /(?:received|process|analy[sz]e).*(?:image|attachment)|(?:image|attachment).*(?:received|process|analy[sz]e)/i.test(errorText);
      const errorMessage = {
        id: `error_${Date.now()}`,
        type: 'ai',
        content: usageLimit
          ? formatUsageLimitMessage(usageLimit)
          : isAttachmentError
          ? errorText
          : `Sorry, I encountered an error: ${errorText}. Please try again.`,
        timestamp: new Date().toISOString(),
        usageLimit: Boolean(usageLimit),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleTutorOptionClick = (option) => {
    if (loading || !option) return;
    const optionText = option.value || `${option.label || ''}. ${option.text || ''}`.trim();
    if (!optionText) return;
    sendMessage(optionText);
  };

  const showSmartActionNotice = useCallback((message) => {
    setActionNotice(message);
    if (actionNoticeTimerRef.current) {
      clearTimeout(actionNoticeTimerRef.current);
    }
    actionNoticeTimerRef.current = setTimeout(() => {
      setActionNotice('');
    }, 2800);
  }, []);

  const activateChatDock = useCallback((chatSessionId = null) => {
    let routeChatId = 0;
    if (chatId) {
      const numId = Number(chatId);
      if (Number.isFinite(numId) && numId > 0) {
        routeChatId = numId;
      } else {
        const match = chatSessions.find(s => s.uid === chatId);
        routeChatId = match?.id ?? 0;
      }
    }
    const resolvedChatId = Number(chatSessionId || activeChatId || routeChatId || 0);
    if (!resolvedChatId) return;
    enableChatDock({
      chatId: resolvedChatId,
      title: 'Continue Chat',
    });
  }, [activeChatId, chatId, chatSessions]);

  const getChatActionContext = useCallback((messagesForContext = messages, chatSessionId = activeChatId) => {
    const currentSession = chatSessions.find((session) => Number(session.id) === Number(chatSessionId));
    const sessionTitle = normalizeTopic(currentSession?.title || '');
    const recentEntries = [...(messagesForContext || [])]
      .filter((entry) => entry?.content && (entry.type === 'user' || entry.type === 'ai'))
      .slice(-8)
      .map((entry) => {
        const role = entry.type === 'user' ? 'Student' : 'Tutor';
        const content = stripInternalGraphGuidance(entry.content || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, entry.type === 'user' ? 220 : 280);
        return content ? `${role}: ${content}` : '';
      })
      .filter(Boolean);
    const summary = [
      sessionTitle && sessionTitle !== 'New Chat' ? `Chat title: ${sessionTitle}` : '',
      ...recentEntries,
    ].filter(Boolean).join('\n').slice(0, 1100);
    const labelSeed = recentEntries.find((entry) => entry.startsWith('Student:')) || summary;
    const inferred = inferTopicFromText(labelSeed.replace(/^Student:\s*/i, ''), '');
    return {
      summary,
      label: normalizeTopic(inferred === 'this topic' ? sessionTitle : inferred).slice(0, 80),
    };
  }, [activeChatId, chatSessions, messages]);

  const getSmartActionsForMessage = useCallback((message, messageIndex) => {
    if (message.type !== 'ai') return [];
    if (message.tutorMode || message.tutorState || (Array.isArray(message.tutorOptions) && message.tutorOptions.length > 0)) {
      return [];
    }

    if (Array.isArray(message.smartActions) && message.smartActions.length) {
      return message.smartActions;
    }

    const previousMessages = messages.slice(0, messageIndex);
    const previousUserMessage = [...previousMessages].reverse().find((entry) => entry.type === 'user');
    const previousUserIntents = detectIntents(previousUserMessage?.content || '');
    const previousUserHasSpecificIntent = previousUserIntents.some((intent) => intent !== 'general');

    // Backend told us the intent — use it as primary gate unless the visible user
    // message clearly has an educational intent.
    if (message.intentClass && !EDUCATIONAL_INTENT_CLASSES.has(message.intentClass) && !previousUserHasSpecificIntent) {
      return [];
    }

    const recentActionIds = previousMessages
      .filter((entry) => entry.type === 'ai')
      .slice(-2)
      .flatMap((entry) => (Array.isArray(entry.smartActions) ? entry.smartActions.map((action) => action.id) : []));

    const chatActionContext = getChatActionContext(previousMessages, activeChatId);
    return pickSmartActions({
      userMessage: previousUserMessage?.content || '',
      aiResponse: message.content || '',
      recentActionIds,
      intentClass: message.intentClass,
      contextSummary: chatActionContext.summary,
      contextLabel: chatActionContext.label,
    });
  }, [activeChatId, getChatActionContext, messages]);

  const getTutorActionsForMessage = useCallback((message) => {
    const tutorState = normalizeTutorState(message?.tutorState, message?.tutorReplyMode);
    if (!message || message.type !== 'ai' || !tutorState) return [];

    const weaknessTopic = [
      ...tutorState.autoWeaknessTopics,
      ...tutorState.misconceptions,
      ...tutorState.skillsUsed,
      tutorState.objective,
    ].map((item) => normalizeTopic(String(item || ''))).find(Boolean);
    const chatActionContext = getChatActionContext();
    const topic = weaknessTopic || chatActionContext.label || 'this context';
    const shouldPracticeWeakness = ['partly_correct', 'not_yet'].includes(tutorState.verdict)
      || tutorState.misconceptions.length > 0
      || tutorState.autoWeaknessTopics.length > 0;

    return TUTOR_SMART_ACTIONS
      .filter((action) => action.kind !== 'practice_weakness' || shouldPracticeWeakness)
      .map((action) => ({ ...action, topic, contextSummary: chatActionContext.summary }));
  }, [getChatActionContext]);

  const runSmartAction = useCallback(async (action, aiMessage) => {
    if (!action || !aiMessage) return;

    const actionKey = `${aiMessage.id}:${action.id}`;
    setActiveActionKey(actionKey);

    const token = localStorage.getItem('token');
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
    const chatActionContext = getChatActionContext();
    const actionContext = String(action.contextSummary || chatActionContext.summary || aiMessage?.content || '').trim();
    const topic = normalizeTopic(action.topic || chatActionContext.label || inferTopicFromText(actionContext, '')) || 'this context';
    const contextPrompt = actionContext || topic;

    try {
      const createAndOpenRoadmap = async (baseTopic, noticeText) => {
        let rootTopic = baseTopic;
        if (activeChatId) {
          try {
            const extractResponse = await queuedAIJsonFetch('/create_roadmap_from_chat', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                user_id: userName,
                chat_session_id: activeChatId,
              }),
            });
            if (extractResponse.ok) {
              const extracted = await extractResponse.json();
              if (extracted?.root_topic) {
                rootTopic = extracted.root_topic;
              }
            }
          } catch {
            // fallback to inferred topic
          }
        }

        const roadmapResponse = await queuedAIJsonFetch('/create_knowledge_roadmap', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            user_id: userName,
            root_topic: rootTopic,
          }),
        });
        if (!roadmapResponse.ok) {
          throw new Error('Failed to create knowledge map');
        }
        const roadmapData = await roadmapResponse.json();
        if (roadmapData?.roadmap_id) {
          activateChatDock(activeChatId);
          navigate(`/knowledge-map/${roadmapData.roadmap_id}`);
        } else {
          activateChatDock(activeChatId);
          navigate('/knowledge-map');
        }
        showSmartActionNotice(noticeText);
      };

      if (action.kind === 'deepen_topic') {
        await createAndOpenRoadmap(topic, 'Deep knowledge map created for this topic.');
        return;
      }

      if (action.kind === 'open_route') {
        if (action.route) {
          activateChatDock(activeChatId);
          navigate(action.route);
          showSmartActionNotice(`Opening ${action.label}...`);
        }
        return;
      }

      if (action.kind === 'practice_weakness') {
        activateChatDock(activeChatId);
        navigate('/weakness-practice', {
          state: {
            topic,
            contextSummary: contextPrompt,
            difficulty: 'intermediate',
            source: 'ai_tutor',
          },
        });
        showSmartActionNotice('Opening targeted weakness practice...');
        return;
      }

      if (action.kind === 'quiz_on_topic') {
        activateChatDock(activeChatId);
        navigate('/solo-quiz', {
          state: {
            autoStart: true,
            topics: [topic],
            contextSummary: contextPrompt,
            difficulty: 'medium',
            questionCount: 10,
          },
        });
        showSmartActionNotice('Preparing a quiz for this topic...');
        return;
      }

      if (action.kind === 'create_note') {
        const noteResponse = await fetch(`${API_URL}/create_note`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            user_id: userName,
            title: `${topic.slice(0, 45)} Notes`,
            content: `# ${topic}\n\n## Chat Context\n${contextPrompt}\n\n## Tutor Response\n${aiMessage.content || ''}`.trim(),
          }),
        });
        if (!noteResponse.ok) {
          throw new Error('Failed to create note');
        }
        const noteData = await noteResponse.json();
        if (noteData?.id) {
          activateChatDock(activeChatId);
          navigate(`/notes/editor/${noteData.id}`);
        } else {
          activateChatDock(activeChatId);
          navigate('/notes/my-notes');
        }
        showSmartActionNotice('Note created from this response.');
        return;
      }

      if (action.kind === 'create_flashcards') {
        const flashcardResponse = await queuedAIJsonFetch('/agents/searchhub', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            user_id: userName,
            query: `create flashcards from this chat context: ${contextPrompt}`,
            session_id: `chat_${Date.now()}`,
          }),
        });
        if (!flashcardResponse.ok) {
          throw new Error('Failed to create flashcards');
        }
        const flashcardData = await flashcardResponse.json();
        const safePath = safeInternalPath(flashcardData.navigate_to);
        activateChatDock(activeChatId);
        if (safePath) {
          navigate(safePath);
        } else if (flashcardData.content_id) {
          navigate(`/flashcards?set_id=${encodeURIComponent(flashcardData.content_id)}`);
        } else {
          navigate('/flashcards');
        }
        showSmartActionNotice('Flashcards created from this tutor step.');
        return;
      }

      if (action.kind === 'create_learning_path') {
        const pathResponse = await queuedAIJsonFetch('/learning-paths/generate', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            topicPrompt: contextPrompt,
            difficulty: 'intermediate',
            length: 'medium',
            goals: [`Understand this chat context`, `Practice the current explanation level`],
          }),
        });
        if (!pathResponse.ok) {
          throw new Error('Failed to create learning path');
        }
        const pathData = await pathResponse.json();
        if (pathData?.path_id) {
          activateChatDock(activeChatId);
          navigate(`/learning-paths/${pathData.path_id}`);
        } else {
          activateChatDock(activeChatId);
          navigate('/learning-paths');
        }
        showSmartActionNotice('Learning path generated.');
        return;
      }

      if (action.kind === 'create_roadmap') {
        await createAndOpenRoadmap(topic, 'Knowledge map created.');
      }
    } catch (error) {
      console.error('Smart action failed:', error);
      showSmartActionNotice(`Couldn't complete "${action.label}". Please try again.`);
    } finally {
      setActiveActionKey(null);
    }
  }, [API_URL, activateChatDock, activeChatId, getChatActionContext, navigate, showSmartActionNotice, userName]);

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

  const renderSmartActionIcon = (icon) => {
    switch (icon) {
      case 'note':
        return <FileText size={15} strokeWidth={2} />;
      case 'quiz':
        return <HelpCircle size={15} strokeWidth={2} />;
      case 'depth':
        return <Layers size={15} strokeWidth={2} />;
      case 'path':
        return <Route size={15} strokeWidth={2} />;
      case 'roadmap':
        return <Map size={15} strokeWidth={2} />;
      case 'flashcard':
        return <BookOpen size={15} strokeWidth={2} />;
      case 'search':
        return <Search size={15} strokeWidth={2} />;
      case 'social':
        return <Users size={15} strokeWidth={2} />;
      case 'analytics':
        return <BarChart3 size={15} strokeWidth={2} />;
      case 'media':
        return <Clapperboard size={15} strokeWidth={2} />;
      case 'insights':
        return <Brain size={15} strokeWidth={2} />;
      case 'practice':
        return <Target size={15} strokeWidth={2} />;
      case 'vault':
        return <Library size={15} strokeWidth={2} />;
      case 'canvas':
        return <Network size={15} strokeWidth={2} />;
      case 'playlist':
        return <Layers size={15} strokeWidth={2} />;
      case 'games':
        return <Gamepad2 size={15} strokeWidth={2} />;
      case 'review':
        return <MessageCircle size={15} strokeWidth={2} />;
      case 'xp':
        return <Trophy size={15} strokeWidth={2} />;
      case 'concept':
        return <Network size={15} strokeWidth={2} />;
      case 'bank':
        return <FileQuestion size={15} strokeWidth={2} />;
      case 'slides':
        return <Clapperboard size={15} strokeWidth={2} />;
      case 'weakness':
        return <Target size={15} strokeWidth={2} />;
      default:
        return <Sparkles size={15} strokeWidth={2} />;
    }
  };

  const handleDeleteChat = (chatSessionId, chatTitle) => {
    setChatToDelete({ id: chatSessionId, title: chatTitle });
    setShowDeleteConfirmation(true);
  };

  const handleDeleteFolder = (folderId, folderName) => {
    setFolderToDelete({ id: folderId, name: folderName });
    setShowFolderDeleteConfirmation(true);
  };

  const autoRenameChat = async (chatId, userMessage) => {
    try {
      const token = localStorage.getItem('token');

      const response = await queuedAIJsonFetch('/generate_chat_title', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          chat_id: chatId,
          user_id: userName
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.title && result.title !== 'New Chat') {
          setChatSessions(prev => prev.map(chat =>
            chat.id === chatId
              ? { ...chat, title: result.title, updated_at: new Date().toISOString() }
              : chat
          ));
          return result.title;
        }
      }
    } catch (error) {
    // silenced
  }
    return null;
  };

  const confirmDeleteChat = async () => {
    if (!chatToDelete) return;

    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        alert('Authentication required. Please log in again.');
        return;
      }
      
      const response = await fetch(`${API_URL}/delete_chat_session/${chatToDelete.id}`, {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        alert('Session expired. Please log in again.');
        localStorage.removeItem('token');
        navigate('/login');
        return;
      }

      if (response.ok) {
        localStorage.removeItem(chatContextSelectionKey(chatToDelete.id));
        
        const wasActivChat = activeChatId === chatToDelete.id;
        setChatSessions(prev => prev.filter(chat => chat.id !== chatToDelete.id));
        
        
        setShowDeleteConfirmation(false);
        setChatToDelete(null);
        
        
        if (wasActivChat) {
          const remainingChats = chatSessions.filter(chat => chat.id !== chatToDelete.id);
          if (remainingChats.length > 0) {
            isLoadingRef.current = false;
            navigate(`/ai-chat/${remainingChats[0].id}`);
          } else {
            isLoadingRef.current = false;
            navigate('/ai-chat');
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to delete chat:', errorData);
        alert(`Failed to delete conversation: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
      alert('Error deleting conversation. Please check your connection and try again.');
    }
  };

  const confirmDeleteFolder = async () => {
    if (!folderToDelete) return;

    try {
      const token = localStorage.getItem('token');

      if (!token) {
        alert('Authentication required. Please log in again.');
        return;
      }

      const response = await fetch(`${API_URL}/delete_chat_folder/${folderToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        alert('Session expired. Please log in again.');
        localStorage.removeItem('token');
        navigate('/login');
        return;
      }

      if (response.ok) {
        const deletedFolderId = folderToDelete.id;
        setFolders(prev => prev.filter(folder => folder.id !== deletedFolderId));
        setChatSessions(prev => prev.map(chat => (
          chat.folder_id === deletedFolderId ? { ...chat, folder_id: null } : chat
        )));

        if (selectedFolder === deletedFolderId) {
          setSelectedFolder(null);
        }

        setShowFolderDeleteConfirmation(false);
        setFolderToDelete(null);
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(`Failed to delete folder: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      alert('Error deleting folder. Please check your connection and try again.');
    }
  };

  const rateResponse = async (messageId, rating) => {
    try {
      const token = localStorage.getItem('token');
      const message = messages.find(m => m.id === messageId);
      
      const formData = new FormData();
      formData.append('user_id', userName);
      formData.append('rating', rating.toString());
      formData.append('message_content', message?.content || '');

      const response = await fetch(`${API_URL}/submit_advanced_feedback`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (response.ok) {
        setMessages(prev => prev.map(msg => 
          msg.id === messageId ? { ...msg, userRating: rating } : msg
        ));
        
        if (rating <= 3) {
          setShowFeedbackFor(messageId);
        }
      }
    } catch (error) {
    // silenced
  }
  };

  const submitFeedback = async (messageId) => {
    if (!feedbackText.trim() && !improvementSuggestion.trim()) return;

    try {
      const token = localStorage.getItem('token');
      const message = messages.find(m => m.id === messageId);
      
      const formData = new FormData();
      formData.append('user_id', userName);
      formData.append('rating', message?.userRating || 1);
      formData.append('feedback_text', feedbackText);
      formData.append('improvement_suggestion', improvementSuggestion);
      formData.append('message_content', message?.content || '');

      const response = await fetch(`${API_URL}/submit_advanced_feedback`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (response.ok) {
        setShowFeedbackFor(null);
        setFeedbackText('');
        setImprovementSuggestion('');
        
        setMessages(prev => prev.map(msg => 
          msg.id === messageId ? { 
            ...msg, 
            feedbackSubmitted: true,
            neuralNetworkUpdated: true 
          } : msg
        ));
      }
    } catch (error) {
    // silenced
  }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInputChange = (e) => {
    setInputMessage(e.target.value);
    
    
    if (textareaRef.current) {
      
      textareaRef.current.style.height = '24px';
      
      
      const scrollHeight = textareaRef.current.scrollHeight;
      
      
      const maxHeight = 300;
      
      
      const newHeight = Math.min(scrollHeight, maxHeight);
      textareaRef.current.style.height = newHeight + 'px';
      
      
      if (scrollHeight > maxHeight) {
        textareaRef.current.style.overflowY = 'auto';
      } else {
        textareaRef.current.style.overflowY = 'hidden';
      }
    }
  };

  const handleLogout = async () => {
    await cleanupEmptyNewChats();
    await signOutAppSession();
    navigate('/');
  };

  const goToDashboard = async () => {
    await cleanupEmptyNewChats();
    navigate('/dashboard-cerbyl');
  };

  const handleLogoClick = () => {
    navigate('/dashboard-cerbyl');
  };

  const copyToClipboard = (text, codeIndex) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCode(codeIndex);
      setTimeout(() => setCopiedCode(null), 2000);
    }).catch(err => {
          });
  };

  const handleCopyChatShareLink = async () => {
    if (!activeChatId) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/chat/${activeChatId}/share-link`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) return;
      const data = await response.json();
      const url = `${window.location.origin}/chat/share/${data.public_token}`;
      await navigator.clipboard.writeText(url);
      setShareLinkCopied(true);
      setTimeout(() => setShareLinkCopied(false), 2000);
    } catch (error) {
      // silenced
    }
  };

  const convertSymbolsToUnicode = (text) => {
    let result = text;
    for (const [symbol, unicode] of Object.entries(SYMBOL_MAP)) {
      try {
        const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escaped, 'gi'), unicode);
      } catch {
        result = result.split(symbol).join(unicode);
      }
    }
    return result;
  };

  const normalizeTutorStepMarkdown = (text = '') => {
    const raw = String(text || '').trim();
    if (!/\bStep\s+\d+\s*[—–-]/i.test(raw)) return raw;

    const withoutExistingBullets = raw
      .replace(/^\s*[-*]\s+(?=(?:\*\*)?Step\s+\d+\s*[—–-])/gim, '')
      .replace(/\n{3,}/g, '\n\n');
    const stepPattern = /(?:\*\*)?Step\s+\d+\s*[—–-][\s\S]*?(?=\s+(?:\*\*)?Step\s+\d+\s*[—–-]|$)/gi;
    const matches = withoutExistingBullets.match(stepPattern);
    if (!matches || matches.length < 2) return withoutExistingBullets;

    return matches
      .map((step) => `- ${step.trim().replace(/\*\*/g, '')}`)
      .join('\n');
  };

  const normalizeMarkdownForRenderer = (text = '') => {
    const splitInlineHeadingBodies = (src) => {
      const bodyStartRe = /(?:[A-Z][a-z][\w'-]*\s+[a-z][\w'-]*\s+(?:is|are|was|were|can|will|would|does|involves|refers|means|works|learns?|helps|uses|allows|includes|contains|provides|appears|starts|begins|processes|generates)|To\s+[a-z]|This\s+[a-z]|These\s+[a-z]|There\s+(?:is|are)|Let's\s+[a-z]|We\s+[a-z]|You\s+[a-z])/;

      return src.replace(/^(#{1,6}\s+)([^\n]+)$/gm, (full, marker, rest) => {
        const match = rest.match(new RegExp(`^(.{3,120}?)\\s+(${bodyStartRe.source}.*)$`));
        if (!match) return full;

        const title = match[1].trim();
        const body = match[2].trim();
        const titleWords = title.split(/\s+/).filter(Boolean);
        const allowsShortTitle = /^(answer|applications?|examples?|explanation|overview|summary)$/i.test(title);
        if ((titleWords.length < 2 && !allowsShortTitle) || /[.!?]$/.test(title)) {
          return full;
        }

        return `${marker}${title}\n\n${body}`;
      });
    };

    let normalized = String(text || '')
      // Some OpenAI-compatible providers escape markdown punctuation in plain text.
      // Restore only markdown control characters; leave LaTeX delimiters like \( and \[ intact.
      .replace(/\\([*`>#.!+\-])/g, '$1')
      .replace(/\\#/g, '#')
      .replace(/(?:&num;|&#35;|&#x23;)/gi, '#')
      .replace(/\r\n/g, '\n')
      .replace(/([^\n])\s+(#{1,6}\s+)/g, '$1\n\n$2');

    const sectionHeadings = [
      'Analysis of the Uploaded Files',
      'Analysis of Uploaded Files',
      'Breakdown of the Information',
      'Breakdown of Information',
      'Key Concepts',
      'Core Concepts',
      'Main Concepts',
      'Key Observations',
      'Comprehension Check',
      'Introduction to Neural Networks',
      'Basic Components',
      'How Neural Networks Learn',
      'Importance of Avoiding Overfitting and Underfitting',
      'Summary',
      'Key Points',
      'Overview',
      'Explanation',
      'Answer',
    ];

    const headingPattern = sectionHeadings
      .map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const headingRe = new RegExp(`(^|\\s)(#{1,6}\\s+(?:${headingPattern})\\b)\\s*`, 'gim');

    normalized = normalized
      .replace(headingRe, (_, prefix, heading) => `${prefix && prefix.trim() ? '\n\n' : ''}${heading}\n\n`)
      .replace(/(^|\n)(#{1,6}\s+Introduction to\s+[A-Z][\w/-]*(?:\s+(?:and|or|of|the|to|in|for|with|[A-Z][\w/-]*)){0,8})\s+(?=[A-Z][a-z][\w'-]*\s+[a-z][\w'-]*\s+(?:is|are|can|will|would|involves|refers|means|works|learns?|helps|uses|allows|includes|contains|provides|appears|starts|begins|processes))/gm, '$1$2\n\n')
      .replace(/(^|\n)(#{1,6}\s+How\s+[A-Z][\w/-]*(?:\s+(?:and|or|of|the|to|in|for|with|[A-Z][\w/-]*)){0,8})\s+(?=[A-Z][a-z][\w'-]*\s+[a-z][\w'-]*\s+(?:is|are|can|will|would|involves|refers|means|works|learns?|helps|uses|allows|includes|contains|provides|appears|starts|begins|processes))/gm, '$1$2\n\n')
      .replace(/(^|\n)(#{1,6}\s+(?:What|Why|When|Where)\s+[A-Z][\w/-]*(?:\s+(?:and|or|of|the|to|in|for|with|[A-Z][\w/-]*)){0,8})\s+(?=[A-Z][a-z][\w'-]*\s+[a-z][\w'-]*\s+(?:is|are|can|will|would|involves|refers|means|works|learns?|helps|uses|allows|includes|contains|provides|appears|starts|begins|processes))/gm, '$1$2\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/([^\n])\s+[*+-]\s+(?=(?:\*\*)?[A-Z0-9])/g, '$1\n- ')
      .replace(/(:\*\*)\s+-\s+/g, '$1\n  - ')
      .replace(/(\*\*)\s+(\d+\.\s+\*\*)/g, '$1\n\n$2')
      .replace(/([.:])\s+(\d+\.\s+\*\*)/g, '$1\n\n$2')
      .replace(/([^\n])\s+(\d+\.\s+(?=(?:\*\*)?[A-Z0-9]))/g, '$1\n$2')
      .replace(/([^\n])\s+(\d+\.\s+\*\*[^*]+:\*\*)/g, '$1\n\n$2')
      .replace(/\s+([*-]\s+\*\*[^*]+:\*\*)/g, '\n$1');

    normalized = splitInlineHeadingBodies(normalized)
      .replace(/([^\n])\n(#{1,6}\s+)/g, '$1\n\n$2')
      .replace(/^(#{1,6}[^\n]+)\n(?=[^\n])/gm, '$1\n\n')
      .replace(/([^\n])\n(-\s+(?:\*\*)?[A-Z0-9])/g, '$1\n\n$2')
      .replace(/([^\n])\n(\d+\.\s+(?:\*\*)?[A-Z0-9])/g, '$1\n\n$2');

    return normalized.replace(/\n{3,}/g, '\n\n');
  };

  const renderMarkdown = (text) => {
    if (!text) return '';
    const tutorContract = parseTutorResponseContract(text);
    if (tutorContract?.answer) {
      text = tutorContract.answer;
    }
    text = normalizeTutorStepMarkdown(text);
    text = normalizeMarkdownForRenderer(text);

    // ── Step 1: Extract ALL math blocks BEFORE markdown touches them ──────────
    // Markdown mangles \[, \(, and $$  by treating \ as an escape character
    // and $ as potential formatting. We replace every math span with a safe
    // alphanumeric placeholder, let marked run, then put the math back.
    const mathStore = [];
    const placeholder = (i) => `ZMATH${i}Z`;

    const extractMath = (src) => {
      // Display: $$...$$ (may be multiline)
      src = src.replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => {
        mathStore.push({ tex: m.trim(), display: true });
        return placeholder(mathStore.length - 1);
      });
      // Display: \[...\] (may be multiline)
      src = src.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => {
        mathStore.push({ tex: m.trim(), display: true });
        return placeholder(mathStore.length - 1);
      });
      // Inline: $...$  (single-line only)
      src = src.replace(/\$([^\n$]{1,300}?)\$/g, (_, m) => {
        mathStore.push({ tex: m.trim(), display: false });
        return placeholder(mathStore.length - 1);
      });
      // Inline: \(...\)
      src = src.replace(/\\\(([^\n]{1,300}?)\\\)/g, (_, m) => {
        mathStore.push({ tex: m.trim(), display: false });
        return placeholder(mathStore.length - 1);
      });
      return src;
    };

    // After markdown, swap placeholders back to KaTeX-ready delimiters
    const restoreMath = (html) => {
      return html.replace(/ZMATH(\d+)Z/g, (_, i) => {
        const { tex, display } = mathStore[parseInt(i, 10)];
        if (display) {
          // Wrap in a div so KaTeX renders as display block
          return `<div class="math-display-wrap">$$${tex}$$</div>`;
        }
        return `$${tex}$`;
      });
    };

    text = extractMath(text);

    // ── Step 2: Parse markdown (math is safely placeholdered) ─────────────────
    const renderer = new marked.Renderer();
    renderer.heading = ({ text: t, depth }) =>
      `<h${depth} class="md-h${depth}">${t}</h${depth}>`;
    renderer.strong = ({ text: t }) =>
      `<strong class="md-bold-inline">${t}</strong>`;
    renderer.codespan = ({ text: t }) =>
      `<code class="md-inline-code">${t}</code>`;
    const renderListItem = function renderListItem(token) {
      const t = this.parser.parseInline(token.tokens || []);
      const stepMatch = String(t || '').match(/^(?:<p>)?\s*(?:<strong[^>]*>)?\s*(Step\s+\d+\s*[—–-]\s*[^:<]+:?)(?:<\/strong>)?\s*([\s\S]*?)(?:<\/p>)?$/i);
      if (stepMatch) {
        return `<li class="ac-tutor-step-item"><span class="ac-tutor-step-title">${stepMatch[1].trim()}</span>${stepMatch[2] ? ` <span class="ac-tutor-step-body">${stepMatch[2].trim()}</span>` : ''}</li>`;
      }
      return `<li>${t}</li>`;
    };
    renderer.list = function list(token) {
      const body = (token.items || []).map((item) => renderListItem.call(this, item)).join('');
      const isTutorStepList = /class="ac-tutor-step-item"/.test(body);
      const tag = token.ordered ? 'ol' : 'ul';
      const className = isTutorStepList ? 'ac-tutor-step-list' : (token.ordered ? 'md-ol' : 'md-ul');
      return `<${tag} class="${className}">${body}</${tag}>`;
    };
    renderer.listitem = renderListItem;

    try {
      text = marked.parse(text, { renderer, breaks: true, gfm: true });
    } catch {
      try {
        text = marked.parse(text, { breaks: true, gfm: true });
      } catch {
        text = `<p>${escapeHtml(text).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br />')}</p>`;
      }
    }

    // ── Step 3: Restore math delimiters ──────────────────────────────────────
    text = restoreMath(text);

    // ── Step 4: Highlight ALL-CAPS keywords (skip inside math wrappers) ───────
    text = text.replace(/>([^<]+)</g, (full, inner) => {
      // Don't touch content inside math wrappers
      if (/\$/.test(inner)) return full;
      return '>' + inner.replace(/\b([A-Z]{3,})\b/g, '<span class="kw-highlight">$1</span>') + '<';
    });

    return text;
  };

  const stripThinking = (text) => {
    if (!text) return text;
    
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    
    text = text.replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, '').trim();
    return text;
  };

  const renderMessageContent = (content) => {
    if (!content) return null;

    content = stripThinking(content);

    const codeBlockRegex = /```([^\n`]*)?\n?([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: content.substring(lastIndex, match.index)
        });
      }

      parts.push({
        type: 'code',
        language: (match[1] || 'plaintext').trim().toLowerCase(),
        content: match[2].trim()
      });

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push({
        type: 'text',
        content: content.substring(lastIndex)
      });
    }

    if (parts.length === 0) {
      parts.push({
        type: 'text',
        content: content
      });
    }

    return parts.map((part, index) => {
      if (part.type === 'text') {
        const htmlContent = renderMarkdown(part.content);
        const finalContent = htmlContent && htmlContent.trim() ? htmlContent : `<p>${part.content}</p>`;
        return <MathRenderer key={index} content={finalContent} />;
      }

      const graphLanguage = detectGraphLanguage(part.language, part.content);
      if (graphLanguage) {
        return (
          <GraphRenderer
            key={index}
            language={graphLanguage}
            content={part.content}
          />
        );
      }

      return (
        <div key={index} className="code-block-container" data-language={part.language}>
          <div className="code-block-header">
            <span className="code-language">{part.language.toUpperCase()}</span>
            <button
              className={`code-copy-btn ${copiedCode === index ? 'copied' : ''}`}
              onClick={() => copyToClipboard(part.content, index)}
              title="Copy code"
            >
              {copiedCode === index ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  COPIED
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  COPY
                </>
              )}
            </button>
          </div>
          <pre className="code-block">
            <code className={`language-${part.language}`}>{part.content}</code>
          </pre>
        </div>
      );
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileName, fileType) => {
    if (fileType && fileType.startsWith('image/')) {
      return 'IMG';
    } else if (fileType === 'application/pdf' || (fileName && fileName.toLowerCase().endsWith('.pdf'))) {
      return 'PDF';
    }
    return 'FILE';
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    const profile = localStorage.getItem('userProfile');

    if (!token) {
      navigate('/login');
      return;
    }

    if (username) {
      setUserName(username);
    }

    if (profile) {
      try {
        const parsedProfile = JSON.parse(profile);
        setUserProfile(parsedProfile);
        const displayName = parsedProfile?.firstName || username;
        setGreeting(getRandomGreeting(displayName));
      } catch (error) {
                setGreeting(getRandomGreeting(username || 'there'));
      }
    } else {
      setGreeting(getRandomGreeting(username || 'there'));
    }
  }, [navigate]);

  useEffect(() => {
    if (userName) {
      loadChatFolders();
      loadChatSessions();
    }
  }, [userName]);

  // Handle initialMessage from SearchHub or other sources
  useEffect(() => {
    const initialMsg = location.state?.initialMessage;
    
    if (initialMsg && userName && !loading) {
            
      // Set the input message so user can see what they asked
      setInputMessage(initialMsg);
      
      // Wait for component to be ready, then send
      const timer = setTimeout(async () => {
        // Create a new chat session first
        const newChatId = await createNewChat();
        
        if (!newChatId) {
                    setLoading(false);
          return;
        }
        
                
        // Set active chat and navigate
        setActiveChatId(newChatId);
        navigate(`/ai-chat/${newChatId}`, { replace: true });
        
        // Add user message to UI
        const userMessage = {
          id: `user_${Date.now()}`,
          type: 'user',
          content: initialMsg,
          timestamp: new Date().toISOString()
        };
        
        setMessages([userMessage]);
        setInputMessage('');
        setLoading(true);
        
        // Send to backend
        try {
          const token = localStorage.getItem('token');
          const formData = new FormData();
          formData.append('user_id', userName);
          const initialMessageForModel = tutorMode ? initialMsg : buildGraphAwarePrompt(initialMsg);
          formData.append('question', initialMessageForModel);
          formData.append('original_question', initialMsg);
          formData.append('chat_id', newChatId.toString());
          formData.append('use_hs_context', hsMode.toString());
          formData.append('tutor_mode', tutorMode.toString());
          formData.append('tutor_reply_style', tutorReplyMode);
          
          const data = USE_AI_JOB_QUEUE
            ? await queueChatCompletion({
                prompt: initialMessageForModel,
                user_message: initialMsg,
                chat_session_id: newChatId,
                use_hs_context: hsMode,
                tutor_mode: tutorMode,
                tutor_reply_style: tutorReplyMode,
              })
            : await (async () => {
                const response = await fetch(`${API_URL}/ask_simple/`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}` },
                  body: formData
                });

                if (!response.ok) {
                  await throwIfUsageLimitResponse(response);
                  throw new Error(`HTTP error! status: ${response.status}`);
                }

                return response.json();
              })();
          
          if (!data.answer) {
            throw new Error('No answer received from AI');
          }
          
          const tutorContract = parseTutorResponseContract(data.answer || '');
          const aiAnswerContent = tutorContract?.answer || stripTutorOptionMarkers(data.answer);

          // Add AI response to UI
          const aiMessage = {
            id: `ai_${Date.now()}`,
            type: 'ai',
            content: aiAnswerContent,
            timestamp: new Date().toISOString(),
            topics: data.topics_discussed || [],
            tutorMode: data.tutor_mode || tutorMode,
            tutorReplyMode: data.tutor_reply_style || tutorReplyMode,
            tutorOptions: normalizeTutorOptions(data.tutor_options || tutorContract?.tutorOptions || []),
            tutorState: normalizeTutorState(data.tutor_state || tutorContract?.tutorState, data.tutor_reply_style || tutorReplyMode),
          };
          
          setMessages(prev => [...prev, aiMessage]);
          
          // Auto-rename chat based on the question
          await autoRenameChat(newChatId, initialMsg);
          
          // Reload chat sessions to show the new chat
          await loadChatSessions();
          
        } catch (error) {
          const usageLimit = getUsageLimitFromError(error);
          const errorMessage = {
            id: `error_${Date.now()}`,
            type: 'ai',
            content: usageLimit
              ? formatUsageLimitMessage(usageLimit)
              : `Sorry, I encountered an error: ${error.message}. Please try again.`,
            timestamp: new Date().toISOString(),
            usageLimit: Boolean(usageLimit),
          };
          setMessages(prev => [...prev, errorMessage]);
        } finally {
          setLoading(false);
        }
        
        // Clear the location state
        window.history.replaceState({}, document.title);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [location.state?.initialMessage, userName]);

  useEffect(() => {
    const numericChatId = chatId ? parseInt(chatId, 10) : null;

    if (numericChatId && !isNaN(numericChatId)) {
      // Skip reload if we just sent a message (to preserve messages and action buttons)
      if (justSentMessageRef.current && activeChatId === numericChatId) {
        justSentMessageRef.current = false;
        isLoadingRef.current = false;
        return;
      }
      justSentMessageRef.current = false;

      // Only load messages if this is a different chat than what we have active
      if (activeChatId !== numericChatId) {
        setActiveChatId(numericChatId);
        setMessages([]);
        loadChatMessages(numericChatId);
      }
    } else if (chatId && isNaN(numericChatId)) {
      // uid string - resolve to numeric via chatSessions
      const match = chatSessions.find(s => s.uid === chatId || String(s.id) === chatId);
      if (match) {
        if (justSentMessageRef.current && activeChatId === match.id) {
          justSentMessageRef.current = false;
          isLoadingRef.current = false;
          return;
        }
        justSentMessageRef.current = false;
        if (activeChatId !== match.id) {
          setActiveChatId(match.id);
          setMessages([]);
          loadChatMessages(match.id);
        }
      }
      // If no match yet (chatSessions not loaded), do nothing - will re-run when chatSessions loads
    } else if (chatId === undefined || chatId === null) {
      // Only reset if we're at /ai-chat with no ID (fresh start)
      // Don't reset if we just sent a message (new chat creation)
      if (!justSentMessageRef.current && activeChatId !== null) {
        setActiveChatId(null);
        setMessages([]);
      } else {
      }
      isLoadingRef.current = false;
      justSentMessageRef.current = false;
    }
  }, [chatId, chatSessions]);

  useEffect(() => {
    return () => {
      if (chatLoadAbortRef.current) {
        chatLoadAbortRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    // Scroll to show latest message at top of viewport
    scrollToLatestMessage();
  }, [messages]);

  useEffect(() => {
    if (selectedTheme && selectedTheme.tokens) {
      Object.entries(selectedTheme.tokens).forEach(([key, value]) => {
        document.documentElement.style.setProperty(key, value);
      });
    }
  }, [selectedTheme]);

  // Enhanced scroll event listener setup from Knowledge Map
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
      
      // Initial scroll state check
      handleScroll();
      
      return () => {
        container.removeEventListener('scroll', handleScroll);
      };
    }
  }, [messages]); // Re-run when messages change

  // Cleanup empty "New Chat" sessions on unmount (when leaving the page)
  useEffect(() => {
    return () => {
      // Cleanup when component unmounts
      cleanupEmptyNewChats();
      if (actionNoticeTimerRef.current) {
        clearTimeout(actionNoticeTimerRef.current);
      }
    };
  }, []);

  // Icons matching Flashcards
  const Icons = {
    menu: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>,
    chat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    logout: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
    plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    folder: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
    trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
    check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
    x: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    chevronLeft: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>,
    link: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
    chevronRight: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>,
    send: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    attach: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>,
    tutor: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3 2 8l10 5 10-5-10-5z"/><path d="M6 10.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5"/><path d="M22 8v6"/></svg>,
    arrowUp: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>,
    arrowDown: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>,
  };

  const renderTutorControls = () => {
    return (
      <div className="ac-tutor-controls">
        <button
          type="button"
          className={`ac-tutor-toggle ${tutorMode ? 'active' : ''}`}
          onClick={handleTutorModeToggle}
          aria-pressed={tutorMode}
          title="Tutor mode"
        >
          <span className="ac-tutor-icon">{Icons.tutor}</span>
          <span>Tutor</span>
        </button>
        {tutorMode && (
          <div className="ac-tutor-mode-list" role="group" aria-label="Tutor reply type">
            {TUTOR_REPLY_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`ac-tutor-mode-btn ${tutorReplyMode === mode.id ? 'active' : ''}`}
                onClick={() => handleTutorReplyModeChange(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="ai-chat-page ac-qb-page">
      <div className="ac-qb-bg-fx" aria-hidden>
        <div className="cb-bg-wash" />
        <div className="cb-bg-orb cb-bg-orb-1" />
        <div className="cb-bg-orb cb-bg-orb-2" />
        <GeometricGrid />
        <div className="cb-bg-grain" />
        <div className="cb-bg-vignette" />
      </div>
      <div className="ac-qb-topbar">
        <div className="ac-qb-topbar-left">
          <button
            className="ac-qb-mobile-menu-btn"
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open AI Chat sidebar"
            title="Open sidebar"
          >
            {Icons.menu}
          </button>
          <div className="ac-qb-tagline"><span>LEARNING,</span> UNIFIED</div>
        </div>
        <div className="ac-qb-topbar-right">
          <button
            className="ac-qb-strip-btn ac-share-btn"
            type="button"
            onClick={handleCopyChatShareLink}
            disabled={!activeChatId}
            title="Copy shareable link to this chat"
          >
            {shareLinkCopied ? Icons.check : Icons.link}
            <span>{shareLinkCopied ? 'Link Copied' : 'Share'}</span>
          </button>
          <div className="ac-qb-context-action">
            <ContextSelector
              hsMode={hsMode}
              docCount={userDocCount}
              refreshKey={contextSelectionRevision}
              onOpen={() => setContextPanelOpen(true)}
              selectionKey={chatContextSelectionKey(activeChatId)}
            />
          </div>
        </div>
      </div>

      <div className={`ac-layout ac-qb-shell ${sidebarOpen ? '' : 'ac-qb-shell--collapsed'}`}>
        {sidebarOpen && (
          <button
            className="ac-qb-mobile-sidebar-backdrop"
            type="button"
            aria-label="Close AI Chat sidebar"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {/* Sidebar */}
        <aside className={`ac-sidebar ac-qb-sidebar ${sidebarOpen ? '' : 'ac-qb-sidebar--collapsed'}`} aria-label="AI Chat navigation">
          <div className="cb-tile-texture" aria-hidden />
          {!sidebarOpen ? (
            <div className="ac-qb-collapsed-strip">
              <button className="ac-qb-strip-btn" data-tip="Open sidebar" onClick={() => setSidebarOpen(true)} type="button">
                {Icons.chevronRight}
              </button>
              <button className="ac-qb-strip-btn" data-tip="New Chat" onClick={handleNewChat} type="button">
                {Icons.plus}
              </button>
              <button className="ac-qb-strip-btn" data-tip="Search" onClick={() => setShowSearchDialog(true)} type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </button>
              <div className="ac-qb-strip-spacer" />
              <button className="ac-qb-strip-btn" data-tip="Dashboard" onClick={goToDashboard} type="button">
                {Icons.home}
              </button>
            </div>
          ) : (
          <>
          <div className="ac-qb-side-brand">
            <div className="ac-qb-brand-wrap">
              <div className="ac-qb-brand">cerbyl</div>
              <div className="ac-qb-brand-kicker">AI Chat</div>
            </div>
            <button
              className="ac-qb-side-close-btn"
              onClick={() => setSidebarOpen(false)}
              title="Close sidebar"
              aria-label="Close AI Chat sidebar"
              type="button"
            >
              {Icons.chevronLeft}
            </button>
          </div>

          <div className="ac-qb-side-block">
            <div className="ac-qb-side-label">Chat Workspace</div>
            <button
              className="ac-new-chat-btn"
              onClick={handleNewChat}
              disabled={loading}
              type="button"
            >
              {Icons.plus}
              <span>New Chat</span>
            </button>

            <div className="ac-search-container" style={{ marginTop: '12px' }}>
              <button
                className="ac-search-wrapper ac-search-trigger"
                onClick={() => setShowSearchDialog(true)}
                type="button"
              >
                <svg className="ac-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
                <span className="ac-search-trigger-text">Search chats...</span>
              </button>
            </div>
          </div>

          <nav className="ac-sidebar-nav" ref={sidebarNavRef}>
            {/* Folders Section */}
            <div className="ac-folders-section ac-qb-side-block">
              <div className="ac-folders-header">
                <h4>Folders</h4>
                <button
                  className="ac-add-folder-btn"
                  onClick={() => setShowFolderDialog(true)}
                >
                  {Icons.plus}
                </button>
              </div>

              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className={`ac-folder-item ${selectedFolder === folder.id ? 'active' : ''} ${
                    dragOverFolderId === folder.id ? 'drop-target' : ''
                  } ${
                    draggedChatId && chatSessions.find(s => s.id === draggedChatId)?.folder_id !== folder.id
                      ? 'can-drop'
                      : ''
                  }`}
                  onDragOver={(event) => handleFolderDragOver(event, folder.id)}
                  onDragEnter={(event) => handleFolderDragOver(event, folder.id)}
                  onDragLeave={(event) => handleFolderDragLeave(event, folder.id)}
                  onDrop={(event) => handleFolderDrop(event, folder.id)}
                >
                  <button
                    type="button"
                    className="ac-folder-main-btn"
                    onClick={() => setSelectedFolder(selectedFolder === folder.id ? null : folder.id)}
                  >
                    <span className="ac-folder-icon">{Icons.folder}</span>
                    <span className="ac-folder-name">{folder.name}</span>
                    <span className="ac-folder-count">
                      {chatSessions.filter(s => s.folder_id === folder.id).length}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="ac-folder-delete-btn"
                    onClick={() => handleDeleteFolder(folder.id, folder.name)}
                    aria-label={`Delete folder ${folder.name}`}
                  >
                    {Icons.trash}
                  </button>
                </div>
              ))}
            </div>

            {/* Chats Section */}
            <div className="ac-nav-section ac-qb-side-block ac-qb-side-block--grow">
              <div className="ac-nav-section-title">
                {selectedFolder ? folders.find(f => f.id === selectedFolder)?.name || 'Folder' : 'Chats'}
                {selectedFolder && (
                  <button
                    className="ac-add-folder-btn"
                    onClick={() => setSelectedFolder(null)}
                    title="Close folder"
                    style={{ marginLeft: 'auto' }}
                  >
                    {Icons.x}
                  </button>
                )}
              </div>
              <div className="ac-sessions-list">
                {chatSessions.length === 0 ? (
                  <div className="ac-empty">
                    <p>No conversations yet</p>
                  </div>
                ) : (
                  chatSessions
                    .filter(session => selectedFolder ? session.folder_id === selectedFolder : true)
                    .filter(session =>
                      searchQuery.trim() === '' ||
                      session.title.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map(session => (
                      <div
                        key={session.id}
                        className={`ac-session-item ${activeChatId === session.id ? 'active' : ''} ${
                          draggedChatId === session.id ? 'dragging' : ''
                        } ${
                          draggedChatId && draggedChatId !== session.id ? 'drag-source-dimmed' : ''
                        }`}
                        onClick={() => selectChat(session.id, session.uid)}
                        draggable
                        onDragStart={(event) => handleChatDragStart(event, session.id)}
                        onDragEnd={handleChatDragEnd}
                      >
                        <span className="ac-session-icon">{Icons.chat}</span>
                        <div className="ac-session-info">
                          <div className="ac-session-title">{session.title}</div>
                          <div className="ac-session-date">
                            {new Date(session.updated_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </div>
                        </div>
                        <div className="ac-session-actions">
                          <button
                            className="ac-session-btn"
                            onClick={(e) => handleContextMenu(e, session.id)}
                            title="Move to folder"
                          >
                            {Icons.folder}
                          </button>
                          <button
                            className="ac-session-btn delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteChat(session.id, session.title);
                            }}
                            title="Delete"
                          >
                            {Icons.trash}
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </nav>

          <div className="ac-sidebar-footer ac-qb-side-actions">
            <button className="ac-nav-item" onClick={goToDashboard} type="button">
              <span className="ac-nav-icon">{Icons.home}</span>
              <span className="ac-nav-text">Dashboard</span>
            </button>
          </div>
          </>
          )}
        </aside>

        {/* Search Dialog */}
        {showSearchDialog && (
          <div className="ac-search-dialog-overlay" onClick={() => { setShowSearchDialog(false); setSearchQuery(''); }}>
            <div className="ac-search-dialog" onClick={e => e.stopPropagation()}>
              <div className="ac-search-dialog-header">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input
                  autoFocus
                  type="text"
                  className="ac-search-dialog-input"
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Escape' && setShowSearchDialog(false)}
                />
                <button className="ac-search-dialog-close" onClick={() => { setShowSearchDialog(false); setSearchQuery(''); }}>{Icons.x}</button>
              </div>
              <div className="ac-search-dialog-results">
                <button className="ac-search-dialog-new-chat" onClick={() => { handleNewChat(); setShowSearchDialog(false); }} type="button">
                  <span className="ac-search-dialog-new-icon">{Icons.plus}</span>
                  <span>New chat</span>
                </button>
                {chatSessions.length > 0 && (
                  <div className="ac-search-dialog-section-label">
                    {searchQuery ? 'Results' : 'Recent'}
                  </div>
                )}
                {chatSessions
                  .filter(s => searchQuery ? s.title.toLowerCase().includes(searchQuery.toLowerCase()) : true)
                  .slice(0, 20)
                  .map(session => (
                    <button
                      key={session.id}
                      className={`ac-search-dialog-item ${activeChatId === session.id ? 'active' : ''}`}
                      onClick={() => { selectChat(session.id, session.uid); setShowSearchDialog(false); setSearchQuery(''); }}
                      type="button"
                    >
                      <span className="ac-search-dialog-item-icon">{Icons.chat}</span>
                      <div className="ac-search-dialog-item-info">
                        <div className="ac-search-dialog-item-title">{session.title}</div>
                        <div className="ac-search-dialog-item-date">
                          {new Date(session.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                    </button>
                  ))
                }
                {searchQuery && chatSessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                  <div className="ac-search-dialog-empty">No chats found</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Folder Creation Dialog */}
        {showFolderDialog && (
          <div className="ac-folder-dialog-overlay" onClick={() => { setShowFolderDialog(false); setFolderName(''); setFolderColor('#D7B38C'); }}>
            <div className="ac-folder-dialog" onClick={e => e.stopPropagation()}>
              <div className="ac-folder-dialog-header">
                <div className="ac-folder-dialog-title-row">
                  <span className="ac-folder-dialog-icon" style={{ color: folderColor }}>{Icons.folder}</span>
                  <h3>New Folder</h3>
                </div>
                <button className="ac-folder-dialog-close" onClick={() => { setShowFolderDialog(false); setFolderName(''); setFolderColor('#D7B38C'); }}>{Icons.x}</button>
              </div>
              <div className="ac-folder-dialog-body">
                <label className="ac-folder-dialog-label">Folder Name</label>
                <input
                  autoFocus
                  type="text"
                  className="ac-folder-dialog-input"
                  placeholder="e.g. Physics, Week 3 Review..."
                  value={folderName}
                  onChange={e => setFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && folderName.trim()) handleFolderCreation(); else if (e.key === 'Escape') { setShowFolderDialog(false); setFolderName(''); setFolderColor('#D7B38C'); } }}
                />
                <label className="ac-folder-dialog-label">Color</label>
                <div className="ac-folder-color-grid">
                  {['#D7B38C','#E07B6A','#6AA8E0','#78C98D','#B48CE0','#E0C56A','#E08C6A','#6AD5E0'].map(color => (
                    <button
                      key={color}
                      type="button"
                      className={`ac-folder-color-chip ${folderColor === color ? 'selected' : ''}`}
                      style={{ background: color }}
                      onClick={() => setFolderColor(color)}
                      aria-label={color}
                    />
                  ))}
                </div>
              </div>
              <div className="ac-folder-dialog-footer">
                <button className="ac-folder-dialog-cancel" onClick={() => { setShowFolderDialog(false); setFolderName(''); setFolderColor('#D7B38C'); }} type="button">Cancel</button>
                <button className="ac-folder-dialog-create" onClick={handleFolderCreation} disabled={!folderName.trim()} type="button">Create Folder</button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className={`ac-main ${messages.length === 0 ? 'empty-state' : ''}`}>
          <div className="cb-tile-texture" aria-hidden />
          {/* Persistent vector background */}
          <svg className="ac-hero-bg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
                  <circle cx="600" cy="400" r="360" fill="none" stroke="currentColor" strokeWidth="1"/>
                  <circle cx="600" cy="400" r="260" fill="none" stroke="currentColor" strokeWidth="0.8"/>
                  <circle cx="600" cy="400" r="168" fill="none" stroke="currentColor" strokeWidth="0.7"/>
                  <circle cx="600" cy="400" r="90" fill="none" stroke="currentColor" strokeWidth="0.6"/>
                  <line x1="600" y1="0" x2="600" y2="800" stroke="currentColor" strokeWidth="0.5"/>
                  <line x1="0" y1="400" x2="1200" y2="400" stroke="currentColor" strokeWidth="0.5"/>
                  <line x1="0" y1="800" x2="500" y2="0" stroke="currentColor" strokeWidth="0.4"/>
                  <line x1="1200" y1="0" x2="700" y2="800" stroke="currentColor" strokeWidth="0.4"/>
                  <circle cx="600" cy="40" r="5" fill="currentColor"/>
                  <circle cx="600" cy="760" r="5" fill="currentColor"/>
                  <circle cx="240" cy="400" r="5" fill="currentColor"/>
                  <circle cx="960" cy="400" r="5" fill="currentColor"/>
                  <circle cx="345" cy="146" r="3.5" fill="currentColor"/>
                  <circle cx="855" cy="654" r="3.5" fill="currentColor"/>
                  <circle cx="855" cy="146" r="3.5" fill="currentColor"/>
                  <circle cx="345" cy="654" r="3.5" fill="currentColor"/>
                  <rect x="24" y="24" width="72" height="72" fill="none" stroke="currentColor" strokeWidth="0.8"/>
                  <rect x="44" y="44" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="0.5"/>
                  <circle cx="60" cy="60" r="3" fill="currentColor"/>
                  <rect x="1104" y="704" width="72" height="72" fill="none" stroke="currentColor" strokeWidth="0.8"/>
                  <rect x="1124" y="724" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="0.5"/>
                  <circle cx="1140" cy="740" r="3" fill="currentColor"/>
                  <circle cx="120" cy="200" r="2" fill="currentColor"/>
                  <circle cx="160" cy="160" r="1.5" fill="currentColor"/>
                  <circle cx="200" cy="200" r="2" fill="currentColor"/>
                  <circle cx="160" cy="240" r="1.5" fill="currentColor"/>
                  <circle cx="1080" cy="600" r="2" fill="currentColor"/>
                  <circle cx="1040" cy="640" r="1.5" fill="currentColor"/>
                  <circle cx="1000" cy="600" r="2" fill="currentColor"/>
                  <circle cx="1040" cy="560" r="1.5" fill="currentColor"/>
          </svg>
          {/* Chat Content */}
          <div
            className="ac-content"
            onScroll={handleScroll}
          >
            {messages.length === 0 ? (
              <div className="ac-empty-center">
                <div className="ac-welcome-hero">
                  <h1 className="ac-welcome-title">{greeting}</h1>
                </div>

                <div
                  className={`ac-input-wrapper ${dragActive ? 'drag-active' : ''} ${selectedFiles.length > 0 ? 'has-attachments' : ''}`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.docx,.txt,.md,.markdown,image/*"
                    onChange={handleFileInputChange}
                    style={{ display: 'none' }}
                  />
                  {renderSelectedFilePreview()}
                  {renderTutorControls()}
                  <div className="ac-input-row">
                    <button
                      type="button"
                      className="ac-input-btn"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={loading}
                      title="Attach image, PDF, DOCX, TXT, or Markdown"
                    >
                      {Icons.attach}
                    </button>
                    <textarea
                      ref={textareaRef}
                      value={inputMessage}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      onPaste={handlePaste}
                      placeholder={selectedFiles.length > 0 ? 'Add a message or send as-is...' : 'Type your message or drag files here...'}
                      className="ac-textarea"
                      disabled={loading}
                      rows="1"
                    />
                    <button
                      type="button"
                      onClick={sendMessage}
                      disabled={loading || (!inputMessage.trim() && selectedFiles.length === 0)}
                      className="ac-send-btn"
                    >
                      {Icons.send}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="ac-messages" ref={messagesContainerRef} onScroll={handleScroll}>
                {messages.map((message, messageIndex) => {
                  const tutorOptions = Array.isArray(message.tutorOptions) ? message.tutorOptions : [];
                  const tutorState = normalizeTutorState(message.tutorState, message.tutorReplyMode);
                  const isTutorMessage = Boolean(message.tutorMode || tutorState || tutorOptions.length > 0);
                  const smartActions = isTutorMessage ? [] : getSmartActionsForMessage(message, messageIndex);
                  const tutorActions = isTutorMessage ? getTutorActionsForMessage(message) : [];
                  const hasBackendActions = !isTutorMessage && smartActions.length === 0 && message.actionButtons && message.actionButtons.length > 0;
                  const messageClasses = [
                    'ac-message',
                    message.type,
                    isTutorMessage ? 'has-tutor-ui' : '',
                    (smartActions.length > 0 || tutorActions.length > 0 || hasBackendActions) ? 'has-action-ui' : '',
                    message.usageLimit ? 'is-usage-limit' : '',
                  ].filter(Boolean).join(' ');
                  return (
                  <div key={message.id} className={messageClasses}>
                    <div className="ac-message-bubble">
                      <div className="ac-message-content">
                        {renderMessageContent(message.content)}
                      </div>

                      {message.files && message.files.length > 0 && (
                        <div className="ac-msg-attachments">
                          {message.files.map((file, index) => (
                            file.isImage && file.previewUrl ? (
                              <div key={index} className="ac-msg-img-wrap">
                                <img
                                  src={file.previewUrl}
                                  alt={file.name}
                                  className="ac-msg-img"
                                />
                              </div>
                            ) : (
                              <div key={index} className="ac-file-tag">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                  <polyline points="14 2 14 8 20 8"/>
                                </svg>
                                <span>{file.name}</span>
                              </div>
                            )
                          ))}
                        </div>
                      )}
                      
                      {message.type === 'ai' && message.fileSummaries && message.fileSummaries.length > 0 && (
                        <div className="ac-file-analysis">
                          <div className="ac-file-analysis-header">
                            {message.filesProcessed} FILE(S) ANALYZED
                          </div>
                          {message.fileSummaries.map((file, index) => (
                            <div key={index} className="ac-file-analysis-item">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                              </svg>
                              <span>{file.file_name}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {message.type === 'ai' && tutorOptions.length > 0 && (
                        <div className="ac-tutor-options">
                          {tutorOptions.map((option) => (
                            <button
                              key={`${message.id}:${option.id}`}
                              type="button"
                              className="ac-tutor-option-btn"
                              onClick={() => handleTutorOptionClick(option)}
                              onMouseMove={handleTileMove}
                              onMouseLeave={handleTileLeave}
                              disabled={loading}
                            >
                              <div className="cb-tile-texture" />
                              <span className="ac-tutor-option-label">{option.label}</span>
                              <div className="ac-tutor-option-text">
                                {renderMessageContent(option.text)}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {message.type === 'ai' && tutorActions.length > 0 && (
                        <div className="ac-smart-actions ac-tutor-actions">
                          {tutorActions.map((action) => {
                            const actionKey = `${message.id}:${action.id}`;
                            const busy = activeActionKey === actionKey;
                            return (
                              <button
                                key={actionKey}
                                className={`ac-smart-action ac-smart-action-${action.icon || 'default'}`}
                                onClick={() => runSmartAction(action, message)}
                                onMouseMove={handleTileMove}
                                onMouseLeave={handleTileLeave}
                                disabled={busy || loading}
                              >
                                <div className="cb-tile-texture" />
                                <span className="ac-smart-action-icon">{busy ? '...' : renderSmartActionIcon(action.icon)}</span>
                                <span className="ac-smart-action-copy">
                                  <span className="ac-smart-action-label">{action.label}</span>
                                  <span className="ac-smart-action-desc">{action.description}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Intelligent Action Grid */}
                      {message.type === 'ai' && !isTutorMessage && smartActions.length > 0 && (
                        <div className="ac-smart-actions">
                          {smartActions.map((action) => {
                            const actionKey = `${message.id}:${action.id}`;
                            const busy = activeActionKey === actionKey;
                            return (
                              <button
                                key={actionKey}
                                className={`ac-smart-action ac-smart-action-${action.icon || 'default'}`}
                                onClick={() => runSmartAction(action, message)}
                                onMouseMove={handleTileMove}
                                onMouseLeave={handleTileLeave}
                                disabled={busy || loading}
                              >
                                <div className="cb-tile-texture" />
                                <span className="ac-smart-action-icon">{busy ? '...' : renderSmartActionIcon(action.icon)}</span>
                                <span className="ac-smart-action-copy">
                                  <span className="ac-smart-action-label">{action.label}</span>
                                  <span className="ac-smart-action-desc">{action.description}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Backend-provided fallback action buttons */}
                      {message.type === 'ai' && hasBackendActions && (
                        <div className="ac-action-buttons">
                          {message.actionButtons.map((btn, index) => (
                            <button
                              key={index}
                              className={`ac-action-btn ac-action-btn-${btn.icon || 'default'}`}
                              onClick={async () => {
                                const token = localStorage.getItem('token');
                                const buttonContext = getChatActionContext(messages.slice(0, messageIndex + 1), activeChatId);
                                const topic = normalizeTopic(buttonContext.label || btn.navigate_params?.topic || 'General') || 'General';
                                const contextPrompt = buttonContext.summary || topic;
                                activateChatDock(activeChatId);
                                
                                if (btn.action === 'create' && btn.content_type === 'note') {
                                  // Create a note with AI-generated content via SearchHub agent
                                  try {
                                    const response = await queuedAIJsonFetch('/agents/searchhub/create-note', {
                                      method: 'POST',
                                      headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token}`
                                      },
                                      body: JSON.stringify({
                                        user_id: userName,
                                        topic: contextPrompt,
                                        session_id: `chat_${Date.now()}`
                                      })
                                    });
                                    if (response.ok) {
                                      const result = await response.json();
                                      const safePath = safeInternalPath(result.navigate_to);
                                      if (safePath) {
                                        navigate(safePath);
                                      } else if (result.content_id) {
                                        navigate(`/notes/editor/${encodeURIComponent(result.content_id)}`);
                                      } else {
                                        navigate('/notes/my-notes');
                                      }
                                    }
                                  } catch (error) {
                                    console.error('Failed to create note:', error);
                                    navigate('/notes/my-notes');
                                  }
                                } else if (btn.action === 'create' && btn.content_type === 'flashcard_set') {
                                  // Create flashcards via SearchHub agent
                                  try {
                                    const response = await queuedAIJsonFetch('/agents/searchhub', {
                                      method: 'POST',
                                      headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token}`
                                      },
                                      body: JSON.stringify({
                                        user_id: userName,
                                        query: `create flashcards from this chat context: ${contextPrompt}`,
                                        session_id: `chat_${Date.now()}`
                                      })
                                    });
                                    if (response.ok) {
                                      const result = await response.json();
                                      const safePath = safeInternalPath(result.navigate_to);
                                      if (safePath) {
                                        navigate(safePath);
                                      } else if (result.content_id) {
                                        navigate(`/flashcards?set_id=${encodeURIComponent(result.content_id)}`);
                                      } else {
                                        navigate('/flashcards');
                                      }
                                    }
                                  } catch (error) {
                                    console.error('Failed to create flashcards:', error);
                                    navigate('/flashcards');
                                  }
                                } else if (btn.content_type === 'quiz') {
                                  navigate('/solo-quiz', {
                                    state: {
                                      autoStart: true,
                                      topics: [topic],
                                      contextSummary: contextPrompt,
                                      questionCount: 10,
                                    },
                                  });
                                } else if (btn.navigate_to) {
                                  // Validate AI-provided path before navigating
                                  const safeDest = safeInternalPath(btn.navigate_to);
                                  if (safeDest) {
                                    if (btn.navigate_params && Object.keys(btn.navigate_params).length > 0) {
                                      const params = new URLSearchParams();
                                      Object.entries(btn.navigate_params).forEach(([key, value]) => {
                                        if (Array.isArray(value)) {
                                          params.set(key, JSON.stringify(value));
                                        } else {
                                          params.set(key, String(value));
                                        }
                                      });
                                      navigate(`${safeDest}?${params.toString()}`);
                                    } else {
                                      navigate(safeDest);
                                    }
                                  }
                                }
                              }}
                            >
                              {btn.icon === 'note' && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                  <polyline points="14 2 14 8 20 8"/>
                                  <line x1="16" y1="13" x2="8" y2="13"/>
                                  <line x1="16" y1="17" x2="8" y2="17"/>
                                </svg>
                              )}
                              {btn.icon === 'flashcard' && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                                  <line x1="8" y1="21" x2="16" y2="21"/>
                                  <line x1="12" y1="17" x2="12" y2="21"/>
                                </svg>
                              )}
                              {btn.icon === 'quiz' && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10"/>
                                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                                </svg>
                              )}
                              {btn.icon === 'plus' && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <line x1="12" y1="5" x2="12" y2="19"/>
                                  <line x1="5" y1="12" x2="19" y2="12"/>
                                </svg>
                              )}
                              {btn.icon === 'play' && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polygon points="5 3 19 12 5 21 5 3"/>
                                </svg>
                              )}
                              {!btn.icon && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="9 18 15 12 9 6"/>
                                </svg>
                              )}
                              <span>{btn.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="ac-message-meta" style={{ maxWidth: '85%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="ac-message-time">
                          {new Date(message.timestamp).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </span>
                      </div>
                    </div>

                    {showFeedbackFor === message.id && (
                      <div className="ac-feedback">
                        <textarea
                          placeholder="What could be improved?"
                          value={feedbackText}
                          onChange={(e) => setFeedbackText(e.target.value)}
                        />
                        <div className="ac-feedback-actions">
                          <button 
                            className="ac-btn ac-btn-secondary"
                            onClick={() => setShowFeedbackFor(null)}
                          >
                            Cancel
                          </button>
                          <button 
                            className="ac-btn ac-btn-primary"
                            onClick={() => submitFeedback(message.id)}
                          >
                            Submit
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )})}
                
                {loading && (
                  <div className="ac-message ai">
                    <div className="ac-message-bubble">
                      <div className="ac-pulse-loader">
                        <div className="ac-pulse-square ac-pulse-1"></div>
                        <div className="ac-pulse-square ac-pulse-2"></div>
                        <div className="ac-pulse-square ac-pulse-3"></div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {actionNotice && (
            <div className="ac-action-notice" role="status" aria-live="polite">
              {actionNotice}
            </div>
          )}
          
          {/* Scroll Buttons */}
          {showScrollToTop && (
            <button 
              className="ac-scroll-btn top"
              onClick={scrollToTop}
              title="Scroll to top"
            >
              {Icons.arrowUp}
            </button>
          )}
          
          {showScrollToBottom && (
            <button 
              className="ac-scroll-btn bottom"
              onClick={scrollToBottom}
              title="Scroll to bottom"
            >
              {Icons.arrowDown}
            </button>
          )}

          {/* Input Box - Fixed at bottom when there are messages */}
          {messages.length > 0 && (
            <div
              className={`ac-input-wrapper ${dragActive ? 'drag-active' : ''} ${selectedFiles.length > 0 ? 'has-attachments' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.markdown,image/*"
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
              />

              {renderSelectedFilePreview()}
              {renderTutorControls()}
              
              <div className="ac-input-row">
                <button
                  className="ac-input-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  title="Attach image, PDF, DOCX, TXT, or Markdown"
                >
                  {Icons.attach}
                </button>

                <textarea
                  ref={textareaRef}
                  value={inputMessage}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={selectedFiles.length > 0 ? 'Add a message or send as-is…' : 'Message or paste an image…'}
                  className="ac-textarea"
                  disabled={loading}
                  rows="1"
                />

                <button
                  onClick={sendMessage}
                  disabled={loading || (!inputMessage.trim() && selectedFiles.length === 0)}
                  className="ac-send-btn"
                >
                  {Icons.send}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirmation && (
        <div className="ac-modal-overlay">
          <div className="ac-modal">
            <h3>DELETE CONVERSATION</h3>
            <p>
              Are you sure you want to delete "{chatToDelete?.title}"? This action cannot be undone.
            </p>
            <div className="ac-modal-actions">
              <button
                className="ac-modal-btn cancel"
                onClick={() => {
                  setShowDeleteConfirmation(false);
                  setChatToDelete(null);
                }}
              >
                Cancel
              </button>
              <button
                className="ac-modal-btn delete"
                onClick={confirmDeleteChat}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showFolderDeleteConfirmation && (
        <div className="ac-modal-overlay">
          <div className="ac-modal">
            <h3>DELETE FOLDER</h3>
            <p>
              Are you sure you want to delete "{folderToDelete?.name}"? Chats in this folder will be kept and moved to All Chats.
            </p>
            <div className="ac-modal-actions">
              <button
                className="ac-modal-btn cancel"
                onClick={() => {
                  setShowFolderDeleteConfirmation(false);
                  setFolderToDelete(null);
                }}
              >
                Cancel
              </button>
              <button
                className="ac-modal-btn delete"
                onClick={confirmDeleteFolder}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move to Folder Menu */}
      {showMoveMenu && (
        <>
          <div className="ac-modal-overlay" onClick={() => setShowMoveMenu(null)} />
          <div 
            className="ac-move-menu" 
            style={{ 
              top: `${menuPosition.y}px`, 
              left: `${menuPosition.x}px` 
            }}
          >
            {folders.map(folder => (
              <button
                key={folder.id}
                className="ac-move-menu-item"
                onClick={() => handleMoveToFolder(showMoveMenu, folder.id)}
              >
                {Icons.folder}
                {folder.name}
              </button>
            ))}
            {chatSessions.find(s => s.id === showMoveMenu)?.folder_id && (
              <button
                className="ac-move-menu-item"
                onClick={() => handleMoveToFolder(showMoveMenu, null)}
              >
                {Icons.x}
                Remove from {folders.find(f => f.id === chatSessions.find(s => s.id === showMoveMenu)?.folder_id)?.name || 'Folder'}
              </button>
            )}
          </div>
        </>
      )}

      <ContextPanel
        isOpen={contextPanelOpen}
        onClose={() => setContextPanelOpen(false)}
        hsMode={hsMode}
        onHsModeToggle={handleHsModeToggle}
        onDocUploaded={() => setUserDocCount(p => p + 1)}
        onSelectionChange={() => setContextSelectionRevision((value) => value + 1)}
        selectionKey={chatContextSelectionKey(activeChatId)}
      />
    </div>
  );
};

export default AIChat;
