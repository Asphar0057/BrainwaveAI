export const draftKey = (scope) => `cerbyl.draft:${localStorage.getItem('username') || 'signed-out'}:${scope}`;
export const readDraft = (scope, fallback) => {
  try { return JSON.parse(localStorage.getItem(draftKey(scope))) ?? fallback; }
  catch { return fallback; }
};
export const writeDraft = (scope, value) => {
  try { localStorage.setItem(draftKey(scope), JSON.stringify(value)); return true; }
  catch { return false; }
};
export const clearDraft = (scope) => localStorage.removeItem(draftKey(scope));
