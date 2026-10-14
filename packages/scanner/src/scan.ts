import { createHash } from 'node:crypto';
import { AxeBuilder } from '@axe-core/playwright';
import type { AxeResults } from 'axe-core';
import { chromium, type BrowserContext, type Page, type Response } from 'playwright';
import type {
  AxeSummary,
  CollectionIntegrity,
  EvidenceBundle,
  IntegrityReason,
  PageEvidence,
  ScanMode,
  ViewportProbe,
} from '@dxp/schema';
import { collectFacts } from './facts.js';
import { fetchCrux } from './crux.js';
import { fetchRobots } from './robots.js';
import { guardUrl, isSafeCrawlTarget, normaliseHost } from './url-guard.js';

export const COLLECTOR_VERSION = '0.1.0';
export const SAMPLING_POLICY_VERSION = 'nav-sitemap-breadth-1';
export const EXTRACTOR_VERSION = 'readability-lite-1';

export const USER_AGENT =
  'Mozilla/5.0 (compatible; DXP-Compliance-Scanner/0.1; +https://github.com/ashwingur-dta/dxp-scanner)';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const CHALLENGE_TITLE =
  /just a moment|attention required|checking your browser|access denied|are you a robot|ddos protection|security check|verifying you are human|request blocked/i;
const CHALLENGE_BODY = /cf-browser-verification|cf_chl_|__cf_chl|incapsula|imperva|_incap_|akamai bot manager|perimeterx/i;

export interface ScanJob {
  url: string;
  mode?: ScanMode;
  siteId?: string;
  maxPages?: number;
  requireGovAu?: boolean;
}

export interface ScanProgress {
  phase: 'validating' | 'discovering' | 'crawling' | 'site-checks' | 'sealing';
  done: number;
  total: number;
  url?: string;
}

export interface ScanOptions {
  cruxApiKey?: string;
  vantageRegion?: string;
  minRequestIntervalMs?: number;
  navigationTimeoutMs?: number;
  executablePath?: string;
  extraLaunchArgs?: string[];
  onProgress?: (p: ScanProgress) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonicalise((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalise(value))).digest('hex');
}

function pageId(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

function deriveSiteId(host: string): string {
  return normaliseHost(host).replace(/^www\./, '').replace(/\.gov\.au$/, '').replace(/[^a-z0-9]+/g, '-');
}

async function extractSitemapUrls(
  sitemapUrls: string[],
  origin: string,
  limit: number,
): Promise<string[]> {
  const found: string[] = [];
  const queue = [...sitemapUrls];
  if (queue.length === 0) queue.push(new URL('/sitemap.xml', origin).href);

  let fetched = 0;
  while (queue.length > 0 && found.length < limit && fetched < 3) {
    const next = queue.shift();
    if (!next) break;
    fetched++;
    try {
      const res = await fetch(next, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;
      const xml = (await res.text()).slice(0, 3_000_000);

      const isIndex = /<sitemapindex/i.test(xml);
      const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1] ?? '');

      if (isIndex) {
        queue.push(...locs.slice(0, 2));
        continue;
      }
      for (const loc of locs) {
        if (isSafeCrawlTarget(loc, origin)) found.push(loc);
        if (found.length >= limit) break;
      }
    } catch {
      continue;
    }
  }
  return found;
}

function assessIntegrity(
  status: number,
  contentType: string | null,
  title: string,
  html: string,
  mainWordCount: number,
  sameHost: boolean,
): CollectionIntegrity {
  const reasons: IntegrityReason[] = [];

  if (status >= 400) reasons.push('http_error');
  if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) reasons.push('wrong_content_type');
  if (CHALLENGE_TITLE.test(title) || CHALLENGE_BODY.test(html.slice(0, 60_000))) reasons.push('challenge_page');
  if (mainWordCount < 25) reasons.push('content_too_short');
  if (!sameHost) reasons.push('redirected_offsite');

  return {
    ok: reasons.length === 0,
    reasons,
    ...(reasons.includes('challenge_page')
      ? { notes: 'Looks like a bot-protection interstitial rather than agency content, so it is excluded from scoring.' }
      : {}),
  };
}

