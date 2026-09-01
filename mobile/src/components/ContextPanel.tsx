import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, ActivityIndicator, Animated, Switch, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import HapticTouchable from './HapticTouchable';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import {
  ContextDocument,
  DECK_LIMIT,
  getDeck,
  getHsModeEnabled,
  removeFromDeck,
  setHsModeEnabled,
} from '../services/contextService';

type Props = {
  visible: boolean;
  onClose: () => void;
  onChange?: (state: { hsMode: boolean; selectedDocIds: string[] }) => void;
};

export default function ContextPanel({ visible, onClose, onChange }: Props) {
  const { selectedTheme } = useAppTheme();
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(width * 0.86, 380);
  const s = createStyles(selectedTheme, panelWidth);
  const slideAnim = useRef(new Animated.Value(panelWidth)).current;

  const [hsMode, setHsMode] = useState(false);
  const [deck, setDeck] = useState<ContextDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [enabled, deckData] = await Promise.all([
        getHsModeEnabled(),
        getDeck().catch(() => ({ documents: [] })),
      ]);
      setHsMode(enabled);
      setDeck(deckData.documents ?? []);
      onChange?.({ hsMode: enabled, selectedDocIds: (deckData.documents ?? []).map((d) => d.doc_id) });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (visible) {
      load();
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 100, friction: 14 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: panelWidth, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible, load, panelWidth, slideAnim]);

  const toggleHsMode = async (value: boolean) => {
    setHsMode(value);
    await setHsModeEnabled(value);
    onChange?.({ hsMode: value, selectedDocIds: deck.map((d) => d.doc_id) });
  };

  const removeDoc = async (docId: string) => {
    setRemovingId(docId);
    try {
      await removeFromDeck(docId);
      const nextDeck = deck.filter((doc) => doc.doc_id !== docId);
      setDeck(nextDeck);
      onChange?.({ hsMode, selectedDocIds: nextDeck.map((d) => d.doc_id) });
    } catch {
      // ignore
    } finally {
      setRemovingId(null);
    }
  };

  const manageDeck = () => {
    onClose();
    navigation.navigate('KnowledgeHub', { initialTab: 'deck' });
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
                  <Text style={s.title}>deck</Text>
                  <Text style={s.caption}>what the AI reads from</Text>
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
                      <Text style={s.hsCaption}>answer using curriculum textbooks</Text>
                    </View>
                    <Switch
                      value={hsMode}
                      onValueChange={toggleHsMode}
                      trackColor={{ false: rgbaFromHex(selectedTheme.accent, 0.18), true: rgbaFromHex(selectedTheme.accent, 0.5) }}
                      thumbColor={hsMode ? selectedTheme.accentHover : selectedTheme.textSecondary}
                    />
                  </View>

                  <View style={s.section}>
                    <View style={s.sectionHeadRow}>
                      <Text style={s.sectionLabel}>your deck</Text>
                      <Text style={s.sectionMeta}>{deck.length}/{DECK_LIMIT}</Text>
                    </View>

                    {deck.length === 0 ? (
                      <Text style={s.emptyText}>Add up to {DECK_LIMIT} documents from the Hub's Library tab to scope answers to your own material.</Text>
                    ) : (
                      deck.map((doc) => (
                        <View key={doc.doc_id} style={s.docRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.docName} numberOfLines={1}>{doc.filename}</Text>
                            <Text style={s.docMeta}>{doc.subject || 'general'} · {doc.chunk_count} chunks</Text>
                          </View>
                          <HapticTouchable onPress={() => removeDoc(doc.doc_id)} style={s.docDelete} haptic="warning">
                            {removingId === doc.doc_id ? (
                              <ActivityIndicator size="small" color={selectedTheme.danger} />
                            ) : (
                              <Ionicons name="close" size={15} color={selectedTheme.danger} />
                            )}
                          </HapticTouchable>
                        </View>
                      ))
                    )}
                  </View>

                  <HapticTouchable style={s.manageBtn} onPress={manageDeck} activeOpacity={0.85} haptic="selection">
                    <Text style={s.manageBtnText}>manage deck</Text>
                    <Ionicons name="chevron-forward" size={15} color={selectedTheme.accentHover} />
                  </HapticTouchable>
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
    docRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderRadius: 14, borderWidth: 1, borderColor: BORDER,
      backgroundColor: CARD_ALT, paddingHorizontal: 12, paddingVertical: 11,
    },
    docName: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: GOLD_L },
    docMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, marginTop: 2, textTransform: 'lowercase' },
    docDelete: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
    manageBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      borderRadius: 14, borderWidth: 1, borderColor: rgbaFromHex(theme.accent, 0.3),
      paddingVertical: 13,
    },
    manageBtnText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: GOLD_L, textTransform: 'uppercase', letterSpacing: 1 },
  });
}
