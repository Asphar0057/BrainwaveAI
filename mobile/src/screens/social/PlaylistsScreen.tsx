import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  ActivityIndicator, RefreshControl, Alert, Modal,
  KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../../services/auth';
import { API_URL } from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HapticTouchable from '../../components/HapticTouchable';
import AmbientBubbles from '../../components/AmbientBubbles';
import GeoBackground from '../../components/GeoBackground';
import { useAppTheme } from '../../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../../utils/theme';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

const CATEGORIES = ['Mathematics','Physics','Chemistry','Biology','Computer Science','History','Literature','Languages','Business','Art','Music'];
const DIFFICULTIES = ['beginner','intermediate','advanced'];

type Playlist = {
  id: number;
  title: string;
  description?: string;
  category?: string;
  difficulty?: string;
  is_public?: boolean;
  is_following?: boolean;
  follower_count?: number;
  item_count?: number;
  creator_username?: string;
  completion_percentage?: number;
};

type Tab = 'discover' | 'following' | 'mine';
type Props = { user: AuthUser; onBack: () => void };

async function authHeaders() {
  const token = await AsyncStorage.getItem('token');
  return token ? ({ Authorization: `Bearer ${token}` } as Record<string, string>) : {};
}

export default function PlaylistsScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const pc = useMemo(() => createPlaylistCardStyles(selectedTheme), [selectedTheme]);
  const m = useMemo(() => createModalStyles(selectedTheme), [selectedTheme]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const [tab, setTab]               = useState<Tab>('discover');
  const [playlists, setPlaylists]   = useState<Playlist[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState('');
  const [diffFilter, setDiffFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating]     = useState(false);
  // Create form
  const [newTitle, setNewTitle]     = useState('');
  const [newDesc, setNewDesc]       = useState('');
  const [newCat, setNewCat]         = useState('');
  const [newDiff, setNewDiff]       = useState('intermediate');
  const [newPublic, setNewPublic]   = useState(true);
  const GOLD_XL = selectedTheme.accent;
  const GOLD_L = selectedTheme.accentHover;
  const GOLD_M = selectedTheme.accent;
  const GOLD_D = darkenColor(selectedTheme.accent, selectedTheme.isLight ? 12 : 26);
  const DIM = selectedTheme.textSecondary;
  const INK = selectedTheme.isLight ? darkenColor(selectedTheme.accent, 34) : selectedTheme.bgPrimary;
  const DIFF_COLOR: Record<string, string> = {
    beginner: selectedTheme.success,
    intermediate: GOLD_M,
    advanced: selectedTheme.danger,
  };
  const switchTrackOff = rgbaFromHex(selectedTheme.accent, selectedTheme.isLight ? 0.18 : 0.24);
  const switchTrackOn = rgbaFromHex(selectedTheme.accent, selectedTheme.isLight ? 0.38 : 0.48);
  const switchThumbOff = selectedTheme.isLight ? selectedTheme.panelAlt : selectedTheme.textSecondary;
  const switchThumbOn = selectedTheme.isLight ? darkenColor(selectedTheme.accent, 18) : selectedTheme.accentHover;

  const load = useCallback(async () => {
    try {
      const headers = await authHeaders();
      let url = `${API_URL}/playlists?`;
      if (tab === 'mine')      url += 'my_playlists=true&';
      if (tab === 'following') url += 'following=true&';
      if (catFilter)  url += `category=${encodeURIComponent(catFilter)}&`;
      if (diffFilter) url += `difficulty=${encodeURIComponent(diffFilter)}&`;
      if (search)     url += `search=${encodeURIComponent(search)}&`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        setPlaylists(data.playlists ?? []);
      }
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab, catFilter, diffFilter, search]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const doFollow = async (id: number, currently: boolean) => {
    try {
      const headers = await authHeaders();
      await fetch(`${API_URL}/playlists/${id}/follow`, {
        method: currently ? 'DELETE' : 'POST',
        headers,
      });
      setPlaylists(p => p.map(pl => pl.id !== id ? pl : {
        ...pl,
        is_following: !currently,
        follower_count: (pl.follower_count ?? 0) + (currently ? -1 : 1),
      }));
    } catch {}
  };

  const doCreate = async () => {
    if (!newTitle.trim()) { Alert.alert('Enter a title'); return; }
    setCreating(true);
    try {
      const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' };
      const res = await fetch(`${API_URL}/playlists`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc.trim(),
          category: newCat || undefined,
          difficulty: newDiff,
          is_public: newPublic,
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setNewTitle(''); setNewDesc(''); setNewCat(''); setNewDiff('intermediate'); setNewPublic(true);
        setTab('mine');
        load();
      } else {
        Alert.alert('Failed to create playlist');
      }
    } catch { Alert.alert('Network error'); }
    finally { setCreating(false); }
  };

  if (!fontsLoaded) return null;

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <AmbientBubbles theme={selectedTheme} variant="playlists" opacity={0.8} />

      {/* Header */}
      <View>
        <View style={s.topBar}>
          <HapticTouchable onPress={onBack} style={s.backBtn} haptic="light">
            <Ionicons name="chevron-back" size={18} color={GOLD_M} />
          </HapticTouchable>
          <HapticTouchable onPress={() => setShowCreate(true)} haptic="medium">
            <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={s.cta}>
              <Text style={s.ctaText}>+ new</Text>
            </LinearGradient>
          </HapticTouchable>
        </View>

        {/* Hero */}
        <View style={s.hero}>
          <Ionicons name="library" size={32} color={GOLD_XL} />
          <View style={s.heroText}>
            <Text style={s.heroTitle}>playlists</Text>
            <Text style={s.heroSub}>discover · follow · create</Text>
          </View>
        </View>

        {/* Search */}
        <View style={s.searchWrap}>
          <LinearGradient colors={[rgbaFromHex(selectedTheme.accent, 0.16), rgbaFromHex(selectedTheme.panelAlt, 0.98)]} style={s.searchBorder}>
            <View style={s.searchInner}>
              <Ionicons name="search-outline" size={14} color={GOLD_D} />
              <TextInput
                style={s.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="search playlists..."
                placeholderTextColor={DIM}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {!!search && (
                <HapticTouchable onPress={() => setSearch('')} haptic="light">
                  <Ionicons name="close-circle" size={15} color={DIM} />
                </HapticTouchable>
              )}
            </View>
          </LinearGradient>
        </View>

        {/* Tabs */}
        <View style={s.tabRow}>
          {(['discover', 'following', 'mine'] as Tab[]).map(t => (
            <HapticTouchable key={t} style={s.tabItem} onPress={() => setTab(t)} haptic="selection">
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text>
              {tab === t && <View style={s.tabLine} />}
            </HapticTouchable>
          ))}
        </View>
      </View>

      {/* Category filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={{ maxHeight: 44 }}>
        {['', ...CATEGORIES].map(c => (
          <HapticTouchable key={c || 'all'} style={[s.chip, catFilter === c && s.chipActive]} onPress={() => setCatFilter(c)} haptic="selection">
            <Text style={[s.chipText, catFilter === c && s.chipTextActive]}>{c || 'all'}</Text>
          </HapticTouchable>
        ))}
      </ScrollView>

      {/* Difficulty chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.chips, { paddingTop: 0, paddingBottom: 8 }]} style={{ maxHeight: 38 }}>
        {['', ...DIFFICULTIES].map(d => (
          <HapticTouchable key={d || 'any'} style={[s.chip, diffFilter === d && s.chipActive]} onPress={() => setDiffFilter(d)} haptic="selection">
            <Text style={[s.chipText, diffFilter === d && s.chipTextActive]}>{d || 'any level'}</Text>
          </HapticTouchable>
        ))}
      </ScrollView>

      {/* List */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={GOLD_M} size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD_M} />}
        >
          {playlists.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="library-outline" size={40} color={GOLD_D} />
              <Text style={s.emptyTitle}>{tab === 'mine' ? 'no playlists yet' : tab === 'following' ? 'not following any' : 'no playlists found'}</Text>
              <Text style={s.emptyHint}>{tab === 'mine' ? 'tap + new to create one' : 'try a different filter'}</Text>
            </View>
          ) : playlists.map((pl) => (
            <View key={pl.id} style={pc.wrap}>
              <View style={pc.accent} />
              <View style={pc.body}>
                <View style={pc.topRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={pc.title} numberOfLines={2}>{pl.title}</Text>
                    {!!pl.description && <Text style={pc.desc} numberOfLines={1}>{pl.description}</Text>}
                  </View>
                  {tab !== 'mine' && (
                    <HapticTouchable
                      style={[pc.followBtn, pl.is_following && pc.followBtnActive]}
                      onPress={() => doFollow(pl.id, !!pl.is_following)}
                      haptic="medium"
                    >
                      <Text style={[pc.followText, pl.is_following && pc.followTextActive]}>
                        {pl.is_following ? 'following' : 'follow'}
                      </Text>
                    </HapticTouchable>
                  )}
                </View>

                <View style={pc.metaRow}>
                  {!!pl.category && (
                    <View style={pc.catPill}>
                      <Text style={pc.catText}>{pl.category}</Text>
                    </View>
                  )}
                  {!!pl.difficulty && (
                    <View style={[pc.diffPill, { borderColor: (DIFF_COLOR[pl.difficulty] ?? GOLD_D) + '60' }]}>
                      <Text style={[pc.diffText, { color: DIFF_COLOR[pl.difficulty] ?? GOLD_M }]}>{pl.difficulty}</Text>
                    </View>
                  )}
                  <View style={pc.statChip}>
                    <Ionicons name="people-outline" size={10} color={DIM} />
                    <Text style={pc.statText}>{pl.follower_count ?? 0}</Text>
                  </View>
                  {(pl.item_count ?? 0) > 0 && (
                    <View style={pc.statChip}>
                      <Ionicons name="list-outline" size={10} color={DIM} />
                      <Text style={pc.statText}>{pl.item_count} items</Text>
                    </View>
                  )}
                </View>

                {(pl.completion_percentage ?? 0) > 0 && (
                  <View style={pc.progressRow}>
                    <View style={pc.progressTrack}>
                      <View style={[pc.progressFill, { width: `${pl.completion_percentage}%` as any }]} />
                    </View>
                    <Text style={pc.progressPct}>{Math.round(pl.completion_percentage ?? 0)}%</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Create modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={m.root}>
            <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFillObject} />
            <GeoBackground />
            <View style={m.header}>
              <Text style={m.title}>new playlist</Text>
              <HapticTouchable onPress={() => setShowCreate(false)} haptic="light">
                <Ionicons name="close" size={22} color={GOLD_M} />
              </HapticTouchable>
            </View>
            <ScrollView contentContainerStyle={m.body} showsVerticalScrollIndicator={false}>
              <Text style={m.label}>title</Text>
              <TextInput style={m.input} value={newTitle} onChangeText={setNewTitle} placeholder="playlist title..." placeholderTextColor={DIM} />

              <Text style={m.label}>description</Text>
              <TextInput style={[m.input, { height: 80 }]} value={newDesc} onChangeText={setNewDesc} placeholder="what's this about..." placeholderTextColor={DIM} multiline />

              <Text style={m.label}>category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={m.chips}>
                {CATEGORIES.map(c => (
                  <HapticTouchable key={c} style={[m.chip, newCat === c && m.chipActive]} onPress={() => setNewCat(c === newCat ? '' : c)} haptic="selection">
                    <Text style={[m.chipText, newCat === c && m.chipTextActive]}>{c}</Text>
                  </HapticTouchable>
                ))}
              </ScrollView>

              <Text style={m.label}>difficulty</Text>
              <View style={m.diffRow}>
                {DIFFICULTIES.map(d => (
                  <HapticTouchable key={d} style={[m.diffBtn, newDiff === d && m.diffBtnActive]} onPress={() => setNewDiff(d)} haptic="selection">
                    <Text style={[m.diffText, newDiff === d && { color: DIFF_COLOR[d] ?? GOLD_M }]}>{d}</Text>
                  </HapticTouchable>
                ))}
              </View>

              <View style={m.toggleRow}>
                <Text style={m.label}>public</Text>
                <Switch
                  value={newPublic}
                  onValueChange={setNewPublic}
                  trackColor={{ true: switchTrackOn, false: switchTrackOff }}
                  thumbColor={newPublic ? switchThumbOn : switchThumbOff}
                  ios_backgroundColor={switchTrackOff}
                />
              </View>

              <HapticTouchable style={m.submit} onPress={doCreate} haptic="medium" disabled={creating}>
                <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={m.submitGrad}>
                  {creating ? <ActivityIndicator color={INK} size="small" /> : <Text style={m.submitText}>create playlist</Text>}
                </LinearGradient>
              </HapticTouchable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const ACCENT = theme.accent;
  const ACCENT_HOVER = theme.accentHover;
  const ACCENT_DARK = darkenColor(theme.accent, theme.isLight ? 12 : 26);
  const DIM = theme.textSecondary;
  const SURFACE = theme.panel;
  const SURFACE_ALT = theme.panelAlt;
  const BORDER = theme.borderStrong;
  const INK = theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1 },
    topBar: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 },
    backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: rgbaFromHex(SURFACE, 0.92), borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
    cta: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
    ctaText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: INK },
    hero: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14, gap: 14 },
    heroText: { gap: 2 },
    heroTitle: { fontFamily: 'Inter_900Black', fontSize: 34, color: ACCENT_HOVER, letterSpacing: -1.2 },
    heroSub: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, letterSpacing: 1.8, textTransform: 'uppercase' },
    searchWrap: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 20, marginBottom: 10 },
    searchBorder: { borderRadius: 14, padding: 1 },
    searchInner: { flexDirection: 'row', alignItems: 'center', backgroundColor: SURFACE_ALT, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
    searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: ACCENT_HOVER },
    tabRow: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', flexDirection: 'row', marginHorizontal: 20, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: BORDER },
    tabItem: { flex: 1, alignItems: 'center', paddingBottom: 10, position: 'relative' },
    tabText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: DIM },
    tabTextActive: { color: ACCENT_HOVER },
    tabLine: { position: 'absolute', bottom: -1, left: '10%', right: '10%', height: 2, backgroundColor: ACCENT, borderRadius: 1 },
    chips: { paddingHorizontal: 20, paddingVertical: 8, gap: 8, flexDirection: 'row' },
    chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: rgbaFromHex(SURFACE, 0.84) },
    chipActive: { backgroundColor: rgbaFromHex(ACCENT, 0.16), borderColor: rgbaFromHex(ACCENT, 0.34) },
    chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: DIM },
    chipTextActive: { color: ACCENT_HOVER },
    list: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 60, gap: 10 },
    empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
    emptyTitle: { fontFamily: 'Inter_900Black', fontSize: 18, color: ACCENT_DARK },
    emptyHint: { fontFamily: 'Inter_400Regular', fontSize: 13, color: DIM },
  });
}

function createPlaylistCardStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const ACCENT = theme.accent;
  const ACCENT_HOVER = theme.accentHover;
  const ACCENT_DARK = darkenColor(theme.accent, theme.isLight ? 12 : 26);
  const DIM = theme.textSecondary;
  const SURFACE = theme.panel;
  const BORDER = theme.borderStrong;
  return StyleSheet.create({
    wrap: { flexDirection: 'row', backgroundColor: rgbaFromHex(SURFACE, 0.94), borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: BORDER, shadowColor: ACCENT, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 22, elevation: 4 },
    accent: { width: 3, backgroundColor: ACCENT_DARK },
    body: { flex: 1, padding: 14, gap: 8 },
    topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    title: { fontFamily: 'Inter_900Black', fontSize: 15, color: ACCENT_HOVER, lineHeight: 20 },
    desc: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginTop: 2 },
    followBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: rgbaFromHex(ACCENT, 0.28), backgroundColor: rgbaFromHex(ACCENT, 0.12) },
    followBtnActive: { backgroundColor: rgbaFromHex(ACCENT, 0.20), borderColor: rgbaFromHex(ACCENT, 0.42) },
    followText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: ACCENT_HOVER },
    followTextActive: { color: ACCENT },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    catPill: { backgroundColor: rgbaFromHex(ACCENT, 0.12), borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: rgbaFromHex(ACCENT, 0.22) },
    catText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: ACCENT },
    diffPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, backgroundColor: 'transparent' },
    diffText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
    statChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    statText: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    progressTrack: { flex: 1, height: 3, backgroundColor: rgbaFromHex(ACCENT, 0.14), borderRadius: 2, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 2 },
    progressPct: { fontFamily: 'Inter_700Bold', fontSize: 10, color: ACCENT, width: 28, textAlign: 'right' },
  });
}

function createModalStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const ACCENT = theme.accent;
  const ACCENT_HOVER = theme.accentHover;
  const DIM = theme.textSecondary;
  const SURFACE_ALT = theme.panelAlt;
  const BORDER = theme.borderStrong;
  const INK = theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1, paddingTop: 20 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 20 },
    title: { fontFamily: 'Inter_900Black', fontSize: 24, color: ACCENT_HOVER },
    body: { paddingHorizontal: 24, gap: 6, paddingBottom: 60 },
    label: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: DIM, letterSpacing: 1, marginTop: 10 },
    input: { backgroundColor: SURFACE_ALT, borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'Inter_400Regular', fontSize: 14, color: ACCENT_HOVER, marginTop: 4 },
    chips: { gap: 8, paddingVertical: 6, flexDirection: 'row' },
    chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE_ALT },
    chipActive: { backgroundColor: rgbaFromHex(ACCENT, 0.16), borderColor: rgbaFromHex(ACCENT, 0.34) },
    chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: DIM },
    chipTextActive: { color: ACCENT_HOVER },
    diffRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
    diffBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE_ALT },
    diffBtnActive: { borderColor: rgbaFromHex(ACCENT, 0.34), backgroundColor: rgbaFromHex(ACCENT, 0.14) },
    diffText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: DIM },
    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
    submit: { marginTop: 24, borderRadius: 14, overflow: 'hidden' },
    submitGrad: { paddingVertical: 16, alignItems: 'center' },
    submitText: { fontFamily: 'Inter_900Black', fontSize: 15, color: INK },
  });
}
