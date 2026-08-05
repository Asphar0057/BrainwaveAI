import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SlideExplorer from '../../pages/SlideExplorer';
import slideExplorerAgentService from '../../services/slideExplorerAgentService';

jest.mock('../../services/slideExplorerAgentService', () => ({
  __esModule: true,
  default: { analyzeSlide: jest.fn() },
}));

const jsonResponse = (body) => ({
  ok: true,
  json: async () => body,
});

describe('SlideExplorer sidebar controls', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user_id', 'test-user');
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: jest.fn(() => 'test-session') },
    });
    slideExplorerAgentService.analyzeSlide.mockResolvedValue({});
    global.fetch = jest.fn((url) => {
      if (String(url).includes('/get_uploaded_slides')) {
        return Promise.resolve(jsonResponse({
          slides: [{
            id: 'deck-1',
            filename: 'Biology.pptx',
            page_count: 2,
            extracted_text: 'Cell biology',
            uploaded_at: '2026-08-05T00:00:00Z',
          }],
        }));
      }
      if (String(url).includes('/analyze_slide/deck-1')) {
        return Promise.resolve(jsonResponse({
          slides: [{
            slide_number: 1,
            title: 'Cell structure',
            explanation: 'An introduction to the cell.',
            key_points: ['Cells are the basic unit of life.'],
          }],
        }));
      }
      return Promise.resolve(jsonResponse({}));
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('fully hides and restores the presentation sidebar', async () => {
    render(
      <MemoryRouter>
        <SlideExplorer />
      </MemoryRouter>
    );

    await userEvent.click(await screen.findByRole('button', { name: /open deck/i }));
    const hideButton = await screen.findByRole('button', { name: /hide presentation sidebar/i });

    expect(document.querySelector('.shc-sidebar')).toBeInTheDocument();
    await userEvent.click(hideButton);

    await waitFor(() => {
      expect(document.querySelector('.shc-sidebar')).not.toBeInTheDocument();
      expect(document.querySelector('.shc-body')).toHaveClass('shc-body--no-sidebar');
      expect(document.querySelector('.se-analysis-page')).toHaveClass('se-sidebar-hidden');
    });

    await userEvent.click(screen.getByRole('button', { name: /show presentation sidebar/i }));

    await waitFor(() => {
      expect(document.querySelector('.shc-sidebar')).toBeInTheDocument();
      expect(document.querySelector('.shc-body')).not.toHaveClass('shc-body--no-sidebar');
      expect(document.querySelector('.se-analysis-page')).not.toHaveClass('se-sidebar-hidden');
    });
  });
});
