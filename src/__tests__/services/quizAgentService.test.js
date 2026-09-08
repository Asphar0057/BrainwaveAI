import { QuizAgentService } from '../../services/quizAgentService';

describe('QuizAgentService grading', () => {
  beforeEach(() => sessionStorage.clear());
  it('sends chosen answers to the server, never a browser-calculated score or answer key', async () => {
    const service = new QuizAgentService();
    service.request = jest.fn().mockResolvedValue({ percentage: 50, correct_answers: 1 });
    const result = await service.gradeQuiz({ quizId: 17, questions: [{ id: 1, correct_answer: 0 }], answers: { '1': '1' } });
    expect(result.percentage).toBe(50);
    expect(service.request).toHaveBeenCalledWith('/complete_solo_quiz', { method: 'POST', body: JSON.stringify({ quiz_id: 17, answers: { '1': '1' } }) });
  });
  it('does not fabricate a score without a persisted quiz', async () => {
    const service = new QuizAgentService();
    await expect(service.gradeQuiz({ questions: [], answers: {} })).rejects.toThrow('no saved session');
  });
  it('propagates persistence failures so the learner can retry', async () => {
    const service = new QuizAgentService();
    service.request = jest.fn().mockRejectedValue(new Error('Offline'));
    await expect(service.gradeQuiz({ quizId: 2, answers: { '1': 'B' } })).rejects.toThrow('Offline');
  });
});
