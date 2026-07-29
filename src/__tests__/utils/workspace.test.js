import {
  getActiveWorkspace,
  getWorkspaceDestination,
  setActiveWorkspace,
  setLearnDestination,
  WORKSPACE_KEY,
} from '../../utils/workspace';

describe('workspace routing', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores valid test workspaces and resolves their dashboards', () => {
    setActiveWorkspace('student');
    expect(getActiveWorkspace()).toBe('student');
    expect(getWorkspaceDestination('student')).toBe('/student');

    setActiveWorkspace('educator');
    expect(getActiveWorkspace()).toBe('educator');
    expect(getWorkspaceDestination('educator')).toBe('/educator');
  });

  it('keeps the existing learner onboarding destination', () => {
    setLearnDestination('/profile-quiz');
    expect(getWorkspaceDestination('learn')).toBe('/profile-quiz');

    setLearnDestination('/dashboard-cerbyl');
    expect(getWorkspaceDestination('learn')).toBe('/dashboard-cerbyl');
  });

  it('ignores unknown workspaces', () => {
    setActiveWorkspace('administrator');
    expect(localStorage.getItem(WORKSPACE_KEY)).toBeNull();
    expect(getActiveWorkspace()).toBeNull();
  });
});
