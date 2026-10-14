import { chromium } from 'playwright';

const URL = 'https://d3gzttk0pa47dz.cloudfront.net';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${URL}?t=${Date.now()}`, { waitUntil: 'load' });
console.log('loaded:', await page.title());

console.log('\n-- keyboard reachability from a fresh load --');
await page.keyboard.press('Tab');
console.log('first tab stop:', await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 40)));

console.log('\n-- client-side gov.au validation --');
await page.getByLabel('Website address').fill('https://example.com/');
await page.getByRole('button', { name: /assess this site/i }).click();
await page.getByRole('alert').waitFor({ timeout: 5000 });
console.log('rejected non-gov.au:', (await page.getByRole('alert').textContent())?.slice(0, 80));

console.log('\n-- real scan through the UI --');
await page.getByLabel('Website address').fill('https://www.abs.gov.au/about');
await page.getByRole('button', { name: /assess this site/i }).click();

const progress = page.getByRole('status');
const ready = page.getByRole('heading', { name: /assessment ready/i });

await Promise.race([
  progress.waitFor({ timeout: 25000 }).then(() => 'progress'),
  ready.waitFor({ timeout: 25000 }).then(() => 'ready'),
])
  .then(async (which) => {
    if (which === 'progress') {
      console.log('progress shown:', (await progress.textContent())?.replace(/\s+/g, ' ').slice(0, 70));
    } else {
      console.log('returned a cached result immediately (deduplicated)');
    }
  });

await ready.waitFor({ timeout: 300000 });
console.log('result rendered');

const stats = await page.locator('.stats div').allTextContents();
for (const s of stats) console.log('  ', s.replace(/\s+/g, ' ').trim().slice(0, 90));

const report = page.getByRole('link', { name: /view the full report/i });
const pdf = page.getByRole('link', { name: /download pdf/i });
console.log('report link:', await report.getAttribute('href'));
console.log('pdf link:   ', await pdf.getAttribute('href'));

console.log('\nconsole errors:', errors.length ? errors : 'none');
await browser.close();
