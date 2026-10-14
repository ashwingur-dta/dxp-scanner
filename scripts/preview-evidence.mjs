import { readFileSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { rollup, runChecks } from '@dxp/checks';
import { renderReport } from '@dxp/report';

const f = readdirSync('out').filter((x) => x.endsWith('.evidence.json')).sort().pop();
const bundle = JSON.parse(readFileSync(`out/${f}`, 'utf8'));
const html = renderReport(rollup(bundle, runChecks(bundle)), bundle);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
await p.setContent(html, { waitUntil: 'load' });
const box = await p.locator('.evidence').boundingBox();
await p.screenshot({ path: '/tmp/evidence.png', clip: { x: 60, y: box.y - 20, width: 1000, height: Math.min(640, box.height + 40) } });
await b.close();
console.log('ok');
