import { createHash } from 'node:crypto';
import { enqueue, putJob, type Job } from '@dxp/api';
import { SAMPLING_POLICY_VERSION } from '@dxp/scanner/versions';
import { loadRegistry, type Target } from './registry.js';
import { targetsDir } from './config.js';

const PAGE_BUDGET = Number(process.env.LEADERBOARD_PAGE_BUDGET ?? 60);
const JOB_TTL_SECONDS = Number(process.env.JOB_TTL_SECONDS ?? 60 * 60 * 24 * 14);
const SPACING_MS = Number(process.env.DISPATCH_SPACING_MS ?? 0);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface DispatchResult {
  run_id: string;
  sampling_policy_version: string;
  page_budget: number;
  enqueued: { site_id: string; job_id: string; entry_url: string }[];
  skipped: { site_id: string; reason: string }[];
}

export function runId(at: Date): string {
  return at.toISOString().slice(0, 13).replace(/[-T:]/g, '');
}

export function jobIdFor(run: string, siteId: string): string {
  return createHash('sha256').update(`${run}#${siteId}`).digest('hex').slice(0, 32);
}

async function enqueueTarget(run: string, target: Target): Promise<string> {
  const jobId = jobIdFor(run, target.site_id);
  const now = new Date().toISOString();

  const job: Job = {
    job_id: jobId,
    url: target.entry_url,
    site_id: target.site_id,
    status: 'queued',
    phase: 'queued',
    pages_done: 0,
    pages_total: PAGE_BUDGET,
    created_at: now,
    updated_at: now,
    expires_at: Math.floor(Date.now() / 1000) + JOB_TTL_SECONDS,
  };

  await putJob(job);
  await enqueue(jobId, target.entry_url, {
    siteId: target.site_id,
    mode: 'full',
    maxPages: PAGE_BUDGET,
  });

  return jobId;
}

export async function dispatch(): Promise<DispatchResult> {
  const registry = loadRegistry(targetsDir());
  const run = runId(new Date());

  const result: DispatchResult = {
    run_id: run,
    sampling_policy_version: SAMPLING_POLICY_VERSION,
    page_budget: PAGE_BUDGET,
    enqueued: [],
    skipped: registry.excluded.map((t) => ({
      site_id: t.site_id,
      reason: t.reason ?? 'Excluded in the target registry without a stated reason.',
    })),
  };

  for (const [index, target] of registry.active.entries()) {
    if (index > 0 && SPACING_MS > 0) await sleep(SPACING_MS);
    try {
      const jobId = await enqueueTarget(run, target);
      result.enqueued.push({ site_id: target.site_id, job_id: jobId, entry_url: target.entry_url });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('batch dispatch failed to enqueue', { site_id: target.site_id, message });
      result.skipped.push({
        site_id: target.site_id,
        reason: `Could not be enqueued for this run (${message}).`,
      });
    }
  }

  console.log('batch dispatch', {
    run_id: run,
    enqueued: result.enqueued.length,
    skipped: result.skipped.length,
    page_budget: PAGE_BUDGET,
  });

  return result;
}

export async function handler(): Promise<DispatchResult> {
  return dispatch();
}
