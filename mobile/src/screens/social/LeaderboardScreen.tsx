import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../../services/auth';
import { getFriendsLeaderboard, getGlobalLeaderboard } from '../../services/api';
import HapticTouchable from '../../components/HapticTouchable';
import AmbientBubbles from '../../components/AmbientBubbles';
import GeoBackground from '../../components/GeoBackground';
import { useAppTheme } from '../../contexts/ThemeContext';
import { darkenColor, lightenColor, rgbaFromHex } from '../../utils/theme';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

const MEDAL = {
  gold:   { bar: 80, size: 60 },
  silver: { bar: 58, size: 50 },
  bronze: { bar: 42, size: 44 },
} as const;
type MedalKey = keyof typeof MEDAL;

function getMedalRing(theme: ReturnType<typeof useAppTheme>['selectedTheme'], medal: MedalKey) {
  if (medal === 'gold')   return theme.accentHover;
  if (medal === 'silver') return lightenColor(theme.accent, theme.isLight ? 26 : 12);
  return darkenColor(theme.accent, theme.isLight ? 14 : 8);
}

function DotGrid() {
  const { selectedTheme } = useAppTheme();
  const { width } = useResponsiveLayout();
  const dotColor = rgbaFromHex(selectedTheme.accent, 0.16);
  const dotSpacingX = 24;
  const dotSpacingY = 30;
  const cols = Math.floor((width - 56) / dotSpacingX);
  const rows = 28;
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => (
          <View
            key={`${r}-${c}`}
            style={{
              position: 'absolute',
              left: 56 + c * dotSpacingX,
              top: r * dotSpacingY,
              width: 2, height: 2, borderRadius: 1,
              backgroundColor: dotColor,
            }}
          />
        ))
      )}
    </View>
  );
}

function Avatar({ name, size = 44, medal }: { name: string; size?: number; medal?: MedalKey }) {
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
        style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ fontFamily: 'Inter_900Black', fontSize: size * 0.33, color: TEXT }}>{initials}</Text>
      </LinearGradient>
    </LinearGradient>
  );
}

type Props = { user: AuthUser; onBack: () => void };

