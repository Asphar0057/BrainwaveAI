import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import PagerView, { AppPagerHandle } from '../components/AppPager';
import HapticTouchable from '../components/HapticTouchable';
import MathText from '../components/MathText';
import AmbientBubbles from '../components/AmbientBubbles';
import GeoBackground from '../components/GeoBackground';
import SpacedRepetitionScreen from './SpacedRepetitionScreen';
import { AuthUser } from '../services/auth';
import { useAppTheme } from '../contexts/ThemeContext';
import {
  createFlashcard,
  createFlashcardSet,
  generateFlashcards,
  getAllFlashcards,
  getFlashcardHistory,
  getFlashcardsForReview,
  getFlashcardsInSet,
  getFlashcardStatistics,
  markFlashcardForReview,
  reviewFlashcard,
} from '../services/api';
import { triggerHaptic } from '../utils/haptics';
import { darkenColor, getDefaultTheme, lightenColor, rgbaFromHex } from '../utils/theme';
import { getResponsiveLayout, useResponsiveLayout } from '../hooks/useResponsiveLayout';

const DEFAULT_THEME = getDefaultTheme();
const DEFAULT_LAYOUT = getResponsiveLayout(393, 852);
let CURRENT_THEME = DEFAULT_THEME;
let CURRENT_LAYOUT = DEFAULT_LAYOUT;
let BG = DEFAULT_THEME.bgPrimary;
let SURFACE = DEFAULT_THEME.panel;
let SURFACE_2 = DEFAULT_THEME.panelAlt;
let SURFACE_RAISED = DEFAULT_THEME.isLight ? DEFAULT_THEME.panel : lightenColor(DEFAULT_THEME.panelAlt, 6);
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
  set_id?: number;
  set_title?: string;
  question: string;
  answer: string;
  difficulty: string;
  marked_for_review?: boolean;
};

type ReviewSet = { set_id: number; set_title: string; cards: Flashcard[] };
type ReviewData = { total_cards: number; sets: ReviewSet[] };

type ManualDraftCard = {
  question: string;
  answer: string;
};

type Difficulty = 'adaptive' | 'easy' | 'medium' | 'hard';
type CreateMode = 'ai' | 'manual';

type Props = { user: AuthUser; onBack?: () => void };
type FlashcardsStackParamList = {
  FlashcardsSets: undefined;
  FlashcardsCreate: { mode?: CreateMode } | undefined;
  FlashcardsStudy: { set: FlashcardSet; cards: Flashcard[] };
  FlashcardsResults: { set: FlashcardSet; cards: Flashcard[]; stats: { correct: number; incorrect: number } };
  FlashcardsSpacedRepetition: undefined;
};

const FlashcardsStack = createNativeStackNavigator<FlashcardsStackParamList>();

const difficultyOptions: Difficulty[] = ['adaptive', 'easy', 'medium', 'hard'];
const cardCountOptions = [5, 10, 15, 20];

