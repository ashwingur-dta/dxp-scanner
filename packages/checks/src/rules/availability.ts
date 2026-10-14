import type { CheckDef } from '../types.js';
import { fail, notCollected, pass, scoreRatio } from '../types.js';
import { coverageOf, entryPage, scoreablePages } from '../util.js';

const URL =
  'https://www.digital.gov.au/policy/digital-experience/digital-performance-standard/dps-criterion-2-measure-availability-your-digital-service';

export const availabilityChecks: CheckDef[] = [
  {
    id: 'DPS-C2-01',
    standard: 'DPS',
    criterion: 2,
    sub_requirement: 'Links on the service are valid',
    policy_quote:
      'At a minimum you should monitor uptime, however other KPIs might include error rate, load time, fully loaded time or percentage of valid links.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['site.link_check'],
    threshold: {
      value: 0.98,
      source: 'tool',
      rationale:
        'The policy names "percentage of valid links" as a KPI but sets no target. 0.98 allows for transient failures and rate-limited third parties while still catching real link rot.',
    },
    weight: 2,
    modes: ['quick', 'full'],
    run: (bundle, def) => {
      const lc = bundle.site.link_check;
      if (lc.checked === 0) return notCollected('No links were sampled for validity.');

      const ratio = lc.ok / lc.checked;
      return scoreRatio(
        ratio,
        def,
        `${lc.ok} of ${lc.checked} sampled links resolved successfully (${lc.broken.length} broken).`,
        lc.broken.map((b) => `${b.url} (HTTP ${b.status})`),
        coverageOf(bundle),
      );
    },
  },

  {
    id: 'DPS-C2-02',
    standard: 'DPS',
    criterion: 2,
    sub_requirement: 'Pages return successful responses rather than errors',
    policy_quote:
      'other KPIs might include error rate, load time, fully loaded time or percentage of valid links',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.headers'],
    threshold: {
      value: 0.98,
      source: 'tool',
      rationale:
        'The policy names error rate as a KPI but sets no target. Pages discovered from the site\'s own navigation and sitemap should almost all resolve.',
    },
    weight: 2,
    modes: ['quick', 'full'],
    run: (bundle, def) => {
      const all = bundle.pages;
      if (all.length === 0) return notCollected('No pages were retrieved.');

      const errored = all.filter((p) => p.status >= 400);
      const ratio = (all.length - errored.length) / all.length;

      return scoreRatio(
        ratio,
        def,
        `${errored.length} of ${all.length} retrieved pages returned an HTTP error.`,
        errored.map((p) => `${p.final_url} (HTTP ${p.status})`),
        coverageOf(bundle),
      );
    },
  },

  {
    id: 'DPS-C2-03',
    standard: 'DPS',
    criterion: 2,
    sub_requirement: 'The service is reachable over HTTPS',
    policy_quote:
      'Service availability is how often your service is available and accessible.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['site.https_redirect', 'pages.headers'],
    weight: 2,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const entry = entryPage(bundle);
      if (!entry) return notCollected('The entry point could not be retrieved.');

      if (entry.status >= 400) {
        return fail(
          `The entry point returned HTTP ${entry.status} at the time of scanning. This is a point-in-time sample, not an uptime measurement.`,
          entry.status,
          [entry.final_url],
        );
      }
      if (!entry.final_url.startsWith('https://')) {
        return fail('The service did not serve over HTTPS.', entry.status, [entry.final_url]);
      }
      return pass(
        `Reachable over HTTPS (HTTP ${entry.status}) at the time of scanning. Point-in-time sample, not an uptime measurement.`,
        entry.status,
      );
    },
  },

  {
    id: 'DPS-C2-04',
    standard: 'DPS',
    criterion: 2,
    sub_requirement: 'Core Web Vitals meet the "good" threshold for real users',
    policy_quote:
      'Measure from the end-user\'s perspective ... To catch any issues that internal checks might miss, consider other tools that simulate real-world experiences from a user perspective.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['site.crux'],
    threshold: {
      value: 1,
      source: 'tool',
      rationale:
        'The policy names load time and fully loaded time but sets no target. We use the Chrome UX Report "good" thresholds (LCP 2.5s, INP 200ms, CLS 0.1) as an external, published, widely accepted benchmark. These are field data from real Australian users, so they are unaffected by where this scanner runs.',
    },
    weight: 3,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const c = bundle.site.crux;
      if (!c.available) {

        return notCollected(
          `No Chrome UX Report field data for this origin${c.reason ? ` (${c.reason})` : ''}. Lab measurement is deliberately not substituted, because measuring an Australian service from outside Australia would misattribute network latency to the service.`,
        );
      }

      const problems: string[] = [];
      if (c.lcp_p75_ms !== undefined && c.lcp_p75_ms > 2500)
        problems.push(`LCP ${(c.lcp_p75_ms / 1000).toFixed(2)}s (good is under 2.5s)`);
      if (c.inp_p75_ms !== undefined && c.inp_p75_ms > 200)
        problems.push(`INP ${c.inp_p75_ms}ms (good is under 200ms)`);
      if (c.cls_p75 !== undefined && c.cls_p75 > 0.1)
        problems.push(`CLS ${c.cls_p75.toFixed(3)} (good is under 0.1)`);

      const summary = [
        c.lcp_p75_ms !== undefined ? `LCP ${(c.lcp_p75_ms / 1000).toFixed(2)}s` : null,
        c.inp_p75_ms !== undefined ? `INP ${c.inp_p75_ms}ms` : null,
        c.cls_p75 !== undefined ? `CLS ${c.cls_p75.toFixed(3)}` : null,
      ]
        .filter(Boolean)
        .join(', ');

      return problems.length === 0
        ? pass(`Field data at the 75th percentile is within "good" thresholds: ${summary}.`, summary)
        : fail(`Field data exceeds "good" thresholds: ${problems.join('; ')}.`, summary);
    },
  },

  {
    id: 'DPS-C2-05',
    standard: 'DPS',
    criterion: 2,
    sub_requirement: 'Pages are light enough for mobile use on unreliable connections',
    policy_quote:
      'this could mean a digital service that\'s always accessible, has functional links and works on mobile devices in areas with unreliable internet speeds.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.headers'],
    threshold: {
      value: 2_000_000,
      source: 'tool',
      rationale:
        'The policy requires working on "unreliable internet speeds" but sets no page-weight limit. 2 MB median transfer is our threshold: roughly 10 seconds on a slow 3G connection.',
    },
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle, def) => {
      const pages = scoreablePages(bundle).filter((p) => p.bytes > 0);
      if (pages.length === 0) return notCollected('No transfer sizes were recorded.');

      const sizes = pages.map((p) => p.bytes).sort((a, b) => a - b);
      const median = sizes[Math.floor(sizes.length / 2)] ?? 0;
      const limit = def.threshold?.value ?? 2_000_000;
      const mb = (n: number) => `${(n / 1_000_000).toFixed(2)} MB`;

      return median <= limit
        ? pass(`Median page transfer is ${mb(median)}.`, median, coverageOf(bundle))
        : fail(
            `Median page transfer is ${mb(median)}, above our ${mb(limit)} guide for unreliable mobile connections.`,
            median,
            pages
              .filter((p) => p.bytes > limit)
              .map((p) => `${p.final_url} (${mb(p.bytes)})`),
            coverageOf(bundle),
          );
    },
  },
];
