import { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, ViewStyle, LayoutAnimation, UIManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_900Black, Inter_700Bold, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

import { signIn, signInWithGoogle, AuthUser } from '../services/auth';
import { confirmPasswordReset, register, requestPasswordReset, resendRegistrationOtp, verifyRegistration } from '../services/api';
import HapticTouchable from '../components/HapticTouchable';
import GeoBackground from '../components/GeoBackground';
import NeumorphicTexture, {
  CB_CARD_TOP,
  CB_CARD_BOTTOM,
  CB_ACCENT,
  cbTileCardGradient,
  cbPlainCardShadow,
  cbPlainRaisedShadow,
  cbPlainPressedShadow,
} from '../components/NeumorphicTexture';
import { useAppTheme } from '../contexts/ThemeContext';
import { rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

WebBrowser.maybeCompleteAuthSession();

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Card height changes (switching tabs, opening the reset panel, moving
// between register/OTP steps) resize the whole panel on the same frame the
// state flips — without this it just snaps. Called synchronously right
// before the state update that changes layout, same tick, not in an effect
// (an effect fires after the jump already happened).
function animateLayout() {
  LayoutAnimation.configureNext(LayoutAnimation.create(240, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
}

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
  const [resetStep, setResetStep] = useState<'contact' | 'otp' | 'password'>('contact');
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // register fields
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName]   = useState('');
  const [regEmail, setRegEmail]         = useState('');
  const [regPhone, setRegPhone]         = useState('');
  const [regUsername, setRegUsername]   = useState('');
  const [regPassword, setRegPassword]   = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
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
    if (!regFirstName.trim() || !regLastName.trim() || !regEmail.trim() || !regUsername.trim() || !regPassword.trim() || !regConfirmPassword.trim()) {
      setError('all fields are required');
      return;
    }
    const email = regEmail.trim();
    if (!EMAIL_PATTERN.test(email)) {
      setError('enter a valid email address');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError('passwords do not match');
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
        ...(regPhone.trim() ? { phone_number: regPhone.trim() } : {}),
      }).then((data) => {
        const devOtp = data?.dev_otp ? ` Dev OTP: ${data.dev_otp}` : '';
        setSuccess(`${data?.message || 'verification OTP sent'}${devOtp}`);
      });
      animateLayout();
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
      animateLayout();
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

  const closeResetPanel = () => {
    animateLayout();
    setResetOpen(false);
    setResetStep('contact');
    setResetIdentifier('');
    setResetOtp('');
    setResetPassword('');
    setResetConfirmPassword('');
  };

  // Step 1: email or phone -> send OTP.
  const handleRequestPasswordReset = async () => {
    if (!resetIdentifier.trim()) {
      setError('enter your account email or phone number');
      return;
    }
    setResetLoading(true);
    setError('');
    setSuccess('');
    try {
      const data = await requestPasswordReset(resetIdentifier.trim());
      const devOtp = data?.dev_otp ? ` Dev OTP: ${data.dev_otp}` : '';
      setSuccess(`${data?.message || 'OTP sent if the account exists.'}${devOtp}`);
      animateLayout();
      setResetStep('otp');
    } catch (e: any) {
      setError(e.message || 'could not send OTP');
    } finally {
      setResetLoading(false);
    }
  };

  // Step 2: enter the OTP. The backend only validates it together with the
  // new password (there's no standalone verify-OTP endpoint for reset, unlike
  // registration), so this step just checks the format and moves on — a
  // wrong/expired OTP surfaces as an error on step 3 when it's actually sent.
  const handleVerifyResetOtpStep = () => {
    if (!/^\d{6}$/.test(resetOtp.trim())) {
      setError('enter the 6-digit OTP');
      return;
    }
    setError('');
    setSuccess('');
    animateLayout();
    setResetStep('password');
  };

  // Step 3: new password + confirm -> actually submit identifier+otp+password.
  const handleConfirmPasswordReset = async () => {
    if (!resetPassword.trim() || !resetConfirmPassword.trim()) {
      setError('enter a new password');
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
        identifier: resetIdentifier.trim(),
        otp: resetOtp.trim(),
        new_password: resetPassword,
      });
      setSuccess(data?.message || 'password updated successfully');
      setPassword('');
      closeResetPanel();
    } catch (e: any) {
      setError(e.message || 'could not reset password');
    } finally {
      setResetLoading(false);
    }
  };

  const switchMode = (m: 'login' | 'register') => {
    animateLayout();
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
              <View style={s.panelClip} pointerEvents="none">
                <NeumorphicTexture
                  grainVariant="skia"
                  grainOpacity={0.16}
                  baseFrequency={0.7}
                  gradientColors={cbTileCardGradient.colors}
                  gradientStart={cbTileCardGradient.start}
                  gradientEnd={cbTileCardGradient.end}
                />
              </View>
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
                    <TextInput style={s.input} value={username} onChangeText={setUsername} placeholder="enter username" placeholderTextColor={rgbaFromHex(CB_ACCENT, 0.45)} autoCapitalize="none" autoCorrect={false} />

                    <Text style={[s.label, s.spacedLabel]}>password</Text>
                    <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="enter password" placeholderTextColor={rgbaFromHex(CB_ACCENT, 0.45)} secureTextEntry />

                    <HapticTouchable style={s.btnWrap} onPress={handleLogin} activeOpacity={0.88} disabled={loading} haptic="medium">
                      <View style={s.btn}>
                        {loading ? <ActivityIndicator color={'#0a0a0b'} /> : <Text style={s.btnText}>sign in</Text>}
                      </View>
                    </HapticTouchable>

                    <HapticTouchable
                      style={s.textButton}
                      onPress={() => {
                        animateLayout();
                        if (resetOpen) {
                          closeResetPanel();
                        } else {
                          setResetOpen(true);
                          setError('');
                          setSuccess('');
                          setResetIdentifier(username.trim() || resetIdentifier);
                        }
                      }}
                      activeOpacity={0.8}
                      disabled={loading}
                      haptic="selection"
                    >
                      <Text style={s.textButtonLabel}>forgot password?</Text>
                    </HapticTouchable>

                    {resetOpen ? (
                      <View style={s.resetPanel}>
                        {resetStep === 'contact' ? (
                          <>
                            <Text style={s.label}>account email or phone</Text>
                            <TextInput style={s.input} value={resetIdentifier} onChangeText={setResetIdentifier} placeholder="you@example.com or phone number" placeholderTextColor={rgbaFromHex(CB_ACCENT, 0.45)} autoCapitalize="none" />
                            <HapticTouchable style={s.secondaryBtn} onPress={handleRequestPasswordReset} activeOpacity={0.88} disabled={resetLoading} haptic="medium">
                              {resetLoading ? <ActivityIndicator color={CB_ACCENT} /> : <Text style={s.secondaryBtnText}>send OTP</Text>}
                            </HapticTouchable>
                          </>
                        ) : resetStep === 'otp' ? (
                          <>
                            <Text style={s.label}>enter OTP</Text>
                            <TextInput style={s.input} value={resetOtp} onChangeText={setResetOtp} placeholder="6-digit OTP" placeholderTextColor={rgbaFromHex(CB_ACCENT, 0.45)} keyboardType="number-pad" maxLength={6} />
                            <HapticTouchable style={s.secondaryBtn} onPress={handleVerifyResetOtpStep} activeOpacity={0.88} haptic="medium">
                              <Text style={s.secondaryBtnText}>continue</Text>
                            </HapticTouchable>
                            <HapticTouchable style={s.textButton} onPress={() => { animateLayout(); setResetStep('contact'); }} activeOpacity={0.8} haptic="selection">
                              <Text style={s.textButtonLabel}>back</Text>
                            </HapticTouchable>
                          </>
                        ) : (
                          <>
                            <Text style={s.label}>new password</Text>
                            <TextInput style={s.input} value={resetPassword} onChangeText={setResetPassword} placeholder="new password" placeholderTextColor={rgbaFromHex(CB_ACCENT, 0.45)} secureTextEntry />
                            <Text style={[s.label, s.spacedLabel]}>confirm password</Text>
                            <TextInput style={s.input} value={resetConfirmPassword} onChangeText={setResetConfirmPassword} placeholder="confirm password" placeholderTextColor={rgbaFromHex(CB_ACCENT, 0.45)} secureTextEntry />
                            <HapticTouchable style={s.secondaryBtn} onPress={handleConfirmPasswordReset} activeOpacity={0.88} disabled={resetLoading} haptic="medium">
                              {resetLoading ? <ActivityIndicator color={CB_ACCENT} /> : <Text style={s.secondaryBtnText}>reset password</Text>}
                            </HapticTouchable>
                            <HapticTouchable style={s.textButton} onPress={() => { animateLayout(); setResetStep('otp'); }} activeOpacity={0.8} disabled={resetLoading} haptic="selection">
                              <Text style={s.textButtonLabel}>back</Text>
                            </HapticTouchable>
                          </>
                        )}
                      </View>
                    ) : null}

                    <HapticTouchable style={[s.googleBtn, { marginTop: 16 }]} onPress={handleGoogleSignIn} activeOpacity={0.88} disabled={loading || !request} haptic="medium">
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
                      placeholderTextColor={rgbaFromHex(CB_ACCENT, 0.45)}
                      keyboardType="number-pad"
                      maxLength={6}
                    />

                    <HapticTouchable style={s.btnWrap} onPress={handleVerifyRegistration} activeOpacity={0.88} disabled={loading} haptic="medium">
                      <View style={s.btn}>
                        {loading ? <ActivityIndicator color={'#0a0a0b'} /> : <Text style={s.btnText}>verify account</Text>}
                      </View>
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
                        animateLayout();
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
                        <TextInput style={s.input} value={regFirstName} onChangeText={setRegFirstName} placeholder="first" placeholderTextColor={rgbaFromHex(CB_ACCENT, 0.45)} autoCapitalize="words" />
                      </View>
                      <View style={s.half}>
                        <Text style={s.label}>last name</Text>
                        <TextInput style={s.input} value={regLastName} onChangeText={setRegLastName} placeholder="last" placeholderTextColor={rgbaFromHex(CB_ACCENT, 0.45)} autoCapitalize="words" />
                      </View>
                    </View>

                    <Text style={[s.label, s.spacedLabel]}>email</Text>
                    <TextInput style={s.input} value={regEmail} onChangeText={setRegEmail} placeholder="you@example.com" placeholderTextColor={rgbaFromHex(CB_ACCENT, 0.45)} autoCapitalize="none" keyboardType="email-address" />

                    <Text style={[s.label, s.spacedLabel]}>phone number (optional)</Text>
                    <TextInput style={s.input} value={regPhone} onChangeText={setRegPhone} placeholder="for logging in with your phone" placeholderTextColor={rgbaFromHex(CB_ACCENT, 0.45)} keyboardType="phone-pad" />

                    <Text style={[s.label, s.spacedLabel]}>username</Text>
                    <TextInput style={s.input} value={regUsername} onChangeText={setRegUsername} placeholder="choose a username" placeholderTextColor={rgbaFromHex(CB_ACCENT, 0.45)} autoCapitalize="none" autoCorrect={false} />

                    <Text style={[s.label, s.spacedLabel]}>password</Text>
                    <TextInput style={s.input} value={regPassword} onChangeText={setRegPassword} placeholder="8+ chars, uppercase + symbol" placeholderTextColor={rgbaFromHex(CB_ACCENT, 0.45)} secureTextEntry />

                    <Text style={[s.label, s.spacedLabel]}>confirm password</Text>
                    <TextInput style={s.input} value={regConfirmPassword} onChangeText={setRegConfirmPassword} placeholder="re-enter password" placeholderTextColor={rgbaFromHex(CB_ACCENT, 0.45)} secureTextEntry />

                    <HapticTouchable style={s.btnWrap} onPress={handleRegister} activeOpacity={0.88} disabled={loading} haptic="medium">
                      <View style={s.btn}>
                        {loading ? <ActivityIndicator color={'#0a0a0b'} /> : <Text style={s.btnText}>create account</Text>}
                      </View>
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
  const contentMaxWidth = Math.min(layout.contentMaxWidth, 600);
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bgPrimary },
    kav: { flex: 1 },
    scrollView: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      justifyContent: layout.height < 760 ? 'flex-start' : 'center',
      paddingTop: layout.height < 760 ? 12 : 20,
      paddingBottom: 22,
    },
    content: {
      width: '100%',
      maxWidth: contentMaxWidth,
      alignSelf: 'center',
      paddingHorizontal: layout.isTablet ? 6 : 0,
    },
    panel: {
      width: '100%',
      // Literal .cb-tile (Home.css:283-300): border-radius 26px, the same
      // 155deg card gradient + dual cast shadow used for the team/problem/
      // architecture tiles. Ring is the shadow's own inset entry, not a
      // separate border — the site doesn't use a real border here either.
      borderRadius: 26,
      paddingHorizontal: 8,
      paddingVertical: 16,
      // Solid fallback under the gradient canvas: the Skia canvas re-measures
      // on layout, but on the frame the card first grows taller (e.g.
      // switching into "create account", which adds several fields), the
      // gradient can lag a frame behind the new height and show a gap at the
      // bottom before it catches up. This fill is the gradient's own darkest
      // stop, so any such gap reads as part of the card, not a cutoff.
      backgroundColor: CB_CARD_BOTTOM,
      boxShadow: cbPlainCardShadow(),
    } as ViewStyle,
    panelClip: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 26,
      overflow: 'hidden',
    },
    panelHeader: {
      alignItems: 'center',
      marginBottom: 20,
    },
    heroWord: {
      fontFamily: 'Inter_900Black',
      fontSize: 40,
      lineHeight: 44,
      // Literal .cb-tile-title color (Home.css:428): var(--cb-accent).
      color: CB_ACCENT,
      letterSpacing: -1.4,
      textAlign: 'center',
    },
    panelSubtitle: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      lineHeight: 18,
      color: CB_ACCENT,
      marginTop: 10,
      textAlign: 'center',
    },
    tabs: {
      flexDirection: 'row',
      // No literal source on the homepage for a segmented control — the
      // marketing page has no form UI. Kept on the same card material
      // (CB_CARD_TOP) and the already cb-tile-derived shadow helpers
      // rather than inventing a new color family.
      backgroundColor: CB_CARD_TOP,
      borderRadius: 20,
      marginBottom: 18,
      padding: 4,
      boxShadow: cbPlainPressedShadow(0.6),
    } as ViewStyle,
    tab: {
      flex: 1,
      paddingVertical: 11,
      alignItems: 'center',
      borderRadius: 16,
    },
    tabActive: {
      backgroundColor: CB_CARD_TOP,
      boxShadow: cbPlainRaisedShadow(),
    } as ViewStyle,
    tabText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: rgbaFromHex(CB_ACCENT, 0.55),
      letterSpacing: 0.7,
    },
    tabTextActive: {
      color: CB_ACCENT,
    },

    form: {},
    row: { flexDirection: layout.width < 420 ? 'column' : 'row', gap: 4 },
    half: { flex: 1 },

    label: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
      color: rgbaFromHex(CB_ACCENT, 0.65),
      letterSpacing: 1.8,
      marginBottom: 8,
      textTransform: 'uppercase',
    },
    spacedLabel: { marginTop: 15 },
    input: {
      // Same caveat as tabs — no literal input on the homepage to copy from.
      backgroundColor: CB_CARD_TOP,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 13,
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: CB_ACCENT,
      boxShadow: cbPlainPressedShadow(),
    } as ViewStyle,

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
      fontSize: 11,
      color: theme.danger,
      letterSpacing: 0.2,
      textAlign: 'center',
    },
    success: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: theme.success,
      letterSpacing: 0.2,
      textAlign: 'center',
    },

    // Literal .cb-modal-cta (Home.css:649-663): the one real filled-gold
    // button on the site. Flat --cb-accent fill, near-black text (gold text
    // on a gold button would be invisible — the source itself uses #0a0a0b
    // here), border-radius 16px, single cast shadow only — no light
    // counter-shadow, no inset ring, no gradient, no grain.
    btnWrap: {
      marginTop: 22,
      borderRadius: 16,
      boxShadow: [{ offsetX: 8, offsetY: 8, blurRadius: 18, color: 'rgba(0, 0, 0, 0.62)' }] as ViewStyle['boxShadow'],
    } as ViewStyle,
    btn: {
      backgroundColor: CB_ACCENT,
      borderRadius: 16,
      overflow: 'hidden',
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnText: {
      fontFamily: 'Inter_900Black',
      fontSize: 13,
      color: '#0a0a0b',
      letterSpacing: 0.6,
    },

    textButton: { alignItems: 'center', paddingTop: 14 },
    textButtonLabel: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: CB_ACCENT,
      letterSpacing: 0.2,
    },

    resetPanel: {
      marginTop: 16,
      padding: 14,
      borderRadius: 22,
      backgroundColor: CB_CARD_TOP,
      boxShadow: cbPlainPressedShadow(0.75),
    } as ViewStyle,
    secondaryBtn: {
      marginTop: 16,
      borderRadius: 22,
      paddingVertical: 14,
      alignItems: 'center',
      backgroundColor: CB_CARD_TOP,
      boxShadow: cbPlainRaisedShadow(),
    } as ViewStyle,
    secondaryBtnText: {
      fontFamily: 'Inter_900Black',
      fontSize: 11,
      color: CB_ACCENT,
      letterSpacing: 0.7,
    },

    googleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      borderRadius: 22,
      paddingVertical: 15,
      backgroundColor: CB_CARD_TOP,
      boxShadow: cbPlainRaisedShadow(),
    } as ViewStyle,
    googleIcon: { fontFamily: 'Inter_900Black', fontSize: 15, color: CB_ACCENT },
    googleText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: CB_ACCENT,
      letterSpacing: 0.2,
    },
  });
}
