import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { isPostHogEnabled, loadPostHog } from '../utils/posthog';

const readUserProfile = () => {
  try {
    return JSON.parse(localStorage.getItem('userProfile') || '{}') || {};
  } catch {
    return {};
  }
};

const getStoredUser = () => {
  const token = localStorage.getItem('token');
  const username = localStorage.getItem('username');

  if (!token || !username) return null;

  const profile = readUserProfile();
  const email = profile.email || (username.includes('@') ? username : undefined);
  const distinctId = profile.email || username;

  return {
    distinctId,
    properties: {
      email,
      username: profile.username || username,
      first_name: profile.firstName || profile.first_name,
      last_name: profile.lastName || profile.last_name,
    },
  };
};

const compactProperties = (properties) =>
  Object.fromEntries(Object.entries(properties).filter(([, value]) => value));

function PostHogRouteTracker() {
  const location = useLocation();
  const previousUserId = useRef(null);
  const previousPage = useRef(null);

  useEffect(() => {
    if (!isPostHogEnabled) return undefined;

    let cancelled = false;

    loadPostHog().then((posthog) => {
      if (cancelled || !posthog) return;

      const user = getStoredUser();
      if (user?.distinctId) {
        if (previousUserId.current !== user.distinctId) {
          posthog.identify(user.distinctId, compactProperties(user.properties));
          previousUserId.current = user.distinctId;
        }
      } else if (previousUserId.current) {
        posthog.reset();
        previousUserId.current = null;
      }

      const pagePath = `${location.pathname}${location.search}${location.hash}`;
      if (previousPage.current !== pagePath) {
        posthog.capture('$pageview', {
          $current_url: window.location.href,
          path: location.pathname,
          search: location.search,
          hash: location.hash,
        });
        previousPage.current = pagePath;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [location.hash, location.pathname, location.search]);

  return null;
}

export default PostHogRouteTracker;
