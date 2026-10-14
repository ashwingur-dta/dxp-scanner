export type JobStatus = 'queued' | 'running' | 'ready' | 'failed' | 'rejected';

export interface Job {
  job_id: string;
  url: string;
  site_id: string | null;
  status: JobStatus;
  phase: string | null;
  pages_done: number;
  pages_total: number;
  created_at: string;
  updated_at: string;
  bundle_id: string | null;
  report_url: string | null;
  pdf_url: string | null;
  score: number | null;
  assessed: number | null;
  needs_review: number | null;
  not_assessable: number | null;
  error: string | null;
  deduplicated?: boolean;
}

export interface ApiError {
  error: string;
  message: string;
}

export class RequestFailed extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'RequestFailed';
  }
}

async function parse<T>(res: Response): Promise<T> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new RequestFailed('bad_response', 'The server returned an unreadable response.', res.status);
  }

  if (!res.ok) {
    const e = body as ApiError;
    throw new RequestFailed(e?.error ?? 'unknown', e?.message ?? 'That request failed.', res.status);
  }
  return body as T;
}

export async function startScan(url: string): Promise<Job> {
  const res = await fetch('/api/scan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return parse<Job>(res);
}

export async function getScan(jobId: string): Promise<Job> {
  const res = await fetch(`/api/scan/${encodeURIComponent(jobId)}`);
  return parse<Job>(res);
}

export function looksLikeGovAu(input: string): boolean {
  const raw = input.trim();
  if (!raw) return false;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (u.username || u.password) return false;
    return u.hostname.toLowerCase().replace(/\.$/, '').endsWith('.gov.au');
  } catch {
    return false;
  }
}
