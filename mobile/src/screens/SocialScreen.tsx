import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, ViewStyle, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import {
  getDashboardData, getFriends, getLeaderboard,
  getQuizBattles, getChallenges,
} from '../services/api';
import HapticTouchable from '../components/HapticTouchable';
import TileGleam from '../components/TileGleam';
import { CB_ACCENT, CB_CARD_TOP, cbPlainCardShadow } from '../components/NeumorphicTexture';
import SocialTileMaterial from '../components/SocialTileMaterial';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FriendsScreen       from './social/FriendsScreen';
import QuizPlaylistScreen  from './social/QuizPlaylistScreen';
import PlaylistsScreen     from './social/PlaylistsScreen';
import LearningPathsScreen from './social/LearningPathsScreen';
import SharedWithMeScreen  from './SharedWithMeScreen';
import CircleBackground from '../components/CircleBackground';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, lightenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Section = 'friends' | 'quiz' | 'playlists' | 'paths' | 'shared';
type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

type HubData = {
  level: number;
  experience: number;
  xpToNext: number;
  nextLevelXp: number;
  friendCount: number;
  myRank: number | null;
  activeBattles: number;
  challengeCount: number;
  topBoard: any[];
};
type Props = { user: AuthUser; onOpenLeaderboard?: () => void };

function inits(name: string): string {
  return (name || '?').replace(/_/g, ' ').split(' ').map((p: string) => p[0] ?? '').join('').slice(0, 2).toUpperCase();
}
function dname(e: any): string { return e?.username ?? e?.name ?? e?.friend_username ?? '?'; }
function dscore(e: any): number { return e?.score ?? e?.total_points ?? e?.points ?? 0; }
function dpicture(e: any): string | undefined { return e?.picture_url || e?.picture || e?.photo_url || undefined; }

