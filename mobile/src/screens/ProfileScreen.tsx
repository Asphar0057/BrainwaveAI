import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser, signOut } from '../services/auth';
import HapticTouchable from '../components/HapticTouchable';
import AmbientBubbles from '../components/AmbientBubbles';
import GeoBackground from '../components/GeoBackground';
import { triggerHaptic } from '../utils/haptics';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = {
  user: AuthUser;
  onLogout?: () => void;
  onNavigate?: (screen: 'flashcards' | 'notes' | 'aimedia' | 'settings' | 'questionBank' | 'knowledgeHub' | 'slideExplorer' | 'canvasHub' | 'analytics' | 'learningPaths' | 'weaknessPractice') => void;
};

export default function ProfileScreen({ user, onLogout, onNavigate }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold });
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const switchTrackOff = rgbaFromHex(selectedTheme.accent, selectedTheme.isLight ? 0.18 : 0.22);
  const switchTrackOn  = rgbaFromHex(selectedTheme.accent, selectedTheme.isLight ? 0.42 : 0.52);
  const switchThumbOff = selectedTheme.isLight ? selectedTheme.panelAlt : selectedTheme.textSecondary;
  const switchThumbOn  = selectedTheme.isLight ? darkenColor(selectedTheme.accent, 18) : selectedTheme.accentHover;

  if (!fontsLoaded) return null;

  const displayName = [user.first_name, (user as any).last_name].filter(Boolean).join(' ') || user.username;
  const initials = displayName.split(' ').map((name: string) => name[0]).join('').slice(0, 2).toUpperCase();
  const joinYear = (user as any).created_at ? new Date((user as any).created_at).getFullYear() : 2026;

  const prefs = [
    {
      label: 'Notifications',
      icon: 'notifications-outline',
      value: notificationsEnabled,
      onChange: (value: boolean) => {
        setNotificationsEnabled(value);
        triggerHaptic('selection');
      },
    },
  ];

  const handleAccountPress = (label: string) => {
    if (label === 'My Flashcards') { onNavigate?.('flashcards'); return; }
    if (label === 'My Notes')      { onNavigate?.('notes');      return; }
    if (label === 'Knowledge Hub') { onNavigate?.('knowledgeHub'); return; }
    if (label === 'Slide Explorer') { onNavigate?.('slideExplorer'); return; }
    if (label === 'Canvas Hub') { onNavigate?.('canvasHub'); return; }
    if (label === 'Question Bank') { onNavigate?.('questionBank'); return; }
    if (label === 'Learning Paths') { onNavigate?.('learningPaths'); return; }
    if (label === 'Study Analytics') { onNavigate?.('analytics'); return; }
    if (label === 'Weakness Practice') { onNavigate?.('weaknessPractice'); return; }
    Alert.alert('Not available yet', `${label} is not available on mobile yet.`);
  };

  const handleLogout = async () => {
    await signOut();
    onLogout?.();
  };

  const handleOpenSettings = () => {
    triggerHaptic('selection');
    onNavigate?.('settings');
  };

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFill} />
      <GeoBackground />
      <AmbientBubbles theme={selectedTheme} variant="profile" opacity={0.88} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.pageTitle}>profile</Text>
            <Text style={styles.pageSubtitle}>identity · settings · progress</Text>
          </View>
          <HapticTouchable onPress={handleOpenSettings} activeOpacity={0.8} haptic="selection" style={styles.settingsButton}>
            <Ionicons name="settings-outline" size={20} color={selectedTheme.textPrimary} />
          </HapticTouchable>
        </View>

        <LinearGradient
          colors={[rgbaFromHex(selectedTheme.accent, 0.10), rgbaFromHex(selectedTheme.panel, 0.985), rgbaFromHex(selectedTheme.bgPrimary, 0.995)]}
          locations={[0, 0.62, 1]}
          style={styles.heroCard}
        >
          <LinearGradient
            colors={
              selectedTheme.isLight
                ? [rgbaFromHex(selectedTheme.accent, 0.12), rgbaFromHex(selectedTheme.panelAlt, 0.99)]
                : [rgbaFromHex(darkenColor(selectedTheme.accent, 34), 0.52), rgbaFromHex(darkenColor(selectedTheme.accent, 34), 0.16)]
            }
            style={styles.avatarCircle}
          >
            <Text style={styles.avatarInitials}>{initials}</Text>
          </LinearGradient>
          <Text style={styles.userName}>{displayName}</Text>
          <Text style={styles.userHandle}>@{user.username} · joined {joinYear}</Text>
          <Text style={styles.heroText}>Focused study, low noise. Keep the essentials close.</Text>
        </LinearGradient>

        <Text style={styles.sectionLabel}>preferences</Text>
        <View style={styles.card}>
          {prefs.map((pref, index) => (
            <View key={pref.label} style={[styles.prefRow, index < prefs.length - 1 && styles.rowDivider]}>
              <View style={styles.iconWrap}>
                <Ionicons name={pref.icon as any} size={16} color={selectedTheme.accent} />
              </View>
              <Text style={styles.prefLabel}>{pref.label}</Text>
              <Switch
                value={pref.value}
                onValueChange={pref.onChange}
                trackColor={{ false: switchTrackOff, true: switchTrackOn }}
                thumbColor={pref.value ? switchThumbOn : switchThumbOff}
                ios_backgroundColor={switchTrackOff}
                style={{ transform: [{ scaleX: 0.86 }, { scaleY: 0.86 }] }}
              />
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>account</Text>
        <View style={styles.card}>
          {[
            { label: 'My Flashcards', icon: 'layers-outline' },
            { label: 'My Notes',      icon: 'document-text-outline' },
            { label: 'Knowledge Hub',  icon: 'file-tray-stacked-outline' },
            { label: 'Slide Explorer', icon: 'easel-outline' },
            { label: 'Canvas Hub', icon: 'brush-outline' },
            { label: 'Question Bank',  icon: 'help-circle-outline' },
            { label: 'Learning Paths', icon: 'map-outline' },
            { label: 'Study Analytics',  icon: 'bar-chart-outline' },
            { label: 'Weakness Practice', icon: 'pulse-outline' },
          ].map((item, index) => (
            <HapticTouchable
              key={item.label}
              style={[styles.linkRow, index < 8 && styles.rowDivider]}
              activeOpacity={0.8}
              haptic="light"
              onPress={() => handleAccountPress(item.label)}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={item.icon as any} size={16} color={selectedTheme.accent} />
              </View>
              <Text style={styles.linkLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={14} color={selectedTheme.textSecondary} />
            </HapticTouchable>
          ))}
          <HapticTouchable style={styles.linkRow} activeOpacity={0.8} onPress={handleLogout} haptic="warning">
            <View style={styles.iconWrap}>
              <Ionicons name="log-out-outline" size={16} color={selectedTheme.danger} />
            </View>
            <Text style={[styles.linkLabel, styles.linkDanger]}>Log Out</Text>
            <Ionicons name="chevron-forward" size={14} color={selectedTheme.textSecondary} />
          </HapticTouchable>
        </View>

        <Text style={styles.version}>cerbyl · v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const CARD     = theme.panel;
  const CARD_ALT = theme.panelAlt;
  const GOLD_LIGHT = theme.accentHover;
  const GOLD_MID   = theme.accent;
  const GOLD_DARK  = darkenColor(theme.accent, theme.isLight ? 16 : 34);
  const DIM    = theme.textSecondary;
  const BORDER = theme.border;

  // Responsive horizontal padding: tighter on phone, more generous on tablet
  const PAD = layout.isTablet ? layout.screenPadding : 12;

  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: 'transparent', overflow: 'hidden' },
    scroll: {
      width: '100%',
      maxWidth: layout.contentMaxWidth,
      alignSelf: 'center',
      paddingHorizontal: PAD,
      paddingTop: 18,
      paddingBottom: 120,
    },
    glow: {
      position: 'absolute', top: -20, right: -20,
      width: 180, height: 180, borderRadius: 90,
    },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginBottom: 12,
      // Stretch header to true screen edge so icon hugs the side
      marginHorizontal: -PAD,
      paddingHorizontal: PAD - 4,
    },
    settingsButton: {
      width: 40, height: 40, borderRadius: 10,
      borderWidth: 1, borderColor: BORDER,
      backgroundColor: rgbaFromHex(CARD_ALT, 0.88),
      alignItems: 'center', justifyContent: 'center',
    },
    pageTitle:    { fontFamily: 'Inter_900Black', fontSize: layout.isTablet ? 36 : 30, lineHeight: layout.isTablet ? 38 : 32, color: GOLD_LIGHT, letterSpacing: -0.8 },
    pageSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, letterSpacing: 1.6, marginTop: 4, textTransform: 'uppercase' },
    heroCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: BORDER,
      padding: 20,
      overflow: 'hidden',
      marginBottom: 22,
      alignItems: 'center',
      gap: 6,
      backgroundColor: rgbaFromHex(CARD, 0.96),
    },
    avatarCircle: {
      width: layout.isTablet ? 100 : 88,
      height: layout.isTablet ? 100 : 88,
      borderRadius: layout.isTablet ? 50 : 44,
      borderWidth: 2,
      borderColor: GOLD_DARK,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    avatarInitials: { fontFamily: 'Inter_900Black', fontSize: layout.isTablet ? 34 : 28, color: GOLD_LIGHT },
    userName:   { fontFamily: 'Inter_900Black', fontSize: layout.isTablet ? 28 : 24, color: GOLD_LIGHT, letterSpacing: -0.5, textAlign: 'center' },
    userHandle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: DIM, letterSpacing: 0.2, textAlign: 'center' },
    heroText:   { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, color: GOLD_MID, marginTop: 8, textAlign: 'center' },
    sectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: DIM, letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' },
    card: {
      backgroundColor: CARD,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: BORDER,
      marginBottom: 22,
      overflow: 'hidden',
    },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: BORDER },
    iconWrap: {
      width: 30, height: 30, borderRadius: 15,
      borderWidth: 1, borderColor: BORDER,
      backgroundColor: CARD_ALT,
      alignItems: 'center', justifyContent: 'center',
    },
    prefRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
    prefLabel: { fontFamily: 'Inter_400Regular', fontSize: 14, color: GOLD_LIGHT, flex: 1 },
    linkRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15, gap: 12 },
    linkLabel: { fontFamily: 'Inter_400Regular', fontSize: 14, color: GOLD_LIGHT, flex: 1 },
    linkDanger: { color: theme.danger },
    version: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, letterSpacing: 2, textAlign: 'center', marginTop: 8 },
  });
}
