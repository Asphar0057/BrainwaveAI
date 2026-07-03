import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import {
  deleteQuestionSet,
  generatePracticeQuestions,
  getQuestionSet,
  getQuestionSets,
  PracticeQuestion,
  QuestionSetSummary,
  submitQuestionAnswers,
} from '../services/api';
import AmbientBubbles from '../components/AmbientBubbles';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = { user: AuthUser; onBack: () => void };
type ResultDetail = { question_id: number; user_answer: string; correct_answer: string; is_correct: boolean; explanation?: string };
type SubmitResult = { score: number; correct_count: number; total_questions: number; details: ResultDetail[] };

function questionCount(set: QuestionSetSummary) {
  return set.question_count ?? set.total_questions ?? 0;
}

function normalizeOptions(question: PracticeQuestion) {
  return Array.isArray(question.options) ? question.options.filter(Boolean) : [];
}

export default function QuestionBankScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });
  const [sets, setSets] = useState<QuestionSetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedSet, setSelectedSet] = useState<(QuestionSetSummary & { questions: PracticeQuestion[] }) | null>(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('mixed');
  const [count, setCount] = useState('10');
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getQuestionSets(user.username);
      setSets(data.question_sets ?? []);
    } catch (error) {
      Alert.alert('Question bank', error instanceof Error ? error.message : 'Failed to load question sets');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.username]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sets;
    return sets.filter((set) => [set.title, set.description, set.status].filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [query, sets]);

  const openSet = async (setId: number) => {
    setOpeningId(setId);
    try {
      const data = await getQuestionSet(setId, user.username);
      setSelectedSet(data);
      setCurrent(0);
      setAnswers({});
      setResult(null);
    } catch (error) {
      Alert.alert('Question bank', error instanceof Error ? error.message : 'Failed to open set');
    } finally {
      setOpeningId(null);
    }
  };

  const generateSet = async () => {
    if (!topic.trim()) {
      Alert.alert('Enter a topic');
      return;
    }
    setGenerating(true);
    try {
      const questionCountValue = Math.max(3, Math.min(30, Number.parseInt(count, 10) || 10));
      const data = await generatePracticeQuestions({
        userId: user.username,
        topic: topic.trim(),
        questionCount: questionCountValue,
        difficulty,
      });
      setShowGenerate(false);
      setTopic('');
      setCount('10');
      await load();
      await openSet(data.question_set_id || data.id);
    } catch (error) {
      Alert.alert('Generate questions', error instanceof Error ? error.message : 'Failed to generate questions');
    } finally {
      setGenerating(false);
    }
  };

  const removeSet = (set: QuestionSetSummary) => {
    Alert.alert('Delete question set?', set.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteQuestionSet(set.id, user.username);
            setSets((prev) => prev.filter((item) => item.id !== set.id));
          } catch (error) {
            Alert.alert('Delete failed', error instanceof Error ? error.message : 'Could not delete set');
          }
        },
      },
    ]);
  };

  const submit = async () => {
    if (!selectedSet) return;
    const unanswered = selectedSet.questions.filter((q) => !String(answers[String(q.id)] || '').trim()).length;
    if (unanswered > 0) {
      Alert.alert('Finish the set', `${unanswered} question${unanswered === 1 ? '' : 's'} still need an answer.`);
      return;
    }
    try {
      const data = await submitQuestionAnswers(user.username, selectedSet.id, answers);
      setResult(data);
      await load();
    } catch (error) {
      Alert.alert('Submit failed', error instanceof Error ? error.message : 'Could not submit answers');
    }
  };

  if (!fontsLoaded) return null;

  if (selectedSet) {
    const questions = selectedSet.questions ?? [];
    const q = questions[current];
    const options = q ? normalizeOptions(q) : [];
    const progress = questions.length ? ((current + 1) / questions.length) * 100 : 0;
    const detail = result?.details?.find((item) => item.question_id === q?.id);

    return (
      <View style={s.root}>
        <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
        <GeoBackground />
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.topBar}>
            <HapticTouchable style={s.iconBtn} onPress={() => setSelectedSet(null)} haptic="light">
              <Ionicons name="chevron-back" size={18} color={selectedTheme.accent} />
            </HapticTouchable>
            <Text style={s.topMeta}>{current + 1}/{questions.length}</Text>
          </View>

          <View style={s.practiceHeader}>
            <Text style={s.title} numberOfLines={2}>{selectedSet.title}</Text>
            <View style={s.progressTrack}><View style={[s.progressFill, { width: `${progress}%` }]} /></View>
          </View>

          {result ? (
            <View style={s.resultCard}>
              <Text style={s.resultScore}>{Math.round(result.score)}%</Text>
              <Text style={s.resultText}>{result.correct_count}/{result.total_questions} correct</Text>
            </View>
          ) : null}

          {q ? (
            <View style={s.questionCard}>
              <View style={s.questionMetaRow}>
                <Text style={s.pill}>{q.difficulty || 'medium'}</Text>
                <Text style={s.pill}>{q.question_type?.replace('_', ' ') || 'question'}</Text>
              </View>
              <Text style={s.questionText}>{q.question_text}</Text>

              {options.length > 0 ? (
                <View style={s.options}>
                  {options.map((option) => {
                    const active = answers[String(q.id)] === option;
                    const isCorrect = result && option.toLowerCase() === String(detail?.correct_answer || '').toLowerCase();
                    const isWrong = result && active && !detail?.is_correct;
                    return (
                      <HapticTouchable
                        key={option}
                        style={[s.option, active && s.optionActive, isCorrect && s.optionCorrect, isWrong && s.optionWrong]}
                        onPress={() => !result && setAnswers((prev) => ({ ...prev, [q.id]: option }))}
                        haptic="selection"
                      >
                        <Text style={[s.optionText, active && s.optionTextActive]}>{option}</Text>
                      </HapticTouchable>
                    );
                  })}
                </View>
              ) : (
                <TextInput
                  value={answers[String(q.id)] || ''}
                  onChangeText={(value) => setAnswers((prev) => ({ ...prev, [q.id]: value }))}
                  editable={!result}
                  placeholder="type your answer"
                  placeholderTextColor={selectedTheme.textSecondary}
                  style={s.answerInput}
                  multiline
                />
              )}

              {result ? (
                <View style={s.explainBox}>
                  <Text style={[s.resultBadge, detail?.is_correct ? s.correctText : s.wrongText]}>
                    {detail?.is_correct ? 'correct' : 'review'}
                  </Text>
                  <Text style={s.explainText}>answer: {detail?.correct_answer || q.correct_answer || 'not available'}</Text>
                  {!!(detail?.explanation || q.explanation) && <Text style={s.explainText}>{detail?.explanation || q.explanation}</Text>}
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={s.practiceActions}>
            <HapticTouchable style={[s.secondaryBtn, current === 0 && s.disabled]} disabled={current === 0} onPress={() => setCurrent((v) => Math.max(0, v - 1))}>
              <Text style={s.secondaryText}>back</Text>
            </HapticTouchable>
            {current < questions.length - 1 ? (
              <HapticTouchable style={s.primaryBtn} onPress={() => setCurrent((v) => Math.min(questions.length - 1, v + 1))}>
                <Text style={s.primaryText}>next</Text>
              </HapticTouchable>
            ) : (
              <HapticTouchable style={s.primaryBtn} onPress={result ? () => setSelectedSet(null) : submit}>
                <Text style={s.primaryText}>{result ? 'done' : 'submit'}</Text>
              </HapticTouchable>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <AmbientBubbles theme={selectedTheme} variant="flashcards" opacity={0.72} />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={selectedTheme.accent} />}
      >
        <View style={s.topBar}>
          <HapticTouchable style={s.iconBtn} onPress={onBack} haptic="light">
            <Ionicons name="chevron-back" size={18} color={selectedTheme.accent} />
          </HapticTouchable>
          <HapticTouchable style={s.iconBtn} onPress={() => setShowGenerate(true)} haptic="medium">
            <Ionicons name="add" size={20} color={selectedTheme.accent} />
          </HapticTouchable>
        </View>

        <View style={s.hero}>
          <Text style={s.eyebrow}>practice engine</Text>
          <Text style={s.heroTitle}>question bank</Text>
          <Text style={s.heroCopy}>{sets.length} sets · {sets.reduce((sum, set) => sum + questionCount(set), 0)} questions</Text>
        </View>

        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={15} color={selectedTheme.textSecondary} />
          <TextInput value={query} onChangeText={setQuery} placeholder="search sets" placeholderTextColor={selectedTheme.textSecondary} style={s.searchInput} />
        </View>

        {loading ? (
          <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 44 }} />
        ) : filtered.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="help-circle-outline" size={40} color={selectedTheme.accent} />
            <Text style={s.emptyTitle}>no question sets</Text>
            <Text style={s.emptyText}>generate a set from any topic to start practicing</Text>
          </View>
        ) : (
          <View style={s.list}>
            {filtered.map((set) => (
              <HapticTouchable key={set.id} style={s.setCard} onPress={() => openSet(set.id)} activeOpacity={0.82} haptic="selection">
                <View style={s.setTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.setTitle} numberOfLines={2}>{set.title}</Text>
                    <Text style={s.setMeta}>{questionCount(set)} questions · best {Math.round(set.best_score || 0)}%</Text>
                  </View>
                  {openingId === set.id ? <ActivityIndicator color={selectedTheme.accent} /> : <Ionicons name="chevron-forward" size={17} color={selectedTheme.accent} />}
                </View>
                <View style={s.setFooter}>
                  <Text style={s.pill}>{set.status || 'ready'}</Text>
                  <HapticTouchable style={s.deleteBtn} onPress={() => removeSet(set)} haptic="warning">
                    <Ionicons name="trash-outline" size={14} color={selectedTheme.textSecondary} />
                  </HapticTouchable>
                </View>
              </HapticTouchable>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={showGenerate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowGenerate(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>generate questions</Text>
            <HapticTouchable onPress={() => setShowGenerate(false)}><Ionicons name="close" size={22} color={selectedTheme.accent} /></HapticTouchable>
          </View>
          <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>topic</Text>
            <TextInput value={topic} onChangeText={setTopic} placeholder="calculus, biology, react hooks..." placeholderTextColor={selectedTheme.textSecondary} style={s.input} autoFocus />
            <Text style={s.label}>difficulty</Text>
            <View style={s.choiceRow}>
              {['mixed', 'easy', 'medium', 'hard'].map((item) => (
                <HapticTouchable key={item} style={[s.choice, difficulty === item && s.choiceActive]} onPress={() => setDifficulty(item)} haptic="selection">
                  <Text style={[s.choiceText, difficulty === item && s.choiceTextActive]}>{item}</Text>
                </HapticTouchable>
              ))}
            </View>
            <Text style={s.label}>question count</Text>
            <TextInput value={count} onChangeText={setCount} keyboardType="number-pad" placeholder="10" placeholderTextColor={selectedTheme.textSecondary} style={s.input} />
            <HapticTouchable style={s.modalSubmit} onPress={generateSet} disabled={generating}>
              {generating ? <ActivityIndicator color={selectedTheme.bgPrimary} /> : <Text style={s.primaryText}>generate set</Text>}
            </HapticTouchable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const surface = theme.panel;
  const border = theme.borderStrong;
  const accentInk = theme.isLight ? darkenColor(theme.accent, 38) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 118, gap: 14 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    topMeta: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
    iconBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.92), alignItems: 'center', justifyContent: 'center' },
    hero: { borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.94), borderRadius: 16, padding: 20, overflow: 'hidden' },
    eyebrow: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase' },
    heroTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 38, letterSpacing: 0, marginTop: 8 },
    heroCopy: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13, marginTop: 4 },
    title: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 28, letterSpacing: 0 },
    practiceHeader: { gap: 12 },
    progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: rgbaFromHex(theme.accent, 0.14) },
    progressFill: { height: '100%', backgroundColor: theme.accentHover },
    searchBox: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.92), paddingHorizontal: 14 },
    searchInput: { flex: 1, color: theme.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 14, paddingVertical: 10 },
    empty: { alignItems: 'center', paddingVertical: 48, gap: 9 },
    emptyTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 22 },
    emptyText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13, textAlign: 'center' },
    list: { gap: 12 },
    setCard: { borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.94), padding: 16, gap: 14 },
    setTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    setTitle: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 17, letterSpacing: 0 },
    setMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, marginTop: 5 },
    setFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pill: { alignSelf: 'flex-start', borderWidth: 1, borderColor: theme.border, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, color: theme.textSecondary, fontFamily: 'Inter_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
    deleteBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    questionCard: { borderWidth: 1, borderColor: border, borderRadius: 16, backgroundColor: rgbaFromHex(surface, 0.94), padding: 18, gap: 16 },
    questionMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    questionText: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 19, lineHeight: 27 },
    options: { gap: 10 },
    option: { borderWidth: 1, borderColor: theme.border, backgroundColor: rgbaFromHex(theme.panelAlt, 0.86), borderRadius: 13, paddingHorizontal: 14, paddingVertical: 13 },
    optionActive: { borderColor: theme.accent, backgroundColor: rgbaFromHex(theme.accent, 0.12) },
    optionCorrect: { borderColor: theme.success, backgroundColor: rgbaFromHex(theme.success, 0.13) },
    optionWrong: { borderColor: theme.danger, backgroundColor: rgbaFromHex(theme.danger, 0.13) },
    optionText: { color: theme.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 20 },
    optionTextActive: { color: theme.accentHover },
    answerInput: { minHeight: 110, borderWidth: 1, borderColor: theme.border, borderRadius: 13, padding: 14, color: theme.textPrimary, backgroundColor: rgbaFromHex(theme.panelAlt, 0.86), textAlignVertical: 'top', fontFamily: 'Inter_600SemiBold' },
    explainBox: { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 14, gap: 8 },
    resultBadge: { fontFamily: 'Inter_900Black', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.2 },
    correctText: { color: theme.success },
    wrongText: { color: theme.warning },
    explainText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13, lineHeight: 20 },
    resultCard: { borderRadius: 16, borderWidth: 1, borderColor: rgbaFromHex(theme.accent, 0.32), backgroundColor: rgbaFromHex(theme.accent, 0.11), padding: 18, alignItems: 'center' },
    resultScore: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 48, letterSpacing: 0 },
    resultText: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.3 },
    practiceActions: { flexDirection: 'row', gap: 12 },
    secondaryBtn: { flex: 1, height: 48, borderRadius: 13, borderWidth: 1, borderColor: border, alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(surface, 0.9) },
    secondaryText: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.1 },
    primaryBtn: { flex: 1, height: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentHover },
    primaryText: { fontFamily: 'Inter_900Black', color: accentInk, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.1 },
    disabled: { opacity: 0.35 },
    modalRoot: { flex: 1, backgroundColor: theme.bgPrimary },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 12 },
    modalTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 25 },
    modalBody: { padding: 20, paddingBottom: 46, gap: 12 },
    label: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', marginTop: 4 },
    input: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: border, paddingHorizontal: 14, color: theme.textPrimary, backgroundColor: rgbaFromHex(surface, 0.92), fontFamily: 'Inter_600SemiBold' },
    choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    choice: { borderRadius: 999, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: rgbaFromHex(surface, 0.78) },
    choiceActive: { borderColor: theme.accent, backgroundColor: rgbaFromHex(theme.accent, 0.13) },
    choiceText: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 12, textTransform: 'uppercase' },
    choiceTextActive: { color: theme.accentHover },
    modalSubmit: { height: 52, borderRadius: 14, backgroundColor: theme.accentHover, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  });
}
