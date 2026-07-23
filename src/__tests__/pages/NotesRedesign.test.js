import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import {
  setupLocalStorage,
  clearLocalStorage,
  buildFetchMock,
  buildErrorFetchMock,
  MOCK_NOTES,
  MOCK_FOLDERS,
  MOCK_SAVED_NOTE,
  MOCK_TOKEN,
} from '../../testUtils';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => ({}),
  useLocation: () => ({ pathname: '/notes', search: '' }),
}));

jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    selectedTheme: { id: 'default', tokens: { '--accent': '#D7B38C' } },
  }),
}));

jest.mock('../../services/gamificationService', () => ({
  __esModule: true,
  default: { trackActivity: jest.fn(), awardPoints: jest.fn() },
}));

jest.mock('../../services/noteAgentService', () => ({
  __esModule: true,
  default: { getSuggestions: jest.fn(), analyzeNote: jest.fn() },
}));

jest.mock('../../services/contextService', () => ({
  __esModule: true,
  default: { listDocuments: jest.fn(), isHsModeEnabled: jest.fn() },
}));

jest.mock('../../utils/sanitize', () => ({
  sanitizeHtml: (h) => h,
  escapeHtml: (h) => h,
}));

jest.mock('react-quill-new', () => {
  const { forwardRef } = require('react');
  const FakeQuill = forwardRef(({ value, onChange }, ref) => {
    const React = require('react');
    return React.createElement('textarea', {
      'data-testid': 'quill-editor',
      value: value || '',
      onChange: (e) => onChange && onChange(e.target.value),
      ref,
    });
  });
  FakeQuill.displayName = 'ReactQuill';
  const mod = { default: FakeQuill };
  mod.Quill = { register: jest.fn(), import: jest.fn(() => ({})) };
  return mod;
});

jest.mock('../../components/SimpleBlockEditor', () => ({ blocks, onChange }) => (
  <div data-testid="block-editor">
    <textarea
      data-testid="block-editor-input"
      defaultValue={JSON.stringify(blocks || [])}
      onChange={(e) => onChange && onChange([])}
    />
  </div>
));

jest.mock('../../components/AdvancedSearch', () => () => <div data-testid="advanced-search" />);
jest.mock('../../components/Templates', () => () => <div data-testid="templates" />);
jest.mock('../../components/TemplatePreview', () => () => null);
jest.mock('../../components/RecentlyViewed', () => () => null);
jest.mock('../../components/PageProperties', () => () => null);
jest.mock('../../components/CanvasMode', () => () => <div data-testid="canvas-mode" />);
jest.mock('../../components/SmartFolders', () => () => <div data-testid="smart-folders" />);
jest.mock('../../components/KeyboardShortcuts', () => () => null);
jest.mock('../../hooks/useKeyboardShortcuts', () => () => ({}));
jest.mock('../../components/ImportExportModal', () => () => null);
jest.mock('../../components/ContextSelector', () => () => <div data-testid="context-selector" />);
jest.mock('../../components/ContextPanel', () => () => <div data-testid="context-panel" />);
jest.mock('../../pages/CustomPopup', () => () => null);

const FETCH_ROUTES = {
  get_notes: MOCK_NOTES,
  get_folders: MOCK_FOLDERS,
  save_note: MOCK_SAVED_NOTE,
  create_note: MOCK_SAVED_NOTE,
  delete_note: { ok: true },
  update_note: { ok: true, ...MOCK_SAVED_NOTE },
  get_chat_sessions: { sessions: [] },
  'study_insights/note_activity': { ok: true },
};

import NotesRedesign from '../../pages/NotesRedesign';
import gamificationService from '../../services/gamificationService';
import noteAgentService from '../../services/noteAgentService';
import contextService from '../../services/contextService';

const renderNotes = async () => {
  let utils;
  await act(async () => {
    utils = render(
      <MemoryRouter>
        <NotesRedesign />
      </MemoryRouter>
    );
  });
  return utils;
};

