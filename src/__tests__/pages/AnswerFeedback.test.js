import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AnswerFeedback from '../../components/AnswerFeedback';
import { productRequest } from '../../services/productService';
jest.mock('../../services/productService', () => ({ productRequest: jest.fn() }));
it('preserves a report after a failed request and links the saved resolution flow', async () => {
  productRequest.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ status: 'open' });
  render(<MemoryRouter><AnswerFeedback resourceType="chat_message" resourceId={9} sources={[{ filename: 'Course.pdf', page: 4, snippet: 'An excerpt' }]} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'This answer is wrong' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'The sign is reversed.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send for review' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
  fireEvent.click(screen.getByRole('button', { name: 'Send for review' }));
  await waitFor(() => expect(screen.getByRole('link', { name: 'View reports and corrections' })).toHaveAttribute('href', '/answer-reports'));
  expect(JSON.parse(productRequest.mock.calls[1][1].body)).toEqual({ resource_type: 'chat_message', resource_id: 9, reason: 'incorrect_answer', detail: 'The sign is reversed.' });
});
