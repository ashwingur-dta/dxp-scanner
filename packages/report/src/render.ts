import type { EvidenceBundle, FindingState } from '@dxp/schema';
import type { CriterionScore, Scorecard, StandardScore } from '@dxp/checks';

const STATE_LABEL: Record<FindingState, string> = {
  pass: 'Met',
  fail: 'Not met',
  needs_review: 'Review',
  not_collected: 'No evidence',
  not_assessable: 'Not assessable',
};

const STATE_CLASS: Record<FindingState, string> = {
  pass: 'met',
  fail: 'unmet',
  needs_review: 'review',
  not_collected: 'nodata',
  not_assessable: 'na',
};

const SCORABILITY_LABEL: Record<CriterionScore['scorability'], string> = {
  automatable: 'Fully assessable externally',
  llm_judgeable: 'Assessable by content review',
  partial: 'Partly assessable externally',
  not_observable: 'Not assessable externally',
};

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const pct = (n: number | null): string => (n === null ? '—' : `${Math.round(n * 100)}%`);

function renderFinding(f: CriterionScore['findings'][number]): string {
  const urls = f.failing_urls ?? [];
  const shown = urls.slice(0, 6);
  const t = f.def.threshold;

  return `
<li class="finding">
  <span class="pill ${STATE_CLASS[f.state]}">${esc(STATE_LABEL[f.state])}</span>
  <div class="finding-body">
    <h4>${esc(f.def.sub_requirement)}</h4>
    <p>${esc(f.detail)}</p>
    <details>
      <summary>Policy wording${t ? ` and threshold` : ''}</summary>
      <blockquote>${esc(f.def.policy_quote)}</blockquote>
      <p class="src-line"><a href="${esc(f.def.policy_url)}">digital.gov.au</a>${
        t
          ? ` · threshold ${esc(t.value)} <span class="src ${t.source}">${
              t.source === 'policy' ? 'from policy' : 'set by tool'
            }</span> — ${esc(t.rationale)}`
          : ''
      }</p>
      ${f.def.attestation_prompt ? `<p class="ask"><strong>Ask the agency:</strong> ${esc(f.def.attestation_prompt)}</p>` : ''}
    </details>
    ${
      shown.length
        ? `<details><summary>${urls.length} affected</summary><ul class="urls">${shown
            .map((u) => `<li>${esc(u)}</li>`)
            .join('')}</ul>${urls.length > shown.length ? `<p class="more">+${urls.length - shown.length} more</p>` : ''}</details>`
        : ''
    }
  </div>
</li>`;
}

function renderCriterion(c: CriterionScore): string {
  if (c.scorability === 'not_observable') {
    const ask = c.findings.find((f) => f.def.attestation_prompt)?.def.attestation_prompt;
    return `
<section class="criterion compact">
  <header>
    <h3><span class="num">${c.number}</span>${esc(c.name)}</h3>
    <span class="tag na">Not assessable externally</span>
  </header>
  <p class="note">${esc(c.note)}</p>
  ${ask ? `<details><summary>What to ask the agency</summary><p class="ask">${esc(ask)}</p></details>` : ''}
</section>`;
  }

  const bar =
    c.score === null
      ? ''
      : `<div class="minibar" aria-hidden="true"><i style="width:${Math.round(c.score * 100)}%"></i></div>`;

  return `
<section class="criterion">
  <header>
    <h3><span class="num">${c.number}</span>${esc(c.name)}</h3>
    <div class="crit-meta">
      ${
        c.score === null
          ? `<span class="tag na">${esc(SCORABILITY_LABEL[c.scorability])}</span>`
          : `<span class="crit-score">${pct(c.score)}</span><span class="denom">${c.assessed}/${c.attempted} assessable</span>${bar}`
      }
    </div>
  </header>
  <ul class="findings">${c.findings.map(renderFinding).join('')}</ul>
</section>`;
}

function renderStandard(s: StandardScore): string {
  return `
<section class="standard">
  <header class="std-head">
    <h2>${esc(s.name)}</h2>
    <div class="std-score">
      <strong>${pct(s.score)}</strong>
      <span class="denom">${s.assessed} assessed</span>
    </div>
  </header>
  ${
    s.existing_services_from === null
      ? `<p class="note warn">No commencement date is published for existing public-facing services, so this site may not yet be in scope.</p>`
      : ''
  }
  ${s.criteria.map(renderCriterion).join('')}
</section>`;
}

