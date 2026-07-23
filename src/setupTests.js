
import '@testing-library/jest-dom';

jest.mock('./firebase/config', () => ({
  __esModule: true,
  default: {},
  auth: { currentUser: null },
  authPersistenceReady: Promise.resolve(),
  googleProvider: { setCustomParameters: jest.fn() },
  analytics: null,
}));

global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() { return null; }
  unobserve() { return null; }
  disconnect() { return null; }
};

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }),
});
