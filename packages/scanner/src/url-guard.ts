import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type GuardFailure =
  | 'unparseable'
  | 'bad_scheme'
  | 'userinfo_present'
  | 'not_gov_au'
  | 'punycode_host'
  | 'ip_literal'
  | 'dns_failure'
  | 'private_address'
  | 'denylisted_path';

export class UrlRejected extends Error {
  constructor(
    readonly reason: GuardFailure,
    message: string,
  ) {
    super(message);
    this.name = 'UrlRejected';
  }
}

const DENYLISTED_PATH =
  /\/(?:logout|log-out|signout|sign-out|delete|remove|unsubscribe|cancel|payment|checkout|pay|auth|oauth|admin|wp-admin)(?:\/|$)/i;
const DENYLISTED_QUERY = /(?:^|[?&])(?:action|do|cmd|op)=/i;

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);

  if (v === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b] = [parts[0] ?? 0, parts[1] ?? 0];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 192 && b === 0) return true;
    if (a >= 224) return true;
    return false;
  }

  if (v === 6) {
    const ip6 = ip.toLowerCase().replace(/^\[|\]$/g, '');
    if (ip6 === '::' || ip6 === '::1') return true;
    if (ip6.startsWith('fe80') || ip6.startsWith('fec0')) return true;
    if (/^f[cd]/.test(ip6)) return true;
    if (ip6.startsWith('ff')) return true;
    if (ip6.startsWith('2001:db8')) return true;
    const mapped = ip6.match(/^(?:::ffff:|::)([0-9.]+)$/);
    if (mapped?.[1] && isIP(mapped[1]) === 4) return isPrivateAddress(mapped[1]);
    const mappedHex = ip6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex?.[1] && mappedHex[2]) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      const dotted = `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
      return isPrivateAddress(dotted);
    }
    return false;
  }

  return true;
}

export function normaliseHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '');
}

export function isGovAu(hostname: string): boolean {
  return normaliseHost(hostname).endsWith('.gov.au');
}

export interface GuardOptions {
  requireGovAu?: boolean;
  resolveDns?: boolean;
}

export async function guardUrl(input: string, opts: GuardOptions = {}): Promise<URL> {
  const { requireGovAu = true, resolveDns = true } = opts;

  const raw = input.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new UrlRejected('unparseable', `Not a valid URL: ${input}`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new UrlRejected('bad_scheme', `Only http and https are supported, got ${url.protocol}`);
  }

  if (url.username || url.password) {
    throw new UrlRejected(
      'userinfo_present',
      'URLs containing credentials are rejected, because the part before @ can disguise the real host.',
    );
  }

  const host = normaliseHost(url.hostname);

  if (isIP(host) !== 0 || /^\[/.test(url.hostname)) {
    throw new UrlRejected('ip_literal', 'Bare IP addresses are not accepted; supply a gov.au hostname.');
  }

  if (host.startsWith('xn--') || host.includes('.xn--')) {
    throw new UrlRejected(
      'punycode_host',
      'Internationalised (punycode) hostnames are rejected, because they can mimic a legitimate domain.',
    );
  }

  if (requireGovAu && !isGovAu(host)) {
    throw new UrlRejected(
      'not_gov_au',
      `Only Australian government sites can be assessed. "${host}" is not under gov.au.`,
    );
  }

  if (DENYLISTED_PATH.test(url.pathname) || DENYLISTED_QUERY.test(url.search)) {
    throw new UrlRejected(
      'denylisted_path',
      'That URL looks like it performs an action (such as signing out or making a payment) rather than showing a page.',
    );
  }

  if (resolveDns) {
    let addresses: { address: string }[];
    try {
      addresses = await lookup(host, { all: true });
    } catch {
      throw new UrlRejected('dns_failure', `Could not resolve ${host}.`);
    }
    if (addresses.length === 0) {
      throw new UrlRejected('dns_failure', `Could not resolve ${host}.`);
    }
    for (const a of addresses) {
      if (isPrivateAddress(a.address)) {
        throw new UrlRejected(
          'private_address',
          `${host} resolves to a non-public address (${a.address}).`,
        );
      }
    }
  }

  url.protocol = 'https:';
  url.hash = '';
  return url;
}

export function isSafeCrawlTarget(href: string, origin: string): boolean {
  let u: URL;
  try {
    u = new URL(href, origin);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (normaliseHost(u.hostname) !== normaliseHost(new URL(origin).hostname)) return false;
  if (DENYLISTED_PATH.test(u.pathname) || DENYLISTED_QUERY.test(u.search)) return false;
  if (/\.(?:pdf|docx?|xlsx?|pptx?|zip|csv|jpg|jpeg|png|gif|svg|mp4|mp3|webm)$/i.test(u.pathname))
    return false;
  return true;
}