const STYLES = `
:root{
  --bg:#0c1016; --panel:#141a22; --panel2:#1b222c; --line:#2a333f;
  --ink:#e7edf4; --mute:#93a1b1; --dim:#6b7a8c;
  --accent:#6fb3f2;
  --met:#56d178; --met-bg:#12301d;
  --unmet:#ff7b72; --unmet-bg:#3a1714;
  --review:#e3b341; --review-bg:#33280c;
  --nodata:#9db2c8; --nodata-bg:#1d2733;
  --na:#8b98a6; --na-bg:#1a2027;
  --r:10px;
}
*{box-sizing:border-box}
html{color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--ink);
  font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:60rem;margin:0 auto;padding:2rem 1.5rem 4rem}
a{color:var(--accent);text-decoration-thickness:1px;text-underline-offset:2px}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:3px}
h1,h2,h3,h4{line-height:1.25;margin:0}

.hero{display:flex;gap:2rem;align-items:center;flex-wrap:wrap;
  padding-bottom:1.75rem;border-bottom:1px solid var(--line);margin-bottom:1.5rem}
.hero-main{flex:1 1 20rem;min-width:0}
h1{font-size:1.05rem;font-weight:600;color:var(--mute);letter-spacing:.02em}
.host{font-size:1.75rem;font-weight:700;margin:.2rem 0 .35rem;word-break:break-word}
.meta{color:var(--dim);font-size:.82rem;font-variant-numeric:tabular-nums}
.meta code{color:var(--mute)}

.dial{flex:0 0 auto;width:132px;height:132px;border-radius:50%;display:grid;place-items:center;
  background:conic-gradient(var(--accent) calc(var(--v) * 1%), var(--panel2) 0);position:relative}
.dial::before{content:"";position:absolute;inset:11px;border-radius:50%;background:var(--bg)}
.dial-in{position:relative;text-align:center;line-height:1.1}
.dial-in b{display:block;font-size:1.9rem;font-weight:700;font-variant-numeric:tabular-nums}
.dial-in span{font-size:.68rem;color:var(--mute);letter-spacing:.04em;text-transform:uppercase}

.disclaimer{background:var(--review-bg);border:1px solid #6b5518;border-left:4px solid var(--review);
  border-radius:var(--r);padding:.7rem .95rem;margin-bottom:1.5rem;font-size:.88rem;color:#f0dfae}
.disclaimer b{color:var(--review)}

.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.75rem;margin-bottom:1rem}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:.8rem .9rem}
.stat dt{font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:var(--dim)}
.stat dd{margin:.25rem 0 0;font-size:1.4rem;font-weight:700;font-variant-numeric:tabular-nums}
.stat dd small{display:block;font-size:.72rem;font-weight:400;color:var(--dim);line-height:1.35;margin-top:.1rem}

.callout{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);
  padding:.7rem .95rem;font-size:.85rem;color:var(--mute);margin-bottom:1.5rem}
.callout + .callout{margin-top:-.9rem}

.standard{margin-top:2.25rem}
.std-head{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;
  padding-bottom:.5rem;border-bottom:2px solid var(--line);margin-bottom:.25rem}
.std-head h2{font-size:1.2rem}
.std-score{text-align:right;white-space:nowrap}
.std-score strong{font-size:1.2rem;font-variant-numeric:tabular-nums}
.denom{color:var(--dim);font-size:.76rem;margin-left:.4rem}

.criterion{padding:1rem 0;border-bottom:1px solid var(--line)}
.criterion.compact{padding:.6rem 0}
.criterion:last-child{border-bottom:0}
.criterion>header{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;flex-wrap:wrap}
.criterion h3{font-size:.98rem;font-weight:600;display:flex;gap:.55rem;align-items:baseline}
.num{color:var(--dim);font-variant-numeric:tabular-nums;font-weight:400}
.crit-meta{display:flex;align-items:center;gap:.5rem;white-space:nowrap}
.crit-score{font-weight:700;font-variant-numeric:tabular-nums}
.minibar{width:72px;height:5px;border-radius:99px;background:var(--panel2);overflow:hidden}
.minibar i{display:block;height:100%;background:var(--accent)}
.tag{font-size:.72rem;padding:.12rem .5rem;border-radius:99px;border:1px solid var(--line);color:var(--mute)}
.note{color:var(--dim);font-size:.83rem;margin:.4rem 0 0}
.note.warn{color:var(--review)}

ul.findings{list-style:none;padding:0;margin:.7rem 0 0;display:grid;gap:.4rem}
.finding{display:flex;gap:.7rem;align-items:flex-start;background:var(--panel);
  border:1px solid var(--line);border-radius:8px;padding:.6rem .75rem}
.finding-body{min-width:0;flex:1}
.finding h4{font-size:.9rem;font-weight:600}
.finding p{margin:.2rem 0 0;font-size:.86rem;color:var(--mute)}
.pill{flex:0 0 auto;font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
  padding:.18rem .45rem;border-radius:5px;margin-top:.1rem;white-space:nowrap}
.pill.met{color:var(--met);background:var(--met-bg)}
.pill.unmet{color:var(--unmet);background:var(--unmet-bg)}
.pill.review{color:var(--review);background:var(--review-bg)}
.pill.nodata{color:var(--nodata);background:var(--nodata-bg)}
.pill.na{color:var(--na);background:var(--na-bg)}

details{margin-top:.4rem;font-size:.82rem}
summary{cursor:pointer;color:var(--accent);width:fit-content;font-size:.78rem}
blockquote{margin:.45rem 0;padding:.4rem .7rem;border-left:2px solid var(--line);
  color:var(--mute);font-style:italic}
.src-line{font-size:.78rem;color:var(--dim)}
.ask{font-size:.8rem;color:var(--mute)}
.src{font-size:.68rem;padding:.05rem .35rem;border-radius:4px;border:1px solid currentColor}
.src.policy{color:var(--met)}
.src.tool{color:var(--nodata)}
ul.urls{margin:.35rem 0;padding-left:1.1rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:.74rem;color:var(--mute);word-break:break-all}
.more{color:var(--dim);font-size:.76rem;margin:.15rem 0}

footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--line);
  color:var(--dim);font-size:.78rem}

@media print{
  @page{margin:14mm}
  html{color-scheme:light}
  :root{--bg:#fff;--panel:#fff;--panel2:#eee;--line:#c9d1d9;--ink:#11161c;--mute:#3d4752;--dim:#5b6673;
    --accent:#0b4f8a;--met:#116329;--met-bg:#e8f5ec;--unmet:#8b1a16;--unmet-bg:#fdecea;
    --review:#6b4b00;--review-bg:#fdf5e2;--nodata:#2f3b4a;--nodata-bg:#eef2f6;--na:#444c55;--na-bg:#f0f2f4}
  body{font-size:10.5pt}
  .wrap{max-width:none;padding:0}
  .dial{background:none}
  .dial::before{display:none}
  .dial-in b{font-size:1.6rem}
  a{color:var(--ink)}
  details{display:block}
  details summary{display:none}
  details>*:not(summary){display:block!important}
  .finding,.criterion,.standard{break-inside:avoid}
  .standard{break-before:page}
  .standard:first-of-type{break-before:auto}
}
`;

