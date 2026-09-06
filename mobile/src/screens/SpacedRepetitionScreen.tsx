import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Animated, RefreshControl, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import {
  getDueFlashcards,
  srReviewFlashcard,
  getSrStats,
  getFlashcardAiSuggestions,
  SRDueCardsResponse,
  SRStats,
  SRAiSuggestions,
  SRGrade,
} from '../services/api';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import MathText from '../components/MathText';
import { cbTileShadow, cbTileBorder } from '../components/NeumorphicTexture';
import { triggerHaptic } from '../utils/haptics';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, lightenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = { user: AuthUser; onBack: () => void };
type Phase = 'idle' | 'studying' | 'results';
type GradeInfo = { key: SRGrade; label: string; color: (theme: ReturnType<typeof useAppTheme>['selectedTheme']) => string };

const GRADES: GradeInfo[] = [
  { key: 'again', label: 'Again', color: (t) => t.danger },
  { key: 'hard', label: 'Hard', color: (t) => lightenColor(t.accent, 10) },
  { key: 'good', label: 'Good', color: (t) => t.accentHover },
  { key: 'easy', label: 'Easy', color: (t) => t.success },
];

const STATE_LABELS: Record<string, string> = { new: 'New', learning: 'Learning', review: 'Review', relearning: 'Relearning' };

