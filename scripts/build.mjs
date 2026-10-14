import { cp, mkdir, rm, stat } from 'node:fs/promises';
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

await rm('dist', { recursive: true, force: true });
await mkdir('dist/api', { recursive: true });
await mkdir('dist/worker', { recursive: true });

await build({
  ...common,
  entryPoints: { index: 'packages/api/src/index.ts' },
  outdir: 'dist/api',
  external: ['@aws-sdk/*', ...BROWSER_EXTERNALS, 'playwright'],
});

await build({
  ...common,
  entryPoints: { index: 'packages/worker/src/index.ts' },
  outdir: 'dist/worker',
  external: ['@aws-sdk/*', ...BROWSER_EXTERNALS],
  alias: { playwright: 'playwright-core' },
});

for (const dep of WORKER_RUNTIME_DEPS) {
  await cp(`node_modules/${dep}`, `dist/worker/node_modules/${dep}`, {
    recursive: true,
    dereference: true,
  });
}

await rm('dist/worker/node_modules/playwright-core/.local-browsers', { recursive: true, force: true });

const zip = (dir, out) => {
  execFileSync('python3', ['-I', 'scripts/zip.py', dir, out], { stdio: 'inherit' });
};

zip('dist/api', 'dist/api.zip');
zip('dist/worker', 'dist/worker.zip');

const mb = async (p) => `${((await stat(p)).size / 1_000_000).toFixed(1)} MB`;
console.log(`\napi.zip     ${await mb('dist/api.zip')}`);
console.log(`worker.zip  ${await mb('dist/worker.zip')}  (Lambda limit: 250 MB unzipped)`);
