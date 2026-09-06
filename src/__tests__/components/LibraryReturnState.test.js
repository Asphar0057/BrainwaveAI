import { render, screen, fireEvent } from '@testing-library/react';
import DatabaseViews from '../../components/DatabaseViews';
import { readLibraryState, writeLibraryState } from '../../utils/libraryState';

const notes = [{ id: 1, title: 'Biology', content: 'Cells', updated_at: '2026-09-01' }];
afterEach(() => { sessionStorage.clear(); localStorage.clear(); });

test('restores view, sorting and both scroll axes after the library remounts', () => {
  writeLibraryState('notes', { searchTerm: 'Bio', viewMode: 'table', sortBy: 'title', sortOrder: 'asc', scrollTop: 240, scrollLeft: 80 });
  const first = render(<DatabaseViews notes={notes} folders={[]} persistenceKey="notes" onSelectNote={() => {}} />);
  const content = first.container.querySelector('.view-content');
  expect(content.scrollTop).toBe(240);
  expect(content.scrollLeft).toBe(80);
  expect(screen.getByText('Title ↑')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Kanban' }));
  fireEvent.scroll(content, { target: { scrollTop: 120, scrollLeft: 0 } });
  first.unmount();
  const second = render(<DatabaseViews notes={notes} folders={[]} persistenceKey="notes" onSelectNote={() => {}} />);
  expect(screen.getByRole('button', { name: 'Kanban' })).toHaveAttribute('aria-pressed', 'true');
  expect(second.container.querySelector('.view-content').scrollTop).toBe(120);
  expect(readLibraryState('notes').searchTerm).toBe('Bio');
});

test('separates accounts and safely ignores invalid stored JSON', () => {
  localStorage.setItem('username', 'first');
  writeLibraryState('notes', { searchTerm: 'private query' });
  localStorage.setItem('username', 'second');
  expect(readLibraryState('notes')).toEqual({});
  sessionStorage.setItem('cerbyl.library:second:notes', '{');
  expect(readLibraryState('notes')).toEqual({});
});
