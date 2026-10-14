import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export type TargetStatus = 'active' | 'excluded';

export interface Target {
  site_id: string;
  agency: string;
  service: string;
  entry_url: string;
  status: TargetStatus;
  reason: string | null;
  checked_at: string | null;
  collection: string;
  source_file: string;
}

export interface Registry {
  targets: Target[];
  active: Target[];
  excluded: Target[];
}

const SITE_ID = /^[a-z0-9][a-z0-9-]{1,48}$/;

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const collapsed = value.replace(/\s+/g, ' ').trim();
  return collapsed.length > 0 ? collapsed : null;
}

export function parseTargetFile(sourceFile: string, body: string): Target[] {
  const doc = parse(body) as { collection?: unknown; targets?: unknown } | null;
  const collection = text(doc?.collection) ?? sourceFile.replace(/\.ya?ml$/, '');
  const rows = doc?.targets;

  if (!Array.isArray(rows)) {
    throw new Error(`${sourceFile}: expected a top-level "targets:" list`);
  }

  const problems: string[] = [];
  const targets: Target[] = [];

  rows.forEach((row, index) => {
    const where = `${sourceFile} entry ${index + 1}`;
    const entry = (typeof row === 'object' && row !== null ? row : {}) as Record<string, unknown>;

    const siteId = text(entry['site_id']);
    const agency = text(entry['agency']);
    const service = text(entry['service']);
    const entryUrl = text(entry['entry_url']);
    const status = text(entry['status']);
    const reason = text(entry['reason']);
    const checkedAtRaw = entry['checked_at'];
    const checkedAt =
      checkedAtRaw instanceof Date
        ? (checkedAtRaw.toISOString().split('T')[0] ?? null)
        : text(checkedAtRaw);

    if (!siteId || !SITE_ID.test(siteId)) {
      problems.push(`${where}: site_id must match ${SITE_ID.source}, got ${JSON.stringify(siteId)}`);
    }
    if (!agency) problems.push(`${where}: agency is required so a result can be attributed`);
    if (!service) problems.push(`${where}: service is required, naming what was treated as the service`);
    if (status !== 'active' && status !== 'excluded') {
      problems.push(`${where}: status must be "active" or "excluded", got ${JSON.stringify(status)}`);
    }
    if (status === 'excluded' && !reason) {
      problems.push(`${where}: an excluded target needs a reason, so that no exclusion is silent`);
    }

    let parsedUrl: URL | null = null;
    try {
      parsedUrl = new URL(entryUrl ?? '');
    } catch {
      problems.push(`${where}: entry_url is not a URL, got ${JSON.stringify(entryUrl)}`);
    }
    if (parsedUrl && parsedUrl.protocol !== 'https:') {
      problems.push(`${where}: entry_url must be https, got ${parsedUrl.protocol}`);
    }
    if (parsedUrl && !/(^|\.)gov\.au$/.test(parsedUrl.hostname.toLowerCase())) {
      problems.push(`${where}: entry_url must be under gov.au, got ${parsedUrl.hostname}`);
    }

    if (!siteId || !agency || !service || !parsedUrl || (status !== 'active' && status !== 'excluded')) {
      return;
    }

    targets.push({
      site_id: siteId,
      agency,
      service,
      entry_url: parsedUrl.href,
      status,
      reason,
      checked_at: checkedAt,
      collection,
      source_file: sourceFile,
    });
  });

  if (problems.length > 0) {
    throw new Error(`Invalid target registry:\n  - ${problems.join('\n  - ')}`);
  }

  return targets;
}

export function buildRegistry(files: { name: string; body: string }[]): Registry {
  const targets = files.flatMap((f) => parseTargetFile(f.name, f.body));

  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  for (const t of targets) {
    const previous = seen.get(t.site_id);
    if (previous) duplicates.push(`${t.site_id} appears in both ${previous} and ${t.source_file}`);
    seen.set(t.site_id, t.source_file);
  }
  if (duplicates.length > 0) {
    throw new Error(`Invalid target registry:\n  - ${duplicates.join('\n  - ')}`);
  }

  targets.sort((a, b) => a.site_id.localeCompare(b.site_id));

  return {
    targets,
    active: targets.filter((t) => t.status === 'active'),
    excluded: targets.filter((t) => t.status === 'excluded'),
  };
}

export function loadRegistry(dir: string): Registry {
  const names = readdirSync(dir)
    .filter((n) => /\.ya?ml$/.test(n))
    .sort();

  if (names.length === 0) {
    throw new Error(`No target registry files found in ${dir}`);
  }

  return buildRegistry(names.map((name) => ({ name, body: readFileSync(join(dir, name), 'utf8') })));
}
