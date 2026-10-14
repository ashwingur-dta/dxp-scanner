import { useEffect, useState } from 'react';
import { SiteFooter, SiteHeader } from './App';
import { getLeaderboard, type Leaderboard as Board } from './api';

const COVERAGE_DOC =
  'https://github.com/ashwingur-dta/dxp-scanner/blob/main/docs/coverage.md';

function Ranked({ board }: { board: Board }) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Ranked assessments">
    <table className="leaderboard">
      <caption>
        Ranked assessments. {board.counts.ranked} of {board.counts.registry_total} targets in the
        registry. Built {new Date(board.generated_at).toLocaleDateString('en-AU')}.
      </caption>
      <thead>
        <tr>
          <th scope="col">Rank</th>
          <th scope="col">Service</th>
          <th scope="col">Agency</th>
          <th scope="col">Score</th>
          <th scope="col">Pages read</th>
          <th scope="col">Review</th>
          <th scope="col">Not assessable</th>
          <th scope="col">Report</th>
        </tr>
      </thead>
      <tbody>
        {board.entries.map((e) => (
          <tr key={e.site_id}>
            <th scope="row">
              {e.rank}
              {e.band_size > 1 ? <span className="equal"> equal, {e.band_size} sites</span> : null}
            </th>
            <td>{e.service}</td>
            <td>{e.agency}</td>
            <td className="score">
              {e.score_percent}%<span className="denom"> of {e.assessed} assessable</span>
            </td>
            <td className="num">
              {e.pages_assessed}<span className="denom"> of {e.pages_attempted}</span>
            </td>
            <td className="num">{e.needs_review}</td>
            <td className="num">{e.not_assessable}</td>
            <td>
              {e.report_url ? (
                <a href={e.report_url} aria-label={`Report for ${e.service}`}>
                  Report
                </a>
              ) : (
                'none'
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

function Unranked({ board }: { board: Board }) {
  return (
    <table className="unranked">
      <caption>
        Not ranked: {board.counts.dropped} of {board.counts.registry_total} targets, of which{' '}
        {board.counts.registry_excluded} could not be scanned at all.
      </caption>
      <thead>
        <tr>
          <th scope="col">Service</th>
          <th scope="col">Agency</th>
          <th scope="col">Why not ranked</th>
        </tr>
      </thead>
      <tbody>
        {board.dropped.map((d) => (
          <tr key={d.site_id}>
            <th scope="row">{d.service}</th>
            <td>{d.agency}</td>
            <td>{d.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Leaderboard() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getLeaderboard()
      .then((b) => live && setBoard(b))
      .catch((err: unknown) =>
        live && setError(err instanceof Error ? err.message : 'Could not load the leaderboard.'),
      );
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      <a className="skip" href="#main">
        Skip to main content
      </a>

      <SiteHeader current="leaderboard" />

      <main id="main" className="wrap">
        <div className="hero">
          <h1>Ranked leaderboard</h1>
          <p>Only comparable full assessments are ranked. Everything else is listed with its reason.</p>
        </div>

        <p className="disclaimer">
          <b>Not an official assessment.</b>
          {board
            ? ` ${board.threshold_provenance.tool} of ${
                board.threshold_provenance.policy + board.threshold_provenance.tool
              } thresholds behind these scores were set by this tool, not the policy.`
            : ''}
        </p>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        {!board && !error && (
          <p className="hint" role="status">
            Loading the leaderboard…
          </p>
        )}

        {board && (
          <>
            <ul className="method">
              <li>
                Ranks only {board.comparability.mode} assessments under rubric{' '}
                {board.comparability.rubric_version}, sampling policy{' '}
                {board.comparability.sampling_policy_version}, a{' '}
                {board.comparability.page_budget}-page budget and at least{' '}
                {board.comparability.min_pages_assessed} pages read. Anything else is listed below
                with its reason.
              </li>
              <li>
                Sites within {board.band_points} percentage points share a rank. The measurement is
                not precise enough for a strict order.
              </li>
              <li>
                {board.counts.registry_excluded} of {board.counts.registry_total} targets could not
                be scanned at all. A leaderboard drawn only from sites that permit scanning is in
                effect a ranking of agencies that do not use aggressive bot management.{' '}
                <a href={COVERAGE_DOC}>Which sites refuse, and why</a>.
              </li>
            </ul>

            {board.entries.length > 0 ? (
              <Ranked board={board} />
            ) : (
              <p className="hint">No assessment is currently comparable, so nothing is ranked.</p>
            )}

            {board.dropped.length > 0 && <Unranked board={board} />}
          </>
        )}
      </main>

      <SiteFooter />

    </>
  );
}
