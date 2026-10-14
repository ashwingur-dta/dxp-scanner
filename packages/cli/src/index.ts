import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { RUBRIC_VERSION, exportRubric, rollup, runChecks } from '@dxp/checks';
import { renderPdf, renderReport } from '@dxp/report';
import type { ScanMode } from '@dxp/schema';
import { UrlRejected, scan, type ScanProgress } from '@dxp/scanner';

interface Args {
  url?: string;
  mode: ScanMode;
  maxPages?: number;
  outDir: string;
  anyHost: boolean;
  noPdf: boolean;
  rubricOnly: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { mode: 'quick', outDir: 'out', anyHost: false, noPdf: false, rubricOnly: false };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--full') args.mode = 'full';
    else if (a === '--pages') args.maxPages = Number(argv[++i]);
    else if (a === '--out') args.outDir = argv[++i] ?? 'out';
    else if (a === '--any-host') args.anyHost = true;
    else if (a === '--no-pdf') args.noPdf = true;
    else if (a === '--rubric') args.rubricOnly = true;
    else if (a && !a.startsWith('-')) args.url = a;
  }
  return args;
}

function bar(p: ScanProgress): string {
  const width = 24;
  const ratio = p.total > 0 ? Math.min(1, p.done / p.total) : 0;
  const filled = Math.round(ratio * width);
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

function usage(): void {
  console.log(`
dxp-scanner — assess an Australian government website against the Digital Experience Policy

  npm run scan -- <url> [options]

Options
  --full            Full assessment (100 pages) instead of a quick scan (10)
  --pages <n>       Override the page budget
  --out <dir>       Output directory (default: out)
  --any-host        Allow a non gov.au host. Off by default: the public tool only
                    accepts gov.au, which also closes most of the SSRF surface
  --no-pdf          Skip PDF generation
  --rubric          Print the rubric as JSON and exit

Examples
  npm run scan -- https://www.digital.gov.au/policy/digital-experience
  npm run scan -- health.gov.au --pages 6
`);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.rubricOnly) {
    console.log(JSON.stringify(exportRubric(), null, 2));
    return 0;
  }

  if (!args.url) {
    usage();
    return 1;
  }

  const outDir = resolve(args.outDir);
  await mkdir(outDir, { recursive: true });

  let lastPhase = '';
  const started = Date.now();

  let bundle;
  try {
    bundle = await scan(
      {
        url: args.url,
        mode: args.mode,
        ...(args.maxPages ? { maxPages: args.maxPages } : {}),
        requireGovAu: !args.anyHost,
      },
      {
        onProgress: (p) => {
          if (p.phase !== lastPhase) {
            lastPhase = p.phase;
            process.stderr.write(`\n${p.phase}\n`);
          }
          if (p.phase === 'crawling') {
            process.stderr.write(`\r  ${bar(p)} ${p.done}/${p.total}  ${(p.url ?? '').slice(0, 60)}`.padEnd(100));
          }
        },
      },
    );
  } catch (err) {
    if (err instanceof UrlRejected) {
      console.error(`\nRejected: ${err.message}`);
      if (err.reason === 'not_gov_au') {
        console.error('Pass --any-host to scan a non-government site locally.');
      }
      return 2;
    }
    console.error(`\nScan failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  process.stderr.write('\n');

  const findings = runChecks(bundle);
  const scorecard = rollup(bundle, findings);
  const html = renderReport(scorecard, bundle);

  const stem = join(outDir, `${bundle.site.site_id}-${bundle.bundle_id.slice(0, 8)}`);
  await writeFile(`${stem}.evidence.json`, JSON.stringify(bundle, null, 2));
  await writeFile(`${stem}.scorecard.json`, JSON.stringify(scorecard, null, 2));
  await writeFile(`${stem}.report.html`, html);

  if (!args.noPdf) {
    const pdf = await renderPdf({ html });
    await writeFile(`${stem}.report.pdf`, pdf);
  }

  const assessed = bundle.pages.filter((p) => p.integrity.ok).length;
  const excluded = bundle.pages.length - assessed;
  const score = scorecard.overall.score;

  console.log(`
${bundle.site.entry_url}
  rubric ${RUBRIC_VERSION} · evidence ${bundle.bundle_id.slice(0, 12)} · ${Math.round((Date.now() - started) / 1000)}s

  Pages assessed              ${assessed}${excluded ? ` (${excluded} excluded as untrustworthy)` : ''}
  Externally assessable score ${score === null ? 'n/a' : `${Math.round(score * 100)}%`} of ${scorecard.overall.assessed} judgeable sub-requirements
  Needs human review          ${scorecard.overall.needsReview}
  Not assessable externally   ${scorecard.overall.notAssessable}
  Thresholds set by this tool ${scorecard.thresholdProvenance.tool} of ${scorecard.thresholdProvenance.tool + scorecard.thresholdProvenance.policy}
`);

  for (const s of scorecard.standards) {
    const pc = s.score === null ? ' n/a' : `${String(Math.round(s.score * 100)).padStart(3)}%`;
    console.log(`  ${pc}  ${s.name}  (${s.assessed} assessed)`);
  }

  const worst = scorecard.standards
    .flatMap((s) => s.criteria.flatMap((c) => c.findings))
    .filter((f) => f.state === 'fail')
    .sort((a, b) => b.def.weight - a.def.weight)
    .slice(0, 5);

  if (worst.length) {
    console.log('\n  Most significant gaps:');
    for (const f of worst) console.log(`    - ${f.def.sub_requirement}: ${f.detail}`);
  }

  console.log(`\n  Written to ${stem}.report.html${args.noPdf ? '' : ' (and .pdf)'}\n`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
