import { institutionDate } from '../../utils/institutionDate';
it('interprets offset-free server timestamps as UTC and preserves explicit offsets', () => {
  expect(institutionDate('2026-09-14T23:30:00').toISOString()).toBe('2026-09-14T23:30:00.000Z');
  expect(institutionDate('2026-09-15T05:00:00+05:30').toISOString()).toBe('2026-09-14T23:30:00.000Z');
  expect(institutionDate('2026-09-14T23:30:00Z').toISOString()).toBe('2026-09-14T23:30:00.000Z');
});
it('keeps attendance dates on the chosen local day', () => {
  const date = institutionDate('2026-09-15');
  expect(date.getDate()).toBe(15);
  expect(date.getHours()).toBe(0);
});
