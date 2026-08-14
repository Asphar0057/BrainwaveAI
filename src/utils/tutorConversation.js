export const TUTOR_CHECK_RE = /\b(comprehension\s+check|check\s+your\s+understanding|quick\s+(?:understanding\s+)?check|to\s+ensure\s+you'?re\s+following\s+along|your\s+turn|now\s+(?:you|your)|can\s+you\s+(?:briefly\s+)?(?:describe|explain|summari[sz]e|integrate|differentiate|solve|calculate|compute|find|apply|choose|select|identify|classify|compare|think\s+of)|how\s+(?:would|do)\s+you\s+(?:explain|describe|understand|solve|calculate|compute|find|apply|choose|select|identify|classify|compare)|what\s+is\s+(?:the\s+)?(?:next\s+step|answer|result|value|integral|derivative|solution|cause|effect|reason|main\s+idea|correct\s+option|primary\s+goal)|what\s+do\s+you\s+understand|try\s+(?:answering|explaining|summari[sz]ing|solving|calculating|computing|finding|integrating|differentiating|applying|choosing|selecting|identifying|classifying|comparing)|which\s+(?:option|choice|answer)|select\s+(?:one|the\s+best|the\s+correct))\b/i;

const NEW_REQUEST_RE = /^\s*(?:what|why|how|when|where|who|which|can|could|would|should|please|explain|tell|show|give|quiz|make|create|generate|teach)\b/i;
const TOPIC_SWITCH_RE = /^\s*(?:new\s+topic|change\s+(?:the\s+)?topic|switch\s+(?:the\s+)?topic|instead[, :]?|let'?s\s+(?:talk|learn|study))\b/i;
const QUESTION_RE = /\b(?:what|why|how|when|where|who|which|can|could|would|should|explain|tell|show)\b/i;
const ACKNOWLEDGEMENT_ONLY_RE = /^\s*(?:thanks?|thank\s+you|ok(?:ay)?|cool|nice|great|got\s+it|makes\s+sense|understood)[.!]*\s*$/i;
const HELP_REQUEST_RE = /\b(?:i(?:'m|\s+am)\s+stuck|give\s+me\s+(?:a\s+)?hint|help\s+me|show\s+me\s+how|explain\s+(?:it|that)\s+again)\b/i;

export function getLastAiMessage(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.type === 'ai' && message.content) return message;
  }
  return null;
}

export function looksLikeTutorReply(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;
  if (TOPIC_SWITCH_RE.test(trimmed) || NEW_REQUEST_RE.test(trimmed)) return false;
  if (trimmed.endsWith('?') && QUESTION_RE.test(trimmed)) return false;
  if (ACKNOWLEDGEMENT_ONLY_RE.test(trimmed)) return false;
  if (HELP_REQUEST_RE.test(trimmed)) return false;

  // Once a tutor has asked a check, short answers are normal: "crypto", "A",
  // "yes", "mitosis", or a compact equation are all legitimate attempts.
  return /[\p{L}\p{N}]/u.test(trimmed);
}

export function isTutorMessage(message) {
  return Boolean(
    message?.tutorMode
    || message?.tutorState
    || (Array.isArray(message?.tutorOptions) && message.tutorOptions.length > 0)
  );
}

export function getTutorContinuation(messages = []) {
  const previousAi = getLastAiMessage(messages);
  if (!isTutorMessage(previousAi)) {
    return { enabled: false, replyMode: null, message: previousAi };
  }
  return {
    enabled: true,
    replyMode: previousAi.tutorReplyMode || 'guided',
    message: previousAi,
  };
}

export function isAnsweringPreviousComprehensionCheck(text = '', messages = []) {
  const previousAi = getLastAiMessage(messages);
  return Boolean(previousAi && TUTOR_CHECK_RE.test(previousAi.content || '') && looksLikeTutorReply(text));
}

export function isAnsweringTutorStep(text = '', messages = []) {
  const previousAi = getLastAiMessage(messages);
  if (!previousAi || !looksLikeTutorReply(text)) return false;
  return isTutorMessage(previousAi) || TUTOR_CHECK_RE.test(previousAi.content || '');
}
