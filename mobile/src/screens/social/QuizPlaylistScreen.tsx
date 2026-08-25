import { useMemo, useRef, useState } from 'react';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { View, Text, StyleSheet, Animated, Modal, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../../services/auth';
import HapticTouchable from '../../components/HapticTouchable';
import TileGleam from '../../components/TileGleam';
import GeoBackground from '../../components/GeoBackground';
import AmbientBubbles from '../../components/AmbientBubbles';
import NeumorphicTexture, { NeumorphicLayer, cbTileCardGradient } from '../../components/NeumorphicTexture';
import SoloQuizScreen from './SoloQuizScreen';
import GamesScreen from './GamesScreen';
import { useAppTheme } from '../../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../../utils/theme';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

type Props = { user: AuthUser; onBack: () => void };
type SectionKey = 'home' | 'solo' | 'battles';

const QuizStack = createNativeStackNavigator();

// ─── Hamburger sidebar — same slide-in-panel construction as
// FlashcardsScreen's FlashcardsMenuSidebar (gradient panel, hero block,
// active row highlighted gold with a trailing dot, inactive rows as plain
// chevron rows) so quiz hub reads as the same app pattern. ─────────────────
function QuizMenuSidebar({
  visible, sidebarWidth, slideAnim, onClose, activeKey, onHome, onSolo, onBattles,
}: {
  visible: boolean;
  sidebarWidth: number;
  slideAnim: Animated.Value;
  onClose: () => void;
  activeKey: SectionKey;
  onHome: () => void;
  onSolo: () => void;
  onBattles: () => void;
}) {
  const { selectedTheme } = useAppTheme();
  const GOLD_L = selectedTheme.accentHover;
  const DIM2 = selectedTheme.textSecondary;
  const INK = selectedTheme.isLight ? darkenColor(selectedTheme.accent, 34) : selectedTheme.bgPrimary;

  if (!visible) return null;

  const items: { key: SectionKey; label: string; icon: string; iconOutline: string; onPress: () => void }[] = [
    { key: 'home', label: 'Choose a mode', icon: 'compass', iconOutline: 'compass-outline', onPress: onHome },
    { key: 'solo', label: 'Solo Practice', icon: 'sparkles', iconOutline: 'sparkles-outline', onPress: onSolo },
    { key: 'battles', label: '1v1 Battles', icon: 'flash', iconOutline: 'flash-outline', onPress: onBattles },
  ];

  return (
    <Modal transparent animationType="none" onRequestClose={onClose}>
      <View style={ms.overlay}>
        <HapticTouchable style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} haptic="none" />
        <Animated.View style={[ms.panel, { width: sidebarWidth, transform: [{ translateX: slideAnim }] }]}>
          <LinearGradient
            colors={[darkenColor(selectedTheme.bgTop, selectedTheme.isLight ? 4 : 0), selectedTheme.panelAlt, selectedTheme.bgPrimary]}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView style={{ flex: 1, paddingBottom: 6 }} edges={['top', 'bottom']}>
            <View style={ms.hero}>
              <NeumorphicLayer grainOpacity={0.22} />
              <Text style={ms.heroTitle}>quiz hub</Text>
            </View>

            <View style={ms.menu}>
              {items.map((item) => {
                const active = item.key === activeKey;
                return active ? (
                  <View key={item.key} style={[ms.card, ms.cardActive]}>
                    <View style={ms.row}>
                      <View style={[ms.iconWrap, ms.iconWrapActive]}>
                        <Ionicons name={item.icon as any} size={16} color={INK} />
                      </View>
                      <Text style={[ms.label, ms.labelActive]}>{item.label}</Text>
                      <View style={ms.activeDot} />
                    </View>
                  </View>
                ) : (
                  <HapticTouchable key={item.key} style={ms.card} onPress={() => { onClose(); item.onPress(); }} haptic="selection" activeOpacity={0.85}>
                    <View style={ms.row}>
                      <View style={ms.iconWrap}>
                        <Ionicons name={item.iconOutline as any} size={16} color={GOLD_L} />
                      </View>
                      <Text style={ms.label}>{item.label}</Text>
                      <Ionicons name="chevron-forward" size={15} color={DIM2} />
                    </View>
                  </HapticTouchable>
                );
              })}
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Mode card — full-width, half-screen-height tile. Index + chevron up
// top (same as the Explore page's bento tiles), a large faint icon behind
// for weight, and the title set as a rotated spine label masked by a
// gold-to-transparent gradient -- the exact same MaskedView + rotate
// construction as the Explore page's "notes" tile (see MoreScreen.tsx's
// BentoMini verticalTitle), just scaled up since this card carries the
// whole screen instead of sharing a grid with a dozen others. ─────────────
function ModeCard({ index, label, onPress }: { index: string; label: string; onPress: () => void }) {
  const { selectedTheme } = useAppTheme();
  return (
    <TileGleam style={cs.card} onPress={onPress} haptic="medium" borderRadius={28}>
      <NeumorphicTexture
        grainVariant="skia"
        grainOpacity={0.44}
        baseFrequency={0.7}
        gradientColors={cbTileCardGradient.colors}
        gradientStart={cbTileCardGradient.start}
        gradientEnd={cbTileCardGradient.end}
      />

      <View style={cs.topRow}>
        <Text style={cs.index}>{index}</Text>
        <Ionicons name="chevron-forward" size={20} color={selectedTheme.accentHover} />
      </View>

      {/* Single flex:1 wrapper, centered -- the label sits in the true
          vertical middle of whatever space is left under the top row,
          not weighted toward either edge. */}
      <View style={cs.centerFill}>
        <View style={cs.spineWrap}>
          {/* adjustsFontSizeToFit shrinks per-label (e.g. "battles" vs "solo")
              so the word always fits the fixed-size box instead of clipping. */}
          <MaskedView
            style={[cs.spineGradientBox, cs.spineGradientRotate]}
            maskElement={
              <View style={cs.spineGradientBox}>
                <Text
                  style={cs.spineText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.3}
                >
                  {label}
                </Text>
              </View>
            }
          >
            <LinearGradient
              colors={[selectedTheme.accentHover, rgbaFromHex(selectedTheme.accentHover, 0)]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFillObject}
            />
          </MaskedView>
        </View>
      </View>
    </TileGleam>
  );
}

function useQuizSidebar() {
  const layout = useResponsiveLayout();
  const sidebarWidth = Math.min(layout.width * (layout.isLandscape ? 0.42 : 0.8), 340);
  const slideAnim = useRef(new Animated.Value(-sidebarWidth)).current;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openSidebar = () => {
    setSidebarOpen(true);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 100, friction: 14 }).start();
  };
  const closeSidebar = () => {
    Animated.timing(slideAnim, { toValue: -sidebarWidth, duration: 200, useNativeDriver: true }).start(() => setSidebarOpen(false));
  };

  return { sidebarWidth, slideAnim, sidebarOpen, openSidebar, closeSidebar };
}

