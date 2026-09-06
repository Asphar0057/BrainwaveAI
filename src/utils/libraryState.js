const keyFor = (scope) => `cerbyl.library:${localStorage.getItem('username') || 'signed-out'}:${scope}`;
export function readLibraryState(scope) {
  try { return JSON.parse(sessionStorage.getItem(keyFor(scope))) || {}; }
  catch { return {}; }
}
export function writeLibraryState(scope, patch) {
  try { sessionStorage.setItem(keyFor(scope), JSON.stringify({ ...readLibraryState(scope), ...patch })); }
  catch { /* Navigation remains usable when browser storage is unavailable. */ }
}
