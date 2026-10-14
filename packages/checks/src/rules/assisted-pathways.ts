import type { CheckDef } from '../types.js';
import { fail, needsReview, notCollected, pass } from '../types.js';
import {
  AUSLAN,
  AU_PHONE,
  EASY_READ,
  LANGUAGE_OFFER,
  QUICK_EXIT,
  RELAY_SERVICE,
  TIS_NATIONAL,
  coverageOf,
  entryPage,
  pageText,
  scoreablePages,
} from '../util.js';

const DIS_C1 =
  'https://www.digital.gov.au/policy/digital-experience/digital-inclusion-standard/dis-criterion-1-embrace-diversity';
const DSS_C3 =
  'https://www.digital.gov.au/policy/digital-experience/digital-service-standard/criterion-3';

export const assistedPathwayChecks: CheckDef[] = [
  {
    id: 'DSS-C3-02',
    standard: 'DSS',
    criterion: 3,
    sub_requirement: 'A non-digital contact pathway is offered',
    policy_quote:
      'It is recommended that agencies also consider the non-digital experience of users to make sure services are inclusive and accessible for all.',
    policy_url: DSS_C3,
    method: 'mechanical',
    requires: ['pages.main_text', 'pages.dom'],
    weight: 2,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const withPhone = pages.filter((p) => AU_PHONE.test(pageText(p)));
      const contactLink = pages.some((p) =>
        p.dom.links.some((l) => /contact|get in touch|call us/i.test(l.text)),
      );

      if (withPhone.length > 0) {
        return pass(
          `A telephone contact number was found on ${withPhone.length} of ${pages.length} assessed pages.`,
          withPhone.length,
          coverageOf(bundle),
        );
      }
      if (contactLink) {
        return needsReview(
          'No telephone number appeared on the assessed pages, but a contact page was linked. The contact page itself was not necessarily sampled.',
          0,
          coverageOf(bundle),
        );
      }
      return fail(
        'No telephone number or contact pathway was found on the assessed pages, leaving no route for users who cannot complete the task online.',
        0,
        [],
        coverageOf(bundle),
      );
    },
  },

  {
    id: 'DIS-C1-01',
    standard: 'DIS',
    criterion: 1,
    sub_requirement: 'Interpreting support is signposted for non-English speakers',
    policy_quote: 'Provide alternative contact methods, including interpreter services.',
    policy_url:
      'https://www.digital.gov.au/policy/digital-experience/digital-inclusion-standard/inclusive-digital-design-tips',
    method: 'mechanical',
    requires: ['pages.main_text'],
    weight: 2,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const found = pages.filter((p) => TIS_NATIONAL.test(pageText(p)));
      return found.length > 0
        ? pass(
            `Interpreting support (TIS National / 131 450) is signposted on ${found.length} page(s).`,
            found.length,
            coverageOf(bundle),
          )
        : fail(
            'No reference to TIS National or an interpreting service was found on the assessed pages.',
            0,
            [],
            coverageOf(bundle),
          );
    },
  },

  {
    id: 'DIS-C1-02',
    standard: 'DIS',
    criterion: 1,
    sub_requirement: 'Relay service is signposted for Deaf and hard of hearing users',
    policy_quote: 'Make it easy to access support services.',
    policy_url:
      'https://www.digital.gov.au/policy/digital-experience/digital-inclusion-standard/inclusive-digital-design-tips',
    method: 'mechanical',
    requires: ['pages.main_text'],
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const found = pages.filter((p) => RELAY_SERVICE.test(pageText(p)));
      return found.length > 0
        ? pass(
            `The National Relay Service is signposted on ${found.length} page(s).`,
            found.length,
            coverageOf(bundle),
          )
        : fail(
            'No reference to the National Relay Service (133 677) was found on the assessed pages.',
            0,
            [],
            coverageOf(bundle),
          );
    },
  },

  {
    id: 'DIS-C1-03',
    standard: 'DIS',
    criterion: 1,
    sub_requirement: 'In-language options are offered on the front page',
    policy_quote:
      'Offer in-language options: Identify the most common languages used across your service and offer in language options on the front page of websites so it can be easily changed.',
    policy_url: DIS_C1,
    method: 'mechanical',
    requires: ['pages.dom', 'pages.main_text'],
    weight: 2,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const entry = entryPage(bundle);
      if (!entry) return notCollected('The entry point could not be retrieved.');

      const hasOffer =
        LANGUAGE_OFFER.test(pageText(entry)) ||
        entry.dom.links.some((l) => /\/languages?\b|other-languages|\/translat/i.test(l.href));
      const machineTranslate = /translate\.google|googletranslate/i.test(entry.html);

      if (hasOffer && !machineTranslate) {
        return pass('In-language options are offered from the front page.', 1);
      }
      if (machineTranslate) {

        return fail(
          'Translation appears to be provided by an automatic translation widget. The policy asks agencies not to rely on automatic translation and to verify accuracy.',
          0,
          [entry.final_url],
        );
      }
      return fail(
        'No in-language option was found on the front page.',
        0,
        [entry.final_url],
      );
    },
  },

  {
    id: 'DIS-C1-04',
    standard: 'DIS',
    criterion: 1,
    sub_requirement: 'Content is offered in more than one format',
    policy_quote:
      'Provide content in a variety of mediums to support different preferences.',
    policy_url: DIS_C1,
    method: 'mechanical',
    requires: ['pages.main_text', 'pages.dom'],
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const formats = new Set<string>();
      for (const p of pages) {
        const t = pageText(p);
        if (EASY_READ.test(t)) formats.add('Easy Read');
        if (AUSLAN.test(t)) formats.add('Auslan');
        if (p.dom.media.some((m) => m.kind === 'audio')) formats.add('audio');
        if (p.dom.media.some((m) => m.kind === 'video' || m.kind === 'iframe-embed')) formats.add('video');
        if (p.dom.links.some((l) => l.document)) formats.add('downloadable documents');
      }

      return formats.size > 0
        ? pass(
            `Alternative formats found: ${[...formats].join(', ')}.`,
            formats.size,
            coverageOf(bundle),
          )
        : fail(
            'Content was offered only as web text. No audio, video, Easy Read, Auslan or downloadable alternative was found.',
            0,
            [],
            coverageOf(bundle),
          );
    },
  },

  {
    id: 'DIS-C1-05',
    standard: 'DIS',
    criterion: 1,
    sub_requirement: 'A quick exit is available where users may be unsafe',
    policy_quote:
      "Support 'quick exit': Consider the use of 'quick exit' buttons within your digital service to help re-direct users to other digital pages if they are in an unsafe environment.",
    policy_url: DIS_C1,
    method: 'mechanical',
    requires: ['pages.main_text', 'pages.dom'],
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const found = pages.filter(
        (p) => QUICK_EXIT.test(pageText(p)) || p.dom.links.some((l) => QUICK_EXIT.test(l.text)),
      );

      if (found.length > 0) {
        return pass(`A quick exit control was found on ${found.length} page(s).`, found.length, coverageOf(bundle));
      }

      return needsReview(
        'No quick exit control was found. The policy asks agencies to "consider" one, and it is expected mainly on services used by people experiencing family or domestic violence. Whether it applies here is a judgement about the service.',
        0,
        coverageOf(bundle),
      );
    },
  },
];
