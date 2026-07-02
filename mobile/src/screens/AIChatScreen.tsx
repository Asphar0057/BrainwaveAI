import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  FlatList, KeyboardAvoidingView, Platform, Animated,
  Modal, ScrollView, ActivityIndicator, PanResponder,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import MarkdownText from '../components/MarkdownText';
import HapticTouchable from '../components/HapticTouchable';
import AmbientBubbles from '../components/AmbientBubbles';
import { AuthUser } from '../services/auth';
import { createChatSession, askAI, getChatSessions, getChatMessages, getSearchHubSuggestions } from '../services/api';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

const EDGE_SWIPE_WIDTH = 20;

type Msg = { id: string; role: 'user' | 'ai'; text: string };
type Session = { id: number; title: string; updated_at: string | null };
type Props = { user: AuthUser };

const DEFAULT_PROMPTS = [
  'Explain a hard topic simply',
  'Turn my notes into flashcards',
  'Quiz me on my weak areas',
  'Help me plan a study session',
];

function mapSearchHubSuggestionToPrompt(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (!value.startsWith('/')) return value;

  const [command, ...rest] = value.split(/\s+/);
  const topic = rest.join(' ').trim();

  switch (command.toLowerCase()) {
    case '/flashcards':
      return topic ? `Create flashcards for ${topic}` : 'Create flashcards from what I studied';
    case '/notes':
      return topic ? `Write notes on ${topic}` : 'Help me write study notes';
    case '/quiz':
      return topic ? `Quiz me on ${topic}` : 'Quiz me on my weak areas';
    case '/questions':
      return topic ? `Generate practice questions on ${topic}` : 'Generate practice questions for me';
    case '/explain':
      return topic ? `Explain ${topic} simply` : 'Explain a hard topic simply';
    case '/path':
    case '/learning-paths':
      return topic ? `Build a learning path for ${topic}` : 'Suggest a learning path for me';
    case '/chat':
      return topic ? `Help me understand ${topic}` : 'Help me start studying';
    case '/review':
      return 'Help me review what I studied';
    case '/progress':
      return 'Summarize my study progress';
    case '/weak':
      return 'What topics am I weak on?';
    case '/help':
      return 'What can you help me with?';
    default:
      return topic ? `${command.replace(/^\//, '')} ${topic}` : command.replace(/^\//, '');
  }
}

function buildStarterPrompts(rawSuggestions: string[]): string[] {
  const seen = new Set<string>();
  const prompts: string[] = [];

  for (const raw of rawSuggestions) {
    const prompt = mapSearchHubSuggestionToPrompt(raw);
    if (!prompt) continue;
    const key = prompt.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    prompts.push(prompt);
    if (prompts.length >= 4) break;
  }

  if (prompts.length === 0) return DEFAULT_PROMPTS;
  return prompts.slice(0, 4);
}

function TypingDots() {
  const { selectedTheme } = useAppTheme();
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const anims = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 160),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(500),
        ])
      )
    );
    anims.forEach((anim) => anim.start());
    return () => anims.forEach((anim) => anim.stop());
  }, [dots]);

  return (
    <View style={td.row}>
      {dots.map((dot, index) => (
        <Animated.View key={index} style={[td.dot, { opacity: dot, backgroundColor: selectedTheme.accent }]} />
      ))}
    </View>
  );
}

const td = StyleSheet.create({
  row: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingVertical: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});

function preprocessText(text: string): string {
  return text
    .replace(/\$\$([^$]+)\$\$/g, (_, eq) => `\n\`\`\`\n${eq.trim()}\n\`\`\`\n`)
    .replace(/\$([^$\n]+)\$/g, (_, eq) => `\`${eq.trim()}\``);
}

