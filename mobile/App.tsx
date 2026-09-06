import { useState, useEffect } from 'react';
import { View, Text, Button, Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import OnboardingQuizScreen from './src/screens/OnboardingQuizScreen';
import TabNavigator from './src/navigation/TabNavigator';
import { restoreSession, signOut, AuthUser } from './src/services/auth';
import { checkProfileQuiz, getAccountSession, WEB_URL } from './src/services/api';
import { useSessionTracking } from './src/hooks/useSessionTracking';
import { ThemeProvider, useAppTheme } from './src/contexts/ThemeContext';
import { PulseCubesLoader } from './src/components/PulseCubes';

function AppContent() {
  const [splash, setSplash]   = useState(true);
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  const { selectedTheme } = useAppTheme();
  const [role, setRole] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspaceRetry, setWorkspaceRetry] = useState(0);

  useEffect(() => {
    restoreSession().then(u => setUser(u)).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) {
      setNeedsOnboarding(null);
      return;
    }
    let cancelled = false;
    setRole(null); setWorkspaceError(''); setNeedsOnboarding(null);
    getAccountSession().then(async session => {
      if (cancelled) return;
      setRole(session.role);
      if (session.role !== 'learner') { setNeedsOnboarding(false); return; }
      const status = await checkProfileQuiz(user.username);
      if (!cancelled) setNeedsOnboarding(!status.completed);
    }).catch(() => { if (!cancelled) setWorkspaceError('Your workspace could not be loaded. Check your connection and try again.'); });
    return () => { cancelled = true; };
  }, [user?.username, workspaceRetry]);

  useSessionTracking(user);

  if (splash) {
    return (
      <>
        <StatusBar style={selectedTheme.isLight ? 'dark' : 'light'} />
        <SplashScreen onFinish={() => setSplash(false)} />
      </>
    );
  }

  return (
    <>
      <StatusBar style={selectedTheme.isLight ? 'dark' : 'light'} />
      {!user ? (
        <LoginScreen onLogin={u => setUser(u)} />
      ) : workspaceError ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: selectedTheme.bgPrimary }}><Text style={{ color: selectedTheme.textPrimary }}>{workspaceError}</Text><Button title="Try again" onPress={() => setWorkspaceRetry(n => n + 1)} /><Button title="Sign out" onPress={() => { void signOut().then(() => setUser(null)); }} /></View>
      ) : role && role !== 'learner' ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: selectedTheme.bgPrimary }}>
          <Text accessibilityRole="header" style={{ fontSize: 24, color: selectedTheme.textPrimary }}>{role === 'educator' ? 'Educator workspace' : 'Student workspace'}</Text>
          <Text style={{ fontSize: 16, color: selectedTheme.textPrimary, marginVertical: 20 }}>Classes, assignments and feedback are available in your web workspace. Sign in there with the same account to continue.</Text>
          <Button title="Open classroom workspace" onPress={() => { void Linking.openURL(`${WEB_URL}/${role}`).catch(() => setWorkspaceError('Could not open your browser. Please try again.')); }} />
          <Button title="Sign out" onPress={() => { void signOut().then(() => setUser(null)); }} />
        </View>
      ) : needsOnboarding === null ? (
        <View style={{ flex: 1, backgroundColor: selectedTheme.bgPrimary }}>
          <PulseCubesLoader color={selectedTheme.accentHover} />
        </View>
      ) : needsOnboarding ? (
        <OnboardingQuizScreen user={user} onDone={() => setNeedsOnboarding(false)} />
      ) : (
        <TabNavigator
          user={user}
          onLogout={() => setUser(null)}
          onUserUpdate={(patch) => setUser((current) => (current ? { ...current, ...patch } : current))}
          onRetakeQuiz={() => setNeedsOnboarding(true)}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
