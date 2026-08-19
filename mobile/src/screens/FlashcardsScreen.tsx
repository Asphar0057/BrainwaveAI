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
  Modal,
  Keyboard,
  UIManager,
  Dimensions,
  NativeSyntheticEvent,
  TargetedEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import PagerView, { AppPagerHandle } from '../components/AppPager';
import HapticTouchable from '../components/HapticTouchable';
import TileGleam from '../components/TileGleam';
import NeumorphicTexture, { NeumorphicLayer, cbTileShadow, cbModalShadow, cbTileBorder, cbTileCardGradient } from '../components/NeumorphicTexture';
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
  getFlashcardHistory,
  getFlashcardsInSet,
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
                  <NeumorphicTexture grainVariant="fine" grainOpacity={0.16} />
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
  onOpenSpacedRepetition,
}: {
  user: AuthUser;
  initialMode?: CreateMode;
  onBack: () => void;
  onCreated: (set: FlashcardSet, cards: Flashcard[]) => void;
  onOpenSpacedRepetition: () => void;
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const layout = useResponsiveLayout();
  const sidebarWidth = Math.min(layout.width * (layout.isLandscape ? 0.42 : 0.8), 340);
  const slideAnim = useRef(new Animated.Value(-sidebarWidth)).current;

  const openSidebar = () => {
    setSidebarOpen(true);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 100, friction: 14 }).start();
  };

  const closeSidebar = () => {
    Animated.timing(slideAnim, { toValue: -sidebarWidth, duration: 200, useNativeDriver: true }).start(() => setSidebarOpen(false));
  };

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // KeyboardAvoidingView only shrinks the space available to the ScrollView --
  // it has no idea which of the many stacked TextInputs (topic, notes, or one
  // of N manual question/answer pairs) is actually focused, so a field lower
  // on the page still ends up hidden behind the keyboard. Track the keyboard's
  // height and the ScrollView's current offset ourselves, then measure exactly
  // where the focused input sits on screen and scroll just enough to clear it.
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  const focusedNodeRef = useRef<number | null>(null);

  const scrollFocusedIntoView = () => {
    const nodeHandle = focusedNodeRef.current;
    if (nodeHandle == null) return;
    UIManager.measure(nodeHandle, (_x, _y, _width, height, _pageX, pageY) => {
      const keyboardTop = Dimensions.get('window').height - keyboardHeightRef.current;
      const margin = 24;
      const visibleBottom = keyboardTop - margin;
      const inputBottom = pageY + height;
      if (inputBottom > visibleBottom) {
        scrollRef.current?.scrollTo({ y: scrollYRef.current + (inputBottom - visibleBottom), animated: true });
      }
    });
  };

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    // The keyboard's real height is only known once this event fires, so the
    // scroll-into-view check has to happen here (not right on focus) for the
    // very first field tapped in a session -- otherwise it'd race the height
    // that hasn't arrived yet and silently do nothing.
    const showSub = Keyboard.addListener(showEvent, (e) => {
      keyboardHeightRef.current = e.endCoordinates?.height ?? 0;
      requestAnimationFrame(scrollFocusedIntoView);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardHeightRef.current = 0;
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const scrollToFocusedInput = (event: NativeSyntheticEvent<TargetedEvent>) => {
    focusedNodeRef.current = event.nativeEvent.target;
    // Keyboard's already open (just moving between fields) -- no show event
    // will fire again, so do the check directly instead of waiting for one.
    if (keyboardHeightRef.current > 0) {
      requestAnimationFrame(scrollFocusedIntoView);
    }
  };

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
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.header}>
          <HapticTouchable onPress={onBack} style={{ marginRight: 12 }} haptic="selection">
            <Ionicons name="chevron-back" size={20} color={GOLD_L} />
          </HapticTouchable>
          <Text style={[s.createTitle, { flex: 1 }]}>create set</Text>
          <HapticTouchable onPress={openSidebar} haptic="selection" accessibilityLabel="Open menu">
            <Ionicons name="menu-outline" size={22} color={GOLD_L} />
          </HapticTouchable>
        </View>

        <ScrollView
          ref={scrollRef}
          onScroll={(event) => { scrollYRef.current = event.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          contentContainerStyle={s.createContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.modeGrid}>
            <TileGleam style={s.modeCard} onPress={() => setMode('ai')} haptic="selection" borderRadius={16}>
              <NeumorphicTexture
                grainVariant="skia"
                grainOpacity={0.44}
                baseFrequency={0.7}
                gradientColors={cbTileCardGradient.colors}
                gradientStart={cbTileCardGradient.start}
                gradientEnd={cbTileCardGradient.end}
              />
              {mode === 'ai' ? <View pointerEvents="none" style={s.modeActiveWash} /> : null}
              <View style={s.modeTopRow}>
                <Text style={s.modeIndex}>01</Text>
                {mode === 'ai' ? <Ionicons name="checkmark" size={14} color={ACCENT2} /> : null}
              </View>
              <View style={{ flex: 1 }} />
              <Text style={[s.modeLabel, mode === 'ai' && s.modeLabelActive]}>AI Generate</Text>
            </TileGleam>
            <TileGleam style={s.modeCard} onPress={() => setMode('manual')} haptic="selection" borderRadius={16}>
              <NeumorphicTexture
                grainVariant="skia"
                grainOpacity={0.44}
                baseFrequency={0.7}
                gradientColors={cbTileCardGradient.colors}
                gradientStart={cbTileCardGradient.start}
                gradientEnd={cbTileCardGradient.end}
              />
              {mode === 'manual' ? <View pointerEvents="none" style={s.modeActiveWash} /> : null}
              <View style={s.modeTopRow}>
                <Text style={s.modeIndex}>02</Text>
                {mode === 'manual' ? <Ionicons name="checkmark" size={14} color={ACCENT2} /> : null}
              </View>
              <View style={{ flex: 1 }} />
              <Text style={[s.modeLabel, mode === 'manual' && s.modeLabelActive]}>Manual</Text>
            </TileGleam>
          </View>

          {mode === 'ai' ? (
            <View style={s.formGroup}>
              <Text style={s.fieldLabel}>Topic</Text>
              <TextInput
                value={topic}
                onChangeText={setTopic}
                placeholder="e.g. Quantum physics, Spanish vocab..."
                placeholderTextColor={DIM2}
                style={s.input}
                onFocus={scrollToFocusedInput}
              />

              <Text style={s.fieldLabel}>Cards</Text>
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

              <Text style={s.fieldLabel}>Difficulty</Text>
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

              <Text style={s.fieldLabel}>Notes (optional)</Text>
              <TextInput
                value={additionalSpecs}
                onChangeText={setAdditionalSpecs}
                placeholder="Focus on formulas, definitions, exam recall..."
                placeholderTextColor={DIM2}
                style={[s.input, s.inputMultiline]}
                multiline
                textAlignVertical="top"
                onFocus={scrollToFocusedInput}
              />
            </View>
          ) : (
            <View style={s.formGroup}>
              <Text style={s.fieldLabel}>Set title</Text>
              <TextInput
                value={manualTitle}
                onChangeText={setManualTitle}
                placeholder="e.g. AP Biology Unit 3"
                placeholderTextColor={DIM2}
                style={s.input}
                onFocus={scrollToFocusedInput}
              />

              {manualCards.map((card, index) => (
                <View key={index} style={s.manualCard}>
                  <View style={s.manualCardHeader}>
                    <View style={s.manualCardBadge}>
                      <Text style={s.manualCardBadgeText}>{index + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }} />
                    {manualCards.length > 1 ? (
                      <HapticTouchable onPress={() => removeManualCard(index)} haptic="warning" style={s.manualCardRemove}>
                        <Ionicons name="trash-outline" size={13} color={RED} />
                      </HapticTouchable>
                    ) : null}
                  </View>
                  <TextInput
                    value={card.question}
                    onChangeText={(value) => updateManualCard(index, 'question', value)}
                    placeholder="Question"
                    placeholderTextColor={DIM2}
                    style={[s.input, s.inputMultilineSmall]}
                    multiline
                    textAlignVertical="top"
                    onFocus={scrollToFocusedInput}
                  />
                  <TextInput
                    value={card.answer}
                    onChangeText={(value) => updateManualCard(index, 'answer', value)}
                    placeholder="Answer"
                    placeholderTextColor={DIM2}
                    style={[s.input, s.inputMultilineSmall, { marginTop: 8 }]}
                    onFocus={scrollToFocusedInput}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              ))}

              <HapticTouchable style={s.addCardBtn} onPress={addManualCard} activeOpacity={0.85} haptic="light">
                <Ionicons name="add" size={15} color={GOLD_L} />
                <Text style={s.addCardText}>add card</Text>
              </HapticTouchable>
            </View>
          )}

          <HapticTouchable
            style={[s.createSubmitBtn, submitting && s.createSubmitBtnDisabled]}
            onPress={mode === 'ai' ? submitAI : submitManual}
            disabled={submitting}
            activeOpacity={0.88}
            haptic="medium"
          >
            {submitting ? (
              <ActivityIndicator color={BASE_ACTION_TEXT} size="small" />
            ) : (
              <View style={s.createSubmitRow}>
                <Text style={s.createSubmitText}>
                  {mode === 'ai' ? 'Generate flashcards' : 'Create flashcard set'}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={BASE_ACTION_TEXT} />
              </View>
            )}
          </HapticTouchable>
        </ScrollView>
      </KeyboardAvoidingView>

      <FlashcardsMenuSidebar
        visible={sidebarOpen}
        sidebarWidth={sidebarWidth}
        slideAnim={slideAnim}
        onClose={closeSidebar}
        activeKey="generate"
        onBrowse={onOpenSpacedRepetition}
        onGenerate={() => setMode('ai')}
        onMySets={onBack}
      />
    </SafeAreaView>
  );
}

