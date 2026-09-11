export const getApiErrorMessage = (payload, fallback = 'Something went wrong.') => {
  const detail = payload?.detail ?? payload?.message ?? payload;

  if (typeof detail === 'string' && detail.trim()) return detail.trim();

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object' && typeof item.msg === 'string') return item.msg.trim();
        return '';
      })
      .filter(Boolean);
    return messages.length > 0 ? messages.join(' ') : fallback;
  }

  if (detail && typeof detail === 'object' && typeof detail.message === 'string') {
    return detail.message.trim() || fallback;
  }

  if (detail && typeof detail === 'object' && typeof detail.msg === 'string') {
    return detail.msg.trim() || fallback;
  }

  return fallback;
};
