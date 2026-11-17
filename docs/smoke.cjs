const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('../backend/node_modules/playwright');

async function main() {
  const config = require('../backend/dist/config/browser.js');
  const browser = await chromium.launch(config.browserOptions());
  const base = process.env.JANASEVA_TEST_URL || 'http://localhost:5173';
  const fixtureDir = join(__dirname,'demo');
  mkdirSync(fixtureDir,{ recursive:true });
  try {
    const fixture = await browser.newPage();
    await fixture.setContent('<main style="font:44px Arial;padding:60px;background:white;color:black"><h1>SAMPLE INCOME CERTIFICATE</h1><p>Demonstration only</p><p>Annual Family Income: 180,000</p><p>Certificate number: DEMO-180K</p></main>');
    await fixture.locator('main').screenshot({ path:join(fixtureDir,'income-certificate.png') });
    await fixture.setContent('<main style="font:30px Arial;padding:30px"><h1>SAMPLE CLASS XII MARKSHEET</h1><p>Demonstration only</p><p>Student: Asha Student</p><p>Board percentile: 92</p></main>');
    await fixture.pdf({ path:join(fixtureDir,'marksheet.pdf') });
    await fixture.close();

    const page = await browser.newPage({ viewport:{ width:1440,height:1000 } });
    const uncaught = [];
    page.on('pageerror',error=>uncaught.push(error.message));
    await page.goto(base);
    await page.getByRole('heading',{name:'A clearer path to your college scholarship.'}).waitFor();
    if (process.env.JANASEVA_SCREENSHOT_DIR) {
      mkdirSync(process.env.JANASEVA_SCREENSHOT_DIR,{recursive:true});
      await page.screenshot({path:join(process.env.JANASEVA_SCREENSHOT_DIR,'janaseva-desktop.png')});
      const mobile = await browser.newPage({ viewport:{ width:390,height:844 },isMobile:true,deviceScaleFactor:1,hasTouch:true });
      await mobile.goto(base);
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth),390);
      await mobile.screenshot({path:join(process.env.JANASEVA_SCREENSHOT_DIR,'janaseva-mobile.png')});
      await mobile.close();
    }
    await page.getByRole('link',{name:'Start an application'}).click();
    await page.locator('[name=name]').fill('Asha Student');
    await page.locator('[name=email]').fill('asha-'+Date.now()+'@example.test');
    await page.locator('[name=password]').fill('LocalDemoPassword123!');
    await page.locator('[name=confirmPassword]').fill('LocalDemoPassword123!');
    await page.locator('button[type=submit]').click();
    await page.getByRole('link',{name:'Ask the scholarship assistant'}).click();
    await page.getByRole('button',{name:'Help me apply for a college scholarship'}).click();
    await page.getByRole('link',{name:/PM-USP CSSS Scheme Guidelines/}).first().waitFor();
    await page.getByRole('link',{name:'Schemes',exact:true}).click();
    await page.getByRole('heading',{name:'PM-USP CSSS',exact:true}).waitFor();
    await page.getByRole('link',{name:'Scheme Monitor'}).click();
    await page.getByRole('heading',{name:'Submit a village notice'}).waitFor();
    await page.getByRole('link',{name:'Telangana Department of Agriculture'}).waitFor();
    await page.getByRole('link',{name:'Schemes',exact:true}).last().click();
    const schemeSearch = page.getByRole('searchbox',{name:'Search schemes'});
    await schemeSearch.fill('unlisted scheme');
    await page.getByText('No schemes match your search.').waitFor();
    await schemeSearch.fill('pragati diploma');
    const externalScheme = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: /Pragati.*Diploma/ }) });
    const nspLink = externalScheme.getByRole('link', { name: 'Open on NSP' });
    await nspLink.waitFor();
    assert.equal(await nspLink.getAttribute('href'), 'https://scholarships.gov.in/All-Scholarships');
    assert.equal(await externalScheme.getByRole('button', { name: 'Start guided application' }).count(), 0);
    await externalScheme.getByText('Student deadline', { exact: true }).waitFor();
    await schemeSearch.fill('university students');
    await page.getByRole('link',{name:'Official guidelines'}).waitFor();
    assert.equal(await page.getByRole('link',{name:'Browse the National Scholarship Portal'}).getAttribute('href'),
      'https://scholarships.gov.in/All-Scholarships');
    await page.getByRole('button',{name:'Start guided application'}).click();
    for (const [name,value] of Object.entries({ name:'Asha Student',institution_name:'Example College',
      course_name:'B.Sc.',annual_family_income:'180000',board_percentile:'92' })) {
      await page.locator('[name='+name+']').fill(value);
    }
    for (const [name,value] of Object.entries({ regular_degree:'yes',recognized_institution:'yes',other_scholarship:'no',gap_after_class_xii:'no',fresh_first_year:'yes',board_listed:'yes' })) {
      await page.locator('[name='+name+']').selectOption(value);
    }
    await page.getByRole('button',{name:'Check eligibility'}).click();
    await page.getByRole('heading',{name:'Supporting evidence'}).waitFor();
    for (const [label,file] of [['Income certificate','income-certificate.png'],['Class XII marksheet','marksheet.pdf']]) {
      const block=page.locator('.document-block').filter({ has:page.getByText(label,{exact:true}) });
      await block.getByLabel(label).setInputFiles(join(fixtureDir,file));
      await block.getByRole('button',{name:'Upload and extract'}).click();
      await block.getByRole('button',{name:'Confirm I reviewed this document'}).click({timeout:70000});
      await block.getByText('Reviewed',{exact:true}).waitFor();
    }
    await page.getByRole('button',{name:'Prepare reviewed application'}).click();
    await page.getByLabel('I reviewed the dossier and authorize browser preparation.').check();
    await page.getByRole('button',{name:'Approve and fill mock form'}).click();
    await page.getByRole('img',{name:'Screenshot captured by Playwright in the mock scholarship portal'}).waitFor({timeout:60000});
    const finalCheck=page.getByLabel('I reviewed the form and authorize the demo submission.');
    assert.equal(await page.getByRole('button',{name:'Submit demo application'}).isEnabled(),false);
    await finalCheck.check();
    await page.getByRole('button',{name:'Submit demo application'}).click();
    const receipt = page.locator('.receipt strong');
    await receipt.waitFor({timeout:60000});
    assert.match(await receipt.innerText(),/^DEMO-[A-F0-9]{16}$/);
    await page.reload();
    await receipt.waitFor();
    await page.getByRole('link',{name:'View audit history'}).click();
    await page.getByText('checkpoint 2 approved',{exact:true}).waitFor();
    assert.deepEqual(uncaught,[]);
    console.log('Browser workflow passed from registration through the persisted demo receipt and audit history.');
  } finally {
    await browser.close();
  }
}
main().catch(error=>{ console.error(error);process.exitCode=1; });
