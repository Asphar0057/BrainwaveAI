import { answerToOptionIndex, normalizeQuestion } from '../../utils/quizQuestionUtils';

describe('quiz answer normalization', () => {
  it('does not turn a blank answer into option A', () => {
    expect(answerToOptionIndex('', 4)).toBeNull();
    expect(answerToOptionIndex(null, 4)).toBeNull();
  });

  it('does not default a missing correct answer to option A', () => {
    expect(normalizeQuestion({ question: 'Malformed', options: ['A', 'B'] }).correct_answer).toBeNull();
  });

  it('normalizes both legacy letters and numeric option indexes', () => {
    expect(answerToOptionIndex('B', 4)).toBe(1);
    expect(answerToOptionIndex('1', 4)).toBe(1);
  });

  it('preserves true/false answer values', () => {
    expect(normalizeQuestion({
      question: 'True?',
      question_type: 'true_false',
      options: ['True', 'False'],
      correct_answer: 'True',
    }).correct_answer).toBe('true');
  });
});
