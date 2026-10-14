import { chromium } from 'playwright';

export interface PdfOptions {
  html: string;
  footerTitle?: string;
  executablePath?: string;
  extraLaunchArgs?: string[];
}

export async function renderPdf({
  html,
  footerTitle = 'Digital Experience Policy assessment',
  executablePath,
  extraLaunchArgs = [],
}: PdfOptions): Promise<Buffer> {
  const browser = await chromium.launch({
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu', ...extraLaunchArgs],
    ...(executablePath ? { executablePath } : {}),
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
      headerTemplate: '<div></div>',
      footerTemplate:
        `<div style="width:100%;font:9px system-ui,sans-serif;color:#50595f;padding:0 14mm;display:flex;justify-content:space-between">
           <span>${footerTitle} — independent, not an official DTA assessment</span>
           <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
         </div>`,
    });
  } finally {
    await browser.close().catch(() => undefined);
  }
}
