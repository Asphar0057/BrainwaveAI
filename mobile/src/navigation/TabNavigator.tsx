import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Text, ViewStyle, Animated, Keyboard, Platform } from 'react-native';
import PagerView, { AppPagerHandle } from '../components/AppPager';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { NavigationIndependentTree } from '@react-navigation/core';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts, Inter_700Bold } from '@expo-google-fonts/inter';
import { AuthUser } from '../services/auth';
import HomeScreen from '../screens/HomeScreen';
import AIChatScreen from '../screens/AIChatScreen';
import SocialScreen from '../screens/SocialScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MoreScreen from '../screens/MoreScreen';
import FlashcardsScreen from '../screens/FlashcardsScreen';
import NotesScreen from '../screens/NotesScreen';
import AIMediaNotesScreen from '../screens/AIMediaNotesScreen';
import SettingsScreen from '../screens/SettingsScreen';
import QuestionBankScreen from '../screens/QuestionBankScreen';
import KnowledgeMapsScreen from '../screens/KnowledgeMapsScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import XpAnalyticsScreen from '../screens/XpAnalyticsScreen';
import WeaknessPracticeScreen from '../screens/WeaknessPracticeScreen';
import TopicsHubScreen from '../screens/TopicsHubScreen';
import KnowledgeHubScreen from '../screens/KnowledgeHubScreen';
import SlideExplorerScreen from '../screens/SlideExplorerScreen';
import CanvasHubScreen from '../screens/CanvasHubScreen';
import LearningPathsScreen from '../screens/social/LearningPathsScreen';
import LeaderboardScreen from '../screens/social/LeaderboardScreen';
import RLInsightsScreen from '../screens/RLInsightsScreen';
import AchievementsScreen from '../screens/AchievementsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import HapticTouchable from '../components/HapticTouchable';
import ScreenErrorBoundary from '../components/ScreenErrorBoundary';
import { useAppTheme } from '../contexts/ThemeContext';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];
type RootStackParamList = {
  Main: { selectedTab?: number; tabRequestKey?: number } | undefined;
  Flashcards: undefined;
  Notes: undefined;
  AIMedia: undefined;
  Settings: undefined;
  QuestionBank: undefined;
  KnowledgeMaps: undefined;
  KnowledgeHub: undefined;
  SlideExplorer: undefined;
  CanvasHub: undefined;
  Analytics: undefined;
  XpAnalytics: undefined;
  WeaknessPractice: undefined;
  TopicsHub: undefined;
  LearningPaths: undefined;
  Leaderboard: undefined;
  RLInsights: undefined;
  Achievements: undefined;
  Notifications: undefined;
};

const TABS: { label: string; icon: IoniconsName; activeIcon: IoniconsName }[] = [
  { label: 'ai',      icon: 'sparkles-outline', activeIcon: 'sparkles' },
  { label: 'explore', icon: 'grid-outline',      activeIcon: 'grid'    },
  { label: 'cerbyl',  icon: 'home-outline',      activeIcon: 'home'    },
  { label: 'social',  icon: 'people-outline',    activeIcon: 'people'  },
  { label: 'profile', icon: 'person-outline',    activeIcon: 'person'  },
];

type Props = { user: AuthUser; onLogout: () => void; onUserUpdate?: (patch: Partial<AuthUser>) => void; onRetakeQuiz?: () => void };
const Stack = createNativeStackNavigator<RootStackParamList>();

type AppTarget = 'flashcards' | 'notes' | 'aimedia' | 'settings' | 'questionBank' | 'knowledgeMaps' | 'knowledgeHub' | 'slideExplorer' | 'canvasHub' | 'analytics' | 'xpAnalytics' | 'weaknessPractice' | 'topicsHub' | 'learningPaths' | 'leaderboard' | 'rlInsights' | 'achievements' | 'notifications';

