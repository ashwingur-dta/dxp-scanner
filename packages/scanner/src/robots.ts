import type { RobotsFacts } from '@dxp/schema';

export interface Robots {
  facts: RobotsFacts;
  isAllowed: (pathname: string) => boolean;
}

interface Group {
  agents: string[];
  allow: string[];
  disallow: string[];
  crawlDelay: number | null;
}

function patternToRegex(pattern: string): RegExp {
  let out = '^';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i] ?? '';
    if (ch === '*') out += '.*';
    else if (ch === '$' && i === pattern.length - 1) out += '$';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(out);
}

function matchLength(rules: string[], pathname: string): number {
  let best = -1;
  for (const r of rules) {
    if (r === '') continue;
    try {
      if (patternToRegex(r).test(pathname)) best = Math.max(best, r.length);
    } catch {
      continue;
    }
  }
  return best;
}

export function parseRobots(content: string, userAgent: string): Omit<Robots, 'facts'> & { crawlDelay: number | null; sitemaps: string[] } {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;

    if (field === 'sitemap') {
      sitemaps.push(value);
      continue;
    }
    if (!current) continue;
    if (field === 'allow') current.allow.push(value);
    else if (field === 'disallow') current.disallow.push(value);
    else if (field === 'crawl-delay') {
      const n = Number(value);
      if (Number.isFinite(n)) current.crawlDelay = n;
    }
  }

  const ua = userAgent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && ua.includes(a)));
  const wildcard = groups.filter((g) => g.agents.includes('*'));
  const applicable = specific.length > 0 ? specific : wildcard;

  const allow = applicable.flatMap((g) => g.allow);
  const disallow = applicable.flatMap((g) => g.disallow);
  const crawlDelay = applicable.reduce<number | null>(
    (acc, g) => (g.crawlDelay === null ? acc : Math.max(acc ?? 0, g.crawlDelay)),
    null,
  );

  return {
    crawlDelay,
    sitemaps,
    isAllowed: (pathname: string) => {
      const a = matchLength(allow, pathname);
      const d = matchLength(disallow, pathname);
      if (d === -1) return true;
      return a >= d;
    },
  };
}

export async function fetchRobots(origin: string, userAgent: string, timeoutMs = 10_000): Promise<Robots> {
  const url = new URL('/robots.txt', origin).href;
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': userAgent },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });

    if (!res.ok) {
      return {
        facts: { fetched: true, status: res.status, content: null, crawl_delay_s: null, sitemaps: [] },
        isAllowed: () => true,
      };
    }

    const content = (await res.text()).slice(0, 200_000);
    const parsed = parseRobots(content, userAgent);
    return {
      facts: {
        fetched: true,
        status: res.status,
        content,
        crawl_delay_s: parsed.crawlDelay,
        sitemaps: parsed.sitemaps,
      },
      isAllowed: parsed.isAllowed,
    };
  } catch {
    return {
      facts: { fetched: false, status: null, content: null, crawl_delay_s: null, sitemaps: [] },
      isAllowed: () => true,
    };
  }
}
