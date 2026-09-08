import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Link, useLocation } from 'react-router-dom';
import { NavigationHistoryProvider, updateNavigationHistory } from '../../components/NavigationHistory';
import ToolNavigation from '../../components/ToolNavigation';

afterEach(() => sessionStorage.clear());
function Pages() {
  const location = useLocation();
  return <><div data-testid="path">{location.pathname}</div><ToolNavigation /><Link to="/notes/my-notes">Open library</Link><Link to="/notes/editor/1">Open editor</Link></>;
}
test('back names the actual origin and walks history instead of pushing another parent page', () => {
  render(<MemoryRouter initialEntries={['/flashcards']}><NavigationHistoryProvider><Pages /></NavigationHistoryProvider></MemoryRouter>);
  fireEvent.click(screen.getByText('Open library'));
  expect(screen.getByRole('link', { name: 'Back to Flashcards' })).toHaveAttribute('href', '/flashcards');
  fireEvent.click(screen.getByText('Open editor'));
  fireEvent.click(screen.getByRole('link', { name: 'Back to Note library' }));
  expect(screen.getByTestId('path')).toHaveTextContent('/notes/my-notes');
  fireEvent.click(screen.getByRole('link', { name: 'Back to Flashcards' }));
  expect(screen.getByTestId('path')).toHaveTextContent('/flashcards');
});
test('replace and forward preserve history; a new branch drops forward entries', () => {
  const a = { key: 'a', pathname: '/notes', search: '' };
  const b = { key: 'b', pathname: '/flashcards', search: '?view=queue' };
  let h = updateNavigationHistory({ entries: [], index: -1 }, a, 'POP');
  h = updateNavigationHistory(h, b, 'PUSH');
  h = updateNavigationHistory(h, { ...b, key: 'c' }, 'REPLACE');
  expect(h.entries).toHaveLength(2);
  h = updateNavigationHistory(h, a, 'POP');
  h = updateNavigationHistory(h, { ...b, key: 'c' }, 'POP');
  expect(h.index).toBe(1);
  h = updateNavigationHistory(h, a, 'POP');
  h = updateNavigationHistory(h, { key: 'd', pathname: '/analytics' }, 'PUSH');
  expect(h.entries.map(e => e.key)).toEqual(['a', 'd']);
});
