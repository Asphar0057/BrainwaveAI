import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import { getEnhancedStats, getLearningAnalytics, getStrengthsWeaknesses, getWeeklyProgress } from '../services/api';
import AmbientBubbles from '../components/AmbientBubbles';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import { NeumorphicLayer, cbTileShadow, cbModalShadow } from '../components/NeumorphicTexture';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = { user: AuthUser; onBack: () => void };

function numberValue(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asList(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function weakAreaList(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return ['critical', 'moderate', 'minor']
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
  const [stats, setStats] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [weekly, setWeekly] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const [statsData, analyticsData, weeklyData, insightData] = await Promise.all([
        getEnhancedStats(user.username).catch(() => null),
        getLearningAnalytics(user.username).catch(() => null),
        getWeeklyProgress(user.username).catch(() => null),
        getStrengthsWeaknesses(user.username).catch(() => null),
      ]);
      setStats(statsData);
      setAnalytics(analyticsData);
      setWeekly(weeklyData);
      setInsights(insightData);
    } catch (error) {
      Alert.alert('Analytics', error instanceof Error ? error.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.username]);

  useEffect(() => { load(); }, [load]);

  if (!fontsLoaded) return null;

  const totalMinutes = numberValue(analytics?.total_time_minutes);
  const weeklyHours = numberValue(stats?.weeklyHours, numberValue(stats?.hours));
  const totalQuestions = numberValue(analytics?.total_questions);
  const accuracy = numberValue(analytics?.accuracy_percentage, numberValue(stats?.averageAccuracy));
  const dailyRows = asList(weekly?.daily_breakdown || analytics?.daily_data).slice(-7);
  const strengths = asList(insights?.strengths || insights?.top_strengths || insights?.summary?.strengths).slice(0, 4);
  const weaknesses = [
    ...asList(insights?.weaknesses || insights?.top_weaknesses || insights?.summary?.weaknesses),
    ...weakAreaList(insights?.weak_areas),
  ].slice(0, 4);

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <AmbientBubbles theme={selectedTheme} variant="profile" opacity={0.72} />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={selectedTheme.accent} />}
      >
        <View style={s.topBar}>
          <HapticTouchable style={s.iconBtn} onPress={onBack} haptic="light">
            <Ionicons name="chevron-back" size={18} color={selectedTheme.accent} />
          </HapticTouchable>
          <Text style={s.topMeta}>this week</Text>
        </View>

        <View style={s.hero}>
          <NeumorphicLayer grainOpacity={0.12} />
          <Text style={s.heroGhost}>01</Text>
          <Text style={s.heroTitle}>analytics</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 44 }} />
        ) : (
          <>
            <View style={s.metricGrid}>
              <MetricCard label="streak" value={String(numberValue(stats?.streak))} suffix="days" styles={s} />
              <MetricCard label="focus" value={weeklyHours ? weeklyHours.toFixed(1) : (totalMinutes / 60).toFixed(1)} suffix="hrs" styles={s} />
              <MetricCard label="questions" value={String(totalQuestions || numberValue(stats?.weeklyInteractions))} suffix="answered" styles={s} />
              <MetricCard label="accuracy" value={String(Math.round(accuracy || 0))} suffix="%" styles={s} />
            </View>

            <View style={s.section}>
              <Text style={s.sectionTitle}>weekly rhythm</Text>
              <View style={s.bars}>
                {dailyRows.length > 0 ? dailyRows.map((row, index) => {
                  const value = numberValue(row?.questions_answered, numberValue(row?.ai_chats) + numberValue(row?.notes_created) + numberValue(row?.flashcards_reviewed));
                  const height = Math.max(8, Math.min(78, value * 9));
                  const label = String(row?.day || row?.date || `d${index + 1}`).slice(0, 3);
                  return (
                    <View key={`${label}-${index}`} style={s.barWrap}>
                      <View style={[s.bar, { height }]} />
                      <Text style={s.barLabel}>{label}</Text>
                    </View>
                  );
                }) : (
                  <Text style={s.emptyInline}>no weekly activity data yet</Text>
                )}
              </View>
            </View>

            <View style={s.duo}>
              <InsightList title="strengths" icon="trending-up-outline" items={strengths} styles={s} />
              <InsightList title="weak spots" icon="warning-outline" items={weaknesses} styles={s} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function MetricCard({ label, value, suffix, styles }: { label: string; value: string; suffix: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricSuffix}>{suffix}</Text>
    </View>
  );
}

function InsightList({
  title,
  icon,
  items,
  styles,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  items: any[];
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.insightCard}>
      <View style={styles.insightTitleRow}>
        <Ionicons name={icon} size={16} color={styles.iconColor.color} />
        <Text style={styles.insightTitle}>{title}</Text>
      </View>
      {items.length > 0 ? items.map((item, index) => {
        const label = String(item?.topic || item?.title || item?.name || item?.label || item || '').trim();
        const detail = String(item?.detail || (item?.accuracy !== undefined ? `${item.accuracy}% accuracy` : item?.description || '')).trim();
        return (
          <View key={`${label}-${index}`} style={styles.insightRow}>
            <Text style={styles.insightItem} numberOfLines={1}>{label || 'topic'}</Text>
            {!!detail && <Text style={styles.insightDetail} numberOfLines={1}>{detail}</Text>}
          </View>
        );
      }) : (
        <Text style={styles.emptyInline}>practice more to unlock this</Text>
      )}
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>, topInset: number) {
  const surface = theme.panel;
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.16 : 0.18);
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 18, paddingTop: Math.max(topInset + 12, 52), paddingBottom: 118, gap: 14 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    topMeta: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
    iconBtn: { width: 40, height: 40, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), alignItems: 'center', justifyContent: 'center', boxShadow: cbTileShadow(0.06) },
    hero: { borderRadius: 30, padding: 20, overflow: 'hidden', boxShadow: cbModalShadow(0.14) } as ViewStyle,
    heroGhost: { position: 'absolute', right: 15, top: 0, fontFamily: 'Inter_900Black', fontSize: layout.isTablet ? 92 : 76, lineHeight: layout.isTablet ? 98 : 82, color: rgbaFromHex(theme.textPrimary, theme.isLight ? 0.035 : 0.055), letterSpacing: -4 },
    eyebrow: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase' },
    heroTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 38, letterSpacing: 0, marginTop: 8 },
    heroCopy: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13, marginTop: 4 },
    metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    metricCard: { width: layout.twoColumn ? '23.5%' : '47.8%', minWidth: 142, flexGrow: 1, borderRadius: 20, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 15, boxShadow: cbTileShadow(0.055) } as ViewStyle,
    metricValue: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 32, letterSpacing: 0 },
    metricLabel: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 12, marginTop: 2 },
    metricSuffix: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, marginTop: 1 },
    section: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 16, gap: 15, boxShadow: cbTileShadow(0.08) } as ViewStyle,
    sectionTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 18 },
    bars: { minHeight: 112, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
    barWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 7 },
    bar: { width: '100%', maxWidth: 30, borderRadius: 6, backgroundColor: theme.accentHover },
    barLabel: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, textTransform: 'uppercase' },
    duo: { flexDirection: layout.twoColumn ? 'row' : 'column', gap: 12 },
    insightCard: { flex: 1, borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 16, gap: 12, boxShadow: cbTileShadow(0.08) } as ViewStyle,
    insightTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    insightTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 17 },
    insightRow: { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
    insightItem: { fontFamily: 'Inter_700Bold', color: theme.accentHover, fontSize: 13 },
    insightDetail: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, marginTop: 2 },
    emptyInline: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13 },
    iconColor: { color: theme.accentHover },
  });
}
