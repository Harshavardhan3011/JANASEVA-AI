const assert=require('node:assert/strict');
const {chromium}=require('../backend/node_modules/playwright');
const {browserOptions}=require('../backend/dist/config/browser');

async function main() {
 const browser=await chromium.launch(browserOptions());
 const base=process.env.JANASEVA_TEST_URL || 'http://localhost:5173';
 try {
   const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
   const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/schemes/locations',route=>route.fulfill({status:404,body:'Not found'}));
   await page.goto(base);
   await page.getByPlaceholder('Search schemes or ask a question').fill('scholarships');
   await page.getByRole('button',{name:'Find a scheme',exact:true}).click();
   await page.getByRole('heading',{name:'Explore schemes',exact:true}).waitFor();
   await page.getByRole('link',{name:'Official source',exact:true}).first().waitFor();
   assert.equal(await page.getByRole('combobox',{name:'State or UT',exact:true}).locator('option').count(),37);
   const navTop=(await page.locator('header nav').boundingBox()).y;
   await page.locator('main').evaluate(element=>{element.scrollTop=800;});
   assert.equal((await page.locator('header nav').boundingBox()).y,navTop);
   await page.getByRole('link',{name:'Ask AI',exact:true}).click();
   await page.getByRole('textbox',{name:'Your question',exact:true}).fill('Find scholarships for a third-year mechanical engineering student in Andhra Pradesh.');
   await page.getByRole('button',{name:'Ask JANASEVA AI',exact:true}).click();
   await page.getByRole('link',{name:'Official source',exact:true}).first().waitFor({timeout:60000});
   if (!process.env.JANASEVA_TEST_EMAIL || !process.env.JANASEVA_TEST_PASSWORD) {
   await page.goto(base+'/register');
   await page.locator('[name=name]').fill('Finder Test Citizen');
   await page.locator('[name=email]').fill('finder-'+Date.now()+'@example.test');
   await page.locator('[name=password]').fill('FinderTestPassword123!');
   await page.locator('[name=confirmPassword]').fill('FinderTestPassword123!');
   await page.locator('button[type=submit]').click();
   await page.getByRole('heading',{name:'Check your email',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Resend verification email',exact:true}).isDisabled(),true);
   assert.deepEqual(errors,[]);
   console.log('Public finder and pending registration passed. Run npm run test:auth-ui for isolated verified-account and reset checks.');
   return;
   }
   await page.goto(base+'/login');
   await page.locator('[name=email]').fill(process.env.JANASEVA_TEST_EMAIL);
   await page.locator('[name=password]').fill(process.env.JANASEVA_TEST_PASSWORD);
   await page.locator('button[type=submit]').click();
   await page.getByRole('heading',{name:'Saved schemes',exact:true}).waitFor();
   await page.route('**/citizen-schemes',async route=>{
     const response=await route.fetch();
     const body=await response.json();
     delete body.data.deadlines;delete body.data.recommendations;
     await route.fulfill({response,json:body});
   });
   await page.reload();
   await page.getByRole('heading',{name:'Saved schemes',exact:true}).waitFor();
   await page.unroute('**/citizen-schemes');
   await page.reload();
   await page.getByText('Optional profile — improve recommendations',{exact:true}).click();
   await page.getByRole('textbox',{name:'State or UT',exact:true}).fill('Andhra Pradesh');
   await page.getByRole('textbox',{name:'Occupation',exact:true}).fill('student');
   await page.getByRole('button',{name:'Save profile',exact:true}).click();
   await page.getByText('Profile saved.',{exact:true}).waitFor();
   await page.goto(base+'/schemes?q=PM-USP');
   await page.getByRole('button',{name:'Save',exact:true}).first().click();
   await page.getByRole('button',{name:'Remove saved',exact:true}).first().waitFor();
   await page.goto(base+'/dashboard');
   const saved=page.locator('section').filter({has:page.getByRole('heading',{name:'Saved schemes',exact:true})});
   await saved.getByRole('button',{name:'Remove saved',exact:true}).waitFor();
   await saved.getByRole('button',{name:'Remove saved',exact:true}).click();
   await page.getByText('Save a scheme from Explore Schemes to keep it here.',{exact:true}).waitFor();
   assert.equal(await page.locator('html').evaluate(element=>element.scrollWidth),390);
   assert.deepEqual(errors,[]);
   console.log('Mobile finder passed public search, public assistant, dashboard login, optional profile, saving and removal.');
 } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
