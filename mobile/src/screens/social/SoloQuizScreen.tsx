import { useMemo, useState } from 'react';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TextInput, ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../../services/auth';
import { createSoloQuiz, getSoloQuiz, completeSoloQuiz, SoloQuizQuestion } from '../../services/api';
import HapticTouchable from '../../components/HapticTouchable';
import AmbientBubbles from '../../components/AmbientBubbles';
import GeoBackground from '../../components/GeoBackground';
import { NeumorphicLayer, cbTileShadow, cbModalShadow } from '../../components/NeumorphicTexture';
import { useAppTheme } from '../../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../../utils/theme';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

type Props = { user: AuthUser; onBack: () => void };
type Stage = 'generator' | 'loading' | 'session' | 'review';
type Difficulty = 'easy' | 'medium' | 'hard';

type AnsweredResult = {
  question_text: string;
  user_answer: string;
  correct_answer: string;
  is_correct: boolean;
  explanation?: string;
};

// `correct_answer` from the API is a 0-based index into `options`, not a letter —
// confirmed against the live endpoint response, not assumed from the web grading code.
function isAnswerCorrect(userIndex: number | undefined, correctAnswer: number | string): boolean {
  if (userIndex === undefined) return false;
  return String(userIndex) === String(correctAnswer);
}

