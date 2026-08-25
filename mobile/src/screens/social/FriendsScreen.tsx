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
  removeFriend, giveKudos, getLeaderboard,
} from '../../services/api';
import HapticTouchable from '../../components/HapticTouchable';
import GeoBackground from '../../components/GeoBackground';
import SocialTileMaterial from '../../components/SocialTileMaterial';
import SectionSidebar from '../../components/SectionSidebar';
import { cbTileShadow, cbModalShadow, cbTileBorder } from '../../components/NeumorphicTexture';
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
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [fr, rq, fd, lb] = await Promise.all([
        getFriends(user.username),
        getFriendRequests(user.username),
        getFriendActivityFeed(user.username),
        getLeaderboard('global', 15).catch(() => null),
      ]);
      const friendList = Array.isArray(fr) ? fr : fr?.friends ?? [];
      setFriends(friendList);
      setRequests(Array.isArray(rq) ? rq : rq?.received ?? []);
      setFeed(Array.isArray(fd) ? fd : fd?.activities ?? fd?.feed ?? []);

      // "People you may know" -- no dedicated suggestions endpoint exists
      // anywhere in this app (checked both web and backend), so this reuses
      // the global leaderboard as a real, already-working source of other
      // users, filtered down to people who aren't already friends or you.
      const board = lb?.leaderboard ?? (Array.isArray(lb) ? lb : []);
      const friendUsernames = new Set(friendList.map((f: any) => (f.username || f.friend_username || '').toLowerCase()));
      setSuggestions(
        board
          .filter((e: any) => {
            const uname = (e.username || e.name || '').toLowerCase();
            return uname && uname !== user.username.toLowerCase() && !friendUsernames.has(uname) && !e.is_current_user;
          })
          .slice(0, 6)
      );
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
      <GeoBackground />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={selectedTheme.accent} size="large" />
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />

      {/* Same header construction as Solo Quiz / Battles / Flashcards. */}
      <View style={s.header}>
        <HapticTouchable onPress={onBack} style={{ marginRight: 12 }} haptic="selection">
          <Ionicons name="chevron-back" size={22} color={selectedTheme.accentHover} />
        </HapticTouchable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>friends</Text>
        </View>
        <HapticTouchable onPress={() => setSidebarOpen(true)} haptic="selection" accessibilityLabel="Open menu">
          <Ionicons name="menu-outline" size={24} color={selectedTheme.accentHover} />
        </HapticTouchable>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <View style={s.searchInner}>
            <View style={s.searchIcon}>
              <Ionicons name="search-outline" size={15} color={selectedTheme.accentHover} />
            </View>
            <TextInput
              style={s.searchInput}
              value={searchQ}
              onChangeText={doSearch}
              placeholder="search by username"
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

      <View style={s.collectionHeader}>
        <Text style={s.collectionCount}>
          {tab === 'friends' ? `${friends.length} ${friends.length === 1 ? 'friend' : 'friends'}`
            : tab === 'requests' ? `${requests.length} pending`
            : `${feed.length} recent`}
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={selectedTheme.accent} />}
      >
        {/* Friends tab */}
        {tab === 'friends' && (
          friends.length === 0 ? (
            <>
              <View style={empty.wrap}>
                <SocialTileMaterial />
                <LinearGradient colors={[rgbaFromHex(darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26), 0.18), rgbaFromHex(darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26), 0.04)]} style={empty.icon}>
                  <Ionicons name="people-outline" size={40} color={darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26)} />
                </LinearGradient>
                <Text style={empty.title}>no friends yet</Text>
              </View>

              {suggestions.length > 0 && (
                <View style={s.suggestBlock}>
                  <Text style={s.suggestLabel}>PEOPLE YOU MAY KNOW</Text>
                  <View style={s.resultsSheet}>
                    {suggestions.map((sug: any, i: number) => {
                    const uname = sug.username || sug.name || '?';
                    const sent = sentIds.has(uname);
                    return (
                      <View key={sug.id ?? sug.user_id ?? i} style={[s.resultRow, i < suggestions.length - 1 && s.resultDivider]}>
                        <Avatar name={uname} size={36} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.resultName}>{uname}</Text>
                          <Text style={s.resultSub}>{(sug.score ?? sug.total_points ?? sug.points) ? `${sug.score ?? sug.total_points ?? sug.points} xp` : 'active learner'}</Text>
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
                </View>
              )}
            </>
          ) : friends.map((f: any, i: number) => {
            const streak  = fstreak(f);
            const mastered = fmaster(f);
            const kudosed  = kudosSent.has(f.id);
            return (
              <View key={f.id ?? i} style={fc.wrap}>
                <SocialTileMaterial />
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
              <SocialTileMaterial />
              <LinearGradient colors={[rgbaFromHex(darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26), 0.18), rgbaFromHex(darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26), 0.04)]} style={empty.icon}>
                <Ionicons name="mail-outline" size={40} color={darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26)} />
              </LinearGradient>
              <Text style={empty.title}>no pending requests</Text>
            </View>
          ) : requests.map((r: any, i: number) => (
            <View key={r.id ?? i} style={rq.wrap}>
              <SocialTileMaterial />
              <View style={rq.accent} />
              <View style={rq.body}>
                <View style={rq.row}>
                  <Avatar name={r.sender_username || r.name || '?'} size={44} />
                  <Text style={[rq.name, { flex: 1 }]}>{r.sender_username || r.name}</Text>
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
              <SocialTileMaterial />
              <LinearGradient colors={[rgbaFromHex(darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26), 0.18), rgbaFromHex(darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26), 0.04)]} style={empty.icon}>
                <Ionicons name="pulse-outline" size={40} color={darkenColor(selectedTheme.accent, selectedTheme.isLight ? 10 : 26)} />
              </LinearGradient>
              <Text style={empty.title}>all quiet</Text>
            </View>
          ) : feed.map((item: any, i: number) => {
            const color = activityColor(item.activity_type, selectedTheme);
            const icon  = activityIcon(item.activity_type);
            return (
              <View key={item.id ?? i} style={af.row}>
                <SocialTileMaterial />
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

      <SectionSidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pageTitle="friends"
        items={[
          { key: 'friends', label: 'Friends', icon: 'people', iconOutline: 'people-outline' },
          { key: 'requests', label: 'Requests', icon: 'mail', iconOutline: 'mail-outline', badge: requests.length },
          { key: 'activity', label: 'Activity', icon: 'pulse', iconOutline: 'pulse-outline' },
        ]}
        activeKey={tab}
        onSelect={(key) => setTab(key as 'friends' | 'requests' | 'activity')}
        footerLabel="Social"
        onFooterPress={onBack}
      />
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const ACCENT_DARK = darkenColor(theme.accent, theme.isLight ? 10 : 26);
  const SURFACE = theme.panel;
  const SURFACE_ALT = theme.panelAlt;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    // Same header construction as Solo Quiz / Battles / Flashcards.
    header: {
      width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center',
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 10, paddingTop: 18, paddingBottom: 12,
    },
    title: { fontFamily: 'Inter_900Black', fontSize: 32, color: theme.accentHover, letterSpacing: -0.8 },
    searchWrap: {
      width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center',
      paddingHorizontal: 4, marginTop: 12, marginBottom: 12,
    },
    searchInner: {
      minHeight: 51, flexDirection: 'row', alignItems: 'center',
      backgroundColor: '#0b0c0f', borderRadius: 19,
      paddingHorizontal: 9, gap: 9, overflow: 'hidden',
      boxShadow: cbTileShadow(0.05),
      ...cbTileBorder(0.14),
    },
    searchIcon: {
      width: 34, height: 34, borderRadius: 12, alignItems: 'center',
      justifyContent: 'center', backgroundColor: rgbaFromHex(ACCENT_DARK, 0.11),
      borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.18),
    },
    searchInput: {
      flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13,
      color: theme.textPrimary, paddingVertical: 0,
    },
    resultsSheet: {
      width: '100%', maxWidth: layout.contentMaxWidth - 32, alignSelf: 'center',
      marginHorizontal: 4, backgroundColor: '#0b0c0f',
      borderRadius: 18,
      marginBottom: 12, overflow: 'hidden',
      boxShadow: cbModalShadow(0.1),
      ...cbTileBorder(0.2),
    },
    resultRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 12, gap: 10 },
    resultDivider: { borderBottomWidth: 1, borderBottomColor: theme.border },
    resultName: { fontFamily: 'Inter_900Black', fontSize: 13, color: theme.textPrimary },
    resultSub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.textSecondary, marginTop: 1 },
    addChip: { backgroundColor: rgbaFromHex(ACCENT_DARK, 0.14), borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, borderWidth: 1, borderColor: theme.borderStrong },
    addChipSent: { backgroundColor: 'transparent', borderColor: theme.border },
    addChipText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: theme.accentHover },
    // Same construction as Flashcards'/Solo Quiz's/Battles' collection-count
    // row -- section switching now lives in the hamburger sidebar instead
    // of an inline segmented tab row.
    collectionHeader: {
      width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center',
      paddingHorizontal: 4, minHeight: 24, marginBottom: 10,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    collectionCount: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: theme.textSecondary, letterSpacing: 0.3, textTransform: 'capitalize' },
    suggestBlock: { marginTop: 6 },
    suggestLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, color: theme.textSecondary, letterSpacing: 2.5, marginBottom: 10 },
    list: {
      width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center',
      paddingHorizontal: 4, gap: 9, paddingBottom: 48,
    },
  });
}

function createFriendCardStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const ACCENT_DARK = darkenColor(theme.accent, theme.isLight ? 10 : 26);
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row', minHeight: 76,
      backgroundColor: '#0b0c0f',
      borderRadius: 18,
      overflow: 'hidden',
      boxShadow: cbTileShadow(0.06),
      ...cbTileBorder(0.14),
    },
    accent: { width: 3, backgroundColor: ACCENT_DARK, opacity: 0.76 },
    body: { flex: 1, paddingHorizontal: 13, paddingVertical: 12 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    name: { fontFamily: 'Inter_900Black', fontSize: 14, color: theme.textPrimary },
    chips: { flexDirection: 'row', gap: 6, marginTop: 6 },
    streakChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: rgbaFromHex(theme.warning, 0.1), borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: rgbaFromHex(theme.warning, 0.2) },
    streakText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: theme.warning },
    masterChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: rgbaFromHex(ACCENT_DARK, 0.08), borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: theme.borderStrong },
    masterText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: theme.accentHover },
    actions: { gap: 6 },
    iconBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: rgbaFromHex(theme.panelAlt, 0.78), borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    iconBtnActive: { backgroundColor: rgbaFromHex(theme.danger, 0.12), borderColor: rgbaFromHex(theme.danger, 0.22) },
  });
}

function createRequestStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const ACCENT_DARK = darkenColor(theme.accent, theme.isLight ? 10 : 26);
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row', backgroundColor: '#0b0c0f',
      borderRadius: 18,
      overflow: 'hidden',
      boxShadow: cbTileShadow(0.06),
      ...cbTileBorder(0.14),
    },
    accent: { width: 3, backgroundColor: theme.accent },
    body: { flex: 1, padding: 14, gap: 12 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    name: { fontFamily: 'Inter_900Black', fontSize: 14, color: theme.textPrimary },
    actions: { flexDirection: 'row', gap: 8 },
    acceptBtn: { borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
    acceptText: { fontFamily: 'Inter_900Black', fontSize: 10, color: theme.bgPrimary, textTransform: 'uppercase', letterSpacing: 0.8 },
    declineBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: rgbaFromHex(ACCENT_DARK, 0.22), paddingVertical: 10, backgroundColor: rgbaFromHex(theme.panelAlt, 0.92) },
    declineText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  });
}

function createActivityStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const ACCENT_DARK = darkenColor(theme.accent, theme.isLight ? 10 : 26);
  return StyleSheet.create({
    row: {
      minHeight: 68, flexDirection: 'row', gap: 12, padding: 12,
      position: 'relative', borderRadius: 20,
      backgroundColor: '#0b0c0f', overflow: 'hidden',
      boxShadow: cbTileShadow(0.06),
      ...cbTileBorder(0.14),
    },
    line: { position: 'absolute', left: 28, top: 45, bottom: -16, width: 1, backgroundColor: rgbaFromHex(ACCENT_DARK, 0.18) },
    iconWrap: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 },
    text: { fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.accentHover, lineHeight: 18 },
    bold: { fontFamily: 'Inter_700Bold', color: theme.textPrimary },
    dim: { color: theme.textSecondary },
    topic: { fontFamily: 'Inter_600SemiBold' },
    time: { fontFamily: 'Inter_400Regular', fontSize: 10, color: theme.textSecondary, marginTop: 3 },
  });
}

function createEmptyStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const ACCENT_DARK = darkenColor(theme.accent, theme.isLight ? 10 : 26);
  return StyleSheet.create({
    wrap: {
      minHeight: 190, alignItems: 'center', justifyContent: 'center',
      gap: 11, padding: 24,
      borderRadius: 22,
      backgroundColor: '#0b0c0f', overflow: 'hidden',
      boxShadow: cbTileShadow(0.06),
      ...cbTileBorder(0.14),
    },
    icon: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: rgbaFromHex(ACCENT_DARK, 0.32) },
    title: { fontFamily: 'Inter_900Black', fontSize: 17, color: theme.textPrimary },
  });
}
