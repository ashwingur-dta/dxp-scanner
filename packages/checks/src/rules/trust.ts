import type { CheckDef } from '../types.js';
import { fail, needsReview, notCollected, pass } from '../types.js';
import { AU_PHONE, coverageOf, entryPage, pageText, scoreablePages } from '../util.js';

const DSS_C5 =
  'https://www.digital.gov.au/policy/digital-experience/digital-service-standard/criterion-5';
const DSS_C7 =
  'https://www.digital.gov.au/policy/digital-experience/digital-service-standard/criterion-7';
const DIS_C3 =
  'https://www.digital.gov.au/policy/digital-experience/digital-inclusion-standard/dis-criterion-3-protect-users';

export const trustChecks: CheckDef[] = [
  {
    id: 'DSS-C5-02',
    standard: 'DSS',
    criterion: 5,
    sub_requirement: 'Traffic is encrypted and HTTP is redirected to HTTPS',
    policy_quote:
      'Plan security requirements during service design, build, operation and decommissioning.',
    policy_url: DSS_C5,
    method: 'mechanical',
    requires: ['site.https_redirect'],
    weight: 3,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const r = bundle.site.https_redirect;
      if (r === null) return notCollected('The plain-HTTP redirect behaviour could not be tested.');
      return r
        ? pass('Plain HTTP requests are redirected to HTTPS.', 1)
        : fail(
            'Plain HTTP requests are not redirected to HTTPS, so a user arriving over HTTP stays unencrypted.',
            0,
            [bundle.site.origin],
          );
    },
  },

  {
    id: 'DSS-C5-03',
    standard: 'DSS',
    criterion: 5,
    sub_requirement: 'Transport security and key response headers are set',
    policy_quote:
      'Make the service secure using the: Information Security Manual; the Essential Eight; resources from the Australian Cyber Security Centre.',
    policy_url: DSS_C5,
    method: 'mechanical',
    requires: ['site.security_headers'],
    threshold: {
      value: 3,
      source: 'tool',
      rationale:
        'The policy names the ISM and Essential Eight but neither prescribes specific HTTP headers. We require at least 3 of 4 common protections (HSTS, CSP, X-Content-Type-Options, Referrer-Policy). This is a hygiene signal only, not a measure of security posture.',
    },
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle, def) => {
      const h = bundle.site.security_headers;
      const wanted = [
        'strict-transport-security',
        'content-security-policy',
        'x-content-type-options',
        'referrer-policy',
      ];
      const present = wanted.filter((k) => h[k]);
      const missing = wanted.filter((k) => !h[k]);
      const limit = def.threshold?.value ?? 3;

      return present.length >= limit
        ? pass(`${present.length} of 4 common security headers are set.`, present.length)
        : fail(
            `Only ${present.length} of 4 common security headers are set. Missing: ${missing.join(', ')}. This is a hygiene signal, not an assessment of security posture.`,
            present.length,
            [bundle.site.origin],
          );
    },
  },

  {
    id: 'DSS-C5-04',
    standard: 'DSS',
    criterion: 5,
    sub_requirement: 'Cookies are set with protective flags',
    policy_quote:
      'Continuously assess and address risks to ensure user data remains protected.',
    policy_url: DIS_C3,
    method: 'mechanical',
    requires: ['site.cookie_flags'],
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const c = bundle.site.cookie_flags;
      if (c.total === 0) return pass('No cookies were set, so there are no cookie flags to assess.', 0);

      const problems: string[] = [];
      if (c.insecure > 0) problems.push(`${c.insecure} without Secure`);
      if (c.noHttpOnly > 0) problems.push(`${c.noHttpOnly} without HttpOnly`);
      if (c.noSameSite > 0) problems.push(`${c.noSameSite} without SameSite`);

      return problems.length === 0
        ? pass(`All ${c.total} cookies set Secure, HttpOnly and SameSite.`, c.total)
        : fail(
            `Of ${c.total} cookies: ${problems.join(', ')}. Note that some cookies legitimately omit HttpOnly when read by client-side scripts.`,
            c.total,
            [bundle.site.origin],
          );
    },
  },

  {
    id: 'DSS-C5-05',
    standard: 'DSS',
    criterion: 5,
    sub_requirement: 'There is a route to report a security problem',
    policy_quote: 'Set up clear communication channels to report safety concerns and commit to resolving issues promptly.',
    policy_url: DIS_C3,
    method: 'mechanical',
    requires: ['site.security_txt'],
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle) => {
      if (bundle.site.security_txt) {
        return pass('A security.txt file publishes a vulnerability reporting contact.', 1);
      }

      return needsReview(
        'No security.txt was found. The policy asks for clear channels to report concerns but does not name this mechanism, so a reporting route may exist elsewhere.',
        0,
      );
    },
  },

  {
    id: 'DSS-C7-01',
    standard: 'DSS',
    criterion: 7,
    sub_requirement: 'A privacy notice is published and reachable',
    policy_quote:
      'Regularly inform users about the data collected, why it is collected and how it will be used.',
    policy_url: DIS_C3,
    method: 'mechanical',
    requires: ['pages.dom'],
    weight: 2,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const linked = pages.filter((p) =>
        p.dom.links.some(
          (l) => /privacy/i.test(l.text) || /\/privacy/i.test(l.href),
        ),
      );
      const ratio = linked.length / pages.length;

      if (linked.length === 0) {
        return fail('No link to a privacy notice was found on any assessed page.', 0, [], coverageOf(bundle));
      }
      return ratio >= 0.8
        ? pass(
            `A privacy notice is linked from ${linked.length} of ${pages.length} assessed pages.`,
            Number(ratio.toFixed(2)),
            coverageOf(bundle),
          )
        : fail(
            `A privacy notice is linked from only ${linked.length} of ${pages.length} assessed pages, so it is not consistently reachable.`,
            Number(ratio.toFixed(2)),
            pages
              .filter((p) => !p.dom.links.some((l) => /privacy/i.test(l.text) || /\/privacy/i.test(l.href)))
              .map((p) => p.final_url),
            coverageOf(bundle),
          );
    },
  },

  {
    id: 'DSS-C7-02',
    standard: 'DSS',
    criterion: 7,
    sub_requirement: 'Third-party tracking does not occur before consent is given',
    policy_quote:
      'Create clear and concise consent forms and confirm user agreement before data is collected.',
    policy_url: DIS_C3,
    method: 'mechanical',
    requires: ['pages.third_party_hosts', 'pages.dom'],
    threshold: {
      value: 0,
      source: 'tool',
      rationale:
        'The policy says to confirm agreement "before data is collected". We treat any third-party analytics or advertising host contacted on first load, with no interaction, as collection before consent. Operational third parties such as a CDN or font host are excluded.',
    },
    weight: 2,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const TRACKERS =
        /google-analytics|googletagmanager|doubleclick|facebook\.net|connect\.facebook|hotjar|clarity\.ms|segment\.(io|com)|mixpanel|adobedtm|omtrdc\.net|quantserve|scorecardresearch|linkedin\.com\/px|bat\.bing|tiktok|snap\.licdn/i;

      const offending = pages
        .map((p) => ({ page: p, hosts: p.third_party_hosts.filter((h) => TRACKERS.test(h)) }))
        .filter((x) => x.hosts.length > 0);

      const hasBanner = pages.some((p) => p.dom.cookieBanner);

      if (offending.length === 0) {
        return pass(
          'No third-party analytics or advertising hosts were contacted before any interaction.',
          0,
          coverageOf(bundle),
        );
      }

      const hosts = [...new Set(offending.flatMap((o) => o.hosts))];
      const bannerNote = hasBanner
        ? ' A consent banner is present, which makes this a contradiction between what the site asks and what it already did.'
        : ' No consent banner was detected.';

      return fail(
        `${offending.length} of ${pages.length} pages contacted third-party tracking hosts on load, before any consent could be given: ${hosts.slice(0, 6).join(', ')}.${bannerNote}`,
        hosts.length,
        offending.map((o) => o.page.final_url),
        coverageOf(bundle),
      );
    },
  },

  {
    id: 'DIS-C3-01',
    standard: 'DIS',
    criterion: 3,
    sub_requirement: 'Several ways to make contact are offered',
    policy_quote:
      'Provide a variety of contact methods. This may include options like email, chat, phone, social media and other feedback methods.',
    policy_url: DIS_C3,
    method: 'mechanical',
    requires: ['pages.dom', 'pages.main_text'],
    threshold: {
      value: 2,
      source: 'tool',
      rationale:
        'The policy lists five example channels but requires no particular number. We look for at least two, so that a single channel failing does not cut users off entirely.',
    },
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle, def) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const channels = new Set<string>();
      for (const p of pages) {
        const t = pageText(p);
        if (AU_PHONE.test(t)) channels.add('phone');
        if (p.dom.links.some((l) => /^mailto:/i.test(l.href))) channels.add('email');
        if (/live chat|webchat|chat with us|virtual assistant/i.test(t)) channels.add('chat');
        if (p.dom.links.some((l) => /facebook|twitter|x\.com|linkedin|instagram/i.test(l.href)))
          channels.add('social media');
        if (/GPO Box|PO Box|postal address/i.test(t)) channels.add('post');
      }

      const limit = def.threshold?.value ?? 2;
      return channels.size >= limit
        ? pass(
            `${channels.size} contact channels offered: ${[...channels].join(', ')}.`,
            channels.size,
            coverageOf(bundle),
          )
        : fail(
            `Only ${channels.size} contact channel(s) found${channels.size ? ` (${[...channels].join(', ')})` : ''}.`,
            channels.size,
            [],
            coverageOf(bundle),
          );
    },
  },

  {
    id: 'DIS-C3-02',
    standard: 'DIS',
    criterion: 3,
    sub_requirement: 'Users are warned about scams impersonating the service',
    policy_quote:
      'Help to \'build trust in design\' by supporting the work of the National Anti-Scams Centre and mitigate misinformation by supporting the work of the Australian Communications and Media Authority.',
    policy_url: DIS_C3,
    method: 'mechanical',
    requires: ['pages.main_text', 'pages.dom'],
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const re = /\bscam|phishing|we will never ask|report a scam|scamwatch/i;
      const found = pages.filter((p) => re.test(pageText(p)) || p.dom.links.some((l) => re.test(l.text)));

      return found.length > 0
        ? pass(`Scam awareness content was found on ${found.length} page(s).`, found.length, coverageOf(bundle))
        : needsReview(
            'No scam awareness or Scamwatch content was found on the assessed pages. This may well exist elsewhere on the site.',
            0,
            coverageOf(bundle),
          );
    },
  },
];
