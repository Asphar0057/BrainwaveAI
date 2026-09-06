import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  UIManager,
  Dimensions,
  NativeSyntheticEvent,
  TargetedEvent,
  ViewStyle,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import HapticTouchable from '../components/HapticTouchable';
import TileGleam from '../components/TileGleam';
import NeumorphicTexture, {
  cbTileShadow, cbTileBorder, cbTileCardGradient,
  cbPlainCardShadow, CB_ACCENT,
} from '../components/NeumorphicTexture';
import MathText from '../components/MathText';
import AmbientBubbles from '../components/AmbientBubbles';
import GeoBackground from '../components/GeoBackground';
import SectionSidebar, { SidebarItem } from '../components/SectionSidebar';
import PulseCubes from '../components/PulseCubes';
import SpacedRepetitionScreen from './SpacedRepetitionScreen';
import { AuthUser } from '../services/auth';
import { useAppTheme } from '../contexts/ThemeContext';
import {
  createFlashcard,
  createFlashcardSet,
  ensureFlashcardDistractors,
  generateFlashcards,
  getFlashcardHistory,
  getFlashcardsInSet,
  setFlashcardStatus,
  srReviewFlashcard,
} from '../services/api';
import { triggerHaptic } from '../utils/haptics';
import { darkenColor, getDefaultTheme, lightenColor, rgbaFromHex } from '../utils/theme';
import { getResponsiveLayout, useResponsiveLayout } from '../hooks/useResponsiveLayout';

const DEFAULT_THEME = getDefaultTheme();
const DEFAULT_LAYOUT = getResponsiveLayout(393, 852);
let CURRENT_THEME = DEFAULT_THEME;
let CURRENT_LAYOUT = DEFAULT_LAYOUT;
// createStyles() computes these from the current layout; StudyView needs the
// plain numbers (drag thresholds, exit distance) outside the StyleSheet object.
let CURRENT_CARD_WIDTH = 280;
let CURRENT_CARD_HEIGHT = 280;
let BG = DEFAULT_THEME.bgPrimary;
let SURFACE = DEFAULT_THEME.panel;
let SURFACE_2 = DEFAULT_THEME.panelAlt;
let SURFACE_RAISED = DEFAULT_THEME.isLight ? DEFAULT_THEME.panel : lightenColor(DEFAULT_THEME.panelAlt, 6);
let ACCENT = DEFAULT_THEME.accent;
let ACCENT2 = DEFAULT_THEME.accentHover;
let GOLD_L = DEFAULT_THEME.accentHover;
let GOLD_D = darkenColor(DEFAULT_THEME.accent, DEFAULT_THEME.isLight ? 10 : 26);
let GOLD_XD = darkenColor(DEFAULT_THEME.accent, DEFAULT_THEME.isLight ? 26 : 40);
let BORDER = DEFAULT_THEME.borderStrong;
let DIM = DEFAULT_THEME.panelMuted;
let DIM2 = DEFAULT_THEME.textSecondary;
let INK = DEFAULT_THEME.isLight ? darkenColor(DEFAULT_THEME.accent, 45) : darkenColor(DEFAULT_THEME.primary, 2);
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
  last_known?: boolean | null;
  wrong_options?: string[];
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
  FlashcardsQuiz: { set: FlashcardSet; cards: Flashcard[] };
  FlashcardsResults: { set: FlashcardSet; cards: Flashcard[]; stats: { correct: number; incorrect: number } };
  FlashcardsQuizResults: { set: FlashcardSet; cards: Flashcard[]; stats: { correct: number; incorrect: number }; records: QuizRecord[] };
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
  ACCENT = theme.accent;
  ACCENT2 = theme.accentHover;
  GOLD_L = theme.accentHover;
  GOLD_D = darkenColor(theme.accent, theme.isLight ? 10 : 26);
  GOLD_XD = darkenColor(theme.accent, theme.isLight ? 26 : 40);
  BORDER = theme.borderStrong;
  DIM = theme.panelMuted;
  DIM2 = theme.textSecondary;
  INK = theme.isLight ? darkenColor(theme.accent, 45) : darkenColor(theme.primary, 2);
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

