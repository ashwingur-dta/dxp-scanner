# dxp-scanner

Assess Australian government websites against the [Digital Experience Policy](https://www.digital.gov.au/policy/digital-experience) — 4 standards, 25 criteria — from the outside, with every result traceable to captured evidence and to verbatim policy wording.

> ### This is not an official assessment
>
> An independent, experimental tool. **Not affiliated with or endorsed by the Digital Transformation Agency.** It does not determine compliance with the Digital Experience Policy. Results are indicative, derived from automated external observation of public web pages.
>
> If you operate a site assessed here and want a correction or an exclusion, please open an issue.

## Why this exists

The Digital Experience Policy is mandatory, and as of 2026 it applies to **existing** public-facing services (Service Standard from 1 July 2025; Inclusion and Access from 1 January 2026). But compliance is self-reported to the DTA through internal instruments — the Digital Investment Overview data collection form and the Digital Capability Assessment Process template — neither of which is visible outside government. There is no external, repeatable, evidence-based view of whether government websites meet the standards they are bound by.

This produces one, while being honest about the limits of doing so from outside.

## Three findings that shape the whole design

**1. The policy states almost no numeric thresholds.** Verified by searching all 25 criterion pages: there is no WCAG version or conformance level (the wording is "the *latest version* of the Web Content Accessibility Guidelines"), no uptime percentage, no reading age, and no mandated published pages.

So **most thresholds in this tool are the tool's own invention.** Every check records `threshold.source` as either `policy` or `tool`, and every report discloses the split. An undisclosed invented threshold is indistinguishable from an arbitrary one.

**2. The policy is process guidance, not a product specification.** Externally we observe *outcomes*, never compliance. Results are worded as "evidence consistent with" or "evidence absent", not "criterion met" — except for the two criteria that genuinely are fully observable.

**3. Six of the 25 criteria cannot be assessed from outside at all** — Service Standard 1, 2 and 8; Access Standard 4 and 5; Performance Standard 5. Each is reported as *not externally assessable* and carries a question to put to the agency. Producing a number for them would be fabrication.

See [docs/criteria-triage.md](docs/criteria-triage.md) for the criterion-by-criterion analysis this is built on.

## What it checks well

The two criteria with the hardest policy edge, where the policy supplies the rule rather than us:

- **Performance Standard Criterion 4** — "customer feedback channels should be available on **each page** and at the end of a digital transaction", with a recommended thumbs up/down plus free-text mechanism. A per-page presence check, so it yields an exact coverage percentage and a list of failing URLs.
- **Performance Standard Criterion 2** — names uptime, error rate, load time, fully loaded time and **percentage of valid links** verbatim, and explicitly endorses measuring "from an inside and outside perspective".

Then accessibility (axe-core across WCAG 2.2 AA tags, plus heading structure, link text, alt text, zoom blocking and target size), plain language (readability on extracted main content only), flexibility (reflow at 320px, colour scheme and reduced-motion preferences), assisted pathways (TIS National `131 450`, National Relay Service `133 677`, in-language options, Easy Read, quick exit), reuse of whole-of-government platforms, and a stated-privacy-versus-observed-tracking comparison.

## Deliberate limits

- **Automated accessibility testing covers roughly a third of WCAG success criteria.** A pass means "no machine-detectable violations", never "WCAG conformant". Items axe cannot decide are reported as `needs_review`, not quietly passed.
- **The scanner never submits a form.** A Playwright route handler aborts every non-GET request, so creating a record on a live government service is impossible by construction rather than by convention. Checks needing form submission are therefore out of scope, not merely unimplemented.
- **Core Web Vitals come from the Chrome UX Report**, not a lab run. The scanner may run outside Australia, and a lab measurement of an Australian service from elsewhere would report ~200 ms of network distance as a fault of the service. Where CrUX has no data, performance is `not_collected` rather than estimated.
- **Pages that fail collection integrity are excluded, never failed.** A bot-protection interstitial is Cloudflare's HTML, not the agency's, and scoring it would misattribute the result.
- **The policy applies to services, not domains.** Each report declares what was treated as the service.
- The Performance Standard publishes **no commencement date for existing public-facing services**, so a site assessed against it may not yet be formally in scope. Reports say so.

## Usage

```bash
npm install          # also downloads Chromium
npm run scan -- https://www.digital.gov.au/policy/digital-experience
```

Options:

| Flag | Effect |
| --- | --- |
| `--pages <n>` | Page budget (quick scan defaults to 10) |
| `--full` | Full assessment, 100 pages |
| `--out <dir>` | Output directory (default `out/`) |
| `--no-pdf` | Skip PDF generation |
| `--any-host` | Allow a non-`gov.au` host locally |
| `--rubric` | Print the rubric as JSON and exit |

Writes an evidence bundle, a scorecard, an HTML report and a PDF.

Set `CRUX_API_KEY` to enable Core Web Vitals. Without it, performance checks report as not collected.

```bash
npm test            # includes the SSRF guard suite
npm run typecheck
```

## How it is built

**Evidence and judgement are separated.** The scanner writes a sealed, content-addressed evidence bundle; checks are pure functions over that bundle and never touch the network. This exists because of finding 1: our thresholds will be revised, and re-scoring stored evidence must never require re-crawling government websites.

```
packages/schema     the evidence bundle contract
packages/scanner    crawl, collect, seal  (Playwright + axe-core)
packages/checks     the check registry, pure functions, scoring and rollup
packages/report     HTML report and PDF
packages/cli        local entry point
```

**Coverage is disclosed structurally, not editorially.** Every finding carries one of `pass`, `fail`, `needs_review`, `not_collected` or `not_assessable` plus a coverage figure, and no score is emitted without the denominator that produced it. Keeping those five states distinct is the whole honesty story; collapsing them into pass/fail is how scanners end up publishing verdicts on challenge pages.

## Safety

The public-facing version accepts only `gov.au` hostnames, which closes most of the server-side request forgery surface and matches the tool's purpose. DNS is resolved and checked against private, loopback, link-local (including the cloud metadata endpoint `169.254.169.254`), CGNAT and IPv6 equivalents before any fetch. Credentials in URLs, punycode hosts, bare IPs and action-like paths (`/logout`, `/payment`, `?action=`) are rejected. `robots.txt` is fetched, honoured and persisted into the evidence bundle so the politeness decision stays auditable. Requests are rate-limited per domain with an identifying User-Agent.

See `packages/scanner/test/url-guard.test.ts` for the regression suite covering these.

## Licence

MIT — see [LICENSE](LICENSE).
