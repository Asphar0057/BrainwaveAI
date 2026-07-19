import {
  getTokenUsageFromResponse,
  shouldRecoverUnauthorizedSession,
} from '../../utils/fetchInterceptor';

describe('getTokenUsageFromResponse', () => {
  test('reads the post-request token usage headers', () => {
    const response = new Response(null, {
      headers: {
        'X-TokenLimit-Used': '178250',
        'X-TokenLimit-Limit': '5000000',
        'X-TokenLimit-Remaining': '4821750',
        'X-TokenLimit-Plan': 'power',
        'X-TokenUsage-Delta': '6023',
      },
    });

    expect(getTokenUsageFromResponse(response)).toEqual({
      usedTokens: 178250,
      includedTokens: 5000000,
      remainingTokens: 4821750,
      currentPlanId: 'power',
      tokenDelta: 6023,
      resetAt: null,
      resetAfterSeconds: null,
    });
  });

  test('ignores responses without token usage headers', () => {
    expect(getTokenUsageFromResponse(new Response())).toBeNull();
  });

  test('recovers when the backend rejects the current bearer token', () => {
    localStorage.setItem('token', 'expired-token');

    expect(shouldRecoverUnauthorizedSession(
      'http://localhost:8000/api/create_chat_session',
      { headers: { Authorization: 'Bearer expired-token' } },
      401,
      localStorage.getItem('token')
    )).toBe(true);
  });

  test('does not clear the session for unrelated or unauthenticated 401 responses', () => {
    expect(shouldRecoverUnauthorizedSession(
      'https://example.com/private',
      { headers: { Authorization: 'Bearer expired-token' } },
      401,
      'expired-token'
    )).toBe(false);

    expect(shouldRecoverUnauthorizedSession(
      'http://localhost:8000/api/token',
      {},
      401,
      'expired-token'
    )).toBe(false);
  });
});
