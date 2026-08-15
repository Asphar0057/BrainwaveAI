import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import { getSharedWithMe, getSharedContentDetail, removeSharedAccess, SharedItem } from '../services/api';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import MarkdownText from '../components/MarkdownText';
import { cbTileShadow } from '../components/NeumorphicTexture';
import { useAppTheme } from '../contexts/ThemeContext';
import { rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = { user: AuthUser; onBack: () => void };
type Detail = {
  content_type: 'note' | 'chat';
  title: string;
  content?: string;
  messages?: { user_message: string; ai_response: string; timestamp: string }[];
};

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

export default function SharedWithMeScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(selectedTheme, layout, insets.top), [selectedTheme, layout, insets.top]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<SharedItem[]>([]);
  const [detailItem, setDetailItem] = useState<SharedItem | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadError, setLoadError] = useState(false);

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

  if (detailItem) {
    return (
      <View style={s.root}>
        <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
        <GeoBackground />
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.header}>
            <HapticTouchable style={s.iconBtn} onPress={() => { setDetailItem(null); setDetail(null); }} haptic="light" accessibilityLabel="Back">
              <Ionicons name="chevron-back" size={20} color={selectedTheme.accentHover} />
            </HapticTouchable>
            <View style={s.headerCopy}>
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
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={selectedTheme.accent} />}
      >
        <View style={s.header}>
          <HapticTouchable style={s.iconBtn} onPress={onBack} haptic="light" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={20} color={selectedTheme.accentHover} />
          </HapticTouchable>
          <View style={s.headerCopy}>
            <Text style={s.kicker}>FROM YOUR CIRCLE</Text>
            <Text style={s.title}>shared with me</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 80 }} />
        ) : loadError ? (
          <HapticTouchable onPress={load} haptic="light" style={s.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={selectedTheme.danger} />
            <Text style={s.errorBannerText}>couldn't load — tap to retry</Text>
          </HapticTouchable>
        ) : items.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={30} color={selectedTheme.accent} />
            <Text style={s.emptyTitle}>nothing shared yet</Text>
            <Text style={s.emptyText}>notes and chats friends share with you show up here</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {items.map((item) => (
              <HapticTouchable key={item.id} style={s.row} onPress={() => openItem(item)} onLongPress={() => removeAccess(item)} haptic="none">
                <View style={s.rowIcon}>
                  <Ionicons name={item.content_type === 'note' ? 'document-text-outline' : 'chatbubble-ellipses-outline'} size={16} color={selectedTheme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.rowMeta}>from {item.shared_by.username} · {timeAgo(item.shared_at)}</Text>
                  {item.message ? <Text style={s.rowMessage} numberOfLines={1}>"{item.message}"</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={14} color={selectedTheme.textSecondary} />
              </HapticTouchable>
            ))}
            <Text style={s.hintFooter}>long-press an item to remove it from your shared list</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>, topInset: number) {
  const surface = theme.panel;
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.18 : 0.2);
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 4, paddingTop: Math.max(topInset + 10, 50), paddingBottom: 110 },
    header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    iconBtn: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.82), alignItems: 'center', justifyContent: 'center' },
    headerCopy: { flex: 1 },
    kicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 8, letterSpacing: 1.7 },
    title: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 24, lineHeight: 28, letterSpacing: -0.5 },

    errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: rgbaFromHex(theme.danger, 0.3), backgroundColor: rgbaFromHex(theme.danger, 0.1), paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 } as ViewStyle,
    errorBannerText: { fontFamily: 'Inter_600SemiBold', color: theme.danger, fontSize: 12 },
    empty: { alignItems: 'center', gap: 6, paddingVertical: 70, paddingHorizontal: 20 },
    emptyTitle: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 13, marginTop: 4 },
    emptyText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11.5, textAlign: 'center' },

    row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.9), paddingHorizontal: 14, paddingVertical: 13, boxShadow: cbTileShadow(0.05) } as ViewStyle,
    rowIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(theme.accent, 0.14) },
    rowTitle: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 13 },
    rowMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10.5, marginTop: 2 },
    rowMessage: { fontFamily: 'Inter_400Regular', color: theme.accentHover, fontSize: 11, marginTop: 3, fontStyle: 'italic' },
    hintFooter: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10, textAlign: 'center', marginTop: 6 },

    card: { borderRadius: 18, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.9), padding: 16, gap: 8, marginBottom: 4 } as ViewStyle,
    noteBody: { fontFamily: 'Inter_400Regular', color: theme.textPrimary, fontSize: 14, lineHeight: 21 },
    chatUserMsg: { fontFamily: 'Inter_600SemiBold', color: theme.accentHover, fontSize: 13, lineHeight: 19 },
    chatAiMsg: { fontFamily: 'Inter_400Regular', color: theme.textPrimary, fontSize: 13, lineHeight: 19 },
  });
}
