import type { CruxFacts } from '@dxp/schema';

const ENDPOINT = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';

interface CruxMetric {
  percentiles?: { p75?: number | string };
}

interface CruxResponse {
  record?: {
    metrics?: Record<string, CruxMetric>;
  };
  error?: { message?: string };
}

function p75(metric: CruxMetric | undefined): number | undefined {
  const v = metric?.percentiles?.p75;
  if (v === undefined) return undefined;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : undefined;
}

export async function fetchCrux(origin: string, apiKey = process.env.CRUX_API_KEY): Promise<CruxFacts> {
  if (!apiKey) {
    return {
      available: false,
      reason:
        'no CRUX_API_KEY configured. Field data is the only measurement of real-user performance this tool trusts, so performance is reported as not collected rather than substituted with a lab measurement taken outside Australia',
    };
  }

  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ origin, formFactor: 'PHONE' }),
      signal: AbortSignal.timeout(15_000),
    });

    const body = (await res.json()) as CruxResponse;

    if (res.status === 404) {
      return {
        available: false,
        reason: 'the Chrome UX Report holds no data for this origin, which usually means insufficient traffic',
      };
    }
    if (!res.ok) {
      return { available: false, reason: body.error?.message ?? `CrUX API returned HTTP ${res.status}` };
    }

    const m = body.record?.metrics ?? {};
    const lcp = p75(m['largest_contentful_paint']);
    const inp = p75(m['interaction_to_next_paint']);
    const cls = p75(m['cumulative_layout_shift']);

    if (lcp === undefined && inp === undefined && cls === undefined) {
      return { available: false, reason: 'the Chrome UX Report returned no Core Web Vitals for this origin' };
    }

    return {
      available: true,
      ...(lcp !== undefined ? { lcp_p75_ms: lcp } : {}),
      ...(inp !== undefined ? { inp_p75_ms: inp } : {}),
      ...(cls !== undefined ? { cls_p75: cls } : {}),
    };
  } catch (err) {
    return {
      available: false,
      reason: `could not reach the Chrome UX Report API (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}