// ─── Landing — mode-select hub, mirrors the web app's QuizHub.js: choose
// Solo Practice or 1v1 Battles. Two cards, nothing else. ───────────────────
function QuizHome({
  onBack, onOpenSolo, onOpenBattles,
}: {
  onBack: () => void;
  onOpenSolo: () => void;
  onOpenBattles: () => void;
}) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const hs = useMemo(() => createHomeStyles(layout), [layout]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const { sidebarWidth, slideAnim, sidebarOpen, openSidebar, closeSidebar } = useQuizSidebar();
  const GOLD_L = selectedTheme.accentHover;

  if (!fontsLoaded) return null;

  return (
    <SafeAreaView style={hs.safe} edges={['top']}>
      <GeoBackground />
      <AmbientBubbles theme={selectedTheme} variant="quiz" opacity={0.84} />

      <View style={hs.header}>
        <HapticTouchable onPress={onBack} style={{ marginRight: 12 }} haptic="selection">
          <Ionicons name="chevron-back" size={22} color={GOLD_L} />
        </HapticTouchable>
        <View style={{ flex: 1 }}>
          <Text style={hs.title}>quiz hub</Text>
        </View>
        <HapticTouchable onPress={openSidebar} haptic="selection" accessibilityLabel="Open menu">
          <Ionicons name="menu-outline" size={24} color={GOLD_L} />
        </HapticTouchable>
      </View>

      <View style={hs.body}>
        <ModeCard index="01" label="solo" onPress={onOpenSolo} />
        <ModeCard index="02" label="battles" onPress={onOpenBattles} />
      </View>

      <QuizMenuSidebar
        visible={sidebarOpen}
        sidebarWidth={sidebarWidth}
        slideAnim={slideAnim}
        onClose={closeSidebar}
        activeKey="home"
        onHome={() => {}}
        onSolo={onOpenSolo}
        onBattles={onOpenBattles}
      />
    </SafeAreaView>
  );
}

// ─── Solo / Battles wrappers — each embeds the existing screen as-is (same
// as before) but now also owns a hamburger sidebar, same construction as
// QuizHome's, so every screen in the hub can jump straight to any other
// section instead of just back-to-home. ────────────────────────────────────
function QuizSoloWrapped({
  user, onBack, onHome, onBattles,
}: {
  user: AuthUser;
  onBack: () => void;
  onHome: () => void;
  onBattles: () => void;
}) {
  const { sidebarWidth, slideAnim, sidebarOpen, openSidebar, closeSidebar } = useQuizSidebar();
  return (
    <>
      <SoloQuizScreen user={user} onBack={onBack} onOpenMenu={openSidebar} />
      <QuizMenuSidebar
        visible={sidebarOpen}
        sidebarWidth={sidebarWidth}
        slideAnim={slideAnim}
        onClose={closeSidebar}
        activeKey="solo"
        onHome={onHome}
        onSolo={() => {}}
        onBattles={onBattles}
      />
    </>
  );
}

