import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  RefreshControl, Alert, Modal,
  KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../../services/auth';
import { API_URL } from '../../services/api';
import { getToken } from '../../services/tokenStorage';
import HapticTouchable from '../../components/HapticTouchable';
import GeoBackground from '../../components/GeoBackground';
import PulseCubes from '../../components/PulseCubes';
import { cbTileShadow, cbTileBorder } from '../../components/NeumorphicTexture';
import SectionSidebar, { SidebarItem } from '../../components/SectionSidebar';
import { useAppTheme } from '../../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../../utils/theme';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

const CATEGORIES = ['Mathematics','Physics','Chemistry','Biology','Computer Science','History','Literature','Languages','Business','Art','Music'];
const DIFFICULTIES = ['beginner','intermediate','advanced'];
const COVER_COLORS = ['#df6b6b', '#69beb8', '#68aac7', '#e99b76', '#8dbfab', '#dcc86d'];

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

const PLAYLISTS_SIDEBAR_ITEMS: SidebarItem[] = [
  { key: 'discover', label: 'Discover' },
  { key: 'following', label: 'Following' },
  { key: 'mine', label: 'My Playlists' },
  { key: 'create', label: 'Create Playlist' },
];

async function authHeaders() {
  const token = await getToken();
  return token ? ({ Authorization: `Bearer ${token}` } as Record<string, string>) : {};
}

