# What this scanner can and cannot reach

A large share of `gov.au` sites refuse automated clients outright. This page records that
honestly, because a compliance tool that quietly skips the sites it cannot read would give a
badly distorted picture of government as a whole.

## The finding

**Reachability depends on where the scanner runs.** Probed from an Australian network,
21 of 40 major `gov.au` sites accepted the scanner. Probed from `us-east-1`, where the
deployed service actually runs, fewer did — `ato.gov.au` and `aihw.gov.au` return HTTP 200
from Australia and HTTP 403 from AWS. Any coverage claim must therefore state the vantage
point it was measured from.

There is also a second gate. A site can answer a plain HTTP request and still fail to serve
pages to a browser: `asic.gov.au` and `nla.gov.au` both return 200 to `fetch` but no page
survives collection, so they cannot be scored.

### Scan-verified from us-east-1

A full scan completes and produces a score.

| Site | Score | Pages assessed |
| --- | --- | --- |
| `business.gov.au` | 78% | 10 |
| `www.rba.gov.au` | 73% | 6 |
| `www.aec.gov.au` | 70% | 9 |
| `my.gov.au` | 69% | 8 |
| `www.abs.gov.au` | 66% | 8 |

Scores are of externally assessable sub-requirements only, and are not comparable with each
other unless produced under the same sampling policy and rubric version.

### Reachable from us-east-1 but not yet scan-verified

`www.austrade.gov.au` · `www.legislation.gov.au` · `www.oaic.gov.au` · `www.apra.gov.au` ·
`treasury.gov.au` · `www.awm.gov.au` · `www.ga.gov.au` · `www.pmc.gov.au` ·
`www.homeaffairs.gov.au`

`www.homeaffairs.gov.au` answers but serves a 1.4 MB home page that does not finish loading
within the navigation budget. `asic.gov.au` and `www.nla.gov.au` answer but serve no usable
page to the browser.

### Refused outright from us-east-1

| Site | How it refuses |
| --- | --- |
| `www.servicesaustralia.gov.au` | connection accepted, request silently dropped |
| `www.digital.gov.au` | connection accepted, request silently dropped |
| `www.health.gov.au` | connection accepted, request silently dropped |
| `www.education.gov.au` | connection accepted, request silently dropped |
| `www.fairwork.gov.au` | connection accepted, request silently dropped |
| `www.tga.gov.au` | connection accepted, request silently dropped |
| `www.ato.gov.au` | HTTP 403 (but 200 from an Australian network) |
| `www.aihw.gov.au` | HTTP 403 (but 200 from an Australian network) |
| `www.ndis.gov.au` | HTTP 403 |
| `www.bom.gov.au` | HTTP 403 |
| `www.accc.gov.au` | HTTP 403 |
| `www.aph.gov.au` | HTTP 403 |

Also note `data.gov.au` **disallows crawling in `robots.txt`**. The scanner honours that and
declines to assess it. That is correct behaviour, not a failure.

## Why

The refusing sites sit behind a content delivery network with bot management. For example
both `www.digital.gov.au` and `www.servicesaustralia.gov.au` resolve to `akamaiedge.net`.

The refusal is **not** about the User-Agent alone. The TLS handshake completes normally —
TLS 1.3, valid certificate — and the connection is established. The HTTP request is then
dropped without a response. Bot managers of this kind score clients on TLS and HTTP
fingerprints, connection reputation and network origin, so a plainly-identified automated
client is rejected regardless of what it calls itself.

Evidence that this is network-level refusal and not a browser problem: plain Node `fetch`,
`curl` and the headless browser all fail against the same hosts, while all three succeed
against `abs.gov.au` from the same machine and the same AWS Lambda.

## What this project will not do about it

**We will not attempt to evade bot detection.** No TLS or browser fingerprint spoofing, no
impersonating a consumer browser, no residential proxies, no CAPTCHA solving. Those sites
are deliberately declining automated access, and working around that would make this tool
something other than what it claims to be.

That decision has a cost, and the cost is this page: the scanner can assess
roughly half of the sites people will want to point it at, and fewer than that from a
non-Australian network.

## What to do instead

**Allowlisting is the legitimate fix.** The scanner is built to make that possible:

- it identifies itself in every request as
  `DXP-Compliance-Scanner/0.1 (+https://github.com/ashwingur-dta/dxp-scanner)`
- it fetches and honours `robots.txt`, and stores the result in the evidence bundle so the
  politeness decision stays auditable
- it rate-limits itself to one request per second per domain
- it never issues a non-GET request, enforced by aborting them in the browser, so it cannot
  submit a form or create a record
- when deployed behind a NAT gateway it has a single stable egress IP that can be allowlisted

An agency, or whoever operates its CDN configuration, can allow that User-Agent or that IP
through bot management. Until then, those sites report "could not be assessed" rather than a
score.

**Run it yourself.** The command line tool is open source and runs from your own network:

```bash
npm run scan -- https://www.example.gov.au/some-page
```

## How a refusal is reported

A refused site is never given a score. Earlier revisions of this tool reported a 62%
score for `digital.gov.au` having read **zero** pages — the number came entirely from four
HTTP header checks against responses that did not exist. That is precisely the kind of
confident-looking nonsense an external scanner must not produce.

Now:

- the API probes reachability before queueing anything, so a refusal comes back in about a
  second with an explanation rather than after a two-minute crawl
- if a crawl does start and no page survives collection integrity, the job fails with the
  reason instead of scoring what little was collected
- pages that fail integrity individually, such as a bot-protection interstitial served with
  HTTP 200, are excluded from scoring and never counted as failures by the agency

## Consequence for the leaderboard

Any ranking built from this data must state which sites were unreachable. A leaderboard
drawn only from sites that permit scanning is, in effect, a ranking of agencies that do not
use aggressive bot management — which is not what it would appear to measure.
