import { useState, useEffect, useMemo } from 'react';
import CalendarScreen from './CalendarScreen';
import ActivityTimelineScreen from './ActivityTimelineScreen';
import { View, Text, StyleSheet, ScrollView, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import { getFlashcardStatistics } from '../services/api';
import TileGleam from '../components/TileGleam';
import GeoBackground from '../components/GeoBackground';
import NeumorphicTexture, { cbTileCardGradient } from '../components/NeumorphicTexture';
import { useAppTheme } from '../contexts/ThemeContext';
import { rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type ExploreTarget = 'flashcards' | 'notes' | 'aimedia' | 'questionBank' | 'knowledgeMaps' | 'knowledgeHub' | 'slideExplorer' | 'canvasHub' | 'analytics' | 'weaknessPractice' | 'topicsHub' | 'learningPaths';
type Props = { user: AuthUser; onNavigate?: (screen: ExploreTarget) => void; onNavigateToAI?: () => void };

function BentoMini({
  index,
  title,
  styles,
  onPress,
  tall = false,
}: {
  index: string;
  title: string;
  styles: ReturnType<typeof createStyles>;
  onPress?: () => void;
  /** Fills the full hero-row height as one rectangle instead of a square in a stack. */
  tall?: boolean;
}) {
  return (
    <TileGleam
      style={[styles.miniTile, tall && styles.miniTileTall]}
      onPress={onPress}
      accessibilityLabel={`${title} feature`}
      accessibilityHint={`Open ${title}`}
    >
      <NeumorphicTexture
        grainVariant="skia"
        grainOpacity={0.44}
        baseFrequency={0.7}
        gradientColors={cbTileCardGradient.colors}
        gradientStart={cbTileCardGradient.start}
        gradientEnd={cbTileCardGradient.end}
      />
      <View style={styles.miniTopRow}>
        <Text style={styles.miniIndex}>{index}</Text>
        <Ionicons name="chevron-forward" size={15} color={styles.miniArrow.color} />
      </View>
      <View style={{ flex: 1 }} />
      <Text style={styles.miniTitle}>{title}</Text>
    </TileGleam>
  );
}

export default function MoreScreen({ user, onNavigate, onNavigateToAI }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const [fcStats, setFcStats] = useState<any>(null);
  const [subScreen, setSubScreen] = useState<'calendar' | 'activity' | null>(null);

  useEffect(() => {
    getFlashcardStatistics(user.username).then(setFcStats).catch(() => {});
  }, [user.username]);

  if (!fontsLoaded) return null;

  if (subScreen === 'calendar') return <CalendarScreen user={user} onBack={() => setSubScreen(null)} />;
  if (subScreen === 'activity') return <ActivityTimelineScreen user={user} onBack={() => setSubScreen(null)} />;

  const fcTotal = fcStats?.total_cards ?? 0;
  const fcSets = fcStats?.total_sets ?? 0;
  const fcMastered = fcStats?.cards_mastered ?? 0;
  const masteryPct = fcTotal > 0 ? Math.round((fcMastered / fcTotal) * 100) : 0;

  return (
    <SafeAreaView style={s.safe} edges={[]}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFill} />
      <GeoBackground />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.titleRow}>
          <Text style={s.title}>explore</Text>
          <View style={s.titleRule} />
        </View>

        {/* Row 1: AI chat hero + notes */}
        <View style={s.bentoRow}>
          <TileGleam style={s.heroTile} onPress={() => onNavigateToAI?.()} haptic="medium">
            <NeumorphicTexture
              grainVariant="skia"
              grainOpacity={0.44}
              baseFrequency={0.7}
              gradientColors={[selectedTheme.accentHover, selectedTheme.accent]}
              gradientStart={{ x: 0.1, y: 0 }}
              gradientEnd={{ x: 0.95, y: 1 }}
            />
            <Text style={s.heroIndex}>01</Text>
            <View style={{ flex: 1 }} />
            <Text style={s.heroTitle}>AI{'\n'}chat</Text>
            <View style={s.heroFootRow}>
              <Ionicons name="chevron-forward" size={16} color={selectedTheme.bgPrimary} />
            </View>
          </TileGleam>

          <BentoMini index="02" title="notes" styles={s} tall onPress={() => onNavigate?.('notes')} />
        </View>

        {/* Row 2: media notes — its own destination now, not nested inside notes */}
        <View style={s.bentoRow}>
          <BentoMini index="03" title="media notes" styles={s} onPress={() => onNavigate?.('aimedia')} />
        </View>

        {/* Row 3: Flashcards banner — one hero stat, no clutter */}
        <TileGleam style={s.flashcardCard} onPress={() => onNavigate?.('flashcards')} haptic="medium">
          <NeumorphicTexture
            grainVariant="skia"
            grainOpacity={0.44}
            baseFrequency={0.7}
            gradientColors={cbTileCardGradient.colors}
            gradientStart={cbTileCardGradient.start}
            gradientEnd={cbTileCardGradient.end}
          />
          <View style={s.fcLeft}>
            <Text style={s.fcIndex}>04</Text>
            <Text style={s.fcTitle}>flashcards</Text>
            <Text style={s.fcCaption}>{fcSets ? `${fcSets} sets · ${fcTotal} cards` : 'build your first set'}</Text>
          </View>
          <View style={s.fcRight}>
            <Text style={s.fcMasteryVal}>{masteryPct}<Text style={s.fcMasteryPct}>%</Text></Text>
            <Text style={s.fcMasteryLbl}>mastered</Text>
          </View>
          <View style={s.fcProgressTrack}>
            <View style={[s.fcProgressFill, { width: `${Math.max(4, masteryPct)}%` }]} />
          </View>
        </TileGleam>

        {/* Row 4: question bank + learning paths */}
        <View style={s.bentoRow}>
          <BentoMini index="05" title="questions" styles={s} onPress={() => onNavigate?.('questionBank')} />
          <BentoMini index="06" title="paths" styles={s} onPress={() => onNavigate?.('learningPaths')} />
        </View>

        {/* Row 5: knowledge hub + maps */}
        <View style={s.bentoRow}>
          <BentoMini index="07" title="hub" styles={s} onPress={() => onNavigate?.('knowledgeHub')} />
          <BentoMini index="08" title="maps" styles={s} onPress={() => onNavigate?.('knowledgeMaps')} />
        </View>

        {/* Row 6: primary creation tools stay above the fold */}
        <View style={s.bentoRow}>
          <BentoMini index="09" title="slides" styles={s} onPress={() => onNavigate?.('slideExplorer')} />
          <BentoMini index="10" title="analytics" styles={s} onPress={() => onNavigate?.('analytics')} />
        </View>
        <View style={s.bentoRow}>
          <BentoMini index="11" title="weakness" styles={s} onPress={() => onNavigate?.('weaknessPractice')} />
          <BentoMini index="12" title="topics" styles={s} onPress={() => onNavigate?.('topicsHub')} />
        </View>
        <View style={s.bentoRow}>
          <BentoMini index="13" title="calendar" styles={s} onPress={() => setSubScreen('calendar')} />
          <BentoMini index="14" title="timeline" styles={s} onPress={() => setSubScreen('activity')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const BG = theme.bgPrimary;
  const GOLD_L = theme.accentHover;
  const DIM = theme.textSecondary;
  const BORDER = rgbaFromHex(GOLD_L, theme.isLight ? 0.16 : 0.18);
  const heroRowHeight = 210;
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  scroll: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: 2,
    paddingBottom: 120,
    gap: 12,
  },

  titleRow: { marginTop: 20, marginBottom: 6, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: {
    fontFamily: 'Inter_900Black', fontSize: 38, color: GOLD_L, letterSpacing: -1.6,
  },
  titleRule: { flex: 1, height: 1, backgroundColor: BORDER, marginTop: 6 },

  bentoRow: { flexDirection: 'row', gap: 12 },

  heroTile: {
    flex: 1.4, minHeight: heroRowHeight, borderRadius: 26, padding: 20,
    overflow: 'hidden',
  } as ViewStyle,
  heroIndex: {
    fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 2,
    color: rgbaFromHex(theme.bgPrimary, 0.55),
  },
  heroTitle: {
    fontFamily: 'Inter_900Black', fontSize: 40, lineHeight: 40,
    color: theme.bgPrimary, letterSpacing: -1.6,
  },
  heroFootRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 16 },

  // Grid tiles use the same 22px radius as the social page's bento tiles;
  // hero-tier cards (AI chat, this tall notes tile, the flashcards banner)
  // use 26px, matching the social page's level/leaderboard cards.
  miniTile: {
    flex: 1, borderRadius: 22, overflow: 'hidden',
    paddingHorizontal: 16, paddingVertical: 16,
  } as ViewStyle,
  miniTileTall: { minHeight: heroRowHeight, borderRadius: 26 },
  miniTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  miniIndex: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.5, color: DIM },
  miniArrow: { color: GOLD_L },
  miniTitle: { fontFamily: 'Inter_900Black', fontSize: 19, color: GOLD_L, letterSpacing: -0.4 },

  flashcardCard: {
    borderRadius: 26, overflow: 'hidden',
    padding: 20,
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end',
  } as ViewStyle,
  fcLeft: { flex: 1, minWidth: 160 },
  fcIndex: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.5, color: DIM, marginBottom: 10 },
  fcTitle: { fontFamily: 'Inter_900Black', fontSize: 28, color: GOLD_L, letterSpacing: -1 },
  fcCaption: { fontFamily: 'Inter_400Regular', fontSize: 12, color: DIM, marginTop: 6 },
  fcRight: { alignItems: 'flex-end' },
  fcMasteryVal: { fontFamily: 'Inter_900Black', fontSize: 48, color: GOLD_L, letterSpacing: -2 },
  fcMasteryPct: { fontSize: 22, color: GOLD_L },
  fcMasteryLbl: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: 1.4, marginTop: -4 },
  fcProgressTrack: {
    width: '100%', height: 4, borderRadius: 2, marginTop: 18,
    backgroundColor: rgbaFromHex(GOLD_L, 0.14), overflow: 'hidden',
  },
  fcProgressFill: { height: '100%', borderRadius: 2, backgroundColor: GOLD_L },
});
}
