import type { EvidenceBundle, Finding, FindingState, ScanMode } from '@dxp/schema';
import type { StandardId } from './criteria.js';

export const EVIDENCE_KEYS = [
  'pages.dom',
  'pages.css',
  'pages.axe',
  'pages.html',
  'pages.main_text',
  'pages.headers',
  'pages.timing',
  'pages.viewports',
  'pages.third_party_hosts',
  'site.robots',
  'site.https_redirect',
  'site.security_headers',
  'site.cookie_flags',
  'site.security_txt',
  'site.crux',
  'site.link_check',
] as const;

export type EvidenceKey = (typeof EVIDENCE_KEYS)[number];

export interface Threshold {
  value: number;
  source: 'policy' | 'tool';
  rationale: string;
}

export type CheckMethod = 'mechanical' | 'llm' | 'attestation';

export type CheckResult = Omit<Finding, 'check_id'>;

export interface CheckDef {
  id: string;
  standard: StandardId;
  criterion: number;

  sub_requirement: string;

  policy_quote: string;
  policy_url: string;
  method: CheckMethod;
  requires: EvidenceKey[];
  threshold?: Threshold;
  weight: number;
  modes: ScanMode[];

  attestation_prompt?: string;
  run: (bundle: EvidenceBundle, def: CheckDef) => CheckResult;
}

export function pass(detail: string, value: number | string | null = null, coverage = 1): CheckResult {
  return { state: 'pass', value, coverage, detail };
}

export function fail(
  detail: string,
  value: number | string | null = null,
  failing_urls?: string[],
  coverage = 1,
): CheckResult {
  return { state: 'fail', value, coverage, detail, ...(failing_urls ? { failing_urls } : {}) };
}

export function needsReview(detail: string, value: number | string | null = null, coverage = 1): CheckResult {
  return { state: 'needs_review', value, coverage, detail };
}

export function notCollected(detail: string): CheckResult {
  return { state: 'not_collected', value: null, coverage: 0, detail };
}

export function notAssessable(detail: string): CheckResult {
  return { state: 'not_assessable', value: null, coverage: 0, detail };
}

export function scoreRatio(
  ratio: number,
  def: CheckDef,
  detail: string,
  failing_urls: string[],
  coverage: number,
): CheckResult {
  const threshold = def.threshold?.value ?? 1;
  const state: FindingState = ratio >= threshold ? 'pass' : 'fail';
  return {
    state,
    value: Number(ratio.toFixed(3)),
    coverage,
    detail,
    ...(state === 'fail' && failing_urls.length ? { failing_urls } : {}),
  };
}
