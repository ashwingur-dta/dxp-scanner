import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Scorecard } from '@dxp/checks';
import { buildRegistry, loadRegistry, parseTargetFile, type Target } from '../src/registry.js';
import {
  BAND_POINTS,
  buildLeaderboard,
  comparabilityFailure,
  type ComparabilityPolicy,
} from '../src/leaderboard.js';

const POLICY: ComparabilityPolicy = {
  mode: 'full',
  rubric_version: '0.1.0',
  sampling_policy_version: 'nav-sitemap-breadth-1',
  page_budget: 60,
  min_pages_assessed: 25,
};

function card(over: Partial<Scorecard> = {}, overall: Partial<Scorecard['overall']> = {}): Scorecard {
  return {
    bundle_id: 'b'.repeat(64),
    site_id: 'example',
    entry_url: 'https://www.example.gov.au/',
    mode: 'full',
    rubric_version: POLICY.rubric_version,
    sampling_policy_version: POLICY.sampling_policy_version,
    page_budget: POLICY.page_budget,
    generated_at: '2026-10-14T00:00:00.000Z',
    vantage_region: 'us-east-1',
    standards: [],
    overall: {
      score: 0.66,
      assessed: 39,
      attempted: 44,
      notAssessable: 6,
      needsReview: 5,
      evidenceCoverage: 0.95,
      pagesAssessed: 57,
      pagesAttempted: 60,
      ...overall,
    },
    thresholdProvenance: { policy: 4, tool: 21 },
    ...over,
  };
}

function target(siteId: string, status: Target['status'] = 'active', reason: string | null = null): Target {
  return {
    site_id: siteId,
    agency: `Agency ${siteId}`,
    service: `${siteId}.gov.au`,
    entry_url: `https://www.${siteId}.gov.au/`,
    status,
    reason,
    checked_at: '2026-10-14',
    collection: 'test',
    source_file: 'test.yaml',
  };
}

test('a comparable full assessment passes the gate', () => {
  assert.equal(comparabilityFailure(card(), POLICY), null);
});

test('a quick scan is refused, not quietly ranked', () => {
  const failure = comparabilityFailure(card({ mode: 'quick' }), POLICY);
  assert.match(String(failure), /quick scan/);
});

test('a different rubric version is refused', () => {
  const failure = comparabilityFailure(card({ rubric_version: '0.2.0' }), POLICY);
  assert.match(String(failure), /rubric 0\.2\.0/);
});

test('a different sampling policy version is refused', () => {
  const failure = comparabilityFailure(card({ sampling_policy_version: 'other-1' }), POLICY);
  assert.match(String(failure), /sampling policy other-1/);
});

test('a different page budget is refused', () => {
  const failure = comparabilityFailure(card({ page_budget: 10 }), POLICY);
  assert.match(String(failure), /page budget of 10/);
});

test('a scorecard with no sampling provenance is refused', () => {
  const legacy = card();
  delete (legacy as Partial<Scorecard>).sampling_policy_version;
  assert.match(String(comparabilityFailure(legacy, POLICY)), /predates sampling provenance/);
});

test('too few pages surviving integrity is refused', () => {
  const failure = comparabilityFailure(card({}, { pagesAssessed: 12 }), POLICY);
  assert.match(String(failure), /below the floor of 25/);
});

test('nothing assessable is refused rather than scored zero', () => {
  const failure = comparabilityFailure(card({}, { score: null, assessed: 0 }), POLICY);
  assert.match(String(failure), /no score to rank/);
});

