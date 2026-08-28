import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, ViewStyle, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import {
  getSharedWithMe, getSharedContentDetail, removeSharedAccess, shareContent,
  getFriends, getNotes, getChatSessions, SharedItem,
} from '../services/api';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import MarkdownText from '../components/MarkdownText';
import PulseCubes from '../components/PulseCubes';
import SectionSidebar, { SidebarItem } from '../components/SectionSidebar';
import { cbTileShadow, cbTileBorder } from '../components/NeumorphicTexture';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { triggerHaptic } from '../utils/haptics';

type Props = { user: AuthUser; onBack: () => void };
type Detail = {
  content_type: 'note' | 'chat';
  title: string;
  content?: string;
  messages?: { user_message: string; ai_response: string; timestamp: string }[];
};
type Filter = 'all' | 'chat' | 'note';
type MyContentItem = { id: number; title: string; type: 'note' | 'chat' };

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const SHARED_SIDEBAR_BASE: SidebarItem[] = [
  { key: 'all', label: 'All Content' },
  { key: 'chat', label: 'AI Chats' },
  { key: 'note', label: 'Notes' },
];

export default function SharedWithMeScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });
  const ink = selectedTheme.isLight ? darkenColor(selectedTheme.accent, 34) : selectedTheme.bgPrimary;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<SharedItem[]>([]);
  const [detailItem, setDetailItem] = useState<SharedItem | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  // Share-new-content flow: pick one of my notes/chats, then pick friends.
  const [showPicker, setShowPicker] = useState(false);
  const [pickerFilter, setPickerFilter] = useState<'all' | 'note' | 'chat'>('all');
  const [myContent, setMyContent] = useState<MyContentItem[]>([]);
  const [loadingMyContent, setLoadingMyContent] = useState(false);
  const [shareTarget, setShareTarget] = useState<MyContentItem | null>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<number>>(new Set());
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getSharedWithMe();
      setItems(data.shared_items ?? []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!fontsLoaded) return null;

  const openItem = async (item: SharedItem) => {
    setDetailItem(item);
    setLoadingDetail(true);
    try {
      const data = await getSharedContentDetail(item.content_type, item.content_id);
      setDetail(data);
    } catch (error) {
      Alert.alert('Could not open', error instanceof Error ? error.message : 'Please try again.');
      setDetailItem(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const removeAccess = (item: SharedItem) => {
    Alert.alert('Remove from shared?', item.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setItems((current) => current.filter((i) => i.id !== item.id));
          try {
            await removeSharedAccess(item.id);
          } catch {
            // silenced
          }
        },
      },
    ]);
  };

  const openPicker = async () => {
    setShowPicker(true);
    if (myContent.length === 0) {
      setLoadingMyContent(true);
      try {
        const [notesData, chatsData] = await Promise.all([
          getNotes(user.username).catch(() => []),
          getChatSessions(user.username).catch(() => ({ sessions: [] })),
        ]);
        const notes: MyContentItem[] = (Array.isArray(notesData) ? notesData : []).map((n: any) => ({ id: n.id, title: n.title || 'untitled note', type: 'note' as const }));
        const chats: MyContentItem[] = (chatsData?.sessions ?? []).map((c: any) => ({ id: c.id, title: c.title || 'untitled chat', type: 'chat' as const }));
        setMyContent([...notes, ...chats]);
      } finally {
        setLoadingMyContent(false);
      }
    }
  };

  const pickToShare = async (item: MyContentItem) => {
    setShareTarget(item);
    setSelectedFriendIds(new Set());
    if (friends.length === 0) {
      try {
        const data = await getFriends(user.username);
        setFriends(Array.isArray(data) ? data : data?.friends ?? []);
      } catch {
        setFriends([]);
      }
    }
  };

  const toggleFriendSelected = (friendId: number) => {
    setSelectedFriendIds((current) => {
      const next = new Set(current);
      if (next.has(friendId)) next.delete(friendId);
      else next.add(friendId);
      return next;
    });
  };

  const submitShare = async () => {
    if (!shareTarget || selectedFriendIds.size === 0) return;
    setSharing(true);
    try {
      await shareContent({ contentType: shareTarget.type, contentId: shareTarget.id, friendIds: Array.from(selectedFriendIds) });
      setShareTarget(null);
      setShowPicker(false);
      triggerHaptic('success');
    } catch (error) {
      Alert.alert('Share failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSharing(false);
    }
  };

  const chatCount = items.filter((i) => i.content_type === 'chat').length;
  const noteCount = items.filter((i) => i.content_type === 'note').length;
  const sidebarItems: SidebarItem[] = SHARED_SIDEBAR_BASE.map((item) => ({
    ...item,
    badge: item.key === 'all' ? items.length : item.key === 'chat' ? chatCount : noteCount,
  }));

  const filteredItems = items.filter((item) => {
    if (filter !== 'all' && item.content_type !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!item.title.toLowerCase().includes(q) && !item.shared_by.username.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const filteredMyContent = myContent.filter((item) => pickerFilter === 'all' || item.type === pickerFilter);

  if (detailItem) {
    return (
      <View style={s.root}>
        <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
        <GeoBackground />
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.header}>
            <HapticTouchable onPress={() => { setDetailItem(null); setDetail(null); }} haptic="selection">
              <Ionicons name="chevron-back" size={22} color={selectedTheme.accentHover} />
            </HapticTouchable>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.kicker}>SHARED BY {detailItem.shared_by.username.toUpperCase()}</Text>
              <Text style={s.title} numberOfLines={2}>{detail?.title || detailItem.title}</Text>
            </View>
          </View>

          {loadingDetail ? (
            <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 60 }} />
          ) : detail?.content_type === 'note' ? (
            <View style={s.card}>
              <MarkdownText>{detail.content || ''}</MarkdownText>
            </View>
          ) : detail?.content_type === 'chat' ? (
            <View style={{ gap: 10 }}>
              {(detail.messages ?? []).map((m, i) => (
                <View key={i} style={s.card}>
                  <Text style={s.chatUserMsg}>{m.user_message}</Text>
                  <Text style={s.chatAiMsg}>{m.ai_response}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />

      <View style={s.header}>
        <HapticTouchable onPress={onBack} haptic="selection">
          <Ionicons name="chevron-back" size={22} color={selectedTheme.accentHover} />
        </HapticTouchable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.title}>shared with me</Text>
        </View>
        <HapticTouchable onPress={() => setSidebarOpen(true)} haptic="selection" accessibilityLabel="Open menu">
          <Ionicons name="menu-outline" size={24} color={selectedTheme.accentHover} />
        </HapticTouchable>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={selectedTheme.accent} />}
      >
        <HapticTouchable style={s.shareAction} onPress={openPicker} haptic="medium" activeOpacity={0.88}>
          <Ionicons name="share-social-outline" size={16} color={ink} />
          <Text style={s.shareActionText}>Share something of yours</Text>
        </HapticTouchable>

        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={15} color={selectedTheme.textSecondary} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="search shared content..."
            placeholderTextColor={selectedTheme.textSecondary}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {!!search && (
            <HapticTouchable onPress={() => setSearch('')} haptic="light">
              <Ionicons name="close-circle" size={15} color={selectedTheme.textSecondary} />
            </HapticTouchable>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 80 }} />
        ) : loadError ? (
          <HapticTouchable onPress={load} haptic="light" style={s.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={selectedTheme.danger} />
            <Text style={s.errorBannerText}>couldn't load — tap to retry</Text>
          </HapticTouchable>
        ) : filteredItems.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={30} color={selectedTheme.accent} />
            <Text style={s.emptyTitle}>{search || filter !== 'all' ? 'nothing matches' : 'nothing shared yet'}</Text>
            <Text style={s.emptyText}>
              {search || filter !== 'all' ? 'try a different search or filter' : 'notes and chats friends share with you show up here'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {filteredItems.map((item) => (
              <HapticTouchable key={item.id} style={s.row} onPress={() => openItem(item)} onLongPress={() => removeAccess(item)} haptic="none">
                <View style={s.rowIcon}>
                  <Ionicons name={item.content_type === 'note' ? 'document-text-outline' : 'chatbubble-ellipses-outline'} size={16} color={selectedTheme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.rowMeta}>from {item.shared_by.username} · {timeAgo(item.shared_at)}</Text>
                  {item.message ? <Text style={s.rowMessage} numberOfLines={1}>"{item.message}"</Text> : null}
                </View>
                <View style={[s.permBadge, item.permission === 'edit' && s.permBadgeEdit]}>
                  <Ionicons name={item.permission === 'view' ? 'eye-outline' : 'create-outline'} size={11} color={item.permission === 'view' ? selectedTheme.textSecondary : selectedTheme.accentHover} />
                  <Text style={[s.permBadgeText, item.permission === 'edit' && s.permBadgeTextEdit]}>{item.permission === 'view' ? 'view' : 'edit'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={selectedTheme.textSecondary} />
              </HapticTouchable>
            ))}
            <Text style={s.hintFooter}>long-press an item to remove it from your shared list</Text>
          </View>
        )}
      </ScrollView>

      <SectionSidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pageTitle="shared"
        kicker="FROM YOUR CIRCLE"
        items={sidebarItems}
        activeKey={filter}
        onSelect={(key) => setFilter(key as Filter)}
        footerLabel="Dashboard"
        onFooterPress={onBack}
      />

      {/* Step 1: pick one of my notes/chats to share. */}
      <Modal visible={showPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPicker(false)}>
        <View style={s.modalRoot}>
          <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFillObject} />
          <GeoBackground />
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>share something</Text>
            <HapticTouchable onPress={() => setShowPicker(false)} haptic="light">
              <Ionicons name="close" size={22} color={selectedTheme.accent} />
            </HapticTouchable>
          </View>

          <View style={s.pickerTabs}>
            {(['all', 'note', 'chat'] as const).map((f) => (
              <HapticTouchable key={f} style={[s.pickerTab, pickerFilter === f && s.pickerTabActive]} onPress={() => setPickerFilter(f)} haptic="selection">
                <Text style={[s.pickerTabText, pickerFilter === f && s.pickerTabTextActive]}>{f === 'all' ? 'all' : f === 'note' ? 'notes' : 'chats'}</Text>
              </HapticTouchable>
            ))}
          </View>

          {loadingMyContent ? (
            <View style={{ marginTop: 40, alignItems: 'center' }}><PulseCubes color={selectedTheme.accent} size={13} /></View>
          ) : filteredMyContent.length === 0 ? (
            <Text style={s.emptyText}>nothing to share yet</Text>
          ) : (
            <ScrollView contentContainerStyle={s.modalBody} showsVerticalScrollIndicator={false}>
              {filteredMyContent.map((item) => (
                <HapticTouchable key={`${item.type}-${item.id}`} style={s.pickerRow} onPress={() => pickToShare(item)} haptic="selection">
                  <View style={s.rowIcon}>
                    <Ionicons name={item.type === 'note' ? 'document-text-outline' : 'chatbubble-ellipses-outline'} size={16} color={selectedTheme.accent} />
                  </View>
                  <Text style={s.pickerRowTitle} numberOfLines={1}>{item.title}</Text>
                  <Ionicons name="chevron-forward" size={14} color={selectedTheme.textSecondary} />
                </HapticTouchable>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Step 2: pick friends to share the chosen item with. */}
      <Modal transparent visible={!!shareTarget} animationType="fade" onRequestClose={() => setShareTarget(null)}>
        <View style={s.centerOverlay}>
          <HapticTouchable style={StyleSheet.absoluteFill} onPress={() => setShareTarget(null)} activeOpacity={1} haptic="none" />
          <View style={s.centerCard}>
            <Text style={s.centerCardTitle}>share "{shareTarget?.title || 'this'}"</Text>
            {friends.length === 0 ? (
              <Text style={s.centerCardSub}>add friends to share directly with them</Text>
            ) : (
              <>
                <Text style={s.centerCardSub}>share with friends</Text>
                <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                  {friends.map((f: any) => {
                    const selected = selectedFriendIds.has(f.id);
                    return (
                      <HapticTouchable key={f.id} style={s.friendRow} onPress={() => toggleFriendSelected(f.id)} haptic="selection">
                        <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={18} color={selected ? selectedTheme.accentHover : selectedTheme.textSecondary} />
                        <Text style={s.friendRowText}>{f.username || f.friend_username || f.name || '?'}</Text>
                      </HapticTouchable>
                    );
                  })}
                </ScrollView>
                <View style={s.centerCardActions}>
                  <HapticTouchable style={s.centerCardCancel} onPress={() => setShareTarget(null)} haptic="light">
                    <Text style={s.centerCardCancelText}>cancel</Text>
                  </HapticTouchable>
                  <HapticTouchable style={s.centerCardSave} onPress={submitShare} haptic="medium" disabled={sharing || selectedFriendIds.size === 0}>
                    {sharing ? <ActivityIndicator size="small" color={selectedTheme.bgPrimary} /> : <Text style={s.centerCardSaveText}>share</Text>}
                  </HapticTouchable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const surface = theme.panel;
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.18 : 0.2);
  const ink = theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    header: {
      width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center',
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 10, paddingTop: 18, paddingBottom: 12,
    },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 4, paddingBottom: 110, gap: 12 },
    kicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 10, letterSpacing: 1.7 },
    title: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 32, letterSpacing: -0.8 },

    shareAction: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      height: 48, borderRadius: 14, backgroundColor: theme.accent,
      marginHorizontal: 6,
    } as ViewStyle,
    shareActionText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: ink },

    searchBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), paddingHorizontal: 14, marginHorizontal: 6, boxShadow: cbTileShadow(0.055) },
    searchInput: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14, color: theme.textPrimary },

    errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: rgbaFromHex(theme.danger, 0.3), backgroundColor: rgbaFromHex(theme.danger, 0.1), paddingHorizontal: 14, paddingVertical: 10, marginHorizontal: 6 } as ViewStyle,
    errorBannerText: { fontFamily: 'Inter_600SemiBold', color: theme.danger, fontSize: 12 },
    empty: { alignItems: 'center', gap: 6, paddingVertical: 70, paddingHorizontal: 20 },
    emptyTitle: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 13, marginTop: 4 },
    emptyText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11.5, textAlign: 'center' },

    row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.9), paddingHorizontal: 14, paddingVertical: 13, marginHorizontal: 6, boxShadow: cbTileShadow(0.05) } as ViewStyle,
    rowIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(theme.accent, 0.14) },
    rowTitle: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 13 },
    rowMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10.5, marginTop: 2 },
    rowMessage: { fontFamily: 'Inter_400Regular', color: theme.accentHover, fontSize: 11, marginTop: 3, fontStyle: 'italic' },
    hintFooter: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10, textAlign: 'center', marginTop: 6 },

    permBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, backgroundColor: rgbaFromHex(theme.textSecondary, 0.12) },
    permBadgeEdit: { backgroundColor: rgbaFromHex(theme.accent, 0.16) },
    permBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 9, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
    permBadgeTextEdit: { color: theme.accentHover },

    card: { borderRadius: 18, backgroundColor: rgbaFromHex(surface, 0.9), padding: 16, gap: 8, marginBottom: 4, marginHorizontal: 6, overflow: 'hidden', boxShadow: cbTileShadow(0.05), ...cbTileBorder(0.13) } as ViewStyle,
    chatUserMsg: { fontFamily: 'Inter_600SemiBold', color: theme.accentHover, fontSize: 13, lineHeight: 19 },
    chatAiMsg: { fontFamily: 'Inter_400Regular', color: theme.textPrimary, fontSize: 13, lineHeight: 19 },

    // Share-flow modals
    modalRoot: { flex: 1, paddingTop: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 16 },
    modalTitle: { fontFamily: 'Inter_900Black', fontSize: 24, color: theme.accentHover },
    modalBody: { paddingHorizontal: 18, paddingBottom: 60, gap: 8 },
    pickerTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 24, marginBottom: 14 },
    pickerTab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72) },
    pickerTabActive: { backgroundColor: rgbaFromHex(theme.accent, 0.16), borderColor: rgbaFromHex(theme.accent, 0.34) },
    pickerTabText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
    pickerTabTextActive: { color: theme.accentHover },
    pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.9), paddingHorizontal: 14, paddingVertical: 12 } as ViewStyle,
    pickerRowTitle: { flex: 1, fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 13 },

    centerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    centerCard: { width: '100%', maxWidth: 380, borderRadius: 22, backgroundColor: theme.panel, padding: 20, gap: 10, boxShadow: cbTileShadow(0.14), ...cbTileBorder(0.16) } as ViewStyle,
    centerCardTitle: { fontFamily: 'Inter_900Black', fontSize: 17, color: theme.accentHover },
    centerCardSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.textSecondary, marginBottom: 4 },
    friendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    friendRowText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: theme.textPrimary },
    centerCardActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
    centerCardCancel: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(theme.textSecondary, 0.14) },
    centerCardCancelText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: theme.textSecondary },
    centerCardSave: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent },
    centerCardSaveText: { fontFamily: 'Inter_900Black', fontSize: 13, color: ink },
  });
}
