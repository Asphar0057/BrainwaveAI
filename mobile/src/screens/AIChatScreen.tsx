import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  FlatList, KeyboardAvoidingView, Platform, Animated,
  Modal, ScrollView, ActivityIndicator, PanResponder, Alert, Image,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import MarkdownText from '../components/MarkdownText';
import HapticTouchable from '../components/HapticTouchable';
import AmbientBubbles from '../components/AmbientBubbles';
import GeoBackground from '../components/GeoBackground';
import ContextSelector from '../components/ContextSelector';
import ContextPanel from '../components/ContextPanel';
import { AuthUser } from '../services/auth';
import { createChatSession, askAI, askAIWithFile, getChatSessions, getChatMessages, getSearchHubSuggestions } from '../services/api';
import { getHsModeEnabled, getSelectedDocIds } from '../services/contextService';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

const EDGE_SWIPE_WIDTH = 20;

type ChatAttachment = { uri: string; name: string; type: string };
type Msg = { id: string; role: 'user' | 'ai'; text: string; attachmentUri?: string };
type Session = { id: number; title: string; updated_at: string | null };
type Props = { user: AuthUser };

const DEFAULT_PROMPTS = [
  'Explain a hard topic simply',
  'Turn my notes into flashcards',
  'Quiz me on my weak areas',
  'Help me plan a study session',
];

const CHAT_GREETINGS = [
  'Welcome back. How can I help you today?',
  'Ready to explore new topics together?',
  "Let's dive into learning something new",
  'What would you like to learn today?',
  'Hello {name}! I\'m excited to help you learn',
  '{name}, ready to unlock new knowledge?',
  'Welcome back, {name}. Let\'s continue your learning',
  'Hey {name}! What would you like to explore?',
  '{name}, let\'s make today a learning adventure',
  'Good day, {name}. Ready to expand your horizons?',
  'Hi {name}! Let\'s tackle your questions together',
  '{name}, let\'s turn curiosity into understanding',
  'Hello {name}! What fascinating topic shall we discuss?',
];

function getRandomGreeting(name: string): string {
  const raw = CHAT_GREETINGS[Math.floor(Math.random() * CHAT_GREETINGS.length)];
  return raw.replace(/\{name\}/g, name);
}

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

