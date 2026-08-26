import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import { generatePracticeQuestions, getWeaknessAnalysis, getWeaknessRecommendations, WeaknessRecommendation } from '../services/api';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import { cbTileShadow, cbTileBorder } from '../components/NeumorphicTexture';
import SectionSidebar, { SidebarItem } from '../components/SectionSidebar';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = { user: AuthUser; onBack: () => void; onNavigate?: (screen: 'rlInsights' | 'topicsHub' | 'activityTimeline') => void };

const WEAKNESS_SIDEBAR_ITEMS: SidebarItem[] = [
  { key: 'practice-now', label: 'Practice now' },
  { key: 'weak-areas', label: 'Priority diagnosis' },
  { key: 'topics-hub', label: 'Topic mastery' },
  { key: 'how-i-learn', label: 'How I learn' },
  { key: 'activity', label: 'Activity' },
  { key: 'refresh', label: 'Refresh' },
];

const RESOURCE_LABELS: Record<string, string> = {
  ask_tutor: 'Ask the tutor',
  review_flashcards: 'Review flashcards',
  try_a_quiz: 'Try a quiz',
};
const RESOURCE_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  ask_tutor: 'sparkles-outline',
  review_flashcards: 'layers-outline',
  try_a_quiz: 'help-circle-outline',
};
type Severity = 'critical' | 'practice' | 'improving';
type Filter = 'all' | Severity;
type WeakTopic = {
  topic: string;
  mastery_level?: number;
  accuracy?: number;
  questions_asked?: number;
  correct_answers?: number;
  last_practiced?: string | null;
  severity?: Severity;
};

function asTopics(value: unknown, severity?: Severity): WeakTopic[] {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object').map((item) => ({ ...(item as WeakTopic), severity: (item as WeakTopic).severity || severity }))
    : [];
}

