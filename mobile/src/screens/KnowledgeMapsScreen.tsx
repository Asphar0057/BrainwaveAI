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
import { AuthUser } from '../services/auth';
import {
  addManualKnowledgeNode,
  askAI,
  createKnowledgeRoadmap,
  deleteKnowledgeNode,
  deleteKnowledgeRoadmap,
  expandKnowledgeNode,
  getKnowledgeRoadmap,
  getKnowledgeRoadmaps,
  getPersonalizedXPRoadmap,
  KnowledgeNode,
  KnowledgeRoadmap,
  KnowledgeRoadmapDetail,
  saveKnowledgeNodeNotes,
} from '../services/api';
import AmbientBubbles from '../components/AmbientBubbles';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import { NeumorphicLayer, cbTileShadow, cbModalShadow } from '../components/NeumorphicTexture';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = { user: AuthUser; onBack: () => void };

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function nodeTitle(node: KnowledgeNode | null) {
  return node?.topic_name || 'node';
}

export default function KnowledgeMapsScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(selectedTheme, layout, insets.top), [selectedTheme, layout, insets.top]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });
  const [maps, setMaps] = useState<KnowledgeRoadmap[]>([]);
  const [xpRoadmap, setXpRoadmap] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [topic, setTopic] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedMap, setSelectedMap] = useState<KnowledgeRoadmap | null>(null);
  const [detail, setDetail] = useState<KnowledgeRoadmapDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);
  const [nodeNotes, setNodeNotes] = useState('');
  const [busyNode, setBusyNode] = useState<number | null>(null);
  const [chatNode, setChatNode] = useState<KnowledgeNode | null>(null);
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatAnswer, setChatAnswer] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [childModalNode, setChildModalNode] = useState<KnowledgeNode | null>(null);
  const [childTopic, setChildTopic] = useState('');
  const [childDescription, setChildDescription] = useState('');

  const load = useCallback(async () => {
    try {
      const [roadmapData, xpData] = await Promise.all([
        getKnowledgeRoadmaps(user.username),
        getPersonalizedXPRoadmap(user.username).catch(() => null),
      ]);
      setMaps(roadmapData.roadmaps ?? []);
      setXpRoadmap(xpData?.roadmap ?? xpData);
    } catch (error) {
      Alert.alert('Knowledge maps', error instanceof Error ? error.message : 'Failed to load maps');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.username]);

  useEffect(() => { load(); }, [load]);

  const recommendedTopics = useMemo(() => {
    const candidates = [
      ...asArray(xpRoadmap?.recommended_topics),
      ...asArray(xpRoadmap?.recommendations),
      ...asArray(xpRoadmap?.next_steps),
      ...asArray(xpRoadmap?.roadmap),
      ...asArray(xpRoadmap?.nodes),
    ];
    return candidates
      .map((item) => String(item?.topic || item?.title || item?.name || item?.label || item || '').trim())
      .filter(Boolean)
      .slice(0, 5);
  }, [xpRoadmap]);

  const orderedNodes = useMemo(() => {
    const nodes = detail?.nodes_flat ?? [];
    const byParent = new Map<number | null, KnowledgeNode[]>();
    nodes.forEach((node) => {
      const key = node.parent_id ?? null;
      byParent.set(key, [...(byParent.get(key) ?? []), node]);
    });
    byParent.forEach((list) => list.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')));
    const root = nodes.find((node) => node.parent_id == null) || nodes[0];
    const output: KnowledgeNode[] = [];
    const seen = new Set<number>();
    const walk = (node?: KnowledgeNode) => {
      if (!node || seen.has(node.id)) return;
      seen.add(node.id);
      output.push(node);
      (byParent.get(node.id) ?? []).forEach(walk);
    };
    walk(root);
    nodes.forEach((node) => walk(node));
    return output;
  }, [detail]);

  const openMap = async (map: KnowledgeRoadmap) => {
    setSelectedMap(map);
    setDetailLoading(true);
    setSelectedNode(null);
    try {
      const data = await getKnowledgeRoadmap(map.id);
      setDetail(data);
      const root = data.nodes_flat.find((node) => node.parent_id == null) || data.nodes_flat[0] || null;
      setSelectedNode(root);
      setNodeNotes(root?.user_notes || '');
    } catch (error) {
      Alert.alert('Open map failed', error instanceof Error ? error.message : 'Could not load this map');
    } finally {
      setDetailLoading(false);
    }
  };

  const reloadDetail = async () => {
    if (!selectedMap) return;
    const data = await getKnowledgeRoadmap(selectedMap.id);
    setDetail(data);
    if (selectedNode) {
      const updated = data.nodes_flat.find((node) => node.id === selectedNode.id) || null;
      setSelectedNode(updated);
      setNodeNotes(updated?.user_notes || '');
    }
  };

  const createMap = async (value = topic) => {
    const rootTopic = value.trim();
    if (!rootTopic) {
      Alert.alert('Enter a topic');
      return;
    }
    setCreating(true);
    try {
      const created = await createKnowledgeRoadmap(user.username, rootTopic);
      setTopic('');
      setShowCreate(false);
      await load();
      const fresh = { id: created.roadmap_id, title: rootTopic, root_topic: rootTopic, total_nodes: created.total_nodes || 1, max_depth_reached: 0 };
      await openMap(fresh);
    } catch (error) {
      Alert.alert('Create map', error instanceof Error ? error.message : 'Failed to create knowledge map');
    } finally {
      setCreating(false);
    }
  };

  const removeMap = (map: KnowledgeRoadmap) => {
    Alert.alert('Delete knowledge map?', map.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteKnowledgeRoadmap(map.id);
            setMaps((prev) => prev.filter((item) => item.id !== map.id));
          } catch (error) {
            Alert.alert('Delete failed', error instanceof Error ? error.message : 'Could not delete map');
          }
        },
      },
    ]);
  };

  const selectNode = (node: KnowledgeNode) => {
    setSelectedNode(node);
    setNodeNotes(node.user_notes || '');
  };

  const expandNode = async (node: KnowledgeNode) => {
    setBusyNode(node.id);
    try {
      await expandKnowledgeNode(node.id);
      await reloadDetail();
    } catch (error) {
      Alert.alert('Expand failed', error instanceof Error ? error.message : 'Could not expand this node');
    } finally {
      setBusyNode(null);
    }
  };

  const saveNotes = async () => {
    if (!selectedNode) return;
    setBusyNode(selectedNode.id);
    try {
      await saveKnowledgeNodeNotes(selectedNode.id, nodeNotes);
      await reloadDetail();
      Alert.alert('Saved', 'Node notes updated.');
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Could not save notes');
    } finally {
      setBusyNode(null);
    }
  };

  const addChild = async () => {
    if (!childModalNode || !selectedMap || !childTopic.trim()) {
      Alert.alert('Enter a child topic');
      return;
    }
    setBusyNode(childModalNode.id);
    try {
      await addManualKnowledgeNode({
        roadmapId: selectedMap.id,
        parentId: childModalNode.id,
        topicName: childTopic.trim(),
        description: childDescription.trim(),
      });
      setChildTopic('');
      setChildDescription('');
      setChildModalNode(null);
      await reloadDetail();
    } catch (error) {
      Alert.alert('Add node failed', error instanceof Error ? error.message : 'Could not add child node');
    } finally {
      setBusyNode(null);
    }
  };

  const removeNode = (node: KnowledgeNode) => {
    Alert.alert('Delete node?', node.topic_name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusyNode(node.id);
          try {
            await deleteKnowledgeNode(node.id);
            setSelectedNode(null);
            await reloadDetail();
          } catch (error) {
            Alert.alert('Delete failed', error instanceof Error ? error.message : 'Could not delete node');
          } finally {
            setBusyNode(null);
          }
        },
      },
    ]);
  };

  const askNode = async () => {
    if (!chatNode || !chatQuestion.trim()) {
      Alert.alert('Ask something about this node');
      return;
    }
    setChatLoading(true);
    setChatAnswer('');
    try {
      const prompt = [
        `Knowledge map node: ${chatNode.topic_name}`,
        chatNode.description ? `Description: ${chatNode.description}` : '',
        chatNode.ai_explanation ? `Existing explanation: ${chatNode.ai_explanation}` : '',
        chatNode.key_concepts?.length ? `Key concepts: ${chatNode.key_concepts.join(', ')}` : '',
        `Question: ${chatQuestion.trim()}`,
      ].filter(Boolean).join('\n');
      const result = await askAI(user.username, prompt, undefined, true, []);
      setChatAnswer(result.response || result.answer || 'No answer returned.');
    } catch (error) {
      Alert.alert('Node chat failed', error instanceof Error ? error.message : 'Could not answer from this node');
    } finally {
      setChatLoading(false);
    }
  };

  if (!fontsLoaded) return null;

  if (selectedMap) {
    return (
      <View style={s.root}>
        <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
        <GeoBackground />
        <AmbientBubbles theme={selectedTheme} variant="paths" opacity={0.74} />
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.topBar}>
            <HapticTouchable style={s.iconBtn} onPress={() => { setSelectedMap(null); setDetail(null); setSelectedNode(null); }} haptic="light">
              <Ionicons name="chevron-back" size={18} color={selectedTheme.accent} />
            </HapticTouchable>
            <HapticTouchable style={s.iconBtn} onPress={reloadDetail} haptic="selection">
              <Ionicons name="refresh-outline" size={18} color={selectedTheme.accent} />
            </HapticTouchable>
          </View>

          <View style={s.hero}>
            <NeumorphicLayer grainOpacity={0.12} />
            <Text style={s.heroGhost}>01</Text>
            <Text style={s.eyebrow}>visual explorer</Text>
            <Text style={s.heroTitle} numberOfLines={2}>{detail?.roadmap?.title || selectedMap.title}</Text>
            <Text style={s.heroCopy}>{orderedNodes.length} nodes · depth {detail?.roadmap?.max_depth_reached ?? selectedMap.max_depth_reached ?? 0}</Text>
          </View>

          {detailLoading ? (
            <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 44 }} />
          ) : (
            <>
              <View style={s.nodeMap}>
                {orderedNodes.map((node) => {
                  const active = selectedNode?.id === node.id;
                  const depth = Math.min(node.depth_level || 0, 5);
                  return (
                    <HapticTouchable key={node.id} style={[s.nodeRow, { marginLeft: depth * 18 }, active && s.nodeRowActive]} onPress={() => selectNode(node)} haptic="selection">
                      <View style={s.nodeRail}>
                        <View style={[s.nodeDot, node.expansion_status === 'expanded' && s.nodeDotDone]} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.nodeTitle} numberOfLines={1}>{node.topic_name}</Text>
                        <Text style={s.nodeMeta}>{node.expansion_status || 'unexpanded'} · level {node.depth_level || 0}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={selectedTheme.textSecondary} />
                    </HapticTouchable>
                  );
                })}
              </View>

              {selectedNode ? (
                <View style={s.detailPanel}>
                  <View style={s.detailHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.sectionTitle}>{selectedNode.topic_name}</Text>
                      <Text style={s.sectionHint}>{selectedNode.description || 'No description yet.'}</Text>
                    </View>
                    {selectedNode.parent_id ? (
                      <HapticTouchable style={s.deleteBtn} onPress={() => removeNode(selectedNode)} haptic="warning">
                        <Ionicons name="trash-outline" size={15} color={selectedTheme.danger} />
                      </HapticTouchable>
                    ) : null}
                  </View>

                  {!!selectedNode.ai_explanation && <Text style={s.bodyText}>{selectedNode.ai_explanation}</Text>}
                  {selectedNode.key_concepts?.length ? (
                    <View style={s.chipRow}>
                      {selectedNode.key_concepts.map((concept) => <Text key={concept} style={s.conceptChipText}>{concept}</Text>)}
                    </View>
                  ) : null}

                  <View style={s.actionRow}>
                    <ActionIcon icon="sparkles-outline" label="expand" onPress={() => expandNode(selectedNode)} busy={busyNode === selectedNode.id} styles={s} />
                    <ActionIcon icon="add" label="child" onPress={() => setChildModalNode(selectedNode)} styles={s} />
                    <ActionIcon icon="chatbubble-ellipses-outline" label="chat" onPress={() => { setChatNode(selectedNode); setChatQuestion(''); setChatAnswer(''); }} styles={s} />
                  </View>

                  <Text style={s.label}>node notes</Text>
                  <TextInput value={nodeNotes} onChangeText={setNodeNotes} placeholder="write what you learned here..." placeholderTextColor={selectedTheme.textSecondary} style={[s.input, s.textArea]} multiline />
                  <HapticTouchable style={s.primaryBtn} onPress={saveNotes} disabled={busyNode === selectedNode.id}>
                    {busyNode === selectedNode.id ? <ActivityIndicator color={selectedTheme.bgPrimary} /> : <Text style={s.primaryText}>save notes</Text>}
                  </HapticTouchable>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>

        <Modal visible={!!chatNode} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setChatNode(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
            <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle} numberOfLines={1}>chat: {nodeTitle(chatNode)}</Text>
              <HapticTouchable onPress={() => setChatNode(null)}><Ionicons name="close" size={22} color={selectedTheme.accent} /></HapticTouchable>
            </View>
            <View style={s.modalBody}>
              <TextInput value={chatQuestion} onChangeText={setChatQuestion} placeholder="ask for examples, prerequisites, or a simpler explanation..." placeholderTextColor={selectedTheme.textSecondary} style={[s.input, s.textArea]} multiline autoFocus />
              <HapticTouchable style={s.primaryBtn} onPress={askNode} disabled={chatLoading}>
                {chatLoading ? <ActivityIndicator color={selectedTheme.bgPrimary} /> : <Text style={s.primaryText}>ask node</Text>}
              </HapticTouchable>
              {!!chatAnswer && <View style={s.answerCard}><Text style={s.bodyText}>{chatAnswer}</Text></View>}
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <Modal visible={!!childModalNode} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setChildModalNode(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
            <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>add child node</Text>
              <HapticTouchable onPress={() => setChildModalNode(null)}><Ionicons name="close" size={22} color={selectedTheme.accent} /></HapticTouchable>
            </View>
            <View style={s.modalBody}>
              <Text style={s.sectionHint}>Parent: {nodeTitle(childModalNode)}</Text>
              <Text style={s.label}>topic</Text>
              <TextInput value={childTopic} onChangeText={setChildTopic} placeholder="specific subtopic" placeholderTextColor={selectedTheme.textSecondary} style={s.input} autoFocus />
              <Text style={s.label}>description</Text>
              <TextInput value={childDescription} onChangeText={setChildDescription} placeholder="optional" placeholderTextColor={selectedTheme.textSecondary} style={[s.input, s.textArea]} multiline />
              <HapticTouchable style={s.primaryBtn} onPress={addChild} disabled={!!busyNode}>
                {busyNode ? <ActivityIndicator color={selectedTheme.bgPrimary} /> : <Text style={s.primaryText}>add node</Text>}
              </HapticTouchable>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <AmbientBubbles theme={selectedTheme} variant="paths" opacity={0.74} />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={selectedTheme.accent} />}
      >
        <View style={s.topBar}>
          <HapticTouchable style={s.iconBtn} onPress={onBack} haptic="light">
            <Ionicons name="chevron-back" size={18} color={selectedTheme.accent} />
          </HapticTouchable>
          <HapticTouchable style={s.iconBtn} onPress={() => setShowCreate(true)} haptic="medium">
            <Ionicons name="add" size={20} color={selectedTheme.accent} />
          </HapticTouchable>
        </View>

        <View style={s.hero}>
          <NeumorphicLayer grainOpacity={0.12} />
          <Text style={s.heroGhost}>01</Text>
          <Text style={s.eyebrow}>concept graph</Text>
          <Text style={s.heroTitle}>knowledge maps</Text>
          <Text style={s.heroCopy}>{maps.length} maps · {maps.reduce((sum, map) => sum + (map.total_nodes || 0), 0)} nodes tracked</Text>
        </View>

        {recommendedTopics.length > 0 ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>recommended paths</Text>
            <View style={s.chipRow}>
              {recommendedTopics.map((item) => (
                <HapticTouchable key={item} style={s.topicChip} onPress={() => createMap(item)} disabled={creating} haptic="selection">
                  <Ionicons name="sparkles-outline" size={13} color={selectedTheme.accentHover} />
                  <Text style={s.topicChipText}>{item}</Text>
                </HapticTouchable>
              ))}
            </View>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 44 }} />
        ) : maps.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="git-network-outline" size={40} color={selectedTheme.accent} />
            <Text style={s.emptyTitle}>no maps yet</Text>
            <Text style={s.emptyText}>create a topic map to organize concepts and prerequisites</Text>
          </View>
        ) : (
          <View style={s.list}>
            {maps.map((map) => (
              <HapticTouchable key={map.id} style={s.mapCard} onPress={() => openMap(map)} haptic="selection" activeOpacity={0.86}>
                <View style={s.mapTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.mapTitle} numberOfLines={2}>{map.title}</Text>
                    <Text style={s.mapTopic}>{map.root_topic}</Text>
                  </View>
                  <HapticTouchable style={s.deleteBtn} onPress={() => removeMap(map)} haptic="warning">
                    <Ionicons name="trash-outline" size={15} color={selectedTheme.textSecondary} />
                  </HapticTouchable>
                </View>
                <View style={s.metricRow}>
                  <View style={s.metric}><Text style={s.metricValue}>{map.total_nodes || 1}</Text><Text style={s.metricLabel}>nodes</Text></View>
                  <View style={s.metric}><Text style={s.metricValue}>{map.max_depth_reached || 0}</Text><Text style={s.metricLabel}>depth</Text></View>
                  <View style={s.metric}><Text style={s.metricValue}>open</Text><Text style={s.metricLabel}>explore</Text></View>
                </View>
              </HapticTouchable>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>new knowledge map</Text>
            <HapticTouchable onPress={() => setShowCreate(false)}><Ionicons name="close" size={22} color={selectedTheme.accent} /></HapticTouchable>
          </View>
          <View style={s.modalBody}>
            <Text style={s.label}>root topic</Text>
            <TextInput value={topic} onChangeText={setTopic} placeholder="machine learning, photosynthesis..." placeholderTextColor={selectedTheme.textSecondary} style={s.input} autoFocus />
            <HapticTouchable style={s.primaryBtn} onPress={() => createMap()} disabled={creating}>
              {creating ? <ActivityIndicator color={selectedTheme.bgPrimary} /> : <Text style={s.primaryText}>create map</Text>}
            </HapticTouchable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function ActionIcon({ icon, label, onPress, busy, styles }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; busy?: boolean; styles: ReturnType<typeof createStyles> }) {
  return (
    <HapticTouchable style={styles.actionIcon} onPress={onPress} disabled={busy} haptic="medium">
      {busy ? <ActivityIndicator color={styles.actionIconText.color} size="small" /> : <Ionicons name={icon} size={16} color={styles.actionIconText.color} />}
      <Text style={styles.actionIconLabel}>{label}</Text>
    </HapticTouchable>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>, topInset: number) {
  const surface = theme.panel;
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.16 : 0.18);
  const accentInk = theme.isLight ? darkenColor(theme.accent, 38) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 18, paddingTop: Math.max(topInset + 12, 52), paddingBottom: 118, gap: 14 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    iconBtn: { width: 40, height: 40, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), alignItems: 'center', justifyContent: 'center', boxShadow: cbTileShadow(0.06) },
    hero: { borderRadius: 30, padding: 20, overflow: 'hidden', boxShadow: cbModalShadow(0.14) } as ViewStyle,
    heroGhost: { position: 'absolute', right: 15, top: 0, fontFamily: 'Inter_900Black', fontSize: layout.isTablet ? 92 : 76, lineHeight: layout.isTablet ? 98 : 82, color: rgbaFromHex(theme.textPrimary, theme.isLight ? 0.035 : 0.055), letterSpacing: -4 },
    eyebrow: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase' },
    heroTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 32, letterSpacing: 0, marginTop: 8 },
    heroCopy: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13, marginTop: 4 },
    section: { borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), borderRadius: 24, padding: 15, gap: 12, boxShadow: cbTileShadow(0.08) } as ViewStyle,
    sectionTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 17, letterSpacing: 0 },
    sectionHint: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 18 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    topicChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: theme.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: rgbaFromHex(theme.panelAlt, 0.84), maxWidth: '100%' },
    topicChipText: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 12 },
    conceptChipText: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: rgbaFromHex(theme.panelAlt, 0.84) },
    empty: { alignItems: 'center', paddingVertical: 48, gap: 9 },
    emptyTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 22 },
    emptyText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13, textAlign: 'center' },
    list: { gap: 12 },
    mapCard: { borderRadius: 22, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 16, gap: 15, boxShadow: cbTileShadow(0.07) } as ViewStyle,
    mapTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    mapTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 18, letterSpacing: 0 },
    mapTopic: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, marginTop: 4 },
    deleteBtn: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    metricRow: { flexDirection: 'row', gap: 10 },
    metric: { flex: 1, borderRadius: 13, borderWidth: 1, borderColor: theme.border, backgroundColor: rgbaFromHex(theme.panelAlt, 0.8), padding: 11 },
    metricValue: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 17, letterSpacing: 0 },
    metricLabel: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 3 },
    nodeMap: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 12, gap: 8, boxShadow: cbTileShadow(0.08) } as ViewStyle,
    nodeRow: { minHeight: 58, borderRadius: 18, borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.12), backgroundColor: rgbaFromHex(theme.panelAlt, 0.78), paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
    nodeRowActive: { borderColor: theme.accentHover, backgroundColor: rgbaFromHex(theme.accent, 0.12) },
    nodeRail: { width: 24, alignItems: 'center' },
    nodeDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: theme.textSecondary, backgroundColor: rgbaFromHex(surface, 0.9) },
    nodeDotDone: { borderColor: theme.accentHover, backgroundColor: rgbaFromHex(theme.accentHover, 0.25) },
    nodeTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 14, letterSpacing: 0 },
    nodeMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, marginTop: 3 },
    detailPanel: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 16, gap: 13, boxShadow: cbTileShadow(0.08) } as ViewStyle,
    detailHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    bodyText: { fontFamily: 'Inter_400Regular', color: theme.textPrimary, fontSize: 13, lineHeight: 21 },
    actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    actionIcon: { minWidth: 74, borderRadius: 16, borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.14), backgroundColor: rgbaFromHex(theme.accent, 0.1), paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center', gap: 5 },
    actionIconText: { color: theme.accentHover },
    actionIconLabel: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 },
    label: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase' },
    input: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: border, paddingHorizontal: 14, color: theme.textPrimary, backgroundColor: rgbaFromHex(surface, 0.92), fontFamily: 'Inter_600SemiBold' },
    textArea: { minHeight: 118, paddingTop: 13, textAlignVertical: 'top' },
    primaryBtn: { height: 52, borderRadius: 14, backgroundColor: theme.accentHover, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    primaryText: { fontFamily: 'Inter_900Black', color: accentInk, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.1 },
    answerCard: { borderRadius: 22, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 16, gap: 10, boxShadow: cbTileShadow(0.07) } as ViewStyle,
    modalRoot: { flex: 1, backgroundColor: theme.bgPrimary },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 12, gap: 12 },
    modalTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 23, flex: 1 },
    modalBody: { padding: 20, gap: 13 },
  });
}
