import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Animated, PanResponder, Easing, useWindowDimensions, ViewStyle, AppState } from 'react-native';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import RingProgress from '../components/RingProgress';
import HapticTouchable from '../components/HapticTouchable';
import GeoBackground from '../components/GeoBackground';
import NeumorphicTexture, { cbCardGradient, cbTileShadow, cbTileCardGradient, cbTileShadowExact, cbTileBorder } from '../components/NeumorphicTexture';
import CerbylMark from '../components/CerbylMark';
import XpLineChart from '../components/XpLineChart';
import { AuthUser } from '../services/auth';
import { getEnhancedStats, getFriendActivityFeed, getXpHistory, XpHistory } from '../services/api';
import { triggerHaptic } from '../utils/haptics';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
const AnimatedView = Animated.createAnimatedComponent(View);

type HomeTarget = 'flashcards' | 'notes' | 'aimedia' | 'questionBank' | 'knowledgeMaps' | 'knowledgeHub' | 'slideExplorer' | 'canvasHub' | 'analytics' | 'xpAnalytics' | 'weaknessPractice' | 'learningPaths';
type Props = {
  user: AuthUser;
  onNavigate?: (screen: HomeTarget) => void;
  onNavigateToAI?: () => void;
  onSwipeLeftPage?: () => void;
  onSwipeRightPage?: () => void;
};

type Stats = {
  streak: number;
  hours: number;
  minutes?: number;
  totalChatSessions: number;
  totalFlashcards: number;
  totalNotes: number;
  weeklyHours?: number;
  weeklyMinutes?: number;
  todayMinutes?: number;
  weeklyInteractions?: number;
  weeklyMastered?: number;
};

// Under an hour: whole minutes ("42 min"). An hour or more: decimal hours in tenths
// ("1.1 hrs", "1.2 hrs", ... "2.0 hrs"), i.e. exact minutes/60 rather than a rounded hour count.
function formatStudyDuration(minutes: number): { value: string; unit: string } {
  const safeMinutes = Math.max(0, minutes);
  if (safeMinutes < 60) {
    return { value: String(Math.round(safeMinutes)), unit: safeMinutes === 1 ? 'min' : 'mins' };
  }
  return { value: (safeMinutes / 60).toFixed(1), unit: 'hrs' };
}

/**
 * A periodically-refetched minute counter plus a local "ticks up between fetches" estimate
 * can visibly regress: the backend only commits new minutes when a session actually flushes
 * (backgrounding or a heartbeat), and a background-transition flush is a fire-and-forget
 * fetch() that can get cut off mid-flight when the OS suspends the app. If the next
 * foreground re-fetch lands before that flush lands, the server briefly reports fewer
 * minutes than what was already on screen — the number visibly jumps backward. This ratchets
 * the displayed value so it only ever moves forward within the same `resetKey` (e.g. today's
 * date), and only drops when the key itself changes (a real day/week boundary).
 */
function useMonotonicMinutes(candidateMinutes: number, resetKey: string): number {
  const floorRef = useRef(0);
  const keyRef = useRef(resetKey);
  if (keyRef.current !== resetKey) {
    keyRef.current = resetKey;
    floorRef.current = 0;
  }
  floorRef.current = Math.max(floorRef.current, candidateMinutes);
  return floorRef.current;
}

