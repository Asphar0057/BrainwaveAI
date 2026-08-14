const USER_MESSAGE_TYPES = new Set(['user', 'human']);

const compactWhitespace = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

export function getPromptPreview(message, maxLength = 112) {
  const content = compactWhitespace(message?.content || message?.user_message || '');
  const firstFile = message?.files?.[0]?.name || message?.attachments?.[0]?.name;
  const fallback = firstFile ? `Uploaded ${firstFile}` : 'Uploaded prompt';
  const source = content || fallback;

  if (source.length <= maxLength) return source;
  const clipped = source.slice(0, Math.max(1, maxLength - 1));
  const lastSpace = clipped.lastIndexOf(' ');
  const cleanClip = lastSpace > maxLength * 0.62 ? clipped.slice(0, lastSpace) : clipped;
  return `${cleanClip.trimEnd()}…`;
}

export function getConversationPrompts(messages = []) {
  let questionNumber = 0;

  return (Array.isArray(messages) ? messages : []).flatMap((message, messageIndex) => {
    const type = String(message?.type || message?.role || '').toLowerCase();
    if (!USER_MESSAGE_TYPES.has(type)) return [];

    questionNumber += 1;
    return [{
      id: String(message?.id || `prompt-${messageIndex}`),
      messageIndex,
      questionNumber,
      preview: getPromptPreview(message),
    }];
  });
}
