import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import PublicChatView from '../../pages/PublicChatView';
jest.mock('marked', () => ({ marked: { parse: value => value } }));
jest.mock('react-router-dom', () => ({...jest.requireActual('react-router-dom'),useParams: () => ({token:'test-share'})}));
it('offers retry for an outage and distinguishes a missing link', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({status:500,ok:false}).mockResolvedValueOnce({status:404,ok:false});
  render(<MemoryRouter><PublicChatView/></MemoryRouter>);
  expect(await screen.findByRole('heading',{name:'Could not load shared content'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Try again'}));
  expect(await screen.findByRole('heading',{name:'Link not found'})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Try again'})).not.toBeInTheDocument();
});
