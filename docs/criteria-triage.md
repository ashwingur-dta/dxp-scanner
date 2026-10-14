# Digital Experience Policy — criteria triage for an external website scanner

Source: https://www.digital.gov.au/policy/digital-experience (25 criteria across 4 standards,
scraped 2026-10-14, plus the checklists, "services covered", "measuring success" and
compliance/exemption pages).

Assumed evaluator capability: outside observer. Can crawl public pages, read HTML/CSS/JS,
run axe-core/Lighthouse, probe HTTP, measure readability, and use an LLM to judge page
content. Cannot see user research, business cases, DIO/DCAP submissions, or agency analytics.

---

## 1. Headline findings

**The policy is process guidance, not a product conformance spec.** Every one of the 25
criterion pages has the same shape — purpose, "your responsibilities", when to apply it
across Discovery/Alpha/Beta/Live, suggested activities — and nearly every one ends with a
"Document your findings" block pointing at the **Digital Investment Overview (DIO) Data
Collection form** and the **Digital Capability Assessment Process (DCAP) template**. Both
are internal. That is the single biggest limiter on external scoring, and it should be
stated in the tool's output rather than papered over.

**The policy states almost no numeric thresholds.** Verified by grep across the whole
corpus:

| Thing you might expect | What the policy actually says |
| --- | --- |
| WCAG version and level | "the **latest version** of the Web Content Accessibility Guidelines (WCAG)" — no version, no A/AA/AAA |
| Reading age / grade level | nothing; defers to the Australian Government Style Manual |
| Uptime target | nothing; uptime is named as the *minimum measure*, no percentage |
| Reporting cadence | keyed to IOF states, not calendar periods |
| Required published pages | none named — no mandated accessibility statement, privacy page or complaints page |

Consequence: **every threshold the tool uses is the tool's own invention and must be
labelled as such.** "WCAG 2.2 AA" is a defensible reading of "latest version" + "meets or
exceeds current requirements for the Australian Government", but it is an interpretation,
not a quote.

**Scope is by service, not by domain.** The standards apply to informational,
transactional and staff-facing services inside the Investment Oversight Framework. A
domain crawl is not the unit of assessment, so the tool must declare what it treated as
"the service".

**Commencement dates (these matter for what you can fairly judge):**

| Standard | New/replacement public-facing | Existing public-facing |
| --- | --- | --- |
| Digital Service | 1 Jul 2024 | 1 Jul 2025 |
| Digital Inclusion | 1 Jan 2025 | 1 Jan 2026 |
| Digital Access | 1 Jan 2025 (myGov-suitable) | 1 Jan 2026 |
| Digital Performance | 1 Jan 2025 | **no date published** |

So Service, Inclusion and Access are all in force for existing public-facing services as
of today. Performance has no published phase-2 date — scanning an existing site against it
scores something not yet formally in scope, and the report should say so.

---

## 2. Triage of all 25 criteria

Verdicts: **A** = mechanically automatable · **L** = LLM-judgeable from public pages ·
**P** = partial, some sub-requirements need internal evidence · **N** = not externally
observable.

### Digital Service Standard (10)

| # | Criterion | Verdict | Note |
| --- | --- | --- | --- |
| 1 | Have a clear intent | **N** | Intent, scope, benefits definition — all pre-build artefacts |
| 2 | Know your user | **N** | ~5% proxies only; user research is invisible |
| 3 | Leave no one behind | **P** (high) | ★ Best DSS target: WCAG, plain language, alt formats, multilingual, non-digital pathways, bandwidth |
| 4 | Connect services | **P** | Digital ID/myGov integration, published APIs, life-event signposting, form burden |
| 5 | Build trust in design | **P** | TLS/headers, privacy + consent surfaces, error UX, vulnerability reporting |
| 6 | Don't reinvent the wheel | **P** | Observable *outcome* of reuse: design system, common platforms |
| 7 | Do no harm | **P** | ★ Privacy notice vs **actual** tracker behaviour is a genuine conformance test |
| 8 | Innovate with purpose | **N** | Innovation governance; nothing public |
| 9 | Monitor your service | **P** | Delegates to the Performance Standard; detect instrumentation + published results |
| 10 | Keep it relevant | **P** | Content freshness/decay, broken links, "you said / we did" content |

### Digital Inclusion Standard (5) — richest source of checks

| # | Criterion | Verdict | Note |
| --- | --- | --- | --- |
| 1 | Embrace diversity | **P** | ★ Cohort output features: in-language options **on the front page**, Auslan, audio formats, quick-exit button, save-and-resume, up-front document checklists, person-first language, heading tagging, SEO |
| 2 | Motivate digital use | **P** (weak, mostly L) | Benefit/time-saving messaging, tiered help content, findability; uptake baseline is internal |
| 3 | Protect users | **P** | ★ Privacy/consent UI, contact-channel variety, scam + eSafety content, community guidelines, security headers, DMARC/SPF |
| 4 | Make it accessible | **P**, core **A** | ★★ Highest-value block. WCAG machine checks + Style Manual content checks + alt/link quality + media alternatives + document accessibility |
| 5 | Provide flexibility and choice | **P**, front half **A** | ★★ Responsive matrix, dark mode/`prefers-color-scheme`, font-size & contrast controls, `prefers-reduced-motion`, save/auto-save, time limits, step structure, non-digital signposting |