// One flashcard's visual face -- shared by the static "next card" peek
// sitting underneath and the live draggable card on top.
function renderCardFace(faceCard: Flashcard, isFlipped: boolean, useLandscapeLayout: boolean, isRandomSet: boolean) {
  // Question leads with a lightened accent fading to a lightened primary
  // (bright, pairs with the black question text); answer is the same pair
  // reversed and darkened instead (primary leading, fading to a darkened
  // accent) so the two faces read as distinctly different -- not just
  // brightness-matched stops swapped around.
  const questionAccent = lightenColor(CURRENT_THEME.accent, CURRENT_THEME.isLight ? 6 : 14);
  const questionPrimary = lightenColor(CURRENT_THEME.primary, CURRENT_THEME.isLight ? 4 : 16);
  const answerAccent = darkenColor(CURRENT_THEME.accent, CURRENT_THEME.isLight ? 18 : 38);
  const gradientColors: [string, string] = isFlipped
    ? [CURRENT_THEME.primary, answerAccent]
    : [questionAccent, questionPrimary];

  return (
    <View style={[s.card, { backgroundColor: gradientColors[1] }]}>
      {/* The skia-canvas grain variant is its own native surface (a real
          Canvas/SurfaceView on Android) and does NOT respect a parent View's
          overflow:hidden + borderRadius clip -- it was rendering as a square
          black surface poking out past the card's rounded corners on one
          side. Login/Home never showed this because their canvas is also
          solid near-black on a near-black page, so the square bleed was
          invisible there; this card's actual accent colors made it obvious.
          A plain LinearGradient is a normal RN view and clips correctly, so
          the gradient moved there; only the SVG-based (non-canvas) grain
          stays on NeumorphicTexture. */}
      <View style={s.cardClip} pointerEvents="none">
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0.1, y: 0.05 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <NeumorphicTexture grainVariant="fine" grainOpacity={0.14} />
      </View>

      <ScrollView
        style={s.cardBody}
        contentContainerStyle={[s.cardBodyContent, useLandscapeLayout && s.cardBodyContentLandscape]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        nestedScrollEnabled
      >
        {isRandomSet && faceCard.set_title ? (
          <Text style={s.randomCardSource} numberOfLines={1}>
            FROM {faceCard.set_title.toUpperCase()}
          </Text>
        ) : null}
        {/* Cards with LaTeX render through MathJaxSvg, which mounts a hidden
            WebView to do the actual rendering. A WebView is a real native
            component that competes for touch dispatch -- once one mounts
            inside the card, it can permanently swallow touches meant for the
            card's own drag/tap handling, on that card specifically, which is
            exactly why only the one card with math content in it went dead
            while every plain-text card kept working fine. None of this
            content needs to be individually touchable anyway -- the whole
            card's tap/drag is handled by DraggableCard's own PanResponder +
            touch handlers on its wrapping View -- so it's inert to touch. */}
        <View pointerEvents="none">
          <MathText style={[s.cardText, !isFlipped && s.cardTextQuestion]}>
            {isFlipped ? faceCard.answer : faceCard.question}
          </MathText>
        </View>
      </ScrollView>
    </View>
  );
}

type DraggableCardHandle = { dismiss: (direction: 1 | -1) => void };

// One card's entire drag/flip/peel-away animation, self-contained. Mounted
// fresh (via `key={idx}` at the call site) for every card that becomes the
// top of the stack -- see the comment on StudyView's state block for why
// that matters: every Animated.Value here starts at a real, known default
// on every mount, so there is no shared, cross-card animation state left to
// ever get out of sync.
const DraggableCard = forwardRef<DraggableCardHandle, {
  faceCard: Flashcard;
  isFlipped: boolean;
  useLandscapeLayout: boolean;
  isRandomSet: boolean;
  cardWidth: number;
  onFlip: () => void;
  onDismissed: () => void;
}>(function DraggableCard({ faceCard, isFlipped, useLandscapeLayout, isRandomSet, cardWidth, onFlip, onDismissed }, ref) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const peelX = useRef(new Animated.Value(0)).current;
  const peelRotate = useRef(new Animated.Value(0)).current;
  const peelOpacity = useRef(new Animated.Value(1)).current;
  const isBusyRef = useRef(false);

  const doFlip = () => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    Animated.timing(scaleAnim, { toValue: 0, duration: 130, useNativeDriver: true }).start(() => {
      onFlip();
      // onFlip() only *schedules* the parent re-render with the new
      // question/answer text -- it doesn't happen synchronously. Starting
      // the native-driven grow-back animation immediately in this callback
      // let it run (and finish) before that re-render actually committed to
      // the native view, so the card visibly grew back showing the OLD face
      // and only swapped to the right one once React/the bridge got around
      // to flushing it. Waiting two frames (double rAF is the standard "give
      // the renderer a chance to actually paint" trick) before growing back
      // gives that commit time to land first.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          Animated.timing(scaleAnim, { toValue: 1, duration: 130, useNativeDriver: true }).start(() => {
            isBusyRef.current = false;
          });
        });
      });
    });
  };

  const snapBack = () => {
    Animated.parallel([
      Animated.spring(peelX, { toValue: 0, friction: 7, useNativeDriver: true }),
      Animated.spring(peelRotate, { toValue: 0, friction: 7, useNativeDriver: true }),
    ]).start();
  };

  // Slide + rotate + fade away, like flicking the top sheet off a stack,
  // then tell the parent it's gone. There's no reset to do afterward: this
  // whole component (and every Animated.Value in it) is about to be
  // discarded once the parent swaps to the next card's key.
  const dismiss = (direction: 1 | -1) => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    Animated.parallel([
      Animated.timing(peelX, { toValue: direction * (cardWidth + 120), duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(peelRotate, { toValue: direction, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(peelOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onDismissed();
    });
  };

  useImperativeHandle(ref, () => ({ dismiss }));

  const tapTrackRef = useRef({ startX: 0, startY: 0, moved: false });
  const handleTouchStart = (event: GestureResponderEvent) => {
    tapTrackRef.current = { startX: event.nativeEvent.pageX, startY: event.nativeEvent.pageY, moved: false };
  };
  const handleTouchMove = (event: GestureResponderEvent) => {
    const dx = event.nativeEvent.pageX - tapTrackRef.current.startX;
    const dy = event.nativeEvent.pageY - tapTrackRef.current.startY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) tapTrackRef.current.moved = true;
  };
  const handleTouchEnd = () => {
    if (!tapTrackRef.current.moved) {
      triggerHaptic('light');
      doFlip();
    }
  };

  // PanResponder (React Native core, no separate native module) rather than
  // react-native-gesture-handler's Gesture.Pan: gesture-handler's recognizer
  // needs its JS-side object identity to stay permanently stable, and even
  // memoized correctly with a ref indirection for fresh closures, it still
  // went dead after exactly one successful swipe. PanResponder has no such
  // native-recognizer lifecycle to get out of sync -- it's a plain JS object,
  // fine to recreate every render, closing over this render's props directly.
  //
  // onStartShouldSetPanResponder returns false so a plain tap never claims
  // the responder at all -- PanResponder only engages once real, clearly
  // horizontal movement is seen (onMoveShouldSetPanResponder), which is also
  // what lets the card's own ScrollView keep vertical scroll gestures. A tap
  // that never engages PanResponder falls through to the plain
  // onTouchStart/onTouchEnd pair above, which only ever decides "was this a
  // tap" -- the drag/release logic lives entirely in the responder handlers,
  // so nothing here can double-fire the same gesture two different ways.
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
      if (isBusyRef.current) return false;
      return Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy);
    },
    onPanResponderMove: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
      if (isBusyRef.current) return;
      peelX.setValue(gesture.dx);
      peelRotate.setValue(Math.max(-1, Math.min(1, gesture.dx / cardWidth)));
    },
    onPanResponderRelease: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
      if (isBusyRef.current) return;
      const threshold = cardWidth * 0.28;
      if (Math.abs(gesture.dx) > threshold) {
        triggerHaptic('light');
        // Keep flying off in whichever direction the finger was already
        // going, rather than snapping to a fixed side.
        dismiss(gesture.dx > 0 ? 1 : -1);
      } else {
        snapBack();
      }
    },
    onPanResponderTerminate: () => {
      if (!isBusyRef.current) snapBack();
    },
    onPanResponderTerminationRequest: () => true,
  });

  return (
    <Animated.View
      style={{
        ...s.cardAnimatedWrap,
        opacity: peelOpacity,
        transform: [
          // Front card sits at 98% of the (full-size) card behind it -- a
          // deliberate, fixed depth cue for the "stacked deck" look, not a
          // bug to chase back to 100%. Multiple `scale` entries in one
          // transform array multiply, so this combines with the flip's own
          // tiny pop (0.985 -> 1) rather than overriding it.
          { scale: 0.98 },
          { scaleX: scaleAnim },
          { scale: scaleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) },
          { translateX: peelX },
          { rotate: peelRotate.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-16deg', '0deg', '16deg'] }) },
        ],
      }}
    >
      <View
        {...panResponder.panHandlers}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {renderCardFace(faceCard, isFlipped, useLandscapeLayout, isRandomSet)}
      </View>
    </Animated.View>
  );
});

