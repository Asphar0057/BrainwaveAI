import { useMemo, useState } from 'react';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
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
import NeumorphicTexture, { cbTileCardGradient } from '../../components/NeumorphicTexture';
import SectionSidebar, { SidebarItem } from '../../components/SectionSidebar';
import SoloQuizScreen from './SoloQuizScreen';
import GamesScreen from './GamesScreen';
import { useAppTheme } from '../../contexts/ThemeContext';
import { rgbaFromHex } from '../../utils/theme';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

type Props = { user: AuthUser; onBack: () => void };

const QuizStack = createNativeStackNavigator();

const QUIZ_SIDEBAR_ITEMS: SidebarItem[] = [
  { key: 'home', label: 'Choose a mode', icon: 'compass', iconOutline: 'compass-outline' },
  { key: 'solo', label: 'Solo Practice', icon: 'sparkles', iconOutline: 'sparkles-outline' },
  { key: 'battles', label: '1v1 Battles', icon: 'flash', iconOutline: 'flash-outline' },
];

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
        <HapticTouchable onPress={() => setSidebarOpen(true)} haptic="selection" accessibilityLabel="Open menu">
          <Ionicons name="menu-outline" size={24} color={GOLD_L} />
        </HapticTouchable>
      </View>

      <View style={hs.body}>
        <ModeCard index="01" label="solo" onPress={onOpenSolo} />
        <ModeCard index="02" label="battles" onPress={onOpenBattles} />
      </View>

      <SectionSidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pageTitle="quiz hub"
        items={QUIZ_SIDEBAR_ITEMS}
        activeKey="home"
        onSelect={(key) => { if (key === 'solo') onOpenSolo(); else if (key === 'battles') onOpenBattles(); }}
      />
    </SafeAreaView>
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
          <SoloQuizScreen user={user} onBack={() => navigation.goBack()} />
        )}
      </QuizStack.Screen>
      <QuizStack.Screen name="QuizBattles">
        {({ navigation }) => (
          <GamesScreen user={user} onBack={() => navigation.goBack()} />
        )}
      </QuizStack.Screen>
    </QuizStack.Navigator>
  );
}

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
