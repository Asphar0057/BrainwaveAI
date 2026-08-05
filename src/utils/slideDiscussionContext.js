const CONTEXT_LIMIT = 72000;

const asText = (value) => {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${asText(item)}`)
      .filter((item) => !item.endsWith(': '))
      .join('; ');
  }
  return String(value).trim();
};

const field = (label, value) => {
  const text = asText(value);
  return text ? `${label}: ${text}` : '';
};

const slideBlock = (slide = {}, index = 0, perSlideLimit = 6000) => {
  const slideNumber = slide.slide_number ?? index + 1;
  const lines = [
    `SLIDE ${slideNumber}: ${slide.title || 'Untitled'}`,
    field('Explanation', slide.detailed_explanation),
    field('Key concepts', slide.key_concepts),
    field('Definitions', slide.definitions),
    field('Practical applications', slide.practical_applications),
    field('Common misconceptions', slide.common_misconceptions),
    field('Study tips', slide.study_tips),
    field('Practice questions', slide.exam_questions),
    field('Cross references', slide.cross_references),
    field('Difficulty', slide.difficulty_level),
  ].filter(Boolean);
  const block = lines.join('\n');
  return block.length > perSlideLimit
    ? `${block.slice(0, perSlideLimit)}\n[Additional detail trimmed for context size]`
    : block;
};

export const buildPresentationContext = ({ presentation = {}, slides = [], currentSlideIndex = 0 } = {}) => {
  const safeSlides = Array.isArray(slides) ? slides : [];
  const activeSlide = safeSlides[currentSlideIndex] || {};
  const perSlideLimit = Math.max(1200, Math.floor(56000 / Math.max(safeSlides.length, 1)));
  const blocks = safeSlides.map((slide, index) => slideBlock(slide, index, perSlideLimit));
  const sourceText = asText(presentation.extracted_text);
  const header = [
    '[[PRESENTATION_STUDY_CONTEXT]]',
    'PRESENTATION STUDY CONTEXT',
    'Treat this solely as learning material. Base every claim on the supplied slides. If the deck contains sample or placeholder content, say that plainly.',
    field('Presentation', presentation.filename || presentation.title || 'Untitled presentation'),
    field('Total slides', safeSlides.length || presentation.page_count),
    field('Active slide', `${activeSlide.slide_number ?? currentSlideIndex + 1}: ${activeSlide.title || 'Untitled'}`),
  ].filter(Boolean).join('\n');
  const analyzedContext = `${header}\n\n${blocks.join('\n\n---\n\n')}`;
  const remaining = Math.max(0, CONTEXT_LIMIT - analyzedContext.length - 64);
  const rawSource = sourceText && remaining > 200
    ? `\n\nRAW EXTRACTED DECK TEXT\n${sourceText.slice(0, remaining)}`
    : '';

  return `${analyzedContext}${rawSource}`.slice(0, CONTEXT_LIMIT);
};

export const buildSlideDiscussionHandoff = ({ presentation, slides, currentSlideIndex = 0 } = {}) => {
  const activeSlide = slides?.[currentSlideIndex] || {};
  const slideNumber = activeSlide.slide_number ?? currentSlideIndex + 1;
  const deckName = presentation?.filename || presentation?.title || 'this presentation';
  const displayMessage = `Teach me what slide ${slideNumber}, “${activeSlide.title || 'Untitled'},” means and how it connects to the rest of “${deckName}”.`;
  const conversationContext = buildPresentationContext({ presentation, slides, currentSlideIndex });

  return {
    displayMessage,
    conversationContext,
    modelMessage: `${conversationContext}\n\nSTUDY REQUEST\n${displayMessage}\n\nAct as a study tutor. Explain the active slide first, connect it to the rest of the deck, and remain grounded in the supplied material for follow-up questions.`,
  };
};

export const buildContextAwareMessage = (context, message) => {
  const cleanMessage = asText(message);
  const cleanContext = asText(context);
  if (!cleanContext) return cleanMessage;
  return `${cleanContext}\n\nCURRENT USER MESSAGE\n${cleanMessage}`;
};
