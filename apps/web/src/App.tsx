import { useCallback, useEffect, useRef, useState } from 'react';
import Leaderboard from './Leaderboard';
import { RequestFailed, getScan, looksLikeGovAu, startScan, type Job } from './api';

export const LEADERBOARD_PATH = '/leaderboard';

const PHASE_LABEL: Record<string, string> = {
  queued: 'Queued',
  validating: 'Checking the address',
  discovering: 'Finding pages',
  crawling: 'Reading pages',
  'site-checks': 'Checking the site',
  scoring: 'Scoring',
  'rendering-pdf': 'Building the PDF',
  sealing: 'Finishing',
  ready: 'Done',
};

export function SiteHeader({ current }: { current: 'scan' | 'leaderboard' }) {
  return (
    <header className="site-header">
      <div className="wrap">
        <a className="brand" href="/">
          DX Policy scanner <span>· unofficial</span>
        </a>
        <nav className="top" aria-label="Sections">
          <a href="/" {...(current === 'scan' ? { 'aria-current': 'page' as const } : {})}>
            Scan a site
          </a>
          <a
            href={LEADERBOARD_PATH}
            {...(current === 'leaderboard' ? { 'aria-current': 'page' as const } : {})}
          >
            Leaderboard
          </a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <p>
          Independent and experimental. Not affiliated with or endorsed by the DTA, and not a
          compliance determination.
        </p>
        <p>
          <a href="https://github.com/ashwingur-dta/dxp-scanner">Source and methodology</a>
          {' · '}
          <a href="https://github.com/ashwingur-dta/dxp-scanner/blob/main/docs/coverage.md">
            Which sites can be scanned
          </a>
        </p>
      </div>
    </footer>
  );
}

function Progress({ job }: { job: Job }) {
  const phase = job.phase ?? job.status;
  const label = PHASE_LABEL[phase] ?? phase;
  const counting = phase === 'crawling' && job.pages_total > 0;

  return (
    <div className="panel" role="status" aria-live="polite">
      <p className="phase">
        <span className="spinner" aria-hidden="true" />
        {label}
        {counting ? ' ' + job.pages_done + '/' + job.pages_total : ''}
      </p>
      <div
        className="bar"
        role="progressbar"
        aria-label="Scan progress"
        {...(counting
          ? {
              'aria-valuenow': job.pages_done,
              'aria-valuemin': 0,
              'aria-valuemax': job.pages_total,
            }
          : {})}
      >
        <div
          className={counting ? 'bar-fill' : 'bar-fill indeterminate'}
          style={
            counting ? { width: ((job.pages_done / job.pages_total) * 100).toFixed(0) + '%' } : undefined
          }
        />
      </div>
      <p className="hint">Usually 15 to 25 seconds. One request per second, to stay polite.</p>
    </div>
  );
}

function Result({ job }: { job: Job }) {
  const score = job.score === null ? null : Math.round(job.score * 100);

  return (
    <div className="panel result">
      <h2>Assessment ready</h2>
      <p className="assessed-url">{job.url}</p>

      <dl className="stats">
        <div>
          <dt>Score</dt>
          <dd>
            {score === null ? '—' : score + '%'}
            <small>of {job.assessed ?? 0} assessable</small>
          </dd>
        </div>
        <div>
          <dt>Pages read</dt>
          <dd>{job.pages_done}</dd>
        </div>
        <div>
          <dt>Needs review</dt>
          <dd>{job.needs_review ?? 0}</dd>
        </div>
        <div>
          <dt>Not assessable</dt>
          <dd>
            {job.not_assessable ?? 0}
            <small>needs agency evidence</small>
          </dd>
        </div>
      </dl>

      <p className="caveat">Quick scan — indicative, and not comparable with the leaderboard.</p>

      <div className="actions">
        {job.report_url && (
          <a className="btn primary" href={job.report_url}>
            View report
          </a>
        )}
        {job.pdf_url && (
          <a className="btn" href={job.pdf_url} download>
            Download PDF
          </a>
        )}
      </div>
    </div>
  );
}

