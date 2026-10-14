# The target registry

Git is the source of truth for what the ranked leaderboard covers. Every scope decision —
adding a service, removing one, or marking one unscannable — is a change to a file in this
directory and therefore arrives as a reviewable pull request with a stated reason.

One YAML file per collection. Each file is a list under `targets:`.

```yaml
targets:
  - site_id: abs
    agency: Australian Bureau of Statistics
    service: abs.gov.au
    entry_url: https://www.abs.gov.au/
    status: active

  - site_id: ato
    agency: Australian Taxation Office
    service: ato.gov.au
    entry_url: https://www.ato.gov.au/
    status: excluded
    reason: ...
    checked_at: 2026-10-14
```

| Field | Required | Meaning |
| --- | --- | --- |
| `site_id` | yes | Stable slug, `[a-z0-9][a-z0-9-]*`. Becomes the S3 scorecard prefix, so renaming one orphans its history. |
| `agency` | yes | The entity accountable for the service under the policy. |
| `service` | yes | What was treated as the service, in the words a reader would use. |
| `entry_url` | yes | Where the crawl starts. Must be `https` and under `gov.au`. |
| `status` | yes | `active` or `excluded`. |
| `reason` | when excluded | Why it is out of scope, in plain words. Required so that an exclusion cannot be silent. |
| `checked_at` | no | Date the reachability claim behind `reason` was last verified. |

## How `status` is decided

Not by guesswork. The deployed service exposes `GET /api/reachable?url=...`, which probes
the target from the scanner's own network and reports whether the request was accepted:

```bash
curl -sG https://d3gzttk0pa47dz.cloudfront.net/api/reachable \
  --data-urlencode 'url=https://www.example.gov.au/'
```

Reachability is a property of a network location, not of a site. The deployed scanner runs
in `us-east-1`, and several of the sites marked `excluded` here serve ordinary users in
Australia perfectly well. An exclusion records what this scanner can reach, nothing more.

See [docs/coverage.md](../docs/coverage.md) for why roughly half of `gov.au` refuses
automated clients and why this project will not try to get around it.

## Choosing what goes in

The registry is picked for prominence — the services and departmental sites a reader would
expect to see ranked — and *then* probed. Selecting targets after probing would quietly
turn the leaderboard into a list of sites that happen to permit scanning, which is the
precise distortion the exclusion list exists to make visible.