export default function SpacedRepetitionScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(selectedTheme, layout, insets.top), [selectedTheme, layout, insets.top]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dueData, setDueData] = useState<SRDueCardsResponse | null>(null);
  const [stats, setStats] = useState<SRStats | null>(null);
  const [suggestions, setSuggestions] = useState<SRAiSuggestions | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const [phase, setPhase] = useState<Phase>('idle');
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionStats, setSessionStats] = useState<Record<SRGrade, number>>({ again: 0, hard: 0, good: 0, easy: 0 });
  const flipAnim = useMemo(() => new Animated.Value(1), []);

  const load = useCallback(async () => {
    try {
      const [due, srStats] = await Promise.all([getDueFlashcards(user.username), getSrStats(user.username)]);
      setDueData(due);
      setStats(srStats);
    } catch (error) {
      Alert.alert('Spaced repetition', error instanceof Error ? error.message : 'Failed to load review queue');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.username]);

  useEffect(() => { load(); }, [load]);

  const loadSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      setSuggestions(await getFlashcardAiSuggestions(user.username));
    } catch {
      Alert.alert('Study tips', 'Could not load AI study suggestions right now.');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const cards = dueData?.cards ?? [];
  const card = cards[idx];

  const startSession = () => {
    if (!cards.length) return;
    setIdx(0);
    setFlipped(false);
    setSessionStats({ again: 0, hard: 0, good: 0, easy: 0 });
    setPhase('studying');
  };

  const doFlip = () => {
    triggerHaptic('light');
    Animated.timing(flipAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setFlipped((v) => !v);
      Animated.timing(flipAnim, { toValue: 1, duration: 120, useNativeDriver: true }).start();
    });
  };

  const grade = async (g: SRGrade) => {
    if (!card || submitting) return;
    setSubmitting(true);
    triggerHaptic(g === 'again' ? 'warning' : 'medium');
    try {
      await srReviewFlashcard(user.username, card.id, g);
    } catch {
      Alert.alert('Review not saved', 'Check your connection and try this grade again. Your place has been kept.');
      setSubmitting(false);
      return;
    }
    setSessionStats((prev) => ({ ...prev, [g]: prev[g] + 1 }));
    setFlipped(false);
    if (idx + 1 >= cards.length) {
      setPhase('results');
    } else {
      setIdx(idx + 1);
    }
    setSubmitting(false);
  };

  const finishSession = () => {
    setPhase('idle');
    setRefreshing(true);
    load();
  };

  if (!fontsLoaded) return null;

  if (phase === 'studying' && card) {
    const progress = ((idx + 1) / Math.max(cards.length, 1)) * 100;
    return (
      <View style={s.root}>
        <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
        <GeoBackground />
        <View style={s.studyHeader}>
          <HapticTouchable style={s.iconBtn} onPress={() => setPhase('idle')} haptic="light" accessibilityLabel="Exit review">
            <Ionicons name="close" size={20} color={selectedTheme.accentHover} />
          </HapticTouchable>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <View style={s.progressTrack}><View style={[s.progressFill, { width: `${progress}%` }]} /></View>
            <Text style={s.progressText}>{idx + 1} / {cards.length} · {STATE_LABELS[card.sr_state] || card.sr_state}</Text>
          </View>
        </View>

        <View style={s.cardWrap}>
          <Animated.View style={{ opacity: flipAnim, transform: [{ scale: flipAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }}>
            <HapticTouchable style={s.studyCard} onPress={doFlip} activeOpacity={0.92} haptic="none">
              <Text style={s.cardKicker}>{flipped ? 'ANSWER' : 'QUESTION'}</Text>
              <MathText style={s.cardText}>{flipped ? card.answer : card.question}</MathText>
              {!flipped ? <Text style={s.tapHint}>tap to reveal answer</Text> : null}
            </HapticTouchable>
          </Animated.View>
        </View>

        {flipped ? (
          <View style={s.gradeRow}>
            {GRADES.map((g) => (
              <HapticTouchable
                key={g.key}
                style={[s.gradeBtn, { borderColor: rgbaFromHex(g.color(selectedTheme), 0.4), backgroundColor: rgbaFromHex(g.color(selectedTheme), selectedTheme.isLight ? 0.12 : 0.18) }]}
                onPress={() => grade(g.key)}
                disabled={submitting}
                haptic="none"
              >
                <Text style={[s.gradeInterval, { color: g.color(selectedTheme) }]}>{card.interval_preview?.[g.key] ?? '–'}</Text>
                <Text style={[s.gradeLabel, { color: g.color(selectedTheme) }]}>{g.label}</Text>
              </HapticTouchable>
            ))}
          </View>
        ) : (
          <View style={s.gradeRowPlaceholder}>
            <Text style={s.hint}>flip the card to grade your recall</Text>
          </View>
        )}
      </View>
    );
  }

  if (phase === 'results') {
    const total = sessionStats.again + sessionStats.hard + sessionStats.good + sessionStats.easy;
    const goodOrEasy = sessionStats.good + sessionStats.easy;
    const pct = total > 0 ? Math.round((goodOrEasy / total) * 100) : 0;
    return (
      <View style={s.root}>
        <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
        <GeoBackground />
        <View style={s.resultsWrap}>
          <Ionicons name="checkmark-circle" size={44} color={selectedTheme.accentHover} />
          <Text style={s.bigPct}>{pct}%</Text>
          <Text style={s.resultsLabel}>recalled well</Text>
          <View style={s.resultsGrid}>
            {GRADES.map((g) => (
              <View key={g.key} style={s.resultCell}>
                <Text style={[s.resultNum, { color: g.color(selectedTheme) }]}>{sessionStats[g.key]}</Text>
                <Text style={s.resultLbl}>{g.label.toLowerCase()}</Text>
              </View>
            ))}
          </View>
          <HapticTouchable style={s.primaryBtn} onPress={finishSession} haptic="medium">
            <Text style={s.primaryBtnText}>done</Text>
          </HapticTouchable>
        </View>
      </View>
    );
  }

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
            <Text style={s.kicker}>FSRS · SM-2</Text>
            <Text style={s.title}>spaced repetition</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 80 }} />
        ) : (
          <>
            <View style={s.dueCard}>
              <View style={s.dueTop}>
                <View style={s.dueIcon}><Ionicons name="layers-outline" size={20} color={s.accentInk.color} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.dueKicker}>DUE FOR REVIEW</Text>
                  <Text style={s.dueCount}>{dueData?.due_count ?? 0} cards</Text>
                </View>
              </View>
              <View style={s.dueBreakdown}>
                <Text style={s.dueBreakdownItem}>{dueData?.new_count ?? 0} new</Text>
                <Text style={s.dueBreakdownItem}>{dueData?.review_count ?? 0} review</Text>
                <Text style={s.dueBreakdownItem}>{dueData?.learning_count ?? 0} learning</Text>
                <Text style={s.dueBreakdownItem}>{dueData?.relearning_count ?? 0} relearning</Text>
              </View>
              <HapticTouchable
                style={[s.primaryBtn, !dueData?.due_count && s.primaryBtnDisabled]}
                onPress={startSession}
                disabled={!dueData?.due_count}
                haptic="medium"
              >
                <Ionicons name="flash" size={16} color={s.accentInk.color} />
                <Text style={s.primaryBtnText}>{dueData?.due_count ? 'start review session' : 'all caught up'}</Text>
              </HapticTouchable>
            </View>

            {stats ? (
              <View style={s.statsCard}>
                <Text style={s.statsTitle}>your memory stats</Text>
                <View style={s.summaryRow}>
                  <Summary icon="pulse-outline" label="retention" value={`${stats.retention_rate}%`} styles={s} />
                  <Summary icon="time-outline" label="avg interval" value={`${stats.maturity.average_interval}d`} styles={s} />
                  <Summary icon="ribbon-outline" label="mature cards" value={String(stats.maturity.mature_count)} styles={s} />
                </View>
                <View style={s.distributionRow}>
                  {(['new', 'learning', 'review', 'relearning'] as const).map((key) => (
                    <View key={key} style={s.distributionCell}>
                      <Text style={s.distributionNum}>{stats.state_distribution[key]}</Text>
                      <Text style={s.distributionLbl}>{STATE_LABELS[key]}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={s.tipsCard}>
              <View style={s.tipsHeader}>
                <Text style={s.statsTitle}>study tips</Text>
                {!suggestions ? (
                  <HapticTouchable style={s.tipsRefresh} onPress={loadSuggestions} disabled={loadingSuggestions} haptic="selection">
                    {loadingSuggestions ? <ActivityIndicator size="small" color={s.accentInk.color} /> : <Text style={s.tipsRefreshText}>get AI tips</Text>}
                  </HapticTouchable>
                ) : null}
              </View>
              {suggestions ? (
                <>
                  <Text style={s.encouragement}>{suggestions.encouragement}</Text>
                  {suggestions.study_tips.map((tip, i) => (
                    <View key={i} style={s.tipRow}>
                      <Ionicons name="sparkles-outline" size={13} color={selectedTheme.accent} />
                      <Text style={s.tipText}>{tip}</Text>
                    </View>
                  ))}
                  {suggestions.problem_areas.length > 0 ? (
                    <View style={{ marginTop: 8, gap: 6 }}>
                      {suggestions.problem_areas.map((p, i) => (
                        <View key={i} style={s.problemRow}>
                          <Text style={s.problemTopic}>{p.topic}</Text>
                          <Text style={s.problemSuggestion}>{p.suggestion}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : (
                <Text style={s.hint}>get a personalized daily target and problem-area breakdown from your review history.</Text>
              )}
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

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>, topInset: number) {
  const surface = theme.panel;
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.18 : 0.2);
  const accentInk = theme.isLight ? darkenColor(theme.accent, 38) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 4, paddingTop: Math.max(topInset + 10, 50), paddingBottom: 110, gap: 14 },
    header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconBtn: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.82), alignItems: 'center', justifyContent: 'center' },
    headerCopy: { flex: 1 },
    kicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 10, letterSpacing: 1.7 },
    title: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 30, lineHeight: 34, letterSpacing: -0.7 },
    accentInk: { color: accentInk },
    iconColor: { color: theme.accent },
    hint: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, lineHeight: 18 },

    dueCard: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.9), padding: 18, gap: 14, boxShadow: cbTileShadow(0.08) } as ViewStyle,
    dueTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    dueIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    dueKicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 10, letterSpacing: 1.4 },
    dueCount: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 22, marginTop: 3 },
    dueBreakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    dueBreakdownItem: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 11 },

    primaryBtn: { height: 46, borderRadius: 14, backgroundColor: theme.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    primaryBtnDisabled: { opacity: 0.5 },
    primaryBtnText: { fontFamily: 'Inter_900Black', color: accentInk, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' },

    statsCard: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.9), padding: 16, gap: 12, boxShadow: cbTileShadow(0.06) } as ViewStyle,
    statsTitle: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 13, letterSpacing: 0.2 },
    summaryRow: { flexDirection: 'row', gap: 8 },
    summaryCard: { flex: 1, borderRadius: 14, backgroundColor: rgbaFromHex(theme.bgPrimary, theme.isLight ? 0.4 : 0.55), paddingVertical: 12, alignItems: 'center', gap: 3, overflow: 'hidden', boxShadow: cbTileShadow(0.04), ...cbTileBorder(0.12) },
    summaryValue: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 16 },
    summaryLabel: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
    distributionRow: { flexDirection: 'row', gap: 8 },
    distributionCell: { flex: 1, alignItems: 'center', gap: 2 },
    distributionNum: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 14 },
    distributionLbl: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 9.5 },

    tipsCard: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.9), padding: 16, gap: 10, boxShadow: cbTileShadow(0.06) } as ViewStyle,
    tipsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    tipsRefresh: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: theme.accent },
    tipsRefreshText: { fontFamily: 'Inter_700Bold', color: accentInk, fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase' },
    encouragement: { fontFamily: 'Inter_600SemiBold', color: theme.accentHover, fontSize: 12.5, lineHeight: 18 },
    tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
    tipText: { flex: 1, fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, lineHeight: 17 },
    problemRow: { borderLeftWidth: 2, borderLeftColor: theme.accent, paddingLeft: 8, gap: 2 },
    problemTopic: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 11.5 },
    problemSuggestion: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, lineHeight: 15 },

    // studying phase
    studyHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: Math.max(topInset + 8, 46), paddingBottom: 8 },
    progressTrack: { height: 4, borderRadius: 2, backgroundColor: rgbaFromHex(theme.accent, 0.14), overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: theme.accentHover, borderRadius: 2 },
    progressText: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 10, marginTop: 6, textAlign: 'center' },
    cardWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
    studyCard: {
      width: '100%', maxWidth: Math.min(layout.contentMaxWidth, 480), minHeight: 220,
      borderRadius: 26, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.94),
      padding: 24, alignItems: 'center', justifyContent: 'center', gap: 14,
      boxShadow: cbTileShadow(0.1),
    } as ViewStyle,
    cardKicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 10, letterSpacing: 1.8 },
    cardText: { fontFamily: 'Inter_600SemiBold', color: theme.textPrimary, fontSize: 18, lineHeight: 26, textAlign: 'center' },
    tapHint: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, marginTop: 4 },
    gradeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: Math.max(20, layout.height < 700 ? 14 : 28) },
    gradeRowPlaceholder: { alignItems: 'center', paddingBottom: Math.max(30, layout.height < 700 ? 20 : 40) },
    gradeBtn: { flex: 1, borderRadius: 16, borderWidth: 1, paddingVertical: 13, alignItems: 'center', gap: 3 },
    gradeInterval: { fontFamily: 'Inter_900Black', fontSize: 13 },
    gradeLabel: { fontFamily: 'Inter_700Bold', fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase' },

    // results phase
    resultsWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 8 },
    bigPct: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 48, letterSpacing: -1.5, marginTop: 6 },
    resultsLabel: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' },
    resultsGrid: { flexDirection: 'row', gap: 18, marginVertical: 20 },
    resultCell: { alignItems: 'center', gap: 3 },
    resultNum: { fontFamily: 'Inter_900Black', fontSize: 22 },
    resultLbl: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4 },
  });
}
