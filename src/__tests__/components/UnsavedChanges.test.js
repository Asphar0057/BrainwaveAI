import { render, act, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';

function Editor({ dirty }) { useUnsavedChanges(dirty); return <h1>Editor</h1>; }
let confirm;
beforeEach(() => { confirm = jest.spyOn(window, 'confirm').mockReturnValue(false); });
afterEach(() => { confirm.mockRestore(); });

function setup(dirty) {
  const router = createMemoryRouter([
    { path: '/library', element: <h1>Library</h1> },
    { path: '/editor', element: <Editor dirty={dirty} /> },
  ], { initialEntries: ['/library', '/editor'], initialIndex: 1 });
  render(<RouterProvider router={router} />);
  return router;
}

test('cancel keeps unsaved editor open on browser Back; confirm allows leaving', async () => {
  const router = setup(true);
  await act(async () => { await router.navigate(-1); });
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  expect(router.state.location.pathname).toBe('/editor');
  confirm.mockReturnValue(true);
  await act(async () => { await router.navigate(-1); });
  await waitFor(() => expect(router.state.location.pathname).toBe('/library'));
});

test('saved editor navigates without a warning', async () => {
  const router = setup(false);
  await act(async () => { await router.navigate(-1); });
  expect(router.state.location.pathname).toBe('/library');
  expect(confirm).not.toHaveBeenCalled();
});

test('refresh warning is removed as soon as changes are saved', () => {
  let setDirty;
  const React = require('react');
  function SavingEditor() {
    const [dirty, update] = React.useState(true);
    setDirty = update;
    return <Editor dirty={dirty} />;
  }
  const router = createMemoryRouter([{ path: '/', element: <SavingEditor /> }]);
  render(<RouterProvider router={router} />);
  const pending = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(pending);
  expect(pending.defaultPrevented).toBe(true);
  act(() => setDirty(false));
  const saved = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(saved);
  expect(saved.defaultPrevented).toBe(false);
});
