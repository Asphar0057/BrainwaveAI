import { useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AIMediaNotesScreen from './AIMediaNotesScreen';
import NotesLibraryScreen from './notes/NotesLibraryScreen';
import NotesGeneratorScreen from './notes/NotesGeneratorScreen';
import NotesTemplatesScreen from './notes/NotesTemplatesScreen';
import NoteEditorScreen from './notes/NoteEditorScreen';
import NotesTrashScreen from './notes/NotesTrashScreen';
import NotesCanvasScreen from './notes/NotesCanvasScreen';
import {
  type Folder,
  type Note,
  type NotesRootProps,
  prepareNotesScreen,
  useNotesFontsLoaded,
} from './notes/NotesShared';
import { useAppTheme } from '../contexts/ThemeContext';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type NotesStackParamList = {
  NotesLibrary: undefined;
  NotesGenerator: undefined;
  NotesTemplates: undefined;
  NoteEditor: { note: Note; folders: Folder[] };
  NotesCanvas: undefined;
  NotesTrash: undefined;
  MediaNotes: undefined;
};

const NotesStack = createNativeStackNavigator<NotesStackParamList>();

type CanvasSession = {
  source: 'library' | 'editor';
  blockId?: string;
  initialData?: string;
};

type CanvasReturn = {
  nonce: number;
  status: 'saved' | 'cancelled';
  blockId?: string;
  canvasData?: string;
  canvasPreview?: string;
};

export default function NotesScreen({ user, onBack }: NotesRootProps) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  prepareNotesScreen(selectedTheme, layout);
  const fontsLoaded = useNotesFontsLoaded();
  const [refreshTick, setRefreshTick] = useState(0);
  const [canvasSession, setCanvasSession] = useState<CanvasSession | null>(null);
  const [canvasReturn, setCanvasReturn] = useState<CanvasReturn | null>(null);

  if (!fontsLoaded) return null;

  return (
    <NotesStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        gestureDirection: 'horizontal',
      }}
    >
      <NotesStack.Screen name="NotesLibrary">
        {({ navigation }) => (
          <NotesLibraryScreen
            user={user}
            onBack={onBack}
            refreshTick={refreshTick}
            onCreated={() => setRefreshTick((value) => value + 1)}
            onOpenTrash={() => navigation.navigate('NotesTrash')}
            onOpenMedia={() => navigation.navigate('MediaNotes')}
            onOpenCanvas={() => {
              setCanvasReturn(null);
              setCanvasSession({ source: 'library' });
              navigation.navigate('NotesCanvas');
            }}
            onOpenGenerator={() => navigation.navigate('NotesGenerator')}
            onOpenEditor={(note, folders) => navigation.navigate('NoteEditor', { note, folders })}
          />
        )}
      </NotesStack.Screen>
      <NotesStack.Screen name="NotesGenerator">
        {({ navigation }) => (
          <NotesGeneratorScreen
            user={user}
            onBack={() => navigation.goBack()}
            onCreated={() => setRefreshTick((value) => value + 1)}
            onOpenLibrary={() => navigation.goBack()}
            onOpenMedia={() => navigation.navigate('MediaNotes')}
            onOpenTemplates={() => navigation.navigate('NotesTemplates')}
            onOpenTrash={() => navigation.navigate('NotesTrash')}
            onOpenCanvas={() => {
              setCanvasReturn(null);
              setCanvasSession({ source: 'library' });
              navigation.navigate('NotesCanvas');
            }}
            onOpenEditor={(note, folders) => navigation.navigate('NoteEditor', { note, folders })}
          />
        )}
      </NotesStack.Screen>
      <NotesStack.Screen name="NotesTemplates">
        {({ navigation }) => (
          <NotesTemplatesScreen
            user={user}
            onBack={() => navigation.goBack()}
            onCreated={() => setRefreshTick((value) => value + 1)}
            onOpenEditor={(note, folders) => navigation.navigate('NoteEditor', { note, folders })}
          />
        )}
      </NotesStack.Screen>
      <NotesStack.Screen name="NoteEditor">
        {({ route, navigation }) => (
          <NoteEditorScreen
            user={user}
            note={route.params.note}
            folders={route.params.folders}
            onBack={() => navigation.goBack()}
            onSaved={() => {
              setRefreshTick((value) => value + 1);
            }}
            onMovedToTrash={() => {
              setRefreshTick((value) => value + 1);
            }}
            onFavoriteChanged={() => {
              setRefreshTick((value) => value + 1);
            }}
            onOpenCanvas={({ blockId, initialData }) => {
              setCanvasReturn(null);
              setCanvasSession({ source: 'editor', blockId, initialData });
              navigation.navigate('NotesCanvas');
            }}
            onCanvasReturnHandled={() => setCanvasReturn(null)}
            canvasReturn={canvasReturn}
          />
        )}
      </NotesStack.Screen>
      <NotesStack.Screen name="NotesCanvas">
        {({ navigation }) => (
          <NotesCanvasScreen
            user={user}
            initialData={canvasSession?.initialData}
            mode={canvasSession?.source === 'editor' ? 'attachment' : 'note'}
            onBack={() => {
              if (canvasSession?.source === 'editor') {
                setCanvasReturn({
                  nonce: Date.now(),
                  status: 'cancelled',
                  blockId: canvasSession.blockId,
                });
              }
              setCanvasSession(null);
              navigation.goBack();
            }}
            onSaved={(payload) => {
              if (canvasSession?.source === 'editor') {
                setCanvasReturn({
                  nonce: Date.now(),
                  status: 'saved',
                  blockId: canvasSession.blockId,
                  canvasData: payload?.canvasData,
                  canvasPreview: payload?.previewData,
                });
              } else {
                setRefreshTick((value) => value + 1);
              }
              setCanvasSession(null);
              navigation.goBack();
            }}
          />
        )}
      </NotesStack.Screen>
      <NotesStack.Screen name="NotesTrash">
        {({ navigation }) => (
          <NotesTrashScreen
            user={user}
            onBack={() => navigation.goBack()}
            onChanged={() => setRefreshTick((value) => value + 1)}
          />
        )}
      </NotesStack.Screen>
      <NotesStack.Screen name="MediaNotes">
        {({ navigation }) => (
          <AIMediaNotesScreen
            user={user}
            onBack={() => navigation.goBack()}
          />
        )}
      </NotesStack.Screen>
    </NotesStack.Navigator>
  );
}
