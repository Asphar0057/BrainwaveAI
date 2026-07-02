import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Animated,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import PagerView from 'react-native-pager-view';
import HapticTouchable from '../components/HapticTouchable';
import AmbientBubbles from '../components/AmbientBubbles';
import { AuthUser } from '../services/auth';
import { useAppTheme } from '../contexts/ThemeContext';
import {
  createFlashcard,
  createFlashcardSet,
  generateFlashcards,
  getFlashcardHistory,
  getFlashcardsInSet,
  getFlashcardStatistics,
} from '../services/api';
import { triggerHaptic } from '../utils/haptics';
import { darkenColor, getDefaultTheme, rgbaFromHex } from '../utils/theme';
import { getResponsiveLayout, useResponsiveLayout } from '../hooks/useResponsiveLayout';

const DEFAULT_THEME = getDefaultTheme();
const DEFAULT_LAYOUT = getResponsiveLayout(393, 852);
let CURRENT_THEME = DEFAULT_THEME;
let CURRENT_LAYOUT = DEFAULT_LAYOUT;
let BG = DEFAULT_THEME.bgPrimary;
let SURFACE = DEFAULT_THEME.panel;
let SURFACE_2 = DEFAULT_THEME.panelAlt;
let QUESTION_SURFACE = DEFAULT_THEME.isLight ? DEFAULT_THEME.accent : DEFAULT_THEME.primary;
let ANSWER_SURFACE = DEFAULT_THEME.isLight ? DEFAULT_THEME.panel : DEFAULT_THEME.accent;
let ACCENT = DEFAULT_THEME.accent;
let ACCENT2 = DEFAULT_THEME.accentHover;
let GOLD_L = DEFAULT_THEME.accentHover;
let GOLD_D = darkenColor(DEFAULT_THEME.accent, DEFAULT_THEME.isLight ? 10 : 26);
let GOLD_XD = darkenColor(DEFAULT_THEME.accent, DEFAULT_THEME.isLight ? 26 : 40);
let BORDER = DEFAULT_THEME.borderStrong;
let DIM = DEFAULT_THEME.panelMuted;
let DIM2 = DEFAULT_THEME.textSecondary;
let INK = DEFAULT_THEME.isLight ? darkenColor(DEFAULT_THEME.accent, 45) : darkenColor(DEFAULT_THEME.primary, 2);
let QUESTION_TEXT = DEFAULT_THEME.isLight ? darkenColor(DEFAULT_THEME.primary, 90) : DEFAULT_THEME.accentHover;
let ANSWER_TEXT = DEFAULT_THEME.isLight ? DEFAULT_THEME.accent : darkenColor(DEFAULT_THEME.primary, 4);
let QUESTION_CHIP_BG = DEFAULT_THEME.isLight ? rgbaFromHex(DEFAULT_THEME.primary, 0.16) : rgbaFromHex(DEFAULT_THEME.accent, 0.12);
let QUESTION_CHIP_BORDER = DEFAULT_THEME.isLight ? rgbaFromHex(DEFAULT_THEME.primary, 0.24) : rgbaFromHex(DEFAULT_THEME.accent, 0.28);
let ANSWER_CHIP_BG = DEFAULT_THEME.isLight ? rgbaFromHex(DEFAULT_THEME.accent, 0.08) : rgbaFromHex(DEFAULT_THEME.primary, 0.16);
let ANSWER_CHIP_BORDER = DEFAULT_THEME.isLight ? rgbaFromHex(DEFAULT_THEME.accent, 0.2) : rgbaFromHex(DEFAULT_THEME.primary, 0.24);
let BASE_ACTION_BG = DEFAULT_THEME.isLight ? rgbaFromHex(DEFAULT_THEME.panel, 0.98) : DEFAULT_THEME.accent;
let BASE_ACTION_TEXT = DEFAULT_THEME.isLight ? DEFAULT_THEME.accent : darkenColor(DEFAULT_THEME.primary, 2);
let BASE_ACTION_BORDER = DEFAULT_THEME.isLight ? DEFAULT_THEME.borderStrong : DEFAULT_THEME.accentHover;
let INPUT_BG = DEFAULT_THEME.isLight ? rgbaFromHex(DEFAULT_THEME.panel, 0.98) : DEFAULT_THEME.panelAlt;
let INPUT_TEXT = DEFAULT_THEME.isLight ? darkenColor(DEFAULT_THEME.primary, 88) : DEFAULT_THEME.accentHover;
let GREEN = DEFAULT_THEME.success;
let RED = DEFAULT_THEME.danger;

type FlashcardSet = {
  id: number;
  title: string;
  description: string;
  card_count: number;
  accuracy_percentage: number;
  source_type: string;
  created_at: string;
};

type Flashcard = {
  id: number;
  question: string;
  answer: string;
  difficulty: string;
};

type ManualDraftCard = {
  question: string;
  answer: string;
};

type Difficulty = 'easy' | 'medium' | 'hard';
type CreateMode = 'ai' | 'manual';

type Props = { user: AuthUser; onBack?: () => void };
type FlashcardsStackParamList = {
  FlashcardsSets: undefined;
  FlashcardsCreate: { mode?: CreateMode } | undefined;
  FlashcardsStudy: { set: FlashcardSet; cards: Flashcard[] };
  FlashcardsResults: { set: FlashcardSet; cards: Flashcard[]; stats: { correct: number; incorrect: number } };
};

const FlashcardsStack = createNativeStackNavigator<FlashcardsStackParamList>();

const difficultyOptions: Difficulty[] = ['easy', 'medium', 'hard'];
const cardCountOptions = [5, 10, 15, 20];