function topicAccuracy(topic: WeakTopic) {
  const raw = topic.accuracy ?? (topic.mastery_level ?? 0) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function topicSeverity(topic: WeakTopic): Severity {
  if (topic.severity) return topic.severity;
  const accuracy = topicAccuracy(topic);
  if (accuracy < 45) return 'critical';
  if (accuracy < 70) return 'practice';
  return 'improving';
}

export default function WeaknessPracticeScreen({ user, onBack, onNavigate }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [generatingTopic, setGeneratingTopic] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<WeaknessRecommendation[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user.id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      setAnalysis(await getWeaknessAnalysis(user.id));
    } catch (error) {
      Alert.alert('Weakness practice', error instanceof Error ? error.message : 'Failed to load weak areas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    getWeaknessRecommendations(user.username)
      .then((data) => setRecommendations(Array.isArray(data?.recommendations) ? data.recommendations : []))
      .catch(() => setRecommendations([]));
  }, [user.id, user.username]);

  useEffect(() => { load(); }, [load]);

  const topics = useMemo(() => {
    const nested = analysis?.weak_areas && typeof analysis.weak_areas === 'object'
      ? [
        ...asTopics(analysis.weak_areas.critical, 'critical'),
        ...asTopics(analysis.weak_areas.needs_practice || analysis.weak_areas.moderate, 'practice'),
        ...asTopics(analysis.weak_areas.improving || analysis.weak_areas.minor, 'improving'),
      ]
      : [];
    const source = [...asTopics(analysis?.weaknesses), ...nested];
    const fallback = source.length ? source : asTopics(analysis?.topic_mastery);
    const unique = new Map<string, WeakTopic>();
    fallback.forEach((topic) => {
      const key = String(topic.topic || '').trim().toLowerCase();
      if (key && !unique.has(key)) unique.set(key, topic);
    });
    return [...unique.values()].sort((a, b) => topicAccuracy(a) - topicAccuracy(b)).slice(0, 12);
  }, [analysis]);
  const counts = {
    critical: topics.filter((topic) => topicSeverity(topic) === 'critical').length,
    practice: topics.filter((topic) => topicSeverity(topic) === 'practice').length,
    improving: topics.filter((topic) => topicSeverity(topic) === 'improving').length,
  };
  const visibleTopics = filter === 'all' ? topics : topics.filter((topic) => topicSeverity(topic) === filter);
  const overallAccuracy = Math.max(0, Math.min(100, Math.round(analysis?.overall_accuracy || 0)));
  const priorityTopic = topics[0];

  const generateSet = async (topic: string) => {
    setGeneratingTopic(topic);
    try {
      await generatePracticeQuestions({
        userId: user.username,
        topic,
        questionCount: 10,
        difficulty: 'mixed',
        title: `Weakness practice: ${topic}`,
      });
      Alert.alert('Practice set ready', `A 10-question set for ${topic} is ready in Question Bank.`);
    } catch (error) {
      Alert.alert('Generate failed', error instanceof Error ? error.message : 'Could not generate practice questions');
    } finally {
      setGeneratingTopic(null);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={selectedTheme.accent} />}
      >
        <View style={s.header}>
          <HapticTouchable onPress={onBack} haptic="selection" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color={selectedTheme.accentHover} />
          </HapticTouchable>
          <View style={s.headerCopy}>
            <Text style={s.kicker}>PERFORMANCE MAP</Text>
            <Text style={s.title}>weakness</Text>
          </View>
          <HapticTouchable onPress={() => setSidebarOpen(true)} haptic="selection" accessibilityLabel="Open menu">
            <Ionicons name="menu-outline" size={24} color={selectedTheme.accentHover} />
          </HapticTouchable>
        </View>

        {recommendations.length > 0 && (
          <View style={s.listCard}>
            <View style={s.listHeader}>
              <View>
                <Text style={s.listKicker}>PRIORITY ORDER · LIVE MASTERY</Text>
                <Text style={s.listTitle}>focus next</Text>
              </View>
            </View>
            {recommendations.map((rec, index) => (
              <View key={rec.concept_id || index} style={s.topicRow}>
                <View style={s.topicRank}><Text style={s.topicRankText}>{String(index + 1).padStart(2, '0')}</Text></View>
                <View style={s.topicBody}>
                  <View style={s.topicTitleRow}>
                    <Text style={s.topicTitle} numberOfLines={1}>{rec.concept_name}</Text>
                    <View style={[s.severityPill, s[`severity_${rec.trend_label === 'declining' ? 'critical' : rec.trend_label === 'improving' ? 'improving' : 'practice'}`]]}>
                      <Text style={s.severityText}>{rec.trend_label}</Text>
                    </View>
                  </View>
                  <Text style={s.topicMeta}>
                    {Math.round(rec.p_mastery * 100)}% mastery · ~{rec.estimated_time_minutes} min · {RESOURCE_LABELS[rec.recommended_resource] || rec.recommended_resource}
                  </Text>
                </View>
                <HapticTouchable
                  style={s.practiceBtn}
                  onPress={() => generateSet(rec.concept_name)}
                  disabled={generatingTopic === rec.concept_name}
                  haptic="medium"
                  accessibilityLabel={`Practice ${rec.concept_name}`}
                >
                  {generatingTopic === rec.concept_name
                    ? <ActivityIndicator color={s.accentInk.color} size="small" />
                    : <Ionicons name={RESOURCE_ICONS[rec.recommended_resource] || 'arrow-forward'} size={16} color={s.accentInk.color} />}
                </HapticTouchable>
              </View>
            ))}
          </View>
        )}

        {!user.id ? (
          <EmptyState icon="person-circle-outline" title="reload your session" copy="Your account needs to refresh before weakness analysis can load." styles={s} />
        ) : loading ? (
          <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 80 }} />
        ) : topics.length === 0 ? (
          <EmptyState icon="checkmark-circle-outline" title="no weak areas" copy="Complete more Question Bank sets and targeted topics will appear here." styles={s} />
        ) : (
          <>
            <View style={s.priorityCard}>
              <View style={s.priorityTop}>
                <View style={s.priorityIcon}><Ionicons name="locate-outline" size={20} color={s.accentInk.color} /></View>
                <View style={s.priorityCopy}>
                  <Text style={s.priorityKicker}>NEXT BEST FOCUS</Text>
                  <Text style={s.priorityTitle} numberOfLines={2}>{priorityTopic?.topic || 'Targeted practice'}</Text>
                </View>
                <View style={s.priorityScore}>
                  <Text style={s.priorityScoreValue}>{topicAccuracy(priorityTopic)}</Text>
                  <Text style={s.priorityScoreUnit}>%</Text>
                </View>
              </View>
              <View style={s.priorityTrack}><View style={[s.priorityFill, { width: `${Math.max(4, topicAccuracy(priorityTopic))}%` }]} /></View>
              <HapticTouchable style={s.primaryPracticeBtn} onPress={() => generateSet(priorityTopic.topic)} disabled={generatingTopic === priorityTopic.topic} haptic="medium">
                {generatingTopic === priorityTopic.topic ? <ActivityIndicator color={s.accentInk.color} size="small" /> : <Ionicons name="flash" size={16} color={s.accentInk.color} />}
                <Text style={s.primaryPracticeText}>{generatingTopic === priorityTopic.topic ? 'BUILDING SET…' : 'PRACTICE PRIORITY'}</Text>
              </HapticTouchable>
            </View>

            <View style={s.summaryRow}>
              <Summary icon="alert-circle-outline" label="critical" value={String(counts.critical)} styles={s} />
              <Summary icon="barbell-outline" label="practice" value={String(counts.practice)} styles={s} />
              <Summary icon="trending-up-outline" label="accuracy" value={`${overallAccuracy}%`} styles={s} />
            </View>

            <View style={s.filterRow}>
              {([
                ['all', 'All', topics.length],
                ['critical', 'Critical', counts.critical],
                ['practice', 'Practice', counts.practice],
                ['improving', 'Improving', counts.improving],
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
                  <Text style={s.listKicker}>RANKED BY ACCURACY</Text>
                  <Text style={s.listTitle}>{filter === 'all' ? 'all weak areas' : filter}</Text>
                </View>
                <Text style={s.listMeta}>{visibleTopics.length} topics</Text>
              </View>
              {visibleTopics.length ? visibleTopics.map((topic, index) => (
                <TopicRow
                  key={`${topic.topic}-${index}`}
                  index={index}
                  topic={topic}
                  loading={generatingTopic === topic.topic}
                  onPractice={() => generateSet(topic.topic)}
                  styles={s}
                />
              )) : <Text style={s.emptyInline}>No topics in this category yet.</Text>}
            </View>
          </>
        )}
      </ScrollView>

      <SectionSidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pageTitle="weakness"
        items={WEAKNESS_SIDEBAR_ITEMS}
        activeKey="weak-areas"
        onSelect={(key) => {
          if (key === 'practice-now' && priorityTopic) generateSet(priorityTopic.topic);
          else if (key === 'topics-hub') onNavigate?.('topicsHub');
          else if (key === 'how-i-learn') onNavigate?.('rlInsights');
          else if (key === 'activity') onNavigate?.('activityTimeline');
          else if (key === 'refresh') { setRefreshing(true); load(); }
        }}
      />
    </SafeAreaView>
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

function TopicRow({ index, topic, loading, onPractice, styles }: { index: number; topic: WeakTopic; loading: boolean; onPractice: () => void; styles: ReturnType<typeof createStyles> }) {
  const accuracy = topicAccuracy(topic);
  const severity = topicSeverity(topic);
  return (
    <View style={styles.topicRow}>
      <View style={styles.topicRank}><Text style={styles.topicRankText}>{String(index + 1).padStart(2, '0')}</Text></View>
      <View style={styles.topicBody}>
        <View style={styles.topicTitleRow}>
          <Text style={styles.topicTitle} numberOfLines={1}>{topic.topic}</Text>
          <View style={[styles.severityPill, styles[`severity_${severity}`]]}><Text style={styles.severityText}>{severity}</Text></View>
        </View>
        <Text style={styles.topicMeta}>{topic.correct_answers ?? 0}/{topic.questions_asked ?? 0} correct · {accuracy}% mastery</Text>
        <View style={styles.topicTrack}><View style={[styles.topicFill, { width: `${Math.max(4, accuracy)}%` }]} /></View>
      </View>
      <HapticTouchable style={styles.practiceBtn} onPress={onPractice} disabled={loading} haptic="medium" accessibilityLabel={`Practice ${topic.topic}`}>
        {loading ? <ActivityIndicator color={styles.accentInk.color} size="small" /> : <Ionicons name="arrow-forward" size={16} color={styles.accentInk.color} />}
      </HapticTouchable>
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

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const surface = theme.panel;
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.18 : 0.2);
  const accentInk = theme.isLight ? darkenColor(theme.accent, 38) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 10, paddingBottom: 110, gap: 12 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 18, paddingBottom: 12 },
    headerCopy: { flex: 1 },
    kicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 10, letterSpacing: 1.7 },
    title: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 32, lineHeight: 36, letterSpacing: -0.8 },
    priorityCard: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.9), padding: 16, gap: 13, boxShadow: cbTileShadow(0.08) } as ViewStyle,
    priorityTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    priorityIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    priorityCopy: { flex: 1 },
    priorityKicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 10, letterSpacing: 1.4 },
    priorityTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 18, lineHeight: 22, marginTop: 3 },
    priorityScore: { flexDirection: 'row', alignItems: 'flex-end' },
    priorityScoreValue: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 31, letterSpacing: -1 },
    priorityScoreUnit: { fontFamily: 'Inter_900Black', color: theme.accent, fontSize: 12, marginBottom: 5 },
    priorityTrack: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: rgbaFromHex(theme.accent, 0.12) },
    priorityFill: { height: '100%', borderRadius: 3, backgroundColor: theme.accentHover },
    primaryPracticeBtn: { height: 43, borderRadius: 13, backgroundColor: theme.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    primaryPracticeText: { fontFamily: 'Inter_900Black', color: accentInk, fontSize: 10, letterSpacing: 1 },
    summaryRow: { flexDirection: 'row', gap: 8 },
    summaryCard: { flex: 1, minHeight: 86, borderRadius: 18, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.8), padding: 11, justifyContent: 'center', boxShadow: cbTileShadow(0.045) } as ViewStyle,
    summaryValue: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 23, marginTop: 5 },
    summaryLabel: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },
    filterRow: { height: 42, flexDirection: 'row', gap: 5 },
    filterBtn: { flex: 1, borderRadius: 13, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.76), alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
    filterBtnActive: { backgroundColor: theme.accent, borderColor: theme.accentHover },
    filterText: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10 },
    filterTextActive: { color: accentInk },
    filterCount: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 9, marginTop: 1 },
    listCard: { borderRadius: 22, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.82), padding: 14, gap: 3, boxShadow: cbTileShadow(0.06) } as ViewStyle,
    listHeader: { minHeight: 49, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 9 },
    listKicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 10, letterSpacing: 1.4 },
    listTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 18, marginTop: 2, textTransform: 'lowercase' },
    listMeta: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 9 },
    topicRow: { minHeight: 82, borderTopWidth: 1, borderTopColor: theme.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    topicRank: { width: 30, height: 30, borderRadius: 9, backgroundColor: rgbaFromHex(theme.accent, 0.1), alignItems: 'center', justifyContent: 'center' },
    topicRankText: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 10 },
    topicBody: { flex: 1, gap: 6 },
    topicTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    topicTitle: { flex: 1, fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 12 },
    topicMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 9 },
    topicTrack: { height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: rgbaFromHex(theme.accent, 0.1) },
    topicFill: { height: '100%', borderRadius: 2, backgroundColor: theme.accentHover },
    severityPill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
    severity_critical: { backgroundColor: rgbaFromHex('#ef6a6a', 0.16) },
    severity_practice: { backgroundColor: rgbaFromHex('#e6b85c', 0.16) },
    severity_improving: { backgroundColor: rgbaFromHex('#69bea8', 0.16) },
    severityText: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5 },
    practiceBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    empty: { borderRadius: 24, backgroundColor: rgbaFromHex(surface, 0.82), alignItems: 'center', paddingVertical: 54, paddingHorizontal: 24, gap: 9, overflow: 'hidden', boxShadow: cbTileShadow(0.06), ...cbTileBorder(0.14) },
    emptyIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: rgbaFromHex(theme.accent, 0.12), alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 21 },
    emptyText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 300 },
    emptyInline: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, paddingVertical: 18, textAlign: 'center' },
    iconColor: { color: theme.accentHover },
    accentInk: { color: accentInk },
  });
}
