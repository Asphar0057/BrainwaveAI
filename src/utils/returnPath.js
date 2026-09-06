const KEY = 'cerbyl.auth.returnTo';
export const safeReturnPath = value => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !/^\/(login|register|workspace)([/?#]|$)/.test(value) ? value : null;
export const rememberReturnPath = value => { const path = safeReturnPath(value); if (path) sessionStorage.setItem(KEY, path); };
export const consumeReturnPath = () => { const value = safeReturnPath(sessionStorage.getItem(KEY)); sessionStorage.removeItem(KEY); return value; };
