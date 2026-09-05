import { API_URL, getAuthToken } from '../config';
import { createUsageLimitError, getUsageLimitFromResponse } from '../utils/usageLimit';

export const USE_AI_JOB_QUEUE = process.env.REACT_APP_USE_AI_JOB_QUEUE === 'true';

const DEFAULT_POLL_INTERVAL_MS = 1000;
const PENDING_JOBS_KEY = 'cerbyl.aiJobs';
const ACTIVE_JOB_STATUSES = new Set(['preparing', 'queued', 'running', 'retrying']);

const authHeaders = (extra = {}) => {
  const token = getAuthToken();
  return { ...(token && { Authorization: `Bearer ${token}` }), ...extra };
};

const owner = () => {
  try {
    const token = getAuthToken();
    const payload = token?.split('.')[1];
    return payload ? JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).sub : null;
  } catch (_) { return null; }
};

export function getPendingAIJobs() {
  try {
    const jobs = JSON.parse(localStorage.getItem(PENDING_JOBS_KEY) || '[]');
    return Array.isArray(jobs) ? jobs.filter(job => job.owner === owner() && job.api === API_URL) : [];
  } catch (_) { return []; }
}

export async function discoverPendingChatJobs(chatSessionId, signal) {
  const local = getPendingAIJobs().filter(job => String(job.chatSessionId) === String(chatSessionId));
  try {
    const response = await fetch(`${API_URL}/ai/jobs?chat_session_id=${encodeURIComponent(chatSessionId)}`, {
      headers: authHeaders(), signal,
    });
    if (!response.ok) return local;
    const remote = await response.json();
    remote.forEach(job => rememberJob(job, chatSessionId));
    return [...new Map([...local, ...remote].map(job => [job.id, job])).values()];
  } catch (error) {
    if (signal?.aborted) throw aborted();
    return local;
  }
}

function rememberJob(job, chatSessionId = null) {
  try {
    const jobs = getPendingAIJobs().filter(entry => entry.id !== job.id);
    jobs.push({ id: job.id, chatSessionId, owner: owner(), api: API_URL });
    localStorage.setItem(PENDING_JOBS_KEY, JSON.stringify(jobs));
  } catch (_) { /* Server job status remains authoritative without local storage. */ }
}

function forgetJob(jobId) {
  try {
    localStorage.setItem(PENDING_JOBS_KEY, JSON.stringify(getPendingAIJobs().filter(job => job.id !== jobId)));
  } catch (_) { /* Storage may be unavailable. */ }
}

function aborted() { return new DOMException('Stopped waiting for this job', 'AbortError'); }

