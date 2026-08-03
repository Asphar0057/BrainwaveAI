import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

import ProfileNew, { getHighResolutionProfilePhoto } from '../../pages/ProfileNew';

describe('profile photo resolution', () => {
  it('requests a high-resolution Google avatar without changing other image sources', () => {
    expect(getHighResolutionProfilePhoto('https://lh3.googleusercontent.com/a/example=s96-c'))
      .toBe('https://lh3.googleusercontent.com/a/example=s1024-c');
    expect(getHighResolutionProfilePhoto('/pfp/cat.png')).toBe('/pfp/cat.png');
    expect(getHighResolutionProfilePhoto('data:image/jpeg;base64,abc'))
      .toBe('data:image/jpeg;base64,abc');
  });
});

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    monthly_price_usd: 0,
    yearly_price_usd: 0,
    included_tokens_monthly: 100000,
    summary: 'Starter',
    features: ['Basic'],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly_price_usd: 15,
    yearly_price_usd: 150,
    included_tokens_monthly: 2000000,
    summary: 'Pro tier',
    features: ['Everything in Starter'],
  },
  {
    id: 'power',
    name: 'Power',
    monthly_price_usd: 25,
    yearly_price_usd: 249,
    included_tokens_monthly: 5000000,
    summary: 'Power tier',
    features: ['Everything in Pro'],
  },
];

function buildProfileFetchMock() {
  let billingCycle = 'monthly';
  let currentPlanId = 'pro';

  return jest.fn((url, options = {}) => {
    if (url.includes('/get_comprehensive_profile')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            firstName: 'Test',
            lastName: 'User',
            email: 'test@example.com',
            preferredSubjects: [],
            showStudyInsights: true,
            notificationsEnabled: true,
          }),
      });
    }

    if (url.includes('/get_gamification_stats')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            level: 1,
            total_points: 100,
            next_level_xp: 200,
          }),
      });
    }

    if (url.includes('/subscription/overview')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            currentPlanId,
            billingCycle,
            subscriptionStatus: 'active',
            subscriptionStartedAt: null,
            plans: PLANS,
            usage: { total_tokens: 1000 },
          }),
      });
    }

    if (url.includes('/subscription/select')) {
      const body = JSON.parse(options.body || '{}');
      billingCycle = body.billingCycle || billingCycle;
      currentPlanId = body.tier || body.subscriptionTier || currentPlanId;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: 'success',
            subscriptionTier: currentPlanId,
            billingCycle,
            subscriptionStatus: 'active',
          }),
      });
    }

    if (url.includes('/subscription/checkout')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: 'pending',
            checkoutUrl: 'https://checkout.stripe.com/test-session',
            sessionId: 'cs_test_123',
          }),
      });
    }

    if (url.includes('/update_comprehensive_profile')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'success' }),
      });
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
  });
}

async function renderProfileNew() {
  let utils;
  await act(async () => {
    utils = render(
      <MemoryRouter>
        <ProfileNew />
      </MemoryRouter>
    );
  });
  return utils;
}

describe('ProfileNew billing cycle regression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('username', 'testuser');
    localStorage.setItem(
      'userProfile',
      JSON.stringify({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
      })
    );
    global.fetch = buildProfileFetchMock();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('updates plan prices correctly when switching monthly/yearly and back', async () => {
    await renderProfileNew();

    await waitFor(() => {
      expect(screen.getByText('SUBSCRIPTION')).toBeInTheDocument();
    });

    const proCard = screen.getByText('Pro').closest('article');
    expect(proCard).toBeTruthy();

    expect(within(proCard).getByText('$15')).toBeInTheDocument();
    expect(within(proCard).getByText('/mo')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Yearly' }));
    });

    await waitFor(() => {
      expect(within(proCard).getByText('$150')).toBeInTheDocument();
      expect(within(proCard).getByText('/yr')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(within(proCard).queryByText('$15')).not.toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Monthly' }));
    });

    await waitFor(() => {
      expect(within(proCard).getByText('$15')).toBeInTheDocument();
      expect(within(proCard).getByText('/mo')).toBeInTheDocument();
    });

    const selectCalls = global.fetch.mock.calls
      .filter(([url]) => url.includes('/subscription/select'))
      .map(([, options]) => JSON.parse(options.body || '{}'));
    expect(selectCalls).toHaveLength(0);
  });
});