function MainTabs({ user, onLogout, onUserUpdate, onRetakeQuiz, onNavigate, requestedTab, tabRequestKey }: Props & {
  onNavigate: (screen: AppTarget) => void;
  requestedTab?: number;
  tabRequestKey?: number;
}) {
  const insets = useSafeAreaInsets();
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const useSideRail = layout.sideRailTabs;
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  useFonts({ Inter_700Bold });
  const [index, setIndex] = useState(2);
  const pager = useRef<AppPagerHandle>(null);
  const kbHeight = useRef(new Animated.Value(0)).current;

  const goTo = (i: number) => {
    pager.current?.setPage(i);
    setIndex(i);
  };

  useFocusEffect(
    useCallback(() => {
      if (requestedTab == null) return;
      const frame = requestAnimationFrame(() => goTo(requestedTab));
      return () => cancelAnimationFrame(frame);
    }, [requestedTab, tabRequestKey])
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const rawHeight = e.endCoordinates?.height ?? 0;
      const androidNavBarBuffer = Platform.OS === 'android' ? insets.bottom : 0;
      Animated.timing(kbHeight, {
        toValue: rawHeight > 0 ? rawHeight + androidNavBarBuffer : 0,
        duration: Platform.OS === 'ios' ? (e.duration || 250) : 180,
        useNativeDriver: false,
      }).start();
    });
    const hideSub = Keyboard.addListener(hideEvent, (e: { duration?: number }) => {
      Animated.timing(kbHeight, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? (e?.duration || 200) : 180,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [kbHeight, insets.bottom]);

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[s.shell, useSideRail && { paddingLeft: insets.left, paddingRight: insets.right }]}>
        {useSideRail ? (
          <View style={[s.sideRailWrap, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 14) }]}>
            <View style={[s.tabBar, s.tabBarRail]}>
              {TABS.map((t, i) => {
                const active = index === i;
                return (
                  <HapticTouchable
                    key={t.label}
                    style={[s.tab, s.tabRail]}
                    onPress={() => goTo(i)}
                    activeOpacity={0.78}
                    haptic="selection"
                    accessibilityLabel={`${t.label} tab`}
                    accessibilityState={{ selected: active }}
                  >
                    <View style={[s.iconWrap, active && s.iconWrapActive]}>
                      <Ionicons name={active ? t.activeIcon : t.icon} size={18} color={active ? selectedTheme.bgPrimary : selectedTheme.textSecondary} />
                    </View>
                    <Text allowFontScaling={false} style={[s.tabLabel, s.tabLabelRail, { color: active ? selectedTheme.textPrimary : selectedTheme.textSecondary }]}>{t.label}</Text>
                  </HapticTouchable>
                );
              })}
            </View>
          </View>
        ) : null}

        <Animated.View style={[s.contentWrap, { paddingTop: insets.top, paddingBottom: kbHeight }]}>
          <PagerView
            ref={pager}
            style={{ flex: 1 }}
            initialPage={2}
            onPageSelected={e => setIndex(e.nativeEvent.position)}
            overdrag={false}
            scrollEnabled={true}
          >
            <View key="0" collapsable={false} style={s.page}><AIChatScreen user={user} /></View>
            <View key="1" collapsable={false} style={s.page}><MoreScreen user={user} onNavigate={onNavigate} onNavigateToAI={() => goTo(0)} /></View>
            <View key="2" collapsable={false} style={s.page}><HomeScreen user={user} onNavigate={onNavigate} onNavigateToAI={() => goTo(0)} onSwipeLeftPage={() => goTo(3)} onSwipeRightPage={() => goTo(1)} /></View>
            <View key="3" collapsable={false} style={s.page}><SocialScreen user={user} onOpenLeaderboard={() => onNavigate('leaderboard')} /></View>
            <View key="4" collapsable={false} style={s.page}><ProfileScreen user={user} onLogout={onLogout} onUserUpdate={onUserUpdate} onNavigate={onNavigate} onRetakeQuiz={onRetakeQuiz} /></View>
          </PagerView>

          {!useSideRail ? (
            <Animated.View
              style={{
                maxHeight: kbHeight.interpolate({ inputRange: [0, 120], outputRange: [200, 0], extrapolate: 'clamp' }),
                opacity: kbHeight.interpolate({ inputRange: [0, 60], outputRange: [1, 0], extrapolate: 'clamp' }),
                overflow: 'hidden',
              }}
            >
              <View style={[s.tabBarWrap, { paddingBottom: insets.bottom ? Math.max(insets.bottom - 2, 6) : 12 }]}>
                <View style={s.tabBar}>
                  {TABS.map((t, i) => {
                    const active = index === i;
                    return (
                      <HapticTouchable
                        key={t.label}
                        style={s.tab}
                        onPress={() => goTo(i)}
                        activeOpacity={0.78}
                        haptic="selection"
                        accessibilityLabel={`${t.label} tab`}
                        accessibilityState={{ selected: active }}
                      >
                        <View style={[s.iconWrap, active && s.iconWrapActive]}>
                          <Ionicons name={active ? t.activeIcon : t.icon} size={18} color={active ? selectedTheme.bgPrimary : selectedTheme.textSecondary} />
                        </View>
                        <Text allowFontScaling={false} style={[s.tabLabel, { color: active ? selectedTheme.textPrimary : selectedTheme.textSecondary }]}>{t.label}</Text>
                      </HapticTouchable>
                    );
                  })}
                </View>
              </View>
            </Animated.View>
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

export default function TabNavigator({ user, onLogout, onUserUpdate, onRetakeQuiz }: Props) {
  const { selectedTheme } = useAppTheme();
  return (
    <NavigationIndependentTree>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
            gestureDirection: 'horizontal',
            contentStyle: { backgroundColor: selectedTheme.bgPrimary },
          }}
        >
          <Stack.Screen name="Main">
            {({ navigation, route }) => (
              <MainTabs
                user={user}
                onLogout={onLogout}
                onUserUpdate={onUserUpdate}
                onRetakeQuiz={onRetakeQuiz}
                requestedTab={route.params?.selectedTab}
                tabRequestKey={route.params?.tabRequestKey}
                onNavigate={(screen) => {
                  if (screen === 'flashcards') navigation.navigate('Flashcards');
                  if (screen === 'notes') navigation.navigate('Notes');
                  if (screen === 'aimedia') navigation.navigate('AIMedia');
                  if (screen === 'settings') navigation.navigate('Settings');
                  if (screen === 'questionBank') navigation.navigate('QuestionBank');
                  if (screen === 'knowledgeMaps') navigation.navigate('KnowledgeMaps');
                  if (screen === 'knowledgeHub') navigation.navigate('KnowledgeHub');
                  if (screen === 'slideExplorer') navigation.navigate('SlideExplorer');
                  if (screen === 'canvasHub') navigation.navigate('CanvasHub');
                  if (screen === 'analytics') navigation.navigate('Analytics');
                  if (screen === 'xpAnalytics') navigation.navigate('XpAnalytics');
                  if (screen === 'weaknessPractice') navigation.navigate('WeaknessPractice');
                  if (screen === 'topicsHub') navigation.navigate('TopicsHub');
                  if (screen === 'learningPaths') navigation.navigate('LearningPaths');
                  if (screen === 'leaderboard') navigation.navigate('Leaderboard');
                  if (screen === 'rlInsights') navigation.navigate('RLInsights');
                  if (screen === 'achievements') navigation.navigate('Achievements');
                  if (screen === 'notifications') navigation.navigate('Notifications');
                }}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Flashcards">
            {({ navigation }) => (
              <ScreenErrorBoundary label="Flashcards"><FlashcardsScreen user={user} onBack={() => navigation.goBack()} /></ScreenErrorBoundary>
            )}
          </Stack.Screen>
          <Stack.Screen name="Notes">
            {({ navigation }) => (
              <ScreenErrorBoundary label="Notes"><NotesScreen user={user} onBack={() => navigation.goBack()} /></ScreenErrorBoundary>
            )}
          </Stack.Screen>
          <Stack.Screen name="AIMedia">
            {({ navigation }) => (
              <ScreenErrorBoundary label="Media Notes"><AIMediaNotesScreen user={user} onBack={() => navigation.goBack()} /></ScreenErrorBoundary>
            )}
          </Stack.Screen>
          <Stack.Screen name="Settings">
            {({ navigation }) => (
              <ScreenErrorBoundary label="Settings"><SettingsScreen user={user} onBack={() => navigation.goBack()} /></ScreenErrorBoundary>
            )}
          </Stack.Screen>
          <Stack.Screen name="QuestionBank">
            {({ navigation }) => (
              <ScreenErrorBoundary label="Question Bank"><QuestionBankScreen user={user} onBack={() => navigation.goBack()} /></ScreenErrorBoundary>
            )}
          </Stack.Screen>
          <Stack.Screen name="KnowledgeMaps">
            {({ navigation }) => (
              <ScreenErrorBoundary label="Knowledge Maps"><KnowledgeMapsScreen user={user} onBack={() => navigation.goBack()} /></ScreenErrorBoundary>
            )}
          </Stack.Screen>
          <Stack.Screen name="KnowledgeHub">
            {({ navigation }) => (
              <ScreenErrorBoundary label="Knowledge Hub">
                <KnowledgeHubScreen
                  user={user}
                  onBack={() => navigation.goBack()}
                  onNavigate={(screen) => {
                    if (screen === 'flashcards') navigation.navigate('Flashcards');
                    if (screen === 'notes') navigation.navigate('Notes');
                    if (screen === 'aimedia') navigation.navigate('AIMedia');
                    if (screen === 'settings') navigation.navigate('Settings');
                    if (screen === 'questionBank') navigation.navigate('QuestionBank');
                    if (screen === 'knowledgeMaps') navigation.navigate('KnowledgeMaps');
                    if (screen === 'slideExplorer') navigation.navigate('SlideExplorer');
                    if (screen === 'canvasHub') navigation.navigate('CanvasHub');
                    if (screen === 'analytics') navigation.navigate('Analytics');
                    if (screen === 'weaknessPractice') navigation.navigate('WeaknessPractice');
                    if (screen === 'learningPaths') navigation.navigate('LearningPaths');
                  }}
                />
              </ScreenErrorBoundary>
            )}
          </Stack.Screen>
          <Stack.Screen name="SlideExplorer">
            {({ navigation }) => (
              <ScreenErrorBoundary label="Slide Explorer">
                <SlideExplorerScreen
                  user={user}
                  onBack={() => navigation.goBack()}
                  onOpenQuestionBank={() => navigation.navigate('QuestionBank')}
                />
              </ScreenErrorBoundary>
            )}
          </Stack.Screen>
          <Stack.Screen name="CanvasHub">
            {({ navigation }) => (
              <ScreenErrorBoundary label="Canvas Hub">
                <CanvasHubScreen
                  user={user}
                  onBack={() => navigation.goBack()}
                  onOpenNotes={() => navigation.navigate('Notes')}
                />
              </ScreenErrorBoundary>
            )}
          </Stack.Screen>
          <Stack.Screen name="Analytics">
            {({ navigation }) => (
              <ScreenErrorBoundary label="Analytics"><AnalyticsScreen user={user} onBack={() => navigation.goBack()} /></ScreenErrorBoundary>
            )}
          </Stack.Screen>
          <Stack.Screen name="XpAnalytics">
            {({ navigation }) => (
              <ScreenErrorBoundary label="XP Analytics">
                <XpAnalyticsScreen
                  user={user}
                  onBack={() => navigation.goBack()}
                  onOpenAchievements={() => navigation.navigate('Achievements')}
                />
              </ScreenErrorBoundary>
            )}
          </Stack.Screen>
          <Stack.Screen name="Achievements">
            {({ navigation }) => (
              <ScreenErrorBoundary label="Achievements"><AchievementsScreen user={user} onBack={() => navigation.goBack()} /></ScreenErrorBoundary>
            )}
          </Stack.Screen>
          <Stack.Screen name="Notifications">
            {({ navigation }) => (
              <ScreenErrorBoundary label="Notifications"><NotificationsScreen user={user} onBack={() => navigation.goBack()} /></ScreenErrorBoundary>
            )}
          </Stack.Screen>
          <Stack.Screen name="WeaknessPractice">
            {({ navigation }) => (
              <ScreenErrorBoundary label="Weakness Practice">
                <WeaknessPracticeScreen
                  user={user}
                  onBack={() => navigation.goBack()}
                  onNavigate={(screen) => { if (screen === 'rlInsights') navigation.navigate('RLInsights'); }}
                />
              </ScreenErrorBoundary>
            )}
          </Stack.Screen>
          <Stack.Screen name="RLInsights">
            {({ navigation }) => (
              <ScreenErrorBoundary label="Learning Insights"><RLInsightsScreen user={user} onBack={() => navigation.goBack()} /></ScreenErrorBoundary>
            )}
          </Stack.Screen>
          <Stack.Screen name="TopicsHub">
            {({ navigation }) => (
              <ScreenErrorBoundary label="Topics Hub"><TopicsHubScreen user={user} onBack={() => navigation.goBack()} /></ScreenErrorBoundary>
            )}
          </Stack.Screen>
          <Stack.Screen name="LearningPaths">
            {({ navigation }) => (
              <ScreenErrorBoundary label="Learning Paths"><LearningPathsScreen user={user} onBack={() => navigation.goBack()} /></ScreenErrorBoundary>
            )}
          </Stack.Screen>
          <Stack.Screen name="Leaderboard">
            {({ navigation }) => (
              <ScreenErrorBoundary label="Leaderboard">
                <LeaderboardScreen
                  user={user}
                  onBack={() => navigation.popTo('Main', { selectedTab: 3, tabRequestKey: Date.now() })}
                />
              </ScreenErrorBoundary>
            )}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    shell: {
      flex: 1,
      flexDirection: layout.sideRailTabs ? 'row' : 'column',
    },
    page: {
      flex: 1,
      width: '100%',
      height: '100%',
    },
    sideRailWrap: {
      width: 116,
      paddingHorizontal: 14,
    },
    contentWrap: {
      flex: 1,
    },
    tabBarWrap: {
      paddingHorizontal: 12,
      paddingTop: 9,
    },
    tabBar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 24,
      paddingHorizontal: 7,
      paddingTop: 7,
      paddingBottom: 7,
      backgroundColor: theme.panel,
    } as ViewStyle,
    tabBarRail: {
      flex: 1,
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 24,
      paddingHorizontal: 10,
      paddingVertical: 12,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderRadius: 16,
      paddingVertical: 4,
    },
    tabRail: {
      flex: 0,
      minHeight: 74,
      gap: 8,
    },
    iconWrap: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.panelAlt,
    },
    iconWrapActive: {
      backgroundColor: theme.accent,
    },
    tabLabel: {
      fontFamily: 'Inter_700Bold',
      fontSize: 8,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    tabLabelRail: {
      fontSize: 9,
      letterSpacing: 1.75,
    },
  });
}
