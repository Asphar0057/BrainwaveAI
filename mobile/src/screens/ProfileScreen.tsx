import { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TextInput, Alert, ActivityIndicator, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser, signOut, updateStoredUser, updateStoredToken } from '../services/auth';
import { changeUsername, changePassword, getComprehensiveProfile, updateComprehensiveProfile, ComprehensiveProfile, getNotifications } from '../services/api';
import HapticTouchable from '../components/HapticTouchable';
import AmbientBubbles from '../components/AmbientBubbles';
import GeoBackground from '../components/GeoBackground';
import NeumorphicTexture, { cbCardGradient, cbTileShadow, cbModalShadow } from '../components/NeumorphicTexture';
import { triggerHaptic } from '../utils/haptics';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = {
  user: AuthUser;
  onLogout?: () => void;
  onUserUpdate?: (patch: Partial<AuthUser>) => void;
  onNavigate?: (screen: 'settings' | 'notifications') => void;
  onRetakeQuiz?: () => void;
};

type EditField = 'username' | 'password' | null;

const GOAL_LABELS: Record<string, string> = {
  exam_prep: 'Ace my exams',
  homework_help: 'Get homework help',
  concept_mastery: 'Master difficult concepts',
  skill_building: 'Build new skills',
  career_prep: 'Prepare for my career',
  curiosity: 'Learn out of curiosity',
};