function Failure({ job }: { job: Job }) {
  return (
    <div className="panel error" role="alert">
      <h2>{job.status === 'rejected' ? 'Address rejected' : 'Could not assess this site'}</h2>
      <p>{job.error ?? 'No further detail available.'}</p>
    </div>
  );
}

export default function App() {
  if (window.location.pathname.replace(/\/+$/, '') === LEADERBOARD_PATH) {
    return <Leaderboard />;
  }
  return <Home />;
}

function Home() {
  const [url, setUrl] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const poll = useCallback(
    (jobId: string) => {
      stopPolling();
      pollRef.current = window.setTimeout(async () => {
        try {
          const next = await getScan(jobId);
          setJob(next);
          if (next.status === 'queued' || next.status === 'running') poll(jobId);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Lost contact with the scanner.');
        }
      }, 1800);
    },
    [stopPolling],
  );

  useEffect(() => stopPolling, [stopPolling]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUnreachable(false);
    setJob(null);

    const trimmed = url.trim();
    if (!trimmed) {
      setError('Enter a gov.au address.');
      return;
    }
    if (!looksLikeGovAu(trimmed)) {
      setError('Only gov.au addresses can be assessed.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await startScan(trimmed);
      setJob(created);
      if (created.status === 'queued' || created.status === 'running') poll(created.job_id);
    } catch (err) {
      if (err instanceof RequestFailed) {
        setError(err.message);
        setUnreachable(err.code === 'unreachable');
      } else {
        setError('Could not reach the scanner. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const busy = !!job && (job.status === 'queued' || job.status === 'running');

  return (
    <>
      <a className="skip" href="#main">
        Skip to main content
      </a>

      <SiteHeader current="scan" />

      <main id="main" className="wrap">
        <div className="hero">
          <h1>How well does a government site meet the Digital Experience Policy?</h1>
          <p>
            Paste a gov.au address. The scanner reads a sample of pages and scores them against
            the policy&rsquo;s 25 criteria.
          </p>
        </div>

        <form onSubmit={onSubmit} noValidate>
          <label htmlFor="url">Website address</label>
          <div className="field">
            <input
              id="url"
              name="url"
              type="text"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              placeholder="www.abs.gov.au"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-describedby="url-hint"
              {...(error ? { 'aria-invalid': true as const } : {})}
              disabled={busy}
            />
            <button className="btn primary" type="submit" disabled={submitting || busy}>
              {submitting ? 'Starting…' : 'Assess'}
            </button>
          </div>
          <p id="url-hint" className="hint">
            Try <code>www.abs.gov.au</code>, <code>business.gov.au</code>, <code>my.gov.au</code>
            {' or '}
            <code>www.rba.gov.au</code>.
          </p>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          {unreachable && (
            <p className="hint">
              About half of gov.au sites refuse automated clients, and we don&rsquo;t try to get
              around that.{' '}
              <a href="https://github.com/ashwingur-dta/dxp-scanner/blob/main/docs/coverage.md">
                Which sites work
              </a>
            </p>
          )}
        </form>

        {busy && job && <Progress job={job} />}
        {job?.status === 'ready' && <Result job={job} />}
        {job && (job.status === 'failed' || job.status === 'rejected') && <Failure job={job} />}

        <p className="disclaimer">
          <b>Not an official assessment.</b> The policy sets almost no numeric thresholds, so most
          of the ones used here were set by this tool. Each report says which.
        </p>

        <section className="explainer">
          <h2>What a score does and doesn&rsquo;t mean</h2>
          <div className="cols">
            <div>
              <h3>Measured</h3>
              <p>
                Feedback on every page and the availability measures the policy names outright,
                plus machine-detectable accessibility issues, plain language, small-screen reflow,
                and whether interpreting and relay services are signposted.
              </p>
            </div>
            <div>
              <h3>Not claimed</h3>
              <p>
                Automated testing finds about a third of WCAG issues, so a pass is not conformance.
                Six of the 25 criteria are internal governance and are never scored. Forms are
                never submitted.
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
