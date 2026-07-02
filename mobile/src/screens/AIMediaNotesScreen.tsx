import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  ScrollView, Animated, KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import HapticTouchable from '../components/HapticTouchable';
import AmbientBubbles from '../components/AmbientBubbles';
import { AuthUser } from '../services/auth';
import { useAppTheme } from '../contexts/ThemeContext';
import { processMediaYouTube, getMediaHistory, saveMediaNotes } from '../services/api';
import { darkenColor, getDefaultTheme, rgbaFromHex } from '../utils/theme';
import { getResponsiveLayout, useResponsiveLayout } from '../hooks/useResponsiveLayout';

const DEFAULT_THEME = getDefaultTheme();
const DEFAULT_LAYOUT = getResponsiveLayout(393, 852);
let CURRENT_THEME = DEFAULT_THEME;
let BG      = DEFAULT_THEME.bgPrimary;
let SURFACE = DEFAULT_THEME.panel;
let GOLD_XL = DEFAULT_THEME.accent;
let GOLD_L  = DEFAULT_THEME.accentHover;
let GOLD_M  = DEFAULT_THEME.accent;
let GOLD_D  = darkenColor(DEFAULT_THEME.accent, DEFAULT_THEME.isLight ? 10 : 26);
let GOLD_XD = darkenColor(DEFAULT_THEME.accent, DEFAULT_THEME.isLight ? 24 : 40);
let INK     = DEFAULT_THEME.isLight ? darkenColor(DEFAULT_THEME.accent, 45) : darkenColor(DEFAULT_THEME.primary, 2);
let ERR     = DEFAULT_THEME.danger;

let CARD_BORDER = DEFAULT_THEME.borderStrong;

const STATUSES = [
  'extracting audio...',
  'transcribing speech...',
  'analyzing content...',
  'identifying key topics...',
  'generating notes...',
  'almost done...',
];

type Mode      = 'youtube' | 'record';
type Tab       = 'notes' | 'transcript';

interface MediaResult {
  filename: string;
  transcript: string;
  duration: number;
  language_name: string;
  notes: { content: string };
  analysis: any;
  video_info?: { title?: string };
}

interface HistoryItem {
  id: number;
  title: string;
  created_at: string;
  preview: string;
}

type Props = { user: AuthUser; onBack?: () => void };
type AIMediaStackParamList = {
  AIMediaHub: undefined;
  AIMediaProcessing: { url: string };
  AIMediaResults: { result: MediaResult };
};

const AIMediaStack = createNativeStackNavigator<AIMediaStackParamList>();

function applyTheme(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  CURRENT_THEME = theme;
  BG = theme.bgPrimary;
  SURFACE = theme.panel;
  GOLD_XL = theme.accent;
  GOLD_L = theme.accentHover;
  GOLD_M = theme.accent;
  GOLD_D = darkenColor(theme.accent, theme.isLight ? 10 : 26);
  GOLD_XD = darkenColor(theme.accent, theme.isLight ? 24 : 40);
  INK = theme.isLight ? darkenColor(theme.accent, 45) : darkenColor(theme.primary, 2);
  ERR = theme.danger;
  CARD_BORDER = theme.borderStrong;
}

function ProcessingView({ status }: { status: string }) {
  const ring0 = useRef(new Animated.Value(0)).current;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const mkRing = (v: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0,    useNativeDriver: true }),
        Animated.delay(600 - delay),
      ]));
    const glow = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1,   duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.5, duration: 800, useNativeDriver: true }),
    ]));
    const a0 = mkRing(ring0, 0);
    const a1 = mkRing(ring1, 660);
    const a2 = mkRing(ring2, 1320);
    [a0, a1, a2, glow].forEach(a => a.start());
    return () => [a0, a1, a2, glow].forEach(a => a.stop());
  }, []);

  return (
    <View style={pr.container}>
      <View style={pr.rings}>
        {[ring0, ring1, ring2].map((anim, i) => (
          <Animated.View key={i} style={[pr.ring, {
            width: 80, height: 80, borderRadius: 40,
            opacity: anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.6, 0] }),
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.4] }) }],
          }]} />
        ))}
        <Animated.View style={[pr.core, { opacity: pulse }]}>
          <Text style={pr.coreText}>AI</Text>
        </Animated.View>
      </View>
      <Text style={pr.status}>{status}</Text>
      <Text style={pr.hint}>this may take a minute</Text>
    </View>
  );
}

