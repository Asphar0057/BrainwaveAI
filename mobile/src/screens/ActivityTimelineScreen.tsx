import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ScrollView, ActivityIndicator, ViewStyle, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import { API_URL, getNotes, getFlashcardHistory, getChatSessions } from '../services/api';
import { getToken } from '../services/tokenStorage';
import { stripHtml } from './notes/NotesShared';
import HapticTouchable from '../components/HapticTouchable';
import GeoBackground from '../components/GeoBackground';
import { cbTileShadow } from '../components/NeumorphicTexture';
import SectionSidebar, { SidebarItem } from '../components/SectionSidebar';
import { useAppTheme } from '../contexts/ThemeContext';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type AppTheme = ReturnType<typeof useAppTheme>['selectedTheme'];
type ActivityType = 'note' | 'flashcard' | 'quiz' | 'chat';
type ActivityItem = { id: string; type: ActivityType; title: string; content: string; timestamp: Date };
type TimelineGroup = { key: string; date: Date; items: ActivityItem[] };

const FILTERS: readonly ('all' | ActivityType)[] = ['all', 'note', 'flashcard', 'quiz', 'chat'];
type Filter = typeof FILTERS[number];
type Props = { user: AuthUser; onBack: () => void; onNavigate?: (screen: 'calendar') => void };

const TIMELINE_SIDEBAR_ITEMS: SidebarItem[] = [
  { key: 'timeline', label: 'Timeline' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'note', label: 'Notes' },
  { key: 'flashcard', label: 'Flashcards' },
  { key: 'quiz', label: 'Quizzes' },
  { key: 'chat', label: 'AI Chats' },
];

