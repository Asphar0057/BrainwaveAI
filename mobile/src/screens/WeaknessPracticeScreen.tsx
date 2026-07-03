import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import { generatePracticeQuestions, getWeaknessAnalysis } from '../services/api';
import AmbientBubbles from '../components/AmbientBubbles';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = { user: AuthUser; onBack: () => void };
type WeakTopic = {
  topic: string;
  mastery_level?: number;
  accuracy?: number;
  questions_asked?: number;
  correct_answers?: number;
  last_practiced?: string | null;
};

function asTopics(value: unknown): WeakTopic[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') as WeakTopic[] : [];
}

export default function WeaknessPracticeScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [generatingTopic, setGeneratingTopic] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user.id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const data = await getWeaknessAnalysis(user.id);
      setAnalysis(data);
    } catch (error) {
      Alert.alert('Weakness practice', error instanceof Error ? error.message : 'Failed to load weak areas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const weaknesses = asTopics(analysis?.weaknesses).slice(0, 8);
  const mastery = asTopics(analysis?.topic_mastery).slice(0, 8);

  const generateSet = async (topic: string) => {
    setGeneratingTopic(topic);
    try {
      await generatePracticeQuestions({
        userId: user.username,
        topic,
        questionCount: 10,
        difficulty: 'mixed',
        title: `Weakness practice: ${topic}`,
      });
      Alert.alert('Practice set ready', 'Open Question Bank to start the generated set.');
    } catch (error) {
      Alert.alert('Generate failed', error instanceof Error ? error.message : 'Could not generate practice questions');
    } finally {
      setGeneratingTopic(null);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <AmbientBubbles theme={selectedTheme} variant="social" opacity={0.68} />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={selectedTheme.accent} />}
      >
        <View style={s.topBar}>
          <HapticTouchable style={s.iconBtn} onPress={onBack} haptic="light">
            <Ionicons name="chevron-back" size={18} color={selectedTheme.accent} />
          </HapticTouchable>
          <Text style={s.topMeta}>{analysis?.overall_accuracy ? `${Math.round(analysis.overall_accuracy)}% accuracy` : 'adaptive'}</Text>
        </View>

        <View style={s.hero}>
          <Text style={s.eyebrow}>targeted review</Text>
          <Text style={s.heroTitle}>weakness practice</Text>
          <Text style={s.heroCopy}>turn weak topics into generated practice sets</Text>
        </View>

        {!user.id ? (
          <View style={s.empty}>
            <Ionicons name="person-circle-outline" size={42} color={selectedTheme.accent} />
            <Text style={s.emptyTitle}>reload your session</Text>
            <Text style={s.emptyText}>the mobile account cache is missing the numeric user id needed for weakness analysis</Text>
          </View>
        ) : loading ? (
          <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 44 }} />
        ) : weaknesses.length === 0 && mastery.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="pulse-outline" size={42} color={selectedTheme.accent} />
            <Text style={s.emptyTitle}>no weak areas yet</Text>
            <Text style={s.emptyText}>complete question bank sets and the app will identify targeted practice topics</Text>
          </View>
        ) : (
          <>
            <View style={s.summaryRow}>
              <Summary label="topics" value={String(analysis?.total_topics_studied ?? mastery.length)} styles={s} />
              <Summary label="need practice" value={String(analysis?.topics_needing_practice ?? weaknesses.length)} styles={s} />
              <Summary label="accuracy" value={`${Math.round(analysis?.overall_accuracy || 0)}%`} styles={s} />
            </View>

            <View style={s.section}>
              <Text style={s.sectionTitle}>priority topics</Text>
              {(weaknesses.length ? weaknesses : mastery).map((topic) => {
                const pct = Math.max(0, Math.min(100, Math.round(topic.accuracy ?? (topic.mastery_level || 0) * 100)));
                return (
                  <View key={topic.topic} style={s.topicCard}>
                    <View style={s.topicTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.topicTitle}>{topic.topic}</Text>
                        <Text style={s.topicMeta}>{topic.correct_answers ?? 0}/{topic.questions_asked ?? 0} correct · mastery {Math.round((topic.mastery_level || 0) * 100)}%</Text>
                      </View>
                      <HapticTouchable style={s.practiceBtn} onPress={() => generateSet(topic.topic)} disabled={generatingTopic === topic.topic} haptic="medium">
                        {generatingTopic === topic.topic ? <ActivityIndicator color={selectedTheme.bgPrimary} size="small" /> : <Ionicons name="flash-outline" size={16} color={s.practiceBtnText.color} />}
                      </HapticTouchable>
                    </View>
                    <View style={s.track}><View style={[s.fill, { width: `${Math.max(4, pct)}%` }]} /></View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Summary({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const surface = theme.panel;
  const border = theme.borderStrong;
  const accentInk = theme.isLight ? darkenColor(theme.accent, 38) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 118, gap: 14 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    topMeta: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
    iconBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.92), alignItems: 'center', justifyContent: 'center' },
    hero: { borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.94), borderRadius: 16, padding: 20 },
    eyebrow: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase' },
    heroTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 34, letterSpacing: 0, marginTop: 8 },
    heroCopy: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13, marginTop: 4 },
    empty: { alignItems: 'center', paddingVertical: 48, gap: 9 },
    emptyTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 22 },
    emptyText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13, textAlign: 'center', maxWidth: 320 },
    summaryRow: { flexDirection: 'row', gap: 10 },
    summaryCard: { flex: 1, minHeight: 82, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.92), padding: 14, justifyContent: 'center' },
    summaryValue: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 24, letterSpacing: 0 },
    summaryLabel: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 4 },
    section: { borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.92), padding: 16, gap: 12 },
    sectionTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 18 },
    topicCard: { borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: rgbaFromHex(theme.panelAlt, 0.72), padding: 13, gap: 12 },
    topicTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    topicTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 16, letterSpacing: 0 },
    topicMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, marginTop: 4 },
    practiceBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: theme.accentHover, alignItems: 'center', justifyContent: 'center' },
    practiceBtnText: { color: accentInk },
    track: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: rgbaFromHex(theme.accent, 0.13) },
    fill: { height: '100%', borderRadius: 3, backgroundColor: theme.accentHover },
  });
}
