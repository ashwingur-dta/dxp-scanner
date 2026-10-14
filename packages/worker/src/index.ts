import { gzipSync } from 'node:zlib';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import serverlessChromium from '@sparticuz/chromium';
import { rollup, runChecks } from '@dxp/checks';
import { renderPdf, renderReport } from '@dxp/report';
import { UrlRejected, scan } from '@dxp/scanner';
import { patchJob } from '@dxp/api';

const region = process.env.AWS_REGION ?? 'us-east-1';
const s3 = new S3Client({ region });

const EVIDENCE_BUCKET = process.env.EVIDENCE_BUCKET ?? '';
const REPORT_BUCKET = process.env.REPORT_BUCKET ?? '';
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 10);
const IN_LAMBDA = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

let cachedExecutablePath: string | undefined;

async function browserLaunch(): Promise<{ executablePath?: string; extraLaunchArgs: string[] }> {
  if (!IN_LAMBDA) return { extraLaunchArgs: [] };
  cachedExecutablePath ??= await serverlessChromium.executablePath();
  return {
    ...(cachedExecutablePath ? { executablePath: cachedExecutablePath } : {}),
    extraLaunchArgs: serverlessChromium.args.filter(
      (a) => !a.startsWith('--single-process') && !a.startsWith('--headless'),
    ),
  };
}

interface SqsEvent {
  Records: { messageId: string; body: string }[];
}

interface SqsBatchResponse {
  batchItemFailures: { itemIdentifier: string }[];
}

async function put(
  bucket: string,
  key: string,
  body: Buffer | string,
  contentType: string,
  contentEncoding?: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ...(contentEncoding ? { ContentEncoding: contentEncoding } : {}),
      CacheControl: 'public, max-age=300',
    }),
  );
}

async function runJob(jobId: string, url: string): Promise<void> {
  await patchJob(jobId, { status: 'running', phase: 'validating' });

  const launch = await browserLaunch();

  const bundle = await scan(
    { url, mode: 'quick', maxPages: MAX_PAGES, requireGovAu: true },
    {
      ...launch,
      vantageRegion: region,
      onProgress: (p) => {
        if (p.phase === 'crawling' && p.done % 2 === 0) {
          void patchJob(jobId, { phase: p.phase, pages_done: p.done, pages_total: p.total }).catch(
            () => undefined,
          );
        }
      },
    },
  );

  await patchJob(jobId, { phase: 'scoring', bundle_id: bundle.bundle_id });

  const findings = runChecks(bundle);
  const scorecard = rollup(bundle, findings);
  const html = renderReport(scorecard, bundle);

  const stem = `reports/${bundle.site.site_id}/${bundle.bundle_id.slice(0, 12)}`;
  const reportKey = `${stem}/index.html`;
  const pdfKey = `${stem}/report.pdf`;

  if (EVIDENCE_BUCKET) {
    await put(
      EVIDENCE_BUCKET,
      `site-runs/${bundle.site.site_id}/${bundle.bundle_id}/bundle.json.gz`,
      gzipSync(Buffer.from(JSON.stringify(bundle))),
      'application/json',
      'gzip',
    );
    await put(
      EVIDENCE_BUCKET,
      `scorecards/${bundle.site.site_id}/${bundle.bundle_id}.json`,
      JSON.stringify(scorecard),
      'application/json',
    );
  }

  await put(REPORT_BUCKET, reportKey, html, 'text/html; charset=utf-8');

  await patchJob(jobId, { phase: 'rendering-pdf', report_key: reportKey });

  const pdf = await renderPdf({ html, ...launch });
  await put(REPORT_BUCKET, pdfKey, pdf, 'application/pdf');

  await patchJob(jobId, {
    status: 'ready',
    phase: 'ready',
    site_id: bundle.site.site_id,
    report_key: reportKey,
    pdf_key: pdfKey,
    pages_done: bundle.pages.filter((p) => p.integrity.ok).length,
    score: scorecard.overall.score,
    assessed: scorecard.overall.assessed,
    needs_review: scorecard.overall.needsReview,
    not_assessable: scorecard.overall.notAssessable,
  });
}

export async function handler(event: SqsEvent): Promise<SqsBatchResponse> {
  const failures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    let jobId = '';
    try {
      const msg = JSON.parse(record.body) as { jobId?: string; url?: string };
      if (!msg.jobId || !msg.url) throw new Error('message missing jobId or url');
      jobId = msg.jobId;
      await runJob(msg.jobId, msg.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('worker failed', { jobId, message });

      if (jobId) {
        const rejected = err instanceof UrlRejected;
        await patchJob(jobId, {
          status: rejected ? 'rejected' : 'failed',
          phase: 'failed',
          error: message,
        }).catch(() => undefined);
      }

      if (!(err instanceof UrlRejected)) {
        failures.push({ itemIdentifier: record.messageId });
      }
    }
  }

  return { batchItemFailures: failures };
}
