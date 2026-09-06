import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AudioModule, RecordingPresets, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import Ionicons from '@expo/vector-icons/Ionicons';
import AmbientBubbles from '../../components/AmbientBubbles';
import GeoBackground from '../../components/GeoBackground';
import HapticTouchable from '../../components/HapticTouchable';
import { cbTileShadow, cbModalShadow, cbTileBorder } from '../../components/NeumorphicTexture';
import {
  createFolder,
  invokeNotesAgent,
  moveNoteToFolder,
  moveNoteToTrash,
  toggleFavorite,
  transcribeAudio,
  updateNote,
} from '../../services/api';
import {
  BUILT_IN_NOTE_TEMPLATES,
  type NoteTemplate,
  applyTemplateVariables,
} from '../../data/noteTemplates';
import {
  buildNoteContentFromBlocks,
  createCanvasBlock,
  createTextBlock,
  parseNoteCanvasBlocks,
  type NoteCanvasBlock,
} from '../../utils/noteCanvas';
import { NOTE_FONT_OPTIONS, normalizeNoteFont, resolveNoteFont } from '../../constants/noteFonts';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { rgbaFromHex } from '../../utils/theme';
import {
  CUSTOM_TEMPLATE_KEY,
  CURRENT_THEME,
  ModalShell,
  type NoteEditorProps,
  formatDate,
} from './NotesShared';
import { CanvasPreview } from './NotesCanvasScreen';

type EditorAiAction = 'improve' | 'summarize' | 'continue' | 'generate';
type TemplateTab = 'built-in' | 'custom';
type CustomTemplate = NoteTemplate & { createdAt: string };

function ActionPill({
  icon,
  label,
  onPress,
  subtle = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  subtle?: boolean;
}) {
  const { selectedTheme } = useAppTheme();
  const styles = useMemo(() => createStyles(selectedTheme), [selectedTheme]);
  return (
    <HapticTouchable
      style={[styles.actionPill, subtle && styles.actionPillSubtle]}
      onPress={onPress}
      haptic="selection"
    >
      <Ionicons name={icon} size={16} color={subtle ? selectedTheme.accentHover : selectedTheme.bgPrimary} />
      <Text style={[styles.actionPillText, subtle && styles.actionPillTextSubtle]}>{label}</Text>
    </HapticTouchable>
  );
}

function MenuRow({
  icon,
  title,
  subtitle,
  danger = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const { selectedTheme } = useAppTheme();
  const styles = useMemo(() => createStyles(selectedTheme), [selectedTheme]);
  return (
    <HapticTouchable style={styles.menuRow} onPress={onPress} haptic={danger ? 'warning' : 'selection'}>
      <View style={[styles.menuIconWrap, danger && styles.menuIconWrapDanger]}>
        <Ionicons name={icon} size={16} color={danger ? selectedTheme.danger : selectedTheme.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.menuTitle, danger && { color: selectedTheme.danger }]}>{title}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={selectedTheme.textSecondary} />
    </HapticTouchable>
  );
}

