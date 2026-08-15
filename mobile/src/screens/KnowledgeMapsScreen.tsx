import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  LayoutAnimation,
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
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { AuthUser } from '../services/auth';
import {
  addManualKnowledgeNode,
  askAI,
  createKnowledgeRoadmap,
  deleteKnowledgeNode,
  deleteKnowledgeRoadmap,
  expandKnowledgeNode,
  exploreKnowledgeNode,
  getKnowledgeRoadmap,
  getKnowledgeRoadmaps,
  getPersonalizedXPRoadmap,
  KnowledgeNode,
  KnowledgeRoadmap,
  KnowledgeRoadmapDetail,
  saveKnowledgeNodeNotes,
} from '../services/api';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import { cbTileShadow } from '../components/NeumorphicTexture';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = { user: AuthUser; onBack: () => void };
type NodePanelTab = 'learn' | 'notes' | 'ask';
type GraphPoint = { node: KnowledgeNode; x: number; y: number };
type GraphEdge = { id: string; from: GraphPoint; to: GraphPoint };
type GraphModel = { points: GraphPoint[]; edges: GraphEdge[]; width: number; height: number };

const NODE_WIDTH = 168;
const NODE_HEIGHT = 104;
const H_GAP = 22;
const V_GAP = 54;
const GRAPH_PAD = 30;

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function nodeTitle(node: KnowledgeNode | null) {
  return node?.topic_name || 'Topic';
}

function makeGraph(nodes: KnowledgeNode[]): GraphModel {
  if (!nodes.length) return { points: [], edges: [], width: 360, height: 420 };
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<number, KnowledgeNode[]>();
  nodes.forEach((node) => {
    if (node.parent_id != null && byId.has(node.parent_id)) {
      children.set(node.parent_id, [...(children.get(node.parent_id) ?? []), node]);
    }
  });
  const roots = nodes.filter((node) => node.parent_id == null || !byId.has(node.parent_id));
  const pointById = new Map<number, GraphPoint>();
  let leafIndex = 0;
  let maxDepth = 0;

  const place = (node: KnowledgeNode, depth: number): number => {
    maxDepth = Math.max(maxDepth, depth);
    const nodeChildren = children.get(node.id) ?? [];
    let centerX: number;
    if (!nodeChildren.length) {
      centerX = GRAPH_PAD + leafIndex * (NODE_WIDTH + H_GAP) + NODE_WIDTH / 2;
      leafIndex += 1;
    } else {
      const childCenters = nodeChildren.map((child) => place(child, depth + 1));
      centerX = childCenters.reduce((sum, value) => sum + value, 0) / childCenters.length;
    }
    pointById.set(node.id, {
      node,
      x: centerX - NODE_WIDTH / 2,
      y: GRAPH_PAD + depth * (NODE_HEIGHT + V_GAP),
    });
    return centerX;
  };

  roots.forEach((root) => place(root, 0));
  nodes.forEach((node) => {
    if (!pointById.has(node.id)) place(node, Math.max(0, node.depth_level ?? 0));
  });
  const points = [...pointById.values()];
  const edges = nodes.flatMap((node) => {
    if (node.parent_id == null) return [];
    const from = pointById.get(node.parent_id);
    const to = pointById.get(node.id);
    return from && to ? [{ id: `${node.parent_id}-${node.id}`, from, to }] : [];
  });
  const maxX = Math.max(...points.map((point) => point.x + NODE_WIDTH));
  return {
    points,
    edges,
    width: Math.max(360, maxX + GRAPH_PAD),
    height: Math.max(440, GRAPH_PAD * 2 + (maxDepth + 1) * NODE_HEIGHT + maxDepth * V_GAP),
  };
}

