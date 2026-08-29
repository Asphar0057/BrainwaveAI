import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ContextHubWorkspace from '../../pages/ContextHubWorkspace';
import contextService from '../../services/contextService';
import { queuedAIJsonFetch } from '../../services/aiJobService';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../services/contextService', () => ({
  __esModule: true,
  default: {
    listDocuments: jest.fn(),
    listFolders: jest.fn(),
    getProgress: jest.fn(),
    uploadDocument: jest.fn(),
    createFolder: jest.fn(),
    updateFolder: jest.fn(),
    deleteFolder: jest.fn(),
    moveDocumentToFolder: jest.fn(),
    deleteDocument: jest.fn(),
  },
}));

jest.mock('../../services/aiJobService', () => ({ queuedAIJsonFetch: jest.fn() }));

const documents = {
  user_docs: [
    { doc_id: 'ready-1', filename: 'Biology notes.pdf', subject: 'biology', chunk_count: 14, status: 'ready' },
    { doc_id: 'pending-1', filename: 'Still indexing.pdf', subject: 'biology', status: 'processing' },
  ],
  hs_docs: [{ doc_id: 'hs-1', filename: 'Physics curriculum.pdf', subject: 'physics', chunk_count: 8, status: 'ready' }],
};

function renderWorkspace() {
  return render(<MemoryRouter><ContextHubWorkspace /></MemoryRouter>);
}

describe('ContextHubWorkspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    contextService.listDocuments.mockResolvedValue(documents);
    contextService.listFolders.mockResolvedValue({ folders: [] });
    contextService.getProgress.mockResolvedValue({ doc_progress: [] });
  });

  it('loads every source scope and prevents unready documents from entering the deck', async () => {
    renderWorkspace();
    expect(await screen.findByText('Biology notes.pdf')).toBeInTheDocument();
    expect(screen.getByText('Physics curriculum.pdf')).toBeInTheDocument();
    const pending = screen.getByRole('button', { name: /Still indexing/i });
    expect(pending).toBeDisabled();
    expect(screen.getByText('Indexing')).toBeInTheDocument();
  });

  it('uses the same full-height Social Hub chrome and sidebar structure as the core learning pages', async () => {
    const { container } = renderWorkspace();
    await screen.findByText('Biology notes.pdf');

    expect(container.querySelector('.cxh-root.with-social-chrome')).toBeInTheDocument();
    expect(container.querySelector('.shc-shell')).toBeInTheDocument();
    expect(container.querySelector('.shc-sidebar')).toBeInTheDocument();
    expect(container.querySelector('.shc-main > .cb-tile-texture')).toBeInTheDocument();
    expect(container.querySelector('.cxh-main')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Collapse Social Hub sidebar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Social Hub' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Dashboard' })).toHaveLength(2);
  });

  it('normalizes stale deck storage and passes exact source ids to outputs', async () => {
    localStorage.setItem('ctx_selected_doc_ids', JSON.stringify(['ready-1', 'ready-1', 'missing', 'pending-1']));
    renderWorkspace();
    await screen.findAllByText('Biology notes.pdf');
    await waitFor(() => expect(JSON.parse(localStorage.getItem('ctx_selected_doc_ids'))).toEqual(['ready-1']));
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(mockNavigate).toHaveBeenCalledWith('/ai-chat', expect.objectContaining({
      state: expect.objectContaining({ contextDocIds: ['ready-1'] }),
    }));
  });

  it.each([
    ['Cards', '/flashcards'],
    ['Quiz', '/question-bank'],
    ['Map', '/knowledge-map'],
  ])('routes the %s output with the selected deck', async (label, path) => {
    localStorage.setItem('ctx_selected_doc_ids', JSON.stringify(['ready-1']));
    renderWorkspace();
    await screen.findAllByText('Biology notes.pdf');
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(mockNavigate).toHaveBeenCalledWith(path, expect.objectContaining({
      state: expect.objectContaining({ contextDocIds: ['ready-1'] }),
    }));
  });

  it('records Notes usage only after a note is successfully created', async () => {
    localStorage.setItem('token', 'token');
    localStorage.setItem('username', 'learner');
    localStorage.setItem('ctx_selected_doc_ids', JSON.stringify(['ready-1']));
    queuedAIJsonFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'note-1' }) });
    renderWorkspace();
    await screen.findAllByText('Biology notes.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/notes/editor/note-1'));
    const stats = JSON.parse(localStorage.getItem('ctx_file_action_stats'));
    expect(stats['ready-1'].actions.notes).toBe(1);
  });

  it('does not record Notes usage when generation fails', async () => {
    localStorage.setItem('token', 'token');
    localStorage.setItem('username', 'learner');
    localStorage.setItem('ctx_selected_doc_ids', JSON.stringify(['ready-1']));
    queuedAIJsonFetch.mockResolvedValue({ ok: false, status: 503 });
    renderWorkspace();
    await screen.findAllByText('Biology notes.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Notes could not be created');
    expect(localStorage.getItem('ctx_file_action_stats')).toBeNull();
  });

  it.each([
    ['slides.pptx', 100, 'Unsupported file type'],
    ['empty.pdf', 0, 'This file is empty'],
    ['huge.pdf', 50 * 1024 * 1024 + 1, 'larger than 50 MB'],
  ])('rejects invalid upload %s before making a request', async (name, size, message) => {
    const { container } = renderWorkspace();
    await screen.findByText('Biology notes.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    const file = new File([new Uint8Array(Math.min(size, 1))], name, { type: 'application/octet-stream' });
    Object.defineProperty(file, 'size', { value: size });
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
    expect(await screen.findByText(new RegExp(message, 'i'))).toBeInTheDocument();
    expect(contextService.uploadDocument).not.toHaveBeenCalled();
  });

  it('keeps the workspace recoverable when documents fail but ancillary data loads', async () => {
    contextService.listDocuments.mockRejectedValue(new Error('Source service unavailable'));
    renderWorkspace();
    expect(await screen.findByRole('alert')).toHaveTextContent('Source service unavailable');
    expect(screen.getByText('No matching sources')).toBeInTheDocument();
  });
});
