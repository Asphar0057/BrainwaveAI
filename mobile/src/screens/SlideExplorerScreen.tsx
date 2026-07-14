import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  getUploadedSlides,
  SlideAnalysis,
  UploadedSlide,
  uploadSlides,
} from '../services/api';
import AmbientBubbles from '../components/AmbientBubbles';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
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
          <HapticTouchable style={s.iconBtn} onPress={onBack} haptic="light">
            <Ionicons name="chevron-back" size={18} color={selectedTheme.accent} />
          </HapticTouchable>
          <HapticTouchable style={s.uploadBtn} onPress={pickDecks} disabled={busy === 'upload'} haptic="medium">
            {busy === 'upload' ? <ActivityIndicator color={selectedTheme.bgPrimary} size="small" /> : <Ionicons name="cloud-upload-outline" size={16} color={selectedTheme.bgPrimary} />}
            <Text style={s.uploadText}>upload</Text>
          </HapticTouchable>
        </View>

        <View style={s.hero}>
          <NeumorphicLayer grainOpacity={0.26} />
          <Text style={s.heroGhost}>01</Text>
          <Text style={s.heroTitle}>slide explorer</Text>
          <Text style={s.heroCopy}>{slides.length} decks · {totals} slides ready for analysis</Text>
        </View>

        {selectedDeck ? (
          <View style={s.analysisPanel}>
            <View style={s.analysisHead}>
              <View style={{ flex: 1 }}>
                <Text style={s.sectionTitle} numberOfLines={2}>{shortName(selectedDeck.filename)}</Text>
                <Text style={s.sectionHint}>{analysis ? `${analysis.total_slides} analyzed slides` : 'analysis loading'}</Text>
              </View>
              <HapticTouchable style={s.iconBtn} onPress={() => analyzeDeck(selectedDeck, true)} disabled={busy === `analyze-${selectedDeck.id}`} haptic="selection">
                <Ionicons name="refresh-outline" size={17} color={selectedTheme.accent} />
              </HapticTouchable>
            </View>

            {busy === `analyze-${selectedDeck.id}` && !analysis ? (
              <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginVertical: 28 }} />
            ) : null}

            {analysis?.presentation_summary ? <Text style={s.summaryText}>{analysis.presentation_summary}</Text> : null}

            {analysis?.slides?.length ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.slideTabs}>
                  {analysis.slides.map((item, index) => (
                    <HapticTouchable key={`${item.slide_number}-${index}`} style={[s.slideTab, index === slideIndex && s.slideTabActive]} onPress={() => setSlideIndex(index)} haptic="selection">
                      <Text style={[s.slideTabText, index === slideIndex && s.slideTabTextActive]}>{item.slide_number || index + 1}</Text>
                    </HapticTouchable>
                  ))}
                </ScrollView>

                {current ? (
                  <View style={s.slideCard}>
                    <Text style={s.slideTitle}>{current.title || `Slide ${current.slide_number || slideIndex + 1}`}</Text>
                    <Text style={s.slideBody}>{current.explanation || current.summary || current.content || current.visual_description || 'No text extracted for this slide.'}</Text>
                    {[...asLines(current.key_points), ...asLines(current.key_concepts), ...asLines(current.insights)].slice(0, 8).map((line) => (
                      <View key={line} style={s.pointRow}>
                        <View style={s.pointDot} />
                        <Text style={s.pointText}>{line}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 44 }} />
        ) : slides.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="albums-outline" size={40} color={selectedTheme.accent} />
            <Text style={s.emptyTitle}>no slide decks yet</Text>
            <Text style={s.emptyText}>upload a PDF, PPT, or PPTX to analyze slides and generate practice questions</Text>
          </View>
        ) : (
          <View style={s.list}>
            {slides.map((deck) => (
              <View key={deck.id} style={[s.deckCard, selectedDeck?.id === deck.id && s.deckCardActive]}>
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
        )}
      </ScrollView>
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
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 18, paddingTop: Math.max(topInset + 12, 52), paddingBottom: 118, gap: 14 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    iconBtn: { width: 40, height: 40, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), alignItems: 'center', justifyContent: 'center', boxShadow: cbTileShadow(0.06) },
    uploadBtn: { height: 40, borderRadius: 16, backgroundColor: theme.accentHover, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 7, boxShadow: cbTileShadow(0.055) },
    uploadText: { fontFamily: 'Inter_900Black', color: accentInk, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
    hero: { borderRadius: 30, padding: 20, overflow: 'hidden', boxShadow: cbModalShadow(0.14) } as ViewStyle,
    heroGhost: { position: 'absolute', right: 15, top: 0, fontFamily: 'Inter_900Black', fontSize: layout.isTablet ? 92 : 76, lineHeight: layout.isTablet ? 98 : 82, color: rgbaFromHex(theme.textPrimary, theme.isLight ? 0.035 : 0.055), letterSpacing: -4 },
    eyebrow: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase' },
    heroTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 36, letterSpacing: 0, marginTop: 8 },
    heroCopy: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13, marginTop: 4 },
    analysisPanel: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 15, gap: 13, boxShadow: cbTileShadow(0.08) } as ViewStyle,
    analysisHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    sectionTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 17, letterSpacing: 0 },
    sectionHint: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 18 },
    summaryText: { fontFamily: 'Inter_400Regular', color: theme.textPrimary, fontSize: 13, lineHeight: 21 },
    slideTabs: { gap: 8, paddingVertical: 2 },
    slideTab: { minWidth: 38, height: 36, borderRadius: 12, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(theme.panelAlt, 0.82) },
    slideTabActive: { backgroundColor: theme.accentHover, borderColor: theme.accentHover },
    slideTabText: { fontFamily: 'Inter_900Black', color: theme.textSecondary, fontSize: 12 },
    slideTabTextActive: { color: accentInk },
    slideCard: { borderRadius: 20, borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.12), backgroundColor: rgbaFromHex(theme.panelAlt, 0.78), padding: 14, gap: 10, boxShadow: cbTileShadow(0.045) } as ViewStyle,
    slideTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 16 },
    slideBody: { fontFamily: 'Inter_400Regular', color: theme.textPrimary, fontSize: 13, lineHeight: 21 },
    pointRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    pointDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accentHover, marginTop: 7 },
    pointText: { flex: 1, fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, lineHeight: 18 },
    empty: { alignItems: 'center', paddingVertical: 48, gap: 9 },
    emptyTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 22 },
    emptyText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13, textAlign: 'center', maxWidth: 320, lineHeight: 19 },
    list: { gap: 12 },
    deckCard: { borderRadius: 22, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 15, gap: 13, boxShadow: cbTileShadow(0.07) } as ViewStyle,
    deckCardActive: { borderColor: theme.accentHover, backgroundColor: rgbaFromHex(theme.accent, 0.1) },
    deckTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    deckIcon: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.14), alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(theme.accent, 0.1) },
    deckTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 16, letterSpacing: 0 },
    deckMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, marginTop: 4 },
    deleteBtn: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    actionRow: { flexDirection: 'row', gap: 8 },
    miniAction: { flex: 1, height: 40, borderRadius: 14, borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.14), backgroundColor: rgbaFromHex(theme.panelAlt, 0.78), alignItems: 'center', justifyContent: 'center' },
    miniActionText: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  });
}
