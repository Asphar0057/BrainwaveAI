// Load test: ramps virtual users against the public surface (and, optionally,
// authenticated routes if TEST_USERNAME/TEST_PASSWORD are supplied).
//
// Defaults are deliberately conservative because, by default, this targets
// the LIVE production site (https://cerbyl.com + the AWS backend), which
// sits behind nginx rate limits (20r/s general, 5r/m auth, 10r/m AI routes —
// see nginx.prod.conf) and real users. Do not raise VUs/duration for a prod
// run without coordinating — prefer pointing this at local/staging for heavy
// load:
//
//   k6 run -e FRONTEND_URL=http://localhost:3000 \
//          -e API_URL=http://localhost:8000/api \
//          -e TEST_USERNAME=loadtest -e TEST_PASSWORD=... \
//          tests/k6/load.js
//
// Against prod (light, default settings):
//   k6 run tests/k6/load.js

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { FRONTEND_URL, API_URL, TEST_USERNAME, TEST_PASSWORD, authHeaders } from './config.js';

const scenarios = {
  public_browsing: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 10 },
      { duration: '2m', target: 10 },
      { duration: '30s', target: 0 },
    ],
    exec: 'browsePublicPages',
  },
};

if (TEST_USERNAME && TEST_PASSWORD) {
  scenarios.authenticated_journey = {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 5 },
      { duration: '2m', target: 5 },
      { duration: '30s', target: 0 },
    ],
    exec: 'authenticatedJourney',
  };
}

export const options = {
  scenarios,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
  },
};

export function setup() {
  return { headers: authHeaders() };
}

export function browsePublicPages() {
  group('frontend pages', () => {
    check(http.get(`${FRONTEND_URL}/`), { 'home returns 2xx': (r) => r.status < 300 });
    sleep(Math.random() * 2 + 1);
    check(http.get(`${FRONTEND_URL}/login`), { 'login page returns 2xx': (r) => r.status < 300 });
  });

  group('backend health', () => {
    check(http.get(`${API_URL}/health`), { 'health returns 2xx/207': (r) => r.status < 300 || r.status === 207 });
  });

  sleep(Math.random() * 3 + 1);
}

export function authenticatedJourney(data) {
  if (!data.headers) return;

  group('authenticated dashboard journey', () => {
    check(http.get(`${API_URL}/me`, { headers: data.headers }), {
      '/me returns 200': (r) => r.status === 200,
    });
    check(http.get(`${API_URL}/get_dashboard_data`, { headers: data.headers }), {
      'dashboard data returns 200': (r) => r.status === 200,
    });
    check(http.get(`${API_URL}/get_notes`, { headers: data.headers }), {
      'notes list returns 200': (r) => r.status === 200,
    });
    check(http.get(`${API_URL}/get_flashcards`, { headers: data.headers }), {
      'flashcards list returns 200': (r) => r.status === 200,
    });
  });

  sleep(Math.random() * 3 + 1);
}
