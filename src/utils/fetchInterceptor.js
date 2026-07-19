import { API_URL } from '../config/api';
import { clearBackendSession } from './backendSession';

let _installed = false;
let _authRecoveryStarted = false;

const getRequestUrl = (input) => {
  if (typeof input === 'string') return input;
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return String(input);
};

const getAuthorizationHeader = (input, init = {}) => {
  const initHeaders = new Headers(init?.headers || {});
  const initAuthorization = initHeaders.get('Authorization');
  if (initAuthorization) return initAuthorization;

  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.headers.get('Authorization');
  }
  return null;
};

const isBackendApiRequest = (input) => {
  try {
    const requestUrl = new URL(getRequestUrl(input), window.location.origin);
    const apiUrl = new URL(API_URL, window.location.origin);
    const apiPath = apiUrl.pathname.replace(/\/$/, '');
    return requestUrl.origin === apiUrl.origin &&
      (requestUrl.pathname === apiPath || requestUrl.pathname.startsWith(`${apiPath}/`));
  } catch (_) {
    return false;
  }
};

export const shouldRecoverUnauthorizedSession = (input, init, responseStatus, currentToken) => {
  if (responseStatus !== 401 || !currentToken || !isBackendApiRequest(input)) return false;
  return getAuthorizationHeader(input, init) === `Bearer ${currentToken}`;
};

const recoverUnauthorizedSession = () => {
  if (_authRecoveryStarted) return;
  _authRecoveryStarted = true;
  clearBackendSession();
  window.dispatchEvent(new CustomEvent('brainwave:session-expired'));
  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
};

const parseTokenHeader = (response, name) => {
  const value = response.headers.get(name);
  if (value === null || value === '' || value === 'unlimited') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function getTokenUsageFromResponse(response) {
  const usedTokens = parseTokenHeader(response, 'X-TokenLimit-Used');
  const includedTokens = parseTokenHeader(response, 'X-TokenLimit-Limit');
  if (usedTokens === null) return null;

  return {
    usedTokens,
    includedTokens,
    remainingTokens: parseTokenHeader(response, 'X-TokenLimit-Remaining'),
    currentPlanId: response.headers.get('X-TokenLimit-Plan') || null,
    tokenDelta: parseTokenHeader(response, 'X-TokenUsage-Delta'),
    resetAt: response.headers.get('X-TokenLimit-Reset') || null,
    resetAfterSeconds: parseTokenHeader(response, 'X-TokenLimit-Reset-After'),
  };
}

export function installFetchInterceptor() {
  if (_installed || typeof window === 'undefined') return;
  _installed = true;

  const _originalFetch = window.fetch.bind(window);

  window.fetch = async function interceptedFetch(input, init) {
    const response = await _originalFetch(input, init);
    const currentToken = localStorage.getItem('token');

    if (shouldRecoverUnauthorizedSession(input, init, response.status, currentToken)) {
      recoverUnauthorizedSession();
      return response;
    }

    const tokenUsage = getTokenUsageFromResponse(response);

    if (tokenUsage) {
      window.dispatchEvent(
        new CustomEvent('brainwave:token-usage-updated', {
          detail: tokenUsage,
        })
      );
    }

    if (response.status === 429) {
      const url = getRequestUrl(input);

      let body = {};
      try {
        body = await response.clone().json();
      } catch (_) {
        body = {};
      }

      if (body?.code === 'ai_token_limit_exceeded') {
        window.dispatchEvent(
          new CustomEvent('brainwave:token-limit-exceeded', {
            detail: {
              url,
              message: body.detail,
              currentPlanId: body.current_plan_id,
              currentPlanName: body.current_plan_name,
              usedTokens: body.used_tokens,
              includedTokens: body.included_tokens,
              remainingTokens: body.remaining_tokens,
              windowDays: body.window_days,
              resetAt: body.reset_at,
              resetAfterSeconds: body.reset_after_seconds,
            },
          })
        );
        return response;
      }

      const retryAfter = parseInt(
        response.headers.get('Retry-After') || '60',
        10
      );
      const tier = response.headers.get('X-RateLimit-Tier') || 'unknown';
      const limit = response.headers.get('X-RateLimit-Limit');
      const window_ = response.headers.get('X-RateLimit-Window');

      window.dispatchEvent(
        new CustomEvent('brainwave:rate-limited', {
          detail: { retryAfter, tier, limit: parseInt(limit, 10), window: parseInt(window_, 10), url },
        })
      );
    }

    return response;
  };
}
