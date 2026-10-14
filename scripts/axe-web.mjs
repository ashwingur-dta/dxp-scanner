import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const ROOT = 'apps/web/dist';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const LB = process.argv[2];

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (LB && url.pathname === '/reports/leaderboard.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(readFileSync(LB));
    return;
  }
  let p = url.pathname;
  if (!extname(p)) p = '/index.html';
  try {
    const body = readFileSync(join(ROOT, p));
    res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('nope');
  }
});
await new Promise((r) => server.listen(4173, r));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
let failed = 0;
for (const path of ['/', '/leaderboard']) {
  const page = await context.newPage();
  await page.goto(`http://localhost:4173${path}`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const bad = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  console.log(`${path.padEnd(14)} violations=${r.violations.length} critical/serious=${bad.length} incomplete=${r.incomplete.length}`);
  for (const v of r.violations) {
    console.log(`   [${v.impact}] ${v.id} (${v.nodes.length} nodes) ${v.nodes[0]?.target?.[0] ?? ''}`);
  }
  failed += bad.length;
  await page.close();
}
await context.close();
await browser.close();
server.close();
console.log(failed === 0 ? '\nGATE PASS: no critical or serious violations' : `\nGATE FAIL: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
