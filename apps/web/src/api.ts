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

export interface LeaderboardEntry {
  rank: number;
  band_size: number;
  site_id: string;
  agency: string;
  service: string;
  entry_url: string;
  bundle_id: string;
  generated_at: string;
  score_percent: number;
  assessed: number;
  attempted: number;
  needs_review: number;
  not_assessable: number;
  pages_assessed: number;
  pages_attempted: number;
  evidence_coverage_percent: number;
  threshold_provenance: { policy: number; tool: number };
  report_url: string | null;
}

export interface LeaderboardDrop {
  site_id: string;
  agency: string;
  service: string;
  entry_url: string;
  stage: 'registry' | 'no-assessment' | 'not-comparable';
  reason: string;
}

export interface Leaderboard {
  schema: string;
  generated_at: string;
  band_points: number;
  comparability: {
    mode: string;
    rubric_version: string;
    sampling_policy_version: string;
    page_budget: number;
    min_pages_assessed: number;
  };
  counts: {
    registry_total: number;
    registry_active: number;
    registry_excluded: number;
    ranked: number;
    dropped: number;
  };
  threshold_provenance: { policy: number; tool: number };
  entries: LeaderboardEntry[];
  dropped: LeaderboardDrop[];
}

export async function getLeaderboard(): Promise<Leaderboard> {
  const res = await fetch('/reports/leaderboard.json', { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new RequestFailed(
      'no_leaderboard',
      'No leaderboard has been published yet. It is rebuilt after each batch run.',
      res.status,
    );
  }
  return parse<Leaderboard>(res);
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
