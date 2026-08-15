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
import * as DocumentPicker from 'expo-document-picker';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import {
  addConceptNode,
  ConceptNode,
  createKnowledgeRoadmapFromDocs,
  createNoteFromContextDocs,
  generateConceptAsset,
  generateConceptWeb,
  generatePracticeQuestions,
  getConceptWeb,
  getLearningReviews,
  getSearchHubCommands,
  getSearchHubSuggestions,
  LearningReview,
  runSearchHubCommand,
  submitLearningReviewResponse,
} from '../services/api';
import {
  askKnowledgeBase,
  ContextDocument,
  deleteDocument,
  getDocuments,
  getHsModeEnabled,
  importContextUrl,
  getRelatedTopics,
  getSelectedDocIds,
  searchContext,
  setHsModeEnabled,
  setSelectedDocIds,
  uploadContextDocument,
} from '../services/contextService';
import AmbientBubbles from '../components/AmbientBubbles';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import { NeumorphicLayer, cbTileShadow, cbModalShadow } from '../components/NeumorphicTexture';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import MathText from '../components/MathText';

type HubTab = 'vault' | 'ask' | 'concepts' | 'reviews' | 'commands';
type AppTarget = 'flashcards' | 'notes' | 'aimedia' | 'settings' | 'questionBank' | 'knowledgeMaps' | 'slideExplorer' | 'canvasHub' | 'analytics' | 'weaknessPractice' | 'learningPaths';
type Props = { user: AuthUser; onBack: () => void; onNavigate?: (screen: AppTarget) => void };

type AskResult = {
  answer: string;
  chunk_count: number;
  sources: Array<{ filename?: string; page?: string | number; subject?: string; source?: string; doc_id?: string; snippet?: string }>;
} | null;

type SearchResult = {
  text: string;
  metadata?: Record<string, any>;
  source?: string;
};

