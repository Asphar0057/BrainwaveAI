#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { performance } = require('perf_hooks');
const { chromium } = require('@playwright/test');

const repoRoot = path.resolve(__dirname, '..');
const startedAt = new Date();
const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
const outputDir = path.join(repoRoot, 'test-results', 'load', stamp);

const config = {
  baseUrl: envUrl('LOAD_TEST_BASE_URL', 'http://localhost:3000'),
  apiUrl: envUrl('LOAD_TEST_API_URL', 'http://localhost:8000/api'),
  levels: parseNumberList(process.env.LOAD_TEST_USERS, [2, 5, 10, 20]),
  iterations: parseIntEnv('LOAD_TEST_ITERATIONS', 2),
  thinkMs: parseIntEnv('LOAD_TEST_THINK_MS', 350),
  timeoutMs: parseIntEnv('LOAD_TEST_TIMEOUT_MS', 30000),
  metricIntervalMs: parseIntEnv('LOAD_TEST_METRIC_INTERVAL_MS', 2000),
  headless: process.env.LOAD_TEST_HEADLESS !== 'false',
  dockerContainers: parseList(process.env.LOAD_TEST_DOCKER_CONTAINERS, [
    'brainwave-backend',
    'brainwave-frontend',
    'brainwave-redis',
    'l1-ai-worker-1',
  ]),
  publicRoutes: parseList(process.env.LOAD_TEST_PUBLIC_ROUTES, [
    '/',
    '/login',
    '/register',
    '/dashboard-cerbyl',
    '/notes',
    '/ai-chat',
  ]),
  authedRoutes: parseList(process.env.LOAD_TEST_AUTHED_ROUTES, [
    '/dashboard-cerbyl',
    '/ai-chat',
    '/notes',
    '/question-bank',
    '/contexthub',
  ]),
  apiPaths: parseList(process.env.LOAD_TEST_API_PATHS, [
    '/health',
    '/health/ready',
  ]),
  username: process.env.LOAD_TEST_USERNAME || '',
  password: process.env.LOAD_TEST_PASSWORD || '',
  token: process.env.LOAD_TEST_TOKEN || '',
};

function parseIntEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNumberList(raw, fallback) {
  if (!raw) return fallback;
  const parsed = raw
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item > 0);
  return parsed.length ? parsed : fallback;
}

function parseList(raw, fallback) {
  if (!raw) return fallback;
  const parsed = raw.split(',').map((item) => item.trim()).filter(Boolean);
  return parsed.length ? parsed : fallback;
}

function envUrl(name, fallback) {
  return (process.env[name] || fallback).replace(/\/+$/, '');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(command, args, options = {}) {
  const timeout = options.timeout || 15000;
  return new Promise((resolve) => {
    execFile(command, args, { timeout, maxBuffer: 1024 * 1024 * 8 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        command: [command, ...args].join(' '),
        code: error?.code ?? 0,
        error: error?.message || '',
        stdout: stdout || '',
        stderr: stderr || '',
      });
    });
  });
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[index]);
}

function summarizeTimings(items) {
  const durations = items.map((item) => item.durationMs).filter((value) => Number.isFinite(value));
  return {
    count: durations.length,
    minMs: durations.length ? Math.round(Math.min(...durations)) : null,
    avgMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    maxMs: durations.length ? Math.round(Math.max(...durations)) : null,
  };
}

async function captureMetrics(label) {
  const [dockerStats, dockerPs, hostPs, vmStat, uptime] = await Promise.all([
    runCommand('docker', ['stats', '--no-stream', '--format', '{{json .}}'], { timeout: 8000 }),
    runCommand('docker', ['ps', '--format', '{{.Names}}\t{{.Status}}\t{{.Ports}}'], { timeout: 8000 }),
    runCommand('ps', ['-A', '-o', 'pid,ppid,%cpu,%mem,rss,command'], { timeout: 8000 }),
    runCommand('vm_stat', [], { timeout: 8000 }),
    runCommand('uptime', [], { timeout: 8000 }),
  ]);

  return {
    label,
    at: new Date().toISOString(),
    loadavg: os.loadavg(),
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytes: os.freemem(),
    dockerStats,
    dockerPs,
    focusedProcesses: filterProcessOutput(hostPs.stdout),
    hostPsOk: hostPs.ok,
    hostPsError: hostPs.error || hostPs.stderr,
    vmStat,
    uptime,
  };
}

function filterProcessOutput(stdout) {
  const lines = stdout.split('\n');
  const header = lines.shift() || '';
  const patterns = [
    /gunicorn/i,
    /uvicorn/i,
    /python/i,
    /node/i,
    /react-scripts/i,
    /chrome/i,
    /docker/i,
    /redis/i,
  ];
  return [header, ...lines.filter((line) => patterns.some((pattern) => pattern.test(line)))].join('\n').trim();
}

