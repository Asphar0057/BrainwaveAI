#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');

const repoRoot = path.resolve(__dirname, '..');
const startedAt = new Date();
const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
const outputDir = path.join(repoRoot, 'test-results', 'ai-load', stamp);

const config = {
  apiUrl: (process.env.AI_LOAD_API_URL || 'https://api.cerbyl.com/api').replace(/\/+$/, ''),
  token: process.env.AI_LOAD_TOKEN || process.env.LOAD_TEST_TOKEN || '',
  username: process.env.AI_LOAD_USERNAME || process.env.LOAD_TEST_USERNAME || '',
  levels: parseNumberList(process.env.AI_LOAD_USERS, [2, 5, 10, 20]),
  timeoutMs: parseIntEnv('AI_LOAD_TIMEOUT_MS', 180000),
  thinkMs: parseIntEnv('AI_LOAD_THINK_MS', 0),
};

function parseIntEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseNumberList(raw, fallback) {
  if (!raw) return fallback;
  const parsed = raw
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item > 0);
  return parsed.length ? parsed : fallback;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[index]);
}

function summarize(items) {
  const durations = items.map((item) => item.durationMs).filter(Number.isFinite);
  return {
    count: durations.length,
    minMs: durations.length ? Math.round(Math.min(...durations)) : null,
    avgMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    maxMs: durations.length ? Math.round(Math.max(...durations)) : null,
  };
}

function makeJsonBody(endpoint, workerId, level) {
  const topic = `load test ${level}-${workerId} spaced repetition`;
  if (endpoint === 'practice_questions') {
    return {
      user_id: config.username,
      topic,
      question_count: 2,
      difficulty: 'easy',
      question_types: ['multiple_choice'],
      title: `Load test questions ${level}-${workerId}`,
      generation_type: 'topic',
      additional_specs: 'Keep each question short. This is a production load test.',
      use_hs_context: false,
    };
  }
  if (endpoint === 'learning_path') {
    return {
      topicPrompt: topic,
      difficulty: 'beginner',
      length: 'short',
      goals: ['Measure concurrent generation latency with minimal output.'],
    };
  }
  throw new Error(`Unknown JSON endpoint ${endpoint}`);
}

function makeFormBody(endpoint, workerId, level) {
  const form = new URLSearchParams();
  const topic = `load test ${level}-${workerId} active recall`;
  form.set('user_id', config.username);

  if (endpoint === 'ask_simple') {
    const question = `In two short sentences, explain why active recall helps memory. Load test ${level}-${workerId}.`;
    form.set('question', question);
    form.set('original_question', question);
    form.set('use_hs_context', 'false');
    form.set('tutor_mode', 'false');
    return form;
  }

  if (endpoint === 'flashcards') {
    form.set('topic', topic);
    form.set('generation_type', 'topic');
    form.set('card_count', '3');
    form.set('difficulty', 'easy');
    form.set('depth_level', 'basic');
    form.set('additional_specs', 'Keep cards concise. This is a production load test.');
    form.set('use_hs_context', 'false');
    form.set('set_title', `Load Test Flashcards ${level}-${workerId}`);
    form.set('is_public', 'false');
    return form;
  }

  throw new Error(`Unknown form endpoint ${endpoint}`);
}

const operations = [
  {
    name: 'ask_simple',
    method: 'POST',
    path: '/ask_simple/',
    bodyType: 'form',
  },
  {
    name: 'flashcards',
    method: 'POST',
    path: '/generate_flashcards',
    bodyType: 'form',
  },
  {
    name: 'practice_questions',
    method: 'POST',
    path: '/generate_practice_questions',
    bodyType: 'json',
  },
  {
    name: 'learning_path',
    method: 'POST',
    path: '/learning-paths/generate',
    bodyType: 'json',
  },
];

