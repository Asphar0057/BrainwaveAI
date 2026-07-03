import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, ActivityIndicator, Animated, Switch, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import HapticTouchable from './HapticTouchable';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import {
  ContextDocument,
  HsSummary,
  deleteDocument,
  getDocuments,
  getHsModeEnabled,
  getHsSubjects,
  getSelectedDocIds,
  setHsModeEnabled,
  setSelectedDocIds,
} from '../services/contextService';

type Props = {
  visible: boolean;
  onClose: () => void;
  onChange?: (state: { hsMode: boolean; selectedDocIds: string[] }) => void;
};

export default function ContextPanel({ visible, onClose, onChange }: Props) {
  const { selectedTheme } = useAppTheme();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(width * 0.86, 380);
  const s = createStyles(selectedTheme, panelWidth);
  const slideAnim = useRef(new Animated.Value(panelWidth)).current;

  const [hsMode, setHsMode] = useState(false);
  const [docs, setDocs] = useState<ContextDocument[]>([]);
  const [hsSummary, setHsSummary] = useState<HsSummary | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [enabled, ids, docsData, subjectsData] = await Promise.all([
        getHsModeEnabled(),
        getSelectedDocIds(),
        getDocuments().catch(() => null),
        getHsSubjects().catch(() => null),
      ]);
      setHsMode(enabled);
      setSelectedIds(new Set(ids));
      if (docsData) {
        setDocs(docsData.user_docs ?? []);
        setHsSummary(docsData.hs_summary ?? null);
      }
      if (!docsData?.hs_summary && subjectsData) {
        setHsSummary({ total_subjects: subjectsData.total, subjects: subjectsData.subjects ?? [] });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      load();
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 100, friction: 14 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: panelWidth, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible, load, panelWidth, slideAnim]);

  const notifyChange = (nextHsMode: boolean, nextIds: Set<string>) => {
    onChange?.({ hsMode: nextHsMode, selectedDocIds: Array.from(nextIds) });
  };

  const toggleHsMode = async (value: boolean) => {
    setHsMode(value);
    await setHsModeEnabled(value);
    notifyChange(value, selectedIds);
  };

  const toggleDoc = async (docId: string) => {
    const next = new Set(selectedIds);
    if (next.has(docId)) next.delete(docId);
    else next.add(docId);
    setSelectedIds(next);
    await setSelectedDocIds(Array.from(next));
    notifyChange(hsMode, next);
  };

  const removeDoc = async (docId: string) => {
    setDeletingId(docId);
    try {
      await deleteDocument(docId);
      setDocs((current) => current.filter((doc) => doc.doc_id !== docId));
      if (selectedIds.has(docId)) {
        const next = new Set(selectedIds);
        next.delete(docId);
        setSelectedIds(next);
        await setSelectedDocIds(Array.from(next));
        notifyChange(hsMode, next);
      }
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" onRequestClose={onClose}>
      <SafeAreaProvider>
        <View style={s.overlay}>
          <HapticTouchable style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} haptic="none" />
          <Animated.View style={[s.panel, { transform: [{ translateX: slideAnim }] }]}>
            <LinearGradient colors={[darkenColor(selectedTheme.bgTop, selectedTheme.isLight ? 4 : 0), selectedTheme.panelAlt, selectedTheme.bgPrimary]} style={StyleSheet.absoluteFill} />
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
              <View style={s.header}>
                <View>
                  <Text style={s.title}>context</Text>
                  <Text style={s.caption}>scope what the AI reads from</Text>
                </View>
                <HapticTouchable onPress={onClose} style={s.closeBtn} activeOpacity={0.8} haptic="selection">
                  <Ionicons name="close" size={18} color={selectedTheme.textPrimary} />
                </HapticTouchable>
              </View>

              {loading ? (
                <ActivityIndicator color={selectedTheme.accent} style={{ marginTop: 40 }} />
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
                  <View style={s.hsCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.hsTitle}>HS mode</Text>
                      <Text style={s.hsCaption}>
                        {hsSummary?.total_subjects
                          ? `${hsSummary.total_subjects} curriculum subjects available`
                          : 'answer using curriculum textbooks'}
                      </Text>
                    </View>
                    <Switch
                      value={hsMode}
                      onValueChange={toggleHsMode}
                      trackColor={{ false: rgbaFromHex(selectedTheme.accent, 0.18), true: rgbaFromHex(selectedTheme.accent, 0.5) }}
                      thumbColor={hsMode ? selectedTheme.accentHover : selectedTheme.textSecondary}
                    />
                  </View>

                  {hsSummary?.subjects?.length ? (
                    <View style={s.section}>
                      <Text style={s.sectionLabel}>curriculum subjects</Text>
                      <View style={s.subjectWrap}>
                        {hsSummary.subjects.slice(0, 12).map((subj, i) => (
                          <View key={`${subj.subject}-${i}`} style={s.subjectChip}>
                            <Text style={s.subjectChipText}>{subj.subject}</Text>
                            <Text style={s.subjectChipCount}>{subj.doc_count}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  <View style={s.section}>
                    <View style={s.sectionHeadRow}>
                      <Text style={s.sectionLabel}>your documents</Text>
                      {selectedIds.size > 0 ? <Text style={s.sectionMeta}>{selectedIds.size} selected</Text> : null}
                    </View>

                    {docs.length === 0 ? (
                      <Text style={s.emptyText}>Upload documents from the web app to scope answers to your own material.</Text>
                    ) : (
                      docs.map((doc) => {
                        const active = selectedIds.has(doc.doc_id);
                        return (
                          <HapticTouchable
                            key={doc.doc_id}
                            style={[s.docRow, active && s.docRowActive]}
                            onPress={() => toggleDoc(doc.doc_id)}
                            activeOpacity={0.8}
                            haptic="selection"
                          >
                            <View style={[s.docCheck, active && s.docCheckActive]}>
                              {active ? <Ionicons name="checkmark" size={12} color={selectedTheme.bgPrimary} /> : null}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.docName} numberOfLines={1}>{doc.filename}</Text>
                              <Text style={s.docMeta}>{doc.subject || 'general'} · {doc.chunk_count} chunks</Text>
                            </View>
                            <HapticTouchable onPress={() => removeDoc(doc.doc_id)} style={s.docDelete} haptic="warning">
                              {deletingId === doc.doc_id ? (
                                <ActivityIndicator size="small" color={selectedTheme.danger} />
                              ) : (
                                <Ionicons name="trash-outline" size={14} color={selectedTheme.danger} />
                              )}
                            </HapticTouchable>
                          </HapticTouchable>
                        );
                      })
                    )}
                  </View>
                </ScrollView>
              )}
            </SafeAreaView>
          </Animated.View>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], panelWidth: number) {
  const GOLD_L = theme.accentHover;
  const DIM = theme.textSecondary;
  const BORDER = theme.border;
  const CARD_ALT = theme.panelAlt;
  const SHADOW = darkenColor(theme.primary, theme.isLight ? 72 : 4);

  return StyleSheet.create({
    overlay: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
    panel: {
      width: panelWidth,
      height: '100%',
      borderLeftWidth: 1,
      borderLeftColor: rgbaFromHex(theme.accent, 0.24),
      shadowColor: SHADOW,
      shadowOffset: { width: -10, height: 0 },
      shadowOpacity: 0.24,
      shadowRadius: 24,
      elevation: 16,
      overflow: 'hidden',
    },
    header: {
      paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10,
      flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    },
    title: { fontFamily: 'Inter_900Black', fontSize: 22, color: GOLD_L },
    caption: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginTop: 2 },
    closeBtn: {
      width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: BORDER, backgroundColor: rgbaFromHex(CARD_ALT, 0.7),
    },
    scroll: { paddingHorizontal: 18, paddingBottom: 40, gap: 20 },
    hsCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderRadius: 18, borderWidth: 1, borderColor: rgbaFromHex(theme.accent, 0.26),
      backgroundColor: rgbaFromHex(theme.accent, 0.08), padding: 16,
    },
    hsTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, color: GOLD_L },
    hsCaption: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginTop: 2 },
    section: { gap: 10 },
    sectionHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionLabel: { fontFamily: 'Inter_700Bold', fontSize: 12, color: DIM, textTransform: 'uppercase', letterSpacing: 1.2 },
    sectionMeta: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: GOLD_L },
    emptyText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: DIM, lineHeight: 18 },
    subjectWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    subjectChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderRadius: 999, borderWidth: 1, borderColor: BORDER,
      backgroundColor: CARD_ALT, paddingHorizontal: 12, paddingVertical: 7,
    },
    subjectChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: GOLD_L },
    subjectChipCount: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM },
    docRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderRadius: 14, borderWidth: 1, borderColor: BORDER,
      backgroundColor: CARD_ALT, paddingHorizontal: 12, paddingVertical: 11,
    },
    docRowActive: { borderColor: rgbaFromHex(theme.accent, 0.5), backgroundColor: rgbaFromHex(theme.accent, 0.08) },
    docCheck: {
      width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: BORDER,
      alignItems: 'center', justifyContent: 'center',
    },
    docCheckActive: { backgroundColor: theme.accentHover, borderColor: theme.accentHover },
    docName: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: GOLD_L },
    docMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, marginTop: 2, textTransform: 'lowercase' },
    docDelete: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  });
}
