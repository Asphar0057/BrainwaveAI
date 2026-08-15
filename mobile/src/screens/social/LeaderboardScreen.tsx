import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../../services/auth';
import { getLeaderboard } from '../../services/api';
import HapticTouchable from '../../components/HapticTouchable';
import GeoBackground from '../../components/GeoBackground';
import { CB_ACCENT, CB_CARD_TOP, CB_CARD_BOTTOM, cbTileShadow, cbModalShadow, cbTileBorder } from '../../components/NeumorphicTexture';
import SocialTileMaterial from '../../components/SocialTileMaterial';
import { useAppTheme } from '../../contexts/ThemeContext';
import { darkenColor, lightenColor, rgbaFromHex } from '../../utils/theme';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

type MedalKey = 'gold' | 'silver' | 'bronze';

function getMedalRing(theme: ReturnType<typeof useAppTheme>['selectedTheme'], medal: MedalKey) {
  if (medal === 'gold')   return theme.accentHover;
  if (medal === 'silver') return lightenColor(theme.accent, theme.isLight ? 26 : 12);
  return darkenColor(theme.accent, theme.isLight ? 14 : 8);
}

function Avatar({ name, picture, size = 44, medal }: { name: string; picture?: string; size?: number; medal?: MedalKey }) {
  const { selectedTheme } = useAppTheme();
  const ACCENT_DARK = darkenColor(selectedTheme.accent, selectedTheme.isLight ? 12 : 26);
  const CARD = selectedTheme.panelAlt;
  const TEXT = selectedTheme.accentHover;
  const initials = (name || '?').split(/[\s_]/).map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const ringColor = medal ? getMedalRing(selectedTheme, medal) : selectedTheme.accent;
  return (
    <LinearGradient
      colors={[ringColor, ACCENT_DARK]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, padding: 2.5, alignItems: 'center', justifyContent: 'center' }}
    >
      <LinearGradient
        colors={[rgbaFromHex(CARD, 0.98), rgbaFromHex(selectedTheme.bgPrimary, 0.98)]}
        style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
      >
        {picture
          ? <Image source={{ uri: picture }} style={{ width: size, height: size }} resizeMode="cover" />
          : <Text style={{ fontFamily: 'Inter_900Black', fontSize: size * 0.33, color: TEXT }}>{initials}</Text>}
      </LinearGradient>
    </LinearGradient>
  );
}

type Props = { user: AuthUser; onBack: () => void };