### Digital Access Standard (5) — mostly governance

| # | Criterion | Verdict | Note |
| --- | --- | --- | --- |
| 1 | Understand how your users access services | **P** | Which access point the service lives at, entry-point duplication, discoverability. Note: the criterion states **no** mobile/responsive requirement |
| 2 | Define your service offering | **P** (weak) | Realised capability inventory; familiar vs bespoke auth/payments; links to complementary services |
| 3 | Use the AGA to find reusable platforms | **P** | ★ Reuse fingerprinting is strongly detectable — see §3 |
| 4 | Follow the decision-making framework | **N** | Purely internal. **Absence from myGov is explicitly permitted** by the second framework, so it is not a non-compliance signal. Do not invent a check |
| 5 | Engage with delivery partners | **N** | MOUs, SLAs, agile ceremonies. Only edge: a *working* integration implies onboarding happened — score that under DAS C3, don't double-count |

### Digital Performance Standard (5)

| # | Criterion | Verdict | Note |
| --- | --- | --- | --- |
| 1 | Implement a monitoring framework | **P** (weak) | Analytics/RUM present and site-wide; published KPI artefacts |
| 2 | Measure the availability of your digital service | **A** | ★★ All five named KPIs are externally measurable, and the policy itself endorses outside-in synthetic monitoring |
| 3 | Measure the success of your digital service | **P** | Event/funnel + session instrumentation, end-to-end online completability, CES prompt. The metric *values* are internal |
| 4 | Measure if your digital service is meeting customer needs | **A** | ★★ The most concrete mandated artefact in the entire policy — see §3 |
| 5 | Analyse and report your digital performance | **N** | Reports to DTA via IOF/Approved Programs Collection. Public dashboards are *voluntary* — report as bonus context, never penalise absence |

**Totals: 2 fully automatable · 17 partial · 6 not externally observable.**

---

## 3. The scoreable core — checks with a hard policy edge

These are the checks where the policy text itself, not an inference, supplies the rule.
Build these first.

### 3.1 Per-page feedback channel (DPS C4) — the strongest single check

> "At a minimum, customer feedback channels should be available on **each page** and at the
> end of a digital transaction."

> "The DTA recommend a simple **thumbs up/down sentiment tool on each page** of the digital
> service that is followed up by a **free text feedback dialogue**."

This is a per-page presence check, so it yields a clean coverage percentage
(`pages_with_feedback / pages_crawled`) plus a named list of pages missing it. Gradeable
ladder: nothing → generic "contact us" only → some pages → every page → thumbs up/down +
free-text follow-up on every page **and** on confirmation pages.

Also check the control is keyboard-reachable, has an accessible name, isn't buried below
the footer, and doesn't demand name/email/CAPTCHA/login first ("minimise the burden").
A mailto: or complaints form alone should score non-compliant, not partial — the policy
wants a *rating* mechanism.

### 3.2 Availability KPIs (DPS C2) — named verbatim in policy

> "At a minimum you should monitor uptime, however other KPIs might include **error rate,
> load time, fully loaded time or percentage of valid links**."

All five are outside-measurable, and the policy explicitly endorses synthetic monitoring:
"monitoring them from an inside and outside perspective… consider other tools that simulate
real-world experiences from a user perspective."

- uptime: repeated multi-region probes, status-code distribution, DNS/TLS failures
- error rate: 4xx/5xx across crawl, soft-404s, failed subresources, console errors
- load time / fully loaded time: TTFB/FCP/LCP and `loadEventEnd`; Lighthouse; CrUX field data
- **percentage of valid links**: full-site link crawl — the policy's own example of
  availability is a service that "has functional links"
- mobile under poor connectivity: throttled-3G Lighthouse, page weight, request count —
  the policy names "works on mobile devices in areas with unreliable internet speeds"
- plus: status/outage page, advance maintenance notice, CDN, HTTP/2-3, 503-not-hard-fail

### 3.3 Accessibility (DIS C4 / DSS C3)

axe-core across `wcag2a, wcag2aa, wcag21aa, wcag22aa, best-practice`, reported **by rule id
and impact**, with incomplete/needs-review counted separately. Add the WCAG 2.2 additions
that most tools miss: 2.4.11 focus not obscured, 2.5.7 dragging alternatives, 2.5.8 target
size ≥24×24px, **3.2.6 consistent help placement** (checkable only across a crawl — a nice
differentiator), 3.3.7 redundant entry, 3.3.8 accessible authentication.

