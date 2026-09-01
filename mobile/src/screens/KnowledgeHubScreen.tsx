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
  Switch,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import {
  createKnowledgeRoadmapFromDocs,
  createNoteFromContextDocs,
  generatePracticeQuestions,
  getSearchHubSuggestions,
} from '../services/api';
import {
  addToDeck,
  askKnowledgeBase,
  ContextDocument,
  DECK_LIMIT,
  deleteDocument,
  getDeck,
  getDocuments,
  getHsModeEnabled,
  getRelatedTopics,
  importContextUrl,
  removeFromDeck,
  searchContext,
  setHsModeEnabled,
  uploadContextDocument,
} from '../services/contextService';
import AmbientBubbles from '../components/AmbientBubbles';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import { NeumorphicLayer, cbTileShadow, cbModalShadow, cbTileBorder } from '../components/NeumorphicTexture';
import SectionSidebar, { SidebarItem } from '../components/SectionSidebar';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import MathText from '../components/MathText';

type HubTab = 'library' | 'deck' | 'ask';
type AppTarget = 'flashcards' | 'notes' | 'aimedia' | 'settings' | 'questionBank' | 'knowledgeMaps' | 'slideExplorer' | 'canvasHub' | 'xpAnalytics' | 'weaknessPractice' | 'learningPaths';
type Props = { user: AuthUser; onBack: () => void; onNavigate?: (screen: AppTarget) => void; initialTab?: HubTab };

const HUB_SIDEBAR_ITEMS: SidebarItem[] = [
  { key: 'library', label: 'Library' },
  { key: 'deck', label: 'Deck' },
  { key: 'ask', label: 'Ask' },
  { key: 'upload', label: 'Upload Source' },
];

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
  { key: 'library', label: 'library', icon: 'file-tray-stacked-outline' },
  { key: 'deck', label: 'deck', icon: 'layers-outline' },
  { key: 'ask', label: 'ask', icon: 'search-outline' },
];