test('scores within the band share a rank and know their band size', () => {
  const registry = {
    targets: [target('alpha'), target('bravo'), target('charlie'), target('delta')],
    active: [target('alpha'), target('bravo'), target('charlie'), target('delta')],
    excluded: [],
  };

  const scorecards = new Map<string, Scorecard | null>([
    ['alpha', card({ site_id: 'alpha' }, { score: 0.72 })],
    ['bravo', card({ site_id: 'bravo' }, { score: 0.7 })],
    ['charlie', card({ site_id: 'charlie' }, { score: 0.69 })],
    ['delta', card({ site_id: 'delta' }, { score: 0.5 })],
  ]);

  const board = buildLeaderboard({
    registry,
    scorecards,
    policy: POLICY,
    rubricThresholds: { policy: 4, tool: 21 },
  });

  assert.deepEqual(
    board.entries.map((e) => [e.site_id, e.rank, e.band_size]),
    [
      ['alpha', 1, 3],
      ['bravo', 1, 3],
      ['charlie', 1, 3],
      ['delta', 2, 1],
    ],
  );
  assert.equal(board.band_points, BAND_POINTS);
});

test('every rank carries the denominator that produced it', () => {
  const registry = { targets: [target('alpha')], active: [target('alpha')], excluded: [] };
  const board = buildLeaderboard({
    registry,
    scorecards: new Map([['alpha', card({ site_id: 'alpha' })]]),
    policy: POLICY,
    rubricThresholds: { policy: 4, tool: 21 },
  });

  const entry = board.entries[0];
  assert.ok(entry);
  assert.equal(entry.score_percent, 66);
  assert.equal(entry.assessed, 39);
  assert.equal(entry.not_assessable, 6);
  assert.equal(entry.pages_assessed, 57);
  assert.equal(entry.evidence_coverage_percent, 95);
  assert.equal(entry.report_url, `/reports/alpha/${'b'.repeat(12)}/index.html`);
});

test('registry exclusions and missing assessments are both recorded with a reason', () => {
  const active = target('alpha');
  const blocked = target('bravo', 'excluded', 'Returns HTTP 403 to the scanner.');
  const registry = { targets: [active, blocked], active: [active], excluded: [blocked] };

  const board = buildLeaderboard({
    registry,
    scorecards: new Map<string, Scorecard | null>([['alpha', null]]),
    policy: POLICY,
    rubricThresholds: { policy: 4, tool: 21 },
  });

  assert.equal(board.entries.length, 0);
  assert.equal(board.counts.registry_total, 2);
  assert.equal(board.counts.registry_excluded, 1);
  assert.deepEqual(
    board.dropped.map((d) => [d.site_id, d.stage]),
    [
      ['bravo', 'registry'],
      ['alpha', 'no-assessment'],
    ],
  );
  for (const d of board.dropped) assert.ok(d.reason.length > 0);
});

test('an excluded target without a reason is rejected at parse time', () => {
  assert.throws(
    () =>
      parseTargetFile(
        'bad.yaml',
        'targets:\n  - site_id: xray\n    agency: A\n    service: s\n    entry_url: https://www.xray.gov.au/\n    status: excluded\n',
      ),
    /needs a reason/,
  );
});

test('a non-gov.au or plaintext entry url is rejected at parse time', () => {
  assert.throws(
    () =>
      parseTargetFile(
        'bad.yaml',
        'targets:\n  - site_id: xray\n    agency: A\n    service: s\n    entry_url: http://example.com/\n    status: active\n',
      ),
    /must be https/,
  );
});

test('a duplicate site_id across files is rejected', () => {
  const body =
    'targets:\n  - site_id: xray\n    agency: A\n    service: s\n    entry_url: https://www.xray.gov.au/\n    status: active\n';
  assert.throws(
    () =>
      buildRegistry([
        { name: 'a.yaml', body },
        { name: 'b.yaml', body },
      ]),
    /appears in both/,
  );
});

test('the shipped registry parses and every exclusion states why', () => {
  const registry = loadRegistry(fileURLToPath(new URL('../../../targets', import.meta.url)));

  assert.ok(registry.active.length >= 10, 'expected a usable number of active targets');
  assert.ok(registry.excluded.length > 0, 'expected the unscannable sites to be recorded');
  for (const t of registry.excluded) assert.ok((t.reason ?? '').length > 20);
});