const TYPE_META: Record<ActivityType, { label: string; color: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  note: { label: 'note', color: '#34d399', icon: 'document-text-outline' },
  flashcard: { label: 'flashcard', color: '#fbbf24', icon: 'layers-outline' },
  quiz: { label: 'quiz', color: '#f472b6', icon: 'trophy-outline' },
  chat: { label: 'ai chat', color: '#D7B38C', icon: 'sparkles-outline' },
};

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseDateSafe = (raw: any): Date | null => {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

export default function ActivityTimelineScreen({ user, onBack, onNavigate }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const GOLD_L = selectedTheme.accentHover;
  const GOLD_D = selectedTheme.textSecondary;
  const DIM = selectedTheme.textSecondary;
  const BG = useMemo(() => [selectedTheme.bgTop, selectedTheme.bgTop, selectedTheme.bgBottom] as const, [selectedTheme]);
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold });
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const load = useCallback(async () => {
    const items: ActivityItem[] = [];

    try {
      const notes = await getNotes(user.username);
      (Array.isArray(notes) ? notes : []).forEach((note: any) => {
        if (note?.is_deleted) return;
        const ts = parseDateSafe(note.updated_at || note.created_at);
        if (!ts) return;
        items.push({
          id: `note-${note.id}`,
          type: 'note',
          title: note.title || 'Untitled Note',
          content: stripHtml(note.content || '').slice(0, 140),
          timestamp: ts,
        });
      });
    } catch {}

    try {
      const payload = await getFlashcardHistory(user.username, 200);
      const sets = Array.isArray(payload?.flashcard_history) ? payload.flashcard_history : [];
      sets.forEach((set: any) => {
        const ts = parseDateSafe(set.updated_at || set.created_at);
        if (!ts) return;
        items.push({
          id: `flashcard-${set.id}`,
          type: 'flashcard',
          title: set.title || 'Flashcard Set',
          content: `${set.card_count || 0} flashcard${set.card_count === 1 ? '' : 's'}`,
          timestamp: ts,
        });
      });
    } catch {}

    try {
      const payload = await getChatSessions(user.username);
      const sessions = Array.isArray(payload?.sessions) ? payload.sessions : [];
      sessions.forEach((session: any) => {
        const ts = parseDateSafe(session.updated_at || session.created_at);
        if (!ts) return;
        items.push({
          id: `chat-${session.id}`,
          type: 'chat',
          title: session.title || 'AI Chat Session',
          content: 'AI conversation',
          timestamp: ts,
        });
      });
    } catch {}

    try {
      const token = await getToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_URL}/get_quiz_history?user_id=${encodeURIComponent(user.username)}`, { headers });
      if (res.ok) {
        const payload = await res.json();
        const quizzes = Array.isArray(payload) ? payload : (payload?.sessions ?? []);
        quizzes.forEach((quiz: any) => {
          const ts = parseDateSafe(quiz.completed_at || quiz.created_at);
          if (!ts) return;
          const total = Number(quiz.total_questions || 0);
          const correct = Number(quiz.correct_answers || 0);
          const score = Number(quiz.score || 0);
          items.push({
            id: `quiz-${quiz.id}`,
            type: 'quiz',
            title: quiz.title || 'Quiz Session',
            content: total > 0 ? `${correct}/${total} correct · ${score}%` : 'Quiz completed',
            timestamp: ts,
          });
        });
      }
    } catch {}

    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    setActivities(items);
    setLoading(false);
    setRefreshing(false);
  }, [user.username]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? activities : activities.filter((item) => item.type === filter);

  const groupedTimeline: TimelineGroup[] = useMemo(() => {
    const grouped: Record<string, ActivityItem[]> = {};
    filtered.forEach((item) => {
      const key = dayKey(item.timestamp);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });
    return Object.entries(grouped)
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([key, items]) => ({ key, date: items[0].timestamp, items }));
  }, [filtered]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <LinearGradient colors={BG} style={StyleSheet.absoluteFill} />
      <GeoBackground />

      {/* Header */}
      <View style={s.header}>
        <HapticTouchable onPress={onBack} haptic="selection">
          <Ionicons name="chevron-back" size={22} color={GOLD_L} />
        </HapticTouchable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.title}>timeline</Text>
          <Text style={s.subtitle}>{activities.length} events logged</Text>
        </View>
        <HapticTouchable onPress={() => setSidebarOpen(true)} haptic="selection" accessibilityLabel="Open menu">
          <Ionicons name="menu-outline" size={24} color={GOLD_L} />
        </HapticTouchable>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        style={s.filterScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
      >
        {FILTERS.map((f) => (
          <HapticTouchable
            key={f}
            style={[s.chip, filter === f && s.chipActive]}
            onPress={() => setFilter(f)}
            haptic="selection"
            activeOpacity={0.8}
          >
            <Text style={[s.chipText, filter === f && s.chipTextActive]}>{f === 'all' ? 'all' : TYPE_META[f].label}</Text>
          </HapticTouchable>
        ))}
      </ScrollView>

      <View style={s.body}>
        {loading ? (
          <ActivityIndicator color={GOLD_D} style={{ marginTop: 60 }} />
        ) : groupedTimeline.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="pulse-outline" size={32} color={DIM} />
            <Text style={s.emptyTitle}>nothing here yet</Text>
            <Text style={s.emptyText}>Start studying and your timeline will fill up.</Text>
          </View>
        ) : (
          <FlatList
            style={s.listFlat}
            data={groupedTimeline}
            keyExtractor={(group) => group.key}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            refreshControl={(
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={GOLD_D} />
            )}
            renderItem={({ item: group }) => (
            <View style={s.group}>
              <View style={s.groupHead}>
                <Ionicons name="calendar-outline" size={13} color={DIM} />
                <Text style={s.groupDate}>
                  {group.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
              {group.items.map((activity) => {
                const meta = TYPE_META[activity.type];
                return (
                  <View key={activity.id} style={s.card}>
                    <View style={[s.iconBadge, { borderColor: meta.color, backgroundColor: meta.color + '22' }]}>
                      <Ionicons name={meta.icon} size={14} color={meta.color} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={s.cardTop}>
                        <Text style={s.subject} numberOfLines={1}>{activity.title}</Text>
                        <Text style={s.timeText}>{activity.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                      {activity.content ? <Text style={s.contentText} numberOfLines={2}>{activity.content}</Text> : null}
                      <Text style={[s.typeLabel, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        />
        )}
      </View>

      <SectionSidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pageTitle="timeline"
        items={TIMELINE_SIDEBAR_ITEMS}
        activeKey="timeline"
        onSelect={(key) => {
          if (key === 'calendar') onNavigate?.('calendar');
          else if (key === 'note' || key === 'flashcard' || key === 'quiz' || key === 'chat') setFilter(key);
          else if (key === 'timeline') setFilter('all');
        }}
      />
    </SafeAreaView>
  );
}

function createStyles(theme: AppTheme, layout: ReturnType<typeof useResponsiveLayout>) {
  const GOLD_L  = theme.accentHover;
  const GOLD_M  = theme.accent;
  const GOLD_D  = theme.textSecondary;
  const DIM     = theme.textSecondary;
  const SURFACE = theme.panel;
  const BORDER  = theme.border;
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bgTop },
    header: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10, paddingTop: 18, paddingBottom: 12 },
    title: { fontFamily: 'Inter_900Black', fontSize: 32, color: GOLD_L, letterSpacing: -0.8 },
    subtitle: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, letterSpacing: 2.2, marginTop: 4, textTransform: 'uppercase' },
    filterScroll: { flexGrow: 0, flexShrink: 0 },
    filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingBottom: 16 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, boxShadow: cbTileShadow(0.035) },
    chipActive: { backgroundColor: GOLD_D + '33', borderColor: GOLD_D },
    chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: DIM, textTransform: 'uppercase', letterSpacing: 1 },
    chipTextActive: { color: GOLD_L },
    body: { flex: 1 },
    listFlat: { flex: 1 },
    list: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 10, paddingTop: 10, paddingBottom: 120, gap: 18 },
    group: { gap: 8 },
    groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 2 },
    groupDate: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: DIM, textTransform: 'uppercase', letterSpacing: 1 },
    card: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: SURFACE, borderRadius: 22, borderWidth: 1, borderColor: BORDER, padding: 14, boxShadow: cbTileShadow(0.06) } as ViewStyle,
    iconBadge: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    subject: { flex: 1, fontFamily: 'Inter_900Black', fontSize: 14, color: GOLD_L, letterSpacing: -0.2 },
    timeText: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM },
    contentText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: DIM, marginTop: 3, lineHeight: 16 },
    typeLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1.3, marginTop: 6 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
    emptyTitle: { fontFamily: 'Inter_900Black', fontSize: 18, color: GOLD_M },
    emptyText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: DIM, textAlign: 'center', lineHeight: 19 },
  });
}
