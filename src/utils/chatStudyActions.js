// Study suggestions belong to a request for teaching, not every factual answer.
export function isTopicExplanationRequest(prompt = '') {
  const text = String(prompt).trim().toLowerCase();
  if (!text || /\b(?:don'?t|do not|stop|never)\s+(?:\w+\s+){0,2}(?:explain|teach)\b/.test(text)) return false;
  if (/\b(?:explain|teach|walk me through)\b/.test(text)) return true;
  if (/\b(?:tell me about|help me understand|i (?:want|would like) to (?:learn|understand))\b/.test(text)) return true;
  return /\bhow\s+.+\s+works?\b/.test(text);
}
