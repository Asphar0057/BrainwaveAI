import http from 'k6/http';

// Pass these with `-e NAME=value` on the k6 command line. Defaults point at
// production (https://cerbyl.com / the AWS EC2 backend at api.cerbyl.com).
export const FRONTEND_URL = (__ENV.FRONTEND_URL || 'https://cerbyl.com').replace(/\/$/, '');
export const API_URL = (__ENV.API_URL || 'https://api.cerbyl.com/api').replace(/\/$/, '');
export const API_ROOT = API_URL.replace(/\/api$/, '');

// Optional: set TEST_USERNAME/TEST_PASSWORD to also exercise authenticated
// routes. Use a dedicated test account, never a real user's credentials.
export const TEST_USERNAME = __ENV.TEST_USERNAME || '';
export const TEST_PASSWORD = __ENV.TEST_PASSWORD || '';

// Logs in once and returns auth headers, or null if no test credentials were
// supplied (or the login failed). Callers must handle the null case so the
// suite still runs for anonymous-only checks.
export function authHeaders() {
  if (!TEST_USERNAME || !TEST_PASSWORD) return null;

  const res = http.post(`${API_URL}/token`, {
    username: TEST_USERNAME,
    password: TEST_PASSWORD,
  });
  if (res.status !== 200) return null;

  try {
    const body = JSON.parse(res.body);
    if (!body.access_token) return null;
    return { Authorization: `Bearer ${body.access_token}` };
  } catch (e) {
    return null;
  }
}
