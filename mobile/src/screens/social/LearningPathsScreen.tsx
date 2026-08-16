import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../../services/auth';
import { API_URL } from '../../services/api';
import { getToken } from '../../services/tokenStorage';
import GeoBackground from '../../components/GeoBackground';
import SocialTileMaterial from '../../components/SocialTileMaterial';
import HapticTouchable from '../../components/HapticTouchable';
import { cbTileShadow } from '../../components/NeumorphicTexture';
import { useAppTheme } from '../../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../../utils/theme';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import MathText from '../../components/MathText';

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const LENGTHS = ['short', 'medium', 'long'];
const SUGGESTED_TOPICS = ['Machine learning', 'Human biology', 'System design', 'Personal finance'];

type StatusFilter = 'all' | 'active' | 'completed';
type NodeStatus = 'locked' | 'unlocked' | 'in_progress' | 'completed';

type LearningNode = {
  id: number;
  order_index: number;
  title: string;
  description?: string;
  estimated_minutes?: number;
  objectives?: string[];
  learning_outcomes?: string[];
  core_sections?: { title?: string; content?: string; example?: string }[];
  summary?: string[] | string;
  reward?: { xp?: number } | number;
  progress?: { status?: NodeStatus; progress_pct?: number; xp_earned?: number };
};

type LearningPath = {
  id: number;
  title: string;
  description?: string;
  topic_prompt?: string;
  difficulty?: string;
  status?: string;
  estimated_hours?: number;
  total_nodes?: number;
  completed_nodes?: number;
  nodes?: LearningNode[];
  progress?: { completion_percentage: number; current_node_index: number; total_xp_earned: number };
  created_at?: string;
  updated_at?: string;
};

type Props = { user: AuthUser; onBack: () => void };