function truncate(value: string, max = 220) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max).trim()}...` : clean;
}

function docTopic(doc: ContextDocument) {
  return doc.subject || doc.grade_level || doc.scope || 'general';
}

export default function KnowledgeHubScreen({ user, onBack, onNavigate, initialTab }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });

  const [tab, setTab] = useState<HubTab>(initialTab || 'library');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [docs, setDocs] = useState<ContextDocument[]>([]);
  const [deck, setDeck] = useState<ContextDocument[]>([]);
  const [hsMode, setHsMode] = useState(false);
  const [relatedTopics, setRelatedTopics] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const [askQuery, setAskQuery] = useState('');
  const [askResult, setAskResult] = useState<AskResult>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [asking, setAsking] = useState(false);

  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [deckBusyId, setDeckBusyId] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importSubject, setImportSubject] = useState('');

  const deckIds = useMemo(() => deck.map((doc) => doc.doc_id), [deck]);
  const readyDocs = docs.filter((doc) => doc.status === 'ready');
  const deckFull = deck.length >= DECK_LIMIT;

  const load = useCallback(async () => {
    try {
      const [enabled, docsData, deckData, suggestionData] = await Promise.all([
        getHsModeEnabled().catch(() => false),
        getDocuments().catch(() => null),
        getDeck().catch(() => ({ documents: [] })),
        getSearchHubSuggestions(user.username, '').catch(() => ({ suggestions: [] })),
      ]);
      setHsMode(enabled);
      setDocs(docsData?.user_docs ?? []);
      setDeck(deckData.documents ?? []);
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
    const seed = deck.map(docTopic).filter(Boolean).slice(0, 4);
    if (!seed.length) {
      setRelatedTopics([]);
      return;
    }
    getRelatedTopics({ topics: seed, useHs: hsMode, maxRelated: 6 })
      .then((data) => setRelatedTopics(data.topics ?? []))
      .catch(() => setRelatedTopics([]));
  }, [deck, hsMode]);

  const toggleDeckMembership = async (doc: ContextDocument) => {
    if (!doc.in_deck && deckFull) {
      Alert.alert('Deck is full', `Your deck already has ${DECK_LIMIT}/${DECK_LIMIT} documents — remove one first.`);
      return;
    }
    setDeckBusyId(doc.doc_id);
    try {
      if (doc.in_deck) {
        await removeFromDeck(doc.doc_id);
        setDocs((cur) => cur.map((d) => (d.doc_id === doc.doc_id ? { ...d, in_deck: false } : d)));
        setDeck((cur) => cur.filter((d) => d.doc_id !== doc.doc_id));
      } else {
        await addToDeck(doc.doc_id);
        setDocs((cur) => cur.map((d) => (d.doc_id === doc.doc_id ? { ...d, in_deck: true } : d)));
        setDeck((cur) => [{ ...doc, in_deck: true }, ...cur]);
      }
    } catch (error) {
      Alert.alert('Deck', error instanceof Error ? error.message : 'Could not update deck');
    } finally {
      setDeckBusyId(null);
    }
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
      Alert.alert('Sources imported', `${assets.length} document${assets.length === 1 ? '' : 's'} added to your Library.`);
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
      Alert.alert('Source imported', 'The URL is now available in your Library.');
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
            setDeck((current) => current.filter((item) => item.doc_id !== doc.doc_id));
          } catch (error) {
            Alert.alert('Delete failed', error instanceof Error ? error.message : 'Could not delete source');
          } finally {
            setActionBusy(null);
          }
        },
      },
    ]);
  };

  const requireDeckDocs = () => {
    if (!deck.length) {
      Alert.alert('Add sources to your deck first', 'Pick up to 8 documents from the Library tab.');
      return null;
    }
    return deckIds;
  };

  const runDocAction = async (kind: 'note' | 'map' | 'questions') => {
    const docIds = requireDeckDocs();
    if (!docIds) return;
    setActionBusy(kind);
    try {
      if (kind === 'note') {
        const result = await createNoteFromContextDocs({ userId: user.username, contextDocIds: docIds, title: 'Knowledge Hub Notes', depth: 'deep' });
        Alert.alert('Note created', result.title || 'Created notes from your deck.');
        onNavigate?.('notes');
      } else if (kind === 'map') {
        await createKnowledgeRoadmapFromDocs(user.username, docIds);
        Alert.alert('Knowledge map created', 'Created a map from your deck.');
        onNavigate?.('knowledgeMaps');
      } else {
        const topic = deck.map(docTopic).filter(Boolean)[0] || 'selected sources';
        await generatePracticeQuestions({
          userId: user.username,
          topic,
          title: `Practice: ${topic}`,
          questionCount: 10,
          contextDocIds: docIds,
          useHsContext: hsMode,
        });
        Alert.alert('Questions created', 'Created a question set from your deck.');
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
      const docIds = deckIds.length ? deckIds : undefined;
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

  if (!fontsLoaded) return null;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <AmbientBubbles theme={selectedTheme} variant="paths" opacity={0.7} />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={selectedTheme.accent} />}
      >
        <View style={s.topBar}>
          <HapticTouchable onPress={onBack} haptic="selection">
            <Ionicons name="chevron-back" size={22} color={selectedTheme.accentHover} />
          </HapticTouchable>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.title}>hub</Text>
            <Text style={s.subtitle}>{deck.length}/{DECK_LIMIT} in deck</Text>
          </View>
          <HapticTouchable onPress={() => setSidebarOpen(true)} haptic="selection" accessibilityLabel="Open menu">
            <Ionicons name="menu-outline" size={24} color={selectedTheme.accentHover} />
          </HapticTouchable>
        </View>

        <View style={s.hero}>
          <NeumorphicLayer grainOpacity={0.26} />
          <Text style={s.heroGhost}>01</Text>
          <Text style={s.heroCopy}>{readyDocs.length} ready sources · {deck.length}/{DECK_LIMIT} in deck</Text>
          <View style={s.heroMetrics}>
            <Metric label="in deck" value={String(deck.length)} styles={s} />
            <Metric label="sources" value={String(readyDocs.length)} styles={s} />
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
        {!loading && tab === 'library' ? renderLibrary() : null}
        {!loading && tab === 'deck' ? renderDeck() : null}
        {!loading && tab === 'ask' ? renderAsk() : null}
      </ScrollView>

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

      <SectionSidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pageTitle="hub"
        items={HUB_SIDEBAR_ITEMS}
        activeKey={tab}
        onSelect={(key) => {
          if (key === 'library' || key === 'deck' || key === 'ask') setTab(key);
          else if (key === 'upload') { setTab('library'); pickDocuments(); }
        }}
        footerLabel="Dashboard"
        onFooterPress={onBack}
      />
    </SafeAreaView>
  );

  function renderLibrary() {
    return (
      <View style={s.sectionStack}>
        <View style={s.actionPanel}>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>your library</Text>
            <Text style={s.sectionHint}>tap a source to add it to your deck ({deck.length}/{DECK_LIMIT})</Text>
          </View>
          <View style={s.actionRow}>
            <ActionIcon icon="cloud-upload-outline" label="upload" onPress={pickDocuments} busy={actionBusy === 'upload-docs'} styles={s} />
            <ActionIcon icon="link-outline" label="url" onPress={() => setShowImportModal(true)} styles={s} />
          </View>
        </View>

        {docs.length === 0 ? (
          <Empty icon="file-tray-outline" title="no sources yet" text="upload PDFs, text, or markdown here, or import a direct source URL" styles={s} />
        ) : (
          <View style={s.cardList}>
            {docs.map((doc) => {
              const active = doc.in_deck;
              const disabled = !active && deckFull;
              return (
                <View key={doc.doc_id} style={[s.docCard, active && s.docCardActive]}>
                  <HapticTouchable
                    style={[s.docMain, disabled && { opacity: 0.45 }]}
                    onPress={() => toggleDeckMembership(doc)}
                    disabled={disabled || deckBusyId === doc.doc_id}
                    haptic="selection"
                  >
                    <View style={[s.check, active && s.checkActive]}>
                      {deckBusyId === doc.doc_id ? (
                        <ActivityIndicator size="small" color={active ? selectedTheme.bgPrimary : selectedTheme.accentHover} />
                      ) : active ? (
                        <Ionicons name="checkmark" size={13} color={selectedTheme.bgPrimary} />
                      ) : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.docTitle} numberOfLines={1}>{doc.filename}</Text>
                      <Text style={s.docMeta}>{docTopic(doc)} · {doc.chunk_count} chunks · {doc.status}{disabled ? ' · deck full' : ''}</Text>
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

  function renderDeck() {
    return (
      <View style={s.sectionStack}>
        <View style={s.actionPanel}>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>your deck · {deck.length}/{DECK_LIMIT}</Text>
            <Text style={s.sectionHint}>documents here are used as AI context across chat, notes, and quizzes</Text>
          </View>
          <View style={s.actionRow}>
            <ActionIcon icon="document-text-outline" label="note" onPress={() => runDocAction('note')} busy={actionBusy === 'note'} styles={s} />
            <ActionIcon icon="git-network-outline" label="map" onPress={() => runDocAction('map')} busy={actionBusy === 'map'} styles={s} />
            <ActionIcon icon="help-circle-outline" label="quiz" onPress={() => runDocAction('questions')} busy={actionBusy === 'questions'} styles={s} />
          </View>
        </View>

        <View style={s.hsCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>HS curriculum mode</Text>
            <Text style={s.sectionHint}>also answer using shared curriculum textbooks</Text>
          </View>
          <Switch
            value={hsMode}
            onValueChange={toggleHs}
            trackColor={{ false: rgbaFromHex(selectedTheme.accent, 0.18), true: rgbaFromHex(selectedTheme.accent, 0.5) }}
            thumbColor={hsMode ? selectedTheme.accentHover : selectedTheme.textSecondary}
          />
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

        {deck.length === 0 ? (
          <Empty icon="layers-outline" title="deck is empty" text="add up to 8 documents from your Library to use them as AI context" styles={s} />
        ) : (
          <View style={s.cardList}>
            {deck.map((doc) => (
              <View key={doc.doc_id} style={s.docCard}>
                <View style={s.docMain}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.docTitle} numberOfLines={1}>{doc.filename}</Text>
                    <Text style={s.docMeta}>{docTopic(doc)} · {doc.chunk_count} chunks</Text>
                  </View>
                </View>
                <HapticTouchable style={s.deleteBtn} onPress={() => toggleDeckMembership(doc)} haptic="warning" disabled={deckBusyId === doc.doc_id}>
                  {deckBusyId === doc.doc_id ? <ActivityIndicator color={selectedTheme.danger} size="small" /> : <Ionicons name="close" size={16} color={selectedTheme.danger} />}
                </HapticTouchable>
              </View>
            ))}
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
            placeholder={deck.length ? 'ask your deck...' : 'search or ask your knowledge base...'}
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
                {askResult.sources.map((source, index) => (
                  <View key={`${source.doc_id}-${index}`} style={s.sourceRow}>
                    <Text style={s.sourceTitle} numberOfLines={1}>{source.filename || 'source'}</Text>
                    <Text style={s.sourceMeta}>{source.source || 'private'}{source.page ? ` · p.${source.page}` : ''}</Text>
                    {source.snippet ? <Text style={s.sourceSnippet} numberOfLines={3}>{source.snippet}</Text> : null}
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
              {['summarize my deck', 'find weak concepts', 'what should I review next?', ...suggestions.slice(0, 4)].map((item) => (
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

function Empty({ icon, title, text, styles }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; text: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={styles.emptyIcon.color} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const surface = theme.panel;
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.16 : 0.18);
  const accentInk = theme.isLight ? darkenColor(theme.accent, 38) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 10, paddingBottom: 118, gap: 14 },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingTop: 18, paddingBottom: 12 },
    title: { fontFamily: 'Inter_900Black', fontSize: 32, color: theme.accentHover, letterSpacing: -0.8 },
    subtitle: { fontFamily: 'Inter_400Regular', fontSize: 10, color: theme.textSecondary, letterSpacing: 2.2, marginTop: 4, textTransform: 'uppercase' },
    hero: { borderRadius: 30, padding: 20, overflow: 'hidden', boxShadow: cbModalShadow(0.14) } as ViewStyle,
    heroGhost: { position: 'absolute', right: 15, top: 0, fontFamily: 'Inter_900Black', fontSize: layout.isTablet ? 92 : 76, lineHeight: layout.isTablet ? 98 : 82, color: rgbaFromHex(theme.textPrimary, theme.isLight ? 0.035 : 0.055), letterSpacing: -4 },
    heroCopy: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13 },
    heroMetrics: { flexDirection: 'row', gap: 9, marginTop: 16 },
    metric: { flex: 1, borderRadius: 16, padding: 10, backgroundColor: rgbaFromHex(theme.panelAlt, 0.74), overflow: 'hidden', boxShadow: cbTileShadow(0.05), ...cbTileBorder(0.13) },
    metricValue: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 20, letterSpacing: 0 },
    metricLabel: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.1, marginTop: 2 },
    tabStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tab: { flexGrow: 1, minWidth: layout.width >= 760 ? 110 : 94, height: 42, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, boxShadow: cbTileShadow(0.045) },
    tabActive: { backgroundColor: theme.accentHover, borderColor: theme.accentHover },
    tabText: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 11, textTransform: 'lowercase' },
    tabTextActive: { color: theme.bgPrimary },
    sectionStack: { gap: 13 },
    actionPanel: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 15, flexDirection: layout.twoColumn ? 'row' : 'column', gap: 14, alignItems: layout.twoColumn ? 'center' : 'stretch', boxShadow: cbTileShadow(0.08) } as ViewStyle,
    hsCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 15, boxShadow: cbTileShadow(0.06) } as ViewStyle,
    sectionTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 17, letterSpacing: 0 },
    sectionHint: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 18 },
    actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    actionIcon: { minWidth: 62, borderRadius: 16, borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.14), backgroundColor: rgbaFromHex(theme.accent, 0.1), paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center', gap: 5 },
    actionIconText: { color: theme.accentHover },
    actionIconLabel: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 },
    relatedBox: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 15, gap: 12, boxShadow: cbTileShadow(0.07) } as ViewStyle,
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderRadius: 999, borderWidth: 1, borderColor: theme.border, backgroundColor: rgbaFromHex(theme.panelAlt, 0.82), paddingHorizontal: 12, paddingVertical: 9 },
    chipText: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 12 },
    cardList: { gap: 11 },
    docCard: { borderRadius: 20, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, boxShadow: cbTileShadow(0.055) } as ViewStyle,
    docCardActive: { borderColor: theme.accent, backgroundColor: rgbaFromHex(theme.accent, 0.09) },
    docMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    check: { width: 24, height: 24, borderRadius: 8, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    checkActive: { backgroundColor: theme.accentHover, borderColor: theme.accentHover },
    docTitle: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 14 },
    docMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, marginTop: 3 },
    deleteBtn: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    composer: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 14, gap: 12, boxShadow: cbTileShadow(0.08) } as ViewStyle,
    composerInput: { minHeight: 96, color: theme.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 15, textAlignVertical: 'top' },
    composerActions: { flexDirection: 'row', gap: 10 },
    secondaryBtn: { flex: 1, height: 45, borderRadius: 13, borderWidth: 1, borderColor: border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { fontFamily: 'Inter_900Black', color: theme.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
    primarySmallBtn: { flex: 1, height: 45, borderRadius: 13, backgroundColor: theme.accentHover, alignItems: 'center', justifyContent: 'center' },
    primaryBtn: { height: 50, borderRadius: 14, backgroundColor: theme.accentHover, alignItems: 'center', justifyContent: 'center' },
    primaryText: { fontFamily: 'Inter_900Black', color: accentInk, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
    answerCard: { borderRadius: 22, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 16, gap: 10, boxShadow: cbTileShadow(0.07) } as ViewStyle,
    answerText: { fontFamily: 'Inter_400Regular', color: theme.textPrimary, fontSize: 14, lineHeight: 22 },
    sourceList: { gap: 8, marginTop: 4 },
    sourceRow: { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 },
    sourceTitle: { fontFamily: 'Inter_700Bold', color: theme.accentHover, fontSize: 12 },
    sourceMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10, marginTop: 2 },
    sourceSnippet: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, marginTop: 6, lineHeight: 16 },
    resultCard: { borderRadius: 18, borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.12), backgroundColor: rgbaFromHex(surface, 0.72), padding: 14, gap: 7, boxShadow: cbTileShadow(0.045) } as ViewStyle,
    resultTitle: { fontFamily: 'Inter_700Bold', color: theme.accentHover, fontSize: 13 },
    resultText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, lineHeight: 18 },
    suggestionPanel: { borderRadius: 24, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 15, gap: 12, boxShadow: cbTileShadow(0.07) } as ViewStyle,
    empty: { alignItems: 'center', paddingVertical: 48, gap: 9 },
    emptyIcon: { color: theme.accent },
    emptyTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 22 },
    emptyText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13, textAlign: 'center', maxWidth: 320, lineHeight: 19 },
    modalRoot: { flex: 1, backgroundColor: theme.bgPrimary },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 12 },
    modalTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 25 },
    modalBody: { padding: 20, gap: 12 },
    label: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase' },
    input: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: border, paddingHorizontal: 14, color: theme.textPrimary, backgroundColor: rgbaFromHex(surface, 0.92), fontFamily: 'Inter_600SemiBold' },
  });
}
