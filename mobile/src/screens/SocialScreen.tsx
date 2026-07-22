import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import {
  getFriends, getFriendRequests, getLeaderboard,
  getQuizBattles, getChallenges, getFriendActivityFeed,
} from '../services/api';
import HapticTouchable from '../components/HapticTouchable';
import TileGleam from '../components/TileGleam';
import NeumorphicTexture, { cbTileCardGradient } from '../components/NeumorphicTexture';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FriendsScreen       from './social/FriendsScreen';
import GamesScreen         from './social/GamesScreen';
import QuizPlaylistScreen  from './social/QuizPlaylistScreen';
import SoloQuizScreen      from './social/SoloQuizScreen';
import PlaylistsScreen     from './social/PlaylistsScreen';
import LearningPathsScreen from './social/LearningPathsScreen';
import GeoBackground from '../components/GeoBackground';
import { useAppTheme } from '../contexts/ThemeContext';
import { rgbaFromHex, darkenColor, lightenColor } from '../utils/theme';
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

function Tile({ icon, label, sub, badge, onPress, accent, s }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string; sub: string; badge?: string;
  onPress: () => void; accent: string;
  s: ReturnType<typeof createStyles>;
}) {
  return (
    <TileGleam style={s.tile} onPress={onPress}>
      <NeumorphicTexture
        grainVariant="skia"
        grainOpacity={0.44}
        baseFrequency={0.7}
        gradientColors={cbTileCardGradient.colors}
        gradientStart={cbTileCardGradient.start}
        gradientEnd={cbTileCardGradient.end}
      />
      {badge && (
        <View style={s.tileBadge}><Text style={s.tileBadgeTxt}>{badge}</Text></View>
      )}
      <View style={[s.tileIcon, { borderColor: rgbaFromHex(accent, 0.35), backgroundColor: rgbaFromHex(accent, 0.1) }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <Text style={s.tileLbl}>{label}</Text>
      <Text style={s.tileSub}>{sub}</Text>
    </TileGleam>
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
  if (!fontsLoaded) return null;

  if (screen === 'friends')     return <FriendsScreen       user={user} onBack={() => setScreen(null)} />;
  if (screen === 'games')       return <GamesScreen         user={user} onBack={() => setScreen(null)} />;
  if (screen === 'quiz')        return <QuizPlaylistScreen  user={user} onBack={() => setScreen(null)} />;
  if (screen === 'solo')        return <SoloQuizScreen      user={user} onBack={() => setScreen(null)} />;
  if (screen === 'playlists')   return <PlaylistsScreen     user={user} onBack={() => setScreen(null)} />;
  if (screen === 'paths')       return <LearningPathsScreen user={user} onBack={() => setScreen(null)} />;

  // Podium order: 2nd | 1st | 3rd — always 3 columns, null = empty slot
  const top3 = data?.lbEntries.slice(0, 3) ?? [];
  const podium: (any | null)[] = [top3[1] ?? null, top3[0] ?? null, top3[2] ?? null];

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]}>

        {/* ══ HEADER ══ */}
        <View style={s.header}>
          <Text style={s.title}>social</Text>
        </View>

        {loading || !data ? (
          <View style={s.loadingWrap}><ActivityIndicator color={accentM} size="large" /></View>
        ) : (
          <>
            {/* ══ IDENTITY STRIP — rank · friends · battles ══ */}
            <LinearGradient
              colors={[rgbaFromHex(accent, 0.2), rgbaFromHex(accentM, 0.08), rgbaFromHex(selectedTheme.panel, 0.97)]}
              locations={[0, 0.4, 1]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.identityCard}
            >
              <View style={s.identityStat}>
                <Text style={s.identityVal}>{data.myRank ? `#${data.myRank}` : '—'}</Text>
                <Text style={s.identityLbl}>global rank</Text>
              </View>
              <View style={s.identityDiv} />
              <View style={s.identityStat}>
                <Text style={s.identityVal}>{data.friendCount}</Text>
                <Text style={s.identityLbl}>friends</Text>
              </View>
              <View style={s.identityDiv} />
              <View style={s.identityStat}>
                <Text style={[s.identityVal, data.activeBattles > 0 && { color: accent }]}>
                  {data.activeBattles}
                </Text>
                <Text style={s.identityLbl}>live battles</Text>
              </View>
            </LinearGradient>

            {/* ══ FRIENDS SCROLL ══ */}
            <SectionRow label="friends" badge={data.requestCount} badgeDanger cta={() => setScreen('friends')} ctaLabel="manage" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.friendsRow}>
              {/* Add button always first */}
              <HapticTouchable style={s.friendItem} onPress={() => setScreen('friends')} haptic="light" activeOpacity={0.8}>
                <View style={s.friendAddBtn}>
                  <Ionicons name="person-add-outline" size={17} color={selectedTheme.textSecondary} />
                </View>
                <Text style={s.friendName}>add</Text>
              </HapticTouchable>
              {data.friendList.length === 0 && (
                <View style={s.friendEmpty}>
                  <Text style={s.friendEmptyTxt}>no friends yet</Text>
                </View>
              )}
              {data.friendList.map((f: any, fi: number) => {
                const fname = f.username ?? f.friend_username ?? f.name ?? `user${fi}`;
                const col   = [accent, accentM, selectedTheme.textPrimary][fi % 3];
                return (
                  <HapticTouchable key={fi} style={s.friendItem} onPress={() => setScreen('friends')} haptic="light" activeOpacity={0.8}>
                    <LinearGradient
                      colors={[rgbaFromHex(col, 0.32), rgbaFromHex(col, 0.08)]}
                      style={[s.friendAvatar, { borderColor: rgbaFromHex(col, 0.5) }]}
                    >
                      <Text style={[s.friendInits, { color: col }]}>{inits(fname)}</Text>
                    </LinearGradient>
                    <Text style={s.friendName} numberOfLines={1}>{fname}</Text>
                  </HapticTouchable>
                );
              })}
            </ScrollView>

            {/* ══ ACTIVITY FEED ══ */}
            {data.recentActivity.length > 0 && (
              <>
                <SectionRow label="activity" />
                <View style={s.actCard}>
                  <LinearGradient
                    colors={[rgbaFromHex(accentM, 0.06), 'transparent']}
                    style={[StyleSheet.absoluteFillObject, { borderRadius: 16 }]}
                  />
                  {data.recentActivity.map((item: any, ai: number) => {
                    const type  = String(item?.activity_type ?? item?.type ?? '').toLowerCase();
                    const icon  = actIcon(type);
                    const verb  = actVerb(type);
                    const actor = item?.username ?? item?.user_username ?? item?.friend_username ?? 'someone';
                    const subj  = item?.title ?? item?.subject ?? item?.topic ?? '';
                    const time  = timeAgo(item?.created_at ?? item?.timestamp ?? '');
                    const tc    = type.includes('quiz') ? accent : type.includes('flash') ? accentM : selectedTheme.textSecondary;
                    const isLast = ai === data.recentActivity.length - 1;
                    return (
                      <View key={ai} style={[s.actRow, !isLast && s.actRowBorder]}>
                        <LinearGradient
                          colors={[rgbaFromHex(tc, 0.24), rgbaFromHex(tc, 0.07)]}
                          style={[s.actIconWrap, { borderColor: rgbaFromHex(tc, 0.38) }]}
                        >
                          <Ionicons name={icon} size={14} color={tc} />
                        </LinearGradient>
                        <View style={s.actBody}>
                          <Text style={s.actMain} numberOfLines={2}>
                            <Text style={s.actBold}>{actor}</Text>
                            {` ${verb}`}
                            {subj ? <Text style={{ color: accent }}>{` · ${subj}`}</Text> : null}
                          </Text>
                          {time ? <Text style={s.actTime}>{time}</Text> : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {/* ══ EXPLORE TILES ══ */}
            <SectionRow label="explore" />
            {(() => {
              const cols = layout.twoColumn ? 3 : 2;
              const tiles = [
                { icon: 'flash'    as const, label: 'battles',   sub: data.activeBattles > 0 ? `${data.activeBattles} live` : 'challenge friends', badge: data.pendingBattles > 0 ? String(data.pendingBattles) : undefined, sec: 'games'     as Section },
                { icon: 'library'  as const, label: 'quiz hub',  sub: `${data.challengeCount} challenges`,                                          sec: 'quiz'      as Section },
                { icon: 'sparkles' as const, label: 'solo quiz', sub: 'practice at your pace',                                                       sec: 'solo'      as Section },
                { icon: 'bookmark' as const, label: 'playlists', sub: 'discover & follow',                                                           sec: 'playlists' as Section },
                { icon: 'map'      as const, label: 'paths',     sub: 'AI learning journeys',                                                        sec: 'paths'     as Section },
              ];
              const rows: typeof tiles[] = [];
              for (let i = 0; i < tiles.length; i += cols) rows.push(tiles.slice(i, i + cols));
              return rows.map((row, ri) => (
                <View key={ri} style={s.tileRow}>
                  {row.map(t => (
                    <Tile key={t.label} icon={t.icon} label={t.label} sub={t.sub} badge={t.badge}
                      onPress={() => setScreen(t.sec)} accent={accent} s={s} />
                  ))}
                </View>
              ));
            })()}

            {/* ══ LEADERBOARD PODIUM — same design as leaderboard page ══ */}
            <SectionRow label="leaderboard" cta={onOpenLeaderboard} ctaLabel="full board" />
            <View style={s.podiumCard}>
              <LinearGradient
                colors={[rgbaFromHex(accent, 0.08), rgbaFromHex(selectedTheme.bgPrimary, 0)]}
                style={[StyleSheet.absoluteFillObject, { borderRadius: 16 }]}
              />
              <View style={s.podiumRow}>
                {podium.map((entry, pi) => {
                  const rankNum   = pi === 0 ? 2 : pi === 1 ? 1 : 3;
                  const isGold    = rankNum === 1;
                  const isEmpty   = !entry;
                  const name      = isEmpty ? '—' : (entry.username ?? entry.name ?? '?');
                  const pts       = isEmpty ? 0 : (entry.score ?? entry.total_points ?? entry.points ?? 0);
                  const isMe      = !isEmpty && (entry.is_current_user || name === user.username);
                  const ringColor = rankNum === 1
                    ? accent
                    : rankNum === 2
                    ? lightenColor(accentM, selectedTheme.isLight ? 26 : 12)
                    : darkenColor(accentM, selectedTheme.isLight ? 14 : 8);
                  const barH    = rankNum === 1 ? 72 : rankNum === 2 ? 52 : 38;
                  const avaSize = rankNum === 1 ? 56 : rankNum === 2 ? 46 : 40;
                  const label   = rankNum === 1 ? '1st' : rankNum === 2 ? '2nd' : '3rd';

                  return (
                    <View key={pi} style={s.podiumCol}>
                      {isGold && (
                        <Ionicons name="trophy" size={16} color={isEmpty ? selectedTheme.textSecondary : ringColor} style={{ marginBottom: 6 }} />
                      )}

                      {isEmpty ? (
                        <View style={[s.podEmptyAvatar, { width: avaSize + 4, height: avaSize + 4, borderRadius: (avaSize + 4) / 2 }]}>
                          <Ionicons name="person-outline" size={avaSize * 0.38} color={selectedTheme.textSecondary} />
                        </View>
                      ) : (
                        <LinearGradient
                          colors={[ringColor, darkenColor(ringColor, selectedTheme.isLight ? 18 : 10)]}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                          style={{ width: avaSize + 4, height: avaSize + 4, borderRadius: (avaSize + 4) / 2, padding: 2.5, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <LinearGradient
                            colors={[rgbaFromHex(selectedTheme.panelAlt, 0.98), rgbaFromHex(selectedTheme.bgPrimary, 0.98)]}
                            style={{ width: avaSize, height: avaSize, borderRadius: avaSize / 2, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Text style={{ fontFamily: 'Inter_900Black', fontSize: avaSize * 0.33, color: ringColor }}>
                              {inits(name)}
                            </Text>
                          </LinearGradient>
                        </LinearGradient>
                      )}

                      <View style={[s.medalBadge, {
                        borderColor: rgbaFromHex(isEmpty ? selectedTheme.textSecondary : ringColor, isEmpty ? 0.2 : 0.44),
                        backgroundColor: rgbaFromHex(isEmpty ? selectedTheme.textSecondary : ringColor, isEmpty ? 0.05 : 0.12),
                      }]}>
                        <Text style={[s.medalTxt, { color: isEmpty ? selectedTheme.textSecondary : ringColor }]}>{label}</Text>
                      </View>

                      <Text style={[s.podName, { color: isEmpty ? selectedTheme.textSecondary : isGold ? accent : isMe ? accent : selectedTheme.textPrimary }]} numberOfLines={1}>
                        {name}
                      </Text>
                      {!isEmpty && <Text style={s.podPts}>{pts.toLocaleString()}</Text>}

                      <LinearGradient
                        colors={isEmpty
                          ? [rgbaFromHex(selectedTheme.textSecondary, 0.1), rgbaFromHex(selectedTheme.textSecondary, 0.03)]
                          : [accent, rgbaFromHex(accentM, 0.35)]}
                        style={[s.podBar, { height: barH, borderTopColor: isEmpty ? rgbaFromHex(selectedTheme.textSecondary, 0.15) : accent }]}
                      />
                    </View>
                  );
                })}
              </View>

              {data.lbEntries.slice(3).map((entry: any, ei: number) => {
                const rank  = entry.rank ?? ei + 4;
                const name  = entry.username ?? entry.name ?? `#${rank}`;
                const pts   = entry.score ?? entry.total_points ?? entry.points ?? 0;
                const isMe  = entry.is_current_user || name === user.username;
                const maxPts = (data.lbEntries[0]?.score ?? data.lbEntries[0]?.total_points ?? 1);
                const pct   = Math.max(0.04, Math.min(1, pts / maxPts));
                return (
                  <View key={ei} style={[s.lbRow, isMe && s.lbRowMe]}>
                    {isMe && <LinearGradient colors={[rgbaFromHex(accentM, 0.12), 'transparent']} style={[StyleSheet.absoluteFillObject, { borderRadius: 13 }]} />}
                    <Text style={[s.lbRank, isMe && { color: accent }]}>{rank <= 9 ? `0${rank}` : rank}</Text>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[s.lbName, isMe && { color: accent }]} numberOfLines={1}>{name}{isMe ? '  (you)' : ''}</Text>
                      <View style={s.lbTrack}>
                        <LinearGradient
                          colors={isMe ? [accent, accentM] : [rgbaFromHex(accentM, 0.42), rgbaFromHex(accentM, 0.14)]}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                          style={[s.lbFill, { width: `${Math.round(pct * 100)}%` as any }]}
                        />
                      </View>
                    </View>
                    <Text style={[s.lbPts, isMe && { color: accent, fontFamily: 'Inter_900Black' }]}>
                      {pts >= 1000 ? `${(pts / 1000).toFixed(1)}k` : pts}
                    </Text>
                  </View>
                );
              })}
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
  const PAD    = layout.isTablet ? layout.screenPadding : 12;

  return StyleSheet.create({
    root:   { flex: 1, backgroundColor: BG },
    scroll: {
      paddingHorizontal: PAD, paddingTop: 18, gap: 14,
      maxWidth: layout.contentMaxWidth, alignSelf: 'center', width: '100%',
    },

    /* Header */
    header: { marginHorizontal: -PAD, paddingHorizontal: PAD - 4 },
    title:    { fontFamily: 'Inter_900Black', fontSize: layout.isTablet ? 36 : 30, color: GOLD, letterSpacing: -0.8 },
    loadingWrap: { paddingTop: 80, alignItems: 'center' },

    /* Identity strip */
    identityCard: {
      flexDirection: 'row', borderRadius: 16, borderWidth: 1, borderColor: BDRS,
      paddingVertical: 20, paddingHorizontal: 16, overflow: 'hidden',
    },
    identityStat:  { flex: 1, alignItems: 'center', gap: 4 },
    identityVal:   { fontFamily: 'Inter_900Black', fontSize: 28, color: GOLD, letterSpacing: -1 },
    identityLbl:   { fontFamily: 'Inter_400Regular', fontSize: 9, color: DIM, letterSpacing: 1.5, textTransform: 'uppercase' },
    identityDiv:   { width: 1, backgroundColor: BDR, marginVertical: 6 },

    /* Section row header */
    sectionRow:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionLbl:         { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: DIM, letterSpacing: 2, textTransform: 'uppercase' },
    sectionBadge:       { borderRadius: 999, backgroundColor: rgbaFromHex(GOLDM, 0.15), borderWidth: 1, borderColor: rgbaFromHex(GOLDM, 0.3), paddingHorizontal: 7, paddingVertical: 2 },
    sectionBadgeTxt:    { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: GOLD },
    sectionBadgeDanger: { backgroundColor: rgbaFromHex(theme.danger, 0.15), borderColor: rgbaFromHex(theme.danger, 0.35) },
    sectionBadgeDangerTxt: { color: theme.danger },
    seeAll:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
    seeAllTxt: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: GOLD },

    /* Podium card — mirrors LeaderboardScreen pod styles */
    podiumCard: {
      borderRadius: 16, overflow: 'hidden', position: 'relative',
      paddingTop: 16, gap: 0,
      backgroundColor: rgbaFromHex(SURF, 0.96),
      borderWidth: 1, borderColor: BDRS,
    },
    podiumRow:    { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 4 },
    podiumCol:    { flex: 1, alignItems: 'center', gap: 0 },
    podEmptyAvatar: {
      borderWidth: 1.5, borderStyle: 'dashed',
      borderColor: rgbaFromHex(DIM, 0.3),
      backgroundColor: rgbaFromHex(SURFA, 0.3),
      alignItems: 'center', justifyContent: 'center',
    },
    medalBadge:  { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, marginTop: 8, marginBottom: 4 },
    medalTxt:    { fontFamily: 'Inter_900Black', fontSize: 10 },
    podName:     { fontFamily: 'Inter_900Black', fontSize: 11, color: GOLD, textAlign: 'center', paddingHorizontal: 4 },
    podPts:      { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, marginBottom: 6, marginTop: 2 },
    podBar:      { width: '100%', borderTopWidth: 1.5, borderRadius: 4 },

    /* Below-podium rows — mirrors LeaderboardScreen row styles */
    lbRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: BDR, overflow: 'hidden', position: 'relative' },
    lbRowMe: { backgroundColor: rgbaFromHex(GOLDM, 0.07) },
    lbRank:  { fontFamily: 'Inter_900Black', fontSize: 13, color: DIM, width: 26, textAlign: 'center' },
    lbName:  { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: GOLD },
    lbTrack: { height: 3, backgroundColor: rgbaFromHex(GOLDM, 0.14), borderRadius: 2, overflow: 'hidden' },
    lbFill:  { height: '100%', borderRadius: 2 },
    lbPts:   { fontFamily: 'Inter_900Black', fontSize: 14, color: GOLDM },

    /* Friends horizontal scroll */
    friendsRow: { gap: 10, paddingVertical: 4 },
    friendItem:  { alignItems: 'center', gap: 5, width: 62 },
    friendAvatar: {
      width: 54, height: 54, borderRadius: 27, borderWidth: 2,
      alignItems: 'center', justifyContent: 'center',
    },
    friendInits: { fontFamily: 'Inter_900Black', fontSize: 16, letterSpacing: -0.3 },
    friendName:  { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, textAlign: 'center', width: 60 },
    friendAddBtn: {
      width: 54, height: 54, borderRadius: 27,
      borderWidth: 1.5, borderColor: BDR, borderStyle: 'dashed',
      backgroundColor: rgbaFromHex(SURFA, 0.6),
      alignItems: 'center', justifyContent: 'center',
    },
    friendEmpty:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16 },
    friendEmptyTxt: { fontFamily: 'Inter_400Regular', fontSize: 12, color: DIM },

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

    /* Explore tiles */
    tileRow: { flexDirection: 'row', gap: 12 },
    tile: {
      flex: 1, minHeight: layout.isTablet ? 155 : 136, padding: 16,
    } as ViewStyle,
    tileBadge:    { position: 'absolute', top: 12, right: 12, borderRadius: 999, backgroundColor: rgbaFromHex(GOLDM, 0.15), borderWidth: 1, borderColor: rgbaFromHex(GOLDM, 0.3), paddingHorizontal: 8, paddingVertical: 3 },
    tileBadgeTxt: { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: GOLD },
    tileIcon:     { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    tileLbl:      { fontFamily: 'Inter_900Black', fontSize: 18, color: GOLD, letterSpacing: -0.3 },
    tileSub:      { fontFamily: 'Inter_400Regular', fontSize: 12, color: DIM, lineHeight: 17, marginTop: 4 },
  });
}
