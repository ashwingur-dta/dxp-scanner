import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const BROWSER_EXTERNALS = ['playwright-core', '@sparticuz/chromium', '@axe-core/playwright', 'axe-core'];

const WORKER_RUNTIME_DEPS = [
  'playwright-core',
  '@sparticuz/chromium',
  '@axe-core/playwright',
  'axe-core',
];

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: false,
  logLevel: 'warning',
  keepNames: false,
};

const BATCH_FUNCTIONS = [
  { name: 'dispatch', entry: 'packages/batch/src/dispatch.ts' },
  { name: 'aggregate', entry: 'packages/batch/src/aggregate.ts' },
];

await rm('dist', { recursive: true, force: true });
await mkdir('dist/api', { recursive: true });
await mkdir('dist/worker', { recursive: true });

await build({
  ...common,
  entryPoints: { index: 'packages/api/src/index.ts' },
  outdir: 'dist/api',
  external: ['@aws-sdk/*', ...BROWSER_EXTERNALS, 'playwright'],
});

for (const fn of BATCH_FUNCTIONS) {
  await mkdir(`dist/${fn.name}`, { recursive: true });
  await build({
    ...common,
    entryPoints: { index: fn.entry },
    outdir: `dist/${fn.name}`,
    external: ['@aws-sdk/*', ...BROWSER_EXTERNALS, 'playwright'],
  });
  await cp('targets', `dist/${fn.name}/targets`, { recursive: true });
}

await build({
  ...common,
  entryPoints: { index: 'packages/worker/src/index.ts' },
  outdir: 'dist/worker',
  external: ['@aws-sdk/*', ...BROWSER_EXTERNALS],
  alias: { playwright: 'playwright-core' },
});

const pkgVersion = (name) =>
  JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version;

await writeFile(
  'dist/worker/package.json',
  JSON.stringify(
    {
      name: 'dxp-worker-runtime',
      version: '0.1.0',
      private: true,
      dependencies: Object.fromEntries(WORKER_RUNTIME_DEPS.map((d) => [d, pkgVersion(d)])),
    },
    null,
    2,
  ),
);

execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--silent'], {
  cwd: 'dist/worker',
  stdio: 'inherit',
});

await rm('dist/worker/node_modules/playwright-core/.local-browsers', { recursive: true, force: true });
await rm('dist/worker/package-lock.json', { force: true });

const zip = (dir, out) => {
  execFileSync('python3', ['-I', 'scripts/zip.py', dir, out], { stdio: 'inherit' });
};

zip('dist/api', 'dist/api.zip');
zip('dist/worker', 'dist/worker.zip');
for (const fn of BATCH_FUNCTIONS) zip(`dist/${fn.name}`, `dist/${fn.name}.zip`);

const mb = async (p) => `${((await stat(p)).size / 1_000_000).toFixed(1)} MB`;
console.log(`\napi.zip        ${await mb('dist/api.zip')}`);
console.log(`worker.zip     ${await mb('dist/worker.zip')}  (Lambda limit: 250 MB unzipped)`);
for (const fn of BATCH_FUNCTIONS) {
  console.log(`${`${fn.name}.zip`.padEnd(14)} ${await mb(`dist/${fn.name}.zip`)}`);
}