export default function LeaderboardScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const s    = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const pod  = useMemo(() => createPodStyles(selectedTheme), [selectedTheme]);
  const row  = useMemo(() => createRowStyles(selectedTheme), [selectedTheme]);
  const empty = useMemo(() => createEmptyStyles(selectedTheme), [selectedTheme]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold });

  const [tab, setTab]               = useState<'global' | 'friends'>('global');
  const [boards, setBoards]         = useState<{ global: any[]; friends: any[] }>({ global: [], friends: [] });
  const [myRanks, setMyRanks]       = useState<{ global: any; friends: any }>({ global: null, friends: null });
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [gl, fr] = await Promise.all([
        getLeaderboard('global', 50),
        getLeaderboard('friends', 50),
      ]);
      const globalList = gl?.leaderboard ?? [];
      const friendList = fr?.leaderboard ?? [];
      setBoards({ global: globalList, friends: friendList });
      setMyRanks({
        global: gl?.current_user_rank ?? globalList.find((e: any) => e.is_current_user) ?? null,
        friends: fr?.current_user_rank ?? friendList.find((e: any) => e.is_current_user) ?? null,
      });
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.username]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const list   = boards[tab];
  const myRank = myRanks[tab];
  const top3   = list.slice(0, 3);
  const rest   = list.slice(3);
  const dname  = (e: any) => e.username || e.name || '?';
  const dscore = (e: any) => e.score ?? e.total_points ?? e.points ?? 0;
  const dstreak= (e: any) => e.streak ?? e.current_streak ?? 0;
  const dpicture = (e: any) => e.picture_url ?? e.picture ?? e.photo_url ?? e.profile_picture;
  const myRankNumber = typeof myRank === 'number' ? myRank : myRank?.rank;
  const myScore = typeof myRank === 'object' && myRank ? dscore(myRank) : 0;
  const nextEntry = myRankNumber && myRankNumber > 1
    ? list.find((entry: any) => Number(entry.rank) === Number(myRankNumber) - 1)
    : null;
  const gapToNext = nextEntry ? Math.max(0, dscore(nextEntry) - myScore) : 0;

  const GOLD_XL = selectedTheme.accent;
  const GOLD_L  = selectedTheme.accentHover;
  const GOLD_M  = selectedTheme.accent;
  const GOLD_D  = darkenColor(selectedTheme.accent, selectedTheme.isLight ? 12 : 26);
  const DIM     = selectedTheme.textSecondary;

  if (!fontsLoaded) return null;

  if (loading) return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={GOLD_M} size="large" />
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />

      {/* Product header */}
      <View style={[s.topBar, { paddingTop: Math.max(insets.top + 8, 16) }]}>
        <HapticTouchable onPress={onBack} style={s.backBtn} haptic="light">
          <Ionicons name="chevron-back" size={18} color={GOLD_M} />
        </HapticTouchable>
        <View style={s.headerCopy}>
          <Text style={s.brandSub}>cerbyl / community</Text>
          <Text style={s.headerTitle}>rankings</Text>
        </View>
        <HapticTouchable onPress={onRefresh} style={s.backBtn} haptic="light" accessibilityLabel="Refresh leaderboard">
          <Ionicons name="refresh" size={16} color={GOLD_M} />
        </HapticTouchable>
      </View>

      {/* Weekly climb summary */}
      <View style={s.hero}>
        <LinearGradient
          colors={[rgbaFromHex(selectedTheme.accentHover, 0.18), rgbaFromHex(selectedTheme.panel, 0.98), rgbaFromHex(selectedTheme.bgPrimary, 0.94)]}
          locations={[0, 0.55, 1]}
          style={s.climbCard}
        >
          <SocialTileMaterial />
          <View style={s.climbHeader}>
            <View>
              <Text style={s.heroKicker}>weekly climb</Text>
              <Text style={s.heroTitle}>every point{'\n'}moves you</Text>
            </View>
            <View style={s.weekMarker}>
              <Ionicons name="flag" size={16} color={GOLD_L} />
              <Text style={s.weekMarkerText}>live</Text>
            </View>
          </View>
          <Text style={s.heroSub}>Build momentum, pass the next learner, and protect your place.</Text>
          <View style={s.climbStats}>
            <View style={s.climbStat}>
              <Text style={s.climbStatLabel}>your rank</Text>
              <Text style={s.climbStatValue}>{myRankNumber ? `#${myRankNumber}` : '—'}</Text>
            </View>
            <View style={s.climbDivider} />
            <View style={s.climbStat}>
              <Text style={s.climbStatLabel}>your xp</Text>
              <Text style={s.climbStatValue}>{myScore.toLocaleString()}</Text>
            </View>
            <View style={s.climbDivider} />
            <View style={s.climbStat}>
              <Text style={s.climbStatLabel}>to next</Text>
              <Text style={s.climbStatValue}>{gapToNext > 0 ? `+${gapToNext}` : 'lead'}</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Tabs */}
      <View style={s.tabShell}>
      <View style={s.tabRow}>
        {(['global', 'friends'] as const).map(t => (
          <HapticTouchable key={t} style={[s.tabItem, tab === t && s.tabItemActive]} onPress={() => setTab(t)} haptic="selection">
            <Ionicons name={t === 'global' ? 'earth-outline' : 'people-outline'} size={13} color={tab === t ? GOLD_L : DIM} />
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text>
          </HapticTouchable>
        ))}
      </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD_M} />}
      >
        {list.length === 0 ? (
          <View style={empty.wrap}>
            <SocialTileMaterial />
            <LinearGradient colors={[rgbaFromHex(selectedTheme.accent, 0.14), rgbaFromHex(selectedTheme.panelAlt, 0.04)]} style={empty.icon}>
              <Ionicons name="trophy-outline" size={40} color={GOLD_D} />
            </LinearGradient>
            <Text style={empty.title}>no rankings yet</Text>
            <Text style={empty.sub}>{tab === 'friends' ? 'add friends and start competing' : 'earn XP to claim the first spot'}</Text>
          </View>
        ) : (
          <>
            {/* Explore-inspired front-runner tiles */}
            {top3.length > 0 && (
              <>
                <View style={s.sectionHeading}>
                  <View><Text style={s.sectionIndex}>01</Text><Text style={s.sectionTitle}>front runners</Text></View>
                  <Ionicons name="chevron-forward" size={15} color={CB_ACCENT} />
                </View>
                <View style={pod.wrap}>
                  {top3[0] && (
                    <View style={pod.champion}>
                      <SocialTileMaterial />
                      <View style={pod.tileTop}>
                        <Text style={pod.tileIndex}>01</Text>
                        <Ionicons name="chevron-forward" size={15} color={CB_ACCENT} />
                      </View>
                      <View style={pod.championBody}>
                        <Avatar name={dname(top3[0])} picture={dpicture(top3[0])} size={58} medal="gold" />
                        <View style={{ flex: 1 }}>
                          <Text style={pod.eyebrow}>pace setter</Text>
                          <Text style={pod.championName} numberOfLines={1}>{dname(top3[0])}{top3[0].is_current_user ? ' · you' : ''}</Text>
                          <Text style={pod.championScore}>{dscore(top3[0]).toLocaleString()} XP</Text>
                        </View>
                        <Ionicons name="trophy" size={24} color={CB_ACCENT} />
                      </View>
                    </View>
                  )}
                  <View style={pod.contenderRow}>
                    {top3.slice(1, 3).map((entry: any, index: number) => (
                      <View key={entry.id ?? index} style={pod.contender}>
                        <SocialTileMaterial />
                        <View style={pod.tileTop}>
                          <Text style={pod.tileIndex}>{`0${index + 2}`}</Text>
                          <Ionicons name="chevron-forward" size={15} color={CB_ACCENT} />
                        </View>
                        <Avatar name={dname(entry)} picture={dpicture(entry)} size={42} medal={index === 0 ? 'silver' : 'bronze'} />
                        <Text style={pod.name} numberOfLines={1}>{dname(entry)}{entry.is_current_user ? ' · you' : ''}</Text>
                        <Text style={pod.score}>{dscore(entry).toLocaleString()} XP</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </>
            )}

            {/* Rest of list */}
            {rest.length > 0 && (
              <>
              <View style={s.sectionHeading}>
                <View><Text style={s.sectionIndex}>02</Text><Text style={s.sectionTitle}>the chase</Text></View>
                <Ionicons name="chevron-forward" size={15} color={CB_ACCENT} />
              </View>
              <View style={{ gap: 6 }}>
                {rest.map((e: any, i: number) => {
                  const rank    = e.rank ?? i + 4;
                  const isMe    = e.is_current_user;
                  const score   = dscore(e);
                  const streak  = dstreak(e);
                  const maxScore = dscore(list[0]) || 1;
                  const pct     = Math.min(1, score / maxScore);
                  return (
                    <View key={e.id ?? i} style={[row.wrap, isMe && row.wrapMe]}>
                      <SocialTileMaterial />
                      {isMe && <LinearGradient colors={[rgbaFromHex(selectedTheme.accent, 0.14), rgbaFromHex(selectedTheme.panelAlt, 0.04)]} style={[StyleSheet.absoluteFillObject, { borderRadius: 14 }]} />}
                      <Text style={[row.rank, isMe && { color: GOLD_XL }]}>
                        {rank <= 9 ? `0${rank}` : rank}
                      </Text>
                      <Avatar name={dname(e)} picture={dpicture(e)} size={36} />
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={[row.name, isMe && { color: GOLD_XL }]}>
                          {dname(e)}{isMe ? '  (you)' : ''}
                        </Text>
                        <View style={row.track}>
                          <LinearGradient
                            colors={isMe ? [selectedTheme.accentHover, selectedTheme.accent] : [rgbaFromHex(selectedTheme.accent, 0.42), rgbaFromHex(selectedTheme.accent, 0.14)]}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={[row.fill, { width: `${Math.max(4, pct * 100)}%` as any }]}
                          />
                        </View>
                      </View>
                      <View style={row.right}>
                        <Text style={[row.score, isMe && { color: GOLD_XL }]}>
                          {score >= 1000 ? `${(score / 1000).toFixed(1)}k XP` : `${score} XP`}
                        </Text>
                        {streak > 0 && (
                          <View style={row.streakPill}>
                            <Ionicons name="flame" size={9} color={selectedTheme.warning} />
                            <Text style={row.streakText}>{streak}</Text>
                          </View>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={15} color={CB_ACCENT} />
                    </View>
                  );
                })}
              </View>
              </>
            )}
          </>
        )}
        <View style={{ height: Math.max(insets.bottom + 28, 48) }} />
      </ScrollView>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const DIM         = theme.textSecondary;
  const BORDER      = 'rgba(216,179,141,0.22)';
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    topBar: {
      width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center',
      minHeight: 70, flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingBottom: 8, gap: 12,
    },
    backBtn: {
      width: 40, height: 40, borderRadius: 14, backgroundColor: CB_CARD_TOP,
      borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center',
    },
    headerCopy: { flex: 1 },
    brandSub: {
      fontFamily: 'Inter_600SemiBold', fontSize: 7.5, letterSpacing: 1.7,
      textTransform: 'uppercase', color: CB_ACCENT,
    },
    headerTitle: {
      marginTop: 2, fontFamily: 'Inter_900Black', fontSize: 27,
      color: CB_ACCENT, letterSpacing: -0.9,
    },
    hero: {
      width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center',
      paddingHorizontal: 16, paddingTop: 4,
    },
    climbCard: {
      minHeight: 218, borderRadius: 26, padding: 20, overflow: 'hidden',
      borderWidth: 1, borderColor: BORDER,
    },
    climbHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    heroKicker: {
      fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.8,
      textTransform: 'uppercase', color: DIM,
    },
    heroTitle: {
      marginTop: 8, fontFamily: 'Inter_900Black', fontSize: 31,
      lineHeight: 31, color: CB_ACCENT, letterSpacing: -1.2,
    },
    heroSub: {
      width: '74%', marginTop: 10, fontFamily: 'Inter_400Regular',
      fontSize: 10, lineHeight: 15, color: DIM,
    },
    weekMarker: {
      minWidth: 52, height: 52, borderRadius: 17, alignItems: 'center',
      justifyContent: 'center', gap: 2, borderWidth: 1, borderColor: BORDER,
      backgroundColor: 'rgba(216,179,141,0.07)',
    },
    weekMarkerText: {
      fontFamily: 'Inter_700Bold', fontSize: 7, letterSpacing: 0.8,
      textTransform: 'uppercase', color: CB_ACCENT,
    },
    climbStats: {
      position: 'absolute', left: 20, right: 20, bottom: 16, height: 50,
      flexDirection: 'row', alignItems: 'center', borderRadius: 17,
      borderWidth: 1, borderColor: BORDER, backgroundColor: 'rgba(5,5,6,0.78)',
    },
    climbStat: { flex: 1, alignItems: 'center' },
    climbStatLabel: {
      fontFamily: 'Inter_600SemiBold', fontSize: 6.5, letterSpacing: 0.8,
      textTransform: 'uppercase', color: DIM,
    },
    climbStatValue: { marginTop: 3, fontFamily: 'Inter_900Black', fontSize: 15, color: CB_ACCENT },
    climbDivider: { width: 1, height: 22, backgroundColor: BORDER },
    tabShell: {
      width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center',
      paddingHorizontal: 16, marginTop: 12, marginBottom: 10,
    },
    tabRow: {
      height: 46, flexDirection: 'row', padding: 4, borderRadius: 17,
      borderWidth: 1, borderColor: BORDER, backgroundColor: CB_CARD_BOTTOM,
    },
    tabItem: {
      flex: 1, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 7, borderRadius: 13,
    },
    tabItemActive: { backgroundColor: 'rgba(216,179,141,0.12)', borderWidth: 1, borderColor: BORDER },
    tabText: {
      fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 0.7,
      textTransform: 'uppercase', color: DIM,
    },
    tabTextActive: { color: CB_ACCENT },
    scroll: {
      width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center',
      paddingHorizontal: 16, paddingTop: 4,
    },
    sectionHeading: {
      minHeight: 70, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', paddingHorizontal: 4,
    },
    sectionIndex: {
      fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.5,
      color: DIM, marginBottom: 4,
    },
    sectionTitle: {
      fontFamily: 'Inter_900Black', fontSize: 22, color: CB_ACCENT,
      letterSpacing: -0.7,
    },
  });
}

function createPodStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  return StyleSheet.create({
    wrap: { gap: 10, marginBottom: 6 },
    champion: {
      minHeight: 138, borderRadius: 26, overflow: 'hidden', padding: 17,
      boxShadow: cbModalShadow(0.14),
      ...cbTileBorder(0.22),
    },
    tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    tileIndex: {
      fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.7,
      color: theme.textSecondary,
    },
    championBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 10 },
    eyebrow: {
      fontFamily: 'Inter_600SemiBold', fontSize: 7, letterSpacing: 1.2,
      textTransform: 'uppercase', color: theme.textSecondary,
    },
    championName: {
      marginTop: 3, fontFamily: 'Inter_900Black', fontSize: 20,
      color: CB_ACCENT, letterSpacing: -0.6,
    },
    championScore: { marginTop: 3, fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.textSecondary },
    contenderRow: { flexDirection: 'row', gap: 10 },
    contender: {
      flex: 1, minHeight: 174, borderRadius: 26, overflow: 'hidden',
      padding: 15,
      boxShadow: cbTileShadow(0.07),
      ...cbTileBorder(0.18),
    },
    name: {
      marginTop: 12, fontFamily: 'Inter_900Black', fontSize: 15,
      color: CB_ACCENT, letterSpacing: -0.3,
    },
    score: { marginTop: 4, fontFamily: 'Inter_400Regular', fontSize: 10, color: theme.textSecondary },
  });
}

function createRowStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const ACCENT  = CB_ACCENT;
  return StyleSheet.create({
    wrap:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 12, borderRadius: 20, backgroundColor: CB_CARD_TOP, overflow: 'hidden', position: 'relative', marginBottom: 6, boxShadow: cbTileShadow(0.05), ...cbTileBorder(0.14) },
    wrapMe:     { borderColor: rgbaFromHex(ACCENT, 0.34) },
    rank:       { fontFamily: 'Inter_900Black', fontSize: 13, color: theme.textSecondary, width: 26, textAlign: 'center' },
    name:       { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: CB_ACCENT },
    track:      { height: 3, backgroundColor: rgbaFromHex(ACCENT, 0.14), borderRadius: 2, overflow: 'hidden' },
    fill:       { height: '100%', borderRadius: 2 },
    right:      { alignItems: 'flex-end', gap: 4 },
    score:      { fontFamily: 'Inter_700Bold', fontSize: 12, color: ACCENT },
    streakPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: rgbaFromHex(theme.warning, 0.12), borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
    streakText: { fontFamily: 'Inter_700Bold', fontSize: 9, color: theme.warning },
  });
}

function createEmptyStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  return StyleSheet.create({
    wrap:  { alignItems: 'center', justifyContent: 'center', minHeight: 230, gap: 14, borderRadius: 26, backgroundColor: CB_CARD_TOP, overflow: 'hidden', boxShadow: cbTileShadow(0.06), ...cbTileBorder(0.14) },
    icon:  { width: 78, height: 78, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(216,179,141,0.22)' },
    title: { fontFamily: 'Inter_900Black', fontSize: 18, color: CB_ACCENT },
    sub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.textSecondary, textAlign: 'center' },
  });
}
