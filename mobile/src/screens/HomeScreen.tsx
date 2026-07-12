import { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Animated, PanResponder, Easing, useWindowDimensions, ViewStyle } from 'react-native';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import RingProgress from '../components/RingProgress';
import HapticTouchable from '../components/HapticTouchable';
import AmbientBubbles from '../components/AmbientBubbles';
import GeoBackground from '../components/GeoBackground';
import NeumorphicTexture, { cbCardGradient, cbTileShadow, cbModalShadow } from '../components/NeumorphicTexture';
import { AuthUser } from '../services/auth';
import { getEnhancedStats, getFriendActivityFeed } from '../services/api';
import { triggerHaptic } from '../utils/haptics';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
const AnimatedView = Animated.createAnimatedComponent(View);

type HomeTarget = 'flashcards' | 'notes' | 'aimedia' | 'questionBank' | 'knowledgeMaps' | 'knowledgeHub' | 'slideExplorer' | 'canvasHub' | 'analytics' | 'weaknessPractice' | 'learningPaths';
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
  totalChatSessions: number;
  totalFlashcards: number;
  totalNotes: number;
  weeklyHours?: number;
  weeklyInteractions?: number;
  weeklyMastered?: number;
};

function MetricCapsule({ label, value }: { label: string; value: string }) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const { height: windowHeight } = useWindowDimensions();
  const styles = useMemo(() => createStyles(selectedTheme, layout, windowHeight), [selectedTheme, layout, windowHeight]);
  return (
    <View style={styles.metricCapsule}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export default function HomeScreen({ user, onNavigate, onNavigateToAI, onSwipeLeftPage, onSwipeRightPage }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const { height: windowHeight } = useWindowDimensions();
  const styles = useMemo(() => createStyles(selectedTheme, layout, windowHeight), [selectedTheme, layout, windowHeight]);
  const canSwipeBetweenPages = !layout.sideRailTabs;
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold });
  const [stats, setStats] = useState<Stats | null>(null);
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

  useEffect(() => {
    getEnhancedStats(user.username).then((data) => setStats(data)).catch(() => {});
    getFriendActivityFeed(user.username).then((data) => {
      const list = Array.isArray(data) ? data : data?.activities ?? data?.feed ?? [];
      setRecentActivity(list.slice(0, 4));
    }).catch(() => {});
  }, [user.username]);

  const streak = stats?.streak ?? 0;
  const GOLD_L = selectedTheme.accentHover;
  const GOLD_MID = selectedTheme.accent;
  const GOLD_SOFT = selectedTheme.textPrimary;
  const accentDark = darkenColor(selectedTheme.accent, selectedTheme.isLight ? 16 : 34);
  const weeklyHours = stats?.weeklyHours ?? stats?.hours ?? 0;
  const weeklyInteractions = stats?.weeklyInteractions ?? stats?.totalChatSessions ?? 0;
  const weeklyMastered = stats?.weeklyMastered ?? stats?.totalFlashcards ?? 0;
  const totalChats = stats?.totalChatSessions ?? 0;
  const totalFlashcards = stats?.totalFlashcards ?? 0;
  const totalNotes = stats?.totalNotes ?? 0;
  const todayProgress =
    Math.min(
      99,
      Math.round(((Math.min(weeklyHours / 4, 1) + Math.min(weeklyInteractions / 8, 1) + Math.min(weeklyMastered / 6, 1)) / 3) * 100)
    ) || 0;

  const hour = new Date().getHours();
  const todayDate = new Date();
  const dayLabel = todayDate.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const dateLabel = todayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();

  const heroSlides = [
    { key: 'streak', eyebrow: 'daily signal', title: 'streak', value: String(streak), unit: 'days active', subcopy: 'keep the chain alive', accent: GOLD_L },
    { key: 'hours', eyebrow: 'focus depth', title: 'study time', value: weeklyHours.toFixed(1), unit: 'hours this week', subcopy: 'time invested in real work', accent: GOLD_L },
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
    { label: 'HRS\nFOCUS', value: weeklyHours.toFixed(1), progress: Math.min(weeklyHours / 10, 1) },
    { label: 'AI\nLOOPS', value: String(weeklyInteractions), progress: Math.min(weeklyInteractions / 50, 1) },
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

  const heroStats = [
    { label: 'streak', value: `${streak}` },
    { label: 'hours', value: weeklyHours.toFixed(1) },
    { label: 'chats', value: `${weeklyInteractions}` },
  ];

  const quickActions = [
    { label: 'ai chat', detail: 'ask, draft, iterate', icon: 'sparkles-outline' as const, action: () => onNavigateToAI?.() },
    { label: 'knowledge', detail: 'sources & context', icon: 'file-tray-stacked-outline' as const, action: () => onNavigate?.('knowledgeHub') },
    { label: 'slides', detail: 'deck analysis', icon: 'easel-outline' as const, action: () => onNavigate?.('slideExplorer') },
    { label: 'questions', detail: 'practice bank', icon: 'help-circle-outline' as const, action: () => onNavigate?.('questionBank') },
    { label: 'paths', detail: 'guided learning', icon: 'map-outline' as const, action: () => onNavigate?.('learningPaths') },
    { label: 'maps', detail: 'concept graph', icon: 'git-network-outline' as const, action: () => onNavigate?.('knowledgeMaps') },
    { label: 'canvas', detail: 'sketch ideas', icon: 'brush-outline' as const, action: () => onNavigate?.('canvasHub') },
    { label: 'flashcards', detail: 'review memory', icon: 'layers-outline' as const, action: () => onNavigate?.('flashcards') },
    { label: 'notes', detail: 'save the lesson', icon: 'document-text-outline' as const, action: () => onNavigate?.('notes') },
    { label: 'media notes', detail: 'from video to notes', icon: 'videocam-outline' as const, action: () => onNavigate?.('aimedia') },
    { label: 'analytics', detail: 'study signal', icon: 'bar-chart-outline' as const, action: () => onNavigate?.('analytics') },
  ];

  const todayRows = [
    { label: 'focus time', value: `${weeklyHours.toFixed(1)}h`, note: 'this week', progress: Math.min(weeklyHours / 4, 1) },
    { label: 'ai chats', value: String(weeklyInteractions), note: 'this week', progress: Math.min(weeklyInteractions / 8, 1) },
    { label: 'mastered', value: String(weeklyMastered), note: 'this week', progress: Math.min(weeklyMastered / 6, 1) },
  ];

  if (!fontsLoaded) return null;

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <GeoBackground />
      <AmbientBubbles theme={selectedTheme} variant="home" opacity={0.95} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} bounces={false} alwaysBounceVertical={false}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.appName}>cerbyl</Text>
            <Text style={styles.greeting}>{greeting}, {firstName}</Text>
          </View>
          <View style={styles.topDateChip}>
            <Text style={styles.topDateDay}>{dayLabel}</Text>
            <Text style={styles.topDateText}>{dateLabel}</Text>
          </View>
        </View>

        <View style={styles.heroWrap}>
          <HapticTouchable activeOpacity={1} onPress={cycleHero} haptic="selection">
            <View style={styles.heroSection} {...heroSwipeResponder.panHandlers}>
              <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
              <NeumorphicTexture grainOpacity={0.13} />

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
                  <Text style={styles.heroHint}>{hero.subcopy}</Text>

                  <View style={styles.heroStatsRow}>
                    {heroStats.map((item) => (
                      <MetricCapsule key={item.label} label={item.label} value={item.value} />
                    ))}
                  </View>

                  <View style={styles.heroDots}>
                    {heroSlides.map((_, index) => (
                      <View key={index} style={[styles.heroDot, index === heroIndex && styles.heroDotActive]} />
                    ))}
                  </View>
                  <Text style={styles.heroSwipeHint}>tap or swipe the hero to cycle views</Text>
                </AnimatedView>
              )}
            </View>
          </HapticTouchable>
        </View>

        {recentActivity.length > 0 && (
          <View style={styles.activitySection}>
            <View style={styles.activityHeader}>
              <Text style={styles.activityHeadTitle}>recent activity</Text>
              <Text style={styles.activityHeadMeta}>what happened lately</Text>
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
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeadRow}>
              <Text style={styles.sectionTitle}>study tools</Text>
              <Text style={styles.sectionSubtitle}>core website features, rebuilt for mobile</Text>
            </View>
            <View style={styles.quickGrid}>
              {quickActions.map((item, index) => (
                <HapticTouchable key={item.label} style={styles.quickCard} onPress={item.action} haptic="selection" activeOpacity={0.82}>
                  <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
                  <NeumorphicTexture />
                  <View style={styles.quickIconWrap}>
                    <Ionicons name={item.icon} size={17} color={selectedTheme.accentHover} />
                  </View>
                  <View>
                    <Text style={styles.quickLabel} numberOfLines={1}>{item.label}</Text>
                    <Text style={styles.quickDetail} numberOfLines={2}>{item.detail}</Text>
                  </View>
                </HapticTouchable>
              ))}
            </View>
          </View>

          <View style={styles.duoRow}>
            <View style={[styles.sectionCard, styles.duoCard]}>
              <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
              <NeumorphicTexture />
              <View style={styles.sectionHeadRow}>
                <Text style={styles.sectionTitle}>today</Text>
                <Text style={styles.sectionSubtitle}>live progress</Text>
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
                <Text style={styles.sectionSubtitle}>signal strength</Text>
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
            <View style={styles.sectionHeadRow}>
              <Text style={styles.sectionTitle}>lifetime totals</Text>
              <Text style={styles.sectionSubtitle}>what you have built so far</Text>
            </View>
            <View style={styles.totalsRow}>
              {[
                { val: totalChats, label: 'chat sessions' },
                { val: totalFlashcards, label: 'flashcards built' },
                { val: totalNotes, label: 'notes saved' },
              ].map((item, index) => (
                <View key={item.label} style={styles.totalCard}>
                  <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
                  <NeumorphicTexture />
                  <Text style={styles.totalValue}>{item.val}</Text>
                  <Text style={styles.totalLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
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
  const cardGap = 10;
  const bodyInnerWidth = Math.max(layout.contentMaxWidth - horizontalPadding * 2, 280);
  const heroMinHeight = layout.isLandscape
    ? Math.min(440, Math.max(330, layout.height * 0.68))
    : Math.min(440, Math.max(330, layout.height * 0.48));
  const quickColumns = layout.width >= 700 ? 4 : 2;
  const quickCardWidth = (bodyInnerWidth - cardGap * (quickColumns - 1)) / quickColumns;
  const totalColumns = layout.width >= 700 ? 3 : 2;
  const totalCardWidth = (bodyInnerWidth - cardGap * (totalColumns - 1)) / totalColumns;

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
    alignItems: 'flex-end',
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
  topDateChip: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 92,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: rgbaFromHex(GOLD_L, theme.isLight ? 0.18 : 0.22),
    backgroundColor: rgbaFromHex(SURFACE, theme.isLight ? 0.82 : 0.72),
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: SHADOW,
    shadowOffset: { width: 12, height: 14 },
    shadowOpacity: theme.isLight ? 0.08 : 0.30,
    shadowRadius: 24,
    elevation: 12,
  },
  topDateDay: {
    fontFamily: 'Inter_900Black',
    fontSize: 11,
    color: GOLD_L,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  topDateText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: DIM,
    letterSpacing: 0.5,
    marginTop: 2,
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
    borderRadius: 30,
    marginHorizontal: 4,
    boxShadow: cbModalShadow(0.14),
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
  heroHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: GOLD_L,
    letterSpacing: 0.8,
    marginTop: 10,
    textAlign: 'center',
  },
  heroStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
  },
  metricCapsule: {
    minWidth: layout.isLandscape ? 82 : 76,
    borderRadius: 22,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: rgbaFromHex(theme.bgPrimary, theme.isLight ? 0.52 : 0.68),
    borderWidth: 1,
    borderColor: rgbaFromHex(GOLD_L, theme.isLight ? 0.16 : 0.20),
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: -4, height: -4 },
    shadowOpacity: theme.isLight ? 0.03 : 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  metricValue: {
    fontFamily: 'Inter_900Black',
    fontSize: 18,
    color: GOLD_L,
  },
  metricLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 8,
    color: GOLD_L,
    letterSpacing: 1.6,
    marginTop: 4,
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
  heroSwipeHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    color: GOLD_SOFT,
    letterSpacing: 1.1,
    marginTop: 10,
    textTransform: 'uppercase',
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
  sectionSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: DIM,
    lineHeight: 16,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: cardGap,
  },
  quickCard: {
    width: quickCardWidth,
    borderRadius: 26,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: layout.width >= 700 ? 118 : 110,
    justifyContent: 'space-between',
    overflow: 'hidden',
    boxShadow: cbTileShadow(0.055),
  } as ViewStyle,
  quickIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: rgbaFromHex(GOLD_L, theme.isLight ? 0.18 : 0.24),
    backgroundColor: rgbaFromHex(theme.bgPrimary, theme.isLight ? 0.46 : 0.60),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: SHADOW,
    shadowOffset: { width: 7, height: 8 },
    shadowOpacity: theme.isLight ? 0.05 : 0.24,
    shadowRadius: 14,
    elevation: 7,
  },
  quickLabel: {
    fontFamily: 'Inter_900Black',
    fontSize: 17,
    color: GOLD_L,
    letterSpacing: -0.2,
    marginTop: 18,
  },
  quickDetail: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: DIM,
    letterSpacing: 0.3,
    lineHeight: 16,
    marginTop: 6,
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

  totalsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: cardGap,
  },
  totalCard: {
    width: totalCardWidth,
    borderRadius: 26,
    padding: 16,
    minHeight: 128,
    justifyContent: 'space-between',
    overflow: 'hidden',
    boxShadow: cbTileShadow(0.055),
  } as ViewStyle,
  totalValue: {
    fontFamily: 'Inter_900Black',
    fontSize: 36,
    color: GOLD_L,
  },
  totalLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: DIM,
    letterSpacing: 0.6,
    lineHeight: 15,
    textTransform: 'uppercase',
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
  activityHeadMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: DIM,
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
