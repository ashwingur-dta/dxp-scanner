import type { CheckDef } from '../types.js';
import { fail, needsReview, notCollected, pass, scoreRatio } from '../types.js';
import { coverageOf, scoreablePages } from '../util.js';

const URL =
  'https://www.digital.gov.au/policy/digital-experience/digital-performance-standard/dps-criterion-4-measure-if-your-digital-service-meeting-customer-needs';

export const feedbackChecks: CheckDef[] = [
  {
    id: 'DPS-C4-01',
    standard: 'DPS',
    criterion: 4,
    sub_requirement: 'A customer feedback channel is available on every page',
    policy_quote:
      'At a minimum, customer feedback channels should be available on each page and at the end of a digital transaction.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.dom'],
    threshold: {
      value: 0.95,
      source: 'tool',
      rationale:
        'The policy says "each page", which is 1.0. We score at 0.95 so that a single odd template or crawl artefact does not fail an otherwise compliant site. This relaxes our measurement, not the policy.',
    },
    weight: 3,
    modes: ['quick', 'full'],
    run: (bundle, def) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const missing = pages.filter((p) => !p.dom.feedback);
      const ratio = (pages.length - missing.length) / pages.length;

      return scoreRatio(
        ratio,
        def,
        `${pages.length - missing.length} of ${pages.length} assessed pages offer a feedback mechanism.`,
        missing.map((p) => p.final_url),
        coverageOf(bundle),
      );
    },
  },

  {
    id: 'DPS-C4-02',
    standard: 'DPS',
    criterion: 4,
    sub_requirement: 'Feedback uses a simple sentiment control with a free-text follow-up',
    policy_quote:
      'The DTA recommend a simple thumbs up/down sentiment tool on each page of the digital service that is followed up by a free text feedback dialogue.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.dom'],
    threshold: {
      value: 0.8,
      source: 'tool',
      rationale:
        'The policy recommends rather than mandates this mechanism, so it is scored as best practice at 0.8 of pages carrying feedback, not as a hard requirement.',
    },
    weight: 2,
    modes: ['quick', 'full'],
    run: (bundle, def) => {
      const pages = scoreablePages(bundle);
      const withFeedback = pages.filter((p) => p.dom.feedback);
      if (withFeedback.length === 0) {
        return fail(
          'No feedback mechanism was found, so the recommended sentiment control cannot be present.',
          0,
          [],
          coverageOf(bundle),
        );
      }

      const good = withFeedback.filter(
        (p) => p.dom.feedback?.sentimentControl && p.dom.feedback?.freeText,
      );
      const ratio = good.length / withFeedback.length;

      return scoreRatio(
        ratio,
        def,
        `${good.length} of ${withFeedback.length} pages with feedback pair a sentiment control with a free-text follow-up.`,
        withFeedback
          .filter((p) => !(p.dom.feedback?.sentimentControl && p.dom.feedback?.freeText))
          .map((p) => p.final_url),
        coverageOf(bundle),
      );
    },
  },

  {
    id: 'DPS-C4-03',
    standard: 'DPS',
    criterion: 4,
    sub_requirement: 'The feedback mechanism is low-burden and does not demand identity',
    policy_quote:
      'Design a feedback mechanism that is easy and accessible for users and encourages engagement. The higher the response rate, the closer the data will be to the true sentiment of users.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.dom'],
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      const withFeedback = pages.filter((p) => p.dom.feedback);
      if (withFeedback.length === 0) {
        return notCollected('No feedback mechanism found to assess for burden.');
      }

      const gated = withFeedback.filter((p) => p.dom.feedback?.requiresIdentity);
      if (gated.length > 0) {
        return fail(
          `${gated.length} page(s) require personal details before feedback can be submitted, which suppresses response rates.`,
          gated.length,
          gated.map((p) => p.final_url),
          coverageOf(bundle),
        );
      }
      return pass(
        'Feedback can be submitted without providing identifying details.',
        0,
        coverageOf(bundle),
      );
    },
  },

  {
    id: 'DPS-C4-04',
    standard: 'DPS',
    criterion: 4,
    sub_requirement: 'Feedback is a satisfaction rating, not merely a contact route',
    policy_quote:
      'Customer satisfaction is an industry-standard measure of digital service quality.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.dom'],
    weight: 2,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const onlyContact = pages.filter((p) => p.dom.feedback?.genericContactOnly);
      const anyRating = pages.some(
        (p) => p.dom.feedback && !p.dom.feedback.genericContactOnly,
      );

      if (!anyRating && onlyContact.length > 0) {
        return fail(
          'Only generic contact or complaints routes were found. The policy asks for a satisfaction rating mechanism, which these do not provide.',
          0,
          onlyContact.slice(0, 10).map((p) => p.final_url),
          coverageOf(bundle),
        );
      }
      if (!anyRating) {
        return fail('No satisfaction rating mechanism found.', 0, [], coverageOf(bundle));
      }
      return pass('A satisfaction rating mechanism is present.', 1, coverageOf(bundle));
    },
  },

  {
    id: 'DPS-C4-05',
    standard: 'DPS',
    criterion: 4,
    sub_requirement: 'Feedback is available at the end of a digital transaction',
    policy_quote:
      'At a minimum, customer feedback channels should be available on each page and at the end of a digital transaction.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.dom'],
    weight: 2,
    modes: ['full'],
    run: () =>

      needsReview(
        'Not assessed. Confirming this would require completing a transaction, and the scanner never submits forms to live government services. Requires agency confirmation.',
      ),
  },
];
