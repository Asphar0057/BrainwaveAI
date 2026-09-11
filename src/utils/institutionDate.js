// Classroom timestamps are stored as UTC. SQLite responses omit the offset.
// Date-only values (attendance) remain local calendar dates.
export function institutionDate(value) {
  if (typeof value !== 'string') return new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value.replace(' ', 'T')}Z`);
}
