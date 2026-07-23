import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, ViewStyle, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle, Path } from 'react-native-svg';
import { AuthUser } from '../services/auth';
import {
  getFriends, getFriendRequests, getLeaderboard,
  getQuizBattles, getChallenges, getFriendActivityFeed,
} from '../services/api';
import HapticTouchable from '../components/HapticTouchable';
import TileGleam from '../components/TileGleam';
import { cbTileShadowExact } from '../components/NeumorphicTexture';
import SocialTileMaterial from '../components/SocialTileMaterial';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FriendsScreen       from './social/FriendsScreen';
import GamesScreen         from './social/GamesScreen';
import QuizPlaylistScreen  from './social/QuizPlaylistScreen';
import SoloQuizScreen      from './social/SoloQuizScreen';
import PlaylistsScreen     from './social/PlaylistsScreen';
import LearningPathsScreen from './social/LearningPathsScreen';
import GeoBackground from '../components/GeoBackground';
import { useAppTheme } from '../contexts/ThemeContext';
import { rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Section = 'friends' | 'games' | 'quiz' | 'solo' | 'playlists' | 'paths';
type HubData = {
  friendCount:    number;
  requestCount:   number;
  myRank:         number | null;
  activeBattles:  number;
  pendingBattles: number;
  challengeCount: number;
  recentActivity: any[];
  lbEntries:      any[];
  friendList:     any[];
};
type Props = { user: AuthUser; onOpenLeaderboard?: () => void };
const AnimatedView = Animated.createAnimatedComponent(View);

function inits(name: string): string {
  return (name || '?').replace(/_/g, ' ').split(' ').map((p: string) => p[0] ?? '').join('').slice(0, 2).toUpperCase();
}
function actIcon(t: string): React.ComponentProps<typeof Ionicons>['name'] {
  if (t.includes('quiz'))  return 'trophy-outline';
  if (t.includes('flash')) return 'layers-outline';
  if (t.includes('note'))  return 'document-text-outline';
  if (t.includes('chat'))  return 'sparkles-outline';
  return 'pulse-outline';
}
function actVerb(t: string): string {
  if (t.includes('quiz'))  return 'completed a quiz';
  if (t.includes('flash')) return 'studied flashcards';
  if (t.includes('note'))  return 'took notes on';
  if (t.includes('chat'))  return 'used AI on';
  return 'logged activity';
}
function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1)    return 'just now';
  if (m < 60)   return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

// ─── Sub-components ────────────────────────────────────────────────────────