export default function HomeScreen({ user, onNavigate, onNavigateToAI, onSwipeLeftPage, onSwipeRightPage }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const { height: windowHeight } = useWindowDimensions();
  const styles = useMemo(() => createStyles(selectedTheme, layout, windowHeight), [selectedTheme, layout, windowHeight]);
  const canSwipeBetweenPages = !layout.sideRailTabs;
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold });
  const [stats, setStats] = useState<Stats | null>(null);
  const [xpHistory, setXpHistory] = useState<XpHistory | null>(null);
  const [xpChartWidth, setXpChartWidth] = useState(0);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const heroSwap = useRef(new Animated.Value(1)).current;
  const heroAnimating = useRef(false);
  const cycleHeroRef = useRef<() => void>(() => {});

  const pageSwipeResponder = useMemo(() => (
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        canSwipeBetweenPages && Math.abs(gestureState.dx) > 14 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onMoveShouldSetPanResponderCapture: (_, gestureState) =>
        canSwipeBetweenPages && Math.abs(gestureState.dx) > 14 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderRelease: (_, gestureState) => {
        if (!canSwipeBetweenPages) return;
        if (Math.abs(gestureState.dx) < 36 || Math.abs(gestureState.dx) <= Math.abs(gestureState.dy)) return;
        if (gestureState.dx < 0) {
          onSwipeLeftPage?.();
          return;
        }
        onSwipeRightPage?.();
      },
      onPanResponderTerminationRequest: () => false,
    })
  ), [canSwipeBetweenPages, onSwipeLeftPage, onSwipeRightPage]);

  const heroSwipeResponder = useMemo(() => (
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 18 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onMoveShouldSetPanResponderCapture: (_, gestureState) =>
        Math.abs(gestureState.dx) > 18 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderRelease: (_, gestureState) => {
        const isSwipe = Math.abs(gestureState.dx) > 34 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        if (isSwipe) cycleHeroRef.current();
      },
      onShouldBlockNativeResponder: () => false,
    })
  ), []);

  const statsFetchedAt = useRef<number>(Date.now());
  const [liveTick, setLiveTick] = useState(Date.now());

  const loadStats = useCallback(() => {
    getEnhancedStats(user.username).then((data) => {
      setStats(data);
      statsFetchedAt.current = Date.now();
      setLiveTick(Date.now());
    }).catch(() => {});
  }, [user.username]);

  const loadXp = useCallback(() => {
    getXpHistory(user.username, 'week').then(setXpHistory).catch(() => {});
  }, [user.username]);

  useEffect(() => {
    loadStats();
    loadXp();
    getFriendActivityFeed(user.username).then((data) => {
      const list = Array.isArray(data) ? data : data?.activities ?? data?.feed ?? [];
      setRecentActivity(list.slice(0, 4));
    }).catch(() => {});
  }, [user.username, loadStats, loadXp]);

  // Study time otherwise only changes when the backend flushes a session (background
  // or a 5-minute heartbeat, see useSessionTracking) — tick locally between fetches so
  // the number visibly climbs while the app is open, and resync from the server on
  // every foreground return so it never drifts from what actually got recorded.
  useEffect(() => {
    const tick = setInterval(() => setLiveTick(Date.now()), 15000);
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        loadStats();
        loadXp();
      }
    });
    return () => {
      clearInterval(tick);
      subscription.remove();
    };
  }, [loadStats, loadXp]);

  const streak = stats?.streak ?? 0;
  const GOLD_L = selectedTheme.accentHover;
  const GOLD_MID = selectedTheme.accent;
  const GOLD_SOFT = selectedTheme.textPrimary;
  const accentDark = darkenColor(selectedTheme.accent, selectedTheme.isLight ? 16 : 34);
  const todayDateKey = new Date().toDateString();
  const elapsedSinceFetch = Math.max(0, (liveTick - statsFetchedAt.current) / 60000);

  const baseWeeklyMinutes = stats?.weeklyMinutes ?? (stats?.weeklyHours ?? stats?.hours ?? 0) * 60;
  const weeklyMinutes = useMonotonicMinutes(baseWeeklyMinutes + elapsedSinceFetch, todayDateKey);
  const weeklyHours = weeklyMinutes / 60;
  const studyDuration = formatStudyDuration(weeklyMinutes);

  const baseTodayMinutes = stats?.todayMinutes ?? 0;
  const todayMinutes = useMonotonicMinutes(baseTodayMinutes + elapsedSinceFetch, todayDateKey);
  const todayStudyDuration = formatStudyDuration(todayMinutes);
  const weeklyInteractions = stats?.weeklyInteractions ?? stats?.totalChatSessions ?? 0;
  const weeklyMastered = stats?.weeklyMastered ?? stats?.totalFlashcards ?? 0;
  const weeklyXp = xpHistory?.total_xp ?? 0;
  const xpDeltaPercent = xpHistory?.delta_percent ?? 0;
  const totalChats = stats?.totalChatSessions ?? 0;
  const totalFlashcards = stats?.totalFlashcards ?? 0;
  const totalNotes = stats?.totalNotes ?? 0;
  const todayProgress =
    Math.min(
      99,
      Math.round(((Math.min(weeklyHours / 4, 1) + Math.min(weeklyInteractions / 8, 1) + Math.min(weeklyMastered / 6, 1)) / 3) * 100)
    ) || 0;

  const hour = new Date().getHours();

  const heroSlides = [
    { key: 'streak', eyebrow: 'daily signal', title: 'streak', value: String(streak), unit: 'days active', subcopy: 'keep the chain alive', accent: GOLD_L },
    { key: 'hours', eyebrow: 'focus depth', title: 'study time', value: studyDuration.value, unit: `${studyDuration.unit} this week`, subcopy: 'time invested in real work', accent: GOLD_L },
    { key: 'chat', eyebrow: 'thinking loop', title: 'ai chats', value: String(totalChats), unit: 'total sessions', subcopy: 'questions, iterations, answers', accent: GOLD_MID },
    { key: 'flashcards', eyebrow: 'memory system', title: 'flashcards', value: String(totalFlashcards), unit: 'cards created', subcopy: 'repeat and retain', accent: GOLD_MID },
    { key: 'notes', eyebrow: 'knowledge base', title: 'notes', value: String(totalNotes), unit: 'notes saved', subcopy: 'captured ideas and lessons', accent: accentDark },
    { key: 'progress', eyebrow: 'today', title: 'progress', value: `${todayProgress}%`, unit: 'momentum score', subcopy: 'how the day is moving', accent: GOLD_L },
  ] as const;

  const hero = heroSlides[heroIndex];
  const heroValueMaxWidth = Math.max(220, Math.min(layout.width - 72, layout.contentMaxWidth - 44));
  const heroFontSize = Math.min(
    layout.isLandscape ? 184 : 156,
    Math.floor((heroValueMaxWidth * (layout.isLandscape ? 0.54 : 0.84)) / Math.max(hero.value.length * 0.72, 1))
  );

  const nextAction =
    streak === 0
      ? {
          eyebrow: 'next action',
          title: 'Start a session',
          detail: 'Open flashcards and put today on the board.',
          cta: 'open flashcards',
          target: 'flashcards' as const,
          icon: 'layers-outline' as const,
        }
      : weeklyMastered < 8
        ? {
            eyebrow: 'next action',
            title: 'Review your cards',
            detail: `${Math.max(6, 12 - weeklyMastered)} more cards would sharpen the week.`,
            cta: 'review now',
            target: 'flashcards' as const,
            icon: 'layers-outline' as const,
          }
        : weeklyInteractions < 4
          ? {
              eyebrow: 'next action',
              title: 'Think with AI',
              detail: 'Open AI chat and keep the loop moving.',
              cta: 'open ai',
              target: 'ai' as const,
              icon: 'sparkles-outline' as const,
            }
          : totalNotes < 3
            ? {
                eyebrow: 'next action',
                title: 'Capture a note',
                detail: 'Save what you learned while it is still fresh.',
                cta: 'open notes',
                target: 'notes' as const,
                icon: 'document-text-outline' as const,
              }
            : {
                eyebrow: 'next action',
                title: 'Build media notes',
                detail: 'Turn a lecture or video into a cleaner study asset.',
                cta: 'open media notes',
                target: 'aimedia' as const,
                icon: 'videocam-outline' as const,
              };

  const rings = [
    { label: studyDuration.unit === 'hrs' ? 'HRS\nFOCUS' : 'MIN\nFOCUS', value: studyDuration.value, progress: Math.min(weeklyHours / 10, 1) },
    { label: 'XP\nEARNED', value: String(weeklyXp), progress: Math.min(weeklyXp / 500, 1) },
    { label: 'CARDS\nMASTERED', value: String(weeklyMastered), progress: Math.min(weeklyMastered / 30, 1) },
  ];

  const greeting = hour < 12 ? 'good morning' : hour < 18 ? 'good afternoon' : 'good evening';
  const firstName = user.first_name || user.username;
  const momentumLabel =
    todayProgress >= 75 ? 'high momentum' :
    todayProgress >= 45 ? 'on track' :
    streak > 0 ? 'keep pushing' :
    'ready to start';

  const cycleHero = () => {
    if (stats === null || heroAnimating.current) return;
    heroAnimating.current = true;
    Animated.timing(heroSwap, {
      toValue: 0,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setHeroIndex((current) => (current + 1) % heroSlides.length);
      triggerHaptic('selection');
      Animated.timing(heroSwap, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        heroAnimating.current = false;
      });
    });
  };
  cycleHeroRef.current = cycleHero;

  const handleNextAction = () => {
    if (nextAction.target === 'ai') {
      onNavigateToAI?.();
      return;
    }
    onNavigate?.(nextAction.target);
  };

  const todayRows = [
    { label: 'focus time', value: `${todayStudyDuration.value} ${todayStudyDuration.unit}`, note: 'today', progress: Math.min(todayMinutes / 120, 1) },
    { label: 'xp earned', value: String(weeklyXp), note: 'this week', progress: Math.min(weeklyXp / 500, 1) },
  ];
  const todayDateLabel = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();

  if (!fontsLoaded) return null;

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <GeoBackground />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} bounces={false} alwaysBounceVertical={false}>
        <View style={styles.topBar}>
          <View style={styles.topTextWrap}>
            <Text style={styles.appName}>cerbyl</Text>
            <Text style={styles.greeting}>{greeting}, {firstName}</Text>
          </View>
          <View style={styles.topLogoWrap}>
            <CerbylMark size={90} color={GOLD_L} />
          </View>
        </View>

        <View style={styles.heroWrap}>
          <HapticTouchable activeOpacity={1} onPress={cycleHero} haptic="selection">
            <View style={styles.heroSection} {...heroSwipeResponder.panHandlers}>
              <NeumorphicTexture
                grainOpacity={0.48}
                grainVariant="skia"
                baseFrequency={0.7}
                gradientColors={cbTileCardGradient.colors}
                gradientStart={cbTileCardGradient.start}
                gradientEnd={cbTileCardGradient.end}
              />

              {stats === null ? (
                <View style={styles.heroLoading}>
                  <Text style={styles.heroLoadingBrand}>cerbyl</Text>
                  <ActivityIndicator color={selectedTheme.accent} size="small" />
                  <Text style={styles.heroLoadingText}>syncing your learning signal</Text>
                </View>
              ) : (
                <AnimatedView style={[styles.heroContent, { opacity: heroSwap, transform: [{ scale: heroSwap.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }] }]}>
                  <Text style={styles.heroLabel}>{hero.title}</Text>
                  <Text style={[styles.bigNum, { fontSize: heroFontSize, lineHeight: heroFontSize + 10 }]}>{hero.value}</Text>
                  <Text style={styles.heroUnit}>{hero.unit}</Text>

                  <View style={styles.heroDots}>
                    {heroSlides.map((_, index) => (
                      <View key={index} style={[styles.heroDot, index === heroIndex && styles.heroDotActive]} />
                    ))}
                  </View>
                </AnimatedView>
              )}
            </View>
          </HapticTouchable>
        </View>

        {recentActivity.length > 0 && (
          <View style={styles.activitySection}>
            <View style={styles.activityHeader}>
              <Text style={styles.activityHeadTitle}>recent activity</Text>
            </View>
            <View style={styles.timelineWrap}>
              {recentActivity.map((item: any, idx: number) => {
                const type = String(item?.activity_type || item?.type || '').toLowerCase();
                const actor = item?.username || item?.user_username || item?.friend_username || user.first_name || user.username;
                const subject = item?.title || item?.subject || item?.content_title || item?.topic || '';
                const icon: React.ComponentProps<typeof Ionicons>['name'] =
                  type.includes('quiz') ? 'trophy-outline' :
                  type.includes('flash') ? 'layers-outline' :
                  type.includes('note') ? 'document-text-outline' :
                  type.includes('chat') ? 'sparkles-outline' :
                  'pulse-outline';
                const label =
                  type.includes('quiz') ? 'quiz completed' :
                  type.includes('flash') ? 'flashcard session' :
                  type.includes('note') ? 'note saved' :
                  type.includes('chat') ? 'ai chat' :
                  'activity';
                const isLast = idx === recentActivity.length - 1;
                return (
                  <View key={item.id ?? idx} style={styles.timelineItem}>
                    <View style={styles.timelineLeft}>
                      <View style={styles.timelineDot}>
                        <Ionicons name={icon} size={12} color={selectedTheme.accentHover} />
                      </View>
                      {!isLast && <View style={styles.timelineLine} />}
                    </View>
                    <View style={[styles.timelineCard, isLast && { marginBottom: 0 }]}>
                      <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
                      <NeumorphicTexture />
                      <Text style={styles.timelineLabel}>{label}</Text>
                      {subject ? <Text style={styles.timelineSubject} numberOfLines={1}>{subject}</Text> : null}
                      <Text style={styles.timelineActor}>{actor}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.bodySection}>
          <View style={styles.duoRow}>
            <View style={[styles.sectionCard, styles.duoCard]}>
              <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
              <NeumorphicTexture />
              <View style={styles.todayHeadRow}>
                <View style={styles.sectionHeadRow}>
                  <Text style={styles.sectionTitle}>today</Text>
                </View>
                <Text style={styles.todayDateLabel}>{todayDateLabel}</Text>
              </View>
              <View style={styles.todayCard}>
                {todayRows.map((row, index) => (
                  <View key={row.label} style={[styles.todayRow, index < todayRows.length - 1 && styles.todayDivider]}>
                    <View style={styles.todayTextWrap}>
                      <Text style={styles.todayLabel}>{row.label}</Text>
                      <Text style={styles.todayNote}>{row.note}</Text>
                    </View>
                    <View style={styles.todayValueWrap}>
                      <Text style={styles.todayValue}>{row.value}</Text>
                      <View style={styles.todayRail}>
                        <View style={[styles.todayRailFill, { width: `${Math.max(12, row.progress * 100)}%` }]} />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <View style={[styles.sectionCard, styles.duoCard]}>
              <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
              <NeumorphicTexture />
              <View style={styles.sectionHeadRow}>
                <Text style={styles.sectionTitle}>weekly orbit</Text>
              </View>
              <View style={styles.ringsWrap}>
                {rings.map((ring) => (
                  <View key={ring.label} style={styles.ringMuted}>
                    <RingProgress value={ring.value} label={ring.label} progress={ring.progress} size={88} strokeWidth={6} />
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.sectionBlock}>
            <HapticTouchable
              style={[styles.sectionCard, styles.xpCard]}
              onPress={() => onNavigate?.('xpAnalytics')}
              activeOpacity={0.85}
              haptic="selection"
            >
              <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
              <NeumorphicTexture />
              <View style={styles.xpHeadRow}>
                <View style={styles.sectionHeadRow}>
                  <Text style={styles.sectionTitle}>xp this week</Text>
                </View>
                <View style={styles.xpHeadRight}>
                  <Text style={styles.xpTotalValue}>{weeklyXp}</Text>
                  {xpDeltaPercent !== 0 ? (
                    <Text style={[styles.xpDelta, xpDeltaPercent > 0 ? styles.xpDeltaUp : styles.xpDeltaDown]}>
                      {xpDeltaPercent > 0 ? '+' : ''}{xpDeltaPercent}%
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.xpChartWrap} onLayout={(e) => setXpChartWidth(e.nativeEvent.layout.width)}>
                {xpChartWidth > 0 ? (
                  <XpLineChart
                    points={(xpHistory?.points ?? []).map((p) => ({ label: p.label, xp: p.xp }))}
                    width={xpChartWidth}
                    height={108}
                    color={GOLD_L}
                    labelColor={selectedTheme.textSecondary}
                  />
                ) : null}
              </View>
              <View style={styles.xpFooterRow}>
                <Text style={styles.xpFooterHint}>tap for the full breakdown</Text>
                <Ionicons name="chevron-forward" size={14} color={GOLD_L} />
              </View>
            </HapticTouchable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>, windowHeight: number) {
  const SURFACE = theme.panel;
  const GOLD_L = theme.accentHover;
  const GOLD_MID = theme.accent;
  const GOLD_D = darkenColor(theme.accent, theme.isLight ? 16 : 34);
  const GOLD_SOFT = theme.textPrimary;
  const DIM = theme.textSecondary;
  const CARD_BORDER = theme.border;
  const SHADOW = darkenColor(theme.primary, theme.isLight ? 72 : 4);
  const horizontalPadding = 6;
  const heroMinHeight = layout.isLandscape
    ? Math.min(440, Math.max(330, layout.height * 0.68))
    : Math.min(440, Math.max(330, layout.height * 0.48));

  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent', overflow: 'hidden' },
  scroll: { paddingBottom: layout.isLandscape ? 92 : 110 },
  glowTop: {
    position: 'absolute',
    top: -50,
    right: -30,
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  glowBottom: {
    position: 'absolute',
    bottom: 120,
    left: -40,
    width: 240,
    height: 240,
    borderRadius: 120,
  },

  topBar: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: horizontalPadding,
    marginTop: 18,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topLogoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,
    transform: [{ translateX: 16 }],
  },
  topTextWrap: {
    justifyContent: 'center',
  },
  appName: {
    fontFamily: 'Inter_900Black',
    fontSize: 30,
    color: GOLD_L,
    letterSpacing: -0.8,
  },
  greeting: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: DIM,
    letterSpacing: 1.8,
    marginTop: 4,
    textTransform: 'uppercase',
  },

  heroWrap: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  heroSection: {
    minHeight: heroMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 12,
    overflow: 'hidden',
    borderRadius: 28,
    marginHorizontal: 4,
    boxShadow: cbTileShadowExact(),
    ...cbTileBorder(0.22),
  } as ViewStyle,
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: layout.isLandscape ? 16 : 12,
  },
  phaseChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  phaseChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: GOLD_L,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  heroStatusPill: {
    borderRadius: 999,
    backgroundColor: rgbaFromHex(theme.panelAlt, 0.86),
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroStatusText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    color: GOLD_L,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroContent: {
    alignItems: 'center',
  },
  heroLoading: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  heroLoadingBrand: {
    fontFamily: 'Inter_900Black',
    fontSize: 46,
    color: GOLD_L,
    letterSpacing: -1.6,
  },
  heroLoadingText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: DIM,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  heroLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: layout.isLandscape ? 13 : 12,
    color: GOLD_L,
    letterSpacing: layout.isLandscape ? 2.8 : 2.2,
    marginTop: layout.isLandscape ? 14 : 10,
    textTransform: 'uppercase',
  },
  bigNum: {
    fontFamily: 'Inter_900Black',
    color: GOLD_L,
    textAlign: 'center',
    marginTop: 8,
  },
  heroUnit: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: GOLD_MID,
    letterSpacing: 2.6,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  heroDots: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  heroDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: rgbaFromHex(GOLD_D, 0.33),
  },
  heroDotActive: {
    backgroundColor: GOLD_L,
    width: 24,
  },
  heroOrb: {
    position: 'absolute',
    borderRadius: 999,
  },
  heroOrbPrimary: {
    width: 210,
    height: 210,
    top: 28,
    right: -92,
  },
  heroOrbSecondary: {
    width: 170,
    height: 170,
    left: -88,
    bottom: -6,
  },

  bodySection: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: horizontalPadding,
    gap: 22,
  },
  nextCard: {
    backgroundColor: rgbaFromHex(SURFACE, 0.93),
    borderRadius: 0,
    padding: 14,
    paddingTop: 36,
    borderBottomWidth: 1,
    borderColor: CARD_BORDER,
    height: windowHeight,
    width: '100%',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  nextTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  nextEyebrow: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: GOLD_L,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  nextCtaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: rgbaFromHex(theme.accent, 0.10),
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  nextCta: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: GOLD_L,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  nextTitle: {
    fontFamily: 'Inter_900Black',
    fontSize: 30,
    color: GOLD_L,
    lineHeight: 34,
    letterSpacing: -0.6,
  },
  nextDetail: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: GOLD_L,
    lineHeight: 21,
    marginTop: 10,
    maxWidth: '88%',
  },

  sectionBlock: {
    gap: 12,
  },
  sectionCard: {
    borderRadius: 26,
    padding: 16,
    overflow: 'hidden',
    boxShadow: cbTileShadow(0.055),
  } as ViewStyle,
  duoRow: {
    flexDirection: layout.width >= 760 ? 'row' : 'column',
    gap: 14,
  },
  duoCard: {
    minHeight: layout.width >= 760 ? 210 : 0,
    flex: layout.width >= 760 ? 1 : undefined,
  },
  sectionHeadRow: {
    gap: 4,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: GOLD_L,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  todayHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  todayDateLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: DIM,
    letterSpacing: 1.2,
  },
  todayCard: {
    backgroundColor: 'transparent',
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 10,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    gap: 16,
  },
  todayDivider: {
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
  },
  todayTextWrap: {
    flex: 1,
    gap: 5,
  },
  todayLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: GOLD_MID,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  todayNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: DIM,
    letterSpacing: 0.6,
  },
  todayValueWrap: {
    width: layout.isLandscape ? 132 : 118,
    alignItems: 'flex-end',
    gap: 8,
  },
  todayValue: {
    fontFamily: 'Inter_900Black',
    fontSize: 24,
    color: GOLD_L,
  },
  todayRail: {
    width: '100%',
    height: 7,
    borderRadius: 999,
    backgroundColor: rgbaFromHex(theme.bgPrimary, theme.isLight ? 0.45 : 0.72),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: rgbaFromHex(GOLD_L, theme.isLight ? 0.10 : 0.12),
  },
  todayRailFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: GOLD_L,
  },

  ringsWrap: {
    flexDirection: 'row',
    justifyContent: layout.width >= 760 ? 'space-between' : 'space-around',
    flexWrap: layout.width < 360 ? 'wrap' : 'nowrap',
    gap: layout.width < 360 ? 12 : 0,
    paddingTop: 18,
  },
  ringMuted: {
    opacity: 0.96,
  },

  xpCard: {
    gap: 4,
  } as ViewStyle,
  xpHeadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  xpHeadRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  xpTotalValue: {
    fontFamily: 'Inter_900Black',
    fontSize: 22,
    color: GOLD_L,
    letterSpacing: -0.4,
  },
  xpDelta: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  xpDeltaUp: { color: '#6FCF97' },
  xpDeltaDown: { color: '#EB5757' },
  xpChartWrap: {
    marginTop: 10,
    marginHorizontal: -4,
  },
  xpFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  xpFooterHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: DIM,
    letterSpacing: 0.4,
  },

  activitySection: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: horizontalPadding,
    gap: 10,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityHeadTitle: {
    fontFamily: 'Inter_900Black',
    fontSize: 15,
    color: GOLD_L,
    letterSpacing: -0.3,
  },
  timelineWrap: { gap: 0 },
  timelineItem: { flexDirection: 'row', gap: 12 },
  timelineLeft: { alignItems: 'center', width: 28 },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: rgbaFromHex(theme.bgPrimary, theme.isLight ? 0.52 : 0.64),
    borderWidth: 1,
    borderColor: rgbaFromHex(theme.accentHover, 0.25),
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLine: {
    flex: 1,
    width: 1,
    backgroundColor: CARD_BORDER,
    marginVertical: 4,
  },
  timelineCard: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    padding: 12,
    marginBottom: 8,
    gap: 3,
    boxShadow: cbTileShadow(0.055),
  } as ViewStyle,
  timelineLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: GOLD_L,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  timelineSubject: {
    fontFamily: 'Inter_900Black',
    fontSize: 14,
    color: GOLD_L,
    letterSpacing: -0.2,
  },
  timelineActor: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: DIM,
  },
});
}