async function authHeaders(json = false) {
  const token = await getToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

function progressOf(path: LearningPath) {
  return Math.max(0, Math.min(100, Math.round(path.progress?.completion_percentage ?? 0)));
}

function nodeStatus(node: LearningNode): NodeStatus {
  return node.progress?.status ?? 'locked';
}

export default function LearningPathsScreen({ onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(selectedTheme, layout, insets.top), [selectedTheme, layout, insets.top]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });
  const [paths, setPaths] = useState<LearningPath[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedPath, setSelectedPath] = useState<LearningPath | null>(null);
  const [pathLoading, setPathLoading] = useState(false);
  const [activeNode, setActiveNode] = useState<LearningNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<LearningNode | null>(null);
  const [startingNode, setStartingNode] = useState<number | null>(null);
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('intermediate');
  const [length, setLength] = useState('medium');
  const [goals, setGoals] = useState('');

  const ink = selectedTheme.isLight ? darkenColor(selectedTheme.accent, 38) : selectedTheme.bgPrimary;
  const difficultyColor: Record<string, string> = {
    beginner: selectedTheme.success,
    intermediate: selectedTheme.accent,
    advanced: selectedTheme.danger,
  };

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/learning-paths`, { headers: await authHeaders() });
      if (!response.ok) throw new Error('Could not load learning paths');
      const data = await response.json();
      setPaths(data.paths ?? []);
    } catch (error) {
      Alert.alert('Learning paths', error instanceof Error ? error.message : 'Could not load your paths');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const active = paths.filter((path) => (path.status ?? 'active') === 'active');
    const completed = paths.filter((path) => path.status === 'completed').length;
    const average = active.length ? Math.round(active.reduce((sum, path) => sum + progressOf(path), 0) / active.length) : 0;
    return { total: paths.length, active: active.length, completed, average };
  }, [paths]);

  const continuePath = useMemo(() => paths
    .filter((path) => (path.status ?? 'active') === 'active')
    .sort((a, b) => progressOf(b) - progressOf(a))[0] ?? null, [paths]);

  const filtered = useMemo(() => paths.filter((path) => {
    const status = path.status ?? 'active';
    if (statusFilter !== 'all' && status !== statusFilter) return false;
    if (!search.trim()) return true;
    return [path.title, path.description, path.topic_prompt].filter(Boolean).join(' ').toLowerCase().includes(search.trim().toLowerCase());
  }), [paths, search, statusFilter]);

  const openPath = async (path: LearningPath) => {
    setSelectedPath(path);
    setActiveNode(null);
    setPathLoading(true);
    try {
      const response = await fetch(`${API_URL}/learning-paths/${path.id}`, { headers: await authHeaders() });
      if (!response.ok) throw new Error('Could not open this path');
      const data = await response.json();
      setSelectedPath(data.path);
      const nodes = (data.path.nodes ?? []) as LearningNode[];
      setActiveNode(nodes.find((node) => ['unlocked', 'in_progress'].includes(nodeStatus(node))) ?? nodes[0] ?? null);
    } catch (error) {
      Alert.alert('Open path', error instanceof Error ? error.message : 'Could not open this path');
      setSelectedPath(null);
    } finally {
      setPathLoading(false);
    }
  };

  const refreshSelectedPath = async (pathId: number, keepNodeId?: number) => {
    const response = await fetch(`${API_URL}/learning-paths/${pathId}`, { headers: await authHeaders() });
    if (!response.ok) throw new Error('Could not refresh this path');
    const data = await response.json();
    setSelectedPath(data.path);
    if (keepNodeId) {
      const updatedNode = data.path.nodes?.find((node: LearningNode) => node.id === keepNodeId) ?? null;
      setActiveNode(updatedNode);
      setSelectedNode(updatedNode);
    }
  };

  const startNode = async (node: LearningNode) => {
    if (!selectedPath || nodeStatus(node) === 'locked') return;
    setStartingNode(node.id);
    try {
      const response = await fetch(`${API_URL}/learning-paths/${selectedPath.id}/nodes/${node.id}/start`, { method: 'POST', headers: await authHeaders() });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail ?? 'Could not start this module');
      }
      await refreshSelectedPath(selectedPath.id, node.id);
    } catch (error) {
      Alert.alert('Start module', error instanceof Error ? error.message : 'Could not start this module');
    } finally {
      setStartingNode(null);
    }
  };

  const generatePath = async () => {
    if (!topic.trim()) {
      Alert.alert('Enter a topic');
      return;
    }
    setGenerating(true);
    try {
      const response = await fetch(`${API_URL}/learning-paths/generate`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({
          topicPrompt: topic.trim(),
          difficulty,
          length,
          goals: goals.split('\n').map((goal) => goal.trim()).filter(Boolean),
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail ?? 'Try again');
      }
      const result = await response.json();
      setShowCreate(false);
      setTopic('');
      setGoals('');
      setDifficulty('intermediate');
      setLength('medium');
      await load();
      if (result.path) {
        setSelectedPath(result.path);
        const nodes = (result.path.nodes ?? []) as LearningNode[];
        setActiveNode(nodes.find((node) => ['unlocked', 'in_progress'].includes(nodeStatus(node))) ?? nodes[0] ?? null);
      }
    } catch (error) {
      Alert.alert('Generation failed', error instanceof Error ? error.message : 'Could not generate this path');
    } finally {
      setGenerating(false);
    }
  };

  const deletePath = (path: LearningPath) => {
    Alert.alert('Delete learning path?', path.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const response = await fetch(`${API_URL}/learning-paths/${path.id}`, { method: 'DELETE', headers: await authHeaders() });
            if (!response.ok) throw new Error('Could not delete this path');
            setPaths((current) => current.filter((item) => item.id !== path.id));
          } catch (error) {
            Alert.alert('Delete path', error instanceof Error ? error.message : 'Could not delete this path');
          }
        },
      },
    ]);
  };

  if (!fontsLoaded) return null;

  if (selectedPath) {
    const percent = progressOf(selectedPath);
    const nodes = selectedPath.nodes ?? [];
    const currentIndex = nodes.findIndex((node) => ['unlocked', 'in_progress'].includes(nodeStatus(node)));
    const focusedNode = activeNode ?? nodes[Math.max(0, currentIndex)] ?? nodes[0] ?? null;
    const focusedIndex = focusedNode ? nodes.findIndex((node) => node.id === focusedNode.id) : -1;
    const previousNode = [...nodes.slice(0, Math.max(0, focusedIndex))].reverse().find((node) => nodeStatus(node) !== 'locked') ?? null;
    const nextNode = nodes.slice(focusedIndex + 1).find((node) => nodeStatus(node) !== 'locked') ?? null;
    return (
      <View style={s.root}>
        <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
        <GeoBackground />
        <View style={s.detailHeader}>
          <HapticTouchable style={s.iconBtn} onPress={() => { setSelectedPath(null); setActiveNode(null); setSelectedNode(null); }} haptic="light"><Ionicons name="chevron-back" size={20} color={selectedTheme.accentHover} /></HapticTouchable>
          <View style={s.headerCopy}><Text style={s.kicker}>LEARNING PATH</Text><Text style={s.detailHeaderTitle} numberOfLines={1}>{selectedPath.title}</Text></View>
          <View style={s.percentBadge}><Text style={s.percentBadgeText}>{percent}%</Text></View>
        </View>

        {pathLoading ? <View style={s.loading}><ActivityIndicator color={selectedTheme.accent} size="large" /><Text style={s.loadingText}>assembling your route…</Text></View> : (
          <View style={s.pathWorkspace}>
            <View style={s.compactPathHero}>
              <View style={s.compactHeroTop}><View style={{ flex: 1 }}><Text style={s.heroEyebrow}>{(selectedPath.difficulty ?? 'intermediate').toUpperCase()} · {nodes.length} MODULES</Text><Text style={s.compactHeroTitle} numberOfLines={1}>{selectedPath.title}</Text></View><View style={s.compactStats}><Text style={s.compactStatValue}>{selectedPath.completed_nodes ?? 0}/{selectedPath.total_nodes ?? nodes.length}</Text><Text style={s.compactStatLabel}>DONE</Text></View><View style={s.compactStats}><Text style={s.compactStatValue}>{Math.round(selectedPath.estimated_hours ?? 0)}h</Text><Text style={s.compactStatLabel}>TOTAL</Text></View></View>
              <View style={s.progressTrack}><View style={[s.progressFill, { width: `${Math.max(2, percent)}%` as any }]} /></View>
            </View>

            <View style={s.moduleNavigatorHeader}><Text style={s.kicker}>PATH NAVIGATOR</Text><Text style={s.routeCount}>Select a module</Text></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.moduleNavigator}>
              {nodes.map((node, index) => {
                const status = nodeStatus(node);
                const locked = status === 'locked';
                const complete = status === 'completed';
                const active = focusedNode?.id === node.id;
                return (
                  <HapticTouchable key={node.id} style={[s.navStep, active && s.navStepActive, locked && s.navStepLocked]} onPress={() => setActiveNode(node)} disabled={locked} haptic="selection">
                    <View style={[s.navStepIcon, complete && s.navStepIconDone, active && s.navStepIconActive]}><Ionicons name={complete ? 'checkmark' : locked ? 'lock-closed' : active ? 'play' : 'ellipse'} size={complete ? 13 : 9} color={complete || active ? ink : selectedTheme.textSecondary} /></View>
                    <View style={{ flex: 1 }}><Text style={s.navStepNumber}>STEP {String(index + 1).padStart(2, '0')}</Text><Text style={s.navStepTitle} numberOfLines={1}>{node.title}</Text></View>
                  </HapticTouchable>
                );
              })}
            </ScrollView>

            {focusedNode ? (
              <View style={s.focusedModule}>
                <View style={s.focusedModuleHead}><View style={s.focusedModuleIcon}><Ionicons name={nodeStatus(focusedNode) === 'completed' ? 'checkmark-done' : 'book-outline'} size={21} color={ink} /></View><View style={{ flex: 1 }}><Text style={s.moduleNumber}>MODULE {String(focusedIndex + 1).padStart(2, '0')} OF {nodes.length}</Text><Text style={s.focusedModuleTitle} numberOfLines={2}>{focusedNode.title}</Text></View><View style={[s.moduleStatus, nodeStatus(focusedNode) === 'completed' && s.moduleStatusDone, nodeStatus(focusedNode) === 'in_progress' && s.moduleStatusCurrent]}><Text style={[s.moduleStatusText, nodeStatus(focusedNode) !== 'unlocked' && nodeStatus(focusedNode) !== 'locked' && { color: ink }]}>{nodeStatus(focusedNode).replace('_', ' ').toUpperCase()}</Text></View></View>
                {!!focusedNode.description && <Text style={s.focusedModuleDescription} numberOfLines={3}>{focusedNode.description}</Text>}
                <View style={s.focusedMetrics}><View style={s.focusedMetric}><Ionicons name="time-outline" size={15} color={selectedTheme.accentHover} /><Text style={s.focusedMetricValue}>{focusedNode.estimated_minutes ?? 20} min</Text><Text style={s.focusedMetricLabel}>duration</Text></View><View style={s.statDivider} /><View style={s.focusedMetric}><Ionicons name="flag-outline" size={15} color={selectedTheme.accentHover} /><Text style={s.focusedMetricValue}>{focusedNode.objectives?.length ?? 0}</Text><Text style={s.focusedMetricLabel}>objectives</Text></View><View style={s.statDivider} /><View style={s.focusedMetric}><Ionicons name="sparkles-outline" size={15} color={selectedTheme.accentHover} /><Text style={s.focusedMetricValue}>{focusedNode.progress?.xp_earned ?? 0} xp</Text><Text style={s.focusedMetricLabel}>earned</Text></View></View>
                {!!focusedNode.objectives?.length && <View style={s.objectivePreview}>{focusedNode.objectives.slice(0, 2).map((objective, index) => <View key={`${objective}-${index}`} style={s.objectivePreviewRow}><View style={s.objectiveDot} /><Text style={s.objectivePreviewText} numberOfLines={1}>{objective}</Text></View>)}</View>}
                <HapticTouchable style={s.openModuleBtn} onPress={() => setSelectedNode(focusedNode)} haptic="medium"><Ionicons name="book-outline" size={16} color={ink} /><Text style={s.openModuleBtnText}>{nodeStatus(focusedNode) === 'in_progress' ? 'CONTINUE LEARNING' : nodeStatus(focusedNode) === 'completed' ? 'REVIEW MODULE' : 'OPEN MODULE'}</Text></HapticTouchable>
              </View>
            ) : <View style={s.emptyWorkspace}><Text style={s.emptyTitle}>No modules yet</Text></View>}

            <View style={s.workspacePager}>
              <HapticTouchable style={[s.pagerBtn, !previousNode && s.pagerBtnDisabled]} onPress={() => previousNode && setActiveNode(previousNode)} disabled={!previousNode} haptic="selection"><Ionicons name="chevron-back" size={17} color={previousNode ? selectedTheme.accentHover : selectedTheme.textSecondary} /><Text style={s.pagerBtnText}>PREVIOUS</Text></HapticTouchable>
              <View style={s.pageIndicator}><Text style={s.pageIndicatorText}>{Math.max(0, focusedIndex + 1)} / {nodes.length}</Text></View>
              <HapticTouchable style={[s.pagerBtn, !nextNode && s.pagerBtnDisabled]} onPress={() => nextNode && setActiveNode(nextNode)} disabled={!nextNode} haptic="selection"><Text style={s.pagerBtnText}>NEXT</Text><Ionicons name="chevron-forward" size={17} color={nextNode ? selectedTheme.accentHover : selectedTheme.textSecondary} /></HapticTouchable>
            </View>
          </View>
        )}

        <NodeSheet node={selectedNode} visible={!!selectedNode} busy={startingNode === selectedNode?.id} onClose={() => setSelectedNode(null)} onStart={() => selectedNode && startNode(selectedNode)} theme={selectedTheme} styles={s} ink={ink} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <View style={s.libraryScreen}>
        <View style={s.libraryHeader}>
          <HapticTouchable style={s.iconBtn} onPress={onBack} haptic="light"><Ionicons name="chevron-back" size={20} color={selectedTheme.accentHover} /></HapticTouchable>
          <View style={s.headerCopy}><Text style={s.kicker}>PERSONAL CURRICULUM</Text><Text style={s.libraryTitle}>learning paths</Text></View>
          <HapticTouchable style={s.iconBtnAccent} onPress={() => setShowCreate(true)} haptic="medium"><Ionicons name="add" size={22} color={ink} /></HapticTouchable>
        </View>
        {loading ? <View style={s.loading}><ActivityIndicator color={selectedTheme.accent} size="large" /></View> : (
          <View style={s.libraryWorkspace}>
            <View style={s.libraryActions}>
              <HapticTouchable style={s.generateAction} onPress={() => setShowCreate(true)} haptic="medium"><Ionicons name="sparkles" size={15} color={ink} /><Text style={s.generateActionText}>Generate</Text></HapticTouchable>
              {!!continuePath && <HapticTouchable style={s.resumeAction} onPress={() => openPath(continuePath)} haptic="medium"><Ionicons name="play" size={14} color={selectedTheme.accentHover} /><View style={{ flex: 1 }}><Text style={s.resumeActionLabel}>RESUME</Text><Text style={s.resumeActionTitle} numberOfLines={1}>{continuePath.title}</Text></View><Text style={s.resumeActionPercent}>{progressOf(continuePath)}%</Text></HapticTouchable>}
            </View>

            <View style={s.libraryTools}>
              <View style={s.searchBox}><Ionicons name="search-outline" size={15} color={selectedTheme.textSecondary} /><TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search paths" placeholderTextColor={selectedTheme.textSecondary} />{!!search && <HapticTouchable onPress={() => setSearch('')} haptic="light"><Ionicons name="close-circle" size={15} color={selectedTheme.textSecondary} /></HapticTouchable>}</View>
              <View style={s.filterRow}>
                {(['all', 'active', 'completed'] as StatusFilter[]).map((filter) => {
                  const count = filter === 'all' ? stats.total : filter === 'active' ? stats.active : stats.completed;
                  return <HapticTouchable key={filter} style={[s.filterBtn, statusFilter === filter && s.filterBtnActive]} onPress={() => setStatusFilter(filter)} haptic="selection"><Text style={[s.filterText, statusFilter === filter && s.filterTextActive]}>{filter.toUpperCase()}</Text><Text style={[s.filterCountText, statusFilter === filter && { color: ink }]}>{count}</Text></HapticTouchable>;
                })}
              </View>
            </View>

            <View style={s.collectionHeader}><View><Text style={s.kicker}>YOUR COLLECTION</Text><Text style={s.collectionTitle}>My paths</Text></View><Text style={s.routeCount}>{filtered.length} paths</Text></View>

            {!filtered.length ? (
              <View style={s.empty}><SocialTileMaterial /><View style={s.emptyIcon}><Ionicons name="navigate-outline" size={28} color={selectedTheme.accentHover} /></View><Text style={s.emptyTitle}>{paths.length ? 'No matching paths' : 'Build your first route'}</Text><Text style={s.emptyText}>{paths.length ? 'Try another search or filter.' : 'Generate a structured, step-by-step curriculum.'}</Text>{!paths.length && <HapticTouchable style={s.emptyBtn} onPress={() => setShowCreate(true)} haptic="medium"><Text style={s.emptyBtnText}>GET STARTED</Text></HapticTouchable>}</View>
            ) : (
              <ScrollView style={s.collectionScroll} contentContainerStyle={s.pathGrid} showsVerticalScrollIndicator={false} bounces refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={selectedTheme.accent} />}>
                {filtered.map((path, index) => <PathCard key={path.id} path={path} index={index} onOpen={() => openPath(path)} onDelete={() => deletePath(path)} color={difficultyColor[path.difficulty ?? 'intermediate'] ?? selectedTheme.accent} theme={selectedTheme} styles={s} ink={ink} />)}
              </ScrollView>
            )}
          </View>
        )}
      </View>

      <CreatePathModal visible={showCreate} topic={topic} difficulty={difficulty} length={length} goals={goals} generating={generating} onTopic={setTopic} onDifficulty={setDifficulty} onLength={setLength} onGoals={setGoals} onClose={() => setShowCreate(false)} onGenerate={generatePath} theme={selectedTheme} styles={s} ink={ink} />
    </View>
  );
}

function SummaryMetric({ value, label, styles }: { value: string; label: string; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.summaryMetric}><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>;
}

function PathStat({ icon, value, label, styles }: { icon: React.ComponentProps<typeof Ionicons>['name']; value: string; label: string; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.pathStat}><Ionicons name={icon} size={15} color={styles.iconColor.color} /><Text style={styles.pathStatValue}>{value}</Text><Text style={styles.pathStatLabel}>{label}</Text></View>;
}

function PathCard({ path, index, onOpen, onDelete, color, theme, styles, ink }: { path: LearningPath; index: number; onOpen: () => void; onDelete: () => void; color: string; theme: ReturnType<typeof useAppTheme>['selectedTheme']; styles: ReturnType<typeof createStyles>; ink: string }) {
  const percent = progressOf(path);
  return (
    <HapticTouchable style={styles.pathCard} onPress={onOpen} haptic="selection" activeOpacity={0.88}>
      <SocialTileMaterial />
      <LinearGradient colors={[rgbaFromHex(color, 0.28), rgbaFromHex(theme.panel, 0.94)]} start={{ x: 0, y: 0 }} end={{ x: 0.75, y: 1 }} style={styles.pathCardBanner}>
        <View style={styles.pathCardTop}><Text style={styles.pathDifficulty}>{(path.difficulty ?? 'intermediate').toUpperCase()}</Text><HapticTouchable style={styles.deleteBtn} onPress={(event) => { event.stopPropagation(); onDelete(); }} haptic="warning"><Ionicons name="trash-outline" size={13} color={theme.textSecondary} /></HapticTouchable></View>
        <Text style={styles.pathCardTitle} numberOfLines={3}>{path.title}</Text>
        <Text style={styles.pathCardModules}>{path.total_nodes ?? 0} MODULES · {Math.round(path.estimated_hours ?? 0)}H</Text>
      </LinearGradient>
      <View style={styles.pathCardBody}>
        <View style={styles.cardProgressTop}><Text style={styles.cardProgressLabel}>PROGRESS</Text><Text style={styles.cardPercent}>{percent}%</Text></View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(2, percent)}%` as any, backgroundColor: color }]} /></View>
        <Text style={styles.cardSource} numberOfLines={1}>{percent >= 100 ? 'COMPLETED' : percent > 0 ? 'IN PROGRESS' : `PATH ${String(index + 1).padStart(2, '0')}`}</Text>
        <View style={styles.openPathBtn}><Text style={[styles.openPathText, { color: ink }]}>OPEN PATH</Text><Ionicons name="arrow-forward" size={15} color={ink} /></View>
      </View>
    </HapticTouchable>
  );
}