Scripted Playwright layer: tab-order vs DOM order, focus traps, suppressed `:focus-visible`,
skip link first and functional, modal focus return. Reflow at 320px, 400% zoom, WCAG 1.4.12
text-spacing overrides, `user-scalable=no` / `maximum-scale<2` as a hard fail.

**Report "no machine-detectable violations", never "WCAG conformant"** — automation covers
roughly a third of success criteria.

### 3.4 Plain language / Style Manual (DIS C4, named explicitly)

Flesch-Kincaid, Gunning Fog, sentence length distribution, passive ratio, undefined acronym
first-use, nominalisations — computed on **main content only**, boilerplate stripped. Plus
mechanical Style Manual checks: sentence-case headings, `14 October 2026` date format, no
ALL-CAPS body text, no justified text, list markup, table `<th>`/`scope`/`<caption>`.
Flag clearly that no reading-age number appears in the policy.

### 3.5 Reuse fingerprinting (DAS C3, DSS C6)

- **Identity**: myGov (`my.gov.au`), myGovID/myID, Digital ID / AGDIS, RAM
  (`authorisationmanager.gov.au`), PRODA, VANguard. Negative: bespoke `/login` with no
  WofG IdP option, or a commercial IdP as the only choice.
- **Design system**: AGDS / GOLD (`design-system.gov.au`, `@ag.ds-*`, `au-`/`gold-` class
  prefixes), Coat of Arms + standard masthead lockup.
- **Platforms**: GovCMS (Drupal fingerprints), Notify, Pay, Tell Us Once, ABR/ABN Lookup
  APIs, api.gov.au listing, WofG analytics.
- **Domain hygiene**: on `*.gov.au`; count of distinct entry-point domains per agency as a
  duplication proxy; legacy URLs returning 200 instead of 301 after a replacement launched.

### 3.6 Non-digital and assisted pathways (DSS C3, DIS C1/C5)

Concrete and highly diagnostic: phone number (13/1300/1800), postal address, service-centre
locator, **National Relay Service** (`133 677`), **TIS National** (`131 450`), interpreter
references, Auslan video, downloadable/printable equivalent, Easy Read version, language
selector reachable **from the homepage** with a count of languages offered. Detecting a
Google Translate widget is a good *negative* signal against "make sure translations are
accurate".

### 3.7 Quick exit (DIS C1, family and domestic violence cohort)

> "Support 'quick exit': Consider the use of 'quick exit' buttons within your digital
> service to help re-direct users to other digital pages if they are in an unsafe
> environment."

Detect text/`aria-label` matching `quick exit|leave this site|hide this page|safe exit`,
whether it's sticky, Esc handler, history replacement, and an accompanying 1800RESPECT
referral.

### 3.8 Stated privacy policy vs observed behaviour (DSS C7, DIS C3)

The one place the tool can catch a real contradiction rather than a missing feature: load
pages with a clean profile, record which third-party trackers and cookies fire **before**
consent, then compare against what the privacy notice claims. Also check "reject all" has
equal prominence to "accept all", and that granular opt-out exists.

---

## 4. Design rules the tool must follow to stay honest

1. **Score at sub-requirement level, roll up with coverage disclosed.** e.g. "DSS Criterion
   3: 14 of 21 sub-requirements externally assessable; 78% of assessable passed; 7 require
   agency attestation."
2. **Never say "criterion met"** from external evidence alone except for DPS C2 and C4. Use
   "evidence consistent with" / "evidence absent" / "not externally assessable".
3. **Return the 6 N-verdict criteria as "not externally assessable"** with a self-attestation
   questionnaire built from their "Document your findings" bullets — do not fabricate a
   number. The DTA's own *Checklist for independent assessors* is a ready-made template for
   this.
4. **Separate "the site is good" from "the agency monitors and reports".** A fast, reliable
   site with no feedback widget and no analytics still fails the Performance Standard; a
   mediocre site with excellent instrumentation and reporting passes it.
5. **Pin and version your own thresholds**, declare them, and cite the policy wording
   verbatim next to each — because the policy's WCAG reference floats ("latest version").
6. **Declare the scope** you treated as "the service", and check the relevant "services
   covered" page before publishing any verdict.

---

## 5. Gaps worth closing before locking a rubric

- The four decision-making framework pages linked from DAS C4 (myGov framework; and the
  individuals-not-suitable-for-myGov / business / providers framework) were not scraped.
- The per-standard "Measuring success" pages confirm only that compliance is reported to
  the DTA through IOF data collection — they contain no metric thresholds, so the absence
  of thresholds in §1 is a real finding, not a scraping gap.
- The downloadable PDFs (Criteria One-pager, Compliance/reporting/exemption guide,
  assessor checklist) may carry detail not present in the HTML.
