const POSTHOG_KEY =
  process.env.REACT_APP_POSTHOG_KEY ||
  process.env.REACT_APP_PUBLIC_POSTHOG_PROJECT_TOKEN ||
  '';

export const POSTHOG_HOST =
  process.env.REACT_APP_POSTHOG_HOST ||
  process.env.REACT_APP_PUBLIC_POSTHOG_HOST ||
  'https://us.i.posthog.com';

const POSTHOG_UI_HOST = process.env.REACT_APP_POSTHOG_UI_HOST || '';
const DEBUG_POSTHOG = process.env.REACT_APP_POSTHOG_DEBUG === 'true';

export const isPostHogEnabled =
  typeof window !== 'undefined' &&
  process.env.NODE_ENV !== 'test' &&
  Boolean(POSTHOG_KEY);

let posthogClient = null;
let posthogLoadPromise = null;

const initPostHog = (client) => {
  client.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    ...(POSTHOG_UI_HOST ? { ui_host: POSTHOG_UI_HOST } : {}),
    defaults: '2026-05-30',
    capture_pageview: false,
    capture_pageleave: true,
    person_profiles: 'identified_only',
    loaded: (loadedClient) => {
      if (DEBUG_POSTHOG) loadedClient.debug();
    },
  });

  return client;
};

export const loadPostHog = () => {
  if (!isPostHogEnabled) return Promise.resolve(null);
  if (posthogClient) return Promise.resolve(posthogClient);
  if (posthogLoadPromise) return posthogLoadPromise;

  posthogLoadPromise = import('posthog-js')
    .then((module) => {
      posthogClient = initPostHog(module.default);
      return posthogClient;
    })
    .catch((error) => {
      posthogLoadPromise = null;
      if (DEBUG_POSTHOG) {
        console.warn('PostHog failed to load', error);
      }
      return null;
    });

  return posthogLoadPromise;
};

export const getPostHog = () => posthogClient;
