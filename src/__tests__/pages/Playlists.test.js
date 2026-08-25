import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PlaylistsPage from '../../pages/PlaylistsPage';
import PlaylistDetailPage from '../../pages/PlaylistDetailPage';

jest.mock('../../components/SocialHubChrome', () => ({ children, sidebarLead, sidebarTail }) => (
  <div>{sidebarLead}{sidebarTail}{children}</div>
));
jest.mock('../../components/ImportExportModal', () => () => null);
jest.mock('../../components/PlaylistShareModal', () => () => null);
jest.mock('../../components/MathRenderer', () => ({ content }) => <div>{content}</div>);
jest.mock('../../utils/mathMarkdown', () => ({ renderMarkdownWithMath: value => value }));

const jsonResponse = (body, ok = true, status = ok ? 200 : 400) => ({
  ok,
  status,
  json: async () => body,
});

const playlist = {
  id: 42,
  uid: 'playlist-public-uid',
  title: 'Systems Thinking',
  description: 'A useful path',
  creator: { username: 'owner', first_name: 'Owner' },
  is_owner: true,
  is_following: false,
  is_public: true,
  follower_count: 0,
  items: [{ id: 7, title: 'Feedback loops', item_type: 'external_link', url: 'https://example.com' }],
  user_progress: { completed_items: [], progress_percentage: 0 },
};

beforeEach(() => {
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('username', 'owner');
  global.fetch = jest.fn();
});

afterEach(() => jest.restoreAllMocks());

it('associates create fields and blocks an empty playlist title', async () => {
  fetch.mockResolvedValue(jsonResponse({ playlists: [] }));
  render(<MemoryRouter><PlaylistsPage /></MemoryRouter>);

  fireEvent.click((await screen.findAllByRole('button', { name: /new playlist/i }))[0]);
  const title = screen.getByLabelText('Title');
  expect(title).toBeRequired();
  expect(screen.getByLabelText('Difficulty')).toHaveValue('intermediate');
  expect(screen.getByLabelText('Estimated hours')).toBeInTheDocument();

  expect(title.closest('form').checkValidity()).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('lets an owner track completion and sends the public playlist route safely', async () => {
  fetch
    .mockResolvedValueOnce(jsonResponse(playlist))
    .mockResolvedValueOnce(jsonResponse({ completed_items: [7], progress_percentage: 100 }));

  render(
    <MemoryRouter initialEntries={['/playlists/playlist-public-uid']}>
      <Routes><Route path="/playlists/:playlistId" element={<PlaylistDetailPage />} /></Routes>
    </MemoryRouter>
  );

  const complete = await screen.findByRole('button', { name: /mark feedback loops complete/i });
  fireEvent.click(complete);
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/playlists/playlist-public-uid/progress?item_id=7&completed=true'),
    expect.objectContaining({ method: 'POST' })
  ));
});

it('keeps Add Items open and explains missing required fields', async () => {
  fetch.mockResolvedValue(jsonResponse(playlist));
  render(
    <MemoryRouter initialEntries={['/playlists/playlist-public-uid']}>
      <Routes><Route path="/playlists/:playlistId" element={<PlaylistDetailPage />} /></Routes>
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByRole('button', { name: /^add item$/i }));
  fireEvent.click(screen.getByRole('button', { name: /add now/i }));
  expect(screen.getByRole('alert')).toHaveTextContent('Add a title');
  expect(screen.getByRole('dialog', { name: /add resources/i })).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('uses the numeric database id for AI conversions from UID routes', async () => {
  fetch
    .mockResolvedValueOnce(jsonResponse(playlist))
    .mockResolvedValueOnce(jsonResponse({ success: true, note_id: 9 }));
  render(
    <MemoryRouter initialEntries={['/playlists/playlist-public-uid']}>
      <Routes><Route path="/playlists/:playlistId" element={<PlaylistDetailPage />} /></Routes>
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Notes' }));
  await waitFor(() => expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ playlist_id: 42 }));
});

it('exposes and executes follow and fork for a non-owner', async () => {
  const sharedPlaylist = { ...playlist, is_owner: false, creator: { username: 'someone-else' } };
  fetch
    .mockResolvedValueOnce(jsonResponse(sharedPlaylist))
    .mockResolvedValueOnce(jsonResponse({ message: 'Successfully following playlist' }))
    .mockResolvedValueOnce(jsonResponse({ id: 88, uid: 'forked-playlist' }));

  render(
    <MemoryRouter initialEntries={['/playlists/playlist-public-uid']}>
      <Routes><Route path="/playlists/:playlistId" element={<PlaylistDetailPage />} /></Routes>
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByRole('button', { name: /follow path/i }));
  await waitFor(() => expect(fetch.mock.calls[1][1].method).toBe('POST'));
  fireEvent.click(screen.getByRole('button', { name: /^fork$/i }));
  await waitFor(() => expect(fetch.mock.calls[2][0]).toContain('/playlists/playlist-public-uid/fork'));
});