async function callOperation(operation, workerId, level) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const started = performance.now();
  const url = `${config.apiUrl}${operation.path}`;

  const headers = {
    Authorization: `Bearer ${config.token}`,
  };
  let body;
  if (operation.bodyType === 'json') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(makeJsonBody(operation.name, workerId, level));
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = makeFormBody(operation.name, workerId, level).toString();
  }

  try {
    const response = await fetch(url, {
      method: operation.method,
      headers,
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      parsed = null;
    }
    return {
      workerId,
      level,
      operation: operation.name,
      url,
      status: response.status,
      ok: response.ok,
      durationMs: performance.now() - started,
      responseBytes: Buffer.byteLength(text),
      responseKeys: parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? Object.keys(parsed).slice(0, 20)
        : [],
      errorDetail: response.ok ? '' : summarizeError(parsed, text),
    };
  } catch (error) {
    return {
      workerId,
      level,
      operation: operation.name,
      url,
      status: null,
      ok: false,
      durationMs: performance.now() - started,
      responseBytes: 0,
      responseKeys: [],
      errorDetail: error.name === 'AbortError' ? `timeout after ${config.timeoutMs}ms` : error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function summarizeError(parsed, text) {
  if (parsed && typeof parsed === 'object') {
    const detail = parsed.detail || parsed.error || parsed.message || parsed.last_error;
    if (detail) return String(detail).slice(0, 500);
    return JSON.stringify(parsed).slice(0, 500);
  }
  return String(text || '').slice(0, 500);
}

async function runLevel(level) {
  console.log(`\n=== AI load: ${level} concurrent operations ===`);
  const started = performance.now();
  const tasks = Array.from({ length: level }, async (_, index) => {
    if (config.thinkMs) await sleep(config.thinkMs * index);
    const operation = operations[index % operations.length];
    return callOperation(operation, index + 1, level);
  });
  const results = await Promise.all(tasks);
  const elapsedMs = Math.round(performance.now() - started);

  const byOperation = {};
  for (const op of operations) {
    const rows = results.filter((item) => item.operation === op.name);
    byOperation[op.name] = {
      attempts: rows.length,
      ok: rows.filter((item) => item.ok).length,
      failed: rows.filter((item) => !item.ok).length,
      timing: summarize(rows),
      statuses: rows.reduce((acc, item) => {
        const key = String(item.status ?? 'error');
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    };
  }

  const summary = {
    level,
    elapsedMs,
    attempts: results.length,
    ok: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    timing: summarize(results),
    byOperation,
  };

  console.log(formatSummary(summary));
  return { summary, results };
}

function formatSummary(summary) {
  return [
    `level=${summary.level}`,
    `elapsed=${summary.elapsedMs}ms`,
    `ok=${summary.ok}/${summary.attempts}`,
    `avg=${summary.timing.avgMs ?? 'n/a'}ms`,
    `p95=${summary.timing.p95Ms ?? 'n/a'}ms`,
    `max=${summary.timing.maxMs ?? 'n/a'}ms`,
    `failed=${summary.failed}`,
  ].join(' ');
}

function writeReport(levels) {
  const lines = [];
  lines.push('# Brainwave AI Concurrency Load Test');
  lines.push('');
  lines.push(`Started: ${startedAt.toISOString()}`);
  lines.push(`API URL: ${config.apiUrl}`);
  lines.push(`Levels: ${config.levels.join(', ')}`);
  lines.push(`Operations: ${operations.map((op) => op.name).join(', ')}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Concurrent ops | OK | Failed | Avg ms | P50 ms | P95 ms | Max ms | Elapsed ms |');
  lines.push('| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const level of levels) {
    const s = level.summary;
    lines.push(`| ${s.level} | ${s.ok} | ${s.failed} | ${s.timing.avgMs ?? ''} | ${s.timing.p50Ms ?? ''} | ${s.timing.p95Ms ?? ''} | ${s.timing.maxMs ?? ''} | ${s.elapsedMs} |`);
  }
  lines.push('');
  lines.push('## By Operation');
  for (const level of levels) {
    lines.push('');
    lines.push(`### ${level.summary.level} concurrent operations`);
    lines.push('| Operation | Attempts | OK | Failed | Avg ms | P95 ms | Statuses |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const [name, op] of Object.entries(level.summary.byOperation)) {
      lines.push(`| ${name} | ${op.attempts} | ${op.ok} | ${op.failed} | ${op.timing.avgMs ?? ''} | ${op.timing.p95Ms ?? ''} | ${JSON.stringify(op.statuses)} |`);
    }
  }
  fs.writeFileSync(path.join(outputDir, 'report.md'), `${lines.join('\n')}\n`);
}

async function main() {
  if (!config.token || !config.username) {
    console.error('AI_LOAD_TOKEN and AI_LOAD_USERNAME are required.');
    process.exit(2);
  }

  ensureDir(outputDir);
  fs.writeFileSync(path.join(outputDir, 'config.json'), JSON.stringify({
    ...config,
    token: '<provided>',
    host: os.hostname(),
  }, null, 2));

  console.log(`Writing AI load artifacts to ${outputDir}`);
  const levels = [];
  for (const level of config.levels) {
    levels.push(await runLevel(level));
  }

  fs.writeFileSync(path.join(outputDir, 'results.json'), JSON.stringify({ levels }, null, 2));
  writeReport(levels);
  console.log(`\nReport: ${path.join(outputDir, 'report.md')}`);

  if (levels.some((level) => level.summary.failed > 0)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
