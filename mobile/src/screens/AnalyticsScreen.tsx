import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import { getEnhancedStats, getLearningAnalytics, getStrengthsWeaknesses, getWeeklyProgress } from '../services/api';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import { NeumorphicLayer, cbTileShadow, cbModalShadow, cbTileBorder } from '../components/NeumorphicTexture';
import { useAppTheme } from '../contexts/ThemeContext';
import { rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = { user: AuthUser; onBack: () => void };
type Period = 'week' | 'month' | 'all';
type InsightMode = 'strengths' | 'weaknesses';
type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function numberValue(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asList(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function weakAreaList(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return ['critical', 'needs_practice', 'moderate', 'minor', 'improving']
    .flatMap((key) => asList((value as Record<string, unknown>)[key]));
}

export default function AnalyticsScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(selectedTheme, layout, insets.top), [selectedTheme, layout, insets.top]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>('week');
  const [insightMode, setInsightMode] = useState<InsightMode>('strengths');
  const [stats, setStats] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [weekly, setWeekly] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const [statsData, analyticsData, weeklyData, insightData] = await Promise.all([
        getEnhancedStats(user.username).catch(() => null),
        getLearningAnalytics(user.username, period).catch(() => null),
        getWeeklyProgress(user.username).catch(() => null),
        getStrengthsWeaknesses(user.username).catch(() => null),
      ]);
      setStats(statsData);
      setAnalytics(analyticsData);
      setWeekly(weeklyData);
      setInsights(insightData);
    } catch (error) {
      Alert.alert('Stats', error instanceof Error ? error.message : 'Failed to load your stats');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, user.username]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  if (!fontsLoaded) return null;

  const totalMinutes = numberValue(analytics?.total_time_minutes);
  const focusHours = numberValue(stats?.weeklyHours, numberValue(stats?.hours, totalMinutes / 60));
  const totalQuestions = numberValue(analytics?.total_questions, numberValue(stats?.totalQuestions));
  const accuracy = Math.max(0, Math.min(100, numberValue(analytics?.accuracy_percentage, numberValue(stats?.accuracy))));
  const streak = numberValue(stats?.streak);
  const sessions = numberValue(stats?.totalChatSessions, numberValue(analytics?.total_sessions));
  const todayMinutes = numberValue(stats?.todayMinutes);
  const totalNotesAll = numberValue(stats?.totalNotes);
  const totalFlashcardsAll = numberValue(stats?.totalFlashcards);
  const totalQuizzesAll = numberValue(stats?.lessons);
  const dailyRows = asList((period === 'week' ? weekly?.daily_breakdown : null) || analytics?.daily_data || analytics?.daily_breakdown).slice(-7);
  const chartRows = dailyRows.map((row, index) => ({
    label: String(row?.day || row?.date || `d${index + 1}`).slice(0, 3),
    value: numberValue(row?.questions_answered, numberValue(row?.ai_chats) + numberValue(row?.notes_created) + numberValue(row?.flashcards_reviewed)),
  }));
  const chartMax = Math.max(1, ...chartRows.map((row) => row.value));
  const weeklyPoints = numberValue(weekly?.total_points);
  const weeklyAvgPerDay = numberValue(weekly?.average_per_day);
  const weeklyBreakdown = weekly?.weekly_stats || {};
  const weekChips = [
    { icon: 'chatbubbles-outline' as IoniconsName, label: 'chats', value: numberValue(weeklyBreakdown.ai_chats) },
    { icon: 'document-text-outline' as IoniconsName, label: 'notes', value: numberValue(weeklyBreakdown.notes_created) },
    { icon: 'layers-outline' as IoniconsName, label: 'cards', value: numberValue(weeklyBreakdown.flashcards_created) },
    { icon: 'ribbon-outline' as IoniconsName, label: 'quizzes', value: numberValue(weeklyBreakdown.quizzes_completed) },
  ];
  const strengths = asList(insights?.strengths || insights?.top_strengths || insights?.summary?.strengths).slice(0, 4);
  const weaknesses = [
    ...asList(insights?.weaknesses || insights?.top_weaknesses || insights?.summary?.weaknesses),
    ...weakAreaList(insights?.weak_areas),
  ].slice(0, 4);
  const selectedInsights = insightMode === 'strengths' ? strengths : weaknesses;

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
          <HapticTouchable style={s.backBtn} onPress={onBack} haptic="light" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={20} color={selectedTheme.accentHover} />
          </HapticTouchable>
          <View style={s.headerCopy}>
            <Text style={s.kicker}>LEARNING OVERVIEW</Text>
            <Text style={s.title}>stats</Text>
          </View>
          <HapticTouchable style={s.refreshBtn} onPress={() => { setRefreshing(true); load(); }} haptic="light" accessibilityLabel="Refresh stats">
            <Ionicons name="refresh" size={17} color={selectedTheme.accentHover} />
          </HapticTouchable>
        </View>

        <View style={s.periodTabs}>
          {(['week', 'month', 'all'] as Period[]).map((item) => (
            <HapticTouchable key={item} style={[s.periodTab, period === item && s.periodTabActive]} onPress={() => setPeriod(item)} haptic="selection">
              <Text style={[s.periodText, period === item && s.periodTextActive]}>{item}</Text>
            </HapticTouchable>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 80 }} />
        ) : (
          <>
            {/* ── 01 · hero mosaic: big accuracy tile + stacked streak/today ── */}
            <View style={s.heroRow}>
              <View style={s.accuracyHero}>
                <NeumorphicLayer grainOpacity={0.26} />
                <Text style={s.heroGhost}>%</Text>
                <Text style={s.eyebrow}>CURRENT ACCURACY</Text>
                <View style={s.accuracyLine}>
                  <Text style={s.accuracyValue}>{Math.round(accuracy)}</Text>
                  <Text style={s.accuracyUnit}>%</Text>
                </View>
                <View style={s.accuracyTrack}>
                  <View style={[s.accuracyFill, { width: `${Math.max(3, accuracy)}%` }]} />
                </View>
                <Text style={s.snapshotHint}>{accuracy >= 75 ? 'Strong momentum — keep the rhythm.' : accuracy >= 50 ? 'Progress is building. Target weak topics next.' : 'Start with a short focused practice set.'}</Text>
              </View>
              <View style={s.heroSideCol}>
                <View style={s.sideMini}>
                  <NeumorphicLayer grainOpacity={0.22} />
                  <Ionicons name="flame" size={16} color={selectedTheme.accentHover} />
                  <Text style={s.sideMiniValue}>{streak}</Text>
                  <Text style={s.sideMiniLabel}>day streak</Text>
                </View>
                <View style={s.sideMini}>
                  <NeumorphicLayer grainOpacity={0.22} />
                  <Ionicons name="time-outline" size={16} color={selectedTheme.accentHover} />
                  <Text style={s.sideMiniValue}>{todayMinutes}<Text style={s.sideMiniUnit}>m</Text></Text>
                  <Text style={s.sideMiniLabel}>today</Text>
                </View>
              </View>
            </View>

            <View style={s.metricGrid}>
              <MetricCard icon="help-circle-outline" label="questions" value={String(totalQuestions)} suffix="answered" styles={s} />
              <MetricCard icon="chatbubbles-outline" label="sessions" value={String(sessions)} suffix="total" styles={s} />
              <MetricCard icon="speedometer-outline" label="focus" value={focusHours.toFixed(1)} suffix="hours" styles={s} />
            </View>

            {/* ── 02 · all-time totals mosaic ── */}
            <View style={s.sectionCard}>
              <View style={s.sectionHeader}>
                <View style={s.sectionHeaderLeft}>
                  <Text style={s.sectionIndex}>02</Text>
                  <View>
                    <Text style={s.sectionKicker}>ALL TIME</Text>
                    <Text style={s.sectionTitle}>your totals</Text>
                  </View>
                </View>
              </View>
              <View style={s.totalsGrid}>
                <TotalTile icon="document-text-outline" label="notes" value={totalNotesAll} styles={s} theme={selectedTheme} />
                <TotalTile icon="layers-outline" label="flashcards" value={totalFlashcardsAll} styles={s} theme={selectedTheme} />
                <TotalTile icon="ribbon-outline" label="quizzes" value={totalQuizzesAll} styles={s} theme={selectedTheme} />
                <TotalTile icon="chatbubbles-outline" label="chat sessions" value={sessions} styles={s} theme={selectedTheme} />
              </View>
            </View>

            {/* ── 03 · weekly rhythm chart + this-week breakdown chips ── */}
            <View style={s.sectionCard}>
              <View style={s.sectionHeader}>
                <View style={s.sectionHeaderLeft}>
                  <Text style={s.sectionIndex}>03</Text>
                  <View>
                    <Text style={s.sectionKicker}>ACTIVITY</Text>
                    <Text style={s.sectionTitle}>weekly rhythm</Text>
                  </View>
                </View>
                <Text style={s.sectionMeta}>{chartRows.reduce((sum, row) => sum + row.value, 0)} actions</Text>
              </View>
              <View style={s.chart}>
                {chartRows.length ? chartRows.map((row, index) => (
                  <View key={`${row.label}-${index}`} style={s.barColumn}>
                    <View style={s.barTrack}>
                      <View style={[s.barFill, { height: `${Math.max(7, (row.value / chartMax) * 100)}%` }]} />
                    </View>
                    <Text style={s.barLabel}>{row.label}</Text>
                  </View>
                )) : <Text style={s.emptyText}>Your activity chart will appear after your next study session.</Text>}
              </View>
              {weeklyPoints > 0 && (
                <>
                  <View style={s.weekDivider} />
                  <View style={s.weekChipsRow}>
                    {weekChips.map((chip) => (
                      <View key={chip.label} style={s.weekChip}>
                        <Ionicons name={chip.icon} size={12} color={selectedTheme.accentHover} />
                        <Text style={s.weekChipValue}>{chip.value}</Text>
                        <Text style={s.weekChipLabel}>{chip.label}</Text>
                      </View>
                    ))}
                    <View style={[s.weekChip, s.weekChipAccent]}>
                      <Ionicons name="flash" size={12} color={selectedTheme.accentHover} />
                      <Text style={s.weekChipValue}>{weeklyPoints}</Text>
                      <Text style={s.weekChipLabel}>pts · {weeklyAvgPerDay}/day</Text>
                    </View>
                  </View>
                </>
              )}
            </View>

            {/* ── 04 · strengths / weaknesses ── */}
            <View style={s.sectionCard}>
              <View style={s.sectionHeader}>
                <View style={s.sectionHeaderLeft}>
                  <Text style={s.sectionIndex}>04</Text>
                  <View>
                    <Text style={s.sectionKicker}>INSIGHTS</Text>
                    <Text style={s.sectionTitle}>strengths &amp; gaps</Text>
                  </View>
                </View>
              </View>
              <View style={s.insightTabs}>
                <HapticTouchable style={[s.insightTab, insightMode === 'strengths' && s.insightTabActive]} onPress={() => setInsightMode('strengths')} haptic="selection">
                  <Ionicons name="trending-up-outline" size={15} color={insightMode === 'strengths' ? s.activeInk.color : selectedTheme.textSecondary} />
                  <Text style={[s.insightTabText, insightMode === 'strengths' && s.insightTabTextActive]}>Strengths</Text>
                </HapticTouchable>
                <HapticTouchable style={[s.insightTab, insightMode === 'weaknesses' && s.insightTabActive]} onPress={() => setInsightMode('weaknesses')} haptic="selection">
                  <Ionicons name="warning-outline" size={15} color={insightMode === 'weaknesses' ? s.activeInk.color : selectedTheme.textSecondary} />
                  <Text style={[s.insightTabText, insightMode === 'weaknesses' && s.insightTabTextActive]}>Weak spots</Text>
                </HapticTouchable>
              </View>
              <InsightRows items={selectedInsights} styles={s} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function MetricCard({ icon, label, value, suffix, styles }: { icon: IoniconsName; label: string; value: string; suffix: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.metricCard}>
      <NeumorphicLayer grainOpacity={0.2} />
      <View style={styles.metricIcon}><Ionicons name={icon} size={15} color={styles.iconColor.color} /></View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricSuffix}>{suffix}</Text>
    </View>
  );
}

function TotalTile({ icon, label, value, styles, theme }: { icon: IoniconsName; label: string; value: number; styles: ReturnType<typeof createStyles>; theme: ReturnType<typeof useAppTheme>['selectedTheme'] }) {
  return (
    <View style={styles.totalTile}>
      <NeumorphicLayer grainOpacity={0.18} />
      <View style={styles.totalTileIcon}><Ionicons name={icon} size={14} color={theme.accentHover} /></View>
      <Text style={styles.totalTileValue}>{value.toLocaleString()}</Text>
      <Text style={styles.totalTileLabel}>{label}</Text>
    </View>
  );
}

function InsightRows({ items, styles }: { items: any[]; styles: ReturnType<typeof createStyles> }) {
  if (!items.length) return <Text style={styles.emptyText}>Keep learning to unlock topic-level insights.</Text>;
  return (
    <View style={styles.insightList}>
      {items.map((item, index) => {
        const label = String(item?.topic || item?.title || item?.name || item?.label || item || 'Topic').trim();
        const score = numberValue(item?.accuracy, numberValue(item?.score, numberValue(item?.mastery_level) * 100));
        return (
          <View key={`${label}-${index}`} style={styles.insightRow}>
            <View style={styles.insightIndex}><Text style={styles.insightIndexText}>{String(index + 1).padStart(2, '0')}</Text></View>
            <View style={styles.insightCopy}>
              <Text style={styles.insightName} numberOfLines={1}>{label}</Text>
              <View style={styles.insightTrack}><View style={[styles.insightFill, { width: `${Math.max(5, Math.min(100, score || 45))}%` }]} /></View>
            </View>
            {score > 0 ? <Text style={styles.insightScore}>{Math.round(score)}%</Text> : <Ionicons name="arrow-forward" size={15} color={styles.iconColor.color} />}
          </View>
        );
      })}
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>, topInset: number) {
  const surface = theme.panel;
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.18 : 0.2);
  const activeInk = theme.isLight ? theme.bgPrimary : theme.bgPrimary;
  const ghostColor = rgbaFromHex(theme.textPrimary, theme.isLight ? 0.04 : 0.06);
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 4, paddingTop: Math.max(topInset + 10, 50), paddingBottom: 110, gap: 3 },
    header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12 },
    backBtn: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.82), alignItems: 'center', justifyContent: 'center', boxShadow: cbTileShadow(0.06) } as ViewStyle,
    refreshBtn: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.82), alignItems: 'center', justifyContent: 'center', boxShadow: cbTileShadow(0.06) } as ViewStyle,
    headerCopy: { flex: 1 },
    kicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 8, letterSpacing: 1.7 },
    title: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 32, lineHeight: 36, letterSpacing: -0.8 },
    periodTabs: { height: 42, borderRadius: 15, borderWidth: 1, borderColor: border, padding: 4, backgroundColor: rgbaFromHex(surface, 0.72), flexDirection: 'row', gap: 4 },
    periodTab: { flex: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    periodTabActive: { backgroundColor: theme.accent },
    periodText: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 },
    periodTextActive: { color: activeInk },

    // ── hero mosaic ──
    heroRow: { flexDirection: 'row', gap: 3 },
    accuracyHero: {
      flex: 1.55, borderRadius: 26, padding: 18, overflow: 'hidden', gap: 12,
      boxShadow: cbModalShadow(0.14), ...cbTileBorder(0.16),
    } as ViewStyle,
    heroGhost: {
      position: 'absolute', right: 6, top: -14,
      fontFamily: 'Inter_900Black', fontSize: 108, lineHeight: 108,
      color: ghostColor, letterSpacing: -4,
    },
    eyebrow: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 8, letterSpacing: 1.5 },
    accuracyLine: { flexDirection: 'row', alignItems: 'flex-end' },
    accuracyValue: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 52, lineHeight: 56, letterSpacing: -2 },
    accuracyUnit: { fontFamily: 'Inter_900Black', color: theme.accent, fontSize: 20, marginBottom: 7, marginLeft: 2 },
    accuracyTrack: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: rgbaFromHex(theme.accent, 0.14) },
    accuracyFill: { height: '100%', borderRadius: 3, backgroundColor: theme.accentHover },
    snapshotHint: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, lineHeight: 16 },
    heroSideCol: { flex: 1, gap: 3 },
    sideMini: {
      flex: 1, borderRadius: 20, overflow: 'hidden', padding: 12, justifyContent: 'center', gap: 3,
      boxShadow: cbTileShadow(0.08), ...cbTileBorder(0.14),
    } as ViewStyle,
    sideMiniValue: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 22, letterSpacing: -0.6 },
    sideMiniUnit: { fontSize: 12, color: theme.accent },
    sideMiniLabel: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 1 },

    // ── metric row ──
    metricGrid: { flexDirection: 'row', gap: 2 },
    metricCard: { flex: 1, minHeight: 104, borderRadius: 18, overflow: 'hidden', padding: 11, boxShadow: cbTileShadow(0.06), ...cbTileBorder(0.14) } as ViewStyle,
    metricIcon: { width: 28, height: 28, borderRadius: 10, backgroundColor: rgbaFromHex(theme.accent, 0.12), alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    metricValue: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 21 },
    metricLabel: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 9, marginTop: 2 },
    metricSuffix: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 8, marginTop: 1 },

    // ── shared section card + Swiss numbered header ──
    sectionCard: { borderRadius: 22, overflow: 'hidden', padding: 15, gap: 14, boxShadow: cbTileShadow(0.07), ...cbTileBorder(0.15) } as ViewStyle,
    sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    sectionIndex: { fontFamily: 'Inter_900Black', color: rgbaFromHex(theme.accent, 0.5), fontSize: 22, letterSpacing: -0.5 },
    sectionKicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 8, letterSpacing: 1.5 },
    sectionTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 19, marginTop: 2 },
    sectionMeta: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 9 },

    // ── totals mosaic ──
    totalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
    totalTile: {
      flexBasis: '47%', flexGrow: 1, minHeight: 84, borderRadius: 16, overflow: 'hidden', padding: 11, gap: 4,
      boxShadow: cbTileShadow(0.05), ...cbTileBorder(0.12),
    } as ViewStyle,
    totalTileIcon: { width: 24, height: 24, borderRadius: 8, backgroundColor: rgbaFromHex(theme.accent, 0.1), alignItems: 'center', justifyContent: 'center' },
    totalTileValue: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 20, letterSpacing: -0.5, marginTop: 2 },
    totalTileLabel: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.6 },

    // ── weekly chart ──
    chart: { height: 126, flexDirection: 'row', alignItems: 'stretch', gap: 7 },
    barColumn: { flex: 1, alignItems: 'center', gap: 7 },
    barTrack: { flex: 1, width: '100%', maxWidth: 34, borderRadius: 9, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: rgbaFromHex(theme.accent, 0.09) },
    barFill: { width: '100%', borderRadius: 9, backgroundColor: theme.accentHover },
    barLabel: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 8, textTransform: 'uppercase' },
    weekDivider: { height: 1, backgroundColor: theme.border },
    weekChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
    weekChip: {
      flexGrow: 1, flexBasis: '18%', borderRadius: 13, borderWidth: 1, borderColor: theme.border,
      backgroundColor: rgbaFromHex(theme.accent, 0.06), alignItems: 'center', paddingVertical: 9, paddingHorizontal: 6, gap: 2,
    },
    weekChipAccent: { backgroundColor: rgbaFromHex(theme.accent, 0.14), borderColor: rgbaFromHex(theme.accentHover, 0.3) },
    weekChipValue: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 14, marginTop: 2 },
    weekChipLabel: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.4 },

    // ── insights ──
    insightTabs: { flexDirection: 'row', gap: 7 },
    insightTab: { flex: 1, height: 39, borderRadius: 13, borderWidth: 1, borderColor: border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    insightTabActive: { backgroundColor: theme.accent, borderColor: theme.accentHover },
    insightTabText: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10 },
    insightTabTextActive: { color: activeInk },
    insightList: { gap: 1 },
    insightRow: { minHeight: 48, borderTopWidth: 1, borderTopColor: theme.border, flexDirection: 'row', alignItems: 'center', gap: 10 },
    insightIndex: { width: 28, height: 28, borderRadius: 9, backgroundColor: rgbaFromHex(theme.accent, 0.1), alignItems: 'center', justifyContent: 'center' },
    insightIndexText: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 8 },
    insightCopy: { flex: 1, gap: 6 },
    insightName: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 11 },
    insightTrack: { height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: rgbaFromHex(theme.accent, 0.1) },
    insightFill: { height: '100%', borderRadius: 2, backgroundColor: theme.accentHover },
    insightScore: { fontFamily: 'Inter_700Bold', color: theme.accentHover, fontSize: 10 },
    emptyText: { flex: 1, fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, lineHeight: 16 },
    iconColor: { color: theme.accentHover },
    activeInk: { color: activeInk },
  });
}
