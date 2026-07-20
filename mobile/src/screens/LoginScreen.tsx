import { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_900Black, Inter_700Bold, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

import { signIn, signInWithGoogle, AuthUser } from '../services/auth';
import { confirmPasswordReset, register, requestPasswordReset, resendRegistrationOtp, verifyRegistration } from '../services/api';
import HapticTouchable from '../components/HapticTouchable';
import GeoBackground from '../components/GeoBackground';
import NeumorphicTexture, { cbTileCardGradient, cbTileShadowExact, cbTileBorder, cbTileShadow } from '../components/NeumorphicTexture';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

WebBrowser.maybeCompleteAuthSession();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_WEB_GOOGLE_CLIENT_ID = '44446084594-8jc1vsg08qkt4d35npd2gn33b65b2638.apps.googleusercontent.com';
const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
  DEFAULT_WEB_GOOGLE_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';

function getGoogleConfigError() {
  if (Platform.OS === 'ios' && !GOOGLE_IOS_CLIENT_ID) {
    return 'Google sign-in is not configured for iOS. Add EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID and use a development build.';
  }
  if (Platform.OS === 'android' && !GOOGLE_ANDROID_CLIENT_ID) {
    return 'Google sign-in is not configured for Android. Add EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID and use a development build.';
  }
  return '';
}

type Props = { onLogin: (user: AuthUser) => void };

export default function LoginScreen({ onLogin }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_700Bold, Inter_400Regular, Inter_600SemiBold });
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // login fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // register fields
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName]   = useState('');
  const [regEmail, setRegEmail]         = useState('');
  const [regUsername, setRegUsername]   = useState('');
  const [regPassword, setRegPassword]   = useState('');
  const [registrationOtp, setRegistrationOtp] = useState('');
  const [verificationPending, setVerificationPending] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const googleConfigError = getGoogleConfigError();
  const heroSubtitle = verificationPending ? 'enter the code sent to your email' : '';

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID || GOOGLE_WEB_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
    selectAccount: true,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.authentication?.idToken || response.params?.id_token;
      if (!idToken) { setError('google sign-in failed'); return; }
      setLoading(true);
      setError('');
      signInWithGoogle(idToken)
        .then(user => onLogin(user))
        .catch((e: any) => setError(e?.message || 'google sign-in failed'))
        .finally(() => setLoading(false));
    } else if (response?.type === 'error') {
      const detail = response.params?.error_description || response.params?.error || 'google authorization failed';
      setError(detail);
    }
  }, [response]);

  if (!fontsLoaded) return null;

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError('enter username and password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const user = await signIn(username.trim(), password);
      onLogin(user);
    } catch (e: any) {
      setError(e?.message || 'invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!regFirstName.trim() || !regLastName.trim() || !regEmail.trim() || !regUsername.trim() || !regPassword.trim()) {
      setError('all fields are required');
      return;
    }
    const email = regEmail.trim();
    if (!EMAIL_PATTERN.test(email)) {
      setError('enter a valid email address');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await register({
        first_name: regFirstName.trim(),
        last_name:  regLastName.trim(),
        email,
        username:   regUsername.trim(),
        password:   regPassword,
      }).then((data) => {
        const devOtp = data?.dev_otp ? ` Dev OTP: ${data.dev_otp}` : '';
        setSuccess(`${data?.message || 'verification OTP sent'}${devOtp}`);
      });
      setVerificationPending(true);
      setRegistrationOtp('');
    } catch (e: any) {
      setError(e.message || 'registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRegistration = async () => {
    const otp = registrationOtp.trim();
    if (!/^\d{6}$/.test(otp)) {
      setError('enter the 6-digit OTP');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await verifyRegistration({
        email: regEmail.trim(),
        otp,
      });
      setSuccess('account verified! sign in below');
      setUsername(regUsername.trim());
      setPassword(regPassword);
      setRegistrationOtp('');
      setVerificationPending(false);
      setMode('login');
    } catch (e: any) {
      setError(e.message || 'verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResendRegistrationOtp = async () => {
    const email = regEmail.trim();
    if (!EMAIL_PATTERN.test(email)) {
      setError('edit your email address before resending');
      setVerificationPending(false);
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const data = await resendRegistrationOtp(email);
      const devOtp = data?.dev_otp ? ` Dev OTP: ${data.dev_otp}` : '';
      setRegistrationOtp('');
      setSuccess(`${data?.message || 'new verification OTP sent'}${devOtp}`);
    } catch (e: any) {
      setError(e.message || 'could not resend verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPasswordReset = async () => {
    if (!resetEmail.trim()) {
      setError('enter your account email');
      return;
    }
    setResetLoading(true);
    setError('');
    setSuccess('');
    try {
      const data = await requestPasswordReset(resetEmail.trim());
      const devOtp = data?.dev_otp ? ` Dev OTP: ${data.dev_otp}` : '';
      setSuccess(`${data?.message || 'OTP sent if the account exists.'}${devOtp}`);
      setResetStep('confirm');
    } catch (e: any) {
      setError(e.message || 'could not send OTP');
    } finally {
      setResetLoading(false);
    }
  };

  const handleConfirmPasswordReset = async () => {
    if (!resetOtp.trim() || !resetPassword.trim() || !resetConfirmPassword.trim()) {
      setError('enter OTP and new password');
      return;
    }
    if (resetPassword !== resetConfirmPassword) {
      setError('passwords do not match');
      return;
    }
    setResetLoading(true);
    setError('');
    setSuccess('');
    try {
      const data = await confirmPasswordReset({
        email: resetEmail.trim(),
        otp: resetOtp.trim(),
        new_password: resetPassword,
      });
      setSuccess(data?.message || 'password updated successfully');
      setPassword('');
      setResetOpen(false);
      setResetStep('request');
      setResetEmail('');
      setResetOtp('');
      setResetPassword('');
      setResetConfirmPassword('');
    } catch (e: any) {
      setError(e.message || 'could not reset password');
    } finally {
      setResetLoading(false);
    }
  };

  const switchMode = (m: 'login' | 'register') => {
    setMode(m);
    setResetOpen(false);
    setError('');
    setSuccess('');
  };

  const handleGoogleSignIn = () => {
    setSuccess('');
    if (request?.redirectUri?.startsWith('exp://')) {
      setError('Google sign-in cannot run in Expo Go/tunnel. Install and open a development build, then start Expo with --dev-client.');
      return;
    }
    if (googleConfigError) {
      setError(googleConfigError);
      return;
    }
    setError('');
    promptAsync();
  };

  return (
    <SafeAreaView style={s.safe}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
        <GeoBackground />
      </View>
      <KeyboardAvoidingView style={s.kav} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={s.scrollView}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          <View style={s.content}>
            <View style={s.panel}>
              <NeumorphicTexture
                grainOpacity={0.48}
                grainVariant="skia"
                baseFrequency={0.7}
                gradientColors={cbTileCardGradient.colors}
                gradientStart={cbTileCardGradient.start}
                gradientEnd={cbTileCardGradient.end}
              />
              <View style={s.panelHeader}>
                <Text style={s.heroWord}>cerbyl</Text>
                {heroSubtitle ? <Text style={s.panelSubtitle}>{heroSubtitle}</Text> : null}
              </View>

              <View style={s.tabs}>
                <HapticTouchable style={[s.tab, mode === 'login' && s.tabActive]} onPress={() => switchMode('login')} haptic="selection">
                  <Text style={[s.tabText, mode === 'login' && s.tabTextActive]}>sign in</Text>
                </HapticTouchable>
                <HapticTouchable style={[s.tab, mode === 'register' && s.tabActive]} onPress={() => switchMode('register')} haptic="selection">
                  <Text style={[s.tabText, mode === 'register' && s.tabTextActive]}>create account</Text>
                </HapticTouchable>
              </View>

              {success ? <View style={s.successBox}><Text style={s.success}>{success}</Text></View> : null}
              {error ? <View style={s.errorBox}><Text style={s.error}>{error}</Text></View> : null}

              <View style={s.form}>
                {mode === 'login' ? (
                  <>
                    <Text style={s.label}>username or email</Text>
                    <TextInput style={s.input} value={username} onChangeText={setUsername} placeholder="enter username" placeholderTextColor={selectedTheme.textSecondary} autoCapitalize="none" autoCorrect={false} />

                    <Text style={[s.label, s.spacedLabel]}>password</Text>
                    <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="enter password" placeholderTextColor={selectedTheme.textSecondary} secureTextEntry />

                    <HapticTouchable style={s.btnWrap} onPress={handleLogin} activeOpacity={0.88} disabled={loading} haptic="medium">
                      <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={s.btn}>
                        {loading ? <ActivityIndicator color={selectedTheme.bgPrimary} /> : <Text style={s.btnText}>sign in</Text>}
                      </LinearGradient>
                    </HapticTouchable>

                    <HapticTouchable
                      style={s.textButton}
                      onPress={() => {
                        setResetOpen(prev => !prev);
                        setError('');
                        setSuccess('');
                        setResetEmail(username.includes('@') ? username : resetEmail);
                      }}
                      activeOpacity={0.8}
                      disabled={loading}
                      haptic="selection"
                    >
                      <Text style={s.textButtonLabel}>forgot password?</Text>
                    </HapticTouchable>

                    {resetOpen ? (
                      <View style={s.resetPanel}>
                        {resetStep === 'request' ? (
                          <>
                            <Text style={s.label}>account email</Text>
                            <TextInput style={s.input} value={resetEmail} onChangeText={setResetEmail} placeholder="you@example.com" placeholderTextColor={selectedTheme.textSecondary} autoCapitalize="none" keyboardType="email-address" />
                            <HapticTouchable style={s.secondaryBtn} onPress={handleRequestPasswordReset} activeOpacity={0.88} disabled={resetLoading} haptic="medium">
                              {resetLoading ? <ActivityIndicator color={selectedTheme.textPrimary} /> : <Text style={s.secondaryBtnText}>send OTP</Text>}
                            </HapticTouchable>
                          </>
                        ) : (
                          <>
                            <Text style={s.label}>reset code</Text>
                            <TextInput style={s.input} value={resetOtp} onChangeText={setResetOtp} placeholder="6-digit OTP" placeholderTextColor={selectedTheme.textSecondary} keyboardType="number-pad" maxLength={6} />
                            <Text style={[s.label, s.spacedLabel]}>new password</Text>
                            <TextInput style={s.input} value={resetPassword} onChangeText={setResetPassword} placeholder="new password" placeholderTextColor={selectedTheme.textSecondary} secureTextEntry />
                            <Text style={[s.label, s.spacedLabel]}>confirm password</Text>
                            <TextInput style={s.input} value={resetConfirmPassword} onChangeText={setResetConfirmPassword} placeholder="confirm password" placeholderTextColor={selectedTheme.textSecondary} secureTextEntry />
                            <HapticTouchable style={s.secondaryBtn} onPress={handleConfirmPasswordReset} activeOpacity={0.88} disabled={resetLoading} haptic="medium">
                              {resetLoading ? <ActivityIndicator color={selectedTheme.textPrimary} /> : <Text style={s.secondaryBtnText}>reset password</Text>}
                            </HapticTouchable>
                          </>
                        )}
                      </View>
                    ) : null}

                    <View style={s.dividerRow}>
                      <View style={s.dividerLine} />
                      <Text style={s.dividerText}>or continue</Text>
                      <View style={s.dividerLine} />
                    </View>

                    <HapticTouchable style={s.googleBtn} onPress={handleGoogleSignIn} activeOpacity={0.88} disabled={loading || !request} haptic="medium">
                      <Text style={s.googleIcon}>G</Text>
                      <Text style={s.googleText}>continue with google</Text>
                    </HapticTouchable>
                  </>
                ) : verificationPending ? (
                  <>
                    <Text style={s.label}>verification code</Text>
                    <TextInput
                      style={s.input}
                      value={registrationOtp}
                      onChangeText={setRegistrationOtp}
                      placeholder="6-digit OTP"
                      placeholderTextColor={selectedTheme.textSecondary}
                      keyboardType="number-pad"
                      maxLength={6}
                    />

                    <HapticTouchable style={s.btnWrap} onPress={handleVerifyRegistration} activeOpacity={0.88} disabled={loading} haptic="medium">
                      <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={s.btn}>
                        {loading ? <ActivityIndicator color={selectedTheme.bgPrimary} /> : <Text style={s.btnText}>verify account</Text>}
                      </LinearGradient>
                    </HapticTouchable>

                    <HapticTouchable
                      style={[s.googleBtn, { marginTop: 12 }]}
                      onPress={handleResendRegistrationOtp}
                      activeOpacity={0.88}
                      disabled={loading}
                      haptic="selection"
                    >
                      <Text style={s.googleText}>resend code</Text>
                    </HapticTouchable>

                    <HapticTouchable
                      style={[s.googleBtn, { marginTop: 12 }]}
                      onPress={() => {
                        setVerificationPending(false);
                        setRegistrationOtp('');
                        setError('');
                        setSuccess('');
                      }}
                      activeOpacity={0.88}
                      disabled={loading}
                      haptic="selection"
                    >
                      <Text style={s.googleText}>edit registration details</Text>
                    </HapticTouchable>
                  </>
                ) : (
                  <>
                    <View style={s.row}>
                      <View style={s.half}>
                        <Text style={s.label}>first name</Text>
                        <TextInput style={s.input} value={regFirstName} onChangeText={setRegFirstName} placeholder="first" placeholderTextColor={selectedTheme.textSecondary} autoCapitalize="words" />
                      </View>
                      <View style={s.half}>
                        <Text style={s.label}>last name</Text>
                        <TextInput style={s.input} value={regLastName} onChangeText={setRegLastName} placeholder="last" placeholderTextColor={selectedTheme.textSecondary} autoCapitalize="words" />
                      </View>
                    </View>

                    <Text style={[s.label, s.spacedLabel]}>email</Text>
                    <TextInput style={s.input} value={regEmail} onChangeText={setRegEmail} placeholder="you@example.com" placeholderTextColor={selectedTheme.textSecondary} autoCapitalize="none" keyboardType="email-address" />

                    <Text style={[s.label, s.spacedLabel]}>username</Text>
                    <TextInput style={s.input} value={regUsername} onChangeText={setRegUsername} placeholder="choose a username" placeholderTextColor={selectedTheme.textSecondary} autoCapitalize="none" autoCorrect={false} />

                    <Text style={[s.label, s.spacedLabel]}>password</Text>
                    <TextInput style={s.input} value={regPassword} onChangeText={setRegPassword} placeholder="8+ chars, uppercase + symbol" placeholderTextColor={selectedTheme.textSecondary} secureTextEntry />

                    <HapticTouchable style={s.btnWrap} onPress={handleRegister} activeOpacity={0.88} disabled={loading} haptic="medium">
                      <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={s.btn}>
                        {loading ? <ActivityIndicator color={selectedTheme.bgPrimary} /> : <Text style={s.btnText}>create account</Text>}
                      </LinearGradient>
                    </HapticTouchable>
                  </>
                )}
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const SHADOW = darkenColor(theme.primary, theme.isLight ? 72 : 4);
  const contentMaxWidth = Math.min(layout.contentMaxWidth, 560);
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bgPrimary },
    kav: { flex: 1 },
    scrollView: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      justifyContent: layout.height < 760 ? 'flex-start' : 'center',
      paddingTop: layout.height < 760 ? 18 : 28,
      paddingBottom: 34,
    },
    content: {
      width: '100%',
      maxWidth: contentMaxWidth,
      alignSelf: 'center',
      paddingHorizontal: layout.isTablet ? 18 : 14,
    },
    panel: {
      width: '100%',
      borderRadius: 28,
      paddingHorizontal: 14,
      paddingVertical: 20,
      overflow: 'hidden',
      boxShadow: cbTileShadowExact(),
      ...cbTileBorder(0.22),
    } as ViewStyle,
    panelHeader: {
      alignItems: 'center',
      marginBottom: 20,
    },
    heroWord: {
      fontFamily: 'Inter_900Black',
      fontSize: 46,
      lineHeight: 50,
      color: theme.accentHover,
      letterSpacing: -1.6,
      textAlign: 'center',
    },
    panelSubtitle: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      lineHeight: 19,
      color: theme.textSecondary,
      marginTop: 10,
      textAlign: 'center',
    },
    tabs: {
      flexDirection: 'row',
      backgroundColor: rgbaFromHex(theme.bgPrimary, theme.isLight ? 0.45 : 0.68),
      borderRadius: 18,
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.12 : 0.15),
      marginBottom: 18,
      overflow: 'hidden',
      padding: 4,
    },
    tab: {
      flex: 1,
      paddingVertical: 11,
      alignItems: 'center',
      borderRadius: 14,
    },
    tabActive: {
      backgroundColor: rgbaFromHex(theme.panelAlt, theme.isLight ? 0.86 : 0.78),
      boxShadow: cbTileShadow(0.05),
    } as ViewStyle,
    tabText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: theme.textSecondary,
      letterSpacing: 0.7,
    },
    tabTextActive: {
      color: theme.accentHover,
    },

    form: {},
    row: { flexDirection: layout.width < 420 ? 'column' : 'row', gap: 12 },
    half: { flex: 1 },

    label: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      color: theme.textSecondary,
      letterSpacing: 1.8,
      marginBottom: 8,
      textTransform: 'uppercase',
    },
    spacedLabel: { marginTop: 15 },
    input: {
      backgroundColor: rgbaFromHex(theme.bgPrimary, theme.isLight ? 0.58 : 0.72),
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.12 : 0.16),
      borderTopColor: rgbaFromHex('#000000', theme.isLight ? 0.05 : 0.34),
      borderLeftColor: rgbaFromHex('#000000', theme.isLight ? 0.035 : 0.22),
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      color: theme.textPrimary,
    },

    errorBox: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.danger, 0.30),
      backgroundColor: rgbaFromHex(theme.danger, 0.08),
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 14,
    },
    successBox: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.success, 0.28),
      backgroundColor: rgbaFromHex(theme.success, 0.08),
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 14,
    },
    error: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: theme.danger,
      letterSpacing: 0.2,
      textAlign: 'center',
    },
    success: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: theme.success,
      letterSpacing: 0.2,
      textAlign: 'center',
    },

    btnWrap: {
      marginTop: 22,
      borderRadius: 18,
      overflow: 'hidden',
      shadowColor: SHADOW,
      shadowOffset: { width: 12, height: 14 },
      shadowOpacity: theme.isLight ? 0.10 : 0.36,
      shadowRadius: 24,
      elevation: 12,
    },
    btn: {
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnText: {
      fontFamily: 'Inter_900Black',
      fontSize: 14,
      color: theme.bgPrimary,
      letterSpacing: 0.6,
    },

    textButton: { alignItems: 'center', paddingTop: 14 },
    textButtonLabel: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: theme.accentHover,
      letterSpacing: 0.2,
    },

    resetPanel: {
      marginTop: 16,
      padding: 14,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.12 : 0.16),
      backgroundColor: rgbaFromHex(theme.bgPrimary, theme.isLight ? 0.36 : 0.48),
    },
    secondaryBtn: {
      marginTop: 16,
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.18 : 0.24),
      borderRadius: 18,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: rgbaFromHex(theme.panelAlt, theme.isLight ? 0.86 : 0.74),
      boxShadow: cbTileShadow(0.06),
    } as ViewStyle,
    secondaryBtnText: {
      fontFamily: 'Inter_900Black',
      fontSize: 12,
      color: theme.textPrimary,
      letterSpacing: 0.7,
    },

    dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 19, gap: 12 },
    dividerLine: { flex: 1, height: 1, backgroundColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.12 : 0.15) },
    dividerText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: theme.textSecondary,
      letterSpacing: 1.3,
    },

    googleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.16 : 0.20),
      borderRadius: 18,
      paddingVertical: 15,
      backgroundColor: rgbaFromHex(theme.panelAlt, theme.isLight ? 0.84 : 0.74),
      boxShadow: cbTileShadow(0.055),
    } as ViewStyle,
    googleIcon: { fontFamily: 'Inter_900Black', fontSize: 16, color: theme.accentHover },
    googleText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: theme.textPrimary,
      letterSpacing: 0.2,
    },
  });
}
