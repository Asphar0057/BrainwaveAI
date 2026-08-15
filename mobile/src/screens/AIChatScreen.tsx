import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  FlatList, Platform, Animated,
  Modal, ScrollView, ActivityIndicator, PanResponder, Alert, Image, ViewStyle, Keyboard, Share,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import MarkdownText from '../components/MarkdownText';
import HapticTouchable from '../components/HapticTouchable';
import TileGleam from '../components/TileGleam';
import NeumorphicTexture, { cbTileCardGradient, NeumorphicLayer, cbModalShadow } from '../components/NeumorphicTexture';
import GeoBackground from '../components/GeoBackground';
import ContextSelector from '../components/ContextSelector';
import ContextPanel from '../components/ContextPanel';
import { AuthUser } from '../services/auth';
import {
  createChatSession, askAI, askAIWithFile, getChatSessions, getChatMessages, getSearchHubSuggestions,
  renameChatSession, deleteChatSession, submitChatFeedback, getFriends, shareContent, getChatShareLink, WEB_URL,
  createChatFolder, getChatFolders, deleteChatFolder, moveChatToFolder, ChatFolder,
} from '../services/api';
import { getHsModeEnabled, getSelectedDocIds } from '../services/contextService';
import { triggerHaptic } from '../utils/haptics';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

const EDGE_SWIPE_WIDTH = 20;