export default function LeaderboardScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s    = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const pod  = useMemo(() => createPodStyles(selectedTheme), [selectedTheme]);
  const row  = useMemo(() => createRowStyles(selectedTheme), [selectedTheme]);
  const empty = useMemo(() => createEmptyStyles(selectedTheme), [selectedTheme]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold });

  const [tab, setTab]               = useState<'global' | 'friends'>('global');
  const [friends, setFriends]       = useState<any[]>([]);
  const [global, setGlobal]         = useState<any[]>([]);
  const [myRank, setMyRank]         = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [fr, gl] = await Promise.all([
        getFriendsLeaderboard(user.username),
        getGlobalLeaderboard(50),
      ]);
      const fList = fr?.leaderboard ?? [];
      setFriends(fList);
      setMyRank(fr?.current_user_rank ?? fList.find((e: any) => e.is_current_user));
      setGlobal(gl?.leaderboard ?? []);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.username]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const list   = tab === 'friends' ? friends : global;
  const top3   = list.slice(0, 3);
  const rest   = list.slice(3);
  const dname  = (e: any) => e.username || e.name || '?';
  const dscore = (e: any) => e.score ?? e.total_points ?? e.points ?? 0;
  const dstreak= (e: any) => e.streak ?? e.current_streak ?? 0;

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

  const podiumOrder: [any, MedalKey][] = [
    [top3[1], 'silver'],
    [top3[0], 'gold'],
    [top3[2], 'bronze'],
  ];

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <AmbientBubbles theme={selectedTheme} variant="leaderboard" opacity={0.84} />
      <DotGrid />

      {/* Top bar */}
      <View style={s.topBar}>
        <HapticTouchable onPress={onBack} style={s.backBtn} haptic="light">
          <Ionicons name="chevron-back" size={18} color={GOLD_M} />
        </HapticTouchable>
      </View>

      {/* Hero */}
      <View style={s.hero}>
        <LinearGradient colors={[rgbaFromHex(selectedTheme.accent, 0.24), rgbaFromHex(selectedTheme.panelAlt, 0.04), rgbaFromHex(selectedTheme.bgPrimary, 0)]} style={s.heroGlow}>
          <Ionicons name="trophy" size={46} color={GOLD_XL} />
        </LinearGradient>
        <Text style={s.heroTitle}>leaderboard</Text>
        {myRank
          ? <Text style={s.heroSub}>you're ranked <Text style={{ color: GOLD_XL, fontFamily: 'Inter_700Bold' }}>#{myRank.rank ?? myRank}</Text></Text>
          : <Text style={s.heroSub}>see how you stack up</Text>
        }
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {(['global', 'friends'] as const).map(t => (
          <HapticTouchable key={t} style={s.tabItem} onPress={() => setTab(t)} haptic="selection">
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text>
            {tab === t && <View style={s.tabLine} />}
          </HapticTouchable>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD_M} />}
      >
        {list.length === 0 ? (
          <View style={empty.wrap}>
            <LinearGradient colors={[rgbaFromHex(selectedTheme.accent, 0.14), rgbaFromHex(selectedTheme.panelAlt, 0.04)]} style={empty.icon}>
              <Ionicons name="trophy-outline" size={40} color={GOLD_D} />
            </LinearGradient>
            <Text style={empty.title}>no rankings yet</Text>
          </View>
        ) : (
          <>
            {/* Podium */}
            {top3.length > 0 && (
              <View style={pod.wrap}>
                <LinearGradient colors={[rgbaFromHex(selectedTheme.accent, 0.08), rgbaFromHex(selectedTheme.bgPrimary, 0)]} style={[StyleSheet.absoluteFillObject, { borderRadius: 20 }]} />
                {podiumOrder.map(([entry, medal]) => {
                  if (!entry) return null;
                  const m = MEDAL[medal];
                  const ringColor = getMedalRing(selectedTheme, medal);
                  const label = medal === 'gold' ? '1st' : medal === 'silver' ? '2nd' : '3rd';
                  return (
                    <View key={medal} style={[pod.entry, medal === 'gold' && pod.entryFirst]}>
                      {medal === 'gold' && <Ionicons name="trophy" size={16} color={ringColor} style={{ marginBottom: 6 }} />}
                      <Avatar name={dname(entry)} size={m.size} medal={medal} />
                      <View style={[pod.badge, { borderColor: rgbaFromHex(ringColor, 0.44), backgroundColor: rgbaFromHex(ringColor, 0.12) }]}>
                        <Text style={[pod.badgeText, { color: ringColor }]}>{label}</Text>
                      </View>
                      <Text style={pod.name} numberOfLines={1}>{dname(entry)}</Text>
                      <Text style={pod.score}>{dscore(entry).toLocaleString()}</Text>
                      <LinearGradient colors={[rgbaFromHex(ringColor, 0.22), rgbaFromHex(ringColor, 0.06)]} style={[pod.bar, { height: m.bar, borderTopColor: rgbaFromHex(ringColor, 0.38) }]} />
                    </View>
                  );
                })}
              </View>
            )}

            {/* Rest of list */}
            {rest.length > 0 && (
              <View style={{ gap: 6 }}>
                {rest.map((e: any, i: number) => {
                  const rank    = i + 4;
                  const isMe    = e.is_current_user;
                  const score   = dscore(e);
                  const streak  = dstreak(e);
                  const maxScore = dscore(list[0]) || 1;
                  const pct     = Math.min(1, score / maxScore);
                  return (
                    <View key={e.id ?? i} style={[row.wrap, isMe && row.wrapMe]}>
                      {isMe && <LinearGradient colors={[rgbaFromHex(selectedTheme.accent, 0.14), rgbaFromHex(selectedTheme.panelAlt, 0.04)]} style={[StyleSheet.absoluteFillObject, { borderRadius: 14 }]} />}
                      <Text style={[row.rank, isMe && { color: GOLD_XL }]}>
                        {rank <= 9 ? `0${rank}` : rank}
                      </Text>
                      <Avatar name={dname(e)} size={36} />
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
                          {score >= 1000 ? `${(score / 1000).toFixed(1)}k` : score}
                        </Text>
                        {streak > 0 && (
                          <View style={row.streakPill}>
                            <Ionicons name="flame" size={9} color={selectedTheme.warning} />
                            <Text style={row.streakText}>{streak}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const ACCENT      = theme.accent;
  const ACCENT_DARK = darkenColor(theme.accent, theme.isLight ? 12 : 26);
  const DIM         = theme.textSecondary;
  const SURFACE     = theme.panel;
  const BORDER      = theme.borderStrong;
  return StyleSheet.create({
    root: { flex: 1 },
    topBar: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
    backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: rgbaFromHex(SURFACE, 0.92), borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
    hero:      { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', alignItems: 'center', paddingTop: 12, paddingBottom: 24, gap: 8 },
    heroGlow:  { width: 112, height: 112, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: rgbaFromHex(ACCENT, 0.24) },
    heroTitle: { fontFamily: 'Inter_900Black', fontSize: 40, color: theme.accentHover, letterSpacing: -2.2, marginTop: 8 },
    heroSub:   { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, letterSpacing: 0.5 },
    tabRow:        { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', flexDirection: 'row', paddingLeft: 20, paddingRight: 20, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: BORDER },
    tabItem:       { flex: 1, alignItems: 'center', paddingBottom: 10, position: 'relative' },
    tabText:       { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: DIM },
    tabTextActive: { color: theme.accentHover },
    tabLine:       { position: 'absolute', bottom: -1, left: '15%', right: '15%', height: 2, backgroundColor: ACCENT, borderRadius: 1 },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingLeft: 20, paddingRight: 20, paddingTop: 4, gap: 0 },
  });
}

function createPodStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  return StyleSheet.create({
    wrap:       { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 24, gap: 4, paddingTop: 20, borderRadius: 20, overflow: 'hidden', position: 'relative' },
    entry:      { flex: 1, alignItems: 'center', gap: 0 },
    entryFirst: {},
    badge:      { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, marginTop: 8, marginBottom: 4 },
    badgeText:  { fontFamily: 'Inter_900Black', fontSize: 10 },
    name:       { fontFamily: 'Inter_700Bold', fontSize: 11, color: theme.accentHover, textAlign: 'center', paddingHorizontal: 4 },
    score:      { fontFamily: 'Inter_400Regular', fontSize: 10, color: theme.textSecondary, marginBottom: 8, marginTop: 2 },
    bar:        { width: '100%', borderTopWidth: 1.5, borderRadius: 4 },
  });
}

function createRowStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const ACCENT  = theme.accent;
  const SURFACE = theme.panel;
  const BORDER  = theme.borderStrong;
  return StyleSheet.create({
    wrap:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: rgbaFromHex(SURFACE, 0.84), overflow: 'hidden', position: 'relative', marginBottom: 6 },
    wrapMe:     { borderColor: rgbaFromHex(ACCENT, 0.34) },
    rank:       { fontFamily: 'Inter_900Black', fontSize: 13, color: theme.textSecondary, width: 26, textAlign: 'center' },
    name:       { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: theme.accentHover },
    track:      { height: 3, backgroundColor: rgbaFromHex(ACCENT, 0.14), borderRadius: 2, overflow: 'hidden' },
    fill:       { height: '100%', borderRadius: 2 },
    right:      { alignItems: 'flex-end', gap: 4 },
    score:      { fontFamily: 'Inter_700Bold', fontSize: 15, color: ACCENT },
    streakPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: rgbaFromHex(theme.warning, 0.12), borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
    streakText: { fontFamily: 'Inter_700Bold', fontSize: 9, color: theme.warning },
  });
}

function createEmptyStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  return StyleSheet.create({
    wrap:  { alignItems: 'center', paddingTop: 80, gap: 14 },
    icon:  { width: 88, height: 88, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: rgbaFromHex(theme.accent, 0.22) },
    title: { fontFamily: 'Inter_900Black', fontSize: 18, color: darkenColor(theme.accent, theme.isLight ? 12 : 26) },
  });
}