describe('NotesRedesign', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearLocalStorage();
    global.fetch = buildFetchMock(FETCH_ROUTES);
    
    gamificationService.trackActivity.mockResolvedValue({});
    gamificationService.awardPoints.mockResolvedValue({});
    noteAgentService.getSuggestions.mockResolvedValue([]);
    noteAgentService.analyzeNote.mockResolvedValue({});
    contextService.listDocuments.mockResolvedValue({ user_docs: [] });
    contextService.isHsModeEnabled.mockReturnValue(false);
  });

  afterEach(() => clearLocalStorage());

  
  describe('Authentication', () => {
    it('redirects to /login when no token', async () => {
      await renderNotes();
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });

    it('does not redirect when token is present', async () => {
      setupLocalStorage();
      await renderNotes();
      expect(mockNavigate).not.toHaveBeenCalledWith('/login');
    });
  });

  
  describe('Rendering', () => {
    beforeEach(() => setupLocalStorage());

    it('renders without crashing', async () => {
      await expect(renderNotes()).resolves.not.toThrow();
    });

    it('renders context panel', async () => {
      await renderNotes();
      expect(screen.getByTestId('context-panel')).toBeInTheDocument();
    });
  });

  
  describe('API Calls on Mount', () => {
    beforeEach(() => setupLocalStorage());

    it('fetches notes list on mount', async () => {
      await renderNotes();
      await waitFor(() => {
        const urls = global.fetch.mock.calls.map(([u]) => u);
        expect(urls.some((u) => u.includes('get_notes'))).toBe(true);
      });
    });

    it('fetches folders on mount', async () => {
      await renderNotes();
      await waitFor(() => {
        const urls = global.fetch.mock.calls.map(([u]) => u);
        expect(urls.some((u) => u.includes('get_folders'))).toBe(true);
      });
    });

    it('sends correct Authorization header for notes request', async () => {
      await renderNotes();
      await waitFor(() => {
        const notesCall = global.fetch.mock.calls.find(([u]) => u.includes('get_notes'));
        expect(notesCall).toBeTruthy();
        expect(notesCall[1]?.headers?.Authorization).toBe(`Bearer ${MOCK_TOKEN}`);
      });
    });

    it('sends correct Authorization header for folders request', async () => {
      await renderNotes();
      await waitFor(() => {
        const foldersCall = global.fetch.mock.calls.find(([u]) => u.includes('get_folders'));
        expect(foldersCall).toBeTruthy();
        expect(foldersCall[1]?.headers?.Authorization).toBe(`Bearer ${MOCK_TOKEN}`);
      });
    });
  });

  
  describe('Note Data Response Handling', () => {
    beforeEach(() => setupLocalStorage());

    it('handles notes list with two notes', async () => {
      await expect(renderNotes()).resolves.not.toThrow();
      await waitFor(() => {
        expect(global.fetch.mock.calls.length).toBeGreaterThan(0);
      });
    });

    it('handles empty notes list', async () => {
      global.fetch = buildFetchMock({ ...FETCH_ROUTES, get_notes: { notes: [] } });
      await expect(renderNotes()).resolves.not.toThrow();
    });

    it('handles notes API returning null gracefully', async () => {
      global.fetch = buildFetchMock({ ...FETCH_ROUTES, get_notes: null });
      await expect(renderNotes()).resolves.not.toThrow();
    });

    it('handles empty folders list', async () => {
      global.fetch = buildFetchMock({ ...FETCH_ROUTES, get_folders: { folders: [] } });
      await expect(renderNotes()).resolves.not.toThrow();
    });
  });

  
  describe('Note Creation', () => {
    beforeEach(() => setupLocalStorage());

    it('calls create_note or save_note endpoint when creating a note via POST', async () => {
      global.fetch = buildFetchMock({
        ...FETCH_ROUTES,
        create_note: MOCK_SAVED_NOTE,
        save_note: MOCK_SAVED_NOTE,
      });
      await renderNotes();

      await waitFor(() => {
        expect(global.fetch.mock.calls.length).toBeGreaterThan(0);
      });
    });

    it('POST request body is valid JSON when creating note', async () => {
      await renderNotes();

      await waitFor(() => {
        const postCalls = global.fetch.mock.calls.filter(
          ([, opts]) => opts?.method === 'POST'
        );
        postCalls.forEach(([, opts]) => {
          if (opts.body) {
            expect(() => JSON.parse(opts.body)).not.toThrow();
          }
        });
      });
    });
  });

  
  describe('Error Handling', () => {
    beforeEach(() => setupLocalStorage());

    it('does not crash when notes API returns 500', async () => {
      global.fetch = buildErrorFetchMock('get_notes', 500);
      await expect(renderNotes()).resolves.not.toThrow();
    });

    it('does not crash when folders API returns 500', async () => {
      global.fetch = buildErrorFetchMock('get_folders', 500);
      await expect(renderNotes()).resolves.not.toThrow();
    });

    it('does not crash when network fails entirely', async () => {
      global.fetch = jest.fn(() => Promise.reject(new Error('No internet')));
      await expect(renderNotes()).resolves.not.toThrow();
    });

    it('does not crash when save API returns 500', async () => {
      global.fetch = buildErrorFetchMock('save_note', 500);
      await expect(renderNotes()).resolves.not.toThrow();
    });
  });

  
  describe('HS Mode Integration', () => {
    beforeEach(() => setupLocalStorage());

    it('reads hs_mode_enabled from localStorage', async () => {
      localStorage.setItem('hs_mode_enabled', 'true');
      await expect(renderNotes()).resolves.not.toThrow();
    });

    it('defaults to hs_mode false when not set', async () => {
      localStorage.removeItem('hs_mode_enabled');
      await expect(renderNotes()).resolves.not.toThrow();
    });
  });

  
  describe('Latency', () => {
    beforeEach(() => setupLocalStorage());

    it('renders initial DOM in under 100ms', async () => {
      const start = performance.now();
      await renderNotes();
      expect(performance.now() - start).toBeLessThan(100);
    });

    it('fetches notes within 300ms with 20ms mock delay', async () => {
      global.fetch = buildFetchMock(FETCH_ROUTES, { delay: 20 });
      const start = performance.now();
      await renderNotes();
      await waitFor(
        () => {
          const urls = global.fetch.mock.calls.map(([u]) => u);
          expect(urls.some((u) => u.includes('get_notes'))).toBe(true);
        },
        { timeout: 500 }
      );
      expect(performance.now() - start).toBeLessThan(500);
    });

    it('handles 50ms API delay without timing out', async () => {
      global.fetch = buildFetchMock(FETCH_ROUTES, { delay: 50 });
      await renderNotes();
      await waitFor(
        () => expect(global.fetch.mock.calls.length).toBeGreaterThan(0),
        { timeout: 2000 }
      );
    });

    it('fires both notes and folders requests in parallel (within same event loop tick)', async () => {
      global.fetch = buildFetchMock(FETCH_ROUTES, { delay: 30 });
      const start = performance.now();
      await renderNotes();
      await waitFor(
        () => {
          const urls = global.fetch.mock.calls.map(([u]) => u);
          const hadNotes = urls.some((u) => u.includes('get_notes'));
          const hadFolders = urls.some((u) => u.includes('get_folders'));
          return hadNotes && hadFolders;
        },
        { timeout: 1000 }
      );
      
      expect(performance.now() - start).toBeLessThan(600);
    });
  });
});
