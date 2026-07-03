import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  ActivityIndicator, RefreshControl, Alert, Modal,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../../services/auth';
import { API_URL } from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HapticTouchable from '../../components/HapticTouchable';
import AmbientBubbles from '../../components/AmbientBubbles';
import GeoBackground from '../../components/GeoBackground';
import { useAppTheme } from '../../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../../utils/theme';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const LENGTHS      = ['short', 'medium', 'long'];

type StatusFilter = 'all' | 'active' | 'completed';
type LearningPath = {
  id: number;
  title: string;
  description?: string;
  topic_prompt?: string;
  difficulty?: string;
  status?: string;
  estimated_hours?: number;
  progress?: { completion_percentage: number; current_node_index: number; total_xp_earned: number };
  created_at?: string;
};

type Props = { user: AuthUser; onBack: () => void };

async function authHeaders(json = false) {
  const token = await AsyncStorage.getItem('token');
  const h: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

export default function LearningPathsScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const pc = useMemo(() => createPathCardStyles(selectedTheme), [selectedTheme]);
  const m = useMemo(() => createModalStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const [paths, setPaths]           = useState<LearningPath[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch]         = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Create form
  const [topic, setTopic]     = useState('');
  const [difficulty, setDiff] = useState('intermediate');
  const [length, setLength]   = useState('medium');
  const [goals, setGoals]     = useState('');
  const GOLD_XL = selectedTheme.accent;
  const GOLD_L = selectedTheme.accentHover;
  const GOLD_M = selectedTheme.accent;
  const GOLD_D = darkenColor(selectedTheme.accent, selectedTheme.isLight ? 12 : 26);
  const DIM = selectedTheme.textSecondary;
  const INK = selectedTheme.isLight ? darkenColor(selectedTheme.accent, 34) : selectedTheme.bgPrimary;
  const DIFF_COLOR: Record<string, string> = {
    beginner: selectedTheme.success,
    intermediate: GOLD_M,
    advanced: selectedTheme.danger,
  };

  const load = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_URL}/learning-paths`, { headers });
      if (res.ok) {
        const data = await res.json();
        setPaths(data.paths ?? []);
      }
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const filtered = paths.filter(p => {
    const st = p.status ?? 'active';
    if (statusFilter !== 'all' && st !== statusFilter) return false;
    if (!search.trim()) return true;
    return [p.title, p.description, p.topic_prompt].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase());
  });

  const doGenerate = async () => {
    if (!topic.trim()) { Alert.alert('Enter a topic'); return; }
    setGenerating(true);
    try {
      const headers = await authHeaders(true);
      const goalsArr = goals.split('\n').filter(g => g.trim()).map(g => g.trim());
      const res = await fetch(`${API_URL}/learning-paths/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ topicPrompt: topic.trim(), difficulty, length, goals: goalsArr }),
      });
      if (res.ok) {
        setShowCreate(false);
        setTopic(''); setGoals(''); setDiff('intermediate'); setLength('medium');
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert('Generation failed', err.detail ?? 'Try again');
      }
    } catch { Alert.alert('Network error'); }
    finally { setGenerating(false); }
  };

  const doDelete = (id: number) => {
    Alert.alert('Delete path?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const headers = await authHeaders();
          await fetch(`${API_URL}/learning-paths/${id}`, { method: 'DELETE', headers });
          setPaths(p => p.filter(x => x.id !== id));
        } catch {}
      }},
    ]);
  };

  if (!fontsLoaded) return null;

  const stats = {
    total: paths.length,
    active: paths.filter(p => (p.status ?? 'active') === 'active').length,
    completed: paths.filter(p => p.status === 'completed').length,
  };

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <AmbientBubbles theme={selectedTheme} variant="paths" opacity={0.8} />

      <View>
        {/* Top bar */}
        <View style={s.topBar}>
          <HapticTouchable onPress={onBack} style={s.backBtn} haptic="light">
            <Ionicons name="chevron-back" size={18} color={GOLD_M} />
          </HapticTouchable>
          <HapticTouchable onPress={() => setShowCreate(true)} haptic="medium">
            <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={s.cta}>
              <Text style={s.ctaText}>+ generate</Text>
            </LinearGradient>
          </HapticTouchable>
        </View>

        {/* Hero */}
        <View style={s.hero}>
          <Ionicons name="map" size={32} color={GOLD_XL} />
          <View style={s.heroText}>
            <Text style={s.heroTitle}>learning paths</Text>
            <Text style={s.heroSub}>{stats.active} active · {stats.completed} completed</Text>
          </View>
        </View>

        {/* Search */}
        <View style={s.searchWrap}>
          <LinearGradient colors={[rgbaFromHex(selectedTheme.accent, 0.16), rgbaFromHex(selectedTheme.panelAlt, 0.98)]} style={s.searchBorder}>
            <View style={s.searchInner}>
              <Ionicons name="search-outline" size={14} color={GOLD_D} />
              <TextInput
                style={s.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="search paths..."
                placeholderTextColor={DIM}
                autoCapitalize="none"
              />
              {!!search && (
                <HapticTouchable onPress={() => setSearch('')} haptic="light">
                  <Ionicons name="close-circle" size={15} color={DIM} />
                </HapticTouchable>
              )}
            </View>
          </LinearGradient>
        </View>

        {/* Status tabs */}
        <View style={s.tabRow}>
          {(['all', 'active', 'completed'] as StatusFilter[]).map(t => (
            <HapticTouchable key={t} style={s.tabItem} onPress={() => setStatusFilter(t)} haptic="selection">
              <Text style={[s.tabText, statusFilter === t && s.tabTextActive]}>{t}</Text>
              {statusFilter === t && <View style={s.tabLine} />}
            </HapticTouchable>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={GOLD_M} size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD_M} />}
        >
          {filtered.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="map-outline" size={40} color={GOLD_D} />
              <Text style={s.emptyTitle}>{paths.length === 0 ? 'no paths yet' : 'no results'}</Text>
              <Text style={s.emptyHint}>tap + generate to build an AI learning path</Text>
            </View>
          ) : filtered.map(path => {
            const pct = path.progress?.completion_percentage ?? 0;
            const status = path.status ?? 'active';
            return (
              <View key={path.id} style={pc.wrap}>
                <View style={[pc.accent, { backgroundColor: status === 'completed' ? GOLD_M : GOLD_D }]} />
                <View style={pc.body}>
                  <View style={pc.topRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={pc.title} numberOfLines={2}>{path.title}</Text>
                      {!!path.topic_prompt && <Text style={pc.topic} numberOfLines={1}>{path.topic_prompt}</Text>}
                    </View>
                    <HapticTouchable onPress={() => doDelete(path.id)} haptic="warning" style={pc.deleteBtn}>
                      <Ionicons name="trash-outline" size={14} color={DIM} />
                    </HapticTouchable>
                  </View>

                  {/* Progress bar */}
                  <View style={pc.progressRow}>
                    <View style={pc.progressTrack}>
                      <LinearGradient
                        colors={pct >= 100 ? [selectedTheme.accentHover, selectedTheme.accent] : [rgbaFromHex(selectedTheme.accent, 0.46), rgbaFromHex(selectedTheme.accent, 0.18)]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={[pc.progressFill, { width: `${Math.max(2, pct)}%` as any }]}
                      />
                    </View>
                    <Text style={pc.progressPct}>{Math.round(pct)}%</Text>
                  </View>

                  {/* Meta */}
                  <View style={pc.metaRow}>
                    {!!path.difficulty && (
                      <View style={[pc.diffPill, { borderColor: (DIFF_COLOR[path.difficulty] ?? GOLD_D) + '60' }]}>
                        <Text style={[pc.diffText, { color: DIFF_COLOR[path.difficulty] ?? GOLD_M }]}>{path.difficulty}</Text>
                      </View>
                    )}
                    {(path.estimated_hours ?? 0) > 0 && (
                      <View style={pc.statChip}>
                        <Ionicons name="time-outline" size={10} color={DIM} />
                        <Text style={pc.statText}>{path.estimated_hours}h</Text>
                      </View>
                    )}
                    {(path.progress?.total_xp_earned ?? 0) > 0 && (
                      <View style={pc.statChip}>
                        <Ionicons name="star-outline" size={10} color={GOLD_D} />
                        <Text style={pc.statText}>{path.progress?.total_xp_earned} xp</Text>
                      </View>
                    )}
                    <View style={[pc.statusPill, status === 'completed' && pc.statusPillDone]}>
                      <Text style={[pc.statusText, status === 'completed' && { color: GOLD_XL }]}>{status}</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Generate modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={m.root}>
            <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFillObject} />
            <GeoBackground />
            <View style={m.header}>
              <Text style={m.title}>generate path</Text>
              <HapticTouchable onPress={() => setShowCreate(false)} haptic="light">
                <Ionicons name="close" size={22} color={GOLD_M} />
              </HapticTouchable>
            </View>
            <ScrollView contentContainerStyle={m.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={m.label}>topic</Text>
              <TextInput style={m.input} value={topic} onChangeText={setTopic} placeholder="e.g. Calculus, React, World War II..." placeholderTextColor={DIM} autoFocus />

              <Text style={m.label}>difficulty</Text>
              <View style={m.diffRow}>
                {DIFFICULTIES.map(d => (
                  <HapticTouchable key={d} style={[m.diffBtn, difficulty === d && m.diffBtnActive]} onPress={() => setDiff(d)} haptic="selection">
                    <Text style={[m.diffText, difficulty === d && { color: DIFF_COLOR[d] ?? GOLD_M }]}>{d}</Text>
                  </HapticTouchable>
                ))}
              </View>

              <Text style={m.label}>length</Text>
              <View style={m.diffRow}>
                {LENGTHS.map(l => (
                  <HapticTouchable key={l} style={[m.diffBtn, length === l && m.diffBtnActive]} onPress={() => setLength(l)} haptic="selection">
                    <Text style={[m.diffText, length === l && { color: GOLD_M }]}>{l}</Text>
                  </HapticTouchable>
                ))}
              </View>

              <Text style={m.label}>goals (one per line, optional)</Text>
              <TextInput
                style={[m.input, { height: 100 }]}
                value={goals}
                onChangeText={setGoals}
                placeholder={"understand core concepts\nsolve real problems\n..."}
                placeholderTextColor={DIM}
                multiline
              />

              <HapticTouchable style={m.submit} onPress={doGenerate} haptic="medium" disabled={generating}>
                <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={m.submitGrad}>
                  {generating
                    ? <><ActivityIndicator color={INK} size="small" /><Text style={m.submitText}>  generating...</Text></>
                    : <><Ionicons name="sparkles" size={16} color={INK} /><Text style={m.submitText}>  generate path</Text></>
                  }
                </LinearGradient>
              </HapticTouchable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const ACCENT = theme.accent;
  const ACCENT_DARK = darkenColor(theme.accent, theme.isLight ? 12 : 26);
  const DIM = theme.textSecondary;
  const SURFACE = theme.panel;
  const SURFACE_ALT = theme.panelAlt;
  const BORDER = theme.borderStrong;
  const INK = theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1 },
    topBar: {
      width: '100%',
      maxWidth: layout.contentMaxWidth,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 10,
    },
    backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: rgbaFromHex(SURFACE, 0.92), borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
    cta: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
    ctaText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: INK },
    hero: {
      width: '100%',
      maxWidth: layout.contentMaxWidth,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 14,
      gap: 14,
    },
    heroText: { gap: 2 },
    heroTitle: { fontFamily: 'Inter_900Black', fontSize: 34, color: theme.accentHover, letterSpacing: -1.2 },
    heroSub: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, letterSpacing: 1.8, textTransform: 'uppercase' },
    searchWrap: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 20, marginBottom: 10 },
    searchBorder: { borderRadius: 14, padding: 1 },
    searchInner: { flexDirection: 'row', alignItems: 'center', backgroundColor: SURFACE_ALT, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
    searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: theme.accentHover },
    tabRow: {
      width: '100%',
      maxWidth: layout.contentMaxWidth,
      alignSelf: 'center',
      flexDirection: 'row',
      marginHorizontal: 20,
      marginBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: BORDER,
    },
    tabItem: { flex: 1, alignItems: 'center', paddingBottom: 10, position: 'relative' },
    tabText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: DIM },
    tabTextActive: { color: theme.accentHover },
    tabLine: { position: 'absolute', bottom: -1, left: '10%', right: '10%', height: 2, backgroundColor: ACCENT, borderRadius: 1 },
    list: {
      width: '100%',
      maxWidth: layout.contentMaxWidth,
      alignSelf: 'center',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 60,
      gap: 10,
    },
    empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
    emptyTitle: { fontFamily: 'Inter_900Black', fontSize: 18, color: ACCENT_DARK },
    emptyHint: { fontFamily: 'Inter_400Regular', fontSize: 13, color: DIM, textAlign: 'center', paddingHorizontal: 24 },
  });
}

function createPathCardStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const ACCENT = theme.accent;
  const DIM = theme.textSecondary;
  const SURFACE = theme.panel;
  const BORDER = theme.borderStrong;
  return StyleSheet.create({
    wrap: { flexDirection: 'row', backgroundColor: rgbaFromHex(SURFACE, 0.94), borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: BORDER, shadowColor: ACCENT, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 22, elevation: 4 },
    accent: { width: 3 },
    body: { flex: 1, padding: 14, gap: 8 },
    topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    title: { fontFamily: 'Inter_900Black', fontSize: 15, color: theme.accentHover, lineHeight: 20 },
    topic: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginTop: 3 },
    deleteBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    progressTrack: { flex: 1, height: 3, backgroundColor: rgbaFromHex(ACCENT, 0.14), borderRadius: 2, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 2 },
    progressPct: { fontFamily: 'Inter_700Bold', fontSize: 10, color: ACCENT, width: 28, textAlign: 'right' },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
    diffPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
    diffText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
    statChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    statText: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM },
    statusPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: rgbaFromHex(ACCENT, 0.12), borderWidth: 1, borderColor: rgbaFromHex(ACCENT, 0.24) },
    statusPillDone: { backgroundColor: rgbaFromHex(ACCENT, 0.20), borderColor: rgbaFromHex(ACCENT, 0.38) },
    statusText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: DIM },
  });
}

function createModalStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const ACCENT = theme.accent;
  const DIM = theme.textSecondary;
  const SURFACE_ALT = theme.panelAlt;
  const BORDER = theme.borderStrong;
  const INK = theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1, paddingTop: 20 },
    header: {
      width: '100%',
      maxWidth: Math.min(layout.contentMaxWidth, 680),
      alignSelf: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingBottom: 20,
    },
    title: { fontFamily: 'Inter_900Black', fontSize: 24, color: theme.accentHover },
    body: {
      width: '100%',
      maxWidth: Math.min(layout.contentMaxWidth, 680),
      alignSelf: 'center',
      paddingHorizontal: 24,
      gap: 6,
      paddingBottom: 60,
    },
    label: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: DIM, letterSpacing: 1, marginTop: 10 },
    input: { backgroundColor: SURFACE_ALT, borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'Inter_400Regular', fontSize: 14, color: theme.accentHover, marginTop: 4 },
    diffRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
    diffBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE_ALT },
    diffBtnActive: { borderColor: rgbaFromHex(ACCENT, 0.34), backgroundColor: rgbaFromHex(ACCENT, 0.14) },
    diffText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: DIM },
    submit: { marginTop: 24, borderRadius: 14, overflow: 'hidden' },
    submitGrad: { paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    submitText: { fontFamily: 'Inter_900Black', fontSize: 15, color: INK },
  });
}
