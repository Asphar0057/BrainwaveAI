# k6 smoke & load tests

Grafana k6 scripts that exercise Cerbyl end to end: the React frontend
(`https://cerbyl.com`) and the FastAPI backend (AWS EC2, `api.cerbyl.com`,
`REACT_APP_API_URL` in `.env.production`).

Install k6 once: `winget install GrafanaLabs.k6` (already installed in this
environment as `k6.exe v2.0.0`).

## Files

- `config.js` — shared target URLs and an optional login helper. Reads
  `FRONTEND_URL`, `API_URL`, `TEST_USERNAME`, `TEST_PASSWORD` from `-e` flags;
  defaults to production.
- `smoke.js` — 1 VU / 1 pass over the critical paths: frontend shell loads,
  `/api/health`, `/openapi.json`, login/register reject bad input with 4xx
  (not 5xx), and an optional authenticated check if test creds are supplied.
  Run this after every deploy.
- `load.js` — ramping-VU load test of the public browsing flow plus an
  optional authenticated dashboard journey (only enabled when
  `TEST_USERNAME`/`TEST_PASSWORD` are set).

## Running against production (default)

```
k6 run tests/k6/smoke.js
k6 run tests/k6/load.js
```

`load.js` defaults to a conservative ramp (10 public VUs / 5 authenticated
VUs, ~3 minutes) because it targets the **live site** by default. nginx in
front of the API enforces `20r/s` general, `5r/m` auth and `10r/m` AI-route
limits (see `nginx.prod.conf`) and real users share that capacity — don't
raise VUs/duration for a prod run without coordinating with the team.

## Running against local dev

Start the backend (`python start_backend.py`, port 8000) and frontend
(`npm start`, port 3000), then:

```
k6 run -e FRONTEND_URL=http://localhost:3000 -e API_URL=http://localhost:8000/api tests/k6/smoke.js
k6 run -e FRONTEND_URL=http://localhost:3000 -e API_URL=http://localhost:8000/api tests/k6/load.js
```

This is the right place to push VUs/duration much higher for real load
testing.

## Authenticated checks (optional)

Create a dedicated test account (never use a real user's credentials) and
pass it in:

```
k6 run -e TEST_USERNAME=k6-loadtest -e TEST_PASSWORD=... tests/k6/smoke.js
k6 run -e TEST_USERNAME=k6-loadtest -e TEST_PASSWORD=... tests/k6/load.js
```

Without these, both scripts skip the authenticated checks/scenario entirely
— the public-route checks still run.

## Reading results

k6 prints a summary with `checks`, `http_req_duration` percentiles and
`http_req_failed` rate. Both scripts define thresholds (`smoke.js` fails the
run on any failed check or p95 > 3s; `load.js` fails on > 1% error rate or
p95 > 1.5s / p99 > 3s) — a non-zero k6 exit code means something regressed.
