import { useCallback, useEffect, useRef, useState } from 'react';
import { RequestFailed, getScan, looksLikeGovAu, startScan, type Job } from './api';

const PHASE_LABEL: Record<string, string> = {
  queued: 'Waiting for a scanner',
  validating: 'Checking the address',
  discovering: 'Finding pages to assess',
  crawling: 'Reading pages',
  'site-checks': 'Checking the site as a whole',
  scoring: 'Scoring against the criteria',
  'rendering-pdf': 'Preparing the PDF',
  sealing: 'Finishing up',
  ready: 'Done',
  failed: 'Failed',
};

function Progress({ job }: { job: Job }) {
  const phase = job.phase ?? job.status;
  const label = PHASE_LABEL[phase] ?? phase;
  const showCount = phase === 'crawling' && job.pages_total > 0;
  const value = showCount ? job.pages_done : null;

  return (
    <div className="panel" role="status" aria-live="polite">
      <p className="phase">
        <span className="spinner" aria-hidden="true" />
        {label}
        {showCount ? ` — ${job.pages_done} of ${job.pages_total}` : ''}
      </p>
      <div
        className="bar"
        role="progressbar"
        aria-label="Scan progress"
        {...(value !== null
          ? { 'aria-valuenow': value, 'aria-valuemin': 0, 'aria-valuemax': job.pages_total }
          : {})}
      >
        <div
          className={`bar-fill${value === null ? ' indeterminate' : ''}`}
          style={value !== null ? { width: `${(value / job.pages_total) * 100}%` } : undefined}
        />
      </div>
      <p className="hint">
        A scan reads about {job.pages_total} pages at one request per second, so this usually takes
        one to three minutes. Being deliberately slow is how the scanner avoids putting load on a
        live government service.
      </p>
    </div>
  );
}

function Result({ job }: { job: Job }) {
  const pct = job.score === null ? null : Math.round(job.score * 100);

  return (
    <div className="panel result">
      <h2>Assessment ready</h2>
      <p className="assessed-url">{job.url}</p>

      <dl className="stats">
        <div>
          <dt>Externally assessable score</dt>
          <dd>
            {pct === null ? 'n/a' : `${pct}%`}
            <small>of {job.assessed ?? 0} sub-requirements that could be judged</small>
          </dd>
        </div>
        <div>
          <dt>Needs human review</dt>
          <dd>
            {job.needs_review ?? 0}
            <small>a machine cannot decide these</small>
          </dd>
        </div>
        <div>
          <dt>Not assessable externally</dt>
          <dd>
            {job.not_assessable ?? 0}
            <small>require evidence held by the agency</small>
          </dd>
        </div>
      </dl>

      <p className="caveat">
        This is a quick scan of a small sample of pages. It is indicative only and is not
        comparable with the ranked leaderboard, which uses a deeper and identically sampled
        assessment.
      </p>

      <div className="actions">
        {job.report_url && (
          <a className="btn primary" href={job.report_url}>
            View the full report
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
      <h2>{job.status === 'rejected' ? 'That address was rejected' : 'The scan did not finish'}</h2>
      <p>{job.error ?? 'No further detail is available.'}</p>
    </div>
  );
}

export default function App() {
  const [url, setUrl] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<number | null>(null);
  const liveRegion = useRef<HTMLDivElement | null>(null);

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
      }, 2500);
    },
    [stopPolling],
  );

  useEffect(() => stopPolling, [stopPolling]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setJob(null);

    const trimmed = url.trim();
    if (!trimmed) {
      setError('Enter the address of an Australian government website.');
      return;
    }
    if (!looksLikeGovAu(trimmed)) {
      setError(
        'Only Australian government sites under gov.au can be assessed. Restricting this is also what stops the tool being used to send traffic anywhere else.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const created = await startScan(trimmed);
      setJob(created);
      if (created.status === 'queued' || created.status === 'running') poll(created.job_id);
    } catch (err) {
      if (err instanceof RequestFailed) setError(err.message);
      else setError('Could not reach the scanner. Please try again.');
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

      <header className="site-header">
        <div className="wrap">
          <p className="eyebrow">Independent · experimental</p>
          <h1>Digital Experience Policy scanner</h1>
          <p className="tagline">
            Assess an Australian government website against the{' '}
            <a href="https://www.digital.gov.au/policy/digital-experience">
              Digital Experience Policy
            </a>{' '}
            — 4 standards, 25 criteria.
          </p>
        </div>
      </header>

      <main id="main" className="wrap">
        <div className="disclaimer">
          <p>
            <strong>This is not an official assessment.</strong> It is not affiliated with or
            endorsed by the Digital Transformation Agency and does not determine compliance.
          </p>
          <p>
            The policy states almost no numeric thresholds, so most thresholds used here were set
            by this tool rather than the policy. Every report labels which is which.
          </p>
        </div>

        <form onSubmit={onSubmit} noValidate>
          <label htmlFor="url">Website address</label>
          <p id="url-hint" className="hint">
            Must be a gov.au address, for example <code>www.digital.gov.au</code>
          </p>
          <div className="field">
            <input
              id="url"
              name="url"
              type="text"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              placeholder="www.digital.gov.au"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-describedby="url-hint"
              {...(error ? { 'aria-invalid': true } : {})}
              disabled={busy}
            />
            <button className="btn primary" type="submit" disabled={submitting || busy}>
              {submitting ? 'Starting…' : 'Assess this site'}
            </button>
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </form>

        <div ref={liveRegion}>
          {busy && job && <Progress job={job} />}
          {job?.status === 'ready' && <Result job={job} />}
          {job && (job.status === 'failed' || job.status === 'rejected') && <Failure job={job} />}
        </div>

        <section className="explainer">
          <h2>What this can and cannot tell you</h2>
          <div className="cols">
            <div>
              <h3>Measured well</h3>
              <p>
                The two criteria where the policy supplies the rule rather than us: a feedback
                channel on <em>every</em> page, and the availability measures the policy names
                verbatim — error rate, load time and percentage of valid links. Plus
                machine-detectable accessibility issues, plain language, reflow on small screens,
                and whether interpreting and relay services are signposted.
              </p>
            </div>
            <div>
              <h3>Deliberately not claimed</h3>
              <p>
                Automated testing finds roughly a third of WCAG issues, so a pass means no
                machine-detectable violations, not conformance. Six of the 25 criteria are internal
                governance processes and are reported as not assessable rather than scored. The
                scanner never submits a form, so anything behind a transaction is out of reach.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <p>
            Source and methodology:{' '}
            <a href="https://github.com/ashwingur-dta/dxp-scanner">
              github.com/ashwingur-dta/dxp-scanner
            </a>
          </p>
          <p>
            Operating a site assessed here and want a correction or an exclusion? Open an issue on
            the repository.
          </p>
        </div>
      </footer>
    </>
  );
}
