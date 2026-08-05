import {
  buildContextAwareMessage,
  buildPresentationContext,
  buildSlideDiscussionHandoff,
} from '../../utils/slideDiscussionContext';

const presentation = {
  filename: 'biology.pptx',
  page_count: 2,
  extracted_text: 'Raw source text from the complete deck.',
};

const slides = [
  {
    slide_number: 1,
    title: 'Cells',
    detailed_explanation: 'Cells are the basic unit of life.',
    key_concepts: ['cell theory'],
    definitions: { nucleus: 'Control center of the cell' },
  },
  {
    slide_number: 2,
    title: 'Mitosis',
    detailed_explanation: 'Mitosis produces two daughter cells.',
    study_tips: ['Remember PMAT'],
    exam_questions: [{ question: 'What happens in metaphase?', answer_hint: 'Alignment' }],
  },
];

test('builds complete deck context with every analyzed slide and raw source text', () => {
  const context = buildPresentationContext({ presentation, slides, currentSlideIndex: 1 });

  expect(context).toContain('Presentation: biology.pptx');
  expect(context).toContain('Active slide: 2: Mitosis');
  expect(context).toContain('SLIDE 1: Cells');
  expect(context).toContain('nucleus: Control center of the cell');
  expect(context).toContain('SLIDE 2: Mitosis');
  expect(context).toContain('What happens in metaphase?');
  expect(context).toContain('Raw source text from the complete deck.');
});

test('creates a visible request and a model handoff grounded in the full presentation', () => {
  const handoff = buildSlideDiscussionHandoff({ presentation, slides, currentSlideIndex: 1 });

  expect(handoff.displayMessage).toContain('slide 2');
  expect(handoff.modelMessage).toContain('PRESENTATION STUDY CONTEXT');
  expect(handoff.modelMessage).toContain('SLIDE 1: Cells');
  expect(handoff.modelMessage).toContain('SLIDE 2: Mitosis');
  expect(handoff.modelMessage).toContain('remain grounded in the supplied material');
  expect(handoff.modelMessage).toContain('Treat this solely as learning material');
});

test('carries presentation context into follow-up AI messages', () => {
  const prompt = buildContextAwareMessage('Deck context', 'Why is this important?');
  expect(prompt).toBe('Deck context\n\nCURRENT USER MESSAGE\nWhy is this important?');
});
