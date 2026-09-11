import { ConversionAgentService } from '../../services/conversionAgentService';
import { queuedAIFormFetch } from '../../services/aiJobService';
jest.mock('../../config', () => ({ API_URL: 'http://localhost/api', getAuthToken: () => 'test-token' }));
jest.mock('../../services/aiJobService', () => ({ queuedAIFormFetch: jest.fn() }));
const response = body => ({ ok:true, json:async () => body });
beforeEach(() => { jest.clearAllMocks(); global.fetch = jest.fn(); });

test('an empty selected session cannot silently create a partial note', async () => {
  queuedAIFormFetch.mockResolvedValueOnce(response({content:'# First',status:'success'})).mockResolvedValueOnce(response({content:'',status:'success'}));
  await expect(new ConversionAgentService().chatToNotes('learner',[1,2])).rejects.toThrow('no partial note');
  expect(fetch).not.toHaveBeenCalled();
});

test('all rich session content is submitted intact to note storage', async () => {
  const rich = '```python\nprint("<x>")\n```\n\n![x](data:image/png;base64,abc)';
  queuedAIFormFetch.mockResolvedValueOnce(response({content:rich,status:'success'})).mockResolvedValueOnce(response({content:'```mermaid\ngraph TD\nA-->B\n```',status:'success'}));
  fetch.mockResolvedValue(response({id:3,title:'Test',content:rich}));
  const result = await new ConversionAgentService().chatToNotes('learner',[1,2]);
  const saved = JSON.parse(fetch.mock.calls[0][1].body);
  expect(saved.content).toContain(rich);
  expect(saved.content).toContain('## Chat Session 2\n\n```mermaid');
  expect(result.success).toBe(true);
});
