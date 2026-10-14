import { createHash, randomUUID } from 'node:crypto';
import { UrlRejected, guardUrl } from '@dxp/scanner';
import { RUBRIC_VERSION, exportRubric } from '@dxp/checks';
import { consumeRateToken, enqueue, getJob, putJob, type Job } from './store.js';

interface LambdaEvent {
  rawPath?: string;
  requestContext?: { http?: { method?: string; path?: string; sourceIp?: string } };
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  queryStringParameters?: Record<string, string | undefined>;
}

interface LambdaResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const RATE_LIMIT = Number(process.env.RATE_LIMIT ?? 10);
const RATE_WINDOW_SECONDS = Number(process.env.RATE_WINDOW_SECONDS ?? 600);
const DEDUPE_SECONDS = Number(process.env.DEDUPE_SECONDS ?? 900);
const JOB_TTL_SECONDS = Number(process.env.JOB_TTL_SECONDS ?? 60 * 60 * 24 * 14);

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

function json(statusCode: number, body: unknown, extraHeaders: Record<string, string> = {}): LambdaResult {
  return { statusCode, headers: { ...JSON_HEADERS, ...extraHeaders }, body: JSON.stringify(body) };
}

function dedupeKey(url: string): string {
  const bucket = Math.floor(Date.now() / 1000 / DEDUPE_SECONDS);
  return createHash('sha256').update(`${url}#${bucket}`).digest('hex').slice(0, 32);
}

function clientIp(event: LambdaEvent): string {
  const fwd = event.headers?.['x-forwarded-for'] ?? event.headers?.['X-Forwarded-For'];
  if (fwd) return fwd.split(',')[0]?.trim() ?? 'unknown';
  return event.requestContext?.http?.sourceIp ?? 'unknown';
}

function publicJob(job: Job) {
  return {
    job_id: job.job_id,
    url: job.url,
    site_id: job.site_id ?? null,
    status: job.status,
    phase: job.phase ?? null,
    pages_done: job.pages_done ?? 0,
    pages_total: job.pages_total ?? 0,
    created_at: job.created_at,
    updated_at: job.updated_at,
    bundle_id: job.bundle_id ?? null,
    report_url: job.report_key ? `/${job.report_key}` : null,
    pdf_url: job.pdf_key ? `/${job.pdf_key}` : null,
    score: job.score ?? null,
    assessed: job.assessed ?? null,
    needs_review: job.needs_review ?? null,
    not_assessable: job.not_assessable ?? null,
    error: job.error ?? null,
  };
}

async function handleCreate(event: LambdaEvent): Promise<LambdaResult> {
  let payload: { url?: string };
  try {
    const raw = event.isBase64Encoded && event.body
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : (event.body ?? '{}');
    payload = JSON.parse(raw) as { url?: string };
  } catch {
    return json(400, { error: 'invalid_json', message: 'Request body must be JSON.' });
  }

  if (!payload.url || typeof payload.url !== 'string') {
    return json(400, { error: 'missing_url', message: 'Provide a url to assess.' });
  }
  if (payload.url.length > 2000) {
    return json(400, { error: 'url_too_long', message: 'That URL is too long.' });
  }

  const ip = clientIp(event);
  const allowed = await consumeRateToken(ip, RATE_LIMIT, RATE_WINDOW_SECONDS);
  if (!allowed) {
    return json(
      429,
      {
        error: 'rate_limited',
        message: `Too many scans from this address. The limit is ${RATE_LIMIT} every ${Math.round(RATE_WINDOW_SECONDS / 60)} minutes, so that this tool cannot be used to generate traffic against government services.`,
      },
      { 'retry-after': String(RATE_WINDOW_SECONDS) },
    );
  }

  let url: URL;
  try {
    url = await guardUrl(payload.url, { requireGovAu: true, resolveDns: true });
  } catch (err) {
    if (err instanceof UrlRejected) {
      return json(400, { error: err.reason, message: err.message });
    }
    return json(400, { error: 'invalid_url', message: 'That URL could not be validated.' });
  }

  const jobId = dedupeKey(url.href);
  const existing = await getJob(jobId);
  if (existing) {
    return json(200, { ...publicJob(existing), deduplicated: true });
  }

  const now = new Date().toISOString();
  const job: Job = {
    job_id: jobId,
    url: url.href,
    status: 'queued',
    phase: 'queued',
    pages_done: 0,
    pages_total: 10,
    created_at: now,
    updated_at: now,
    expires_at: Math.floor(Date.now() / 1000) + JOB_TTL_SECONDS,
  };

  await putJob(job);
  await enqueue(jobId, url.href);

  return json(202, publicJob(job));
}

async function handleStatus(jobId: string): Promise<LambdaResult> {
  if (!/^[a-f0-9]{8,64}$/.test(jobId)) {
    return json(400, { error: 'bad_job_id', message: 'Not a valid job id.' });
  }
  const job = await getJob(jobId);
  if (!job) return json(404, { error: 'not_found', message: 'No such scan.' });
  return json(200, publicJob(job));
}

export async function handler(event: LambdaEvent): Promise<LambdaResult> {
  const method = event.requestContext?.http?.method ?? 'GET';
  const path = (event.rawPath ?? event.requestContext?.http?.path ?? '/').replace(/\/+$/, '') || '/';

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: { ...JSON_HEADERS, allow: 'GET, POST' }, body: '' };
  }

  try {
    if (method === 'POST' && (path === '/api/scan' || path === '/scan')) {
      return await handleCreate(event);
    }

    const statusMatch = path.match(/^\/(?:api\/)?scan\/([^/]+)$/);
    if (method === 'GET' && statusMatch?.[1]) {
      return await handleStatus(statusMatch[1]);
    }

    if (method === 'GET' && (path === '/api/rubric' || path === '/rubric')) {
      return json(200, exportRubric(), { 'cache-control': 'public, max-age=3600' });
    }

    if (method === 'GET' && (path === '/api/health' || path === '/health')) {
      return json(200, { ok: true, rubric_version: RUBRIC_VERSION });
    }

    return json(404, { error: 'not_found', message: `No route for ${method} ${path}` });
  } catch (err) {
    console.error('api error', err);
    return json(500, { error: 'internal', message: 'Something went wrong handling that request.' });
  }
}

export { patchJob, putJob, getJob, enqueue, consumeRateToken } from './store.js';
export type { Job, JobStatus } from './store.js';
