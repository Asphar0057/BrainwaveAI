import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Alert, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import { getComprehensiveProfile, updateComprehensiveProfile } from '../services/api';
import HapticTouchable from '../components/HapticTouchable';
import AmbientBubbles from '../components/AmbientBubbles';
import GeoBackground from '../components/GeoBackground';
import NeumorphicTexture, { cbCardGradient, cbTileShadow, cbModalShadow } from '../components/NeumorphicTexture';
import { triggerHaptic } from '../utils/haptics';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex, ThemeMode } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = {
  user: AuthUser;
  onBack?: () => void;
};

export default function SettingsScreen({ user, onBack }: Props) {
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold });
  const { selectedTheme, selectedThemeId, customTheme, themes, colorPalette, primaryPalette, changeTheme, applyCustomColors } = useAppTheme();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<'presets' | 'custom'>('presets');
  const [pendingPresetId, setPendingPresetId] = useState(selectedThemeId === 'custom' ? 'gold-dark' : selectedThemeId);
  const [pendingMode, setPendingMode] = useState<ThemeMode>(customTheme?.mode || selectedTheme.mode || 'dark');
  const [pendingPrimary, setPendingPrimary] = useState(customTheme?.primary || selectedTheme.primary);
  const [pendingAccent, setPendingAccent] = useState(customTheme?.accent || selectedTheme.accent);
  const switchTrackOff = rgbaFromHex(selectedTheme.accent, selectedTheme.isLight ? 0.18 : 0.22);
  const switchTrackOn = rgbaFromHex(selectedTheme.accent, selectedTheme.isLight ? 0.42 : 0.52);
  const switchThumbOff = selectedTheme.isLight ? selectedTheme.panelAlt : selectedTheme.textSecondary;
  const switchThumbOn = selectedTheme.isLight ? darkenColor(selectedTheme.accent, 18) : selectedTheme.accentHover;

  const loadNotificationPref = useCallback(async () => {
    try {
      const data = await getComprehensiveProfile(user.username);
      if (typeof data.notificationsEnabled === 'boolean') setPushEnabled(data.notificationsEnabled);
    } catch {
      // silenced -- toggle just keeps its current value if this fails
    }
  }, [user.username]);

  useEffect(() => {
    loadNotificationPref();
  }, [loadNotificationPref]);

  const handlePushToggle = async (value: boolean) => {
    setPushEnabled(value);
    triggerHaptic('selection');
    try {
      await updateComprehensiveProfile(user.username, { notificationsEnabled: value });
    } catch {
      // silenced -- non-critical preference sync
    }
  };

  if (!fontsLoaded) return null;

  const accountRows = [
    { label: 'Privacy & Security', icon: 'shield-checkmark-outline' },
    { label: 'Help Center', icon: 'help-circle-outline' },
  ];

  const handleComingSoon = (label: string) => {
    Alert.alert('Not available yet', `${label} is not available on mobile yet.`);
  };

  const darkThemes = themes.filter((theme) => theme.mode === 'dark');
  const lightThemes = themes.filter((theme) => theme.mode === 'light');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFill} />
      <GeoBackground />
      <AmbientBubbles theme={selectedTheme} variant="settings" opacity={0.82} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <HapticTouchable onPress={onBack} activeOpacity={0.8} haptic="selection" style={styles.iconButton}>
            <Ionicons name="chevron-back" size={22} color={selectedTheme.textPrimary} />
          </HapticTouchable>
          <View style={styles.titleWrap}>
            <Text style={styles.pageTitle}>settings</Text>
          </View>
          <View style={styles.iconButton} />
        </View>

        <View style={styles.heroCard}>
          <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
          <NeumorphicTexture grainOpacity={0.26} />
          <Text style={styles.heroGhost}>01</Text>
          <Text style={[styles.heroEyebrow, { color: selectedTheme.accentHover }]}>signed in as</Text>
          <Text style={styles.heroName}>{user.first_name || user.username}</Text>
          <Text style={styles.heroMeta}>@{user.username} · {user.email}</Text>
        </View>

        <Text style={styles.sectionLabel}>appearance</Text>
        <View style={styles.card}>
          <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
          <NeumorphicTexture grainOpacity={0.18} />
          <View style={styles.themeTabRow}>
            <HapticTouchable style={[styles.themeTab, activeTab === 'presets' && styles.themeTabActive]} onPress={() => setActiveTab('presets')} haptic="selection">
              <Text style={[styles.themeTabText, activeTab === 'presets' && styles.themeTabTextActive]}>presets</Text>
            </HapticTouchable>
            <HapticTouchable style={[styles.themeTab, activeTab === 'custom' && styles.themeTabActive]} onPress={() => setActiveTab('custom')} haptic="selection">
              <Text style={[styles.themeTabText, activeTab === 'custom' && styles.themeTabTextActive]}>custom</Text>
            </HapticTouchable>
          </View>

          {activeTab === 'presets' ? (
            <View style={styles.themeSection}>
              <Text style={styles.themeSectionLabel}>dark</Text>
              <View style={styles.presetGrid}>
                {darkThemes.map((theme) => {
                  const active = pendingPresetId === theme.id;
                  return (
                    <HapticTouchable key={theme.id} style={[styles.presetBtn, active && styles.presetBtnActive]} onPress={() => setPendingPresetId(theme.id)} haptic="selection">
                      <View style={styles.presetColors}>
                        <View style={[styles.presetSwatch, { backgroundColor: primaryPalette.dark[0].value }]} />
                        <View style={[styles.presetSwatch, { backgroundColor: theme.accent }]} />
                      </View>
                      <Text style={styles.presetName}>{theme.name}</Text>
                    </HapticTouchable>
                  );
                })}
              </View>

              <Text style={styles.themeSectionLabel}>light</Text>
              <View style={styles.presetGrid}>
                {lightThemes.map((theme) => {
                  const active = pendingPresetId === theme.id;
                  return (
                    <HapticTouchable key={theme.id} style={[styles.presetBtn, active && styles.presetBtnActive]} onPress={() => setPendingPresetId(theme.id)} haptic="selection">
                      <View style={styles.presetColors}>
                        <View style={[styles.presetSwatch, { backgroundColor: primaryPalette.light[0].value, borderWidth: 1, borderColor: selectedTheme.borderStrong }]} />
                        <View style={[styles.presetSwatch, { backgroundColor: theme.accent }]} />
                      </View>
                      <Text style={styles.presetName}>{theme.name}</Text>
                    </HapticTouchable>
                  );
                })}
              </View>

              <HapticTouchable
                style={styles.applyBtn}
                onPress={async () => {
                  triggerHaptic('selection');
                  await changeTheme(pendingPresetId);
                }}
                haptic="medium"
                activeOpacity={0.85}
              >
                <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} style={styles.applyBtnGrad}>
                  <Text style={styles.applyBtnText}>apply preset</Text>
                </LinearGradient>
              </HapticTouchable>
            </View>
          ) : (
            <View style={styles.themeSection}>
              <Text style={styles.themeSectionLabel}>mode</Text>
              <View style={styles.modeRow}>
                {(['dark', 'light'] as ThemeMode[]).map((mode) => (
                  <HapticTouchable key={mode} style={[styles.modeBtn, pendingMode === mode && styles.modeBtnActive]} onPress={() => setPendingMode(mode)} haptic="selection">
                    <Text style={[styles.modeBtnText, pendingMode === mode && styles.modeBtnTextActive]}>{mode}</Text>
                  </HapticTouchable>
                ))}
              </View>

              <Text style={styles.themeSectionLabel}>base color</Text>
              <View style={styles.swatchGrid}>
                {primaryPalette[pendingMode].map((color) => {
                  const active = pendingPrimary === color.value;
                  return (
                    <HapticTouchable key={color.value} style={[styles.swatchBtn, active && styles.swatchBtnActive]} onPress={() => setPendingPrimary(color.value)} haptic="selection">
                      <View style={[styles.swatchCircle, { backgroundColor: color.value, borderWidth: pendingMode === 'light' ? 1 : 0, borderColor: selectedTheme.borderStrong }]} />
                      <Text style={styles.swatchLabel}>{color.name}</Text>
                    </HapticTouchable>
                  );
                })}
              </View>

              <Text style={styles.themeSectionLabel}>accent color</Text>
              <View style={styles.swatchGrid}>
                {colorPalette.map((color) => {
                  const active = pendingAccent === color.value;
                  return (
                    <HapticTouchable key={color.value} style={[styles.swatchBtn, active && styles.swatchBtnActive]} onPress={() => setPendingAccent(color.value)} haptic="selection">
                      <View style={[styles.swatchCircle, { backgroundColor: color.value }]} />
                      <Text style={styles.swatchLabel}>{color.name}</Text>
                    </HapticTouchable>
                  );
                })}
              </View>

              <HapticTouchable
                style={styles.applyBtn}
                onPress={async () => {
                  triggerHaptic('selection');
                  await applyCustomColors(pendingPrimary, pendingAccent, pendingMode);
                }}
                haptic="medium"
                activeOpacity={0.85}
              >
                <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} style={styles.applyBtnGrad}>
                  <Text style={styles.applyBtnText}>apply custom theme</Text>
                </LinearGradient>
              </HapticTouchable>
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>preferences</Text>
        <View style={styles.card}>
          <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
          <NeumorphicTexture grainOpacity={0.18} />
          <View style={styles.prefRow}>
            <View style={styles.iconWrap}>
              <Ionicons name="notifications-outline" size={17} color={selectedTheme.accent} />
            </View>
            <Text style={styles.prefLabel}>Push Notifications</Text>
            <Switch
              value={pushEnabled}
              onValueChange={handlePushToggle}
              trackColor={{ false: switchTrackOff, true: switchTrackOn }}
              thumbColor={pushEnabled ? switchThumbOn : switchThumbOff}
              ios_backgroundColor={switchTrackOff}
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>account</Text>
        <View style={styles.card}>
          <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
          <NeumorphicTexture grainOpacity={0.18} />
          {accountRows.map((item, index) => (
            <HapticTouchable
              key={item.label}
              style={[styles.linkRow, index < accountRows.length - 1 && styles.rowDivider]}
              activeOpacity={0.8}
              haptic="light"
              onPress={() => handleComingSoon(item.label)}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={item.icon as any} size={17} color={selectedTheme.accent} />
              </View>
              <Text style={styles.linkLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={14} color={selectedTheme.textSecondary} />
            </HapticTouchable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const BORDER = rgbaFromHex(theme.accentHover, theme.isLight ? 0.16 : 0.18);
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bgPrimary },
    scroll: {
      width: '100%',
      maxWidth: layout.contentMaxWidth,
      alignSelf: 'center',
      paddingHorizontal: 5,
      paddingBottom: 80,
    },
    topBar: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 24 },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: BORDER,
      backgroundColor: rgbaFromHex(theme.panel, theme.isLight ? 0.88 : 0.72),
      boxShadow: cbTileShadow(0.06),
    },
    titleWrap: { flex: 1, alignItems: 'center' },
    pageTitle: { fontFamily: 'Inter_900Black', fontSize: 24, color: theme.accentHover, textTransform: 'lowercase', letterSpacing: -0.4 },
    heroCard: {
      borderRadius: 30,
      paddingHorizontal: 20,
      paddingVertical: 22,
      marginBottom: 28,
      overflow: 'hidden',
      boxShadow: cbModalShadow(0.14),
    } as ViewStyle,
    heroGhost: {
      position: 'absolute',
      right: 16,
      top: 0,
      fontFamily: 'Inter_900Black',
      fontSize: layout.isTablet ? 92 : 76,
      lineHeight: layout.isTablet ? 98 : 82,
      color: rgbaFromHex(theme.textPrimary, theme.isLight ? 0.035 : 0.055),
      letterSpacing: -4,
    },
    heroEyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase' },
    heroName: { fontFamily: 'Inter_900Black', fontSize: 22, color: theme.accentHover, marginTop: 8 },
    heroMeta: { fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.accent, marginTop: 6 },
    sectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: theme.textSecondary, letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' },
    card: {
      borderRadius: 24,
      marginBottom: 24,
      overflow: 'hidden',
      boxShadow: cbTileShadow(0.10),
    } as ViewStyle,
    themeTabRow: {
      flexDirection: 'row',
      padding: 8,
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: BORDER,
    },
    themeTab: {
      flex: 1,
      borderRadius: 16,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.10 : 0.12),
      backgroundColor: rgbaFromHex(theme.panelAlt, theme.isLight ? 0.84 : 0.72),
    },
    themeTabActive: {
      backgroundColor: rgbaFromHex(theme.accent, 0.18),
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.28 : 0.34),
    },
    themeTabText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    themeTabTextActive: {
      color: theme.textPrimary,
    },
    themeSection: {
      paddingHorizontal: 16,
      paddingVertical: 16,
      gap: 14,
    },
    themeSectionLabel: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10,
      color: theme.textSecondary,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
    },
    presetGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    presetBtn: {
      width: layout.threeColumn ? '31.8%' : '47%',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: BORDER,
      backgroundColor: rgbaFromHex(theme.panelAlt, theme.isLight ? 0.84 : 0.72),
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 10,
    },
    presetBtnActive: {
      borderColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.28 : 0.34),
      backgroundColor: rgbaFromHex(theme.accent, 0.16),
    },
    presetColors: {
      flexDirection: 'row',
      gap: 8,
    },
    presetSwatch: {
      width: 18,
      height: 18,
      borderRadius: 9,
    },
    presetName: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: theme.textPrimary,
    },
    modeRow: {
      flexDirection: 'row',
      gap: 10,
    },
    modeBtn: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: BORDER,
      backgroundColor: rgbaFromHex(theme.panelAlt, theme.isLight ? 0.84 : 0.72),
      alignItems: 'center',
      paddingVertical: 12,
    },
    modeBtnActive: {
      borderColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.28 : 0.34),
      backgroundColor: rgbaFromHex(theme.accent, 0.16),
    },
    modeBtnText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    modeBtnTextActive: {
      color: theme.textPrimary,
    },
    swatchGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    swatchBtn: {
      width: layout.threeColumn ? '18%' : layout.twoColumn ? '22%' : '30%',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: BORDER,
      backgroundColor: rgbaFromHex(theme.panelAlt, theme.isLight ? 0.84 : 0.72),
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 6,
      gap: 8,
    },
    swatchBtnActive: {
      borderColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.28 : 0.34),
      backgroundColor: rgbaFromHex(theme.accent, 0.14),
    },
    swatchCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
    },
    swatchLabel: {
      fontFamily: 'Inter_400Regular',
      fontSize: 10,
      color: theme.textPrimary,
      textAlign: 'center',
    },
    applyBtn: {
      borderRadius: 18,
      overflow: 'hidden',
      marginTop: 4,
    },
    applyBtnGrad: {
      paddingVertical: 15,
      alignItems: 'center',
    },
    applyBtnText: {
      fontFamily: 'Inter_900Black',
      fontSize: 13,
      color: theme.bgPrimary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    prefRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
    linkRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15, gap: 12 },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: BORDER },
    prefLabel: { fontFamily: 'Inter_400Regular', fontSize: 14, color: theme.textPrimary, flex: 1 },
    linkLabel: { fontFamily: 'Inter_400Regular', fontSize: 14, color: theme.textPrimary, flex: 1 },
    iconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: BORDER,
      backgroundColor: rgbaFromHex(theme.panelAlt, theme.isLight ? 0.84 : 0.72),
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: rgbaFromHex(theme.accentHover, 0.08), inset: true }],
    },
  });
}
