export const clearBackendSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  localStorage.removeItem('userProfile');
  sessionStorage.removeItem('justLoggedIn');
};
