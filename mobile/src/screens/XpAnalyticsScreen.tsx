import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, ScrollView, StyleSheet, Text, View, ViewStyle, RefreshControl, ActivityIndicator } from 'react-native';
import { PAST_WEEK_COUNT, weekDateRangeLabel } from '../utils/xpWeeks';

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

type Props = {
  user: AuthUser;
  onBack: () => void;
  onOpenAchievements?: () => void;
  onOpenHistory?: () => void;
};
type MenuKey = 'overview' | 'history' | 'achievements' | 'weeks';
type Period = 'week' | 'month' | 'year' | 'all';
type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: 'week' },
  { key: 'month', label: 'month' },
  { key: 'year', label: 'year' },
  { key: 'all', label: 'all' },
];

const PERIOD_COPY: Record<Period, string> = {
  week: 'last 7 days',
  month: 'last 30 days',
  year: 'last 12 months',
  all: 'all time',
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

export default function XpAnalyticsScreen({ user, onBack, onOpenAchievements, onOpenHistory }: Props) {
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

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarWidth = Math.min(layout.width * (layout.isLandscape ? 0.42 : 0.8), 340);
  const slideAnim = useRef(new Animated.Value(-sidebarWidth)).current;

  const openSidebar = () => {
    setSidebarOpen(true);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 100, friction: 14 }).start();
  };
  const closeSidebar = () => {
    Animated.timing(slideAnim, { toValue: -sidebarWidth, duration: 200, useNativeDriver: true }).start(() => setSidebarOpen(false));
  };

  const [weeksOpen, setWeeksOpen] = useState(false);
  const weeksSlideAnim = useRef(new Animated.Value(layout.width)).current;

  const openWeeks = () => {
    setWeeksOpen(true);
    Animated.spring(weeksSlideAnim, { toValue: 0, useNativeDriver: true, tension: 100, friction: 14 }).start();
  };
  const closeWeeks = () => {
    Animated.timing(weeksSlideAnim, { toValue: layout.width, duration: 200, useNativeDriver: true }).start(() => setWeeksOpen(false));
  };

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
        <HapticTouchable onPress={onBack} style={{ marginRight: 12 }} haptic="light">
          <Ionicons name="chevron-back" size={22} color={selectedTheme.accent} />
        </HapticTouchable>
        <View style={{ flex: 1 }}>
          <Text style={s.topTitle}>xp analytics</Text>
        </View>
        <HapticTouchable onPress={openSidebar} haptic="selection" accessibilityLabel="Open menu">
          <Ionicons name="menu-outline" size={24} color={selectedTheme.accent} />
        </HapticTouchable>
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

        <View style={s.hero}>
          <NeumorphicLayer grainOpacity={0.26} />
          <Text style={s.heroGhost}>xp</Text>
          <Text style={s.eyebrow}>{PERIOD_COPY[period]}</Text>
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
            {period === 'week' ? 'vs. the week before'
              : period === 'all' ? 'total XP earned since day one'
              : `vs. the previous ${period === 'month' ? '30 days' : '12 months'}`}
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
                maxLabels={period === 'week' ? 7 : (period === 'year' || period === 'all') ? 12 : 8}
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

      <XpMenuSidebar
        visible={sidebarOpen}
        sidebarWidth={sidebarWidth}
        slideAnim={slideAnim}
        onClose={closeSidebar}
        onHistory={onOpenHistory}
        onAchievements={onOpenAchievements}
        onWeeks={openWeeks}
      />

      <XpWeeksPanel
        visible={weeksOpen}
        width={layout.width}
        slideAnim={weeksSlideAnim}
        onClose={closeWeeks}
        weekOffset={weekOffset}
        onSelect={(offset) => {
          setPeriod('week');
          setWeekOffset(offset);
          closeWeeks();
        }}
      />
    </SafeAreaView>
  );
}

