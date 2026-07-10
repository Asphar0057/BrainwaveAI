import { useState, useEffect, useMemo } from 'react';
import CalendarScreen from './CalendarScreen';
import ActivityTimelineScreen from './ActivityTimelineScreen';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import { getFlashcardStatistics } from '../services/api';
import HapticTouchable from '../components/HapticTouchable';
import AmbientBubbles from '../components/AmbientBubbles';
import GeoBackground from '../components/GeoBackground';
import { useAppTheme } from '../contexts/ThemeContext';
import { lightenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type ExploreTarget = 'flashcards' | 'notes' | 'aimedia' | 'questionBank' | 'knowledgeMaps' | 'knowledgeHub' | 'slideExplorer' | 'canvasHub' | 'analytics' | 'weaknessPractice' | 'learningPaths';
type Props = { user: AuthUser; onNavigate?: (screen: ExploreTarget) => void; onNavigateToAI?: () => void };

function BentoMini({
  index,
  title,
  caption,
  styles,
  onPress,
}: {
  index: string;
  title: string;
  caption: string;
  styles: ReturnType<typeof createStyles>;
  onPress?: () => void;
}) {
  return (
    <HapticTouchable style={styles.miniTile} onPress={onPress} haptic="selection" activeOpacity={0.7}>
      <View style={styles.miniTopRow}>
        <Text style={styles.miniIndex}>{index}</Text>
        <Ionicons name="chevron-forward" size={15} color={styles.miniArrow.color} />
      </View>
      <View style={{ flex: 1 }} />
      <Text style={styles.miniTitle}>{title}</Text>
      <Text style={styles.miniCaption}>{caption}</Text>
    </HapticTouchable>
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
  const aboutCards = [
    { index: '01', title: 'built by students', copy: 'made for the study loop we kept rebuilding across four different apps' },
    { index: '02', title: 'ai that remembers', copy: 'chats, notes, quizzes, flashcards, and sources feed one profile' },
    { index: '03', title: 'full workflow', copy: 'tutor, notes, flashcards, question bank, media, paths, battles' },
  ];

  return (
    <SafeAreaView style={s.safe} edges={[]}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFill} />
      <GeoBackground />
      <AmbientBubbles theme={selectedTheme} variant="explore" opacity={0.9} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.titleRow}>
          <Text style={s.title}>explore</Text>
          <View style={s.titleRule} />
        </View>

        <View style={s.manifesto}>
          <LinearGradient
            colors={[rgbaFromHex(selectedTheme.accentHover, 0.18), rgbaFromHex(selectedTheme.panel, 0.96), rgbaFromHex(selectedTheme.bgPrimary, 0.98)]}
            locations={[0, 0.48, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          <Text style={s.manifestoKicker}>why cerbyl</Text>
          <Text style={s.manifestoTitle}>one workspace that actually knows how you learn.</Text>
          <View style={s.manifestoGrid}>
            {aboutCards.map((card) => (
              <View key={card.index} style={s.manifestoCard}>
                <Text style={s.manifestoIndex}>{card.index}</Text>
                <Text style={s.manifestoCardTitle}>{card.title}</Text>
                <Text style={s.manifestoCopy}>{card.copy}</Text>
              </View>
            ))}
          </View>
          <View style={s.founderRow}>
            <View style={s.founderMark}><Text style={s.founderInitials}>AL</Text></View>
            <View style={s.founderMark}><Text style={s.founderInitials}>PE</Text></View>
            <Text style={s.founderText}>founder-built learning system</Text>
          </View>
        </View>

        {/* Row 1: AI chat hero + notes/media stack */}
        <View style={s.bentoRow}>
          <HapticTouchable style={s.heroTile} onPress={() => onNavigateToAI?.()} haptic="medium" activeOpacity={0.85}>
            <LinearGradient
              colors={[selectedTheme.accentHover, selectedTheme.accent]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.95, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <Text style={s.heroIndex}>01</Text>
            <View style={{ flex: 1 }} />
            <Text style={s.heroTitle}>AI{'\n'}chat</Text>
            <View style={s.heroFootRow}>
              <Text style={s.heroCaption}>think, ask, iterate</Text>
              <Ionicons name="chevron-forward" size={16} color={selectedTheme.bgPrimary} />
            </View>
          </HapticTouchable>

          <View style={s.stackCol}>
            <BentoMini index="02" title="notes" caption="capture what matters" styles={s} onPress={() => onNavigate?.('notes')} />
            <BentoMini index="03" title="media" caption="video to notes" styles={s} onPress={() => onNavigate?.('aimedia')} />
          </View>
        </View>

        {/* Row 2: Flashcards banner — one hero stat, no clutter */}
        <HapticTouchable style={s.flashcardCard} onPress={() => onNavigate?.('flashcards')} haptic="medium" activeOpacity={0.85}>
          <LinearGradient
            colors={[rgbaFromHex(selectedTheme.accentHover, 0.14), rgbaFromHex(selectedTheme.accentHover, 0.015)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
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
        </HapticTouchable>

        {/* Row 3: question bank + learning paths */}
        <View style={s.bentoRow}>
          <BentoMini index="05" title="questions" caption="practice bank" styles={s} onPress={() => onNavigate?.('questionBank')} />
          <BentoMini index="06" title="paths" caption="guided learning" styles={s} onPress={() => onNavigate?.('learningPaths')} />
        </View>

        {/* Row 4: knowledge hub + maps */}
        <View style={s.bentoRow}>
          <BentoMini index="07" title="hub" caption="sources & context" styles={s} onPress={() => onNavigate?.('knowledgeHub')} />
          <BentoMini index="08" title="maps" caption="concept graph" styles={s} onPress={() => onNavigate?.('knowledgeMaps')} />
        </View>

        {/* Row 5: analytics + weakness practice */}
        <View style={s.bentoRow}>
          <BentoMini index="09" title="analytics" caption="study signals" styles={s} onPress={() => onNavigate?.('analytics')} />
          <BentoMini index="10" title="weakness" caption="targeted review" styles={s} onPress={() => onNavigate?.('weaknessPractice')} />
        </View>
        <View style={s.bentoRow}>
          <BentoMini index="11" title="slides" caption="deck explorer" styles={s} onPress={() => onNavigate?.('slideExplorer')} />
          <BentoMini index="12" title="canvas" caption="sketch hub" styles={s} onPress={() => onNavigate?.('canvasHub')} />
        </View>
        <View style={s.bentoRow}>
          <BentoMini index="13" title="calendar" caption="activity heatmap" styles={s} onPress={() => setSubScreen('calendar')} />
          <BentoMini index="14" title="timeline" caption="everything, in order" styles={s} onPress={() => setSubScreen('activity')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const BG = theme.bgPrimary;
  const SURFACE_RAISED = theme.isLight ? theme.panel : lightenColor(theme.panelAlt, 6);
  const GOLD_L = theme.accentHover;
  const DIM = theme.textSecondary;
  const BORDER = rgbaFromHex(theme.accent, theme.isLight ? 0.22 : 0.26);
  const heroRowHeight = 210;
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  scroll: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: 8,
    paddingBottom: 120,
    gap: 12,
  },

  titleRow: { marginTop: 20, marginBottom: 6, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: {
    fontFamily: 'Inter_900Black', fontSize: 38, color: GOLD_L, letterSpacing: -1.6,
  },
  titleRule: { flex: 1, height: 1, backgroundColor: BORDER, marginTop: 6 },

  manifesto: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE_RAISED,
    padding: 18,
    overflow: 'hidden',
    gap: 16,
    shadowColor: theme.bgPrimary,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: theme.isLight ? 0.08 : 0.28,
    shadowRadius: 28,
    elevation: 12,
  },
  manifestoKicker: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: DIM,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },
  manifestoTitle: {
    fontFamily: 'Inter_900Black',
    fontSize: layout.width >= 700 ? 34 : 28,
    lineHeight: layout.width >= 700 ? 36 : 30,
    color: GOLD_L,
    letterSpacing: -1.1,
    maxWidth: layout.width >= 700 ? '78%' : '96%',
  },
  manifestoGrid: {
    flexDirection: layout.width >= 700 ? 'row' : 'column',
    gap: 10,
  },
  manifestoCard: {
    flex: 1,
    minHeight: 112,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: rgbaFromHex(GOLD_L, theme.isLight ? 0.16 : 0.18),
    backgroundColor: rgbaFromHex(theme.bgPrimary, theme.isLight ? 0.48 : 0.54),
    padding: 14,
  },
  manifestoIndex: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: DIM,
    letterSpacing: 1.6,
    marginBottom: 16,
  },
  manifestoCardTitle: {
    fontFamily: 'Inter_900Black',
    fontSize: 16,
    color: GOLD_L,
    letterSpacing: -0.25,
    marginBottom: 5,
  },
  manifestoCopy: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 16,
    color: DIM,
  },
  founderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: rgbaFromHex(GOLD_L, theme.isLight ? 0.12 : 0.14),
    paddingTop: 14,
  },
  founderMark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: rgbaFromHex(GOLD_L, 0.10),
  },
  founderInitials: {
    fontFamily: 'Inter_900Black',
    fontSize: 11,
    color: GOLD_L,
    letterSpacing: 0.8,
  },
  founderText: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: DIM,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },

  bentoRow: { flexDirection: 'row', gap: 12 },

  heroTile: {
    flex: 1.4, minHeight: heroRowHeight, borderRadius: 26, padding: 20,
    overflow: 'hidden',
  },
  heroIndex: {
    fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 2,
    color: rgbaFromHex(theme.bgPrimary, 0.55),
  },
  heroTitle: {
    fontFamily: 'Inter_900Black', fontSize: 40, lineHeight: 40,
    color: theme.bgPrimary, letterSpacing: -1.6,
  },
  heroFootRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  heroCaption: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: rgbaFromHex(theme.bgPrimary, 0.66) },

  stackCol: { flex: 1, gap: 12 },
  miniTile: {
    flex: 1, borderRadius: 22, borderWidth: 1, borderColor: BORDER,
    backgroundColor: SURFACE_RAISED, paddingHorizontal: 16, paddingVertical: 14,
  },
  miniTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  miniIndex: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.5, color: DIM },
  miniArrow: { color: GOLD_L },
  miniTitle: { fontFamily: 'Inter_900Black', fontSize: 19, color: GOLD_L, letterSpacing: -0.4 },
  miniCaption: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginTop: 2 },

  flashcardCard: {
    borderRadius: 26, borderWidth: 1, borderColor: BORDER,
    backgroundColor: SURFACE_RAISED, padding: 20, overflow: 'hidden',
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end',
  },
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
