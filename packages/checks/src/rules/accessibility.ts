import type { CheckDef } from '../types.js';
import { fail, needsReview, notCollected, pass, scoreRatio } from '../types.js';
import { coverageOf, entryPage, scoreablePages } from '../util.js';

const URL =
  'https://www.digital.gov.au/policy/digital-experience/digital-inclusion-standard/dis-criterion-4-make-it-accessible';

export const accessibilityChecks: CheckDef[] = [
  {
    id: 'DIS-C4-01',
    standard: 'DIS',
    criterion: 4,
    sub_requirement: 'No critical or serious machine-detectable accessibility violations',
    policy_quote:
      'Make sure the service meets or exceeds current requirements for the Australian Government, including Web Content Accessibility Guidelines (WCAG).',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.axe'],
    threshold: {
      value: 0,
      source: 'tool',
      rationale:
        'The policy names WCAG but no conformance level, so "zero critical or serious violations" is our interpretation. Automated testing covers about a third of WCAG success criteria, so passing this is a floor, not conformance.',
    },
    weight: 3,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const byRule = new Map<string, { count: number; nodes: number; help: string }>();
      const offending: string[] = [];

      for (const p of pages) {
        const bad = p.axe.violations.filter(
          (v) => v.impact === 'critical' || v.impact === 'serious',
        );
        if (bad.length > 0) offending.push(p.final_url);
        for (const v of bad) {
          const e = byRule.get(v.id) ?? { count: 0, nodes: 0, help: v.help };
          e.count += 1;
          e.nodes += v.nodeCount;
          byRule.set(v.id, e);
        }
      }

      const totalNodes = [...byRule.values()].reduce((s, e) => s + e.nodes, 0);
      if (byRule.size === 0) {
        return pass(
          `No critical or serious machine-detectable violations across ${pages.length} pages. This is not a claim of WCAG conformance.`,
          0,
          coverageOf(bundle),
        );
      }

      const top = [...byRule.entries()]
        .sort((a, b) => b[1].nodes - a[1].nodes)
        .slice(0, 6)
        .map(([id, e]) => `${id} (${e.nodes} elements on ${e.count} pages)`)
        .join('; ');

      return fail(
        `${totalNodes} elements across ${offending.length} of ${pages.length} pages carry critical or serious violations. Most common: ${top}.`,
        totalNodes,
        offending,
        coverageOf(bundle),
      );
    },
  },

  {
    id: 'DIS-C4-02',
    standard: 'DIS',
    criterion: 4,
    sub_requirement: 'Items automated testing could not decide are reviewed by a person',
    policy_quote:
      'Use automated accessibility testing where appropriate, in addition to testing services with real people.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.axe'],
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const incomplete = pages.reduce((s, p) => s + p.axe.incompleteCount, 0);

      return incomplete === 0
        ? pass('Automated testing returned no undecidable items.', 0, coverageOf(bundle))
        : needsReview(
            `${incomplete} items could not be decided automatically and need human review with assistive technology.`,
            incomplete,
            coverageOf(bundle),
          );
    },
  },

  {
    id: 'DIS-C4-03',
    standard: 'DIS',
    criterion: 4,
    sub_requirement: 'Proper heading structure',
    policy_quote:
      'Use proper heading structures, descriptive links, and alternative text for images to enhance the user experience.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.dom'],
    threshold: {
      value: 0.9,
      source: 'tool',
      rationale:
        'The policy requires proper heading structure but sets no tolerance. 0.9 of pages allows for a small number of unusual templates.',
    },
    weight: 2,
    modes: ['quick', 'full'],
    run: (bundle, def) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const bad: string[] = [];
      for (const p of pages) {
        const reasons: string[] = [];
        if (p.dom.h1Count === 0) reasons.push('no h1');
        if (p.dom.h1Count > 1) reasons.push(`${p.dom.h1Count} h1 elements`);

        let prev = 0;
        for (const h of p.dom.headings) {
          if (prev && h.level > prev + 1) {
            reasons.push(`level jumps h${prev} to h${h.level}`);
            break;
          }
          prev = h.level;
        }
        if (p.dom.headings.some((h) => h.faux)) reasons.push('text styled as headings but not marked up');
        if (reasons.length) bad.push(`${p.final_url} — ${reasons.join(', ')}`);
      }

      const ratio = (pages.length - bad.length) / pages.length;
      return scoreRatio(
        ratio,
        def,
        `${pages.length - bad.length} of ${pages.length} pages have a sound heading structure.`,
        bad,
        coverageOf(bundle),
      );
    },
  },

  {
    id: 'DIS-C4-04',
    standard: 'DIS',
    criterion: 4,
    sub_requirement: 'Descriptive link text',
    policy_quote:
      'Use proper heading structures, descriptive links, and alternative text for images to enhance the user experience.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.dom'],
    threshold: {
      value: 0.05,
      source: 'tool',
      rationale:
        'The policy requires descriptive links but sets no tolerance. We allow up to 5% of links to be non-descriptive, since a handful of "read more" links in a news listing is not the problem the policy targets.',
    },
    weight: 2,
    modes: ['quick', 'full'],
    run: (bundle, def) => {
      const pages = scoreablePages(bundle);
      const links = pages.flatMap((p) => p.dom.links.map((l) => ({ ...l, page: p.final_url })));
      if (links.length === 0) return notCollected('No links were found to assess.');

      const bad = links.filter((l) => l.nondescriptive);
      const ratio = bad.length / links.length;
      const limit = def.threshold?.value ?? 0.05;

      const examples = [...new Set(bad.map((l) => `"${l.text.trim().slice(0, 40)}" on ${l.page}`))];

      return ratio <= limit
        ? pass(
            `${bad.length} of ${links.length} links are non-descriptive (${(ratio * 100).toFixed(1)}%).`,
            Number(ratio.toFixed(3)),
            coverageOf(bundle),
          )
        : fail(
            `${bad.length} of ${links.length} links (${(ratio * 100).toFixed(1)}%) use text that carries no meaning out of context, such as "click here" or a bare URL.`,
            Number(ratio.toFixed(3)),
            examples.slice(0, 20),
            coverageOf(bundle),
          );
    },
  },

  {
    id: 'DIS-C4-05',
    standard: 'DIS',
    criterion: 4,
    sub_requirement: 'Meaningful alternative text for images',
    policy_quote:
      'Use proper heading structures, descriptive links, and alternative text for images to enhance the user experience.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.dom'],
    threshold: {
      value: 0.95,
      source: 'tool',
      rationale:
        'The policy requires alternative text but sets no tolerance. Scored at 95% of non-decorative images. Note that only presence and obvious junk can be detected mechanically; whether alt text is *accurate* needs a human or a vision model.',
    },
    weight: 2,
    modes: ['quick', 'full'],
    run: (bundle, def) => {
      const pages = scoreablePages(bundle);
      const images = pages.flatMap((p) => p.dom.images.map((i) => ({ ...i, page: p.final_url })));

      const meaningful = images.filter((i) => !i.decorative);
      if (meaningful.length === 0) {
        return pass('No non-decorative images found to assess.', 1, coverageOf(bundle));
      }

      const bad = meaningful.filter((i) => i.alt === null || i.junkAlt);
      const ratio = (meaningful.length - bad.length) / meaningful.length;

      return scoreRatio(
        ratio,
        def,
        `${meaningful.length - bad.length} of ${meaningful.length} non-decorative images have usable alternative text. Presence only — accuracy is not machine-checkable.`,
        [...new Set(bad.map((i) => `${i.src.slice(0, 80)} on ${i.page}`))].slice(0, 20),
        coverageOf(bundle),
      );
    },
  },

  {
    id: 'DIS-C4-06',
    standard: 'DIS',
    criterion: 4,
    sub_requirement: 'Users can zoom and scale content',
    policy_quote:
      'keep your technology compatible with assistive technologies such as keyboard inputs, voice commands and screen readers.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.dom'],
    threshold: {
      value: 0,
      source: 'tool',
      rationale:
        'Blocking zoom defeats the most widely used accessibility adjustment there is, so any occurrence is scored as a failure. Corresponds to WCAG 1.4.4.',
    },
    weight: 3,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const blocked = pages.filter((p) => p.dom.zoomBlocked);
      return blocked.length === 0
        ? pass('Zoom and scaling are not blocked.', 0, coverageOf(bundle))
        : fail(
            `${blocked.length} page(s) block zoom via the viewport meta tag (user-scalable=no or maximum-scale below 2).`,
            blocked.length,
            blocked.map((p) => p.final_url),
            coverageOf(bundle),
          );
    },
  },

  {
    id: 'DIS-C4-07',
    standard: 'DIS',
    criterion: 4,
    sub_requirement: 'Interactive targets are large enough to operate (WCAG 2.2 SC 2.5.8)',
    policy_quote:
      'Make sure the service meets or exceeds current requirements for the Australian Government, including Web Content Accessibility Guidelines (WCAG).',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.dom'],
    threshold: {
      value: 0.02,
      source: 'tool',
      rationale:
        'WCAG 2.2 SC 2.5.8 sets a 24x24 CSS pixel minimum, which is the published standard rather than our invention. The 2% tolerance is ours, because the success criterion has exceptions (inline links in text, for example) that we cannot detect reliably.',
    },
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle, def) => {
      const pages = scoreablePages(bundle);
      const interactive = pages.reduce((s, p) => s + p.dom.interactiveCount, 0);
      const small = pages.reduce((s, p) => s + p.dom.smallTargets, 0);
      if (interactive === 0) return notCollected('No interactive elements were measured.');

      const ratio = small / interactive;
      const limit = def.threshold?.value ?? 0.02;

      return ratio <= limit
        ? pass(
            `${small} of ${interactive} interactive elements are under 24x24 CSS pixels.`,
            small,
            coverageOf(bundle),
          )
        : fail(
            `${small} of ${interactive} interactive elements (${(ratio * 100).toFixed(1)}%) are smaller than the 24x24 CSS pixel minimum.`,
            small,
            pages.filter((p) => p.dom.smallTargets > 0).map((p) => `${p.final_url} (${p.dom.smallTargets})`),
            coverageOf(bundle),
          );
    },
  },

  {
    id: 'DIS-C4-08',
    standard: 'DIS',
    criterion: 4,
    sub_requirement: 'Video and audio have captions or an equivalent alternative',
    policy_quote:
      'Make sure all users can find and use content and provide alternative types of content to meet user needs.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.dom'],
    weight: 2,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      const media = pages.flatMap((p) => p.dom.media.map((m) => ({ ...m, page: p.final_url })));
      const av = media.filter((m) => m.kind === 'video' || m.kind === 'audio');
      if (av.length === 0) {
        return pass('No native video or audio elements found to assess.', 1, coverageOf(bundle));
      }

      const uncaptioned = av.filter((m) => !m.hasCaptionsTrack);

      const embeds = media.filter((m) => m.kind === 'iframe-embed');

      if (uncaptioned.length === 0) {
        return pass(`All ${av.length} media elements declare a captions track.`, 0, coverageOf(bundle));
      }
      if (embeds.length > 0 && uncaptioned.length === av.length) {
        return needsReview(
          `${uncaptioned.length} media element(s) declare no captions track, and ${embeds.length} embedded player(s) may carry captions not visible from the page. Needs manual confirmation.`,
          uncaptioned.length,
          coverageOf(bundle),
        );
      }
      return fail(
        `${uncaptioned.length} of ${av.length} media elements declare no captions track.`,
        uncaptioned.length,
        [...new Set(uncaptioned.map((m) => `${m.src.slice(0, 80)} on ${m.page}`))].slice(0, 15),
        coverageOf(bundle),
      );
    },
  },

  {
    id: 'DIS-C4-09',
    standard: 'DIS',
    criterion: 4,
    sub_requirement: 'Media does not play automatically',
    policy_quote:
      'Simplify language, provide consistent navigation, and minimise distractions on interfaces to help users access content.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.dom'],
    threshold: {
      value: 0,
      source: 'policy',
      rationale:
        'The policy\'s inclusive design guidance lists "Allow video or audio content to play automatically" under don\'ts, without qualification.',
    },
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const offenders = pages.filter((p) =>
        p.dom.media.some((m) => m.autoplay && !m.muted),
      );
      return offenders.length === 0
        ? pass('No media plays automatically with sound.', 0, coverageOf(bundle))
        : fail(
            `${offenders.length} page(s) play media automatically with sound.`,
            offenders.length,
            offenders.map((p) => p.final_url),
            coverageOf(bundle),
          );
    },
  },

  {
    id: 'DIS-C4-10',
    standard: 'DIS',
    criterion: 4,
    sub_requirement: 'Page language is declared for screen readers',
    policy_quote:
      'Make sure the service is compatible with tools such as screen readers, keyboard inputs and voice commands tools.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.dom'],
    threshold: {
      value: 1,
      source: 'tool',
      rationale:
        'Without a declared language a screen reader may use the wrong pronunciation rules for the whole page. This is cheap to fix, so we require it on every page.',
    },
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle, def) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const bad = pages.filter((p) => !p.dom.lang || !/^[a-z]{2,3}(-|$)/i.test(p.dom.lang));
      const ratio = (pages.length - bad.length) / pages.length;

      return scoreRatio(
        ratio,
        def,
        `${pages.length - bad.length} of ${pages.length} pages declare a valid language.`,
        bad.map((p) => `${p.final_url} (lang="${p.dom.lang ?? ''}")`),
        coverageOf(bundle),
      );
    },
  },

  {
    id: 'DSS-C3-01',
    standard: 'DSS',
    criterion: 3,
    sub_requirement: 'Keyboard users can skip repeated navigation',
    policy_quote:
      'Test using keyboards for navigation and different browsers.',
    policy_url:
      'https://www.digital.gov.au/policy/digital-experience/digital-service-standard/criterion-3',
    method: 'mechanical',
    requires: ['pages.dom'],
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const entry = entryPage(bundle);
      if (!entry) return notCollected('The entry point could not be retrieved.');

      const s = entry.dom.skipLink;
      if (!s.present) {
        return fail(
          'No skip link was found, so keyboard users must tab through the whole navigation on every page.',
          0,
          [entry.final_url],
        );
      }
      if (!s.firstFocusable) {
        return fail(
          `A skip link exists ("${s.text ?? ''}") but is not the first focusable element, which limits its usefulness.`,
          0,
          [entry.final_url],
        );
      }
      return pass(`A skip link is present and first in the tab order ("${s.text ?? ''}").`, 1);
    },
  },
];
