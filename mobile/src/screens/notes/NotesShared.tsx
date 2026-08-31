import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  useFonts,
  Inter_900Black,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import AmbientBubbles from '../../components/AmbientBubbles';
import GeoBackground from '../../components/GeoBackground';
import HapticTouchable from '../../components/HapticTouchable';
import TileGleam from '../../components/TileGleam';
import { cbTileShadow, cbModalShadow, cbTileBorder } from '../../components/NeumorphicTexture';
import SectionSidebar, { SidebarItem } from '../../components/SectionSidebar';
import { AuthUser } from '../../services/auth';
import { useAppTheme } from '../../contexts/ThemeContext';
import {
  createFolder,
  createNote,
  convertChatSessionsToNote,
  convertChatSessionsToNoteContent,
  convertNotesToFlashcards,
  convertNotesToQuestions,
  getChatSessions,
  getFolders,
  getNotes,
  getTrash,
  invokeNotesAgent,
  moveNoteToFolder,
  moveNoteToTrash,
  permanentlyDeleteNote,
  restoreNote,
  toggleFavorite,
  updateNote,
} from '../../services/api';
import { darkenColor, getDefaultTheme, rgbaFromHex } from '../../utils/theme';
import { getResponsiveLayout, useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import {
  BUILT_IN_NOTE_TEMPLATES,
  NoteTemplate,
  applyTemplateVariables,
} from '../../data/noteTemplates';
import {
  buildNoteContentFromBlocks,
  createCanvasBlock,
  createTextBlock,
  getPlainNoteText,
  hasCanvasPayload,
  parseNoteCanvasBlocks,
  serializeBlocksForComparison,
  type NoteCanvasBlock,
} from '../../utils/noteCanvas';
import { NOTE_FONT_OPTIONS, normalizeNoteFont, resolveNoteFont } from '../../constants/noteFonts';

const DEFAULT_THEME = getDefaultTheme();
const DEFAULT_LAYOUT = getResponsiveLayout(393, 852);
export const CUSTOM_TEMPLATE_KEY = 'mobile.customNoteTemplates';
const RECENT_NOTES_KEY_PREFIX = 'mobile.notes.recent';
const PAGE_PROPERTIES_KEY_PREFIX = 'mobile.notes.properties';
const ADVANCED_SEARCH_HISTORY_KEY_PREFIX = 'mobile.notes.searchHistory';
// Same palette as the flashcards page's collection covers, for visual parity.
const NOTE_COVER_COLORS = ['#df6b6b', '#69beb8', '#68aac7', '#e99b76', '#8dbfab', '#dcc86d'];

export let CURRENT_THEME = DEFAULT_THEME;
let BG = DEFAULT_THEME.bgPrimary;
let SURFACE = DEFAULT_THEME.panel;
let SURFACE_2 = DEFAULT_THEME.panelAlt;
export let ACCENT = DEFAULT_THEME.accent;
export let GOLD_L = DEFAULT_THEME.accentHover;
export let GOLD_D = darkenColor(DEFAULT_THEME.accent, DEFAULT_THEME.isLight ? 10 : 26);
let GOLD_XD = darkenColor(DEFAULT_THEME.accent, DEFAULT_THEME.isLight ? 26 : 40);
let BORDER = DEFAULT_THEME.borderStrong;
export let DIM2 = DEFAULT_THEME.textSecondary;
export let RED = DEFAULT_THEME.danger;
let GREEN = DEFAULT_THEME.success;
let INK = DEFAULT_THEME.isLight ? darkenColor(DEFAULT_THEME.accent, 45) : darkenColor(DEFAULT_THEME.primary, 2);
let BASE_ACTION_BG = DEFAULT_THEME.isLight ? rgbaFromHex(DEFAULT_THEME.panel, 0.98) : DEFAULT_THEME.accent;
let BASE_ACTION_TEXT = DEFAULT_THEME.isLight ? DEFAULT_THEME.accent : darkenColor(DEFAULT_THEME.primary, 2);
let BASE_ACTION_BORDER = DEFAULT_THEME.isLight ? DEFAULT_THEME.borderStrong : DEFAULT_THEME.accentHover;

export type Note = {
  id: number;
  title: string;
  content: string;
  updated_at: string;
  created_at?: string | null;
  is_favorite: boolean;
  folder_id: number | null;
  custom_font: string;
};

type RecentNote = {
  id: number;
  title: string;
  viewedAt: string;
};

export type PagePropertyType = 'text' | 'number' | 'date' | 'checkbox' | 'tags' | 'person' | 'url';

export type PageProperty = {
  id: string;
  name: string;
  type: PagePropertyType;
  value: string | boolean;
};

type SmartFolderGroup = {
  name: string;
  notes: Note[];
};

export type Folder = {
  id: number;
  name: string;
  color: string;
  note_count: number;
  parent_id: number | null;
  created_at?: string;
};

type TrashNote = {
  id: number;
  title: string;
  content: string;
  deleted_at: string | null;
  days_remaining: number;
};

export type ChatSession = {
  id: number;
  title: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CustomTemplate = NoteTemplate & {
  createdAt: string;
};

export type Difficulty = 'easy' | 'medium' | 'hard';
type FilterValue =
  | 'all'
  | 'favorites'
  | 'source:flashcards'
  | 'source:quizzes'
  | 'source:roadmaps'
  | `folder:${number}`;
export type ConvertTarget = 'flashcards' | 'questions';
export type TemplateTab = 'built-in' | 'custom';
export type AiAction =
  | 'grammar'
  | 'improve'
  | 'simplify'
  | 'expand'
  | 'summarize'
  | 'continue'
  | 'generate'
  | 'tone_change'
  | 'code';

export type NotesRootProps = { user: AuthUser; onBack?: () => void };
type Props = NotesRootProps;
export type NotesLibraryProps = NotesRootProps & {
  refreshTick: number;
  onCreated: () => void;
  onOpenEditor: (note: Note, folders: Folder[]) => void;
  onOpenTrash: () => void;
  onOpenMedia: () => void;
  onOpenCanvas: () => void;
  onOpenGenerator: () => void;
};
export type NotesGeneratorProps = {
  user: AuthUser;
  onBack: () => void;
  onCreated: () => void;
  onOpenEditor: (note: Note, folders: Folder[]) => void;
  onOpenLibrary: () => void;
  onOpenMedia: () => void;
  onOpenTemplates: () => void;
  onOpenCanvas: () => void;
  onOpenTrash: () => void;
};
export type NotesTemplatesProps = {
  user: AuthUser;
  onBack: () => void;
  onCreated: () => void;
  onOpenEditor: (note: Note, folders: Folder[]) => void;
};
export type NoteEditorProps = {
  user: AuthUser;
  note: Note;
  folders: Folder[];
  onBack: () => void;
  onSaved: (note: Note) => void;
  onMovedToTrash: (noteId: number) => void;
  onFavoriteChanged: (noteId: number, isFavorite: boolean) => void;
  onOpenCanvas: (session: { blockId?: string; initialData?: string }) => void;
  onCanvasReturnHandled: () => void;
  canvasReturn?: {
    nonce: number;
    status: 'saved' | 'cancelled';
    blockId?: string;
    canvasData?: string;
    canvasPreview?: string;
  } | null;
};
export type NotesTrashProps = {
  user: AuthUser;
  onBack: () => void;
  onChanged: () => void;
};

function applyTheme(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  CURRENT_THEME = theme;
  BG = theme.bgPrimary;
  SURFACE = theme.panel;
  SURFACE_2 = theme.panelAlt;
  ACCENT = theme.accent;
  GOLD_L = theme.accentHover;
  GOLD_D = darkenColor(theme.accent, theme.isLight ? 10 : 26);
  GOLD_XD = darkenColor(theme.accent, theme.isLight ? 26 : 40);
  BORDER = theme.borderStrong;
  DIM2 = theme.textSecondary;
  RED = theme.danger;
  GREEN = theme.success;
  INK = theme.isLight ? darkenColor(theme.accent, 45) : darkenColor(theme.primary, 2);
  BASE_ACTION_BG = theme.isLight ? rgbaFromHex(theme.panel, 0.98) : theme.accent;
  BASE_ACTION_TEXT = theme.isLight ? theme.accent : darkenColor(theme.primary, 2);
  BASE_ACTION_BORDER = theme.isLight ? theme.borderStrong : theme.accentHover;
}

export function prepareNotesScreen(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  applyTheme(theme);
  s = createStyles(layout);
}

export function useNotesFontsLoaded() {
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  return fontsLoaded;
}

export function stripHtml(html: string) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function formatDate(iso?: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffHours < 1) return 'just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function matchesSource(note: Note, source: 'flashcards' | 'quizzes' | 'roadmaps') {
  const haystack = `${note.title} ${getPlainNoteText(note.content)}`.toLowerCase();
  if (source === 'flashcards') return haystack.includes('flashcard');
  if (source === 'quizzes') return haystack.includes('quiz');
  return haystack.includes('roadmap') || haystack.includes('knowledge map');
}

function buildNoteFromApi(data: any): Note {
  return {
    id: data.id,
    title: data.title ?? 'Untitled Note',
    content: data.content ?? '',
    updated_at: data.updated_at ?? new Date().toISOString(),
    created_at: data.created_at ?? data.updated_at ?? new Date().toISOString(),
    is_favorite: Boolean(data.is_favorite),
    folder_id: data.folder_id ?? null,
    custom_font: normalizeNoteFont(data.custom_font),
  };
}

function recentNotesKey(userId: string) {
  return `${RECENT_NOTES_KEY_PREFIX}.${userId}`;
}

export function pagePropertiesKey(userId: string, noteId: number) {
  return `${PAGE_PROPERTIES_KEY_PREFIX}.${userId}.${noteId}`;
}

function advancedSearchHistoryKey(userId: string) {
  return `${ADVANCED_SEARCH_HISTORY_KEY_PREFIX}.${userId}`;
}

export function createDefaultPageProperties(): PageProperty[] {
  return [
    { id: 'created', name: 'Created', type: 'date', value: new Date().toISOString().split('T')[0] },
    { id: 'status', name: 'Status', type: 'text', value: 'Draft' },
  ];
}

function groupNotesByKeywords(notesToGroup: Note[]): SmartFolderGroup[] {
  const groups: Record<string, Note[]> = {};
  const uncategorized: Note[] = [];

  const topicPatterns: Record<string, string[]> = {
    'Study Notes': ['study', 'learn', 'exam', 'test', 'quiz', 'chapter', 'lecture', 'class', 'course'],
    Work: ['meeting', 'project', 'deadline', 'client', 'report', 'task', 'work', 'office', 'team'],
    Personal: ['diary', 'journal', 'personal', 'life', 'family', 'friend', 'birthday', 'vacation'],
    Ideas: ['idea', 'brainstorm', 'concept', 'thought', 'plan', 'goal', 'dream', 'future'],
    Research: ['research', 'analysis', 'data', 'study', 'paper', 'article', 'source', 'reference'],
    Technical: ['code', 'programming', 'software', 'api', 'database', 'server', 'bug', 'feature'],
    Finance: ['budget', 'money', 'expense', 'income', 'investment', 'savings', 'cost', 'price'],
    Health: ['health', 'exercise', 'diet', 'workout', 'medical', 'doctor', 'fitness', 'wellness'],
  };

  notesToGroup.forEach((note) => {
    const content = `${note.title || ''} ${getPlainNoteText(note.content)}`.toLowerCase();
    let matched = false;

    Object.entries(topicPatterns).forEach(([category, keywords]) => {
      if (matched) return;
      if (keywords.some((keyword) => content.includes(keyword))) {
        groups[category] = groups[category] ?? [];
        groups[category].push(note);
        matched = true;
      }
    });

    if (!matched) {
      uncategorized.push(note);
    }
  });

  const result = Object.entries(groups)
    .map(([name, groupedNotes]) => ({ name, notes: groupedNotes }))
    .filter((group) => group.notes.length > 0)
    .sort((a, b) => b.notes.length - a.notes.length);

  if (uncategorized.length > 0) {
    result.push({ name: 'Other', notes: uncategorized });
  }

  return result;
}

export function getPropertyDisplayValue(property: PageProperty) {
  if (property.type === 'checkbox') {
    return property.value ? 'Yes' : 'No';
  }
  if (property.type === 'date' && typeof property.value === 'string' && property.value) {
    return new Date(property.value).toLocaleDateString();
  }
  return String(property.value || '');
}

export function FilterChip({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}) {
  return (
    <HapticTouchable
      style={[s.filterChip, active && s.filterChipActive]}
      onPress={onPress}
      activeOpacity={0.85}
      haptic="selection"
    >
      {icon ? <Ionicons name={icon} size={14} color={active ? BG : GOLD_D} /> : null}
      <Text style={[s.filterChipText, active && s.filterChipTextActive]}>{label}</Text>
    </HapticTouchable>
  );
}

export function CompactActionTile({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <TileGleam style={s.compactActionTile} borderRadius={18} onPress={onPress} haptic="light">
      <View style={s.compactActionIconWrap}>
        <Ionicons name={icon} size={16} color={ACCENT} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.compactActionTitle}>{title}</Text>
        <Text style={s.compactActionSubtitle} numberOfLines={2}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={GOLD_D} />
    </TileGleam>
  );
}

