import {
  ACCOUNT_SESSION_KEY,
  cacheAccountSession,
  clearAccountSession,
  fetchAccountSession,
  getCachedAccountSession,
  getRoleRoute,
} from '../../utils/institutionSession';
import { apiRequest } from '../../config/api';

jest.mock('../../config/api', () => ({
  apiRequest: jest.fn(),
}));

describe('institution account session routing', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    apiRequest.mockReset();
  });

  it('routes every server account role to its fixed workspace', () => {
    expect(getRoleRoute('learner', '/profile-quiz')).toBe('/profile-quiz');
    expect(getRoleRoute('student')).toBe('/student');
    expect(getRoleRoute('educator')).toBe('/educator');
  });

  it('reads and clears the cached server session', () => {
    localStorage.setItem('username', 'cerbyl.student.test');
    localStorage.setItem('token', 'student-token');
    cacheAccountSession({ role: 'student', landing_route: '/student' });
    expect(getCachedAccountSession().role).toBe('student');

    clearAccountSession();
    expect(getCachedAccountSession()).toBeNull();
  });

  it('does not trust malformed browser session data', () => {
    sessionStorage.setItem(ACCOUNT_SESSION_KEY, '{broken');
    expect(getCachedAccountSession()).toBeNull();
  });

  it('rejects a cached role that belongs to a previous browser account', () => {
    localStorage.setItem('username', 'cerbyl.student.test');
    localStorage.setItem('token', 'student-token');
    cacheAccountSession({ role: 'student', landing_route: '/student' });
    localStorage.setItem('username', 'cerbyl.teacher.test');

    expect(getCachedAccountSession()).toBeNull();
    expect(sessionStorage.getItem(ACCOUNT_SESSION_KEY)).toBeNull();
  });

  it('rejects a cached role after the token changes for the same username', () => {
    localStorage.setItem('username', 'cerbyl.student.test');
    localStorage.setItem('token', 'first-token');
    cacheAccountSession({ role: 'student', landing_route: '/student' });
    localStorage.setItem('token', 'replacement-token');

    expect(getCachedAccountSession()).toBeNull();
  });

  it('falls back to the authenticated user endpoint for legacy backends', async () => {
    localStorage.setItem('username', 'aditya.s.lanka@gmail.com');
    localStorage.setItem('token', 'learner-token');
    const notFound = new Error('Not Found');
    notFound.status = 404;
    apiRequest
      .mockRejectedValueOnce(notFound)
      .mockResolvedValueOnce({
        username: 'AL04',
        email: 'aditya.s.lanka@gmail.com',
      });

    const session = await fetchAccountSession({ force: true });

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      '/institution/session',
      expect.objectContaining({ signal: expect.any(Object) })
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      '/me',
      expect.objectContaining({ signal: expect.any(Object) })
    );
    expect(session).toMatchObject({
      role: 'learner',
      landing_route: '/dashboard',
      legacy_backend: true,
    });
    expect(getCachedAccountSession().role).toBe('learner');
  });

  it('preserves an explicit institutional role returned by the legacy user endpoint', async () => {
    localStorage.setItem('username', 'cerbyl.student.test');
    localStorage.setItem('token', 'student-token');
    const notFound = new Error('Not Found');
    notFound.status = 404;
    apiRequest
      .mockRejectedValueOnce(notFound)
      .mockResolvedValueOnce({ account_role: 'student' });

    await expect(fetchAccountSession({ force: true })).resolves.toMatchObject({
      role: 'student',
      landing_route: '/student',
    });
  });
});