export default function PlaylistsScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
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
  const [showFilters, setShowFilters] = useState(false);
  const [creating, setCreating]     = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Create form
  const [newTitle, setNewTitle]     = useState('');
  const [newDesc, setNewDesc]       = useState('');
  const [newCat, setNewCat]         = useState('');
  const [newDiff, setNewDiff]       = useState('intermediate');
  const [newPublic, setNewPublic]   = useState(true);
  const DIM = selectedTheme.textSecondary;
  const ink = selectedTheme.isLight ? darkenColor(selectedTheme.accent, 34) : selectedTheme.bgPrimary;
  const DIFF_COLOR: Record<string, string> = {
    beginner: selectedTheme.success,
    intermediate: selectedTheme.accent,
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

  // Same "most followed" sort the web library uses for its popularity view --
  // applied client-side to the already-fetched (server-side is_public=true)
  // discover page, exactly like PlaylistsPage.js's sortedPlaylists('popular').
  const popular = useMemo(() => (
    tab === 'discover'
      ? [...playlists].sort((a, b) => (b.follower_count ?? 0) - (a.follower_count ?? 0)).slice(0, 10)
      : []
  ), [tab, playlists]);

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

      {/* Header */}
      <View style={s.header}>
        <HapticTouchable onPress={onBack} haptic="selection">
          <Ionicons name="chevron-back" size={22} color={selectedTheme.accentHover} />
        </HapticTouchable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.title}>playlists</Text>
          <Text style={s.subtitle}>{playlists.length} {tab} playlists</Text>
        </View>
        <HapticTouchable onPress={() => setSidebarOpen(true)} haptic="selection" accessibilityLabel="Open menu">
          <Ionicons name="menu-outline" size={24} color={selectedTheme.accentHover} />
        </HapticTouchable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={selectedTheme.accent} />}
      >
        <HapticTouchable style={s.createAction} onPress={() => setShowCreate(true)} haptic="medium" activeOpacity={0.88}>
          <Ionicons name="add" size={16} color={ink} />
          <Text style={s.createActionText}>Create Playlist</Text>
        </HapticTouchable>

        {/* Search & filter -- a single entry point into the dedicated
            search/filter page instead of a permanent row of category and
            difficulty tag chips cluttering the list. */}
        <HapticTouchable style={s.searchTrigger} onPress={() => setShowFilters(true)} haptic="selection">
          <Ionicons name="search-outline" size={15} color={DIM} />
          <Text style={s.searchTriggerText} numberOfLines={1}>
            {search || catFilter || diffFilter
              ? [search, catFilter, diffFilter].filter(Boolean).join(' · ')
              : 'search & filter playlists...'}
          </Text>
          {!!(search || catFilter || diffFilter) && <View style={s.searchTriggerBadge} />}
          <Ionicons name="options-outline" size={17} color={selectedTheme.accentHover} />
        </HapticTouchable>

        {/* Tabs */}
        <View style={s.tabRow}>
          {(['discover', 'following', 'mine'] as Tab[]).map(t => (
            <HapticTouchable key={t} style={s.tabItem} onPress={() => setTab(t)} haptic="selection">
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text>
              {tab === t && <View style={s.tabLine} />}
            </HapticTouchable>
          ))}
        </View>

        {loading ? (
          <View style={s.loading}><PulseCubes color={selectedTheme.accent} size={13} /></View>
        ) : playlists.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="library-outline" size={40} color={selectedTheme.accent} />
            <Text style={s.emptyTitle}>
              {tab === 'mine' ? 'no playlists yet' : tab === 'following' ? 'not following any' : 'no playlists found'}
            </Text>
          </View>
        ) : (
          <>
            {/* Popular public playlists -- Spotify-shelf-style horizontal row,
                only meaningful on Discover since that's the server-guaranteed
                is_public=true set (see backend/routes/playlists.py). */}
            {popular.length > 0 && (
              <View style={s.shelf}>
                <Text style={s.shelfTitle}>Popular Playlists</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shelfRow}>
                  {popular.map((pl, index) => (
                    <PopularCard
                      key={pl.id}
                      playlist={pl}
                      color={DIFF_COLOR[pl.difficulty ?? ''] ?? COVER_COLORS[index % COVER_COLORS.length]}
                      onPress={() => doFollow(pl.id, !!pl.is_following)}
                      styles={s}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={s.grid}>
              {playlists.map((pl, index) => (
                <PlaylistCard
                  key={pl.id}
                  playlist={pl}
                  color={DIFF_COLOR[pl.difficulty ?? ''] ?? COVER_COLORS[index % COVER_COLORS.length]}
                  showFollow={tab !== 'mine'}
                  onFollow={() => doFollow(pl.id, !!pl.is_following)}
                  styles={s}
                  ink={ink}
                  dim={DIM}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Create modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={m.root}>
            <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFillObject} />
            <GeoBackground />
            <View style={m.header}>
              <Text style={m.title}>new playlist</Text>
              <HapticTouchable onPress={() => setShowCreate(false)} haptic="light">
                <Ionicons name="close" size={22} color={selectedTheme.accent} />
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
                    <Text style={[m.diffText, newDiff === d && { color: DIFF_COLOR[d] }]}>{d}</Text>
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
                {creating ? <PulseCubes color={ink} size={9} /> : <Text style={m.submitText}>create playlist</Text>}
              </HapticTouchable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showFilters} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowFilters(false)}>
        <View style={m.root}>
          <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFillObject} />
          <GeoBackground />
          <View style={m.header}>
            <Text style={m.title}>search & filter</Text>
            <HapticTouchable onPress={() => setShowFilters(false)} haptic="light">
              <Ionicons name="close" size={22} color={selectedTheme.accent} />
            </HapticTouchable>
          </View>
          <ScrollView contentContainerStyle={m.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={m.label}>search</Text>
            <View style={s.searchBox}>
              <Ionicons name="search-outline" size={15} color={DIM} />
              <TextInput
                style={s.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="title, description, creator..."
                placeholderTextColor={DIM}
                autoCapitalize="none"
                returnKeyType="search"
                autoFocus
              />
              {!!search && (
                <HapticTouchable onPress={() => setSearch('')} haptic="light">
                  <Ionicons name="close-circle" size={15} color={DIM} />
                </HapticTouchable>
              )}
            </View>

            <Text style={m.label}>category</Text>
            <View style={m.chipsWrap}>
              {['', ...CATEGORIES].map(c => (
                <HapticTouchable key={c || 'all'} style={[m.chip, catFilter === c && m.chipActive]} onPress={() => setCatFilter(c)} haptic="selection">
                  <Text style={[m.chipText, catFilter === c && m.chipTextActive]}>{c || 'all subjects'}</Text>
                </HapticTouchable>
              ))}
            </View>

            <Text style={m.label}>difficulty</Text>
            <View style={m.diffRow}>
              {['', ...DIFFICULTIES].map(d => (
                <HapticTouchable key={d || 'any'} style={[m.diffBtn, diffFilter === d && m.diffBtnActive]} onPress={() => setDiffFilter(d)} haptic="selection">
                  <Text style={[m.diffText, diffFilter === d && { color: DIFF_COLOR[d] ?? selectedTheme.accentHover }]}>{d || 'any level'}</Text>
                </HapticTouchable>
              ))}
            </View>

            {!!(search || catFilter || diffFilter) && (
              <HapticTouchable style={m.clearBtn} onPress={() => { setSearch(''); setCatFilter(''); setDiffFilter(''); }} haptic="light">
                <Text style={m.clearText}>clear all filters</Text>
              </HapticTouchable>
            )}

            <HapticTouchable style={m.submit} onPress={() => setShowFilters(false)} haptic="medium">
              <Text style={m.submitText}>show results</Text>
            </HapticTouchable>
          </ScrollView>
        </View>
      </Modal>

      <SectionSidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pageTitle="playlists"
        items={PLAYLISTS_SIDEBAR_ITEMS}
        activeKey={tab}
        onSelect={(key) => {
          if (key === 'discover' || key === 'following' || key === 'mine') setTab(key);
          else if (key === 'create') setShowCreate(true);
        }}
        footerLabel="Dashboard"
        onFooterPress={onBack}
      />
    </View>
  );
}

function PopularCard({ playlist, color, onPress, styles }: {
  playlist: Playlist; color: string; onPress: () => void; styles: ReturnType<typeof createStyles>;
}) {
  return (
    <HapticTouchable style={styles.shelfCard} onPress={onPress} haptic="selection" activeOpacity={0.88}>
      <View style={[styles.shelfCover, { backgroundColor: color }]}>
        <Ionicons name={playlist.is_following ? 'checkmark-circle' : 'library'} size={22} color="#171411" />
      </View>
      <Text style={styles.shelfCardTitle} numberOfLines={2}>{playlist.title}</Text>
      <View style={styles.shelfCardMetaRow}>
        <Ionicons name="people-outline" size={10} color="#171411" style={{ opacity: 0.55 }} />
        <Text style={styles.shelfCardMeta}>{playlist.follower_count ?? 0} followers</Text>
      </View>
    </HapticTouchable>
  );
}

function PlaylistCard({ playlist, color, showFollow, onFollow, styles, ink, dim }: {
  playlist: Playlist; color: string; showFollow: boolean; onFollow: () => void;
  styles: ReturnType<typeof createStyles>; ink: string; dim: string;
}) {
  const progress = Math.round(playlist.completion_percentage ?? 0);
  return (
    <View style={styles.card}>
      <View style={[styles.cardBanner, { backgroundColor: color }]}>
        <Text style={styles.cardTitle} numberOfLines={3}>{playlist.title}</Text>
        {!!playlist.category && <Text style={styles.cardCategory}>{playlist.category.toUpperCase()}</Text>}
      </View>
      <View style={styles.cardBody}>
        {!!playlist.description && <Text style={styles.cardDesc} numberOfLines={2}>{playlist.description}</Text>}
        <View style={styles.cardStatsRow}>
          <View style={styles.statChip}><Ionicons name="people-outline" size={10} color={dim} /><Text style={styles.statText}>{playlist.follower_count ?? 0}</Text></View>
          <View style={styles.statChip}><Ionicons name="list-outline" size={10} color={dim} /><Text style={styles.statText}>{playlist.item_count ?? 0}</Text></View>
          {!!playlist.difficulty && <Text style={[styles.diffText, { color }]}>{playlist.difficulty}</Text>}
        </View>
        {progress > 0 && (
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(2, progress)}%`, backgroundColor: color }]} /></View>
        )}
        {showFollow ? (
          <HapticTouchable style={[styles.followBtn, playlist.is_following && { backgroundColor: color }]} onPress={onFollow} haptic="medium">
            <Text style={[styles.followText, playlist.is_following && { color: ink }]}>{playlist.is_following ? 'following' : 'follow'}</Text>
            {!playlist.is_following && <Ionicons name="chevron-forward" size={14} color={color} />}
          </HapticTouchable>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const surface = theme.panel;
  const surfaceAlt = theme.panelAlt;
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.16 : 0.18);
  const accentInk = theme.isLight ? darkenColor(theme.accent, 38) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    header: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 18, paddingBottom: 12 },
    title: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 32, letterSpacing: -0.8 },
    subtitle: { fontFamily: 'Inter_400Regular', fontSize: 10, color: theme.textSecondary, letterSpacing: 2.2, marginTop: 4, textTransform: 'uppercase' },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 10, paddingBottom: 118, gap: 14 },
    createAction: { width: '100%', minHeight: 54, borderRadius: 18, backgroundColor: theme.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    createActionText: { fontFamily: 'Inter_900Black', color: accentInk, fontSize: 12, letterSpacing: 4, textTransform: 'uppercase' },
    searchBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), paddingHorizontal: 14, boxShadow: cbTileShadow(0.055) },
    searchInput: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14, color: theme.textPrimary },
    searchTrigger: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), paddingHorizontal: 14, boxShadow: cbTileShadow(0.055) },
    searchTriggerText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14, color: theme.textSecondary },
    searchTriggerBadge: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accent },
    tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: border },
    tabItem: { flex: 1, alignItems: 'center', paddingBottom: 10, position: 'relative' },
    tabText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
    tabTextActive: { color: theme.accentHover },
    tabLine: { position: 'absolute', bottom: -1, left: '10%', right: '10%', height: 2, backgroundColor: theme.accent, borderRadius: 1 },
    loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 100 },
    empty: { alignItems: 'center', paddingVertical: 48, gap: 9 },
    emptyTitle: { fontFamily: 'Inter_900Black', fontSize: 18, color: theme.accentHover },

    shelf: { gap: 10 },
    shelfTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 17, letterSpacing: 0 },
    shelfRow: { gap: 10, paddingRight: 10 },
    shelfCard: { width: 118 },
    shelfCover: { width: 118, height: 118, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    shelfCardTitle: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 12, marginTop: 8, lineHeight: 16 },
    shelfCardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
    shelfCardMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10 },

    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
    card: { width: '48%', borderRadius: 17, overflow: 'hidden', boxShadow: cbTileShadow(0.06), ...cbTileBorder(0.14) },
    cardBanner: { minHeight: layout.height >= 820 ? 96 : 84, padding: 12, justifyContent: 'center' },
    cardTitle: { fontFamily: 'Inter_900Black', color: '#171411', fontSize: 13, lineHeight: 16 },
    cardCategory: { fontFamily: 'Inter_700Bold', color: rgbaFromHex('#171411', 0.66), fontSize: 9, letterSpacing: 1, marginTop: 6 },
    cardBody: { padding: 12, gap: 9, backgroundColor: rgbaFromHex(surface, 0.72) },
    cardDesc: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, lineHeight: 15 },
    cardStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    statChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    statText: { fontFamily: 'Inter_400Regular', fontSize: 10, color: theme.textSecondary },
    diffText: { fontFamily: 'Inter_700Bold', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.6, marginLeft: 'auto' },
    progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: rgbaFromHex(theme.accent, 0.14) },
    progressFill: { height: '100%', borderRadius: 2 },
    followBtn: { height: 36, borderRadius: 11, borderWidth: 1, borderColor: border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
    followText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: theme.accentHover, textTransform: 'uppercase', letterSpacing: 0.6 },
  });
}

function createModalStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const ACCENT = theme.accent;
  const ACCENT_HOVER = theme.accentHover;
  const DIM = theme.textSecondary;
  const SURFACE_ALT = theme.panelAlt;
  const BORDER = theme.borderStrong;
  return StyleSheet.create({
    root: { flex: 1, paddingTop: 20 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 20 },
    title: { fontFamily: 'Inter_900Black', fontSize: 24, color: ACCENT_HOVER },
    body: { paddingHorizontal: 24, gap: 6, paddingBottom: 60 },
    label: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: DIM, letterSpacing: 1, marginTop: 10 },
    input: { backgroundColor: SURFACE_ALT, borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'Inter_400Regular', fontSize: 14, color: ACCENT_HOVER, marginTop: 4 },
    chips: { gap: 8, paddingVertical: 6, flexDirection: 'row' },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 6 },
    chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE_ALT },
    chipActive: { backgroundColor: rgbaFromHex(ACCENT, 0.16), borderColor: rgbaFromHex(ACCENT, 0.34) },
    chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: DIM },
    chipTextActive: { color: ACCENT_HOVER },
    diffRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
    diffBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE_ALT },
    diffBtnActive: { borderColor: rgbaFromHex(ACCENT, 0.34), backgroundColor: rgbaFromHex(ACCENT, 0.14) },
    diffText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: DIM },
    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
    clearBtn: { alignItems: 'center', marginTop: 18 },
    clearText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: theme.danger, letterSpacing: 0.6, textTransform: 'uppercase' },
    submit: { marginTop: 16, height: 52, borderRadius: 14, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    submitText: { fontFamily: 'Inter_900Black', fontSize: 15, color: theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary },
  });
}
