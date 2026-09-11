import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import useCerbylCardMotion, { INSTITUTION_CARDS } from '../../hooks/useCerbylCardMotion';

function Surface({ onClick, extra = false, direct = false }) {
  const motion = useCerbylCardMotion(direct ? undefined : INSTITUTION_CARDS);
  if (direct) return <button {...motion} className="cb-mod">Main tool</button>;
  return <div {...motion}>
    <button className="ci-module" onClick={onClick}><span>Teacher tool</span></button>
    {extra && <section className="b2b-panel"><button onClick={onClick}>Loaded lesson</button></section>}
    <button className="ci-module" disabled>Unavailable tool</button>
    <div>Outside cards</div>
  </div>;
}

let frames, queries, originalMatchMedia;
beforeEach(() => {
  frames = new Map();
  queries = new Map();
  originalMatchMedia = window.matchMedia;
  window.matchMedia = jest.fn(query => {
    if (!queries.has(query)) queries.set(query, { matches: false, addEventListener: jest.fn((_, cb) => { queries.get(query).change = cb; }), removeEventListener: jest.fn() });
    return queries.get(query);
  });
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { const id = frames.size + 1; frames.set(id, cb); return id; });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => frames.delete(id));
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 200, height: 100 });
});
afterEach(() => { jest.restoreAllMocks(); window.matchMedia = originalMatchMedia; });
function flush() { act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach(cb => cb()); }); }

it('shares the main dashboard cursor position and tilt with institution cards', () => {
  const view = render(<Surface direct />);
  const main = screen.getByRole('button', { name: 'Main tool' });
  fireEvent.mouseMove(main, { clientX: 160, clientY: 45 });
  flush();
  const expected = main.style.cssText;
  view.unmount();
  render(<Surface />);
  const card = screen.getByRole('button', { name: 'Teacher tool' });
  fireEvent.mouseMove(screen.getByText('Teacher tool'), { clientX: 160, clientY: 45 });
  flush();
  expect(card.style.cssText).toBe(expected);
  expect(card.style.getPropertyValue('--mx')).toBe('150px');
  expect(card.style.getPropertyValue('--rx')).toBe('1.75deg');
  expect(card.style.getPropertyValue('--ry')).toBe('2.25deg');
});

it('coalesces pointer movement into one frame without intercepting clicks', () => {
  const click = jest.fn();
  render(<Surface onClick={click} />);
  const card = screen.getByRole('button', { name: 'Teacher tool' });
  fireEvent.mouseMove(card, { clientX: 60, clientY: 40 });
  fireEvent.mouseMove(card, { clientX: 110, clientY: 70 });
  expect(frames.size).toBe(1);
  flush();
  expect(card.style.getPropertyValue('--mx')).toBe('100px');
  fireEvent.click(screen.getByText('Teacher tool'));
  expect(click).toHaveBeenCalledTimes(1);
});

it('resets tilt when leaving a card and cancels queued work on unmount', () => {
  const view = render(<Surface />);
  const card = screen.getByRole('button', { name: 'Teacher tool' });
  fireEvent.mouseMove(card, { clientX: 160, clientY: 45 });
  flush();
  fireEvent.mouseOut(card, { relatedTarget: screen.getByText('Outside cards') });
  expect(card.style.getPropertyValue('--rx')).toBe('0deg');
  expect(card).not.toHaveAttribute('data-cerbyl-hover');
  fireEvent.mouseMove(card, { clientX: 160, clientY: 45 });
  view.unmount();
  expect(frames.size).toBe(0);
});

it.each(['(prefers-reduced-motion: reduce)', '(hover: none)'])('stops tracking when %s becomes active', query => {
  render(<Surface />);
  const card = screen.getByRole('button', { name: 'Teacher tool' });
  fireEvent.mouseMove(card, { clientX: 160, clientY: 45 });
  flush();
  act(() => { queries.get(query).matches = true; queries.get(query).change(); });
  fireEvent.mouseMove(card, { clientX: 160, clientY: 45 });
  expect(frames.size).toBe(0);
  expect(card.style.getPropertyValue('--rx')).toBe('0deg');
  expect(card).not.toHaveAttribute('data-cerbyl-hover');
});

it('covers asynchronously loaded classroom panels and keeps their actions usable', () => {
  const click = jest.fn();
  const view = render(<Surface onClick={click} />);
  view.rerender(<Surface onClick={click} extra />);
  const action = screen.getByRole('button', { name: 'Loaded lesson' });
  fireEvent.mouseMove(action, { clientX: 160, clientY: 45 });
  flush();
  expect(action.parentElement).toHaveAttribute('data-cerbyl-hover', 'true');
  fireEvent.click(action);
  expect(click).toHaveBeenCalledTimes(1);
});

it('does not animate a disabled tool', () => {
  render(<Surface />);
  const card = screen.getByRole('button', { name: 'Unavailable tool' });
  fireEvent.mouseMove(card, { clientX: 160, clientY: 45 });
  expect(frames.size).toBe(0);
  expect(card).not.toHaveAttribute('data-cerbyl-hover');
});