function applyTheme(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  CURRENT_THEME = theme;
  BG = theme.bgPrimary;
  SURFACE = theme.panel;
  SURFACE_2 = theme.panelAlt;
  SURFACE_RAISED = theme.isLight ? theme.panel : lightenColor(theme.panelAlt, 6);
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
      <GeoBackground />
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
  onToggleReview,
  onAnswer,
}: {
  set: FlashcardSet;
  cards: Flashcard[];
  onBack: () => void;
  onComplete: (stats: { correct: number; incorrect: number }) => void;
  onToggleReview: (cardId: number, marked: boolean) => Promise<void>;
  onAnswer: (cardId: number, correct: boolean) => Promise<void>;
}) {
  const layout = useResponsiveLayout();
  const useLandscapeLayout = layout.isLandscape && layout.width >= 700;
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0 });
  const [reviewCardIds, setReviewCardIds] = useState(() => new Set(cards.filter((item) => item.marked_for_review).map((item) => item.id)));
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pagerRef = useRef<AppPagerHandle>(null);
  const cardTouchRef = useRef({ startX: 0, startY: 0, moved: false });
  const card = cards[idx];
  const progressPct = cards.length > 0 ? ((idx + 1) / cards.length) * 100 : 0;
  const remaining = Math.max(cards.length - idx - 1, 0);
  const currentMarkedForReview = card ? reviewCardIds.has(card.id) : false;

  const toggleCurrentReview = async () => {
    if (!card) return;
    const nextMarked = !currentMarkedForReview;
    setReviewCardIds((current) => {
      const next = new Set(current);
      if (nextMarked) next.add(card.id);
      else next.delete(card.id);
      return next;
    });
    try {
      await onToggleReview(card.id, nextMarked);
    } catch {
      setReviewCardIds((current) => {
        const next = new Set(current);
        if (nextMarked) next.delete(card.id);
        else next.add(card.id);
        return next;
      });
      Alert.alert('Review update failed', 'Please try marking this card again.');
    }
  };

  const doFlip = () => {
    if (!card) return;
    Animated.timing(scaleAnim, { toValue: 0, duration: 130, useNativeDriver: true }).start(() => {
      setFlipped((value) => !value);
      Animated.timing(scaleAnim, { toValue: 1, duration: 130, useNativeDriver: true }).start();
    });
  };

  const answer = (correct: boolean) => {
    if (card?.id) {
      void onAnswer(card.id, correct).catch(() => {
        // Keep the study session responsive if review telemetry is unavailable.
      });
    }
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
        <GeoBackground />
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
                    <View style={s.cardTopActions}>
                      {isCurrent ? (
                        <HapticTouchable
                          style={[s.reviewToggle, currentMarkedForReview && s.reviewToggleActive]}
                          onPress={toggleCurrentReview}
                          onPressIn={() => { cardTouchRef.current.moved = true; }}
                          haptic="selection"
                          accessibilityLabel={currentMarkedForReview ? 'Remove from review' : 'Mark for review'}
                        >
                          <Ionicons name={currentMarkedForReview ? 'bookmark' : 'bookmark-outline'} size={14} color={currentMarkedForReview ? INK : QUESTION_TEXT} />
                          <Text style={[s.reviewToggleText, currentMarkedForReview && s.reviewToggleTextActive]}>
                            {currentMarkedForReview ? 'IN REVIEW' : 'REVIEW'}
                          </Text>
                        </HapticTouchable>
                      ) : null}
                      <View style={[s.diffPill, pageFlipped && s.diffPillFlipped]}>
                        <Text style={[s.diffText, pageFlipped && s.diffTextFlipped]}>
                          {studyCard.difficulty?.toUpperCase() ?? 'MEDIUM'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <ScrollView
                    style={s.cardBody}
                    contentContainerStyle={[s.cardBodyContent, useLandscapeLayout && s.cardBodyContentLandscape]}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                    nestedScrollEnabled
                  >
                    {set.id === -1 && studyCard.set_title ? (
                      <Text style={[s.randomCardSource, pageFlipped && s.randomCardSourceFlipped]} numberOfLines={1}>
                        FROM {studyCard.set_title.toUpperCase()}
                      </Text>
                    ) : null}
                    <MathText style={[s.cardText, pageFlipped && s.cardTextFlipped]}>
                      {pageFlipped ? studyCard.answer : studyCard.question}
                    </MathText>
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
      <GeoBackground />
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
      <GeoBackground />
      <AmbientBubbles theme={CURRENT_THEME} variant="flashcards" opacity={0.84} />
      <KeyboardAvoidingView
        style={s.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.header}>
          <HapticTouchable onPress={onBack} style={{ marginRight: 12 }} haptic="selection">
            <Ionicons name="chevron-back" size={22} color={GOLD_L} />
          </HapticTouchable>
          <Text style={[s.title, { flex: 1 }]}>create set</Text>
        </View>

        <ScrollView
          contentContainerStyle={s.createContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.segmented}>
            <HapticTouchable
              style={[s.segment, mode === 'ai' && s.segmentActive]}
              onPress={() => setMode('ai')}
              activeOpacity={0.8}
              haptic="selection"
            >
              <Ionicons name="sparkles" size={14} color={mode === 'ai' ? INK : DIM2} />
              <Text style={[s.segmentText, mode === 'ai' && s.segmentTextActive]}>AI generate</Text>
            </HapticTouchable>
            <HapticTouchable
              style={[s.segment, mode === 'manual' && s.segmentActive]}
              onPress={() => setMode('manual')}
              activeOpacity={0.8}
              haptic="selection"
            >
              <Ionicons name="create" size={14} color={mode === 'manual' ? INK : DIM2} />
              <Text style={[s.segmentText, mode === 'manual' && s.segmentTextActive]}>manual</Text>
            </HapticTouchable>
          </View>

          {mode === 'ai' ? (
            <View style={s.formCard}>
              <TextInput
                value={topic}
                onChangeText={setTopic}
                placeholder="What do you want to study?"
                placeholderTextColor={DIM2}
                style={[s.input, s.topicInput]}
              />

              <View style={s.pillGroup}>
                <Text style={s.pillGroupCaption}>cards</Text>
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
              </View>

              <View style={s.pillGroup}>
                <Text style={s.pillGroupCaption}>difficulty</Text>
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
              </View>

              <TextInput
                value={additionalSpecs}
                onChangeText={setAdditionalSpecs}
                placeholder="Optional: focus on formulas, definitions, exam-style recall..."
                placeholderTextColor={DIM2}
                style={[s.input, s.inputMultiline, { marginTop: 14 }]}
                multiline
                textAlignVertical="top"
              />
            </View>
          ) : (
            <>
              <View style={s.formCard}>
                <TextInput
                  value={manualTitle}
                  onChangeText={setManualTitle}
                  placeholder="Set title, e.g. AP Biology Unit 3"
                  placeholderTextColor={DIM2}
                  style={s.input}
                />
              </View>

              {manualCards.map((card, index) => (
                <View key={index} style={s.manualCard}>
                  <View style={s.manualCardHeader}>
                    <View style={s.manualCardBadge}>
                      <Text style={s.manualCardBadgeText}>{index + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }} />
                    {manualCards.length > 1 ? (
                      <HapticTouchable onPress={() => removeManualCard(index)} haptic="warning" style={s.manualCardRemove}>
                        <Ionicons name="trash-outline" size={15} color={RED} />
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
                    style={[s.input, s.inputMultiline, { marginTop: 10 }]}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              ))}

              <HapticTouchable style={s.addCardBtn} onPress={addManualCard} activeOpacity={0.85} haptic="light">
                <Ionicons name="add" size={18} color={GOLD_L} />
                <Text style={s.addCardText}>add card</Text>
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
              <Text style={s.createSubmitText}>
                {mode === 'ai' ? 'generate flashcards' : 'create flashcard set'}
              </Text>
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
  onOpenSpacedRepetition,
}: Props & {
  refreshTick: number;
  onOpenCreate: (mode?: CreateMode) => void;
  onOpenStudy: (set: FlashcardSet, cards: Flashcard[]) => void;
  onOpenSpacedRepetition: () => void;
}) {
  const [sets, setSets] = useState<FlashcardSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [fcStats, setFcStats] = useState<Record<string, number> | null>(null);
  const [reviewData, setReviewData] = useState<ReviewData>({ total_cards: 0, sets: [] });
  const [loadingCards, setLoadingCards] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeView, setActiveView] = useState<'sets' | 'queue' | 'review' | 'sources' | 'stats'>('sets');
  const layout = useResponsiveLayout();

  useEffect(() => {
    setLoading(true);
    getFlashcardHistory(user.username)
      .then((data) => {
        setSets(data?.flashcard_history ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    getFlashcardStatistics(user.username).then(setFcStats).catch(() => {});
    getFlashcardsForReview(user.username).then((data) => setReviewData({
      total_cards: data?.total_cards ?? 0,
      sets: Array.isArray(data?.sets) ? data.sets : [],
    })).catch(() => {});
  }, [user.username, refreshTick]);

  const refreshCollection = async () => {
    setRefreshing(true);
    try {
      const [history, statistics, review] = await Promise.all([
        getFlashcardHistory(user.username),
        getFlashcardStatistics(user.username),
        getFlashcardsForReview(user.username),
      ]);
      setSets(history?.flashcard_history ?? []);
      setFcStats(statistics);
      setReviewData({ total_cards: review?.total_cards ?? 0, sets: Array.isArray(review?.sets) ? review.sets : [] });
    } finally {
      setRefreshing(false);
    }
  };

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

  const startReviewStudy = (set: FlashcardSet) => {
    const reviewSet = reviewData.sets.find((item) => item.set_id === set.id);
    if (reviewSet?.cards.length) onOpenStudy(set, reviewSet.cards);
  };

  const startRandomStudy = async () => {
    setLoadingCards(true);
    try {
      const data = await getAllFlashcards(user.username);
      const allCards = Array.isArray(data) ? data as Flashcard[] : [];
      if (!allCards.length) {
        Alert.alert('No flashcards yet', 'Create a set before starting a random session.');
        return;
      }
      const cards = [...allCards]
        .map((item) => ({ item, order: Math.random() }))
        .sort((a, b) => a.order - b.order)
        .slice(0, 20)
        .map(({ item }) => item);
      const randomSet = buildSetDraft({
        id: -1,
        title: 'Random cards',
        card_count: cards.length,
        source_type: 'mixed sets',
      });
      onOpenStudy(randomSet, cards);
    } catch {
      Alert.alert('Unable to mix cards', 'The random session could not be loaded.');
    } finally {
      setLoadingCards(false);
    }
  };

  const totalCards = fcStats?.total_cards ?? '—';
  const totalSets = fcStats?.total_sets ?? '—';
  const mastered = fcStats?.cards_mastered ?? '—';
  const accuracy = fcStats?.average_accuracy != null ? `${Math.round(fcStats.average_accuracy)}%` : '—';
  const cleanTitle = (title: string) => title
    .replace(/^flashcards\s*(from|:)\s*/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sourceLabel = (source?: string) => {
    const normalized = (source ?? 'manual').replace(/_/g, ' ').toLowerCase();
    if (normalized.includes('document')) return 'document';
    if (normalized.includes('topic') || normalized === 'ai') return 'AI generated';
    if (normalized.includes('media')) return 'media';
    return normalized;
  };
  const collectionSets = useMemo(() => {
    if (activeView === 'queue') return [...sets].filter((set) => set.accuracy_percentage < 100).sort((a, b) => a.accuracy_percentage - b.accuracy_percentage);
    if (activeView === 'review') return reviewData.sets.map((item) => buildSetDraft({
      id: item.set_id,
      title: item.set_title,
      card_count: item.cards.length,
      source_type: 'marked for review',
    }));
    if (activeView === 'sources') return sets.filter((set) => /document|pdf/i.test(`${set.source_type} ${set.title}`));
    return sets;
  }, [sets, activeView, reviewData]);
  const columns = layout.width >= 700 ? 3 : 2;
  const coverColors = ['#df6b6b', '#69beb8', '#68aac7', '#e99b76', '#8dbfab', '#dcc86d'];
  const navItems = [
    { key: 'sets' as const, label: 'My sets', icon: 'albums-outline' as const },
    { key: 'queue' as const, label: 'Queue', icon: 'radio-button-on-outline' as const },
    { key: 'review' as const, label: 'Review', icon: 'refresh-outline' as const },
    { key: 'sources' as const, label: 'Sources', icon: 'document-outline' as const },
    { key: 'stats' as const, label: 'Stats', icon: 'stats-chart-outline' as const },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <GeoBackground />
      <AmbientBubbles theme={CURRENT_THEME} variant="flashcards" opacity={0.84} />
      <View style={s.header}>
        {onBack ? (
          <HapticTouchable onPress={onBack} style={{ marginRight: 12 }} haptic="selection">
            <Ionicons name="chevron-back" size={22} color={GOLD_L} />
          </HapticTouchable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={s.title}>flashcards</Text>
        </View>
        <HapticTouchable onPress={onOpenSpacedRepetition} haptic="selection" accessibilityLabel="Spaced repetition review">
          <Ionicons name="repeat" size={22} color={GOLD_L} />
        </HapticTouchable>
      </View>

      {loading ? (
        <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
      ) : (
        <View style={s.workspace}>
          <View style={s.workspaceActions}>
            <HapticTouchable style={s.generateAction} onPress={() => onOpenCreate('ai')} haptic="medium">
              <Ionicons name="sparkles" size={15} color={BASE_ACTION_TEXT} />
              <Text style={s.generateActionText}>Generate</Text>
            </HapticTouchable>
            <HapticTouchable style={s.manualAction} onPress={() => onOpenCreate('manual')} haptic="light" accessibilityLabel="Create manually">
              <Ionicons name="create-outline" size={17} color={GOLD_L} />
              <Text style={s.manualActionText}>Manual</Text>
            </HapticTouchable>
            <HapticTouchable style={s.randomAction} onPress={startRandomStudy} haptic="medium" accessibilityLabel="Study random cards from all sets">
              <Ionicons name="shuffle" size={17} color={GOLD_L} />
              <Text style={s.manualActionText}>Random</Text>
            </HapticTouchable>
          </View>

          <View style={s.workspaceNav}>
            {navItems.map((item) => (
              <HapticTouchable key={item.key} style={[s.workspaceNavItem, activeView === item.key && s.workspaceNavItemActive]} onPress={() => setActiveView(item.key)} haptic="selection">
                <Ionicons name={item.icon} size={14} color={activeView === item.key ? INK : DIM2} />
                <Text style={[s.workspaceNavText, activeView === item.key && s.workspaceNavTextActive]}>{item.label}</Text>
              </HapticTouchable>
            ))}
          </View>

          <View style={s.collectionHeader}>
            <View>
              <Text style={s.collectionKicker}>{activeView === 'sets' ? 'YOUR COLLECTION' : activeView.toUpperCase()}</Text>
              <Text style={s.collectionTitle}>{activeView === 'stats' ? 'Statistics' : navItems.find((item) => item.key === activeView)?.label}</Text>
            </View>
            {activeView !== 'stats' ? (
              <Text style={s.collectionCount}>
                {activeView === 'review' ? `${reviewData.total_cards} cards` : `${collectionSets.length} sets`}
              </Text>
            ) : null}
          </View>

          {activeView === 'stats' ? (
            <View style={s.statsWorkspace}>
              {[
                { val: totalSets, lbl: 'SETS', icon: 'albums-outline' as const },
                { val: totalCards, lbl: 'CARDS', icon: 'layers-outline' as const },
                { val: mastered, lbl: 'MASTERED', icon: 'checkmark-circle-outline' as const },
                { val: accuracy, lbl: 'ACCURACY', icon: 'analytics-outline' as const },
              ].map((item) => (
                <View key={item.lbl} style={s.statWorkspaceCard}>
                  <Ionicons name={item.icon} size={18} color={ACCENT} />
                  <Text style={s.statWorkspaceValue}>{item.val}</Text>
                  <Text style={s.statWorkspaceLabel}>{item.lbl}</Text>
                </View>
              ))}
            </View>
          ) : collectionSets.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="albums-outline" size={32} color={GOLD_D} />
              <Text style={s.emptyTitle}>nothing here yet</Text>
              <Text style={s.emptyHint}>this workspace will fill as you study</Text>
            </View>
          ) : (
            <ScrollView
              style={s.collectionScroll}
              contentContainerStyle={[s.collectionGrid, { gap: columns === 3 ? 10 : 9 }]}
              showsVerticalScrollIndicator={false}
              bounces
              refreshControl={(
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={refreshCollection}
                  tintColor={ACCENT}
                  colors={[ACCENT]}
                />
              )}
            >
              {collectionSets.map((item, index) => (
                  <HapticTouchable
                    key={item.id}
                    style={[s.collectionCard, { width: columns === 3 ? '31.8%' : '48.6%' }]}
                    onPress={() => activeView === 'review' ? startReviewStudy(item) : startStudy(item)}
                    haptic="medium"
                    accessibilityLabel={`Study ${cleanTitle(item.title)}`}
                  >
                    <View style={[s.collectionCover, { backgroundColor: coverColors[index % coverColors.length] }]}>
                      <Text style={s.collectionCardTitle} numberOfLines={3}>{cleanTitle(item.title)}</Text>
                      <Text style={s.collectionCardCount}>{item.card_count} CARDS</Text>
                    </View>
                    <View style={s.collectionCardMeta}>
                      <View style={s.collectionMasteryRow}>
                        <Text style={s.collectionMasteryLabel}>MASTERY</Text>
                        <Text style={s.collectionMasteryValue}>{Math.round(item.accuracy_percentage)}%</Text>
                      </View>
                      <Text style={s.collectionSource} numberOfLines={1}>{sourceLabel(item.source_type).toUpperCase()}</Text>
                      <View style={s.collectionMasteryBar}>
                        <View style={[s.collectionMasteryFill, { width: `${Math.max(3, item.accuracy_percentage)}%` as const }]} />
                      </View>
                      <View style={s.collectionStudyBtn}>
                        <Text style={s.collectionStudyText}>STUDY NOW</Text>
                        <Ionicons name="arrow-forward" size={12} color={BASE_ACTION_TEXT} />
                      </View>
                    </View>
                  </HapticTouchable>
              ))}
            </ScrollView>
          )}
        </View>
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
            onOpenSpacedRepetition={() => navigation.navigate('FlashcardsSpacedRepetition')}
          />
        )}
      </FlashcardsStack.Screen>
      <FlashcardsStack.Screen name="FlashcardsSpacedRepetition">
        {({ navigation }) => (
          <SpacedRepetitionScreen user={user} onBack={() => navigation.goBack()} />
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
            onToggleReview={async (cardId, marked) => {
              await markFlashcardForReview(cardId, marked);
              setRefreshTick((value) => value + 1);
            }}
            onAnswer={(cardId, correct) => reviewFlashcard({
              userId: user.username,
              cardId,
              wasCorrect: correct,
            })}
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
  const collectionCardHeight = layout.height >= 840 ? 228 : layout.height >= 760 ? 205 : 184;
  const collectionCoverHeight = Math.round(collectionCardHeight * 0.45);
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingTop: 5,
    paddingBottom: 3,
  },
  title: { fontFamily: 'Inter_900Black', fontSize: 32, color: GOLD_L, letterSpacing: -0.8 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM2, letterSpacing: 2.2, marginTop: 4, textTransform: 'uppercase' },

  workspace: {
    flex: 1,
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  workspaceActions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  generateAction: { flex: 1, height: 52, borderRadius: 17, backgroundColor: BASE_ACTION_BG, borderWidth: 1, borderColor: BASE_ACTION_BORDER, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  generateActionText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: BASE_ACTION_TEXT, letterSpacing: 0.4, textTransform: 'uppercase' },
  manualAction: { width: 92, height: 52, borderRadius: 17, borderWidth: 1, borderColor: BORDER, backgroundColor: rgbaFromHex(SURFACE, 0.9), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  randomAction: { width: 92, height: 52, borderRadius: 17, borderWidth: 1, borderColor: softAccentBorder, backgroundColor: softAccent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  manualActionText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: GOLD_L, letterSpacing: 0.4, textTransform: 'uppercase' },
  workspaceNav: { height: 42, flexDirection: 'row', gap: 5, marginBottom: 10 },
  workspaceNavItem: { flex: 1, height: 42, borderRadius: 999, borderWidth: 1, borderColor: BORDER, backgroundColor: rgbaFromHex(SURFACE, 0.86), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 1 },
  workspaceNavItemActive: { backgroundColor: ACCENT, borderColor: ACCENT2 },
  workspaceNavText: { fontFamily: 'Inter_600SemiBold', fontSize: 8.5, color: DIM2, textAlign: 'center' },
  workspaceNavTextActive: { color: INK },
  collectionHeader: { minHeight: 46, borderBottomWidth: 1, borderBottomColor: BORDER, marginBottom: 10, paddingBottom: 2, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  collectionKicker: { fontFamily: 'Inter_700Bold', fontSize: 8, color: ACCENT, letterSpacing: 1.8, marginBottom: 3 },
  collectionTitle: { fontFamily: 'Inter_900Black', fontSize: 24, color: GOLD_L, letterSpacing: -0.8 },
  collectionCount: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM2, marginBottom: 3 },
  collectionScroll: { flex: 1 },
  collectionGrid: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', paddingBottom: 5 },
  collectionCard: { height: collectionCardHeight, borderRadius: 17, borderWidth: 1, borderColor: BORDER, backgroundColor: rgbaFromHex(SURFACE, 0.95), overflow: 'hidden' },
  collectionCover: { height: collectionCoverHeight, paddingHorizontal: 3, paddingVertical: 3, alignItems: 'center', justifyContent: 'center' },
  collectionCardTitle: { fontFamily: 'Inter_900Black', fontSize: 13, lineHeight: 16, color: '#171411', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },
  collectionCardCount: { fontFamily: 'Inter_700Bold', fontSize: 7.5, color: rgbaFromHex('#171411', 0.66), letterSpacing: 1.4, marginTop: 7 },
  collectionCardMeta: { flex: 1, padding: 3, justifyContent: 'space-between' },
  collectionMasteryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  collectionMasteryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 7, color: DIM2, letterSpacing: 1.2 },
  collectionMasteryValue: { fontFamily: 'Inter_700Bold', fontSize: 9, color: ACCENT },
  collectionSource: { fontFamily: 'Inter_600SemiBold', fontSize: 7, color: DIM2, letterSpacing: 0.8, marginTop: 3 },
  collectionMasteryBar: { width: '100%', height: 3, borderRadius: 2, backgroundColor: rgbaFromHex(ACCENT, 0.12), overflow: 'hidden', marginTop: 3 },
  collectionMasteryFill: { height: '100%', borderRadius: 2, backgroundColor: ACCENT },
  collectionStudyBtn: { height: 36, borderRadius: 11, backgroundColor: BASE_ACTION_BG, borderWidth: 1, borderColor: BASE_ACTION_BORDER, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  collectionStudyText: { fontFamily: 'Inter_900Black', fontSize: 9, color: BASE_ACTION_TEXT, letterSpacing: 1.1 },
  statsWorkspace: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignContent: 'flex-start' },
  statWorkspaceCard: { width: '48.5%', minHeight: 140, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: rgbaFromHex(SURFACE, 0.94), padding: 4, justifyContent: 'center', alignItems: 'center' },
  statWorkspaceValue: { fontFamily: 'Inter_900Black', fontSize: 30, color: GOLD_L, marginTop: 9 },
  statWorkspaceLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 8, color: DIM2, letterSpacing: 1.5, marginTop: 4 },

  libraryHeader: { gap: 14, marginBottom: 4 },
  continueCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: softAccentBorder,
    backgroundColor: rgbaFromHex(SURFACE_RAISED, 0.96),
    padding: 5,
    overflow: 'hidden',
  },
  continueTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  continueEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  continueIcon: { width: 30, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: ACCENT },
  continueEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, color: DIM2, letterSpacing: 1.5 },
  continueProgress: { fontFamily: 'Inter_900Black', fontSize: 18, color: ACCENT },
  continueTitle: { fontFamily: 'Inter_900Black', fontSize: 23, lineHeight: 28, color: GOLD_L, letterSpacing: -0.7, maxWidth: '92%' },
  continueMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 },
  continueMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM2 },
  continueRail: { height: 4, borderRadius: 2, backgroundColor: rgbaFromHex(ACCENT, 0.12), overflow: 'hidden', marginTop: 14 },
  continueRailFill: { height: '100%', borderRadius: 2, backgroundColor: ACCENT },

  libraryStatsRow: { flexDirection: 'row', gap: 8 },
  libraryStat: { flex: 1, minHeight: 62, borderRadius: 17, borderWidth: 1, borderColor: BORDER, backgroundColor: rgbaFromHex(SURFACE, 0.9), paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  libraryStatVal: { fontFamily: 'Inter_900Black', fontSize: 17, color: GOLD_L },
  libraryStatLbl: { fontFamily: 'Inter_400Regular', fontSize: 8, color: DIM2, letterSpacing: 1, marginTop: 2, textTransform: 'uppercase' },
  libraryStatAccent: { flex: 1, minHeight: 62, borderRadius: 17, backgroundColor: ACCENT, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  libraryStatAccentVal: { fontFamily: 'Inter_900Black', fontSize: 17, color: INK },
  libraryStatAccentLbl: { fontFamily: 'Inter_600SemiBold', fontSize: 8, color: INK, opacity: 0.72, letterSpacing: 0.7, marginTop: 2, textTransform: 'uppercase' },

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
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  statVal: { fontFamily: 'Inter_900Black', fontSize: 18, color: ACCENT },
  statLbl: { fontFamily: 'Inter_400Regular', fontSize: 8, color: DIM2, letterSpacing: 1.5, marginTop: 2 },

  listContent: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    padding: 4,
    gap: 9,
    paddingBottom: 120,
    flexGrow: 1,
  },
  createRow: { flexDirection: 'row', gap: 10 },
  createBtnPrimary: {
    flex: 1, minHeight: 68, flexDirection: 'row', alignItems: 'center',
    gap: 11, backgroundColor: BASE_ACTION_BG, borderRadius: 20, paddingVertical: 3, paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: softAccentBorder,
  },
  createBtnPrimaryText: { fontFamily: 'Inter_900Black', fontSize: 14, color: BASE_ACTION_TEXT },
  createBtnPrimarySub: { fontFamily: 'Inter_400Regular', fontSize: 9, color: BASE_ACTION_TEXT, opacity: 0.7, marginTop: 2 },
  createBtnSecondary: {
    width: 68, minHeight: 68, alignItems: 'center', justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1, borderColor: softAccentBorder, backgroundColor: rgbaFromHex(SURFACE, 0.94),
  },
  createBtnSecondaryText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: BASE_ACTION_TEXT },

  libraryTitleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 },
  libraryTitle: { fontFamily: 'Inter_900Black', fontSize: 21, color: GOLD_L, letterSpacing: -0.5 },
  libraryCount: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM2, marginTop: 3 },
  searchBox: { minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: rgbaFromHex(INPUT_BG, 0.94), paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, color: INPUT_TEXT, fontFamily: 'Inter_400Regular', fontSize: 13, paddingVertical: 3 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 2 },
  filterChip: { borderRadius: 999, borderWidth: 1, borderColor: BORDER, backgroundColor: rgbaFromHex(SURFACE, 0.78), paddingHorizontal: 3, paddingVertical: 2 },
  filterChipActive: { backgroundColor: softAccentFill, borderColor: softAccentBorder },
  filterChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: DIM2, textTransform: 'capitalize' },
  filterChipTextActive: { color: GOLD_L },

  setCard: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: rgbaFromHex(SURFACE, 0.94),
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 3,
    paddingVertical: 3,
  },
  setIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: softAccent, borderWidth: 1, borderColor: softAccentBorder, flexShrink: 0 },
  setCardBody: { flex: 1, minWidth: 0, gap: 5 },
  setOpenBtn: { width: 30, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(ACCENT, 0.08), flexShrink: 0 },
  setCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  setTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: GOLD_L, lineHeight: 18 },
  setDesc: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM2, marginTop: 3, lineHeight: 16 },
  setMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM2 },

  countBadge: {
    backgroundColor: softAccent,
    borderRadius: 14,
    paddingHorizontal: 3,
    paddingVertical: 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: softAccentBorder,
  },
  countText: { fontFamily: 'Inter_900Black', fontSize: 18, color: GOLD_L },
  countLbl: { fontFamily: 'Inter_400Regular', fontSize: 8, color: GOLD_D, letterSpacing: 1, marginTop: 1 },

  masteryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 1 },
  masteryBar: { flex: 1, height: 3, backgroundColor: DIM, borderRadius: 2, overflow: 'hidden' },
  masteryFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 2 },
  masteryPct: { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: GOLD_D, width: 30, textAlign: 'right' },

  setCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sourcePill: { backgroundColor: BASE_ACTION_BG, borderRadius: 14, paddingHorizontal: 4, paddingVertical: 2, borderWidth: 1, borderColor: BASE_ACTION_BORDER },
  sourceText: { fontFamily: 'Inter_900Black', fontSize: 12, color: BASE_ACTION_TEXT, letterSpacing: 0.4 },
  studyBtn: { backgroundColor: BASE_ACTION_BG, borderRadius: 14, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: BASE_ACTION_BORDER },
  studyBtnText: { fontFamily: 'Inter_900Black', fontSize: 12, color: BASE_ACTION_TEXT },

  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 13 },
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
    padding: 4,
    gap: 14,
    paddingBottom: 120,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: SURFACE_2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 1,
    gap: 4,
  },
  segment: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 3, borderRadius: 12,
  },
  segmentActive: { backgroundColor: ACCENT },
  segmentText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: DIM2, textTransform: 'lowercase' },
  segmentTextActive: { color: INK },
  pillGroup: { marginTop: 16 },
  pillGroupCaption: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: GOLD_D, textTransform: 'lowercase', marginBottom: 8 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionPill: {
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderRadius: 14,
    backgroundColor: SURFACE_2,
    borderWidth: 1,
    borderColor: BORDER,
  },
  optionPillActive: { backgroundColor: ACCENT, borderColor: ACCENT2 },
  optionPillText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: GOLD_L, textTransform: 'lowercase' },
  optionPillTextActive: { color: INK },
  formCard: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 4,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 26,
    elevation: 5,
  },
  input: {
    marginTop: 10,
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    paddingHorizontal: 4,
    paddingVertical: 4,
    color: INPUT_TEXT,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  topicInput: {
    marginTop: 0,
    backgroundColor: INPUT_BG,
    borderColor: BASE_ACTION_BORDER,
    borderRadius: 20,
    paddingHorizontal: 5,
    paddingVertical: 4,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: BASE_ACTION_TEXT,
  },
  inputMultiline: { minHeight: 112 },
  manualCard: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 4,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 22,
    elevation: 4,
  },
  manualCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  manualCardBadge: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: rgbaFromHex(GOLD_L, 0.14),
  },
  manualCardBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: GOLD_L },
  manualCardRemove: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: rgbaFromHex(RED, 0.1),
  },
  addCardBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderRadius: 18,
    paddingVertical: 4,
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
    paddingVertical: 5,
    paddingHorizontal: 5,
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

  studyHeader: {
    width: '100%',
    maxWidth: Math.min(layout.contentMaxWidth, 820),
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingTop: 4,
    paddingBottom: 3,
  },
  studyTitle: { fontFamily: 'Inter_900Black', fontSize: 15, color: GOLD_L, flex: 1, textAlign: 'center', marginHorizontal: 12 },
  studyCounter: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  studyMetaRow: {
    width: '100%',
    maxWidth: Math.min(layout.contentMaxWidth, 820),
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 5,
    paddingTop: 1,
    paddingBottom: 4,
  },
  studyMetaRowLandscape: {
    maxWidth: studySidebarWidth,
    flexDirection: 'column',
    alignSelf: 'stretch',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 3,
  },
  studyMetaCard: {
    flex: 1,
    backgroundColor: rgbaFromHex(SURFACE_2, 0.92),
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 3,
    paddingHorizontal: 3,
    alignItems: 'center',
  },
  studyMetaCardLandscape: {
    flex: 0,
    borderRadius: 14,
    paddingVertical: 3,
    paddingHorizontal: 3,
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
    paddingHorizontal: 5,
    paddingTop: 3,
    paddingBottom: 5,
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
    paddingHorizontal: 5,
    paddingTop: 3,
    paddingBottom: 3,
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
    padding: 7,
    justifyContent: 'space-between',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 30,
    elevation: 10,
  },
  cardFlipped: { backgroundColor: rgbaFromHex(ANSWER_SURFACE, 0.96), borderColor: ANSWER_CHIP_BORDER },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTopActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  reviewToggle: { minHeight: 28, borderRadius: 999, paddingHorizontal: 2, borderWidth: 1, borderColor: QUESTION_CHIP_BORDER, backgroundColor: QUESTION_CHIP_BG, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  reviewToggleActive: { backgroundColor: ACCENT, borderColor: ACCENT2 },
  reviewToggleText: { fontFamily: 'Inter_700Bold', fontSize: 7, color: QUESTION_TEXT, letterSpacing: 0.7 },
  reviewToggleTextActive: { color: INK },
  cardSidePill: { borderRadius: 999, paddingHorizontal: 3, paddingVertical: 2, backgroundColor: QUESTION_CHIP_BG, borderWidth: 1, borderColor: QUESTION_CHIP_BORDER },
  cardSidePillFlipped: { backgroundColor: ANSWER_CHIP_BG, borderColor: ANSWER_CHIP_BORDER },
  cardSide: { fontFamily: 'Inter_600SemiBold', fontSize: 7, color: QUESTION_TEXT, letterSpacing: 1.7 },
  cardSideFlipped: { color: ANSWER_TEXT, opacity: 1 },
  cardBody: { flex: 1, marginTop: 18, marginBottom: 18 },
  cardBodyContent: { flexGrow: 1, justifyContent: 'center' },
  cardBodyContentLandscape: {
    justifyContent: 'flex-start',
    paddingBottom: 5,
  },
  cardText: { fontFamily: 'Inter_900Black', fontSize: 23, color: QUESTION_TEXT, lineHeight: 31 },
  cardTextFlipped: { color: ANSWER_TEXT },
  randomCardSource: { fontFamily: 'Inter_700Bold', fontSize: 8, color: QUESTION_TEXT, opacity: 0.58, letterSpacing: 1.2, marginBottom: 10 },
  randomCardSourceFlipped: { color: ANSWER_TEXT },
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
  diffPill: { alignSelf: 'flex-start', backgroundColor: QUESTION_CHIP_BG, borderRadius: 999, paddingHorizontal: 3, paddingVertical: 1, borderWidth: 1, borderColor: QUESTION_CHIP_BORDER },
  diffPillFlipped: { backgroundColor: ANSWER_CHIP_BG, borderColor: ANSWER_CHIP_BORDER },
  diffText: { fontFamily: 'Inter_600SemiBold', fontSize: 8, color: QUESTION_TEXT, letterSpacing: 1.4 },
  diffTextFlipped: { color: ANSWER_TEXT },

  answerRow: {
    width: '100%',
    maxWidth: Math.min(layout.contentMaxWidth, 820),
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 5,
    paddingBottom: 5,
    paddingTop: 2,
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
    paddingVertical: 5,
    gap: 6,
  },
  answerBtnLandscape: {
    flex: 0,
    minHeight: 88,
    paddingVertical: 3,
  },
  rightBtn: {
    flex: 1,
    backgroundColor: softSuccess,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: softSuccessBorder,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
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
    paddingHorizontal: 6,
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
  resultStat: { flex: 1, alignItems: 'center', padding: 6 },
  resultNum: { fontFamily: 'Inter_900Black', fontSize: 40 },
  resultLbl: { fontFamily: 'Inter_400Regular', fontSize: 9, color: DIM2, letterSpacing: 1.5, marginTop: 4 },
  actionBtn: {
    backgroundColor: ACCENT,
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 14,
    width: '100%',
    alignItems: 'center',
  },
  actionBtnOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: GOLD_D },
  actionBtnText: { fontFamily: 'Inter_900Black', fontSize: 14, color: INK },
});
}

let s: ReturnType<typeof createStyles> = createStyles(DEFAULT_LAYOUT);
