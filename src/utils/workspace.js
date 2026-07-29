export const WORKSPACE_KEY = 'cerbyl.activeWorkspace';
export const LEARN_DESTINATION_KEY = 'cerbyl.learnDestination';

export const WORKSPACES = {
  learn: {
    id: 'learn',
    name: 'Cerbyl Learn',
    route: '/dashboard-cerbyl',
  },
  student: {
    id: 'student',
    name: 'Cerbyl Student',
    route: '/student',
  },
  educator: {
    id: 'educator',
    name: 'Cerbyl Educator',
    route: '/educator',
  },
};

export const setActiveWorkspace = (workspaceId) => {
  if (WORKSPACES[workspaceId]) {
    localStorage.setItem(WORKSPACE_KEY, workspaceId);
  }
};

export const getActiveWorkspace = () => {
  const stored = localStorage.getItem(WORKSPACE_KEY);
  return WORKSPACES[stored] ? stored : null;
};

export const setLearnDestination = (route) => {
  localStorage.setItem(LEARN_DESTINATION_KEY, route || WORKSPACES.learn.route);
};

export const getWorkspaceDestination = (workspaceId) => {
  if (workspaceId === 'learn') {
    return localStorage.getItem(LEARN_DESTINATION_KEY) || WORKSPACES.learn.route;
  }
  return WORKSPACES[workspaceId]?.route || '/workspace';
};

