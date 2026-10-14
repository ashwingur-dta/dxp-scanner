import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { REGISTRY, RUBRIC_VERSION, type Scorecard } from '@dxp/checks';
import { SAMPLING_POLICY_VERSION } from '@dxp/scanner/versions';
import { loadRegistry } from './registry.js';
import {
  BAND_POINTS,
  buildLeaderboard,
  type ComparabilityPolicy,
  type Leaderboard,
} from './leaderboard.js';
import { targetsDir } from './config.js';

const region = process.env.AWS_REGION ?? 'us-east-1';
const s3 = new S3Client({ region });

const EVIDENCE_BUCKET = process.env.EVIDENCE_BUCKET ?? '';
const REPORT_BUCKET = process.env.REPORT_BUCKET ?? '';
const LEADERBOARD_KEY = process.env.LEADERBOARD_KEY ?? 'reports/leaderboard.json';
const PAGE_BUDGET = Number(process.env.LEADERBOARD_PAGE_BUDGET ?? 60);
const MIN_PAGES_ASSESSED = Number(process.env.LEADERBOARD_MIN_PAGES ?? 25);

export function comparabilityPolicy(): ComparabilityPolicy {
  return {
    mode: 'full',
    rubric_version: RUBRIC_VERSION,
    sampling_policy_version: SAMPLING_POLICY_VERSION,
    page_budget: PAGE_BUDGET,
    min_pages_assessed: MIN_PAGES_ASSESSED,
  };
}

export function rubricThresholds(): { policy: number; tool: number } {
  const thresholds = REGISTRY.map((c) => c.threshold).filter(
    (t): t is NonNullable<typeof t> => !!t,
  );
  return {
    policy: thresholds.filter((t) => t.source === 'policy').length,
    tool: thresholds.filter((t) => t.source === 'tool').length,
  };
}

export function latestKeyPerSite(
  objects: { Key?: string; LastModified?: Date }[],
): Map<string, string> {
  const newest = new Map<string, { key: string; at: number }>();

  for (const object of objects) {
    const key = object.Key;
    if (!key || !key.endsWith('.json')) continue;

    const parts = key.split('/');
    if (parts.length !== 3 || parts[0] !== 'scorecards') continue;
    const siteId = parts[1];
    if (!siteId) continue;

    const at = object.LastModified?.getTime() ?? 0;
    const previous = newest.get(siteId);
    if (!previous || at > previous.at) newest.set(siteId, { key, at });
  }

  return new Map(Array.from(newest, ([siteId, v]) => [siteId, v.key]));
}

async function listScorecardKeys(bucket: string): Promise<Map<string, string>> {
  const objects: { Key?: string; LastModified?: Date }[] = [];
  let token: string | undefined;

  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'scorecards/',
        ContinuationToken: token,
      }),
    );
    objects.push(...(page.Contents ?? []));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  return latestKeyPerSite(objects);
}

async function readScorecard(bucket: string, key: string): Promise<Scorecard | null> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await res.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as Scorecard;
  } catch (err) {
    console.error('aggregate could not read a scorecard', {
      key,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function aggregate(): Promise<Leaderboard> {
  if (!EVIDENCE_BUCKET) throw new Error('EVIDENCE_BUCKET is not configured');
  if (!REPORT_BUCKET) throw new Error('REPORT_BUCKET is not configured');

  const registry = loadRegistry(targetsDir());
  const keys = await listScorecardKeys(EVIDENCE_BUCKET);

  const scorecards = new Map<string, Scorecard | null>();
  for (const target of registry.active) {
    const key = keys.get(target.site_id);
    scorecards.set(target.site_id, key ? await readScorecard(EVIDENCE_BUCKET, key) : null);
  }

  const leaderboard = buildLeaderboard({
    registry,
    scorecards,
    policy: comparabilityPolicy(),
    rubricThresholds: rubricThresholds(),
    bandPoints: BAND_POINTS,
  });

  await s3.send(
    new PutObjectCommand({
      Bucket: REPORT_BUCKET,
      Key: LEADERBOARD_KEY,
      Body: JSON.stringify(leaderboard),
      ContentType: 'application/json; charset=utf-8',
      CacheControl: 'public, max-age=300',
    }),
  );

  console.log('aggregate wrote leaderboard', {
    key: LEADERBOARD_KEY,
    ...leaderboard.counts,
  });

  return leaderboard;
}

export async function handler(): Promise<Leaderboard['counts']> {
  const leaderboard = await aggregate();
  return leaderboard.counts;
}
