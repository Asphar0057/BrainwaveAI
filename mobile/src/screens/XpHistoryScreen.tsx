import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import { getRecentPointActivities, RecentPointActivity } from '../services/api';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import { cbTileShadow, cbTileBorder } from '../components/NeumorphicTexture';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = { user: AuthUser; onBack: () => void };
type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];
type SortMode = 'newest' | 'points';

const TYPE_ICONS: Record<string, IoniconsName> = {
  ai_chat: 'sparkles-outline',
  note_created: 'document-text-outline',
  flashcard_set: 'layers-outline',
  flashcard_created: 'layers-outline',
  flashcard_reviewed: 'repeat-outline',
  flashcard_mastered: 'ribbon-outline',
  question_answered: 'help-circle-outline',
  quiz_completed: 'trophy-outline',
  solo_quiz: 'person-outline',
  study_time: 'time-outline',
  battle_win: 'flash-outline',
  battle_draw: 'flash-outline',
  battle_loss: 'flash-outline',
  learning_path_node: 'map-outline',
  xp_vault_reward: 'gift-outline',
};

const TYPE_LABELS: Record<string, string> = {
  ai_chat: 'AI Chat',
  note_created: 'Notes',
  flashcard_set: 'Flashcards',
  flashcard_created: 'Flashcards',
  flashcard_reviewed: 'Flashcard Review',
  flashcard_mastered: 'Flashcard Mastery',
  question_answered: 'Practice Questions',
  quiz_completed: 'Quizzes',
  solo_quiz: 'Solo Quizzes',
  study_time: 'Study Time',
  battle_win: 'Battles',
  battle_draw: 'Battles',
  battle_loss: 'Battles',
  learning_path_node: 'Learning Paths',
  xp_vault_reward: 'Vault Rewards',
};

function typeIcon(activityType: string): IoniconsName {
  return TYPE_ICONS[activityType] ?? 'ellipse-outline';
}

function typeLabel(activityType: string): string {
  return TYPE_LABELS[activityType] ?? activityType.replace(/_/g, ' ');
}

