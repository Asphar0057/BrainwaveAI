import { getProfileExperience } from '../../utils/profileExperience';

describe('role-aware profile experience', () => {
  it('keeps plan and usage information for learner accounts', () => {
    const profile = getProfileExperience('learner');
    expect(profile.dashboardRoute).toBe('/dashboard-cerbyl');
    expect(profile.identityLabel).toBe('Your learner identity');
    expect(profile.showPaymentInformation).toBe(true);
  });

  it.each([
    ['student', '/student', 'Your student identity'],
    ['educator', '/educator', 'Your educator identity'],
  ])('removes payment information for %s accounts', (role, route, identityLabel) => {
    const profile = getProfileExperience(role);
    expect(profile.dashboardRoute).toBe(route);
    expect(profile.identityLabel).toBe(identityLabel);
    expect(profile.showPaymentInformation).toBe(false);
  });

  it('fails closed while the account role is unresolved', () => {
    const profile = getProfileExperience(null);
    expect(profile.dashboardRoute).toBe('/workspace');
    expect(profile.showPaymentInformation).toBe(false);
  });
});