function createProcessingStyles() {
  return StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  rings:     { width: 200, height: 200, alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: GOLD_M,
  },
  core: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: GOLD_XD + '90',
    borderWidth: 1.5, borderColor: GOLD_M,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: GOLD_M,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 20, elevation: 8,
  },
  coreText: { fontFamily: 'Inter_900Black', fontSize: 18, color: GOLD_L },
  status: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: GOLD_XL, letterSpacing: 1, marginBottom: 8 },
  hint:   { fontFamily: 'Inter_400Regular', fontSize: 11, color: GOLD_L, letterSpacing: 1.5 },
});
}

// ── Step 1: normalise content → clean markdown ────────────────────────
function toMarkdown(raw: string): string {
  let s = raw;

  // Fix line endings
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // HTML entities
  s = s.replace(/&amp;/g,  '&')
       .replace(/&lt;/g,   '<')
       .replace(/&gt;/g,   '>')
       .replace(/&nbsp;/g, ' ')
       .replace(/&quot;/g, '"')
       .replace(/&#39;/g,  "'");

  // Detect whether content is HTML
  const isHtml = /<(h[1-6]|p|ul|ol|li|strong|b|em|i|br)\b/i.test(s);

  if (isHtml) {
    // Convert block HTML → markdown before stripping
    s = s
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
      .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi,  '\n- $1')
      .replace(/<br\s*\/?>/gi,                  '\n')
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi,     '\n$1\n')
      .replace(/<hr[^>]*>/gi,                   '\n---\n')
      // Inline: strong/b/em/i/code
      .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi,           '**$1**')
      .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi,          '*$1*')
      .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi,            '*$1*')
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi,      '`$1`')
      // Strip remaining tags
      .replace(/<[^>]+>/g, '');
  }

  // Collapse 3+ blank lines → 2
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}

// ── Step 2: parse inline spans ────────────────────────────────────────
type Span = { bold?: true; italic?: true; code?: true; text: string };

