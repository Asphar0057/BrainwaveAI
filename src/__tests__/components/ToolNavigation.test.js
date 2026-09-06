import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom';
import ToolNavigation from '../../components/ToolNavigation';
import { getToolNavigation, isActiveToolPath } from '../../utils/toolNavigation';

afterEach(() => localStorage.clear());
it('returns a directly opened note to its library without browser history', () => {
  render(<MemoryRouter initialEntries={['/notes/editor/42']}><Routes>
    <Route path="/notes/editor/:id" element={<ToolNavigation/>}/>
    <Route path="/notes/dashboard" element={<h1>Note library destination</h1>}/>
  </Routes></MemoryRouter>);
  expect(screen.getByText('Note editor').closest('[aria-current]')).toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('link', {name:'Back to Note library'}));
  expect(screen.getByRole('heading', {name:'Note library destination'})).toBeInTheDocument();
});
it('shows the current section and returns to the selected role dashboard', () => {
  localStorage.setItem('cerbyl.activeWorkspace','student');
  render(<MemoryRouter initialEntries={['/flashcards']}><ToolNavigation currentLabel="Study Queue"/></MemoryRouter>);
  expect(screen.getByRole('link',{name:'Back to Dashboard'})).toHaveAttribute('href','/student');
  expect(screen.getByText('Study Queue')).toBeInTheDocument();
});
it.each([
  ['/notes/ai-media/42','/notes/ai-media/my-notes','Media library'],
  ['/contexthub/file/5','/contexthub','ContextHub'],
  ['/playlists/9','/playlists','Playlists'],
  ['/solo-quiz/session','/solo-quiz','Solo Quiz'],
  ['/educator/gradebook','/educator','Dashboard'],
  ['/analytics','/dashboard-cerbyl','Dashboard'],
])('resolves the parent for %s', (path,parentPath,parentLabel) => {
  expect(getToolNavigation(path)).toEqual(expect.objectContaining({parentPath,parentLabel}));
});
it('matches route boundaries when highlighting a tool', () => {
  expect(isActiveToolPath('/notes/editor/42','/notes')).toBe(true);
  expect(isActiveToolPath('/notes-other','/notes')).toBe(false);
});
