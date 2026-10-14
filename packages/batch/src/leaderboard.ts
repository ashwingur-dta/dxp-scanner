import type { Scorecard } from '@dxp/checks';
import type { Target } from './registry.js';

export const BAND_POINTS = 4;

export const LEADERBOARD_SCHEMA = 'dxp.leaderboard/1';

export interface ComparabilityPolicy {
  mode: 'full';
  rubric_version: string;
  sampling_policy_version: string;
  page_budget: number;
  min_pages_assessed: number;
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

export type DroppedStage = 'registry' | 'no-assessment' | 'not-comparable';

export interface DroppedTarget {
  site_id: string;
  agency: string;
  service: string;
  entry_url: string;
  stage: DroppedStage;
  reason: string;
}

export interface Leaderboard {
  schema: typeof LEADERBOARD_SCHEMA;
  generated_at: string;
  band_points: number;
  comparability: ComparabilityPolicy;
  counts: {
    registry_total: number;
    registry_active: number;
    registry_excluded: number;
    ranked: number;
    dropped: number;
  };
  threshold_provenance: { policy: number; tool: number };
  entries: LeaderboardEntry[];
  dropped: DroppedTarget[];
}

export function comparabilityFailure(
  card: Partial<Scorecard> | null,
  policy: ComparabilityPolicy,
): string | null {
  if (!card) return 'No scorecard has been produced for this target yet.';

  if (typeof card.sampling_policy_version !== 'string' || typeof card.page_budget !== 'number') {
    return 'The stored scorecard predates sampling provenance, so there is no way to tell what sample produced it.';
  }

  if (card.mode !== policy.mode) {
    return `Scanned as a ${String(card.mode)} scan, and the leaderboard ranks only ${policy.mode} assessments. A short sample and a deep one are not comparable, because coverage checks such as feedback on every page mean different things at different sample sizes.`;
  }

  if (card.rubric_version !== policy.rubric_version) {
    return `Scored under rubric ${String(card.rubric_version)}, and the leaderboard is built on rubric ${policy.rubric_version}. Two rubrics can disagree about what passes, so mixing them would compare different questions.`;
  }

  if (card.sampling_policy_version !== policy.sampling_policy_version) {
    return `Collected under sampling policy ${card.sampling_policy_version}, and the leaderboard requires ${policy.sampling_policy_version}. Which pages get into the sample changes what the coverage figures mean.`;
  }

  if (card.page_budget !== policy.page_budget) {
    return `Collected with a page budget of ${card.page_budget}, and the leaderboard requires ${policy.page_budget}. Per-page coverage checks are sensitive to how many pages were read.`;
  }

  const overall = card.overall;
  if (!overall) return 'The stored scorecard has no overall result.';

  if (overall.pagesAssessed < policy.min_pages_assessed) {
    return `Only ${overall.pagesAssessed} of a budgeted ${policy.page_budget} pages survived collection integrity, below the floor of ${policy.min_pages_assessed}. Ranking that against sites where the full sample was read would compare a thin sample with a full one.`;
  }

  if (overall.score === null || overall.assessed === 0) {
    return 'Nothing was externally assessable on this site, so there is no score to rank.';
  }

  return null;
}

function reportUrl(card: Scorecard): string | null {
  if (!card.bundle_id || !card.site_id) return null;
  return `/reports/${card.site_id}/${card.bundle_id.slice(0, 12)}/index.html`;
}

function rankEntries(
  rows: { target: Target; card: Scorecard }[],
  bandPoints: number,
): LeaderboardEntry[] {
  const sorted = [...rows].sort((a, b) => {
    const byScore = (b.card.overall.score ?? 0) - (a.card.overall.score ?? 0);
    if (byScore !== 0) return byScore;
    return a.target.service.localeCompare(b.target.service);
  });

  const ranked: LeaderboardEntry[] = [];
  let rank = 0;
  let bandLeaderPercent = Number.POSITIVE_INFINITY;

  for (const { target, card } of sorted) {
    const scorePercent = Math.round((card.overall.score ?? 0) * 100);
    if (bandLeaderPercent - scorePercent > bandPoints) {
      rank += 1;
      bandLeaderPercent = scorePercent;
    }

    ranked.push({
      rank,
      band_size: 0,
      site_id: target.site_id,
      agency: target.agency,
      service: target.service,
      entry_url: target.entry_url,
      bundle_id: card.bundle_id,
      generated_at: card.generated_at,
      score_percent: scorePercent,
      assessed: card.overall.assessed,
      attempted: card.overall.attempted,
      needs_review: card.overall.needsReview,
      not_assessable: card.overall.notAssessable,
      pages_assessed: card.overall.pagesAssessed,
      pages_attempted: card.overall.pagesAttempted,
      evidence_coverage_percent: Math.round(card.overall.evidenceCoverage * 100),
      threshold_provenance: card.thresholdProvenance,
      report_url: reportUrl(card),
    });
  }

  const sizes = new Map<number, number>();
  for (const e of ranked) sizes.set(e.rank, (sizes.get(e.rank) ?? 0) + 1);
  for (const e of ranked) e.band_size = sizes.get(e.rank) ?? 1;

  return ranked;
}

export function buildLeaderboard(input: {
  registry: { targets: Target[]; active: Target[]; excluded: Target[] };
  scorecards: Map<string, Scorecard | null>;
  policy: ComparabilityPolicy;
  rubricThresholds: { policy: number; tool: number };
  generatedAt?: string;
  bandPoints?: number;
}): Leaderboard {
  const bandPoints = input.bandPoints ?? BAND_POINTS;
  const comparable: { target: Target; card: Scorecard }[] = [];
  const dropped: DroppedTarget[] = [];

  for (const target of input.registry.excluded) {
    dropped.push({
      site_id: target.site_id,
      agency: target.agency,
      service: target.service,
      entry_url: target.entry_url,
      stage: 'registry',
      reason: target.reason ?? 'Excluded in the target registry without a stated reason.',
    });
  }

  for (const target of input.registry.active) {
    const card = input.scorecards.get(target.site_id) ?? null;
    const failure = comparabilityFailure(card, input.policy);

    if (failure !== null || card === null) {
      dropped.push({
        site_id: target.site_id,
        agency: target.agency,
        service: target.service,
        entry_url: target.entry_url,
        stage: card === null ? 'no-assessment' : 'not-comparable',
        reason: failure ?? 'No scorecard has been produced for this target yet.',
      });
      continue;
    }

    comparable.push({ target, card });
  }

  const entries = rankEntries(comparable, bandPoints);

  return {
    schema: LEADERBOARD_SCHEMA,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    band_points: bandPoints,
    comparability: input.policy,
    counts: {
      registry_total: input.registry.targets.length,
      registry_active: input.registry.active.length,
      registry_excluded: input.registry.excluded.length,
      ranked: entries.length,
      dropped: dropped.length,
    },
    threshold_provenance: input.rubricThresholds,
    entries,
    dropped,
  };
}
