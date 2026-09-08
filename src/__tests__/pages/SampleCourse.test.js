import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SampleCourse from '../../pages/SampleCourse';
jest.mock('../../services/productService', () => ({ sampleEvent: jest.fn() }));
it('lets an anonymous learner get corrective feedback and apply it to a fresh question', () => {
  render(<MemoryRouter><SampleCourse /></MemoryRouter>);
  expect(screen.getByText(/No account needed/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Check my answer' })).toBeDisabled();
  fireEvent.click(screen.getByRole('radio', { name: '1/3' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check my answer' }));
  expect(screen.getByText('The answer is 1/4.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Try a fresh question/ }));
  fireEvent.click(screen.getByRole('radio', { name: '2/5' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check my answer' }));
  fireEvent.click(screen.getByRole('button', { name: /See my results/ }));
  expect(screen.getByRole('heading', { name: '1 of 2 correct' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Create my workspace' })).toHaveAttribute('href', '/register');
});
