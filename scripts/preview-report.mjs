import { readFileSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { rollup, runChecks } from '@dxp/checks';
import { renderReport } from '@dxp/report';

const f = readdirSync('out').filter((x) => x.endsWith('.evidence.json')).sort().pop();
const bundle = JSON.parse(readFileSync(`out/${f}`, 'utf8'));
const html = renderReport(rollup(bundle, runChecks(bundle)), bundle);

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1100, height: 1400 }, deviceScaleFactor: 1 });
await p.setContent(html, { waitUntil: 'load' });
await p.screenshot({ path: '/tmp/report-top.png', clip: { x: 0, y: 0, width: 1100, height: 1150 } });
await p.evaluate(() => window.scrollTo(0, 1250));
await p.waitForTimeout(150);
await p.screenshot({ path: '/tmp/report-mid.png' });
console.log('source:', f);
await b.close();