const TABS: Array<{ key: HubTab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = [
  { key: 'vault', label: 'vault', icon: 'file-tray-stacked-outline' },
  { key: 'ask', label: 'ask', icon: 'search-outline' },
  { key: 'concepts', label: 'concepts', icon: 'git-network-outline' },
  { key: 'reviews', label: 'reviews', icon: 'reader-outline' },
  { key: 'commands', label: 'commands', icon: 'terminal-outline' },
];

function truncate(value: string, max = 220) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max).trim()}...` : clean;
}

function docTopic(doc: ContextDocument) {
  return doc.subject || doc.grade_level || doc.scope || 'general';
}

export default function KnowledgeHubScreen({ user, onBack, onNavigate }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(selectedTheme, layout, insets.top), [selectedTheme, layout, insets.top]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });

  const [tab, setTab] = useState<HubTab>('vault');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [docs, setDocs] = useState<ContextDocument[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hsMode, setHsMode] = useState(false);
  const [relatedTopics, setRelatedTopics] = useState<string[]>([]);
  const [concepts, setConcepts] = useState<ConceptNode[]>([]);
  const [conceptConnections, setConceptConnections] = useState(0);
  const [reviews, setReviews] = useState<LearningReview[]>([]);
  const [commands, setCommands] = useState<Array<{ command: string; description: string }>>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const [askQuery, setAskQuery] = useState('');
  const [askResult, setAskResult] = useState<AskResult>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [asking, setAsking] = useState(false);

  const [commandText, setCommandText] = useState('/map ');
  const [commandResult, setCommandResult] = useState<any>(null);
  const [runningCommand, setRunningCommand] = useState(false);

  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [showConceptModal, setShowConceptModal] = useState(false);
  const [conceptName, setConceptName] = useState('');
  const [conceptDescription, setConceptDescription] = useState('');
  const [reviewModal, setReviewModal] = useState<LearningReview | null>(null);
  const [reviewResponse, setReviewResponse] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importSubject, setImportSubject] = useState('');

  const selectedDocs = useMemo(() => docs.filter((doc) => selectedIds.has(doc.doc_id)), [docs, selectedIds]);
  const readyDocs = docs.filter((doc) => doc.status === 'ready');

  const load = useCallback(async () => {
    try {
      const [enabled, ids, docsData, conceptData, reviewData, commandData, suggestionData] = await Promise.all([
        getHsModeEnabled().catch(() => false),
        getSelectedDocIds().catch(() => []),
        getDocuments().catch(() => null),
        getConceptWeb(user.username).catch(() => ({ nodes: [], connections: [] })),
        getLearningReviews(user.username).catch(() => ({ reviews: [] })),
        getSearchHubCommands().catch(() => ({ commands: [] })),
        getSearchHubSuggestions(user.username, '').catch(() => ({ suggestions: [] })),
      ]);
      setHsMode(enabled);
      setSelectedIds(new Set(ids));
      setDocs(docsData?.user_docs ?? []);
      setConcepts(conceptData.nodes ?? []);
      setConceptConnections(conceptData.connections?.length ?? 0);
      setReviews(reviewData.reviews ?? []);
      setCommands(commandData.commands ?? []);
      setSuggestions(suggestionData.suggestions ?? []);
    } catch (error) {
      Alert.alert('Knowledge Hub', error instanceof Error ? error.message : 'Failed to load hub data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.username]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const seed = selectedDocs.map(docTopic).filter(Boolean).slice(0, 4);
    if (!seed.length) {
      setRelatedTopics([]);
      return;
    }
    getRelatedTopics({ topics: seed, useHs: hsMode, maxRelated: 6 })
      .then((data) => setRelatedTopics(data.topics ?? []))
      .catch(() => setRelatedTopics([]));
  }, [selectedDocs, hsMode]);

  const toggleDoc = async (docId: string) => {
    const next = new Set(selectedIds);
    if (next.has(docId)) next.delete(docId);
    else next.add(docId);
    setSelectedIds(next);
    await setSelectedDocIds(Array.from(next));
  };

  const toggleHs = async () => {
    const next = !hsMode;
    setHsMode(next);
    await setHsModeEnabled(next);
  };

  const pickDocuments = async () => {
    setActionBusy('upload-docs');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/plain', 'text/markdown'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) {
        return;
      }
      const assets = result.assets || [];
      if (!assets.length) return;
      for (const asset of assets) {
        await uploadContextDocument({
          uri: asset.uri,
          name: asset.name || 'mobile-upload',
          mimeType: asset.mimeType,
        }, {
          subject: importSubject.trim(),
          sourceName: 'Mobile upload',
        });
      }
      Alert.alert('Sources imported', `${assets.length} document${assets.length === 1 ? '' : 's'} added to Knowledge Hub.`);
      await load();
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Could not upload document');
    } finally {
      setActionBusy(null);
    }
  };

  const importUrlSource = async () => {
    const url = importUrl.trim();
    if (!url) {
      Alert.alert('Enter a URL');
      return;
    }
    setActionBusy('import-url');
    try {
      await importContextUrl({
        url,
        subject: importSubject.trim(),
        sourceName: 'Mobile URL import',
      });
      setImportUrl('');
      setImportSubject('');
      setShowImportModal(false);
      Alert.alert('Source imported', 'The URL is now available in Knowledge Hub.');
      await load();
    } catch (error) {
      Alert.alert('Import failed', error instanceof Error ? error.message : 'Could not import this URL');
    } finally {
      setActionBusy(null);
    }
  };

  const removeDoc = (doc: ContextDocument) => {
    Alert.alert('Delete source?', doc.filename, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setActionBusy(`delete-${doc.doc_id}`);
          try {
            await deleteDocument(doc.doc_id);
            setDocs((current) => current.filter((item) => item.doc_id !== doc.doc_id));
            const next = new Set(selectedIds);
            next.delete(doc.doc_id);
            setSelectedIds(next);
            await setSelectedDocIds(Array.from(next));
          } catch (error) {
            Alert.alert('Delete failed', error instanceof Error ? error.message : 'Could not delete source');
          } finally {
            setActionBusy(null);
          }
        },
      },
    ]);
  };

  const requireSelectedDocs = () => {
    if (!selectedIds.size) {
      Alert.alert('Select sources first', 'Pick one or more documents from the Vault tab.');
      return null;
    }
    return Array.from(selectedIds);
  };

  const runDocAction = async (kind: 'note' | 'map' | 'questions') => {
    const docIds = requireSelectedDocs();
    if (!docIds) return;
    setActionBusy(kind);
    try {
      if (kind === 'note') {
        const result = await createNoteFromContextDocs({ userId: user.username, contextDocIds: docIds, title: 'Knowledge Hub Notes', depth: 'deep' });
        Alert.alert('Note created', result.title || 'Created notes from selected sources.');
        onNavigate?.('notes');
      } else if (kind === 'map') {
        await createKnowledgeRoadmapFromDocs(user.username, docIds);
        Alert.alert('Knowledge map created', 'Created a map from selected sources.');
        onNavigate?.('knowledgeMaps');
      } else {
        const topic = selectedDocs.map(docTopic).filter(Boolean)[0] || 'selected sources';
        await generatePracticeQuestions({
          userId: user.username,
          topic,
          title: `Practice: ${topic}`,
          questionCount: 10,
          contextDocIds: docIds,
          useHsContext: hsMode,
        });
        Alert.alert('Questions created', 'Created a question set from selected sources.');
        onNavigate?.('questionBank');
      }
    } catch (error) {
      Alert.alert('Action failed', error instanceof Error ? error.message : 'Could not complete action');
    } finally {
      setActionBusy(null);
    }
  };

  const ask = async (mode: 'answer' | 'search' = 'answer') => {
    const query = askQuery.trim();
    if (query.length < 2) {
      Alert.alert('Enter a question or search query');
      return;
    }
    setAsking(true);
    setAskResult(null);
    setSearchResults([]);
    try {
      const docIds = selectedIds.size ? Array.from(selectedIds) : undefined;
      if (mode === 'search') {
        const data = await searchContext({ query, useHs: hsMode, docIds, topK: 8 });
        setSearchResults(data.results ?? []);
      } else {
        const data = await askKnowledgeBase({ question: query, useHs: hsMode, docIds, topK: 6 });
        setAskResult(data);
      }
    } catch (error) {
      Alert.alert('Knowledge search failed', error instanceof Error ? error.message : 'Try again');
    } finally {
      setAsking(false);
    }
  };

  const runCommand = async (command = commandText) => {
    const query = command.trim();
    if (!query) {
      Alert.alert('Enter a command');
      return;
    }
    setRunningCommand(true);
    setCommandResult(null);
    try {
      const result = await runSearchHubCommand({
        userId: user.username,
        query,
        sessionId: 'mobile-knowledge-hub',
        useHsContext: hsMode,
        context: { selected_doc_ids: Array.from(selectedIds) },
      });
      setCommandResult(result);
      const action = result?.metadata?.action;
      if (action === 'create_note') onNavigate?.('notes');
      if (action === 'create_flashcards') onNavigate?.('flashcards');
      if (action === 'create_questions' || action === 'create_quiz') onNavigate?.('questionBank');
      if (action === 'create_learning_path') onNavigate?.('learningPaths');
      if (action === 'create_knowledge_map') onNavigate?.('knowledgeMaps');
    } catch (error) {
      Alert.alert('Command failed', error instanceof Error ? error.message : 'Could not run command');
    } finally {
      setRunningCommand(false);
    }
  };

  const refreshConcepts = async (generate = false) => {
    setActionBusy(generate ? 'concept-generate' : 'concept-refresh');
    try {
      if (generate) await generateConceptWeb(user.username);
      const data = await getConceptWeb(user.username);
      setConcepts(data.nodes ?? []);
      setConceptConnections(data.connections?.length ?? 0);
    } catch (error) {
      Alert.alert('Concept web', error instanceof Error ? error.message : 'Could not refresh concepts');
    } finally {
      setActionBusy(null);
    }
  };

  const saveConcept = async () => {
    if (!conceptName.trim()) {
      Alert.alert('Enter a concept');
      return;
    }
    setActionBusy('concept-add');
    try {
      await addConceptNode({ userId: user.username, conceptName: conceptName.trim(), description: conceptDescription.trim() });
      setConceptName('');
      setConceptDescription('');
      setShowConceptModal(false);
      await refreshConcepts(false);
    } catch (error) {
      Alert.alert('Add concept failed', error instanceof Error ? error.message : 'Could not add concept');
      setActionBusy(null);
    }
  };

  const conceptAsset = async (concept: ConceptNode, asset: 'notes' | 'flashcards' | 'quiz') => {
    setActionBusy(`${asset}-${concept.id}`);
    try {
      await generateConceptAsset(user.username, concept.id, asset);
      Alert.alert('Generated', `${asset} created for ${concept.concept_name}.`);
      if (asset === 'notes') onNavigate?.('notes');
      if (asset === 'flashcards') onNavigate?.('flashcards');
      if (asset === 'quiz') onNavigate?.('questionBank');
      await refreshConcepts(false);
    } catch (error) {
      Alert.alert('Generation failed', error instanceof Error ? error.message : `Could not generate ${asset}`);
    } finally {
      setActionBusy(null);
    }
  };

  const submitReview = async () => {
    if (!reviewModal || !reviewResponse.trim()) {
      Alert.alert('Write your recall response first');
      return;
    }
    setReviewSubmitting(true);
    try {
      const result = await submitLearningReviewResponse(reviewModal.id, reviewResponse.trim());
      Alert.alert('Review scored', `${Math.round(result.score || 0)}% · ${result.feedback || 'Submitted'}`);
      setReviewModal(null);
      setReviewResponse('');
      const data = await getLearningReviews(user.username);
      setReviews(data.reviews ?? []);
    } catch (error) {
      Alert.alert('Review failed', error instanceof Error ? error.message : 'Could not submit review');
    } finally {
      setReviewSubmitting(false);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <AmbientBubbles theme={selectedTheme} variant="paths" opacity={0.7} />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={selectedTheme.accent} />}
      >
        <View style={s.topBar}>
          <HapticTouchable style={s.iconBtn} onPress={onBack} haptic="light">
            <Ionicons name="chevron-back" size={18} color={selectedTheme.accent} />
          </HapticTouchable>
          <HapticTouchable style={[s.hsToggle, hsMode && s.hsToggleActive]} onPress={toggleHs} haptic="selection">
            <Ionicons name={hsMode ? 'sparkles' : 'book-outline'} size={14} color={hsMode ? selectedTheme.bgPrimary : selectedTheme.textPrimary} />
            <Text style={[s.hsToggleText, hsMode && s.hsToggleTextActive]}>{hsMode ? 'HS mode' : 'context'}</Text>
          </HapticTouchable>
        </View>

        <View style={s.hero}>
          <NeumorphicLayer grainOpacity={0.26} />
          <Text style={s.heroGhost}>01</Text>
          <Text style={s.heroTitle}>knowledge hub</Text>
          <Text style={s.heroCopy}>{readyDocs.length} ready sources · {concepts.length} concepts · {reviews.length} reviews</Text>
          <View style={s.heroMetrics}>
            <Metric label="selected" value={String(selectedIds.size)} styles={s} />
            <Metric label="links" value={String(conceptConnections)} styles={s} />
            <Metric label="reviews" value={String(reviews.filter((r) => r.status !== 'completed').length)} styles={s} />
          </View>
        </View>

        <View style={s.tabStrip}>
          {TABS.map((item) => {
            const active = tab === item.key;
            return (
              <HapticTouchable key={item.key} style={[s.tab, active && s.tabActive]} onPress={() => setTab(item.key)} haptic="selection">
                <Ionicons name={item.icon} size={15} color={active ? selectedTheme.bgPrimary : selectedTheme.textSecondary} />
                <Text style={[s.tabText, active && s.tabTextActive]}>{item.label}</Text>
              </HapticTouchable>
            );
          })}
        </View>

        {loading ? <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 46 }} /> : null}
        {!loading && tab === 'vault' ? renderVault() : null}
        {!loading && tab === 'ask' ? renderAsk() : null}
        {!loading && tab === 'concepts' ? renderConcepts() : null}
        {!loading && tab === 'reviews' ? renderReviews() : null}
        {!loading && tab === 'commands' ? renderCommands() : null}
      </ScrollView>

      <Modal visible={showConceptModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowConceptModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>add concept</Text>
            <HapticTouchable onPress={() => setShowConceptModal(false)}><Ionicons name="close" size={22} color={selectedTheme.accent} /></HapticTouchable>
          </View>
          <View style={s.modalBody}>
            <Text style={s.label}>concept</Text>
            <TextInput value={conceptName} onChangeText={setConceptName} placeholder="e.g. Neural Networks" placeholderTextColor={selectedTheme.textSecondary} style={s.input} autoFocus />
            <Text style={s.label}>description</Text>
            <TextInput value={conceptDescription} onChangeText={setConceptDescription} placeholder="optional context" placeholderTextColor={selectedTheme.textSecondary} style={[s.input, s.textArea]} multiline />
            <HapticTouchable style={s.primaryBtn} onPress={saveConcept} disabled={actionBusy === 'concept-add'}>
              {actionBusy === 'concept-add' ? <ActivityIndicator color={selectedTheme.bgPrimary} /> : <Text style={s.primaryText}>save concept</Text>}
            </HapticTouchable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!reviewModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setReviewModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>recall review</Text>
            <HapticTouchable onPress={() => setReviewModal(null)}><Ionicons name="close" size={22} color={selectedTheme.accent} /></HapticTouchable>
          </View>
          <View style={s.modalBody}>
            <Text style={s.reviewPrompt}>{reviewModal?.title}</Text>
            <TextInput
              value={reviewResponse}
              onChangeText={setReviewResponse}
              placeholder="write everything you remember from this material..."
              placeholderTextColor={selectedTheme.textSecondary}
              style={[s.input, s.reviewInput]}
              multiline
              autoFocus
            />
            <HapticTouchable style={s.primaryBtn} onPress={submitReview} disabled={reviewSubmitting}>
              {reviewSubmitting ? <ActivityIndicator color={selectedTheme.bgPrimary} /> : <Text style={s.primaryText}>submit recall</Text>}
            </HapticTouchable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showImportModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowImportModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>import source</Text>
            <HapticTouchable onPress={() => setShowImportModal(false)}><Ionicons name="close" size={22} color={selectedTheme.accent} /></HapticTouchable>
          </View>
          <View style={s.modalBody}>
            <Text style={s.label}>URL</Text>
            <TextInput value={importUrl} onChangeText={setImportUrl} placeholder="https://example.com/file.pdf" placeholderTextColor={selectedTheme.textSecondary} style={s.input} autoCapitalize="none" keyboardType="url" autoFocus />
            <Text style={s.label}>subject</Text>
            <TextInput value={importSubject} onChangeText={setImportSubject} placeholder="optional label" placeholderTextColor={selectedTheme.textSecondary} style={s.input} />
            <HapticTouchable style={s.primaryBtn} onPress={importUrlSource} disabled={actionBusy === 'import-url'}>
              {actionBusy === 'import-url' ? <ActivityIndicator color={selectedTheme.bgPrimary} /> : <Text style={s.primaryText}>import URL</Text>}
            </HapticTouchable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );

  function renderVault() {
    return (
      <View style={s.sectionStack}>
        <View style={s.actionPanel}>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>selected sources</Text>
            <Text style={s.sectionHint}>{selectedIds.size ? `${selectedIds.size} documents selected` : 'select documents to create notes, maps, and questions'}</Text>
          </View>
          <View style={s.actionRow}>
            <ActionIcon icon="cloud-upload-outline" label="upload" onPress={pickDocuments} busy={actionBusy === 'upload-docs'} styles={s} />
            <ActionIcon icon="link-outline" label="url" onPress={() => setShowImportModal(true)} styles={s} />
            <ActionIcon icon="document-text-outline" label="note" onPress={() => runDocAction('note')} busy={actionBusy === 'note'} styles={s} />
            <ActionIcon icon="git-network-outline" label="map" onPress={() => runDocAction('map')} busy={actionBusy === 'map'} styles={s} />
            <ActionIcon icon="help-circle-outline" label="quiz" onPress={() => runDocAction('questions')} busy={actionBusy === 'questions'} styles={s} />
          </View>
        </View>

        {relatedTopics.length ? (
          <View style={s.relatedBox}>
            <Text style={s.sectionTitle}>related topics</Text>
            <View style={s.chipWrap}>
              {relatedTopics.map((topic) => (
                <HapticTouchable key={topic} style={s.chip} onPress={() => { setAskQuery(topic); setTab('ask'); }} haptic="selection">
                  <Text style={s.chipText}>{topic}</Text>
                </HapticTouchable>
              ))}
            </View>
          </View>
        ) : null}

        {docs.length === 0 ? (
          <Empty icon="file-tray-outline" title="no sources yet" text="upload PDFs, text, or markdown here, or import a direct source URL" styles={s} />
        ) : (
          <View style={s.cardList}>
            {docs.map((doc) => {
              const active = selectedIds.has(doc.doc_id);
              return (
                <View key={doc.doc_id} style={[s.docCard, active && s.docCardActive]}>
                  <HapticTouchable style={s.docMain} onPress={() => toggleDoc(doc.doc_id)} haptic="selection">
                    <View style={[s.check, active && s.checkActive]}>
                      {active ? <Ionicons name="checkmark" size={13} color={selectedTheme.bgPrimary} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.docTitle} numberOfLines={1}>{doc.filename}</Text>
                      <Text style={s.docMeta}>{docTopic(doc)} · {doc.chunk_count} chunks · {doc.status}</Text>
                    </View>
                  </HapticTouchable>
                  <HapticTouchable style={s.deleteBtn} onPress={() => removeDoc(doc)} haptic="warning">
                    {actionBusy === `delete-${doc.doc_id}` ? <ActivityIndicator color={selectedTheme.danger} size="small" /> : <Ionicons name="trash-outline" size={15} color={selectedTheme.danger} />}
                  </HapticTouchable>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  }

  function renderAsk() {
    return (
      <View style={s.sectionStack}>
        <View style={s.composer}>
          <TextInput
            value={askQuery}
            onChangeText={setAskQuery}
            placeholder={selectedIds.size ? 'ask selected sources...' : 'search or ask your knowledge base...'}
            placeholderTextColor={selectedTheme.textSecondary}
            style={s.composerInput}
            multiline
          />
          <View style={s.composerActions}>
            <HapticTouchable style={s.secondaryBtn} onPress={() => ask('search')} disabled={asking}>
              <Text style={s.secondaryText}>search</Text>
            </HapticTouchable>
            <HapticTouchable style={s.primarySmallBtn} onPress={() => ask('answer')} disabled={asking}>
              {asking ? <ActivityIndicator color={selectedTheme.bgPrimary} size="small" /> : <Text style={s.primaryText}>ask</Text>}
            </HapticTouchable>
          </View>
        </View>

        {askResult ? (
          <View style={s.answerCard}>
            <Text style={s.sectionTitle}>answer</Text>
            <MathText style={s.answerText}>{askResult.answer}</MathText>
            {askResult.sources?.length ? (
              <View style={s.sourceList}>
                {askResult.sources.slice(0, 4).map((source, index) => (
                  <View key={`${source.doc_id}-${index}`} style={s.sourceRow}>
                    <Text style={s.sourceTitle} numberOfLines={1}>{source.filename || 'source'}</Text>
                    <Text style={s.sourceMeta}>{source.source || 'private'}{source.page ? ` · p.${source.page}` : ''}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {searchResults.length ? (
          <View style={s.cardList}>
            {searchResults.map((result, index) => {
              const meta = result.metadata || {};
              return (
                <View key={`${meta.doc_id || index}-${index}`} style={s.resultCard}>
                  <Text style={s.resultTitle}>{meta.filename || meta.subject || result.source || 'result'}</Text>
                  <Text style={s.resultText}>{truncate(result.text)}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {!askResult && !searchResults.length ? (
          <View style={s.suggestionPanel}>
            <Text style={s.sectionTitle}>try this</Text>
            <View style={s.chipWrap}>
              {['summarize selected sources', 'find weak concepts', 'what should I review next?', ...suggestions.slice(0, 4)].map((item) => (
                <HapticTouchable key={item} style={s.chip} onPress={() => setAskQuery(item)} haptic="selection">
                  <Text style={s.chipText}>{item}</Text>
                </HapticTouchable>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  function renderConcepts() {
    return (
      <View style={s.sectionStack}>
        <View style={s.actionPanel}>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>concept web</Text>
            <Text style={s.sectionHint}>{concepts.length} concepts · {conceptConnections} relationships</Text>
          </View>
          <View style={s.actionRow}>
            <ActionIcon icon="refresh-outline" label="build" onPress={() => refreshConcepts(true)} busy={actionBusy === 'concept-generate'} styles={s} />
            <ActionIcon icon="add" label="add" onPress={() => setShowConceptModal(true)} styles={s} />
          </View>
        </View>

        {concepts.length === 0 ? (
          <Empty icon="git-network-outline" title="no concept web" text="generate it from your notes, chats, flashcards, and question sets" styles={s} />
        ) : (
          <View style={s.cardList}>
            {concepts.slice(0, 40).map((concept) => (
              <View key={concept.id} style={s.conceptCard}>
                <View style={s.conceptTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.conceptTitle}>{concept.concept_name}</Text>
                    <Text style={s.conceptMeta}>{concept.category || 'General'} · mastery {Math.round((concept.mastery_level || 0) * 100)}%</Text>
                  </View>
                  <View style={s.masteryDot}><Text style={s.masteryText}>{Math.round((concept.importance_score || 0.5) * 100)}</Text></View>
                </View>
                {!!concept.description && <Text style={s.conceptDescription} numberOfLines={2}>{concept.description}</Text>}
                <View style={s.conceptActions}>
                  <MiniAction label="notes" onPress={() => conceptAsset(concept, 'notes')} busy={actionBusy === `notes-${concept.id}`} styles={s} />
                  <MiniAction label="cards" onPress={() => conceptAsset(concept, 'flashcards')} busy={actionBusy === `flashcards-${concept.id}`} styles={s} />
                  <MiniAction label="quiz" onPress={() => conceptAsset(concept, 'quiz')} busy={actionBusy === `quiz-${concept.id}`} styles={s} />
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  function renderReviews() {
    return (
      <View style={s.sectionStack}>
        {reviews.length === 0 ? (
          <Empty icon="reader-outline" title="no learning reviews" text="reviews appear when you create recall checks from chats or slide sources" styles={s} />
        ) : (
          <View style={s.cardList}>
            {reviews.map((review) => (
              <HapticTouchable key={review.id} style={s.reviewCard} onPress={() => setReviewModal(review)} haptic="selection" activeOpacity={0.84}>
                <View style={{ flex: 1 }}>
                  <Text style={s.reviewTitle}>{review.title}</Text>
                  <Text style={s.reviewMeta}>{review.total_points || 0} points · best {Math.round(review.best_score || 0)}% · {review.status || 'active'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={selectedTheme.accent} />
              </HapticTouchable>
            ))}
          </View>
        )}
      </View>
    );
  }

  function renderCommands() {
    return (
      <View style={s.sectionStack}>
        <View style={s.composer}>
          <TextInput
            value={commandText}
            onChangeText={setCommandText}
            placeholder="/map biology, /notes calculus, /quiz history..."
            placeholderTextColor={selectedTheme.textSecondary}
            style={s.commandInput}
            autoCapitalize="none"
          />
          <HapticTouchable style={s.primaryBtn} onPress={() => runCommand()} disabled={runningCommand}>
            {runningCommand ? <ActivityIndicator color={selectedTheme.bgPrimary} /> : <Text style={s.primaryText}>run command</Text>}
          </HapticTouchable>
        </View>

        {commandResult ? (
          <View style={s.answerCard}>
            <Text style={s.sectionTitle}>{commandResult.metadata?.action || 'result'}</Text>
            <MathText style={s.answerText}>{commandResult.ai_response || commandResult.metadata?.chatbot_message || commandResult.content_title || 'Command completed.'}</MathText>
            {Array.isArray(commandResult.search_results) && commandResult.search_results.length ? (
              <Text style={s.sectionHint}>{commandResult.search_results.length} search results</Text>
            ) : null}
          </View>
        ) : null}

        <View style={s.cardList}>
          {commands.map((cmd) => (
            <HapticTouchable key={cmd.command} style={s.commandCard} onPress={() => { setCommandText(cmd.command.replace('<topic>', '').trim()); }} haptic="selection">
              <Text style={s.commandName}>{cmd.command}</Text>
              <Text style={s.commandDescription}>{cmd.description}</Text>
            </HapticTouchable>
          ))}
        </View>
      </View>
    );
  }
}

function Metric({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
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

function MiniAction({ label, onPress, busy, styles }: { label: string; onPress: () => void; busy?: boolean; styles: ReturnType<typeof createStyles> }) {
  return (
    <HapticTouchable style={styles.miniAction} onPress={onPress} disabled={busy} haptic="medium">
      {busy ? <ActivityIndicator color={styles.miniActionText.color} size="small" /> : <Text style={styles.miniActionText}>{label}</Text>}
    </HapticTouchable>
  );
}

function Empty({ icon, title, text, styles }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; text: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={styles.emptyIcon.color} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>, topInset: number) {
  const surface = theme.panel;
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.16 : 0.18);
  const accentInk = theme.isLight ? darkenColor(theme.accent, 38) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    // 75% less than the original 18px — matches the home page, applies to
    // every card on this page (hero and everything below it).
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: Math.round(18 * 0.25), paddingTop: Math.max(topInset + 12, 52), paddingBottom: 118, gap: 4 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    iconBtn: { width: 40, height: 40, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), alignItems: 'center', justifyContent: 'center', boxShadow: cbTileShadow(0.06) },
    hsToggle: { height: 40, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 4, boxShadow: cbTileShadow(0.055) },
    hsToggleActive: { backgroundColor: theme.accentHover, borderColor: theme.accentHover },
    hsToggleText: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 11, textTransform: 'lowercase' },
    hsToggleTextActive: { color: theme.bgPrimary },
    hero: { borderRadius: 30, padding: 20, overflow: 'hidden', boxShadow: cbModalShadow(0.14) } as ViewStyle,
    heroGhost: { position: 'absolute', right: 15, top: 0, fontFamily: 'Inter_900Black', fontSize: layout.isTablet ? 92 : 76, lineHeight: layout.isTablet ? 98 : 82, color: rgbaFromHex(theme.textPrimary, theme.isLight ? 0.035 : 0.055), letterSpacing: -4 },
    eyebrow: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase' },
    heroTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 36, letterSpacing: 0, marginTop: 8 },
    heroCopy: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13, marginTop: 4 },
    heroMetrics: { flexDirection: 'row', gap: 4, marginTop: 16 },
    metric: { flex: 1, borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.12), borderRadius: 16, padding: 10, backgroundColor: rgbaFromHex(theme.panelAlt, 0.74) },
    metricValue: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 20, letterSpacing: 0 },
    metricLabel: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.1, marginTop: 2 },
    tabStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    tab: { flexGrow: 1, minWidth: layout.width >= 760 ? 110 : 94, height: 42, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, boxShadow: cbTileShadow(0.045) },
    tabActive: { backgroundColor: theme.accentHover, borderColor: theme.accentHover },
    tabText: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 11, textTransform: 'lowercase' },
    tabTextActive: { color: theme.bgPrimary },
    sectionStack: { gap: 4 },
    actionPanel: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 15, flexDirection: layout.twoColumn ? 'row' : 'column', gap: 4, alignItems: layout.twoColumn ? 'center' : 'stretch', boxShadow: cbTileShadow(0.08) } as ViewStyle,
    sectionTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 17, letterSpacing: 0 },
    sectionHint: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 18 },
    actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    actionIcon: { minWidth: 62, borderRadius: 16, borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.14), backgroundColor: rgbaFromHex(theme.accent, 0.1), paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center', gap: 4 },
    actionIconText: { color: theme.accentHover },
    actionIconLabel: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 },
    relatedBox: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 15, gap: 4, boxShadow: cbTileShadow(0.07) } as ViewStyle,
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    chip: { borderRadius: 999, borderWidth: 1, borderColor: theme.border, backgroundColor: rgbaFromHex(theme.panelAlt, 0.82), paddingHorizontal: 12, paddingVertical: 9 },
    chipText: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 12 },
    cardList: { gap: 4 },
    docCard: { borderRadius: 20, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 12, flexDirection: 'row', alignItems: 'center', gap: 4, boxShadow: cbTileShadow(0.055) } as ViewStyle,
    docCardActive: { borderColor: theme.accent, backgroundColor: rgbaFromHex(theme.accent, 0.09) },
    docMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
    check: { width: 24, height: 24, borderRadius: 8, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    checkActive: { backgroundColor: theme.accentHover, borderColor: theme.accentHover },
    docTitle: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 14 },
    docMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, marginTop: 3 },
    deleteBtn: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    composer: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 14, gap: 4, boxShadow: cbTileShadow(0.08) } as ViewStyle,
    composerInput: { minHeight: 96, color: theme.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 15, textAlignVertical: 'top' },
    composerActions: { flexDirection: 'row', gap: 4 },
    secondaryBtn: { flex: 1, height: 45, borderRadius: 13, borderWidth: 1, borderColor: border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { fontFamily: 'Inter_900Black', color: theme.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
    primarySmallBtn: { flex: 1, height: 45, borderRadius: 13, backgroundColor: theme.accentHover, alignItems: 'center', justifyContent: 'center' },
    primaryBtn: { height: 50, borderRadius: 14, backgroundColor: theme.accentHover, alignItems: 'center', justifyContent: 'center' },
    primaryText: { fontFamily: 'Inter_900Black', color: accentInk, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
    answerCard: { borderRadius: 22, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 16, gap: 4, boxShadow: cbTileShadow(0.07) } as ViewStyle,
    answerText: { fontFamily: 'Inter_400Regular', color: theme.textPrimary, fontSize: 14, lineHeight: 22 },
    sourceList: { gap: 4, marginTop: 4 },
    sourceRow: { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 },
    sourceTitle: { fontFamily: 'Inter_700Bold', color: theme.accentHover, fontSize: 12 },
    sourceMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10, marginTop: 2 },
    resultCard: { borderRadius: 18, borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.12), backgroundColor: rgbaFromHex(surface, 0.72), padding: 14, gap: 4, boxShadow: cbTileShadow(0.045) } as ViewStyle,
    resultTitle: { fontFamily: 'Inter_700Bold', color: theme.accentHover, fontSize: 13 },
    resultText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, lineHeight: 18 },
    suggestionPanel: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 15, gap: 4, boxShadow: cbTileShadow(0.07) } as ViewStyle,
    conceptCard: { borderRadius: 22, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 15, gap: 4, boxShadow: cbTileShadow(0.07) } as ViewStyle,
    conceptTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    conceptTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 16, letterSpacing: 0 },
    conceptMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, marginTop: 3 },
    masteryDot: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(theme.accent, 0.1) },
    masteryText: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 12 },
    conceptDescription: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, lineHeight: 18 },
    conceptActions: { flexDirection: 'row', gap: 4 },
    miniAction: { flex: 1, height: 38, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: rgbaFromHex(theme.panelAlt, 0.78), alignItems: 'center', justifyContent: 'center' },
    miniActionText: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
    reviewCard: { borderRadius: 20, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 15, flexDirection: 'row', alignItems: 'center', gap: 4, boxShadow: cbTileShadow(0.055) } as ViewStyle,
    reviewTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 16, letterSpacing: 0 },
    reviewMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, marginTop: 4 },
    commandInput: { minHeight: 46, color: theme.textPrimary, fontFamily: 'Inter_700Bold', fontSize: 15 },
    commandCard: { borderRadius: 18, borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.12), backgroundColor: rgbaFromHex(surface, 0.72), padding: 14, boxShadow: cbTileShadow(0.045) } as ViewStyle,
    commandName: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 14 },
    commandDescription: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, marginTop: 4 },
    empty: { alignItems: 'center', paddingVertical: 48, gap: 4 },
    emptyIcon: { color: theme.accent },
    emptyTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 22 },
    emptyText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13, textAlign: 'center', maxWidth: 320, lineHeight: 19 },
    modalRoot: { flex: 1, backgroundColor: theme.bgPrimary },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 12 },
    modalTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 25 },
    modalBody: { padding: 20, gap: 4 },
    label: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase' },
    input: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: border, paddingHorizontal: 14, color: theme.textPrimary, backgroundColor: rgbaFromHex(surface, 0.92), fontFamily: 'Inter_600SemiBold' },
    textArea: { minHeight: 110, paddingTop: 13, textAlignVertical: 'top' },
    reviewPrompt: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 17, lineHeight: 23 },
    reviewInput: { minHeight: 190, paddingTop: 13, textAlignVertical: 'top' },
  });
}
