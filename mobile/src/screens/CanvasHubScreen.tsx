import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import { getNotes } from '../services/api';
import AmbientBubbles from '../components/AmbientBubbles';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import { NeumorphicLayer, cbTileShadow, cbModalShadow } from '../components/NeumorphicTexture';
import { useAppTheme } from '../contexts/ThemeContext';
import { rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import NotesCanvasScreen from './notes/NotesCanvasScreen';
import { hasCanvasPayload } from '../utils/noteCanvas';

type Props = {
  user: AuthUser;
  onBack: () => void;
  onOpenNotes?: () => void;
};

type CanvasNote = {
  id: number;
  title: string;
  content?: string;
  updated_at?: string;
  created_at?: string;
};

function formatDate(value?: string) {
  if (!value) return 'recent';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'recent';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function CanvasHubScreen({ user, onBack, onOpenNotes }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(selectedTheme, layout, insets.top), [selectedTheme, layout, insets.top]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });
  const [notes, setNotes] = useState<CanvasNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [drawing, setDrawing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getNotes(user.username);
      const list = Array.isArray(data) ? data : data?.notes ?? [];
      setNotes(
        list
          .filter((note: CanvasNote) => hasCanvasPayload(note.content || ''))
          .slice(0, 12)
      );
    } catch (error) {
      Alert.alert('Canvas Hub', error instanceof Error ? error.message : 'Failed to load canvas notes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.username]);

  useEffect(() => { load(); }, [load]);

  if (!fontsLoaded) return null;

  if (drawing) {
    return (
      <NotesCanvasScreen
        user={user}
        onBack={() => setDrawing(false)}
        onSaved={() => {
          setDrawing(false);
          load();
          Alert.alert('Canvas saved', 'Your sketch was saved as a note.');
        }}
        mode="note"
      />
    );
  }

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <AmbientBubbles theme={selectedTheme} variant="notes" opacity={0.74} />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={selectedTheme.accent} />}
      >
        <View style={s.topBar}>
          <HapticTouchable style={s.iconBtn} onPress={onBack} haptic="light">
            <Ionicons name="chevron-back" size={18} color={selectedTheme.accent} />
          </HapticTouchable>
          <HapticTouchable style={s.iconBtn} onPress={load} haptic="selection">
            <Ionicons name="refresh-outline" size={18} color={selectedTheme.accent} />
          </HapticTouchable>
        </View>

        <View style={s.hero}>
          <NeumorphicLayer grainOpacity={0.12} />
          <Text style={s.heroGhost}>01</Text>
          <Text style={s.eyebrow}>whiteboard workspace</Text>
          <Text style={s.heroTitle}>canvas hub</Text>
          <Text style={s.heroCopy}>{notes.length} canvas notes · sketch, annotate, diagram, and save</Text>
        </View>

        <View style={s.actionGrid}>
          <HapticTouchable style={s.bigAction} onPress={() => setDrawing(true)} haptic="medium">
            <View style={s.bigIcon}>
              <Ionicons name="brush-outline" size={20} color={selectedTheme.accentHover} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.bigTitle}>new canvas</Text>
              <Text style={s.bigMeta}>open the full drawing workspace</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={selectedTheme.textSecondary} />
          </HapticTouchable>
          <HapticTouchable style={s.bigAction} onPress={onOpenNotes} haptic="selection">
            <View style={s.bigIcon}>
              <Ionicons name="document-text-outline" size={20} color={selectedTheme.accentHover} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.bigTitle}>notes library</Text>
              <Text style={s.bigMeta}>open existing sketches and mixed notes</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={selectedTheme.textSecondary} />
          </HapticTouchable>
        </View>

        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>recent canvases</Text>
          <Text style={s.sectionHint}>saved canvas blocks from your notes</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 32 }} />
        ) : notes.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="color-palette-outline" size={40} color={selectedTheme.accent} />
            <Text style={s.emptyTitle}>no canvas notes yet</Text>
            <Text style={s.emptyText}>create a sketch here or add a canvas block from Notes</Text>
          </View>
        ) : (
          <View style={s.list}>
            {notes.map((note) => (
              <HapticTouchable key={note.id} style={s.noteCard} onPress={onOpenNotes} haptic="selection" activeOpacity={0.84}>
                <View style={s.noteIcon}>
                  <Ionicons name="scan-outline" size={17} color={selectedTheme.accentHover} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.noteTitle} numberOfLines={1}>{note.title || 'Canvas sketch'}</Text>
                  <Text style={s.noteMeta}>{formatDate(note.updated_at || note.created_at)} · open in Notes</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={selectedTheme.textSecondary} />
              </HapticTouchable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>, topInset: number) {
  const surface = theme.panel;
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.16 : 0.18);
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 18, paddingTop: Math.max(topInset + 12, 52), paddingBottom: 118, gap: 14 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    iconBtn: { width: 40, height: 40, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), alignItems: 'center', justifyContent: 'center', boxShadow: cbTileShadow(0.06) },
    hero: { borderRadius: 30, padding: 20, overflow: 'hidden', boxShadow: cbModalShadow(0.14) } as ViewStyle,
    heroGhost: { position: 'absolute', right: 15, top: 0, fontFamily: 'Inter_900Black', fontSize: layout.isTablet ? 92 : 76, lineHeight: layout.isTablet ? 98 : 82, color: rgbaFromHex(theme.textPrimary, theme.isLight ? 0.035 : 0.055), letterSpacing: -4 },
    eyebrow: { fontFamily: 'Inter_700Bold', color: theme.textSecondary, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase' },
    heroTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 36, letterSpacing: 0, marginTop: 8 },
    heroCopy: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13, marginTop: 4 },
    actionGrid: { gap: 11 },
    bigAction: { borderRadius: 22, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12, boxShadow: cbTileShadow(0.07) } as ViewStyle,
    bigIcon: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.14), alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(theme.accent, 0.1) },
    bigTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 16, letterSpacing: 0 },
    bigMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, marginTop: 3 },
    sectionHead: { borderRadius: 22, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 15, boxShadow: cbTileShadow(0.055) } as ViewStyle,
    sectionTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 17, letterSpacing: 0 },
    sectionHint: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, marginTop: 3 },
    empty: { alignItems: 'center', paddingVertical: 48, gap: 9 },
    emptyTitle: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 22 },
    emptyText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13, textAlign: 'center', maxWidth: 320, lineHeight: 19 },
    list: { gap: 11 },
    noteCard: { borderRadius: 20, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.72), padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, boxShadow: cbTileShadow(0.055) } as ViewStyle,
    noteIcon: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.14), alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(theme.panelAlt, 0.78) },
    noteTitle: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 15, letterSpacing: 0 },
    noteMeta: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, marginTop: 3 },
  });
}