async function runAxe(page: Page): Promise<AxeSummary> {
  try {
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    return {
      violations: results.violations.map((v: AxeResults['violations'][number]) => ({
        id: v.id,
        impact: (v.impact ?? null) as AxeSummary['violations'][number]['impact'],
        help: v.help,
        nodeCount: v.nodes.length,
        sampleTargets: v.nodes.slice(0, 3).map((n: { target: unknown[] }) => String(n.target[0] ?? '')),
      })),
      incompleteCount: results.incomplete.length,
      passCount: results.passes.length,
    };
  } catch {
    return { violations: [], incompleteCount: 0, passCount: 0 };
  }
}

async function measureViewports(page: Page, widths: number[]): Promise<ViewportProbe[]> {
  const probes: ViewportProbe[] = [];
  for (const width of widths) {
    try {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(220);
      const probe = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      probes.push({
        width,
        scrollWidth: probe.scrollWidth,
        innerWidth: probe.innerWidth,
        horizontalOverflow: probe.scrollWidth > probe.innerWidth + 2,
      });
    } catch {
      continue;
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 }).catch(() => undefined);
  return probes;
}

async function checkHttpsRedirect(host: string): Promise<boolean | null> {
  try {
    const res = await fetch(`http://${host}/`, {
      headers: { 'user-agent': USER_AGENT },
      redirect: 'manual',
      signal: AbortSignal.timeout(12_000),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location') ?? '';
      return loc.startsWith('https://') || (loc.startsWith('/') ? false : false);
    }
    return res.status === 200 ? false : null;
  } catch {
    return null;
  }
}

async function checkSecurityTxt(origin: string): Promise<boolean> {
  for (const path of ['/.well-known/security.txt', '/security.txt']) {
    try {
      const res = await fetch(new URL(path, origin).href, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok && /text\/plain/i.test(res.headers.get('content-type') ?? '')) return true;
    } catch {
      continue;
    }
  }
  return false;
}

async function checkLinks(
  urls: string[],
  concurrency = 5,
  timeoutMs = 6000,
): Promise<{ checked: number; ok: number; broken: { url: string; status: number }[] }> {
  const broken: { url: string; status: number }[] = [];
  let ok = 0;
  let checked = 0;
  let cursor = 0;

  const probe = async (url: string): Promise<void> => {
    let status = 0;
    try {
      let res = await fetch(url, {
        method: 'HEAD',
        headers: { 'user-agent': USER_AGENT },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 405 || res.status === 501 || res.status === 403) {
        res = await fetch(url, {
          method: 'GET',
          headers: { 'user-agent': USER_AGENT },
          redirect: 'follow',
          signal: AbortSignal.timeout(timeoutMs),
        });
      }
      status = res.status;
    } catch {
      status = 0;
    }

    checked++;
    if (status > 0 && status < 400) ok++;
    else broken.push({ url, status });
  };

  const worker = async (): Promise<void> => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      if (!url) return;
      await probe(url);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return { checked, ok, broken };
}

export async function scan(job: ScanJob, opts: ScanOptions = {}): Promise<EvidenceBundle> {
  const mode: ScanMode = job.mode ?? 'quick';
  const maxPages = job.maxPages ?? (mode === 'quick' ? 10 : 100);
  const navTimeout = opts.navigationTimeoutMs ?? 30_000;
  const vantageRegion = opts.vantageRegion ?? process.env.AWS_REGION ?? 'local';
  const progress = opts.onProgress ?? (() => undefined);

  progress({ phase: 'validating', done: 0, total: 1, url: job.url });
  const entry = await guardUrl(job.url, { requireGovAu: job.requireGovAu ?? true });
  const origin = entry.origin;
  const host = entry.hostname;
  const siteId = job.siteId ?? deriveSiteId(host);

  const robots = await fetchRobots(origin, USER_AGENT);
  const minInterval = Math.max(
    opts.minRequestIntervalMs ?? 1000,
    (robots.facts.crawl_delay_s ?? 0) * 1000,
  );

  if (!robots.isAllowed(entry.pathname)) {
    throw new Error(
      `robots.txt on ${host} disallows crawling ${entry.pathname}. The scanner honours robots.txt, so this page cannot be assessed.`,
    );
  }

  progress({ phase: 'discovering', done: 0, total: 1 });

  const browser = await chromium.launch({
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu', ...(opts.extraLaunchArgs ?? [])],
    ...(opts.executablePath ? { executablePath: opts.executablePath } : {}),
  });

  const context: BrowserContext = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 900 },
    locale: 'en-AU',
    timezoneId: 'Australia/Sydney',
    serviceWorkers: 'block',
  });

  const pages: PageEvidence[] = [];
  const skipped: { url: string; reason: string }[] = [];

  try {
    await context.addInitScript(() => {
      const g = globalThis as unknown as Record<string, unknown>;
      if (typeof g['__name'] !== 'function') g['__name'] = (fn: unknown) => fn;
    });

    await context.route('**/*', async (route) => {
      const req = route.request();
      if (req.method() !== 'GET') {
        await route.abort();
        return;
      }
      await route.continue();
    });

    const page = await context.newPage();
    page.on('dialog', (d) => void d.dismiss().catch(() => undefined));
    page.setDefaultNavigationTimeout(navTimeout);

    const rootUrl = new URL('/', origin).href;
    const visitQueue: string[] = [entry.href];
    const seen = new Set<string>([entry.href]);
    if (rootUrl !== entry.href && robots.isAllowed('/')) {
      visitQueue.push(rootUrl);
      seen.add(rootUrl);
    }
    let discoveredFromEntry = false;

    while (visitQueue.length > 0 && pages.length < maxPages) {
      const url = visitQueue.shift();
      if (!url) break;

      progress({ phase: 'crawling', done: pages.length, total: maxPages, url });

      const thirdParty = new Set<string>();
      let consoleErrors = 0;

      const onRequest = (req: { url: () => string }) => {
        try {
          const h = new URL(req.url()).hostname;
          if (normaliseHost(h) !== normaliseHost(host)) thirdParty.add(h);
        } catch {
          /* ignore unparseable request urls */
        }
      };
      const onConsole = (msg: { type: () => string }) => {
        if (msg.type() === 'error') consoleErrors++;
      };

      page.on('request', onRequest);
      page.on('console', onConsole);

      let response: Response | null = null;
      try {
        response = await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(600);
      } catch (err) {
        page.off('request', onRequest);
        page.off('console', onConsole);
        skipped.push({
          url,
          reason: `navigation failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        await sleep(minInterval);
        continue;
      }

      const status = response?.status() ?? 0;
      const headers = response?.headers() ?? {};
      const finalUrl = page.url();
      const contentType = headers['content-type'] ?? null;

      let html = '';
      try {
        html = (await page.content()).slice(0, 400_000);
      } catch {
        html = '';
      }

      let factsError: string | null = null;
      const facts = await page.evaluate(collectFacts).catch((err: unknown) => {
        factsError = err instanceof Error ? err.message : String(err);
        return null;
      });

      const transfer = await page
        .evaluate(() => {
          const nav = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
          const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
          const n = nav[0];
          return {
            bytes:
              (n?.transferSize ?? 0) + res.reduce((s, r) => s + (r.transferSize ?? 0), 0),
            ttfb: n ? Math.round(n.responseStart) : 0,
            dcl: n ? Math.round(n.domContentLoadedEventEnd) : 0,
            load: n ? Math.round(n.loadEventEnd) : 0,
          };
        })
        .catch(() => ({ bytes: 0, ttfb: 0, dcl: 0, load: 0 }));

      page.off('request', onRequest);
      page.off('console', onConsole);

      if (!facts) {
        skipped.push({ url, reason: `page facts could not be collected: ${factsError ?? 'unknown error'}` });
        await sleep(minInterval);
        continue;
      }

      let sameHost = true;
      try {
        sameHost = normaliseHost(new URL(finalUrl).hostname) === normaliseHost(host);
      } catch {
        sameHost = false;
      }

      const integrity = assessIntegrity(
        status,
        contentType,
        facts.dom.title,
        html,
        facts.mainWordCount,
        sameHost,
      );

      const axe = integrity.ok
        ? await runAxe(page)
        : { violations: [], incompleteCount: 0, passCount: 0 };

      const isEntry = pages.length === 0;
      const viewports = isEntry && integrity.ok ? await measureViewports(page, [320, 768]) : [];

      pages.push({
        page_id: pageId(finalUrl),
        url,
        final_url: finalUrl,
        status,
        redirect_chain: [],
        headers,
        content_type: contentType,
        bytes: transfer.bytes,
        timing: {
          ttfb_ms: transfer.ttfb,
          dom_content_loaded_ms: transfer.dcl,
          load_ms: transfer.load,
        },
        html,
        main_text: facts.mainText,
        main_word_count: facts.mainWordCount,
        dom: facts.dom,
        css: facts.css,
        axe,
        viewports,
        third_party_hosts: [...thirdParty].sort(),
        console_errors: consoleErrors,
        integrity,
      });

      if (!discoveredFromEntry) {
        discoveredFromEntry = true;
        const navLinks = facts.dom.links
          .map((l) => {
            try {
              return new URL(l.href, finalUrl).href;
            } catch {
              return null;
            }
          })
          .filter((u): u is string => !!u)
          .filter((u) => isSafeCrawlTarget(u, origin))
          .filter((u) => robots.isAllowed(new URL(u).pathname));

        const sitemapLinks = await extractSitemapUrls(robots.facts.sitemaps, origin, 200);
        const candidates = [...navLinks, ...sitemapLinks.filter((u) => robots.isAllowed(new URL(u).pathname))];

        for (const c of candidates) {
          const normalised = c.split('#')[0] ?? c;
          if (seen.has(normalised)) continue;
          seen.add(normalised);
          visitQueue.push(normalised);
          if (visitQueue.length >= maxPages * 3) break;
        }
      }

      await sleep(minInterval);
    }

    progress({ phase: 'site-checks', done: 0, total: 4 });

    const entryEvidence = pages[0];
    const cookies = await context.cookies().catch(() => []);
    const [httpsRedirect, securityTxt, sitemapUrls, crux] = await Promise.all([
      checkHttpsRedirect(host),
      checkSecurityTxt(origin),
      extractSitemapUrls(robots.facts.sitemaps, origin, 1),
      fetchCrux(origin, opts.cruxApiKey),
    ]);

    const linkPool = [
      ...new Set(
        pages
          .filter((p) => p.integrity.ok)
          .flatMap((p) =>
            p.dom.links
              .map((l) => {
                try {
                  return new URL(l.href, p.final_url).href;
                } catch {
                  return null;
                }
              })
              .filter((u): u is string => !!u)
              .filter((u) => /^https?:/.test(u))
              .filter((u) => !/\/(?:logout|signout|delete|unsubscribe|cancel|payment|checkout)(?:\/|$)/i.test(u)),
          ),
      ),
    ];

    const sampleSize = mode === 'quick' ? 20 : 80;
    const linkSample = linkPool.slice(0, sampleSize);
    const linkCheck = await checkLinks(linkSample);

    const wantedHeaders = [
      'strict-transport-security',
      'content-security-policy',
      'x-content-type-options',
      'referrer-policy',
      'x-frame-options',
      'permissions-policy',
    ];
    const securityHeaders: Record<string, string | null> = {};
    for (const h of wantedHeaders) {
      securityHeaders[h] = entryEvidence?.headers[h] ?? null;
    }

    progress({ phase: 'sealing', done: 0, total: 1 });

    const version = {
      collector: COLLECTOR_VERSION,
      playwright: chromium.name?.() ?? 'chromium',
      chromium: (await context.browser()?.version()) ?? 'unknown',
      axe_core: AXE_TAGS.join(','),
      extractor: EXTRACTOR_VERSION,
      sampling_policy_version: SAMPLING_POLICY_VERSION,
      vantage_region: vantageRegion,
    };

    const site = {
      site_id: siteId,
      origin,
      entry_url: entry.href,
      robots: robots.facts,
      https_redirect: httpsRedirect,
      security_headers: securityHeaders,
      cookie_flags: {
        total: cookies.length,
        insecure: cookies.filter((c) => !c.secure).length,
        noHttpOnly: cookies.filter((c) => !c.httpOnly).length,
        noSameSite: cookies.filter((c) => !c.sameSite || c.sameSite === 'None').length,
      },
      security_txt: securityTxt,
      sitemap_found: sitemapUrls.length > 0,
      crux,
      link_check: linkCheck,
    };

    const body = { schema: 'dxp.evidence/1' as const, mode, version, site, pages, skipped };

    return {
      bundle_id: sha256(body),
      collected_at: new Date().toISOString(),
      ...body,
    };
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
