import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import {
  getUserAchievements,
  getMissedAchievements,
  getDashboardData,
  EarnedAchievement,
  MissedAchievement,
  DailyChallenge,
} from '../services/api';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import { cbTileShadow } from '../components/NeumorphicTexture';
import { useAppTheme } from '../contexts/ThemeContext';
import { rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = { user: AuthUser; onBack: () => void };

const CHALLENGE_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  target: 'locate-outline',
  chat: 'chatbubbles-outline',
  note: 'document-text-outline',
  clock: 'time-outline',
  trophy: 'trophy-outline',
  cards: 'layers-outline',
  star: 'star-outline',
};

const RARITY_COLOR: Record<string, string> = {
  common: '#9aa0a6',
  uncommon: '#5fb87a',
  rare: '#4c9ff7',
  epic: '#a06cf0',
  legendary: '#e0a83d',
};

function formatEarnedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function AchievementsScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(selectedTheme, layout, insets.top), [selectedTheme, layout, insets.top]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [earned, setEarned] = useState<EarnedAchievement[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [missed, setMissed] = useState<MissedAchievement[]>([]);
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallenge | null>(null);

  const load = useCallback(async () => {
    try {
      const [achievementsRes, missedRes, dashboardRes] = await Promise.all([
        getUserAchievements(user.username),
        getMissedAchievements(user.username),
        getDashboardData(user.username).catch(() => null),
      ]);
      setEarned(achievementsRes.achievements ?? []);
      setTotalPoints(achievementsRes.total_points ?? 0);
      setMissed(missedRes.missed_achievements ?? []);
      setDailyChallenge(dashboardRes?.daily_challenge ?? null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.username]);

  useEffect(() => { load(); }, [load]);

  if (!fontsLoaded) return null;

  const challengePct = dailyChallenge
    ? Math.min(100, Math.round((dailyChallenge.progress / Math.max(1, dailyChallenge.challenge.target)) * 100))
    : 0;

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={selectedTheme.accent} />}
      >
        <View style={s.header}>
          <HapticTouchable style={s.iconBtn} onPress={onBack} haptic="light" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={20} color={selectedTheme.accentHover} />
          </HapticTouchable>
          <View style={s.headerCopy}>
            <Text style={s.kicker}>PROGRESS</Text>
            <Text style={s.title}>achievements</Text>
          </View>
          <View style={s.pointsBadge}><Text style={s.pointsBadgeText}>{totalPoints} pts</Text></View>
        </View>

        {loading ? (
          <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 80 }} />
        ) : (
          <>
            {dailyChallenge ? (
              <View style={s.challengeCard}>
                <View style={s.challengeTop}>
                  <View style={s.challengeIcon}>
                    <Ionicons name={CHALLENGE_ICONS[dailyChallenge.challenge.icon] || 'flag-outline'} size={20} color={s.accentInk.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.challengeKicker}>DAILY CHALLENGE</Text>
                    <Text style={s.challengeTitle}>{dailyChallenge.challenge.title}</Text>
                  </View>
                  <View style={s.rewardPill}><Text style={s.rewardPillText}>+{dailyChallenge.challenge.reward} XP</Text></View>
                </View>
                <Text style={s.challengeDesc}>{dailyChallenge.challenge.description}</Text>
                <View style={s.challengeTrack}><View style={[s.challengeFill, { width: `${Math.max(4, challengePct)}%` }]} /></View>
                <Text style={s.challengeProgressText}>{Math.min(dailyChallenge.progress, dailyChallenge.challenge.target)} / {dailyChallenge.challenge.target}</Text>
              </View>
            ) : null}

            <View style={s.sectionHeadRow}>
              <Text style={s.sectionTitle}>earned</Text>
              <Text style={s.sectionMeta}>{earned.length}</Text>
            </View>
            {earned.length === 0 ? (
              <Text style={s.emptyInline}>no badges earned yet — keep studying to unlock your first one.</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {earned.map((a) => (
                  <View key={a.id} style={s.achievementRow}>
                    <View style={[s.achievementIconWrap, { borderColor: rgbaFromHex(RARITY_COLOR[a.rarity] || selectedTheme.accentHover, 0.4) }]}>
                      <Text style={s.achievementEmoji}>{a.icon || '🏅'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.achievementName}>{a.name}</Text>
                      <Text style={s.achievementDesc} numberOfLines={2}>{a.description}</Text>
                      <Text style={s.achievementMeta}>earned {formatEarnedDate(a.earned_at)} · {a.category}</Text>
                    </View>
                    <Text style={[s.achievementPoints, { color: RARITY_COLOR[a.rarity] || selectedTheme.accentHover }]}>+{a.points}</Text>
                  </View>
                ))}
              </View>
            )}

            {missed.length > 0 ? (
              <>
                <View style={[s.sectionHeadRow, { marginTop: 20 }]}>
                  <Text style={s.sectionTitle}>next up</Text>
                </View>
                <View style={{ gap: 8 }}>
                  {missed.map((a) => (
                    <View key={a.id} style={[s.achievementRow, s.achievementRowLocked]}>
                      <View style={[s.achievementIconWrap, s.achievementIconWrapLocked]}>
                        <Ionicons name="lock-closed-outline" size={16} color={selectedTheme.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.achievementNameLocked}>{a.name}</Text>
                        <Text style={s.achievementDesc} numberOfLines={2}>{a.description}</Text>
                      </View>
                      <Text style={s.achievementPointsLocked}>+{a.points}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>, topInset: number) {
  const surface = theme.panel;
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.18 : 0.2);
  const accentInk = theme.isLight ? theme.accent : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 16, paddingTop: Math.max(topInset + 10, 50), paddingBottom: 110, gap: 4 },
    header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
    iconBtn: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.82), alignItems: 'center', justifyContent: 'center' },
    headerCopy: { flex: 1 },
    kicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 8, letterSpacing: 1.7 },
    title: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 28, lineHeight: 32, letterSpacing: -0.6 },
    pointsBadge: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: rgbaFromHex(theme.accent, theme.isLight ? 0.12 : 0.16) },
    pointsBadgeText: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 12 },
    accentInk: { color: accentInk },

    challengeCard: { borderRadius: 22, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.9), padding: 16, gap: 10, marginBottom: 20, boxShadow: cbTileShadow(0.07) } as ViewStyle,
    challengeTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    challengeIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    challengeKicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 8, letterSpacing: 1.4 },
    challengeTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 16, marginTop: 2 },
    rewardPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, backgroundColor: rgbaFromHex(theme.success, 0.14) },
    rewardPillText: { fontFamily: 'Inter_700Bold', color: theme.success, fontSize: 10.5 },
    challengeDesc: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, lineHeight: 17 },
    challengeTrack: { height: 6, borderRadius: 3, backgroundColor: rgbaFromHex(theme.accent, 0.12), overflow: 'hidden' },
    challengeFill: { height: '100%', borderRadius: 3, backgroundColor: theme.accentHover },
    challengeProgressText: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 10.5, textAlign: 'right' },

    sectionHeadRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
    sectionTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 15, letterSpacing: -0.2 },
    sectionMeta: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 11 },
    emptyInline: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, lineHeight: 18, paddingVertical: 6 },

    achievementRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.9), paddingHorizontal: 14, paddingVertical: 12 } as ViewStyle,
    achievementRowLocked: { opacity: 0.62 },
    achievementIconWrap: { width: 40, height: 40, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(theme.bgPrimary, theme.isLight ? 0.5 : 0.6) },
    achievementIconWrapLocked: { borderColor: border },
    achievementEmoji: { fontSize: 18 },
    achievementName: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 13 },
    achievementNameLocked: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 13 },
    achievementDesc: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, marginTop: 2, lineHeight: 15 },
    achievementMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 9.5, marginTop: 3, letterSpacing: 0.2 },
    achievementPoints: { fontFamily: 'Inter_900Black', fontSize: 13 },
    achievementPointsLocked: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 12 },
  });
}
