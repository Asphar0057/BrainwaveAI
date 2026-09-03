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
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import {
  deleteQuestionBankDocument,
  deleteQuestionSet,
  DifficultyMix,
  generateAdaptiveQuestions,
  generatePracticeQuestions,
  generateQuestionsFromCustomContent,
  generateQuestionsFromMultiplePdfs,
  generateQuestionsFromPdf,
  generateRelatedQuestionsFromPdf,
  getQuestionBankDocuments,
  getQuestionSet,
  getQuestionSets,
  PracticeQuestion,
  PreviewQuestion,
  PreviewStats,
  previewGenerateQuestions,
  QBDocument,
  QuestionSetSummary,
  regenerateQuestionPreview,
  savePreviewedQuestions,
  smartGenerateQuestions,
  submitQuestionAnswers,
  uploadQuestionBankPdf,
} from '../services/api';
import AmbientBubbles from '../components/AmbientBubbles';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import MathText from '../components/MathText';
import PulseCubes from '../components/PulseCubes';
import { cbTileShadow, cbTileBorder } from '../components/NeumorphicTexture';
import SectionSidebar, { SidebarItem } from '../components/SectionSidebar';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

const COVER_COLORS = ['#df6b6b', '#69beb8', '#68aac7', '#e99b76', '#8dbfab', '#dcc86d'];

const QUESTION_BANK_SIDEBAR_ITEMS: SidebarItem[] = [
  { key: 'sets', label: 'All Sets' },
  { key: 'generate', label: 'Generate Set' },
];

const QUESTION_TYPE_OPTIONS = ['multiple_choice', 'true_false', 'short_answer', 'fill_blank'];
const QUICK_PROMPTS = [
  { label: 'Match sample style', value: 'Generate questions similar to the sample questions style from my textbook content' },
  { label: 'Practical focus', value: 'Focus on practical applications and real-world scenarios' },
  { label: 'Exam style', value: 'Create exam-style questions with detailed explanations' },
];