function attachmentFromImageAsset(asset: ImagePicker.ImagePickerAsset, fallbackName: string): ChatAttachment {
  const name = asset.fileName || asset.uri.split('/').pop() || fallbackName;
  const type = asset.mimeType || (name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
  return { uri: asset.uri, name, type };
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
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [chatId, setChatId] = useState<number | undefined>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [sidebarSearchOpen, setSidebarSearchOpen] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [hsMode, setHsMode] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);

  useEffect(() => {
    getHsModeEnabled().then(setHsMode).catch(() => {});
    getSelectedDocIds().then(setSelectedDocIds).catch(() => {});
  }, []);
  const [starterPrompts, setStarterPrompts] = useState<string[]>(DEFAULT_PROMPTS);
  const greeting = useMemo(() => getRandomGreeting(user.first_name || user.username), [user.first_name, user.username]);
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
    Animated.timing(slideAnim, { toValue: -sidebarWidth, duration: 220, useNativeDriver: true }).start(() => {
      setSidebarOpen(false);
      setSidebarSearch('');
      setSidebarSearchOpen(false);
    });
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
    const currentAttachment = attachment;
    if ((!trimmed && !currentAttachment) || loading) return;

    const questionText = trimmed || 'Please analyze the attached image.';
    const userMessage: Msg = {
      id: Date.now().toString(),
      role: 'user',
      text: trimmed || 'Sent an image',
      attachmentUri: currentAttachment?.uri,
    };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setAttachment(null);
    setLoading(true);

    try {
      let currentChatId = chatId;
      if (!currentChatId) {
        const session = await createChatSession(user.username, questionText.slice(0, 60));
        currentChatId = session.id;
        setChatId(currentChatId);
      }
      const data = currentAttachment
        ? await askAIWithFile(user.username, questionText, currentAttachment, currentChatId, hsMode, selectedDocIds)
        : await askAI(user.username, questionText, currentChatId, hsMode, selectedDocIds);
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

  const pickAttachment = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to attach an image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;
    setAttachment(attachmentFromImageAsset(result.assets[0], 'photo.jpg'));
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take a photo for AI chat.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.72,
    });
    if (result.canceled || !result.assets?.length) return;
    setAttachment(attachmentFromImageAsset(result.assets[0], `camera-${Date.now()}.jpg`));
  };

  const removeAttachment = () => setAttachment(null);

  const onMicPress = () => {
    Alert.alert('Voice input', 'Voice input is coming soon.');
  };

  const filteredSessions = useMemo(() => {
    const query = sidebarSearch.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) => (session.title || '').toLowerCase().includes(query));
  }, [sessions, sidebarSearch]);
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
      <GeoBackground />
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
          </View>
          <View style={s.headerRight}>
            <ContextSelector hsMode={hsMode} selectedCount={selectedDocIds.length} onPress={() => setContextPanelOpen(true)} />
            <HapticTouchable onPress={newChat} activeOpacity={0.8} style={s.headerBtn} haptic="light">
              <Ionicons name="add-outline" size={20} color={selectedTheme.textPrimary} />
            </HapticTouchable>
          </View>
        </View>

        {isEmpty ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyBrand}>
              <Text style={s.emptyBrandMark}>cerbyl</Text>
              <Text style={s.emptyBrandSub}>learning unified</Text>
            </View>
            <Text style={s.emptyTitle}>{greeting}</Text>

            <View style={s.promptGrid}>
              {starterPrompts.slice(0, 3).map((prompt) => (
                <HapticTouchable key={prompt} style={s.promptChip} onPress={() => send(prompt)} haptic="selection" activeOpacity={0.86}>
                  <Text style={s.promptText}>{prompt}</Text>
                  <Ionicons name="chevron-forward" size={13} color={selectedTheme.accentHover} />
                </HapticTouchable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            style={{ flex: 1 }}
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
                        {item.attachmentUri ? <Image source={{ uri: item.attachmentUri }} style={s.messageImage} /> : null}
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

        <View style={[s.composerWrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {attachment ? (
            <View style={s.attachmentPreview}>
              <Image source={{ uri: attachment.uri }} style={s.attachmentThumb} />
              <Text style={s.attachmentName} numberOfLines={1}>{attachment.name}</Text>
              <HapticTouchable onPress={removeAttachment} style={s.attachmentRemove} haptic="light">
                <Ionicons name="close" size={13} color={selectedTheme.textPrimary} />
              </HapticTouchable>
            </View>
          ) : null}
          <View style={s.composerCard}>
            <HapticTouchable onPress={pickAttachment} style={s.composerIconBtn} activeOpacity={0.7} haptic="light">
              <Ionicons name="attach" size={19} color={selectedTheme.textSecondary} />
            </HapticTouchable>
            <HapticTouchable onPress={takePhoto} style={s.composerIconBtn} activeOpacity={0.7} haptic="medium">
              <Ionicons name="camera-outline" size={19} color={selectedTheme.textSecondary} />
            </HapticTouchable>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder="ask cerbyl anything..."
              placeholderTextColor={selectedTheme.textSecondary}
              multiline
            />
            <HapticTouchable onPress={onMicPress} style={s.composerIconBtn} activeOpacity={0.7} haptic="light">
              <Ionicons name="mic-outline" size={19} color={selectedTheme.textSecondary} />
            </HapticTouchable>
            <HapticTouchable
              style={[s.sendBtn, ((!input.trim() && !attachment) || loading) && s.sendDisabled]}
              onPress={() => send()}
              activeOpacity={0.85}
              disabled={(!input.trim() && !attachment) || loading}
              haptic="medium"
            >
              <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} style={s.sendGrad}>
                <Ionicons name="chevron-up" size={17} color={selectedTheme.isLight ? darkenColor(selectedTheme.accent, 32) : selectedTheme.bgPrimary} />
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
                    <Text style={s.sidebarTitle}>chats</Text>
                    <HapticTouchable
                      onPress={() => setSidebarSearchOpen((open) => !open)}
                      style={[s.sidebarSearchBtn, sidebarSearchOpen && s.sidebarSearchBtnActive]}
                      activeOpacity={0.8}
                      haptic="selection"
                    >
                      <Ionicons name="search" size={16} color={sidebarSearchOpen ? selectedTheme.bgPrimary : selectedTheme.textPrimary} />
                    </HapticTouchable>
                  </View>

                  {sidebarSearchOpen ? (
                    <View style={s.sidebarSearchWrap}>
                      <TextInput
                        value={sidebarSearch}
                        onChangeText={setSidebarSearch}
                        placeholder="search chats..."
                        placeholderTextColor={selectedTheme.textSecondary}
                        style={s.sidebarSearchInput}
                        autoFocus
                      />
                    </View>
                  ) : null}

                  <View style={s.sidebarDivider} />

                  {sessionsLoading ? (
                    <ActivityIndicator color={selectedTheme.accent} style={{ marginTop: 32 }} />
                  ) : filteredSessions.length === 0 ? (
                    <View style={s.sidebarEmptyWrap}>
                      <Ionicons name="chatbubbles-outline" size={28} color={selectedTheme.textSecondary} />
                      <Text style={s.sidebarEmpty}>{sidebarSearch ? 'No matches' : 'No chats yet'}</Text>
                    </View>
                  ) : (
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 6 }}>
                      {filteredSessions.map((session) => {
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

      <ContextPanel
        visible={contextPanelOpen}
        onClose={() => setContextPanelOpen(false)}
        onChange={({ hsMode: nextHsMode, selectedDocIds: nextIds }) => {
          setHsMode(nextHsMode);
          setSelectedDocIds(nextIds);
        }}
      />
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
    paddingHorizontal: 6,
    paddingTop: 14,
    paddingBottom: 10,
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
  headerCenter: { flex: 1, marginLeft: 12 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontFamily: 'Inter_900Black', fontSize: 24, color: GOLD_L, letterSpacing: -0.8 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: GOLD_M },

  emptyWrap: {
    flex: 1,
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: 6,
    justifyContent: 'center',
    gap: 18,
  },
  emptyBrand: {
    alignItems: 'center',
    marginBottom: 4,
  },
  emptyBrandMark: {
    fontFamily: 'Inter_900Black',
    fontSize: 42,
    color: GOLD_L,
    letterSpacing: -1.8,
  },
  emptyBrandSub: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    color: DIM,
    letterSpacing: 3.4,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  emptyTitle: {
    fontFamily: 'Inter_900Black',
    fontSize: 24,
    lineHeight: 29,
    color: GOLD_L,
    letterSpacing: -0.7,
    textAlign: 'center',
    alignSelf: 'center',
    maxWidth: '92%',
  },
  promptGrid: {
    gap: 8,
  },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderColor: rgbaFromHex(GOLD_L, theme.isLight ? 0.16 : 0.20),
    backgroundColor: rgbaFromHex(CARD_ALT, 0.92),
    borderRadius: 16,
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
    paddingHorizontal: 6,
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
  messageImage: {
    width: 190,
    maxWidth: '100%',
    height: 150,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: CARD_ALT,
  },
  userText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 22, color: GOLD_XL },

  composerWrap: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: 6,
    paddingTop: 6,
  },
  composerCard: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: rgbaFromHex(GOLD_L, theme.isLight ? 0.18 : 0.24),
    backgroundColor: rgbaFromHex(CARD_ALT, 0.96),
    paddingHorizontal: 6,
    paddingVertical: 6,
    shadowColor: SHADOW,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: theme.isLight ? 0.07 : 0.25,
    shadowRadius: 24,
    elevation: 14,
  },
  composerIconBtn: {
    width: 34, height: 34, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    borderColor: rgbaFromHex(GOLD_L, theme.isLight ? 0.10 : 0.14),
    backgroundColor: rgbaFromHex(theme.bgPrimary, theme.isLight ? 0.32 : 0.42),
  },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 4,
    paddingVertical: 8,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: GOLD_L,
    maxHeight: 120,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  sendDisabled: { opacity: 0.34 },
  sendGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  attachmentPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    backgroundColor: rgbaFromHex(CARD_ALT, 0.94),
    paddingHorizontal: 8, paddingVertical: 8, marginBottom: 6,
  },
  attachmentThumb: { width: 32, height: 32, borderRadius: 8 },
  attachmentName: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, color: DIM },
  attachmentRemove: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },

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
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sidebarTitle: { fontFamily: 'Inter_900Black', fontSize: 22, color: GOLD_L },
  sidebarSearchBtn: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: BORDER,
    backgroundColor: rgbaFromHex(CARD_ALT, 0.7),
  },
  sidebarSearchBtnActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  sidebarSearchWrap: { paddingHorizontal: 18, paddingBottom: 8 },
  sidebarSearchInput: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 12,
    backgroundColor: rgbaFromHex(CARD_ALT, 0.7),
    paddingHorizontal: 12, paddingVertical: 9,
    fontFamily: 'Inter_400Regular', fontSize: 13, color: GOLD_L,
  },
  sidebarDivider: { height: 1, backgroundColor: BORDER, marginHorizontal: 18, marginBottom: 2 },
  sidebarEmptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  sidebarEmpty: { fontFamily: 'Inter_400Regular', fontSize: 13, color: DIM },
  sessionItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginHorizontal: 8,
    marginVertical: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
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
