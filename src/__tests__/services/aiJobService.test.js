import { createAIJob, discoverPendingChatJobs, getPendingAIJobs, pollAIJob } from '../../services/aiJobService';
import { getAuthToken } from '../../config';

jest.mock('../../config', () => ({ API_URL: 'http://localhost/api', getAuthToken: jest.fn() }));
jest.mock('../../utils/usageLimit', () => ({ getUsageLimitFromResponse: jest.fn(), createUsageLimitError: jest.fn() }));

const token = sub => `header.${btoa(JSON.stringify({ sub }))}.signature`;
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };

beforeEach(() => {
  localStorage.clear();
  getAuthToken.mockReturnValue(token('learner'));
  global.fetch = jest.fn();
});

afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test('waits for durable completion beyond the old three-minute limit', async () => {
  let now = 0;
  jest.spyOn(Date, 'now').mockImplementation(() => { now += 240000; return now; });
  fetch.mockResolvedValueOnce(response({ id: 4, status: 'running', timeout_seconds: 420 }))
    .mockResolvedValueOnce(response({ id: 4, status: 'retrying' }))
    .mockResolvedValueOnce(response({ id: 4, status: 'completed', result: { answer: 'Done' } }));
  await expect(pollAIJob(4, { pollIntervalMs: 1 })).resolves.toEqual({ answer: 'Done' });
  expect(fetch).toHaveBeenCalledTimes(3);
});

test('retains a pending job across reconnect and resumes it without another POST', async () => {
  jest.useFakeTimers();
  fetch.mockResolvedValueOnce(response({ id: 5, status: 'queued' }));
  await createAIJob({ prompt: 'Explain', chat_session_id: 12 });
  expect(getPendingAIJobs()).toEqual([expect.objectContaining({ id: 5, chatSessionId: 12 })]);
  fetch.mockRejectedValueOnce(new TypeError('Offline'))
    .mockResolvedValueOnce(response({ id: 5, status: 'completed', result: { answer: 'Recovered' } }));
  const progress = jest.fn();
  const result = pollAIJob(getPendingAIJobs()[0].id, { onProgress: progress });
  await flush();
  expect(progress).toHaveBeenCalledWith(expect.objectContaining({ connection_state: 'reconnecting' }));
  jest.advanceTimersByTime(2000);
  await expect(result).resolves.toEqual({ answer: 'Recovered' });
  expect(fetch.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  expect(getPendingAIJobs()).toEqual([]);
});

test('abort stops polling but preserves the job for resumption', async () => {
  jest.useFakeTimers();
  fetch.mockResolvedValueOnce(response({ id: 6 }));
  await createAIJob({ prompt: 'Explain', chat_session_id: 12 });
  fetch.mockResolvedValueOnce(response({ id: 6, status: 'running' }));
  const controller = new AbortController();
  const result = pollAIJob(6, { signal: controller.signal });
  const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  await flush();
  controller.abort();
  await rejected;
  expect(getPendingAIJobs()[0].id).toBe(6);
});

test('does not expose another signed-in user pending jobs', async () => {
  fetch.mockResolvedValueOnce(response({ id: 7 }));
  await createAIJob({ prompt: 'Explain', chat_session_id: 12 });
  getAuthToken.mockReturnValue(token('other-user'));
  expect(getPendingAIJobs()).toEqual([]);
});

test('surfaces terminal worker failure and rejects legacy error-shaped completion', async () => {
  fetch.mockResolvedValueOnce(response({ id: 8, status: 'failed', error: 'Provider failed' }));
  await expect(pollAIJob(8)).rejects.toThrow('Provider failed');
  fetch.mockResolvedValueOnce(response({ id: 9, status: 'completed', result: { answer: 'Sorry', query_type: 'error' } }));
  await expect(pollAIJob(9)).rejects.toThrow('AI generation failed');
});


test('discovers persisted server jobs when the create response or local registry was lost', async () => {
  fetch.mockResolvedValueOnce(response([{ id: 18, status: 'running' }]));
  await expect(discoverPendingChatJobs(12)).resolves.toEqual([{ id: 18, status: 'running' }]);
  expect(getPendingAIJobs()).toEqual([expect.objectContaining({ id: 18, chatSessionId: 12 })]);
  expect(fetch.mock.calls[0][0]).toContain('chat_session_id=12');
  expect(fetch.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
});
