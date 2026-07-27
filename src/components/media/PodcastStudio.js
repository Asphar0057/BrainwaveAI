import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Copy,
  Download,
  Headphones,
  Languages,
  List,
  Loader2,
  Maximize2,
  MessageCircle,
  Mic,
  Minimize2,
  Pause,
  Play,
  Send,
  Settings,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import podcastAgentService from '../../services/podcastAgentService';
import { API_URL, getAuthToken } from '../../config/api';
import { queueLegacyAIFileEndpoint, USE_AI_JOB_QUEUE } from '../../services/aiJobService';
import DOMPurify from 'dompurify';
import './PodcastStudio.css';

const getTranscriptFromResults = (results) => {
  const transcript = (results?.transcript || '').trim();
  if (transcript.length > 0) return transcript;

  const notesHtml = results?.notes?.content || '';
  if (!notesHtml) return '';

  const temp = document.createElement('div');
  temp.innerHTML = DOMPurify.sanitize(notesHtml, { ALLOWED_TAGS: [] });
  return (temp.textContent || temp.innerText || '').trim();
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const formatTime = (seconds) => {
  const total = Math.max(0, Number(seconds || 0));
  const mins = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const normalizeText = (text) => (text || '').replace(/\s+/g, ' ').trim();

const tokenizeWords = (text) => {
  const words = [];
  const matcher = /\S+/g;
  let match = matcher.exec(text);

  while (match) {
    words.push({
      text: match[0],
      startChar: match.index,
      endChar: match.index + match[0].length,
    });
    match = matcher.exec(text);
  }

  return words;
};

const buildWordChunkCues = (text, words) => {
  const cues = [];
  let startWordIndex = 0;

  for (let index = 0; index < words.length; index += 1) {
    const wordsInCue = index - startWordIndex + 1;
    const isLastWord = index === words.length - 1;

    if (!isLastWord && !shouldBreakSubtitleCue(words[index].text, wordsInCue)) {
      continue;
    }

    const firstWord = words[startWordIndex];
    const lastWord = words[index];

    cues.push({
      index: cues.length,
      text: text.slice(firstWord.startChar, lastWord.endChar),
      startWordIndex,
      endWordIndex: index,
      startChar: firstWord.startChar,
      endChar: lastWord.endChar,
      words: words.slice(startWordIndex, index + 1),
    });

    startWordIndex = index + 1;
  }

  return cues;
};

const splitSentences = (text) => {
  const sentences = [];
  if (!text) return sentences;

  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      const segmenter = new Intl.Segmenter('en-US', { granularity: 'sentence' });
      for (const segment of segmenter.segment(text)) {
        const raw = segment.segment || '';
        const rawStart = segment.index || 0;
        let startChar = rawStart;
        let endChar = rawStart + raw.length;

        while (startChar < endChar && /\s/.test(text[startChar])) startChar += 1;
        while (endChar > startChar && /\s/.test(text[endChar - 1])) endChar -= 1;

        if (endChar > startChar) {
          sentences.push({
            text: text.slice(startChar, endChar),
            startChar,
            endChar,
          });
        }
      }
      if (sentences.length > 0) return sentences;
    } catch (e) { /* silenced */ }
  }

  const matcher = /[^.!?]+(?:[.!?]+(?=\s|$)|$)/g;
  let match = matcher.exec(text);

  while (match) {
    const raw = match[0];
    let startChar = match.index;
    let endChar = match.index + raw.length;

    while (startChar < endChar && /\s/.test(text[startChar])) startChar += 1;
    while (endChar > startChar && /\s/.test(text[endChar - 1])) endChar -= 1;

    if (endChar > startChar) {
      sentences.push({
        text: text.slice(startChar, endChar),
        startChar,
        endChar,
      });
    }

    match = matcher.exec(text);
  }

  return sentences;
};

const buildSentenceCues = (text, words, sentences) => {
  if (!sentences.length) return [];

  const cues = [];
  let wordCursor = 0;

  for (const sentence of sentences) {
    while (wordCursor < words.length && words[wordCursor].endChar <= sentence.startChar) {
      wordCursor += 1;
    }

    const startWordIndex = wordCursor;
    let endWordIndex = startWordIndex - 1;

    while (wordCursor < words.length && words[wordCursor].startChar < sentence.endChar) {
      endWordIndex = wordCursor;
      wordCursor += 1;
    }

    if (endWordIndex < startWordIndex) continue;

    const firstWord = words[startWordIndex];
    const lastWord = words[endWordIndex];

    cues.push({
      index: cues.length,
      text: text.slice(firstWord.startChar, lastWord.endChar),
      startWordIndex,
      endWordIndex,
      startChar: firstWord.startChar,
      endChar: lastWord.endChar,
      words: words.slice(startWordIndex, endWordIndex + 1),
    });
  }

  return cues;
};

const shouldBreakSubtitleCue = (wordText, wordsInCue) => {
  if (wordsInCue >= 14) return true;
  if (wordsInCue >= 8 && /[.!?]$/.test(wordText)) return true;
  if (wordsInCue >= 10 && /[,;:]$/.test(wordText)) return true;
  return false;
};

const buildSubtitleModel = (input) => {
  const text = normalizeText(input);
  const words = tokenizeWords(text);

  if (words.length === 0) {
    return { text, words: [], cues: [] };
  }

  const sentenceCues = buildSentenceCues(text, words, splitSentences(text));
  const cues = sentenceCues.length > 0 ? sentenceCues : buildWordChunkCues(text, words);

  return { text, words, cues };
};

const findWordIndexForChar = (words, charIndex) => {
  if (!words.length) return -1;

  for (let index = words.length - 1; index >= 0; index -= 1) {
    if (charIndex >= words[index].startChar) {
      return index;
    }
  }

  return 0;
};

const findCueIndexForWord = (cues, wordIndex) => {
  if (!cues.length || wordIndex < 0) return -1;
  return cues.findIndex((cue) => wordIndex >= cue.startWordIndex && wordIndex <= cue.endWordIndex);
};

const rankPreferredVoices = (voices) => {
  const isEnglish = (voice) => voice.lang?.toLowerCase().startsWith('en');
  const isEnglishUS = (voice) => voice.lang?.toLowerCase().startsWith('en-us');
  const isGoogle = (voice) => voice.name?.toLowerCase().includes('google');
  const googleVoices = voices.filter((voice) => isGoogle(voice));

  const sorted = [
    ...googleVoices.filter((voice) => isEnglishUS(voice)),
    ...googleVoices.filter((voice) => isEnglish(voice)),
    ...googleVoices,
  ];

  const seen = new Set();
  return sorted.filter((voice) => {
    if (!voice?.voiceURI || seen.has(voice.voiceURI)) return false;
    seen.add(voice.voiceURI);
    return true;
  });
};

const testVoiceBoundarySupport = (synth, voice) => new Promise((resolve) => {
  if (!voice) {
    resolve(false);
    return;
  }

  const utterance = new SpeechSynthesisUtterance('alpha beta gamma delta epsilon');
  let boundaryCount = 0;
  let settled = false;
  let timeoutId = null;

  const finalize = (result) => {
    if (settled) return;
    settled = true;
    if (timeoutId) clearTimeout(timeoutId);
    resolve(result);
  };

  utterance.voice = voice;
  utterance.lang = voice.lang || 'en-US';
  utterance.volume = 0;
  utterance.rate = 1;
  utterance.pitch = 1;

  utterance.onboundary = (event) => {
    if (typeof event.charIndex === 'number') {
      boundaryCount += 1;
    }
  };
  utterance.onend = () => finalize(boundaryCount >= 2);
  utterance.onerror = () => finalize(false);

  timeoutId = setTimeout(() => {
    try {
      synth.cancel();
    } catch (e) { /* silenced */ }
    finalize(false);
  }, 2200);

  try {
    synth.cancel();
    synth.speak(utterance);
  } catch (e) {
    finalize(false);
  }
});

