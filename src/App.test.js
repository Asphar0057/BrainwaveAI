import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

test('renders the landing page at the root route', () => {
  sessionStorage.setItem('cb_intro_seen', 'true');

  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>
  );

  expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument();
});
