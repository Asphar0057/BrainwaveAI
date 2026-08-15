import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageSourcePropType,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import {
  analyzeSlide,
  deleteSlide,
  generateQuestionsFromSlides,
  getSlideImageSource,
  getUploadedSlides,
  SlideAnalysis,
  UploadedSlide,
  uploadSlides,
} from '../services/api';
import AmbientBubbles from '../components/AmbientBubbles';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import MarkdownText from '../components/MarkdownText';
import { NeumorphicLayer, cbTileShadow, cbModalShadow } from '../components/NeumorphicTexture';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = {
  user: AuthUser;
  onBack: () => void;
  onOpenQuestionBank?: () => void;
};

function shortName(name: string) {
  return name.replace(/\.(pdf|ppt|pptx)$/i, '');
}

function asLines(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

export default function SlideExplorerScreen({ user, onBack, onOpenQuestionBank }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(selectedTheme, layout, insets.top), [selectedTheme, layout, insets.top]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });
  const [slides, setSlides] = useState<UploadedSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedDeck, setSelectedDeck] = useState<UploadedSlide | null>(null);
  const [analysis, setAnalysis] = useState<SlideAnalysis | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [showInsights, setShowInsights] = useState(false);
  const [slideImage, setSlideImage] = useState<ImageSourcePropType | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getUploadedSlides(user.username);
      setSlides(data.slides ?? []);
    } catch (error) {
      Alert.alert('Slide Explorer', error instanceof Error ? error.message : 'Failed to load slides');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.username]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => slides.reduce((sum, slide) => sum + (slide.page_count || 0), 0), [slides]);
  const current = analysis?.slides?.[slideIndex] ?? null;

  useEffect(() => {
    let active = true;
    setSlideImage(null);
    setImageFailed(false);
    setShowInsights(false);
    if (!selectedDeck || !current) return () => { active = false; };
    getSlideImageSource(selectedDeck.id, current.slide_number || slideIndex + 1)
      .then((source) => { if (active) setSlideImage(source); })
      .catch(() => { if (active) setImageFailed(true); });
    return () => { active = false; };
  }, [current, selectedDeck, slideIndex]);

  const goToSlide = (next: number) => {
    if (!analysis?.slides?.length) return;
    setSlideIndex(Math.max(0, Math.min(next, analysis.slides.length - 1)));
  };

  const pickDecks = async () => {
    setBusy('upload');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const files = (result.assets || []).filter((asset) => /\.(pdf|ppt|pptx)$/i.test(asset.name || ''));
      if (!files.length) {
        Alert.alert('Unsupported file', 'Choose a PDF, PPT, or PPTX deck.');
        return;
      }
      await uploadSlides(files.map((asset) => ({ uri: asset.uri, name: asset.name || 'deck.pdf', mimeType: asset.mimeType })));
      Alert.alert('Slides uploaded', `${files.length} deck${files.length === 1 ? '' : 's'} added.`);
      await load();
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Could not upload slide deck');
    } finally {
      setBusy(null);
    }
  };

  const analyzeDeck = async (deck: UploadedSlide, force = false) => {
    setBusy(`analyze-${deck.id}`);
    setSelectedDeck(deck);
    setAnalysis(null);
    setSlideIndex(0);
    setShowInsights(false);
    try {
      const data = await analyzeSlide(deck.id, force);
      setAnalysis(data);
    } catch (error) {
      Alert.alert('Analysis failed', error instanceof Error ? error.message : 'Could not analyze this deck');
    } finally {
      setBusy(null);
    }
  };

  const removeDeck = (deck: UploadedSlide) => {
    Alert.alert('Delete deck?', deck.filename, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(`delete-${deck.id}`);
          try {
            await deleteSlide(deck.id);
            if (selectedDeck?.id === deck.id) {
              setSelectedDeck(null);
              setAnalysis(null);
            }
            await load();
          } catch (error) {
            Alert.alert('Delete failed', error instanceof Error ? error.message : 'Could not delete deck');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const makeQuestions = async (deck: UploadedSlide) => {
    setBusy(`quiz-${deck.id}`);
    try {
      const result = await generateQuestionsFromSlides({ userId: user.username, slideIds: [deck.id], questionCount: 10 });
      Alert.alert('Questions created', `${result.question_count || 10} questions added to Question Bank.`);
      onOpenQuestionBank?.();
    } catch (error) {
      Alert.alert('Question generation failed', error instanceof Error ? error.message : 'Could not create questions from this deck');
    } finally {
      setBusy(null);
    }
  };

  if (!fontsLoaded) return null;

  const summary = analysis?.presentation_summary;
  const summaryStats = typeof summary === 'object' && summary ? [
    { icon: 'bulb-outline' as const, value: summary.total_concepts ?? 0, label: 'concepts' },
    { icon: 'help-circle-outline' as const, value: summary.total_exam_questions ?? 0, label: 'questions' },
    { icon: 'time-outline' as const, value: summary.estimated_total_study_time || '—', label: 'study time' },
  ] : [];
  const explanation = current?.detailed_explanation || current?.explanation || current?.summary || current?.content || current?.visual_description || '';
  const insightCount = (current?.key_concepts?.length || 0)
    + Object.keys(current?.definitions || {}).length
    + (current?.exam_questions?.length || 0)
    + (current?.study_tips?.length || 0);

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <AmbientBubbles theme={selectedTheme} variant="paths" opacity={0.72} />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={selectedTheme.accent} />}
      >
        <View style={s.topBar}>
          <HapticTouchable style={s.iconBtn} onPress={selectedDeck ? () => { setSelectedDeck(null); setAnalysis(null); } : onBack} haptic="light">
            <Ionicons name="chevron-back" size={18} color={selectedTheme.accent} />
          </HapticTouchable>
          {selectedDeck ? (
            <>
              <View style={s.readerTopInfo}>
                <Text style={s.readerTopTitle} numberOfLines={1}>{shortName(selectedDeck.filename)}</Text>
                <Text style={s.readerTopMeta}>{analysis ? `${slideIndex + 1} of ${analysis.total_slides}` : 'preparing study guide'}</Text>
              </View>
              <HapticTouchable style={s.iconBtn} onPress={() => analyzeDeck(selectedDeck, true)} disabled={busy === `analyze-${selectedDeck.id}`} haptic="selection">
                {busy === `analyze-${selectedDeck.id}` ? <ActivityIndicator color={selectedTheme.accent} size="small" /> : <Ionicons name="refresh-outline" size={17} color={selectedTheme.accent} />}
              </HapticTouchable>
            </>
          ) : (
            <HapticTouchable style={s.uploadBtn} onPress={pickDecks} disabled={busy === 'upload'} haptic="medium">
              {busy === 'upload' ? <ActivityIndicator color={selectedTheme.bgPrimary} size="small" /> : <Ionicons name="cloud-upload-outline" size={16} color={selectedTheme.bgPrimary} />}
              <Text style={s.uploadText}>upload</Text>
            </HapticTouchable>
          )}
        </View>

        {!selectedDeck ? (
          <View style={s.hero}>
            <NeumorphicLayer grainOpacity={0.26} />
            <Text style={s.heroGhost}>01</Text>
            <Text style={s.eyebrow}>YOUR DECK LIBRARY</Text>
            <Text style={s.heroTitle}>slide explorer</Text>
            <Text style={s.heroCopy}>{slides.length} decks · {totals} slides ready for analysis</Text>
          </View>
        ) : null}

        {selectedDeck ? (
          <View style={s.analysisPanel}>
            {busy === `analyze-${selectedDeck.id}` && !analysis ? (
              <View style={s.analysisLoading}>
                <ActivityIndicator color={selectedTheme.accent} size="large" />
                <Text style={s.analysisLoadingTitle}>building your study guide</Text>
                <Text style={s.analysisLoadingCopy}>Reading slides and organizing the key ideas.</Text>
              </View>
            ) : null}

            {summaryStats.length ? (
              <View style={s.summaryStrip}>
                {summaryStats.map((item, index) => (
                  <View key={item.label} style={s.summaryItem}>
                    {index > 0 ? <View style={s.summaryDivider} /> : null}
                    <Text style={s.summaryValue}>{item.value}</Text>
                    <Text style={s.summaryLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            ) : typeof summary === 'string' ? <Text style={s.summaryText}>{summary}</Text> : null}

            {analysis?.slides?.length ? (
              <>
                {current ? (
                  <>
                    <View style={s.slideFrame}>
                      {slideImage && !imageFailed ? (
                        <Image source={slideImage} style={s.slideImage} resizeMode="contain" onError={() => setImageFailed(true)} />
                      ) : (
                        <View style={s.imageFallback}>
                          {slideImage === null && !imageFailed ? <ActivityIndicator color={selectedTheme.accent} /> : <Ionicons name="document-text-outline" size={32} color={selectedTheme.accent} />}
                          <Text style={s.imageFallbackText}>slide {current.slide_number || slideIndex + 1}</Text>
                        </View>
                      )}
                    </View>

                    <View style={s.navRow}>
                      <HapticTouchable style={[s.navButton, slideIndex === 0 && s.navButtonDisabled]} onPress={() => goToSlide(slideIndex - 1)} disabled={slideIndex === 0} haptic="selection">
                        <Ionicons name="chevron-back" size={17} color={slideIndex === 0 ? selectedTheme.textSecondary : selectedTheme.accentHover} />
                      </HapticTouchable>
                      <View style={s.navCenter}>
                        <Text style={s.navTitle} numberOfLines={1}>{current.title || `Slide ${current.slide_number || slideIndex + 1}`}</Text>
                        <Text style={s.navCount}>SLIDE {slideIndex + 1} OF {analysis.slides.length}</Text>
                      </View>
                      <HapticTouchable style={[s.navButton, slideIndex === analysis.slides.length - 1 && s.navButtonDisabled]} onPress={() => goToSlide(slideIndex + 1)} disabled={slideIndex === analysis.slides.length - 1} haptic="selection">
                        <Ionicons name="chevron-forward" size={17} color={slideIndex === analysis.slides.length - 1 ? selectedTheme.textSecondary : selectedTheme.accentHover} />
                      </HapticTouchable>
                    </View>

                    <View style={s.slideCard}>
                      <View style={s.slideTitleRow}>
                        <Text style={s.slideKicker}>AI EXPLANATION</Text>
                        {current.estimated_study_time ? <Text style={s.studyTime}>{current.estimated_study_time}</Text> : null}
                      </View>
                      {explanation ? <MarkdownText>{explanation}</MarkdownText> : <Text style={s.slideBody}>No analysis is available for this slide yet.</Text>}
                      {!current.detailed_explanation ? [...asLines(current.key_points), ...asLines(current.insights)].slice(0, 6).map((line, index) => (
                        <View key={`${line}-${index}`} style={s.pointRow}>
                          <View style={s.pointDot} />
                          <Text style={s.pointText}>{line}</Text>
                        </View>
                      )) : null}
                    </View>

                    {insightCount ? (
                      <View style={s.insightsWrap}>
                        <HapticTouchable style={s.insightsToggle} onPress={() => setShowInsights((value) => !value)} haptic="selection">
                          <View style={s.insightsToggleLead}>
                            <View style={s.insightIcon}><Ionicons name="sparkles" size={15} color={selectedTheme.accentHover} /></View>
                            <View><Text style={s.insightsTitle}>slide insights</Text><Text style={s.insightsHint}>{insightCount} study items</Text></View>
                          </View>
                          <Ionicons name={showInsights ? 'chevron-up' : 'chevron-down'} size={17} color={selectedTheme.accentHover} />
                        </HapticTouchable>

                        {showInsights ? (
                          <View style={s.insightsBody}>
                            {current.key_concepts?.length ? <InsightSection title="key concepts" icon="bulb-outline" styles={s}>{current.key_concepts.map((concept) => <View key={concept} style={s.conceptChip}><Text style={s.conceptText}>{concept}</Text></View>)}</InsightSection> : null}
                            {Object.keys(current.definitions || {}).length ? <InsightSection title="definitions" icon="book-outline" styles={s}>{Object.entries(current.definitions || {}).map(([term, definition]) => <View key={term} style={s.definitionCard}><Text style={s.definitionTerm}>{term}</Text><Text style={s.definitionText}>{definition}</Text></View>)}</InsightSection> : null}
                            {current.exam_questions?.length ? <InsightSection title="practice questions" icon="help-circle-outline" styles={s}>{current.exam_questions.map((question, index) => <View key={`${question.question}-${index}`} style={s.questionCard}><View style={s.questionTop}><Text style={s.questionNumber}>Q{index + 1}</Text><Text style={s.difficulty}>{question.difficulty || 'practice'}</Text></View><Text style={s.questionText}>{question.question}</Text>{question.answer_hint ? <Text style={s.hintText}>Hint · {question.answer_hint}</Text> : null}</View>)}</InsightSection> : null}
                            {current.study_tips?.length ? <InsightSection title="study tips" icon="bookmark-outline" styles={s}>{current.study_tips.map((tip, index) => <View key={`${tip}-${index}`} style={s.tipRow}><Text style={s.tipNumber}>{String(index + 1).padStart(2, '0')}</Text><Text style={s.tipText}>{tip}</Text></View>)}</InsightSection> : null}
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}

        {!selectedDeck && loading ? (
          <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 44 }} />
        ) : !selectedDeck && slides.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="albums-outline" size={40} color={selectedTheme.accent} />
            <Text style={s.emptyTitle}>no slide decks yet</Text>
            <Text style={s.emptyText}>upload a PDF, PPT, or PPTX to analyze slides and generate practice questions</Text>
          </View>
        ) : !selectedDeck ? (
          <View style={s.list}>
            {slides.map((deck) => (
              <View key={deck.id} style={s.deckCard}>
                <View style={s.deckTop}>
                  <View style={s.deckIcon}>
                    <Ionicons name="easel-outline" size={18} color={selectedTheme.accentHover} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.deckTitle} numberOfLines={2}>{shortName(deck.filename)}</Text>
                    <Text style={s.deckMeta}>{deck.page_count || 0} slides · {deck.processing_status || 'ready'}</Text>
                  </View>
                  <HapticTouchable style={s.deleteBtn} onPress={() => removeDeck(deck)} haptic="warning">
                    {busy === `delete-${deck.id}` ? <ActivityIndicator color={selectedTheme.danger} size="small" /> : <Ionicons name="trash-outline" size={15} color={selectedTheme.danger} />}
                  </HapticTouchable>
                </View>
                <View style={s.actionRow}>
                  <MiniAction label="analyze" onPress={() => analyzeDeck(deck)} busy={busy === `analyze-${deck.id}`} styles={s} />
                  <MiniAction label="quiz" onPress={() => makeQuestions(deck)} busy={busy === `quiz-${deck.id}`} styles={s} />
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function InsightSection({ title, icon, children, styles }: { title: string; icon: React.ComponentProps<typeof Ionicons>['name']; children: React.ReactNode; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.insightSection}>
      <View style={styles.insightSectionHead}><Ionicons name={icon} size={15} color={styles.insightSectionTitle.color} /><Text style={styles.insightSectionTitle}>{title}</Text></View>
      <View style={styles.insightSectionContent}>{children}</View>
    </View>
  );
}

function MiniAction({ label, onPress, busy, styles }: { label: string; onPress: () => void; busy?: boolean; styles: ReturnType<typeof createStyles> }) {
  return (
    <HapticTouchable style={styles.miniAction} onPress={onPress} disabled={busy} haptic="medium">
      {busy ? <ActivityIndicator color={styles.miniActionText.color} size="small" /> : <Text style={styles.miniActionText}>{label}</Text>}
    </HapticTouchable>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>, topInset: number) {
  const surface = theme.panel;
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.16 : 0.18);
  const accentInk = theme.isLight ? darkenColor(theme.accent, 38) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 5, paddingTop: Math.max(topInset + 12, 52), paddingBottom: 118, gap: 4 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    iconBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), alignItems: 'center', justifyContent: 'center', boxShadow: cbTileShadow(0.06) },
    uploadBtn: { height: 40, borderRadius: 12, backgroundColor: theme.accentHover, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 4, boxShadow: cbTileShadow(0.055) },
    uploadText: { fontFamily: 'Inter_900Black', color: accentInk, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
    readerTopInfo: { flex: 1, paddingHorizontal: 12 },
    readerTopTitle: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 14, textAlign: 'center' },
    readerTopMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10, textAlign: 'center', marginTop: 2 },
    hero: { borderRadius: 22, padding: 20, overflow: 'hidden', boxShadow: cbModalShadow(0.14) } as ViewStyle,
    heroGhost: { position: 'absolute', right: 15, top: 0, fontFamily: 'Inter_900Black', fontSize: layout.isTablet ? 92 : 76, lineHeight: layout.isTablet ? 98 : 82, color: rgbaFromHex(theme.textPrimary, theme.isLight ? 0.035 : 0.055), letterSpacing: -4 },
    eyebrow: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase' },
    heroTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 36, letterSpacing: 0, marginTop: 8 },
    heroCopy: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13, marginTop: 4 },
    analysisPanel: { gap: 5 },
    analysisLoading: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 4 },
    analysisLoadingTitle: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 15, marginTop: 8 },
    analysisLoadingCopy: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, textAlign: 'center' },
    summaryText: { fontFamily: 'Inter_400Regular', color: theme.textPrimary, fontSize: 13, lineHeight: 21 },
    summaryStrip: { minHeight: 48, borderTopWidth: 1, borderBottomWidth: 1, borderColor: border, flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
    summaryItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    summaryDivider: { position: 'absolute', left: 0, width: 1, height: 24, backgroundColor: border },
    summaryValue: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 13 },
    summaryLabel: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 8, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.7 },
    slideFrame: { width: '100%', aspectRatio: 16 / 9, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(theme.panelAlt, 0.96), boxShadow: cbTileShadow(0.08) } as ViewStyle,
    slideImage: { width: '100%', height: '100%', backgroundColor: '#ffffff' },
    imageFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
    imageFallbackText: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
    navRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    navButton: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(theme.panelAlt, 0.72), alignItems: 'center', justifyContent: 'center' },
    navButtonDisabled: { opacity: 0.38 },
    navCenter: { flex: 1, alignItems: 'center' },
    navTitle: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 13, maxWidth: '100%' },
    navCount: { textAlign: 'center', fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 8, letterSpacing: 1, marginTop: 3 },
    slideCard: { borderTopWidth: 1, borderColor: border, paddingTop: 18, gap: 4 },
    slideTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4 },
    slideKicker: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 9, letterSpacing: 1.2 },
    studyTime: { fontFamily: 'Inter_600SemiBold', color: theme.accent, fontSize: 10 },
    slideBody: { fontFamily: 'Inter_400Regular', color: theme.textPrimary, fontSize: 13, lineHeight: 21 },
    pointRow: { flexDirection: 'row', gap: 4, alignItems: 'flex-start' },
    pointDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accentHover, marginTop: 7 },
    pointText: { flex: 1, fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, lineHeight: 18 },
    insightsWrap: { borderRadius: 16, borderWidth: 1, borderColor: border, overflow: 'hidden', backgroundColor: rgbaFromHex(theme.panelAlt, 0.7) },
    insightsToggle: { minHeight: 62, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    insightsToggleLead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    insightIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(theme.accent, 0.12) },
    insightsTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 13 },
    insightsHint: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10, marginTop: 2 },
    insightsBody: { padding: 13, paddingTop: 0, gap: 5 },
    insightSection: { gap: 4 },
    insightSectionHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    insightSectionTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
    insightSectionContent: { gap: 4, flexDirection: 'row', flexWrap: 'wrap' },
    conceptChip: { borderRadius: 9, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(theme.accent, 0.08), paddingHorizontal: 10, paddingVertical: 7 },
    conceptText: { fontFamily: 'Inter_600SemiBold', color: theme.textPrimary, fontSize: 11 },
    definitionCard: { width: '100%', borderRadius: 11, borderWidth: 1, borderColor: border, padding: 11, backgroundColor: rgbaFromHex(surface, 0.64) },
    definitionTerm: { fontFamily: 'Inter_700Bold', color: theme.accentHover, fontSize: 12, marginBottom: 4 },
    definitionText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, lineHeight: 18 },
    questionCard: { width: '100%', borderRadius: 11, borderWidth: 1, borderColor: border, padding: 11, gap: 4, backgroundColor: rgbaFromHex(surface, 0.64) },
    questionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    questionNumber: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 10 },
    difficulty: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.7 },
    questionText: { fontFamily: 'Inter_600SemiBold', color: theme.textPrimary, fontSize: 12, lineHeight: 18 },
    hintText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, lineHeight: 17 },
    tipRow: { width: '100%', flexDirection: 'row', gap: 4, alignItems: 'flex-start' },
    tipNumber: { width: 24, fontFamily: 'Inter_900Black', color: theme.accent, fontSize: 10, lineHeight: 18 },
    tipText: { flex: 1, fontFamily: 'Inter_400Regular', color: theme.textPrimary, fontSize: 12, lineHeight: 18 },
    empty: { alignItems: 'center', paddingVertical: 48, gap: 4 },
    emptyTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 22 },
    emptyText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13, textAlign: 'center', maxWidth: 320, lineHeight: 19 },
    list: { gap: 4 },
    deckCard: { borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 15, gap: 4, boxShadow: cbTileShadow(0.07) } as ViewStyle,
    deckCardActive: { borderColor: theme.accentHover, backgroundColor: rgbaFromHex(theme.accent, 0.1) },
    deckTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    deckIcon: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.14), alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(theme.accent, 0.1) },
    deckTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 16, letterSpacing: 0 },
    deckMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, marginTop: 4 },
    deleteBtn: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    actionRow: { flexDirection: 'row', gap: 4 },
    miniAction: { flex: 1, height: 40, borderRadius: 14, borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.14), backgroundColor: rgbaFromHex(theme.panelAlt, 0.78), alignItems: 'center', justifyContent: 'center' },
    miniActionText: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  });
}