function SectionRow({ label, cta, ctaLabel, badge, badgeDanger }: {
  label: string; cta?: () => void; ctaLabel?: string;
  badge?: number; badgeDanger?: boolean;
}) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionLbl}>{label}</Text>
      {badge != null && badge > 0 && (
        <View style={[s.sectionBadge, badgeDanger && s.sectionBadgeDanger]}>
          <Text style={[s.sectionBadgeTxt, badgeDanger && s.sectionBadgeDangerTxt]}>{badge}</Text>
        </View>
      )}
      {cta && (
        <>
          <View style={{ flex: 1 }} />
          <HapticTouchable style={s.seeAll} onPress={cta} haptic="light" activeOpacity={0.8}>
            <Text style={s.seeAllTxt}>{ctaLabel ?? 'see all'}</Text>
            <Ionicons name="chevron-forward" size={11} color={selectedTheme.accentHover} />
          </HapticTouchable>
        </>
      )}
    </View>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function SocialScreen({ user, onOpenLeaderboard }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold });
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Section | null>(null);
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const orbitPulse = useRef(new Animated.Value(0)).current;

  const accent  = selectedTheme.accentHover;
  const accentM = selectedTheme.accent;

  const load = useCallback(async () => {
    try {
      const [friends, requests, lb, battles, challenges, feed] = await Promise.allSettled([
        getFriends(user.username),
        getFriendRequests(user.username),
        getLeaderboard('global', 20),
        getQuizBattles(user.username),
        getChallenges(user.username),
        getFriendActivityFeed(user.username),
      ]);
      const fr  = friends.status    === 'fulfilled' ? friends.value    : null;
      const rq  = requests.status   === 'fulfilled' ? requests.value   : null;
      const lbv = lb.status         === 'fulfilled' ? lb.value         : null;
      const btv = battles.status    === 'fulfilled' ? battles.value    : null;
      const chv = challenges.status === 'fulfilled' ? challenges.value : null;
      const fdv = feed.status       === 'fulfilled' ? feed.value       : null;

      const friendList  = Array.isArray(fr)  ? fr  : fr?.friends ?? [];
      const reqList     = Array.isArray(rq)  ? rq  : rq?.received ?? [];
      const lbList      = lbv?.leaderboard ?? [];
      const battleList  = btv?.battles ?? (Array.isArray(btv) ? btv : []);
      const chalList    = chv?.challenges ?? (Array.isArray(chv) ? chv : []);
      const feedList    = Array.isArray(fdv) ? fdv : fdv?.activities ?? fdv?.feed ?? [];
      const myRankEntry = lbv?.current_user_rank ?? lbList.find((e: any) => e.is_current_user);

      setData({
        friendCount:    friendList.length,
        requestCount:   reqList.length,
        myRank:         myRankEntry?.rank ?? null,
        activeBattles:  battleList.filter((b: any) => b.status === 'active').length,
        pendingBattles: battleList.filter((b: any) => b.status === 'pending').length,
        challengeCount: chalList.length,
        recentActivity: feedList.slice(0, 5),
        lbEntries:      lbList.slice(0, 6),
        friendList:     friendList.slice(0, 14),
      });
    } catch {
      setData({ friendCount: 0, requestCount: 0, myRank: null, activeBattles: 0, pendingBattles: 0, challengeCount: 0, recentActivity: [], lbEntries: [], friendList: [] });
    } finally {
      setLoading(false);
    }
  }, [user.username]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(orbitPulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(orbitPulse, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [orbitPulse]);
  if (!fontsLoaded) return null;

  if (screen === 'friends')     return <FriendsScreen       user={user} onBack={() => setScreen(null)} />;
  if (screen === 'games')       return <GamesScreen         user={user} onBack={() => setScreen(null)} />;
  if (screen === 'quiz')        return <QuizPlaylistScreen  user={user} onBack={() => setScreen(null)} />;
  if (screen === 'solo')        return <SoloQuizScreen      user={user} onBack={() => setScreen(null)} />;
  if (screen === 'playlists')   return <PlaylistsScreen     user={user} onBack={() => setScreen(null)} />;
  if (screen === 'paths')       return <LearningPathsScreen user={user} onBack={() => setScreen(null)} />;

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]}>

        {/* ══ SOCIAL PRODUCT HEADER ══ */}
        <View style={s.topBar}>
          <View>
            <Text style={s.brandSub}>cerbyl / community</Text>
            <Text style={s.brand}>social</Text>
          </View>
          <HapticTouchable style={s.headerPeopleButton} onPress={() => setScreen('friends')} haptic="light" activeOpacity={0.8}>
            <Ionicons name="people-outline" size={18} color={accent} />
            {data && data.requestCount > 0 && (
              <View style={s.headerBadge}><Text style={s.headerBadgeText}>{data.requestCount}</Text></View>
            )}
          </HapticTouchable>
        </View>

        {loading || !data ? (
          <View style={s.loadingWrap}><ActivityIndicator color={accentM} size="large" /></View>
        ) : (
          <>
            {/* ══ LEARNING ORBIT — a spatial social map, not a card list ══ */}
            <View style={s.orbitStage}>
              <SocialTileMaterial />
              <Svg width="100%" height="100%" viewBox="0 0 360 285" style={StyleSheet.absoluteFillObject}>
                <Path d="M28 142 C54 28 306 18 332 142 C306 260 54 266 28 142 Z" fill="none" stroke={rgbaFromHex(accent, 0.28)} strokeWidth="1" strokeDasharray="5 8" />
                <Circle cx="180" cy="142" r="83" fill="none" stroke={rgbaFromHex(accentM, 0.12)} strokeWidth="1" />
                <Circle cx="180" cy="142" r="116" fill="none" stroke={rgbaFromHex(accentM, 0.08)} strokeWidth="1" />
              </Svg>

              <View style={s.orbitHeader}>
                <Text style={s.orbitKicker}>your learning orbit</Text>
                <View style={s.orbitRankPill}>
                  <Ionicons name="trophy-outline" size={12} color={accent} />
                  <Text style={s.orbitRankText}>{data.myRank ? `#${data.myRank}` : 'unranked'}</Text>
                </View>
              </View>

              <AnimatedView
                style={[
                  s.orbitPulseHalo,
                  {
                    opacity: orbitPulse.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.28] }),
                    transform: [{ scale: orbitPulse.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.18] }) }],
                  },
                ]}
              />
              <AnimatedView
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 80,
                  marginLeft: -43,
                  transform: [{ scale: orbitPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }) }],
                }}
              >
                <LinearGradient colors={[accent, accentM]} style={s.orbitCenterRing}>
                  <View style={s.orbitCenter}>
                    <Text style={s.orbitCenterInitials}>{inits(user.first_name || user.username)}</Text>
                    <Text style={s.orbitYou}>you</Text>
                  </View>
                </LinearGradient>
              </AnimatedView>

              {data.friendList.slice(0, 4).map((f: any, fi: number) => {
                const fname = f.username ?? f.friend_username ?? f.name ?? `user${fi}`;
                const nodeStyles = [s.orbitNodeA, s.orbitNodeB, s.orbitNodeC, s.orbitNodeD];
                return (
                  <HapticTouchable key={`${fname}-${fi}`} style={[s.orbitNode, nodeStyles[fi]]} onPress={() => setScreen('friends')} haptic="light">
                    <Text style={s.orbitNodeInitials}>{inits(fname)}</Text>
                    <Text style={s.orbitNodeName} numberOfLines={1}>{fname}</Text>
                  </HapticTouchable>
                );
              })}

              {data.friendList.length === 0 && (
                <>
                  <HapticTouchable style={[s.orbitAddNode, s.orbitNodeA]} onPress={() => setScreen('friends')} haptic="light"><Ionicons name="add" size={19} color={accent} /></HapticTouchable>
                  <HapticTouchable style={[s.orbitAddNode, s.orbitNodeB]} onPress={() => setScreen('friends')} haptic="light"><Ionicons name="add" size={19} color={accent} /></HapticTouchable>
                  <HapticTouchable style={[s.orbitAddNode, s.orbitNodeC]} onPress={() => setScreen('friends')} haptic="light"><Ionicons name="add" size={19} color={accent} /></HapticTouchable>
                </>
              )}

              <View style={s.orbitFooter}>
                <View>
                  <Text style={s.orbitFooterTitle}>{data.friendCount > 0 ? `${data.friendCount} people in your circle` : 'Your orbit is waiting'}</Text>
                  <Text style={s.orbitFooterCopy}>{data.friendCount > 0 ? 'Tap a person to open your circle' : 'Add your first study partner'}</Text>
                </View>
                <HapticTouchable style={s.orbitFooterButton} onPress={() => setScreen('friends')} haptic="medium">
                  <Ionicons name={data.friendCount > 0 ? 'people-outline' : 'person-add-outline'} size={17} color={accent} />
                </HapticTouchable>
              </View>
            </View>

            {/* ══ FLOATING ACTION DOCK ══ */}
            <View style={s.actionDock}>
              <SocialTileMaterial />
              <HapticTouchable style={s.dockAction} onPress={() => setScreen('friends')} haptic="light">
                <Ionicons name="person-add-outline" size={18} color={accent} /><Text style={s.dockLabel}>people</Text>
              </HapticTouchable>
              <HapticTouchable style={s.dockBattleAction} onPress={() => setScreen('games')} haptic="medium">
                <LinearGradient colors={[accent, accentM]} style={s.dockBattleOrb}>
                  <Ionicons name="flash" size={20} color={selectedTheme.bgPrimary} />
                </LinearGradient>
                <Text style={s.dockBattleLabel}>battle</Text>
              </HapticTouchable>
              <HapticTouchable style={s.dockAction} onPress={() => setScreen('playlists')} haptic="light">
                <Ionicons name="bookmark-outline" size={18} color={accent} /><Text style={s.dockLabel}>playlists</Text>
              </HapticTouchable>
            </View>

            {/* ══ LEADERBOARD RIBBON — intentionally near the top ══ */}
            <View style={s.ribbonHeading}>
              <View><Text style={s.ribbonKicker}>weekly race</Text><Text style={s.ribbonTitle}>leaderboard</Text></View>
              <HapticTouchable style={s.ribbonOpen} onPress={onOpenLeaderboard} haptic="light">
                <Text style={s.ribbonOpenText}>full board</Text><Ionicons name="chevron-forward" size={15} color="#D8B38D" />
              </HapticTouchable>
            </View>
            <TileGleam style={s.rankRibbon} onPress={onOpenLeaderboard} haptic="light" activeOpacity={0.86} borderRadius={26}>
              <SocialTileMaterial />
              <Svg width="100%" height="100%" viewBox="0 0 360 190" style={StyleSheet.absoluteFillObject}>
                <Path d="M24 29 C88 29 57 87 134 87 C204 87 166 151 335 151" fill="none" stroke={rgbaFromHex(accent, 0.18)} strokeWidth="2" strokeDasharray="3 7" />
                <Circle cx="25" cy="29" r="4" fill={accent} opacity={0.5} />
                <Circle cx="134" cy="87" r="4" fill={accent} opacity={0.35} />
                <Circle cx="335" cy="151" r="4" fill={accent} opacity={0.22} />
              </Svg>
              {[0, 1, 2].map((slot) => {
                const entry = data.lbEntries[slot];
                const name = entry?.username ?? entry?.name ?? (slot === 0 ? 'Your spot' : 'Open');
                const points = entry ? (entry.score ?? entry.total_points ?? entry.points ?? 0) : null;
                return (
                  <View key={slot} style={[s.rankLane, slot === 1 && s.rankLaneMiddle, slot === 2 && s.rankLaneLast]}>
                    <View style={[s.rankMedal, slot === 0 && s.rankMedalFirst]}><Text style={[s.rankMedalText, slot > 0 && { color: accent }]}>{slot + 1}</Text></View>
                    <View style={s.rankAvatar}><Text style={s.rankAvatarText}>{entry ? inits(name) : '+'}</Text></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.rankName} numberOfLines={1}>{name}</Text>
                      <Text style={s.rankMeta}>{points == null ? 'complete a quiz to claim it' : `${points.toLocaleString()} xp`}</Text>
                    </View>
                  </View>
                );
              })}
            </TileGleam>

            {/* ══ ASYMMETRIC PLAYFIELD ══ */}
            <SectionRow label="play together" />
            <View style={s.playfield}>
              <TileGleam style={s.battleShape} onPress={() => setScreen('games')} haptic="medium" activeOpacity={0.86} borderRadius={26}>
                <SocialTileMaterial />
                <View style={s.battleGlyph}><Ionicons name="flash" size={25} color={accent} /></View>
                <Text style={s.battleLabel}>quiz{'\n'}battles</Text>
                <Text style={s.battleSub}>{data.activeBattles > 0 ? `${data.activeBattles} live now` : 'challenge a friend'}</Text>
                <Ionicons name="chevron-forward" size={15} color="#D8B38D" style={s.battleArrow} />
              </TileGleam>
              <View style={s.playfieldRight}>
                <TileGleam style={s.quizCapsule} onPress={() => setScreen('quiz')} haptic="light" borderRadius={26}>
                  <SocialTileMaterial />
                  <Ionicons name="library-outline" size={20} color={accent} />
                  <View style={{ flex: 1 }}><Text style={s.playMiniTitle}>quiz hub</Text><Text style={s.playMiniSub}>{data.challengeCount} challenges</Text></View>
                  <Ionicons name="chevron-forward" size={15} color="#D8B38D" />
                </TileGleam>
                <TileGleam style={s.soloOrb} onPress={() => setScreen('solo')} haptic="light" borderRadius={26}>
                  <SocialTileMaterial />
                  <Ionicons name="sparkles-outline" size={22} color={accent} />
                  <Text style={s.soloTitle}>solo</Text>
                  <Text style={s.soloSub}>your pace</Text>
                  <Ionicons name="chevron-forward" size={15} color="#D8B38D" style={s.soloArrow} />
                </TileGleam>
              </View>
            </View>

            {/* ══ ACTIVITY ══ */}
            {data.recentActivity.length > 0 && (
              <>
                <SectionRow label="signals from your circle" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.signalRail}>
                  {data.recentActivity.map((item: any, ai: number) => {
                    const type  = String(item?.activity_type ?? item?.type ?? '').toLowerCase();
                    const icon  = actIcon(type);
                    const verb  = actVerb(type);
                    const actor = item?.username ?? item?.user_username ?? item?.friend_username ?? 'someone';
                    const subj  = item?.title ?? item?.subject ?? item?.topic ?? '';
                    const time  = timeAgo(item?.created_at ?? item?.timestamp ?? '');
                    const tc    = type.includes('quiz') ? accent : type.includes('flash') ? accentM : selectedTheme.textSecondary;
                    return (
                      <View key={ai} style={[s.signalCard, ai % 2 === 1 && s.signalCardLifted]}>
                        <View style={[s.signalIcon, { borderColor: rgbaFromHex(tc, 0.38), backgroundColor: rgbaFromHex(tc, 0.1) }]}>
                          <Ionicons name={icon} size={15} color={tc} />
                        </View>
                        <Text style={s.signalActor} numberOfLines={1}>{actor}</Text>
                        <Text style={s.signalVerb} numberOfLines={2}>{verb}{subj ? ` · ${subj}` : ''}</Text>
                        {time ? <Text style={s.signalTime}>{time}</Text> : null}
                      </View>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {/* ══ CURVED DISCOVERY RAILS ══ */}
            <SectionRow label="go further together" />
            <View style={s.discoveryRail}>
              <TileGleam style={s.discoveryPath} onPress={() => setScreen('playlists')} haptic="light" borderRadius={26}>
                <SocialTileMaterial />
                <View style={s.discoveryNumber}><Text style={s.discoveryNumberText}>01</Text></View>
                <Ionicons name="bookmark-outline" size={19} color={accent} />
                <View style={{ flex: 1 }}><Text style={s.discoveryTitle}>shared playlists</Text><Text style={s.discoveryCopy}>follow what your circle studies</Text></View>
                <Ionicons name="chevron-forward" size={15} color="#D8B38D" />
              </TileGleam>
              <TileGleam style={s.discoveryPath} onPress={() => setScreen('paths')} haptic="light" borderRadius={26}>
                <SocialTileMaterial />
                <View style={s.discoveryNumber}><Text style={s.discoveryNumberText}>02</Text></View>
                <Ionicons name="map-outline" size={19} color={accent} />
                <View style={{ flex: 1 }}><Text style={s.discoveryTitle}>learning paths</Text><Text style={s.discoveryCopy}>move through a journey together</Text></View>
                <Ionicons name="chevron-forward" size={15} color="#D8B38D" />
              </TileGleam>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const BG     = theme.bgPrimary;
  const SURF   = theme.panel;
  const SURFA  = theme.panelAlt;
  const GOLD   = theme.accentHover;
  const GOLDM  = theme.accent;
  const DIM    = theme.textSecondary;
  const TXT    = theme.textPrimary;
  const BDR    = theme.border;
  const BDRS   = theme.borderStrong;
  const CB_CARD = '#0b0c0f';
  const CB_EDGE = 'rgba(216,179,141,0.22)';
  const PAD    = layout.isTablet ? layout.screenPadding : 16;

  return StyleSheet.create({
    root:   { flex: 1, backgroundColor: BG },
    scroll: {
      paddingHorizontal: PAD, paddingTop: 14, gap: 18,
      maxWidth: layout.contentMaxWidth, alignSelf: 'center', width: '100%',
    },

    /* Social product header */
    topBar: {
      height: 68, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between',
    },
    brand: {
      fontFamily: 'Inter_900Black', fontSize: layout.isTablet ? 40 : 34,
      color: TXT, letterSpacing: -1.2, lineHeight: 38,
    },
    brandSub: {
      fontFamily: 'Inter_600SemiBold', fontSize: 8, color: GOLD,
      letterSpacing: 1.9, textTransform: 'uppercase',
    },
    headerPeopleButton: {
      width: 42, height: 42, borderRadius: 15, alignItems: 'center',
      justifyContent: 'center', borderWidth: 1, borderColor: BDRS,
      backgroundColor: rgbaFromHex(SURFA, 0.7),
    },
    headerBadge: {
      position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18,
      borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center',
      backgroundColor: theme.danger, borderWidth: 2, borderColor: BG,
    },
    headerBadgeText: {
      fontFamily: 'Inter_900Black', fontSize: 8, color: '#fff',
    },
    loadingWrap: { paddingTop: 80, alignItems: 'center' },

    /* Spatial social orbit in the standard Cerbyl card */
    orbitStage: {
      height: layout.isTablet ? 330 : 285,
      borderRadius: 24,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: CB_EDGE,
    },
    orbitHeader: {
      position: 'absolute', top: 21, left: 20, right: 34, zIndex: 4,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    orbitKicker: {
      fontFamily: 'Inter_600SemiBold', fontSize: 9, color: GOLD,
      letterSpacing: 2.1, textTransform: 'uppercase',
    },
    orbitRankPill: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5,
      borderWidth: 1, borderColor: rgbaFromHex(GOLD, 0.32),
      backgroundColor: rgbaFromHex(SURF, 0.98),
      boxShadow: [
        { offsetX: 0, offsetY: 5, blurRadius: 12, color: 'rgba(0,0,0,0.35)' },
      ],
    },
    orbitRankText: { fontFamily: 'Inter_600SemiBold', fontSize: 8, color: GOLD },
    orbitCenterRing: {
      width: 86, height: 86, borderRadius: 43, padding: 3,
      alignItems: 'center', justifyContent: 'center',
    },
    orbitPulseHalo: {
      position: 'absolute', left: '50%', top: 72, marginLeft: -51,
      width: 102, height: 102, borderRadius: 51,
      backgroundColor: GOLD,
    },
    orbitCenter: {
      width: 80, height: 80, borderRadius: 40, alignItems: 'center',
      justifyContent: 'center', backgroundColor: BG,
      borderWidth: 1, borderColor: rgbaFromHex(GOLD, 0.18),
    },
    orbitCenterInitials: {
      fontFamily: 'Inter_900Black', fontSize: 22, color: GOLD, letterSpacing: -0.5,
    },
    orbitYou: {
      marginTop: 1, fontFamily: 'Inter_600SemiBold', fontSize: 7, color: DIM,
      letterSpacing: 1.3, textTransform: 'uppercase',
    },
    orbitNode: {
      position: 'absolute', width: 52, height: 52, borderRadius: 26,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: rgbaFromHex(GOLD, 0.38),
      backgroundColor: SURFA,
    },
    orbitNodeA: { left: 27, top: 91 },
    orbitNodeB: { right: 29, top: 75 },
    orbitNodeC: { left: 49, top: 161 },
    orbitNodeD: { right: 43, top: 160 },
    orbitNodeInitials: { fontFamily: 'Inter_900Black', fontSize: 12, color: GOLD },
    orbitNodeName: {
      position: 'absolute', top: 55, width: 68, textAlign: 'center',
      fontFamily: 'Inter_400Regular', fontSize: 7.5, color: DIM,
    },
    orbitAddNode: {
      position: 'absolute', width: 44, height: 44, borderRadius: 22,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderStyle: 'dashed',
      borderColor: rgbaFromHex(GOLD, 0.34), backgroundColor: rgbaFromHex(BG, 0.56),
    },
    orbitFooter: {
      position: 'absolute', left: 20, right: 26, bottom: 34, zIndex: 4,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    orbitFooterTitle: { fontFamily: 'Inter_900Black', fontSize: 12, color: TXT },
    orbitFooterCopy: { marginTop: 3, fontFamily: 'Inter_400Regular', fontSize: 8.5, color: DIM },
    orbitFooterButton: {
      width: 36, height: 36, borderRadius: 12, alignItems: 'center',
      justifyContent: 'center', borderWidth: 1,
      borderColor: rgbaFromHex(GOLD, 0.36),
      backgroundColor: rgbaFromHex(SURF, 0.96),
    },

    /* Overlapping action dock */
    actionDock: {
      height: 68, marginTop: -34, marginHorizontal: 20,
      flexDirection: 'row', alignItems: 'center',
      borderRadius: 20, borderWidth: 1, borderColor: CB_EDGE,
      backgroundColor: CB_CARD,
      overflow: 'hidden',
      boxShadow: cbTileShadowExact(),
    } as ViewStyle,
    dockAction: {
      flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 5,
    },
    dockLabel: {
      fontFamily: 'Inter_600SemiBold', fontSize: 7.5, color: DIM,
      letterSpacing: 0.9, textTransform: 'uppercase',
    },
    dockBattleAction: {
      width: 88, height: '100%',
      alignItems: 'center', justifyContent: 'center',
    },
    dockBattleOrb: {
      width: 44, height: 36, borderRadius: 12, alignItems: 'center',
      justifyContent: 'center', borderWidth: 1, borderColor: rgbaFromHex(GOLD, 0.36),
    },
    dockBattleLabel: {
      marginTop: 4, fontFamily: 'Inter_900Black', fontSize: 8, color: GOLD,
      letterSpacing: 1, textTransform: 'uppercase',
    },

    /* Leaderboard ribbon */
    ribbonHeading: {
      flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
      marginTop: 4,
    },
    ribbonKicker: {
      fontFamily: 'Inter_600SemiBold', fontSize: 8, color: GOLD,
      letterSpacing: 1.8, textTransform: 'uppercase',
    },
    ribbonTitle: {
      marginTop: 3, fontFamily: 'Inter_900Black', fontSize: 24,
      color: TXT, letterSpacing: -0.8,
    },
    ribbonOpen: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingBottom: 3 },
    ribbonOpenText: { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: GOLD, textTransform: 'uppercase' },
    rankRibbon: {
      minHeight: 190, padding: 14, borderRadius: 26,
      overflow: 'hidden', borderWidth: 1, borderColor: CB_EDGE,
      backgroundColor: CB_CARD,
    },
    rankLane: {
      width: '88%', minHeight: 50, flexDirection: 'row', alignItems: 'center',
      gap: 10, paddingHorizontal: 11, borderRadius: 15,
      borderWidth: 1, borderColor: rgbaFromHex(GOLD, 0.14),
      backgroundColor: '#0b0c0f',
    },
    rankLaneMiddle: { alignSelf: 'center', marginTop: 7 },
    rankLaneLast: { alignSelf: 'flex-end', marginTop: 7 },
    rankMedal: {
      width: 25, height: 25, borderRadius: 9, alignItems: 'center',
      justifyContent: 'center', borderWidth: 1, borderColor: BDR,
    },
    rankMedalFirst: { backgroundColor: GOLD, borderColor: GOLD },
    rankMedalText: { fontFamily: 'Inter_900Black', fontSize: 9, color: BG },
    rankAvatar: {
      width: 33, height: 33, borderRadius: 12, alignItems: 'center',
      justifyContent: 'center', backgroundColor: rgbaFromHex(GOLDM, 0.1),
      borderWidth: 1, borderColor: rgbaFromHex(GOLD, 0.22),
    },
    rankAvatarText: { fontFamily: 'Inter_900Black', fontSize: 10, color: GOLD },
    rankName: { fontFamily: 'Inter_900Black', fontSize: 11.5, color: TXT },
    rankMeta: { marginTop: 2, fontFamily: 'Inter_400Regular', fontSize: 8.5, color: DIM },

    /* Same playfield layout, standard Cerbyl rectangles */
    playfield: { minHeight: 250, flexDirection: 'row', gap: 11 },
    battleShape: {
      flex: 1.1, minHeight: 250, padding: 17,
      borderRadius: 26,
      overflow: 'hidden', borderWidth: 1, borderColor: CB_EDGE,
      backgroundColor: CB_CARD,
    },
    battleGlyph: {
      width: 50, height: 50, borderRadius: 18, alignItems: 'center',
      justifyContent: 'center', borderWidth: 1, borderColor: rgbaFromHex(GOLD, 0.25),
      backgroundColor: rgbaFromHex(GOLDM, 0.08),
    },
    battleLabel: {
      marginTop: 38, fontFamily: 'Inter_900Black', fontSize: 28,
      lineHeight: 27, color: TXT, letterSpacing: -1,
    },
    battleSub: { marginTop: 8, fontFamily: 'Inter_400Regular', fontSize: 9.5, color: DIM },
    battleArrow: { position: 'absolute', right: 17, bottom: 17 },
    playfieldRight: { flex: 1, gap: 11 },
    quizCapsule: {
      minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 14, borderRadius: 26, borderWidth: 1,
      borderColor: CB_EDGE, backgroundColor: CB_CARD,
    },
    playMiniTitle: { fontFamily: 'Inter_900Black', fontSize: 13, color: TXT },
    playMiniSub: { marginTop: 3, fontFamily: 'Inter_400Regular', fontSize: 8.5, color: DIM },
    soloOrb: {
      flex: 1, minHeight: 135, alignItems: 'center', justifyContent: 'center',
      borderRadius: 26, borderWidth: 1, borderColor: CB_EDGE,
      backgroundColor: CB_CARD,
    },
    soloTitle: { marginTop: 8, fontFamily: 'Inter_900Black', fontSize: 18, color: TXT },
    soloSub: { marginTop: 2, fontFamily: 'Inter_400Regular', fontSize: 8.5, color: DIM },
    soloArrow: { position: 'absolute', right: 12, top: 12 },

    /* Horizontal activity signals */
    signalRail: { gap: 11, paddingRight: 18, paddingVertical: 9 },
    signalCard: {
      width: 158, minHeight: 132, padding: 14,
      borderRadius: 18,
      borderWidth: 1, borderColor: CB_EDGE,
      backgroundColor: CB_CARD,
    },
    signalCardLifted: { transform: [{ translateY: -7 }] },
    signalIcon: {
      width: 36, height: 36, borderRadius: 13, alignItems: 'center',
      justifyContent: 'center', borderWidth: 1,
    },
    signalActor: { marginTop: 12, fontFamily: 'Inter_900Black', fontSize: 12, color: TXT },
    signalVerb: { marginTop: 4, fontFamily: 'Inter_400Regular', fontSize: 9.5, lineHeight: 14, color: DIM },
    signalTime: {
      position: 'absolute', right: 12, top: 15,
      fontFamily: 'Inter_600SemiBold', fontSize: 7.5, color: GOLD,
    },

    /* Standard discovery cards */
    discoveryRail: { gap: 9 },
    discoveryPath: {
      minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11,
      paddingHorizontal: 16, borderRadius: 26,
      borderWidth: 1, borderColor: CB_EDGE,
      backgroundColor: CB_CARD,
    },
    discoveryNumber: {
      width: 31, height: 31, borderRadius: 12, alignItems: 'center',
      justifyContent: 'center', borderWidth: 1, borderColor: rgbaFromHex(GOLD, 0.2),
      backgroundColor: rgbaFromHex(GOLDM, 0.07),
    },
    discoveryNumberText: { fontFamily: 'Inter_900Black', fontSize: 8, color: GOLD },
    discoveryTitle: { fontFamily: 'Inter_900Black', fontSize: 12.5, color: TXT },
    discoveryCopy: { marginTop: 3, fontFamily: 'Inter_400Regular', fontSize: 8.5, color: DIM },

    /* Circle identity panel */
    circlePanel: {
      minHeight: 190, padding: 18, borderRadius: 24, overflow: 'hidden',
      borderWidth: 1, borderColor: BDRS,
      backgroundColor: rgbaFromHex(SURF, 0.97),
    },
    circleTopRow: {
      flexDirection: 'row', alignItems: 'flex-start',
      justifyContent: 'space-between', gap: 14,
    },
    circleEyebrow: {
      fontFamily: 'Inter_600SemiBold', fontSize: 9, color: GOLD,
      letterSpacing: 1.9, textTransform: 'uppercase',
    },
    circleTitle: {
      maxWidth: layout.isTablet ? 430 : 245, marginTop: 6,
      fontFamily: 'Inter_900Black', fontSize: 20, lineHeight: 24,
      color: TXT, letterSpacing: -0.55,
    },
    circleManage: {
      width: 36, height: 36, borderRadius: 12, alignItems: 'center',
      justifyContent: 'center', borderWidth: 1, borderColor: BDR,
      backgroundColor: rgbaFromHex(GOLDM, 0.07),
    },
    avatarStackRow: {
      minHeight: 54, flexDirection: 'row', alignItems: 'center', marginTop: 17,
    },
    stackAdd: {
      width: 46, height: 46, borderRadius: 23, alignItems: 'center',
      justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed',
      borderColor: rgbaFromHex(GOLD, 0.45), backgroundColor: rgbaFromHex(GOLDM, 0.06),
    },
    stackAvatar: {
      width: 46, height: 46, borderRadius: 23, marginLeft: 7,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: rgbaFromHex(GOLD, 0.4),
    },
    stackAvatarOverlap: { marginLeft: -10 },
    stackInitials: { fontFamily: 'Inter_900Black', fontSize: 12, color: GOLD },
    stackMore: { backgroundColor: SURFA },
    stackMoreText: { fontFamily: 'Inter_900Black', fontSize: 10, color: DIM },
    circleEmptyHint: {
      flex: 1, marginLeft: 13, fontFamily: 'Inter_400Regular',
      fontSize: 10.5, lineHeight: 16, color: DIM,
    },
    circleMetaRow: {
      minHeight: 36, flexDirection: 'row', alignItems: 'center',
      marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: BDR,
    },
    circleMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    circleMetaValue: { fontFamily: 'Inter_900Black', fontSize: 11, color: TXT },
    circleMetaLabel: {
      fontFamily: 'Inter_400Regular', fontSize: 8, color: DIM,
      letterSpacing: 0.8, textTransform: 'uppercase',
    },
    circleMetaDivider: { width: 1, height: 14, backgroundColor: BDR, marginHorizontal: 10 },
    circleOpenText: {
      fontFamily: 'Inter_600SemiBold', fontSize: 9, color: GOLD,
      letterSpacing: 0.7, textTransform: 'uppercase',
    },

    /* Context-aware activation card */
    nextMoveCard: {
      minHeight: 205, padding: 18, borderRadius: 24, overflow: 'hidden',
      borderWidth: 1, borderColor: rgbaFromHex(GOLD, 0.28),
    },
    nextMoveTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    nextMoveIcon: {
      width: 43, height: 43, borderRadius: 14, alignItems: 'center',
      justifyContent: 'center', borderWidth: 1, borderColor: rgbaFromHex(GOLD, 0.3),
      backgroundColor: rgbaFromHex(GOLDM, 0.09),
    },
    nextMoveTag: {
      borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6,
      borderWidth: 1, borderColor: rgbaFromHex(GOLD, 0.22),
      backgroundColor: rgbaFromHex(GOLDM, 0.07),
    },
    nextMoveTagText: {
      fontFamily: 'Inter_600SemiBold', fontSize: 8, color: GOLD,
      letterSpacing: 1.2, textTransform: 'uppercase',
    },
    nextMoveTitle: {
      marginTop: 16, fontFamily: 'Inter_900Black', fontSize: 24,
      lineHeight: 28, color: TXT, letterSpacing: -0.7,
    },
    nextMoveCopy: {
      marginTop: 7, maxWidth: 305, fontFamily: 'Inter_400Regular',
      fontSize: 11, lineHeight: 17, color: DIM,
    },
    nextMoveCta: {
      alignSelf: 'flex-start', minHeight: 39, flexDirection: 'row',
      alignItems: 'center', gap: 9, marginTop: 15, paddingHorizontal: 14,
      borderRadius: 12, backgroundColor: GOLD,
    },
    nextMoveCtaText: {
      fontFamily: 'Inter_600SemiBold', fontSize: 9, color: BG,
      letterSpacing: 0.9, textTransform: 'uppercase',
    },

    /* Section row header */
    sectionRow:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionLbl:         { fontFamily: 'Inter_900Black', fontSize: 15, color: TXT, letterSpacing: -0.3, textTransform: 'lowercase' },
    sectionBadge:       { borderRadius: 999, backgroundColor: rgbaFromHex(GOLDM, 0.15), borderWidth: 1, borderColor: rgbaFromHex(GOLDM, 0.3), paddingHorizontal: 7, paddingVertical: 2 },
    sectionBadgeTxt:    { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: GOLD },
    sectionBadgeDanger: { backgroundColor: rgbaFromHex(theme.danger, 0.15), borderColor: rgbaFromHex(theme.danger, 0.35) },
    sectionBadgeDangerTxt: { color: theme.danger },
    seeAll:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
    seeAllTxt: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: GOLD },

    /* Lightweight leaderboard */
    leaderCard: {
      minHeight: 88, borderRadius: 20, overflow: 'hidden',
      borderWidth: 1, borderColor: BDRS,
      backgroundColor: rgbaFromHex(SURF, 0.96),
    },
    leaderRow: {
      minHeight: 58, flexDirection: 'row', alignItems: 'center',
      gap: 11, paddingHorizontal: 14,
    },
    leaderRowBorder: { borderBottomWidth: 1, borderBottomColor: BDR },
    leaderRank: { width: 24, fontFamily: 'Inter_900Black', fontSize: 11, color: DIM },
    leaderAvatar: {
      width: 34, height: 34, borderRadius: 12, alignItems: 'center',
      justifyContent: 'center', borderWidth: 1, borderColor: rgbaFromHex(GOLD, 0.26),
      backgroundColor: rgbaFromHex(GOLDM, 0.08),
    },
    leaderInitials: { fontFamily: 'Inter_900Black', fontSize: 10, color: GOLD },
    leaderName: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12, color: TXT },
    leaderPoints: { fontFamily: 'Inter_900Black', fontSize: 10, color: GOLD },
    leaderEmpty: {
      minHeight: 88, flexDirection: 'row', alignItems: 'center',
      gap: 12, paddingHorizontal: 14,
    },
    leaderEmptyIcon: {
      width: 42, height: 42, borderRadius: 14, alignItems: 'center',
      justifyContent: 'center', borderWidth: 1, borderColor: rgbaFromHex(GOLD, 0.25),
      backgroundColor: rgbaFromHex(GOLDM, 0.08),
    },
    leaderEmptyTitle: { fontFamily: 'Inter_900Black', fontSize: 13, color: TXT },
    leaderEmptyCopy: { fontFamily: 'Inter_400Regular', fontSize: 9.5, lineHeight: 14, color: DIM },

    /* Friends horizontal scroll */
    friendsRow: { gap: 12, paddingVertical: 3, paddingRight: 12 },
    friendItem:  { alignItems: 'center', gap: 7, width: 70 },
    friendAvatar: {
      width: 58, height: 58, borderRadius: 29, borderWidth: 1.5,
      alignItems: 'center', justifyContent: 'center',
    },
    friendInits: { fontFamily: 'Inter_900Black', fontSize: 16, letterSpacing: -0.3 },
    friendName:  { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: DIM, textAlign: 'center', width: 70 },
    friendAddBtn: {
      width: 58, height: 58, borderRadius: 29,
      borderWidth: 1.5, borderColor: BDR, borderStyle: 'dashed',
      backgroundColor: rgbaFromHex(SURFA, 0.6),
      alignItems: 'center', justifyContent: 'center',
    },
    emptyCircleCard: {
      minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 13,
      paddingHorizontal: 15, paddingVertical: 14, borderRadius: 20,
      borderWidth: 1, borderColor: BDRS, overflow: 'hidden',
      backgroundColor: rgbaFromHex(SURF, 0.96),
    },
    emptyCircleIcon: {
      width: 44, height: 44, borderRadius: 15, flexShrink: 0,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: rgbaFromHex(GOLD, 0.28),
      backgroundColor: rgbaFromHex(GOLDM, 0.09),
    },
    emptyCircleCopy: { flex: 1, minWidth: 0, gap: 5 },
    friendEmptyTitle: { fontFamily: 'Inter_900Black', fontSize: 14, color: TXT, letterSpacing: -0.2 },
    friendEmptyTxt: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, color: DIM },

    /* Activity feed */
    actCard: {
      borderRadius: 16, borderWidth: 1, borderColor: BDRS,
      backgroundColor: rgbaFromHex(SURF, 0.96), overflow: 'hidden',
    },
    actRow:       { flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 13, alignItems: 'flex-start' },
    actRowBorder: { borderBottomWidth: 1, borderBottomColor: BDR },
    actIconWrap: {
      width: 36, height: 36, borderRadius: 12,
      borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    actBody: { flex: 1, gap: 3 },
    actMain: { fontFamily: 'Inter_400Regular', fontSize: 13, color: TXT, lineHeight: 18 },
    actBold: { fontFamily: 'Inter_900Black', fontSize: 13, color: TXT },
    actTime: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, letterSpacing: 0.3 },

    /* Quick action tiles */
    quickGrid: { gap: 12 },
    quickRow: { flexDirection: 'row', gap: 12 },
    quickTile: {
      flex: 1, minHeight: layout.isTablet ? 154 : 134, padding: 15,
    } as ViewStyle,
    quickTileWide: {
      minHeight: layout.isTablet ? 118 : 100,
      flexDirection: 'row', alignItems: 'center', gap: 13,
      paddingVertical: 15, paddingHorizontal: 16,
    } as ViewStyle,
    quickTileWideCopy: { flex: 1, minWidth: 0 },
    quickTileArrow: { marginLeft: 'auto' },
    tileBadge:    { position: 'absolute', top: 12, right: 12, borderRadius: 999, backgroundColor: rgbaFromHex(GOLDM, 0.15), borderWidth: 1, borderColor: rgbaFromHex(GOLDM, 0.3), paddingHorizontal: 8, paddingVertical: 3 },
    tileBadgeTxt: { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: GOLD },
    tileIcon:     { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    tileIconWide: { width: 42, height: 42, borderRadius: 14, marginBottom: 0, flexShrink: 0 },
    tileLbl:      { fontFamily: 'Inter_900Black', fontSize: 17, color: TXT, letterSpacing: -0.4 },
    tileLblWide:  { fontSize: 18 },
    tileSub:      { fontFamily: 'Inter_400Regular', fontSize: 10.5, color: DIM, lineHeight: 15, marginTop: 4 },
  });
}
