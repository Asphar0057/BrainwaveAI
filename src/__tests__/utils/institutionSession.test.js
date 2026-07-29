import {
  ACCOUNT_SESSION_KEY,
  cacheAccountSession,
  clearAccountSession,
  getCachedAccountSession,
  getRoleRoute,
} from '../../utils/institutionSession';

describe('institution account session routing', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
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
});
