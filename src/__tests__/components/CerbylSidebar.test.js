import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import CerbylSidebar from '../../components/CerbylSidebar';
import useInstitutionSidebar from '../../hooks/useInstitutionSidebar';

function Harness({ onAction = () => {}, institution = false }) {
  const localState = useState(true);
  const institutionState = useInstitutionSidebar();
  const [open, setOpen] = institution ? institutionState : localState;
  return <MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}>
    <CerbylSidebar open={open} onOpenChange={setOpen} displayName="Maya" brandKicker={institution ? 'educator' : 'Dashboard'}
      profileTo={institution ? '/educator/profile' : '/profile'} profileLabel="My profile" profileSubtitle="Northstar"
      onEditProfile={onAction} editProfileLabel="Edit profile"
      quickLinks={[{label:'Create assignment',onClick:onAction}]}
      workspaceLinks={[{label:'Gradebook',to:'/educator/gradebook',active:true},{label:'Sign out',onClick:onAction}]} />
  </MemoryRouter>;
}

beforeEach(() => sessionStorage.clear());

it.each([false, true])('keeps collapse, focus, profile and action behavior in the shared sidebar (institution=%s)', institution => {
  const action = jest.fn();
  render(<Harness onAction={action} institution={institution} />);
  expect(screen.getByRole('link', {name:'Gradebook'})).toHaveAttribute('aria-current','page');
  fireEvent.click(screen.getByRole('button', {name:'Create assignment'}));
  fireEvent.click(screen.getByRole('button', {name:'Edit profile'}));
  expect(action).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', {name:'Collapse dashboard sidebar'}));
  expect(screen.queryByRole('button', {name:'Create assignment'})).not.toBeInTheDocument();
  expect(screen.getByRole('button', {name:'Expand dashboard sidebar'})).toHaveFocus();
  expect(screen.getByRole('link', {name:'Open profile'})).toHaveAttribute('href',institution ? '/educator/profile' : '/profile');
  fireEvent.click(screen.getByRole('button', {name:'Expand dashboard sidebar'}));
  expect(screen.getByRole('button', {name:'Collapse dashboard sidebar'})).toHaveFocus();
  fireEvent.click(screen.getByRole('button', {name:'Sign out'}));
  expect(action).toHaveBeenCalledTimes(3);
});

it('keeps the institution sidebar collapse preference across page changes', () => {
  const page = render(<Harness institution />);
  fireEvent.click(screen.getByRole('button', {name:'Collapse dashboard sidebar'}));
  page.unmount();
  render(<Harness institution />);
  expect(screen.getByRole('button', {name:'Expand dashboard sidebar'})).toBeInTheDocument();
});

it('keeps navigation reachable on mobile and closes after choosing an action', () => {
  const matchMedia = window.matchMedia;
  window.matchMedia = jest.fn(() => ({ matches:true }));
  try {
    const action = jest.fn();
    render(<Harness institution onAction={action} />);
    fireEvent.click(screen.getByRole('button', {name:'Expand dashboard sidebar'}));
    fireEvent.click(screen.getByRole('button', {name:'Create assignment'}));
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', {name:'Expand dashboard sidebar'})).toHaveFocus();
  } finally { window.matchMedia = matchMedia; }
});