function NodeSheet({ node, visible, busy, onClose, onStart, theme, styles, ink }: { node: LearningNode | null; visible: boolean; busy: boolean; onClose: () => void; onStart: () => void; theme: ReturnType<typeof useAppTheme>['selectedTheme']; styles: ReturnType<typeof createStyles>; ink: string }) {
  const status = node ? nodeStatus(node) : 'locked';
  const summaries = Array.isArray(node?.summary) ? node?.summary : node?.summary ? [node.summary] : [];
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <LinearGradient colors={[theme.bgTop, theme.bgPrimary, theme.bgBottom]} style={StyleSheet.absoluteFillObject} />
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}><View style={{ flex: 1 }}><Text style={styles.kicker}>MODULE {String((node?.order_index ?? 0) + 1).padStart(2, '0')}</Text><Text style={styles.sheetTitle}>{node?.title}</Text></View><HapticTouchable style={styles.sheetClose} onPress={onClose} haptic="light"><Ionicons name="close" size={20} color={theme.accentHover} /></HapticTouchable></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScroll}>
          {!!node?.description && <Text style={styles.sheetDescription}>{node.description}</Text>}
          <View style={styles.nodeInfoRow}><View style={styles.nodeInfoPill}><Ionicons name="time-outline" size={13} color={theme.accentHover} /><Text style={styles.nodeInfoText}>{node?.estimated_minutes ?? 20} MIN</Text></View><View style={styles.nodeInfoPill}><Ionicons name="sparkles-outline" size={13} color={theme.accentHover} /><Text style={styles.nodeInfoText}>{node?.progress?.xp_earned ?? 0} XP</Text></View><View style={styles.nodeInfoPill}><Text style={styles.nodeInfoText}>{status.replace('_', ' ').toUpperCase()}</Text></View></View>
          {!!node?.objectives?.length && <SheetSection title="What you’ll learn" icon="flag-outline" styles={styles}>{node.objectives.map((objective, index) => <View key={`${objective}-${index}`} style={styles.objectiveRow}><View style={styles.objectiveDot} /><Text style={styles.objectiveText}>{objective}</Text></View>)}</SheetSection>}
          {!!node?.core_sections?.length && <SheetSection title="Module outline" icon="layers-outline" styles={styles}>{node.core_sections.slice(0, 4).map((section, index) => <View key={`${section.title}-${index}`} style={styles.outlineRow}><Text style={styles.outlineIndex}>{String(index + 1).padStart(2, '0')}</Text><View style={{ flex: 1 }}><Text style={styles.outlineTitle}>{section.title || `Section ${index + 1}`}</Text>{!!section.content && <MathText style={styles.outlineText} numberOfLines={3}>{section.content}</MathText>}</View></View>)}</SheetSection>}
          {!!summaries.length && <SheetSection title="Key takeaways" icon="bulb-outline" styles={styles}>{summaries.map((item, index) => <MathText key={`${item}-${index}`} style={styles.takeawayText}>{`— ${item}`}</MathText>)}</SheetSection>}
        </ScrollView>
        {status !== 'completed' && <View style={styles.sheetFooter}><HapticTouchable style={styles.startBtn} onPress={onStart} disabled={busy} haptic="medium">{busy ? <ActivityIndicator color={ink} /> : <><Ionicons name={status === 'in_progress' ? 'arrow-forward' : 'play'} size={16} color={ink} /><Text style={styles.startBtnText}>{status === 'in_progress' ? 'CONTINUE MODULE' : 'START MODULE'}</Text></>}</HapticTouchable></View>}
      </View>
    </Modal>
  );
}