function formatDocumentType(documentType?: string | null) {
  const value = String(documentType || '').trim();
  if (!value || value.toLowerCase() === 'unknown') return 'PDF source';
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatQuestionType(type: string) {
  return type.replace(/_/g, ' ');
}

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
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const ink = selectedTheme.isLight ? darkenColor(selectedTheme.accent, 38) : selectedTheme.bgPrimary;
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });
  const [sets, setSets] = useState<QuestionSetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedSet, setSelectedSet] = useState<(QuestionSetSummary & { questions: PracticeQuestion[] }) | null>(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generateMode, setGenerateMode] = useState<'topic' | 'pdf' | 'paste'>('topic');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('mixed');
  const [count, setCount] = useState('10');
  const [generating, setGenerating] = useState(false);

  // Paste-content source
  const [customTitle, setCustomTitle] = useState('');
  const [customContent, setCustomContent] = useState('');
  const [pasteGenerating, setPasteGenerating] = useState(false);

  // PDF sources
  const [documents, setDocuments] = useState<QBDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([]);
  const [referenceDocId, setReferenceDocId] = useState<number | null>(null);
  const [showSmartOptions, setShowSmartOptions] = useState(false);

  // PDF generation settings
  const [pdfCustomPrompt, setPdfCustomPrompt] = useState('');
  const [pdfQuestionCount, setPdfQuestionCount] = useState('10');
  const [pdfDifficultyMix, setPdfDifficultyMix] = useState<DifficultyMix>({ easy: 30, medium: 50, hard: 20 });
  const [pdfQuestionTypes, setPdfQuestionTypes] = useState<string[]>(['multiple_choice', 'true_false', 'short_answer']);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfPreviewing, setPdfPreviewing] = useState(false);
  const [pdfAdaptiveLoading, setPdfAdaptiveLoading] = useState(false);
  const [pdfRelatedLoading, setPdfRelatedLoading] = useState(false);

  // Preview → regenerate → accept
  const [showPreview, setShowPreview] = useState(false);
  const [previewQuestions, setPreviewQuestions] = useState<PreviewQuestion[]>([]);
  const [previewStats, setPreviewStats] = useState<PreviewStats | null>(null);
  const [previewSaving, setPreviewSaving] = useState(false);
  const [regenIndex, setRegenIndex] = useState<number | null>(null);
  const [regenBusyIndex, setRegenBusyIndex] = useState<number | null>(null);
  const [regenFeedback, setRegenFeedback] = useState('');

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

  const pdfDifficultyCounts = useMemo<DifficultyMix>(() => {
    const total = pdfDifficultyMix.easy + pdfDifficultyMix.medium + pdfDifficultyMix.hard;
    if (total === 0) return { easy: 0, medium: 0, hard: 0 };
    const target = Math.max(1, Math.min(100, Number.parseInt(pdfQuestionCount, 10) || 10));
    let easy = Math.round((pdfDifficultyMix.easy / total) * target);
    let medium = Math.round((pdfDifficultyMix.medium / total) * target);
    let hard = Math.round((pdfDifficultyMix.hard / total) * target);
    const diff = target - (easy + medium + hard);
    if (diff !== 0) {
      if (medium >= easy && medium >= hard) medium += diff;
      else if (easy >= hard) easy += diff;
      else hard += diff;
    }
    return { easy, medium, hard };
  }, [pdfDifficultyMix, pdfQuestionCount]);

  const loadDocuments = useCallback(async () => {
    setLoadingDocuments(true);
    try {
      const data = await getQuestionBankDocuments(user.username);
      setDocuments(data.documents ?? []);
    } catch {
      // non-critical: the picker still works without a refreshed list
    } finally {
      setLoadingDocuments(false);
    }
  }, [user.username]);

  useEffect(() => {
    if (showGenerate) loadDocuments();
  }, [showGenerate, loadDocuments]);

  const pickAndUploadPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', multiple: false, copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      setUploadingPdf(true);
      await uploadQuestionBankPdf(user.username, { uri: asset.uri, name: asset.name || 'document.pdf', mimeType: asset.mimeType });
      await loadDocuments();
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Could not upload PDF');
    } finally {
      setUploadingPdf(false);
    }
  };

  const removeDocument = (doc: QBDocument) => {
    Alert.alert('Delete this PDF?', doc.filename, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteQuestionBankDocument(user.username, doc.id);
            setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
            setSelectedDocIds((prev) => prev.filter((id) => id !== doc.id));
            if (referenceDocId === doc.id) setReferenceDocId(null);
          } catch (error) {
            Alert.alert('Delete failed', error instanceof Error ? error.message : 'Could not delete document');
          }
        },
      },
    ]);
  };

  const toggleDocSelection = (docId: number) => {
    setSelectedDocIds((prev) => {
      const isSelected = prev.includes(docId);
      if (isSelected && referenceDocId === docId) setReferenceDocId(null);
      return isSelected ? prev.filter((id) => id !== docId) : [...prev, docId];
    });
  };

  const toggleReferenceDoc = (docId: number) => {
    setReferenceDocId((prev) => (prev === docId ? null : docId));
  };

  const toggleQuestionType = (type: string) => {
    setPdfQuestionTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  };

  const adjustDifficulty = (level: keyof DifficultyMix, delta: number) => {
    setPdfDifficultyMix((prev) => {
      const value = Math.max(0, Math.min(100, prev[level] + delta));
      const others = (['easy', 'medium', 'hard'] as const).filter((l) => l !== level);
      const remaining = 100 - value;
      const othersTotal = others.reduce((sum, l) => sum + prev[l], 0);
      if (othersTotal === 0) {
        return { ...prev, [level]: value, [others[0]]: Math.floor(remaining / 2), [others[1]]: Math.ceil(remaining / 2) } as DifficultyMix;
      }
      const scale = remaining / othersTotal;
      const next: DifficultyMix = { ...prev, [level]: value } as DifficultyMix;
      let allocated = value;
      others.forEach((l, idx) => {
        if (idx === others.length - 1) {
          next[l] = 100 - allocated;
        } else {
          next[l] = Math.round(prev[l] * scale);
          allocated += next[l];
        }
      });
      return next;
    });
  };

  const resetPdfSelections = () => {
    setSelectedDocIds([]);
    setReferenceDocId(null);
    setPdfCustomPrompt('');
    setShowSmartOptions(false);
  };

  const ensurePdfSelectionValid = () => {
    if (selectedDocIds.length === 0) {
      Alert.alert('Select at least one PDF source');
      return false;
    }
    if (pdfQuestionTypes.length === 0) {
      Alert.alert('Select at least one question type');
      return false;
    }
    return true;
  };

  const finishPdfGenerate = async (result: { status?: string; question_set_id?: number }) => {
    if (result.status !== 'success') {
      Alert.alert('Generate questions', 'Could not generate questions.');
      return;
    }
    resetPdfSelections();
    setShowGenerate(false);
    await load();
    if (result.question_set_id) await openSet(result.question_set_id);
  };

  const generateFromPdfSources = async () => {
    if (!ensurePdfSelectionValid()) return;
    setPdfGenerating(true);
    try {
      const selectedDocs = documents.filter((d) => selectedDocIds.includes(d.id));
      const questionCountValue = Math.max(1, Math.min(100, Number.parseInt(pdfQuestionCount, 10) || 10));
      const useSmart = pdfCustomPrompt.trim().length > 0 || referenceDocId != null;
      let result;
      if (useSmart) {
        result = await smartGenerateQuestions({
          userId: user.username,
          sourceIds: selectedDocIds,
          questionCount: questionCountValue,
          difficultyMix: pdfDifficultyCounts,
          title: selectedDocs.length === 1 ? `Questions from ${selectedDocs[0].filename}` : `Smart Questions from ${selectedDocs.length} documents`,
          questionTypes: pdfQuestionTypes,
          customPrompt: pdfCustomPrompt.trim() || null,
          referenceDocumentId: referenceDocId,
          contentDocumentIds: selectedDocIds.filter((id) => id !== referenceDocId),
        });
      } else if (selectedDocIds.length === 1) {
        result = await generateQuestionsFromPdf({
          userId: user.username,
          sourceId: selectedDocIds[0],
          questionCount: questionCountValue,
          difficultyMix: pdfDifficultyCounts,
          questionTypes: pdfQuestionTypes,
        });
      } else {
        result = await generateQuestionsFromMultiplePdfs({
          userId: user.username,
          sourceIds: selectedDocIds,
          questionCount: questionCountValue,
          difficultyMix: pdfDifficultyCounts,
          title: `Questions from ${selectedDocIds.length} documents`,
          questionTypes: pdfQuestionTypes,
        });
      }
      await finishPdfGenerate(result);
    } catch (error) {
      Alert.alert('Generate questions', error instanceof Error ? error.message : 'Failed to generate questions');
    } finally {
      setPdfGenerating(false);
    }
  };

  const generateFromPastedContent = async () => {
    if (!customContent.trim()) {
      Alert.alert('Paste some content first');
      return;
    }
    if (pdfQuestionTypes.length === 0) {
      Alert.alert('Select at least one question type');
      return;
    }
    setPasteGenerating(true);
    try {
      const questionCountValue = Math.max(1, Math.min(100, Number.parseInt(pdfQuestionCount, 10) || 10));
      const result = await generateQuestionsFromCustomContent({
        userId: user.username,
        content: customContent.trim(),
        title: customTitle.trim() || 'Custom Question Set',
        questionCount: questionCountValue,
        difficultyMix: pdfDifficultyCounts,
        questionTypes: pdfQuestionTypes,
        customPrompt: pdfCustomPrompt.trim() || null,
      });
      if (result.status !== 'success') {
        Alert.alert('Generate questions', 'Could not generate questions.');
        return;
      }
      setCustomTitle('');
      setCustomContent('');
      setShowGenerate(false);
      await load();
      if (result.question_set_id) await openSet(result.question_set_id);
    } catch (error) {
      Alert.alert('Generate questions', error instanceof Error ? error.message : 'Failed to generate questions');
    } finally {
      setPasteGenerating(false);
    }
  };

  const previewFromPdfSources = async () => {
    if (!ensurePdfSelectionValid()) return;
    setPdfPreviewing(true);
    try {
      const questionCountValue = Math.max(1, Math.min(100, Number.parseInt(pdfQuestionCount, 10) || 10));
      const result = await previewGenerateQuestions({
        userId: user.username,
        sourceIds: selectedDocIds,
        questionCount: questionCountValue,
        difficultyMix: pdfDifficultyCounts,
        questionTypes: pdfQuestionTypes,
        customPrompt: pdfCustomPrompt.trim() || null,
        referenceDocumentId: referenceDocId,
        contentDocumentIds: selectedDocIds.filter((id) => id !== referenceDocId),
        sessionId: `qb_preview_${user.username}_${Date.now()}`,
      });
      if (result.status === 'success') {
        setPreviewQuestions(result.questions);
        setPreviewStats(result.stats);
        setShowPreview(true);
      }
    } catch (error) {
      Alert.alert('Preview', error instanceof Error ? error.message : 'Failed to generate preview');
    } finally {
      setPdfPreviewing(false);
    }
  };

  const generateAdaptiveFromPdfSources = async () => {
    if (selectedDocIds.length === 0) {
      Alert.alert('Select at least one PDF source');
      return;
    }
    setPdfAdaptiveLoading(true);
    try {
      const questionCountValue = Math.max(1, Math.min(100, Number.parseInt(pdfQuestionCount, 10) || 10));
      const result = await generateAdaptiveQuestions(user.username, selectedDocIds, questionCountValue);
      if (result.status === 'success') {
        const focusTopics = result.weakness_analysis?.recommendations?.focus_topics
          ?? (result.weakness_analysis?.weak_topics ?? []).map((t) => t.topic).filter((t): t is string => Boolean(t));
        setPreviewQuestions(result.questions);
        setPreviewStats({ total: result.questions.length, average_quality_score: 7, adaptive: true, weak_topics: focusTopics });
        setShowPreview(true);
      }
    } catch (error) {
      Alert.alert('Adaptive generate', error instanceof Error ? error.message : 'Failed to generate adaptive questions');
    } finally {
      setPdfAdaptiveLoading(false);
    }
  };

  const generateRelatedFromPdfSources = async () => {
    if (!ensurePdfSelectionValid()) return;
    setPdfRelatedLoading(true);
    try {
      const selectedDocs = documents.filter((d) => selectedDocIds.includes(d.id));
      const questionCountValue = Math.max(1, Math.min(100, Number.parseInt(pdfQuestionCount, 10) || 10));
      const result = await generateRelatedQuestionsFromPdf({
        userId: user.username,
        sourceIds: selectedDocIds,
        questionCount: questionCountValue,
        difficultyMix: pdfDifficultyCounts,
        questionTypes: pdfQuestionTypes,
        title: selectedDocs.length === 1 ? `Related Questions from ${selectedDocs[0].filename}` : `Related Questions from ${selectedDocs.length} documents`,
      });
      if (result.status === 'success') {
        setPreviewQuestions(result.questions ?? []);
        setPreviewStats({
          total: result.questions?.length ?? 0,
          average_quality_score: 7,
          personalized: true,
          weak_topics: result.personalization?.weak_topics ?? [],
          strong_topics: result.personalization?.strong_topics ?? [],
        });
        setShowPreview(true);
      }
    } catch (error) {
      Alert.alert('Related questions', error instanceof Error ? error.message : 'Failed to generate related questions');
    } finally {
      setPdfRelatedLoading(false);
    }
  };

  const regeneratePreviewQuestion = async (index: number) => {
    const question = previewQuestions[index];
    if (!question) return;
    setRegenBusyIndex(index);
    try {
      const result = await regenerateQuestionPreview(user.username, question, regenFeedback.trim() || 'Make it better', selectedDocIds[0] ?? null);
      if (result.regenerated) {
        setPreviewQuestions((prev) => prev.map((q, i) => (i === index ? { ...result.regenerated, quality_score: 7 } : q)));
        setRegenFeedback('');
      }
    } catch (error) {
      Alert.alert('Regenerate', error instanceof Error ? error.message : 'Failed to regenerate question');
    } finally {
      setRegenBusyIndex(null);
    }
  };

  const removePreviewQuestion = (index: number) => {
    setPreviewQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const acceptPreviewQuestions = async () => {
    if (previewQuestions.length === 0) return;
    setPreviewSaving(true);
    try {
      const selectedDocs = documents.filter((d) => selectedDocIds.includes(d.id));
      const title = selectedDocs.length === 1
        ? `Questions from ${selectedDocs[0].filename}`
        : selectedDocs.length > 1
          ? `Questions from ${selectedDocs.length} documents`
          : 'Generated Questions';
      const result = await savePreviewedQuestions(
        user.username,
        previewQuestions,
        title,
        `Generated with AI preview. Quality score: ${previewStats?.average_quality_score ?? 'N/A'}`
      );
      if (result.status === 'success') {
        setShowPreview(false);
        setPreviewQuestions([]);
        setPreviewStats(null);
        resetPdfSelections();
        setShowGenerate(false);
        await load();
        if (result.question_set_id) await openSet(result.question_set_id);
      }
    } catch (error) {
      Alert.alert('Save questions', error instanceof Error ? error.message : 'Failed to save questions');
    } finally {
      setPreviewSaving(false);
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
      <SafeAreaView style={s.root} edges={['top']}>
        <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
        <GeoBackground />
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.topBar}>
            <HapticTouchable onPress={() => setSelectedSet(null)} haptic="selection">
              <Ionicons name="chevron-back" size={22} color={selectedTheme.accentHover} />
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
              <MathText style={s.questionText}>{q.question_text}</MathText>

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
                        <MathText style={[s.optionText, active && s.optionTextActive]}>{option}</MathText>
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
                  {!!(detail?.explanation || q.explanation) && <MathText style={s.explainText}>{detail?.explanation || q.explanation}</MathText>}
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
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <AmbientBubbles theme={selectedTheme} variant="flashcards" opacity={0.72} />
      <View style={s.header}>
        <HapticTouchable onPress={onBack} haptic="selection">
          <Ionicons name="chevron-back" size={22} color={selectedTheme.accentHover} />
        </HapticTouchable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.bankTitle}>question bank</Text>
          <Text style={s.subtitle}>{sets.length} sets · {sets.reduce((sum, set) => sum + questionCount(set), 0)} questions</Text>
        </View>
        <HapticTouchable onPress={() => setSidebarOpen(true)} haptic="selection" accessibilityLabel="Open menu">
          <Ionicons name="menu-outline" size={24} color={selectedTheme.accentHover} />
        </HapticTouchable>
      </View>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={selectedTheme.accent} />}
      >
        <HapticTouchable style={s.generateAction} onPress={() => setShowGenerate(true)} haptic="medium" activeOpacity={0.88}>
          <Ionicons name="add" size={16} color={ink} />
          <Text style={s.generateActionText}>Generate</Text>
        </HapticTouchable>

        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={15} color={selectedTheme.textSecondary} />
          <TextInput value={query} onChangeText={setQuery} placeholder="search sets" placeholderTextColor={selectedTheme.textSecondary} style={s.searchInput} />
        </View>

        {loading ? (
          <View style={s.loading}><PulseCubes color={selectedTheme.accent} size={13} /></View>
        ) : filtered.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="help-circle-outline" size={40} color={selectedTheme.accent} />
            <Text style={s.emptyTitle}>no question sets</Text>
          </View>
        ) : (
          <View style={s.grid}>
            {filtered.map((set, index) => (
              <SetCard
                key={set.id}
                set={set}
                color={COVER_COLORS[index % COVER_COLORS.length]}
                busy={openingId === set.id}
                onOpen={() => openSet(set.id)}
                onDelete={() => removeSet(set)}
                styles={s}
                ink={ink}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={showGenerate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowGenerate(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
          <View style={[s.modalHeader, { paddingTop: insets.top + 12 }]}>
            <Text style={s.modalTitle}>generate questions</Text>
            <HapticTouchable onPress={() => setShowGenerate(false)}><Ionicons name="close" size={22} color={selectedTheme.accent} /></HapticTouchable>
          </View>

          <View style={s.modeTabRow}>
            <HapticTouchable style={[s.modeTab, generateMode === 'topic' && s.modeTabActive]} onPress={() => setGenerateMode('topic')} haptic="selection">
              <Text style={[s.modeTabText, generateMode === 'topic' && s.modeTabTextActive]}>topic</Text>
            </HapticTouchable>
            <HapticTouchable style={[s.modeTab, generateMode === 'pdf' && s.modeTabActive]} onPress={() => setGenerateMode('pdf')} haptic="selection">
              <Text style={[s.modeTabText, generateMode === 'pdf' && s.modeTabTextActive]}>from PDF</Text>
            </HapticTouchable>
            <HapticTouchable style={[s.modeTab, generateMode === 'paste' && s.modeTabActive]} onPress={() => setGenerateMode('paste')} haptic="selection">
              <Text style={[s.modeTabText, generateMode === 'paste' && s.modeTabTextActive]}>paste text</Text>
            </HapticTouchable>
          </View>

          {generateMode === 'topic' ? (
            <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={s.label}>topic</Text>
              <TextInput value={topic} onChangeText={setTopic} placeholder="calculus, biology, react hooks..." placeholderTextColor={selectedTheme.textSecondary} style={s.input} autoFocus />
              <Text style={s.label}>difficulty</Text>
              <View style={s.choiceRow}>
                {['adaptive', 'mixed', 'easy', 'medium', 'hard'].map((item) => (
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
          ) : generateMode === 'pdf' ? (
            <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={s.label}>PDF sources</Text>
              <HapticTouchable style={s.uploadBtn} onPress={pickAndUploadPdf} disabled={uploadingPdf} haptic="medium">
                {uploadingPdf ? <ActivityIndicator color={ink} size="small" /> : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={16} color={ink} />
                    <Text style={s.uploadBtnText}>Choose PDF</Text>
                  </>
                )}
              </HapticTouchable>

              {loadingDocuments ? (
                <View style={s.docLoading}><PulseCubes color={selectedTheme.accent} size={11} /></View>
              ) : documents.length === 0 ? (
                <Text style={s.docEmptyText}>No PDFs yet — upload one to generate questions from it.</Text>
              ) : (
                <View style={s.docGrid}>
                  {documents.map((doc) => {
                    const isSelected = selectedDocIds.includes(doc.id);
                    const topics = doc.analysis?.main_topics?.slice(0, 2) ?? [];
                    return (
                      <HapticTouchable
                        key={doc.id}
                        style={[s.docCard, isSelected && s.docCardSelected]}
                        onPress={() => toggleDocSelection(doc.id)}
                        haptic="selection"
                        activeOpacity={0.85}
                      >
                        <View style={s.docCardTop}>
                          <View style={[s.docCheck, isSelected && s.docCheckActive]}>
                            {isSelected ? <Ionicons name="checkmark" size={11} color={ink} /> : null}
                          </View>
                          <HapticTouchable style={s.docDeleteBtn} onPress={() => removeDocument(doc)} haptic="warning">
                            <Ionicons name="trash-outline" size={12} color={selectedTheme.textSecondary} />
                          </HapticTouchable>
                        </View>
                        <Text style={s.docTitle} numberOfLines={2}>{doc.filename}</Text>
                        <Text style={s.docMeta}>{formatDocumentType(doc.document_type)}</Text>
                        {topics.length > 0 ? (
                          <View style={s.docTopicsRow}>
                            {topics.map((t) => <Text key={t} style={s.docTopicTag} numberOfLines={1}>{t}</Text>)}
                          </View>
                        ) : null}
                      </HapticTouchable>
                    );
                  })}
                </View>
              )}

              {selectedDocIds.length >= 2 ? (
                <HapticTouchable style={[s.choice, showSmartOptions && s.choiceActive]} onPress={() => setShowSmartOptions((v) => !v)} haptic="selection">
                  <Text style={[s.choiceText, showSmartOptions && s.choiceTextActive]}>Smart mode</Text>
                </HapticTouchable>
              ) : null}

              {showSmartOptions && selectedDocIds.length >= 2 ? (
                <View style={s.selectedSourcesList}>
                  {documents.filter((d) => selectedDocIds.includes(d.id)).map((doc) => (
                    <View key={doc.id} style={s.selectedSourceItem}>
                      <Ionicons name="document-text-outline" size={13} color={selectedTheme.textSecondary} />
                      <Text style={s.selectedSourceName} numberOfLines={1}>{doc.filename}</Text>
                      <HapticTouchable
                        style={[s.refToggle, referenceDocId === doc.id && s.refToggleActive]}
                        onPress={() => toggleReferenceDoc(doc.id)}
                        haptic="selection"
                      >
                        <Text style={[s.refToggleText, referenceDocId === doc.id && s.refToggleTextActive]}>
                          {referenceDocId === doc.id ? 'Reference' : 'Set reference'}
                        </Text>
                      </HapticTouchable>
                    </View>
                  ))}
                </View>
              ) : null}

              {selectedDocIds.length > 0 ? (
                <>
                  <Text style={s.label}>custom instructions (optional)</Text>
                  <TextInput
                    value={pdfCustomPrompt}
                    onChangeText={setPdfCustomPrompt}
                    placeholder="e.g. focus on chapters 3-5, or match the sample question style..."
                    placeholderTextColor={selectedTheme.textSecondary}
                    style={s.textarea}
                    multiline
                  />
                  <View style={s.choiceRow}>
                    {QUICK_PROMPTS.map((qp) => (
                      <HapticTouchable key={qp.label} style={s.choice} onPress={() => setPdfCustomPrompt(qp.value)} haptic="selection">
                        <Text style={s.choiceText}>{qp.label}</Text>
                      </HapticTouchable>
                    ))}
                  </View>

                  <Text style={s.label}>question count</Text>
                  <TextInput value={pdfQuestionCount} onChangeText={setPdfQuestionCount} keyboardType="number-pad" placeholder="10" placeholderTextColor={selectedTheme.textSecondary} style={s.input} />

                  <Text style={s.label}>difficulty mix</Text>
                  {(['easy', 'medium', 'hard'] as const).map((level) => (
                    <View key={level} style={s.difficultyRow}>
                      <Text style={s.difficultyLabel}>{level} · {pdfDifficultyCounts[level]} ({pdfDifficultyMix[level]}%)</Text>
                      <View style={s.stepperRow}>
                        <HapticTouchable style={s.stepperBtn} onPress={() => adjustDifficulty(level, -5)} haptic="selection">
                          <Ionicons name="remove" size={14} color={selectedTheme.textPrimary} />
                        </HapticTouchable>
                        <HapticTouchable style={s.stepperBtn} onPress={() => adjustDifficulty(level, 5)} haptic="selection">
                          <Ionicons name="add" size={14} color={selectedTheme.textPrimary} />
                        </HapticTouchable>
                      </View>
                    </View>
                  ))}

                  <Text style={s.label}>question types</Text>
                  <View style={s.choiceRow}>
                    {QUESTION_TYPE_OPTIONS.map((type) => (
                      <HapticTouchable key={type} style={[s.choice, pdfQuestionTypes.includes(type) && s.choiceActive]} onPress={() => toggleQuestionType(type)} haptic="selection">
                        <Text style={[s.choiceText, pdfQuestionTypes.includes(type) && s.choiceTextActive]}>{formatQuestionType(type)}</Text>
                      </HapticTouchable>
                    ))}
                  </View>

                  <HapticTouchable style={s.modalSubmit} onPress={generateFromPdfSources} disabled={pdfGenerating}>
                    {pdfGenerating ? <ActivityIndicator color={selectedTheme.bgPrimary} /> : <Text style={s.primaryText}>generate set</Text>}
                  </HapticTouchable>

                  <View style={s.secondaryActionRow}>
                    <HapticTouchable style={s.secondaryActionBtn} onPress={previewFromPdfSources} disabled={pdfPreviewing} haptic="selection">
                      {pdfPreviewing ? <ActivityIndicator color={selectedTheme.accentHover} size="small" /> : <Text style={s.secondaryActionText}>Preview & refine</Text>}
                    </HapticTouchable>
                    <HapticTouchable style={s.secondaryActionBtn} onPress={generateAdaptiveFromPdfSources} disabled={pdfAdaptiveLoading} haptic="selection">
                      {pdfAdaptiveLoading ? <ActivityIndicator color={selectedTheme.accentHover} size="small" /> : <Text style={s.secondaryActionText}>Adaptive</Text>}
                    </HapticTouchable>
                    <HapticTouchable style={s.secondaryActionBtn} onPress={generateRelatedFromPdfSources} disabled={pdfRelatedLoading} haptic="selection">
                      {pdfRelatedLoading ? <ActivityIndicator color={selectedTheme.accentHover} size="small" /> : <Text style={s.secondaryActionText}>Related</Text>}
                    </HapticTouchable>
                  </View>
                </>
              ) : null}
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={s.label}>question set title</Text>
              <TextInput value={customTitle} onChangeText={setCustomTitle} placeholder="e.g. Physics Chapter 5 Review" placeholderTextColor={selectedTheme.textSecondary} style={s.input} />

              <Text style={s.label}>content</Text>
              <TextInput
                value={customContent}
                onChangeText={setCustomContent}
                placeholder="paste your notes, an article, or any study material — the AI will turn it into practice questions..."
                placeholderTextColor={selectedTheme.textSecondary}
                style={s.textareaLarge}
                multiline
                autoFocus
              />
              <Text style={s.contentMeta}>
                {customContent.trim() ? customContent.trim().split(/\s+/).length : 0} words · {customContent.length} characters
              </Text>

              <Text style={s.label}>custom instructions (optional)</Text>
              <TextInput
                value={pdfCustomPrompt}
                onChangeText={setPdfCustomPrompt}
                placeholder="e.g. ask scenario-based questions, keep explanations short..."
                placeholderTextColor={selectedTheme.textSecondary}
                style={s.textarea}
                multiline
              />
              <View style={s.choiceRow}>
                {QUICK_PROMPTS.map((qp) => (
                  <HapticTouchable key={qp.label} style={s.choice} onPress={() => setPdfCustomPrompt(qp.value)} haptic="selection">
                    <Text style={s.choiceText}>{qp.label}</Text>
                  </HapticTouchable>
                ))}
              </View>

              <Text style={s.label}>question count</Text>
              <TextInput value={pdfQuestionCount} onChangeText={setPdfQuestionCount} keyboardType="number-pad" placeholder="10" placeholderTextColor={selectedTheme.textSecondary} style={s.input} />

              <Text style={s.label}>difficulty mix</Text>
              {(['easy', 'medium', 'hard'] as const).map((level) => (
                <View key={level} style={s.difficultyRow}>
                  <Text style={s.difficultyLabel}>{level} · {pdfDifficultyCounts[level]} ({pdfDifficultyMix[level]}%)</Text>
                  <View style={s.stepperRow}>
                    <HapticTouchable style={s.stepperBtn} onPress={() => adjustDifficulty(level, -5)} haptic="selection">
                      <Ionicons name="remove" size={14} color={selectedTheme.textPrimary} />
                    </HapticTouchable>
                    <HapticTouchable style={s.stepperBtn} onPress={() => adjustDifficulty(level, 5)} haptic="selection">
                      <Ionicons name="add" size={14} color={selectedTheme.textPrimary} />
                    </HapticTouchable>
                  </View>
                </View>
              ))}

              <Text style={s.label}>question types</Text>
              <View style={s.choiceRow}>
                {QUESTION_TYPE_OPTIONS.map((type) => (
                  <HapticTouchable key={type} style={[s.choice, pdfQuestionTypes.includes(type) && s.choiceActive]} onPress={() => toggleQuestionType(type)} haptic="selection">
                    <Text style={[s.choiceText, pdfQuestionTypes.includes(type) && s.choiceTextActive]}>{formatQuestionType(type)}</Text>
                  </HapticTouchable>
                ))}
              </View>

              <HapticTouchable style={s.modalSubmit} onPress={generateFromPastedContent} disabled={pasteGenerating}>
                {pasteGenerating ? <ActivityIndicator color={selectedTheme.bgPrimary} /> : <Text style={s.primaryText}>generate set</Text>}
              </HapticTouchable>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showPreview} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPreview(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
          <View style={[s.modalHeader, { paddingTop: insets.top + 12 }]}>
            <View>
              <Text style={s.modalTitle}>preview questions</Text>
              <Text style={s.subtitle}>review, regenerate, or remove before saving</Text>
            </View>
            <HapticTouchable onPress={() => setShowPreview(false)}><Ionicons name="close" size={22} color={selectedTheme.accent} /></HapticTouchable>
          </View>

          {previewStats ? (
            <View style={s.statsRow}>
              <View style={s.statChip}><Text style={s.statChipText}>{previewStats.total} questions</Text></View>
              {typeof previewStats.average_quality_score === 'number' ? (
                <View style={s.statChip}><Ionicons name="star" size={11} color={selectedTheme.accentHover} /><Text style={s.statChipText}>{previewStats.average_quality_score}/10</Text></View>
              ) : null}
              {previewStats.potential_duplicates ? (
                <View style={[s.statChip, s.statChipWarning]}><Ionicons name="warning-outline" size={11} color={selectedTheme.warning} /><Text style={s.statChipText}>{previewStats.potential_duplicates} similar</Text></View>
              ) : null}
            </View>
          ) : null}

          <ScrollView contentContainerStyle={s.previewBody} keyboardShouldPersistTaps="handled">
            {previewQuestions.map((q, idx) => (
              <View key={idx} style={[s.previewCard, q.is_potential_duplicate && s.previewCardWarning]}>
                <View style={s.questionMetaRow}>
                  <Text style={s.pill}>Q{idx + 1}</Text>
                  <Text style={s.pill}>{q.difficulty || 'medium'}</Text>
                  {typeof q.quality_score === 'number' ? <Text style={s.pill}>★ {q.quality_score.toFixed(1)}</Text> : null}
                  {q.is_potential_duplicate ? <Text style={[s.pill, s.pillWarning]}>similar exists</Text> : null}
                </View>
                <MathText style={s.previewQuestionText}>{q.question_text}</MathText>
                {q.options && q.options.length > 0 ? (
                  <View style={s.options}>
                    {q.options.map((opt, oidx) => (
                      <View key={oidx} style={[s.previewOption, opt === q.correct_answer && s.previewOptionCorrect]}>
                        <MathText style={s.optionText}>{`${String.fromCharCode(65 + oidx)}. ${opt}`}</MathText>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={s.explainText}>answer: {q.correct_answer}</Text>
                )}
                {q.explanation ? <MathText style={s.explainText}>{q.explanation}</MathText> : null}

                <View style={s.regenRow}>
                  <TextInput
                    value={regenIndex === idx ? regenFeedback : ''}
                    onChangeText={(value) => { setRegenIndex(idx); setRegenFeedback(value); }}
                    onFocus={() => setRegenIndex(idx)}
                    placeholder="feedback for regeneration..."
                    placeholderTextColor={selectedTheme.textSecondary}
                    style={s.regenInput}
                  />
                  <HapticTouchable style={s.regenBtn} onPress={() => regeneratePreviewQuestion(idx)} disabled={regenBusyIndex === idx} haptic="selection">
                    {regenBusyIndex === idx ? <ActivityIndicator color={selectedTheme.accentHover} size="small" /> : <Ionicons name="refresh" size={15} color={selectedTheme.accentHover} />}
                  </HapticTouchable>
                  <HapticTouchable style={s.regenBtn} onPress={() => removePreviewQuestion(idx)} haptic="warning">
                    <Ionicons name="trash-outline" size={15} color={selectedTheme.danger} />
                  </HapticTouchable>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={s.previewFooter}>
            <HapticTouchable style={[s.secondaryBtn, { flex: 1 }]} onPress={() => setShowPreview(false)} haptic="selection">
              <Text style={s.secondaryText}>cancel</Text>
            </HapticTouchable>
            <HapticTouchable style={[s.primaryBtn, { flex: 2 }]} onPress={acceptPreviewQuestions} disabled={previewSaving || previewQuestions.length === 0}>
              {previewSaving ? <ActivityIndicator color={selectedTheme.bgPrimary} /> : <Text style={s.primaryText}>save {previewQuestions.length} questions</Text>}
            </HapticTouchable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <SectionSidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pageTitle="question bank"
        items={QUESTION_BANK_SIDEBAR_ITEMS}
        activeKey="sets"
        onSelect={(key) => {
          if (key === 'generate') setShowGenerate(true);
        }}
        footerLabel="Dashboard"
        onFooterPress={onBack}
      />
    </SafeAreaView>
  );
}

function SetCard({ set, color, busy, onOpen, onDelete, styles, ink }: {
  set: QuestionSetSummary;
  color: string;
  busy: boolean;
  onOpen: () => void;
  onDelete: () => void;
  styles: ReturnType<typeof createStyles>;
  ink: string;
}) {
  const best = Math.round(set.best_score || 0);
  return (
    <HapticTouchable style={styles.setCard} onPress={onOpen} haptic="selection" activeOpacity={0.88}>
      <View style={[styles.setCardBanner, { backgroundColor: color }]}>
        <HapticTouchable style={styles.setDeleteBtn} onPress={(event) => { event.stopPropagation(); onDelete(); }} haptic="warning">
          <Ionicons name="trash-outline" size={13} color="#171411" />
        </HapticTouchable>
        <Text style={styles.setCardTitle} numberOfLines={3}>{set.title}</Text>
        <Text style={styles.setCardMeta}>{questionCount(set)} QUESTIONS</Text>
      </View>
      <View style={styles.setCardBody}>
        <View style={styles.cardProgressTop}><Text style={styles.cardProgressLabel}>BEST SCORE</Text><Text style={styles.cardPercent}>{best}%</Text></View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(2, best)}%`, backgroundColor: color }]} /></View>
        <View style={[styles.openBtn, { backgroundColor: color }]}>
          {busy ? <ActivityIndicator color={ink} size="small" /> : (
            <>
              <Text style={[styles.openBtnText, { color: ink }]}>PRACTICE</Text>
              <Ionicons name="chevron-forward" size={15} color={ink} />
            </>
          )}
        </View>
      </View>
    </HapticTouchable>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const surface = theme.panel;
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.16 : 0.18);
  const accentInk = theme.isLight ? darkenColor(theme.accent, 38) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    header: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 18, paddingBottom: 12 },
    bankTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 32, letterSpacing: -0.8 },
    subtitle: { fontFamily: 'Inter_400Regular', fontSize: 10, color: theme.textSecondary, letterSpacing: 2.2, marginTop: 4, textTransform: 'uppercase' },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 10, paddingTop: 14, paddingBottom: 118, gap: 14 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    topMeta: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
    title: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 28, letterSpacing: 0 },
    practiceHeader: { gap: 12 },
    progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: rgbaFromHex(theme.accent, 0.14) },
    progressFill: { height: '100%', backgroundColor: theme.accentHover },
    generateAction: { width: '100%', minHeight: 54, borderRadius: 18, backgroundColor: theme.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    generateActionText: { fontFamily: 'Inter_900Black', color: accentInk, fontSize: 12, letterSpacing: 4, textTransform: 'uppercase' },
    searchBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), paddingHorizontal: 14, boxShadow: cbTileShadow(0.055) } as ViewStyle,
    searchInput: { flex: 1, color: theme.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 14, paddingVertical: 10 },
    loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 100 },
    empty: { alignItems: 'center', paddingVertical: 48, gap: 9 },
    emptyTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 22 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
    setCard: { width: '48%', borderRadius: 17, overflow: 'hidden', boxShadow: cbTileShadow(0.06), ...cbTileBorder(0.14) } as ViewStyle,
    setCardBanner: { minHeight: layout.height >= 820 ? 101 : 88, padding: 10, justifyContent: 'center', alignItems: 'center' },
    setCardTitle: { fontFamily: 'Inter_900Black', color: '#171411', fontSize: 13, lineHeight: 16, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.4 },
    setCardMeta: { fontFamily: 'Inter_700Bold', color: rgbaFromHex('#171411', 0.66), fontSize: 9, letterSpacing: 1, textAlign: 'center', marginTop: 6 },
    setDeleteBtn: { position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    setCardBody: { padding: 12, gap: 9 },
    cardProgressTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    cardProgressLabel: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 9, letterSpacing: 1 },
    cardPercent: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 10 },
    openBtn: { height: 40, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    openBtnText: { fontFamily: 'Inter_900Black', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8 },
    pill: { alignSelf: 'flex-start', borderWidth: 1, borderColor: theme.border, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, color: theme.textSecondary, fontFamily: 'Inter_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
    questionCard: { borderWidth: 1, borderColor: border, borderRadius: 24, backgroundColor: rgbaFromHex(surface, 0.72), padding: 18, gap: 16, boxShadow: cbTileShadow(0.08) } as ViewStyle,
    questionMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    questionText: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 19, lineHeight: 27 },
    options: { gap: 10 },
    option: { backgroundColor: rgbaFromHex(theme.panelAlt, 0.86), borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13, overflow: 'hidden', boxShadow: cbTileShadow(0.04), borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.12) },
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
    resultCard: { borderRadius: 22, borderWidth: 1, borderColor: rgbaFromHex(theme.accent, 0.32), backgroundColor: rgbaFromHex(theme.accent, 0.11), padding: 18, alignItems: 'center', boxShadow: cbTileShadow(0.055) } as ViewStyle,
    resultScore: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 48, letterSpacing: 0 },
    resultText: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.3 },
    practiceActions: { flexDirection: 'row', gap: 12 },
    secondaryBtn: { flex: 1, height: 48, borderRadius: 16, borderWidth: 1, borderColor: border, alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(surface, 0.72), boxShadow: cbTileShadow(0.045) } as ViewStyle,
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
    choice: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: theme.border, backgroundColor: rgbaFromHex(surface, 0.8) },
    choiceActive: { backgroundColor: theme.accent, borderColor: theme.accentHover },
    choiceText: { fontFamily: 'Inter_700Bold', color: theme.accentHover, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1.6 },
    choiceTextActive: { color: accentInk },
    modalSubmit: { height: 52, borderRadius: 14, backgroundColor: theme.accentHover, alignItems: 'center', justifyContent: 'center', marginTop: 8 },

    modeTabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 14 },
    modeTab: { flex: 1, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border, backgroundColor: rgbaFromHex(surface, 0.6) },
    modeTabActive: { borderColor: theme.accent, backgroundColor: rgbaFromHex(theme.accent, 0.14) },
    modeTabText: { fontFamily: 'Inter_700Bold', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: theme.textSecondary },
    modeTabTextActive: { color: theme.accentHover },

    uploadBtn: { minHeight: 46, borderRadius: 13, backgroundColor: theme.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 },
    uploadBtnText: { fontFamily: 'Inter_700Bold', color: accentInk, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.8 },
    docLoading: { alignItems: 'center', paddingVertical: 20 },
    docEmptyText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, textAlign: 'center', paddingVertical: 14 },
    docGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    docCard: { width: '47%', borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.7), padding: 10, gap: 4 },
    docCardSelected: { borderColor: theme.accent, backgroundColor: rgbaFromHex(theme.accent, 0.1) },
    docCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    docCheck: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    docCheckActive: { backgroundColor: theme.accent, borderColor: theme.accent },
    docDeleteBtn: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    docTitle: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 12, lineHeight: 16 },
    docMeta: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.6 },
    docTopicsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
    docTopicTag: { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: theme.accentHover, backgroundColor: rgbaFromHex(theme.accent, 0.13), borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, maxWidth: 100 },

    selectedSourcesList: { gap: 8, marginTop: 8 },
    selectedSourceItem: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 10, paddingVertical: 8 },
    selectedSourceName: { flex: 1, fontFamily: 'Inter_600SemiBold', color: theme.textPrimary, fontSize: 11 },
    refToggle: { borderRadius: 999, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 9, paddingVertical: 5 },
    refToggleActive: { borderColor: theme.accent, backgroundColor: rgbaFromHex(theme.accent, 0.16) },
    refToggleText: { fontFamily: 'Inter_700Bold', fontSize: 9, color: theme.textSecondary, textTransform: 'uppercase' },
    refToggleTextActive: { color: theme.accentHover },

    textarea: { minHeight: 76, borderRadius: 13, borderWidth: 1, borderColor: border, padding: 14, color: theme.textPrimary, backgroundColor: rgbaFromHex(surface, 0.92), fontFamily: 'Inter_600SemiBold', fontSize: 13, textAlignVertical: 'top' },
    textareaLarge: { minHeight: 180, borderRadius: 13, borderWidth: 1, borderColor: border, padding: 14, color: theme.textPrimary, backgroundColor: rgbaFromHex(surface, 0.92), fontFamily: 'Inter_600SemiBold', fontSize: 13, textAlignVertical: 'top' },
    contentMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, color: theme.textSecondary, marginTop: 4, textAlign: 'right' },

    difficultyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
    difficultyLabel: { fontFamily: 'Inter_600SemiBold', color: theme.textPrimary, fontSize: 12, textTransform: 'capitalize' },
    stepperRow: { flexDirection: 'row', gap: 8 },
    stepperBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },

    secondaryActionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    secondaryActionBtn: { flex: 1, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: rgbaFromHex(surface, 0.6) },
    secondaryActionText: { fontFamily: 'Inter_700Bold', color: theme.accentHover, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },

    statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingBottom: 10 },
    statChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 10, paddingVertical: 5 },
    statChipWarning: { borderColor: theme.warning },
    statChipText: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 10 },
    previewBody: { paddingHorizontal: 20, paddingBottom: 24, gap: 14 },
    previewCard: { borderWidth: 1, borderColor: border, borderRadius: 20, backgroundColor: rgbaFromHex(surface, 0.72), padding: 16, gap: 10 },
    previewCardWarning: { borderColor: theme.warning },
    pillWarning: { borderColor: theme.warning, color: theme.warning },
    previewQuestionText: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 15, lineHeight: 21 },
    previewOption: { borderRadius: 12, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 9 },
    previewOptionCorrect: { borderColor: theme.success, backgroundColor: rgbaFromHex(theme.success, 0.12) },
    regenRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    regenInput: { flex: 1, height: 38, borderRadius: 10, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 10, color: theme.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
    regenBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    previewFooter: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: theme.border },
  });
}
