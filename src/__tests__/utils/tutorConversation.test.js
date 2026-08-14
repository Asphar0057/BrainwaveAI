import {
  getTutorContinuation,
  isAnsweringPreviousComprehensionCheck,
  isAnsweringTutorStep,
  looksLikeTutorReply,
} from '../../utils/tutorConversation';

const tutorQuestion = {
  id: 'ai_1',
  type: 'ai',
  content: 'Your turn: Can you think of a scenario where processing many possibilities is useful?',
  tutorMode: true,
  tutorState: { nextAction: 'Name one scenario' },
};

describe('tutor conversation turn detection', () => {
  test.each(['crypto', 'A', 'yes', 'mitosis', '3x^2/2', "I don't know"])('%s is accepted as a student attempt', (answer) => {
    expect(looksLikeTutorReply(answer)).toBe(true);
    expect(isAnsweringTutorStep(answer, [tutorQuestion])).toBe(true);
    expect(isAnsweringPreviousComprehensionCheck(answer, [tutorQuestion])).toBe(true);
  });

  test.each([
    'Can you explain cryptography?',
    'Teach me calculus instead',
    'new topic: biology',
    'thanks',
  ])('%s is not forced into grading', (message) => {
    expect(isAnsweringTutorStep(message, [tutorQuestion])).toBe(false);
  });

  test.each([
    "I'm stuck on the coefficient. Give me the smallest hint.",
    'Help me with this step.',
    'Explain that again.',
  ])('%s is treated as a help request, not an attempted answer', (message) => {
    expect(looksLikeTutorReply(message)).toBe(false);
    expect(isAnsweringTutorStep(message, [tutorQuestion])).toBe(false);
  });

  test('a short word without a pending tutor check is not treated as an answer', () => {
    expect(isAnsweringTutorStep('crypto', [{ type: 'ai', content: 'Cryptography is useful.' }])).toBe(false);
  });

  test('reopening a tutor conversation restores its mode and reply style', () => {
    expect(getTutorContinuation([
      { type: 'user', content: 'crypto' },
      { ...tutorQuestion, tutorReplyMode: 'check' },
    ])).toMatchObject({ enabled: true, replyMode: 'check' });
  });

  test('a normal conversation does not invent tutor state', () => {
    expect(getTutorContinuation([{ type: 'ai', content: 'Here is the answer.' }]))
      .toMatchObject({ enabled: false, replyMode: null });
  });
});