// ─── Neumorphic surface ────────────────────────────────────────────────────
// TileGleam clips its own gleam sweep with overflow:hidden AND sets its own
// boxShadow on that same clipped node -- a shadow can't survive being cast by
// a node that also clips its own bounds, and TileGleam's inline style object
// is applied *after* whatever we pass in, so any boxShadow we set gets
// silently overridden too. Splitting this into an outer unclipped shadow
// layer + an inner clipped content layer is what actually makes the shadow
// render. Just a single plain dark cast shadow, no counter-highlight/glow --
// matches this codebase's own cbPlainCardShadow(), which already settled on
// "no light-corner counter-shadow" reading as depth better than a glow does
// on a phone screen. Both the modern `boxShadow` array and the legacy
// shadow*/elevation properties (the only thing Android's classic renderer
// honors) are set, so the depth doesn't depend on one single mechanism.
function neuOuterShadow(radius: number): ViewStyle {
  return {
    borderRadius: radius,
    backgroundColor: CB_CARD_TOP,
    shadowColor: '#000000',
    shadowOffset: { width: 8, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
    boxShadow: cbPlainCardShadow(),
  } as ViewStyle;
}

function NeuCard({
  children, onPress, radius = 24, outerStyle, contentStyle, haptic = 'light', accent = false,
}: {
  children: React.ReactNode; onPress?: () => void; radius?: number;
  outerStyle?: ViewStyle | ViewStyle[]; contentStyle?: ViewStyle | ViewStyle[];
  haptic?: 'light' | 'medium' | 'none';
  /** Solid accent-gold fill instead of the dark cb-tile material, for the one hero card that should pop. */
  accent?: boolean;
}) {
  const { selectedTheme } = useAppTheme();
  return (
    <View style={[neuOuterShadow(radius), accent && { backgroundColor: selectedTheme.accent }, outerStyle]}>
      <TileGleam onPress={onPress} haptic={haptic} borderRadius={radius} activeOpacity={0.9} style={contentStyle}>
        {accent ? (
          <LinearGradient
            colors={[selectedTheme.accentHover, selectedTheme.accent]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        ) : (
          <SocialTileMaterial />
        )}
        {children}
      </TileGleam>
    </View>
  );
}

// ─── Bento tile — one module, reused for every social destination so the
// grid reads as a single disciplined system rather than one-off shapes. ───

function BentoTile({
  icon, title, subtitle, onPress, style, iconSize = 20,
}: {
  icon: IoniconsName; title: string; subtitle: string;
  onPress: () => void; style: ViewStyle | ViewStyle[]; iconSize?: number;
}) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  return (
    <NeuCard onPress={onPress} radius={22} outerStyle={style} contentStyle={s.bentoTile}>
      <View style={s.bentoIconWrap}>
        <Ionicons name={icon} size={iconSize} color={CB_ACCENT} />
      </View>
      <View>
        <Text style={s.bentoTitle} numberOfLines={1}>{title}</Text>
        <Text style={s.bentoSubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
    </NeuCard>
  );
}

// ─── Rank avatar — real profile picture when the leaderboard entry has one,
// gold/silver/bronze ring for the top 3, plain accent ring past that. ───────

function RankAvatar({ rank, name, picture, size = 46 }: { rank: number; name: string; picture?: string; size?: number }) {
  const { selectedTheme } = useAppTheme();
  const ringColor = rank === 1 ? selectedTheme.accentHover
    : rank === 2 ? lightenColor(selectedTheme.accent, selectedTheme.isLight ? 26 : 12)
    : rank === 3 ? darkenColor(selectedTheme.accent, selectedTheme.isLight ? 14 : 8)
    : rgbaFromHex(selectedTheme.accentHover, 0.35);
  const ringDark = darkenColor(selectedTheme.accent, selectedTheme.isLight ? 12 : 26);
  return (
    <LinearGradient
      colors={[ringColor, ringDark]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, padding: 2.5, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{
        width: size, height: size, borderRadius: size / 2, overflow: 'hidden',
        alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(selectedTheme.panelAlt, 0.98),
      }}>
        {picture
          ? <Image source={{ uri: picture }} style={{ width: size, height: size }} resizeMode="cover" />
          : <Text style={{ fontFamily: 'Inter_900Black', fontSize: size * 0.34, color: selectedTheme.accentHover }}>{inits(name)}</Text>}
      </View>
    </LinearGradient>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function SocialScreen({ user, onOpenLeaderboard }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Section | null>(null);
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [dash, friends, globalLb, battles, challenges] = await Promise.allSettled([
        getDashboardData(user.username),
        getFriends(user.username),
        getLeaderboard('global', 3),
        getQuizBattles(user.username),
        getChallenges(user.username),
      ]);
      const dv  = dash.status      === 'fulfilled' ? dash.value      : null;
      const fr  = friends.status   === 'fulfilled' ? friends.value   : null;
      const glv = globalLb.status  === 'fulfilled' ? globalLb.value  : null;
      const btv = battles.status   === 'fulfilled' ? battles.value   : null;
      const chv = challenges.status === 'fulfilled' ? challenges.value : null;

      const gam        = dv?.gamification ?? {};
      const friendList = Array.isArray(fr) ? fr : fr?.friends ?? [];
      const topBoard   = glv?.leaderboard ?? [];
      const battleList = btv?.battles ?? (Array.isArray(btv) ? btv : []);
      const chalList   = chv?.challenges ?? (Array.isArray(chv) ? chv : []);
      const rankEntry  = glv?.current_user_rank ?? topBoard.find((e: any) => e.is_current_user);

      setData({
        level:          gam.level ?? 1,
        experience:     gam.experience ?? 0,
        xpToNext:       Math.max(0, gam.xp_to_next_level ?? 0),
        nextLevelXp:    Math.max(1, gam.next_level_xp ?? 1),
        friendCount:    friendList.length,
        myRank:         rankEntry?.rank ?? null,
        activeBattles:  battleList.filter((b: any) => b.status === 'active').length,
        challengeCount: chalList.length,
        topBoard:       topBoard.slice(0, 3),
      });
    } catch {
      setData({
        level: 1, experience: 0, xpToNext: 0, nextLevelXp: 1,
        friendCount: 0, myRank: null,
        activeBattles: 0, challengeCount: 0, topBoard: [],
      });
    } finally {
      setLoading(false);
    }
  }, [user.username]);

  useEffect(() => { load(); }, [load]);
  if (!fontsLoaded) return null;

  if (screen === 'friends')  return <FriendsScreen       user={user} onBack={() => setScreen(null)} />;
  if (screen === 'quiz')     return <QuizPlaylistScreen  user={user} onBack={() => setScreen(null)} />;
  if (screen === 'playlists')return <PlaylistsScreen     user={user} onBack={() => setScreen(null)} />;
  if (screen === 'paths')    return <LearningPathsScreen user={user} onBack={() => setScreen(null)} />;
  if (screen === 'shared')   return <SharedWithMeScreen  user={user} onBack={() => setScreen(null)} />;

  const levelProgress = data ? Math.max(0.03, Math.min(1, data.experience / data.nextLevelXp)) : 0.03;
  // Dark ink on the gold hero card -- same on-accent contrast rule used for the send button elsewhere in the app.
  const onAccent = selectedTheme.isLight ? darkenColor(selectedTheme.accent, 34) : selectedTheme.bgPrimary;

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <CircleBackground />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]}>

        {/* ══ HEADER ══ */}
        <View style={s.topBar}>
          <Text style={s.brand}>social</Text>
          <View style={s.titleRule} />
        </View>

        {loading || !data ? (
          <View style={s.loadingWrap}><ActivityIndicator color={selectedTheme.accent} size="large" /></View>
        ) : (
          <>
            {/* ══ LEVEL / XP ══ */}
            <NeuCard onPress={onOpenLeaderboard} radius={26} contentStyle={s.levelCard} accent>
              <View style={s.levelBigRow}>
                <Text style={[s.levelBigNumber, { color: onAccent }]}>{data.level}</Text>
                <Text style={[s.levelBigLabel, { color: rgbaFromHex(onAccent, 0.7) }]}>level</Text>
              </View>
              <View style={[s.levelBarTrack, { backgroundColor: rgbaFromHex(onAccent, 0.18) }]}>
                <View style={[s.levelBarFill, { width: `${levelProgress * 100}%`, backgroundColor: onAccent }]} />
              </View>
              <View style={s.levelBarCaption}>
                <Text style={[s.levelBarCaptionText, { color: rgbaFromHex(onAccent, 0.75) }]}>{data.experience.toLocaleString()} xp</Text>
                <Text style={[s.levelBarCaptionText, { color: rgbaFromHex(onAccent, 0.75) }]}>
                  {data.xpToNext > 0 ? `${data.xpToNext.toLocaleString()} xp to level ${data.level + 1}` : 'max level'}
                </Text>
              </View>
            </NeuCard>

            {/* ══ BENTO — one continuous grid: top-3 leaderboard is a tile
                like everything else, not a separate section. ══ */}
            <View style={s.bentoGrid}>
              <NeuCard onPress={onOpenLeaderboard} radius={22} contentStyle={s.lbTile}>
                <View style={s.lbTileHead}>
                  <Ionicons name="trophy" size={16} color={CB_ACCENT} />
                  <Text style={s.lbTileTitle}>top climbers</Text>
                  <View style={{ flex: 1 }} />
                  <Ionicons name="chevron-forward" size={14} color={CB_ACCENT} />
                </View>
                {data.topBoard.length === 0 ? (
                  <View style={s.lbEmpty}>
                    <Ionicons name="people-outline" size={22} color={selectedTheme.textSecondary} />
                    <Text style={s.lbEmptyText}>be the first to earn XP</Text>
                  </View>
                ) : (
                  <View style={s.lbPodiumRow}>
                    {data.topBoard.map((entry: any, i: number) => (
                      <View key={entry.id ?? entry.user_id ?? i} style={s.lbPodiumCol}>
                        <RankAvatar rank={i + 1} name={dname(entry)} picture={dpicture(entry)} />
                        <Text style={s.lbPodiumName} numberOfLines={1}>
                          {entry.is_current_user ? 'you' : dname(entry)}
                        </Text>
                        <Text style={s.lbPodiumScore}>{dscore(entry).toLocaleString()} xp</Text>
                      </View>
                    ))}
                  </View>
                )}
                {data.myRank && data.myRank > 3 ? (
                  <View style={s.lbFooter}>
                    <Text style={s.lbFooterText}>you're #{data.myRank} globally</Text>
                  </View>
                ) : null}
              </NeuCard>

              <BentoTile
                icon="people-outline" iconSize={24}
                title="your circle" subtitle={`${data.friendCount} ${data.friendCount === 1 ? 'friend' : 'friends'}`}
                onPress={() => setScreen('friends')} style={s.bentoWide}
              />
              <BentoTile
                icon="library-outline" iconSize={24}
                title="quiz hub" subtitle="solo or 1v1"
                onPress={() => setScreen('quiz')} style={s.bentoWide}
              />
              <View style={s.bentoRow}>
                <BentoTile
                  icon="bookmark-outline"
                  title="playlists" subtitle="what your circle studies"
                  onPress={() => setScreen('playlists')} style={s.bentoSquare}
                />
                <BentoTile
                  icon="map-outline"
                  title="learning paths" subtitle="journeys together"
                  onPress={() => setScreen('paths')} style={s.bentoSquare}
                />
              </View>
              <BentoTile
                icon="share-social-outline"
                title="shared with me" subtitle="notes and chats friends sent you"
                onPress={() => setScreen('shared')} style={s.bentoWideShort}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const DIM   = theme.textSecondary;
  const TXT   = theme.textPrimary;
  const BORDER = 'rgba(216,179,141,0.22)';
  const PAD   = 8;

  return StyleSheet.create({
    root:   { flex: 1, backgroundColor: theme.bgPrimary },
    scroll: {
      paddingHorizontal: PAD, paddingTop: 14, gap: 24,
      maxWidth: layout.contentMaxWidth, alignSelf: 'center', width: '100%',
    },

    /* Header — plain title + a rule filling the rest of the row, same pattern as the explore tab. */
    topBar: {
      height: 60, flexDirection: 'row', alignItems: 'center', gap: 14,
    },
    // Matches the explore tab's title exactly: same size/color/tracking.
    brand: {
      fontFamily: 'Inter_900Black', fontSize: 38,
      color: CB_ACCENT, letterSpacing: -1.6,
    },
    titleRule: { flex: 1, height: 1, backgroundColor: BORDER, marginTop: 6 },
    loadingWrap: { paddingTop: 80, alignItems: 'center' },

    /* Level / XP hero — one oversized Swiss numeral, one progress bar. */
    levelCard: { minHeight: 150, padding: 20, justifyContent: 'center' } as ViewStyle,
    levelBigRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 9 },
    levelBigNumber: {
      fontFamily: 'Inter_900Black', fontSize: 72, lineHeight: 64,
      color: CB_ACCENT, letterSpacing: -3.5,
    },
    levelBigLabel: {
      fontFamily: 'Inter_600SemiBold', fontSize: 12, color: DIM,
      textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
    },
    levelBarTrack: {
      marginTop: 18, height: 8, borderRadius: 4, overflow: 'hidden',
      backgroundColor: rgbaFromHex(CB_ACCENT, 0.14),
    },
    levelBarFill: { height: '100%', borderRadius: 4, backgroundColor: CB_ACCENT },
    levelBarCaption: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
    levelBarCaptionText: { fontFamily: 'Inter_600SemiBold', fontSize: 10.5, color: DIM },

    /* Top-3 leaderboard tile — a bento tile like every other destination,
       not a separately-styled section. */
    lbTile: { padding: 16, gap: 14 } as ViewStyle,
    lbTileHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    lbTileTitle: {
      fontFamily: 'Inter_700Bold', fontSize: 11, color: TXT,
      textTransform: 'uppercase', letterSpacing: 0.6,
    },
    lbEmpty: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14 },
    lbEmptyText: { fontFamily: 'Inter_400Regular', fontSize: 11.5, color: DIM, textAlign: 'center' },
    lbPodiumRow: { flexDirection: 'row', justifyContent: 'space-around' },
    lbPodiumCol: { alignItems: 'center', gap: 5, maxWidth: 96 },
    lbPodiumName: { fontFamily: 'Inter_600SemiBold', fontSize: 11.5, color: TXT },
    lbPodiumScore: { fontFamily: 'Inter_700Bold', fontSize: 10.5, color: CB_ACCENT },
    lbFooter: {
      paddingTop: 12, borderTopWidth: 1, borderTopColor: rgbaFromHex(CB_ACCENT, 0.12),
      flexDirection: 'row', alignItems: 'center', gap: 6,
    },
    lbFooterText: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM },

    /* Bento grid — one tile module reused at four sizes. Content sits
       bottom-anchored so taller cells keep breathing room above it instead
       of stretching the icon/label block to fill the whole card. */
    bentoGrid: { gap: 14 },
    bentoRow: { flexDirection: 'row', gap: 14 },
    bentoTile: { flex: 1, padding: 16, justifyContent: 'flex-end', gap: 10 } as ViewStyle,
    bentoWide: { minHeight: 96 },
    bentoWideShort: { minHeight: 84 },
    bentoSquare: { flex: 1, minHeight: 132 },
    bentoIconWrap: {
      width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: rgbaFromHex(CB_ACCENT, 0.24), backgroundColor: rgbaFromHex(CB_ACCENT, 0.08),
    },
    bentoTitle: { fontFamily: 'Inter_900Black', fontSize: 15, color: TXT, letterSpacing: -0.3 },
    bentoSubtitle: { marginTop: 2, fontFamily: 'Inter_400Regular', fontSize: 10.5, color: DIM },
  });
}
