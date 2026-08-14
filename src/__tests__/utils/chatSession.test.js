import { parseNumericChatRouteId } from '../../utils/chatSession';

describe('parseNumericChatRouteId', () => {
  test.each([
    ['38', 38],
    ['0012', 12],
    [42, 42],
  ])('accepts complete positive numeric IDs (%p)', (value, expected) => {
    expect(parseNumericChatRouteId(value)).toBe(expected);
  });

  test.each([
    '29cYab95_kAU9oC8pk5cbw',
    '123abc',
    '_2a3SU28va-LUYjWirn3TQ',
    '',
    null,
    '0',
    '-4',
  ])('never partially parses a session UID (%p)', (value) => {
    expect(parseNumericChatRouteId(value)).toBeNull();
  });
});
