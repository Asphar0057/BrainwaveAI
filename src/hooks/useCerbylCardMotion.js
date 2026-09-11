import { useCallback, useEffect, useRef } from 'react';

// The same card surfaces are listed in CerbylCardSurface.css. Delegation keeps
// newly loaded classroom content covered without installing a listener per tile.
export const INSTITUTION_CARDS = [
  '.ci-feature', '.ci-module', '.ci-metric', '.ci-lower-panel', '.ci-focus-panel',
  '.ci-leaderboard-panel', '.b2b-panel', '.icp-class-list > button',
  '.icp-notification-list > article', '.ci-workspace-brief',
].join(', ');

export default function useCerbylCardMotion(selector) {
  const active = useRef(null);
  const frame = useRef(null);
  const point = useRef(null);
  const reduced = useRef(false);
  const touchOnly = useRef(false);

  const reset = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    point.current = null;
    if (active.current) {
      active.current.style.setProperty('--rx', '0deg');
      active.current.style.setProperty('--ry', '0deg');
      active.current.removeAttribute('data-cerbyl-hover');
    }
    active.current = null;
  }, []);

  useEffect(() => {
    const reduceQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const touchQuery = window.matchMedia?.('(hover: none)');
    const update = () => {
      reduced.current = Boolean(reduceQuery?.matches);
      touchOnly.current = Boolean(touchQuery?.matches);
      reset();
    };
    update();
    reduceQuery?.addEventListener?.('change', update);
    touchQuery?.addEventListener?.('change', update);
    window.addEventListener('blur', reset);
    return () => {
      reset();
      reduceQuery?.removeEventListener?.('change', update);
      touchQuery?.removeEventListener?.('change', update);
      window.removeEventListener('blur', reset);
    };
  }, [reset]);

  const onMouseMove = useCallback((event) => {
    if (reduced.current || touchOnly.current || event.buttons) { reset(); return; }
    const root = event.currentTarget;
    const card = selector ? event.target.closest?.(selector) : root;
    if (!card || !root.contains(card) || card.matches(':disabled, [aria-disabled="true"]')) { reset(); return; }
    if (active.current !== card) {
      reset();
      active.current = card;
      card.setAttribute('data-cerbyl-hover', 'true');
    }
    point.current = { x: event.clientX, y: event.clientY };
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (!card.isConnected || active.current !== card || !point.current) return;
      const rect = card.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = point.current.x - rect.left;
      const y = point.current.y - rect.top;
      // Original DashboardCerbyl/Home angles and cursor-relative gold position.
      card.style.setProperty('--mx', `${x}px`);
      card.style.setProperty('--my', `${y}px`);
      card.style.setProperty('--rx', `${(-(y / rect.height - 0.5) * 7).toFixed(2)}deg`);
      card.style.setProperty('--ry', `${((x / rect.width - 0.5) * 9).toFixed(2)}deg`);
    });
  }, [reset, selector]);

  const onMouseOut = useCallback((event) => {
    const next = event.relatedTarget;
    if (active.current && (!(next instanceof Node) || !active.current.contains(next))) reset();
  }, [reset]);

  return { onMouseMove, onMouseLeave: reset, onMouseOut, onScrollCapture: reset };
}
