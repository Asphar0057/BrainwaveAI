import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ContextFileAnalysis from '../../pages/ContextFileAnalysis';
import contextService from '../../services/contextService';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () => ({ pathname: '/contexthub/file/doc-1' }),
  useNavigate: () => mockNavigate,
  useParams: () => ({ docId: 'doc-1' }),
}));

jest.mock('../../services/contextService', () => ({
  __esModule: true,
  default: { listDocuments: jest.fn() },
}));

jest.mock('../../services/aiJobService', () => ({ queuedAIJsonFetch: jest.fn() }));

const doc = {
  doc_id: 'doc-1',
  filename: 'Cell biology.pdf',
  subject: 'biology',
  status: 'ready',
  chunk_count: 24,
  created_at: 'not-a-date',
  ai_summary: 'A grounded overview of cellular structure and transport.',
  key_concepts: ['Cell membrane', 'Osmosis'],
  topic_tags: ['Osmosis', 'Diffusion'],
};

describe('ContextFileAnalysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 'token');
    localStorage.setItem('username', 'learner');
    contextService.listDocuments.mockResolvedValue({ user_docs: [doc] });
  });

  it('shows indexed analysis and safely renders malformed dates', async () => {
    render(<MemoryRouter><ContextFileAnalysis /></MemoryRouter>);
    expect(await screen.findByText('Cell biology.pdf')).toBeInTheDocument();
    expect(screen.getByText('What this source covers')).toBeInTheDocument();
    expect(screen.getByText('A grounded overview of cellular structure and transport.')).toBeInTheDocument();
    expect(screen.getByText('Diffusion')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/i)).not.toBeInTheDocument();
  });

  it('opens a single-source action without destroying the existing deck', async () => {
    localStorage.setItem('ctx_selected_doc_ids', JSON.stringify(['existing-1', 'existing-2']));
    render(<MemoryRouter><ContextFileAnalysis /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Chat' }));
    expect(JSON.parse(localStorage.getItem('ctx_selected_doc_ids'))).toEqual(['existing-1', 'existing-2']);
    expect(mockNavigate).toHaveBeenCalledWith('/ai-chat', expect.objectContaining({
      state: expect.objectContaining({ contextDocIds: ['doc-1'] }),
    }));
  });

  it('reports a full deck inline instead of interrupting with an alert', async () => {
    localStorage.setItem('ctx_selected_doc_ids', JSON.stringify(Array.from({ length: 8 }, (_, index) => `doc-${index + 2}`)));
    render(<MemoryRouter><ContextFileAnalysis /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Add to Context Deck' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Context Deck is full');
    expect(JSON.parse(localStorage.getItem('ctx_selected_doc_ids'))).toHaveLength(8);
  });

  it('offers retry when the file is missing', async () => {
    contextService.listDocuments.mockResolvedValueOnce({ user_docs: [] }).mockResolvedValueOnce({ user_docs: [doc] });
    render(<MemoryRouter><ContextFileAnalysis /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('Cell biology.pdf')).toBeInTheDocument());
  });
});
