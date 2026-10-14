import type { CheckDef } from '../types.js';
import { fail, notCollected, pass } from '../types.js';
import { coverageOf, readability, scoreablePages } from '../util.js';

const URL =
  'https://www.digital.gov.au/policy/digital-experience/digital-inclusion-standard/dis-criterion-4-make-it-accessible';

export const plainLanguageChecks: CheckDef[] = [
  {
    id: 'DIS-C4-11',
    standard: 'DIS',
    criterion: 4,
    sub_requirement: 'Content is written in plain language',
    policy_quote:
      'Simplify language, provide consistent navigation, and minimise distractions on interfaces to help users access content.',
    policy_url: URL,
    method: 'mechanical',
    requires: ['pages.main_text'],
    threshold: {
      value: 9,
      source: 'tool',
      rationale:
        'The policy says "simplify language" and defers to the Australian Government Style Manual, but states no reading-age target. We use Flesch-Kincaid grade 9 as the median across pages, which is a little looser than the Style Manual\'s Year 7 guidance to allow for unavoidably technical subject matter.',
    },
    weight: 2,
    modes: ['quick', 'full'],
    run: (bundle, def) => {
      const pages = scoreablePages(bundle);
      const scored = pages
        .map((p) => ({ page: p, r: readability(p.main_text) }))
        .filter((x): x is { page: typeof x.page; r: NonNullable<typeof x.r> } => x.r !== null);

      if (scored.length === 0) {
        return notCollected(
          'Not enough prose on the assessed pages to measure readability reliably.',
        );
      }

      const grades = scored.map((s) => s.r.fleschKincaid).sort((a, b) => a - b);
      const median = grades[Math.floor(grades.length / 2)] ?? 0;
      const limit = def.threshold?.value ?? 9;
      const worst = scored
        .filter((s) => s.r.fleschKincaid > limit + 2)
        .sort((a, b) => b.r.fleschKincaid - a.r.fleschKincaid)
        .slice(0, 10)
        .map((s) => `${s.page.final_url} (grade ${s.r.fleschKincaid.toFixed(1)})`);

      return median <= limit
        ? pass(
            `Median reading level across ${scored.length} pages is grade ${median.toFixed(1)}.`,
            Number(median.toFixed(1)),
            coverageOf(bundle),
          )
        : fail(
            `Median reading level across ${scored.length} pages is grade ${median.toFixed(1)}, above our guide of grade ${limit}.`,
            Number(median.toFixed(1)),
            worst,
            coverageOf(bundle),
          );
    },
  },

  {
    id: 'DIS-C4-12',
    standard: 'DIS',
    criterion: 4,
    sub_requirement: 'Sentences are short enough to follow',
    policy_quote: 'Write in plain English.',
    policy_url:
      'https://www.digital.gov.au/policy/digital-experience/digital-inclusion-standard/inclusive-digital-design-tips',
    method: 'mechanical',
    requires: ['pages.main_text'],
    threshold: {
      value: 0.25,
      source: 'tool',
      rationale:
        'The policy\'s guidance says to avoid "long blocks of text" but gives no number. We flag when more than a quarter of sentences exceed 25 words.',
    },
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle, def) => {
      const pages = scoreablePages(bundle);
      const scored = pages
        .map((p) => ({ page: p, r: readability(p.main_text) }))
        .filter((x): x is { page: typeof x.page; r: NonNullable<typeof x.r> } => x.r !== null);

      if (scored.length === 0) return notCollected('Not enough prose to assess sentence length.');

      const totalSentences = scored.reduce((s, x) => s + x.r.sentences, 0);
      const longSentences = scored.reduce((s, x) => s + x.r.longSentenceRatio * x.r.sentences, 0);
      const ratio = longSentences / Math.max(1, totalSentences);
      const limit = def.threshold?.value ?? 0.25;
      const avg = scored.reduce((s, x) => s + x.r.avgSentenceLength, 0) / scored.length;

      return ratio <= limit
        ? pass(
            `${(ratio * 100).toFixed(0)}% of sentences exceed 25 words; average sentence length is ${avg.toFixed(0)} words.`,
            Number(ratio.toFixed(3)),
            coverageOf(bundle),
          )
        : fail(
            `${(ratio * 100).toFixed(0)}% of sentences exceed 25 words; average sentence length is ${avg.toFixed(0)} words.`,
            Number(ratio.toFixed(3)),
            scored
              .filter((s) => s.r.longSentenceRatio > limit)
              .slice(0, 10)
              .map((s) => `${s.page.final_url} (${(s.r.longSentenceRatio * 100).toFixed(0)}% long sentences)`),
            coverageOf(bundle),
          );
    },
  },

  {
    id: 'DIS-C4-13',
    standard: 'DIS',
    criterion: 4,
    sub_requirement: 'Text is not set in ways that impede reading',
    policy_quote:
      'Use all uppercase letters. Use text that is both left and right justified on the same page.',
    policy_url:
      'https://www.digital.gov.au/policy/digital-experience/digital-inclusion-standard/inclusive-digital-design-tips',
    method: 'mechanical',
    requires: ['pages.css'],
    threshold: {
      value: 0,
      source: 'policy',
      rationale:
        'Both all-uppercase text and justified text are listed unconditionally under the policy\'s "don\'ts" for neurodiverse users.',
    },
    weight: 1,
    modes: ['quick', 'full'],
    run: (bundle) => {
      const pages = scoreablePages(bundle);
      if (pages.length === 0) return notCollected('No pages yielded trustworthy evidence.');

      const offenders = pages.filter((p) => p.css.justifiedBlocks > 0 || p.css.allCapsBlocks > 0);
      if (offenders.length === 0) {
        return pass('No justified or all-uppercase body text detected.', 0, coverageOf(bundle));
      }
      return fail(
        `${offenders.length} page(s) use justified or all-uppercase body text, both of which the policy lists as things to avoid.`,
        offenders.length,
        offenders.map(
          (p) =>
            `${p.final_url} (${p.css.justifiedBlocks} justified, ${p.css.allCapsBlocks} uppercase)`,
        ),
        coverageOf(bundle),
      );
    },
  },
];
