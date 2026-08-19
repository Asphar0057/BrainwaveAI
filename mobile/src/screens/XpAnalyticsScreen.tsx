import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, ViewStyle, RefreshControl, ActivityIndicator } from 'react-native';
import { PAST_WEEK_COUNT, weekChipLabel } from '../utils/xpWeeks';

import { SafeAreaView } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthUser } from '../services/auth';
import { getXpHistory, XpHistory, XpSource } from '../services/api';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import XpLineChart from '../components/XpLineChart';
import { NeumorphicLayer, cbTileShadow, cbModalShadow } from '../components/NeumorphicTexture';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = { user: AuthUser; onBack: () => void; onOpenAchievements?: () => void };
type Period = 'week' | 'month' | 'year';
type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: 'week' },
  { key: 'month', label: 'month' },
  { key: 'year', label: 'year' },
];

const PERIOD_COPY: Record<Period, string> = {
  week: 'last 7 days',
  month: 'last 30 days',
  year: 'last 12 months',
};

const SOURCE_ICONS: Record<string, IoniconsName> = {
  'AI Chat': 'sparkles-outline',
  'Notes': 'document-text-outline',
  'Flashcards Created': 'layers-outline',
  'Flashcard Review': 'repeat-outline',
  'Flashcard Mastery': 'ribbon-outline',
  'Quizzes': 'trophy-outline',
  'Practice Questions': 'help-circle-outline',
  'Study Time': 'time-outline',
  'Battles': 'flash-outline',
  'Solo Quizzes': 'person-outline',
  'Learning Paths': 'map-outline',
};

function sourceIcon(label: string): IoniconsName {
  return SOURCE_ICONS[label] ?? 'ellipse-outline';
}

