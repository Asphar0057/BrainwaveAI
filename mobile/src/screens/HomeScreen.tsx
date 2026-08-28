import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Animated, PanResponder, Easing, useWindowDimensions, ViewStyle, AppState } from 'react-native';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import Ionicons from '@expo/vector-icons/Ionicons';
import RingProgress from '../components/RingProgress';
import HapticTouchable from '../components/HapticTouchable';
import CircleBackground from '../components/CircleBackground';
import NeumorphicTexture, { cbCardGradient, cbTileShadow, cbTileCardGradient, cbTileShadowExact, cbTileBorder } from '../components/NeumorphicTexture';
import CerbylMark from '../components/CerbylMark';
import XpLineChart from '../components/XpLineChart';
import { AuthUser } from '../services/auth';
import { getEnhancedStats, getFriendActivityFeed, getXpHistory, XpHistory, getPersonalizedPrompts, PersonalizedPrompt, runSearchHubCommand } from '../services/api';
import { triggerHaptic } from '../utils/haptics';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
const AnimatedView = Animated.createAnimatedComponent(View);

type HomeTarget = 'flashcards' | 'notes' | 'aimedia' | 'questionBank' | 'knowledgeMaps' | 'knowledgeHub' | 'slideExplorer' | 'canvasHub' | 'xpAnalytics' | 'weaknessPractice' | 'learningPaths' | 'notifications';
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
  const [recommendedPrompts, setRecommendedPrompts] = useState<PersonalizedPrompt[]>([]);
  const [actingPrompt, setActingPrompt] = useState<string | null>(null);
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

  // Claims responder on touch-start (same as any Touchable) so both a plain
  // tap AND a horizontal drag are caught by this single responder -- a
  // PanResponder living on a child of a wrapping TouchableOpacity can never
  // steal responder-ship from that ancestor mid-gesture, which is why swipes
  // silently did nothing while the wrapping Touchable's onPress still fired
  // for taps. The ancestor ScrollView can still reclaim responder-ship for a
  // predominantly-vertical drag via its own capture phase, same as it does
  // for any Touchable nested inside it, so page scrolling is unaffected.
  const heroSwipeResponder = useMemo(() => (
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderGrant: () => {
        triggerHaptic('selection');
      },
      onPanResponderRelease: (_, gestureState) => {
        const isSwipe = Math.abs(gestureState.dx) > 34 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const isTap = Math.abs(gestureState.dx) < 10 && Math.abs(gestureState.dy) < 10;
        if (isSwipe || isTap) cycleHeroRef.current();
      },
      onPanResponderTerminationRequest: () => true,
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
    getPersonalizedPrompts().then((data) => {
      setRecommendedPrompts(Array.isArray(data?.prompts) ? data.prompts : []);
    }).catch(() => {});
  }, [user.username, loadStats, loadXp]);

  const actOnPrompt = async (prompt: PersonalizedPrompt) => {
    if (actingPrompt) return;
    setActingPrompt(prompt.text);
    triggerHaptic('medium');
    try {
      const result = await runSearchHubCommand({ userId: user.username, query: prompt.text, sessionId: 'mobile-home-recommendation' });
      const action = result?.metadata?.action;
      if (action === 'create_note') onNavigate?.('notes');
      else if (action === 'create_flashcards') onNavigate?.('flashcards');
      else if (action === 'create_questions' || action === 'create_quiz') onNavigate?.('questionBank');
      else if (action === 'create_learning_path') onNavigate?.('learningPaths');
      else onNavigateToAI?.();
    } catch {
      onNavigateToAI?.();
    } finally {
      setActingPrompt(null);
    }
  };

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
  const GOLD_SOFT = selectedTheme.textPrimary;
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
    { key: 'streak', value: String(streak), label: 'day streak' },
    { key: 'hours', value: studyDuration.value, label: `${studyDuration.unit} studied this week` },
    { key: 'chat', value: String(totalChats), label: 'ai chat sessions' },
    { key: 'flashcards', value: String(totalFlashcards), label: 'flashcards created' },
    { key: 'notes', value: String(totalNotes), label: 'notes saved' },
    { key: 'progress', value: `${todayProgress}%`, label: "today's momentum" },
  ] as const;

  const hero = heroSlides[heroIndex];
  const heroValueMaxWidth = Math.max(220, Math.min(layout.width - 72, layout.contentMaxWidth - 44));
  // Sized to actually fill the card's width rather than a fixed cap that only
  // the longest possible value (e.g. "3h 20m") ever reached -- short values
  // like a 2-digit streak used to render tiny and lost in the card.
  const heroFontSize = Math.min(
    layout.isLandscape ? 260 : 230,
    Math.floor((heroValueMaxWidth * (layout.isLandscape ? 0.66 : 0.98)) / Math.max(hero.value.length * 0.62, 1))
  );
  // The label ("day streak", "flashcards created", ...) reads as a small
  // caption below the number, gold-to-transparent gradient fill (same
  // MaskedView technique as the Explore page's "notes" tile) instead of a
  // flat color -- fully opaque and in normal flow, not a faded watermark
  // sitting behind the number.
  const heroLabelFontSize = layout.isLandscape ? 14 : 13;
  const heroLabelLetterSpacing = layout.isLandscape ? 2.8 : 2.2;
  const heroLabelBoxHeight = Math.round(heroLabelFontSize * 1.3);
  const heroLabelBoxWidth = Math.min(
    heroValueMaxWidth,
    Math.round(hero.label.length * (heroLabelFontSize * 0.62 + heroLabelLetterSpacing) + 12)
  );
  const heroNumBoxHeight = heroFontSize + 10;

  const rings = [
    { label: studyDuration.unit === 'hrs' ? 'HRS\nFOCUS' : 'MIN\nFOCUS', value: studyDuration.value, progress: Math.min(weeklyHours / 10, 1) },
    { label: 'XP\nEARNED', value: String(weeklyXp), progress: Math.min(weeklyXp / 500, 1) },
    { label: 'CARDS\nMASTERED', value: String(weeklyMastered), progress: Math.min(weeklyMastered / 30, 1) },
  ];

  const greeting = hour < 12 ? 'good morning' : hour < 18 ? 'good afternoon' : 'good evening';
  const firstName = user.first_name || user.username;

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

  const todayRows = [
    { label: 'focus time', value: `${todayStudyDuration.value} ${todayStudyDuration.unit}`, note: 'today', progress: Math.min(todayMinutes / 120, 1) },
    { label: 'xp earned', value: String(weeklyXp), note: 'this week', progress: Math.min(weeklyXp / 500, 1) },
  ];
  const todayDateLabel = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();

  if (!fontsLoaded) return null;

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <CircleBackground />

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
                <View style={styles.heroDots}>
                  {heroSlides.map((_, index) => (
                    <View key={index} style={[styles.heroDot, index === heroIndex && styles.heroDotActive]} />
                  ))}
                </View>

                <View style={{ width: heroValueMaxWidth, height: heroNumBoxHeight }}>
                  <Text style={[styles.bigNum, { fontSize: heroFontSize, lineHeight: heroNumBoxHeight, width: heroValueMaxWidth }]}>{hero.value}</Text>
                </View>
                <MaskedView
                  style={{ width: heroLabelBoxWidth, height: heroLabelBoxHeight, marginTop: layout.isLandscape ? 14 : 10 }}
                  maskElement={
                    <View style={{ width: heroLabelBoxWidth, height: heroLabelBoxHeight, alignItems: 'center', justifyContent: 'center' }}>
                      <Text
                        style={{
                          fontFamily: 'Inter_900Black', fontSize: heroLabelFontSize,
                          letterSpacing: heroLabelLetterSpacing, textTransform: 'uppercase', color: '#000000',
                        }}
                        numberOfLines={1}
                      >
                        {hero.label}
                      </Text>
                    </View>
                  }
                >
                  <LinearGradient
                    colors={[GOLD_L, rgbaFromHex(GOLD_L, 0)]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                </MaskedView>
              </AnimatedView>
            )}
          </View>
        </View>

        {recentActivity.length > 0 && (
          <View style={styles.activitySection}>
            <View style={styles.activityHeader}>
              <Text style={styles.sectionTitle}>recent activity</Text>
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
                return (
                  <View key={item.id ?? idx} style={styles.timelineItem}>
                    <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
                    <NeumorphicTexture />
                    <View style={styles.timelineDot}>
                      <Ionicons name={icon} size={15} color={selectedTheme.accentHover} />
                    </View>
                    <View style={styles.timelineContent}>
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

        {recommendedPrompts.length > 0 && (
          <View style={styles.activitySection}>
            <View style={styles.activityHeader}>
              <Text style={styles.sectionTitle}>recommended for you</Text>
            </View>
            <View style={{ gap: 8 }}>
              {recommendedPrompts.map((prompt, idx) => (
                <HapticTouchable
                  key={`${prompt.text}-${idx}`}
                  style={styles.recoCard}
                  onPress={() => actOnPrompt(prompt)}
                  disabled={actingPrompt === prompt.text}
                  haptic="none"
                >
                  <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
                  <NeumorphicTexture />
                  <View style={styles.timelineDot}>
                    {actingPrompt === prompt.text
                      ? <ActivityIndicator size="small" color={selectedTheme.accentHover} />
                      : <Ionicons name={prompt.priority === 'high' ? 'flash-outline' : 'bulb-outline'} size={15} color={selectedTheme.accentHover} />}
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineLabel} numberOfLines={1}>{prompt.text}</Text>
                    <Text style={styles.timelineActor}>{prompt.reason}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={selectedTheme.textSecondary} />
                </HapticTouchable>
              ))}
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
  // 75% less than the original 20/16 — applies to every section on this
  // page (hero, stats, everything), not just one card.
  const horizontalPadding = Math.round((layout.isTablet ? 20 : 16) * 0.25);
  const heroMinHeight = layout.isLandscape
    ? Math.min(440, Math.max(330, layout.height * 0.68))
    : Math.min(380, Math.max(310, layout.height * 0.42));

  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent', overflow: 'hidden' },
  scroll: { paddingBottom: 24 },
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
    marginRight: -2,
    transform: [{ translateX: 4 }],
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
    marginBottom: 22,
    paddingHorizontal: horizontalPadding,
  },
  heroSection: {
    minHeight: heroMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 12,
    overflow: 'hidden',
    borderRadius: 28,
    marginHorizontal: 0,
    boxShadow: cbTileShadowExact(),
    ...cbTileBorder(0.22),
  } as ViewStyle,
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
  bigNum: {
    fontFamily: 'Inter_900Black',
    color: GOLD_L,
    textAlign: 'center',
  },
  heroDots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
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
  bodySection: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: horizontalPadding,
    gap: 22,
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
    gap: 12,
    marginBottom: 22,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineWrap: { gap: 10 },
  timelineItem: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderRadius: 20,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 12,
    boxShadow: cbTileShadow(0.055),
  } as ViewStyle,
  recoCard: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 12,
    boxShadow: cbTileShadow(0.055),
  } as ViewStyle,
  timelineDot: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: rgbaFromHex(theme.bgPrimary, theme.isLight ? 0.52 : 0.64),
    borderWidth: 1,
    borderColor: rgbaFromHex(theme.accentHover, 0.25),
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  timelineContent: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
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
