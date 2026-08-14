export function parseNumericChatRouteId(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