function SheetSection({ title, icon, children, styles }: { title: string; icon: React.ComponentProps<typeof Ionicons>['name']; children: React.ReactNode; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.sheetSection}><View style={styles.sheetSectionHeader}><Ionicons name={icon} size={16} color={styles.iconColor.color} /><Text style={styles.sheetSectionTitle}>{title}</Text></View>{children}</View>;
}

function CreatePathModal({ visible, topic, difficulty, length, goals, generating, onTopic, onDifficulty, onLength, onGoals, onClose, onGenerate, theme, styles, ink }: { visible: boolean; topic: string; difficulty: string; length: string; goals: string; generating: boolean; onTopic: (value: string) => void; onDifficulty: (value: string) => void; onLength: (value: string) => void; onGoals: (value: string) => void; onClose: () => void; onGenerate: () => void; theme: ReturnType<typeof useAppTheme>['selectedTheme']; styles: ReturnType<typeof createStyles>; ink: string }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
        <LinearGradient colors={[theme.bgTop, theme.bgPrimary, theme.bgBottom]} style={StyleSheet.absoluteFillObject} />
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}><View style={{ flex: 1 }}><Text style={styles.kicker}>AI-POWERED CURRICULUM</Text><Text style={styles.sheetTitle}>Build your route</Text><Text style={styles.createSub}>Describe the destination. Cerbyl will plan every step.</Text></View><HapticTouchable style={styles.sheetClose} onPress={onClose}><Ionicons name="close" size={20} color={theme.accentHover} /></HapticTouchable></View>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.createScroll}>
          <Text style={styles.formLabel}>WHAT DO YOU WANT TO MASTER?</Text>
          <TextInput style={styles.topicInput} value={topic} onChangeText={onTopic} placeholder="e.g. Backend system design" placeholderTextColor={theme.textSecondary} autoFocus multiline />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionRow}>{SUGGESTED_TOPICS.map((item) => <HapticTouchable key={item} style={styles.suggestionChip} onPress={() => onTopic(item)} haptic="selection"><Text style={styles.suggestionText}>{item}</Text></HapticTouchable>)}</ScrollView>
          <Text style={styles.formLabel}>DIFFICULTY</Text>
          <View style={styles.optionRow}>{DIFFICULTIES.map((item) => <HapticTouchable key={item} style={[styles.optionBtn, difficulty === item && styles.optionBtnActive]} onPress={() => onDifficulty(item)} haptic="selection"><Ionicons name={item === 'beginner' ? 'leaf-outline' : item === 'advanced' ? 'flame-outline' : 'trending-up-outline'} size={15} color={difficulty === item ? ink : theme.textSecondary} /><Text style={[styles.optionText, difficulty === item && styles.optionTextActive]}>{item.toUpperCase()}</Text></HapticTouchable>)}</View>
          <Text style={styles.formLabel}>PATH LENGTH</Text>
          <View style={styles.optionRow}>{LENGTHS.map((item) => <HapticTouchable key={item} style={[styles.optionBtn, length === item && styles.optionBtnActive]} onPress={() => onLength(item)} haptic="selection"><Text style={[styles.optionText, length === item && styles.optionTextActive]}>{item.toUpperCase()}</Text><Text style={[styles.optionHint, length === item && { color: ink }]}>{item === 'short' ? '3–5' : item === 'medium' ? '6–9' : '10+'} steps</Text></HapticTouchable>)}</View>
          <Text style={styles.formLabel}>PERSONAL GOALS · OPTIONAL</Text>
          <TextInput style={styles.goalsInput} value={goals} onChangeText={onGoals} placeholder={'Build practical projects\nUnderstand the fundamentals'} placeholderTextColor={theme.textSecondary} multiline textAlignVertical="top" />
          <HapticTouchable style={styles.startBtn} onPress={onGenerate} disabled={generating} haptic="medium">{generating ? <><ActivityIndicator color={ink} /><Text style={styles.startBtnText}>BUILDING YOUR ROUTE…</Text></> : <><Ionicons name="sparkles" size={17} color={ink} /><Text style={styles.startBtnText}>GENERATE LEARNING PATH</Text></>}</HapticTouchable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>, topInset: number) {
  const surface = '#0b0c0f';
  const surfaceAlt = '#050506';
  const border = 'rgba(216,179,141,0.22)';
  const ink = theme.isLight ? darkenColor(theme.accent, 38) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    libraryScreen: { flex: 1, width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 16, paddingTop: Math.max(topInset + 7, 47), paddingBottom: 10 },
    libraryScroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 16, paddingTop: Math.max(topInset + 10, 50), paddingBottom: 110, gap: 13 },
    libraryHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12 },
    detailHeader: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 14, paddingTop: Math.max(topInset + 8, 48), paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
    headerCopy: { flex: 1 },
    kicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 10, letterSpacing: 1.55 },
    libraryTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 29, lineHeight: 34, letterSpacing: -1 },
    detailHeaderTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 18, lineHeight: 22 },
    iconBtn: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.86), alignItems: 'center', justifyContent: 'center' },
    iconBtnAccent: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, borderColor: theme.accentHover, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    libraryWorkspace: { flex: 1, gap: 8, paddingTop: 7 },
    libraryActions: { height: 47, flexDirection: 'row', gap: 7 },
    generateAction: { flex: 0.9, borderRadius: 14, backgroundColor: theme.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    generateActionText: { fontFamily: 'Inter_900Black', color: ink, fontSize: 9, letterSpacing: 0.7 },
    resumeAction: { flex: 1.45, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.88), flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 9 },
    resumeActionLabel: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 9.5, letterSpacing: 0.8 },
    resumeActionTitle: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 9, marginTop: 1 },
    resumeActionPercent: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 10 },
    libraryTools: { gap: 6 },
    collectionHeader: { minHeight: 43, borderBottomWidth: 1, borderBottomColor: border, paddingBottom: 6, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    collectionTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 22, lineHeight: 25, letterSpacing: -0.6 },
    collectionScroll: { flex: 1 },
    pathGrid: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', justifyContent: 'space-between', rowGap: 9, paddingBottom: 22 },
    percentBadge: { minWidth: 48, height: 34, borderRadius: 12, backgroundColor: rgbaFromHex(theme.accent, 0.12), borderWidth: 1, borderColor: border, alignItems: 'center', justifyContent: 'center' },
    percentBadgeText: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 11 },
    libraryHero: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: surface, padding: 17, gap: 15, boxShadow: cbTileShadow(0.09) } as ViewStyle,
    heroTop: { flexDirection: 'row', gap: 12 },
    heroEyebrow: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 10, letterSpacing: 1.5 },
    heroHeadline: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 22, lineHeight: 27, marginTop: 4, maxWidth: 265 },
    heroRouteGraphic: { width: 62, height: 73, position: 'relative' },
    heroRouteLine: { position: 'absolute', width: 2, height: 60, top: 7, left: 29, backgroundColor: rgbaFromHex(theme.accentHover, 0.25), transform: [{ rotate: '25deg' }] },
    heroRouteDot: { position: 'absolute', left: 18, width: 18, height: 18, borderRadius: 7, borderWidth: 2, borderColor: theme.accentHover, backgroundColor: surface },
    summaryRow: { height: 55, borderRadius: 16, backgroundColor: rgbaFromHex(surfaceAlt, 0.66), flexDirection: 'row', alignItems: 'center' },
    summaryMetric: { flex: 1, alignItems: 'center' },
    summaryValue: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 17 },
    summaryLabel: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7 },
    summaryDivider: { width: 1, height: 27, backgroundColor: border },
    generateBtn: { height: 45, borderRadius: 14, backgroundColor: theme.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    generateBtnText: { fontFamily: 'Inter_900Black', color: ink, fontSize: 9, letterSpacing: 0.9 },
    continueCard: { borderRadius: 21, borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.3), backgroundColor: rgbaFromHex(theme.accent, 0.1), padding: 15, gap: 12 },
    continueTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    continueTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 17, lineHeight: 21, marginTop: 3, maxWidth: 270 },
    continuePercent: { marginLeft: 'auto', width: 48, height: 48, borderRadius: 17, borderWidth: 2, borderColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    continuePercentText: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 12 },
    progressTrack: { width: '100%', height: 5, borderRadius: 3, backgroundColor: rgbaFromHex(theme.accentHover, 0.12), overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 3, backgroundColor: theme.accent },
    continueFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    continueMeta: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 9 },
    resumePill: { borderRadius: 10, backgroundColor: theme.accent, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7 },
    resumeText: { fontFamily: 'Inter_900Black', color: ink, fontSize: 10, letterSpacing: 0.7 },
    controlsCard: { borderRadius: 20, borderWidth: 1, borderColor: border, backgroundColor: surface, padding: 10, gap: 9 },
    searchBox: { height: 37, borderRadius: 12, backgroundColor: rgbaFromHex(surfaceAlt, 0.76), borderWidth: 1, borderColor: border, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 },
    searchInput: { flex: 1, fontFamily: 'Inter_600SemiBold', color: theme.textPrimary, fontSize: 11 },
    filterRow: { flexDirection: 'row', gap: 6 },
    filterBtn: { flex: 1, height: 32, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
    filterBtnActive: { backgroundColor: theme.accent },
    filterText: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, letterSpacing: 0.6 },
    filterTextActive: { color: ink },
    filterCount: { minWidth: 18, height: 18, borderRadius: 7, backgroundColor: rgbaFromHex(theme.textSecondary, 0.1), alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    filterCountActive: { backgroundColor: rgbaFromHex(ink, 0.13) },
    filterCountText: { fontFamily: 'Inter_900Black', color: theme.textSecondary, fontSize: 9 },
    sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 3 },
    sectionTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 19, marginTop: 2 },
    routeCount: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 9 },
    pathList: { gap: 11 },
    pathCard: { width: '48%', height: layout.height >= 820 ? 220 : 196, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: border, backgroundColor: surface, boxShadow: cbTileShadow(0.06) } as ViewStyle,
    pathCardBanner: { height: layout.height >= 820 ? 101 : 88, padding: 10, justifyContent: 'space-between' },
    pathCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pathIndex: { width: 35, height: 35, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.58), alignItems: 'center', justifyContent: 'center' },
    pathIndexText: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 10 },
    pathDifficulty: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, letterSpacing: 1.2 },
    pathCardTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 13, lineHeight: 16, textAlign: 'center', textTransform: 'uppercase' },
    pathCardModules: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 9.5, letterSpacing: 0.9, textAlign: 'center' },
    deleteBtn: { width: 25, height: 25, borderRadius: 9, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.48), alignItems: 'center', justifyContent: 'center' },
    pathCardBody: { flex: 1, padding: 10, gap: 7, justifyContent: 'space-between' },
    cardProgressTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    cardProgressLabel: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 9.5, letterSpacing: 1.2 },
    cardProgressState: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 10, marginTop: 2 },
    cardPercent: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 10 },
    cardSource: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 9.5, letterSpacing: 0.7 },
    cardMetrics: { flexDirection: 'row', gap: 13 },
    cardMetric: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    cardMetricText: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 10.5 },
    openPathBtn: { height: 34, borderRadius: 10, backgroundColor: theme.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    openPathText: { fontFamily: 'Inter_900Black', fontSize: 10, letterSpacing: 0.7 },
    loading: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 10 },
    loadingText: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 10 },
    empty: { minHeight: 300, borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: border, backgroundColor: surface, alignItems: 'center', justifyContent: 'center', padding: 25, gap: 9 },
    emptyIcon: { width: 56, height: 56, borderRadius: 19, backgroundColor: rgbaFromHex(theme.accent, 0.11), alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
    emptyTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 19 },
    emptyText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 290 },
    emptyBtn: { marginTop: 6, height: 40, borderRadius: 12, backgroundColor: theme.accent, justifyContent: 'center', paddingHorizontal: 20 },
    emptyBtnText: { fontFamily: 'Inter_900Black', color: ink, fontSize: 10.5, letterSpacing: 0.8 },
    pathWorkspace: { flex: 1, width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 14, paddingBottom: Math.max(12, topInset ? 12 : 22), gap: 9 },
    compactPathHero: { borderRadius: 18, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.9), padding: 12, gap: 9 },
    compactHeroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    compactHeroTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 15, lineHeight: 19, marginTop: 2 },
    compactStats: { minWidth: 42, alignItems: 'center' },
    compactStatValue: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 12 },
    compactStatLabel: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 9, letterSpacing: 0.6 },
    moduleNavigatorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
    moduleNavigator: { gap: 7, paddingRight: 14 },
    navStep: { width: 142, height: 49, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.8), flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8 },
    navStepActive: { borderColor: theme.accentHover, backgroundColor: rgbaFromHex(theme.accent, 0.13) },
    navStepLocked: { opacity: 0.48 },
    navStepIcon: { width: 27, height: 27, borderRadius: 9, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surfaceAlt, 0.7), alignItems: 'center', justifyContent: 'center' },
    navStepIconDone: { backgroundColor: theme.accent, borderColor: theme.accentHover },
    navStepIconActive: { backgroundColor: theme.accent, borderColor: theme.accentHover },
    navStepNumber: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 9.5, letterSpacing: 0.8 },
    navStepTitle: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 9, marginTop: 2 },
    focusedModule: { flex: 1, minHeight: 250, borderRadius: 22, borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.28), backgroundColor: rgbaFromHex(surface, 0.94), padding: 15, gap: 11, boxShadow: cbTileShadow(0.1) } as ViewStyle,
    focusedModuleHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    focusedModuleIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    focusedModuleTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 18, lineHeight: 22, marginTop: 3 },
    focusedModuleDescription: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10.5, lineHeight: 16 },
    focusedMetrics: { height: 57, borderRadius: 15, backgroundColor: rgbaFromHex(surfaceAlt, 0.66), flexDirection: 'row', alignItems: 'center' },
    focusedMetric: { flex: 1, alignItems: 'center' },
    focusedMetricValue: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 10, marginTop: 1 },
    focusedMetricLabel: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.45 },
    objectivePreview: { gap: 6 },
    objectivePreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    objectivePreviewText: { flex: 1, fontFamily: 'Inter_600SemiBold', color: theme.textPrimary, fontSize: 9.5 },
    openModuleBtn: { marginTop: 'auto', minHeight: 43, borderRadius: 13, backgroundColor: theme.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    openModuleBtnText: { fontFamily: 'Inter_900Black', color: ink, fontSize: 10.5, letterSpacing: 0.8 },
    emptyWorkspace: { flex: 1, borderRadius: 22, borderWidth: 1, borderColor: border, alignItems: 'center', justifyContent: 'center' },
    workspacePager: { height: 45, flexDirection: 'row', alignItems: 'center', gap: 8 },
    pagerBtn: { flex: 1, height: 42, borderRadius: 13, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.9), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
    pagerBtnDisabled: { opacity: 0.38 },
    pagerBtnText: { fontFamily: 'Inter_700Bold', color: theme.accentHover, fontSize: 10, letterSpacing: 0.65 },
    pageIndicator: { minWidth: 49, height: 36, borderRadius: 12, backgroundColor: rgbaFromHex(theme.accent, 0.12), alignItems: 'center', justifyContent: 'center' },
    pageIndicatorText: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 9 },
    detailScroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 15, paddingBottom: 100, gap: 17 },
    pathHero: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.9), padding: 17, gap: 14, boxShadow: cbTileShadow(0.08) } as ViewStyle,
    pathHeroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    pathHeroTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 23, lineHeight: 28, marginTop: 4 },
    routeIcon: { width: 47, height: 47, borderRadius: 16, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    pathHeroDescription: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, lineHeight: 17 },
    pathStats: { minHeight: 58, borderRadius: 16, backgroundColor: rgbaFromHex(surfaceAlt, 0.66), flexDirection: 'row', alignItems: 'center' },
    pathStat: { flex: 1, alignItems: 'center', gap: 1 },
    pathStatValue: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 12 },
    pathStatLabel: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5 },
    statDivider: { width: 1, height: 30, backgroundColor: border },
    routeHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    timeline: { gap: 0 },
    timelineRow: { flexDirection: 'row', gap: 10 },
    timelineRail: { width: 31, alignItems: 'center' },
    stepMarker: { width: 30, height: 30, borderRadius: 11, borderWidth: 1, borderColor: border, backgroundColor: surface, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
    stepMarkerDone: { backgroundColor: theme.accent, borderColor: theme.accentHover },
    stepMarkerCurrent: { backgroundColor: theme.accent, borderColor: theme.accentHover, borderWidth: 2 },
    stepMarkerLocked: { opacity: 0.52 },
    connector: { width: 2, flex: 1, minHeight: 112, backgroundColor: border },
    connectorDone: { backgroundColor: rgbaFromHex(theme.accent, 0.62) },
    moduleCard: { flex: 1, minHeight: 120, marginBottom: 11, borderRadius: 19, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.9), padding: 13, gap: 7 },
    moduleCardCurrent: { borderColor: theme.accentHover, backgroundColor: rgbaFromHex(theme.accent, 0.1) },
    moduleCardLocked: { opacity: 0.55 },
    moduleTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    moduleNumber: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 10, letterSpacing: 1.2 },
    moduleStatus: { borderRadius: 8, backgroundColor: rgbaFromHex(theme.textSecondary, 0.1), paddingHorizontal: 7, paddingVertical: 4 },
    moduleStatusDone: { backgroundColor: theme.accent },
    moduleStatusCurrent: { backgroundColor: theme.accent },
    moduleStatusText: { fontFamily: 'Inter_900Black', color: theme.textSecondary, fontSize: 9.5, letterSpacing: 0.6 },
    moduleTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 15, lineHeight: 19 },
    moduleDescription: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 9.5, lineHeight: 14 },
    moduleFooter: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: 5 },
    moduleMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 'auto' },
    moduleMetaText: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 10 },
    moduleOpenText: { fontFamily: 'Inter_700Bold', color: theme.accentHover, fontSize: 9.5, letterSpacing: 0.6 },
    modalRoot: { flex: 1, backgroundColor: theme.bgPrimary },
    sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: rgbaFromHex(theme.textSecondary, 0.28), alignSelf: 'center', marginTop: 9 },
    sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 18, paddingBottom: 11 },
    sheetTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 24, lineHeight: 29, marginTop: 3 },
    sheetClose: { width: 39, height: 39, borderRadius: 13, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.84), alignItems: 'center', justifyContent: 'center' },
    sheetScroll: { paddingHorizontal: 18, paddingBottom: 32, gap: 12 },
    sheetDescription: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, lineHeight: 19 },
    nodeInfoRow: { flexDirection: 'row', gap: 7 },
    nodeInfoPill: { minHeight: 31, borderRadius: 10, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surfaceAlt, 0.7), flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9 },
    nodeInfoText: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, letterSpacing: 0.5 },
    sheetSection: { borderRadius: 19, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.82), padding: 14, gap: 10 },
    sheetSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    sheetSectionTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 14 },
    objectiveRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
    objectiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accent, marginTop: 6 },
    objectiveText: { flex: 1, fontFamily: 'Inter_400Regular', color: theme.textPrimary, fontSize: 11, lineHeight: 17 },
    outlineRow: { flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: border, paddingTop: 10 },
    outlineIndex: { fontFamily: 'Inter_900Black', color: theme.accent, fontSize: 10 },
    outlineTitle: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 11 },
    outlineText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 9.5, lineHeight: 15, marginTop: 3 },
    takeawayText: { fontFamily: 'Inter_400Regular', color: theme.textPrimary, fontSize: 11, lineHeight: 17 },
    sheetFooter: { padding: 15, paddingBottom: Math.max(15, topInset ? 15 : 25), borderTopWidth: 1, borderTopColor: border },
    startBtn: { minHeight: 49, borderRadius: 14, backgroundColor: theme.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
    startBtnText: { fontFamily: 'Inter_900Black', color: ink, fontSize: 9, letterSpacing: 0.9 },
    createSub: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10.5, lineHeight: 16, marginTop: 5 },
    createScroll: { paddingHorizontal: 18, paddingBottom: 50, gap: 10 },
    formLabel: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, letterSpacing: 1.2, marginTop: 4 },
    topicInput: { minHeight: 76, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.91), padding: 13, color: theme.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 14, textAlignVertical: 'top' },
    suggestionRow: { gap: 7 },
    suggestionChip: { height: 34, borderRadius: 11, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surfaceAlt, 0.7), alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11 },
    suggestionText: { fontFamily: 'Inter_600SemiBold', color: theme.textPrimary, fontSize: 9 },
    optionRow: { flexDirection: 'row', gap: 7 },
    optionBtn: { flex: 1, minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.78), alignItems: 'center', justifyContent: 'center', gap: 3 },
    optionBtnActive: { backgroundColor: theme.accent, borderColor: theme.accentHover },
    optionText: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, letterSpacing: 0.5 },
    optionTextActive: { color: ink },
    optionHint: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 9.5 },
    goalsInput: { minHeight: 100, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.91), padding: 13, color: theme.textPrimary, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17 },
    iconColor: { color: theme.accentHover },
  });
}
