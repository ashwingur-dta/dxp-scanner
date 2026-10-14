import type { EvidenceBundle, PageEvidence } from '@dxp/schema';

export function scoreablePages(bundle: EvidenceBundle): PageEvidence[] {
  return bundle.pages.filter((p) => p.integrity.ok);
}

export function coverageOf(bundle: EvidenceBundle): number {
  const attempted = bundle.pages.length + bundle.skipped.length;
  if (attempted === 0) return 0;
  return scoreablePages(bundle).length / attempted;
}

export function entryPage(bundle: EvidenceBundle): PageEvidence | undefined {
  return (
    bundle.pages.find((p) => p.url === bundle.site.entry_url && p.integrity.ok) ??
    scoreablePages(bundle)[0]
  );
}

export function homePage(bundle: EvidenceBundle): PageEvidence | undefined {
  return scoreablePages(bundle).find((p) => {
    try {
      return new URL(p.final_url).pathname.replace(/\/$/, '') === '';
    } catch {
      return false;
    }
  });
}

export function pageText(page: PageEvidence): string {
  return `${page.dom.title}\n${page.main_text}\n${page.dom.links.map((l) => l.text).join('\n')}`;
}

export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;

  let s = w

    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');

  const groups = s.match(/[aeiouy]{1,2}/g);
  let n = groups ? groups.length : 0;

  if (/(?:[^aeiouy]le|[^aeiouy]les)$/.test(w)) n += 1;
  if (/(?:ia|io|ua|uo)/.test(w)) n += 1;

  return Math.max(1, n);
}

export interface Readability {
  words: number;
  sentences: number;
  syllables: number;

  fleschKincaid: number;
  gunningFog: number;
  avgSentenceLength: number;

  longSentenceRatio: number;
}

export function readability(text: string): Readability | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length < 200) return null;

  const sentenceParts = clean
    .split(/(?<=[.!?])\s+(?=[A-Z"'(])/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 3);

  const words = clean.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  const sentences = Math.max(1, sentenceParts.length);
  if (words.length < 50) return null;

  let syllables = 0;
  let complexWords = 0;
  for (const w of words) {
    const s = countSyllables(w);
    syllables += s;
    if (s >= 3) complexWords += 1;
  }

  const wps = words.length / sentences;
  const spw = syllables / words.length;
  const longSentences = sentenceParts.filter((s) => s.split(/\s+/).length > 25).length;

  return {
    words: words.length,
    sentences,
    syllables,
    fleschKincaid: 0.39 * wps + 11.8 * spw - 15.59,
    gunningFog: 0.4 * (wps + 100 * (complexWords / words.length)),
    avgSentenceLength: wps,
    longSentenceRatio: longSentences / sentences,
  };
}

export const TIS_NATIONAL = /\b131[\s .-]?450\b|translating and interpreting|\bTIS National\b/i;
export const RELAY_SERVICE = /\b133[\s .-]?677\b|national relay service|\bNRS\b(?!\w)/i;
export const AU_PHONE = /\b(?:1800|1300|13)[\s .-]?\d{2}[\s .-]?\d{2,3}[\s .-]?\d{0,3}\b|\b\(0[2-8]\)[\s .-]?\d{4}[\s .-]?\d{4}\b/;
export const EASY_READ = /easy read|easy-read|easy english/i;
export const AUSLAN = /\bauslan\b|sign language/i;
export const QUICK_EXIT = /quick exit|leave this (?:site|page)|hide this page|safe exit|exit this site/i;
export const LANGUAGE_OFFER =
  /other languages|in your language|translated information|language assistance|\btranslations?\b/i;