export default function ProfileScreen({ user, onLogout, onUserUpdate, onNavigate, onRetakeQuiz }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold });

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [editing, setEditing] = useState<EditField>(null);
  const [profile, setProfile] = useState<ComprehensiveProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [usernameInput, setUsernameInput] = useState(user.username);
  const [savingUsername, setSavingUsername] = useState(false);

  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const switchTrackOff = rgbaFromHex(selectedTheme.accent, selectedTheme.isLight ? 0.18 : 0.22);
  const switchTrackOn  = rgbaFromHex(selectedTheme.accent, selectedTheme.isLight ? 0.42 : 0.52);
  const switchThumbOff = selectedTheme.isLight ? selectedTheme.panelAlt : selectedTheme.textSecondary;
  const switchThumbOn  = selectedTheme.isLight ? darkenColor(selectedTheme.accent, 18) : selectedTheme.accentHover;

  const loadProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const data = await getComprehensiveProfile(user.username);
      setProfile(data);
      if (typeof data.notificationsEnabled === 'boolean') setNotificationsEnabled(data.notificationsEnabled);
    } catch {
      // silenced -- profile widgets just stay empty if this fails
    } finally {
      setLoadingProfile(false);
    }
  }, [user.username]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    getNotifications(user.username).then((data) => {
      setUnreadNotifications((data.notifications ?? []).filter((n) => !n.is_read).length);
    }).catch(() => {});
  }, [user.username]);

  const handleNotificationsToggle = async (value: boolean) => {
    setNotificationsEnabled(value);
    triggerHaptic('selection');
    try {
      await updateComprehensiveProfile(user.username, { notificationsEnabled: value });
    } catch {
      // silenced -- non-critical preference sync
    }
  };

  if (!fontsLoaded) return null;

  const hasPassword = !user.google_user;
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username;
  const initials = displayName.split(' ').map((name: string) => name[0]).join('').slice(0, 2).toUpperCase();
  const joinYear = user.created_at ? new Date(user.created_at).getFullYear() : undefined;

  const openUsernameEditor = () => {
    setUsernameInput(user.username);
    setEditing('username');
    triggerHaptic('selection');
  };

  const openPasswordEditor = () => {
    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmPasswordInput('');
    setEditing('password');
    triggerHaptic('selection');
  };

  const cancelEditing = () => {
    setEditing(null);
    triggerHaptic('light');
  };

  const submitUsernameChange = async () => {
    const next = usernameInput.trim();
    if (!next || next === user.username) {
      setEditing(null);
      return;
    }
    setSavingUsername(true);
    try {
      const res = await changeUsername(next);
      await updateStoredToken(res.access_token);
      await updateStoredUser({ username: res.username });
      onUserUpdate?.({ username: res.username });
      triggerHaptic('success');
      setEditing(null);
    } catch (error) {
      triggerHaptic('error');
      Alert.alert('Could not update username', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSavingUsername(false);
    }
  };

  const submitPasswordChange = async () => {
    if (hasPassword && !currentPasswordInput) {
      Alert.alert('Current password required', 'Enter your current password to continue.');
      return;
    }
    if (newPasswordInput.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      Alert.alert('Passwords do not match', 'Re-enter the new password to confirm.');
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(hasPassword ? currentPasswordInput : null, newPasswordInput);
      await updateStoredUser({ google_user: false });
      onUserUpdate?.({ google_user: false });
      triggerHaptic('success');
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      setEditing(null);
      Alert.alert('Password updated', 'Your password has been changed.');
    } catch (error) {
      triggerHaptic('error');
      Alert.alert('Could not update password', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    onLogout?.();
  };

  const handleOpenSettings = () => {
    triggerHaptic('selection');
    onNavigate?.('settings');
  };

  const handleOpenNotifications = () => {
    triggerHaptic('selection');
    onNavigate?.('notifications');
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
          </View>
          <View style={styles.topBarActions}>
            <HapticTouchable onPress={handleOpenNotifications} activeOpacity={0.8} haptic="selection" style={styles.settingsButton} accessibilityLabel="Notifications">
              <Ionicons name="notifications-outline" size={20} color={selectedTheme.textPrimary} />
              {unreadNotifications > 0 ? (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{unreadNotifications > 9 ? '9+' : unreadNotifications}</Text>
                </View>
              ) : null}
            </HapticTouchable>
            <HapticTouchable onPress={handleOpenSettings} activeOpacity={0.8} haptic="selection" style={styles.settingsButton}>
              <Ionicons name="settings-outline" size={20} color={selectedTheme.textPrimary} />
            </HapticTouchable>
          </View>
        </View>

        <View style={styles.heroCard}>
          <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
          <NeumorphicTexture grainOpacity={0.26} />
          <Text style={styles.heroGhost}>01</Text>
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
          <Text style={styles.userHandle}>@{user.username}{joinYear ? ` · joined ${joinYear}` : ''}</Text>
        </View>

        <Text style={styles.sectionLabel}>account</Text>
        <View style={styles.card}>
          <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
          <NeumorphicTexture grainOpacity={0.20} />

          <View style={[styles.linkRow, styles.rowDivider]}>
            <View style={styles.iconWrap}>
              <Ionicons name="mail-outline" size={16} color={selectedTheme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkLabel}>Email</Text>
              <Text style={styles.linkSubLabel}>{user.email}</Text>
            </View>
          </View>

          {editing === 'username' ? (
            <View style={[styles.editBlock, styles.rowDivider]}>
              <Text style={styles.editTitle}>Username</Text>
              <TextInput
                style={styles.editInput}
                value={usernameInput}
                onChangeText={setUsernameInput}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="username"
                placeholderTextColor={selectedTheme.textSecondary}
              />
              <View style={styles.editActions}>
                <HapticTouchable style={styles.editCancelBtn} onPress={cancelEditing} haptic="light" activeOpacity={0.8}>
                  <Text style={styles.editCancelText}>cancel</Text>
                </HapticTouchable>
                <HapticTouchable
                  style={[styles.editSaveBtn, savingUsername && styles.editSaveBtnDisabled]}
                  onPress={submitUsernameChange}
                  haptic="medium"
                  activeOpacity={0.85}
                  disabled={savingUsername}
                >
                  {savingUsername ? (
                    <ActivityIndicator size="small" color={selectedTheme.isLight ? darkenColor(selectedTheme.accent, 32) : selectedTheme.bgPrimary} />
                  ) : (
                    <Text style={styles.editSaveText}>save</Text>
                  )}
                </HapticTouchable>
              </View>
            </View>
          ) : (
            <HapticTouchable style={[styles.linkRow, styles.rowDivider]} activeOpacity={0.8} haptic="light" onPress={openUsernameEditor}>
              <View style={styles.iconWrap}>
                <Ionicons name="at-outline" size={16} color={selectedTheme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkLabel}>Username</Text>
                <Text style={styles.linkSubLabel}>@{user.username}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={selectedTheme.textSecondary} />
            </HapticTouchable>
          )}

          {editing === 'password' ? (
            <View style={styles.editBlock}>
              <Text style={styles.editTitle}>{hasPassword ? 'Change Password' : 'Set Password'}</Text>
              {hasPassword ? (
                <TextInput
                  style={styles.editInput}
                  value={currentPasswordInput}
                  onChangeText={setCurrentPasswordInput}
                  placeholder="current password"
                  placeholderTextColor={selectedTheme.textSecondary}
                  secureTextEntry
                />
              ) : null}
              <TextInput
                style={styles.editInput}
                value={newPasswordInput}
                onChangeText={setNewPasswordInput}
                placeholder="new password"
                placeholderTextColor={selectedTheme.textSecondary}
                secureTextEntry
              />
              <TextInput
                style={styles.editInput}
                value={confirmPasswordInput}
                onChangeText={setConfirmPasswordInput}
                placeholder="confirm new password"
                placeholderTextColor={selectedTheme.textSecondary}
                secureTextEntry
              />
              <View style={styles.editActions}>
                <HapticTouchable style={styles.editCancelBtn} onPress={cancelEditing} haptic="light" activeOpacity={0.8}>
                  <Text style={styles.editCancelText}>cancel</Text>
                </HapticTouchable>
                <HapticTouchable
                  style={[styles.editSaveBtn, savingPassword && styles.editSaveBtnDisabled]}
                  onPress={submitPasswordChange}
                  haptic="medium"
                  activeOpacity={0.85}
                  disabled={savingPassword}
                >
                  {savingPassword ? (
                    <ActivityIndicator size="small" color={selectedTheme.isLight ? darkenColor(selectedTheme.accent, 32) : selectedTheme.bgPrimary} />
                  ) : (
                    <Text style={styles.editSaveText}>save</Text>
                  )}
                </HapticTouchable>
              </View>
            </View>
          ) : (
            <HapticTouchable style={styles.linkRow} activeOpacity={0.8} haptic="light" onPress={openPasswordEditor}>
              <View style={styles.iconWrap}>
                <Ionicons name="lock-closed-outline" size={16} color={selectedTheme.accent} />
              </View>
              <Text style={styles.linkLabel}>{hasPassword ? 'Change Password' : 'Set Password'}</Text>
              <Ionicons name="chevron-forward" size={14} color={selectedTheme.textSecondary} />
            </HapticTouchable>
          )}
        </View>

        <Text style={styles.sectionLabel}>learning profile</Text>
        <View style={styles.card}>
          <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
          <NeumorphicTexture grainOpacity={0.20} />

          {loadingProfile ? (
            <View style={styles.linkRow}>
              <ActivityIndicator size="small" color={selectedTheme.accent} />
              <Text style={[styles.linkSubLabel, { marginLeft: 10 }]}>loading profile…</Text>
            </View>
          ) : (
            <>
              <View style={[styles.linkRow, styles.rowDivider]}>
                <View style={styles.iconWrap}>
                  <Ionicons name="school-outline" size={16} color={selectedTheme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.linkLabel}>Main Subject</Text>
                  <Text style={styles.linkSubLabel}>{profile?.fieldOfStudy || 'Not set yet'}</Text>
                </View>
              </View>

              {profile?.preferredSubjects && profile.preferredSubjects.length > 0 ? (
                <View style={[styles.editBlock, styles.rowDivider]}>
                  <Text style={styles.editTitle}>Other Subjects</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {profile.preferredSubjects.map((subject) => (
                      <View key={subject} style={styles.subjectChip}>
                        <Text style={styles.subjectChipText}>{subject}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              <View style={[styles.linkRow, styles.rowDivider]}>
                <View style={styles.iconWrap}>
                  <Ionicons name="flag-outline" size={16} color={selectedTheme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.linkLabel}>Goal</Text>
                  <Text style={styles.linkSubLabel}>
                    {profile?.brainwaveGoal ? (GOAL_LABELS[profile.brainwaveGoal] || profile.brainwaveGoal) : 'Not set yet'}
                  </Text>
                </View>
              </View>

              <View style={[styles.linkRow, profile?.quizCompleted || profile?.quizSkipped ? styles.rowDivider : undefined]}>
                <View style={styles.iconWrap}>
                  <Ionicons name="sparkles-outline" size={16} color={selectedTheme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.linkLabel}>Learning Archetype</Text>
                  <Text style={styles.linkSubLabel}>{profile?.primaryArchetype || 'Take the quiz to discover yours'}</Text>
                </View>
              </View>

              {(profile?.quizCompleted || profile?.quizSkipped) && onRetakeQuiz ? (
                <HapticTouchable style={styles.linkRow} activeOpacity={0.8} haptic="light" onPress={onRetakeQuiz}>
                  <View style={styles.iconWrap}>
                    <Ionicons name="refresh-outline" size={16} color={selectedTheme.accent} />
                  </View>
                  <Text style={styles.linkLabel}>Retake Onboarding Quiz</Text>
                  <Ionicons name="chevron-forward" size={14} color={selectedTheme.textSecondary} />
                </HapticTouchable>
              ) : null}
            </>
          )}
        </View>

        <Text style={styles.sectionLabel}>preferences</Text>
        <View style={styles.card}>
          <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
          <NeumorphicTexture grainOpacity={0.20} />
          <View style={styles.prefRow}>
            <View style={styles.iconWrap}>
              <Ionicons name="notifications-outline" size={16} color={selectedTheme.accent} />
            </View>
            <Text style={styles.prefLabel}>Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationsToggle}
              trackColor={{ false: switchTrackOff, true: switchTrackOn }}
              thumbColor={notificationsEnabled ? switchThumbOn : switchThumbOff}
              ios_backgroundColor={switchTrackOff}
              style={{ transform: [{ scaleX: 0.86 }, { scaleY: 0.86 }] }}
            />
          </View>
        </View>

        <View style={styles.card}>
          <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
          <NeumorphicTexture grainOpacity={0.20} />
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
  const CARD_ALT = theme.panelAlt;
  const GOLD_LIGHT = theme.accentHover;
  const DIM    = theme.textSecondary;
  const BORDER = rgbaFromHex(GOLD_LIGHT, theme.isLight ? 0.16 : 0.18);

  // Responsive horizontal padding: tighter on phone, more generous on tablet.
  // 75% less than before, matching the home page's screen-edge inset.
  const PAD = Math.round((layout.isTablet ? layout.screenPadding : 12) * 0.25);

  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: 'transparent', overflow: 'hidden' },
    scroll: {
      width: '100%',
      maxWidth: layout.contentMaxWidth,
      alignSelf: 'center',
      paddingHorizontal: PAD,
      paddingTop: 5,
      paddingBottom: 120,
    },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginBottom: 12,
      // Stretch header to true screen edge so icon hugs the side
      marginHorizontal: -PAD,
      paddingHorizontal: Math.max(0, PAD - 4),
    },
    topBarActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    settingsButton: {
      width: 42, height: 42, borderRadius: 16,
      borderWidth: 1, borderColor: rgbaFromHex(GOLD_LIGHT, theme.isLight ? 0.18 : 0.22),
      backgroundColor: rgbaFromHex(CARD_ALT, theme.isLight ? 0.88 : 0.74),
      alignItems: 'center', justifyContent: 'center',
      boxShadow: cbTileShadow(0.06),
    },
    bellBadge: {
      position: 'absolute',
      top: -3,
      right: -3,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 1,
      backgroundColor: theme.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bellBadgeText: {
      fontFamily: 'Inter_900Black',
      fontSize: 8.5,
      color: '#fff',
    },
    pageTitle:    { fontFamily: 'Inter_900Black', fontSize: layout.isTablet ? 36 : 30, lineHeight: layout.isTablet ? 38 : 32, color: GOLD_LIGHT, letterSpacing: -0.8 },
    heroCard: {
      borderRadius: 30,
      padding: 5,
      overflow: 'hidden',
      marginBottom: 22,
      alignItems: 'center',
      gap: 6,
      boxShadow: cbModalShadow(0.14),
    } as ViewStyle,
    heroGhost: {
      position: 'absolute',
      right: 16,
      top: 2,
      fontFamily: 'Inter_900Black',
      fontSize: layout.isTablet ? 94 : 78,
      lineHeight: layout.isTablet ? 100 : 84,
      color: rgbaFromHex(theme.textPrimary, theme.isLight ? 0.035 : 0.055),
      letterSpacing: -4,
    },
    avatarCircle: {
      width: layout.isTablet ? 100 : 88,
      height: layout.isTablet ? 100 : 88,
      borderRadius: layout.isTablet ? 50 : 44,
      borderWidth: 1,
      borderColor: rgbaFromHex(GOLD_LIGHT, theme.isLight ? 0.26 : 0.34),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
      boxShadow: cbTileShadow(0.10),
    },
    avatarInitials: { fontFamily: 'Inter_900Black', fontSize: layout.isTablet ? 34 : 28, color: GOLD_LIGHT },
    userName:   { fontFamily: 'Inter_900Black', fontSize: layout.isTablet ? 28 : 24, color: GOLD_LIGHT, letterSpacing: -0.5, textAlign: 'center' },
    userHandle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: DIM, letterSpacing: 0.2, textAlign: 'center' },
    sectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: DIM, letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' },
    card: {
      borderRadius: 24,
      marginBottom: 22,
      overflow: 'hidden',
      boxShadow: cbTileShadow(0.10),
    } as ViewStyle,
    rowDivider: { borderBottomWidth: 1, borderBottomColor: BORDER },
    iconWrap: {
      width: 30, height: 30, borderRadius: 15,
      borderWidth: 1, borderColor: rgbaFromHex(GOLD_LIGHT, theme.isLight ? 0.18 : 0.22),
      backgroundColor: rgbaFromHex(CARD_ALT, theme.isLight ? 0.84 : 0.72),
      alignItems: 'center', justifyContent: 'center',
      boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: rgbaFromHex(GOLD_LIGHT, 0.08), inset: true }],
    },
    prefRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 4, gap: 12 },
    prefLabel: { fontFamily: 'Inter_400Regular', fontSize: 14, color: GOLD_LIGHT, flex: 1 },
    linkRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 4, gap: 12 },
    linkLabel: { fontFamily: 'Inter_400Regular', fontSize: 14, color: GOLD_LIGHT, flex: 1 },
    linkSubLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginTop: 2 },
    linkDanger: { color: theme.danger },
    editBlock: { paddingHorizontal: 4, paddingVertical: 4, gap: 10 },
    editTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: GOLD_LIGHT, letterSpacing: 0.4, textTransform: 'uppercase' },
    subjectChip: {
      paddingHorizontal: 3, paddingVertical: 2, borderRadius: 10,
      borderWidth: 1, borderColor: BORDER,
      backgroundColor: rgbaFromHex(GOLD_LIGHT, theme.isLight ? 0.1 : 0.14),
    },
    subjectChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: GOLD_LIGHT },
    editInput: {
      borderWidth: 1, borderColor: BORDER, borderRadius: 12,
      backgroundColor: rgbaFromHex(CARD_ALT, theme.isLight ? 0.6 : 0.5),
      paddingHorizontal: 3, paddingVertical: 3,
      fontFamily: 'Inter_400Regular', fontSize: 13, color: GOLD_LIGHT,
    },
    editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 2 },
    editCancelBtn: { paddingHorizontal: 4, paddingVertical: 2, borderRadius: 12 },
    editCancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: DIM, letterSpacing: 0.4, textTransform: 'uppercase' },
    editSaveBtn: {
      minWidth: 72, alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 4, paddingVertical: 2, borderRadius: 12,
      backgroundColor: theme.accent,
    },
    editSaveBtnDisabled: { opacity: 0.6 },
    editSaveText: {
      fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase',
      color: theme.isLight ? darkenColor(theme.accent, 32) : theme.bgPrimary,
    },
    version: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, letterSpacing: 2, textAlign: 'center', marginTop: 8 },
  });
}
