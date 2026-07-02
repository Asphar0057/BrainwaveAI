import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../../services/auth';
import {
  getFriends, getFriendRequests, getFriendActivityFeed,
  respondFriendRequest, searchUsers, sendFriendRequest,
  removeFriend, giveKudos,
} from '../../services/api';
import HapticTouchable from '../../components/HapticTouchable';
import AmbientBubbles from '../../components/AmbientBubbles';
import { useAppTheme } from '../../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../../utils/theme';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

function activityColor(type = '', theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  if (type.includes('quiz'))  return theme.accent;
  if (type.includes('note'))  return theme.accentHover;
  if (type.includes('flash')) return theme.success;
  if (type.includes('chat'))  return theme.warning;
  return theme.accent;
}
function activityIcon(type = ''): React.ComponentProps<typeof Ionicons>['name'] {
  if (type.includes('quiz'))  return 'trophy';
  if (type.includes('note'))  return 'document-text';
  if (type.includes('flash')) return 'layers';
  if (type.includes('chat'))  return 'chatbubble';
  return 'star';
}

function DotGrid() {
  const { selectedTheme } = useAppTheme();
  const { width } = useResponsiveLayout();
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
              width: 2,
              height: 2,
              borderRadius: 1,
              backgroundColor: rgbaFromHex(darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26), 0.16),
            }}
          />
        ))
      )}
    </View>
  );
}

function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const { selectedTheme } = useAppTheme();
  const ringColor = selectedTheme.accentHover;
  const ringDark = darkenColor(selectedTheme.accent, selectedTheme.isLight ? 14 : 28);
  const initials = (name || '?').split(/[\s_]/).map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <LinearGradient
      colors={[ringColor, selectedTheme.accent, ringDark]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ width: size + 3, height: size + 3, borderRadius: (size + 3) / 2, padding: 2, alignItems: 'center', justifyContent: 'center' }}
    >
      <LinearGradient
        colors={[rgbaFromHex(selectedTheme.panelAlt, 0.98), rgbaFromHex(selectedTheme.bgPrimary, 0.98)]}
        style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ fontFamily: 'Inter_900Black', fontSize: size * 0.33, color: selectedTheme.accentHover }}>{initials}</Text>
      </LinearGradient>
    </LinearGradient>
  );
}

type Props = { user: AuthUser; onBack: () => void };

