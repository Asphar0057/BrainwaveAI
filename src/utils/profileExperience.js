const PROFILE_EXPERIENCES = {
  learner: {
    role: 'learner',
    identityLabel: 'Your learner identity',
    workspaceLabel: 'Learner workspace',
    dashboardRoute: '/dashboard-cerbyl',
    showPaymentInformation: true,
  },
  student: {
    role: 'student',
    identityLabel: 'Your student identity',
    workspaceLabel: 'Student workspace',
    dashboardRoute: '/student',
    showPaymentInformation: false,
  },
  educator: {
    role: 'educator',
    identityLabel: 'Your educator identity',
    workspaceLabel: 'Educator workspace',
    dashboardRoute: '/educator',
    showPaymentInformation: false,
  },
};

export const getProfileExperience = (role) => (
  PROFILE_EXPERIENCES[role] || {
    role: null,
    identityLabel: 'Your Cerbyl identity',
    workspaceLabel: 'Cerbyl workspace',
    dashboardRoute: '/workspace',
    showPaymentInformation: false,
  }
);

