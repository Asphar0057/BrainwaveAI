/** How many past calendar weeks (beyond the current one) the week picker offers. */
export const PAST_WEEK_COUNT = 7;

function mondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const dayIndex = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dayIndex);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Monday–Sunday range label for the calendar week `weekOffset` weeks before this one. */
export function weekDateRangeLabel(weekOffset: number): string {
  const monday = mondayOfWeek(new Date());
  monday.setDate(monday.getDate() - 7 * weekOffset);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  const monthLabel = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monthLabel(monday)} ${monday.getDate()}–${sunday.getDate()}`;
  }
  return `${monthLabel(monday)} ${monday.getDate()} – ${monthLabel(sunday)} ${sunday.getDate()}`;
}

/** Short chip label for the week picker: "this week", "last week", or a date range. */
export function weekChipLabel(weekOffset: number): string {
  if (weekOffset === 0) return 'this week';
  if (weekOffset === 1) return 'last week';
  return weekDateRangeLabel(weekOffset);
}
