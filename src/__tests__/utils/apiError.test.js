import { getApiErrorMessage } from '../../utils/apiError';

describe('getApiErrorMessage', () => {
  it('turns FastAPI validation details into render-safe text', () => {
    expect(getApiErrorMessage({
      detail: [
        { type: 'string_type', loc: ['body', 'chat_id'], msg: 'Input should be a valid string', input: 42 },
      ],
    })).toBe('Input should be a valid string');
  });

  it('uses the fallback for unknown structured errors', () => {
    expect(getApiErrorMessage({ detail: { unexpected: true } }, 'Could not move chat.')).toBe('Could not move chat.');
  });
});