export default function SoloQuizScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold });

  const ACCENT = selectedTheme.accent;
  const ACCENT_HOVER = selectedTheme.accentHover;
  const DIM = selectedTheme.textSecondary;
  const INK = selectedTheme.isLight ? darkenColor(selectedTheme.accent, 34) : selectedTheme.bgPrimary;

  const [stage, setStage] = useState<Stage>('generator');
  const [error, setError] = useState('');

  // Generator form
  const [subject, setSubject] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [questionCount, setQuestionCount] = useState(10);

  // Session state
  const [quizId, setQuizId] = useState<string | number | null>(null);
  const [questions, setQuestions] = useState<SoloQuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});

  // Review state
  const [results, setResults] = useState<AnsweredResult[]>([]);
  const [score, setScore] = useState(0);

  const startQuiz = async () => {
    if (!subject.trim()) {
      setError('Enter a subject to begin your quiz');
      return;
    }
    setError('');
    setStage('loading');
    try {
      const created = await createSoloQuiz({
        subject: subject.trim(),
        difficulty,
        question_count: questionCount,
      });
      if (!created.quiz_id) throw new Error('Could not generate questions. Try a different topic.');
      const data = await getSoloQuiz(created.quiz_id);
      if (!data.questions?.length) throw new Error('Could not generate questions. Try a different topic.');
      setQuizId(created.quiz_id);
      setQuestions(data.questions);
      setCurrentIndex(0);
      setAnswers({});
      setStage('session');
    } catch (e: any) {
      setError(e.message || 'Failed to create quiz. Please try again.');
      setStage('generator');
    }
  };

  const selectAnswer = (questionId: number, optionIndex: number) => {
    setAnswers(prev => ({ ...prev, [questionId]: optionIndex }));
  };

  const finishQuiz = async () => {
    let correctCount = 0;
    const graded: AnsweredResult[] = questions.map(q => {
      const userIndex = answers[q.id];
      const correct = isAnswerCorrect(userIndex, q.correct_answer);
      if (correct) correctCount++;
      const correctIndex = Number(q.correct_answer);
      return {
        question_text: q.question,
        user_answer: userIndex !== undefined ? q.options[userIndex] : '',
        correct_answer: q.options[correctIndex] ?? String(q.correct_answer),
        is_correct: correct,
        explanation: q.explanation,
      };
    });
    const percentage = Math.round((correctCount / questions.length) * 100);
    setResults(graded);
    setScore(percentage);
    setStage('review');

    if (quizId) {
      try {
        await completeSoloQuiz({ quiz_id: quizId, score: percentage, answers: graded });
      } catch {
        // results still shown locally even if the save fails
      }
    }
  };

  const retryQuiz = () => {
    setStage('generator');
    setQuestions([]);
    setAnswers({});
    setResults([]);
    setScore(0);
    setQuizId(null);
  };

  if (!fontsLoaded) return null;

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <AmbientBubbles theme={selectedTheme} variant="quiz" opacity={0.82} />

      <View style={s.topBar}>
        <HapticTouchable
          onPress={stage === 'session' ? retryQuiz : onBack}
          style={s.backBtn}
          haptic="light"
        >
          <Ionicons name={stage === 'session' ? 'close' : 'chevron-back'} size={20} color={ACCENT} />
        </HapticTouchable>
        <Text style={s.topBarTitle}>solo quiz</Text>
        <View style={s.backBtn} />
      </View>

      {stage === 'generator' && (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={s.hero}>
            <NeumorphicLayer grainOpacity={0.26} />
            <Text style={s.heroGhost}>AI</Text>
            <Text style={s.eyebrow}>study mode</Text>
            <Text style={s.heroTitle}>create a quiz</Text>
            <Text style={s.heroCopy}>practice at your own pace with adaptive questions</Text>
          </View>

          <Text style={s.fieldLabel}>SUBJECT / TOPIC</Text>
          <TextInput
            style={s.input}
            value={subject}
            onChangeText={t => { setSubject(t); setError(''); }}
            placeholder="e.g. Machine Learning, World War II, Calculus..."
            placeholderTextColor={DIM}
          />

          <Text style={s.fieldLabel}>DIFFICULTY</Text>
          <View style={s.chipRow}>
            {(['easy', 'medium', 'hard'] as const).map(d => (
              <HapticTouchable
                key={d}
                style={[s.chip, difficulty === d && s.chipActive]}
                onPress={() => setDifficulty(d)}
                haptic="selection"
              >
                <Text style={[s.chipText, difficulty === d && s.chipTextActive]}>{d}</Text>
              </HapticTouchable>
            ))}
          </View>

          <Text style={s.fieldLabel}>QUESTIONS · {questionCount}</Text>
          <View style={s.stepperRow}>
            <HapticTouchable
              style={s.stepperBtn}
              onPress={() => setQuestionCount(c => Math.max(5, c - 5))}
              haptic="light"
            >
              <Ionicons name="remove" size={18} color={ACCENT_HOVER} />
            </HapticTouchable>
            <View style={s.stepperTrack}>
              <View style={[s.stepperFill, { width: `${((questionCount - 5) / 15) * 100}%` as any }]} />
            </View>
            <HapticTouchable
              style={s.stepperBtn}
              onPress={() => setQuestionCount(c => Math.min(20, c + 5))}
              haptic="light"
            >
              <Ionicons name="add" size={18} color={ACCENT_HOVER} />
            </HapticTouchable>
          </View>

          {!!error && <Text style={s.errorText}>{error}</Text>}

          <HapticTouchable
            style={[s.launchBtn, !subject.trim() && s.launchBtnDisabled]}
            onPress={startQuiz}
            disabled={!subject.trim()}
            haptic="medium"
          >
            <Ionicons name="sparkles" size={16} color={INK} />
            <Text style={s.launchBtnText}>start quiz</Text>
          </HapticTouchable>
        </ScrollView>
      )}

      {stage === 'loading' && (
        <View style={s.centerFill}>
          <ActivityIndicator color={ACCENT} size="large" />
          <Text style={s.loadingText}>generating your quiz...</Text>
        </View>
      )}

      {stage === 'session' && questions.length > 0 && (
        <QuizSession
          s={s}
          theme={selectedTheme}
          question={questions[currentIndex]}
          index={currentIndex}
          total={questions.length}
          selected={answers[questions[currentIndex].id]}
          onSelect={optionIndex => selectAnswer(questions[currentIndex].id, optionIndex)}
          onPrev={() => setCurrentIndex(i => Math.max(0, i - 1))}
          onNext={() => {
            if (currentIndex === questions.length - 1) finishQuiz();
            else setCurrentIndex(i => Math.min(questions.length - 1, i + 1));
          }}
          isLast={currentIndex === questions.length - 1}
        />
      )}

      {stage === 'review' && (
        <QuizReview
          s={s}
          theme={selectedTheme}
          score={score}
          results={results}
          onRetry={retryQuiz}
          onDone={onBack}
        />
      )}
    </View>
  );
}

