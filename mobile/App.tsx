import { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import TabNavigator from './src/navigation/TabNavigator';
import { getStoredUser, AuthUser } from './src/services/auth';
import { useSessionTracking } from './src/hooks/useSessionTracking';
import { ThemeProvider, useAppTheme } from './src/contexts/ThemeContext';

function AppContent() {
  const [splash, setSplash]   = useState(false);
  const [user, setUser]       = useState<AuthUser | null>({ username: 'preview', email: 'preview@cerbyl.local', first_name: 'Preview' });
  const { selectedTheme } = useAppTheme();

  useEffect(() => {
    // Simulator-only dock preview.
  }, []);

  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
  }, []);

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
      {user
        ? (
          <TabNavigator
            user={user}
            onLogout={() => setUser(null)}
            onUserUpdate={(patch) => setUser((current) => (current ? { ...current, ...patch } : current))}
          />
        )
        : <LoginScreen onLogin={u => setUser(u)} />
      }
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