function StudyView({
  set,
  cards,
  userId,
  onBack,
  onComplete,
  onAnswer,
}: {
  set: FlashcardSet;
  cards: Flashcard[];
  userId: string;
  onBack: () => void;
  onComplete: (stats: { correct: number; incorrect: number }) => void;
  onAnswer: (cardId: number, correct: boolean) => Promise<void>;
}) {
  const layout = useResponsiveLayout();
  const useLandscapeLayout = layout.isLandscape && layout.width >= 700;

  // ── State ────────────────────────────────────────────────────────────────
  // idx      -- which card is "on top" of the stack right now (0-based).
  // flipped  -- whether the TOP card (idx) is showing its answer face. Only
  //             ever applies to the top card; the peeked "next" card behind
  //             it always renders its question face (see renderCardFace call
  //             sites below) since you can't see its answer without it
  //             becoming the top card first.
  // stats    -- running correct/incorrect tally, shown in answerTally and
  //             handed to onComplete once the set runs out.
  //
  // The actual drag/flip/peel animation state used to live HERE, as one
  // shared set of Animated.Values reused across every card (reset by hand
  // after each transition). That's the actual bug behind every "card 2 is
  // dead" report: whatever reset those shared values after a transition --
  // stopAnimation()+setValue(), a busy-flag, a watchdog timeout, none of
  // it -- the SAME instance was still carrying state from the card before
  // it. <DraggableCard key={idx}> below fixes this at the root: each card
  // gets a brand-new component instance (React remounts it whenever the key
  // changes), so its Animated.Values start fresh at their real defaults --
  // there is no shared state left to reset wrong, ever.
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0 });

  const card = cards[idx];
  const nextCard = cards[idx + 1];

  // `cards` is an immutable prop loaded once at session start, so its
  // last_known always reflects the status from BEFORE this session -- exactly
  // what "previously known/unknown" means. Edits from the badge's swap/clear
  // controls land here instead, keyed by card id, so they show immediately
  // without mutating that prop.
  const [statusOverrides, setStatusOverrides] = useState<Record<number, boolean | null>>({});
  const priorStatus: boolean | null | undefined =
    card && card.id in statusOverrides ? statusOverrides[card.id] : card?.last_known;

  const setPriorStatus = (known: boolean | null) => {
    if (!card?.id) return;
    setStatusOverrides((current) => ({ ...current, [card.id]: known }));
    void setFlashcardStatus({ userId, cardId: card.id, known }).catch(() => {
      // Best-effort -- the local override already reflects the change.
    });
  };

  // Always current, so the completion callback of a just-finished dismiss
  // animation (whose closure was captured whenever THAT animation started,
  // possibly several renders ago) reports the real tally instead of
  // whatever `stats` was at that moment.
  const statsRef = useRef(stats);
  statsRef.current = stats;

  const cardRef = useRef<DraggableCardHandle>(null);
  // DraggableCard's own isBusyRef stops a rapid double-tap from *animating*
  // twice, but answer() itself has no such guard -- without this, the same
  // double-tap would still call onAnswer/setStats a second time for the
  // same card before the first dismiss unmounts it. Reset per card via idx.
  const answeredRef = useRef(false);
  useEffect(() => { answeredRef.current = false; }, [idx]);

  // Instant -- no exit animation to play on the way back, since there's
  // nothing stacked behind us in that direction to reveal (the stack only
  // ever holds the *next* card). <DraggableCard key={idx}> mounting fresh
  // for the (now current) previous card is itself enough of a visual beat.
  const goBack = () => {
    if (idx === 0) return;
    setIdx((i) => i - 1);
    setFlipped(false);
  };

  // Called by DraggableCard once its own exit animation finishes -- advance
  // to the next card, or finish the set if that was the last one. (Reads
  // `idx` from the closure rather than a setIdx updater function on purpose:
  // this only ever runs once, right when a specific card's own dismiss
  // animation completes, so there's no rapid-refire risk to guard against --
  // and onComplete is a real side effect, which a setState updater is not
  // supposed to carry, since React can invoke updaters more than once.)
  const handleCardDismissed = () => {
    if (idx + 1 >= cards.length) {
      onComplete(statsRef.current);
      return;
    }
    setIdx(idx + 1);
    setFlipped(false);
  };

  const answer = (correct: boolean) => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    if (card?.id) {
      void onAnswer(card.id, correct).catch(() => {
        // Keep the study session responsive if review telemetry is unavailable.
      });
    }
    const key = correct ? 'correct' : 'incorrect';
    setStats((current) => ({ ...current, [key]: current[key] + 1 }));
    // "know this" peels off to the right, "don't know" to the left.
    cardRef.current?.dismiss(correct ? 1 : -1);
  };

  // Right arrow -- same visual exit as a completed swipe/"know this" press,
  // just with no answer recorded.
  const goForward = () => {
    cardRef.current?.dismiss(1);
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
      <View style={s.cardStage}>
        {/* Next card sits behind, always visible -- its real background/shape/
            color render normally so the stack always reads as populated;
            only its TEXT is masked, via a blur layered on top of the
            finished card, so nothing here is readable until it actually
            becomes the front card. */}
        {nextCard ? (
          <View pointerEvents="none" style={[s.cardAnimatedWrap, s.cardStackBehind]}>
            {renderCardFace(nextCard, false, useLandscapeLayout, set.id === -1)}
            <BlurView
              intensity={55}
              tint={CURRENT_THEME.isLight ? 'light' : 'dark'}
              style={s.cardGlassOverlay}
            />
          </View>
        ) : null}

        {/* key={card.id ?? idx}: a brand-new DraggableCard instance per card,
            so its drag/flip animation state always starts fresh -- see the
            comment on the state block above for why this replaced a single
            shared set of Animated.Values reused across every card. */}
        <DraggableCard
          key={card.id ?? idx}
          ref={cardRef}
          faceCard={card}
          isFlipped={flipped}
          useLandscapeLayout={useLandscapeLayout}
          isRandomSet={set.id === -1}
          cardWidth={CURRENT_CARD_WIDTH}
          onFlip={() => setFlipped((v) => !v)}
          onDismissed={handleCardDismissed}
        />

        {/* Bare icons, no chip/circle behind them -- just enough hitSlop to
            keep them easy to tap. */}
        <HapticTouchable
          style={[s.cardNavArrow, s.cardNavArrowLeft, idx === 0 && s.cardNavArrowDisabled]}
          onPress={goBack}
          disabled={idx === 0}
          haptic="selection"
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          accessibilityLabel="Previous card"
        >
          <Ionicons name="chevron-back" size={22} color={GOLD_L} />
        </HapticTouchable>
        <HapticTouchable
          style={[s.cardNavArrow, s.cardNavArrowRight]}
          onPress={goForward}
          haptic="selection"
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          accessibilityLabel="Next card"
        >
          <Ionicons name="chevron-forward" size={22} color={GOLD_L} />
        </HapticTouchable>

        {/* What this card was marked as the LAST time it was studied (not
            this session -- `card` is an immutable prop, so this only ever
            reflects a prior session, or a direct edit via the swap/clear
            buttons here). Hidden once cleared or if the card has never been
            answered before. */}
        {priorStatus !== null && priorStatus !== undefined ? (
          <View style={s.priorStatusRow} pointerEvents="box-none">
            <View style={[s.priorStatusPill, { backgroundColor: rgbaFromHex(priorStatus ? GREEN : RED, 0.16) }]}>
              <Text style={[s.priorStatusText, { color: priorStatus ? GREEN : RED }]}>
                previously {priorStatus ? 'known' : 'unknown'}
              </Text>
            </View>
            <HapticTouchable
              onPress={() => setPriorStatus(!priorStatus)}
              haptic="selection"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Change previous status"
            >
              <Ionicons name="swap-horizontal-outline" size={16} color={DIM2} />
            </HapticTouchable>
            <HapticTouchable
              onPress={() => setPriorStatus(null)}
              haptic="selection"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Remove previous status"
            >
              <Ionicons name="close-circle" size={16} color={DIM2} />
            </HapticTouchable>
          </View>
        ) : null}
      </View>
    </View>
  );

  const answerTally = (
    <View style={s.answerTally}>
      <View style={s.answerTallyItem}>
        <Text style={[s.answerTallyValue, { color: RED }]}>{stats.incorrect}</Text>
        <Text style={s.answerTallyLabel}>i don't know this</Text>
      </View>
      <View style={s.answerTallySep} />
      <View style={s.answerTallyItem}>
        <Text style={[s.answerTallyValue, { color: GREEN }]}>{stats.correct}</Text>
        <Text style={s.answerTallyLabel}>i know this</Text>
      </View>
    </View>
  );

  const answerActions = (
    <View style={[s.answerRow, useLandscapeLayout && s.answerRowLandscape]}>
      <HapticTouchable style={[s.wrongBtn, useLandscapeLayout && s.answerBtnLandscape]} onPress={() => answer(false)} haptic="warning">
        <NeumorphicTexture grainVariant="dots" grainOpacity={0.22} />
        <Text style={s.wrongLabel}>i don't know this</Text>
      </HapticTouchable>
      <HapticTouchable style={[s.rightBtn, useLandscapeLayout && s.answerBtnLandscape]} onPress={() => answer(true)} haptic="success">
        <NeumorphicTexture grainVariant="dots" grainOpacity={0.22} />
        <Text style={s.rightLabel}>i know this</Text>
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
            {answerTally}
            {answerActions}
          </View>
        </View>
      ) : (
        <>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${((idx + 1) / cards.length) * 100}%` as const }]} />
          </View>
          {/* Card and answer buttons are one visual unit -- centered together in the
              remaining space instead of the card floating centered on its own with the
              buttons pinned separately at the screen edge. */}
          <View style={s.studyCenterGroup}>
            {cardViewport}
            {answerTally}
            {answerActions}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

type McqOption = { id: string; text: string; isCorrect: boolean };
type QuizRecord = { question: string; yourAnswer: string; correctAnswer: string; isCorrect: boolean };

// Wrong options are always this specific question's own AI-written
// distractors (backend/routes/flashcards.py::ensure_flashcard_distractors
// guarantees every card has 3 before quiz mode opens) -- never another
// card's answer, which wouldn't actually confuse someone who knows this one.
// The filler only covers the rare case where generation still came up short.
const MCQ_FILLERS = ['None of the above', 'Not enough information given', 'The opposite of this is true'];

function buildMcqOptions(cards: Flashcard[], index: number): McqOption[] {
  const correctText = cards[index].answer;
  const wrongTexts = (cards[index].wrong_options ?? []).filter((t) => t && t !== correctText).slice(0, 3);
  for (let i = 0; wrongTexts.length < 3; i += 1) {
    const filler = MCQ_FILLERS[i % MCQ_FILLERS.length];
    if (filler !== correctText && !wrongTexts.includes(filler)) wrongTexts.push(filler);
  }
  const options: McqOption[] = [
    { id: 'correct', text: correctText, isCorrect: true },
    ...wrongTexts.map((text, i) => ({ id: `wrong-${i}`, text, isCorrect: false })),
  ];
  return options.sort(() => Math.random() - 0.5);
}

// A 4-choice MCQ variant of StudyView -- same set/onAnswer/onComplete
// contract, so it plugs into the same results screen, but each card is
// answered by picking one of 4 options instead of swiping know/don't-know.
function QuizView({
  set,
  cards,
  onBack,
  onComplete,
  onAnswer,
}: {
  set: FlashcardSet;
  cards: Flashcard[];
  onBack: () => void;
  onComplete: (stats: { correct: number; incorrect: number }, records: QuizRecord[]) => void;
  onAnswer: (cardId: number, correct: boolean) => Promise<void>;
}) {
  const [idx, setIdx] = useState(0);
  const [options, setOptions] = useState<McqOption[]>(() => buildMcqOptions(cards, 0));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0 });
  const recordsRef = useRef<QuizRecord[]>([]);

  const card = cards[idx];

  const answerPendingRef = useRef(false);
  const selectOption = async (option: McqOption) => {
    if (selectedId || answerPendingRef.current) return;
    answerPendingRef.current = true;
    try { if (card?.id) await onAnswer(card.id, option.isCorrect); }
    catch { Alert.alert('Review not saved', 'Please try again. This answer has not been counted.'); return; }
    finally { answerPendingRef.current = false; }
    setSelectedId(option.id);
    triggerHaptic(option.isCorrect ? 'success' : 'warning');
    setStats((current) => ({
      ...current,
      correct: current.correct + (option.isCorrect ? 1 : 0),
      incorrect: current.incorrect + (option.isCorrect ? 0 : 1),
    }));
    recordsRef.current.push({
      question: card.question,
      yourAnswer: option.text,
      correctAnswer: card.answer,
      isCorrect: option.isCorrect,
    });

  };

  const next = () => {
    if (idx + 1 >= cards.length) {
      onComplete(stats, recordsRef.current);
      return;
    }
    const nextIdx = idx + 1;
    setIdx(nextIdx);
    setOptions(buildMcqOptions(cards, nextIdx));
    setSelectedId(null);
  };

  if (!card) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <GeoBackground />
        <View style={s.studyHeader}>
          <HapticTouchable onPress={onBack} haptic="selection">
            <Ionicons name="chevron-back" size={22} color={GOLD_L} />
          </HapticTouchable>
          <Text style={s.studyTitle}>quiz</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={s.empty}>
          <Text style={s.emptyTitle}>no cards in this set</Text>
          <Text style={s.emptyHint}>create a few cards and try again</Text>
        </View>
      </SafeAreaView>
    );
  }

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
      <View style={s.progressBar}>
        <View style={[s.progressFill, { width: `${((idx + 1) / cards.length) * 100}%` as const }]} />
      </View>

      <ScrollView contentContainerStyle={s.quizScroll} showsVerticalScrollIndicator={false}>
        <View style={s.quizQuestionCard}>
          <MathText style={s.quizQuestionText}>{card.question}</MathText>
        </View>

        <View style={{ gap: 10 }}>
          {options.map((option) => {
            const answered = selectedId !== null;
            const isPicked = selectedId === option.id;
            const showAsCorrect = answered && option.isCorrect;
            const showAsWrongPick = answered && isPicked && !option.isCorrect;
            return (
              <HapticTouchable
                key={option.id}
                style={[
                  s.quizOption,
                  showAsCorrect && s.quizOptionCorrect,
                  showAsWrongPick && s.quizOptionWrong,
                ]}
                onPress={() => selectOption(option)}
                disabled={answered}
                haptic="none"
              >
                <MathText style={s.quizOptionText}>{option.text}</MathText>
                {showAsCorrect ? <Ionicons name="checkmark-circle" size={18} color={GREEN} /> : null}
                {showAsWrongPick ? <Ionicons name="close-circle" size={18} color={RED} /> : null}
              </HapticTouchable>
            );
          })}
        </View>
      </ScrollView>

      {selectedId ? (
        <View style={s.quizFooter}>
          <HapticTouchable style={s.actionBtn} onPress={next} haptic="medium">
            <Text style={s.actionBtnText}>{idx + 1 >= cards.length ? 'see results' : 'next question'}</Text>
          </HapticTouchable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function QuizResultsView({
  stats,
  records,
  onBack,
  onRestart,
}: {
  stats: { correct: number; incorrect: number };
  records: QuizRecord[];
  onBack: () => void;
  onRestart: () => void;
}) {
  const total = stats.correct + stats.incorrect;
  const pct = total > 0 ? Math.round((stats.correct / total) * 100) : 0;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <GeoBackground />
      <View style={s.studyHeader}>
        <HapticTouchable onPress={onBack} haptic="selection">
          <Ionicons name="chevron-back" size={22} color={GOLD_L} />
        </HapticTouchable>
        <Text style={s.studyTitle}>quiz report</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={s.quizReportScroll} showsVerticalScrollIndicator={false}>
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
        </View>

        <View style={{ gap: 10 }}>
          {records.map((record, i) => (
            <View key={i} style={[s.quizReportRow, { borderColor: record.isCorrect ? rgbaFromHex(GREEN, 0.35) : rgbaFromHex(RED, 0.35) }]}>
              <View style={s.quizReportRowHead}>
                <Ionicons
                  name={record.isCorrect ? 'checkmark-circle' : 'close-circle'}
                  size={16}
                  color={record.isCorrect ? GREEN : RED}
                />
                <MathText style={s.quizReportQuestion}>{record.question}</MathText>
              </View>
              <View style={s.quizReportAnswerRow}>
                <Text style={s.quizReportAnswerLabel}>your answer</Text>
                <MathText style={[s.quizReportAnswerText, { color: record.isCorrect ? GREEN : RED }]}>{record.yourAnswer}</MathText>
              </View>
              {!record.isCorrect ? (
                <View style={s.quizReportAnswerRow}>
                  <Text style={s.quizReportAnswerLabel}>correct answer</Text>
                  <MathText style={[s.quizReportAnswerText, { color: GREEN }]}>{record.correctAnswer}</MathText>
                </View>
              ) : null}
            </View>
          ))}
        </View>

        <View style={s.quizReportActions}>
          <HapticTouchable style={s.actionBtn} onPress={onRestart} haptic="medium">
            <Text style={s.actionBtnText}>retake quiz</Text>
          </HapticTouchable>
          <HapticTouchable style={[s.actionBtn, s.actionBtnOutline]} onPress={onBack} haptic="selection">
            <Text style={[s.actionBtnText, { color: ACCENT }]}>back to sets</Text>
          </HapticTouchable>
        </View>
      </ScrollView>
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
          <HapticTouchable onPress={() => setSidebarOpen(true)} haptic="selection" accessibilityLabel="Open menu">
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

      <SectionSidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pageTitle="flashcards"
        items={FLASHCARDS_SIDEBAR_ITEMS}
        activeKey="generate"
        onSelect={(key) => { if (key === 'browse') onOpenSpacedRepetition(); else if (key === 'generate') setMode('ai'); else if (key === 'sets') onBack(); }}
      />
    </SafeAreaView>
  );
}

const FLASHCARDS_SIDEBAR_ITEMS: SidebarItem[] = [
  { key: 'browse', label: 'Spaced Repetition' },
  { key: 'generate', label: 'Generate' },
  { key: 'sets', label: 'My Sets' },
];

function FlashcardsSets({
  user,
  onBack,
  refreshTick,
  onOpenCreate,
  onOpenStudy,
  onOpenQuiz,
  onOpenSpacedRepetition,
}: Props & {
  refreshTick: number;
  onOpenCreate: (mode?: CreateMode) => void;
  onOpenStudy: (set: FlashcardSet, cards: Flashcard[]) => void;
  onOpenQuiz: (set: FlashcardSet, cards: Flashcard[]) => void;
  onOpenSpacedRepetition: () => void;
}) {
  const [sets, setSets] = useState<FlashcardSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCards, setLoadingCards] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [favoriteSetIds, setFavoriteSetIds] = useState<number[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const layout = useResponsiveLayout();

  useEffect(() => {
    setLoading(true);
    getFlashcardHistory(user.username)
      .then((data) => {
        setSets(data?.flashcard_history ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user.username, refreshTick]);

  useEffect(() => {
    AsyncStorage.getItem(`mobile.flashcards.favorites.${user.username}`)
      .then((raw) => setFavoriteSetIds(raw ? JSON.parse(raw) : []))
      .catch(() => setFavoriteSetIds([]));
  }, [user.username]);

  const toggleFavoriteSet = (id: number) => {
    setFavoriteSetIds((current) => {
      const next = current.includes(id) ? current.filter((setId) => setId !== id) : [...current, id];
      AsyncStorage.setItem(`mobile.flashcards.favorites.${user.username}`, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const refreshCollection = async () => {
    setRefreshing(true);
    try {
      const history = await getFlashcardHistory(user.username);
      setSets(history?.flashcard_history ?? []);
    } finally {
      setRefreshing(false);
    }
  };

  // Cards come back from the server already ordered by spaced-repetition
  // priority (backend/routes/flashcards.py::_study_priority_key) -- cards you
  // got wrong last time are due again sooner, so they surface first here.
  // Client-side shuffling used to undo that ordering for Practice; dropped
  // so wrong answers actually come up front next time, as intended.
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

  const startQuiz = async (set: FlashcardSet) => {
    setLoadingCards(true);
    try {
      const data = await getFlashcardsInSet(set.id);
      let cards = (data?.flashcards ?? []) as Flashcard[];
      if (cards.some((c) => (c.wrong_options?.length ?? 0) < 3)) {
        const withDistractors = await ensureFlashcardDistractors({ userId: user.username, setId: set.id });
        cards = withDistractors.flashcards as Flashcard[];
      }
      onOpenQuiz(set, cards);
    } catch {
      Alert.alert('Unable to open set', 'The quiz could not be prepared.');
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
  const cardGap = 12;
  const gridInnerWidth = Math.min(layout.width, layout.contentMaxWidth) - 20;
  const cardWidth = (gridInnerWidth - cardGap * (columns - 1)) / columns;
  const coverColors = ['#df6b6b', '#69beb8', '#68aac7', '#e99b76', '#8dbfab', '#dcc86d'];
  const query = search.trim().toLowerCase();
  const filteredSets = sets
    .filter((item) => (query ? cleanTitle(item.title).toLowerCase().includes(query) : true))
    .filter((item) => (showFavoritesOnly ? favoriteSetIds.includes(item.id) : true));

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
        <HapticTouchable onPress={() => setSidebarOpen(true)} haptic="selection" accessibilityLabel="Open menu">
          <Ionicons name="menu-outline" size={24} color={GOLD_L} />
        </HapticTouchable>
      </View>

      {loading ? (
        <View style={{ marginTop: 60, alignItems: 'center' }}>
          <PulseCubes color={ACCENT} size={12} />
        </View>
      ) : (
        <View style={s.workspace}>
          <HapticTouchable style={s.generateHero} onPress={() => onOpenCreate('ai')} haptic="medium" activeOpacity={0.88}>
            <Ionicons name="add" size={16} color={BASE_ACTION_TEXT} />
            <Text style={s.generateHeroText}>Generate</Text>
          </HapticTouchable>

          <View style={s.searchRow}>
            <View style={s.searchBar}>
              <Ionicons name="search-outline" size={15} color={GOLD_D} />
              <TextInput
                style={s.searchInput}
                placeholder="search sets..."
                placeholderTextColor={DIM2}
                value={search}
                onChangeText={setSearch}
              />
              {!!search && (
                <HapticTouchable onPress={() => setSearch('')} haptic="selection">
                  <Ionicons name="close-circle" size={16} color={GOLD_D} />
                </HapticTouchable>
              )}
            </View>
            <HapticTouchable
              style={[s.searchIconBtn, showFavoritesOnly && s.searchIconBtnActive]}
              onPress={() => setShowFavoritesOnly((value) => !value)}
              haptic="selection"
              accessibilityLabel={showFavoritesOnly ? 'Show all sets' : 'Show favorites only'}
            >
              <Ionicons name={showFavoritesOnly ? 'star' : 'star-outline'} size={18} color={showFavoritesOnly ? BG : GOLD_L} />
            </HapticTouchable>
          </View>

          <View style={s.collectionHeader}>
            <Text style={s.collectionCount}>{filteredSets.length} {filteredSets.length === 1 ? 'set' : 'sets'}</Text>
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

          {filteredSets.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="albums-outline" size={32} color={GOLD_D} />
              <Text style={s.emptyTitle}>{search ? 'no matching sets' : 'no sets yet'}</Text>
              <Text style={s.emptyHint}>{search ? 'try a different search' : 'tap generate to create your first set'}</Text>
            </View>
          ) : viewMode === 'grid' ? (
            <ScrollView
              style={s.collectionScroll}
              contentContainerStyle={[s.collectionGrid, { gap: cardGap }]}
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
              {filteredSets.map((item, index) => (
                <View
                  key={item.id}
                  style={[s.collectionCard, { width: cardWidth }]}
                >
                  <View style={[s.collectionCover, { backgroundColor: coverColors[index % coverColors.length] }]}>
                    <HapticTouchable
                      style={s.collectionFavoriteBtn}
                      onPress={() => toggleFavoriteSet(item.id)}
                      haptic="selection"
                      accessibilityLabel={favoriteSetIds.includes(item.id) ? `Unfavorite ${cleanTitle(item.title)}` : `Favorite ${cleanTitle(item.title)}`}
                    >
                      <Ionicons name={favoriteSetIds.includes(item.id) ? 'star' : 'star-outline'} size={13} color={favoriteSetIds.includes(item.id) ? ACCENT : '#171411'} />
                    </HapticTouchable>
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
                        onPress={() => startStudy(item)}
                        haptic="selection"
                        accessibilityLabel={`Practice ${cleanTitle(item.title)}`}
                      >
                        <Ionicons name="flash-outline" size={15} color={GOLD_L} />
                      </HapticTouchable>
                      <HapticTouchable
                        style={[s.cardActionBtn, s.cardActionBtnPrimary, { flex: 1 }]}
                        onPress={() => startQuiz(item)}
                        haptic="medium"
                        accessibilityLabel={`Quiz ${cleanTitle(item.title)}`}
                      >
                        <Ionicons name="help-circle-outline" size={15} color={BASE_ACTION_TEXT} />
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
              {filteredSets.map((item, index) => (
                <View key={item.id} style={s.listRow}>
                  <View style={[s.listSwatch, { backgroundColor: coverColors[index % coverColors.length] }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.listTitle} numberOfLines={1}>{cleanTitle(item.title)}</Text>
                    <Text style={s.listMeta}>{item.card_count} cards · {Math.round(item.accuracy_percentage)}% mastery</Text>
                  </View>
                  <HapticTouchable
                    style={[s.cardActionBtn, { width: 34 }]}
                    onPress={() => startStudy(item)}
                    haptic="selection"
                    accessibilityLabel={`Practice ${cleanTitle(item.title)}`}
                  >
                    <Ionicons name="flash-outline" size={15} color={GOLD_L} />
                  </HapticTouchable>
                  <HapticTouchable
                    style={[s.cardActionBtn, s.cardActionBtnPrimary, { width: 34 }]}
                    onPress={() => startQuiz(item)}
                    haptic="medium"
                    accessibilityLabel={`Quiz ${cleanTitle(item.title)}`}
                  >
                    <Ionicons name="help-circle-outline" size={15} color={BASE_ACTION_TEXT} />
                  </HapticTouchable>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {loadingCards && (
        <View style={s.loadingOverlay}>
          <PulseCubes color={ACCENT} size={14} />
          <Text style={[s.emptyHint, { marginTop: 14 }]}>loading cards…</Text>
        </View>
      )}

      <SectionSidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pageTitle="flashcards"
        items={FLASHCARDS_SIDEBAR_ITEMS}
        activeKey="sets"
        onSelect={(key) => { if (key === 'browse') onOpenSpacedRepetition(); else if (key === 'generate') onOpenCreate('ai'); }}
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
            onOpenQuiz={(set, cards) => navigation.navigate('FlashcardsQuiz', { set, cards })}
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
            userId={user.username}
            onBack={() => navigation.goBack()}
            onAnswer={(cardId, correct) => srReviewFlashcard(user.username, cardId, correct ? 'good' : 'again').then(() => {})}
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
      <FlashcardsStack.Screen name="FlashcardsQuiz">
        {({ route, navigation }) => (
          <QuizView
            set={route.params.set}
            cards={route.params.cards}
            onBack={() => navigation.goBack()}
            onAnswer={(cardId, correct) => srReviewFlashcard(user.username, cardId, correct ? 'good' : 'again').then(() => {})}
            onComplete={(stats, records) => navigation.reset({
              index: 1,
              routes: [
                { name: 'FlashcardsSets' },
                { name: 'FlashcardsQuizResults', params: { set: route.params.set, cards: route.params.cards, stats, records } },
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
      <FlashcardsStack.Screen name="FlashcardsQuizResults">
        {({ route, navigation }) => (
          <QuizResultsView
            stats={route.params.stats}
            records={route.params.records}
            onBack={() => navigation.goBack()}
            onRestart={() => navigation.replace('FlashcardsQuiz', { set: route.params.set, cards: route.params.cards })}
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
  // Side gutter matches the standard paddingHorizontal used by every other
  // page on this screen (header/workspace) instead of the old wider inset.
  const studyBodyWidth = Math.min(layout.contentMaxWidth, layout.width - 20);
  const studySidebarWidth = useLandscapeStudyLayout ? Math.min(Math.max(studyBodyWidth * 0.25, 180), 240) : 0;
  const studyCardWidth = useLandscapeStudyLayout ? studyBodyWidth - studySidebarWidth - 16 : studyBodyWidth - 20;
  const cardWidth = Math.max(280, Math.min(studyCardWidth, useLandscapeStudyLayout ? layout.width * 0.75 : layout.width - 20));
  // Tied to cardWidth (not an independent fixed range) so the card reads as
  // square-ish instead of a tall rectangle, while still clamping to whatever
  // vertical room the header/progress bar/answer row leave available.
  const cardHeight = useLandscapeStudyLayout
    ? Math.max(240, Math.min(layout.height - 132, Math.round(cardWidth * 0.9)))
    : Math.max(280, Math.min(layout.height - 300, Math.round(cardWidth * 1.05)));
  CURRENT_CARD_WIDTH = cardWidth;
  CURRENT_CARD_HEIGHT = cardHeight;
  // A plain negative marginTop on a centered flex:1 box only moves the box's
  // edge -- the content inside still re-centers within the taller box, so it
  // only actually visibly shifts by half the margin. A transform moves the
  // rendered content itself by the full amount, which is what "move it up by
  // 15%" needs.
  const studyLiftOffset = Math.round(layout.height * 0.09);
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 18,
    paddingBottom: 12,
  },
  title: { fontFamily: 'Inter_900Black', fontSize: 32, color: GOLD_L, letterSpacing: -0.8 },

  workspace: {
    flex: 1,
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: 10,
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
  // Same search bar as the notes page, for a consistent look between the two.
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  searchBar: {
    flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: rgbaFromHex(SURFACE, 0.96), borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: GOLD_L },
  searchIconBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: rgbaFromHex(SURFACE_2, 0.92), borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  searchIconBtnActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  collectionHeader: { minHeight: 34, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  collectionCount: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: DIM2, letterSpacing: 0.3 },
  viewToggle: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  viewToggleBtn: { width: 34, height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(SURFACE, 0.9) },
  viewToggleBtnActive: { backgroundColor: ACCENT },
  collectionScroll: { flex: 1 },
  collectionGrid: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', paddingBottom: 18 },
  // Width comes from the inline percentage below; height is intrinsic to
  // content (no aspectRatio) -- a forced square couldn't fit a 3-line title
  // plus the count/mastery/action rows below it without the title spilling
  // past the card's own bounds, so the card grows to whatever it needs.
  collectionCard: { borderRadius: 17, backgroundColor: rgbaFromHex(SURFACE, 0.95), overflow: 'hidden', boxShadow: cbTileShadow(0.06), ...cbTileBorder(0.14) },
  collectionCover: { minHeight: 104, paddingHorizontal: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  collectionFavoriteBtn: {
    position: 'absolute', top: 8, right: 8,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  collectionCardTitle: { fontFamily: 'Inter_900Black', fontSize: 14, lineHeight: 17, color: '#171411', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },
  collectionCardCount: { fontFamily: 'Inter_700Bold', fontSize: 9, color: rgbaFromHex('#171411', 0.66), letterSpacing: 1.2, marginTop: 7 },
  collectionCardMeta: { padding: 14, gap: 10 },
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
  modeGrid: { flexDirection: 'row', gap: 14 },
  modeCard: {
    flex: 1, minHeight: 118, borderRadius: 16, padding: 20, overflow: 'hidden',
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
    paddingHorizontal: 10,
    paddingTop: 16,
    paddingBottom: 12,
  },
  studyTitle: { fontFamily: 'Inter_900Black', fontSize: 15, color: GOLD_L, flex: 1, textAlign: 'center', marginHorizontal: 12 },
  studyCounter: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },

  progressBar: {
    width: '100%',
    maxWidth: Math.min(layout.contentMaxWidth - 20, 780),
    alignSelf: 'center',
    height: 4,
    backgroundColor: rgbaFromHex(ACCENT, 0.12),
    marginHorizontal: 10,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 999 },

  quizScroll: {
    width: '100%',
    maxWidth: Math.min(layout.contentMaxWidth, 820),
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    gap: 18,
  },
  quizQuestionCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE_RAISED,
    padding: 20,
    minHeight: 120,
    justifyContent: 'center',
  },
  quizQuestionText: { fontFamily: 'Inter_700Bold', fontSize: 18, lineHeight: 25, color: GOLD_D },
  quizOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  quizOptionCorrect: { borderColor: GREEN, backgroundColor: rgbaFromHex(GREEN, 0.12) },
  quizOptionWrong: { borderColor: RED, backgroundColor: rgbaFromHex(RED, 0.12) },
  quizOptionText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 20, color: GOLD_D },
  quizFooter: { paddingHorizontal: 20, paddingBottom: 24, paddingTop: 4 },

  quizReportScroll: {
    width: '100%',
    maxWidth: Math.min(layout.contentMaxWidth, 820),
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
    gap: 18,
  },
  quizReportRow: {
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: SURFACE,
    padding: 14,
    gap: 8,
  },
  quizReportRowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  quizReportQuestion: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 13.5, lineHeight: 19, color: GOLD_D },
  quizReportAnswerRow: { paddingLeft: 24 },
  quizReportAnswerLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.8, color: DIM2, textTransform: 'uppercase' },
  quizReportAnswerText: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  quizReportActions: { gap: 10 },

  studyLandscapeBody: {
    flex: 1,
    width: '100%',
    maxWidth: studyBodyWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 20,
    transform: [{ translateY: -studyLiftOffset }],
  } as ViewStyle,
  studyCardColumn: {
    width: cardWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studySidebar: {
    width: studySidebarWidth,
    justifyContent: 'center',
    gap: 10,
  },
  // The card and the answer buttons are centered together as one block, then
  // lifted up by studyLiftOffset (see above) on top of that.
  studyCenterGroup: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 18,
    transform: [{ translateY: -studyLiftOffset }],
  } as ViewStyle,
  cardWrap: {
    width: '100%',
    maxWidth: Math.min(layout.contentMaxWidth, 820),
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardWrapLandscape: {
    width: cardWidth,
    maxWidth: cardWidth,
  },
  // Bare icon inside the card's padded area -- no chip, no circle, no fill
  // behind it at all. Sits a bit below the very top edge (not flush with the
  // corner) so it reads as part of the card's content, not glued to the rim.
  cardNavArrow: {
    position: 'absolute',
    top: 38,
    zIndex: 5,
  },
  cardNavArrowLeft: { left: 16 },
  cardNavArrowRight: { right: 16 },
  cardNavArrowDisabled: { opacity: 0.25 },
  priorStatusRow: {
    position: 'absolute',
    top: 38,
    left: 52,
    right: 52,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  priorStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  priorStatusText: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.6 },
  cardStage: { width: cardWidth, height: cardHeight },
  cardAnimatedWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: cardWidth,
    height: cardHeight,
  },
  // The next card's spot underneath the draggable top card -- same
  // width/height, centered exactly behind it (no vertical offset -- that
  // read as two separate stacked cards rather than one card sitting
  // directly behind another). Depth comes only from the front card's own
  // 0.98 scale, which lets a slim, even margin of this one show all around
  // it. Always fully visible (see cardGlassOverlay for the actual blur).
  cardStackBehind: {},
  // Sits on top of the peeked next card's already-rendered face, blurring
  // its text/content into illegibility while its actual background/shape
  // still shows through underneath -- "there's a card there" stays visible,
  // "what it says" doesn't, until it becomes the front card.
  cardGlassOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    overflow: 'hidden',
  },
  // Both faces share the same accent/primary pair (see cardGradientColors above),
  // just swapped in dominance, so the card stays cohesive while still reading as
  // a different color between question and answer.
  // Shadow + border live on this outer, unclipped box; the gradient/grain live on
  // the separate absolutely-filled `cardClip` layer below. A single view can't
  // both cast a soft boxShadow AND clip its own content with overflow:hidden --
  // the shadow's blur gets cut off at the clip edge and renders as a hard-edged
  // dark rectangle instead (the exact "black sharp square" this was producing).
  // Both the modern boxShadow array and the legacy shadow*/elevation properties
  // are set (same belt-and-suspenders this app's other neumorphic shadows use)
  // so the rounded shadow doesn't depend on boxShadow alone rendering correctly.
  card: {
    width: cardWidth,
    height: cardHeight,
    borderRadius: 24,
    padding: 26,
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 10, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 10,
    boxShadow: cbPlainCardShadow(),
    ...cbTileBorder(0.28),
  },
  cardClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    overflow: 'hidden',
  },
  cardBody: { flex: 1, marginTop: 18, marginBottom: 18 },
  cardBodyContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  cardBodyContentLandscape: {
    justifyContent: 'flex-start',
    paddingBottom: 18,
  },
  cardText: { fontFamily: 'Inter_900Black', fontSize: 23, color: CB_ACCENT, lineHeight: 31, textAlign: 'center' },
  // Question face leads with the bright accent stop, so dark ink reads far
  // better there than the gold used on the darker answer face.
  cardTextQuestion: { color: '#0a0a0b' },
  randomCardSource: { fontFamily: 'Inter_700Bold', fontSize: 9, color: rgbaFromHex(CB_ACCENT, 0.55), letterSpacing: 1, marginBottom: 10, textAlign: 'center' },

  answerTally: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  answerTallyItem: { alignItems: 'center', gap: 2 },
  answerTallySep: { width: 1, height: 22, backgroundColor: BORDER },
  answerTallyValue: { fontFamily: 'Inter_900Black', fontSize: 18 },
  answerTallyLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: DIM2, letterSpacing: 0.6, textTransform: 'uppercase' },

  answerRow: {
    width: '100%',
    maxWidth: Math.min(layout.contentMaxWidth, 820),
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 10,
  },
  answerRowLandscape: {
    maxWidth: studySidebarWidth,
    alignSelf: 'stretch',
    flexDirection: 'column',
    gap: 8,
    paddingHorizontal: 0,
  },
  wrongBtn: {
    flex: 1,
    backgroundColor: softDanger,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: softDangerBorder,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    overflow: 'hidden',
  },
  answerBtnLandscape: {
    flex: 0,
    minHeight: 64,
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
    paddingVertical: 17,
    overflow: 'hidden',
  },
  wrongLabel: { fontFamily: 'Inter_700Bold', fontSize: 13, color: RED, letterSpacing: 0.4 },
  rightLabel: { fontFamily: 'Inter_700Bold', fontSize: 13, color: GREEN, letterSpacing: 0.4 },

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
