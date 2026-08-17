import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../../services/auth';
import {
  getBattleDetails,
  generateBattleQuestions,
  submitBattleAnswer,
  completeQuizBattle,
  BattleQuestion,
  BattleAnswer,
} from '../../services/api';
import HapticTouchable from '../../components/HapticTouchable';
import GeoBackground from '../../components/GeoBackground';
import SocialTileMaterial from '../../components/SocialTileMaterial';
import { cbTileShadow, cbTileBorder } from '../../components/NeumorphicTexture';
import { triggerHaptic } from '../../utils/haptics';
import { useAppTheme } from '../../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../../utils/theme';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

type Props = { user: AuthUser; battleId: number; onExit: () => void };
type Phase = 'loading' | 'playing' | 'submitting' | 'waiting' | 'results' | 'error';

const SURFACE = '#0b0c0f';
const BORDER = 'rgba(216,179,141,0.22)';

export default function BattlePlayScreen({ user, battleId, onExit }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold });

  const [phase, setPhase] = useState<Phase>('loading');
  const [battle, setBattle] = useState<any>(null);
  const [questions, setQuestions] = useState<BattleQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<BattleAnswer[]>([]);
  const [score, setScore] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(300);
  const [yourAnswers, setYourAnswers] = useState<BattleAnswer[]>([]);
  const [opponentAnswers, setOpponentAnswers] = useState<BattleAnswer[]>([]);

  const questionStartRef = useRef(Date.now());
  const answersRef = useRef<BattleAnswer[]>([]);
  const scoreRef = useRef(0);
  const finalizedRef = useRef(false);
  const mountedRef = useRef(true);
  const answerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (answerTimeoutRef.current) clearTimeout(answerTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const detail = await getBattleDetails(battleId);
        if (cancelled) return;
        const b = detail.battle;
        if (!b) throw new Error(detail?.detail || 'Battle not found');
        setBattle(b);
        setTimeRemaining(b.time_limit_seconds || 300);

        if (b.your_completed) {
          if (b.opponent_completed) {
            setYourAnswers(Array.isArray(b.your_answers) ? b.your_answers : []);
            setOpponentAnswers(Array.isArray(b.opponent_answers) ? b.opponent_answers : []);
            setPhase('results');
          } else {
            setPhase('waiting');
          }
          return;
        }

        let qs: BattleQuestion[] = Array.isArray(detail.questions) ? detail.questions : [];
        if (qs.length === 0) {
          const generated = await generateBattleQuestions({
            battleId,
            subject: b.subject,
            difficulty: b.difficulty,
            questionCount: b.question_count,
          });
          qs = generated.questions;
        }
        if (cancelled) return;
        setQuestions(qs);
        questionStartRef.current = Date.now();
        setPhase('playing');
      } catch (error) {
        if (!cancelled) {
          setPhase('error');
          Alert.alert('Battle', error instanceof Error ? error.message : 'Could not load this battle');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [battleId]);

  useEffect(() => {
    if (phase !== 'playing') return;
    if (timeRemaining <= 0) {
      finalize();
      return;
    }
    const t = setTimeout(() => setTimeRemaining((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timeRemaining]);

  const finalize = async () => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    if (mountedRef.current) setPhase('submitting');
    try {
      const result = await completeQuizBattle(battleId, scoreRef.current, answersRef.current);
      if (!mountedRef.current) return;
      if (result?.both_completed) {
        const detail = await getBattleDetails(battleId);
        if (!mountedRef.current) return;
        setYourAnswers(Array.isArray(detail.battle?.your_answers) ? detail.battle.your_answers : []);
        setOpponentAnswers(Array.isArray(detail.battle?.opponent_answers) ? detail.battle.opponent_answers : []);
        setBattle(detail.battle);
        setPhase('results');
      } else {
        setPhase('waiting');
      }
    } catch (error) {
      if (!mountedRef.current) return;
      Alert.alert('Battle', error instanceof Error ? error.message : 'Could not submit your results');
      setPhase('waiting');
    }
  };

  const refreshWaiting = async () => {
    try {
      const detail = await getBattleDetails(battleId);
      if (detail.battle?.opponent_completed) {
        setYourAnswers(Array.isArray(detail.battle?.your_answers) ? detail.battle.your_answers : []);
        setOpponentAnswers(Array.isArray(detail.battle?.opponent_answers) ? detail.battle.opponent_answers : []);
        setBattle(detail.battle);
        setPhase('results');
      }
    } catch {
      // silenced -- user can just tap refresh again
    }
  };

  const selectAnswer = (answerIndex: number) => {
    if (selected !== null) return;
    setSelected(answerIndex);
    const q = questions[idx];
    const isCorrect = answerIndex === q.correct_answer;
    triggerHaptic(isCorrect ? 'success' : 'warning');
    const elapsed = Math.round((Date.now() - questionStartRef.current) / 1000);
    const record: BattleAnswer = {
      question_id: q.id,
      question: q.question,
      options: q.options,
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      selected_answer: answerIndex,
      is_correct: isCorrect,
      time_taken: elapsed,
    };
    const nextAnswers = [...answersRef.current, record];
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    if (isCorrect) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
    }
    void submitBattleAnswer(battleId, idx, isCorrect).catch(() => {});

    answerTimeoutRef.current = setTimeout(() => {
      if (idx + 1 >= questions.length) {
        finalize();
      } else if (mountedRef.current) {
        setIdx(idx + 1);
        setSelected(null);
        questionStartRef.current = Date.now();
      }
    }, 1400);
  };

  if (!fontsLoaded) return null;

  const GOLD_L = selectedTheme.accentHover;
  const GOLD_M = selectedTheme.accent;
  const DIM = selectedTheme.textSecondary;
  const INK = selectedTheme.isLight ? darkenColor(selectedTheme.accent, 34) : selectedTheme.bgPrimary;
  const opponentName = battle?.opponent?.username || 'opponent';

  if (phase === 'loading' || phase === 'submitting') {
    return (
      <View style={{ flex: 1 }}>
        <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
        <GeoBackground />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <ActivityIndicator color={GOLD_M} size="large" />
          <Text style={{ fontFamily: 'Inter_600SemiBold', color: DIM, fontSize: 12 }}>
            {phase === 'submitting' ? 'submitting your score…' : 'loading battle…'}
          </Text>
        </View>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={{ flex: 1 }}>
        <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
        <GeoBackground />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 24 }}>
          <Ionicons name="alert-circle-outline" size={32} color={GOLD_M} />
          <Text style={{ fontFamily: 'Inter_700Bold', color: GOLD_L, fontSize: 15, textAlign: 'center' }}>couldn't load this battle</Text>
          <HapticTouchable onPress={onExit} haptic="light">
            <View style={s.exitPill}><Text style={s.exitPillText}>back</Text></View>
          </HapticTouchable>
        </View>
      </View>
    );
  }

  if (phase === 'waiting') {
    return (
      <View style={{ flex: 1 }}>
        <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
        <GeoBackground />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 }}>
          <Ionicons name="hourglass-outline" size={36} color={GOLD_M} />
          <Text style={{ fontFamily: 'Inter_900Black', color: GOLD_L, fontSize: 22 }}>you scored {scoreRef.current}/{questions.length || battle?.question_count}</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', color: DIM, fontSize: 12.5, textAlign: 'center' }}>waiting for {opponentName} to finish their battle…</Text>
          <HapticTouchable onPress={refreshWaiting} haptic="selection" style={{ marginTop: 6 }}>
            <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={s.launchBtn}>
              <Text style={{ fontFamily: 'Inter_900Black', fontSize: 13, color: INK, letterSpacing: 0.4 }}>check again</Text>
            </LinearGradient>
          </HapticTouchable>
          <HapticTouchable onPress={onExit} haptic="light" style={{ marginTop: 4 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', color: DIM, fontSize: 12 }}>back to battles</Text>
          </HapticTouchable>
        </View>
      </View>
    );
  }

  if (phase === 'results') {
    const yourScore = yourAnswers.filter((a) => a.is_correct).length;
    const opponentScore = opponentAnswers.filter((a) => a.is_correct).length;
    const total = Math.max(yourAnswers.length, opponentAnswers.length, battle?.question_count || 0);
    const won = yourScore > opponentScore;
    const tied = yourScore === opponentScore;
    return (
      <View style={{ flex: 1 }}>
        <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
        <GeoBackground />
        <ScrollView contentContainerStyle={s.resultsScroll} showsVerticalScrollIndicator={false}>
          <View style={s.resultsBanner}>
            <Ionicons name={tied ? 'remove-circle-outline' : won ? 'trophy' : 'sad-outline'} size={40} color={GOLD_L} />
            <Text style={s.resultsBannerTitle}>{tied ? "it's a tie!" : won ? 'you won!' : 'good effort'}</Text>
          </View>
          <View style={s.resultsScoreRow}>
            <View style={s.resultsScoreCell}>
              <Text style={s.resultsScoreVal}>{yourScore}</Text>
              <Text style={s.resultsScoreLbl}>you</Text>
            </View>
            <Text style={s.resultsScoreDivider}>–</Text>
            <View style={s.resultsScoreCell}>
              <Text style={s.resultsScoreVal}>{opponentScore}</Text>
              <Text style={s.resultsScoreLbl}>{opponentName}</Text>
            </View>
          </View>
          <Text style={s.resultsSubject}>{battle?.subject} · {battle?.difficulty} · {total} questions</Text>

          <View style={s.breakdownCard}>
            {Array.from({ length: total }).map((_, i) => {
              const yours = yourAnswers[i];
              const theirs = opponentAnswers[i];
              return (
                <View key={i} style={[s.breakdownRow, i < total - 1 && s.breakdownDivider]}>
                  <Text style={s.breakdownQ} numberOfLines={2}>{yours?.question || theirs?.question || `Question ${i + 1}`}</Text>
                  <View style={s.breakdownIcons}>
                    <Ionicons name={yours?.is_correct ? 'checkmark-circle' : 'close-circle'} size={16} color={yours?.is_correct ? selectedTheme.success : selectedTheme.danger} />
                    <Ionicons name={theirs?.is_correct ? 'checkmark-circle' : 'close-circle'} size={16} color={theirs?.is_correct ? selectedTheme.success : selectedTheme.danger} />
                  </View>
                </View>
              );
            })}
          </View>

          <HapticTouchable onPress={onExit} haptic="medium" style={{ marginTop: 20 }}>
            <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={s.launchBtn}>
              <Text style={{ fontFamily: 'Inter_900Black', fontSize: 13, color: INK, letterSpacing: 0.4 }}>back to battles</Text>
            </LinearGradient>
          </HapticTouchable>
        </ScrollView>
      </View>
    );
  }

  const q = questions[idx];
  if (!q) return null;
  const progressPct = ((idx + (selected !== null ? 1 : 0)) / questions.length) * 100;

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <View style={s.playHeader}>
        <HapticTouchable onPress={onExit} style={s.exitPillSmall} haptic="light">
          <Ionicons name="close" size={16} color={GOLD_M} />
        </HapticTouchable>
        <View style={{ flex: 1 }}>
          <View style={s.progressTrack}><View style={[s.progressFill, { width: `${progressPct}%` }]} /></View>
          <Text style={s.progressText}>{idx + 1} / {questions.length} · vs {opponentName}</Text>
        </View>
        <View style={s.timerPill}>
          <Ionicons name="time-outline" size={13} color={timeRemaining <= 30 ? selectedTheme.danger : GOLD_L} />
          <Text style={[s.timerText, timeRemaining <= 30 && { color: selectedTheme.danger }]}>{Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.playScroll} showsVerticalScrollIndicator={false}>
        <View style={s.questionCard}>
          <SocialTileMaterial />
          <Text style={s.questionText}>{q.question}</Text>
        </View>
        <View style={{ gap: 10 }}>
          {q.options.map((option, i) => {
            const isSelected = selected === i;
            const isCorrectOption = i === q.correct_answer;
            const showState = selected !== null;
            const optionStyle = !showState
              ? s.option
              : isCorrectOption
                ? [s.option, s.optionCorrect]
                : isSelected
                  ? [s.option, s.optionWrong]
                  : [s.option, { opacity: 0.5 }];
            return (
              <HapticTouchable key={i} style={optionStyle as any} onPress={() => selectAnswer(i)} disabled={selected !== null} haptic="selection">
                <View style={s.optionLetter}><Text style={s.optionLetterText}>{String.fromCharCode(65 + i)}</Text></View>
                <Text style={s.optionText}>{option}</Text>
                {showState && isCorrectOption ? <Ionicons name="checkmark-circle" size={18} color={selectedTheme.success} /> : null}
                {showState && isSelected && !isCorrectOption ? <Ionicons name="close-circle" size={18} color={selectedTheme.danger} /> : null}
              </HapticTouchable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const GOLD_L = theme.accentHover;
  const DIM = theme.textSecondary;
  const INK = theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary;
  return StyleSheet.create({
    exitPill: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: rgbaFromHex(SURFACE, 0.9) },
    exitPillText: { fontFamily: 'Inter_600SemiBold', color: DIM, fontSize: 12 },
    exitPillSmall: { width: 34, height: 34, borderRadius: 17, backgroundColor: rgbaFromHex(SURFACE, 0.92), borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
    launchBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 26, alignItems: 'center' },

    playHeader: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
    progressTrack: { height: 4, borderRadius: 2, backgroundColor: rgbaFromHex(theme.accent, 0.16), overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: theme.accentHover, borderRadius: 2 },
    progressText: { fontFamily: 'Inter_600SemiBold', color: DIM, fontSize: 9.5, marginTop: 5 },
    timerPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: rgbaFromHex(SURFACE, 0.9) },
    timerText: { fontFamily: 'Inter_700Bold', color: GOLD_L, fontSize: 11.5 },

    playScroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 5, paddingBottom: 60, gap: 18 },
    questionCard: { borderRadius: 22, backgroundColor: SURFACE, padding: 20, minHeight: 100, justifyContent: 'center', overflow: 'hidden', boxShadow: cbTileShadow(0.07), ...cbTileBorder(0.16) },
    questionText: { fontFamily: 'Inter_700Bold', color: GOLD_L, fontSize: 17, lineHeight: 24 },

    option: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, paddingHorizontal: 14, paddingVertical: 14 } as any,
    optionCorrect: { borderColor: rgbaFromHex(theme.success, 0.5), backgroundColor: rgbaFromHex(theme.success, 0.1) },
    optionWrong: { borderColor: rgbaFromHex(theme.danger, 0.5), backgroundColor: rgbaFromHex(theme.danger, 0.1) },
    optionLetter: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(theme.accent, 0.16) },
    optionLetterText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: GOLD_L },
    optionText: { flex: 1, fontFamily: 'Inter_600SemiBold', color: theme.textPrimary, fontSize: 13.5, lineHeight: 19 },

    resultsScroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 5, paddingTop: 40, paddingBottom: 60, alignItems: 'center' },
    resultsBanner: { alignItems: 'center', gap: 8, marginBottom: 16 },
    resultsBannerTitle: { fontFamily: 'Inter_900Black', color: GOLD_L, fontSize: 24, letterSpacing: -0.4 },
    resultsScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
    resultsScoreCell: { alignItems: 'center', gap: 2 },
    resultsScoreVal: { fontFamily: 'Inter_900Black', color: theme.accent, fontSize: 40 },
    resultsScoreLbl: { fontFamily: 'Inter_600SemiBold', color: DIM, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
    resultsScoreDivider: { fontFamily: 'Inter_900Black', color: DIM, fontSize: 24 },
    resultsSubject: { fontFamily: 'Inter_400Regular', color: DIM, fontSize: 11.5, marginTop: 10, marginBottom: 18 },
    breakdownCard: { width: '100%', borderRadius: 18, backgroundColor: SURFACE, paddingHorizontal: 14, overflow: 'hidden', boxShadow: cbTileShadow(0.06), ...cbTileBorder(0.14) },
    breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
    breakdownDivider: { borderBottomWidth: 1, borderBottomColor: BORDER },
    breakdownQ: { flex: 1, fontFamily: 'Inter_400Regular', color: theme.textPrimary, fontSize: 11.5, lineHeight: 15 },
    breakdownIcons: { flexDirection: 'row', gap: 6 },
  });
}
