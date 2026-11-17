import { chromium } from 'playwright';
import { createHmac } from 'node:crypto';
import { env } from '../../config/env';
import { portalSecret } from '../../config/secrets';
import { browserOptions } from '../../config/browser';
import { Applicant } from '../eligibility/eligibility.engine';

export class BrowserAutomationService {
  static async execute(id: string, data: Applicant, mode: 'fill' | 'submit') {
    const portal = new URL(env.MOCK_PORTAL_URL);
    const target = new URL('/demo/apply/' + id, portal);
    const signature = createHmac('sha256',await portalSecret()).update(mode+':'+id).digest('hex');
    const browser = await chromium.launch(browserOptions());
    try {
      const page = await browser.newPage({ viewport:{ width:1100,height:880 }, serviceWorkers:'block' });
      page.setDefaultTimeout(env.BROWSER_TIMEOUT);
      await page.route('**/*',route => {
        if (new URL(route.request().url()).origin !== portal.origin) return route.abort();
        return route.continue({ headers:{ ...route.request().headers(), 'x-janaseva-mode':mode, 'x-janaseva-signature':signature } });
      });
      const response = await page.goto(target.href,{ waitUntil:'domcontentloaded' });
      if (!response?.ok() || page.url() !== target.href) throw new Error('Mock portal form unavailable');
      const fields = {
        applicant_name:data.name, institution_name:data.institution_name, course_name:data.course_name,
        board_percentile:data.board_percentile, annual_income:data.annual_family_income,
      };
      for (const [name,value] of Object.entries(fields)) {
        const input = page.locator('#'+name);
        await input.fill(String(value));
        if (await input.inputValue() !== String(value)) throw new Error('Mock portal field validation failed');
      }
      await page.locator('#evidence_reviewed').check();
      if (!await page.locator('form').evaluate(element => (element as unknown as { checkValidity():boolean }).checkValidity())) {
        throw new Error('Mock portal rejected the form');
      }
      if (mode === 'fill') return { screenshot:await page.screenshot({ fullPage:true }), reference:null };
      const expected = new URL('/demo/receipt/'+id, portal).href;
      await Promise.all([page.waitForURL(expected,{ waitUntil:'domcontentloaded' }),page.getByRole('button',{ name:'Submit demo application' }).click()]);
      const reference = (await page.locator('#acknowledgement-ref-code').innerText()).trim();
      if (!/^DEMO-[A-F0-9]{16}$/.test(reference)) throw new Error('Mock portal receipt is invalid');
      return { reference, screenshot:await page.screenshot({ fullPage:true, timeout:5000 }).catch(() => null) };
    } finally {
      await browser.close().catch(() => {});
    }
  }
}