type ChatAttachment = { uri: string; name: string; type: string };
type Msg = { id: string; role: 'user' | 'ai'; text: string; attachmentUri?: string };
type Session = { id: number; title: string; updated_at: string | null; folder_id?: number | null };
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
  const [renameTarget, setRenameTarget] = useState<Session | null>(null);
  const [renameText, setRenameText] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [shareTarget, setShareTarget] = useState<Session | null>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<number>>(new Set());
  const [sharing, setSharing] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, 'up' | 'down'>>({});
  const [negativeFeedbackTarget, setNegativeFeedbackTarget] = useState<Msg | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  useEffect(() => {
    getHsModeEnabled().then(setHsMode).catch(() => {});
    getSelectedDocIds().then(setSelectedDocIds).catch(() => {});
  }, []);
  const [starterPrompts, setStarterPrompts] = useState<string[]>(DEFAULT_PROMPTS);
  const greeting = useMemo(() => getRandomGreeting(user.first_name || user.username), [user.first_name, user.username]);
  const listRef = useRef<FlatList>(null);
  const slideAnim = useRef(new Animated.Value(-sidebarWidth)).current;
  const focusGlass = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    slideAnim.setValue(sidebarOpen ? 0 : -sidebarWidth);
  }, [sidebarOpen, sidebarWidth, slideAnim]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e: { duration?: number }) => {
      Animated.timing(focusGlass, {
        toValue: 1,
        duration: Platform.OS === 'ios' ? (e.duration || 250) : 180,
        useNativeDriver: true,
      }).start();
    });

    const hideSub = Keyboard.addListener(hideEvent, (e: { duration?: number }) => {
      Animated.timing(focusGlass, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? (e?.duration || 200) : 180,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [focusGlass]);

  const loadFolders = useCallback(() => {
    getChatFolders(user.username)
      .then((data) => setFolders(Array.isArray(data?.folders) ? data.folders : []))
      .catch(() => setFolders([]));
  }, [user.username]);

  const openSidebar = useCallback(() => {
    setSidebarOpen(true);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 100, friction: 14 }).start();
    setSessionsLoading(true);
    getChatSessions(user.username)
      .then((data) => setSessions(Array.isArray(data?.sessions) ? data.sessions : []))
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
    loadFolders();
  }, [sidebarWidth, slideAnim, user.username, loadFolders]);

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

  const openSessionActions = (session: Session) => {
    Alert.alert(
      session.title || 'untitled chat',
      undefined,
      [
        { text: 'Share', onPress: () => openShareModal(session) },
        { text: 'Rename', onPress: () => { setRenameTarget(session); setRenameText(session.title || ''); } },
        { text: 'Move to Folder', onPress: () => openMoveToFolder(session) },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Delete chat?', 'This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteChatSession(session.id);
                    setSessions((current) => current.filter((item) => item.id !== session.id));
                    if (chatId === session.id) newChat();
                  } catch (error) {
                    Alert.alert('Delete failed', error instanceof Error ? error.message : 'Please try again.');
                  }
                },
              },
            ]);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const submitRename = async () => {
    if (!renameTarget || !renameText.trim()) return;
    setRenaming(true);
    try {
      await renameChatSession(renameTarget.id, renameText.trim());
      setSessions((current) => current.map((item) => (item.id === renameTarget.id ? { ...item, title: renameText.trim() } : item)));
      setRenameTarget(null);
    } catch (error) {
      Alert.alert('Rename failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setRenaming(false);
    }
  };

  const openMoveToFolder = (session: Session) => {
    const previousFolderId = session.folder_id;
    const applyFolder = async (folderId: number | null) => {
      setSessions((current) => current.map((item) => (item.id === session.id ? { ...item, folder_id: folderId } : item)));
      try {
        await moveChatToFolder(session.id, folderId);
      } catch (error) {
        setSessions((current) => current.map((item) => (item.id === session.id ? { ...item, folder_id: previousFolderId } : item)));
        Alert.alert('Could not move chat', error instanceof Error ? error.message : 'Please try again.');
      }
    };
    const buttons: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = folders.map((folder) => ({
      text: folder.name,
      onPress: () => applyFolder(folder.id),
    }));
    if (session.folder_id) {
      buttons.push({
        text: 'Remove from folder',
        onPress: () => applyFolder(null),
      });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    if (folders.length === 0) {
      Alert.alert('No folders yet', 'Create a folder first from the sidebar.', [{ text: 'OK' }]);
      return;
    }
    Alert.alert('Move to folder', session.title || 'untitled chat', buttons);
  };

  const submitCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      await createChatFolder(user.username, newFolderName.trim());
      setNewFolderName('');
      setNewFolderModalOpen(false);
      loadFolders();
    } catch (error) {
      Alert.alert('Could not create folder', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setCreatingFolder(false);
    }
  };

  const removeFolder = (folder: ChatFolder) => {
    Alert.alert('Delete folder?', `Chats in "${folder.name}" will become unfiled.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const previousSessionFolderIds = sessions.filter((s) => s.folder_id === folder.id).map((s) => s.id);
          setFolders((current) => current.filter((f) => f.id !== folder.id));
          setSessions((current) => current.map((item) => (item.folder_id === folder.id ? { ...item, folder_id: null } : item)));
          try {
            await deleteChatFolder(folder.id);
          } catch (error) {
            setFolders((current) => [...current, folder]);
            setSessions((current) => current.map((item) => (previousSessionFolderIds.includes(item.id) ? { ...item, folder_id: folder.id } : item)));
            Alert.alert('Could not delete folder', error instanceof Error ? error.message : 'Please try again.');
          }
        },
      },
    ]);
  };

  const openShareModal = async (session: Session) => {
    setShareTarget(session);
    setSelectedFriendIds(new Set());
    if (friends.length === 0) {
      try {
        const data = await getFriends(user.username);
        setFriends(Array.isArray(data) ? data : data?.friends ?? []);
      } catch {
        setFriends([]);
      }
    }
  };

  const toggleFriendSelected = (friendId: number) => {
    setSelectedFriendIds((current) => {
      const next = new Set(current);
      if (next.has(friendId)) next.delete(friendId);
      else next.add(friendId);
      return next;
    });
  };

  const submitShare = async () => {
    if (!shareTarget || selectedFriendIds.size === 0) return;
    setSharing(true);
    try {
      await shareContent({ contentType: 'chat', contentId: shareTarget.id, friendIds: Array.from(selectedFriendIds) });
      setShareTarget(null);
      triggerHaptic('success');
    } catch (error) {
      Alert.alert('Share failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSharing(false);
    }
  };

  const copyChatLink = async () => {
    if (!shareTarget) return;
    try {
      const { public_token } = await getChatShareLink(shareTarget.id);
      const url = `${WEB_URL}/chat/share/${public_token}`;
      await Share.share(Platform.OS === 'ios' ? { url, message: url } : { message: url });
    } catch (error) {
      Alert.alert('Could not create link', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const giveFeedback = (message: Msg, direction: 'up' | 'down') => {
    setFeedbackGiven((current) => ({ ...current, [message.id]: direction }));
    triggerHaptic(direction === 'up' ? 'success' : 'light');
    if (direction === 'up') {
      submitChatFeedback({ userId: user.username, rating: 5, messageContent: message.text }).catch(() => {});
    } else {
      setNegativeFeedbackTarget(message);
      setFeedbackComment('');
    }
  };

  const submitNegativeFeedback = async () => {
    if (!negativeFeedbackTarget) return;
    try {
      await submitChatFeedback({
        userId: user.username,
        rating: 2,
        messageContent: negativeFeedbackTarget.text,
        feedbackText: feedbackComment.trim() || undefined,
      });
    } catch {
      // silenced -- feedback is best-effort
    } finally {
      setNegativeFeedbackTarget(null);
      setFeedbackComment('');
    }
  };

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
  const unfiledSessions = useMemo(() => filteredSessions.filter((s) => !s.folder_id), [filteredSessions]);
  const foldersWithSessions = useMemo(
    () => folders.map((folder) => ({ folder, sessions: filteredSessions.filter((s) => s.folder_id === folder.id) })),
    [folders, filteredSessions]
  );
  const isEmpty = messages.length === 0 && !loading;

  const renderSessionCard = (session: Session) => {
    const active = chatId === session.id;
    return (
      <TileGleam
        key={session.id}
        borderRadius={18}
        style={[s.sessionCard, active && s.sessionCardActive]}
        onPress={() => loadSession(session)}
        onLongPress={() => openSessionActions(session)}
        haptic="selection"
      >
        <NeumorphicTexture grainVariant="dots" grainOpacity={0.14} />
        <View style={s.sessionRow}>
          <View style={[s.sessionAvatar, active && s.sessionAvatarActive]}>
            <Ionicons
              name="chatbubble-ellipses"
              size={14}
              color={active ? selectedTheme.bgPrimary : selectedTheme.accentHover}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.sessionTitle, active && s.sessionTitleActive]} numberOfLines={2}>
              {session.title || 'untitled chat'}
            </Text>
            {session.updated_at ? (
              <Text style={s.sessionDate}>{new Date(session.updated_at).toLocaleDateString()}</Text>
            ) : null}
          </View>
          {active ? <Ionicons name="chevron-forward" size={14} color={selectedTheme.accentHover} /> : null}
        </View>
      </TileGleam>
    );
  };

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

      <View style={{ flex: 1 }}>
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

        <Animated.View style={{ flex: 1, opacity: focusGlass.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) }}>
        {isEmpty ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyBrand}>
              <Text style={s.emptyBrandMark}>cerbyl</Text>
              <Text style={s.emptyBrandSub}>learning unified</Text>
            </View>
            <Text style={s.emptyTitle}>{greeting}</Text>

            <View style={s.promptGrid}>
              {starterPrompts.slice(0, 3).map((prompt) => (
                <TileGleam key={prompt} style={s.promptChip} onPress={() => send(prompt)} borderRadius={16}>
                  <NeumorphicTexture
                    grainVariant="skia"
                    grainOpacity={0.44}
                    baseFrequency={0.7}
                    gradientColors={cbTileCardGradient.colors}
                    gradientStart={cbTileCardGradient.start}
                    gradientEnd={cbTileCardGradient.end}
                  />
                  <Text style={s.promptText}>{prompt}</Text>
                  <Ionicons name="chevron-forward" size={13} color={selectedTheme.accentHover} />
                </TileGleam>
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
                          style={[StyleSheet.absoluteFillObject, { borderRadius: 14 }]}
                        />
                        {item.attachmentUri ? <Image source={{ uri: item.attachmentUri }} style={s.messageImage} /> : null}
                        <Text style={s.userText}>{item.text}</Text>
                      </>
                    ) : (
                      <MarkdownText>{preprocessText(item.text)}</MarkdownText>
                    )}
                  </View>
                  {!isUser ? (
                    <View style={s.feedbackRow}>
                      <HapticTouchable onPress={() => giveFeedback(item, 'up')} style={s.feedbackBtn} haptic="none" accessibilityLabel="Good response">
                        <Ionicons
                          name={feedbackGiven[item.id] === 'up' ? 'thumbs-up' : 'thumbs-up-outline'}
                          size={14}
                          color={feedbackGiven[item.id] === 'up' ? selectedTheme.success : selectedTheme.textSecondary}
                        />
                      </HapticTouchable>
                      <HapticTouchable onPress={() => giveFeedback(item, 'down')} style={s.feedbackBtn} haptic="none" accessibilityLabel="Poor response">
                        <Ionicons
                          name={feedbackGiven[item.id] === 'down' ? 'thumbs-down' : 'thumbs-down-outline'}
                          size={14}
                          color={feedbackGiven[item.id] === 'down' ? selectedTheme.danger : selectedTheme.textSecondary}
                        />
                      </HapticTouchable>
                    </View>
                  ) : null}
                </View>
              );
            }}
          />
        )}
        </Animated.View>

        <View style={s.composerWrap}>
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
              placeholder="Ask Cerbyl"
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
      </View>

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
                <SafeAreaView style={{ flex: 1, paddingTop: 6, paddingBottom: 6 }} edges={[]}>
                  <View style={s.sidebarHero}>
                    <NeumorphicLayer grainOpacity={0.22} />
                    <Text style={s.sidebarGhost}>01</Text>
                    <View style={s.sidebarHeroRow}>
                      <View>
                        <Text style={s.sidebarTitle}>chats</Text>
                        <Text style={s.sidebarSub}>{sessions.length} conversation{sessions.length === 1 ? '' : 's'}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <HapticTouchable
                          onPress={() => setNewFolderModalOpen(true)}
                          style={s.sidebarSearchBtn}
                          activeOpacity={0.8}
                          haptic="selection"
                          accessibilityLabel="New folder"
                        >
                          <Ionicons name="folder-outline" size={16} color={selectedTheme.textPrimary} />
                        </HapticTouchable>
                        <HapticTouchable
                          onPress={() => setSidebarSearchOpen((open) => !open)}
                          style={[s.sidebarSearchBtn, sidebarSearchOpen && s.sidebarSearchBtnActive]}
                          activeOpacity={0.8}
                          haptic="selection"
                        >
                          <Ionicons name="search" size={16} color={sidebarSearchOpen ? selectedTheme.bgPrimary : selectedTheme.textPrimary} />
                        </HapticTouchable>
                      </View>
                    </View>
                  </View>

                  {sidebarSearchOpen ? (
                    <View style={s.sidebarSearchWrap}>
                      <Ionicons name="search" size={14} color={selectedTheme.textSecondary} style={s.sidebarSearchIcon} />
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

                  {sessionsLoading ? (
                    <ActivityIndicator color={selectedTheme.accent} style={{ marginTop: 32 }} />
                  ) : filteredSessions.length === 0 ? (
                    <View style={s.sidebarEmptyWrap}>
                      <Ionicons name="chatbubbles-outline" size={28} color={selectedTheme.textSecondary} />
                      <Text style={s.sidebarEmpty}>{sidebarSearch ? 'No matches' : 'No chats yet'}</Text>
                    </View>
                  ) : (
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 6, paddingBottom: 20 }}>
                      {foldersWithSessions.map(({ folder, sessions: folderSessions }) => (
                        folderSessions.length > 0 || !sidebarSearch ? (
                          <View key={folder.id} style={{ marginBottom: 4 }}>
                            <HapticTouchable
                              style={s.folderHeaderRow}
                              onLongPress={() => removeFolder(folder)}
                              haptic="none"
                            >
                              <Ionicons name="folder" size={13} color={folder.color || selectedTheme.accent} />
                              <Text style={s.folderHeaderText}>{folder.name}</Text>
                              <Text style={s.folderHeaderCount}>{folderSessions.length}</Text>
                            </HapticTouchable>
                            {folderSessions.map((session) => renderSessionCard(session))}
                          </View>
                        ) : null
                      ))}

                      {unfiledSessions.length === 0 && foldersWithSessions.length > 0 ? null : (
                        <>
                          {foldersWithSessions.length > 0 ? <Text style={s.folderHeaderText2}>unfiled</Text> : null}
                          {unfiledSessions.length === 0 ? (
                            <View style={s.sidebarEmptyWrap}>
                              <Ionicons name="chatbubbles-outline" size={28} color={selectedTheme.textSecondary} />
                              <Text style={s.sidebarEmpty}>{sidebarSearch ? 'No matches' : 'No chats yet'}</Text>
                            </View>
                          ) : (
                            unfiledSessions.map((session) => renderSessionCard(session))
                          )}
                        </>
                      )}
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

      <Modal transparent visible={newFolderModalOpen} animationType="fade" onRequestClose={() => setNewFolderModalOpen(false)}>
        <View style={s.centerOverlay}>
          <HapticTouchable style={StyleSheet.absoluteFill} onPress={() => setNewFolderModalOpen(false)} activeOpacity={1} haptic="none" />
          <View style={s.centerCard}>
            <Text style={s.centerCardTitle}>new folder</Text>
            <TextInput
              style={s.centerCardInput}
              value={newFolderName}
              onChangeText={setNewFolderName}
              placeholder="folder name"
              placeholderTextColor={selectedTheme.textSecondary}
              autoFocus
            />
            <View style={s.centerCardActions}>
              <HapticTouchable style={s.centerCardCancel} onPress={() => { setNewFolderModalOpen(false); setNewFolderName(''); }} haptic="light">
                <Text style={s.centerCardCancelText}>cancel</Text>
              </HapticTouchable>
              <HapticTouchable style={s.centerCardSave} onPress={submitCreateFolder} haptic="medium" disabled={creatingFolder || !newFolderName.trim()}>
                {creatingFolder ? <ActivityIndicator size="small" color={selectedTheme.bgPrimary} /> : <Text style={s.centerCardSaveText}>create</Text>}
              </HapticTouchable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={!!renameTarget} animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <View style={s.centerOverlay}>
          <HapticTouchable style={StyleSheet.absoluteFill} onPress={() => setRenameTarget(null)} activeOpacity={1} haptic="none" />
          <View style={s.centerCard}>
            <Text style={s.centerCardTitle}>rename chat</Text>
            <TextInput
              style={s.centerCardInput}
              value={renameText}
              onChangeText={setRenameText}
              placeholder="chat title"
              placeholderTextColor={selectedTheme.textSecondary}
              autoFocus
            />
            <View style={s.centerCardActions}>
              <HapticTouchable style={s.centerCardCancel} onPress={() => setRenameTarget(null)} haptic="light">
                <Text style={s.centerCardCancelText}>cancel</Text>
              </HapticTouchable>
              <HapticTouchable style={s.centerCardSave} onPress={submitRename} haptic="medium" disabled={renaming || !renameText.trim()}>
                {renaming ? <ActivityIndicator size="small" color={selectedTheme.bgPrimary} /> : <Text style={s.centerCardSaveText}>save</Text>}
              </HapticTouchable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={!!shareTarget} animationType="fade" onRequestClose={() => setShareTarget(null)}>
        <View style={s.centerOverlay}>
          <HapticTouchable style={StyleSheet.absoluteFill} onPress={() => setShareTarget(null)} activeOpacity={1} haptic="none" />
          <View style={s.centerCard}>
            <Text style={s.centerCardTitle}>share "{shareTarget?.title || 'this chat'}"</Text>
            <HapticTouchable style={s.shareLinkRow} onPress={copyChatLink} haptic="selection">
              <Ionicons name="link-outline" size={16} color={selectedTheme.accentHover} />
              <Text style={s.shareLinkText}>share public link</Text>
            </HapticTouchable>
            {friends.length === 0 ? (
              <Text style={s.centerCardSub}>add friends to share directly with them</Text>
            ) : (
              <>
                <Text style={s.centerCardSub}>or share with friends</Text>
                <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                  {friends.map((f: any) => {
                    const selected = selectedFriendIds.has(f.id);
                    return (
                      <HapticTouchable key={f.id} style={s.friendRow} onPress={() => toggleFriendSelected(f.id)} haptic="selection">
                        <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={18} color={selected ? selectedTheme.accentHover : selectedTheme.textSecondary} />
                        <Text style={s.friendRowText}>{f.username || f.friend_username || f.name || '?'}</Text>
                      </HapticTouchable>
                    );
                  })}
                </ScrollView>
                <View style={s.centerCardActions}>
                  <HapticTouchable style={s.centerCardCancel} onPress={() => setShareTarget(null)} haptic="light">
                    <Text style={s.centerCardCancelText}>cancel</Text>
                  </HapticTouchable>
                  <HapticTouchable style={s.centerCardSave} onPress={submitShare} haptic="medium" disabled={sharing || selectedFriendIds.size === 0}>
                    {sharing ? <ActivityIndicator size="small" color={selectedTheme.bgPrimary} /> : <Text style={s.centerCardSaveText}>share</Text>}
                  </HapticTouchable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal transparent visible={!!negativeFeedbackTarget} animationType="fade" onRequestClose={() => setNegativeFeedbackTarget(null)}>
        <View style={s.centerOverlay}>
          <HapticTouchable style={StyleSheet.absoluteFill} onPress={() => { setNegativeFeedbackTarget(null); setFeedbackComment(''); }} activeOpacity={1} haptic="none" />
          <View style={s.centerCard}>
            <Text style={s.centerCardTitle}>what went wrong?</Text>
            <Text style={s.centerCardSub}>optional — helps us improve cerbyl</Text>
            <TextInput
              style={[s.centerCardInput, { minHeight: 70 }]}
              value={feedbackComment}
              onChangeText={setFeedbackComment}
              placeholder="tell us more..."
              placeholderTextColor={selectedTheme.textSecondary}
              multiline
              autoFocus
            />
            <View style={s.centerCardActions}>
              <HapticTouchable style={s.centerCardCancel} onPress={() => { setNegativeFeedbackTarget(null); setFeedbackComment(''); }} haptic="light">
                <Text style={s.centerCardCancelText}>skip</Text>
              </HapticTouchable>
              <HapticTouchable style={s.centerCardSave} onPress={submitNegativeFeedback} haptic="medium">
                <Text style={s.centerCardSaveText}>submit</Text>
              </HapticTouchable>
            </View>
          </View>
        </View>
      </Modal>
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
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  } as ViewStyle,
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
    paddingHorizontal: 2,
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
  feedbackRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
    marginHorizontal: 6,
  },
  feedbackBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingTop: 0,
    paddingBottom: 0,
  },
  composerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: rgbaFromHex(GOLD_L, theme.isLight ? 0.18 : 0.24),
    backgroundColor: rgbaFromHex(CARD_ALT, 0.96),
    paddingHorizontal: 8,
    paddingVertical: 5,
    shadowColor: SHADOW,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: theme.isLight ? 0.07 : 0.25,
    shadowRadius: 24,
    elevation: 14,
  },
  composerIconBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    borderColor: rgbaFromHex(GOLD_L, theme.isLight ? 0.10 : 0.14),
    backgroundColor: rgbaFromHex(theme.bgPrimary, theme.isLight ? 0.32 : 0.42),
  },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 6,
    paddingVertical: 6,
    minHeight: 30,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 19,
    color: GOLD_L,
    maxHeight: 120,
  },
  sendBtn: { width: 34, height: 34, borderRadius: 17, overflow: 'hidden' },
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
  sidebarHero: {
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 22,
    padding: 16,
    overflow: 'hidden',
    boxShadow: cbModalShadow(0.14),
  } as ViewStyle,
  sidebarGhost: {
    position: 'absolute',
    right: 10,
    top: -8,
    fontFamily: 'Inter_900Black',
    fontSize: 68,
    lineHeight: 72,
    color: rgbaFromHex(theme.textPrimary, theme.isLight ? 0.05 : 0.07),
    letterSpacing: -3,
  },
  sidebarHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sidebarTitle: { fontFamily: 'Inter_900Black', fontSize: 24, color: GOLD_L },
  sidebarSub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginTop: 3 },
  sidebarSearchBtn: {
    width: 34, height: 34, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: rgbaFromHex(GOLD_L, theme.isLight ? 0.14 : 0.18),
    backgroundColor: rgbaFromHex(theme.bgPrimary, theme.isLight ? 0.32 : 0.42),
  },
  sidebarSearchBtnActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  folderHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 8 },
  folderHeaderText: { fontFamily: 'Inter_700Bold', fontSize: 10.5, color: GOLD_L, letterSpacing: 0.6, flex: 1 },
  folderHeaderCount: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM },
  folderHeaderText2: { fontFamily: 'Inter_700Bold', fontSize: 10.5, color: DIM, letterSpacing: 0.6, paddingHorizontal: 16, paddingVertical: 8, textTransform: 'uppercase' },
  sidebarSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: rgbaFromHex(GOLD_L, theme.isLight ? 0.16 : 0.2),
    borderRadius: 14,
    backgroundColor: rgbaFromHex(CARD_ALT, 0.85),
    paddingHorizontal: 12,
    gap: 8,
  },
  sidebarSearchIcon: { flexShrink: 0 },
  sidebarSearchInput: {
    flex: 1,
    paddingVertical: 10,
    fontFamily: 'Inter_400Regular', fontSize: 13, color: GOLD_L,
  },
  sidebarEmptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  sidebarEmpty: { fontFamily: 'Inter_400Regular', fontSize: 13, color: DIM },
  sessionCard: {
    marginHorizontal: 10,
    marginVertical: 4,
    backgroundColor: rgbaFromHex(CARD, theme.isLight ? 0.85 : 0.92),
  } as ViewStyle,
  sessionCardActive: {
    backgroundColor: rgbaFromHex(theme.accent, theme.isLight ? 0.12 : 0.16),
  },
  sessionRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  sessionAvatar: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: rgbaFromHex(GOLD_D, 0.18),
    borderWidth: 1, borderColor: rgbaFromHex(GOLD_L, 0.2),
  },
  sessionAvatarActive: {
    backgroundColor: theme.accentHover,
    borderColor: theme.accentHover,
  },
  sessionTitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: GOLD_L, lineHeight: 18 },
  sessionTitleActive: { color: theme.accentHover, fontFamily: 'Inter_600SemiBold' },
  sessionDate: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, marginTop: 3, letterSpacing: 0.4 },

  centerOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 24 },
  centerCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    padding: 20,
    gap: 12,
    boxShadow: cbModalShadow(0.2),
  } as ViewStyle,
  centerCardTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, color: GOLD_L },
  centerCardSub: { fontFamily: 'Inter_400Regular', fontSize: 11.5, color: DIM, marginTop: -8 },
  centerCardInput: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 13.5,
    color: GOLD_XL,
    backgroundColor: rgbaFromHex(theme.bgPrimary, theme.isLight ? 0.5 : 0.6),
    textAlignVertical: 'top',
  },
  centerCardActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  centerCardCancel: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12 },
  centerCardCancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: DIM },
  centerCardSave: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12, backgroundColor: theme.accent, minWidth: 72, alignItems: 'center' },
  centerCardSaveText: { fontFamily: 'Inter_700Bold', fontSize: 12.5, color: theme.isLight ? darkenColor(theme.accent, 32) : theme.bgPrimary },

  shareLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: rgbaFromHex(theme.accent, theme.isLight ? 0.08 : 0.12) },
  shareLinkText: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: GOLD_L },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  friendRowText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: GOLD_XL },
});
}