export function renderReport(scorecard: Scorecard, bundle: EvidenceBundle): string {
  const assessed = bundle.pages.filter((p) => p.integrity.ok).length;
  const excluded = bundle.pages.length - assessed;
  const score = scorecard.overall.score;
  const dial = score === null ? 0 : Math.round(score * 100);
  const { tool, policy } = scorecard.thresholdProvenance;

  const notes: string[] = [];
  if (scorecard.mode === 'quick') {
    notes.push(
      `Quick scan of ${assessed} page${assessed === 1 ? '' : 's'} — indicative, and not comparable with the leaderboard.`,
    );
  }
  if (excluded > 0) {
    notes.push(
      `${excluded} retrieved page${excluded === 1 ? '' : 's'} excluded as untrustworthy (an error page or bot-protection interstitial). Excluded pages are never counted as failures.`,
    );
  }
  if (!bundle.site.crux.available) {
    notes.push(
      `Performance not scored: ${esc(bundle.site.crux.reason ?? 'no field data')}. Measured from ${esc(scorecard.vantage_region)}, so a lab timing would report network distance as a fault of the service.`,
    );
  }

  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DX Policy assessment — ${esc(bundle.site.site_id)}</title>
<style>${STYLES}</style>
</head>
<body>
<div class="wrap">

<div class="hero">
  <div class="hero-main">
    <h1>Digital Experience Policy assessment</h1>
    <p class="host">${esc(new URL(bundle.site.entry_url).hostname)}</p>
    <p class="meta">${esc(new Date(scorecard.generated_at).toLocaleDateString('en-AU', { dateStyle: 'medium' }))}
      · rubric ${esc(scorecard.rubric_version)} · <code>${esc(scorecard.bundle_id.slice(0, 12))}</code></p>
  </div>
  <div class="dial" style="--v:${dial}" role="img"
       aria-label="${pct(score)} of ${scorecard.overall.assessed} assessable sub-requirements met">
    <span class="dial-in"><b>${pct(score)}</b><span>assessable</span></span>
  </div>
</div>

<p class="disclaimer"><b>Not an official assessment.</b> Independent and experimental, not
affiliated with the DTA, and not a compliance determination. ${tool} of ${tool + policy}
thresholds used here were set by this tool, not the policy.</p>

<dl class="stats">
  <div class="stat"><dt>Met</dt><dd>${scorecard.overall.assessed === 0 ? '—' : `${scorecard.standards.reduce((n, s) => n + s.criteria.reduce((m, c) => m + c.passed, 0), 0)}`}<small>of ${scorecard.overall.assessed} judged</small></dd></div>
  <div class="stat"><dt>Needs review</dt><dd>${scorecard.overall.needsReview}<small>machine cannot decide</small></dd></div>
  <div class="stat"><dt>Not assessable</dt><dd>${scorecard.overall.notAssessable}<small>needs agency evidence</small></dd></div>
  <div class="stat"><dt>Pages</dt><dd>${assessed}<small>evidence coverage ${pct(scorecard.overall.evidenceCoverage)}</small></dd></div>
</dl>

${notes.map((n) => `<p class="callout">${n}</p>`).join('')}

${scorecard.standards.map(renderStandard).join('')}

<footer>
  <p>Automated testing detects roughly a third of WCAG success criteria, so "Met" means no
  machine-detectable violations, not conformance. Six of the 25 criteria are internal
  governance processes and are reported as not assessable rather than scored.</p>
  <p><a href="https://github.com/ashwingur-dta/dxp-scanner">github.com/ashwingur-dta/dxp-scanner</a></p>
</footer>

</div>
</body>
</html>`;
}