function getNodePath(node: KnowledgeNode | null, nodes: KnowledgeNode[]) {
  if (!node) return '';
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const path: string[] = [];
  let cursor: KnowledgeNode | undefined = node;
  const seen = new Set<number>();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    path.unshift(cursor.topic_name);
    cursor = cursor.parent_id != null ? byId.get(cursor.parent_id) : undefined;
  }
  return path.join('  ›  ');
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
  const [showNodePanel, setShowNodePanel] = useState(false);
  const [nodeTab, setNodeTab] = useState<NodePanelTab>('learn');
  const [nodeNotes, setNodeNotes] = useState('');
  const [busyNode, setBusyNode] = useState<number | null>(null);
  const [exploringNode, setExploringNode] = useState<number | null>(null);
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

  const graph = useMemo(() => makeGraph(detail?.nodes_flat ?? []), [detail]);
  const nodePath = useMemo(() => getNodePath(selectedNode, detail?.nodes_flat ?? []), [selectedNode, detail]);

  const openMap = async (map: KnowledgeRoadmap) => {
    setSelectedMap(map);
    setDetailLoading(true);
    setSelectedNode(null);
    setShowNodePanel(false);
    try {
      setDetail(await getKnowledgeRoadmap(map.id));
    } catch (error) {
      Alert.alert('Open map failed', error instanceof Error ? error.message : 'Could not load this map');
    } finally {
      setDetailLoading(false);
    }
  };

  const reloadDetail = async (keepNodeId: number | null = selectedNode?.id ?? null) => {
    if (!selectedMap) return;
    const data = await getKnowledgeRoadmap(selectedMap.id);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDetail(data);
    const targetId = keepNodeId;
    if (targetId) {
      const updated = data.nodes_flat.find((node) => node.id === targetId) || null;
      setSelectedNode(updated);
      setNodeNotes(updated?.user_notes || '');
    } else {
      setSelectedNode(null);
      setNodeNotes('');
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
      await openMap({ id: created.roadmap_id, title: rootTopic, root_topic: rootTopic, total_nodes: created.total_nodes || 1, max_depth_reached: 0 });
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
            setMaps((current) => current.filter((item) => item.id !== map.id));
          } catch (error) {
            Alert.alert('Delete failed', error instanceof Error ? error.message : 'Could not delete map');
          }
        },
      },
    ]);
  };

  const openNode = (node: KnowledgeNode, tab: NodePanelTab = 'learn') => {
    setSelectedNode(node);
    setNodeNotes(node.user_notes || '');
    setNodeTab(tab);
    setChatQuestion('');
    setChatAnswer('');
    setShowNodePanel(true);
  };

  const learnNode = async (node: KnowledgeNode) => {
    openNode(node, 'learn');
    if (node.ai_explanation || node.is_explored) return;
    setExploringNode(node.id);
    try {
      const result = await exploreKnowledgeNode(node.id);
      const explored = (result.node ?? result) as KnowledgeNode;
      const merged = { ...node, ...explored, is_explored: true };
      setSelectedNode(merged);
      setDetail((current) => current ? {
        ...current,
        nodes_flat: current.nodes_flat.map((item) => item.id === node.id ? merged : item),
      } : current);
    } catch (error) {
      Alert.alert('Learn about topic', error instanceof Error ? error.message : 'Could not generate this topic lesson');
    } finally {
      setExploringNode(null);
    }
  };

  const expandNode = async (node: KnowledgeNode) => {
    setBusyNode(node.id);
    try {
      await expandKnowledgeNode(node.id);
      await reloadDetail(node.id);
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
      setSelectedNode((node) => node ? { ...node, user_notes: nodeNotes } : node);
      setDetail((current) => current ? { ...current, nodes_flat: current.nodes_flat.map((node) => node.id === selectedNode.id ? { ...node, user_notes: nodeNotes } : node) } : current);
      Alert.alert('Notes saved');
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
      const parentId = childModalNode.id;
      setChildTopic('');
      setChildDescription('');
      setChildModalNode(null);
      await reloadDetail(parentId);
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
            setShowNodePanel(false);
            setSelectedNode(null);
            await reloadDetail(null);
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
    if (!selectedNode || !chatQuestion.trim()) {
      Alert.alert('Ask something about this topic');
      return;
    }
    setChatLoading(true);
    setChatAnswer('');
    try {
      const prompt = [
        `Knowledge map path: ${nodePath}`,
        `Current topic: ${selectedNode.topic_name}`,
        selectedNode.description ? `Description: ${selectedNode.description}` : '',
        selectedNode.ai_explanation ? `Existing explanation: ${selectedNode.ai_explanation}` : '',
        selectedNode.key_concepts?.length ? `Key concepts: ${selectedNode.key_concepts.join(', ')}` : '',
        `Question: ${chatQuestion.trim()}`,
      ].filter(Boolean).join('\n');
      const result = await askAI(user.username, prompt, undefined, true, []);
      setChatAnswer(result.response || result.answer || 'No answer returned.');
    } catch (error) {
      Alert.alert('Topic chat failed', error instanceof Error ? error.message : 'Could not answer from this topic');
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
        <View style={s.mapScreen}>
          <View style={s.mapHeader}>
            <HapticTouchable style={s.iconBtn} onPress={() => { setSelectedMap(null); setDetail(null); setSelectedNode(null); setShowNodePanel(false); }} haptic="light" accessibilityLabel="Back to knowledge maps">
              <Ionicons name="chevron-back" size={20} color={selectedTheme.accentHover} />
            </HapticTouchable>
            <View style={s.mapHeaderCopy}>
              <Text style={s.mapKicker}>KNOWLEDGE MAP</Text>
              <Text style={s.mapHeaderTitle} numberOfLines={1}>{detail?.roadmap?.title || selectedMap.title}</Text>
            </View>
            <HapticTouchable style={s.iconBtn} onPress={() => reloadDetail()} haptic="selection" accessibilityLabel="Refresh map">
              <Ionicons name="refresh" size={17} color={selectedTheme.accentHover} />
            </HapticTouchable>
          </View>

          <View style={s.mapStatusRow}>
            <View style={s.statusPill}><View style={[s.statusDot, { backgroundColor: selectedTheme.accentHover }]} /><Text style={s.statusText}>{detail?.nodes_flat.length ?? 0} topics</Text></View>
            <View style={s.statusPill}><Ionicons name="git-branch-outline" size={13} color={selectedTheme.accent} /><Text style={s.statusText}>depth {detail?.roadmap?.max_depth_reached ?? 0}</Text></View>
            <Text style={s.mapHint}>drag · pinch · tap a topic</Text>
          </View>

          {detailLoading ? (
            <View style={s.centerLoading}><ActivityIndicator color={selectedTheme.accent} size="large" /><Text style={s.loadingText}>building your map…</Text></View>
          ) : (
            <GraphCanvas
              graph={graph}
              selectedId={selectedNode?.id ?? null}
              busyNode={busyNode}
              exploringNode={exploringNode}
              onOpen={openNode}
              onLearn={learnNode}
              onExpand={expandNode}
              theme={selectedTheme}
              styles={s}
            />
          )}
        </View>

        <Modal visible={showNodePanel && !!selectedNode} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowNodePanel(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
            <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
            <View style={s.sheetHandle} />
            <View style={s.nodeSheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.nodeSheetKicker}>TOPIC DEEP DIVE</Text>
                <Text style={s.nodeSheetTitle} numberOfLines={2}>{nodeTitle(selectedNode)}</Text>
              </View>
              <HapticTouchable style={s.sheetClose} onPress={() => setShowNodePanel(false)} haptic="light"><Ionicons name="close" size={20} color={selectedTheme.accentHover} /></HapticTouchable>
            </View>
            <Text style={s.pathText} numberOfLines={2}>{nodePath}</Text>

            <View style={s.nodeMetrics}>
              <NodeMetric value={String(selectedNode?.key_concepts?.length ?? 0)} label="concepts" styles={s} />
              <NodeMetric value={String(selectedNode?.real_world_examples?.length ?? 0)} label="examples" styles={s} />
              <NodeMetric value={selectedNode?.user_notes ? 'yes' : 'no'} label="notes" styles={s} />
            </View>

            <View style={s.nodeTabs}>
              {([
                ['learn', 'book-outline', 'Learn'],
                ['notes', 'document-text-outline', 'Notes'],
                ['ask', 'chatbubble-ellipses-outline', 'Ask'],
              ] as [NodePanelTab, React.ComponentProps<typeof Ionicons>['name'], string][]).map(([key, icon, label]) => (
                <HapticTouchable key={key} style={[s.nodeTab, nodeTab === key && s.nodeTabActive]} onPress={() => setNodeTab(key)} haptic="selection">
                  <Ionicons name={icon} size={15} color={nodeTab === key ? s.accentInk.color : selectedTheme.textSecondary} />
                  <Text style={[s.nodeTabText, nodeTab === key && s.nodeTabTextActive]}>{label}</Text>
                </HapticTouchable>
              ))}
            </View>

            {nodeTab === 'learn' ? (
              <ScrollView contentContainerStyle={s.sheetScroll} showsVerticalScrollIndicator={false}>
                {exploringNode === selectedNode?.id ? (
                  <View style={s.lessonLoading}><ActivityIndicator color={selectedTheme.accent} /><Text style={s.loadingText}>learning this topic…</Text></View>
                ) : selectedNode?.ai_explanation ? (
                  <>
                    <LearningSection icon="information-circle-outline" title="Overview" styles={s}><Text style={s.bodyText}>{selectedNode.ai_explanation}</Text></LearningSection>
                    {!!selectedNode.key_concepts?.length && (
                      <LearningSection icon="sparkles-outline" title="Key concepts" styles={s}>
                        <View style={s.chipRow}>{selectedNode.key_concepts.map((concept) => <Text key={concept} style={s.conceptChip}>{concept}</Text>)}</View>
                      </LearningSection>
                    )}
                    {!!selectedNode.why_important && <LearningSection icon="locate-outline" title="Why this matters" styles={s}><Text style={s.bodyText}>{selectedNode.why_important}</Text></LearningSection>}
                    {!!selectedNode.real_world_examples?.length && (
                      <LearningSection icon="earth-outline" title="Real-world examples" styles={s}>
                        {selectedNode.real_world_examples.map((example, index) => <View key={`${example}-${index}`} style={s.exampleRow}><Text style={s.exampleIndex}>{String(index + 1).padStart(2, '0')}</Text><Text style={s.exampleText}>{example}</Text></View>)}
                      </LearningSection>
                    )}
                    {!!selectedNode.learning_tips && <LearningSection icon="bulb-outline" title="Learning tip" styles={s}><Text style={s.bodyText}>{selectedNode.learning_tips}</Text></LearningSection>}
                  </>
                ) : (
                  <View style={s.learnEmpty}>
                    <View style={s.learnEmptyIcon}><Ionicons name="book-outline" size={28} color={selectedTheme.accentHover} /></View>
                    <Text style={s.learnEmptyTitle}>learn about this topic</Text>
                    <Text style={s.learnEmptyText}>Generate an explanation, key concepts, examples, and a learning tip.</Text>
                    <HapticTouchable style={s.primaryBtn} onPress={() => selectedNode && learnNode(selectedNode)} haptic="medium"><Ionicons name="sparkles" size={16} color={s.accentInk.color} /><Text style={s.primaryText}>EXPLORE TOPIC</Text></HapticTouchable>
                  </View>
                )}
                <View style={s.sheetActions}>
                  {selectedNode?.expansion_status !== 'expanded' && (
                    <HapticTouchable style={s.secondaryAction} onPress={() => selectedNode && expandNode(selectedNode)} disabled={busyNode === selectedNode?.id} haptic="medium">
                      {busyNode === selectedNode?.id ? <ActivityIndicator color={selectedTheme.accentHover} size="small" /> : <Ionicons name="git-branch-outline" size={16} color={selectedTheme.accentHover} />}
                      <Text style={s.secondaryActionText}>EXPAND SUBTOPICS</Text>
                    </HapticTouchable>
                  )}
                  <HapticTouchable style={s.secondaryAction} onPress={() => { if (selectedNode) { setShowNodePanel(false); setChildModalNode(selectedNode); } }} haptic="selection"><Ionicons name="add" size={17} color={selectedTheme.accentHover} /><Text style={s.secondaryActionText}>ADD CHILD</Text></HapticTouchable>
                  {!!selectedNode?.parent_id && <HapticTouchable style={s.dangerAction} onPress={() => selectedNode && removeNode(selectedNode)} haptic="warning"><Ionicons name="trash-outline" size={16} color={selectedTheme.danger} /></HapticTouchable>}
                </View>
              </ScrollView>
            ) : nodeTab === 'notes' ? (
              <View style={s.sheetForm}>
                <Text style={s.formLabel}>PERSONAL NOTES</Text>
                <TextInput value={nodeNotes} onChangeText={setNodeNotes} placeholder="Capture what you understand, questions, or memory cues…" placeholderTextColor={selectedTheme.textSecondary} style={[s.input, s.notesInput]} multiline textAlignVertical="top" />
                <HapticTouchable style={s.primaryBtn} onPress={saveNotes} disabled={busyNode === selectedNode?.id} haptic="medium">
                  {busyNode === selectedNode?.id ? <ActivityIndicator color={s.accentInk.color} /> : <><Ionicons name="save-outline" size={16} color={s.accentInk.color} /><Text style={s.primaryText}>SAVE NOTES</Text></>}
                </HapticTouchable>
              </View>
            ) : (
              <View style={s.sheetForm}>
                <Text style={s.formLabel}>ASK ABOUT THIS TOPIC</Text>
                <TextInput value={chatQuestion} onChangeText={setChatQuestion} placeholder="Ask for an analogy, prerequisites, or a simpler explanation…" placeholderTextColor={selectedTheme.textSecondary} style={[s.input, s.askInput]} multiline textAlignVertical="top" />
                <HapticTouchable style={s.primaryBtn} onPress={askNode} disabled={chatLoading} haptic="medium">
                  {chatLoading ? <ActivityIndicator color={s.accentInk.color} /> : <><Ionicons name="send" size={15} color={s.accentInk.color} /><Text style={s.primaryText}>ASK TOPIC</Text></>}
                </HapticTouchable>
                {!!chatAnswer && <ScrollView style={s.answerScroll}><View style={s.answerCard}><Text style={s.bodyText}>{chatAnswer}</Text></View></ScrollView>}
              </View>
            )}
          </KeyboardAvoidingView>
        </Modal>

        <ChildNodeModal
          visible={!!childModalNode}
          parent={childModalNode}
          topic={childTopic}
          description={childDescription}
          busy={!!busyNode}
          onTopic={setChildTopic}
          onDescription={setChildDescription}
          onClose={() => setChildModalNode(null)}
          onAdd={addChild}
          theme={selectedTheme}
          styles={s}
        />
      </View>
    );
  }

  const totalNodes = maps.reduce((sum, map) => sum + (map.total_nodes || 0), 0);
  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <ScrollView contentContainerStyle={s.libraryScroll} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={selectedTheme.accent} />}>
        <View style={s.libraryHeader}>
          <HapticTouchable style={s.iconBtn} onPress={onBack} haptic="light" accessibilityLabel="Back"><Ionicons name="chevron-back" size={20} color={selectedTheme.accentHover} /></HapticTouchable>
          <View style={s.libraryHeaderCopy}><Text style={s.mapKicker}>VISUAL LEARNING</Text><Text style={s.libraryTitle}>knowledge maps</Text></View>
          <HapticTouchable style={s.iconBtnAccent} onPress={() => setShowCreate(true)} haptic="medium" accessibilityLabel="Create knowledge map"><Ionicons name="add" size={21} color={s.accentInk.color} /></HapticTouchable>
        </View>

        <View style={s.libraryHero}>
          <View style={s.heroCopyBlock}><Text style={s.heroEyebrow}>YOUR KNOWLEDGE UNIVERSE</Text><Text style={s.heroHeadline}>Connect ideas. Expand what matters.</Text></View>
          <View style={s.heroMetrics}><View><Text style={s.heroMetricValue}>{maps.length}</Text><Text style={s.heroMetricLabel}>maps</Text></View><View style={s.heroMetricLine} /><View><Text style={s.heroMetricValue}>{totalNodes}</Text><Text style={s.heroMetricLabel}>topics</Text></View></View>
          <HapticTouchable style={s.createHeroBtn} onPress={() => setShowCreate(true)} haptic="medium"><Ionicons name="git-network-outline" size={17} color={s.accentInk.color} /><Text style={s.createHeroText}>CREATE A NEW MAP</Text></HapticTouchable>
        </View>

        {!!recommendedTopics.length && (
          <View style={s.recommendedSection}>
            <View style={s.sectionHeading}><View><Text style={s.sectionKicker}>SUGGESTED STARTS</Text><Text style={s.sectionTitle}>recommended paths</Text></View><Ionicons name="sparkles-outline" size={18} color={selectedTheme.accent} /></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recommendedRow}>
              {recommendedTopics.map((item) => <HapticTouchable key={item} style={s.recommendedChip} onPress={() => createMap(item)} disabled={creating} haptic="selection"><Ionicons name="add-circle-outline" size={15} color={selectedTheme.accentHover} /><Text style={s.recommendedText} numberOfLines={1}>{item}</Text></HapticTouchable>)}
            </ScrollView>
          </View>
        )}

        {loading ? <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 50 }} /> : !maps.length ? (
          <View style={s.empty}><View style={s.emptyIcon}><Ionicons name="git-network-outline" size={31} color={selectedTheme.accentHover} /></View><Text style={s.emptyTitle}>start your first map</Text><Text style={s.emptyText}>Choose a broad topic, then expand it into a living network of connected ideas.</Text></View>
        ) : (
          <View style={s.mapList}>
            <View style={s.sectionHeading}><View><Text style={s.sectionKicker}>YOUR LIBRARY</Text><Text style={s.sectionTitle}>continue exploring</Text></View><Text style={s.sectionCount}>{maps.length} maps</Text></View>
            {maps.map((map, index) => (
              <HapticTouchable key={map.id} style={s.libraryMapCard} onPress={() => openMap(map)} haptic="selection" activeOpacity={0.88}>
                <MiniMapPreview index={index} styles={s} />
                <View style={s.libraryMapBody}>
                  <View style={s.libraryMapTop}><Text style={s.libraryMapTitle} numberOfLines={2}>{map.title}</Text><HapticTouchable style={s.mapDelete} onPress={() => removeMap(map)} haptic="warning"><Ionicons name="trash-outline" size={14} color={selectedTheme.textSecondary} /></HapticTouchable></View>
                  <Text style={s.libraryMapMeta}>{map.total_nodes || 1} topics · depth {map.max_depth_reached || 0}</Text>
                  <View style={s.libraryMapFooter}><View style={s.openMapPill}><Ionicons name="navigate-outline" size={13} color={s.accentInk.color} /><Text style={s.openMapText}>OPEN GRAPH</Text></View><Ionicons name="arrow-forward" size={17} color={selectedTheme.accentHover} /></View>
                </View>
              </HapticTouchable>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
          <View style={s.sheetHandle} />
          <View style={s.createHeader}><View><Text style={s.nodeSheetKicker}>NEW KNOWLEDGE MAP</Text><Text style={s.createTitle}>What do you want to understand?</Text></View><HapticTouchable style={s.sheetClose} onPress={() => setShowCreate(false)}><Ionicons name="close" size={20} color={selectedTheme.accentHover} /></HapticTouchable></View>
          <View style={s.createBody}>
            <Text style={s.formLabel}>ROOT TOPIC</Text>
            <TextInput value={topic} onChangeText={setTopic} placeholder="Machine learning, photosynthesis…" placeholderTextColor={selectedTheme.textSecondary} style={s.input} autoFocus returnKeyType="done" onSubmitEditing={() => createMap()} />
            <Text style={s.createHint}>Start broad. You can expand any concept into subtopics after the map is created.</Text>
            <HapticTouchable style={s.primaryBtn} onPress={() => createMap()} disabled={creating} haptic="medium">{creating ? <ActivityIndicator color={s.accentInk.color} /> : <><Ionicons name="sparkles" size={16} color={s.accentInk.color} /><Text style={s.primaryText}>BUILD KNOWLEDGE MAP</Text></>}</HapticTouchable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function GraphCanvas({ graph, selectedId, busyNode, exploringNode, onOpen, onLearn, onExpand, theme, styles }: {
  graph: GraphModel;
  selectedId: number | null;
  busyNode: number | null;
  exploringNode: number | null;
  onOpen: (node: KnowledgeNode) => void;
  onLearn: (node: KnowledgeNode) => void;
  onExpand: (node: KnowledgeNode) => void;
  theme: ReturnType<typeof useAppTheme>['selectedTheme'];
  styles: ReturnType<typeof createStyles>;
}) {
  const pan = useRef(new Animated.ValueXY({ x: 16, y: 16 })).current;
  const panStart = useRef({ x: 16, y: 16 });
  const pinchStart = useRef<{ distance: number; zoom: number; pan: { x: number; y: number } } | null>(null);
  const zoomRef = useRef(0.92);
  const [zoom, setZoomState] = useState(0.92);
  const [viewport, setViewport] = useState({ width: 360, height: 560 });
  const viewportRef = useRef(viewport);
  const graphRef = useRef(graph);

  useEffect(() => { viewportRef.current = viewport; }, [viewport]);
  useEffect(() => { graphRef.current = graph; }, [graph]);

  const setZoom = useCallback((value: number) => {
    const bounded = Math.max(0.36, Math.min(1.3, value));
    zoomRef.current = bounded;
    setZoomState(bounded);
    return bounded;
  }, []);

  const clampPan = useCallback((position: { x: number; y: number }, scale = zoomRef.current) => {
    const currentViewport = viewportRef.current;
    const currentGraph = graphRef.current;
    const horizontalEnd = currentViewport.width - currentGraph.width * scale - 28;
    const verticalEnd = currentViewport.height - currentGraph.height * scale - 28;
    return {
      x: Math.max(Math.min(28, horizontalEnd), Math.min(Math.max(28, horizontalEnd), position.x)),
      y: Math.max(Math.min(28, verticalEnd), Math.min(Math.max(28, verticalEnd), position.y)),
    };
  }, []);

  const moveTo = useCallback((position: { x: number; y: number }, animated = true) => {
    const next = clampPan(position);
    panStart.current = next;
    if (animated) {
      Animated.spring(pan, { toValue: next, useNativeDriver: false, damping: 18, stiffness: 180, mass: 0.8 }).start();
    } else {
      pan.setValue(next);
    }
  }, [clampPan, pan]);

  const focusNode = useCallback((nodeId?: number | null, scale = 0.92) => {
    const point = graph.points.find((item) => item.node.id === nodeId)
      ?? graph.points.find((item) => item.node.parent_id == null)
      ?? graph.points[0];
    if (!point) return;
    const nextZoom = setZoom(scale);
    const x = viewport.width / 2 - (point.x + NODE_WIDTH / 2) * nextZoom;
    const y = Math.max(30, viewport.height * 0.16) - point.y * nextZoom;
    requestAnimationFrame(() => moveTo({ x, y }));
  }, [graph.points, moveTo, setZoom, viewport.height, viewport.width]);

  const overview = useCallback(() => {
    const nextZoom = setZoom(Math.max(0.34, Math.min(0.78, (viewport.width - 30) / graph.width, (viewport.height - 34) / graph.height)));
    const x = (viewport.width - graph.width * nextZoom) / 2;
    const y = (viewport.height - graph.height * nextZoom) / 2;
    requestAnimationFrame(() => moveTo({ x, y }));
  }, [graph.height, graph.width, moveTo, setZoom, viewport.height, viewport.width]);

  const panGesture = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .minDistance(2)
    .maxPointers(1)
    .shouldCancelWhenOutside(false)
    .onBegin(() => {
      pan.stopAnimation((value) => { panStart.current = value; });
    })
    .onUpdate((event) => {
      pan.setValue({ x: panStart.current.x + event.translationX, y: panStart.current.y + event.translationY });
    })
    .onEnd(() => {
      pan.stopAnimation((value) => moveTo(value));
    })
    .onFinalize(() => {
      pan.stopAnimation((value) => moveTo(value));
    }), [moveTo, pan]);

  const pinchGesture = useMemo(() => Gesture.Pinch()
    .runOnJS(true)
    .shouldCancelWhenOutside(false)
    .onBegin(() => {
      pan.stopAnimation((value) => {
        panStart.current = value;
        pinchStart.current = { distance: 1, zoom: zoomRef.current, pan: value };
      });
    })
    .onUpdate((event) => {
      const start = pinchStart.current;
      if (!start) return;
      const nextZoom = setZoom(start.zoom * event.scale);
      const center = { x: viewportRef.current.width / 2, y: viewportRef.current.height / 2 };
      const ratio = nextZoom / start.zoom;
      pan.setValue({
        x: center.x - (center.x - start.pan.x) * ratio,
        y: center.y - (center.y - start.pan.y) * ratio,
      });
    })
    .onFinalize(() => {
      pinchStart.current = null;
      pan.stopAnimation((value) => moveTo(value));
    }), [moveTo, pan, setZoom]);

  const canvasGesture = useMemo(() => Gesture.Simultaneous(panGesture, pinchGesture), [panGesture, pinchGesture]);

  useEffect(() => { focusNode(selectedId); }, [graph, viewport.height, viewport.width]);

  const changeZoom = (amount: number) => {
    const oldZoom = zoomRef.current;
    const nextZoom = setZoom(oldZoom + amount);
    const center = { x: viewport.width / 2, y: viewport.height / 2 };
    const ratio = nextZoom / oldZoom;
    moveTo({ x: center.x - (center.x - panStart.current.x) * ratio, y: center.y - (center.y - panStart.current.y) * ratio });
  };

  const originCorrection = {
    x: graph.width * (1 - zoom) / 2,
    y: graph.height * (1 - zoom) / 2,
  };

  return (
    <GestureDetector gesture={canvasGesture}>
    <View style={styles.graphViewport} onLayout={(event) => setViewport({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
      <View style={styles.graphGrid} pointerEvents="none" />
      <Animated.View
        style={{
          position: 'absolute',
          left: Animated.subtract(pan.x, originCorrection.x),
          top: Animated.subtract(pan.y, originCorrection.y),
          width: graph.width,
          height: graph.height,
          transform: [{ scale: zoom }],
        }}
      >
        <Svg width={graph.width} height={graph.height} style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Defs><SvgGradient id="edge" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={theme.accentHover} stopOpacity="0.72" /><Stop offset="1" stopColor={theme.accent} stopOpacity="0.2" /></SvgGradient></Defs>
          {graph.edges.map((edge) => {
            const x1 = edge.from.x + NODE_WIDTH / 2;
            const y1 = edge.from.y + NODE_HEIGHT;
            const x2 = edge.to.x + NODE_WIDTH / 2;
            const y2 = edge.to.y;
            const mid = (y1 + y2) / 2;
            return <Path key={edge.id} d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`} fill="none" stroke="url(#edge)" strokeWidth={2.3} />;
          })}
        </Svg>
        {graph.points.map(({ node, x, y }) => {
          const selected = selectedId === node.id;
          const expanded = node.expansion_status === 'expanded' || node.has_generated_subtopics;
          return (
            <View key={node.id} style={[styles.graphNode, { left: x, top: y }, selected && styles.graphNodeSelected, node.is_explored && styles.graphNodeExplored]}>
              <HapticTouchable style={styles.graphNodeMain} onPress={() => onOpen(node)} haptic="selection">
                <View style={[styles.graphNodeIcon, expanded && styles.graphNodeIconExpanded]}><Ionicons name={node.is_explored ? 'sparkles' : 'map-outline'} size={15} color={node.is_explored ? styles.accentInk.color : theme.accentHover} /></View>
                <View style={{ flex: 1 }}><Text style={styles.graphNodeTitle} numberOfLines={2}>{node.topic_name}</Text><Text style={styles.graphNodeMeta}>level {node.depth_level ?? 0}{node.user_notes ? ' · notes' : ''}</Text></View>
              </HapticTouchable>
              <View style={styles.graphNodeActions}>
                <HapticTouchable style={styles.graphNodeAction} onPress={() => onLearn(node)} disabled={exploringNode === node.id} haptic="medium">{exploringNode === node.id ? <ActivityIndicator color={theme.accentHover} size="small" /> : <><Ionicons name="book-outline" size={12} color={theme.accentHover} /><Text style={styles.graphNodeActionText}>LEARN</Text></>}</HapticTouchable>
                {!expanded && <HapticTouchable style={styles.graphNodeAction} onPress={() => onExpand(node)} disabled={busyNode === node.id} haptic="medium">{busyNode === node.id ? <ActivityIndicator color={theme.accentHover} size="small" /> : <><Ionicons name="add" size={13} color={theme.accentHover} /><Text style={styles.graphNodeActionText}>EXPAND</Text></>}</HapticTouchable>}
              </View>
            </View>
          );
        })}
      </Animated.View>
      <View style={styles.zoomControls}>
        <HapticTouchable style={styles.zoomBtn} onPress={() => changeZoom(-0.12)} haptic="selection" accessibilityLabel="Zoom out"><Ionicons name="remove" size={18} color={theme.accentHover} /></HapticTouchable>
        <Text style={styles.zoomValue}>{Math.round(zoom * 100)}%</Text>
        <HapticTouchable style={styles.zoomBtn} onPress={() => changeZoom(0.12)} haptic="selection" accessibilityLabel="Zoom in"><Ionicons name="add" size={18} color={theme.accentHover} /></HapticTouchable>
        <View style={styles.zoomDivider} />
        <HapticTouchable style={styles.zoomBtnWide} onPress={() => focusNode(selectedId)} haptic="selection"><Ionicons name="locate-outline" size={15} color={theme.accentHover} /><Text style={styles.zoomBtnText}>FOCUS</Text></HapticTouchable>
        <HapticTouchable style={styles.zoomBtnWide} onPress={overview} haptic="selection"><Ionicons name="scan-outline" size={15} color={theme.accentHover} /><Text style={styles.zoomBtnText}>OVERVIEW</Text></HapticTouchable>
      </View>
      <View style={styles.graphGestureHint} pointerEvents="none"><Ionicons name="hand-left-outline" size={13} color={theme.textSecondary} /><Text style={styles.graphGestureText}>Drag anywhere · pinch to zoom</Text></View>
    </View>
    </GestureDetector>
  );
}

function NodeMetric({ value, label, styles }: { value: string; label: string; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.nodeMetric}><Text style={styles.nodeMetricValue}>{value}</Text><Text style={styles.nodeMetricLabel}>{label}</Text></View>;
}

function LearningSection({ icon, title, children, styles }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; children: React.ReactNode; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.learningCard}><View style={styles.learningCardHead}><Ionicons name={icon} size={16} color={styles.iconColor.color} /><Text style={styles.learningCardTitle}>{title}</Text></View>{children}</View>;
}

function MiniMapPreview({ index, styles }: { index: number; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={[styles.miniMap, index % 2 === 1 && styles.miniMapAlt]}>
      <View style={styles.miniLineVertical} /><View style={styles.miniLineLeft} /><View style={styles.miniLineRight} />
      <View style={[styles.miniNode, styles.miniNodeRoot]} /><View style={[styles.miniNode, styles.miniNodeLeft]} /><View style={[styles.miniNode, styles.miniNodeRight]} /><View style={[styles.miniNode, styles.miniNodeBottom]} />
    </View>
  );
}

function ChildNodeModal({ visible, parent, topic, description, busy, onTopic, onDescription, onClose, onAdd, theme, styles }: {
  visible: boolean;
  parent: KnowledgeNode | null;
  topic: string;
  description: string;
  busy: boolean;
  onTopic: (value: string) => void;
  onDescription: (value: string) => void;
  onClose: () => void;
  onAdd: () => void;
  theme: ReturnType<typeof useAppTheme>['selectedTheme'];
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
        <LinearGradient colors={[theme.bgTop, theme.bgPrimary, theme.bgBottom]} style={StyleSheet.absoluteFillObject} />
        <View style={styles.sheetHandle} />
        <View style={styles.createHeader}><View style={{ flex: 1 }}><Text style={styles.nodeSheetKicker}>ADD TO {parent?.topic_name?.toUpperCase()}</Text><Text style={styles.createTitle}>New connected topic</Text></View><HapticTouchable style={styles.sheetClose} onPress={onClose}><Ionicons name="close" size={20} color={theme.accentHover} /></HapticTouchable></View>
        <View style={styles.createBody}>
          <Text style={styles.formLabel}>TOPIC</Text><TextInput value={topic} onChangeText={onTopic} placeholder="Specific subtopic" placeholderTextColor={theme.textSecondary} style={styles.input} autoFocus />
          <Text style={styles.formLabel}>DESCRIPTION</Text><TextInput value={description} onChangeText={onDescription} placeholder="Why this belongs in the map…" placeholderTextColor={theme.textSecondary} style={[styles.input, styles.askInput]} multiline textAlignVertical="top" />
          <HapticTouchable style={styles.primaryBtn} onPress={onAdd} disabled={busy} haptic="medium">{busy ? <ActivityIndicator color={styles.accentInk.color} /> : <><Ionicons name="add" size={17} color={styles.accentInk.color} /><Text style={styles.primaryText}>ADD TO GRAPH</Text></>}</HapticTouchable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>, topInset: number) {
  const surface = theme.panel;
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.18 : 0.22);
  const accentInk = theme.isLight ? darkenColor(theme.accent, 40) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    libraryScroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 4, paddingTop: Math.max(topInset + 10, 50), paddingBottom: 110, gap: 4 },
    libraryHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 4 },
    libraryHeaderCopy: { flex: 1 },
    mapKicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 8, letterSpacing: 1.7 },
    libraryTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 30, lineHeight: 35, letterSpacing: -1 },
    iconBtn: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.84), alignItems: 'center', justifyContent: 'center' },
    iconBtnAccent: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, borderColor: theme.accentHover, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    libraryHero: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.9), padding: 17, gap: 4, boxShadow: cbTileShadow(0.08) } as ViewStyle,
    heroCopyBlock: { gap: 4 },
    heroEyebrow: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 8, letterSpacing: 1.5 },
    heroHeadline: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 22, lineHeight: 27, maxWidth: 290 },
    heroMetrics: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    heroMetricValue: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 25 },
    heroMetricLabel: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' },
    heroMetricLine: { width: 1, height: 32, backgroundColor: theme.border },
    createHeroBtn: { height: 44, borderRadius: 13, backgroundColor: theme.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
    createHeroText: { fontFamily: 'Inter_900Black', color: accentInk, fontSize: 10, letterSpacing: 1 },
    recommendedSection: { borderRadius: 21, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.8), padding: 14, gap: 4 },
    sectionHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    sectionKicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 8, letterSpacing: 1.4 },
    sectionTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 18, marginTop: 2 },
    sectionCount: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 9 },
    recommendedRow: { gap: 4 },
    recommendedChip: { maxWidth: 210, height: 38, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(theme.panelAlt, 0.8), flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11 },
    recommendedText: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 10, flexShrink: 1 },
    mapList: { gap: 4 },
    libraryMapCard: { minHeight: 150, borderRadius: 22, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.86), overflow: 'hidden', flexDirection: 'row', boxShadow: cbTileShadow(0.06) } as ViewStyle,
    miniMap: { width: 112, backgroundColor: rgbaFromHex(theme.accent, 0.15), overflow: 'hidden' },
    miniMapAlt: { backgroundColor: rgbaFromHex(theme.accentHover, 0.1) },
    miniLineVertical: { position: 'absolute', left: 55, top: 29, width: 2, height: 72, backgroundColor: rgbaFromHex(theme.accentHover, 0.42) },
    miniLineLeft: { position: 'absolute', left: 28, top: 67, width: 30, height: 2, transform: [{ rotate: '-30deg' }], backgroundColor: rgbaFromHex(theme.accentHover, 0.42) },
    miniLineRight: { position: 'absolute', left: 55, top: 67, width: 31, height: 2, transform: [{ rotate: '30deg' }], backgroundColor: rgbaFromHex(theme.accentHover, 0.42) },
    miniNode: { position: 'absolute', width: 16, height: 16, borderRadius: 6, borderWidth: 2, borderColor: theme.accentHover, backgroundColor: theme.panel },
    miniNodeRoot: { left: 48, top: 22, backgroundColor: theme.accent },
    miniNodeLeft: { left: 22, top: 75 },
    miniNodeRight: { left: 75, top: 75 },
    miniNodeBottom: { left: 48, top: 111 },
    libraryMapBody: { flex: 1, padding: 14, justifyContent: 'space-between' },
    libraryMapTop: { flexDirection: 'row', gap: 4, alignItems: 'flex-start' },
    libraryMapTitle: { flex: 1, fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 16, lineHeight: 20 },
    mapDelete: { width: 30, height: 30, borderRadius: 10, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    libraryMapMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10 },
    libraryMapFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    openMapPill: { borderRadius: 9, backgroundColor: theme.accent, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 7 },
    openMapText: { fontFamily: 'Inter_900Black', color: accentInk, fontSize: 7.5, letterSpacing: 0.7 },
    empty: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.84), alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 4 },
    emptyIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: rgbaFromHex(theme.accent, 0.12), alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 21 },
    emptyText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 300 },
    mapScreen: { flex: 1, paddingTop: Math.max(topInset + 8, 48), paddingHorizontal: 3, paddingBottom: 12, gap: 4 },
    mapHeader: { minHeight: 53, flexDirection: 'row', alignItems: 'center', gap: 4 },
    mapHeaderCopy: { flex: 1 },
    mapHeaderTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 21, lineHeight: 25 },
    mapStatusRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 4 },
    statusPill: { height: 27, borderRadius: 9, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.82), flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8 },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 8 },
    mapHint: { flex: 1, fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 8, textAlign: 'right' },
    centerLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
    loadingText: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 11 },
    graphViewport: { flex: 1, borderRadius: 24, borderWidth: 1, borderColor: border, overflow: 'hidden', backgroundColor: rgbaFromHex(theme.bgPrimary, 0.88) },
    graphGrid: { ...StyleSheet.absoluteFillObject, opacity: 0.22, backgroundColor: rgbaFromHex(theme.panelAlt, 0.25) },
    graphNode: { position: 'absolute', width: NODE_WIDTH, height: NODE_HEIGHT, borderRadius: 18, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.98), overflow: 'hidden', boxShadow: cbTileShadow(0.12) } as ViewStyle,
    graphNodeSelected: { borderColor: theme.accentHover, borderWidth: 2 },
    graphNodeExplored: { backgroundColor: rgbaFromHex(theme.accent, theme.isLight ? 0.16 : 0.1) },
    graphNodeMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingTop: 9 },
    graphNodeIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: rgbaFromHex(theme.accent, 0.11), alignItems: 'center', justifyContent: 'center' },
    graphNodeIconExpanded: { borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.3) },
    graphNodeTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 12, lineHeight: 15 },
    graphNodeMeta: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 8, marginTop: 3 },
    graphNodeActions: { height: 34, borderTopWidth: 1, borderTopColor: theme.border, flexDirection: 'row' },
    graphNodeAction: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
    graphNodeActionText: { fontFamily: 'Inter_700Bold', color: theme.accentHover, fontSize: 7, letterSpacing: 0.55 },
    zoomControls: { position: 'absolute', left: 10, right: 10, bottom: 10, minHeight: 46, borderRadius: 15, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.96), flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, gap: 3, boxShadow: cbTileShadow(0.12) } as ViewStyle,
    zoomBtn: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    zoomValue: { width: 39, textAlign: 'center', fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 8 },
    zoomDivider: { width: 1, height: 23, backgroundColor: border, marginHorizontal: 3 },
    zoomBtnWide: { flex: 1, minWidth: 72, height: 34, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: rgbaFromHex(theme.accent, 0.08) },
    zoomBtnText: { fontFamily: 'Inter_700Bold', color: theme.accentHover, fontSize: 7, letterSpacing: 0.5 },
    graphGestureHint: { position: 'absolute', top: 10, alignSelf: 'center', height: 29, borderRadius: 10, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.9), flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10 },
    graphGestureText: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 8 },
    modalRoot: { flex: 1, backgroundColor: theme.bgPrimary },
    sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: rgbaFromHex(theme.textSecondary, 0.3), alignSelf: 'center', marginTop: 9 },
    nodeSheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, paddingHorizontal: 18, paddingTop: 14 },
    nodeSheetKicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 8, letterSpacing: 1.5 },
    nodeSheetTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 25, lineHeight: 29, marginTop: 3 },
    sheetClose: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.82), alignItems: 'center', justifyContent: 'center' },
    pathText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10, lineHeight: 14, marginHorizontal: 18, marginTop: 8 },
    nodeMetrics: { flexDirection: 'row', gap: 4, marginHorizontal: 18, marginTop: 12 },
    nodeMetric: { flex: 1, minHeight: 54, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.76), alignItems: 'center', justifyContent: 'center' },
    nodeMetricValue: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 16 },
    nodeMetricLabel: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.7 },
    nodeTabs: { height: 44, flexDirection: 'row', gap: 4, marginHorizontal: 18, marginTop: 12 },
    nodeTab: { flex: 1, borderRadius: 13, borderWidth: 1, borderColor: border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
    nodeTabActive: { backgroundColor: theme.accent, borderColor: theme.accentHover },
    nodeTabText: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 9 },
    nodeTabTextActive: { color: accentInk },
    sheetScroll: { padding: 18, paddingBottom: 42, gap: 4 },
    learningCard: { borderRadius: 19, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.8), padding: 14, gap: 4 },
    learningCardHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    learningCardTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 14 },
    bodyText: { fontFamily: 'Inter_400Regular', color: theme.textPrimary, fontSize: 12, lineHeight: 19 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    conceptChip: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 9, borderRadius: 999, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(theme.panelAlt, 0.8), paddingHorizontal: 9, paddingVertical: 7 },
    exampleRow: { flexDirection: 'row', gap: 4, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 9 },
    exampleIndex: { fontFamily: 'Inter_900Black', color: theme.accent, fontSize: 9 },
    exampleText: { flex: 1, fontFamily: 'Inter_400Regular', color: theme.textPrimary, fontSize: 11, lineHeight: 17 },
    lessonLoading: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 4 },
    learnEmpty: { minHeight: 270, borderRadius: 22, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.78), alignItems: 'center', justifyContent: 'center', padding: 22, gap: 4 },
    learnEmptyIcon: { width: 56, height: 56, borderRadius: 19, backgroundColor: rgbaFromHex(theme.accent, 0.12), alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
    learnEmptyTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 19 },
    learnEmptyText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, lineHeight: 17, textAlign: 'center' },
    sheetActions: { flexDirection: 'row', gap: 4, marginTop: 2 },
    secondaryAction: { flex: 1, minHeight: 43, borderRadius: 13, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(theme.accent, 0.08), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
    secondaryActionText: { fontFamily: 'Inter_700Bold', color: theme.accentHover, fontSize: 7.5, letterSpacing: 0.6 },
    dangerAction: { width: 43, height: 43, borderRadius: 13, borderWidth: 1, borderColor: rgbaFromHex(theme.danger, 0.25), alignItems: 'center', justifyContent: 'center' },
    sheetForm: { flex: 1, padding: 18, gap: 4 },
    formLabel: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 9, letterSpacing: 1.4 },
    input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: border, paddingHorizontal: 14, color: theme.textPrimary, backgroundColor: rgbaFromHex(surface, 0.92), fontFamily: 'Inter_600SemiBold', fontSize: 12 },
    notesInput: { minHeight: 230, paddingTop: 14 },
    askInput: { minHeight: 112, paddingTop: 14 },
    primaryBtn: { minHeight: 48, borderRadius: 14, backgroundColor: theme.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 15 },
    primaryText: { fontFamily: 'Inter_900Black', color: accentInk, fontSize: 9, letterSpacing: 1 },
    answerScroll: { flex: 1 },
    answerCard: { borderRadius: 19, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.82), padding: 14 },
    createHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4, padding: 18 },
    createTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 23, lineHeight: 28, marginTop: 4, maxWidth: 310 },
    createBody: { paddingHorizontal: 18, gap: 4 },
    createHint: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, lineHeight: 17 },
    iconColor: { color: theme.accentHover },
    accentInk: { color: accentInk },
  });
}
