import type { CheckDef } from '../types.js';
import { fail, needsReview, notCollected, pass } from '../types.js';
import { coverageOf, entryPage, scoreablePages } from '../util.js';

const URL =
  'https://www.digital.gov.au/policy/digital-experience/digital-inclusion-standard/dis-criterion-5-provide-flexibility-and-choice';

export const flexibilityChecks: CheckDef[] = [
  {
    id: 'DIS-C5-01',
    standard: 'DIS',
    criterion: 5,
    sub_requirement: 'Content reflows on small screens without horizontal scrolling',
    policy_quote:
      'Make sure your service has a responsive design that allows for compatibility across various devices and screen sizes.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.viewports', 'pages.dom'],
    threshold: {
      value: 0,
      source: 'tool',
      rationale:
        'Measured at 320 CSS pixels wide, matching WCAG 2.2 SC 1.4.10 Reflow. The success criterion is published; applying it as a zero-tolerance check is our choice.',
    },
    weight: 3,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const probed = scoreablePages(bundle).filter((p) => p.viewports.length > 0);
      if (probed.length === 0) {
        return notCollected('No narrow-viewport measurements were captured.');
      }

      const overflowing = probed.filter((p) =>
        p.viewports.some((v) => v.width <= 360 && v.horizontalOverflow),
      );
      const missingViewportMeta = probed.filter((p) => !p.dom.metaViewport);

      if (overflowing.length === 0 && missingViewportMeta.length === 0) {
        return pass(
          `All ${probed.length} measured page(s) reflow at 320 pixels wide without horizontal scrolling.`,
          0,
          coverageOf(bundle),
        );
      }

      const detail: string[] = [];
      if (overflowing.length) detail.push(`${overflowing.length} page(s) scroll horizontally at 320px`);
      if (missingViewportMeta.length) detail.push(`${missingViewportMeta.length} page(s) declare no viewport meta tag`);

      return fail(
        `${detail.join('; ')}. Content that does not reflow forces side-to-side scrolling on a phone.`,
        overflowing.length,
        [...new Set([...overflowing, ...missingViewportMeta].map((p) => p.final_url))],
        coverageOf(bundle),
      );
    },
  },

  {
    id: 'DIS-C5-02',
    standard: 'DIS',
    criterion: 5,
    sub_requirement: 'Themes support enhanced day and night vision',
    policy_quote:
      'This may include flexible layouts, themes that support enhanced day and night vision and tailoring the user interface to meet device-specific considerations.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.css', 'pages.dom'],
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const entry = entryPage(bundle);
      if (!entry) return notCollected('The entry point could not be retrieved.');

      const auto = entry.css.prefersColorScheme;
      const manual = entry.dom.personalisationControls.some((c) => /theme|dark|contrast/i.test(c));

      if (auto || manual) {
        const how = [auto ? 'respects the operating system colour scheme' : null, manual ? 'offers a theme control' : null]
          .filter(Boolean)
          .join(' and ');
        return pass(`The service ${how}.`, 1);
      }
      return fail(
        'No dark or high-contrast theme was offered, and the service does not respond to the operating system colour scheme preference.',
        0,
        [entry.final_url],
      );
    },
  },

  {
    id: 'DIS-C5-03',
    standard: 'DIS',
    criterion: 5,
    sub_requirement: 'Motion is reduced for users who ask for it',
    policy_quote: 'Respect user settings to remove motion.',
    policy_url:
      'https://www.digital.gov.au/policy/digital-experience/digital-inclusion-standard/inclusive-digital-design-tips',
    method: 'mechanical',
    requires: ['pages.css'],
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const entry = entryPage(bundle);
      if (!entry) return notCollected('The entry point could not be retrieved.');

      if (entry.css.prefersReducedMotion) {
        return pass('The service honours the reduced-motion preference.', 1);
      }

      return needsReview(
        'No reduced-motion styles were found. This is only a problem if the service animates; a static site needs no such rule. Needs manual confirmation.',
        0,
      );
    },
  },

  {
    id: 'DIS-C5-04',
    standard: 'DIS',
    criterion: 5,
    sub_requirement: 'Users are not rushed by automatic timeouts or refreshes',
    policy_quote:
      'Be mindful to provide enough time to complete tasks and avoid time constraints that may pose challenges to individuals with cognitive or motor disabilities.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.dom'],
    threshold: {
      value: 0,
      source: 'tool',
      rationale:
        'A meta refresh moves the user without warning or a way to stop it. Related to WCAG 2.2.1 Timing Adjustable. Only automatic page refreshes are detectable without submitting forms, so this check is narrower than the policy requirement.',
    },
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const refreshing = pages.filter((p) => p.dom.metaRefresh);
      return refreshing.length === 0
        ? pass(
            'No pages refresh or redirect themselves automatically. Session timeouts inside transactions were not assessed, as that would require submitting forms.',
            0,
            coverageOf(bundle),
          )
        : fail(
            `${refreshing.length} page(s) refresh or redirect automatically, which can move users before they have finished reading.`,
            refreshing.length,
            refreshing.map((p) => p.final_url),
            coverageOf(bundle),
          );
    },
  },

  {
    id: 'DIS-C5-05',
    standard: 'DIS',
    criterion: 5,
    sub_requirement: 'A printable or downloadable alternative is available',
    policy_quote:
      'Support users to move between service channels with ease ... you may offer downloadable content that they can print out and take into a shopfront to complete the service.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.css', 'pages.dom'],
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const hasPrintCss = pages.some((p) => p.css.hasPrintStylesheet);
      const hasDownloads = pages.some((p) => p.dom.links.some((l) => l.document));

      if (hasPrintCss || hasDownloads) {
        const how = [hasPrintCss ? 'print styles' : null, hasDownloads ? 'downloadable documents' : null]
          .filter(Boolean)
          .join(' and ');
        return pass(`An offline path exists via ${how}.`, 1, coverageOf(bundle));
      }
      return fail(
        'No print stylesheet and no downloadable documents were found, so there is no obvious offline path for users who need one.',
        0,
        [],
        coverageOf(bundle),
      );
    },
  },
];
