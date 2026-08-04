import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../../services/auth';
import {
  getChallengeDetail,
  generateChallengeQuestions,
  updateChallengeProgress,
  BattleQuestion,
} from '../../services/api';
import HapticTouchable from '../../components/HapticTouchable';
import GeoBackground from '../../components/GeoBackground';
import SocialTileMaterial from '../../components/SocialTileMaterial';
import { triggerHaptic } from '../../utils/haptics';
import { useAppTheme } from '../../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../../utils/theme';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

type Props = { user: AuthUser; challengeId: number; onExit: () => void };
type Phase = 'loading' | 'playing' | 'submitting' | 'results' | 'already-completed' | 'error';
type PlayAnswer = { question_id: number; selected_answer: number; is_correct: boolean };

const SURFACE = '#0b0c0f';
const BORDER = 'rgba(216,179,141,0.22)';

export default function ChallengePlayScreen({ user, challengeId, onExit }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold });

  const [phase, setPhase] = useState<Phase>('loading');
  const [challenge, setChallenge] = useState<any>(null);
  const [questions, setQuestions] = useState<BattleQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [progressResult, setProgressResult] = useState<{ progress: number; completed: boolean } | null>(null);

  const answersRef = useRef<PlayAnswer[]>([]);
  const correctRef = useRef(0);
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
        const detail = await getChallengeDetail(challengeId);
        if (cancelled) return;
        const c = detail.challenge;
        if (!c) throw new Error('Challenge not found');
        setChallenge(c);

        if (c.completed) {
          setPhase('already-completed');
          return;
        }

        let qs: BattleQuestion[] = Array.isArray(detail.questions) ? detail.questions : [];
        if (qs.length === 0) {
          const generated = await generateChallengeQuestions({
            challengeId,
            subject: c.subject,
            challengeType: c.challenge_type,
            questionCount: c.target_metric === 'questions_answered' ? Math.max(1, Math.round(c.target_value)) : 10,
          });
          qs = generated.questions;
        }
        if (cancelled) return;
        setQuestions(qs);
        setPhase('playing');
      } catch (error) {
        if (!cancelled) {
          setPhase('error');
          Alert.alert('Challenge', error instanceof Error ? error.message : 'Could not load this challenge');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [challengeId]);

  const finalize = async () => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    if (mountedRef.current) setPhase('submitting');
    const total = answersRef.current.length;
    const accuracy = total > 0 ? (correctRef.current / total) * 100 : 0;
    try {
      const result = await updateChallengeProgress({
        challengeId,
        questionsAnswered: total,
        accuracyPercentage: accuracy,
        answers: answersRef.current,
      });
      if (!mountedRef.current) return;
      setProgressResult(result);
      setPhase('results');
    } catch (error) {
      if (!mountedRef.current) return;
      Alert.alert('Challenge', error instanceof Error ? error.message : 'Could not submit your progress');
      onExit();
    }
  };

  const selectAnswer = (answerIndex: number) => {
    if (selected !== null) return;
    setSelected(answerIndex);
    const q = questions[idx];
    const isCorrect = answerIndex === q.correct_answer;
    triggerHaptic(isCorrect ? 'success' : 'warning');
    if (isCorrect) correctRef.current += 1;
    answersRef.current = [...answersRef.current, { question_id: q.id, selected_answer: answerIndex, is_correct: isCorrect }];

    answerTimeoutRef.current = setTimeout(() => {
      if (idx + 1 >= questions.length) {
        finalize();
      } else if (mountedRef.current) {
        setIdx(idx + 1);
        setSelected(null);
      }
    }, 1300);
  };

  if (!fontsLoaded) return null;

  const GOLD_L = selectedTheme.accentHover;
  const GOLD_M = selectedTheme.accent;
  const DIM = selectedTheme.textSecondary;
  const INK = selectedTheme.isLight ? darkenColor(selectedTheme.accent, 34) : selectedTheme.bgPrimary;

  if (phase === 'loading' || phase === 'submitting') {
    return (
      <View style={{ flex: 1 }}>
        <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
        <GeoBackground />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <ActivityIndicator color={GOLD_M} size="large" />
          <Text style={{ fontFamily: 'Inter_600SemiBold', color: DIM, fontSize: 12 }}>
            {phase === 'submitting' ? 'submitting your progress…' : 'loading challenge…'}
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
          <Text style={{ fontFamily: 'Inter_700Bold', color: GOLD_L, fontSize: 15, textAlign: 'center' }}>couldn't load this challenge</Text>
          <HapticTouchable onPress={onExit} haptic="light">
            <View style={s.exitPill}><Text style={s.exitPillText}>back</Text></View>
          </HapticTouchable>
        </View>
      </View>
    );
  }

  if (phase === 'already-completed') {
    return (
      <View style={{ flex: 1 }}>
        <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
        <GeoBackground />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 }}>
          <Ionicons name="trophy" size={40} color={GOLD_L} />
          <Text style={{ fontFamily: 'Inter_900Black', color: GOLD_L, fontSize: 20 }}>already completed</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', color: DIM, fontSize: 12.5, textAlign: 'center' }}>you've finished "{challenge?.title}"</Text>
          <HapticTouchable onPress={onExit} haptic="medium" style={{ marginTop: 6 }}>
            <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={s.launchBtn}>
              <Text style={{ fontFamily: 'Inter_900Black', fontSize: 13, color: INK, letterSpacing: 0.4 }}>back to challenges</Text>
            </LinearGradient>
          </HapticTouchable>
        </View>
      </View>
    );
  }

  if (phase === 'results') {
    const total = answersRef.current.length;
    const correct = correctRef.current;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const completed = progressResult?.completed ?? false;
    return (
      <View style={{ flex: 1 }}>
        <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
        <GeoBackground />
        <ScrollView contentContainerStyle={s.resultsScroll} showsVerticalScrollIndicator={false}>
          <View style={s.resultsBanner}>
            <Ionicons name={completed ? 'trophy' : 'flag-outline'} size={40} color={GOLD_L} />
            <Text style={s.resultsBannerTitle}>{completed ? 'challenge complete!' : 'nice progress'}</Text>
          </View>
          <Text style={s.bigPct}>{pct}%</Text>
          <Text style={s.resultsLabel}>{correct}/{total} correct</Text>

          <View style={s.progressCard}>
            <Text style={s.progressCardLabel}>challenge goal progress</Text>
            <View style={s.progressTrack}><View style={[s.progressFill, { width: `${Math.max(4, progressResult?.progress ?? 0)}%` }]} /></View>
            <Text style={s.progressCardValue}>{Math.round(progressResult?.progress ?? 0)}%</Text>
          </View>

          {!completed ? (
            <HapticTouchable
              onPress={() => {
                finalizedRef.current = false;
                answersRef.current = [];
                correctRef.current = 0;
                setIdx(0);
                setSelected(null);
                setPhase('playing');
              }}
              haptic="medium"
              style={{ marginTop: 8 }}
            >
              <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={s.launchBtn}>
                <Text style={{ fontFamily: 'Inter_900Black', fontSize: 13, color: INK, letterSpacing: 0.4 }}>play again</Text>
              </LinearGradient>
            </HapticTouchable>
          ) : null}
          <HapticTouchable onPress={onExit} haptic="light" style={{ marginTop: 10 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', color: DIM, fontSize: 12 }}>back to challenges</Text>
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
          <Text style={s.progressText}>{idx + 1} / {questions.length} · {challenge?.title}</Text>
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
        {selected !== null && q.explanation ? (
          <View style={s.explanationCard}>
            <Ionicons name="bulb-outline" size={14} color={GOLD_M} />
            <Text style={s.explanationText}>{q.explanation}</Text>
          </View>
        ) : null}
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

    playScroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 60, gap: 18 },
    questionCard: { borderRadius: 22, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, padding: 20, minHeight: 100, justifyContent: 'center' },
    questionText: { fontFamily: 'Inter_700Bold', color: GOLD_L, fontSize: 17, lineHeight: 24 },

    option: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, paddingHorizontal: 14, paddingVertical: 14 } as any,
    optionCorrect: { borderColor: rgbaFromHex(theme.success, 0.5), backgroundColor: rgbaFromHex(theme.success, 0.1) },
    optionWrong: { borderColor: rgbaFromHex(theme.danger, 0.5), backgroundColor: rgbaFromHex(theme.danger, 0.1) },
    optionLetter: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(theme.accent, 0.16) },
    optionLetterText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: GOLD_L },
    optionText: { flex: 1, fontFamily: 'Inter_600SemiBold', color: theme.textPrimary, fontSize: 13.5, lineHeight: 19 },

    explanationCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: rgbaFromHex(SURFACE, 0.7), padding: 12 },
    explanationText: { flex: 1, fontFamily: 'Inter_400Regular', color: DIM, fontSize: 11.5, lineHeight: 16 },

    resultsScroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 40, paddingBottom: 60, alignItems: 'center' },
    resultsBanner: { alignItems: 'center', gap: 8, marginBottom: 10 },
    resultsBannerTitle: { fontFamily: 'Inter_900Black', color: GOLD_L, fontSize: 22, letterSpacing: -0.4, textAlign: 'center' },
    bigPct: { fontFamily: 'Inter_900Black', color: theme.accent, fontSize: 44, letterSpacing: -1.2, marginTop: 4 },
    resultsLabel: { fontFamily: 'Inter_600SemiBold', color: DIM, fontSize: 12, letterSpacing: 0.4, marginTop: 2 },
    progressCard: { width: '100%', borderRadius: 18, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, padding: 16, gap: 8, marginTop: 22 },
    progressCardLabel: { fontFamily: 'Inter_600SemiBold', color: DIM, fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase' },
    progressCardValue: { fontFamily: 'Inter_900Black', color: GOLD_L, fontSize: 16, textAlign: 'right' },
  });
}
