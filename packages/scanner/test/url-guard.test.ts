import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  UrlRejected,
  guardUrl,
  isGovAu,
  isPrivateAddress,
  isSafeCrawlTarget,
} from '../src/url-guard.js';

async function expectReject(input: string, reason: string): Promise<void> {
  await assert.rejects(
    () => guardUrl(input, { resolveDns: false }),
    (err: unknown) => {
      assert.ok(err instanceof UrlRejected, `expected UrlRejected for ${input}, got ${String(err)}`);
      assert.equal(err.reason, reason, `${input}: expected ${reason}, got ${err.reason}`);
      return true;
    },
  );
}

describe('isPrivateAddress', () => {
  const privateAddresses = [
    '169.254.169.254',
    '127.0.0.1',
    '127.1.2.3',
    '10.0.0.1',
    '10.255.255.255',
    '192.168.1.1',
    '172.16.0.1',
    '172.31.255.255',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fd00::1',
    'fc00::1',
    'ff02::1',
    '::ffff:169.254.169.254',
    '::ffff:127.0.0.1',
    '::ffff:a9fe:a9fe',
  ];

  for (const ip of privateAddresses) {
    it(`rejects ${ip}`, () => {
      assert.equal(isPrivateAddress(ip), true, `${ip} should be treated as private`);
    });
  }

  const publicAddresses = ['8.8.8.8', '1.1.1.1', '103.6.85.1', '172.32.0.1', '172.15.0.1', '2404:6800::1'];
  for (const ip of publicAddresses) {
    it(`allows ${ip}`, () => {
      assert.equal(isPrivateAddress(ip), false, `${ip} should be treated as public`);
    });
  }
});

describe('isGovAu', () => {
  const allowed = ['www.health.gov.au', 'my.gov.au', 'DIGITAL.GOV.AU', 'a.b.c.gov.au', 'www.health.gov.au.'];
  for (const h of allowed) {
    it(`accepts ${h}`, () => assert.equal(isGovAu(h), true));
  }

  const blocked = [
    'evilgov.au',
    'notgov.au',
    'gov.au.evil.com',
    'health.gov.au.attacker.com',
    'health-gov.au',
    'govau',
    'example.com',
    'health.gov.uk',
  ];
  for (const h of blocked) {
    it(`rejects ${h}`, () => assert.equal(isGovAu(h), false));
  }
});

describe('guardUrl', () => {
  it('accepts a normal gov.au URL and upgrades it to https', async () => {
    const u = await guardUrl('http://www.digital.gov.au/policy', { resolveDns: false });
    assert.equal(u.protocol, 'https:');
    assert.equal(u.hostname, 'www.digital.gov.au');
  });

  it('accepts a bare hostname', async () => {
    const u = await guardUrl('digital.gov.au', { resolveDns: false });
    assert.equal(u.href, 'https://digital.gov.au/');
  });

  it('strips the fragment', async () => {
    const u = await guardUrl('https://digital.gov.au/a#section', { resolveDns: false });
    assert.equal(u.hash, '');
  });

  it('rejects the instance metadata endpoint', () => expectReject('http://169.254.169.254/', 'ip_literal'));
  it('rejects localhost', () => expectReject('http://localhost:8080/', 'not_gov_au'));
  it('rejects a loopback literal', () => expectReject('http://127.0.0.1/', 'ip_literal'));
  it('rejects a private range literal', () => expectReject('http://10.1.2.3/', 'ip_literal'));
  it('rejects an IPv6 literal', () => expectReject('http://[::1]/', 'ip_literal'));

  it('rejects a suffix-lookalike domain', () => expectReject('https://evilgov.au/', 'not_gov_au'));
  it('rejects gov.au as a prefix of another domain', () =>
    expectReject('https://gov.au.evil.com/', 'not_gov_au'));
  it('rejects gov.au as an infix', () =>
    expectReject('https://health.gov.au.attacker.com/', 'not_gov_au'));

  it('rejects credentials used to disguise the host', () =>
    expectReject('https://www.health.gov.au@evil.com/', 'userinfo_present'));

  it('rejects punycode hosts', () => expectReject('https://xn--80ak6aa92e.gov.au/', 'punycode_host'));

  it('rejects non-http schemes', () => expectReject('file:///etc/passwd', 'bad_scheme'));
  it('rejects gopher', () => expectReject('gopher://digital.gov.au/', 'bad_scheme'));

  it('rejects action-like paths', () => expectReject('https://my.gov.au/logout', 'denylisted_path'));
  it('rejects payment paths', () => expectReject('https://my.gov.au/payment/start', 'denylisted_path'));
  it('rejects action query parameters', () =>
    expectReject('https://my.gov.au/page?action=delete', 'denylisted_path'));

  it('allows a non-gov host only when explicitly permitted', async () => {
    const u = await guardUrl('https://example.com/', { requireGovAu: false, resolveDns: false });
    assert.equal(u.hostname, 'example.com');
  });
});

describe('isSafeCrawlTarget', () => {
  const origin = 'https://www.digital.gov.au';

  it('allows a same-host page', () =>
    assert.equal(isSafeCrawlTarget('/policy/digital-experience', origin), true));
  it('blocks a different host', () =>
    assert.equal(isSafeCrawlTarget('https://evil.com/x', origin), false));
  it('blocks a subdomain not matching the origin', () =>
    assert.equal(isSafeCrawlTarget('https://other.gov.au/x', origin), false));
  it('blocks mailto', () => assert.equal(isSafeCrawlTarget('mailto:a@b.gov.au', origin), false));
  it('blocks javascript URLs', () =>
    assert.equal(isSafeCrawlTarget('javascript:alert(1)', origin), false));
  it('blocks logout', () => assert.equal(isSafeCrawlTarget('/logout', origin), false));
  it('blocks binary documents', () => assert.equal(isSafeCrawlTarget('/form.pdf', origin), false));
});