function applyTheme(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  CURRENT_THEME = theme;
  BG = theme.bgPrimary;
  SURFACE = theme.panel;
  SURFACE_2 = theme.panelAlt;
  QUESTION_SURFACE = theme.isLight ? theme.accent : theme.primary;
  ANSWER_SURFACE = theme.isLight ? theme.panel : theme.accent;
  ACCENT = theme.accent;
  ACCENT2 = theme.accentHover;
  GOLD_L = theme.accentHover;
  GOLD_D = darkenColor(theme.accent, theme.isLight ? 10 : 26);
  GOLD_XD = darkenColor(theme.accent, theme.isLight ? 26 : 40);
  BORDER = theme.borderStrong;
  DIM = theme.panelMuted;
  DIM2 = theme.textSecondary;
  INK = theme.isLight ? darkenColor(theme.accent, 45) : darkenColor(theme.primary, 2);
  QUESTION_TEXT = theme.isLight ? darkenColor(theme.primary, 90) : theme.accentHover;
  ANSWER_TEXT = theme.isLight ? theme.accent : darkenColor(theme.primary, 4);
  QUESTION_CHIP_BG = theme.isLight ? rgbaFromHex(theme.primary, 0.16) : rgbaFromHex(theme.accent, 0.12);
  QUESTION_CHIP_BORDER = theme.isLight ? rgbaFromHex(theme.primary, 0.24) : rgbaFromHex(theme.accent, 0.28);
  ANSWER_CHIP_BG = theme.isLight ? rgbaFromHex(theme.accent, 0.08) : rgbaFromHex(theme.primary, 0.16);
  ANSWER_CHIP_BORDER = theme.isLight ? rgbaFromHex(theme.accent, 0.2) : rgbaFromHex(theme.primary, 0.24);
  BASE_ACTION_BG = theme.isLight ? rgbaFromHex(theme.panel, 0.98) : theme.accent;
  BASE_ACTION_TEXT = theme.isLight ? theme.accent : darkenColor(theme.primary, 2);
  BASE_ACTION_BORDER = theme.isLight ? theme.borderStrong : theme.accentHover;
  INPUT_BG = theme.isLight ? rgbaFromHex(theme.panel, 0.98) : theme.panelAlt;
  INPUT_TEXT = theme.isLight ? darkenColor(theme.primary, 88) : theme.accentHover;
  GREEN = theme.success;
  RED = theme.danger;
}

function buildSetDraft(input: Partial<FlashcardSet> & { id: number; title: string; card_count: number; source_type: string }): FlashcardSet {
  return {
    description: '',
    accuracy_percentage: 0,
    created_at: new Date().toISOString(),
    ...input,
  };
}

function ResultsView({
  stats,
  onBack,
  onRestart,
}: {
  stats: { correct: number; incorrect: number };
  onBack: () => void;
  onRestart: () => void;
}) {
  const total = stats.correct + stats.incorrect;
  const pct = total > 0 ? Math.round((stats.correct / total) * 100) : 0;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AmbientBubbles theme={CURRENT_THEME} variant="flashcards" opacity={0.84} />
      <View style={s.studyHeader}>
        <HapticTouchable onPress={onBack} haptic="selection">
          <Ionicons name="chevron-back" size={22} color={GOLD_L} />
        </HapticTouchable>
        <Text style={s.studyTitle}>session complete</Text>
        <View style={{ width: 22 }} />
      </View>
      <View style={s.resultsWrap}>
        <Text style={[s.bigPct, { color: pct >= 70 ? GREEN : RED }]}>{pct}%</Text>
        <Text style={s.resultsLabel}>accuracy</Text>
        <View style={s.resultsRow}>
          <View style={s.resultStat}>
            <Text style={[s.resultNum, { color: GREEN }]}>{stats.correct}</Text>
            <Text style={s.resultLbl}>correct</Text>
          </View>
          <View style={[s.resultStat, { borderLeftWidth: 1, borderLeftColor: BORDER }]}>
            <Text style={[s.resultNum, { color: RED }]}>{stats.incorrect}</Text>
            <Text style={s.resultLbl}>incorrect</Text>
          </View>
        </View>
        <HapticTouchable style={s.actionBtn} onPress={onRestart} haptic="medium">
          <Text style={s.actionBtnText}>study again</Text>
        </HapticTouchable>
        <HapticTouchable style={[s.actionBtn, s.actionBtnOutline]} onPress={onBack} haptic="selection">
          <Text style={[s.actionBtnText, { color: ACCENT }]}>back to sets</Text>
        </HapticTouchable>
      </View>
    </SafeAreaView>
  );
}