async function captureDockerLogs(label) {
  const logs = {};
  await Promise.all(config.dockerContainers.map(async (container) => {
    const result = await runCommand('docker', ['logs', '--tail', '250', container], { timeout: 10000 });
    logs[container] = result;
    const filename = path.join(outputDir, `${label}-${container}.log`);
    fs.writeFileSync(filename, [
      `$ ${result.command}`,
      result.ok ? '' : `ERROR: ${result.error}`,
      result.stderr,
      result.stdout,
    ].join('\n'));
  }));
  return logs;
}

async function probeApi(request, pathName, token) {
  const started = performance.now();
  const url = `${config.apiUrl}${pathName.startsWith('/') ? pathName : `/${pathName}`}`;
  try {
    const response = await request.get(url, {
      timeout: config.timeoutMs,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    return {
      url,
      status: response.status(),
      ok: response.ok(),
      durationMs: performance.now() - started,
    };
  } catch (error) {
    return {
      url,
      status: null,
      ok: false,
      durationMs: performance.now() - started,
      error: error.message,
    };
  }
}

async function maybeLogin(page, userId) {
  if (config.token) {
    await page.addInitScript(({ token, username }) => {
      window.localStorage.setItem('token', token);
      window.localStorage.setItem('username', username || `load-user-${Date.now()}`);
      window.sessionStorage.setItem('safetyAccepted', 'true');
    }, { token: config.token, username: config.username || `load-user-${userId}` });
    return { mode: 'token', ok: true };
  }

  if (!config.username || !config.password) {
    return { mode: 'anonymous', ok: true };
  }

  try {
    await page.goto(`${config.baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: config.timeoutMs });
    await page.locator('input[type="text"], input[name="username"], input[autocomplete="username"]').first().fill(config.username);
    await page.locator('input[type="password"]').first().fill(config.password);
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: config.timeoutMs }).catch(() => {}),
      page.locator('button[type="submit"], .lg-primary-btn, button:has-text("Sign")').first().click(),
    ]);
    const hasToken = await page.evaluate(() => Boolean(window.localStorage.getItem('token')));
    return { mode: 'form', ok: hasToken };
  } catch (error) {
    return { mode: 'form', ok: false, error: error.message };
  }
}

async function runUser(browser, userId, level) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const result = {
    userId,
    level,
    login: null,
    navigations: [],
    api: [],
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
  };

  page.on('console', (message) => {
    if (message.type() === 'error') {
      result.consoleErrors.push(message.text().slice(0, 500));
    }
  });
  page.on('pageerror', (error) => {
    result.pageErrors.push(error.message.slice(0, 500));
  });
  page.on('requestfailed', (request) => {
    result.requestFailures.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText || 'unknown',
    });
  });

  try {
    result.login = await maybeLogin(page, userId);
    const routes = result.login?.mode === 'anonymous' ? config.publicRoutes : config.authedRoutes;

    for (let i = 0; i < config.iterations; i += 1) {
      for (const route of routes) {
        const started = performance.now();
        const url = `${config.baseUrl}${route.startsWith('/') ? route : `/${route}`}`;
        try {
          const response = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: config.timeoutMs,
          });
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
          result.navigations.push({
            route,
            status: response?.status() ?? null,
            ok: response ? response.ok() : true,
            finalUrl: page.url(),
            durationMs: performance.now() - started,
          });
        } catch (error) {
          result.navigations.push({
            route,
            status: null,
            ok: false,
            finalUrl: page.url(),
            durationMs: performance.now() - started,
            error: error.message,
          });
        }
        await sleep(config.thinkMs);
      }

      for (const apiPath of config.apiPaths) {
        result.api.push(await probeApi(context.request, apiPath, config.token));
      }
    }
  } finally {
    await context.close();
  }

  return result;
}

async function runLevel(level) {
  console.log(`\n=== Running ${level} users ===`);
  const before = await captureMetrics(`before-${level}`);
  await captureDockerLogs(`before-${level}`);

  const metricSamples = [];
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      metricSamples.push(await captureMetrics(`during-${level}-${metricSamples.length + 1}`));
      await sleep(config.metricIntervalMs);
    }
  })();

  const browser = await chromium.launch({ headless: config.headless });
  const started = performance.now();
  let users = [];
  try {
    users = await Promise.all(
      Array.from({ length: level }, (_, index) => runUser(browser, index + 1, level))
    );
  } finally {
    await browser.close();
    sampling = false;
    await sampler;
  }

  const elapsedMs = performance.now() - started;
  const after = await captureMetrics(`after-${level}`);
  await captureDockerLogs(`after-${level}`);

  const navigations = users.flatMap((user) => user.navigations);
  const api = users.flatMap((user) => user.api);
  const failures = [
    ...navigations.filter((item) => !item.ok),
    ...api.filter((item) => !item.ok),
  ];
  const consoleErrorCount = users.reduce((sum, user) => sum + user.consoleErrors.length, 0);
  const pageErrorCount = users.reduce((sum, user) => sum + user.pageErrors.length, 0);
  const requestFailureCount = users.reduce((sum, user) => sum + user.requestFailures.length, 0);

  const summary = {
    level,
    elapsedMs: Math.round(elapsedMs),
    userCount: users.length,
    navigationTiming: summarizeTimings(navigations),
    apiTiming: summarizeTimings(api),
    navigationCount: navigations.length,
    apiCount: api.length,
    failureCount: failures.length,
    consoleErrorCount,
    pageErrorCount,
    requestFailureCount,
  };

  const levelResult = {
    summary,
    before,
    after,
    metricSamples,
    users,
  };
  fs.writeFileSync(path.join(outputDir, `level-${level}.json`), JSON.stringify(levelResult, null, 2));
  console.log(formatSummary(summary));
  return levelResult;
}

function formatSummary(summary) {
  return [
    `users=${summary.level}`,
    `elapsed=${summary.elapsedMs}ms`,
    `nav_avg=${summary.navigationTiming.avgMs ?? 'n/a'}ms`,
    `nav_p95=${summary.navigationTiming.p95Ms ?? 'n/a'}ms`,
    `api_avg=${summary.apiTiming.avgMs ?? 'n/a'}ms`,
    `api_p95=${summary.apiTiming.p95Ms ?? 'n/a'}ms`,
    `failures=${summary.failureCount}`,
    `console_errors=${summary.consoleErrorCount}`,
    `page_errors=${summary.pageErrorCount}`,
    `request_failures=${summary.requestFailureCount}`,
  ].join(' ');
}

function dockerStatsText(metrics) {
  const output = metrics?.dockerStats?.stdout?.trim();
  if (!output) {
    const error = metrics?.dockerStats?.error || metrics?.dockerStats?.stderr || 'no docker stats output';
    return `Docker unavailable: ${error.trim()}`;
  }
  return output.split('\n').slice(0, 8).join('\n');
}

function writeMarkdownReport(results) {
  const lines = [];
  lines.push('# Brainwave Playwright Load Test');
  lines.push('');
  lines.push(`Started: ${startedAt.toISOString()}`);
  lines.push(`Base URL: ${config.baseUrl}`);
  lines.push(`API URL: ${config.apiUrl}`);
  lines.push(`Levels: ${config.levels.join(', ')}`);
  lines.push(`Iterations per user: ${config.iterations}`);
  lines.push(`Headless: ${config.headless}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Users | Elapsed ms | Nav avg | Nav p95 | API avg | API p95 | Failures | Console errors | Page errors | Request failures |');
  lines.push('| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const result of results) {
    const s = result.summary;
    lines.push([
      s.level,
      s.elapsedMs,
      s.navigationTiming.avgMs ?? '',
      s.navigationTiming.p95Ms ?? '',
      s.apiTiming.avgMs ?? '',
      s.apiTiming.p95Ms ?? '',
      s.failureCount,
      s.consoleErrorCount,
      s.pageErrorCount,
      s.requestFailureCount,
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('');
  lines.push('## Docker Stats After Each Level');
  for (const result of results) {
    lines.push('');
    lines.push(`### ${result.summary.level} users`);
    lines.push('```');
    lines.push(dockerStatsText(result.after));
    lines.push('```');
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- Full per-user timings, request failures, host process samples, and Docker command errors are in the JSON files next to this report.');
  lines.push('- Docker logs are saved as `before-*` and `after-*` log files when the Docker daemon is reachable.');
  fs.writeFileSync(path.join(outputDir, 'report.md'), `${lines.join('\n')}\n`);
}

async function main() {
  ensureDir(outputDir);
  fs.writeFileSync(path.join(outputDir, 'config.json'), JSON.stringify({
    ...config,
    password: config.password ? '<provided>' : '',
    token: config.token ? '<provided>' : '',
  }, null, 2));

  console.log(`Writing load-test artifacts to ${outputDir}`);
  const reachability = await Promise.all([
    runCommand('curl', ['-sS', '-m', '5', '-o', '/dev/null', '-w', '%{http_code}', config.baseUrl], { timeout: 8000 }),
    runCommand('curl', ['-sS', '-m', '5', '-o', '/dev/null', '-w', '%{http_code}', `${config.apiUrl}/health`], { timeout: 8000 }),
  ]);
  fs.writeFileSync(path.join(outputDir, 'reachability.json'), JSON.stringify({
    frontend: reachability[0],
    backendHealth: reachability[1],
  }, null, 2));

  const results = [];
  for (const level of config.levels) {
    results.push(await runLevel(level));
  }
  writeMarkdownReport(results);
  fs.writeFileSync(path.join(outputDir, 'results.json'), JSON.stringify({
    config: {
      ...config,
      password: config.password ? '<provided>' : '',
      token: config.token ? '<provided>' : '',
    },
    results,
  }, null, 2));
  console.log(`\nReport: ${path.join(outputDir, 'report.md')}`);

  const failed = results.some((result) => result.summary.failureCount > 0 || result.summary.pageErrorCount > 0);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