export default function XpAnalyticsScreen({ user, onBack, onOpenAchievements }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });

  const [period, setPeriod] = useState<Period>('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState<XpHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chartWidth, setChartWidth] = useState(0);

  const load = useCallback((nextPeriod: Period, nextWeekOffset: number) => {
    getXpHistory(user.username, nextPeriod, nextWeekOffset)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [user.username]);

  useEffect(() => {
    setLoading(true);
    load(period, weekOffset);
  }, [period, weekOffset, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(period, weekOffset);
  };

  const selectPeriod = (nextPeriod: Period) => {
    setPeriod(nextPeriod);
    setWeekOffset(0);
  };

  if (!fontsLoaded) return null;

  const totalXp = data?.total_xp ?? 0;
  const deltaPercent = data?.delta_percent ?? 0;
  const points = data?.points ?? [];
  const bySource: XpSource[] = data?.by_source ?? [];
  const maxSourceXp = Math.max(1, ...bySource.map((entry) => entry.xp));

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFill} />
      <GeoBackground />

      <View style={s.topBar}>
        <HapticTouchable onPress={onBack} style={s.iconBtn} haptic="light">
          <Ionicons name="chevron-back" size={18} color={selectedTheme.accent} />
        </HapticTouchable>
        <Text style={s.topTitle}>xp analytics</Text>
        {onOpenAchievements ? (
          <HapticTouchable onPress={onOpenAchievements} style={s.iconBtn} haptic="light" accessibilityLabel="Achievements">
            <Ionicons name="trophy-outline" size={18} color={selectedTheme.accent} />
          </HapticTouchable>
        ) : (
          <View style={s.iconBtnGhost} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={selectedTheme.accent} />}
      >
        <View style={s.periodRow}>
          {PERIODS.map((p) => {
            const active = p.key === period;
            return (
              <HapticTouchable
                key={p.key}
                style={[s.periodBtn, active && s.periodBtnActive]}
                onPress={() => selectPeriod(p.key)}
                haptic="selection"
                activeOpacity={0.85}
              >
                <Text style={[s.periodLabel, active && s.periodLabelActive]}>{p.label}</Text>
              </HapticTouchable>
            );
          })}
        </View>

        {period === 'week' ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.weekPickerRow}
          >
            {Array.from({ length: PAST_WEEK_COUNT + 1 }, (_, offset) => offset).map((offset) => {
              const active = offset === weekOffset;
              return (
                <HapticTouchable
                  key={offset}
                  style={[s.weekChip, active && s.weekChipActive]}
                  onPress={() => setWeekOffset(offset)}
                  haptic="selection"
                  activeOpacity={0.85}
                >
                  <Text style={[s.weekChipLabel, active && s.weekChipLabelActive]}>{weekChipLabel(offset)}</Text>
                </HapticTouchable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={s.hero}>
          <NeumorphicLayer grainOpacity={0.26} />
          <Text style={s.heroGhost}>xp</Text>
          <Text style={s.eyebrow}>
            {period === 'week'
              ? (weekOffset === 0 ? PERIOD_COPY.week : weekChipLabel(weekOffset))
              : PERIOD_COPY[period]}
          </Text>
          <View style={s.heroValueRow}>
            <Text style={s.heroTitle}>{loading ? '—' : totalXp}</Text>
            {!loading && deltaPercent !== 0 ? (
              <View style={[s.deltaChip, deltaPercent > 0 ? s.deltaChipUp : s.deltaChipDown]}>
                <Ionicons name={deltaPercent > 0 ? 'trending-up' : 'trending-down'} size={12} color={deltaPercent > 0 ? '#6FCF97' : '#EB5757'} />
                <Text style={[s.deltaChipText, { color: deltaPercent > 0 ? '#6FCF97' : '#EB5757' }]}>
                  {deltaPercent > 0 ? '+' : ''}{deltaPercent}%
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={s.heroCopy}>
            {period === 'week' ? 'vs. the week before' : `vs. the previous ${period === 'month' ? '30 days' : '12 months'}`}
          </Text>
        </View>

        <View style={s.chartCard}>
          <Text style={s.sectionTitle}>xp over time</Text>
          <View style={s.chartWrap} onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
            {chartWidth > 0 && !loading ? (
              <XpLineChart
                points={points.map((p) => ({ label: p.label, xp: p.xp }))}
                width={chartWidth}
                height={168}
                color={selectedTheme.accentHover}
                labelColor={selectedTheme.textSecondary}
                maxLabels={period === 'week' ? 7 : period === 'year' ? 12 : 8}
              />
            ) : (
              <View style={s.chartLoading}>
                <ActivityIndicator color={selectedTheme.accent} />
              </View>
            )}
          </View>
        </View>

        <View style={s.breakdownSection}>
          <Text style={s.sectionTitle}>where it came from</Text>
          {loading ? (
            <ActivityIndicator color={selectedTheme.accent} style={{ marginTop: 24 }} />
          ) : bySource.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="bar-chart-outline" size={26} color={selectedTheme.textSecondary} />
              <Text style={s.emptyText}>No XP earned in this period yet</Text>
            </View>
          ) : (
            <View style={s.sourceList}>
              {bySource.map((entry) => (
                <View key={entry.label} style={s.sourceRow}>
                  <View style={s.sourceIconWrap}>
                    <Ionicons name={sourceIcon(entry.label)} size={16} color={selectedTheme.accentHover} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.sourceTopRow}>
                      <Text style={s.sourceLabel}>{entry.label}</Text>
                      <Text style={s.sourceXp}>+{entry.xp} xp</Text>
                    </View>
                    <View style={s.sourceRail}>
                      <View style={[s.sourceRailFill, { width: `${Math.max(4, (entry.xp / maxSourceXp) * 100)}%` }]} />
                    </View>
                    <Text style={s.sourceMeta}>{entry.count} {entry.count === 1 ? 'activity' : 'activities'} · {entry.percent}% of total</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const border = rgbaFromHex(theme.border, 1);
  const surface = theme.panel;

  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: 'transparent' },
    scroll: {
      width: '100%',
      maxWidth: layout.contentMaxWidth,
      alignSelf: 'center',
      paddingHorizontal: 4,
      paddingBottom: 40,
      gap: 16,
    },
    topBar: {
      width: '100%',
      maxWidth: layout.contentMaxWidth,
      alignSelf: 'center',
      paddingHorizontal: 4,
      paddingTop: 10,
      paddingBottom: 6,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    iconBtn: {
      width: 40, height: 40, borderRadius: 16,
      borderWidth: 1, borderColor: border,
      backgroundColor: rgbaFromHex(surface, 0.72),
      alignItems: 'center', justifyContent: 'center',
      boxShadow: cbTileShadow(0.06),
    } as ViewStyle,
    iconBtnGhost: { width: 40, height: 40 },
    topTitle: {
      fontFamily: 'Inter_900Black',
      fontSize: 15,
      color: theme.accentHover,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    periodRow: {
      flexDirection: 'row',
      borderRadius: 16,
      backgroundColor: rgbaFromHex(surface, 0.6),
      borderWidth: 1,
      borderColor: border,
      padding: 4,
      gap: 4,
    },
    periodBtn: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 12,
      alignItems: 'center',
    },
    periodBtnActive: {
      backgroundColor: theme.accent,
    },
    periodLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: theme.textSecondary,
    },
    periodLabelActive: {
      color: theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary,
    },
    weekPickerRow: {
      gap: 8,
      paddingHorizontal: 4,
    },
    weekChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: rgbaFromHex(surface, 0.6),
      borderWidth: 1,
      borderColor: border,
    },
    weekChipActive: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    weekChipLabel: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      letterSpacing: 0.3,
      color: theme.textSecondary,
      textTransform: 'lowercase',
    },
    weekChipLabelActive: {
      color: theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary,
    },
    hero: { borderRadius: 26, padding: 20, overflow: 'hidden', boxShadow: cbModalShadow(0.14) } as ViewStyle,
    heroGhost: {
      position: 'absolute',
      right: 14,
      top: -6,
      fontFamily: 'Inter_900Black',
      fontSize: 84,
      lineHeight: 90,
      color: rgbaFromHex(theme.textPrimary, theme.isLight ? 0.035 : 0.055),
      letterSpacing: -4,
      textTransform: 'uppercase',
    },
    eyebrow: {
      fontFamily: 'Inter_700Bold',
      color: theme.textSecondary,
      fontSize: 10,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
    },
    heroValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 6,
    },
    heroTitle: {
      fontFamily: 'Inter_900Black',
      color: theme.accentHover,
      fontSize: 42,
      letterSpacing: -1,
    },
    deltaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
    },
    deltaChipUp: { backgroundColor: 'rgba(111, 207, 151, 0.14)' },
    deltaChipDown: { backgroundColor: 'rgba(235, 87, 87, 0.14)' },
    deltaChipText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
    heroCopy: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, marginTop: 4 },
    chartCard: {
      borderRadius: 24,
      padding: 18,
      backgroundColor: rgbaFromHex(surface, 0.72),
      borderWidth: 1,
      borderColor: border,
      boxShadow: cbTileShadow(0.055),
    } as ViewStyle,
    sectionTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      color: theme.accentHover,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
    },
    chartWrap: { marginTop: 12 },
    chartLoading: { height: 168, alignItems: 'center', justifyContent: 'center' },
    breakdownSection: {
      borderRadius: 24,
      padding: 18,
      backgroundColor: rgbaFromHex(surface, 0.72),
      borderWidth: 1,
      borderColor: border,
      boxShadow: cbTileShadow(0.055),
      gap: 14,
    } as ViewStyle,
    emptyWrap: { alignItems: 'center', gap: 10, paddingVertical: 24 },
    emptyText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.textSecondary },
    sourceList: { gap: 16, marginTop: 4 },
    sourceRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    sourceIconWrap: {
      width: 32, height: 32, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: rgbaFromHex(theme.accent, theme.isLight ? 0.12 : 0.16),
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.18 : 0.22),
      marginTop: 2,
    },
    sourceTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    sourceLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: theme.textPrimary },
    sourceXp: { fontFamily: 'Inter_700Bold', fontSize: 13, color: theme.accentHover },
    sourceRail: {
      height: 5, borderRadius: 3, marginTop: 6,
      backgroundColor: rgbaFromHex(theme.border, 1),
      overflow: 'hidden',
    },
    sourceRailFill: { height: '100%', borderRadius: 3, backgroundColor: theme.accent },
    sourceMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, color: theme.textSecondary, marginTop: 5, letterSpacing: 0.3 },
  });
}
