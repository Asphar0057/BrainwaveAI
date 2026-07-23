import questionBankAgentService from '../../services/questionBankAgentService';

jest.mock('../../config', () => ({
  API_URL: 'http://test.local/api',
  getAuthToken: () => 'test-token',
}));

jest.mock('../../services/aiJobService', () => ({
  USE_AI_JOB_QUEUE: false,
  queuedAIJsonFetch: jest.fn(),
}));

const okResponse = () => ({
  ok: true,
  json: async () => ({ status: 'success' }),
});

describe('QuestionBankAgentService adaptive difficulty forwarding', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockImplementation(async () => okResponse());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    [
      'generateFromMultiplePDFs',
      {
        userId: 'student',
        sourceIds: [1, 2],
        questionCount: 10,
        difficultyMix: { easy: 3, medium: 5, hard: 2 },
        adaptiveDifficulty: true,
      },
    ],
    [
      'smartGenerate',
      {
        userId: 'student',
        sourceIds: [1, 2],
        questionCount: 10,
        difficultyMix: { easy: 3, medium: 5, hard: 2 },
        adaptiveDifficulty: true,
      },
    ],
    [
      'generateFromSources',
      {
        userId: 'student',
        sources: [{ type: 'chat', id: 1 }],
        questionCount: 10,
        difficultyMix: { easy: 3, medium: 5, hard: 2 },
        adaptiveDifficulty: true,
      },
    ],
  ])('%s sends adaptive_difficulty', async (method, params) => {
    await questionBankAgentService[method](params);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual(
      expect.objectContaining({ adaptive_difficulty: true }),
    );
  });
});