function QuizBattlesWrapped({
  user, onBack, onHome, onSolo,
}: {
  user: AuthUser;
  onBack: () => void;
  onHome: () => void;
  onSolo: () => void;
}) {
  const { sidebarWidth, slideAnim, sidebarOpen, openSidebar, closeSidebar } = useQuizSidebar();
  return (
    <>
      <GamesScreen user={user} onBack={onBack} onOpenMenu={openSidebar} />
      <QuizMenuSidebar
        visible={sidebarOpen}
        sidebarWidth={sidebarWidth}
        slideAnim={slideAnim}
        onClose={closeSidebar}
        activeKey="battles"
        onHome={onHome}
        onSolo={onSolo}
        onBattles={() => {}}
      />
    </>
  );
}

export default function QuizPlaylistScreen({ user, onBack }: Props) {
  return (
    <QuizStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        gestureDirection: 'horizontal',
      }}
    >
      <QuizStack.Screen name="QuizHome">
        {({ navigation }) => (
          <QuizHome
            onBack={onBack}
            onOpenSolo={() => navigation.navigate('QuizSolo')}
            onOpenBattles={() => navigation.navigate('QuizBattles')}
          />
        )}
      </QuizStack.Screen>
      <QuizStack.Screen name="QuizSolo">
        {({ navigation }) => (
          <QuizSoloWrapped
            user={user}
            onBack={() => navigation.goBack()}
            onHome={() => navigation.navigate('QuizHome')}
            onBattles={() => navigation.navigate('QuizBattles')}
          />
        )}
      </QuizStack.Screen>
      <QuizStack.Screen name="QuizBattles">
        {({ navigation }) => (
          <QuizBattlesWrapped
            user={user}
            onBack={() => navigation.goBack()}
            onHome={() => navigation.navigate('QuizHome')}
            onSolo={() => navigation.navigate('QuizSolo')}
          />
        )}
      </QuizStack.Screen>
    </QuizStack.Navigator>
  );
}

const ms = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.5)' },
  panel: { height: '100%', overflow: 'hidden' },
  hero: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, overflow: 'hidden' },
  heroTitle: { fontFamily: 'Inter_900Black', fontSize: 26, color: '#D8B38D', letterSpacing: -0.6 },
  menu: { paddingHorizontal: 14, gap: 8 },
  card: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13 },
  cardActive: { backgroundColor: 'rgba(216,179,141,0.14)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,179,141,0.1)' },
  iconWrapActive: { backgroundColor: '#D8B38D' },
  label: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 13.5, color: 'rgba(216,179,141,0.7)' },
  labelActive: { color: '#D8B38D', fontFamily: 'Inter_700Bold' },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D8B38D' },
});

// Pre-rotation spine box is wide+short (label reads left-to-right at its
// natural size); the wrapper reserves the post-rotation footprint
// (narrow+tall) so a transform:rotate -- which doesn't resize the layout
// box it's applied to -- doesn't spill content outside the reserved area.
// Kept short enough (220) to fit inside a half-screen-height card without
// the bottom of the rotated word getting clipped by the card's own edge.
const SPINE_W = 220;
const SPINE_H = 78;

const cs = StyleSheet.create({
  card: { flex: 1, padding: 26, borderRadius: 28, overflow: 'hidden' } as ViewStyle,
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'flex-start' },
  index: { fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 1.5, color: '#D8B38D' },
  spineWrap: { width: SPINE_H, height: SPINE_W, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  spineGradientBox: { width: SPINE_W, height: SPINE_H },
  spineGradientRotate: { transform: [{ rotate: '-90deg' }] },
  spineText: {
    width: SPINE_W, height: SPINE_H, fontFamily: 'Inter_900Black', fontSize: 54, letterSpacing: -1.2,
    textAlign: 'center', color: '#000000',
  } as ViewStyle,
});

function createHomeStyles(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: 'transparent' },
    header: {
      width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center',
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 10, paddingTop: 18, paddingBottom: 12,
    },
    title: { fontFamily: 'Inter_900Black', fontSize: 32, color: '#D8B38D', letterSpacing: -0.8 },
    body: {
      flex: 1, gap: 14, width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center',
      paddingHorizontal: 10, paddingBottom: 16,
    },
  });
}
