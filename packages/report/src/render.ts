import type { EvidenceBundle, FindingState } from '@dxp/schema';
import type { CriterionScore, Scorecard, StandardScore } from '@dxp/checks';

const STATE_LABEL: Record<FindingState, string> = {
  pass: 'Met',
  fail: 'Not met',
  needs_review: 'Needs review',
  not_collected: 'No evidence',
  not_assessable: 'Not externally assessable',
};

const STATE_CLASS: Record<FindingState, string> = {
  pass: 'met',
  fail: 'unmet',
  needs_review: 'review',
  not_collected: 'nodata',
  not_assessable: 'na',
};

const SCORABILITY_LABEL: Record<CriterionScore['scorability'], string> = {
  automatable: 'Fully assessable from outside',
  llm_judgeable: 'Partly assessable by content review',
  partial: 'Partly assessable from outside',
  not_observable: 'Not assessable from outside',
};

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pct(n: number | null): string {
  return n === null ? 'n/a' : `${Math.round(n * 100)}%`;
}

function renderFinding(f: CriterionScore['findings'][number]): string {
  const urls = f.failing_urls ?? [];
  const shown = urls.slice(0, 8);
  return `
<li class="finding ${STATE_CLASS[f.state]}">
  <div class="finding-head">
    <span class="badge ${STATE_CLASS[f.state]}">${esc(STATE_LABEL[f.state])}</span>
    <h4>${esc(f.def.sub_requirement)}</h4>
  </div>
  <p class="detail">${esc(f.detail)}</p>
  <details>
    <summary>What the policy says</summary>
    <blockquote>${esc(f.def.policy_quote)}
      <footer><a href="${esc(f.def.policy_url)}">Read the criterion on digital.gov.au</a></footer>
    </blockquote>
    ${
      f.def.threshold
        ? `<p class="threshold"><strong>Threshold:</strong> ${esc(f.def.threshold.value)}
             <span class="src ${f.def.threshold.source}">${
               f.def.threshold.source === 'policy' ? 'stated by the policy' : 'set by this tool'
             }</span><br><span class="rationale">${esc(f.def.threshold.rationale)}</span></p>`
        : ''
    }
    ${f.def.attestation_prompt ? `<p class="threshold"><strong>Ask the agency:</strong> ${esc(f.def.attestation_prompt)}</p>` : ''}
  </details>
  ${
    shown.length
      ? `<details><summary>${urls.length} affected ${urls.length === 1 ? 'item' : 'items'}</summary>
         <ul class="urls">${shown.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>
         ${urls.length > shown.length ? `<p class="more">and ${urls.length - shown.length} more</p>` : ''}
         </details>`
      : ''
  }
</li>`;
}

function renderCriterion(c: CriterionScore): string {
  const scoreLine =
    c.score === null
      ? `<p class="crit-score na">No sub-requirements could be assessed from outside.</p>`
      : `<p class="crit-score"><strong>${pct(c.score)}</strong> of assessed sub-requirements met
         <span class="denom">(${c.assessed} of ${c.attempted} attempted were assessable${
           c.notAssessable ? `; ${c.notAssessable} need agency evidence` : ''
         })</span></p>`;

  return `
<section class="criterion" aria-labelledby="c-${c.standard}-${c.number}">
  <h3 id="c-${c.standard}-${c.number}">${c.number}. ${esc(c.name)}</h3>
  <p class="scorability"><span class="tag">${esc(SCORABILITY_LABEL[c.scorability])}</span></p>
  <p class="note">${esc(c.note)}</p>
  ${scoreLine}
  <ul class="findings">${c.findings.map(renderFinding).join('')}</ul>
</section>`;
}

function renderStandard(s: StandardScore): string {
  const commencement =
    s.existing_services_from === null
      ? `<p class="commencement">The policy publishes no commencement date for this standard for existing public-facing services, so a site assessed here may not yet be formally in scope.</p>`
      : `<p class="commencement">Applies to existing public-facing services from ${esc(s.existing_services_from)}.</p>`;

  return `
<section class="standard" aria-labelledby="s-${s.id}">
  <div class="standard-head">
    <h2 id="s-${s.id}">${esc(s.name)}</h2>
    <p class="std-score">${
      s.score === null ? 'Not assessable' : `<strong>${pct(s.score)}</strong> of ${s.assessed} assessed`
    }</p>
  </div>
  ${commencement}
  ${s.criteria.map(renderCriterion).join('')}
</section>`;
}

const STYLES = `
:root{
  --ink:#14191f; --muted:#50595f; --line:#d4d9dd; --bg:#fff; --panel:#f4f6f8;
  --met:#13642f; --met-bg:#e4f3e8; --unmet:#99120f; --unmet-bg:#fdeae9;
  --review:#6b4600; --review-bg:#fdf2dc; --nodata:#3b4a66; --nodata-bg:#eceff5;
  --na:#43484d; --na-bg:#eceeef; --link:#0b4f8a;
}
*{box-sizing:border-box}
body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg)}
.wrap{max-width:62rem;margin:0 auto;padding:1.5rem}
a{color:var(--link)}
a:focus-visible,summary:focus-visible{outline:3px solid #0b4f8a;outline-offset:2px}
h1{font-size:1.9rem;line-height:1.25;margin:0 0 .3rem}
h2{font-size:1.4rem;margin:0}
h3{font-size:1.1rem;margin:1.6rem 0 .3rem}
h4{font-size:1rem;margin:0;font-weight:600}
header.doc{border-bottom:3px solid var(--ink);padding-bottom:1rem;margin-bottom:1.5rem}
.sub{color:var(--muted);margin:.2rem 0}
.disclaimer{background:var(--review-bg);border:1px solid #c89a2b;border-left-width:5px;padding:.8rem 1rem;margin:1rem 0;border-radius:4px}
.disclaimer p{margin:.3rem 0}
.summary{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:1rem 1.2rem;margin-bottom:1.5rem}
.summary dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));gap:.9rem;margin:.6rem 0 0}
.summary dt{font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.summary dd{margin:.15rem 0 0;font-size:1.3rem;font-weight:600}
.summary dd small{font-size:.8rem;font-weight:400;color:var(--muted);display:block}
.standard{margin:2.5rem 0;border-top:2px solid var(--line);padding-top:1rem}
.standard-head{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;flex-wrap:wrap}
.std-score{margin:0;font-size:1.05rem}
.commencement,.note{color:var(--muted);font-size:.9rem;margin:.3rem 0}
.criterion{margin:1.2rem 0 1.6rem;padding-left:1rem;border-left:3px solid var(--line)}
.tag{display:inline-block;font-size:.75rem;background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:.1rem .6rem;color:var(--muted)}
.scorability{margin:.2rem 0}
.crit-score{margin:.5rem 0}
.crit-score.na{color:var(--muted);font-style:italic}
.denom{color:var(--muted);font-size:.88rem}
ul.findings{list-style:none;padding:0;margin:.8rem 0 0}
.finding{border:1px solid var(--line);border-radius:5px;padding:.75rem .9rem;margin-bottom:.6rem;background:#fff}
.finding-head{display:flex;gap:.6rem;align-items:flex-start}
.badge{flex:0 0 auto;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:.15rem .5rem;border-radius:3px;border:1px solid currentColor;white-space:nowrap}
.badge.met{color:var(--met);background:var(--met-bg)}
.badge.unmet{color:var(--unmet);background:var(--unmet-bg)}
.badge.review{color:var(--review);background:var(--review-bg)}
.badge.nodata{color:var(--nodata);background:var(--nodata-bg)}
.badge.na{color:var(--na);background:var(--na-bg)}
.detail{margin:.45rem 0 .3rem}
details{margin-top:.35rem;font-size:.9rem}
summary{cursor:pointer;color:var(--link);width:fit-content}
blockquote{margin:.5rem 0;padding:.5rem .8rem;border-left:3px solid var(--line);background:var(--panel);font-style:italic}
blockquote footer{font-style:normal;font-size:.85rem;margin-top:.4rem}
.threshold{margin:.5rem 0;font-size:.88rem}
.rationale{color:var(--muted)}
.src{font-size:.75rem;padding:.05rem .4rem;border-radius:3px;border:1px solid currentColor}
.src.policy{color:var(--met);background:var(--met-bg)}
.src.tool{color:var(--nodata);background:var(--nodata-bg)}
ul.urls{margin:.4rem 0;padding-left:1.2rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.82rem;word-break:break-all}
.more{color:var(--muted);font-size:.85rem;margin:.2rem 0}
footer.doc{margin-top:3rem;border-top:1px solid var(--line);padding-top:1rem;color:var(--muted);font-size:.86rem}
@media print{
  @page{margin:14mm}
  body{font-size:11pt}
  .wrap{max-width:none;padding:0}
  a{color:var(--ink);text-decoration:underline}
  details{display:block}
  details summary{display:none}
  details>*:not(summary){display:block !important}
  .finding,.criterion,.standard{break-inside:avoid}
  .standard{break-before:page}
  .standard:first-of-type{break-before:auto}
  summary:focus-visible{outline:none}
}
`;

export function renderReport(scorecard: Scorecard, bundle: EvidenceBundle): string {
  const assessedPages = bundle.pages.filter((p) => p.integrity.ok).length;
  const blocked = bundle.pages.filter((p) => !p.integrity.ok);
  const modeNote =
    scorecard.mode === 'quick'
      ? `This was a quick scan of ${assessedPages} page${assessedPages === 1 ? '' : 's'}. Quick scans are indicative only and are not comparable with the ranked leaderboard, which uses a deeper and identically sampled assessment.`
      : `This was a full assessment of ${assessedPages} pages.`;

  const integrityNote = blocked.length
    ? `<p>${blocked.length} retrieved page${blocked.length === 1 ? ' was' : 's were'} excluded from scoring because the content could not be trusted (for example a bot-protection interstitial or an error page). Excluded pages are never counted as failures.</p>`
    : '';

  const cruxNote = bundle.site.crux.available
    ? ''
    : `<p>Performance was not scored: ${esc(bundle.site.crux.reason ?? 'no field data available')}. This scanner measured from <strong>${esc(scorecard.vantage_region)}</strong>, so it deliberately does not substitute a lab measurement, which would report network distance as a fault of the service.</p>`;

  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Digital Experience Policy assessment — ${esc(bundle.site.site_id)}</title>
<style>${STYLES}</style>
</head>
<body>
<a class="skip" href="#main" style="position:absolute;left:-9999px" onfocus="this.style.left='0'">Skip to main content</a>
<div class="wrap">
<header class="doc">
  <h1>Digital Experience Policy assessment</h1>
  <p class="sub"><strong>${esc(bundle.site.entry_url)}</strong></p>
  <p class="sub">Assessed ${esc(new Date(scorecard.generated_at).toLocaleString('en-AU', { dateStyle: 'long', timeStyle: 'short' }))}
     · rubric ${esc(scorecard.rubric_version)} · evidence ${esc(scorecard.bundle_id.slice(0, 12))}</p>
  <div class="disclaimer">
    <p><strong>This is not an official assessment.</strong> It is an independent, experimental tool, not affiliated with or endorsed by the Digital Transformation Agency. It does not determine compliance with the Digital Experience Policy.</p>
    <p>The policy states almost no numeric thresholds, so most thresholds used here were set by this tool. Each one is labelled below as either stated by the policy or set by this tool.</p>
  </div>
</header>

<main id="main">
<section class="summary" aria-labelledby="sum">
  <h2 id="sum">Summary</h2>
  <p>${esc(modeNote)}</p>
  <dl>
    <div><dt>Externally assessable score</dt><dd>${pct(scorecard.overall.score)}<small>of ${scorecard.overall.assessed} sub-requirements that could be judged</small></dd></div>
    <div><dt>Needs human review</dt><dd>${scorecard.overall.needsReview}<small>a machine cannot decide these</small></dd></div>
    <div><dt>Not assessable externally</dt><dd>${scorecard.overall.notAssessable}<small>require evidence held by the agency</small></dd></div>
    <div><dt>Evidence coverage</dt><dd>${pct(scorecard.overall.evidenceCoverage)}<small>of pages attempted yielded usable evidence</small></dd></div>
    <div><dt>Thresholds</dt><dd>${scorecard.thresholdProvenance.tool} / ${scorecard.thresholdProvenance.policy + scorecard.thresholdProvenance.tool}<small>set by this tool, not the policy</small></dd></div>
  </dl>
  ${integrityNote}
  ${cruxNote}
</section>

${scorecard.standards.map(renderStandard).join('')}
</main>

<footer class="doc">
  <p>Six of the policy's 25 criteria are governance processes evidenced through the Digital Investment Overview form and the Digital Capability Assessment Process template. Nothing about them is visible from outside a government network, so they are reported as not externally assessable rather than scored. Each carries a question to put to the agency.</p>
  <p>Automated accessibility testing detects roughly a third of WCAG success criteria. A result of "met" means no machine-detectable violations were found, not that the service conforms to WCAG.</p>
  <p>Generated by dxp-scanner · <a href="https://github.com/ashwingur-dta/dxp-scanner">github.com/ashwingur-dta/dxp-scanner</a></p>
</footer>
</div>
</body>
</html>`;
}
