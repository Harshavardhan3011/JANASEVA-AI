const assert=require('node:assert/strict');
const {mkdtemp,rm,mkdir}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('../backend/node_modules/playwright');
async function main(){
 const data=await mkdtemp(join(tmpdir(),'janaseva-certificates-')),frontend='http://127.0.0.1:5177';
 Object.assign(process.env,{NODE_ENV:'test',DATA_DIR:data,DATABASE_URL:'',INGESTION_DATABASE_URL:'',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',SCHEME_SYNC_WORKER:'false',FRONTEND_URL:frontend,LLM_API_KEY:'',TAVILY_API_KEY:'',SCHEME_SEARCH_API_KEY:'',Adminmail:'',AdminPass:''});
 const {default:app}=require('../backend/dist/app');const {closeDatabase}=require('../backend/dist/config/db');const {browserOptions}=require('../backend/dist/config/browser');
 const server=app.listen(0,'127.0.0.1');await new Promise(done=>server.once('listening',done));
 const api='http://127.0.0.1:'+server.address().port+'/api/v1';
 const vite=spawn(process.execPath,[resolve(__dirname,'../frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5177','--strictPort'],{cwd:resolve(__dirname,'../frontend'),env:{...process.env,VITE_API_URL:api},stdio:'ignore',windowsHide:true});
 let browser;
 try{
  const directory=await (await fetch(api+'/schemes/certificate-directory')).json();assert.equal(directory.data.states.length,36);assert.equal(directory.data.guides.length,41);
  const answer=await (await fetch(api+'/assistant/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'What documents and fee do I need for an income certificate in Andhra Pradesh?'})})).json();
  assert.equal(answer.data.certificate_guides.length,1);assert.equal(answer.data.certificate_guides[0].slug,'ap-income');assert.match(answer.data.reply,/₹12/);
  assert.ok(answer.data.matches.every(record=>record.record_type==='citizen_service'),'Certificate questions must not return unrelated scholarship cards');
  for(let i=0;i<80;i++){try{if((await fetch(frontend)).ok)break;}catch{}await new Promise(done=>setTimeout(done,250));}
  browser=await chromium.launch(browserOptions());const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.setDefaultNavigationTimeout(60000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(frontend+'/certificates');await page.getByRole('heading',{name:'Certificate guides and official links',exact:true}).waitFor();
  await page.getByLabel('Certificate type',{exact:true}).selectOption('income');await page.getByLabel('State or UT',{exact:true}).selectOption('Andhra Pradesh');
  await page.getByRole('link',{name:'Income certificate',exact:true}).first().waitFor();assert.equal(await page.getByRole('link',{name:'How and where to apply',exact:true}).count(),1);
  await page.goto(frontend+'/certificates/guides/income');await page.getByLabel('State or UT',{exact:true}).selectOption('Andhra Pradesh');await page.getByRole('heading',{name:'How to apply',exact:true}).waitFor();await page.getByText('IT returns / pay slips or other income proof',{exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Open official service portal',exact:false}).getAttribute('href'),'https://vswsonline.ap.gov.in/#/home');
  await page.getByText('Official SOP: ₹12. Confirm the current charge before payment.',{exact:false}).waitFor();
  await page.getByText('Official SOP service target: 7 days.',{exact:false}).waitFor();
  await page.reload();await page.getByRole('heading',{name:'Required documents and information',exact:true}).waitFor();
  await page.getByLabel('State or UT',{exact:true}).selectOption('Telangana');await page.getByText('Application form: marked not mandatory for Citizen Login',{exact:true}).waitFor();
  assert.ok(!(await page.locator('.workflow').innerText()).includes('₹12'),'AP fee is not reused in Telangana');
  await page.getByLabel('State or UT',{exact:true}).selectOption('Goa');await page.getByText('Stamp-paper affidavit for EWS purpose',{exact:true}).waitFor();
  await page.getByLabel('State or UT',{exact:true}).selectOption('Karnataka');await page.getByText('Available official guides for this certificate:',{exact:true}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Required documents and information',exact:true}).count(),0,'No district facts without district selection');
  await page.getByRole('link',{name:/Karnataka · Tumakuru district · District-specific/}).click();await page.getByRole('heading',{name:'Required documents and information',exact:true}).waitFor();
  await page.getByLabel('State or UT',{exact:true}).selectOption('Arunachal Pradesh');await page.getByRole('status').filter({hasText:'A detailed income certificate guide for Arunachal Pradesh'}).waitFor();assert.equal(await page.getByRole('heading',{name:'Required documents and information',exact:true}).count(),0,'Unsupported jurisdiction has one clear coverage state, no empty checklist');
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:900});await page.goto(frontend+'/certificates/guides/disability');await page.getByText('NIL (as stated by DEPwD)',{exact:false}).waitFor();
   assert.equal(await page.locator('html').evaluate(el=>el.scrollWidth),width,'Guide fits viewport');
  }
  await page.goto(frontend+'/ask?q='+encodeURIComponent('What documents do I need for a UDID disability certificate?'));await page.getByRole('button',{name:'Ask JANASEVA AI',exact:true}).click();
  await page.getByRole('link',{name:/Disability certificate.*View guide/}).waitFor();assert.match(await page.locator('article').innerText(),/Identity proof/);assert.match(await page.locator('article').innerText(),/depwd.gov.in/);
  await page.route('**/api/v1/schemes?*',route=>route.abort());await page.goto(frontend+'/certificates');await page.getByRole('button',{name:'Retry catalog',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Certificate guides and official links',exact:true}).waitFor();await page.getByRole('link',{name:'Income certificate',exact:true}).first().click();await page.getByRole('heading',{name:'Where to apply',exact:true}).waitFor();
  await page.getByLabel('State or UT',{exact:true}).selectOption('Arunachal Pradesh');assert.equal(await page.getByRole('link',{name:'Arunachal Pradesh government website',exact:false}).getAttribute('href'),'https://arunachalpradesh.gov.in/');
  assert.equal(await page.getByRole('link',{name:'Open official service portal',exact:false}).count(),0,'Directory must not invent an application link');
  await mkdir(resolve(__dirname,'../.data/certificates-ui'),{recursive:true});await page.screenshot({path:resolve(__dirname,'../.data/certificates-ui/guide-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: 41 entries / 16 official guides; state selector replaces generic guide; AP amounts and service target; Telangana scanned checklist; Goa conditional documents; district isolation; no empty sections for unsupported areas; reload; mobile; assistant; API outage fallback.');
 }finally{if(browser)await browser.close();vite.kill();await new Promise(done=>{server.close(done);server.closeAllConnections();});await closeDatabase();await rm(data,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
