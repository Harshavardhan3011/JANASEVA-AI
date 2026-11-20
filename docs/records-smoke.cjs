// Local browser verification with captured official evidence, never production inserts or email delivery.
const assert=require('node:assert/strict');
const {mkdtemp,rm,mkdir}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('../backend/node_modules/playwright');
async function main(){
 const directory=await mkdtemp(join(tmpdir(),'janaseva-record-ui-')),frontend='http://127.0.0.1:5176';
 Object.assign(process.env,{NODE_ENV:'test',DATA_DIR:directory,DATABASE_URL:'',INGESTION_DATABASE_URL:'',SCHEME_SYNC_WORKER:'false',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',FRONTEND_URL:frontend,
  SMTP_HOST:'smtp.fixture.test',SMTP_FROM:'sender@example.test',BREVO_API_KEY:'',APP_PUBLIC_URL:frontend,LLM_API_KEY:'',Adminmail:'admin@example.test',AdminPass:'AdminFixturePassword123!'});
 const outbox=[];require('../backend/node_modules/nodemailer').createTransport=()=>({sendMail:async mail=>{outbox.push(mail);}});
 const {database,closeDatabase}=require('../backend/dist/config/db');
 const {default:app}=require('../backend/dist/app');const {browserOptions}=require('../backend/dist/config/browser');
 const {recordFixture}=require('../backend/dist/tests/record.fixtures');const {captureDocument,editDraft,publishVersion}=require('../backend/dist/modules/catalog/catalog.repo');
 const server=app.listen(0,'127.0.0.1');await new Promise(done=>server.once('listening',done));
 const api='http://127.0.0.1:'+server.address().port+'/api/v1';
 const db=await database();await db.query('update public.scheme_catalog_sources set enabled=false');
 const call=async(path,method='GET',body,token)=>{const res=await fetch(api+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});const data=await res.json();assert.ok(res.ok,path+': '+JSON.stringify(data));return data.data;};
 const admin=await call('/auth/login','POST',{email:process.env.Adminmail,password:process.env.AdminPass});
 const ids={};for(const key of ['svamitva','pension-en','rules','faq','ap-service']){const fixture=recordFixture(key);const captured=await captureDocument(fixture.metadata,fixture.document,admin.user.id);await editDraft(captured.version.id,fixture.description,admin.user.id);ids[key]=await publishVersion(captured.version.id,admin.user.id,'Browser fixture reviewed against captured official source.');}
 await call('/auth/register','POST',{name:'Record Demo Citizen',email:'record-demo@example.test',password:'RecordDemoPassword123!'});
 const verifyToken=new URLSearchParams(new URL(outbox.at(-1).text.match(/http:\/\/[^\s]+/)[0]).hash.slice(1)).get('token');await call('/auth/verify-email','POST',{token:verifyToken});
 const vite=spawn(process.execPath,[resolve(__dirname,'../frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5176','--strictPort'],{cwd:resolve(__dirname,'../frontend'),env:{...process.env,VITE_API_URL:api},stdio:'ignore',windowsHide:true});
 let browser;
 try{
  for(let attempt=0;attempt<80;attempt++){try{if((await fetch(frontend)).ok)break;}catch{}if(attempt===79)throw Error('Vite did not start');await new Promise(done=>setTimeout(done,250));}
  browser=await chromium.launch(browserOptions());const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Browser error:',error.message);});
  const screenshots=resolve(__dirname,'../.data/records-ui');await mkdir(screenshots,{recursive:true});
  const fits=async()=>assert.equal(await page.locator('html').evaluate(element=>element.scrollWidth),page.viewportSize().width,'No horizontal page overflow');
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:900});let headerSize;
   for(const route of ['/','/schemes','/ask','/login','/register']) {
    await page.goto(frontend+route);const header=page.locator('.site-header');await header.getByRole('link',{name:'JANASEVA AI home',exact:true}).waitFor();
    assert.equal(await header.locator('.civic-brand svg').count(),1);const box=await header.boundingBox();
    if(headerSize)assert.deepEqual([box.x,box.width,box.height],headerSize);else headerSize=[box.x,box.width,box.height];
    await fits();if(width===390){await header.getByLabel('Toggle navigation',{exact:true}).click();await header.getByRole('navigation',{name:'Mobile navigation',exact:true}).getByRole('link',{name:'Explore Schemes',exact:true}).waitFor();await page.keyboard.press('Escape');assert.equal(await header.locator('.site-mobile-menu').getAttribute('open'),null);}
   }
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(frontend);await page.getByRole('button',{name:'Find a scheme',exact:true}).waitFor();await page.keyboard.press('Tab');await page.screenshot({path:join(screenshots,'home-desktop.png')});
  assert.equal(await page.getByRole('link',{name:'Browse schemes',exact:true}).count(),0);
  await page.goto(frontend+'/schemes');await page.getByRole('status').filter({hasText:'published records'}).waitFor();await fits();await page.screenshot({path:join(screenshots,'catalog-desktop.png')});
  await page.getByLabel('Information type',{exact:true}).selectOption('public_notice');await page.getByRole('status').filter({hasText:'1 published records'}).waitFor();
  await page.goto(frontend+'/schemes/'+ids.svamitva);await page.getByRole('heading',{name:'Agenda and announcement',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Apply on official portal',exact:true}).count(),0);await page.getByText('2026-11-20',{exact:true}).waitFor();
  await page.goto(frontend+'/schemes/'+ids['pension-en']);await page.getByText('2026-11-27',{exact:true}).waitFor();await page.getByText('2026-12-04',{exact:true}).waitFor();await page.getByText('Hearing time unspecified',{exact:true}).waitFor();
  await page.getByText('Registration deadline',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(screenshots,'pension-desktop.png')});
  await page.goto(frontend+'/ask');await page.getByRole('textbox',{name:'Your question',exact:true}).fill('Delhi Pension Adalat registration deadline and hearing date');await page.getByRole('button',{name:'Ask JANASEVA AI',exact:true}).click();await page.getByText(/Hearing time unspecified/).first().waitFor();
  await page.goto(frontend+'/login');await page.locator('[name=email]').fill('record-demo@example.test');await page.locator('[name=password]').fill('RecordDemoPassword123!');await page.locator('button[type=submit]').click();await page.waitForURL('**/dashboard');
  await page.goto(frontend+'/dashboard/profile');await page.getByLabel('State or UT',{exact:true}).fill('Andhra Pradesh');await page.getByLabel('District',{exact:true}).fill('Nandyal');await page.getByRole('button',{name:'Save profile',exact:true}).click();await page.getByRole('status').filter({hasText:'Profile saved.'}).waitFor();
  await page.goto(frontend+'/schemes/'+ids['ap-service']);await page.getByRole('button',{name:'Prepare a personal draft',exact:true}).click();await page.waitForURL('**/dashboard/drafts/*');
  await page.getByLabel('Full name *',{exact:true}).waitFor();assert.equal(await page.getByLabel('Full name *',{exact:true}).inputValue(),'Record Demo Citizen');assert.equal(await page.getByLabel('State or UT *',{exact:true}).inputValue(),'Andhra Pradesh');
  assert.equal(await page.getByLabel('Annual income (if required by the official form)',{exact:true}).inputValue(),'');await page.getByLabel('Purpose / request *',{exact:true}).fill('Income certificate for my application');await page.getByRole('button',{name:'I reviewed these details',exact:true}).click();await page.getByRole('status').filter({hasText:'Marked as reviewed'}).waitFor();assert.equal(await page.getByRole('button',{name:'Copy reviewed draft',exact:true}).isDisabled(),false);await page.screenshot({path:join(screenshots,'personal-draft-desktop.png')});
  await page.setViewportSize({width:390,height:844});for(const id of [ids.svamitva,ids['pension-en'],ids.rules,ids.faq,ids['ap-service']]){await page.goto(frontend+'/schemes/'+id);await page.getByRole('button',{name:'Refresh official information',exact:true}).waitFor();await fits();}
  await page.goto(frontend+'/schemes/'+ids['pension-en']);await page.getByText('Registration deadline',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(screenshots,'pension-mobile.png')});
  await page.goto(frontend+'/dashboard/drafts');await page.getByRole('link',{name:'Income Certificate',exact:true}).waitFor();await fits();
  await page.getByLabel('Toggle navigation',{exact:true}).click();await page.getByRole('navigation',{name:'Mobile navigation',exact:true}).getByRole('link',{name:'Explore Schemes',exact:true}).waitFor();await page.keyboard.press('Escape');await page.locator('header').getByText('My account',{exact:true}).click();await page.locator('header').getByRole('button',{name:'Log out',exact:true}).click();
  await page.goto(frontend+'/login');await page.locator('[name=email]').fill(process.env.Adminmail);await page.locator('[name=password]').fill(process.env.AdminPass);await page.locator('button[type=submit]').click();await page.waitForURL('**/admin');
  const editable=await call('/admin/schemes/'+ids['pension-en']+'/draft','POST',{},admin.token);await page.setViewportSize({width:390,height:844});await page.goto(frontend+'/admin/schemes?version='+editable.version_id);await page.getByRole('heading',{name:'Information type and structured details',exact:true}).waitFor();assert.equal(await page.getByLabel('Record type',{exact:true}).inputValue(),'public_notice');await fits();
  await page.goto(frontend+'/admin/sources');await page.getByRole('heading',{name:'Official source registry',exact:true}).waitFor();await page.getByText('Actual published coverage',{exact:true}).click();await fits();await page.screenshot({path:join(screenshots,'sources-mobile.png')});
  await page.setViewportSize({width:1440,height:1000});await page.goto(frontend+'/admin');await page.getByRole('heading',{name:'Administration',exact:true}).waitFor();await page.screenshot({path:join(screenshots,'admin-desktop.png')});
  assert.deepEqual(errors,[]);console.log('PASS: real official record fixtures on desktop/mobile; separate Adalat dates and unknown time; event without Apply; chat citations; profile-prefilled editable draft; admin evidence and actual coverage. Screenshots: .data/records-ui');
 }finally{if(browser)await browser.close();vite.kill();await new Promise(done=>{server.close(done);server.closeAllConnections();});await closeDatabase();await rm(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1});
