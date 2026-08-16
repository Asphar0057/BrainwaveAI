import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import { getMasteryOverview } from '../services/api';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import { cbTileShadow, cbTileBorder } from '../components/NeumorphicTexture';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = { user: AuthUser; onBack: () => void };
type Bucket = 'mastered' | 'progressing' | 'needs_work';
type Filter = 'all' | Bucket;
type Topic = {
  topic: string;
  mastery_level: number;
  confidence_level?: number;
  times_studied?: number;
  questions_asked?: number;
  correct_answers?: number;
  accuracy?: number;
  last_practiced?: string | null;
  struggles_with?: string[];
  excels_at?: string[];
};
type Overview = {
  overall_mastery: number;
  total_topics: number;
  mastered_topics: number;
  progressing_topics: number;
  needs_work_topics: number;
  topic_breakdown: { mastered: Topic[]; progressing: Topic[]; needs_work: Topic[] };
};

function fmtLastPracticed(iso?: string | null) {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function TopicsHubScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(selectedTheme, layout, insets.top), [selectedTheme, layout, insets.top]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    if (!user.id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      setOverview(await getMasteryOverview(user.id));
    } catch (error) {
      Alert.alert('Topics hub', error instanceof Error ? error.message : 'Failed to load topics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const topics: Topic[] = useMemo(() => {
    if (!overview) return [];
    if (filter === 'all') {
      return [
        ...overview.topic_breakdown.mastered,
        ...overview.topic_breakdown.progressing,
        ...overview.topic_breakdown.needs_work,
      ];
    }
    return overview.topic_breakdown[filter] || [];
  }, [overview, filter]);

  if (!fontsLoaded) return null;

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={selectedTheme.accent} />}
      >
        <View style={s.header}>
          <HapticTouchable style={s.iconBtn} onPress={onBack} haptic="light" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={20} color={selectedTheme.accentHover} />
          </HapticTouchable>
          <View style={s.headerCopy}>
            <Text style={s.kicker}>EVERYTHING YOU'VE LEARNED</Text>
            <Text style={s.title}>topics</Text>
          </View>
          <HapticTouchable style={s.iconBtn} onPress={() => { setRefreshing(true); load(); }} haptic="light" accessibilityLabel="Refresh topics hub">
            <Ionicons name="refresh" size={17} color={selectedTheme.accentHover} />
          </HapticTouchable>
        </View>

        {!user.id ? (
          <EmptyState icon="person-circle-outline" title="reload your session" copy="Your account needs to refresh before your topics can load." styles={s} />
        ) : loading ? (
          <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 80 }} />
        ) : !overview || overview.total_topics === 0 ? (
          <EmptyState icon="book-outline" title="no topics yet" copy="Study with quizzes, flashcards, or chat to start building your topic mastery profile." styles={s} />
        ) : (
          <>
            <View style={s.summaryRow}>
              <Summary icon="trophy-outline" label="mastered" value={String(overview.mastered_topics)} styles={s} />
              <Summary icon="trending-up-outline" label="progressing" value={String(overview.progressing_topics)} styles={s} />
              <Summary icon="alert-circle-outline" label="needs work" value={String(overview.needs_work_topics)} styles={s} />
            </View>

            <View style={s.priorityCard}>
              <View style={s.priorityTop}>
                <View style={s.priorityIcon}><Ionicons name="school-outline" size={20} color={s.accentInk.color} /></View>
                <View style={s.priorityCopy}>
                  <Text style={s.priorityKicker}>OVERALL MASTERY</Text>
                  <Text style={s.priorityTitle} numberOfLines={1}>{overview.total_topics} topics tracked</Text>
                </View>
                <View style={s.priorityScore}>
                  <Text style={s.priorityScoreValue}>{Math.round(overview.overall_mastery)}</Text>
                  <Text style={s.priorityScoreUnit}>%</Text>
                </View>
              </View>
              <View style={s.priorityTrack}><View style={[s.priorityFill, { width: `${Math.max(4, Math.round(overview.overall_mastery))}%` }]} /></View>
            </View>

            <View style={s.filterRow}>
              {([
                ['all', 'All', overview.total_topics],
                ['mastered', 'Mastered', overview.mastered_topics],
                ['progressing', 'Progressing', overview.progressing_topics],
                ['needs_work', 'Needs Work', overview.needs_work_topics],
              ] as [Filter, string, number][]).map(([key, label, count]) => (
                <HapticTouchable key={key} style={[s.filterBtn, filter === key && s.filterBtnActive]} onPress={() => setFilter(key)} haptic="selection">
                  <Text style={[s.filterText, filter === key && s.filterTextActive]}>{label}</Text>
                  <Text style={[s.filterCount, filter === key && s.filterTextActive]}>{count}</Text>
                </HapticTouchable>
              ))}
            </View>

            <View style={s.listCard}>
              <View style={s.listHeader}>
                <View>
                  <Text style={s.listKicker}>TOPIC LIBRARY</Text>
                  <Text style={s.listTitle}>{filter === 'all' ? 'all topics' : filter.replace('_', ' ')}</Text>
                </View>
                <Text style={s.listMeta}>{topics.length} topics</Text>
              </View>
              {topics.length ? topics.map((topic, index) => (
                <TopicRow key={`${topic.topic}-${index}`} index={index} topic={topic} styles={s} />
              )) : <Text style={s.emptyInline}>No topics in this category yet.</Text>}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Summary({ icon, label, value, styles }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.summaryCard}>
      <Ionicons name={icon} size={15} color={styles.iconColor.color} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function TopicRow({ index, topic, styles }: { index: number; topic: Topic; styles: ReturnType<typeof createStyles> }) {
  const masteryPct = Math.max(0, Math.min(100, Math.round((topic.mastery_level || 0) * 100)));
  const bucket: Bucket = masteryPct >= 80 ? 'mastered' : masteryPct >= 50 ? 'progressing' : 'needs_work';
  return (
    <View style={styles.topicRow}>
      <View style={styles.topicRank}><Text style={styles.topicRankText}>{String(index + 1).padStart(2, '0')}</Text></View>
      <View style={styles.topicBody}>
        <View style={styles.topicTitleRow}>
          <Text style={styles.topicTitle} numberOfLines={1}>{topic.topic}</Text>
          <View style={[styles.severityPill, styles[`severity_${bucket}`]]}><Text style={styles.severityText}>{bucket.replace('_', ' ')}</Text></View>
        </View>
        <Text style={styles.topicMeta}>
          {topic.accuracy ?? 0}% accuracy · {topic.times_studied ?? 0} sessions · {fmtLastPracticed(topic.last_practiced)}
        </Text>
        <View style={styles.topicTrack}><View style={[styles.topicFill, { width: `${Math.max(4, masteryPct)}%` }]} /></View>
        {(topic.struggles_with || []).length > 0 && (
          <Text style={styles.strugglesText} numberOfLines={1}>struggles with: {topic.struggles_with!.slice(0, 2).join(', ')}</Text>
        )}
      </View>
    </View>
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

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>, topInset: number) {
  const surface = theme.panel;
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.18 : 0.2);
  const accentInk = theme.isLight ? darkenColor(theme.accent, 38) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 4, paddingTop: Math.max(topInset + 10, 50), paddingBottom: 110, gap: 12 },
    header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconBtn: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.82), alignItems: 'center', justifyContent: 'center' },
    headerCopy: { flex: 1 },
    kicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 8, letterSpacing: 1.7 },
    title: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 32, lineHeight: 36, letterSpacing: -0.8 },
    summaryRow: { flexDirection: 'row', gap: 8 },
    summaryCard: { flex: 1, minHeight: 86, borderRadius: 18, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.8), padding: 11, justifyContent: 'center', boxShadow: cbTileShadow(0.045) } as ViewStyle,
    summaryValue: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 23, marginTop: 5 },
    summaryLabel: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },
    priorityCard: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.9), padding: 16, gap: 13, boxShadow: cbTileShadow(0.08) } as ViewStyle,
    priorityTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    priorityIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    priorityCopy: { flex: 1 },
    priorityKicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 8, letterSpacing: 1.4 },
    priorityTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 18, lineHeight: 22, marginTop: 3 },
    priorityScore: { flexDirection: 'row', alignItems: 'flex-end' },
    priorityScoreValue: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 31, letterSpacing: -1 },
    priorityScoreUnit: { fontFamily: 'Inter_900Black', color: theme.accent, fontSize: 12, marginBottom: 5 },
    priorityTrack: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: rgbaFromHex(theme.accent, 0.12) },
    priorityFill: { height: '100%', borderRadius: 3, backgroundColor: theme.accentHover },
    filterRow: { height: 42, flexDirection: 'row', gap: 5 },
    filterBtn: { flex: 1, borderRadius: 13, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.76), alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
    filterBtnActive: { backgroundColor: theme.accent, borderColor: theme.accentHover },
    filterText: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 8 },
    filterTextActive: { color: accentInk },
    filterCount: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 9, marginTop: 1 },
    listCard: { borderRadius: 22, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.82), padding: 14, gap: 3, boxShadow: cbTileShadow(0.06) } as ViewStyle,
    listHeader: { minHeight: 49, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 9 },
    listKicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 8, letterSpacing: 1.4 },
    listTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 18, marginTop: 2, textTransform: 'lowercase' },
    listMeta: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 9 },
    topicRow: { minHeight: 82, borderTopWidth: 1, borderTopColor: theme.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    topicRank: { width: 30, height: 30, borderRadius: 9, backgroundColor: rgbaFromHex(theme.accent, 0.1), alignItems: 'center', justifyContent: 'center' },
    topicRankText: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 8 },
    topicBody: { flex: 1, gap: 6 },
    topicTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    topicTitle: { flex: 1, fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 12 },
    topicMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 9 },
    strugglesText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 9, fontStyle: 'italic' },
    topicTrack: { height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: rgbaFromHex(theme.accent, 0.1) },
    topicFill: { height: '100%', borderRadius: 2, backgroundColor: theme.accentHover },
    severityPill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
    severity_mastered: { backgroundColor: rgbaFromHex('#69bea8', 0.16) },
    severity_progressing: { backgroundColor: rgbaFromHex('#e6b85c', 0.16) },
    severity_needs_work: { backgroundColor: rgbaFromHex('#ef6a6a', 0.16) },
    severityText: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 6.5, textTransform: 'uppercase', letterSpacing: 0.5 },
    empty: { borderRadius: 24, backgroundColor: rgbaFromHex(surface, 0.82), alignItems: 'center', paddingVertical: 54, paddingHorizontal: 24, gap: 9, overflow: 'hidden', boxShadow: cbTileShadow(0.06), ...cbTileBorder(0.14) },
    emptyIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: rgbaFromHex(theme.accent, 0.12), alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 21 },
    emptyText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 300 },
    emptyInline: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, paddingVertical: 18, textAlign: 'center' },
    iconColor: { color: theme.accentHover },
    accentInk: { color: accentInk },
  });
}