export default function XpHistoryScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(selectedTheme, layout, insets.top), [selectedTheme, layout, insets.top]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activities, setActivities] = useState<RecentPointActivity[]>([]);
  const [search, setSearch] = useState('');
  const [activeType, setActiveType] = useState<string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    getRecentPointActivities(user.username, 100)
      .then((res) => {
        setActivities(res.activities ?? []);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [user.username]);

  useEffect(() => { load(); }, [load]);

  const types = useMemo(() => {
    const seen = new Map<string, number>();
    for (const a of activities) seen.set(a.activity_type, (seen.get(a.activity_type) ?? 0) + 1);
    return Array.from(seen.entries()).sort((a, b) => b[1] - a[1]).map(([type]) => type);
  }, [activities]);

  const filtered = useMemo(() => {
    let list = activities;
    if (activeType !== 'all') list = list.filter((a) => a.activity_type === activeType);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((a) => a.description.toLowerCase().includes(q));
    if (sortMode === 'points') list = [...list].sort((a, b) => b.points - a.points);
    return list;
  }, [activities, activeType, search, sortMode]);

  const totalPoints = useMemo(() => filtered.reduce((sum, a) => sum + a.points, 0), [filtered]);

  if (!fontsLoaded) return null;

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
            <Text style={s.kicker}>XP</Text>
            <Text style={s.title}>history</Text>
          </View>
        </View>

        <View style={s.searchRow}>
          <Ionicons name="search-outline" size={16} color={selectedTheme.textSecondary} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="search activity..."
            placeholderTextColor={selectedTheme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 ? (
            <HapticTouchable onPress={() => setSearch('')} haptic="selection" accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={selectedTheme.textSecondary} />
            </HapticTouchable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          <HapticTouchable
            style={[s.chip, activeType === 'all' && s.chipActive]}
            onPress={() => setActiveType('all')}
            haptic="selection"
            activeOpacity={0.85}
          >
            <Text style={[s.chipLabel, activeType === 'all' && s.chipLabelActive]}>all</Text>
          </HapticTouchable>
          {types.map((type) => {
            const active = type === activeType;
            return (
              <HapticTouchable
                key={type}
                style={[s.chip, active && s.chipActive]}
                onPress={() => setActiveType(type)}
                haptic="selection"
                activeOpacity={0.85}
              >
                <Ionicons name={typeIcon(type)} size={12} color={active ? (selectedTheme.isLight ? darkenColor(selectedTheme.accent, 34) : selectedTheme.bgPrimary) : selectedTheme.textSecondary} />
                <Text style={[s.chipLabel, active && s.chipLabelActive]}>{typeLabel(type).toLowerCase()}</Text>
              </HapticTouchable>
            );
          })}
        </ScrollView>

        <View style={s.sortRow}>
          <Text style={s.resultCount}>{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'} · +{totalPoints} xp</Text>
          <View style={s.sortToggle}>
            <HapticTouchable
              style={[s.sortBtn, sortMode === 'newest' && s.sortBtnActive]}
              onPress={() => setSortMode('newest')}
              haptic="selection"
              activeOpacity={0.85}
            >
              <Text style={[s.sortBtnLabel, sortMode === 'newest' && s.sortBtnLabelActive]}>newest</Text>
            </HapticTouchable>
            <HapticTouchable
              style={[s.sortBtn, sortMode === 'points' && s.sortBtnActive]}
              onPress={() => setSortMode('points')}
              haptic="selection"
              activeOpacity={0.85}
            >
              <Text style={[s.sortBtnLabel, sortMode === 'points' && s.sortBtnLabelActive]}>highest xp</Text>
            </HapticTouchable>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 60 }} />
        ) : loadError ? (
          <HapticTouchable onPress={load} haptic="light" style={s.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={selectedTheme.danger} />
            <Text style={s.errorBannerText}>couldn't load — tap to retry</Text>
          </HapticTouchable>
        ) : filtered.length === 0 ? (
          <View style={s.emptyWrap}>
            <Ionicons name="time-outline" size={26} color={selectedTheme.textSecondary} />
            <Text style={s.emptyText}>
              {activities.length === 0 ? 'no XP activity yet — keep studying to build your history.' : 'nothing matches this search or filter.'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {filtered.map((a, index) => (
              <View key={`${a.activity_type}-${index}-${a.description}`} style={s.row}>
                <View style={s.rowIconWrap}>
                  <Ionicons name={typeIcon(a.activity_type)} size={16} color={selectedTheme.accentHover} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowDesc}>{a.description}</Text>
                  <Text style={s.rowMeta}>{typeLabel(a.activity_type)} · {a.time_ago}</Text>
                </View>
                <Text style={s.rowPoints}>+{a.points}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>, topInset: number) {
  const surface = theme.panel;
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.18 : 0.2);
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 4, paddingTop: Math.max(topInset + 10, 50), paddingBottom: 60, gap: 4 },
    header: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    iconBtn: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.82), alignItems: 'center', justifyContent: 'center' },
    headerCopy: { flex: 1 },
    kicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 10, letterSpacing: 1.7 },
    title: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 28, lineHeight: 32, letterSpacing: -0.6 },

    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11,
      backgroundColor: rgbaFromHex(surface, 0.72), borderWidth: 1, borderColor: border,
      marginBottom: 12,
    } as ViewStyle,
    searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.textPrimary, padding: 0 },

    chipRow: { gap: 8, paddingBottom: 12, paddingRight: 4 },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 13, paddingVertical: 8, borderRadius: 12,
      backgroundColor: rgbaFromHex(surface, 0.6), borderWidth: 1, borderColor: border,
    } as ViewStyle,
    chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
    chipLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.2, color: theme.textSecondary },
    chipLabelActive: { color: theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary },

    sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    resultCount: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.textSecondary },
    sortToggle: { flexDirection: 'row', borderRadius: 12, backgroundColor: rgbaFromHex(surface, 0.6), borderWidth: 1, borderColor: border, padding: 3, gap: 3 },
    sortBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9 },
    sortBtnActive: { backgroundColor: theme.accent },
    sortBtnLabel: { fontFamily: 'Inter_700Bold', fontSize: 9.5, letterSpacing: 0.5, textTransform: 'uppercase', color: theme.textSecondary },
    sortBtnLabelActive: { color: theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary },

    errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: rgbaFromHex(theme.danger, 0.3), backgroundColor: rgbaFromHex(theme.danger, 0.1), paddingHorizontal: 14, paddingVertical: 10, marginTop: 10 } as ViewStyle,
    errorBannerText: { fontFamily: 'Inter_600SemiBold', color: theme.danger, fontSize: 12 },

    emptyWrap: { alignItems: 'center', gap: 10, paddingVertical: 50 },
    emptyText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.textSecondary, textAlign: 'center', paddingHorizontal: 30, lineHeight: 18 },

    row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, backgroundColor: rgbaFromHex(surface, 0.9), paddingHorizontal: 14, paddingVertical: 12, overflow: 'hidden', boxShadow: cbTileShadow(0.05), ...cbTileBorder(0.13) } as ViewStyle,
    rowIconWrap: {
      width: 36, height: 36, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
      backgroundColor: rgbaFromHex(theme.accent, theme.isLight ? 0.12 : 0.16),
      borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.18 : 0.22),
    },
    rowDesc: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: theme.textPrimary },
    rowMeta: { fontFamily: 'Inter_400Regular', fontSize: 10.5, color: theme.textSecondary, marginTop: 3, letterSpacing: 0.2 },
    rowPoints: { fontFamily: 'Inter_900Black', fontSize: 13, color: theme.accentHover },
  });
}