// Hamburger-menu sidebar for the XP analytics page — mirrors the sliding
// panel pattern from FlashcardsScreen's menu (Modal + Animated translateX)
// so the two feel like the same app, with "history" (the recent XP activity
// feed) as its own full page instead of being crammed into this scroll view.
function XpMenuSidebar({
  visible,
  sidebarWidth,
  slideAnim,
  onClose,
  onHistory,
  onAchievements,
  onWeeks,
}: {
  visible: boolean;
  sidebarWidth: number;
  slideAnim: Animated.Value;
  onClose: () => void;
  onHistory?: () => void;
  onAchievements?: () => void;
  onWeeks?: () => void;
}) {
  const { selectedTheme: theme } = useAppTheme();
  const s = useMemo(() => createSidebarStyles(theme), [theme]);
  if (!visible) return null;

  const items: { key: MenuKey; label: string; icon: IoniconsName; iconActive: IoniconsName; onPress?: () => void }[] = [
    { key: 'overview', label: 'Overview', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
    { key: 'weeks', label: 'Weeks', icon: 'calendar-outline', iconActive: 'calendar', onPress: onWeeks },
    { key: 'history', label: 'History', icon: 'time-outline', iconActive: 'time', onPress: onHistory },
    { key: 'achievements', label: 'Achievements', icon: 'trophy-outline', iconActive: 'trophy', onPress: onAchievements },
  ];

  return (
    <Modal transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        <HapticTouchable style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} haptic="none" />
        <Animated.View style={[s.panel, { width: sidebarWidth, transform: [{ translateX: slideAnim }] }]}>
          <LinearGradient
            colors={[darkenColor(theme.bgTop, theme.isLight ? 4 : 0), theme.panelAlt, theme.bgPrimary]}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView style={{ flex: 1, paddingBottom: 6 }} edges={['top', 'bottom']}>
            <View style={s.hero}>
              <NeumorphicLayer grainOpacity={0.22} />
              <Text style={s.heroTitle}>xp</Text>
              <Text style={s.heroSub}>analytics menu</Text>
            </View>

            <View style={s.menu}>
              {items.map((item) => {
                const active = item.key === 'overview';
                return active ? (
                  <View key={item.key} style={[s.card, s.cardActive]}>
                    <View style={s.row}>
                      <View style={[s.iconWrap, s.iconWrapActive]}>
                        <Ionicons name={item.iconActive} size={16} color={theme.bgPrimary} />
                      </View>
                      <Text style={[s.label, s.labelActive]}>{item.label}</Text>
                      <View style={s.activeDot} />
                    </View>
                  </View>
                ) : (
                  <HapticTouchable
                    key={item.key}
                    style={s.card}
                    onPress={() => { onClose(); item.onPress?.(); }}
                    haptic="selection"
                    activeOpacity={0.85}
                    disabled={!item.onPress}
                  >
                    <View style={s.row}>
                      <View style={s.iconWrap}>
                        <Ionicons name={item.icon} size={16} color={theme.accentHover} />
                      </View>
                      <Text style={s.label}>{item.label}</Text>
                      <Ionicons name="chevron-forward" size={15} color={theme.textSecondary} />
                    </View>
                  </HapticTouchable>
                );
              })}
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// Dedicated full-page week list, opened from the hamburger menu's "Weeks"
// item instead of a picker crammed onto the main scroll view. Slides in from
// the right (the hamburger sidebar slides from the left) so the two read as
// separate, distinct panels.
function XpWeeksPanel({
  visible,
  width,
  slideAnim,
  onClose,
  weekOffset,
  onSelect,
}: {
  visible: boolean;
  width: number;
  slideAnim: Animated.Value;
  onClose: () => void;
  weekOffset: number;
  onSelect: (offset: number) => void;
}) {
  const { selectedTheme: theme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createWeeksStyles(theme, layout), [theme, layout]);
  if (!visible) return null;

  const weeks = Array.from({ length: PAST_WEEK_COUNT + 1 }, (_, offset) => offset);

  return (
    <Modal transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Animated.View style={[s.panel, { width, transform: [{ translateX: slideAnim }] }]}>
          <LinearGradient colors={[theme.bgTop, theme.bgPrimary, theme.bgBottom]} style={StyleSheet.absoluteFillObject} />
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
            <View style={s.header}>
              <HapticTouchable style={s.iconBtn} onPress={onClose} haptic="light" accessibilityLabel="Close">
                <Ionicons name="chevron-back" size={20} color={theme.accentHover} />
              </HapticTouchable>
              <Text style={s.title}>weeks</Text>
            </View>
            <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
              {weeks.map((offset) => {
                const active = offset === weekOffset;
                return (
                  <HapticTouchable
                    key={offset}
                    style={[s.row, active && s.rowActive]}
                    onPress={() => onSelect(offset)}
                    haptic="selection"
                    activeOpacity={0.85}
                  >
                    <Text style={[s.rowLabel, active && s.rowLabelActive]}>{weekDateRangeLabel(offset)}</Text>
                    {active ? <Ionicons name="checkmark-circle" size={18} color={theme.accentHover} /> : null}
                  </HapticTouchable>
                );
              })}
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
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
      paddingHorizontal: 10,
      paddingTop: 18,
      paddingBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    topTitle: {
      fontFamily: 'Inter_900Black',
      fontSize: 32,
      color: theme.accentHover,
      letterSpacing: -0.8,
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
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
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

function createSidebarStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.2 : 0.31);
  return StyleSheet.create({
    overlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.58)' },
    panel: {
      height: '100%', borderRightWidth: 1, borderRightColor: border,
      overflow: 'hidden', boxShadow: cbModalShadow(0.2),
    },
    hero: {
      marginHorizontal: 14, marginTop: 12, marginBottom: 14,
      borderRadius: 22, padding: 16, overflow: 'hidden',
      boxShadow: cbModalShadow(0.14),
    } as ViewStyle,
    heroTitle: { fontFamily: 'Inter_900Black', fontSize: 22, color: theme.accentHover, letterSpacing: -0.5 },
    heroSub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.textSecondary, marginTop: 3 },

    menu: { paddingHorizontal: 10, gap: 4 },
    card: { borderRadius: 16, overflow: 'hidden' },
    cardActive: { backgroundColor: rgbaFromHex(theme.accent, 0.14) },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12 },
    iconWrap: {
      width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
      backgroundColor: rgbaFromHex(theme.accent, theme.isLight ? 0.12 : 0.18), borderWidth: 1, borderColor: border,
    },
    iconWrapActive: { backgroundColor: theme.accentHover, borderColor: theme.accentHover },
    label: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14, color: theme.accentHover },
    labelActive: { color: theme.accentHover, fontFamily: 'Inter_700Bold' },
    activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.accentHover },
  });
}

function createWeeksStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.18 : 0.2);
  const surface = theme.panel;
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: theme.bgPrimary },
    panel: { height: '100%' },
    header: {
      width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center',
      paddingHorizontal: 4, paddingTop: 10, paddingBottom: 6,
      flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    iconBtn: {
      width: 40, height: 40, borderRadius: 16,
      borderWidth: 1, borderColor: border,
      backgroundColor: rgbaFromHex(surface, 0.72),
      alignItems: 'center', justifyContent: 'center',
      boxShadow: cbTileShadow(0.06),
    } as ViewStyle,
    title: {
      fontFamily: 'Inter_900Black', fontSize: 15, color: theme.accentHover,
      letterSpacing: 0.4, textTransform: 'uppercase',
    },
    list: {
      width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center',
      paddingHorizontal: 4, paddingTop: 12, paddingBottom: 40, gap: 8,
    },
    row: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      borderRadius: 16, paddingHorizontal: 16, paddingVertical: 15,
      backgroundColor: rgbaFromHex(surface, 0.72), borderWidth: 1, borderColor: border,
      boxShadow: cbTileShadow(0.05),
    } as ViewStyle,
    rowActive: { backgroundColor: rgbaFromHex(theme.accent, theme.isLight ? 0.12 : 0.16), borderColor: theme.accentHover },
    rowLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: theme.textPrimary },
    rowLabelActive: { color: theme.accentHover, fontFamily: 'Inter_700Bold' },
  });
}
