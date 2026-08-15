import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import { getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, AppNotification } from '../services/api';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import { cbTileShadow } from '../components/NeumorphicTexture';
import { triggerHaptic } from '../utils/haptics';
import { useAppTheme } from '../contexts/ThemeContext';
import { rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = { user: AuthUser; onBack: () => void };

const TYPE_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  battle_challenge: 'flash-outline',
  battle_won: 'trophy-outline',
  battle_lost: 'flag-outline',
  battle_tied: 'remove-circle-outline',
  reminder: 'alarm-outline',
  calendar_event: 'calendar-outline',
  friend_request: 'person-add-outline',
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationsScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(selectedTheme, layout, insets.top), [selectedTheme, layout, insets.top]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getNotifications(user.username);
      setNotifications(data.notifications ?? []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.username]);

  useEffect(() => { load(); }, [load]);

  if (!fontsLoaded) return null;

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const openNotification = async (n: AppNotification) => {
    if (n.is_read) return;
    setNotifications((current) => current.map((item) => (item.id === n.id ? { ...item, is_read: true } : item)));
    triggerHaptic('light');
    try {
      await markNotificationRead(n.id);
    } catch {
      // silenced -- optimistic update stays, next refresh will reconcile
    }
  };

  const removeNotification = async (n: AppNotification) => {
    setNotifications((current) => current.filter((item) => item.id !== n.id));
    triggerHaptic('light');
    try {
      await deleteNotification(n.id);
    } catch {
      // silenced
    }
  };

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    triggerHaptic('medium');
    try {
      await markAllNotificationsRead(user.username);
    } catch {
      // silenced
    }
  };

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
            <Text style={s.kicker}>{unreadCount > 0 ? `${unreadCount} UNREAD` : 'ALL CAUGHT UP'}</Text>
            <Text style={s.title}>notifications</Text>
          </View>
          {unreadCount > 0 ? (
            <HapticTouchable onPress={markAllRead} haptic="selection">
              <Text style={s.markAllText}>mark all read</Text>
            </HapticTouchable>
          ) : null}
        </View>

        {loading ? (
          <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 80 }} />
        ) : loadError ? (
          <HapticTouchable onPress={load} haptic="light" style={s.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={selectedTheme.danger} />
            <Text style={s.errorBannerText}>couldn't load notifications — tap to retry</Text>
          </HapticTouchable>
        ) : notifications.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="notifications-off-outline" size={30} color={selectedTheme.accent} />
            <Text style={s.emptyTitle}>no notifications yet</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {notifications.map((n) => (
              <HapticTouchable key={n.id} style={[s.row, !n.is_read && s.rowUnread]} onPress={() => openNotification(n)} onLongPress={() => removeNotification(n)} haptic="none">
                {!n.is_read ? <View style={s.unreadDot} /> : null}
                <View style={s.rowIcon}>
                  <Ionicons name={TYPE_ICONS[n.notification_type] || 'notifications-outline'} size={16} color={selectedTheme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowTitle, !n.is_read && s.rowTitleUnread]} numberOfLines={1}>{n.title}</Text>
                  <Text style={s.rowMessage} numberOfLines={2}>{n.message}</Text>
                  <Text style={s.rowTime}>{timeAgo(n.created_at)}</Text>
                </View>
              </HapticTouchable>
            ))}
            <Text style={s.hintFooter}>long-press a notification to dismiss it</Text>
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
    title: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 26, lineHeight: 30, letterSpacing: -0.6 },
    markAllText: { fontFamily: 'Inter_600SemiBold', color: theme.accentHover, fontSize: 11.5 },

    errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: rgbaFromHex(theme.danger, 0.3), backgroundColor: rgbaFromHex(theme.danger, 0.1), paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 } as ViewStyle,
    errorBannerText: { fontFamily: 'Inter_600SemiBold', color: theme.danger, fontSize: 12 },
    empty: { alignItems: 'center', gap: 8, paddingVertical: 70 },
    emptyTitle: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 13, marginTop: 4 },

    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.9), paddingHorizontal: 14, paddingVertical: 13, boxShadow: cbTileShadow(0.05) } as ViewStyle,
    rowUnread: { borderColor: rgbaFromHex(theme.accentHover, 0.4), backgroundColor: rgbaFromHex(theme.accent, theme.isLight ? 0.08 : 0.1) },
    unreadDot: { position: 'absolute', top: 12, right: 12, width: 7, height: 7, borderRadius: 3.5, backgroundColor: theme.accentHover },
    rowIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(theme.accent, 0.14) },
    rowTitle: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 12.5 },
    rowTitleUnread: { color: theme.textPrimary, fontFamily: 'Inter_700Bold' },
    rowMessage: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
    rowTime: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 9.5, marginTop: 4, letterSpacing: 0.3 },
    hintFooter: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10, textAlign: 'center', marginTop: 6 },
  });
}
