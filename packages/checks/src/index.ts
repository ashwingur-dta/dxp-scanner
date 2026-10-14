import type { EvidenceBundle, Finding, ScanMode } from '@dxp/schema';
import { CRITERIA, STANDARDS, type Criterion, type StandardId } from './criteria.js';
import { EVIDENCE_KEYS, type CheckDef } from './types.js';
import { accessibilityChecks } from './rules/accessibility.js';
import { assistedPathwayChecks } from './rules/assisted-pathways.js';
import { availabilityChecks } from './rules/availability.js';
import { feedbackChecks } from './rules/feedback.js';
import { flexibilityChecks } from './rules/flexibility.js';
import { notAssessableChecks } from './rules/not-assessable.js';
import { plainLanguageChecks } from './rules/plain-language.js';
import { reuseChecks } from './rules/reuse.js';
import { trustChecks } from './rules/trust.js';

export * from './types.js';
export * from './criteria.js';
export { readability, countSyllables } from './util.js';

export const RUBRIC_VERSION = '0.1.0';

export const REGISTRY: CheckDef[] = [
  ...feedbackChecks,
  ...availabilityChecks,
  ...accessibilityChecks,
  ...plainLanguageChecks,
  ...flexibilityChecks,
  ...assistedPathwayChecks,
  ...trustChecks,
  ...reuseChecks,
  ...notAssessableChecks,
];