export default function AIChatScreen({ user }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const enableEdgeSwipe = !layout.isTablet;
  const sidebarWidth = Math.min(layout.width * (layout.isLandscape ? 0.42 : 0.82), 360);
  const s = useMemo(() => createStyles(selectedTheme, layout, sidebarWidth), [selectedTheme, layout, sidebarWidth]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatId, setChatId] = useState<number | undefined>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [starterPrompts, setStarterPrompts] = useState<string[]>(DEFAULT_PROMPTS);
  const listRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-sidebarWidth)).current;

  useEffect(() => {
    slideAnim.setValue(sidebarOpen ? 0 : -sidebarWidth);
  }, [sidebarOpen, sidebarWidth, slideAnim]);

  const openSidebar = useCallback(() => {
    setSidebarOpen(true);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 100, friction: 14 }).start();
    setSessionsLoading(true);
    getChatSessions(user.username)
      .then((data) => setSessions(Array.isArray(data?.sessions) ? data.sessions : []))
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
  }, [sidebarWidth, slideAnim, user.username]);

  const closeSidebar = useCallback(() => {
    Animated.timing(slideAnim, { toValue: -sidebarWidth, duration: 220, useNativeDriver: true }).start(() => setSidebarOpen(false));
  }, [sidebarWidth, slideAnim]);

  const closePanResponder = useMemo(() => (
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gesture) => gesture.dx < -10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dx < 0) slideAnim.setValue(gesture.dx);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx < -60 || gesture.vx < -0.5) {
          Animated.timing(slideAnim, { toValue: -sidebarWidth, duration: 220, useNativeDriver: true }).start(() => setSidebarOpen(false));
        } else {
          Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 100, friction: 14 }).start();
        }
      },
    })
  ), [sidebarWidth, slideAnim]);

  const openPanResponder = useMemo(() => (
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        enableEdgeSwipe && gesture.dx > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        enableEdgeSwipe && gesture.dx > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
      onPanResponderTerminationRequest: () => true,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 60 || gesture.vx > 0.5) openSidebar();
      },
    })
  ), [enableEdgeSwipe, openSidebar]);

  const loadSession = useCallback(async (session: Session) => {
    closeSidebar();
    setLoading(true);
    setMessages([]);
    setChatId(session.id);
    try {
      const rawMessages: any[] = await getChatMessages(session.id);
      const converted: Msg[] = rawMessages
        .filter((message) => message.content)
        .map((message) => ({
          id: String(message.id),
          role: message.type === 'user' ? 'user' : 'ai',
          text: message.content,
        }));
      setMessages(converted);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [closeSidebar]);

  const send = async (text: string = input) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMessage: Msg = { id: Date.now().toString(), role: 'user', text: trimmed };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setLoading(true);

    try {
      let currentChatId = chatId;
      if (!currentChatId) {
        const session = await createChatSession(user.username, trimmed.slice(0, 60));
        currentChatId = session.id;
        setChatId(currentChatId);
      }
      const data = await askAI(user.username, trimmed, currentChatId);
      setMessages((current) => [
        ...current,
        {
          id: String(Date.now() + 1),
          role: 'ai',
          text: data.response ?? data.answer ?? 'Sorry, no response.',
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        { id: String(Date.now() + 1), role: 'ai', text: 'Something went wrong. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const newChat = () => {
    setMessages([]);
    setChatId(undefined);
  };
  const isEmpty = messages.length === 0 && !loading;

  useEffect(() => {
    if (!isEmpty) return;

    const query = input.trim();
    const timer = setTimeout(() => {
      getSearchHubSuggestions(user.username, query)
        .then((data) => {
          setStarterPrompts(buildStarterPrompts(data?.suggestions ?? []));
        })
        .catch(() => {
          setStarterPrompts(DEFAULT_PROMPTS);
        });
    }, query ? 220 : 0);

    return () => clearTimeout(timer);
  }, [input, isEmpty, user.username]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaView style={s.safe} edges={[]}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFill} />
      <AmbientBubbles theme={selectedTheme} variant="chat" opacity={0.84} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={insets.top}>
        <View style={s.header}>
          <HapticTouchable onPress={openSidebar} activeOpacity={0.8} style={s.headerBtn} haptic="selection">
            <Ionicons name="menu-outline" size={20} color={selectedTheme.textPrimary} />
          </HapticTouchable>
          <View style={s.headerCenter}>
            <View style={s.headerTitleRow}>
              <Text style={s.headerTitle}>ai</Text>
              <View style={s.onlineDot} />
            </View>
            <Text style={s.headerEyebrow}>conversation studio</Text>
          </View>
          <HapticTouchable onPress={newChat} activeOpacity={0.8} style={s.headerBtn} haptic="light">
            <Ionicons name="add-outline" size={20} color={selectedTheme.textPrimary} />
          </HapticTouchable>
        </View>

        {isEmpty ? (
          <ScrollView contentContainerStyle={s.emptyScroll} showsVerticalScrollIndicator={false}>
              <LinearGradient colors={[rgbaFromHex(selectedTheme.accent, 0.10), rgbaFromHex(selectedTheme.panel, 0.985), rgbaFromHex(selectedTheme.bgPrimary, 0.995)]} locations={[0, 0.62, 1]} style={s.emptyHero}>
              <Text style={s.emptyEyebrow}>always ready</Text>
              <Text style={s.emptyTitle}>Ask bigger questions.</Text>
              <Text style={s.emptySub}>
                Use Cerbyl like a fast-thinking tutor, editor, explainer, and study strategist.
              </Text>

              <View style={s.promptGrid}>
                {starterPrompts.map((prompt) => (
                  <HapticTouchable key={prompt} style={s.promptChip} onPress={() => send(prompt)} haptic="selection" activeOpacity={0.86}>
                    <Ionicons name="sparkles-outline" size={14} color={selectedTheme.accentHover} />
                    <Text style={s.promptText}>{prompt}</Text>
                  </HapticTouchable>
                ))}
              </View>
            </LinearGradient>
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            data={loading ? [...messages, { id: 'typing', role: 'ai' as const, text: '__typing__' }] : messages}
            keyExtractor={(message) => message.id}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              const isUser = item.role === 'user';
              if (item.text === '__typing__') {
                return (
                  <View style={s.aiRow}>
                    <Text style={s.messageRole}>cerbyl</Text>
                    <View style={[s.bubble, s.aiBubble]}>
                      <TypingDots />
                    </View>
                  </View>
                );
              }
              return (
                <View style={isUser ? s.userRow : s.aiRow}>
                  <Text style={s.messageRole}>{isUser ? 'you' : 'cerbyl'}</Text>
                  <View style={[s.bubble, isUser ? s.userBubble : s.aiBubble]}>
                    {isUser ? (
                      <>
                        <LinearGradient
                          colors={
                            selectedTheme.isLight
                              ? [rgbaFromHex(selectedTheme.accentHover, 0.10), rgbaFromHex(selectedTheme.panel, 0.99)]
                              : [rgbaFromHex(darkenColor(selectedTheme.accent, 34), 0.45), rgbaFromHex(selectedTheme.panelAlt, 1)]
                          }
                          style={[StyleSheet.absoluteFillObject, { borderRadius: 22 }]}
                        />
                        <Text style={s.userText}>{item.text}</Text>
                      </>
                    ) : (
                      <MarkdownText>{preprocessText(item.text)}</MarkdownText>
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}

        <View style={[s.composerWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={s.composerCard}>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder="ask cerbyl anything..."
              placeholderTextColor={selectedTheme.textSecondary}
              multiline
            />
            <HapticTouchable
              style={[s.sendBtn, (!input.trim() || loading) && s.sendDisabled]}
              onPress={() => send()}
              activeOpacity={0.85}
              disabled={!input.trim() || loading}
              haptic="medium"
            >
              <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} style={s.sendGrad}>
                <Ionicons name="arrow-up" size={18} color={selectedTheme.isLight ? darkenColor(selectedTheme.accent, 32) : selectedTheme.bgPrimary} />
              </LinearGradient>
            </HapticTouchable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {!sidebarOpen && enableEdgeSwipe ? (
        <View collapsable={false} style={s.edgeSwipeZone} pointerEvents="box-only" {...openPanResponder.panHandlers} />
      ) : null}

      {sidebarOpen ? (
        <Modal transparent animationType="none" onRequestClose={closeSidebar}>
          <SafeAreaProvider>
            <View style={s.overlay}>
              <HapticTouchable style={StyleSheet.absoluteFill} onPress={closeSidebar} activeOpacity={1} haptic="none" />
              <Animated.View style={[s.sidebar, { transform: [{ translateX: slideAnim }] }]} {...closePanResponder.panHandlers}>
                <LinearGradient colors={[darkenColor(selectedTheme.bgTop, selectedTheme.isLight ? 4 : 0), selectedTheme.panelAlt, selectedTheme.bgPrimary]} style={StyleSheet.absoluteFill} />
                <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                  <View style={s.sidebarHeader}>
                    <View>
                      <Text style={s.sidebarEyebrow}>history</Text>
                      <Text style={s.sidebarTitle}>chats</Text>
                    </View>
                  </View>
                  <View style={s.sidebarDivider} />

                  {sessionsLoading ? (
                    <ActivityIndicator color={selectedTheme.accent} style={{ marginTop: 32 }} />
                  ) : sessions.length === 0 ? (
                    <View style={s.sidebarEmptyWrap}>
                      <Ionicons name="chatbubbles-outline" size={28} color={selectedTheme.textSecondary} />
                      <Text style={s.sidebarEmpty}>No chats yet</Text>
                    </View>
                  ) : (
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 10 }}>
                      {sessions.map((session) => {
                        const active = chatId === session.id;
                        return (
                          <HapticTouchable
                            key={session.id}
                            style={[s.sessionItem, active && s.sessionItemActive]}
                            onPress={() => loadSession(session)}
                            activeOpacity={0.78}
                            haptic="selection"
                          >
                            <View style={[s.sessionDot, active && { backgroundColor: selectedTheme.accentHover }]} />
                            <View style={{ flex: 1 }}>
                              <Text style={[s.sessionTitle, active && { color: selectedTheme.accentHover }]} numberOfLines={2}>
                                {session.title || 'untitled chat'}
                              </Text>
                              {session.updated_at ? (
                                <Text style={s.sessionDate}>{new Date(session.updated_at).toLocaleDateString()}</Text>
                              ) : null}
                            </View>
                            {active ? <Ionicons name="chevron-forward" size={14} color={selectedTheme.accentHover} /> : null}
                          </HapticTouchable>
                        );
                      })}
                    </ScrollView>
                  )}
                </SafeAreaView>
              </Animated.View>
            </View>
          </SafeAreaProvider>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

function createStyles(
  theme: ReturnType<typeof useAppTheme>['selectedTheme'],
  layout: ReturnType<typeof useResponsiveLayout>,
  sidebarWidth: number
) {
  const CARD = theme.panel;
  const CARD_ALT = theme.panelAlt;
  const GOLD_XL = theme.textPrimary;
  const GOLD_L = theme.accentHover;
  const GOLD_M = theme.accent;
  const GOLD_D = darkenColor(theme.accent, theme.isLight ? 16 : 34);
  const DIM = theme.textSecondary;
  const BORDER = theme.border;
  const SHADOW = darkenColor(theme.primary, theme.isLight ? 72 : 4);
  const USER_BG = theme.isLight ? rgbaFromHex(theme.accent, 0.08) : theme.panelAlt;

  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent', overflow: 'hidden' },
  glowTop: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  glowBottom: {
    position: 'absolute',
    bottom: 120,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  edgeSwipeZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: EDGE_SWIPE_WIDTH,
    backgroundColor: 'transparent',
    zIndex: 3,
  },

  header: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: rgbaFromHex(CARD_ALT, 0.88),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { alignItems: 'center', gap: 2 },
  headerEyebrow: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: DIM,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontFamily: 'Inter_900Black', fontSize: 30, color: GOLD_L, letterSpacing: -0.8 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: GOLD_M },

  emptyScroll: {
    flexGrow: 1,
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
  },
  emptyHero: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 22,
    minHeight: layout.isLandscape ? 300 : 360,
    overflow: 'hidden',
  },
  emptyEyebrow: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: GOLD_L,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  emptyTitle: {
    fontFamily: 'Inter_900Black',
    fontSize: 34,
    lineHeight: 38,
    color: GOLD_L,
    marginTop: 14,
    letterSpacing: -1,
  },
  emptySub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: GOLD_M,
    lineHeight: 22,
    marginTop: 12,
    maxWidth: '88%',
  },
  promptGrid: {
    flexDirection: layout.twoColumn ? 'row' : 'column',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 28,
  },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: layout.twoColumn ? '48.5%' : '100%',
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_ALT,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  promptText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: GOLD_L,
    flex: 1,
  },

  list: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 18,
    gap: 14,
  },
  aiRow: { alignSelf: 'stretch', maxWidth: layout.isLandscape ? '82%' : '92%' },
  userRow: { alignSelf: 'flex-end', maxWidth: layout.isLandscape ? '72%' : '88%', alignItems: 'flex-end' },
  messageRole: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    color: DIM,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginHorizontal: 6,
  },
  bubble: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    overflow: 'hidden',
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: USER_BG,
    borderWidth: 1,
    borderColor: rgbaFromHex(theme.accent, theme.isLight ? 0.18 : 0.28),
  },
  userText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 22, color: GOLD_XL },

  composerWrap: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  composerCard: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: rgbaFromHex(CARD_ALT, 0.94),
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    backgroundColor: CARD_ALT,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: GOLD_L,
    maxHeight: 120,
  },
  sendBtn: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden' },
  sendDisabled: { opacity: 0.34 },
  sendGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  overlay: { flex: 1, flexDirection: 'row' },
  sidebar: {
    width: sidebarWidth,
    height: '100%',
    borderRightWidth: 1,
    borderRightColor: rgbaFromHex(GOLD_D, 0.31),
    shadowColor: SHADOW,
    shadowOffset: { width: 10, height: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 24,
    elevation: 16,
    overflow: 'hidden',
  },
  sidebarHeader: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  sidebarEyebrow: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: DIM,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  sidebarTitle: { fontFamily: 'Inter_900Black', fontSize: 24, color: GOLD_L, marginTop: 6 },
  sidebarDivider: { height: 1, backgroundColor: BORDER, marginHorizontal: 20, marginBottom: 6 },
  sidebarEmptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  sidebarEmpty: { fontFamily: 'Inter_400Regular', fontSize: 13, color: DIM },
  sessionItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginHorizontal: 10,
    marginVertical: 4,
    paddingHorizontal: 12,
    paddingVertical: 13,
    borderRadius: 16,
    overflow: 'hidden',
  },
  sessionItemActive: {
    backgroundColor: rgbaFromHex(theme.textPrimary, 0.03),
    borderWidth: 1,
    borderColor: BORDER,
  },
  sessionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD_D, flexShrink: 0 },
  sessionTitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: GOLD_L, lineHeight: 18 },
  sessionDate: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, marginTop: 3, letterSpacing: 0.4 },
});
}
