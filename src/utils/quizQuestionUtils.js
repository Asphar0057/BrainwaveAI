const cleanString = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : '';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
};

const extractFromObject = (obj) => {
  if (!obj || typeof obj !== 'object') return '';

  const nestedKeys = [
    'text',
    'question',
    'question_text',
    'questionText',
    'prompt',
    'prompt_text',
    'promptText',
    'stem',
    'title',
    'label'
  ];

  for (const key of nestedKeys) {
    const text = cleanString(obj[key]);
    if (text) return text;
  }

  return '';
};

const normalizeOptions = (options) => {
  if (Array.isArray(options)) {
    return options.map((option) => cleanString(option)).filter(Boolean);
  }

  if (typeof options === 'string') {
    try {
      const parsed = JSON.parse(options);
      if (Array.isArray(parsed)) {
        return parsed.map((option) => cleanString(option)).filter(Boolean);
      }
    } catch {
      return [];
    }
  }

  return [];
};

const normalizeCorrectAnswer = (correctAnswer, optionsLength) => {
  if (!optionsLength) return null;

  if (typeof correctAnswer === 'number' && Number.isFinite(correctAnswer)) {
    const index = Math.trunc(correctAnswer);
    return index >= 0 && index < optionsLength ? index : null;
  }

  if (typeof correctAnswer === 'string') {
    const trimmed = correctAnswer.trim();
    if (!trimmed) return null;

    const numeric = Number(trimmed);
    if (Number.isInteger(numeric) && numeric >= 0 && numeric < optionsLength) {
      return numeric;
    }

    if (/^[A-Z]$/i.test(trimmed)) {
      const letterIndex = trimmed.toUpperCase().charCodeAt(0) - 65;
      return letterIndex >= 0 && letterIndex < optionsLength ? letterIndex : null;
    }
  }

  return null;
};

export const answerToOptionIndex = (answer, optionsLength = Infinity) => {
  if (answer === null || answer === undefined) return null;
  const normalized = String(answer).trim();
  if (!normalized) return null;

  let index = null;
  if (/^\d+$/.test(normalized)) {
    index = Number(normalized);
  } else if (/^[A-Z]$/i.test(normalized)) {
    index = normalized.toUpperCase().charCodeAt(0) - 65;
  }

  return Number.isInteger(index) && index >= 0 && index < optionsLength ? index : null;
};

export const extractQuestionText = (question) => {
  if (!question) return '';

  if (typeof question === 'string' || typeof question === 'number' || typeof question === 'boolean') {
    return cleanString(question);
  }

  if (typeof question !== 'object') return '';

  const directCandidates = [
    question.question,
    question.question_text,
    question.questionText,
    question.text,
    question.prompt,
    question.prompt_text,
    question.promptText,
    question.stem,
    question.title,
    question.label
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'object') {
      const nested = extractFromObject(candidate);
      if (nested) return nested;
      continue;
    }
    const text = cleanString(candidate);
    if (text) return text;
  }

  return '';
};

export const normalizeQuestion = (question) => {
  if (!question || typeof question !== 'object') {
    const text = extractQuestionText(question);
    return { question: text, question_text: text, options: [], correct_answer: null };
  }

  const text = extractQuestionText(question);
  const questionValue = typeof question.question === 'string' ? question.question : '';
  const questionTextValue = typeof question.question_text === 'string' ? question.question_text : '';
  const options = normalizeOptions(question.options);
  const questionType = cleanString(question.question_type).toLowerCase() || (options.length ? 'multiple_choice' : 'short_answer');
  const correctAnswer = questionType === 'multiple_choice'
    ? normalizeCorrectAnswer(question.correct_answer, options.length)
    : cleanString(question.correct_answer).toLowerCase() || null;

  return {
    ...question,
    question: text || questionValue,
    question_text: text || questionTextValue,
    question_type: questionType,
    options,
    correct_answer: correctAnswer
  };
};

export const normalizeQuestions = (questions = []) => {
  if (!Array.isArray(questions)) return [];
  return questions.map(normalizeQuestion);
};
