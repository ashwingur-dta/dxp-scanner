import type { CheckDef } from '../types.js';
import { fail, needsReview, notCollected, pass } from '../types.js';
import { coverageOf, entryPage, scoreablePages } from '../util.js';

const DAS_C3 =
  'https://www.digital.gov.au/policy/digital-experience/digital-access-standard/das-criterion-3';
const DSS_C6 =
  'https://www.digital.gov.au/policy/digital-experience/digital-service-standard/criteron-6';

const IDENTITY_PATTERNS: [RegExp, string][] = [
  [/my\.gov\.au|\bmyGov\b/i, 'myGov'],
  [/mygovid\.gov\.au|\bmyGovID\b|\bmyID\b/i, 'myGovID / myID'],
  [/digitalidsystem\.gov\.au|\bAGDIS\b|\bDigital ID\b/i, 'Digital ID (AGDIS)'],
  [/authorisationmanager\.gov\.au|Relationship Authorisation Manager|\bRAM\b(?!\w)/i, 'RAM'],
  [/proda\.humanservices\.gov\.au|Provider Digital Access|\bPRODA\b/i, 'PRODA'],
  [/vanguard\.business\.gov\.au|\bVANguard\b/i, 'VANguard'],
];

const PLATFORM_PATTERNS: [RegExp, string][] = [
  [/design-system\.gov\.au|@ag\.ds-|\bAGDS\b/i, 'Australian Government Design System'],
  [/gold\.gov\.au|\bgold-[a-z]+\b/i, 'GOLD Design System'],
  [/class="[^"]*\bau-[a-z]/i, 'AU design system components'],
  [/govcms/i, 'GovCMS'],
  [/notify\.gov\.au/i, 'Notify'],
  [/abr\.business\.gov\.au|abn\.business\.gov\.au/i, 'ABR / ABN Lookup'],
  [/api\.gov\.au/i, 'api.gov.au'],
];

export const reuseChecks: CheckDef[] = [
  {
    id: 'DAS-C3-01',
    standard: 'DAS',
    criterion: 3,
    sub_requirement: 'Where the service authenticates users, it reuses whole-of-government identity',
    policy_quote:
      'Have considerations been made towards whole-of-government identification and authentication?',
    policy_url: DAS_C3,
    method: 'mechanical',
    requires: ['pages.html', 'pages.dom'],
    weight: 2,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const found = new Set<string>();
      for (const p of pages) {
        for (const [re, name] of IDENTITY_PATTERNS) {
          if (re.test(p.html)) found.add(name);
        }
      }

      const hasLogin = pages.some(
        (p) =>
          /type="password"/i.test(p.html) ||
          p.dom.links.some((l) => /\b(log ?in|sign ?in|my account)\b/i.test(l.text)),
      );

      if (found.size > 0) {
        return pass(
          `Reuses whole-of-government identity: ${[...found].join(', ')}.`,
          [...found].join(', '),
          coverageOf(bundle),
        );
      }
      if (!hasLogin) {
        return pass(
          'The service does not appear to authenticate users, so whole-of-government identity does not apply.',
          'not applicable',
          coverageOf(bundle),
        );
      }

      return needsReview(
        'A sign-in path was detected but no whole-of-government identity provider (myGov, Digital ID, myID, RAM, PRODA) was found. This is not necessarily non-compliance: the policy explicitly provides a separate decision framework for services not suitable for myGov. Requires agency evidence of that decision.',
        0,
        coverageOf(bundle),
      );
    },
  },

  {
    id: 'DSS-C6-01',
    standard: 'DSS',
    criterion: 6,
    sub_requirement: 'The service reuses common platforms, design systems or capabilities',
    policy_quote:
      'Consider the capabilities available through existing portals and leverage existing government investment.',
    policy_url: DSS_C6,
    method: 'mechanical',
    requires: ['pages.html'],
    weight: 2,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const found = new Set<string>();
      for (const p of pages) {
        for (const [re, name] of PLATFORM_PATTERNS) {
          if (re.test(p.html)) found.add(name);
        }
      }

      return found.size > 0
        ? pass(
            `Evidence of reuse: ${[...found].join(', ')}. This observes the outcome of a reuse decision, not whether the Australian Government Architecture was consulted.`,
            [...found].join(', '),
            coverageOf(bundle),
          )
        : needsReview(
            'No common government design system or platform was detected. Building bespoke is permitted, so this is not a failure — but the reuse rationale is not externally observable and would need agency evidence.',
            0,
            coverageOf(bundle),
          );
    },
  },

  {
    id: 'DAS-C1-01',
    standard: 'DAS',
    criterion: 1,
    sub_requirement: 'The service is hosted on a government domain',
    policy_quote: 'Access points are digital entry points such as websites, portals, or apps.',
    policy_url:
      'https://www.digital.gov.au/policy/digital-experience/digital-access-standard/das%20criterion%201',
    method: 'mechanical',
    requires: ['pages.headers'],
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const entry = entryPage(bundle);
      if (!entry) return notCollected('The entry point could not be retrieved.');

      let host: string;
      try {
        host = new URL(entry.final_url).hostname.toLowerCase();
      } catch {
        return notCollected('The final URL could not be parsed.');
      }

      return /\.gov\.au$/.test(host)
        ? pass(`Served from a government domain (${host}).`, host)
        : fail(
            `Served from ${host}, which is not a gov.au domain. Non-government domains make it harder for users to tell a genuine service from an impersonation.`,
            host,
            [entry.final_url],
          );
    },
  },
];
