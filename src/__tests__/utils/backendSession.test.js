import {
  ACCOUNT_LOCAL_STORAGE_KEYS,
  ACCOUNT_SESSION_STORAGE_KEYS,
  clearBackendSession,
} from '../../utils/backendSession';
import { ACCOUNT_SESSION_KEY } from '../../utils/institutionSession';

describe('backend account cleanup', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('removes identity, profile-picture, workspace, and transient account data', () => {
    ACCOUNT_LOCAL_STORAGE_KEYS.forEach((key) => {
      localStorage.setItem(key, `previous-${key}`);
    });
    ACCOUNT_SESSION_STORAGE_KEYS.forEach((key) => {
      sessionStorage.setItem(key, `previous-${key}`);
    });
    sessionStorage.setItem(
      ACCOUNT_SESSION_KEY,
      JSON.stringify({ role: 'learner' })
    );
    localStorage.setItem('public-device-preference', 'keep');

    clearBackendSession();

    ACCOUNT_LOCAL_STORAGE_KEYS.forEach((key) => {
      expect(localStorage.getItem(key)).toBeNull();
    });
    ACCOUNT_SESSION_STORAGE_KEYS.forEach((key) => {
      expect(sessionStorage.getItem(key)).toBeNull();
    });
    expect(sessionStorage.getItem(ACCOUNT_SESSION_KEY)).toBeNull();
    expect(localStorage.getItem('public-device-preference')).toBe('keep');
  });
});