function parseSpans(line: string): Span[] {
  const out: Span[] = [];
  // Match **bold**, *italic*, `code` — bold must be checked before italic
  const re = /\*\*(.+?)\*\*|\*([^*\n]+?)\*|`([^`\n]+?)`/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > cursor) out.push({ text: line.slice(cursor, m.index) });
    if (m[1] !== undefined) out.push({ bold:   true, text: m[1] });
    else if (m[2] !== undefined) out.push({ italic: true, text: m[2] });
    else if (m[3] !== undefined) out.push({ code:   true, text: m[3] });
    cursor = m.index + m[0].length;
  }
  if (cursor < line.length) out.push({ text: line.slice(cursor) });
  return out.filter(s => s.text.length > 0);
}

// ── Step 3: render inline spans ───────────────────────────────────────
function Inline({ line, baseStyle }: { line: string; baseStyle: any }) {
  const spans = parseSpans(line);
  // fast path — no markup
  if (spans.length === 1 && !spans[0].bold && !spans[0].italic && !spans[0].code) {
    return <Text style={baseStyle}>{spans[0].text}</Text>;
  }
  return (
    <Text style={baseStyle}>
      {spans.map((sp, i) => {
        if (sp.bold)   return <Text key={i} style={{ fontFamily: 'Inter_700Bold',    fontSize: (baseStyle as any).fontSize, color: GOLD_XL }}>{sp.text}</Text>;
        if (sp.italic) return <Text key={i} style={{ fontFamily: 'Inter_400Regular', fontSize: (baseStyle as any).fontSize, color: GOLD_L, fontStyle: 'italic' }}>{sp.text}</Text>;
        if (sp.code)   return <Text key={i} style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: GOLD_L, backgroundColor: GOLD_D + '40' }}>{sp.text}</Text>;
        return <Text key={i}>{sp.text}</Text>;
      })}
    </Text>
  );
}

// ── Step 4: parse into blocks ─────────────────────────────────────────
type Block =
  | { k: 'h1' | 'h2' | 'h3'; text: string }
  | { k: 'bullet'; text: string; depth: number }
  | { k: 'numbered'; text: string; n: number }
  | { k: 'hr' }
  | { k: 'gap' }
  | { k: 'para'; text: string };

function parseBlocks(md: string): Block[] {
  const lines  = md.split('\n');
  const blocks: Block[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw     = lines[i];
    const trimmed = raw.trim();

    if (trimmed === '') {
      blocks.push({ k: 'gap' });
      continue;
    }

    if (/^-{3,}$|^\*{3,}$|^_{3,}$/.test(trimmed)) {
      blocks.push({ k: 'hr' });
      continue;
    }

    // Markdown headings
    const hMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
    if (hMatch) {
      const level = hMatch[1].length;
      const text  = hMatch[2].trim();
      blocks.push({ k: level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3', text });
      continue;
    }

    // Bullet
    const bulletMatch = raw.match(/^(\s*)([-*+])\s+(.*)/);
    if (bulletMatch) {
      const depth = Math.floor(bulletMatch[1].length / 2);
      blocks.push({ k: 'bullet', text: bulletMatch[3].trim(), depth });
      continue;
    }

    // Numbered
    const numMatch = trimmed.match(/^(\d+)[.)]\s+(.*)/);
    if (numMatch) {
      blocks.push({ k: 'numbered', n: parseInt(numMatch[1], 10), text: numMatch[2] });
      continue;
    }

    // A line that is ONLY **text** (acts as h3)
    if (/^\*\*[^*]+\*\*:?$/.test(trimmed)) {
      const text = trimmed.replace(/^\*\*/, '').replace(/\*\*:?$/, '');
      blocks.push({ k: 'h3', text });
      continue;
    }

    blocks.push({ k: 'para', text: trimmed });
  }

  // Deduplicate consecutive gaps
  const out: Block[] = [];
  for (const b of blocks) {
    if (b.k === 'gap' && out[out.length - 1]?.k === 'gap') continue;
    out.push(b);
  }
  while (out[0]?.k === 'gap')            out.shift();
  while (out[out.length - 1]?.k === 'gap') out.pop();
  return out;
}

// ── Step 5: render ────────────────────────────────────────────────────
function MarkdownNote({ content }: { content: string }) {
  const blocks = parseBlocks(toMarkdown(content));

  return (
    <View style={md.root}>
      {blocks.map((b, i) => {
        switch (b.k) {

          case 'h1':
            return (
              <View key={i} style={md.h1Wrap}>
                <Text style={md.h1}>{b.text}</Text>
                <View style={md.h1Rule} />
              </View>
            );

          case 'h2':
            return (
              <View key={i} style={md.h2Wrap}>
                <Text style={md.h2}>{b.text}</Text>
              </View>
            );

          case 'h3':
            return (
              <View key={i} style={md.h3Wrap}>
                <View style={md.h3Bar} />
                <Text style={md.h3}>{b.text}</Text>
              </View>
            );

          case 'hr':
            return <View key={i} style={md.hr} />;

          case 'gap':
            return <View key={i} style={md.gap} />;

          case 'bullet':
            return (
              <View key={i} style={[md.listRow, { paddingLeft: 4 + b.depth * 16 }]}>
                <View style={b.depth > 0 ? md.dotSub : md.dot} />
                <Inline line={b.text} baseStyle={md.listText} />
              </View>
            );

          case 'numbered':
            return (
              <View key={i} style={md.listRow}>
                <Text style={md.num}>{b.n}.</Text>
                <Inline line={b.text} baseStyle={md.listText} />
              </View>
            );

          case 'para':
          default:
            return <Inline key={i} line={b.text} baseStyle={md.para} />;
        }
      })}
    </View>
  );
}

function createMarkdownStyles() {
  return StyleSheet.create({
  root: { paddingBottom: 48 },

  // H1 — primary accent headline
  h1Wrap: { marginTop: 36, marginBottom: 8 },
  h1:     { fontFamily: 'Inter_900Black', fontSize: 28, color: GOLD_XL, lineHeight: 34 },
  h1Rule: { height: 1.5, backgroundColor: GOLD_D + '70', marginTop: 10 },

  // H2 — medium, bright gold
  h2Wrap: { marginTop: 28, marginBottom: 6 },
  h2:     { fontFamily: 'Inter_900Black', fontSize: 21, color: GOLD_XL, lineHeight: 27 },

  // H3 — smaller, gold with left accent bar
  h3Wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 4 },
  h3Bar:  { width: 3, height: 18, borderRadius: 2, backgroundColor: GOLD_M, flexShrink: 0 },
  h3:     { fontFamily: 'Inter_700Bold', fontSize: 17, color: GOLD_L, lineHeight: 23, flex: 1 },

  hr:  { height: 1, backgroundColor: GOLD_D + '50', marginVertical: 20 },
  gap: { height: 10 },

  // Paragraph — regular body text
  para: { fontFamily: 'Inter_400Regular', fontSize: 15, color: GOLD_L, lineHeight: 26, marginVertical: 2 },

  // Lists
  listRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 7, paddingRight: 4 },
  dot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD_M, marginTop: 10, flexShrink: 0 },
  dotSub:   { width: 4, height: 4, borderRadius: 2, backgroundColor: GOLD_D, marginTop: 11, flexShrink: 0 },
  listText: { fontFamily: 'Inter_400Regular', fontSize: 15, color: GOLD_L, lineHeight: 26, flex: 1 },
  num:      { fontFamily: 'Inter_700Bold', fontSize: 14, color: GOLD_M, lineHeight: 26, width: 26, flexShrink: 0 },
});
}

function fmtDuration(sec: number) {
  if (!sec) return '';
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

function fmtDate(iso: string) {
  const d    = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7)  return `${diff}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function AIMediaHub({
  user,
  onBack,
  onStartProcessing,
}: Props & { onStartProcessing: (url: string) => void }) {
  const [mode,    setMode]    = useState<Mode>('youtube');
  const [url,     setUrl]     = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error,   setError]   = useState('');

  const loadHistory = useCallback(() => {
    getMediaHistory(user.username)
      .then(d => { if (d?.history) setHistory(d.history); })
      .catch(() => {});
  }, [user.username]);

  useFocusEffect(useCallback(() => {
    loadHistory();
  }, [loadHistory]));

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AmbientBubbles theme={CURRENT_THEME} variant="media" opacity={0.86} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={s.hubScroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.header}>
            {onBack && (
              <HapticTouchable onPress={onBack} style={s.backBtn} haptic="selection">
                <Text style={s.backBtnText}>‹</Text>
              </HapticTouchable>
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.pageTitle}>media notes</Text>
              <Text style={s.pageSubtitle}>ai-powered transcription & notes</Text>
            </View>
          </View>

          <View style={s.modeSwitcher}>
            <HapticTouchable
              style={[s.modeBtn, mode === 'youtube' && s.modeBtnActive]}
              onPress={() => { setMode('youtube'); setError(''); }}
              activeOpacity={0.8}
              haptic="selection"
            >
              <Text style={[s.modeBtnText, mode === 'youtube' && s.modeBtnTextActive]}>
                YouTube
              </Text>
            </HapticTouchable>
            <HapticTouchable
              style={[s.modeBtn, mode === 'record' && s.modeBtnActive]}
              onPress={() => { setMode('record'); setError(''); }}
              activeOpacity={0.8}
              haptic="selection"
            >
              <Text style={[s.modeBtnText, mode === 'record' && s.modeBtnTextActive]}>
                Record Audio
              </Text>
            </HapticTouchable>
          </View>

          {mode === 'youtube' && (
            <View style={s.inputCard}>
              <View style={s.inputCardInner}>
                <Text style={s.inputCardLabel}>YOUTUBE URL</Text>

                <TextInput
                  style={s.urlInput}
                  placeholder="paste youtube link here..."
                  placeholderTextColor={GOLD_D + '80'}
                  value={url}
                  onChangeText={t => { setUrl(t); setError(''); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="go"
                  onSubmitEditing={() => url.trim() && onStartProcessing(url.trim())}
                />

                {!!error && (
                  <Text style={s.errorText}>{error}</Text>
                )}

                <HapticTouchable
                  style={[s.processBtn, !url.trim() && s.processBtnDisabled]}
                  onPress={() => onStartProcessing(url.trim())}
                  disabled={!url.trim()}
                  activeOpacity={0.85}
                  haptic="medium"
                >
                  <LinearGradient
                    colors={url.trim() ? [GOLD_L, GOLD_M, GOLD_D] : [GOLD_D + '40', GOLD_D + '40']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={s.processBtnGrad}
                  >
                    <Text style={[s.processBtnText, !url.trim() && { color: GOLD_D }]}>
                      GENERATE NOTES
                    </Text>
                  </LinearGradient>
                </HapticTouchable>
              </View>
            </View>
          )}

          {mode === 'record' && (
            <View style={s.inputCard}>
              <View style={s.recordInner}>
                <Text style={s.inputCardLabel}>AUDIO RECORDING</Text>
                <Text style={s.recordHint}>
                  record a lecture, meeting, or voice note and get ai-generated notes instantly
                </Text>
                <View style={s.recordBtnWrap}>
                  <HapticTouchable style={s.recordBtn} activeOpacity={0.8} haptic="medium">
                    <LinearGradient
                      colors={[GOLD_L, GOLD_D]}
                      style={s.recordBtnGrad}
                    >
                      <View style={s.recordDot} />
                    </LinearGradient>
                  </HapticTouchable>
                  <Text style={s.recordLabel}>tap to record</Text>
                </View>
                <Text style={s.comingSoon}>coming soon — requires expo-av</Text>
              </View>
            </View>
          )}

          <View style={s.sectionRow}>
            <Text style={s.sectionLabel}>RECENT</Text>
            {history.length > 0 && (
              <View style={s.countBadge}>
                <Text style={s.countText}>{history.length}</Text>
              </View>
            )}
          </View>

          {history.length === 0 ? (
            <View style={s.emptyBox}>
              <View style={s.emptyRing}>
                <Text style={s.emptyRingText}>0</Text>
              </View>
              <Text style={s.emptyTitle}>no media notes yet</Text>
              <Text style={s.emptyHint}>
                paste a youtube url above{'\n'}to transcribe and generate notes
              </Text>
            </View>
          ) : (
            history.slice(0, 8).map(item => (
              <HapticTouchable key={item.id} style={s.histRow} activeOpacity={0.8} haptic="light">
                <View style={s.histIconBox}>
                  <Text style={s.histIconText}>N</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.histTitle} numberOfLines={1}>{item.title}</Text>
                  {!!item.preview && (
                    <Text style={s.histPreview} numberOfLines={1}>
                      {item.preview.replace(/<[^>]*>/g, '').trim()}
                    </Text>
                  )}
                </View>
                <Text style={s.histDate}>{fmtDate(item.created_at)}</Text>
              </HapticTouchable>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AIMediaProcessing({
  user,
  url,
  onCancel,
  onComplete,
  onError,
}: {
  user: AuthUser;
  url: string;
  onCancel: () => void;
  onComplete: (result: MediaResult) => void;
  onError: (message: string) => void;
}) {
  const [statusIdx, setStatusIdx] = useState(0);
  const cancelRef = useRef(false);

  useEffect(() => {
    const iv = setInterval(() => {
      setStatusIdx(i => Math.min(i + 1, STATUSES.length - 1));
    }, 4200);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    cancelRef.current = false;

    (async () => {
      try {
        const data = await processMediaYouTube(user.username, url);
        if (cancelRef.current) return;
        if (!data.success) throw new Error(data.detail || 'Processing failed');
        onComplete(data);
      } catch (e: any) {
        if (!cancelRef.current) onError(e.message || 'Something went wrong. Please try again.');
      }
    })();

    return () => {
      cancelRef.current = true;
    };
  }, [onComplete, onError, url, user.username]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AmbientBubbles theme={CURRENT_THEME} variant="media" opacity={0.86} />
      <View style={s.subHeader}>
        <HapticTouchable onPress={() => { cancelRef.current = true; onCancel(); }} style={s.backBtn} haptic="warning">
          <Text style={s.backBtnText}>✕</Text>
        </HapticTouchable>
        <Text style={s.subTitle}>processing</Text>
        <View style={s.backBtn} />
      </View>
      <ProcessingView status={STATUSES[statusIdx]} />
    </SafeAreaView>
  );
}

function AIMediaResults({
  user,
  result,
  onBack,
}: {
  user: AuthUser;
  result: MediaResult;
  onBack: () => void;
}) {
  const [tab,    setTab]    = useState<Tab>('notes');
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const displayTitle = result.video_info?.title || result.filename || 'Media Note';

  const handleSave = useCallback(async () => {
    if (saving || saved) return;
    setSaving(true);
    try {
      await saveMediaNotes(user.username, displayTitle, result.notes.content, result.transcript, result.analysis);
      setSaved(true);
    } catch {
      Alert.alert('Save failed', 'Unable to save notes right now.');
    } finally {
      setSaving(false);
    }
  }, [displayTitle, result, saved, saving, user.username]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AmbientBubbles theme={CURRENT_THEME} variant="media" opacity={0.86} />
      <View style={s.subHeader}>
        <HapticTouchable onPress={onBack} style={s.backBtn} haptic="selection">
          <Text style={s.backBtnText}>‹</Text>
        </HapticTouchable>
        <Text style={s.subTitle}>notes</Text>
        <HapticTouchable
          style={[s.saveChip, saved && s.saveChipDone]}
          onPress={handleSave}
          disabled={saving || saved}
          activeOpacity={0.8}
          haptic="success"
        >
          <Text style={s.saveChipText}>
            {saving ? 'saving...' : saved ? 'saved' : 'save'}
          </Text>
        </HapticTouchable>
      </View>

      <View style={s.metaStrip}>
        <View style={{ flex: 1 }}>
          <Text style={s.metaTitle} numberOfLines={2}>{displayTitle}</Text>
          <View style={s.metaBadges}>
            {!!result.duration && (
              <View style={s.badge}><Text style={s.badgeText}>{fmtDuration(result.duration)}</Text></View>
            )}
            {!!result.language_name && (
              <View style={s.badge}><Text style={s.badgeText}>{result.language_name}</Text></View>
            )}
          </View>
        </View>
      </View>

      <View style={s.divider} />

      <View style={s.tabRow}>
        {(['notes', 'transcript'] as Tab[]).map(t => (
          <HapticTouchable
            key={t}
            style={[s.tab, tab === t && s.tabActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.75}
            haptic="selection"
          >
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t.toUpperCase()}
            </Text>
          </HapticTouchable>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.resultsScroll} showsVerticalScrollIndicator={false}>
        {tab === 'notes'
          ? <MarkdownNote content={result.notes.content} />
          : <Text style={s.transcriptBody}>{result.transcript}</Text>
        }
      </ScrollView>
    </SafeAreaView>
  );
}

export default function AIMediaNotesScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  applyTheme(selectedTheme);
  pr = createProcessingStyles();
  md = createMarkdownStyles();
  s = createStyles(layout);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold });

  if (!fontsLoaded) return null;

  return (
    <AIMediaStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        gestureDirection: 'horizontal',
      }}
    >
      <AIMediaStack.Screen name="AIMediaHub">
        {({ navigation }) => (
          <AIMediaHub
            user={user}
            onBack={onBack}
            onStartProcessing={(url) => navigation.navigate('AIMediaProcessing', { url })}
          />
        )}
      </AIMediaStack.Screen>
      <AIMediaStack.Screen name="AIMediaProcessing">
        {({ route, navigation }) => (
          <AIMediaProcessing
            user={user}
            url={route.params.url}
            onCancel={() => navigation.goBack()}
            onComplete={(result) => navigation.reset({
              index: 1,
              routes: [
                { name: 'AIMediaHub' },
                { name: 'AIMediaResults', params: { result } },
              ],
            })}
            onError={(message) => {
              Alert.alert('Processing failed', message);
              navigation.goBack();
            }}
          />
        )}
      </AIMediaStack.Screen>
      <AIMediaStack.Screen name="AIMediaResults">
        {({ route, navigation }) => (
          <AIMediaResults
            user={user}
            result={route.params.result}
            onBack={() => navigation.goBack()}
          />
        )}
      </AIMediaStack.Screen>
    </AIMediaStack.Navigator>
  );
}

function createStyles(layout: ReturnType<typeof useResponsiveLayout>) {
  const softAccent = rgbaFromHex(GOLD_M, 0.12);
  const softAccentStrong = rgbaFromHex(GOLD_M, 0.18);
  return StyleSheet.create({
  safe:      { flex: 1, backgroundColor: BG },
  hubScroll: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingBottom: 48,
    gap: 12,
  },

  // Header
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 6,
    gap: 8,
  },
  backBtn:     { width: 36, alignItems: 'flex-start', justifyContent: 'center' },
  backBtnText: { fontFamily: 'Inter_700Bold', fontSize: 18, color: GOLD_XL, lineHeight: 22 },
  pageTitle:   { fontFamily: 'Inter_900Black',   fontSize: 30, color: GOLD_L, letterSpacing: -0.6 },
  pageSubtitle:{ fontFamily: 'Inter_400Regular', fontSize: 10, color: GOLD_L, letterSpacing: 2.2, marginTop: 4, textTransform: 'uppercase' },

  // Sub-screen header
  subHeader: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  subTitle: {
    fontFamily: 'Inter_900Black',
    fontSize: 18,
    color: GOLD_XL,
    flex: 1,
    textAlign: 'center',
  },

  // Save chip
  saveChip: {
    backgroundColor: GOLD_M,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: GOLD_M,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 5,
  },
  saveChipDone: { backgroundColor: GOLD_D },
  saveChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: INK,
    letterSpacing: 0.5,
  },

  // Mode switcher
  modeSwitcher: {
    flexDirection: 'row',
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 5,
    gap: 4,
    shadowColor: GOLD_M,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 4,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 10,
  },
  modeBtnActive: {
    backgroundColor: GOLD_D + '35',
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  modeBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: GOLD_D,
    letterSpacing: 0.5,
  },
  modeBtnTextActive: {
    color: GOLD_XL,
  },

  // Input card (shared)
  inputCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: SURFACE,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: GOLD_D,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 8,
  },
  inputCardInner: { padding: 18, gap: 14, zIndex: 1 },
  inputCardLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    color: GOLD_XL,
    letterSpacing: 3,
  },
  urlInput: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: GOLD_XL,
    backgroundColor: softAccent,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: ERR,
  },
  processBtn:         { borderRadius: 14, overflow: 'hidden' },
  processBtnDisabled: { opacity: 0.5 },
  processBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
  },
  processBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: INK,
    letterSpacing: 2.5,
  },

  // Record mode
  recordInner: { padding: 18, gap: 16, zIndex: 1, alignItems: 'center' },
  recordHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: GOLD_L,
    textAlign: 'center',
    lineHeight: 19,
    letterSpacing: 0.3,
  },
  recordBtnWrap: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  recordBtn:     { width: 72, height: 72, borderRadius: 36, overflow: 'hidden' },
  recordBtnGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  recordDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: INK,
  },
  recordLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: GOLD_L,
    letterSpacing: 2,
  },
  comingSoon: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    color: GOLD_D,
    letterSpacing: 1.5,
    paddingBottom: 4,
  },

  // Section header
  sectionRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  sectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: GOLD_XL, letterSpacing: 3 },
  countBadge:   {
    backgroundColor: softAccent,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  countText: { fontFamily: 'Inter_700Bold', fontSize: 9, color: GOLD_L, letterSpacing: 1 },

  // Empty state
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyRing: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: softAccent,
    borderWidth: 1, borderColor: CARD_BORDER,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyRingText: { fontFamily: 'Inter_900Black', fontSize: 22, color: GOLD_D },
  emptyTitle: { fontFamily: 'Inter_900Black',   fontSize: 16, color: GOLD_L, textAlign: 'center' },
  emptyHint:  { fontFamily: 'Inter_400Regular', fontSize: 12, color: GOLD_L, textAlign: 'center', lineHeight: 19 },

  // History rows
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 14,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: GOLD_D,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  histIconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: softAccentStrong,
    borderWidth: 1, borderColor: CARD_BORDER,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 1,
  },
  histIconText: { fontFamily: 'Inter_900Black', fontSize: 14, color: GOLD_L },
  histTitle:    { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: GOLD_XL, lineHeight: 17, zIndex: 1 },
  histPreview:  { fontFamily: 'Inter_400Regular',  fontSize: 11, color: GOLD_L,  marginTop: 2,   zIndex: 1 },
  histDate:     { fontFamily: 'Inter_400Regular',  fontSize: 10, color: GOLD_D,  zIndex: 1 },

  // Divider
  divider: { height: 1, backgroundColor: CARD_BORDER, marginHorizontal: 0 },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  tab:           { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10 },
  tabActive:     { backgroundColor: softAccent, borderWidth: 1, borderColor: CARD_BORDER },
  tabText:       { fontFamily: 'Inter_600SemiBold', fontSize: 9,  color: GOLD_D,  letterSpacing: 2.5 },
  tabTextActive: { fontFamily: 'Inter_600SemiBold', fontSize: 9,  color: GOLD_XL, letterSpacing: 2.5 },

  // Results meta
  metaStrip: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  metaTitle: {
    fontFamily: 'Inter_900Black',
    fontSize: 17,
    color: GOLD_XL,
    lineHeight: 22,
  },
  metaBadges: { flexDirection: 'row', gap: 6, marginTop: 8 },
  badge: {
    backgroundColor: softAccent,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  badgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: GOLD_L, letterSpacing: 1 },

  // Note content
  resultsScroll:  {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    padding: 20,
    paddingBottom: 80,
  },
  transcriptBody: { fontFamily: 'Inter_400Regular', fontSize: 13, color: GOLD_L, lineHeight: 22 },
});
}

let pr: ReturnType<typeof createProcessingStyles> = createProcessingStyles();
let md: ReturnType<typeof createMarkdownStyles> = createMarkdownStyles();
let s: ReturnType<typeof createStyles> = createStyles(DEFAULT_LAYOUT);