function waitForPoll(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(aborted()); return; }
    const onAbort = () => { clearTimeout(timer); reject(aborted()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function pollAIJob(jobId, options = {}) {
  const startedAt = Date.now();
  const initialOwner = owner();
  const initialToken = getAuthToken();
  let job = { id: jobId, status: 'queued' };
  let connectionFailures = 0;

  while (ACTIVE_JOB_STATUSES.has(job.status)) {
    if (options.signal?.aborted || owner() !== initialOwner || !getAuthToken() && initialToken) throw aborted();
    // An explicit caller deadline pauses observation; it never fails the job.
    // By default, follow the persisted server state through queueing and retries.
    if (options.timeoutMs && Date.now() - startedAt >= options.timeoutMs) {
      const error = new Error('This AI job is still pending. Reopen the conversation to resume.');
      error.code = 'AI_JOB_PENDING';
      error.jobId = jobId;
      throw error;
    }
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const requestTimer = setTimeout(() => controller.abort(), 15000);
    let response;
    let nextJob;
    try {
      response = await fetch(`${API_URL}/ai/jobs/${jobId}`, { headers: authHeaders(), signal: controller.signal });
      if (response.ok) nextJob = await response.json();
    } catch (error) {
      if (options.signal?.aborted) throw aborted();
      response = undefined;
      connectionFailures += 1;
    } finally {
      clearTimeout(requestTimer);
      options.signal?.removeEventListener('abort', onAbort);
    }
    if (!response || response.status === 429 || response.status >= 500) {
      connectionFailures += response ? 1 : 0;
      options.onProgress?.({ ...job, connection_state: 'reconnecting' });
      await waitForPoll(Math.min(10000, 1000 * 2 ** Math.min(connectionFailures, 3)), options.signal);
      continue;
    }
    if (!response.ok) {
      if (response.status === 404) forgetJob(jobId);
      throw new Error(`Could not check AI job (${response.status}). Your pending job has not been resubmitted.`);
    }
    job = nextJob;
    connectionFailures = 0;
    options.onProgress?.(job);
    if (ACTIVE_JOB_STATUSES.has(job.status)) {
      await waitForPoll(options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS, options.signal);
    }
  }

  forgetJob(jobId);
  if (job.status !== 'completed') {
    const error = new Error(job.error || (job.status === 'cancelled' ? 'AI job cancelled' : 'AI job failed'));
    error.jobId = jobId;
    throw error;
  }
  const result = job.result || {};
  if (result.error || result.attachment_error || result.success === false || ['error', 'multimodal_error', 'provider_quota_fallback'].includes(result.query_type)) {
    throw new Error(result.error || result.attachment_error || 'AI generation failed');
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('brainwave:token-usage-refresh'));
  return result;
}

export async function createAIJob(payload) {
  const response = await fetch(`${API_URL}/ai/jobs`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const usageLimit = await getUsageLimitFromResponse(response);
    if (usageLimit) throw createUsageLimitError(usageLimit);
    const errorText = await response.text();
    throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
  }
  const job = await response.json();
  rememberJob(job, payload.chat_session_id || null);
  return job;
}

export async function queueChatCompletion(payload, options = {}) {
  const job = await createAIJob({
    job_type: 'chat_completion',
    use_semantic_cache: false,
    cache_scope: 'user',
    ...payload,
  });
  return pollAIJob(job.id, options);
}

export async function queueLegacyAIEndpoint(path, options = {}) {
  const response = await fetch(`${API_URL}/ai/route-jobs`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      method: options.method || 'POST',
      path,
      body_type: options.bodyType || 'json',
      json_body: options.jsonBody || null,
      form_body: options.formBody || null,
    }),
  });
  if (!response.ok) {
    const usageLimit = await getUsageLimitFromResponse(response);
    if (usageLimit) throw createUsageLimitError(usageLimit);
    const errorText = await response.text();
    throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
  }
  const job = await response.json();
  rememberJob(job, options.formBody?.chat_id || options.jsonBody?.chat_id || null);
  const result = await pollAIJob(job.id, options);
  return result.route_result || result;
}

export async function queuedAIJsonFetch(path, fetchOptions = {}, queueOptions = {}) {
  if (!USE_AI_JOB_QUEUE) {
    return fetch(path.startsWith('http') ? path : `${API_URL}${path}`, fetchOptions);
  }

  const apiPath = path.startsWith('http')
    ? new URL(path).pathname
    : (path.startsWith('/api/') ? path : `${API_URL}${path}`.replace(/^https?:\/\/[^/]+/, ''));
  const body = fetchOptions.body ? JSON.parse(fetchOptions.body) : {};
  const method = fetchOptions.method || (fetchOptions.body ? 'POST' : 'GET');
  const result = await queueLegacyAIEndpoint(apiPath, {
    method,
    bodyType: 'json',
    jsonBody: body,
    signal: fetchOptions.signal,
    ...queueOptions,
  });
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function queuedAIFormFetch(path, formBody = {}, queueOptions = {}) {
  if (!USE_AI_JOB_QUEUE) {
    const formData = new FormData();
    Object.entries(formBody).forEach(([key, value]) => {
      if (value !== undefined && value !== null) formData.append(key, value);
    });
    return fetch(path.startsWith('http') ? path : `${API_URL}${path}`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
  }

  const apiPath = path.startsWith('http')
    ? new URL(path).pathname
    : (path.startsWith('/api/') ? path : `${API_URL}${path}`.replace(/^https?:\/\/[^/]+/, ''));
  const result = await queueLegacyAIEndpoint(apiPath, {
    method: 'POST',
    bodyType: 'form',
    formBody,
    ...queueOptions,
  });
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function queueLegacyAIFileEndpoint(path, formBody = {}, files = [], options = {}) {
  const formData = new FormData();
  formData.append('path', path);
  formData.append('method', 'POST');
  formData.append('form_body', JSON.stringify(formBody || {}));
  files.forEach((entry) => {
    const file = entry?.file || entry;
    const fieldName = entry?.fieldName || 'files';
    if (entry?.filename) {
      formData.append('files', file, entry.filename);
    } else {
      formData.append('files', file);
    }
    formData.append('file_field_names', fieldName);
  });

  const response = await fetch(`${API_URL}/ai/file-route-jobs`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  if (!response.ok) {
    const usageLimit = await getUsageLimitFromResponse(response);
    if (usageLimit) throw createUsageLimitError(usageLimit);
    const errorText = await response.text();
    throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
  }
  const job = await response.json();
  rememberJob(job, formBody.chat_id || null);
  const result = await pollAIJob(job.id, options);
  return result.route_result || result;
}
