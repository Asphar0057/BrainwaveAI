import { QuizAgentService } from '../../services/quizAgentService';

describe('QuizAgentService grading', () => {
  beforeEach(() => sessionStorage.clear());

  it('never treats an unanswered question as option A', async () => {
    const service = new QuizAgentService();
    const result = await service.gradeQuiz({
      questions: [
        { id: 1, question: 'Answered', options: ['Wrong', 'Right'], correct_answer: 1 },
        { id: 2, question: 'Unanswered', options: ['Right', 'Wrong'], correct_answer: 0 },
      ],
      answers: { '1': '1' },
    });

    expect(result.correct_answers).toBe(1);
    expect(result.percentage).toBe(50);
    expect(result.results[1]).toMatchObject({ user_answer: '', is_correct: false });
  });

  it('still grades letter answers restored from an older saved attempt', async () => {
    const service = new QuizAgentService();
    const result = await service.gradeQuiz({
      questions: [
        { id: 1, question: 'Legacy attempt', question_type: 'multiple_choice', options: ['Wrong', 'Right'], correct_answer: 1 },
      ],
      answers: { '1': 'B' },
    });

    expect(result.correct_answers).toBe(1);
  });
});
