import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}));
jest.mock('../../hooks/useSharedWebSocket', () => () => ({ isConnected: true }));
jest.mock('../../components/SocialHubChrome', () => ({ sidebarLead, children }) => (
  <div>{sidebarLead}{children}</div>
));
jest.mock('../../pages/BattleNotification', () => () => null);

import QuizBattle from '../../pages/QuizBattle';

const response = (data) => ({ ok: true, json: async () => data });

describe('QuizBattle creator', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    global.fetch = jest.fn((url, options = {}) => {
      if (url.includes('/friends')) {
        return Promise.resolve(response({ friends: [{ id: 9, username: 'Ada' }] }));
      }
      if (url.includes('/create_quiz_battle') && options.method === 'POST') {
        return Promise.resolve(response({ status: 'success', battle_id: 99 }));
      }
      return Promise.resolve(response({ battles: [] }));
    });
  });

  afterEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it.each([
    ['Classic Highest score wins.', 'classic', 600, '10 min Extended'],
    ['Speed Battle Highest score wins; completion time breaks a tie.', 'speed', 300, null],
    ['Blitz 15 seconds per question. Think fast.', 'blitz', 75, null],
    ['Sudden Death One wrong answer ends your run.', 'sudden_death', 150, null],
  ])('submits the %s rules exactly', async (accessibleName, mode, expectedTime, timerName) => {
    render(<MemoryRouter><QuizBattle /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Create battle' }));

    await screen.findByRole('option', { name: 'Ada' });
    const comboboxes = screen.getAllByRole('combobox');
    fireEvent.change(comboboxes[0], { target: { value: '9' } });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Physics' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: accessibleName }));
    if (timerName) fireEvent.click(screen.getByRole('button', { name: timerName }));
    fireEvent.click(screen.getByRole('button', { name: 'Send challenge' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/create_quiz_battle'),
      expect.objectContaining({ method: 'POST' }),
    ));
    const call = global.fetch.mock.calls.find(([url]) => url.includes('/create_quiz_battle'));
    expect(JSON.parse(call[1].body)).toEqual(expect.objectContaining({
      game_mode: mode,
      question_count: 5,
      time_limit_seconds: expectedTime,
    }));
  });
});