export function ModalShell({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={s.modalRoot}>
        <Pressable style={s.modalBackdrop} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalKeyboard}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>{title}</Text>
                {subtitle ? <Text style={s.modalSubtitle}>{subtitle}</Text> : null}
              </View>
              <HapticTouchable onPress={onClose} style={s.modalCloseBtn} haptic="selection">
                <Ionicons name="close" size={18} color={GOLD_D} />
              </HapticTouchable>
            </View>
            {children}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export function NotesTrashScreen({
  user,
  onBack,
  onChanged,
}: NotesTrashProps) {
  const [trash, setTrash] = useState<TrashNote[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTrash = () => {
    setLoading(true);
    getTrash(user.username)
      .then((data) => setTrash(data?.trash ?? []))
      .catch(() => setTrash([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTrash();
  }, [user.username]);

  const doRestore = async (noteId: number) => {
    try {
      await restoreNote(noteId);
      setTrash((current) => current.filter((note) => note.id !== noteId));
      onChanged();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to restore note';
      Alert.alert('Restore failed', message);
    }
  };

  const doPermanentDelete = async (noteId: number) => {
    try {
      await permanentlyDeleteNote(noteId);
      setTrash((current) => current.filter((note) => note.id !== noteId));
      onChanged();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete note';
      Alert.alert('Delete failed', message);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <GeoBackground />
      <AmbientBubbles theme={CURRENT_THEME} variant="notes" opacity={0.82} />
      <View style={s.header}>
        <HapticTouchable onPress={onBack} style={{ marginRight: 12 }} haptic="selection">
          <Ionicons name="chevron-back" size={22} color={GOLD_L} />
        </HapticTouchable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>trash</Text>
          <Text style={s.subtitle}>recoverable for 30 days</Text>
        </View>
        <Ionicons name="trash-outline" size={22} color={GOLD_D} />
      </View>

      {loading ? (
        <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
      ) : trash.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>trash is empty</Text>
          <Text style={s.emptyHint}>deleted notes will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={trash}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => (
            <View style={s.trashCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.noteCardTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={s.notePreview} numberOfLines={2}>{getPlainNoteText(item.content) || 'No content'}</Text>
                <Text style={s.trashMeta}>{item.days_remaining}d remaining</Text>
              </View>
              <View style={s.trashActions}>
                <HapticTouchable style={s.restoreBtn} onPress={() => doRestore(item.id)} haptic="success">
                  <Text style={s.restoreBtnText}>restore</Text>
                </HapticTouchable>
                <HapticTouchable
                  style={s.deleteForeverBtn}
                  onPress={() => {
                    Alert.alert('Delete permanently?', 'This cannot be undone.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => doPermanentDelete(item.id) },
                    ]);
                  }}
                  haptic="warning"
                >
                  <Text style={s.deleteForeverText}>delete</Text>
                </HapticTouchable>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const NOTES_SIDEBAR_ITEMS: SidebarItem[] = [
  { key: 'library', label: 'Library' },
  { key: 'generate', label: 'Generate' },
  { key: 'media', label: 'Media Notes' },
  { key: 'canvas', label: 'Canvas Studio' },
  { key: 'recent', label: 'Recently Viewed' },
  { key: 'trash', label: 'Trash' },
  { key: 'smart', label: 'Smart Folders' },
  { key: 'advanced', label: 'Advanced Search' },
  { key: 'chat', label: 'From Chat' },
  { key: 'convert', label: 'Convert' },
  { key: 'folder', label: 'New Folder' },
];

const NOTES_GENERATOR_SIDEBAR_ITEMS: SidebarItem[] = [
  { key: 'library', label: 'Library' },
  { key: 'generate', label: 'Generate' },
  { key: 'media', label: 'Media Notes' },
  { key: 'canvas', label: 'Canvas Studio' },
  { key: 'trash', label: 'Trash' },
];

export function NotesHome({
  user,
  onBack,
  refreshTick,
  onCreated,
  onOpenEditor,
  onOpenTrash,
  onOpenMedia,
  onOpenCanvas,
  onOpenGenerator,
}: NotesLibraryProps) {
  const layout = useResponsiveLayout();
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [showRecentlyViewed, setShowRecentlyViewed] = useState(false);
  const [recentlyViewed, setRecentlyViewed] = useState<RecentNote[]>([]);
  const [showSmartFolders, setShowSmartFolders] = useState(false);
  const [smartFolders, setSmartFolders] = useState<SmartFolderGroup[]>([]);
  const [smartFolderName, setSmartFolderName] = useState<string | null>(null);
  const [smartFolderNoteIds, setSmartFolderNoteIds] = useState<number[] | null>(null);
  const [advancedQuery, setAdvancedQuery] = useState('');
  const [advancedFolder, setAdvancedFolder] = useState<'all' | 'none' | `${number}`>('all');
  const [advancedDateFrom, setAdvancedDateFrom] = useState('');
  const [advancedDateTo, setAdvancedDateTo] = useState('');
  const [advancedCaseSensitive, setAdvancedCaseSensitive] = useState(false);
  const [advancedRegex, setAdvancedRegex] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderCreating, setFolderCreating] = useState(false);

  const [showChatImport, setShowChatImport] = useState(false);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<number[]>([]);
  const [importingChat, setImportingChat] = useState(false);

  const [showConvert, setShowConvert] = useState(false);
  const [selectedConvertNoteIds, setSelectedConvertNoteIds] = useState<number[]>([]);
  const [convertTarget, setConvertTarget] = useState<ConvertTarget>('flashcards');
  const [convertDifficulty, setConvertDifficulty] = useState<Difficulty>('medium');
  const [convertCount, setConvertCount] = useState(10);
  const [converting, setConverting] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadLibrary = async () => {
    setLoading(true);
    try {
      const [notesData, foldersData] = await Promise.all([getNotes(user.username), getFolders(user.username)]);
      setNotes(Array.isArray(notesData) ? notesData.map(buildNoteFromApi) : []);
      setFolders(foldersData?.folders ?? []);
    } catch {
      setNotes([]);
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  const loadRecentlyViewed = async () => {
    try {
      const raw = await AsyncStorage.getItem(recentNotesKey(user.username));
      setRecentlyViewed(raw ? JSON.parse(raw) : []);
    } catch {
      setRecentlyViewed([]);
    }
  };

  const loadSearchHistory = async () => {
    try {
      const raw = await AsyncStorage.getItem(advancedSearchHistoryKey(user.username));
      setSearchHistory(raw ? JSON.parse(raw) : []);
    } catch {
      setSearchHistory([]);
    }
  };

  useEffect(() => {
    loadLibrary();
  }, [user.username, refreshTick]);

  useEffect(() => {
    loadRecentlyViewed();
    loadSearchHistory();
  }, []);

  useEffect(() => {
    setSmartFolders(groupNotesByKeywords(notes));
  }, [notes]);

  useEffect(() => {
    if (!showChatImport) return;
    getChatSessions(user.username)
      .then((data) => setChatSessions(data?.sessions ?? []))
      .catch(() => setChatSessions([]));
  }, [showChatImport, user.username]);

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    let current = notes;

    if (smartFolderNoteIds) {
      current = current.filter((note) => smartFolderNoteIds.includes(note.id));
    }

    if (filter === 'favorites') {
      current = current.filter((note) => note.is_favorite);
    } else if (filter === 'source:flashcards') {
      current = current.filter((note) => matchesSource(note, 'flashcards'));
    } else if (filter === 'source:quizzes') {
      current = current.filter((note) => matchesSource(note, 'quizzes'));
    } else if (filter === 'source:roadmaps') {
      current = current.filter((note) => matchesSource(note, 'roadmaps'));
    } else if (filter.startsWith('folder:')) {
      const folderId = Number(filter.split(':')[1]);
      current = current.filter((note) => note.folder_id === folderId);
    }

    if (!query) return current;

    return current.filter((note) => (
      note.title.toLowerCase().includes(query) ||
      getPlainNoteText(note.content).toLowerCase().includes(query)
    ));
  }, [filter, notes, search, smartFolderNoteIds]);

  const advancedResults = useMemo(() => {
    const query = advancedQuery.trim();
    if (!query) return [] as Note[];

    let current = notes.slice();

    if (advancedFolder !== 'all') {
      if (advancedFolder === 'none') {
        current = current.filter((note) => !note.folder_id);
      } else {
        current = current.filter((note) => note.folder_id === Number(advancedFolder));
      }
    }

    if (advancedDateFrom) {
      current = current.filter((note) => new Date(note.updated_at) >= new Date(advancedDateFrom));
    }
    if (advancedDateTo) {
      current = current.filter((note) => new Date(note.updated_at) <= new Date(advancedDateTo));
    }

    let regex: RegExp | null = null;
    if (advancedRegex) {
      try {
        regex = new RegExp(query, advancedCaseSensitive ? '' : 'i');
      } catch {
        return [];
      }
    }

    return current.filter((note) => {
      const title = note.title || '';
      const content = getPlainNoteText(note.content);
      if (regex) {
        return regex.test(title) || regex.test(content);
      }
      const hayTitle = advancedCaseSensitive ? title : title.toLowerCase();
      const hayContent = advancedCaseSensitive ? content : content.toLowerCase();
      const needle = advancedCaseSensitive ? query : query.toLowerCase();
      return hayTitle.includes(needle) || hayContent.includes(needle);
    });
  }, [advancedCaseSensitive, advancedDateFrom, advancedDateTo, advancedFolder, advancedQuery, advancedRegex, notes]);

  const favoriteCount = notes.filter((note) => note.is_favorite).length;
  const canvasCount = notes.filter((note) => hasCanvasPayload(note.content)).length;
  // Same breakpoints as the flashcards page's grid, so both pages' cards line up.
  const notesGridColumns = layout.width >= 700 ? 3 : 2;
  const activeFilterLabel =
    filter === 'all'
      ? 'all notes'
      : filter === 'favorites'
        ? 'favorite notes'
        : filter === 'source:flashcards'
          ? 'flashcard notes'
          : filter === 'source:quizzes'
            ? 'quiz notes'
            : filter === 'source:roadmaps'
              ? 'knowledge map notes'
              : folders.find((folder) => filter === `folder:${folder.id}`)?.name ?? 'folder notes';

  const saveSearchHistory = async (nextHistory: string[]) => {
    setSearchHistory(nextHistory);
    await AsyncStorage.setItem(advancedSearchHistoryKey(user.username), JSON.stringify(nextHistory));
  };

  const trackRecentlyViewed = async (note: Note) => {
    const viewedItem: RecentNote = {
      id: note.id,
      title: note.title,
      viewedAt: new Date().toISOString(),
    };
    const updated = [viewedItem, ...recentlyViewed.filter((item) => item.id !== note.id)].slice(0, 10);
    setRecentlyViewed(updated);
    await AsyncStorage.setItem(recentNotesKey(user.username), JSON.stringify(updated));
  };

  const handleOpenEditor = async (note: Note) => {
    await trackRecentlyViewed(note);
    onOpenEditor(note, folders);
  };

  const createNewNote = async (seed?: Partial<Pick<Note, 'title' | 'content' | 'folder_id' | 'custom_font'>>) => {
    if (creating) return;
    setCreating(true);
    try {
      const newNote = await createNote({
        userId: user.username,
        title: seed?.title ?? 'Untitled Note',
        content: seed?.content ?? '',
        folderId: seed?.folder_id ?? null,
        customFont: normalizeNoteFont(seed?.custom_font),
      });
      const note = buildNoteFromApi(newNote);
      onCreated();
      await handleOpenEditor(note);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create note';
      Alert.alert('Create failed', message);
    } finally {
      setCreating(false);
    }
  };

  const toggleCardFavorite = async (note: Note) => {
    try {
      await toggleFavorite({ noteId: note.id, isFavorite: !note.is_favorite });
      setNotes((current) => current.map((item) => (
        item.id === note.id ? { ...item, is_favorite: !item.is_favorite } : item
      )));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update favorite';
      Alert.alert('Favorite failed', message);
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || folderCreating) return;
    setFolderCreating(true);
    try {
      await createFolder({ userId: user.username, name });
      setNewFolderName('');
      setShowFolderModal(false);
      await loadLibrary();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create folder';
      Alert.alert('Folder failed', message);
    } finally {
      setFolderCreating(false);
    }
  };

  const handleImportChat = async () => {
    if (!selectedSessions.length || importingChat) return;
    setImportingChat(true);
    try {
      const data = await convertChatSessionsToNote({
        userId: user.username,
        sessionIds: selectedSessions,
      });
      setShowChatImport(false);
      setSelectedSessions([]);
      onCreated();
      await handleOpenEditor(buildNoteFromApi(data));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import chats';
      Alert.alert('Import failed', message);
    } finally {
      setImportingChat(false);
    }
  };

  const handleConvert = async () => {
    if (!selectedConvertNoteIds.length || converting) return;
    setConverting(true);
    try {
      if (convertTarget === 'flashcards') {
        const data = await convertNotesToFlashcards({
          noteIds: selectedConvertNoteIds,
          cardCount: convertCount,
          difficulty: convertDifficulty,
        });
        Alert.alert(
          'Flashcards created',
          `${data?.card_count ?? convertCount} cards are ready in Flashcards.`,
        );
      } else {
        const data = await convertNotesToQuestions({
          noteIds: selectedConvertNoteIds,
          questionCount: convertCount,
          difficulty: convertDifficulty,
        });
        Alert.alert(
          'Questions created',
          `${data?.question_count ?? convertCount} questions were generated from your notes.`,
        );
      }
      setShowConvert(false);
      setSelectedConvertNoteIds([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to convert notes';
      Alert.alert('Convert failed', message);
    } finally {
      setConverting(false);
    }
  };

  const handleRunAdvancedSearch = async (nextQuery?: string) => {
    const query = (nextQuery ?? advancedQuery).trim();
    if (!query) return;
    const nextHistory = [query, ...searchHistory.filter((item) => item !== query)].slice(0, 10);
    await saveSearchHistory(nextHistory);
  };

  const clearSearchHistory = async () => {
    setSearchHistory([]);
    await AsyncStorage.removeItem(advancedSearchHistoryKey(user.username));
  };

  const applySmartFolder = (group: SmartFolderGroup) => {
    setSmartFolderName(group.name);
    setSmartFolderNoteIds(group.notes.map((note) => note.id));
    setShowSmartFolders(false);
  };

  const clearSmartFolder = () => {
    setSmartFolderName(null);
    setSmartFolderNoteIds(null);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <GeoBackground />
      <AmbientBubbles theme={CURRENT_THEME} variant="notes" opacity={0.82} />
      {layout.isTablet ? (
        <View style={s.compactHeader}>
          <View style={s.compactHeaderMain}>
            {onBack ? (
              <HapticTouchable onPress={onBack} style={s.compactBackBtn} haptic="selection">
                <Ionicons name="chevron-back" size={20} color={GOLD_L} />
              </HapticTouchable>
            ) : null}
            <View style={s.compactHeaderTitleWrap}>
              <Text style={s.compactTitle}>notes</Text>
              <Text style={s.compactSubtitle}>
                {notes.length} note{notes.length === 1 ? '' : 's'}
                {filter !== 'all' ? ` · ${activeFilterLabel}` : ''}
              </Text>
            </View>
          </View>
          <View style={s.compactHeaderActions}>
            <HapticTouchable onPress={() => setSidebarOpen(true)} haptic="selection" accessibilityLabel="Open menu">
              <Ionicons name="menu-outline" size={22} color={GOLD_L} />
            </HapticTouchable>
          </View>
        </View>
      ) : (
        <View style={s.mobileHeader}>
          {onBack ? (
            <HapticTouchable onPress={onBack} style={{ marginRight: 12 }} haptic="selection">
              <Ionicons name="chevron-back" size={22} color={GOLD_L} />
            </HapticTouchable>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={s.mobileTitle}>notes</Text>
          </View>
          <HapticTouchable onPress={() => setSidebarOpen(true)} haptic="selection" accessibilityLabel="Open menu">
            <Ionicons name="menu-outline" size={24} color={GOLD_L} />
          </HapticTouchable>
        </View>
      )}

      <View style={s.generateHeroWrap}>
        <HapticTouchable style={s.generateHero} onPress={onOpenGenerator} haptic="medium" activeOpacity={0.88}>
          <Ionicons name="add" size={16} color={BASE_ACTION_TEXT} />
          <Text style={s.generateHeroText}>Generate</Text>
        </HapticTouchable>
      </View>

      {loading ? (
        <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
      ) : (
        // Same grid approach as the flashcards page (ScrollView + flexWrap +
        // percentage width, intrinsic card height) -- FlatList's numColumns
        // stretched a lone card in an incomplete last row to fill the whole
        // width, which is why notes cards were ballooning to full-page size
        // while flashcards cards stayed small.
        <View style={s.workspace}>
          <View style={s.searchRow}>
            <View style={s.searchBar}>
              <Ionicons name="search-outline" size={15} color={GOLD_D} />
              <TextInput
                style={s.searchInput}
                placeholder="search notes..."
                placeholderTextColor={DIM2}
                value={search}
                onChangeText={setSearch}
              />
              {!!search && (
                <HapticTouchable onPress={() => setSearch('')} haptic="selection">
                  <Ionicons name="close-circle" size={16} color={GOLD_D} />
                </HapticTouchable>
              )}
            </View>
            <HapticTouchable
              style={[s.searchIconBtn, filter === 'favorites' && s.searchIconBtnActive]}
              onPress={() => setFilter((current) => (current === 'favorites' ? 'all' : 'favorites'))}
              haptic="selection"
              accessibilityLabel={filter === 'favorites' ? 'Show all notes' : 'Show favorites only'}
            >
              <Ionicons name={filter === 'favorites' ? 'star' : 'star-outline'} size={18} color={filter === 'favorites' ? BG : GOLD_L} />
            </HapticTouchable>
            {smartFolderName ? (
              <HapticTouchable style={s.searchIconBtn} onPress={clearSmartFolder} haptic="selection" accessibilityLabel={`Clear ${smartFolderName} filter`}>
                <Ionicons name="close" size={18} color={GOLD_L} />
              </HapticTouchable>
            ) : null}
          </View>

          <View style={s.collectionHeader}>
            <Text style={s.collectionCount}>
              {filteredNotes.length} note{filteredNotes.length === 1 ? '' : 's'}
              {filter !== 'all' ? ` · ${activeFilterLabel}` : ''}
            </Text>
          </View>

          {filteredNotes.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>{search ? 'no results' : 'no notes yet'}</Text>
              <Text style={s.emptyHint}>start with a new note, template, or imported chat</Text>
            </View>
          ) : (
            <ScrollView
              style={s.collectionScroll}
              contentContainerStyle={[s.collectionGrid, { gap: notesGridColumns === 3 ? 10 : 9 }]}
              showsVerticalScrollIndicator={false}
              bounces
            >
              {filteredNotes.map((item, index) => {
                const preview = getPlainNoteText(item.content).slice(0, 140);
                const folderName = folders.find((folder) => folder.id === item.folder_id)?.name;
                const hasCanvas = hasCanvasPayload(item.content);
                const coverColor = NOTE_COVER_COLORS[index % NOTE_COVER_COLORS.length];

                return (
                  <TileGleam
                    key={item.id}
                    style={[s.noteCard, { width: notesGridColumns === 3 ? '31.8%' : '48.6%' }]}
                    borderRadius={17}
                    onPress={() => { void handleOpenEditor(item); }}
                    haptic="light"
                  >
                    <View style={[s.noteCover, { backgroundColor: coverColor }]}>
                      {hasCanvas ? (
                        <View style={s.noteCoverTag}>
                          <Ionicons name="brush-outline" size={11} color="#171411" />
                          <Text style={s.noteCoverTagText}>canvas</Text>
                        </View>
                      ) : null}
                      <Text style={[s.noteCoverTitle, { fontFamily: resolveNoteFont(item.custom_font, 'title') }]} numberOfLines={3}>
                        {item.title || 'Untitled Note'}
                      </Text>
                      <Text style={s.noteCoverMeta}>{formatDate(item.updated_at).toUpperCase()}</Text>
                    </View>
                    <View style={s.noteCardMeta}>
                      <Text style={[s.noteCardPreview, { fontFamily: resolveNoteFont(item.custom_font, 'body') }]} numberOfLines={2}>
                        {preview || 'Open this note to start writing.'}
                      </Text>
                      {folderName ? (
                        <View style={s.noteTag}>
                          <Ionicons name="folder-outline" size={11} color={DIM2} />
                          <Text style={s.noteTagText}>{folderName}</Text>
                        </View>
                      ) : null}
                      <View style={s.noteCardActionRow}>
                        <HapticTouchable
                          style={[s.noteCardActionBtn, { flex: 1 }]}
                          onPress={() => toggleCardFavorite(item)}
                          haptic="selection"
                          accessibilityLabel={item.is_favorite ? `Unfavorite ${item.title}` : `Favorite ${item.title}`}
                        >
                          <Ionicons name={item.is_favorite ? 'star' : 'star-outline'} size={15} color={item.is_favorite ? ACCENT : GOLD_L} />
                        </HapticTouchable>
                        <HapticTouchable
                          style={[s.noteCardActionBtn, s.noteCardActionBtnPrimary, { flex: 1 }]}
                          onPress={() => { void handleOpenEditor(item); }}
                          haptic="medium"
                          accessibilityLabel={`Open ${item.title || 'note'}`}
                        >
                          <Ionicons name="book-outline" size={15} color={BASE_ACTION_TEXT} />
                        </HapticTouchable>
                      </View>
                    </View>
                  </TileGleam>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      <ModalShell visible={showFolderModal} title="Create Folder" subtitle="Add a new notes folder" onClose={() => setShowFolderModal(false)}>
        <View style={s.modalBody}>
          <TextInput
            value={newFolderName}
            onChangeText={setNewFolderName}
            placeholder="folder name..."
            placeholderTextColor={DIM2}
            style={s.modalInput}
            autoFocus
          />
          <View style={s.rowActions}>
            <HapticTouchable style={[s.secondaryBtn, { flex: 1 }]} onPress={() => setShowFolderModal(false)} haptic="selection">
              <Text style={s.secondaryBtnText}>cancel</Text>
            </HapticTouchable>
            <HapticTouchable style={[s.primaryBtn, { flex: 1 }]} onPress={handleCreateFolder} haptic="medium" disabled={folderCreating}>
              <Text style={s.primaryBtnText}>{folderCreating ? 'creating...' : 'create'}</Text>
            </HapticTouchable>
          </View>
        </View>
      </ModalShell>

      <ModalShell visible={showChatImport} title="Import From Chat" subtitle="Convert AI chat sessions into notes" onClose={() => setShowChatImport(false)}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={s.modalBody}>
            {chatSessions.length === 0 ? (
              <View style={s.emptyModalState}>
                <Text style={s.emptyTitle}>no chat sessions</Text>
                <Text style={s.emptyHint}>start a chat first, then come back here</Text>
              </View>
            ) : (
              chatSessions.map((session) => {
                const selected = selectedSessions.includes(session.id);
                return (
                  <HapticTouchable
                    key={session.id}
                    style={[s.selectRow, selected && s.selectRowActive]}
                    onPress={() => setSelectedSessions((current) => (
                      current.includes(session.id)
                        ? current.filter((id) => id !== session.id)
                        : [...current, session.id]
                    ))}
                    haptic="selection"
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.selectRowTitle}>{session.title || 'Untitled Chat'}</Text>
                      <Text style={s.selectRowMeta}>{formatDate(session.updated_at || session.created_at)}</Text>
                    </View>
                    <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? ACCENT : GOLD_D} />
                  </HapticTouchable>
                );
              })
            )}

            <View style={s.rowActions}>
              <HapticTouchable style={[s.secondaryBtn, { flex: 1 }]} onPress={() => setShowChatImport(false)} haptic="selection">
                <Text style={s.secondaryBtnText}>cancel</Text>
              </HapticTouchable>
              <HapticTouchable style={[s.primaryBtn, { flex: 1 }]} onPress={handleImportChat} haptic="medium" disabled={importingChat || !selectedSessions.length}>
                <Text style={s.primaryBtnText}>{importingChat ? 'importing...' : `import ${selectedSessions.length}`}</Text>
              </HapticTouchable>
            </View>
          </View>
        </ScrollView>
      </ModalShell>

      <ModalShell visible={showConvert} title="Convert Notes" subtitle="Browser note conversion tools" onClose={() => setShowConvert(false)}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={s.modalBody}>
            <Text style={s.modalSectionLabel}>target</Text>
            <View style={s.inlineChips}>
              <FilterChip label="flashcards" active={convertTarget === 'flashcards'} onPress={() => setConvertTarget('flashcards')} />
              <FilterChip label="questions" active={convertTarget === 'questions'} onPress={() => setConvertTarget('questions')} />
            </View>

            <Text style={s.modalSectionLabel}>difficulty</Text>
            <View style={s.inlineChips}>
              {(['easy', 'medium', 'hard'] as Difficulty[]).map((difficulty) => (
                <FilterChip key={difficulty} label={difficulty} active={convertDifficulty === difficulty} onPress={() => setConvertDifficulty(difficulty)} />
              ))}
            </View>

            <Text style={s.modalSectionLabel}>{convertTarget === 'flashcards' ? 'card count' : 'question count'}</Text>
            <View style={s.inlineChips}>
              {[5, 10, 15, 20].map((count) => (
                <FilterChip key={count} label={String(count)} active={convertCount === count} onPress={() => setConvertCount(count)} />
              ))}
            </View>

            <Text style={s.modalSectionLabel}>notes</Text>
            {notes.map((note) => {
              const selected = selectedConvertNoteIds.includes(note.id);
              return (
                <HapticTouchable
                  key={note.id}
                  style={[s.selectRow, selected && s.selectRowActive]}
                  onPress={() => setSelectedConvertNoteIds((current) => (
                    current.includes(note.id)
                      ? current.filter((id) => id !== note.id)
                      : [...current, note.id]
                  ))}
                  haptic="selection"
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.selectRowTitle}>{note.title || 'Untitled Note'}</Text>
                    <Text style={s.selectRowMeta}>{formatDate(note.updated_at)}</Text>
                  </View>
                  <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? ACCENT : GOLD_D} />
                </HapticTouchable>
              );
            })}

            <View style={s.rowActions}>
              <HapticTouchable style={[s.secondaryBtn, { flex: 1 }]} onPress={() => setShowConvert(false)} haptic="selection">
                <Text style={s.secondaryBtnText}>cancel</Text>
              </HapticTouchable>
              <HapticTouchable style={[s.primaryBtn, { flex: 1 }]} onPress={handleConvert} haptic="medium" disabled={converting || !selectedConvertNoteIds.length}>
                <Text style={s.primaryBtnText}>{converting ? 'converting...' : 'convert'}</Text>
              </HapticTouchable>
            </View>
          </View>
        </ScrollView>
      </ModalShell>

      <ModalShell visible={showAdvancedSearch} title="Advanced Search" subtitle="Search all notes with browser-style filters" onClose={() => setShowAdvancedSearch(false)}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={s.modalBody}>
            <TextInput
              value={advancedQuery}
              onChangeText={setAdvancedQuery}
              onSubmitEditing={() => { void handleRunAdvancedSearch(); }}
              placeholder="Search all notes..."
              placeholderTextColor={DIM2}
              style={s.modalInput}
              autoFocus
            />

            <Text style={s.modalSectionLabel}>folder</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.inlineChips}>
              <FilterChip label="all folders" active={advancedFolder === 'all'} onPress={() => setAdvancedFolder('all')} />
              <FilterChip label="unfiled" active={advancedFolder === 'none'} onPress={() => setAdvancedFolder('none')} />
              {folders.map((folder) => (
                <FilterChip key={`adv-${folder.id}`} label={folder.name} active={advancedFolder === String(folder.id)} onPress={() => setAdvancedFolder(String(folder.id) as `${number}`)} />
              ))}
            </ScrollView>

            <Text style={s.modalSectionLabel}>modified from</Text>
            <TextInput
              value={advancedDateFrom}
              onChangeText={setAdvancedDateFrom}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={DIM2}
              style={s.modalInput}
            />

            <Text style={s.modalSectionLabel}>modified to</Text>
            <TextInput
              value={advancedDateTo}
              onChangeText={setAdvancedDateTo}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={DIM2}
              style={s.modalInput}
            />

            <Text style={s.modalSectionLabel}>options</Text>
            <View style={s.inlineChips}>
              <FilterChip label="case sensitive" active={advancedCaseSensitive} onPress={() => setAdvancedCaseSensitive((value) => !value)} />
              <FilterChip label="regex" active={advancedRegex} onPress={() => setAdvancedRegex((value) => !value)} />
            </View>

            {searchHistory.length > 0 ? (
              <>
                <View style={s.historyHeaderRow}>
                  <Text style={s.modalSectionLabel}>recent searches</Text>
                  <HapticTouchable onPress={() => { void clearSearchHistory(); }} haptic="selection">
                    <Text style={s.clearHistoryText}>clear</Text>
                  </HapticTouchable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.inlineChips}>
                  {searchHistory.map((item) => (
                    <FilterChip
                      key={item}
                      label={item}
                      active={advancedQuery === item}
                      onPress={() => {
                        setAdvancedQuery(item);
                        void handleRunAdvancedSearch(item);
                      }}
                    />
                  ))}
                </ScrollView>
              </>
            ) : null}

            <View style={s.rowActions}>
              <HapticTouchable style={[s.secondaryBtn, { flex: 1 }]} onPress={() => setShowAdvancedSearch(false)} haptic="selection">
                <Text style={s.secondaryBtnText}>close</Text>
              </HapticTouchable>
              <HapticTouchable style={[s.primaryBtn, { flex: 1 }]} onPress={() => { void handleRunAdvancedSearch(); }} haptic="medium">
                <Text style={s.primaryBtnText}>save search</Text>
              </HapticTouchable>
            </View>

            <Text style={s.modalSectionLabel}>results</Text>
            {advancedQuery.trim() ? advancedResults.map((note) => (
              <HapticTouchable
                key={`result-${note.id}`}
                style={s.selectRow}
                onPress={() => {
                  setShowAdvancedSearch(false);
                  void handleOpenEditor(note);
                }}
                haptic="selection"
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.selectRowTitle}>{note.title || 'Untitled Note'}</Text>
                  <Text style={s.selectRowMeta}>{formatDate(note.updated_at)}</Text>
                </View>
                <Ionicons name="chevron-forward-outline" size={20} color={ACCENT} />
              </HapticTouchable>
            )) : (
              <View style={s.emptyModalState}>
                <Text style={s.emptyTitle}>start searching</Text>
                <Text style={s.emptyHint}>filter by folder, dates, case sensitivity, or regex</Text>
              </View>
            )}
            {advancedQuery.trim() && advancedResults.length === 0 ? (
              <View style={s.emptyModalState}>
                <Text style={s.emptyTitle}>no results</Text>
                <Text style={s.emptyHint}>try different keywords or loosen the filters</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </ModalShell>

      <ModalShell visible={showRecentlyViewed} title="Recently Viewed" subtitle="Jump back into notes you opened on mobile" onClose={() => setShowRecentlyViewed(false)}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={s.modalBody}>
            {recentlyViewed.length === 0 ? (
              <View style={s.emptyModalState}>
                <Text style={s.emptyTitle}>no recent notes</Text>
                <Text style={s.emptyHint}>open a note and it will appear here</Text>
              </View>
            ) : recentlyViewed.map((recent) => {
              const note = notes.find((item) => item.id === recent.id);
              return (
                <HapticTouchable
                  key={`recent-${recent.id}`}
                  style={s.selectRow}
                  onPress={() => {
                    setShowRecentlyViewed(false);
                    if (note) {
                      void handleOpenEditor(note);
                    }
                  }}
                  haptic="selection"
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.selectRowTitle}>{recent.title || 'Untitled Note'}</Text>
                    <Text style={s.selectRowMeta}>{formatDate(recent.viewedAt)}</Text>
                  </View>
                  <Ionicons name="time-outline" size={20} color={ACCENT} />
                </HapticTouchable>
              );
            })}
          </View>
        </ScrollView>
      </ModalShell>

      <ModalShell visible={showSmartFolders} title="Smart Folders" subtitle="Auto-group notes like browser smart folders" onClose={() => setShowSmartFolders(false)}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={s.modalBody}>
            {smartFolders.length === 0 ? (
              <View style={s.emptyModalState}>
                <Text style={s.emptyTitle}>no notes to organize</Text>
                <Text style={s.emptyHint}>create a few notes and smart folders will appear</Text>
              </View>
            ) : smartFolders.map((group) => (
              <HapticTouchable key={group.name} style={s.smartFolderCard} onPress={() => applySmartFolder(group)} haptic="selection">
                <View style={s.templateIconWrap}>
                  <Ionicons name="sparkles-outline" size={18} color={ACCENT} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.templateName}>{group.name}</Text>
                  <Text style={s.templateDesc}>{group.notes.length} note{group.notes.length === 1 ? '' : 's'}</Text>
                </View>
                <Ionicons name="chevron-forward-outline" size={18} color={ACCENT} />
              </HapticTouchable>
            ))}
          </View>
        </ScrollView>
      </ModalShell>

      <SectionSidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pageTitle="notes"
        items={NOTES_SIDEBAR_ITEMS}
        activeKey="library"
        onSelect={(key) => {
          if (key === 'generate') onOpenGenerator();
          else if (key === 'media') onOpenMedia();
          else if (key === 'canvas') onOpenCanvas();
          else if (key === 'recent') setShowRecentlyViewed(true);
          else if (key === 'trash') onOpenTrash();
          else if (key === 'smart') setShowSmartFolders(true);
          else if (key === 'advanced') setShowAdvancedSearch(true);
          else if (key === 'chat') setShowChatImport(true);
          else if (key === 'convert') {
            setSelectedConvertNoteIds(filteredNotes.slice(0, 5).map((note) => note.id));
            setShowConvert(true);
          } else if (key === 'folder') setShowFolderModal(true);
        }}
      />
    </SafeAreaView>
  );
}

// Shared "make a new note and jump into its editor" logic -- used by the
// Generate hub's blank-note card and the Templates screen's apply action.
function useNoteCreation(
  user: AuthUser,
  onCreated: () => void,
  onOpenEditor: (note: Note, folders: Folder[]) => void,
) {
  const [creating, setCreating] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);

  useEffect(() => {
    getFolders(user.username).then((data) => setFolders(data?.folders ?? [])).catch(() => setFolders([]));
  }, [user.username]);

  const createNewNote = async (seed?: Partial<Pick<Note, 'title' | 'content' | 'folder_id' | 'custom_font'>>) => {
    if (creating) return;
    setCreating(true);
    try {
      const newNote = await createNote({
        userId: user.username,
        title: seed?.title ?? 'Untitled Note',
        content: seed?.content ?? '',
        folderId: seed?.folder_id ?? null,
        customFont: normalizeNoteFont(seed?.custom_font),
      });
      const note = buildNoteFromApi(newNote);
      onCreated();
      onOpenEditor(note, folders);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create note';
      Alert.alert('Create failed', message);
    } finally {
      setCreating(false);
    }
  };

  return { creating, folders, createNewNote };
}

// Entry point for creating a note: three separate bento cards -- record/
// upload audio (hands off to Media Notes' transcribe-and-generate pipeline),
// templates (its own screen, see NotesTemplates below), and a blank page --
// rather than one page mixing a "blank note" button with an inline
// templates list.
export function NotesGenerator({
  user,
  onBack,
  onCreated,
  onOpenEditor,
  onOpenLibrary,
  onOpenMedia,
  onOpenTemplates,
  onOpenCanvas,
  onOpenTrash,
}: NotesGeneratorProps) {
  const { creating, createNewNote } = useNoteCreation(user, onCreated, onOpenEditor);
  const [customTemplateCount, setCustomTemplateCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CUSTOM_TEMPLATE_KEY)
      .then((raw) => setCustomTemplateCount(raw ? (JSON.parse(raw) as CustomTemplate[]).length : 0))
      .catch(() => setCustomTemplateCount(0));
  }, []);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <GeoBackground />
      <AmbientBubbles theme={CURRENT_THEME} variant="notes" opacity={0.82} />
      <View style={s.header}>
        <HapticTouchable onPress={onBack} style={{ marginRight: 12 }} haptic="selection">
          <Ionicons name="chevron-back" size={20} color={GOLD_L} />
        </HapticTouchable>
        <Text style={[s.compactTitle, { flex: 1 }]}>create</Text>
        <HapticTouchable onPress={() => setSidebarOpen(true)} haptic="selection" accessibilityLabel="Open menu">
          <Ionicons name="menu-outline" size={22} color={GOLD_L} />
        </HapticTouchable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.listContent}>
        <HapticTouchable style={[s.createBentoCard, s.createBentoCardWide]} onPress={onOpenMedia} haptic="medium" activeOpacity={0.9}>
          <View style={s.createBentoIconWrap}>
            <Ionicons name="mic-outline" size={22} color={ACCENT} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.createBentoTitle}>record / upload audio</Text>
            <Text style={s.createBentoDesc}>speak or upload a recording — it's transcribed and written into a note for you</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={GOLD_L} />
        </HapticTouchable>

        <View style={s.createBentoRow}>
          <HapticTouchable style={[s.createBentoCard, s.createBentoCardHalf]} onPress={onOpenTemplates} haptic="selection" activeOpacity={0.9}>
            <View style={s.createBentoIconWrap}>
              <Ionicons name="grid-outline" size={20} color={ACCENT} />
            </View>
            <Text style={s.createBentoTitle}>templates</Text>
            <Text style={s.createBentoDesc}>{BUILT_IN_NOTE_TEMPLATES.length + customTemplateCount} ready-made structures</Text>
          </HapticTouchable>
          <HapticTouchable
            style={[s.createBentoCard, s.createBentoCardHalf]}
            onPress={() => createNewNote()}
            haptic="medium"
            activeOpacity={0.9}
            disabled={creating}
          >
            <View style={s.createBentoIconWrap}>
              <Ionicons name="add-outline" size={20} color={ACCENT} />
            </View>
            <Text style={s.createBentoTitle}>{creating ? 'creating…' : 'blank note'}</Text>
            <Text style={s.createBentoDesc}>start from a clean page</Text>
          </HapticTouchable>
        </View>
      </ScrollView>

      {creating && (
        <View style={s.loadingOverlay}>
          <ActivityIndicator color={ACCENT} size="large" />
          <Text style={[s.emptyHint, { marginTop: 12 }]}>creating note…</Text>
        </View>
      )}

      <SectionSidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pageTitle="notes"
        items={NOTES_GENERATOR_SIDEBAR_ITEMS}
        activeKey="generate"
        onSelect={(key) => {
          if (key === 'library') onOpenLibrary();
          else if (key === 'media') onOpenMedia();
          else if (key === 'canvas') onOpenCanvas();
          else if (key === 'trash') onOpenTrash();
        }}
      />
    </SafeAreaView>
  );
}

// All template options -- built-in and custom -- as their own bento-card
// grid, reached only after choosing "templates" from the Generate hub.
export function NotesTemplates({
  user,
  onBack,
  onCreated,
  onOpenEditor,
}: NotesTemplatesProps) {
  const { creating, createNewNote } = useNoteCreation(user, onCreated, onOpenEditor);
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateDraft, setTemplateDraft] = useState({ name: '', description: '', content: '' });

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CUSTOM_TEMPLATE_KEY);
        setCustomTemplates(raw ? JSON.parse(raw) : []);
      } catch {
        setCustomTemplates([]);
      }
    })();
  }, []);

  const saveCustomTemplates = async (templates: CustomTemplate[]) => {
    setCustomTemplates(templates);
    await AsyncStorage.setItem(CUSTOM_TEMPLATE_KEY, JSON.stringify(templates));
  };

  const handleSaveTemplate = async () => {
    if (!templateDraft.name.trim() || !templateDraft.content.trim()) {
      Alert.alert('Template required', 'Add a name and content for the custom template.');
      return;
    }
    const nextTemplate: CustomTemplate = {
      id: `custom-${Date.now()}`,
      name: templateDraft.name.trim(),
      description: templateDraft.description.trim(),
      content: templateDraft.content,
      category: 'custom',
      createdAt: new Date().toISOString(),
    };
    await saveCustomTemplates([...customTemplates, nextTemplate]);
    setTemplateDraft({ name: '', description: '', content: '' });
    setShowTemplateForm(false);
  };

  const handleDeleteCustomTemplate = (templateId: string) => {
    Alert.alert('Delete template?', 'This custom template will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await saveCustomTemplates(customTemplates.filter((template) => template.id !== templateId));
        },
      },
    ]);
  };

  const handleApplyTemplate = async (template: NoteTemplate) => {
    const filled = applyTemplateVariables(template, user.username);
    await createNewNote({ title: template.name, content: filled });
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <GeoBackground />
      <AmbientBubbles theme={CURRENT_THEME} variant="notes" opacity={0.82} />
      <View style={s.header}>
        <HapticTouchable onPress={onBack} style={{ marginRight: 12 }} haptic="selection">
          <Ionicons name="chevron-back" size={20} color={GOLD_L} />
        </HapticTouchable>
        <Text style={[s.compactTitle, { flex: 1 }]}>templates</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.listContent}>
        <View style={s.templateBentoGrid}>
          {BUILT_IN_NOTE_TEMPLATES.map((template) => (
            <HapticTouchable
              key={template.id}
              style={[s.templateCard, s.templateBentoCard]}
              onPress={() => handleApplyTemplate(template)}
              haptic="light"
            >
              <View style={s.templateIconWrap}>
                <Ionicons name="document-text-outline" size={18} color={ACCENT} />
              </View>
              <Text style={s.templateName} numberOfLines={1}>{template.name}</Text>
              <Text style={s.templateDesc} numberOfLines={3}>{template.description}</Text>
            </HapticTouchable>
          ))}

          {customTemplates.map((template) => (
            <View key={template.id} style={[s.templateCard, s.templateBentoCard]}>
              <HapticTouchable
                style={s.templateDeleteBtnCorner}
                onPress={() => handleDeleteCustomTemplate(template.id)}
                haptic="warning"
                accessibilityLabel={`Delete ${template.name}`}
              >
                <Ionicons name="trash-outline" size={14} color={RED} />
              </HapticTouchable>
              <Pressable style={{ flex: 1 }} onPress={() => handleApplyTemplate(template)}>
                <View style={s.templateIconWrap}>
                  <Ionicons name="bookmark-outline" size={18} color={ACCENT} />
                </View>
                <Text style={s.templateName} numberOfLines={1}>{template.name}</Text>
                <Text style={s.templateDesc} numberOfLines={3}>{template.description || 'Custom template'}</Text>
              </Pressable>
            </View>
          ))}

          <HapticTouchable
            style={[s.dashedCard, s.templateBentoCard, s.templateBentoCardCenter]}
            onPress={() => setShowTemplateForm(true)}
            haptic="selection"
          >
            <Ionicons name="add-circle-outline" size={22} color={ACCENT} />
            <Text style={s.dashedCardTitle}>create custom</Text>
            <Text style={s.dashedCardText}>save a reusable structure</Text>
          </HapticTouchable>
        </View>
      </ScrollView>

      <ModalShell
        visible={showTemplateForm}
        title="custom template"
        subtitle="use {{date}}, {{time}}, {{user}}, {{title}} as placeholders"
        onClose={() => {
          setShowTemplateForm(false);
          setTemplateDraft({ name: '', description: '', content: '' });
        }}
      >
        <TextInput
          value={templateDraft.name}
          onChangeText={(value) => setTemplateDraft((draft) => ({ ...draft, name: value }))}
          placeholder="template name"
          placeholderTextColor={DIM2}
          style={s.modalInput}
        />
        <TextInput
          value={templateDraft.description}
          onChangeText={(value) => setTemplateDraft((draft) => ({ ...draft, description: value }))}
          placeholder="description"
          placeholderTextColor={DIM2}
          style={s.modalInput}
        />
        <TextInput
          value={templateDraft.content}
          onChangeText={(value) => setTemplateDraft((draft) => ({ ...draft, content: value }))}
          placeholder="template content"
          placeholderTextColor={DIM2}
          style={[s.modalInput, s.modalTextarea]}
          multiline
          textAlignVertical="top"
        />
        <View style={s.rowActions}>
          <HapticTouchable
            style={[s.secondaryBtn, { flex: 1 }]}
            onPress={() => {
              setShowTemplateForm(false);
              setTemplateDraft({ name: '', description: '', content: '' });
            }}
            haptic="selection"
          >
            <Text style={s.secondaryBtnText}>cancel</Text>
          </HapticTouchable>
          <HapticTouchable style={[s.primaryBtn, { flex: 1 }]} onPress={handleSaveTemplate} haptic="medium">
            <Text style={s.primaryBtnText}>save</Text>
          </HapticTouchable>
        </View>
      </ModalShell>

      {creating && (
        <View style={s.loadingOverlay}>
          <ActivityIndicator color={ACCENT} size="large" />
          <Text style={[s.emptyHint, { marginTop: 12 }]}>creating note…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function createStyles(layout: ReturnType<typeof useResponsiveLayout>) {
  const softAccent = rgbaFromHex(ACCENT, 0.12);
  const softAccentBorder = rgbaFromHex(ACCENT, 0.24);
  const softSuccess = rgbaFromHex(GREEN, 0.12);
  const softSuccessBorder = rgbaFromHex(GREEN, 0.24);
  const softDanger = rgbaFromHex(RED, 0.12);
  const softDangerBorder = rgbaFromHex(RED, 0.24);
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: BG },
    compactHeader: {
      width: '100%',
      maxWidth: layout.contentMaxWidth,
      alignSelf: 'center',
      flexDirection: layout.isTablet ? 'row' : 'column',
      alignItems: layout.isTablet ? 'center' : 'stretch',
      justifyContent: 'space-between',
      paddingHorizontal: layout.screenPadding,
      paddingTop: layout.isTablet ? 16 : 10,
      paddingBottom: 10,
      gap: 12,
      backgroundColor: rgbaFromHex(SURFACE, 0.96),
      borderBottomWidth: 1,
      borderBottomColor: BORDER,
    },
    compactHeaderMain: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      minWidth: 0,
    },
    compactBackBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: rgbaFromHex(SURFACE_2, 0.92),
      borderWidth: 1,
      borderColor: softAccentBorder,
    },
    compactHeaderTitleWrap: {
      flex: 1,
      minWidth: 0,
    },
    compactTitle: {
      fontFamily: 'Inter_900Black',
      fontSize: layout.isTablet ? 30 : 28,
      color: GOLD_L,
      letterSpacing: -0.8,
      textTransform: 'lowercase',
    },
    compactSubtitle: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: DIM2,
      marginTop: 2,
      textTransform: 'lowercase',
    },
    compactHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    header: {
      width: '100%',
      maxWidth: layout.contentMaxWidth,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: layout.isTablet ? layout.screenPadding : 10,
      paddingTop: layout.isTablet ? 22 : 18,
      paddingBottom: 12,
      gap: 12,
      flexWrap: layout.isTablet ? 'nowrap' : 'wrap',
    },
    mobileHeader: {
      width: '100%',
      maxWidth: layout.contentMaxWidth,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
      paddingTop: 18,
      paddingBottom: 12,
    },
    mobileTitle: {
      fontFamily: 'Inter_900Black',
      fontSize: 32,
      color: GOLD_L,
      letterSpacing: -0.8,
    },
    title: { fontFamily: 'Inter_900Black', fontSize: 32, color: GOLD_L, letterSpacing: -0.8 },
    subtitle: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM2, letterSpacing: 2.1, marginTop: 4, textTransform: 'uppercase' },

    // Full-width call to action right below the header, matching the flashcards page.
    generateHeroWrap: {
      width: '100%',
      maxWidth: layout.contentMaxWidth,
      alignSelf: 'center',
      paddingHorizontal: layout.isTablet ? layout.screenPadding : 10,
    },
    generateHero: {
      width: '100%', minHeight: 54, borderRadius: 18, marginBottom: 18,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
      backgroundColor: BASE_ACTION_BG, overflow: 'hidden',
      boxShadow: cbTileShadow(0.12), ...cbTileBorder(0.26),
    },
    generateHeroText: {
      fontFamily: 'Inter_900Black', fontSize: 12, color: BASE_ACTION_TEXT,
      letterSpacing: 4, textTransform: 'uppercase',
    },

    // Same wrapper + grid approach as the flashcards page, so both pages' card
    // grids are built and sized identically.
    workspace: {
      flex: 1,
      width: '100%',
      maxWidth: layout.contentMaxWidth,
      alignSelf: 'center',
      paddingHorizontal: 10,
      paddingBottom: 16,
    },
    collectionHeader: { minHeight: 34, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    collectionCount: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: DIM2, letterSpacing: 0.3 },
    collectionScroll: { flex: 1 },
    collectionGrid: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', paddingBottom: 18 },
    compactActionTile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      width: layout.twoColumn ? '48.8%' : '100%',
      backgroundColor: rgbaFromHex(SURFACE, 0.94),
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 12,
      overflow: 'hidden',
      boxShadow: cbTileShadow(0.05),
      ...cbTileBorder(0.13),
    },
    compactActionIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: softAccent,
      borderWidth: 1,
      borderColor: softAccentBorder,
    },
    compactActionTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 13,
      color: GOLD_L,
      textTransform: 'lowercase',
    },
    compactActionSubtitle: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: DIM2,
      lineHeight: 16,
      marginTop: 2,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 22,
    },
    searchBar: {
      flex: 1,
      height: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: rgbaFromHex(SURFACE, 0.96),
      borderRadius: 14,
      borderWidth: 1,
      borderColor: BORDER,
      paddingHorizontal: 14,
    },
    searchIconBtn: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: rgbaFromHex(SURFACE_2, 0.92),
      borderWidth: 1,
      borderColor: BORDER,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchIconBtnActive: { backgroundColor: ACCENT, borderColor: ACCENT },
    sectionLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      color: GOLD_D,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      marginTop: 4,
      marginBottom: -2,
    },
    searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: GOLD_L },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: BORDER,
      backgroundColor: SURFACE_2,
    },
    filterChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
    filterChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: GOLD_L, textTransform: 'lowercase' },
    filterChipTextActive: { color: BG },

    listContent: {
      width: '100%',
      maxWidth: layout.contentMaxWidth,
      alignSelf: 'center',
      paddingHorizontal: layout.isTablet ? layout.screenPadding : 10,
      paddingTop: 10,
      paddingBottom: 120,
      flexGrow: 1,
    },
    // Cover + meta-panel card, square like the flashcards page's collection cards --
    // width comes from the inline percentage below (same formula as flashcards),
    // aspectRatio:1 makes height follow width.
    // Width comes from the inline percentage below; height is intrinsic to
    // content (no aspectRatio) -- a forced square squeezed the cover, preview
    // text, folder tag, and both action buttons into a fixed height regardless
    // of content, which is what read as "cramped." Same fix as the flashcards
    // page's collectionCard.
    noteCard: {
      borderRadius: 17,
      backgroundColor: rgbaFromHex(SURFACE, 0.95),
      overflow: 'hidden',
      boxShadow: cbTileShadow(0.06),
      ...cbTileBorder(0.14),
    },
    noteCover: {
      minHeight: 104,
      paddingHorizontal: 14,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noteCoverTag: {
      position: 'absolute',
      top: 10,
      right: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: 'rgba(23,20,17,0.16)',
    },
    noteCoverTagText: { fontFamily: 'Inter_700Bold', fontSize: 9, color: '#171411', textTransform: 'lowercase' },
    noteCoverTitle: {
      fontFamily: 'Inter_900Black', fontSize: 14, lineHeight: 17, color: '#171411',
      textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5,
    },
    noteCoverMeta: { fontFamily: 'Inter_700Bold', fontSize: 9, color: rgbaFromHex('#171411', 0.66), letterSpacing: 1.2, marginTop: 7 },
    noteCardMeta: { flex: 1, padding: 14, justifyContent: 'space-between', gap: 8 },
    noteCardPreview: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM2, lineHeight: 15 },
    noteTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: BORDER,
      backgroundColor: rgbaFromHex(SURFACE_2, 0.86),
      paddingHorizontal: 10,
      paddingVertical: 6,
      alignSelf: 'flex-start',
    },
    noteTagText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10,
      color: DIM2,
      textTransform: 'lowercase',
    },
    noteCardTitle: { fontFamily: 'Inter_900Black', fontSize: 16, color: GOLD_L, lineHeight: 22 },
    notePreview: { fontFamily: 'Inter_400Regular', fontSize: 12, color: DIM2, lineHeight: 18 },
    noteCardActionRow: { flexDirection: 'row', gap: 8 },
    noteCardActionBtn: {
      height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
      backgroundColor: rgbaFromHex(SURFACE, 0.9), borderWidth: 1, borderColor: BORDER,
    },
    noteCardActionBtnPrimary: { backgroundColor: BASE_ACTION_BG, borderColor: BASE_ACTION_BORDER },

    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 40 },
    emptyTitle: { fontFamily: 'Inter_900Black', fontSize: 18, color: GOLD_D },
    emptyHint: { fontFamily: 'Inter_400Regular', fontSize: 12, color: DIM2, textAlign: 'center', letterSpacing: 1 },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: BG + 'EE',
      justifyContent: 'center',
      alignItems: 'center',
    },


    trashCard: {
      backgroundColor: SURFACE,
      borderRadius: 22,
      padding: 16,
      flexDirection: 'row',
      gap: 12,
      overflow: 'hidden',
      boxShadow: cbTileShadow(0.05),
      ...cbTileBorder(0.13),
    },
    trashMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM2, marginTop: 8, letterSpacing: 0.8 },
    trashActions: { justifyContent: 'space-between', gap: 8 },
    restoreBtn: {
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: softSuccess,
      borderWidth: 1,
      borderColor: softSuccessBorder,
    },
    restoreBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: GREEN, textTransform: 'lowercase' },
    deleteForeverBtn: {
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: softDanger,
      borderWidth: 1,
      borderColor: softDangerBorder,
    },
    deleteForeverText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: RED, textTransform: 'lowercase' },

    modalRoot: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 16,
      backgroundColor: 'rgba(10, 12, 20, 0.48)',
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    modalKeyboard: { flex: 1, justifyContent: 'center' },
    modalCard: {
      maxHeight: '88%',
      backgroundColor: rgbaFromHex(SURFACE, 0.98),
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 16,
      overflow: 'hidden',
      boxShadow: cbModalShadow(0.12),
      ...cbTileBorder(0.2),
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 14,
    },
    modalTitle: { fontFamily: 'Inter_900Black', fontSize: 22, color: GOLD_L },
    modalSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM2, lineHeight: 16, marginTop: 4 },
    modalCloseBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: rgbaFromHex(SURFACE_2, 0.9),
      borderWidth: 1,
      borderColor: BORDER,
    },
    modalBody: { gap: 12, paddingBottom: 6 },
    modalSectionLabel: { fontFamily: 'Inter_700Bold', fontSize: 11, color: GOLD_D, letterSpacing: 1.4, textTransform: 'uppercase' },
    historyHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    clearHistoryText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: ACCENT, textTransform: 'lowercase' },
    modalInput: {
      backgroundColor: rgbaFromHex(SURFACE_2, 0.9),
      borderRadius: 18,
      borderWidth: 1,
      borderColor: BORDER,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: GOLD_L,
    },
    modalTextarea: {
      minHeight: 116,
      paddingTop: 14,
    },
    rowActions: { flexDirection: 'row', gap: 10 },
    primaryBtn: {
      borderRadius: 16,
      backgroundColor: ACCENT,
      paddingHorizontal: 16,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: { fontFamily: 'Inter_900Black', fontSize: 12, color: BG, textTransform: 'lowercase' },
    secondaryBtn: {
      borderRadius: 16,
      backgroundColor: rgbaFromHex(SURFACE_2, 0.9),
      borderWidth: 1,
      borderColor: BORDER,
      paddingHorizontal: 16,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: GOLD_L, textTransform: 'lowercase' },

    templateTabs: { flexDirection: 'row', gap: 10 },
    tabBtn: {
      flex: 1,
      borderRadius: 16,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: rgbaFromHex(SURFACE_2, 0.9),
      borderWidth: 1,
      borderColor: BORDER,
    },
    tabBtnActive: {
      backgroundColor: ACCENT,
      borderColor: ACCENT,
    },
    tabBtnText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: GOLD_L, textTransform: 'lowercase' },
    tabBtnTextActive: { color: BG },
    dashedCard: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: softAccentBorder,
      borderStyle: 'dashed',
      padding: 18,
      alignItems: 'center',
      gap: 8,
      backgroundColor: softAccent,
    },
    dashedCardTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: GOLD_L, textTransform: 'lowercase' },
    dashedCardText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: DIM2, textAlign: 'center' },
    formCard: {
      backgroundColor: rgbaFromHex(SURFACE_2, 0.92),
      borderRadius: 22,
      padding: 14,
      gap: 10,
      overflow: 'hidden',
      boxShadow: cbTileShadow(0.05),
      ...cbTileBorder(0.13),
    },
    templateCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: rgbaFromHex(SURFACE_2, 0.92),
      borderRadius: 20,
      padding: 14,
      overflow: 'hidden',
      boxShadow: cbTileShadow(0.05),
      ...cbTileBorder(0.13),
    },
    templateIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: softAccent,
      borderWidth: 1,
      borderColor: softAccentBorder,
    },
    templateName: { fontFamily: 'Inter_700Bold', fontSize: 14, color: GOLD_L },
    templateDesc: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM2, lineHeight: 16, marginTop: 3 },
    templateActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    templateUseBtn: {
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: ACCENT,
    },
    templateUseBtnText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: BG, textTransform: 'lowercase' },
    templateDeleteBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: softDanger,
      borderWidth: 1,
      borderColor: softDangerBorder,
    },
    templateDeleteBtnCorner: {
      position: 'absolute',
      top: 10,
      right: 10,
      zIndex: 2,
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: softDanger,
      borderWidth: 1,
      borderColor: softDangerBorder,
    },

    // The Generate hub's three top-level cards -- record/upload audio (full
    // width), then templates + blank note side by side.
    createBentoCard: {
      borderRadius: 22,
      backgroundColor: rgbaFromHex(SURFACE_2, 0.92),
      padding: 16,
      overflow: 'hidden',
      boxShadow: cbTileShadow(0.06),
      ...cbTileBorder(0.14),
    },
    createBentoCardWide: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 14,
    },
    createBentoRow: { flexDirection: 'row', gap: 14 },
    createBentoCardHalf: { flex: 1, minHeight: 118, justifyContent: 'space-between' },
    createBentoIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: softAccent,
      borderWidth: 1,
      borderColor: softAccentBorder,
    },
    createBentoTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: GOLD_L, marginTop: 10 },
    createBentoDesc: { fontFamily: 'Inter_400Regular', fontSize: 11.5, color: DIM2, lineHeight: 16, marginTop: 4 },

    // Templates screen's grid -- every built-in/custom template and the
    // "create custom" card as same-sized bento tiles, two per row.
    templateBentoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    templateBentoCard: {
      width: '47%',
      minHeight: 128,
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      gap: 6,
    },
    templateBentoCardCenter: { alignItems: 'center', justifyContent: 'center' },

    emptyModalState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24, gap: 8 },
    selectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 18,
      backgroundColor: rgbaFromHex(SURFACE_2, 0.92),
      padding: 14,
      overflow: 'hidden',
      boxShadow: cbTileShadow(0.04),
      ...cbTileBorder(0.13),
    },
    selectRowActive: {
      borderColor: ACCENT,
      backgroundColor: softAccent,
    },
    selectRowTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: GOLD_L },
    selectRowMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM2, marginTop: 4 },
    smartFolderCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: rgbaFromHex(SURFACE_2, 0.92),
      borderRadius: 20,
      padding: 14,
      overflow: 'hidden',
      boxShadow: cbTileShadow(0.05),
      ...cbTileBorder(0.13),
    },
    inlineChips: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },

  });
}

export let s: ReturnType<typeof createStyles> = createStyles(DEFAULT_LAYOUT);