function QuizSession({
  s, theme, question, index, total, selected, onSelect, onPrev, onNext, isLast,
}: {
  s: ReturnType<typeof createStyles>;
  theme: ReturnType<typeof useAppTheme>['selectedTheme'];
  question: SoloQuizQuestion;
  index: number;
  total: number;
  selected?: number;
  onSelect: (optionIndex: number) => void;
  onPrev: () => void;
  onNext: () => void;
  isLast: boolean;
}) {
  const ACCENT = theme.accent;
  const INK = theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary;
  return (
    <View style={s.sessionWrap}>
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${((index + 1) / total) * 100}%` as any }]} />
      </View>
      <Text style={s.progressLabel}>question {index + 1} of {total}</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={s.questionCard}>
          <Text style={s.questionText}>{question.question}</Text>
        </View>

        <View style={{ gap: 10 }}>
          {question.options.map((opt, i) => {
            const letter = String.fromCharCode(65 + i);
            const active = selected === i;
            return (
              <HapticTouchable
                key={i}
                style={[s.optionBtn, active && s.optionBtnActive]}
                onPress={() => onSelect(i)}
                haptic="selection"
              >
                <View style={[s.optionLetter, active && s.optionLetterActive]}>
                  <Text style={[s.optionLetterText, active && { color: INK }]}>{letter}</Text>
                </View>
                <Text style={[s.optionText, active && s.optionTextActive]}>{opt}</Text>
              </HapticTouchable>
            );
          })}
        </View>
      </ScrollView>

      <View style={s.sessionNav}>
        <HapticTouchable
          style={[s.navBtn, index === 0 && s.navBtnDisabled]}
          onPress={onPrev}
          disabled={index === 0}
          haptic="light"
        >
          <Ionicons name="arrow-back" size={16} color={index === 0 ? theme.textSecondary : ACCENT} />
        </HapticTouchable>
        <HapticTouchable style={s.navBtnPrimary} onPress={onNext} haptic="medium">
          <Text style={s.navBtnPrimaryText}>{isLast ? 'finish quiz' : 'next question'}</Text>
          <Ionicons name={isLast ? 'checkmark-circle' : 'arrow-forward'} size={16} color={INK} />
        </HapticTouchable>
      </View>
    </View>
  );
}

function QuizReview({
  s, theme, score, results, onRetry, onDone,
}: {
  s: ReturnType<typeof createStyles>;
  theme: ReturnType<typeof useAppTheme>['selectedTheme'];
  score: number;
  results: AnsweredResult[];
  onRetry: () => void;
  onDone: () => void;
}) {
  const INK = theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary;
  const scoreColor = score >= 80 ? theme.success : score >= 60 ? theme.accent : theme.danger;
  const correctCount = results.filter(r => r.is_correct).length;

  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <View style={s.hero}>
        <NeumorphicLayer grainOpacity={0.26} />
        <Text style={[s.scoreValue, { color: scoreColor }]}>{score}%</Text>
        <Text style={s.eyebrow}>quiz complete</Text>
        <Text style={s.heroCopy}>{correctCount} of {results.length} correct</Text>
      </View>

      {results.map((r, i) => (
        <View key={i} style={s.reviewCard}>
          <View style={s.reviewCardHeader}>
            <View style={[s.reviewBadge, { backgroundColor: r.is_correct ? rgbaFromHex(theme.success, 0.16) : rgbaFromHex(theme.danger, 0.16) }]}>
              <Ionicons name={r.is_correct ? 'checkmark' : 'close'} size={13} color={r.is_correct ? theme.success : theme.danger} />
            </View>
            <Text style={s.reviewQuestion} numberOfLines={3}>{r.question_text}</Text>
          </View>
          <Text style={s.reviewAnswer}>your answer: <Text style={{ color: r.is_correct ? theme.success : theme.danger }}>{r.user_answer || '—'}</Text></Text>
          {!r.is_correct && <Text style={s.reviewAnswer}>correct answer: <Text style={{ color: theme.success }}>{r.correct_answer}</Text></Text>}
          {!!r.explanation && <Text style={s.reviewExplanation}>{r.explanation}</Text>}
        </View>
      ))}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <HapticTouchable style={[s.launchBtn, { flex: 1 }]} onPress={onRetry} haptic="medium">
          <Ionicons name="refresh" size={16} color={INK} />
          <Text style={s.launchBtnText}>new quiz</Text>
        </HapticTouchable>
        <HapticTouchable style={[s.navBtn, { flex: 1, height: 52 }]} onPress={onDone} haptic="light">
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: theme.accentHover }}>done</Text>
        </HapticTouchable>
      </View>
    </ScrollView>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const CARD = theme.panel;
  const CARD_ALT = theme.panelAlt;
  const ACCENT = theme.accent;
  const ACCENT_HOVER = theme.accentHover;
  const DIM = theme.textSecondary;
  const BORDER = theme.borderStrong;
  const INK = theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary;

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: 'transparent' },
    topBar: {
      width: '100%',
      maxWidth: layout.contentMaxWidth,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 14,
    },
    backBtn: { width: 40, height: 40, borderRadius: 16, backgroundColor: rgbaFromHex(CARD, 0.72), borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', boxShadow: cbTileShadow(0.06) } as ViewStyle,
    topBarTitle: { fontFamily: 'Inter_700Bold', fontSize: 13, color: DIM, letterSpacing: 1.6, textTransform: 'uppercase' },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 48 },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
    loadingText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: DIM },

    hero: { borderRadius: 30, padding: 20, overflow: 'hidden', boxShadow: cbModalShadow(0.14), marginBottom: 22 } as ViewStyle,
    heroGhost: { position: 'absolute', right: 18, top: 0, fontFamily: 'Inter_900Black', fontSize: 76, lineHeight: 82, color: rgbaFromHex(theme.textPrimary, theme.isLight ? 0.035 : 0.055), letterSpacing: -4 },
    eyebrow: { fontFamily: 'Inter_700Bold', color: DIM, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase' },
    heroTitle: { fontFamily: 'Inter_900Black', color: ACCENT_HOVER, fontSize: 30, letterSpacing: -0.6, marginTop: 8 },
    heroCopy: { fontFamily: 'Inter_400Regular', color: DIM, fontSize: 13, marginTop: 4 },
    scoreValue: { fontFamily: 'Inter_900Black', fontSize: 52, letterSpacing: -1.5, marginBottom: 4 },

    fieldLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: DIM, letterSpacing: 2, marginBottom: 10, marginTop: 4 },
    input: { backgroundColor: rgbaFromHex(CARD_ALT, 0.85), borderRadius: 14, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 14, fontFamily: 'Inter_400Regular', fontSize: 14, color: ACCENT_HOVER, marginBottom: 20, boxShadow: cbTileShadow(0.04) } as ViewStyle,
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
    chip: { flex: 1, alignItems: 'center', paddingVertical: 12, backgroundColor: rgbaFromHex(CARD_ALT, 0.85), borderRadius: 12, borderWidth: 1, borderColor: BORDER, boxShadow: cbTileShadow(0.03) } as ViewStyle,
    chipActive: { backgroundColor: rgbaFromHex(ACCENT, 0.16), borderColor: rgbaFromHex(ACCENT, 0.32) },
    chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: DIM, textTransform: 'capitalize' },
    chipTextActive: { color: ACCENT_HOVER },

    stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    stepperBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: rgbaFromHex(CARD_ALT, 0.85), borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', boxShadow: cbTileShadow(0.04) } as ViewStyle,
    stepperTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: rgbaFromHex(ACCENT, 0.14), overflow: 'hidden' },
    stepperFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 3 },

    errorText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.danger, marginBottom: 14 },

    launchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ACCENT, borderRadius: 18, paddingVertical: 16, boxShadow: cbModalShadow(0.1) } as ViewStyle,
    launchBtnDisabled: { opacity: 0.45 },
    launchBtnText: { fontFamily: 'Inter_900Black', fontSize: 14, color: INK, textTransform: 'uppercase', letterSpacing: 0.5 },

    sessionWrap: { flex: 1, width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 20 },
    progressTrack: { height: 5, borderRadius: 3, backgroundColor: rgbaFromHex(ACCENT, 0.14), overflow: 'hidden', marginBottom: 8 },
    progressFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 3 },
    progressLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: DIM, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 },

    questionCard: { backgroundColor: rgbaFromHex(CARD, 0.9), borderRadius: 22, borderWidth: 1, borderColor: BORDER, padding: 20, marginBottom: 18, boxShadow: cbTileShadow(0.07) } as ViewStyle,
    questionText: { fontFamily: 'Inter_900Black', fontSize: 19, lineHeight: 26, color: ACCENT_HOVER },

    optionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: rgbaFromHex(CARD_ALT, 0.85), borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 14, boxShadow: cbTileShadow(0.04) } as ViewStyle,
    optionBtnActive: { backgroundColor: rgbaFromHex(ACCENT, 0.14), borderColor: rgbaFromHex(ACCENT, 0.4) },
    optionLetter: { width: 30, height: 30, borderRadius: 10, backgroundColor: rgbaFromHex(ACCENT, 0.14), alignItems: 'center', justifyContent: 'center' },
    optionLetterActive: { backgroundColor: ACCENT },
    optionLetterText: { fontFamily: 'Inter_900Black', fontSize: 13, color: ACCENT_HOVER },
    optionText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, color: theme.textPrimary },
    optionTextActive: { color: ACCENT_HOVER, fontFamily: 'Inter_600SemiBold' },

    sessionNav: { flexDirection: 'row', gap: 10, paddingVertical: 16 },
    navBtn: { width: 52, height: 52, borderRadius: 16, backgroundColor: rgbaFromHex(CARD, 0.85), borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', boxShadow: cbTileShadow(0.05) } as ViewStyle,
    navBtnDisabled: { opacity: 0.4 },
    navBtnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ACCENT, borderRadius: 16, boxShadow: cbTileShadow(0.06) } as ViewStyle,
    navBtnPrimaryText: { fontFamily: 'Inter_900Black', fontSize: 13, color: INK, textTransform: 'uppercase', letterSpacing: 0.5 },

    reviewCard: { backgroundColor: rgbaFromHex(CARD, 0.9), borderRadius: 18, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 10, gap: 8, boxShadow: cbTileShadow(0.05) } as ViewStyle,
    reviewCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    reviewBadge: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    reviewQuestion: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 14, lineHeight: 20, color: theme.textPrimary },
    reviewAnswer: { fontFamily: 'Inter_400Regular', fontSize: 12, color: DIM, marginLeft: 34 },
    reviewExplanation: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, color: DIM, marginLeft: 34, marginTop: 2, fontStyle: 'italic' },
  });
}
