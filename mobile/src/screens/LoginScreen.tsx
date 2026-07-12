import { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

import { signIn, signInWithGoogle, AuthUser } from '../services/auth';
import { confirmPasswordReset, register, requestPasswordReset, verifyRegistration } from '../services/api';
import HapticTouchable from '../components/HapticTouchable';
import GeoBackground from '../components/GeoBackground';
import AmbientBubbles from '../components/AmbientBubbles';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

WebBrowser.maybeCompleteAuthSession();

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
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold });
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
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await register({
        first_name: regFirstName.trim(),
        last_name:  regLastName.trim(),
        email:      regEmail.trim(),
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
    if (!registrationOtp.trim()) {
      setError('enter the 6-digit OTP');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await verifyRegistration({
        email: regEmail.trim(),
        otp: registrationOtp.trim(),
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
        <AmbientBubbles theme={selectedTheme} variant="auth" opacity={0.9} />
      </View>
      <KeyboardAvoidingView style={s.kav} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={s.scrollView}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          <View style={s.content}>
            <View style={s.top}>
              <Text style={s.brand}>cerbyl</Text>
              <Text style={s.tagline}>
                <Text style={s.taglineAccent}>LEARNING, </Text>
                <Text style={s.taglineMuted}>UNIFIED</Text>
              </Text>
            </View>

            <View style={s.panel}>
              <LinearGradient
                colors={[rgbaFromHex(selectedTheme.accentHover, 0.08), rgbaFromHex(selectedTheme.panelAlt, 0.98), rgbaFromHex(selectedTheme.bgPrimary, 0.98)]}
                locations={[0, 0.55, 1]}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={s.cardSheen} />
              <View style={s.neoInnerShade} />
              <View style={s.tabs}>
                <HapticTouchable style={[s.tab, mode === 'login' && s.tabActive]} onPress={() => switchMode('login')} haptic="selection">
                  <Text style={[s.tabText, mode === 'login' && s.tabTextActive]}>sign in</Text>
                </HapticTouchable>
                <HapticTouchable style={[s.tab, mode === 'register' && s.tabActive]} onPress={() => switchMode('register')} haptic="selection">
                  <Text style={[s.tabText, mode === 'register' && s.tabTextActive]}>create account</Text>
                </HapticTouchable>
              </View>

              {success ? <Text style={s.success}>{success}</Text> : null}
              {error ? <Text style={s.error}>{error}</Text> : null}

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
return StyleSheet.create({
  safe:    { flex: 1, backgroundColor: theme.bgPrimary },
  kav:     { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 28,
  },
  content: {
    width: '100%',
    paddingHorizontal: layout.isTablet ? layout.screenPadding : 12,
  },
  top: { alignItems: 'center', marginBottom: 22 },
  brand: { fontFamily: 'Inter_900Black', fontSize: 42, color: theme.accentHover, letterSpacing: -1.4 },
  tagline: { marginTop: 8, fontFamily: 'Inter_900Black', fontSize: 10, letterSpacing: 4, textTransform: 'uppercase' },
  taglineAccent: { color: theme.accent },
  taglineMuted: { color: rgbaFromHex(theme.textPrimary, 0.35) },

  panel: {
    width: '100%',
    backgroundColor: theme.panelAlt,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.16 : 0.18),
    padding: 20,
    overflow: 'hidden',
    shadowColor: SHADOW,
    shadowOffset: { width: 16, height: 18 },
    shadowOpacity: theme.isLight ? 0.09 : 0.36,
    shadowRadius: 28,
    elevation: 15,
  },
  cardSheen: {
    position: 'absolute',
    top: 0,
    left: 18,
    right: 18,
    height: 1,
    backgroundColor: rgbaFromHex(theme.accentHover, 0.52),
  },
  neoInnerShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '46%',
    backgroundColor: rgbaFromHex('#000000', theme.isLight ? 0.035 : 0.24),
  },
  tabs: { flexDirection: 'row', backgroundColor: rgbaFromHex(theme.textPrimary, 0.03), borderRadius: 14, borderWidth: 1, borderColor: theme.border, marginBottom: 22, overflow: 'hidden', padding: 4 },
  tab:       { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 11 },
  tabActive: { backgroundColor: theme.panelAlt },
  tabText:       { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: theme.textSecondary, letterSpacing: 0.5 },
  tabTextActive: { color: theme.accent },

  form: {},
  row:  { flexDirection: layout.width < 420 ? 'column' : 'row', gap: 12 },
  half: { flex: 1 },

  label: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: theme.textSecondary, letterSpacing: 1.7, marginBottom: 8, textTransform: 'uppercase' },
  spacedLabel: { marginTop: 16 },
  input: {
    backgroundColor: rgbaFromHex(theme.bgPrimary, theme.isLight ? 0.55 : 0.66),
    borderWidth: 1,
    borderColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.12 : 0.14),
    borderTopColor: rgbaFromHex('#000000', theme.isLight ? 0.05 : 0.30),
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: theme.textPrimary,
  },

  error:   { fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.danger, letterSpacing: 0.3, marginBottom: 12, textAlign: 'center' },
  success: { fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.success, letterSpacing: 0.3, marginBottom: 12, textAlign: 'center' },

  btnWrap: {
    marginTop: 24,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: SHADOW,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: theme.isLight ? 0.14 : 0.34,
    shadowRadius: 20,
    elevation: 10,
  },
  btn:     { paddingVertical: 17, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: 'Inter_900Black', fontSize: 14, color: theme.bgPrimary, letterSpacing: 0.6 },

  textButton: { alignItems: 'center', paddingTop: 14 },
  textButtonLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: theme.accent, letterSpacing: 0.2 },

  resetPanel: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  secondaryBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.22 : 0.26),
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: theme.panelAlt,
    shadowColor: SHADOW,
    shadowOffset: { width: 8, height: 10 },
    shadowOpacity: theme.isLight ? 0.07 : 0.26,
    shadowRadius: 18,
    elevation: 8,
  },
  secondaryBtnText: { fontFamily: 'Inter_900Black', fontSize: 12, color: theme.textPrimary, letterSpacing: 0.7 },

  dividerRow:  { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: theme.border },
  dividerText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.textSecondary, letterSpacing: 1.2 },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.18 : 0.20), borderRadius: 14, paddingVertical: 15, backgroundColor: theme.panelAlt,
    shadowColor: SHADOW,
    shadowOffset: { width: 8, height: 10 },
    shadowOpacity: theme.isLight ? 0.07 : 0.26,
    shadowRadius: 18,
    elevation: 8,
  },
  googleIcon: { fontFamily: 'Inter_900Black', fontSize: 16, color: theme.accent },
  googleText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: theme.textPrimary, letterSpacing: 0.2 },
});
}