export default function FriendsScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const fc = useMemo(() => createFriendCardStyles(selectedTheme), [selectedTheme]);
  const rq = useMemo(() => createRequestStyles(selectedTheme), [selectedTheme]);
  const af = useMemo(() => createActivityStyles(selectedTheme), [selectedTheme]);
  const empty = useMemo(() => createEmptyStyles(selectedTheme), [selectedTheme]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const [tab, setTab]               = useState<'friends' | 'requests' | 'activity'>('friends');
  const [friends, setFriends]       = useState<any[]>([]);
  const [requests, setRequests]     = useState<any[]>([]);
  const [feed, setFeed]             = useState<any[]>([]);
  const [searchQ, setSearchQ]       = useState('');
  const [results, setResults]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching]   = useState(false);
  const [sentIds, setSentIds]       = useState<Set<string>>(new Set());
  const [kudosSent, setKudosSent]   = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      const [fr, rq, fd] = await Promise.all([
        getFriends(user.username),
        getFriendRequests(user.username),
        getFriendActivityFeed(user.username),
      ]);
      setFriends(Array.isArray(fr) ? fr : fr?.friends ?? []);
      setRequests(Array.isArray(rq) ? rq : rq?.received ?? []);
      setFeed(Array.isArray(fd) ? fd : fd?.activities ?? fd?.feed ?? []);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.username]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const doSearch = async (q: string) => {
    setSearchQ(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const d = await searchUsers(user.username, q.trim());
      setResults(Array.isArray(d) ? d : d?.users ?? []);
    } catch { setResults([]); }
    finally { setSearching(false); }
  };

  const doRespond = async (id: number, action: 'accept' | 'decline') => {
    try {
      await respondFriendRequest(user.username, id, action);
      setRequests(p => p.filter((r: any) => r.id !== id));
      if (action === 'accept') load();
    } catch {}
  };

  const doSend = async (targetUsername: string) => {
    try {
      await sendFriendRequest(user.username, targetUsername);
      setSentIds(p => new Set([...p, targetUsername]));
    } catch {}
  };

  const doRemove = (friendId: number, name: string) => {
    Alert.alert('Remove friend', `Remove ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await removeFriend(user.username, friendId); load(); } catch {}
      }},
    ]);
  };

  const doKudos = async (friendId: number) => {
    if (kudosSent.has(friendId)) return;
    try {
      await giveKudos(user.username, friendId);
      setKudosSent(p => new Set([...p, friendId]));
    } catch {}
  };

  const fname    = (f: any) => f.username || f.friend_username || f.name || '?';
  const fstreak  = (f: any) => f.streak ?? f.current_streak ?? 0;
  const fmaster  = (f: any) => f.mastered ?? f.total_mastered ?? 0;

  if (!fontsLoaded) return null;

  if (loading) return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={selectedTheme.accent} size="large" />
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <AmbientBubbles theme={selectedTheme} variant="friends" opacity={0.82} />
      <DotGrid />

{/* Top bar */}
      <View style={s.topBar}>
        <HapticTouchable onPress={onBack} style={s.backBtn} haptic="light">
          <Ionicons name="chevron-back" size={18} color={selectedTheme.accent} />
        </HapticTouchable>
        {requests.length > 0 && (
          <View style={s.requestBadge}>
            <Text style={s.requestBadgeText}>{requests.length} pending</Text>
          </View>
        )}
      </View>

      {/* Hero */}
      <View style={s.hero}>
        <LinearGradient colors={[rgbaFromHex(darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26), 0.32), rgbaFromHex(darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26), 0.08), rgbaFromHex(selectedTheme.bgPrimary, 0)]} style={s.heroGlow}>
          <Ionicons name="people" size={46} color={selectedTheme.accentHover} />
        </LinearGradient>
        <Text style={s.heroTitle}>friends</Text>
        <Text style={s.heroSub}>{friends.length} connected</Text>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <LinearGradient colors={[rgbaFromHex(darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26), 0.32), rgbaFromHex(darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26), 0.1)]} style={s.searchBorder}>
          <View style={s.searchInner}>
            <Ionicons name="search-outline" size={14} color={darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26)} />
            <TextInput
              style={s.searchInput}
              value={searchQ}
              onChangeText={doSearch}
              placeholder="find people..."
              placeholderTextColor={selectedTheme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searching
              ? <ActivityIndicator size="small" color={selectedTheme.accent} />
              : searchQ.length > 0 && (
                  <HapticTouchable onPress={() => { setSearchQ(''); setResults([]); }} haptic="light">
                    <Ionicons name="close-circle" size={15} color={selectedTheme.textSecondary} />
                  </HapticTouchable>
                )
            }
          </View>
        </LinearGradient>
      </View>

      {/* Search results */}
      {results.length > 0 && (
        <View style={s.resultsSheet}>
          {results.map((r: any, i: number) => {
            const uname = r.username || r.name || '?';
            const sent  = sentIds.has(uname);
            return (
              <View key={r.id ?? i} style={[s.resultRow, i < results.length - 1 && s.resultDivider]}>
                <Avatar name={uname} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={s.resultName}>{uname}</Text>
                  {r.email && <Text style={s.resultSub}>{r.email}</Text>}
                </View>
                <HapticTouchable
                  style={[s.addChip, sent && s.addChipSent]}
                  onPress={() => !sent && doSend(uname)}
                  haptic="medium"
                >
                  <Text style={[s.addChipText, sent && { color: darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26) }]}>{sent ? 'sent' : '+ add'}</Text>
                </HapticTouchable>
              </View>
            );
          })}
        </View>
      )}

      {/* Tabs */}
      <View style={s.tabRow}>
        {(['friends', 'requests', 'activity'] as const).map(t => (
          <HapticTouchable key={t} style={s.tabItem} onPress={() => setTab(t)} haptic="selection">
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t}{t === 'requests' && requests.length > 0 ? ` (${requests.length})` : ''}
            </Text>
            {tab === t && <View style={s.tabLine} />}
          </HapticTouchable>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={selectedTheme.accent} />}
      >
        {/* Friends tab */}
        {tab === 'friends' && (
          friends.length === 0 ? (
            <View style={empty.wrap}>
              <LinearGradient colors={[rgbaFromHex(darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26), 0.18), rgbaFromHex(darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26), 0.04)]} style={empty.icon}>
                <Ionicons name="people-outline" size={40} color={darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26)} />
              </LinearGradient>
              <Text style={empty.title}>no friends yet</Text>
              <Text style={empty.hint}>search above to connect with people</Text>
            </View>
          ) : friends.map((f: any, i: number) => {
            const streak  = fstreak(f);
            const mastered = fmaster(f);
            const kudosed  = kudosSent.has(f.id);
            return (
              <View key={f.id ?? i} style={fc.wrap}>
                <View style={fc.accent} />
                <View style={fc.body}>
                  <View style={fc.row}>
                    <Avatar name={fname(f)} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={fc.name}>{fname(f)}</Text>
                      <View style={fc.chips}>
                        {streak > 0 && (
                          <View style={fc.streakChip}>
                            <Ionicons name="flame" size={10} color={selectedTheme.warning} />
                            <Text style={fc.streakText}>{streak}</Text>
                          </View>
                        )}
                        {mastered > 0 && (
                          <View style={fc.masterChip}>
                            <Ionicons name="star" size={10} color={selectedTheme.accent} />
                            <Text style={fc.masterText}>{mastered}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={fc.actions}>
                      <HapticTouchable
                        style={[fc.iconBtn, kudosed && fc.iconBtnActive]}
                        onPress={() => doKudos(f.id)}
                        haptic="light"
                      >
                        <Ionicons name={kudosed ? 'heart' : 'heart-outline'} size={15} color={kudosed ? selectedTheme.danger : selectedTheme.textSecondary} />
                      </HapticTouchable>
                      <HapticTouchable style={fc.iconBtn} onPress={() => doRemove(f.id, fname(f))} haptic="warning">
                        <Ionicons name="person-remove-outline" size={14} color={selectedTheme.textSecondary} />
                      </HapticTouchable>
                    </View>
                  </View>
                </View>
              </View>
            );
          })
        )}

        {/* Requests tab */}
        {tab === 'requests' && (
          requests.length === 0 ? (
            <View style={empty.wrap}>
              <LinearGradient colors={[rgbaFromHex(darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26), 0.18), rgbaFromHex(darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26), 0.04)]} style={empty.icon}>
                <Ionicons name="mail-outline" size={40} color={darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26)} />
              </LinearGradient>
              <Text style={empty.title}>no pending requests</Text>
              <Text style={empty.hint}>friend requests will appear here</Text>
            </View>
          ) : requests.map((r: any, i: number) => (
            <View key={r.id ?? i} style={rq.wrap}>
              <View style={rq.accent} />
              <View style={rq.body}>
                <View style={rq.row}>
                  <Avatar name={r.sender_username || r.name || '?'} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={rq.name}>{r.sender_username || r.name}</Text>
                    <Text style={rq.sub}>wants to connect</Text>
                  </View>
                </View>
                <View style={rq.actions}>
                  <HapticTouchable style={{ flex: 1 }} onPress={() => doRespond(r.id, 'accept')} haptic="success">
                    <LinearGradient colors={[selectedTheme.accent, darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={rq.acceptBtn}>
                      <Text style={rq.acceptText}>accept</Text>
                    </LinearGradient>
                  </HapticTouchable>
                  <HapticTouchable style={rq.declineBtn} onPress={() => doRespond(r.id, 'decline')} haptic="warning">
                    <Text style={rq.declineText}>decline</Text>
                  </HapticTouchable>
                </View>
              </View>
            </View>
          ))
        )}

        {/* Activity tab */}
        {tab === 'activity' && (
          feed.length === 0 ? (
            <View style={empty.wrap}>
              <LinearGradient colors={[rgbaFromHex(darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26), 0.18), rgbaFromHex(darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26), 0.04)]} style={empty.icon}>
                <Ionicons name="pulse-outline" size={40} color={darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26)} />
              </LinearGradient>
              <Text style={empty.title}>all quiet</Text>
              <Text style={empty.hint}>your friends' activity will appear here</Text>
            </View>
          ) : feed.map((item: any, i: number) => {
            const color = activityColor(item.activity_type, selectedTheme);
            const icon  = activityIcon(item.activity_type);
            return (
              <View key={item.id ?? i} style={af.row}>
                {i < feed.length - 1 && <View style={af.line} />}
                <View style={[af.iconWrap, { backgroundColor: rgbaFromHex(color, 0.1), borderColor: rgbaFromHex(color, 0.3) }]}>
                  <Ionicons name={icon} size={13} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={af.text}>
                    <Text style={af.bold}>{item.user ?? item.username} </Text>
                    <Text style={af.dim}>{item.action ?? item.activity_type ?? 'studied'}</Text>
                    {(item.topic ?? item.content) && (
                      <Text style={[af.topic, { color }]}>  {item.topic ?? item.content}</Text>
                    )}
                  </Text>
                  <Text style={af.time}>{item.time ?? item.time_ago ?? ''}</Text>
                </View>
              </View>
            );
          })
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const ACCENT_DARK = darkenColor(theme.accent, theme.isLight ? 10 : 26);
  const SURFACE = theme.panel;
  const SURFACE_ALT = theme.panelAlt;
  return StyleSheet.create({
    root: { flex: 1 },
    topBar: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
    backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: rgbaFromHex(SURFACE, 0.88), borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    requestBadge: { backgroundColor: rgbaFromHex(ACCENT_DARK, 0.14), borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: theme.borderStrong },
    requestBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: theme.accent },
    hero: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', alignItems: 'center', paddingTop: 12, paddingBottom: 24, gap: 8 },
    heroGlow: { width: 100, height: 100, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: rgbaFromHex(ACCENT_DARK, 0.3) },
    heroTitle: { fontFamily: 'Inter_900Black', fontSize: 42, color: theme.accentHover, letterSpacing: -2, marginTop: 6 },
    heroSub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.textSecondary, letterSpacing: 1 },
    searchWrap: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingLeft: 20, paddingRight: 20, marginBottom: 14 },
    searchBorder: { borderRadius: 14, padding: 1 },
    searchInner: { flexDirection: 'row', alignItems: 'center', backgroundColor: rgbaFromHex(SURFACE_ALT, 0.94), borderRadius: 13, paddingHorizontal: 12, paddingVertical: 11, gap: 10 },
    searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: theme.accentHover },
    resultsSheet: { width: '100%', maxWidth: layout.contentMaxWidth - 40, alignSelf: 'center', marginLeft: 20, marginRight: 20, backgroundColor: rgbaFromHex(SURFACE, 0.94), borderRadius: 14, borderWidth: 1, borderColor: theme.borderStrong, marginBottom: 12, overflow: 'hidden' },
    resultRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11, gap: 10 },
    resultDivider: { borderBottomWidth: 1, borderBottomColor: theme.border },
    resultName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: theme.accentHover },
    resultSub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.textSecondary, marginTop: 1 },
    addChip: { backgroundColor: rgbaFromHex(ACCENT_DARK, 0.14), borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: theme.borderStrong },
    addChipSent: { backgroundColor: 'transparent', borderColor: theme.border },
    addChipText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: theme.accentHover },
    tabRow: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', flexDirection: 'row', paddingLeft: 20, paddingRight: 20, marginBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
    tabItem: { flex: 1, alignItems: 'center', paddingBottom: 10, position: 'relative' },
    tabText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.textSecondary },
    tabTextActive: { color: theme.accentHover },
    tabLine: { position: 'absolute', bottom: -1, left: '10%', right: '10%', height: 2, backgroundColor: theme.accent, borderRadius: 1 },
    list: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingLeft: 20, paddingRight: 20, gap: 8, paddingBottom: 48 },
  });
}

function createFriendCardStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const ACCENT_DARK = darkenColor(theme.accent, theme.isLight ? 10 : 26);
  return StyleSheet.create({
    wrap: { flexDirection: 'row', backgroundColor: rgbaFromHex(theme.panel, 0.88), borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.border },
    accent: { width: 3, backgroundColor: ACCENT_DARK },
    body: { flex: 1, padding: 14 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    name: { fontFamily: 'Inter_900Black', fontSize: 15, color: theme.accentHover },
    chips: { flexDirection: 'row', gap: 6, marginTop: 6 },
    streakChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: rgbaFromHex(theme.warning, 0.12), borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: rgbaFromHex(theme.warning, 0.22) },
    streakText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: theme.warning },
    masterChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: rgbaFromHex(ACCENT_DARK, 0.1), borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: theme.borderStrong },
    masterText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: theme.accent },
    actions: { gap: 6 },
    iconBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: theme.panelAlt, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    iconBtnActive: { backgroundColor: rgbaFromHex(theme.danger, 0.12), borderColor: rgbaFromHex(theme.danger, 0.22) },
  });
}

function createRequestStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const ACCENT_DARK = darkenColor(theme.accent, theme.isLight ? 10 : 26);
  return StyleSheet.create({
    wrap: { flexDirection: 'row', backgroundColor: rgbaFromHex(theme.panel, 0.88), borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.borderStrong },
    accent: { width: 3, backgroundColor: theme.accent },
    body: { flex: 1, padding: 14, gap: 12 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    name: { fontFamily: 'Inter_900Black', fontSize: 15, color: theme.accentHover },
    sub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.textSecondary, marginTop: 2 },
    actions: { flexDirection: 'row', gap: 8 },
    acceptBtn: { borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
    acceptText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: theme.bgPrimary },
    declineBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: rgbaFromHex(ACCENT_DARK, 0.22), paddingVertical: 10, backgroundColor: rgbaFromHex(theme.panelAlt, 0.92) },
    declineText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: theme.textSecondary },
  });
}

function createActivityStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const ACCENT_DARK = darkenColor(theme.accent, theme.isLight ? 10 : 26);
  return StyleSheet.create({
    row: { flexDirection: 'row', gap: 12, paddingVertical: 6, position: 'relative' },
    line: { position: 'absolute', left: 71, top: 36, bottom: -6, width: 1, backgroundColor: rgbaFromHex(ACCENT_DARK, 0.16) },
    iconWrap: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 },
    text: { fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.accentHover, lineHeight: 20 },
    bold: { fontFamily: 'Inter_700Bold', color: theme.textPrimary },
    dim: { color: theme.textSecondary },
    topic: { fontFamily: 'Inter_600SemiBold' },
    time: { fontFamily: 'Inter_400Regular', fontSize: 10, color: theme.textSecondary, marginTop: 3 },
  });
}

function createEmptyStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const ACCENT_DARK = darkenColor(theme.accent, theme.isLight ? 10 : 26);
  return StyleSheet.create({
    wrap: { alignItems: 'center', paddingTop: 64, gap: 14 },
    icon: { width: 88, height: 88, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: rgbaFromHex(ACCENT_DARK, 0.24) },
    title: { fontFamily: 'Inter_900Black', fontSize: 18, color: ACCENT_DARK },
    hint: { fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.textSecondary, textAlign: 'center', paddingHorizontal: 24 },
  });
}