function validateRegistry(checks: CheckDef[]): void {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const c of checks) {
    if (seen.has(c.id)) problems.push(`duplicate check id: ${c.id}`);
    seen.add(c.id);

    if (!CRITERIA.some((x) => x.standard === c.standard && x.number === c.criterion)) {
      problems.push(`${c.id} references unknown criterion ${c.standard}-C${c.criterion}`);
    }
    for (const r of c.requires) {
      if (!EVIDENCE_KEYS.includes(r)) problems.push(`${c.id} requires unknown evidence key "${r}"`);
    }
    if (c.modes.length === 0) problems.push(`${c.id} applies to no scan mode`);
    if (c.method === 'mechanical' && c.weight === 0) {
      problems.push(`${c.id} is mechanical but weighted 0, so it can never affect a score`);
    }
    if (c.method === 'attestation' && c.weight !== 0) {
      problems.push(`${c.id} is an attestation item and must be weighted 0`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid check registry:\n  - ${problems.join('\n  - ')}`);
  }
}

validateRegistry(REGISTRY);

export function runChecks(bundle: EvidenceBundle, mode: ScanMode = bundle.mode): Finding[] {
  const applicable = REGISTRY.filter((c) => c.modes.includes(mode));
  const findings: Finding[] = [];

  for (const def of applicable) {
    try {
      findings.push({ check_id: def.id, ...def.run(bundle, def) });
    } catch (err) {

      findings.push({
        check_id: def.id,
        state: 'not_collected',
        value: null,
        coverage: 0,
        detail: `Check failed to run: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  return findings;
}

export interface ScoredFinding extends Finding {
  def: CheckDef;
}

export interface CriterionScore {
  standard: StandardId;
  number: number;
  name: string;
  url: string;
  scorability: Criterion['scorability'];
  note: string;

  assessed: number;

  attempted: number;
  passed: number;
  failed: number;
  needsReview: number;
  notCollected: number;
  notAssessable: number;

  score: number | null;
  findings: ScoredFinding[];
}

export interface StandardScore {
  id: StandardId;
  name: string;
  url: string;
  existing_services_from: string | null;
  criteria: CriterionScore[];
  score: number | null;
  assessed: number;
  attempted: number;
}

export interface Scorecard {
  bundle_id: string;
  site_id: string;
  entry_url: string;
  mode: ScanMode;
  rubric_version: string;
  generated_at: string;
  vantage_region: string;
  standards: StandardScore[];
  overall: {

    score: number | null;
    assessed: number;
    attempted: number;

    notAssessable: number;
    needsReview: number;

    evidenceCoverage: number;
  };

  thresholdProvenance: { policy: number; tool: number };
}

export function rollup(bundle: EvidenceBundle, findings: Finding[]): Scorecard {
  const byId = new Map(REGISTRY.map((c) => [c.id, c]));
  const scored: ScoredFinding[] = findings.flatMap((f) => {
    const def = byId.get(f.check_id);
    return def ? [{ ...f, def }] : [];
  });

  const criteriaScores: CriterionScore[] = [];

  for (const c of CRITERIA) {
    const mine = scored.filter((f) => f.def.standard === c.standard && f.def.criterion === c.number);
    if (mine.length === 0) continue;

    const passed = mine.filter((f) => f.state === 'pass');
    const failed = mine.filter((f) => f.state === 'fail');
    const assessed = passed.length + failed.length;

    const passWeight = passed.reduce((s, f) => s + f.def.weight, 0);
    const assessedWeight = passWeight + failed.reduce((s, f) => s + f.def.weight, 0);

    criteriaScores.push({
      standard: c.standard,
      number: c.number,
      name: c.name,
      url: c.url,
      scorability: c.scorability,
      note: c.note,
      assessed,
      attempted: mine.filter((f) => f.state !== 'not_assessable').length,
      passed: passed.length,
      failed: failed.length,
      needsReview: mine.filter((f) => f.state === 'needs_review').length,
      notCollected: mine.filter((f) => f.state === 'not_collected').length,
      notAssessable: mine.filter((f) => f.state === 'not_assessable').length,
      score: assessedWeight > 0 ? passWeight / assessedWeight : null,
      findings: mine,
    });
  }

  const standards: StandardScore[] = (Object.keys(STANDARDS) as StandardId[]).map((id) => {
    const std = STANDARDS[id];
    const crits = criteriaScores.filter((c) => c.standard === id);
    const all = crits.flatMap((c) => c.findings);
    const passed = all.filter((f) => f.state === 'pass');
    const failed = all.filter((f) => f.state === 'fail');
    const pw = passed.reduce((s, f) => s + f.def.weight, 0);
    const aw = pw + failed.reduce((s, f) => s + f.def.weight, 0);

    return {
      id,
      name: std.name,
      url: std.url,
      existing_services_from: std.existing_services_from,
      criteria: crits,
      score: aw > 0 ? pw / aw : null,
      assessed: passed.length + failed.length,
      attempted: all.filter((f) => f.state !== 'not_assessable').length,
    };
  });

  const all = criteriaScores.flatMap((c) => c.findings);
  const passed = all.filter((f) => f.state === 'pass');
  const failed = all.filter((f) => f.state === 'fail');
  const pw = passed.reduce((s, f) => s + f.def.weight, 0);
  const aw = pw + failed.reduce((s, f) => s + f.def.weight, 0);

  const usedThresholds = all
    .map((f) => f.def.threshold)
    .filter((t): t is NonNullable<typeof t> => !!t);

  const attemptedPages = bundle.pages.length + bundle.skipped.length;

  return {
    bundle_id: bundle.bundle_id,
    site_id: bundle.site.site_id,
    entry_url: bundle.site.entry_url,
    mode: bundle.mode,
    rubric_version: RUBRIC_VERSION,
    generated_at: new Date().toISOString(),
    vantage_region: bundle.version.vantage_region,
    standards,
    overall: {
      score: aw > 0 ? pw / aw : null,
      assessed: passed.length + failed.length,
      attempted: all.filter((f) => f.state !== 'not_assessable').length,
      notAssessable: all.filter((f) => f.state === 'not_assessable').length,
      needsReview: all.filter((f) => f.state === 'needs_review').length,
      evidenceCoverage:
        attemptedPages > 0 ? bundle.pages.filter((p) => p.integrity.ok).length / attemptedPages : 0,
    },
    thresholdProvenance: {
      policy: usedThresholds.filter((t) => t.source === 'policy').length,
      tool: usedThresholds.filter((t) => t.source === 'tool').length,
    },
  };
}

export function exportRubric() {
  return {
    rubric_version: RUBRIC_VERSION,
    generated_at: new Date().toISOString(),
    checks: REGISTRY.map((c) => ({
      id: c.id,
      standard: c.standard,
      criterion: c.criterion,
      criterion_name: CRITERIA.find((x) => x.standard === c.standard && x.number === c.criterion)?.name,
      sub_requirement: c.sub_requirement,
      policy_quote: c.policy_quote,
      policy_url: c.policy_url,
      method: c.method,
      weight: c.weight,
      modes: c.modes,
      threshold: c.threshold ?? null,
      attestation_prompt: c.attestation_prompt ?? null,
    })),
  };
}