const difficultyIndexMap = {
  basic: 0,
  intermediate: 1,
  advanced: 2,
};

const difficultyFromIndex = (index) => {
  if (index <= 0) return 'basic';
  if (index >= 2) return 'advanced';
  return 'intermediate';
};

const FALLBACK_VOICE_MODES = [
  { id: 'coach', label: 'Coach', description: 'Supportive, clear explanations with practical examples.' },
  { id: 'story', label: 'Story Mode', description: 'Narrative, memorable delivery with helpful analogies.' },
  { id: 'rapid', label: 'Rapid Review', description: 'Fast, high-yield revision focused on key facts.' },
  { id: 'socratic', label: 'Socratic', description: 'Question-led teaching designed for active recall.' },
  { id: 'exam', label: 'Exam Prep', description: 'Test-focused framing, common traps, and key contrasts.' },
];

const getPodcastDisplayTitle = (title) => {
  if (!title) return 'Media Podcast';
  const cleaned = String(title)
    .replace(/\.(mp3|mp4|m4a|wav|webm|mov|avi|mkv)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Media Podcast';
};

const PodcastStudio = ({ results, userName, onExit, onSettingsDrawerChange }) => {
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const currentUtteranceRef = useRef(null);
  const chatListRef = useRef(null);
  const recognitionRef = useRef(null);
  const fullscreenRef = useRef(null);
  const subtitleRefs = useRef({});
  const speechCancelRef = useRef(false);

  const [voiceModes, setVoiceModes] = useState(FALLBACK_VOICE_MODES);
  const [selectedVoiceMode, setSelectedVoiceMode] = useState('coach');
  const [voiceProfile, setVoiceProfile] = useState(null);

  const [voicePersonas, setVoicePersonas] = useState([]);
  const [selectedPersona, setSelectedPersona] = useState('mentor');
  const [personaProfile, setPersonaProfile] = useState(null);

  const [languages, setLanguages] = useState([]);
  const [answerLanguage, setAnswerLanguage] = useState('en');
  const [questionLanguage, setQuestionLanguage] = useState('en');

  const [difficulties, setDifficulties] = useState([]);
  const [selectedDifficulty, setSelectedDifficulty] = useState('intermediate');

  const [voices, setVoices] = useState([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState('');
  const [playbackRate, setPlaybackRate] = useState(1);
  const [autoPlay, setAutoPlay] = useState(true);

  const [sessionId, setSessionId] = useState('');
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [currentSegment, setCurrentSegment] = useState('');
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [totalSegments, setTotalSegments] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [chapters, setChapters] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [savedSessions, setSavedSessions] = useState([]);

  const [conversation, setConversation] = useState([]);
  const [question, setQuestion] = useState('');
  const [followUps, setFollowUps] = useState([]);
  const [keyTakeaways, setKeyTakeaways] = useState([]);

  const [mcqState, setMcqState] = useState({ active: false });
  const [mcqFeedback, setMcqFeedback] = useState('');

  const [handsFreeEnabled, setHandsFreeEnabled] = useState(false);
  const [wakePhrase, setWakePhrase] = useState('hey cerbyl');
  const [isHandsFreeListening, setIsHandsFreeListening] = useState(false);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSpeechPaused, setIsSpeechPaused] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isFetchingNext, setIsFetchingNext] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const [isFullscreenMode, setIsFullscreenMode] = useState(true);
  const [subtitlesExpanded, setSubtitlesExpanded] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [speechCharIndex, setSpeechCharIndex] = useState(-1);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [activeSubtitleIndex, setActiveSubtitleIndex] = useState(-1);
  const [hoveredSubtitleIndex, setHoveredSubtitleIndex] = useState(-1);

  const transcript = useMemo(() => getTranscriptFromResults(results), [results]);
  const keyConcepts = results?.analysis?.key_concepts || [];
  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const recognitionSupported = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    onSettingsDrawerChange?.(showSettingsDrawer);
  }, [onSettingsDrawerChange, showSettingsDrawer]);

  useEffect(() => () => onSettingsDrawerChange?.(false), [onSettingsDrawerChange]);

  const closeSettingsDrawer = () => {
    setShowSettingsDrawer(false);
  };

  const handleSettingsCloseInteraction = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setShowSettingsDrawer(false);
  };

  const currentChapter = useMemo(
    () => chapters.find((chapter) => chapter.index === currentIndex) || null,
    [chapters, currentIndex]
  );

  const subtitleModel = useMemo(() => buildSubtitleModel(currentSegment), [currentSegment]);
  const normalizedCurrentSegment = subtitleModel.text;

  const progressPercent = useMemo(() => {
    if (totalSegments <= 0 || currentIndex < 0) return 0;
    return Math.min(100, Math.round(((currentIndex + 1) / totalSegments) * 100));
  }, [currentIndex, totalSegments]);

  const currentChapterProgressPercent = useMemo(() => {
    if (!subtitleModel.words.length || activeWordIndex < 0) return 0;
    return Math.min(100, Math.round(((activeWordIndex + 1) / subtitleModel.words.length) * 100));
  }, [activeWordIndex, subtitleModel.words.length]);

  const currentChapterElapsedSeconds = useMemo(() => {
    if (!currentChapter || !subtitleModel.words.length || activeWordIndex < 0) return 0;
    return Math.round((activeWordIndex / subtitleModel.words.length) * (currentChapter.duration_seconds || 0));
  }, [activeWordIndex, currentChapter, subtitleModel.words.length]);

  const quickQuestions = useMemo(() => {
    const conceptQuestions = keyConcepts
      .slice(0, 4)
      .map((concept) => `Explain ${concept} in simple terms.`);
    const extras = [
      'Give me a quick recap in 3 points.',
      'What are the most important exam takeaways?',
      'Ask me 5 quiz questions now.',
      'What should I revise first for this topic?',
    ];
    return [...conceptQuestions, ...extras];
  }, [keyConcepts]);

  const playbackStatusLabel = useMemo(() => {
    if (!sessionId) return 'Ready';
    if (isSpeechPaused) return 'Paused';
    if (isSpeaking) return 'Speaking';
    return 'Idle';
  }, [isFullscreenMode, isSpeaking, isSpeechPaused, sessionId]);

  const stopRecordingCleanup = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    setIsRecording(false);
  };

  const syncSpeechProgress = (charIndex, model = subtitleModel) => {
    if (!model.words.length) {
      setSpeechCharIndex(-1);
      setActiveWordIndex(-1);
      setActiveSubtitleIndex(-1);
      return;
    }

    const safeCharIndex = clamp(Math.floor(Number.isFinite(charIndex) ? charIndex : 0), 0, model.text.length);
    const nextWordIndex = findWordIndexForChar(model.words, safeCharIndex);
    const nextCueIndex = findCueIndexForWord(model.cues, nextWordIndex);

    setSpeechCharIndex(safeCharIndex);
    setActiveWordIndex(nextWordIndex);
    setActiveSubtitleIndex(nextCueIndex);
  };

  const stopSpeaking = () => {
    if (!speechSupported) return;
    speechCancelRef.current = true;
    window.speechSynthesis.cancel();
    currentUtteranceRef.current = null;
    setIsSpeaking(false);
    setIsSpeechPaused(false);
  };

  const pauseSpeaking = () => {
    if (!speechSupported || !isSpeaking || isSpeechPaused) return;
    window.speechSynthesis.pause();
    setIsSpeechPaused(true);
  };

  const resumeSpeaking = () => {
    if (!speechSupported || !isSpeechPaused) return;
    window.speechSynthesis.resume();
    setIsSpeechPaused(false);
    setIsSpeaking(true);
  };

  const stopHandsFree = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch (e) { /* silenced */ }
    }
    setIsHandsFreeListening(false);
  };

  const openFullscreenMode = async () => {
    if (!sessionId || !currentSegment) return;

    setIsFullscreenMode(true);

    if (fullscreenRef.current?.requestFullscreen) {
      try {
        await fullscreenRef.current.requestFullscreen();
      } catch (e) { /* silenced */ }
    }
  };

  const closeFullscreenMode = async () => {
    setIsFullscreenMode(false);
    if (document.fullscreenElement && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch (e) { /* silenced */ }
    }
    if (onExit) onExit();
  };

  const applySessionPayload = (data) => {
    setSessionId(data.session_id || '');
    setEpisodeTitle(data.episode_title || data.title || results?.filename || 'Media Podcast');
    setCurrentSegment(data.current_segment || data?.current_chapter?.content || '');
    setCurrentIndex(data.current_index ?? -1);
    setTotalSegments(data.total_segments || (data.chapters || []).length || 0);
    setHasMore(Boolean(data.has_more));

    setSelectedVoiceMode(data.voice_mode || selectedVoiceMode);
    setVoiceProfile(data.voice_profile || null);

    setSelectedPersona(data.voice_persona || selectedPersona);
    setPersonaProfile(data.persona_profile || null);

    setSelectedDifficulty(data.difficulty || selectedDifficulty);
    setAnswerLanguage(data.answer_language || answerLanguage);

    setChapters(data.chapters || []);
    setBookmarks(data.bookmarks || []);
    setKeyTakeaways(data.key_takeaways || []);
    setFollowUps([]);

    if (data.mcq_state) {
      setMcqState(data.mcq_state);
    }

    const options = data.session_options || {};
    if (typeof options.hands_free === 'boolean') {
      setHandsFreeEnabled(options.hands_free);
    }
    if (options.wake_phrase) {
      setWakePhrase(options.wake_phrase);
    }
  };

  const persistSettings = async (override = {}) => {
    if (!sessionId) return;
    try {
      const res = await podcastAgentService.updateSettings({
        user_id: userName,
        session_id: sessionId,
        voice_mode: override.voice_mode || selectedVoiceMode,
        voice_persona: override.voice_persona || selectedPersona,
        difficulty: override.difficulty || selectedDifficulty,
        answer_language: override.answer_language || answerLanguage,
        session_options: {
          hands_free: typeof override.hands_free === 'boolean' ? override.hands_free : handsFreeEnabled,
          wake_phrase: override.wake_phrase || wakePhrase,
        },
      });
      if (res.voice_profile) setVoiceProfile(res.voice_profile);
      if (res.persona_profile) setPersonaProfile(res.persona_profile);
      if (Array.isArray(res.chapters)) setChapters(res.chapters);
      if (Array.isArray(res.key_takeaways)) setKeyTakeaways(res.key_takeaways);
      if (res.current_segment !== undefined) setCurrentSegment(res.current_segment || '');
      if (res.current_index !== undefined) setCurrentIndex(res.current_index);
      if (res.total_segments !== undefined) setTotalSegments(res.total_segments);
      if (res.has_more !== undefined) setHasMore(Boolean(res.has_more));
    } catch (e) {
      setError(e.message || 'Failed to update podcast settings');
    }
  };

  const startHandsFreeLoop = () => {
    if (!recognitionSupported) {
      setError('Hands-free mode is not supported in this browser.');
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!recognitionRef.current) {
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = questionLanguage === 'en' ? 'en-US' : questionLanguage;

      recognition.onstart = () => setIsHandsFreeListening(true);
      recognition.onerror = () => setIsHandsFreeListening(false);
      recognition.onend = () => {
        setIsHandsFreeListening(false);
        if (handsFreeEnabled && sessionId) {
          setTimeout(() => {
            try {
              recognition.start();
            } catch (e) { /* silenced */ }
          }, 250);
        }
      };

      recognition.onresult = (event) => {
        const last = event.results[event.results.length - 1];
        if (!last || !last.isFinal) return;

        const raw = (last[0]?.transcript || '').trim();
        if (!raw) return;

        const lower = raw.toLowerCase();
        const wake = wakePhrase.trim().toLowerCase();

        if (wake && !lower.includes(wake)) {
          return;
        }

        let cleaned = raw;
        if (wake) {
          const idx = lower.indexOf(wake);
          if (idx >= 0) {
            cleaned = raw.slice(idx + wake.length).trim();
          }
        }

        if (cleaned.length > 1) {
          askQuestion(cleaned);
        }
      };

      recognitionRef.current = recognition;
    }

    recognitionRef.current.lang = questionLanguage === 'en' ? 'en-US' : questionLanguage;
    try {
      recognitionRef.current.start();
    } catch (e) { /* silenced */ }
  };

  const loadSessionMemory = async () => {
    if (!userName) return;
    setIsLoadingSaved(true);
    try {
      const res = await podcastAgentService.getSavedSessions(userName, 20);
      setSavedSessions(res.sessions || []);
    } catch (e) { /* silenced */ } finally {
      setIsLoadingSaved(false);
    }
  };

  useEffect(() => {
    let ignore = false;

    const loadMeta = async () => {
      try {
        const [modeRes, personaRes, languageRes, difficultyRes] = await Promise.all([
          podcastAgentService.getVoiceModes(),
          podcastAgentService.getVoicePersonas(),
          podcastAgentService.getLanguages(),
          podcastAgentService.getDifficulties(),
        ]);

        if (ignore) return;

        setVoiceModes(
          Array.isArray(modeRes?.voice_modes) && modeRes.voice_modes.length
            ? modeRes.voice_modes
            : FALLBACK_VOICE_MODES
        );
        setVoicePersonas(personaRes?.voice_personas || []);
        setLanguages(languageRes?.languages || []);
        setDifficulties(difficultyRes?.difficulties || []);
      } catch (e) {
        if (!ignore) {
          setError(e.message || 'Failed to load podcast configuration');
        }
      }
    };

    loadMeta();
    loadSessionMemory();

    return () => {
      ignore = true;
    };
  }, [userName]);

  useEffect(() => {
    if (!speechSupported) return undefined;
    if (selectedVoiceUri) return undefined;
    if (sessionId || isSpeaking) return undefined;

    const synth = window.speechSynthesis;
    let cancelled = false;

    const loadVoices = async () => {
      const list = synth.getVoices() || [];
      const ranked = rankPreferredVoices(list);

      setVoices(ranked);
      if (!selectedVoiceUri && ranked.length > 0) {
        for (const voice of ranked) {
          
          
          const supportsBoundary = await testVoiceBoundarySupport(synth, voice);
          if (cancelled) return;
          if (supportsBoundary) {
            setSelectedVoiceUri(voice.voiceURI);
            return;
          }
        }
        if (!cancelled && ranked[0]) {
          setSelectedVoiceUri(ranked[0].voiceURI);
        }
      }
      if (!ranked.length && !cancelled) {
        setSelectedVoiceUri('');
      }
    };

    loadVoices();
    synth.addEventListener('voiceschanged', loadVoices);

    return () => {
      cancelled = true;
      synth.removeEventListener('voiceschanged', loadVoices);
    };
  }, [selectedVoiceUri, speechSupported, sessionId, isSpeaking]);

  useEffect(() => () => {
    stopSpeaking();
    stopRecordingCleanup();
    stopHandsFree();
    document.body.classList.remove('podcast-fullscreen-open');
  }, []);

  useEffect(() => {
    stopSpeaking();
    stopHandsFree();
    setSessionId('');
    setEpisodeTitle('');
    setCurrentSegment('');
    setCurrentIndex(-1);
    setTotalSegments(0);
    setHasMore(false);
    setConversation([]);
    setQuestion('');
    setChapters([]);
    setBookmarks([]);
    setFollowUps([]);
    setKeyTakeaways([]);
    setMcqState({ active: false });
    setMcqFeedback('');
    setCopied(false);
    setError('');
    setHandsFreeEnabled(false);
    setIsSpeechPaused(false);
    setSpeechCharIndex(-1);
    setActiveWordIndex(-1);
    setActiveSubtitleIndex(-1);
    setHoveredSubtitleIndex(-1);
    setIsFullscreenMode(false);
  }, [results?.filename]);

  useEffect(() => {
    const settings = results?.podcast_settings || {};
    const sessionOptions = settings.session_options || {};

    if (settings.voice_mode) setSelectedVoiceMode(settings.voice_mode);
    if (settings.voice_persona) setSelectedPersona(settings.voice_persona);
    if (settings.difficulty) setSelectedDifficulty(settings.difficulty);
    if (settings.answer_language) {
      setAnswerLanguage(settings.answer_language);
      setQuestionLanguage(settings.answer_language);
    }
    if (typeof sessionOptions.hands_free === 'boolean') {
      setHandsFreeEnabled(sessionOptions.hands_free);
    }
    if (sessionOptions.wake_phrase) {
      setWakePhrase(sessionOptions.wake_phrase);
    }
  }, [results?.filename]);

  useEffect(() => {
    if (chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    }
  }, [conversation.length]);

  useEffect(() => {
    if (!normalizedCurrentSegment) {
      setSpeechCharIndex(-1);
      setActiveWordIndex(-1);
      setActiveSubtitleIndex(-1);
      setHoveredSubtitleIndex(-1);
      setIsSpeechPaused(false);
      return;
    }

    setSpeechCharIndex(-1);
    setActiveWordIndex(-1);
    setActiveSubtitleIndex(-1);
    setHoveredSubtitleIndex(-1);
    setIsSpeechPaused(false);
  }, [normalizedCurrentSegment]);

  useEffect(() => {
    document.body.classList.toggle('podcast-fullscreen-open', isFullscreenMode);
    return () => {
      document.body.classList.remove('podcast-fullscreen-open');
    };
  }, [isFullscreenMode]);

  useEffect(() => {
    if (!isFullscreenMode || activeSubtitleIndex < 0) return;

    const activeNode = subtitleRefs.current[activeSubtitleIndex];
    if (activeNode) {
      activeNode.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [activeSubtitleIndex, isFullscreenMode]);

  const speakText = (text, options = {}) => {
    if (!speechSupported || !text) return;

    const normalizedText = normalizeText(text);
    if (!normalizedText) return;

    stopSpeaking();

    const rawStartChar = clamp(Number(options.startChar || 0), 0, normalizedText.length);
    const rawSlice = normalizedText.slice(rawStartChar);
    const leadingWhitespace = rawSlice.length - rawSlice.trimStart().length;
    const startChar = rawStartChar + leadingWhitespace;
    const speechText = rawSlice.trimStart();
    const shouldSyncSubtitles = Boolean(options.syncSubtitles);
    const speechModel = shouldSyncSubtitles
      ? (options.subtitleModel || buildSubtitleModel(normalizedText))
      : null;

    if (!speechText) return;

    const utterance = new SpeechSynthesisUtterance(speechText);
    const selectedVoice = voices.find((voice) => voice.voiceURI === selectedVoiceUri);

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    utterance.lang = selectedVoice?.lang || 'en-US';

    const modeRate = voiceProfile?.speech_rate || 1;
    const modePitch = voiceProfile?.speech_pitch || 1;
    const personaRate = personaProfile?.speech_rate || 1;
    const personaPitch = personaProfile?.speech_pitch || 1;
    utterance.rate = clamp(((modeRate + personaRate) / 2) * playbackRate, 0.75, 1.35);
    utterance.pitch = clamp((modePitch + personaPitch) / 2, 0.75, 1.3);

    utterance.onstart = () => {
      speechCancelRef.current = false;
      setIsSpeaking(true);
      setIsSpeechPaused(false);
      if (shouldSyncSubtitles && speechModel) {
        syncSpeechProgress(startChar, speechModel);
      }
    };
    utterance.onpause = () => {
      setIsSpeechPaused(true);
      setIsSpeaking(true);
    };
    utterance.onresume = () => {
      setIsSpeechPaused(false);
      setIsSpeaking(true);
    };
    utterance.onboundary = (event) => {
      if (shouldSyncSubtitles && speechModel && typeof event.charIndex === 'number') {
        syncSpeechProgress(startChar + event.charIndex, speechModel);
      }
    };
    utterance.onend = () => {
      const wasCancelled = speechCancelRef.current;
      speechCancelRef.current = false;
      currentUtteranceRef.current = null;
      setIsSpeaking(false);
      setIsSpeechPaused(false);

      if (!wasCancelled && shouldSyncSubtitles && speechModel) {
        syncSpeechProgress(normalizedText.length, speechModel);
      }
    };
    utterance.onerror = () => {
      speechCancelRef.current = false;
      currentUtteranceRef.current = null;
      setIsSpeaking(false);
      setIsSpeechPaused(false);
    };

    currentUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const playCurrentSegment = (startChar = 0) => {
    if (!normalizedCurrentSegment || !speechSupported) return;
    speakText(normalizedCurrentSegment, { startChar, syncSubtitles: true, subtitleModel });
  };

  const handlePlay = () => {
    if (isSpeechPaused) {
      resumeSpeaking();
      return;
    }

    if (!subtitleModel.words.length) {
      playCurrentSegment(0);
      return;
    }

    const shouldRestart = activeWordIndex < 0 || activeWordIndex >= subtitleModel.words.length - 1;
    const resumeWord = shouldRestart ? subtitleModel.words[0] : subtitleModel.words[activeWordIndex];
    playCurrentSegment(resumeWord?.startChar || 0);
  };

  const speakIfEnabled = (text, options = {}) => {
    if (autoPlay) {
      speakText(text, options);
    }
  };

  const appendConversation = (entry) => {
    setConversation((prev) => [...prev, { ...entry, id: `${Date.now()}-${Math.random()}` }]);
  };

  const startSession = async () => {
    if (!transcript || transcript.length < 100) {
      setError('This note does not have enough transcript content to create a podcast session.');
      return;
    }

    stopSpeaking();
    setError('');
    setIsStarting(true);

    try {
      const response = await podcastAgentService.startSession({
        user_id: userName,
        transcript,
        analysis: results?.analysis || {},
        title: results?.filename || 'Media Podcast',
        source_type: results?.source_type || 'media',
        voice_mode: selectedVoiceMode,
        voice_persona: selectedPersona,
        difficulty: selectedDifficulty,
        answer_language: answerLanguage,
        session_options: {
          hands_free: handsFreeEnabled,
          wake_phrase: wakePhrase,
        },
      });

      applySessionPayload(response);
      setConversation([]);
      if (response.current_segment) {
        appendConversation({ role: 'assistant', type: 'narration', content: response.current_segment });
        speakIfEnabled(response.current_segment, { syncSubtitles: true });
      }
      await loadSessionMemory();
    } catch (e) {
      setError(e.message || 'Failed to start podcast session');
    } finally {
      setIsStarting(false);
    }
  };

  const resumeSession = async (targetSessionId) => {
    if (!targetSessionId) return;

    stopSpeaking();
    setError('');
    try {
      const response = await podcastAgentService.resumeSession({
        user_id: userName,
        session_id: targetSessionId,
      });
      applySessionPayload(response);
      setConversation([]);
      if (response.current_segment) {
        appendConversation({ role: 'assistant', type: 'narration', content: response.current_segment });
      }
    } catch (e) {
      setError(e.message || 'Failed to resume podcast session');
    }
  };

  const fetchNextSegment = async () => {
    if (!sessionId) return;

    stopSpeaking();
    setError('');
    setIsFetchingNext(true);

    try {
      const response = await podcastAgentService.nextSegment({
        user_id: userName,
        session_id: sessionId,
      });

      setCurrentSegment(response.current_segment || '');
      setCurrentIndex(response.current_index ?? currentIndex);
      setTotalSegments(response.total_segments || totalSegments);
      setHasMore(Boolean(response.has_more));

      if (response.chapter) {
        setCurrentIndex(response.chapter.index);
      }

      if (response.current_segment) {
        appendConversation({ role: 'assistant', type: 'narration', content: response.current_segment });
        speakIfEnabled(response.current_segment, { syncSubtitles: true });
      }
    } catch (e) {
      setError(e.message || 'Failed to load next segment');
    } finally {
      setIsFetchingNext(false);
    }
  };

  const jumpToChapter = async (chapterIndex) => {
    if (!sessionId) return;

    stopSpeaking();
    setError('');
    try {
      const response = await podcastAgentService.jumpToChapter({
        user_id: userName,
        session_id: sessionId,
        chapter_index: chapterIndex,
      });

      setCurrentSegment(response.current_segment || '');
      setCurrentIndex(response.current_index ?? chapterIndex);
      setTotalSegments(response.total_segments || totalSegments);
      setHasMore(Boolean(response.has_more));

      if (response.current_segment) {
        appendConversation({ role: 'assistant', type: 'narration', content: response.current_segment });
        speakIfEnabled(response.current_segment, { syncSubtitles: true });
      }
    } catch (e) {
      setError(e.message || 'Failed to jump chapter');
    }
  };

  const goToPreviousChapter = async () => {
    if (!sessionId || currentIndex <= 0) return;
    await jumpToChapter(currentIndex - 1);
  };

  const addBookmark = async () => {
    if (!sessionId) return;

    setError('');
    try {
      const response = await podcastAgentService.addBookmark({
        user_id: userName,
        session_id: sessionId,
        chapter_index: currentIndex >= 0 ? currentIndex : 0,
      });

      setBookmarks(response.bookmarks || []);
    } catch (e) {
      setError(e.message || 'Failed to add bookmark');
    }
  };

  const replayBookmark = async (bookmarkId) => {
    if (!sessionId || !bookmarkId) return;

    stopSpeaking();
    setError('');
    try {
      const response = await podcastAgentService.replayBookmark({
        user_id: userName,
        session_id: sessionId,
        bookmark_id: bookmarkId,
      });

      setCurrentSegment(response.current_segment || '');
      setCurrentIndex(response.current_index ?? currentIndex);
      setTotalSegments(response.total_segments || totalSegments);
      setHasMore(Boolean(response.has_more));

      if (response.current_segment) {
        appendConversation({ role: 'assistant', type: 'narration', content: response.current_segment });
        speakIfEnabled(response.current_segment, { syncSubtitles: true });
      }
    } catch (e) {
      setError(e.message || 'Failed to replay bookmark');
    }
  };

  const startMcqDrill = async () => {
    if (!sessionId) {
      setError('Start a podcast session first.');
      return;
    }

    setError('');
    setMcqFeedback('');

    try {
      const response = await podcastAgentService.startMcqDrill({
        user_id: userName,
        session_id: sessionId,
        count: 5,
      });
      setMcqState(response);
    } catch (e) {
      setError(e.message || 'Failed to start MCQ drill');
    }
  };

  const answerMcq = async (selectedIndex) => {
    if (!sessionId || !mcqState?.question) return;

    try {
      const response = await podcastAgentService.answerMcq({
        user_id: userName,
        session_id: sessionId,
        question_index: mcqState.question.index,
        selected_index: selectedIndex,
      });

      setMcqFeedback(
        `${response.is_correct ? 'Correct' : 'Incorrect'} · ${response.explanation || ''}`
      );

      if (response.completed) {
        setMcqState({
          active: false,
          score: response.score,
          total: response.total,
          completed: true,
          summary: response.summary,
        });
      } else {
        setMcqState((prev) => ({
          ...prev,
          active: true,
          score: response.score,
          total: response.total,
          current_index: response.next_question?.index,
          question: response.next_question,
        }));
      }
    } catch (e) {
      setError(e.message || 'Failed to answer MCQ');
    }
  };

  const askQuestion = async (questionText = question) => {
    if (!sessionId) {
      setError('Start a podcast session first.');
      return;
    }

    const cleaned = (questionText || '').trim();
    if (!cleaned) return;

    setError('');
    setIsAsking(true);

    appendConversation({ role: 'user', type: 'question', content: cleaned });
    setQuestion('');

    try {
      const response = await podcastAgentService.askQuestion({
        user_id: userName,
        session_id: sessionId,
        question: cleaned,
        voice_mode: selectedVoiceMode,
        voice_persona: selectedPersona,
        difficulty: selectedDifficulty,
        question_language: questionLanguage,
        answer_language: answerLanguage,
      });

      if (response.voice_profile) setVoiceProfile(response.voice_profile);
      if (response.persona_profile) setPersonaProfile(response.persona_profile);
      if (response.answer_language) setAnswerLanguage(response.answer_language);

      const answer = response.answer || 'I could not generate a response right now.';
      appendConversation({ role: 'assistant', type: 'answer', content: answer });
      setFollowUps(response.follow_up_suggestions || []);
      speakIfEnabled(answer);

      if (response.mcq_drill) {
        setMcqState(response.mcq_drill);
      }
    } catch (e) {
      setError(e.message || 'Failed to ask question');
    } finally {
      setIsAsking(false);
    }
  };

  const transcribeQuestionBlob = async (audioBlob) => {
    if (!audioBlob || audioBlob.size === 0) {
      setError('No audio recorded. Please try again.');
      return;
    }

    setIsTranscribing(true);
    setError('');

    try {
      const token = getAuthToken();
      const formData = new FormData();
      formData.append('audio_file', audioBlob, 'podcast-question.webm');
      formData.append('user_id', userName);

      const data = USE_AI_JOB_QUEUE
        ? await queueLegacyAIFileEndpoint(
            '/api/transcribe_audio/',
            { user_id: userName },
            [{ fieldName: 'audio_file', file: audioBlob, filename: 'podcast-question.webm' }],
            { timeoutMs: 180000 }
          )
        : await (async () => {
            const response = await fetch(`${API_URL}/transcribe_audio/`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
              },
              body: formData,
            });

            if (!response.ok) {
              const text = await response.text();
              throw new Error(text || 'Voice transcription failed');
            }

            return response.json();
          })();
      const transcriptQuestion = (data?.transcript || '').trim();

      if (!transcriptQuestion) {
        throw new Error('No question detected in recorded audio');
      }

      setQuestion(transcriptQuestion);
      await askQuestion(transcriptQuestion);
    } catch (e) {
      setError(e.message || 'Failed to transcribe voice question');
    } finally {
      setIsTranscribing(false);
    }
  };

  const startRecordingQuestion = async () => {
    if (isRecording || isTranscribing) return;

    setError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      let recorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      } catch (e) {
        recorder = new MediaRecorder(stream);
      }

      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stopRecordingCleanup();
        await transcribeQuestionBlob(blob);
      };

      recorder.start();
      setIsRecording(true);
    } catch (e) {
      setError('Microphone access failed. Check browser permissions and try again.');
      stopRecordingCleanup();
    }
  };

  const stopRecordingQuestion = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const toggleHandsFree = async () => {
    if (!sessionId) {
      setError('Start or resume a session before enabling hands-free mode.');
      return;
    }

    const next = !handsFreeEnabled;
    setHandsFreeEnabled(next);

    if (next) {
      startHandsFreeLoop();
    } else {
      stopHandsFree();
    }

    await persistSettings({ hands_free: next, wake_phrase: wakePhrase });
  };

  const stopSession = async () => {
    stopSpeaking();
    stopHandsFree();

    if (!sessionId) {
      setIsFullscreenMode(false);
      return;
    }

    try {
      await podcastAgentService.stopSession({
        user_id: userName,
        session_id: sessionId,
      });
    } catch (e) { /* silenced */ }

    setSessionId('');
    setHasMore(false);
    setCurrentSegment('');
    setCurrentIndex(-1);
    setTotalSegments(0);
    setChapters([]);
    setBookmarks([]);
    setFollowUps([]);
    setHandsFreeEnabled(false);
    await loadSessionMemory();
  };

  const handleVoiceModeChange = async (modeId) => {
    setSelectedVoiceMode(modeId);

    if (!sessionId) return;

    try {
      const response = await podcastAgentService.setVoiceMode({
        user_id: userName,
        session_id: sessionId,
        voice_mode: modeId,
      });
      if (response.voice_profile) {
        setVoiceProfile(response.voice_profile);
      }
      if (Array.isArray(response.chapters)) setChapters(response.chapters);
      if (Array.isArray(response.key_takeaways)) setKeyTakeaways(response.key_takeaways);
      if (response.current_segment !== undefined) {
        stopSpeaking();
        setCurrentSegment(response.current_segment || '');
        appendConversation({ role: 'assistant', type: 'narration', content: response.current_segment || '' });
        speakIfEnabled(response.current_segment || '', { syncSubtitles: true });
      }
      if (response.current_index !== undefined) setCurrentIndex(response.current_index);
      if (response.total_segments !== undefined) setTotalSegments(response.total_segments);
      if (response.has_more !== undefined) setHasMore(Boolean(response.has_more));
    } catch (e) {
      setError(e.message || 'Failed to switch voice mode');
    }
  };

  const handlePersonaChange = async (personaId) => {
    setSelectedPersona(personaId);
    if (sessionId) {
      await persistSettings({ voice_persona: personaId });
    }
  };

  const handleDifficultyChange = async (difficulty) => {
    setSelectedDifficulty(difficulty);
    if (sessionId) {
      await persistSettings({ difficulty });
    }
  };

  const handleAnswerLanguageChange = async (lang) => {
    setAnswerLanguage(lang);
    if (sessionId) {
      await persistSettings({ answer_language: lang });
    }
  };

  const clearConversation = () => {
    setConversation([]);
    setCopied(false);
    setFollowUps([]);
  };

  const copyLatestAnswer = async () => {
    const latestAssistant = [...conversation].reverse().find((item) => item.role === 'assistant');
    if (!latestAssistant?.content) return;
    try {
      await navigator.clipboard.writeText(latestAssistant.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch (e) {
      setError('Failed to copy response');
    }
  };

  const exportSession = async (formatType) => {
    if (!sessionId) {
      setError('No active session to export.');
      return;
    }

    setIsExporting(true);
    setError('');

    try {
      const response = await podcastAgentService.exportSession({
        user_id: userName,
        session_id: sessionId,
        format_type: formatType,
      });

      const blob = new Blob([response.content || ''], {
        type: formatType === 'json' ? 'application/json' : 'text/markdown;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = response.filename || `podcast-session.${formatType === 'json' ? 'json' : 'md'}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || 'Failed to export podcast session');
    } finally {
      setIsExporting(false);
    }
  };

  const seekToSubtitle = (cue) => {
    if (!cue || !normalizedCurrentSegment) return;

    setHoveredSubtitleIndex(cue.index);
    setSpeechCharIndex(cue.startChar);
    setActiveWordIndex(cue.startWordIndex);
    setActiveSubtitleIndex(cue.index);
    playCurrentSegment(cue.startChar);
  };

  const handleQuestionKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      askQuestion(question);
    }
  };

  const difficultySliderValue = difficultyIndexMap[selectedDifficulty] ?? 1;
  const canOpenFullscreen = Boolean(sessionId && currentSegment);
  const fullscreenTitle = getPodcastDisplayTitle(sessionId ? (episodeTitle || 'Podcast Session') : results?.filename);

  return (
    <div className="podcast-fullscreen-shell" ref={fullscreenRef}>
      <div className="podcast-fullscreen-backdrop" />
      <div className="podcast-fullscreen">

        {}
        <div className="podcast-fullscreen-topbar">
          <div className="podcast-fullscreen-heading">
            <span className="podcast-fullscreen-kicker">
              {sessionId ? 'Immersive Podcast Mode' : 'Podcast Studio'}
            </span>
            <h3 title={fullscreenTitle}>{fullscreenTitle}</h3>
            {sessionId && (
              <p>{currentChapter ? `Chapter ${currentChapter.index + 1}: ${currentChapter.title}` : 'Starting session...'}</p>
            )}
          </div>
          <div className="podcast-fullscreen-topbar-actions">
            {sessionId && (
              <div className="podcast-fullscreen-status">
                <span>{playbackStatusLabel}</span>
                <strong>{currentChapter ? `${formatTime(currentChapterElapsedSeconds)} / ${formatTime(currentChapter.duration_seconds || 0)}` : '0:00 / 0:00'}</strong>
              </div>
            )}
            <button className={`podcast-btn ${showSettingsDrawer ? 'primary' : ''}`} onClick={() => setShowSettingsDrawer((d) => !d)}>
              <Settings size={14} />
              <span>Settings</span>
            </button>
            <button className="podcast-btn" onClick={closeFullscreenMode}>
              <X size={14} />
              <span>Exit</span>
            </button>
          </div>
        </div>

        {}
        {!sessionId ? (

          
          <div className="podcast-prelaunch">
            <aside className="podcast-prelaunch-sidebar notes-sidebar-system" aria-label="Podcast studio navigation">
              <div className="notes-sidebar-texture" aria-hidden="true" />
              <div className="podcast-rail-texture" aria-hidden />
              <div className="podcast-studio-brand">
                <strong>cerbyl</strong>
                <span>Podcast Studio</span>
              </div>

              <div className="podcast-studio-side-block">
                <span className="podcast-studio-side-label">Source</span>
                <strong className="podcast-studio-source-title">{getPodcastDisplayTitle(results?.filename)}</strong>
                <div className="podcast-studio-source-meta">
                  <span>{transcript.split(' ').filter(Boolean).length.toLocaleString()} words</span>
                  <span>{keyConcepts.length} concepts</span>
                </div>
              </div>

              <div className="podcast-studio-side-block podcast-studio-side-block--grow">
                <span className="podcast-studio-side-label">Recent sessions</span>
                <div className="podcast-studio-recents">
                  {savedSessions.length > 0 ? savedSessions.slice(0, 5).map((item) => (
                    <button key={`prelaunch-${item.session_id}`} type="button" onClick={() => resumeSession(item.session_id)}>
                      <strong>{item.title || 'Podcast Session'}</strong>
                      <span>{item.voice_mode} · chapter {Math.max((item.current_index || 0) + 1, 1)}</span>
                    </button>
                  )) : <p>No saved sessions yet.</p>}
                </div>
              </div>

              <button className="podcast-studio-back" type="button" onClick={closeFullscreenMode}>
                <X size={14} /><span>Back to media notes</span>
              </button>
            </aside>

            <section className="podcast-prelaunch-main">
              {isStarting ? (
                <div className="podcast-prelaunch-starting">
                  <Loader2 size={40} className="spin" />
                  <p>Starting your session…</p>
                </div>
              ) : (
                <div className="podcast-prelaunch-inner">
                  <div className="podcast-prelaunch-intro">
                    <div className="podcast-prelaunch-orb">
                      <Headphones size={34} />
                    </div>
                    <div>
                      <span className="podcast-fullscreen-kicker">Build your listening session</span>
                      <h4>Choose how Cerbyl should teach this source.</h4>
                      <p>Voice mode changes the pacing, explanation style, and how often the session checks your understanding.</p>
                    </div>
                  </div>

                  <p className="podcast-prelaunch-label">Voice mode</p>
                  <div className="podcast-prelaunch-modes">
                    {voiceModes.map((mode, index) => (
                      <button
                        key={mode.id}
                        type="button"
                        className={`podcast-prelaunch-mode ${selectedVoiceMode === mode.id ? 'active' : ''}`}
                        aria-pressed={selectedVoiceMode === mode.id}
                        onClick={() => setSelectedVoiceMode(mode.id)}
                      >
                        <span className="podcast-mode-index">{String(index + 1).padStart(2, '0')}</span>
                        <strong>{mode.label}</strong>
                        <span>{mode.description}</span>
                      </button>
                    ))}
                  </div>

                  <div className="podcast-prelaunch-launchbar">
                    <div>
                      <span>Ready to produce</span>
                      <strong>{voiceModes.find((mode) => mode.id === selectedVoiceMode)?.label || selectedVoiceMode}</strong>
                    </div>
                    <button
                      type="button"
                      className="podcast-prelaunch-cta"
                      onClick={startSession}
                      disabled={isStarting || !transcript || transcript.length < 100}
                    >
                      <Play size={18} />
                      <span>Start Session</span>
                    </button>
                  </div>

                  {error && (
                    <div className="podcast-error podcast-prelaunch-error">
                      <Mic size={13} />
                      <span>{error}</span>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

        ) : (

          
          <div className={`podcast-fullscreen-body ${subtitlesExpanded ? 'podcast-fullscreen-body--subtitles-expanded' : ''}`}>
            <aside className="podcast-fullscreen-rail notes-sidebar-system">
              <div className="notes-sidebar-texture" aria-hidden="true" />
              <div className="podcast-rail-texture" aria-hidden />
              <div className="podcast-studio-brand podcast-studio-brand--rail">
                <strong>cerbyl</strong>
                <span>Podcast</span>
              </div>
              <div className="podcast-fullscreen-panel">
                <div className="podcast-fullscreen-panel-head">
                  <List size={15} />
                  <span>Chapter Rail</span>
                </div>
                <div className="podcast-fullscreen-chapters">
                  {chapters.map((chapter) => (
                    <button
                      key={`fs-chapter-${chapter.index}`}
                      className={`podcast-fullscreen-chapter ${chapter.index === currentIndex ? 'active' : ''}`}
                      onClick={() => jumpToChapter(chapter.index)}
                    >
                      <strong>{chapter.index + 1}. {chapter.title}</strong>
                      <span>{formatTime(chapter.start_second)} · {chapter.duration_seconds}s</span>
                    </button>
                  ))}
                </div>
              </div>

              {bookmarks.length > 0 && (
                <div className="podcast-fullscreen-panel">
                  <div className="podcast-fullscreen-panel-head">
                    <BookmarkPlus size={15} />
                    <span>Bookmarks</span>
                  </div>
                  <div className="podcast-fullscreen-bookmarks">
                    {bookmarks.map((bookmark) => (
                      <button key={`fs-bookmark-${bookmark.id}`} className="podcast-fullscreen-bookmark" onClick={() => replayBookmark(bookmark.id)}>
                        <strong>{bookmark.label}</strong>
                        <span>{bookmark.timestamp_label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </aside>

            <section className={`podcast-fullscreen-stage ${subtitlesExpanded ? 'podcast-fullscreen-stage--subtitles-expanded' : ''}`}>
              <div className="podcast-fullscreen-stage-card">
                <div className="podcast-fullscreen-stage-meta">
                  <div className="podcast-fullscreen-orb">
                    <Headphones size={22} />
                  </div>
                  <div>
                    <span className="podcast-fullscreen-meta-kicker">Now Playing</span>
                    <h4>{currentChapter?.title || 'Current Chapter'}</h4>
                    <p>{voiceProfile?.label || selectedVoiceMode} · {selectedPersona} · {playbackRate.toFixed(2)}x</p>
                  </div>
                </div>

                <div className="podcast-fullscreen-progress">
                  <div className="podcast-fullscreen-progress-bar">
                    <div className="podcast-fullscreen-progress-fill" style={{ width: `${currentChapterProgressPercent}%` }} />
                  </div>
                  <div className="podcast-fullscreen-progress-labels">
                    <span>{formatTime(currentChapterElapsedSeconds)}</span>
                    <span>{currentChapter ? formatTime(currentChapter.duration_seconds || 0) : '0:00'}</span>
                  </div>
                </div>

                <div className="podcast-fullscreen-controls">
                  <button className="podcast-btn podcast-btn--transport" onClick={goToPreviousChapter} disabled={currentIndex <= 0}>
                    <SkipBack size={16} /><span>Previous</span>
                  </button>
                  <button className="podcast-btn podcast-btn--transport primary" onClick={handlePlay} disabled={!normalizedCurrentSegment || !speechSupported}>
                    <Play size={16} /><span>{isSpeechPaused ? 'Resume' : 'Play'}</span>
                  </button>
                  <button className="podcast-btn podcast-btn--transport" onClick={pauseSpeaking} disabled={!isSpeaking || isSpeechPaused}>
                    <Pause size={16} /><span>Pause</span>
                  </button>
                  <button className="podcast-btn podcast-btn--transport" onClick={fetchNextSegment} disabled={isFetchingNext || !hasMore}>
                    {isFetchingNext ? <Loader2 size={16} className="spin" /> : <SkipForward size={16} />}
                    <span>Next</span>
                  </button>
                  <button className="podcast-btn podcast-btn--transport" onClick={addBookmark} disabled={!sessionId}>
                    <BookmarkPlus size={16} /><span>Bookmark</span>
                  </button>
                  <button className="podcast-btn podcast-btn--transport danger" onClick={stopSession}>
                    <Square size={16} /><span>Stop</span>
                  </button>
                </div>

                <div className="podcast-fullscreen-mix">
                  <label className="podcast-fullscreen-slider">
                    <span>Playback Speed</span>
                    <input type="range" min="0.85" max="1.2" step="0.01" value={playbackRate} onChange={(e) => setPlaybackRate(Number(e.target.value))} />
                    <strong>{playbackRate.toFixed(2)}x</strong>
                  </label>
                  <label className="podcast-toggle-label">
                    <input type="checkbox" checked={autoPlay} onChange={(e) => setAutoPlay(e.target.checked)} />
                    Auto-play next response
                  </label>
                </div>
              </div>

              <div className="podcast-fullscreen-subtitles">
                <div className="podcast-fullscreen-subtitles-head">
                  <div>
                    <span className="podcast-fullscreen-meta-kicker">Subtitles</span>
                    <h4>Click any subtitle to jump playback there</h4>
                  </div>
                  <div className="podcast-fullscreen-subtitle-actions">
                    <div className="podcast-fullscreen-subtitle-meta">
                      <span>{subtitleModel.cues.length} cues</span>
                      <span>{speechCharIndex >= 0 ? `${currentChapterProgressPercent}% synced` : 'Waiting to play'}</span>
                    </div>
                    <button
                      className="podcast-subtitles-expand-btn"
                      onClick={() => setSubtitlesExpanded((expanded) => !expanded)}
                      type="button"
                      aria-pressed={subtitlesExpanded}
                    >
                      {subtitlesExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                      <span>{subtitlesExpanded ? 'Mini Mode' : 'Fullscreen'}</span>
                    </button>
                  </div>
                </div>

                <div className="podcast-fullscreen-subtitle-list">
                  {subtitleModel.cues.length === 0 ? (
                    <p className="podcast-placeholder">Start playback to see synced subtitles here.</p>
                  ) : (
                    subtitleModel.cues.map((cue) => {
                      const isActiveCue = cue.index === activeSubtitleIndex;
                      const isHoveredCue = cue.index === hoveredSubtitleIndex;
                      const isPastCue = activeWordIndex > cue.endWordIndex;
                      const cueOffset = currentChapter && subtitleModel.words.length
                        ? Math.round((cue.startWordIndex / subtitleModel.words.length) * (currentChapter.duration_seconds || 0))
                        : 0;

                      return (
                        <button
                          key={`fs-cue-${cue.index}`}
                          ref={(node) => { subtitleRefs.current[cue.index] = node; }}
                          className={`podcast-fullscreen-subtitle ${isActiveCue ? 'active' : ''} ${isHoveredCue ? 'hovered' : ''} ${isPastCue ? 'past' : ''}`}
                          onMouseEnter={() => setHoveredSubtitleIndex(cue.index)}
                          onMouseLeave={() => setHoveredSubtitleIndex(-1)}
                          onFocus={() => setHoveredSubtitleIndex(cue.index)}
                          onBlur={() => setHoveredSubtitleIndex(-1)}
                          onClick={() => seekToSubtitle(cue)}
                        >
                          <span className="podcast-fullscreen-subtitle-time">{formatTime(cueOffset)}</span>
                          <span className="podcast-fullscreen-subtitle-text">
                            {cue.words.map((word, index) => {
                              const globalWordIndex = cue.startWordIndex + index;
                              const wordClassName = ['podcast-fullscreen-word', globalWordIndex < activeWordIndex ? 'spoken' : '', globalWordIndex === activeWordIndex ? 'active' : ''].filter(Boolean).join(' ');
                              return <span key={`${cue.index}-${word.startChar}`} className={wordClassName}>{word.text}</span>;
                            })}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {error && sessionId && (
          <div className="podcast-error podcast-fs-error">
            <Mic size={13} /><span>{error}</span>
          </div>
        )}
      </div>

      {}
      {showSettingsDrawer && (
        <div className="podcast-settings-overlay" onClick={closeSettingsDrawer}>
          <aside className="podcast-settings-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="podcast-settings-drawer-head">
              <span>Settings</span>
              <button
                className="podcast-tool-btn podcast-settings-close-btn"
                onMouseDown={handleSettingsCloseInteraction}
                onPointerDown={handleSettingsCloseInteraction}
                onClick={handleSettingsCloseInteraction}
                aria-label="Close settings"
                type="button"
              >
                <X size={14} />
              </button>
            </div>

            <div className="podcast-settings-drawer-body">
              <p className="podcast-settings-section-label">Voice Mode</p>
              <div className="podcast-mode-list">
                {voiceModes.map((mode) => (
                  <button key={mode.id} className={`podcast-mode-pill ${selectedVoiceMode === mode.id ? 'active' : ''}`} onClick={() => handleVoiceModeChange(mode.id)}>
                    <strong>{mode.label}</strong>
                    <span>{mode.description}</span>
                  </button>
                ))}
              </div>

              <p className="podcast-settings-section-label">Language & Voice</p>
              <div className="podcast-settings-stack">
                <div className="podcast-setting-row">
                  <label>Ask In</label>
                  <select value={questionLanguage} onChange={(e) => setQuestionLanguage(e.target.value)}>
                    {languages.map((lang) => <option key={lang.code} value={lang.code}>{lang.label}</option>)}
                  </select>
                </div>
                <div className="podcast-setting-row">
                  <label>Answer In</label>
                  <select value={answerLanguage} onChange={(e) => handleAnswerLanguageChange(e.target.value)}>
                    {languages.map((lang) => <option key={lang.code} value={lang.code}>{lang.label}</option>)}
                  </select>
                </div>
                <div className="podcast-setting-row">
                  <label>Persona</label>
                  <select value={selectedPersona} onChange={(e) => handlePersonaChange(e.target.value)}>
                    {voicePersonas.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                <div className="podcast-setting-row">
                  <label>Voice</label>
                  <select value={selectedVoiceUri} onChange={(e) => setSelectedVoiceUri(e.target.value)} disabled={!speechSupported || voices.length === 0}>
                    {voices.length === 0 && <option value="">No Google voices available</option>}
                    {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
                  </select>
                </div>
              </div>

              <p className="podcast-settings-section-label">Playback</p>
              <div className="podcast-settings-stack">
                <div className="podcast-setting-row">
                  <label>Difficulty</label>
                  <div className="podcast-range-row">
                    <input type="range" min="0" max="2" step="1" value={difficultySliderValue} onChange={(e) => handleDifficultyChange(difficultyFromIndex(Number(e.target.value)))} />
                    <span>{selectedDifficulty}</span>
                  </div>
                </div>
                <div className="podcast-setting-row">
                  <label>Speed</label>
                  <div className="podcast-range-row">
                    <input type="range" min="0.85" max="1.2" step="0.01" value={playbackRate} onChange={(e) => setPlaybackRate(Number(e.target.value))} />
                    <span>{playbackRate.toFixed(2)}x</span>
                  </div>
                </div>
              </div>
              <div className="podcast-toggle-strip">
                <label className="podcast-toggle-label">
                  <input type="checkbox" checked={autoPlay} onChange={(e) => setAutoPlay(e.target.checked)} />
                  Auto-play
                </label>
                <label className="podcast-toggle-label">
                  <input type="checkbox" checked={handsFreeEnabled} onChange={toggleHandsFree} />
                  Hands-free {isHandsFreeListening ? '· listening' : ''}
                </label>
              </div>
              {handsFreeEnabled && (
                <input type="text" value={wakePhrase} onChange={(e) => setWakePhrase(e.target.value)} onBlur={() => persistSettings({ wake_phrase: wakePhrase })} placeholder="Wake phrase (e.g. hey cerbyl)" className="podcast-wake-input" style={{ marginTop: 12 }} />
              )}

              {savedSessions.length > 0 && (
                <>
                  <p className="podcast-settings-section-label">Saved Sessions</p>
                  <div className="podcast-saved-list">
                    {savedSessions.slice(0, 6).map((item) => (
                      <button key={item.session_id} className="podcast-saved-item" onClick={() => { resumeSession(item.session_id); setShowSettingsDrawer(false); }}>
                        <strong>{item.title || 'Podcast Session'}</strong>
                        <span>{item.voice_mode} · {item.difficulty} · ch {Math.max((item.current_index || 0) + 1, 1)}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default PodcastStudio;
