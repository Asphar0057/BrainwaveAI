import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import { getStrengthsWeaknesses, getRecentMistakes, explainMistake, RecentMistake, RecentMistakeSource } from '../services/api';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import PulseCubes from '../components/PulseCubes';
import { cbTileShadow, cbTileBorder } from '../components/NeumorphicTexture';
import SectionSidebar, { SidebarItem } from '../components/SectionSidebar';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = { user: AuthUser; onBack: () => void; onNavigate?: (screen: 'rlInsights' | 'topicsHub' | 'activityTimeline') => void };

const WEAKNESS_SIDEBAR_ITEMS: SidebarItem[] = [
  { key: 'weak-areas', label: 'Weak topics' },
  { key: 'topics-hub', label: 'Topic mastery' },
  { key: 'how-i-learn', label: 'How I learn' },
  { key: 'activity', label: 'Activity' },
  { key: 'refresh', label: 'Refresh' },
];

type WeakTopic = { topic: string; mastery_level?: number; accuracy?: number };

function asTopics(value: unknown): WeakTopic[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') as WeakTopic[] : [];
}

function topicAccuracy(topic: WeakTopic) {
  const raw = topic.accuracy ?? (topic.mastery_level ?? 0) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function normalizeTopicKey(topic: string | null | undefined): string {
  return (topic || '').trim().toLowerCase();
}

function displayTopic(topic: string | null | undefined): string {
  return (topic || '').trim() || 'General';
}

const MISTAKE_SOURCE_META: Record<RecentMistakeSource, { label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  question_bank: { label: 'Practice', icon: 'book-outline' },
  solo_quiz: { label: 'Quiz', icon: 'book-outline' },
  flashcard: { label: 'Flashcard', icon: 'layers-outline' },
  chat: { label: 'AI Chat', icon: 'chatbubble-ellipses-outline' },
};

export default function WeaknessPracticeScreen({ user, onBack, onNavigate }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [mistakes, setMistakes] = useState<RecentMistake[]>([]);
  const [mistakesLoading, setMistakesLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [explainModal, setExplainModal] = useState<{ mistake: RecentMistake; loading: boolean; content: string; error: string } | null>(null);

  const load = useCallback(async () => {
    if (!user.username) { setLoading(false); setRefreshing(false); return; }
    try {
      // Same UserWeakArea-backed data source the web Weaknesses page reads,
      // so mobile and web show the exact same weak-topic signal.
      setAnalysis(await getStrengthsWeaknesses(user.username));
    } catch (error) {
      Alert.alert('Weaknesses', error instanceof Error ? error.message : 'Failed to load weak topics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.username]);

  const loadMistakes = useCallback(async () => {
    if (!user.username) { setMistakesLoading(false); return; }
    setMistakesLoading(true);
    try {
      const data = await getRecentMistakes(user.username, 40);
      setMistakes(data.mistakes || []);
    } catch {
      setMistakes([]);
    } finally {
      setMistakesLoading(false);
    }
  }, [user.username]);

  useEffect(() => { load(); loadMistakes(); }, [load, loadMistakes]);

  const refreshAll = () => { setRefreshing(true); load(); loadMistakes(); };

  const openExplain = async (mistake: RecentMistake) => {
    setExplainModal({ mistake, loading: true, content: '', error: '' });
    try {
      const data = await explainMistake(user.username, mistake.id, mistake.source);
      setExplainModal({ mistake, loading: false, content: data.content, error: '' });
    } catch (error) {
      setExplainModal({ mistake, loading: false, content: '', error: error instanceof Error ? error.message : 'Could not generate an explanation.' });
    }
  };

  const toggleTopic = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Only weak topics ever land in `weak_areas` (critical/needs_practice/
  // improving) -- a topic that's been mastered simply isn't in this payload
  // any more, so nothing extra needs filtering out here.
  const topics = useMemo(() => {
    const groups = analysis?.weak_areas && typeof analysis.weak_areas === 'object' ? analysis.weak_areas : {};
    const combined = [...asTopics(groups.critical), ...asTopics(groups.needs_practice), ...asTopics(groups.improving)];
    const unique = new Map<string, WeakTopic>();
    combined.forEach((topic) => {
      const key = normalizeTopicKey(topic.topic);
      if (key && !unique.has(key)) unique.set(key, topic);
    });
    return [...unique.values()].sort((a, b) => topicAccuracy(a) - topicAccuracy(b)).slice(0, 12);
  }, [analysis]);

  const mistakesByTopic = useMemo(() => {
    const map = new Map<string, RecentMistake[]>();
    mistakes.forEach((mistake) => {
      const key = normalizeTopicKey(mistake.topic);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(mistake);
    });
    return map;
  }, [mistakes]);

  const busy = loading || mistakesLoading;

  if (!fontsLoaded) return null;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={selectedTheme.accent} />}
      >
        <View style={s.header}>
          <HapticTouchable onPress={onBack} haptic="selection" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color={selectedTheme.accentHover} />
          </HapticTouchable>
          <Text style={s.title}>weaknesses</Text>
          <HapticTouchable onPress={() => setSidebarOpen(true)} haptic="selection" accessibilityLabel="Open menu">
            <Ionicons name="menu-outline" size={24} color={selectedTheme.accentHover} />
          </HapticTouchable>
        </View>

        {!user.username ? (
          <EmptyState icon="person-circle-outline" title="reload your session" copy="Your account needs to refresh before weaknesses can load." styles={s} />
        ) : busy ? (
          <View style={{ paddingVertical: 80, alignItems: 'center' }}><PulseCubes color={selectedTheme.accent} size={14} /></View>
        ) : topics.length === 0 ? (
          <EmptyState icon="checkmark-circle-outline" title="no weak topics" copy="Keep studying — topics that need work will appear here." styles={s} />
        ) : (
          <View style={s.listCard}>
            {topics.map((topic) => {
              const key = normalizeTopicKey(topic.topic);
              const isOpen = expanded.has(key);
              const topicMistakes = mistakesByTopic.get(key) || [];
              return (
                <View key={key}>
                  <HapticTouchable style={s.topicRow} onPress={() => toggleTopic(key)} haptic="selection">
                    <View style={s.topicBody}>
                      <Text style={s.topicTitle} numberOfLines={1}>{displayTopic(topic.topic)}</Text>
                      <View style={s.topicTrack}><View style={[s.topicFill, { width: `${Math.max(4, topicAccuracy(topic))}%` }]} /></View>
                    </View>
                    <Text style={s.topicPercent}>{topicAccuracy(topic)}%</Text>
                    <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={17} color={selectedTheme.textSecondary} />
                  </HapticTouchable>

                  {isOpen && (
                    <View style={s.topicMistakes}>
                      {topicMistakes.length === 0 ? (
                        <Text style={s.emptyInline}>No recorded mistakes for this topic yet.</Text>
                      ) : topicMistakes.map((mistake) => (
                        <MistakeRow key={`${mistake.source}-${mistake.id}`} mistake={mistake} onPress={() => openExplain(mistake)} styles={s} />
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <SectionSidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pageTitle="weaknesses"
        items={WEAKNESS_SIDEBAR_ITEMS}
        activeKey="weak-areas"
        onSelect={(key) => {
          if (key === 'topics-hub') onNavigate?.('topicsHub');
          else if (key === 'how-i-learn') onNavigate?.('rlInsights');
          else if (key === 'activity') onNavigate?.('activityTimeline');
          else if (key === 'refresh') refreshAll();
        }}
      />

      <Modal visible={!!explainModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setExplainModal(null)}>
        <View style={s.modalRoot}>
          <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
          <View style={s.modalHeader}>
            <Text style={s.modalTitle} numberOfLines={1}>{explainModal ? displayTopic(explainModal.mistake.topic) : ''}</Text>
            <HapticTouchable onPress={() => setExplainModal(null)} haptic="light">
              <Ionicons name="close" size={22} color={selectedTheme.accent} />
            </HapticTouchable>
          </View>
          {explainModal && (
            <ScrollView contentContainerStyle={s.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={s.modalQuestion}>{explainModal.mistake.question_text}</Text>
              {!!explainModal.mistake.user_answer && (
                <View style={s.modalAnswers}>
                  <View style={s.modalAnswerCol}><Text style={s.modalAnswerLabel}>your answer</Text><Text style={s.modalAnswerValue}>{explainModal.mistake.user_answer}</Text></View>
                  {!!explainModal.mistake.correct_answer && (
                    <View style={s.modalAnswerCol}><Text style={s.modalAnswerLabel}>correct answer</Text><Text style={s.modalAnswerValue}>{explainModal.mistake.correct_answer}</Text></View>
                  )}
                </View>
              )}
              {explainModal.loading ? (
                <View style={{ paddingVertical: 30, alignItems: 'center' }}><PulseCubes color={selectedTheme.accent} size={13} /></View>
              ) : explainModal.error ? (
                <Text style={s.modalError}>{explainModal.error}</Text>
              ) : (
                <Text style={s.modalExplanation}>{explainModal.content}</Text>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function MistakeRow({ mistake, onPress, styles }: { mistake: RecentMistake; onPress: () => void; styles: ReturnType<typeof createStyles> }) {
  const meta = MISTAKE_SOURCE_META[mistake.source] || { label: mistake.source, icon: 'help-circle-outline' as const };
  return (
    <HapticTouchable style={styles.mistakeRow} onPress={onPress} haptic="selection">
      <View style={styles.mistakeIcon}><Ionicons name={meta.icon} size={14} color={styles.iconColor.color} /></View>
      <Text style={styles.mistakeText} numberOfLines={1}>{mistake.question_text}</Text>
      <Ionicons name="chevron-forward" size={15} color={styles.iconColor.color} />
    </HapticTouchable>
  );
}

function EmptyState({ icon, title, copy, styles }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; copy: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={30} color={styles.iconColor.color} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{copy}</Text>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const surface = theme.panel;
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.18 : 0.2);
  const accentInk = theme.isLight ? darkenColor(theme.accent, 38) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 10, paddingBottom: 110, gap: 12 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 18, paddingBottom: 12 },
    title: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 26, letterSpacing: -0.6 },

    listCard: { borderRadius: 22, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.82), overflow: 'hidden', boxShadow: cbTileShadow(0.06) } as ViewStyle,

    topicRow: { minHeight: 64, borderBottomWidth: 1, borderBottomColor: border, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    topicBody: { flex: 1, gap: 7 },
    topicTitle: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 13.5 },
    topicTrack: { height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: rgbaFromHex(theme.accent, 0.12) },
    topicFill: { height: '100%', borderRadius: 2, backgroundColor: theme.accentHover },
    topicPercent: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 15, letterSpacing: -0.3 },

    topicMistakes: { backgroundColor: rgbaFromHex(theme.textSecondary, 0.05), paddingHorizontal: 16, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: border },
    mistakeRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    mistakeIcon: { width: 26, height: 26, borderRadius: 9, backgroundColor: rgbaFromHex(theme.accent, 0.12), alignItems: 'center', justifyContent: 'center' },
    mistakeText: { flex: 1, fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11.5 },

    empty: { borderRadius: 24, backgroundColor: rgbaFromHex(surface, 0.82), alignItems: 'center', paddingVertical: 54, paddingHorizontal: 24, gap: 9, overflow: 'hidden', boxShadow: cbTileShadow(0.06), ...cbTileBorder(0.14) },
    emptyIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: rgbaFromHex(theme.accent, 0.12), alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 21 },
    emptyText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 300 },
    emptyInline: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, paddingVertical: 14, textAlign: 'center' },
    iconColor: { color: theme.accentHover },

    modalRoot: { flex: 1 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14 },
    modalTitle: { flex: 1, fontFamily: 'Inter_900Black', fontSize: 20, color: theme.accentHover },
    modalBody: { paddingHorizontal: 20, paddingBottom: 40, gap: 6 },
    modalQuestion: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 14, lineHeight: 20, marginBottom: 4 },
    modalAnswers: { flexDirection: 'row', gap: 14, paddingBottom: 14, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: border },
    modalAnswerCol: { flex: 1 },
    modalAnswerLabel: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
    modalAnswerValue: { fontFamily: 'Inter_600SemiBold', color: theme.textPrimary, fontSize: 12, marginTop: 4 },
    modalError: { fontFamily: 'Inter_400Regular', color: theme.danger, fontSize: 12.5 },
    modalExplanation: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13, lineHeight: 20 },
    accentInk: { color: accentInk },
  });
}
