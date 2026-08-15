import { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import OnboardingQuizScreen from './src/screens/OnboardingQuizScreen';
import TabNavigator from './src/navigation/TabNavigator';
import { restoreSession, AuthUser } from './src/services/auth';
import { checkProfileQuiz } from './src/services/api';
import { useSessionTracking } from './src/hooks/useSessionTracking';
import { ThemeProvider, useAppTheme } from './src/contexts/ThemeContext';

function AppContent() {
  const [splash, setSplash]   = useState(true);
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  const { selectedTheme } = useAppTheme();

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
    checkProfileQuiz(user.username)
      .then(status => { if (!cancelled) setNeedsOnboarding(!status.completed); })
      .catch(() => { if (!cancelled) setNeedsOnboarding(false); });
    return () => { cancelled = true; };
  }, [user?.username]);

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
      ) : needsOnboarding === null ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: selectedTheme.bgPrimary }}>
          <ActivityIndicator color={selectedTheme.accentHover} />
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