function StudyView({
  set,
  cards,
  onBack,
  onComplete,
}: {
  set: FlashcardSet;
  cards: Flashcard[];
  onBack: () => void;
  onComplete: (stats: { correct: number; incorrect: number }) => void;
}) {
  const layout = useResponsiveLayout();
  const useLandscapeLayout = layout.isLandscape && layout.width >= 700;
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0 });
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pagerRef = useRef<PagerView>(null);
  const cardTouchRef = useRef({ startX: 0, startY: 0, moved: false });
  const card = cards[idx];
  const progressPct = cards.length > 0 ? ((idx + 1) / cards.length) * 100 : 0;
  const remaining = Math.max(cards.length - idx - 1, 0);

  const doFlip = () => {
    if (!card) return;
    Animated.timing(scaleAnim, { toValue: 0, duration: 130, useNativeDriver: true }).start(() => {
      setFlipped((value) => !value);
      Animated.timing(scaleAnim, { toValue: 1, duration: 130, useNativeDriver: true }).start();
    });
  };

  const answer = (correct: boolean) => {
    const key = correct ? 'correct' : 'incorrect';
    const next = { ...stats, [key]: stats[key] + 1 };
    setStats(next);
    Animated.timing(scaleAnim, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
      setFlipped(false);
      scaleAnim.setValue(0);
      if (idx + 1 >= cards.length) {
        Animated.timing(scaleAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start(() => onComplete(next));
      } else {
        const nextIndex = idx + 1;
        setIdx(nextIndex);
        pagerRef.current?.setPage(nextIndex);
        Animated.timing(scaleAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      }
    });
  };

  const handleCardTouchStart = (event: GestureResponderEvent) => {
    cardTouchRef.current = {
      startX: event.nativeEvent.pageX,
      startY: event.nativeEvent.pageY,
      moved: false,
    };
  };

  const handleCardTouchMove = (event: GestureResponderEvent) => {
    const deltaX = Math.abs(event.nativeEvent.pageX - cardTouchRef.current.startX);
    const deltaY = Math.abs(event.nativeEvent.pageY - cardTouchRef.current.startY);
    if (deltaX > 8 || deltaY > 8) {
      cardTouchRef.current.moved = true;
    }
  };

  const handleCardTouchEnd = () => {
    if (!cardTouchRef.current.moved) {
      triggerHaptic('light');
      doFlip();
    }
  };

  if (!card) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <AmbientBubbles theme={CURRENT_THEME} variant="flashcards" opacity={0.84} />
        <View style={s.studyHeader}>
          <HapticTouchable onPress={onBack} haptic="selection">
            <Ionicons name="chevron-back" size={22} color={GOLD_L} />
          </HapticTouchable>
          <Text style={s.studyTitle}>flashcards</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={s.empty}>
          <Text style={s.emptyTitle}>no cards in this set</Text>
          <Text style={s.emptyHint}>create a few cards and try again</Text>
        </View>
      </SafeAreaView>
    );
  }

  const cardViewport = (
    <View style={[s.cardWrap, useLandscapeLayout && s.cardWrapLandscape]}>
      <View style={s.cardStageGlow} />
      <PagerView
        ref={pagerRef}
        style={s.cardPager}
        initialPage={0}
        overScrollMode="never"
        onPageSelected={(event) => {
          const nextIndex = event.nativeEvent.position;
          setIdx(nextIndex);
          setFlipped(false);
          scaleAnim.setValue(1);
        }}
      >
        {cards.map((studyCard, pageIndex) => {
          const isCurrent = pageIndex === idx;
          const pageFlipped = isCurrent && flipped;

          return (
            <View key={String(studyCard.id ?? pageIndex)} style={s.cardPagerPage}>
              <Animated.View
                style={{
                  ...s.cardAnimatedWrap,
                  transform: [
                    { scaleX: isCurrent ? scaleAnim : 1 },
                    { scale: isCurrent ? scaleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) : 1 },
                  ],
                }}
              >
                <View
                  style={[s.card, pageFlipped && s.cardFlipped]}
                  onTouchStart={handleCardTouchStart}
                  onTouchMove={handleCardTouchMove}
                  onTouchEnd={handleCardTouchEnd}
                >
                  <View style={s.cardTopRow}>
                    <View style={[s.cardSidePill, pageFlipped && s.cardSidePillFlipped]}>
                      <Text style={[s.cardSide, pageFlipped && s.cardSideFlipped]}>
                        {pageFlipped ? 'ANSWER' : 'QUESTION'}
                      </Text>
                    </View>
                    <View style={[s.diffPill, pageFlipped && s.diffPillFlipped]}>
                      <Text style={[s.diffText, pageFlipped && s.diffTextFlipped]}>
                        {studyCard.difficulty?.toUpperCase() ?? 'MEDIUM'}
                      </Text>
                    </View>
                  </View>

                  <ScrollView
                    style={s.cardBody}
                    contentContainerStyle={[s.cardBodyContent, useLandscapeLayout && s.cardBodyContentLandscape]}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                    nestedScrollEnabled
                  >
                    <Text style={[s.cardText, pageFlipped && s.cardTextFlipped]}>
                      {pageFlipped ? studyCard.answer : studyCard.question}
                    </Text>
                  </ScrollView>

                  <View style={s.cardFooter}>
                    <Text style={[s.cardHintText, pageFlipped && s.cardHintTextFlipped]}>
                      tap anywhere on the card to {pageFlipped ? 'show question' : 'reveal answer'}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            </View>
          );
        })}
      </PagerView>
    </View>
  );

  const sidebarStats = (
    <View style={[s.studyMetaRow, useLandscapeLayout && s.studyMetaRowLandscape]}>
      {!useLandscapeLayout ? (
        <View style={s.studyMetaCard}>
          <Text style={s.studyMetaLabel}>session flow</Text>
          <Text style={s.studyMetaValue}>{Math.round(progressPct)}%</Text>
        </View>
      ) : null}
      <View style={[s.studyMetaCard, useLandscapeLayout && s.studyMetaCardLandscape]}>
        <Text style={[s.studyMetaLabel, useLandscapeLayout && s.studyMetaLabelLandscape]}>correct</Text>
        <Text style={[s.studyMetaValue, useLandscapeLayout && s.studyMetaValueLandscape, { color: GREEN }]}>{stats.correct}</Text>
      </View>
      <View style={[s.studyMetaCard, useLandscapeLayout && s.studyMetaCardLandscape]}>
        <Text style={[s.studyMetaLabel, useLandscapeLayout && s.studyMetaLabelLandscape]}>left</Text>
        <Text style={[s.studyMetaValue, useLandscapeLayout && s.studyMetaValueLandscape]}>{remaining}</Text>
      </View>
    </View>
  );

  const answerActions = (
    <View style={[s.answerRow, useLandscapeLayout && s.answerRowLandscape]}>
      <HapticTouchable style={[s.wrongBtn, useLandscapeLayout && s.answerBtnLandscape]} onPress={() => answer(false)} haptic="warning">
        {!useLandscapeLayout ? (
          <View style={[s.answerIconWrap, useLandscapeLayout && s.answerIconWrapLandscape]}>
            <Ionicons name="close" size={22} color={RED} />
          </View>
        ) : null}
        <Text style={s.wrongLabel}>incorrect</Text>
        {!useLandscapeLayout ? <Text style={s.answerSubLabel}>needs another pass</Text> : null}
      </HapticTouchable>
      <HapticTouchable style={[s.rightBtn, useLandscapeLayout && s.answerBtnLandscape]} onPress={() => answer(true)} haptic="success">
        {!useLandscapeLayout ? (
          <View style={[s.answerIconWrap, useLandscapeLayout && s.answerIconWrapLandscape]}>
            <Ionicons name="checkmark" size={22} color={GREEN} />
          </View>
        ) : null}
        <Text style={s.rightLabel}>correct</Text>
        {!useLandscapeLayout ? <Text style={s.answerSubLabel}>ready to move on</Text> : null}
      </HapticTouchable>
    </View>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AmbientBubbles theme={CURRENT_THEME} variant="flashcards" opacity={0.84} />
      <View style={s.studyHeader}>
        <HapticTouchable onPress={onBack} haptic="selection">
          <Ionicons name="chevron-back" size={22} color={GOLD_L} />
        </HapticTouchable>
        <Text style={s.studyTitle} numberOfLines={1}>{set.title.toLowerCase()}</Text>
        <Text style={[s.studyCounter, { color: GOLD_D }]}>{idx + 1}/{cards.length}</Text>
      </View>

      {useLandscapeLayout ? (
        <View style={s.studyLandscapeBody}>
          <View style={s.studyCardColumn}>
            {cardViewport}
          </View>
          <View style={s.studySidebar}>
            {sidebarStats}
            {answerActions}
          </View>
        </View>
      ) : (
        <>
          {sidebarStats}
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${((idx + 1) / cards.length) * 100}%` as const }]} />
          </View>
          {cardViewport}
          {answerActions}
        </>
      )}
    </SafeAreaView>
  );
}

function OptionPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <HapticTouchable
      style={[s.optionPill, active && s.optionPillActive]}
      onPress={onPress}
      activeOpacity={0.85}
      haptic="selection"
    >
      <Text style={[s.optionPillText, active && s.optionPillTextActive]}>{label}</Text>
    </HapticTouchable>
  );
}

function FlashcardsCreate({
  user,
  initialMode = 'ai',
  onBack,
  onCreated,
}: {
  user: AuthUser;
  initialMode?: CreateMode;
  onBack: () => void;
  onCreated: (set: FlashcardSet, cards: Flashcard[]) => void;
}) {
  const [mode, setMode] = useState<CreateMode>(initialMode);
  const [topic, setTopic] = useState('');
  const [cardCount, setCardCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [additionalSpecs, setAdditionalSpecs] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualCards, setManualCards] = useState<ManualDraftCard[]>([
    { question: '', answer: '' },
    { question: '', answer: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const updateManualCard = (index: number, field: keyof ManualDraftCard, value: string) => {
    setManualCards((cards) => cards.map((card, cardIndex) => (
      cardIndex === index ? { ...card, [field]: value } : card
    )));
  };

  const addManualCard = () => {
    setManualCards((cards) => [...cards, { question: '', answer: '' }]);
  };

  const removeManualCard = (index: number) => {
    setManualCards((cards) => (
      cards.length === 1 ? cards : cards.filter((_, cardIndex) => cardIndex !== index)
    ));
  };

  const submitAI = async () => {
    if (!topic.trim()) {
      Alert.alert('Topic required', 'Enter a topic to generate flashcards.');
      return;
    }

    setSubmitting(true);
    try {
      const data = await generateFlashcards({
        userId: user.username,
        topic: topic.trim(),
        cardCount,
        difficulty,
        additionalSpecs: additionalSpecs.trim(),
        setTitle: `Flashcards: ${topic.trim()}`,
      });

      const cards = (data?.cards ?? data?.flashcards ?? []) as Flashcard[];
      if (!cards.length) {
        Alert.alert('No cards generated', 'Try a broader topic or adjust the prompt.');
        return;
      }

      const set = buildSetDraft({
        id: data.set_id,
        title: data.set_title || `Flashcards: ${topic.trim()}`,
        description: 'Generated from topic',
        card_count: cards.length,
        source_type: 'ai',
      });

      onCreated(set, cards);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate flashcards';
      Alert.alert('Generation failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitManual = async () => {
    const validCards = manualCards.filter((card) => card.question.trim() && card.answer.trim());
    if (!manualTitle.trim()) {
      Alert.alert('Title required', 'Add a title for your flashcard set.');
      return;
    }
    if (!validCards.length) {
      Alert.alert('Cards required', 'Add at least one question and answer pair.');
      return;
    }

    setSubmitting(true);
    try {
      const setData = await createFlashcardSet({
        userId: user.username,
        title: manualTitle.trim(),
        description: `Custom set with ${validCards.length} cards`,
      });

      for (const card of validCards) {
        await createFlashcard({
          setId: setData.set_id,
          question: card.question.trim(),
          answer: card.answer.trim(),
          difficulty: 'medium',
        });
      }

      const createdSet = buildSetDraft({
        id: setData.set_id,
        title: setData.title || manualTitle.trim(),
        description: `Custom set with ${validCards.length} cards`,
        card_count: validCards.length,
        source_type: 'manual',
      });
      const freshSet = await getFlashcardsInSet(setData.set_id);
      const cards = (freshSet?.flashcards ?? []) as Flashcard[];
      onCreated(createdSet, cards);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create flashcards';
      Alert.alert('Save failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AmbientBubbles theme={CURRENT_THEME} variant="flashcards" opacity={0.84} />
      <KeyboardAvoidingView
        style={s.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.header}>
          <HapticTouchable onPress={onBack} style={{ marginRight: 12 }} haptic="selection">
            <Ionicons name="chevron-back" size={22} color={GOLD_L} />
          </HapticTouchable>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>create set</Text>
            <Text style={s.subtitle}>mobile-first creator</Text>
          </View>
          <Ionicons name="sparkles-outline" size={20} color={GOLD_D} />
        </View>

        <ScrollView
          contentContainerStyle={s.createContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.modeSwitch}>
            <OptionPill label="AI Generate" active={mode === 'ai'} onPress={() => setMode('ai')} />
            <OptionPill label="Manual" active={mode === 'manual'} onPress={() => setMode('manual')} />
          </View>

          {mode === 'ai' ? (
            <>
              <View style={s.heroCreateCard}>
                <Text style={s.heroEyebrow}>SMART BUILD</Text>
                <Text style={s.heroTitle}>Generate a ready-to-study set from one topic.</Text>
                <Text style={s.heroBody}>
                  Uses the same flashcard generation endpoint as the browser flow, but in a compact mobile form.
                </Text>
              </View>

              <View style={s.formCard}>
                <Text style={[s.inputLabel, s.topicInputLabel]}>topic</Text>
                <TextInput
                  value={topic}
                  onChangeText={setTopic}
                  placeholder="Cell biology, world war 2, derivatives..."
                  placeholderTextColor={DIM2}
                  style={[s.input, s.topicInput]}
                />

                <Text style={s.inputLabel}>card count</Text>
                <View style={s.optionRow}>
                  {cardCountOptions.map((value) => (
                    <OptionPill
                      key={value}
                      label={String(value)}
                      active={cardCount === value}
                      onPress={() => setCardCount(value)}
                    />
                  ))}
                </View>

                <Text style={s.inputLabel}>difficulty</Text>
                <View style={s.optionRow}>
                  {difficultyOptions.map((value) => (
                    <OptionPill
                      key={value}
                      label={value}
                      active={difficulty === value}
                      onPress={() => setDifficulty(value)}
                    />
                  ))}
                </View>

                <Text style={s.inputLabel}>extra instructions</Text>
                <TextInput
                  value={additionalSpecs}
                  onChangeText={setAdditionalSpecs}
                  placeholder="Optional: focus on formulas, definitions, exam-style recall..."
                  placeholderTextColor={DIM2}
                  style={[s.input, s.inputMultiline]}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </>
          ) : (
            <>
              <View style={s.heroCreateCard}>
                <Text style={s.heroEyebrow}>MANUAL BUILD</Text>
                <Text style={s.heroTitle}>Write your own set with quick card blocks sized for phone editing.</Text>
                <Text style={s.heroBody}>
                  This uses the same set and card creation endpoints as the browser flow.
                </Text>
              </View>

              <View style={s.formCard}>
                <Text style={s.inputLabel}>set title</Text>
                <TextInput
                  value={manualTitle}
                  onChangeText={setManualTitle}
                  placeholder="AP Biology Unit 3"
                  placeholderTextColor={DIM2}
                  style={s.input}
                />
              </View>

              {manualCards.map((card, index) => (
                <View key={index} style={s.manualCard}>
                  <View style={s.manualCardHeader}>
                    <Text style={s.manualCardIndex}>card {index + 1}</Text>
                    {manualCards.length > 1 ? (
                      <HapticTouchable onPress={() => removeManualCard(index)} haptic="warning">
                        <Text style={s.removeText}>remove</Text>
                      </HapticTouchable>
                    ) : null}
                  </View>
                  <TextInput
                    value={card.question}
                    onChangeText={(value) => updateManualCard(index, 'question', value)}
                    placeholder="Question"
                    placeholderTextColor={DIM2}
                    style={[s.input, s.inputMultiline]}
                    multiline
                    textAlignVertical="top"
                  />
                  <TextInput
                    value={card.answer}
                    onChangeText={(value) => updateManualCard(index, 'answer', value)}
                    placeholder="Answer"
                    placeholderTextColor={DIM2}
                    style={[s.input, s.inputMultiline, { marginTop: 12 }]}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              ))}

              <HapticTouchable style={s.addCardBtn} onPress={addManualCard} activeOpacity={0.85} haptic="light">
                <Ionicons name="add" size={18} color={GOLD_L} />
                <Text style={s.addCardText}>add another card</Text>
              </HapticTouchable>
            </>
          )}

          <HapticTouchable
            style={[s.createSubmitBtn, submitting && s.createSubmitBtnDisabled]}
            onPress={mode === 'ai' ? submitAI : submitManual}
            disabled={submitting}
            activeOpacity={0.88}
            haptic="medium"
          >
            {submitting ? (
              <ActivityIndicator color={BASE_ACTION_TEXT} />
            ) : (
              <>
                <Text style={s.createSubmitText}>
                  {mode === 'ai' ? 'generate flashcards' : 'create flashcard set'}
                </Text>
                <Text style={s.createSubmitSubtext}>
                  {mode === 'ai' ? 'generate and open study mode' : 'save cards and open study mode'}
                </Text>
              </>
            )}
          </HapticTouchable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FlashcardsSets({
  user,
  onBack,
  refreshTick,
  onOpenCreate,
  onOpenStudy,
}: Props & {
  refreshTick: number;
  onOpenCreate: (mode?: CreateMode) => void;
  onOpenStudy: (set: FlashcardSet, cards: Flashcard[]) => void;
}) {
  const [sets, setSets] = useState<FlashcardSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [fcStats, setFcStats] = useState<Record<string, number> | null>(null);
  const [loadingCards, setLoadingCards] = useState(false);

  useEffect(() => {
    setLoading(true);
    getFlashcardHistory(user.username)
      .then((data) => {
        setSets(data?.flashcard_history ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    getFlashcardStatistics(user.username).then(setFcStats).catch(() => {});
  }, [user.username, refreshTick]);

  const startStudy = async (set: FlashcardSet) => {
    setLoadingCards(true);
    try {
      const data = await getFlashcardsInSet(set.id);
      const cards = (data?.flashcards ?? []) as Flashcard[];
      onOpenStudy(set, cards);
    } catch {
      Alert.alert('Unable to open set', 'The flashcards could not be loaded.');
    } finally {
      setLoadingCards(false);
    }
  };

  const totalCards = fcStats?.total_cards ?? '—';
  const totalSets = fcStats?.total_sets ?? '—';
  const mastered = fcStats?.cards_mastered ?? '—';
  const accuracy = fcStats?.average_accuracy != null ? `${Math.round(fcStats.average_accuracy)}%` : '—';

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AmbientBubbles theme={CURRENT_THEME} variant="flashcards" opacity={0.84} />
      <View style={s.header}>
        {onBack ? (
          <HapticTouchable onPress={onBack} style={{ marginRight: 12 }} haptic="selection">
            <Ionicons name="chevron-back" size={22} color={GOLD_L} />
          </HapticTouchable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={s.title}>flashcards</Text>
          <Text style={s.subtitle}>study · create · retain</Text>
        </View>
        <Ionicons name="layers-outline" size={22} color={GOLD_D} />
      </View>

      <View style={s.statsStrip}>
        {[
          { val: totalSets, lbl: 'SETS' },
          { val: totalCards, lbl: 'CARDS' },
          { val: mastered, lbl: 'MASTERED' },
          { val: accuracy, lbl: 'ACCURACY' },
        ].map((item, index) => (
          <View key={item.lbl} style={[s.statCell, index > 0 && { borderLeftWidth: 1, borderLeftColor: BORDER }]}>
            <Text style={s.statVal}>{item.val}</Text>
            <Text style={s.statLbl}>{item.lbl}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={sets}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={(
            <View style={s.createRow}>
              <HapticTouchable style={s.createBtnPrimary} onPress={() => onOpenCreate('ai')} haptic="medium">
                <Ionicons name="sparkles" size={15} color={BASE_ACTION_TEXT} />
                <Text style={s.createBtnPrimaryText}>AI generate</Text>
              </HapticTouchable>
              <HapticTouchable style={s.createBtnSecondary} onPress={() => onOpenCreate('manual')} haptic="light">
                <Ionicons name="add" size={16} color={BASE_ACTION_TEXT} />
                <Text style={s.createBtnSecondaryText}>manual</Text>
              </HapticTouchable>
            </View>
          )}
          ListEmptyComponent={(
            <View style={s.empty}>
              <Text style={s.emptyTitle}>no flashcard sets yet</Text>
              <Text style={s.emptyHint}>start with AI generate or manual create</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <HapticTouchable
              style={s.setCard}
              onPress={() => startStudy(item)}
              activeOpacity={0.85}
              haptic="light"
            >
              <View style={s.setCardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.setTitle} numberOfLines={2}>{item.title.toLowerCase()}</Text>
                  {!!item.description && (
                    <Text style={s.setDesc} numberOfLines={2}>{item.description}</Text>
                  )}
                </View>
                <View style={s.countBadge}>
                  <Text style={s.countText}>{item.card_count}</Text>
                  <Text style={s.countLbl}>cards</Text>
                </View>
              </View>

              <View style={s.masteryRow}>
                <View style={s.masteryBar}>
                  <View style={[s.masteryFill, { width: `${item.accuracy_percentage}%` as const }]} />
                </View>
                <Text style={s.masteryPct}>{Math.round(item.accuracy_percentage)}%</Text>
              </View>

              <View style={s.setCardBottom}>
                <View style={s.sourcePill}>
                  <Text style={s.sourceText}>{(item.source_type ?? 'manual').replace('_', ' ').toUpperCase()}</Text>
                </View>
                <View style={s.studyBtn}>
                  <Text style={s.studyBtnText}>study</Text>
                </View>
              </View>
            </HapticTouchable>
          )}
        />
      )}

      {loadingCards && (
        <View style={s.loadingOverlay}>
          <ActivityIndicator color={ACCENT} size="large" />
          <Text style={[s.emptyHint, { marginTop: 12 }]}>loading cards…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

export default function FlashcardsScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  CURRENT_LAYOUT = layout;
  applyTheme(selectedTheme);
  s = createStyles(layout);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const [refreshTick, setRefreshTick] = useState(0);

  if (!fontsLoaded) return null;

  return (
    <FlashcardsStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        gestureDirection: 'horizontal',
      }}
    >
      <FlashcardsStack.Screen name="FlashcardsSets">
        {({ navigation }) => (
          <FlashcardsSets
            user={user}
            onBack={onBack}
            refreshTick={refreshTick}
            onOpenCreate={(mode) => navigation.navigate('FlashcardsCreate', { mode })}
            onOpenStudy={(set, cards) => navigation.navigate('FlashcardsStudy', { set, cards })}
          />
        )}
      </FlashcardsStack.Screen>
      <FlashcardsStack.Screen name="FlashcardsCreate">
        {({ navigation, route }) => (
          <FlashcardsCreate
            user={user}
            initialMode={route.params?.mode ?? 'ai'}
            onBack={() => navigation.goBack()}
            onCreated={(set, cards) => {
              setRefreshTick((value) => value + 1);
              navigation.replace('FlashcardsStudy', { set, cards });
            }}
          />
        )}
      </FlashcardsStack.Screen>
      <FlashcardsStack.Screen name="FlashcardsStudy">
        {({ route, navigation }) => (
          <StudyView
            set={route.params.set}
            cards={route.params.cards}
            onBack={() => navigation.goBack()}
            onComplete={(stats) => navigation.reset({
              index: 1,
              routes: [
                { name: 'FlashcardsSets' },
                { name: 'FlashcardsResults', params: { set: route.params.set, cards: route.params.cards, stats } },
              ],
            })}
          />
        )}
      </FlashcardsStack.Screen>
      <FlashcardsStack.Screen name="FlashcardsResults">
        {({ route, navigation }) => (
          <ResultsView
            stats={route.params.stats}
            onBack={() => navigation.goBack()}
            onRestart={() => navigation.replace('FlashcardsStudy', { set: route.params.set, cards: route.params.cards })}
          />
        )}
      </FlashcardsStack.Screen>
    </FlashcardsStack.Navigator>
  );
}

function createStyles(layout: ReturnType<typeof useResponsiveLayout>) {
  const softAccent = rgbaFromHex(ACCENT, 0.12);
  const softAccentBorder = rgbaFromHex(ACCENT, 0.26);
  const softAccentFill = rgbaFromHex(ACCENT, 0.18);
  const softDanger = rgbaFromHex(RED, 0.12);
  const softDangerBorder = rgbaFromHex(RED, 0.26);
  const softSuccess = rgbaFromHex(GREEN, 0.12);
  const softSuccessBorder = rgbaFromHex(GREEN, 0.26);
  const useLandscapeStudyLayout = layout.isLandscape && layout.width >= 700;
  const studyBodyWidth = Math.min(layout.contentMaxWidth, layout.width - 40);
  const studySidebarWidth = useLandscapeStudyLayout ? Math.min(Math.max(studyBodyWidth * 0.25, 180), 240) : 0;
  const studyCardWidth = useLandscapeStudyLayout ? studyBodyWidth - studySidebarWidth - 16 : studyBodyWidth - 40;
  const cardWidth = Math.max(280, Math.min(studyCardWidth, useLandscapeStudyLayout ? layout.width * 0.75 : layout.width - 40));
  const cardHeight = useLandscapeStudyLayout
    ? Math.max(240, Math.min(layout.height - 132, Math.round(cardWidth * 0.9)))
    : Math.max(260, Math.min(layout.height - 300, 520));
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  title: { fontFamily: 'Inter_900Black', fontSize: 32, color: GOLD_L, letterSpacing: -0.8 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM2, letterSpacing: 2.2, marginTop: 4, textTransform: 'uppercase' },

  statsStrip: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: rgbaFromHex(SURFACE, 0.98),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginHorizontal: 16,
    marginBottom: 6,
    overflow: 'hidden',
  },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statVal: { fontFamily: 'Inter_900Black', fontSize: 18, color: ACCENT },
  statLbl: { fontFamily: 'Inter_400Regular', fontSize: 8, color: DIM2, letterSpacing: 1.5, marginTop: 2 },

  listContent: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    padding: 16,
    gap: 12,
    paddingBottom: 120,
    flexGrow: 1,
  },
  createRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  createBtnPrimary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, backgroundColor: BASE_ACTION_BG, borderRadius: 18, paddingVertical: 15,
    borderWidth: 1,
    borderColor: softAccentBorder,
  },
  createBtnPrimaryText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: BASE_ACTION_TEXT },
  createBtnSecondary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, borderRadius: 18, paddingVertical: 15,
    borderWidth: 1, borderColor: softAccentBorder, backgroundColor: BASE_ACTION_BG,
  },
  createBtnSecondaryText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: BASE_ACTION_TEXT },

  setCard: {
    backgroundColor: rgbaFromHex(SURFACE, 0.98),
    borderRadius: 20,
    borderWidth: 1,
    borderColor: softAccentBorder,
    padding: 18,
    gap: 12,
  },
  setCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  setTitle: { fontFamily: 'Inter_900Black', fontSize: 17, color: GOLD_L, lineHeight: 22 },
  setDesc: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM2, marginTop: 3, lineHeight: 16 },

  countBadge: {
    backgroundColor: softAccent,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: softAccentBorder,
  },
  countText: { fontFamily: 'Inter_900Black', fontSize: 18, color: GOLD_L },
  countLbl: { fontFamily: 'Inter_400Regular', fontSize: 8, color: GOLD_D, letterSpacing: 1, marginTop: 1 },

  masteryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  masteryBar: { flex: 1, height: 3, backgroundColor: DIM, borderRadius: 2, overflow: 'hidden' },
  masteryFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 2 },
  masteryPct: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: GOLD_D, width: 36, textAlign: 'right' },

  setCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sourcePill: { backgroundColor: BASE_ACTION_BG, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: BASE_ACTION_BORDER },
  sourceText: { fontFamily: 'Inter_900Black', fontSize: 12, color: BASE_ACTION_TEXT, letterSpacing: 0.4 },
  studyBtn: { backgroundColor: BASE_ACTION_BG, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 8, borderWidth: 1, borderColor: BASE_ACTION_BORDER },
  studyBtnText: { fontFamily: 'Inter_900Black', fontSize: 12, color: BASE_ACTION_TEXT },

  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 50 },
  emptyTitle: { fontFamily: 'Inter_900Black', fontSize: 18, color: GOLD_D },
  emptyHint: { fontFamily: 'Inter_400Regular', fontSize: 12, color: DIM2, letterSpacing: 1, textAlign: 'center' },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG + 'EE',
    justifyContent: 'center',
    alignItems: 'center',
  },

  createContent: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    padding: 16,
    gap: 14,
    paddingBottom: 120,
  },
  heroCreateCard: {
    backgroundColor: rgbaFromHex(SURFACE, 0.94),
    borderRadius: 20,
    borderWidth: 1,
    borderColor: softAccentBorder,
    padding: 18,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 26,
    elevation: 5,
  },
  heroEyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: GOLD_L, letterSpacing: 2, marginBottom: 10 },
  heroTitle: { fontFamily: 'Inter_900Black', fontSize: 24, lineHeight: 30, color: GOLD_L },
  heroBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 21, color: DIM2, marginTop: 8 },
  modeSwitch: { flexDirection: 'row', gap: 10 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  optionPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: SURFACE_2,
    borderWidth: 1,
    borderColor: BORDER,
  },
  optionPillActive: { backgroundColor: ACCENT, borderColor: ACCENT2 },
  optionPillText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: GOLD_L, textTransform: 'lowercase' },
  optionPillTextActive: { color: INK },
  formCard: {
    backgroundColor: rgbaFromHex(SURFACE, 0.94),
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 26,
    elevation: 5,
  },
  inputLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: GOLD_D, letterSpacing: 1.8, textTransform: 'uppercase', marginTop: 14 },
  topicInputLabel: { color: ACCENT, marginTop: 2 },
  input: {
    marginTop: 10,
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: INPUT_TEXT,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  topicInput: {
    backgroundColor: rgbaFromHex(SURFACE, 0.99),
    borderColor: BASE_ACTION_BORDER,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: BASE_ACTION_TEXT,
  },
  inputMultiline: { minHeight: 112 },
  manualCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 22,
    elevation: 4,
  },
  manualCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  manualCardIndex: { fontFamily: 'Inter_900Black', fontSize: 15, color: GOLD_L, textTransform: 'lowercase' },
  removeText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: RED, textTransform: 'lowercase' },
  addCardBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderRadius: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: softAccentBorder,
    backgroundColor: SURFACE_2,
  },
  addCardText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: GOLD_L },
  createSubmitBtn: {
    backgroundColor: BASE_ACTION_BG,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BASE_ACTION_BORDER,
    paddingVertical: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    minHeight: 76,
    justifyContent: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  createSubmitBtnDisabled: { opacity: 0.7 },
  createSubmitText: { fontFamily: 'Inter_900Black', fontSize: 15, color: BASE_ACTION_TEXT, textTransform: 'lowercase' },
  createSubmitSubtext: { fontFamily: 'Inter_400Regular', fontSize: 11, color: BASE_ACTION_TEXT, opacity: 0.7, marginTop: 4, textTransform: 'lowercase' },

  studyHeader: {
    width: '100%',
    maxWidth: Math.min(layout.contentMaxWidth, 820),
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  studyTitle: { fontFamily: 'Inter_900Black', fontSize: 15, color: GOLD_L, flex: 1, textAlign: 'center', marginHorizontal: 12 },
  studyCounter: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  studyMetaRow: {
    width: '100%',
    maxWidth: Math.min(layout.contentMaxWidth, 820),
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 14,
  },
  studyMetaRowLandscape: {
    maxWidth: studySidebarWidth,
    flexDirection: 'column',
    alignSelf: 'stretch',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 10,
  },
  studyMetaCard: {
    flex: 1,
    backgroundColor: rgbaFromHex(SURFACE_2, 0.92),
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  studyMetaCardLandscape: {
    flex: 0,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'flex-start',
    minHeight: 0,
  },
  studyMetaLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 8, color: DIM2, letterSpacing: 1.8, textTransform: 'uppercase' },
  studyMetaLabelLandscape: { fontSize: 9, letterSpacing: 1.2 },
  studyMetaValue: { fontFamily: 'Inter_900Black', fontSize: 18, color: GOLD_L, marginTop: 6 },
  studyMetaValueLandscape: { fontSize: 16, marginTop: 4 },

  progressBar: {
    width: '100%',
    maxWidth: Math.min(layout.contentMaxWidth - 40, 780),
    alignSelf: 'center',
    height: 4,
    backgroundColor: rgbaFromHex(ACCENT, 0.12),
    marginHorizontal: 20,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 999 },

  studyLandscapeBody: {
    flex: 1,
    width: '100%',
    maxWidth: studyBodyWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  studyCardColumn: {
    width: cardWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studySidebar: {
    width: studySidebarWidth,
    justifyContent: 'flex-start',
    gap: 10,
    marginTop: -28,
  },
  cardWrap: {
    flex: 1,
    width: '100%',
    maxWidth: Math.min(layout.contentMaxWidth, 820),
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 220,
  },
  cardWrapLandscape: {
    flex: 0,
    width: cardWidth,
    maxWidth: cardWidth,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    minHeight: cardHeight,
  },
  cardPager: { width: cardWidth, height: useLandscapeStudyLayout ? cardHeight : '100%' },
  cardPagerPage: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cardAnimatedWrap: {
    width: cardWidth,
    height: useLandscapeStudyLayout ? cardHeight : '100%',
  },
  cardStageGlow: {
    position: 'absolute',
    width: Math.max(cardWidth - 48, 240),
    height: useLandscapeStudyLayout ? Math.max(cardHeight - 42, 220) : '82%',
    borderRadius: 20,
    backgroundColor: rgbaFromHex(ACCENT, 0.08),
  },
  card: {
    width: cardWidth,
    height: useLandscapeStudyLayout ? cardHeight : '100%',
    backgroundColor: rgbaFromHex(QUESTION_SURFACE, 0.98),
    borderRadius: 20,
    borderWidth: 1,
    borderColor: QUESTION_CHIP_BORDER,
    padding: 26,
    justifyContent: 'space-between',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 30,
    elevation: 10,
  },
  cardFlipped: { backgroundColor: rgbaFromHex(ANSWER_SURFACE, 0.96), borderColor: ANSWER_CHIP_BORDER },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardSidePill: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: QUESTION_CHIP_BG, borderWidth: 1, borderColor: QUESTION_CHIP_BORDER },
  cardSidePillFlipped: { backgroundColor: ANSWER_CHIP_BG, borderColor: ANSWER_CHIP_BORDER },
  cardSide: { fontFamily: 'Inter_600SemiBold', fontSize: 7, color: QUESTION_TEXT, letterSpacing: 1.7 },
  cardSideFlipped: { color: ANSWER_TEXT, opacity: 1 },
  cardBody: { flex: 1, marginTop: 18, marginBottom: 18 },
  cardBodyContent: { flexGrow: 1, justifyContent: 'center' },
  cardBodyContentLandscape: {
    justifyContent: 'flex-start',
    paddingBottom: 18,
  },
  cardText: { fontFamily: 'Inter_900Black', fontSize: 23, color: QUESTION_TEXT, lineHeight: 31 },
  cardTextFlipped: { color: ANSWER_TEXT },
  cardFooter: { alignItems: 'center' },
  cardHintText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: GOLD_D,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  cardHintTextFlipped: { color: ANSWER_TEXT },
  diffPill: { alignSelf: 'flex-start', backgroundColor: QUESTION_CHIP_BG, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: QUESTION_CHIP_BORDER },
  diffPillFlipped: { backgroundColor: ANSWER_CHIP_BG, borderColor: ANSWER_CHIP_BORDER },
  diffText: { fontFamily: 'Inter_600SemiBold', fontSize: 8, color: QUESTION_TEXT, letterSpacing: 1.4 },
  diffTextFlipped: { color: ANSWER_TEXT },

  answerRow: {
    width: '100%',
    maxWidth: Math.min(layout.contentMaxWidth, 820),
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
  },
  answerRowLandscape: {
    maxWidth: studySidebarWidth,
    alignSelf: 'stretch',
    flexDirection: 'column',
    gap: 8,
    paddingHorizontal: 0,
    paddingBottom: 0,
    paddingTop: 0,
  },
  wrongBtn: {
    flex: 1,
    backgroundColor: softDanger,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: softDangerBorder,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 6,
  },
  answerBtnLandscape: {
    flex: 0,
    minHeight: 88,
    paddingVertical: 10,
  },
  rightBtn: {
    flex: 1,
    backgroundColor: softSuccess,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: softSuccessBorder,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 6,
  },
  answerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: rgbaFromHex(SURFACE, 0.78),
    borderWidth: 1,
    borderColor: BORDER,
  },
  answerIconWrapLandscape: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  wrongLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: RED, letterSpacing: 1 },
  rightLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: GREEN, letterSpacing: 1 },
  answerSubLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM2 },

  resultsWrap: {
    flex: 1,
    width: '100%',
    maxWidth: Math.min(layout.contentMaxWidth, 460),
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  bigPct: { fontFamily: 'Inter_900Black', fontSize: 88, lineHeight: 94 },
  resultsLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: DIM2, letterSpacing: 3, marginBottom: 8 },
  resultsRow: {
    flexDirection: 'row',
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 8,
  },
  resultStat: { flex: 1, alignItems: 'center', padding: 22 },
  resultNum: { fontFamily: 'Inter_900Black', fontSize: 40 },
  resultLbl: { fontFamily: 'Inter_400Regular', fontSize: 9, color: DIM2, letterSpacing: 1.5, marginTop: 4 },
  actionBtn: {
    backgroundColor: ACCENT,
    borderRadius: 20,
    paddingVertical: 15,
    paddingHorizontal: 40,
    marginTop: 14,
    width: '100%',
    alignItems: 'center',
  },
  actionBtnOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: GOLD_D },
  actionBtnText: { fontFamily: 'Inter_900Black', fontSize: 14, color: INK },
});
}

let s: ReturnType<typeof createStyles> = createStyles(DEFAULT_LAYOUT);