export default function NoteEditorScreen({
  user,
  note,
  folders,
  onBack,
  onSaved,
  onMovedToTrash,
  onFavoriteChanged,
  onOpenCanvas,
  onCanvasReturnHandled,
  canvasReturn,
}: NoteEditorProps) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(selectedTheme), [selectedTheme]);
  const initialParsedBlocks = useMemo(() => parseNoteCanvasBlocks(note.content), [note.content]);
  const initialText = useMemo(
    () => initialParsedBlocks.filter((block) => block.type === 'text').map((block) => block.content).join('\n\n'),
    [initialParsedBlocks]
  );
  const initialCanvasBlocks = useMemo(
    () => initialParsedBlocks.filter((block): block is Extract<NoteCanvasBlock, { type: 'canvas' }> => block.type === 'canvas'),
    [initialParsedBlocks]
  );

  const [title, setTitle] = useState(note.title);
  const [bodyText, setBodyText] = useState(initialText);
  const [canvasBlocks, setCanvasBlocks] = useState<Extract<NoteCanvasBlock, { type: 'canvas' }>[]>(initialCanvasBlocks);
  const [baseTitle, setBaseTitle] = useState(note.title);
  const [baseBodyText, setBaseBodyText] = useState(initialText);
  const [baseCanvasSignature, setBaseCanvasSignature] = useState(JSON.stringify(initialCanvasBlocks));
  const [baseCustomFont, setBaseCustomFont] = useState(note.custom_font || 'Inter');
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(note.updated_at);
  const [isFavorite, setIsFavorite] = useState(note.is_favorite);
  const [folderId, setFolderId] = useState<number | null>(note.folder_id);
  const [folderOptions, setFolderOptions] = useState(folders);
  const [customFont, setCustomFont] = useState(note.custom_font || 'Inter');
  const [saving, setSaving] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [folderBusy, setFolderBusy] = useState(false);

  const [showAiModal, setShowAiModal] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showMoreModal, setShowMoreModal] = useState(false);
  const [showFontModal, setShowFontModal] = useState(false);

  const [aiAction, setAiAction] = useState<EditorAiAction>('improve');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState('');

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const [dictating, setDictating] = useState(false);

  const [templateTab, setTemplateTab] = useState<TemplateTab>('built-in');
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateDraft, setTemplateDraft] = useState({ name: '', description: '' });

  const [newFolderName, setNewFolderName] = useState('');
  const [folderCreating, setFolderCreating] = useState(false);

  useEffect(() => {
    setFolderOptions(folders);
  }, [folders]);

  useEffect(() => {
    AsyncStorage.getItem(CUSTOM_TEMPLATE_KEY)
      .then((raw) => {
        if (!raw) {
          setCustomTemplates([]);
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          setCustomTemplates(Array.isArray(parsed) ? parsed : []);
        } catch {
          setCustomTemplates([]);
        }
      })
      .catch(() => setCustomTemplates([]));
  }, []);

  useEffect(() => {
    if (!canvasReturn) return;

    if (canvasReturn.status !== 'saved' || !canvasReturn.canvasData) {
      onCanvasReturnHandled();
      return;
    }

    if (canvasReturn.blockId) {
      setCanvasBlocks((current) => current.map((block) => (
        block.id === canvasReturn.blockId
          ? {
              ...block,
              canvasData: canvasReturn.canvasData || '',
              canvasPreview: canvasReturn.canvasPreview || '',
            }
          : block
      )));
      onCanvasReturnHandled();
      return;
    }

    const nextBlock = createCanvasBlock(
      canvasReturn.canvasData,
      canvasReturn.canvasPreview || ''
    ) as Extract<NoteCanvasBlock, { type: 'canvas' }>;
    setCanvasBlocks((current) => [...current, nextBlock]);
    onCanvasReturnHandled();
  }, [canvasReturn, onCanvasReturnHandled]);

  const wordCount = bodyText.trim() ? bodyText.trim().split(/\s+/).length : 0;
  const charCount = bodyText.length;
  const canvasCount = canvasBlocks.length;
  const activeFolderName = folderOptions.find((folder) => folder.id === folderId)?.name ?? 'Notes';

  const canvasSignature = JSON.stringify(canvasBlocks);
  const dirty =
    title !== baseTitle ||
    bodyText !== baseBodyText ||
    canvasSignature !== baseCanvasSignature ||
    customFont !== baseCustomFont;

  const buildBlocks = () => {
    const blocks: NoteCanvasBlock[] = [createTextBlock(bodyText)];
    canvasBlocks.forEach((block) => blocks.push(block));
    return blocks;
  };

  const persistCustomTemplates = async (templates: CustomTemplate[]) => {
    setCustomTemplates(templates);
    await AsyncStorage.setItem(CUSTOM_TEMPLATE_KEY, JSON.stringify(templates));
  };

  const createSketch = () => {
    onOpenCanvas({ initialData: '' });
  };

  const updateSketch = (blockId: string, canvasData: string, canvasPreview: string) => {
    setCanvasBlocks((current) => current.map((block) => (
      block.id === blockId
        ? { ...block, canvasData, canvasPreview }
        : block
    )));
  };

  const removeSketch = (blockId: string) => {
    setCanvasBlocks((current) => current.filter((block) => block.id !== blockId));
  };

  const saveTemplate = async () => {
    if (!templateDraft.name.trim()) {
      Alert.alert('Template name required', 'Add a template name before saving.');
      return;
    }

    const content = buildNoteContentFromBlocks(buildBlocks());
    const nextTemplate: CustomTemplate = {
      id: `custom-${Date.now()}`,
      name: templateDraft.name.trim(),
      description: templateDraft.description.trim() || 'Saved from note editor',
      content,
      category: 'custom',
      createdAt: new Date().toISOString(),
    };
    await persistCustomTemplates([...customTemplates, nextTemplate]);
    setTemplateDraft({ name: '', description: '' });
    setShowTemplateForm(false);
    setTemplateTab('custom');
  };

  const applyTemplate = (template: NoteTemplate, mode: 'replace' | 'append') => {
    const filled = applyTemplateVariables(template, user.username);
    if (mode === 'replace') {
      setBodyText(filled);
      if (!title.trim()) setTitle(template.name);
    } else {
      setBodyText((current) => current.trim() ? `${current.trimEnd()}\n\n${filled}` : filled);
    }
    setShowTemplates(false);
  };

  const save = async () => {
    if (saving) return false;
    setSaving(true);
    const mergedContent = buildNoteContentFromBlocks(buildBlocks());
    try {
      const updated = await updateNote({
        noteId: note.id,
        title: title.trim() || 'Untitled Note',
        content: mergedContent,
        customFont,
      });
      const nextTitle = updated.title ?? (title.trim() || 'Untitled Note');
      const nextUpdatedAt = updated.updated_at ?? new Date().toISOString();
      setBaseTitle(nextTitle);
      setBaseBodyText(bodyText);
      setBaseCanvasSignature(JSON.stringify(canvasBlocks));
      setBaseCustomFont(normalizeNoteFont(updated.custom_font ?? customFont));
      setBaseUpdatedAt(nextUpdatedAt);
      onSaved({
        ...note,
        title: nextTitle,
        content: mergedContent,
        updated_at: nextUpdatedAt,
        is_favorite: isFavorite,
        folder_id: folderId,
        custom_font: normalizeNoteFont(updated.custom_font ?? customFont),
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save note';
      Alert.alert('Save failed', message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleBack = async () => {
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    onBack();
  };

  const handleFavorite = async () => {
    if (favoriteBusy) return;
    const next = !isFavorite;
    setFavoriteBusy(true);
    try {
      await toggleFavorite({ noteId: note.id, isFavorite: next });
      setIsFavorite(next);
      onFavoriteChanged(note.id, next);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update favorite';
      Alert.alert('Favorite failed', message);
    } finally {
      setFavoriteBusy(false);
    }
  };

  const handleMoveFolder = async (nextFolderId: number | null) => {
    if (folderBusy || nextFolderId === folderId) return;
    setFolderBusy(true);
    try {
      await moveNoteToFolder({ noteId: note.id, folderId: nextFolderId });
      setFolderId(nextFolderId);
      onSaved({
        ...note,
        title: title.trim() || 'Untitled Note',
        content: buildNoteContentFromBlocks(buildBlocks()),
        updated_at: baseUpdatedAt,
        is_favorite: isFavorite,
        folder_id: nextFolderId,
        custom_font: customFont,
      });
      setShowFolderModal(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to move note';
      Alert.alert('Move failed', message);
    } finally {
      setFolderBusy(false);
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || folderCreating) return;
    setFolderCreating(true);
    try {
      const created = await createFolder({ userId: user.username, name });
      const nextFolder = {
        id: created.id,
        name: created.name ?? name,
        color: created.color ?? selectedTheme.accent,
        note_count: created.note_count ?? 0,
        parent_id: created.parent_id ?? null,
        created_at: created.created_at,
      };
      setFolderOptions((current) => [...current, nextFolder]);
      setNewFolderName('');
      await handleMoveFolder(nextFolder.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create folder';
      Alert.alert('Folder failed', message);
    } finally {
      setFolderCreating(false);
    }
  };

  const handleTrash = () => {
    Alert.alert('Move to trash?', 'You can restore this note for 30 days from trash.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move',
        style: 'destructive',
        onPress: async () => {
          try {
            await moveNoteToTrash(note.id);
            onMovedToTrash(note.id);
            onBack();
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to move note to trash';
            Alert.alert('Trash failed', message);
          }
        },
      },
    ]);
  };

  const runAiAssist = async () => {
    if (aiBusy) return;

    const currentText = bodyText.trim();
    if (aiAction === 'generate' && !aiPrompt.trim()) {
      Alert.alert('Prompt required', 'Add a topic or prompt first.');
      return;
    }

    if (aiAction !== 'generate' && !currentText && !aiPrompt.trim()) {
      Alert.alert('No content', 'Write something in the note before using AI.');
      return;
    }

    setAiBusy(true);
    try {
      const result = await invokeNotesAgent({
        userId: user.username,
        action: aiAction,
        content: aiAction === 'generate' ? '' : (aiPrompt.trim() || currentText).slice(0, 2000),
        topic: aiAction === 'generate' ? aiPrompt.trim() : '',
        tone: 'professional',
        context: `${title}\n\n${currentText}`.slice(0, 2000),
      });
      const suggestion = String(result?.content || '').trim();
      if (!suggestion) throw new Error('AI returned empty content');
      setAiSuggestion(suggestion);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process AI request';
      Alert.alert('AI assist failed', message);
    } finally {
      setAiBusy(false);
    }
  };

  const applyAiSuggestion = (mode: 'replace' | 'append') => {
    if (!aiSuggestion.trim()) return;
    setBodyText((current) => (
      mode === 'replace'
        ? aiSuggestion.trim()
        : current.trim()
          ? `${current.trimEnd()}\n\n${aiSuggestion.trim()}`
          : aiSuggestion.trim()
    ));
    setAiSuggestion('');
    setAiPrompt('');
    setShowAiModal(false);
  };

  // Quick dictation: record a short clip, transcribe it (Whisper via
  // /transcribe_audio/), then run the transcript through the same notes AI
  // agent "generate" action as the AI-assist modal -- mirrors the web app's
  // voice-to-text, which also elaborates the spoken prompt rather than
  // inserting the raw transcript verbatim. Appends the result to the note.
  const handleDictate = async () => {
    if (dictating) return;
    if (recorderState.isRecording) {
      setDictating(true);
      try {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) throw new Error('No audio was recorded');
        const { transcript } = await transcribeAudio(user.username, {
          uri,
          name: `dictation-${Date.now()}.m4a`,
          mimeType: 'audio/m4a',
        });
        if (!transcript?.trim()) throw new Error('Could not hear anything in that recording');
        const result = await invokeNotesAgent({
          userId: user.username,
          action: 'generate',
          topic: transcript.trim(),
          content: transcript.trim(),
          context: `${title}\n\n${bodyText}`.slice(0, 2000),
        });
        const addition = String(result?.content || transcript).trim();
        setBodyText((current) => (current.trim() ? `${current.trimEnd()}\n\n${addition}` : addition));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to process dictation';
        Alert.alert('Dictation failed', message);
      } finally {
        setDictating(false);
      }
      return;
    }
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Microphone permission needed', 'Allow microphone access to dictate into this note.');
      return;
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const exportNote = async () => {
    try {
      await Share.share({
        title: title.trim() || 'Untitled Note',
        message: `${title.trim() || 'Untitled Note'}\n\n${bodyText.trim()}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to share note';
      Alert.alert('Share failed', message);
    }
  };

  const pageDate = new Date(baseUpdatedAt || note.updated_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <GeoBackground />
      <AmbientBubbles theme={CURRENT_THEME} variant="notes" opacity={0.46} />

      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.navBar}>
          <HapticTouchable onPress={handleBack} style={styles.navIconBtn} haptic="selection">
            <Ionicons name="chevron-back" size={20} color={selectedTheme.accentHover} />
          </HapticTouchable>

          <View style={styles.navMeta}>
            <Text style={styles.navMetaTitle} numberOfLines={1}>{activeFolderName}</Text>
            <Text style={styles.navMetaSubtitle} numberOfLines={1}>
              {dirty ? 'edited just now' : `updated ${formatDate(baseUpdatedAt)}`}
            </Text>
          </View>

          <HapticTouchable onPress={handleFavorite} style={styles.navIconBtn} haptic="selection" disabled={favoriteBusy}>
            <Ionicons
              name={isFavorite ? 'star' : 'star-outline'}
              size={18}
              color={isFavorite ? selectedTheme.accent : selectedTheme.textSecondary}
            />
          </HapticTouchable>
          <HapticTouchable onPress={save} style={styles.doneBtn} haptic="success" disabled={saving}>
            <Text style={styles.doneBtnText}>{saving ? 'Saving' : dirty ? 'Done' : 'Saved'}</Text>
          </HapticTouchable>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: canvasCount > 0 ? 170 : 136 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.editorShell}>
            <Text style={styles.dateStamp}>{pageDate}</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title"
              placeholderTextColor={selectedTheme.textSecondary}
              style={[styles.titleInput, { fontFamily: resolveNoteFont(customFont, 'title') }]}
            />
            <View style={styles.titleRule} />
            <TextInput
              value={bodyText}
              onChangeText={setBodyText}
              placeholder="Start writing..."
              placeholderTextColor={selectedTheme.textSecondary}
              multiline
              textAlignVertical="top"
              style={[styles.bodyInput, { fontFamily: resolveNoteFont(customFont, 'body') }]}
            />
          </View>

          {canvasCount > 0 ? (
            <View style={styles.sketchSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Sketches</Text>
                <Text style={styles.sectionMeta}>{canvasCount} attached</Text>
              </View>
              {canvasBlocks.map((block, index) => (
                <View key={block.id} style={styles.sketchCard}>
                  <View style={styles.sketchCardHeader}>
                    <View>
                      <Text style={styles.sketchTitle}>Sketch {index + 1}</Text>
                      <Text style={styles.sketchMeta}>Canvas attachment</Text>
                    </View>
                    <View style={styles.sketchActions}>
                      <HapticTouchable
                        style={styles.sketchActionBtn}
                        onPress={() => onOpenCanvas({ blockId: block.id, initialData: block.canvasData })}
                        haptic="selection"
                      >
                        <Ionicons name="create-outline" size={16} color={selectedTheme.accent} />
                      </HapticTouchable>
                      <HapticTouchable
                        style={styles.sketchActionBtn}
                        onPress={() => removeSketch(block.id)}
                        haptic="warning"
                      >
                        <Ionicons name="trash-outline" size={16} color={selectedTheme.danger} />
                      </HapticTouchable>
                    </View>
                  </View>
                  <CanvasPreview canvasData={block.canvasData} theme={selectedTheme} height={182} />
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.bottomDockWrap}>
          <View style={styles.bottomDock}>
            <ActionPill icon="folder-outline" label="Folder" onPress={() => setShowFolderModal(true)} subtle />
            <ActionPill icon="brush-outline" label="Sketch" onPress={createSketch} subtle />
            <ActionPill
              icon={dictating ? 'hourglass-outline' : recorderState.isRecording ? 'stop-circle-outline' : 'mic-outline'}
              label={dictating ? 'Working…' : recorderState.isRecording ? 'Stop' : 'Dictate'}
              onPress={handleDictate}
              subtle={!recorderState.isRecording}
            />
            <ActionPill icon="sparkles-outline" label="AI" onPress={() => setShowAiModal(true)} subtle />
            <ActionPill icon="ellipsis-horizontal" label="More" onPress={() => setShowMoreModal(true)} subtle />
          </View>
          <View style={styles.metricsRow}>
            <Text style={styles.metricText}>{wordCount} words</Text>
            <Text style={styles.metricDot}>·</Text>
            <Text style={styles.metricText}>{charCount} chars</Text>
            <Text style={styles.metricDot}>·</Text>
            <Text style={styles.metricText}>{canvasCount} sketches</Text>
          </View>
        </View>
      </KeyboardAvoidingView>

      <ModalShell
        visible={showMoreModal}
        title="More"
        subtitle="Keep the editor clean, keep the extras here"
        onClose={() => setShowMoreModal(false)}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ gap: 12, paddingBottom: 8 }}>
            <MenuRow
              icon="text-outline"
              title="Text style"
              subtitle={`Current font: ${customFont}`}
              onPress={() => {
                setShowMoreModal(false);
                setShowFontModal(true);
              }}
            />
            <MenuRow
              icon="document-text-outline"
              title="Templates"
              subtitle="Use or save note templates"
              onPress={() => {
                setShowMoreModal(false);
                setShowTemplates(true);
              }}
            />
            <MenuRow
              icon="share-social-outline"
              title="Share note"
              subtitle="Export the current note text"
              onPress={exportNote}
            />
            <MenuRow
              icon="trash-outline"
              title="Move to trash"
              subtitle="Remove this note from your library"
              danger
              onPress={handleTrash}
            />
          </View>
        </ScrollView>
      </ModalShell>

      <ModalShell
        visible={showFontModal}
        title="Text Style"
        subtitle="A clean note still needs the right reading voice"
        onClose={() => setShowFontModal(false)}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.fontRow}>
            {NOTE_FONT_OPTIONS.map((font) => {
              const active = customFont === font;
              return (
                <HapticTouchable
                  key={font}
                  style={[styles.fontChip, active && styles.fontChipActive]}
                  onPress={() => setCustomFont(font)}
                  haptic="selection"
                >
                  <Text style={[styles.fontChipText, active && styles.fontChipTextActive, { fontFamily: resolveNoteFont(font, 'body') }]}>
                    {font}
                  </Text>
                </HapticTouchable>
              );
            })}
          </View>
        </ScrollView>
      </ModalShell>

      <ModalShell
        visible={showFolderModal}
        title="Move Note"
        subtitle="Choose where this note should live"
        onClose={() => setShowFolderModal(false)}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ gap: 12, paddingBottom: 8 }}>
            <View style={styles.folderGrid}>
              <ActionPill icon="albums-outline" label="Notes" onPress={() => handleMoveFolder(null)} />
              {folderOptions.map((folder) => (
                <ActionPill
                  key={folder.id}
                  icon="folder-open-outline"
                  label={folder.name}
                  onPress={() => handleMoveFolder(folder.id)}
                />
              ))}
            </View>
            <View style={styles.inlineForm}>
              <TextInput
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholder="New folder"
                placeholderTextColor={selectedTheme.textSecondary}
                style={styles.inlineInput}
              />
              <HapticTouchable style={styles.inlineCreateBtn} onPress={handleCreateFolder} haptic="medium" disabled={folderCreating}>
                <Text style={styles.inlineCreateBtnText}>{folderCreating ? 'Creating' : 'Create'}</Text>
              </HapticTouchable>
            </View>
          </View>
        </ScrollView>
      </ModalShell>

      <ModalShell
        visible={showTemplates}
        title="Templates"
        subtitle="Start clean without crowding the main editor"
        onClose={() => {
          setShowTemplates(false);
          setShowTemplateForm(false);
        }}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ gap: 12, paddingBottom: 8 }}>
            <View style={styles.segmentRow}>
              <HapticTouchable
                style={[styles.segmentBtn, templateTab === 'built-in' && styles.segmentBtnActive]}
                onPress={() => setTemplateTab('built-in')}
                haptic="selection"
              >
                <Text style={[styles.segmentText, templateTab === 'built-in' && styles.segmentTextActive]}>Built-in</Text>
              </HapticTouchable>
              <HapticTouchable
                style={[styles.segmentBtn, templateTab === 'custom' && styles.segmentBtnActive]}
                onPress={() => setTemplateTab('custom')}
                haptic="selection"
              >
                <Text style={[styles.segmentText, templateTab === 'custom' && styles.segmentTextActive]}>Custom</Text>
              </HapticTouchable>
            </View>

            {templateTab === 'custom' ? (
              <>
                <HapticTouchable
                  style={styles.saveTemplateCard}
                  onPress={() => {
                    setShowTemplateForm((current) => !current);
                    setTemplateDraft((current) => ({
                      ...current,
                      name: current.name || (title.trim() || 'New Template'),
                    }));
                  }}
                  haptic="selection"
                >
                  <Text style={styles.saveTemplateTitle}>
                    {showTemplateForm ? 'Hide template form' : 'Save this note as a template'}
                  </Text>
                  <Text style={styles.saveTemplateText}>Reuse your structure later without cluttering the editor.</Text>
                </HapticTouchable>

                {showTemplateForm ? (
                  <View style={styles.inlineStack}>
                    <TextInput
                      value={templateDraft.name}
                      onChangeText={(value) => setTemplateDraft((current) => ({ ...current, name: value }))}
                      placeholder="Template name"
                      placeholderTextColor={selectedTheme.textSecondary}
                      style={styles.inlineInput}
                    />
                    <TextInput
                      value={templateDraft.description}
                      onChangeText={(value) => setTemplateDraft((current) => ({ ...current, description: value }))}
                      placeholder="Short description"
                      placeholderTextColor={selectedTheme.textSecondary}
                      style={styles.inlineInput}
                    />
                    <HapticTouchable style={styles.primaryWideBtn} onPress={saveTemplate} haptic="success">
                      <Text style={styles.primaryWideBtnText}>Save template</Text>
                    </HapticTouchable>
                  </View>
                ) : null}

                {customTemplates.map((template) => (
                  <View key={template.id} style={styles.templateCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.templateTitle}>{template.name}</Text>
                      <Text style={styles.templateSubtitle}>{template.description || 'Custom template'}</Text>
                    </View>
                    <View style={styles.templateActions}>
                      <ActionPill icon="add-outline" label="Append" onPress={() => applyTemplate(template, 'append')} />
                      <ActionPill icon="refresh-outline" label="Replace" onPress={() => applyTemplate(template, 'replace')} />
                    </View>
                  </View>
                ))}
              </>
            ) : (
              BUILT_IN_NOTE_TEMPLATES.map((template) => (
                <View key={template.id} style={styles.templateCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.templateTitle}>{template.name}</Text>
                    <Text style={styles.templateSubtitle}>{template.description}</Text>
                  </View>
                  <View style={styles.templateActions}>
                    <ActionPill icon="add-outline" label="Append" onPress={() => applyTemplate(template, 'append')} />
                    <ActionPill icon="refresh-outline" label="Replace" onPress={() => applyTemplate(template, 'replace')} />
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </ModalShell>

      <ModalShell
        visible={showAiModal}
        title="AI Assist"
        subtitle="Use AI when you need it, not all over the page"
        onClose={() => {
          setShowAiModal(false);
          setAiSuggestion('');
        }}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ gap: 12, paddingBottom: 8 }}>
            <View style={styles.aiChipRow}>
              {([
                ['improve', 'Improve'],
                ['summarize', 'Summarize'],
                ['continue', 'Continue'],
                ['generate', 'Generate'],
              ] as const).map(([value, label]) => {
                const active = aiAction === value;
                return (
                  <HapticTouchable
                    key={value}
                    style={[styles.aiChip, active && styles.aiChipActive]}
                    onPress={() => setAiAction(value)}
                    haptic="selection"
                  >
                    <Text style={[styles.aiChipText, active && styles.aiChipTextActive]}>{label}</Text>
                  </HapticTouchable>
                );
              })}
            </View>

            <TextInput
              value={aiPrompt}
              onChangeText={setAiPrompt}
              placeholder={aiAction === 'generate' ? 'Write a prompt for a new note...' : 'Optional instructions for the rewrite'}
              placeholderTextColor={selectedTheme.textSecondary}
              style={[styles.inlineInput, styles.aiPromptInput]}
              multiline
              textAlignVertical="top"
            />

            {aiSuggestion ? (
              <View style={styles.aiResultCard}>
                <Text style={styles.aiResultText}>{aiSuggestion}</Text>
              </View>
            ) : null}

            <View style={styles.segmentRow}>
              <HapticTouchable style={styles.secondaryWideBtn} onPress={() => setShowAiModal(false)} haptic="selection">
                <Text style={styles.secondaryWideBtnText}>Close</Text>
              </HapticTouchable>
              {aiSuggestion ? (
                <>
                  <HapticTouchable style={styles.secondaryWideBtn} onPress={() => applyAiSuggestion('replace')} haptic="selection">
                    <Text style={styles.secondaryWideBtnText}>Replace</Text>
                  </HapticTouchable>
                  <HapticTouchable style={styles.primaryWideBtn} onPress={() => applyAiSuggestion('append')} haptic="success">
                    <Text style={styles.primaryWideBtnText}>Append</Text>
                  </HapticTouchable>
                </>
              ) : (
                <HapticTouchable style={styles.primaryWideBtn} onPress={runAiAssist} haptic="medium" disabled={aiBusy}>
                  <Text style={styles.primaryWideBtnText}>{aiBusy ? 'Working...' : 'Run AI'}</Text>
                </HapticTouchable>
              )}
            </View>
          </View>
        </ScrollView>
      </ModalShell>
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const paper = theme.isLight ? '#fffef8' : rgbaFromHex(theme.panel, 0.96);
  const paperBorder = rgbaFromHex(theme.borderStrong, 0.86);
  const mutedFill = rgbaFromHex(theme.panelAlt, 0.9);
  const softAccent = rgbaFromHex(theme.accent, theme.isLight ? 0.1 : 0.18);

  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.bgPrimary,
    },
    navBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: rgbaFromHex(theme.borderStrong, 0.58),
      backgroundColor: rgbaFromHex(theme.panel, 0.9),
    },
    navIconBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.borderStrong, 0.82),
      backgroundColor: rgbaFromHex(theme.panelAlt, 0.88),
    },
    navMeta: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    navMetaTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 13,
      color: theme.accentHover,
    },
    navMetaSubtitle: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: theme.textSecondary,
      textTransform: 'lowercase',
    },
    doneBtn: {
      borderRadius: 18,
      backgroundColor: theme.accent,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    doneBtnText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 12,
      color: theme.bgPrimary,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 18,
    },
    editorShell: {
      backgroundColor: paper,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: paperBorder,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 22,
      overflow: 'hidden',
      boxShadow: cbModalShadow(0.12),
    },
    dateStamp: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: theme.textSecondary,
      marginBottom: 12,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    titleInput: {
      fontSize: 31,
      lineHeight: 38,
      color: theme.accentHover,
      paddingVertical: 0,
      marginBottom: 12,
    },
    titleRule: {
      height: 1,
      backgroundColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.14 : 0.16),
      marginBottom: 16,
    },
    bodyInput: {
      minHeight: 440,
      fontSize: 17,
      lineHeight: 28,
      color: theme.accentHover,
      paddingTop: 0,
      paddingBottom: 0,
    },
    sketchSection: {
      marginTop: 18,
      gap: 12,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 18,
      color: theme.accentHover,
    },
    sectionMeta: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: theme.textSecondary,
    },
    sketchCard: {
      backgroundColor: rgbaFromHex(theme.panel, 0.92),
      borderRadius: 16,
      padding: 14,
      gap: 12,
      overflow: 'hidden',
      boxShadow: cbTileShadow(0.06),
      ...cbTileBorder(0.14),
    },
    sketchCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    sketchTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 14,
      color: theme.accentHover,
    },
    sketchMeta: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: theme.textSecondary,
      marginTop: 2,
    },
    sketchActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sketchActionBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: mutedFill,
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.borderStrong, 0.82),
    },
    bottomDockWrap: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 16,
      gap: 10,
    },
    bottomDock: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: rgbaFromHex(theme.panel, 0.94),
      borderRadius: 20,
      padding: 10,
      overflow: 'hidden',
      boxShadow: cbModalShadow(0.14),
      ...cbTileBorder(0.2),
    },
    metricsRow: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 18,
      backgroundColor: rgbaFromHex(theme.panel, 0.84),
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.borderStrong, 0.72),
    },
    metricText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: theme.textSecondary,
    },
    metricDot: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      color: theme.textSecondary,
    },
    actionPill: {
      flex: 1,
      minHeight: 48,
      borderRadius: 18,
      backgroundColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: 10,
    },
    actionPillSubtle: {
      backgroundColor: mutedFill,
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.borderStrong, 0.82),
    },
    actionPillText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 12,
      color: theme.bgPrimary,
    },
    actionPillTextSubtle: {
      color: theme.accentHover,
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 20,
      backgroundColor: mutedFill,
      overflow: 'hidden',
      boxShadow: cbTileShadow(0.05),
      ...cbTileBorder(0.13),
    },
    menuIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: softAccent,
    },
    menuIconWrapDanger: {
      backgroundColor: rgbaFromHex(theme.danger, 0.12),
    },
    menuTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 14,
      color: theme.accentHover,
    },
    menuSubtitle: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: theme.textSecondary,
      marginTop: 3,
    },
    fontRow: {
      flexDirection: 'row',
      gap: 10,
      paddingBottom: 6,
    },
    fontChip: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.borderStrong, 0.82),
      backgroundColor: mutedFill,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    fontChipActive: {
      borderColor: theme.accent,
      backgroundColor: softAccent,
    },
    fontChipText: {
      fontSize: 12,
      color: theme.accentHover,
    },
    fontChipTextActive: {
      color: theme.accent,
    },
    folderGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    inlineForm: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
    },
    inlineStack: {
      gap: 10,
    },
    inlineInput: {
      flex: 1,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.borderStrong, 0.82),
      backgroundColor: mutedFill,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: theme.accentHover,
    },
    inlineCreateBtn: {
      borderRadius: 16,
      backgroundColor: theme.accent,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    inlineCreateBtnText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 12,
      color: theme.bgPrimary,
    },
    segmentRow: {
      flexDirection: 'row',
      gap: 10,
    },
    segmentBtn: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.borderStrong, 0.82),
      backgroundColor: mutedFill,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentBtnActive: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    segmentText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 12,
      color: theme.accentHover,
    },
    segmentTextActive: {
      color: theme.bgPrimary,
    },
    saveTemplateCard: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.accent, 0.26),
      backgroundColor: softAccent,
      padding: 16,
      gap: 6,
      overflow: 'hidden',
      boxShadow: cbTileShadow(0.06),
    },
    saveTemplateTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 14,
      color: theme.accentHover,
    },
    saveTemplateText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: theme.textSecondary,
      lineHeight: 18,
    },
    templateCard: {
      gap: 12,
      borderRadius: 22,
      backgroundColor: mutedFill,
      padding: 16,
      overflow: 'hidden',
      boxShadow: cbTileShadow(0.06),
      ...cbTileBorder(0.14),
    },
    templateTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 14,
      color: theme.accentHover,
    },
    templateSubtitle: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: theme.textSecondary,
      marginTop: 4,
      lineHeight: 17,
    },
    templateActions: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    aiChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    aiChip: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.borderStrong, 0.82),
      backgroundColor: mutedFill,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    aiChipActive: {
      borderColor: theme.accent,
      backgroundColor: softAccent,
    },
    aiChipText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 12,
      color: theme.accentHover,
    },
    aiChipTextActive: {
      color: theme.accent,
    },
    aiPromptInput: {
      minHeight: 116,
      textAlignVertical: 'top',
    },
    aiResultCard: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.accent, 0.24),
      backgroundColor: rgbaFromHex(theme.panel, 0.92),
      padding: 16,
      overflow: 'hidden',
      boxShadow: cbTileShadow(0.06),
    },
    aiResultText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      lineHeight: 22,
      color: theme.accentHover,
    },
    primaryWideBtn: {
      flex: 1,
      borderRadius: 16,
      backgroundColor: theme.accent,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryWideBtnText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 12,
      color: theme.bgPrimary,
    },
    secondaryWideBtn: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.borderStrong, 0.82),
      backgroundColor: mutedFill,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryWideBtnText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 12,
      color: theme.accentHover,
    },
  });
}