// Shared hamburger-menu sidebar for both the sets list and the create-set
// screen, so the two stay visually identical and each highlights where you are.
function FlashcardsMenuSidebar({
  visible,
  sidebarWidth,
  slideAnim,
  onClose,
  setsCount,
  activeKey,
  onBrowse,
  onGenerate,
  onMySets,
}: {
  visible: boolean;
  sidebarWidth: number;
  slideAnim: Animated.Value;
  onClose: () => void;
  /** Omitted on screens that don't already track the sets list (e.g. the create screen). */
  setsCount?: number;
  activeKey: 'browse' | 'generate' | 'sets';
  onBrowse: () => void;
  onGenerate: () => void;
  onMySets: () => void;
}) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="none" onRequestClose={onClose}>
      <View style={s.sidebarOverlay}>
        <HapticTouchable style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} haptic="none" />
        <Animated.View style={[s.sidebarPanel, { width: sidebarWidth, transform: [{ translateX: slideAnim }] }]}>
          <LinearGradient
            colors={[darkenColor(CURRENT_THEME.bgTop, CURRENT_THEME.isLight ? 4 : 0), CURRENT_THEME.panelAlt, CURRENT_THEME.bgPrimary]}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView style={{ flex: 1, paddingBottom: 6 }} edges={['top', 'bottom']}>
            <View style={s.sidebarHero}>
              <NeumorphicLayer grainOpacity={0.22} />
              {setsCount != null ? <Text style={s.sidebarGhost}>{setsCount}</Text> : null}
              <Text style={s.sidebarHeroTitle}>flashcards</Text>
              <Text style={s.sidebarHeroSub}>
                {setsCount != null ? `${setsCount} ${setsCount === 1 ? 'set' : 'sets'}` : 'study sets'}
              </Text>
            </View>

            <View style={s.sidebarMenu}>
              {activeKey === 'browse' ? (
                <View style={[s.menuCard, s.menuCardActive]}>
                  <View style={s.menuRow}>
                    <View style={[s.menuIconWrap, s.menuIconWrapActive]}>
                      <Ionicons name="time" size={16} color={INK} />
                    </View>
                    <Text style={[s.menuLabel, s.menuLabelActive]}>Browse</Text>
                    <View style={s.menuActiveDot} />
                  </View>
                </View>
              ) : (
                <HapticTouchable style={s.menuCard} onPress={() => { onClose(); onBrowse(); }} haptic="selection" activeOpacity={0.85}>
                  <View style={s.menuRow}>
                    <View style={s.menuIconWrap}>
                      <Ionicons name="time-outline" size={16} color={GOLD_L} />
                    </View>
                    <Text style={s.menuLabel}>Browse</Text>
                    <Ionicons name="chevron-forward" size={15} color={DIM2} />
                  </View>
                </HapticTouchable>
              )}

              {activeKey === 'generate' ? (
                <View style={[s.menuCard, s.menuCardActive]}>
                  <View style={s.menuRow}>
                    <View style={[s.menuIconWrap, s.menuIconWrapActive]}>
                      <Ionicons name="sparkles" size={16} color={INK} />
                    </View>
                    <Text style={[s.menuLabel, s.menuLabelActive]}>Generate</Text>
                    <View style={s.menuActiveDot} />
                  </View>
                </View>
              ) : (
                <HapticTouchable style={s.menuCard} onPress={() => { onClose(); onGenerate(); }} haptic="selection" activeOpacity={0.85}>
                  <View style={s.menuRow}>
                    <View style={s.menuIconWrap}>
                      <Ionicons name="sparkles-outline" size={16} color={GOLD_L} />
                    </View>
                    <Text style={s.menuLabel}>Generate</Text>
                    <Ionicons name="chevron-forward" size={15} color={DIM2} />
                  </View>
                </HapticTouchable>
              )}

              {activeKey === 'sets' ? (
                <View style={[s.menuCard, s.menuCardActive]}>
                  <View style={s.menuRow}>
                    <View style={[s.menuIconWrap, s.menuIconWrapActive]}>
                      <Ionicons name="albums" size={16} color={INK} />
                    </View>
                    <Text style={[s.menuLabel, s.menuLabelActive]}>My Sets</Text>
                    <View style={s.menuActiveDot} />
                  </View>
                </View>
              ) : (
                <HapticTouchable style={s.menuCard} onPress={() => { onClose(); onMySets(); }} haptic="selection" activeOpacity={0.85}>
                  <View style={s.menuRow}>
                    <View style={s.menuIconWrap}>
                      <Ionicons name="albums-outline" size={16} color={GOLD_L} />
                    </View>
                    <Text style={s.menuLabel}>My Sets</Text>
                    <Ionicons name="chevron-forward" size={15} color={DIM2} />
                  </View>
                </HapticTouchable>
              )}
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
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
  const [loadingCards, setLoadingCards] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const layout = useResponsiveLayout();
  const sidebarWidth = Math.min(layout.width * (layout.isLandscape ? 0.42 : 0.8), 340);
  const slideAnim = useRef(new Animated.Value(-sidebarWidth)).current;

  useEffect(() => {
    setLoading(true);
    getFlashcardHistory(user.username)
      .then((data) => {
        setSets(data?.flashcard_history ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user.username, refreshTick]);

  const refreshCollection = async () => {
    setRefreshing(true);
    try {
      const history = await getFlashcardHistory(user.username);
      setSets(history?.flashcard_history ?? []);
    } finally {
      setRefreshing(false);
    }
  };

  const openSidebar = () => {
    setSidebarOpen(true);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 100, friction: 14 }).start();
  };

  const closeSidebar = () => {
    Animated.timing(slideAnim, { toValue: -sidebarWidth, duration: 200, useNativeDriver: true }).start(() => setSidebarOpen(false));
  };

  const startStudy = async (set: FlashcardSet, shuffle = false) => {
    setLoadingCards(true);
    try {
      const data = await getFlashcardsInSet(set.id);
      let cards = (data?.flashcards ?? []) as Flashcard[];
      if (shuffle) {
        cards = [...cards]
          .map((item) => ({ item, order: Math.random() }))
          .sort((a, b) => a.order - b.order)
          .map(({ item }) => item);
      }
      onOpenStudy(set, cards);
    } catch {
      Alert.alert('Unable to open set', 'The flashcards could not be loaded.');
    } finally {
      setLoadingCards(false);
    }
  };

  const cleanTitle = (title: string) => title
    .replace(/^flashcards\s*(from|:)\s*/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const columns = layout.width >= 700 ? 3 : 2;
  const coverColors = ['#df6b6b', '#69beb8', '#68aac7', '#e99b76', '#8dbfab', '#dcc86d'];

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
        <HapticTouchable onPress={openSidebar} haptic="selection" accessibilityLabel="Open menu">
          <Ionicons name="menu-outline" size={24} color={GOLD_L} />
        </HapticTouchable>
      </View>

      {loading ? (
        <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
      ) : (
        <View style={s.workspace}>
          <HapticTouchable style={s.generateHero} onPress={() => onOpenCreate('ai')} haptic="medium" activeOpacity={0.88}>
            <Ionicons name="add" size={16} color={BASE_ACTION_TEXT} />
            <Text style={s.generateHeroText}>Generate</Text>
          </HapticTouchable>

          <View style={s.collectionHeader}>
            <Text style={s.collectionCount}>{sets.length} {sets.length === 1 ? 'set' : 'sets'}</Text>
            <View style={s.viewToggle}>
              <HapticTouchable
                style={[s.viewToggleBtn, viewMode === 'grid' && s.viewToggleBtnActive]}
                onPress={() => setViewMode('grid')}
                haptic="selection"
                accessibilityLabel="Grid view"
              >
                <Ionicons name="grid-outline" size={15} color={viewMode === 'grid' ? INK : DIM2} />
              </HapticTouchable>
              <HapticTouchable
                style={[s.viewToggleBtn, viewMode === 'list' && s.viewToggleBtnActive]}
                onPress={() => setViewMode('list')}
                haptic="selection"
                accessibilityLabel="List view"
              >
                <Ionicons name="list-outline" size={15} color={viewMode === 'list' ? INK : DIM2} />
              </HapticTouchable>
            </View>
          </View>

          {sets.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="albums-outline" size={32} color={GOLD_D} />
              <Text style={s.emptyTitle}>no sets yet</Text>
              <Text style={s.emptyHint}>tap generate to create your first set</Text>
            </View>
          ) : viewMode === 'grid' ? (
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
              {sets.map((item, index) => (
                <View
                  key={item.id}
                  style={[s.collectionCard, { width: columns === 3 ? '31.8%' : '48.6%' }]}
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
                    <View style={s.collectionMasteryBar}>
                      <View style={[s.collectionMasteryFill, { width: `${Math.max(3, item.accuracy_percentage)}%` as const }]} />
                    </View>
                    <View style={s.cardActionRow}>
                      <HapticTouchable
                        style={[s.cardActionBtn, { flex: 1 }]}
                        onPress={() => startStudy(item, true)}
                        haptic="selection"
                        accessibilityLabel={`Practice ${cleanTitle(item.title)}`}
                      >
                        <Ionicons name="flash-outline" size={15} color={GOLD_L} />
                      </HapticTouchable>
                      <HapticTouchable
                        style={[s.cardActionBtn, s.cardActionBtnPrimary, { flex: 1 }]}
                        onPress={() => startStudy(item)}
                        haptic="medium"
                        accessibilityLabel={`Study ${cleanTitle(item.title)}`}
                      >
                        <Ionicons name="book-outline" size={15} color={BASE_ACTION_TEXT} />
                      </HapticTouchable>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : (
            <ScrollView
              style={s.collectionScroll}
              contentContainerStyle={s.listGrid}
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
              {sets.map((item, index) => (
                <View key={item.id} style={s.listRow}>
                  <View style={[s.listSwatch, { backgroundColor: coverColors[index % coverColors.length] }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.listTitle} numberOfLines={1}>{cleanTitle(item.title)}</Text>
                    <Text style={s.listMeta}>{item.card_count} cards · {Math.round(item.accuracy_percentage)}% mastery</Text>
                  </View>
                  <HapticTouchable
                    style={[s.cardActionBtn, { width: 34 }]}
                    onPress={() => startStudy(item, true)}
                    haptic="selection"
                    accessibilityLabel={`Practice ${cleanTitle(item.title)}`}
                  >
                    <Ionicons name="flash-outline" size={15} color={GOLD_L} />
                  </HapticTouchable>
                  <HapticTouchable
                    style={[s.cardActionBtn, s.cardActionBtnPrimary, { width: 34 }]}
                    onPress={() => startStudy(item)}
                    haptic="medium"
                    accessibilityLabel={`Study ${cleanTitle(item.title)}`}
                  >
                    <Ionicons name="book-outline" size={15} color={BASE_ACTION_TEXT} />
                  </HapticTouchable>
                </View>
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

      <FlashcardsMenuSidebar
        visible={sidebarOpen}
        sidebarWidth={sidebarWidth}
        slideAnim={slideAnim}
        onClose={closeSidebar}
        setsCount={sets.length}
        activeKey="sets"
        onBrowse={onOpenSpacedRepetition}
        onGenerate={() => onOpenCreate('ai')}
        onMySets={() => {}}
      />
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
            onOpenSpacedRepetition={() => navigation.navigate('FlashcardsSpacedRepetition')}
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
  const softAccentBorder = rgbaFromHex(ACCENT, 0.26);
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
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  title: { fontFamily: 'Inter_900Black', fontSize: 32, color: GOLD_L, letterSpacing: -0.8 },

  workspace: {
    flex: 1,
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  // One full-width, cinematically letter-spaced call to action -- replaces the old three-button row.
  generateHero: {
    width: '100%', minHeight: 54, borderRadius: 18, marginBottom: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: BASE_ACTION_BG, overflow: 'hidden',
    boxShadow: cbTileShadow(0.12), ...cbTileBorder(0.26),
  },
  generateHeroText: {
    fontFamily: 'Inter_900Black', fontSize: 12, color: BASE_ACTION_TEXT,
    letterSpacing: 4, textTransform: 'uppercase',
  },
  collectionHeader: { minHeight: 34, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  collectionCount: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: DIM2, letterSpacing: 0.3 },
  viewToggle: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  viewToggleBtn: { width: 34, height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(SURFACE, 0.9) },
  viewToggleBtnActive: { backgroundColor: ACCENT },
  collectionScroll: { flex: 1 },
  collectionGrid: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', paddingBottom: 18 },
  collectionCard: { height: collectionCardHeight, borderRadius: 17, backgroundColor: rgbaFromHex(SURFACE, 0.95), overflow: 'hidden', boxShadow: cbTileShadow(0.06), ...cbTileBorder(0.14) },
  collectionCover: { height: collectionCoverHeight, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  collectionCardTitle: { fontFamily: 'Inter_900Black', fontSize: 14, lineHeight: 17, color: '#171411', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },
  collectionCardCount: { fontFamily: 'Inter_700Bold', fontSize: 9, color: rgbaFromHex('#171411', 0.66), letterSpacing: 1.2, marginTop: 7 },
  collectionCardMeta: { flex: 1, padding: 14, justifyContent: 'space-between', gap: 8 },
  collectionMasteryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  collectionMasteryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: DIM2, letterSpacing: 1 },
  collectionMasteryValue: { fontFamily: 'Inter_700Bold', fontSize: 11, color: ACCENT },
  collectionMasteryBar: { width: '100%', height: 4, borderRadius: 2, backgroundColor: rgbaFromHex(ACCENT, 0.12), overflow: 'hidden' },
  collectionMasteryFill: { height: '100%', borderRadius: 2, backgroundColor: ACCENT },
  cardActionRow: { flexDirection: 'row', gap: 8 },
  cardActionBtn: {
    height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: rgbaFromHex(SURFACE, 0.9), borderWidth: 1, borderColor: BORDER,
  },
  cardActionBtnPrimary: { backgroundColor: BASE_ACTION_BG, borderColor: BASE_ACTION_BORDER },

  listGrid: { paddingBottom: 18, gap: 9 },
  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 10,
    backgroundColor: rgbaFromHex(SURFACE, 0.95), overflow: 'hidden',
    boxShadow: cbTileShadow(0.05), ...cbTileBorder(0.12),
  },
  listSwatch: { width: 42, height: 42, borderRadius: 10 },
  listTitle: { fontFamily: 'Inter_900Black', fontSize: 14, color: GOLD_L },
  listMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM2, marginTop: 2 },

  sidebarOverlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.58)' },
  sidebarPanel: {
    height: '100%', borderRightWidth: 1, borderRightColor: rgbaFromHex(GOLD_D, 0.31),
    overflow: 'hidden', boxShadow: cbModalShadow(0.2),
  },
  sidebarHero: {
    marginHorizontal: 14, marginTop: 12, marginBottom: 14,
    borderRadius: 22, padding: 16, overflow: 'hidden',
    boxShadow: cbModalShadow(0.14),
  },
  sidebarGhost: {
    position: 'absolute', right: 10, top: -8,
    fontFamily: 'Inter_900Black', fontSize: 60, lineHeight: 64,
    color: rgbaFromHex(GOLD_L, 0.07), letterSpacing: -3,
  },
  sidebarHeroTitle: { fontFamily: 'Inter_900Black', fontSize: 22, color: GOLD_L, letterSpacing: -0.5 },
  sidebarHeroSub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM2, marginTop: 3 },

  sidebarMenu: { paddingHorizontal: 10, gap: 4 },
  menuCard: { borderRadius: 16, overflow: 'hidden' },
  menuCardActive: { backgroundColor: rgbaFromHex(ACCENT, 0.14) },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12 },
  menuIconWrap: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: rgbaFromHex(GOLD_D, 0.18), borderWidth: 1, borderColor: rgbaFromHex(GOLD_L, 0.2),
  },
  menuIconWrapActive: { backgroundColor: ACCENT2, borderColor: ACCENT2 },
  menuLabel: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14, color: GOLD_L },
  menuLabelActive: { color: ACCENT2, fontFamily: 'Inter_700Bold' },
  menuActiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: ACCENT2 },

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
    padding: 4,
    gap: 16,
    paddingBottom: 100,
  },
  // Small, plain header title distinct from the big list-page numeral --
  // matches the compact scale of the rest of this screen.
  createTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: GOLD_L, letterSpacing: -0.2 },

  // Same module as the explore page's bento tiles: index number + check
  // top row, big bold title bottom, no icon glyph -- generously padded, not cramped.
  modeGrid: { flexDirection: 'row', gap: 12 },
  modeCard: {
    flex: 1, minHeight: 96, borderRadius: 16, padding: 16, overflow: 'hidden',
  },
  modeActiveWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: rgbaFromHex(ACCENT, 0.16),
  },
  modeTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeIndex: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.5, color: DIM2 },
  modeLabel: { fontFamily: 'Inter_900Black', fontSize: 17, color: GOLD_L, letterSpacing: -0.4 },
  modeLabelActive: { color: ACCENT2 },

  // No enclosing card -- fields sit straight on the page background, same as the web layout.
  // Screen-level centering comes from createContent's own alignSelf/maxWidth; the form
  // content itself stays left-aligned, like a normal form.
  formGroup: { gap: 7 },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold', fontSize: 10, color: GOLD_D,
    textTransform: 'uppercase', letterSpacing: 1, marginTop: 7,
  },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  optionPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: rgbaFromHex(SURFACE, 0.8),
    borderWidth: 1,
    borderColor: BORDER,
  },
  optionPillActive: { backgroundColor: ACCENT, borderColor: ACCENT2 },
  optionPillText: {
    fontFamily: 'Inter_700Bold', fontSize: 9.5, color: GOLD_L,
    textTransform: 'uppercase', letterSpacing: 1.6,
  },
  optionPillTextActive: { color: INK },
  input: {
    backgroundColor: rgbaFromHex(SURFACE, 0.8),
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: INPUT_TEXT,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  inputMultiline: { minHeight: 70 },
  inputMultilineSmall: { minHeight: 44 },
  manualCard: {
    width: '100%',
    backgroundColor: rgbaFromHex(SURFACE, 0.8),
    borderRadius: 12,
    padding: 11,
    borderWidth: 1,
    borderColor: BORDER,
  },
  manualCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  manualCardBadge: {
    width: 19, height: 19, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: rgbaFromHex(GOLD_L, 0.14),
  },
  manualCardBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: GOLD_L },
  manualCardRemove: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: rgbaFromHex(RED, 0.1),
  },
  addCardBtn: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: softAccentBorder,
    backgroundColor: rgbaFromHex(SURFACE, 0.6),
  },
  addCardText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: GOLD_L },
  createSubmitBtn: {
    backgroundColor: BASE_ACTION_BG,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: cbTileShadow(0.1), ...cbTileBorder(0.24),
  },
  createSubmitBtnDisabled: { opacity: 0.7 },
  createSubmitRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  createSubmitText: {
    fontFamily: 'Inter_700Bold', fontSize: 11, color: BASE_ACTION_TEXT,
    textTransform: 'uppercase', letterSpacing: 2,
  },

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
  studyMetaLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, color: DIM2, letterSpacing: 1.4, textTransform: 'uppercase' },
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
    padding: 26,
    justifyContent: 'space-between',
    overflow: 'hidden',
    boxShadow: cbModalShadow(0.16),
    ...cbTileBorder(0.22),
  },
  cardFlipped: { backgroundColor: rgbaFromHex(ANSWER_SURFACE, 0.96), borderColor: ANSWER_CHIP_BORDER },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTopActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  reviewToggle: { minHeight: 30, borderRadius: 999, paddingHorizontal: 10, borderWidth: 1, borderColor: QUESTION_CHIP_BORDER, backgroundColor: QUESTION_CHIP_BG, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  reviewToggleActive: { backgroundColor: ACCENT, borderColor: ACCENT2 },
  reviewToggleText: { fontFamily: 'Inter_700Bold', fontSize: 9, color: QUESTION_TEXT, letterSpacing: 0.5 },
  reviewToggleTextActive: { color: INK },
  cardSidePill: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: QUESTION_CHIP_BG, borderWidth: 1, borderColor: QUESTION_CHIP_BORDER },
  cardSidePillFlipped: { backgroundColor: ANSWER_CHIP_BG, borderColor: ANSWER_CHIP_BORDER },
  cardSide: { fontFamily: 'Inter_700Bold', fontSize: 9, color: QUESTION_TEXT, letterSpacing: 1.4 },
  cardSideFlipped: { color: ANSWER_TEXT, opacity: 1 },
  cardBody: { flex: 1, marginTop: 18, marginBottom: 18 },
  cardBodyContent: { flexGrow: 1, justifyContent: 'center' },
  cardBodyContentLandscape: {
    justifyContent: 'flex-start',
    paddingBottom: 18,
  },
  cardText: { fontFamily: 'Inter_900Black', fontSize: 23, color: QUESTION_TEXT, lineHeight: 31 },
  cardTextFlipped: { color: ANSWER_TEXT },
  randomCardSource: { fontFamily: 'Inter_700Bold', fontSize: 9, color: QUESTION_TEXT, opacity: 0.6, letterSpacing: 1, marginBottom: 10 },
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
  diffPill: { alignSelf: 'flex-start', backgroundColor: QUESTION_CHIP_BG, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: QUESTION_CHIP_BORDER },
  diffPillFlipped: { backgroundColor: ANSWER_CHIP_BG, borderColor: ANSWER_CHIP_BORDER },
  diffText: { fontFamily: 'Inter_700Bold', fontSize: 9, color: QUESTION_TEXT, letterSpacing: 1 },
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
    boxShadow: cbTileShadow(0.1),
  },
  actionBtnOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: GOLD_D },
  actionBtnText: { fontFamily: 'Inter_900Black', fontSize: 14, color: INK },
});
}

let s: ReturnType<typeof createStyles> = createStyles(DEFAULT_LAYOUT);
