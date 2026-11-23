// Read-only production data/page checks plus one public assistant question.
const assert=require('node:assert/strict');
const {resolve}=require('node:path');
const {mkdir}=require('node:fs/promises');
const {chromium}=require('../backend/node_modules/playwright');
async function main(){
 const frontend='https://frontend-alpha-five-81.vercel.app',api='https://janaseva-ai.onrender.com/api/v1';
 const json=async(path,init)=>{const response=await fetch(api+path,{...init,signal:AbortSignal.timeout(90000)});assert.equal(response.status,200,path);return response.json();};
 const directory=(await json('/schemes/certificate-directory')).data;
 assert.equal(directory.version,2);assert.equal(directory.guides.length,41);
 assert.equal(directory.guides.filter(guide=>guide.level==='source_guide').length,16);
 const {browserOptions}=require('../backend/dist/config/browser');
 const browser=await chromium.launch(browserOptions());
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(90000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(frontend+'/certificates/guides/income',{waitUntil:'domcontentloaded'});
  await page.getByLabel('State or UT',{exact:true}).selectOption('Andhra Pradesh');
  await page.getByText('IT returns / pay slips or other income proof',{exact:true}).waitFor();
  await page.getByText('Official SOP: ₹12. Confirm the current charge before payment.',{exact:false}).waitFor();
  await page.getByText('Official SOP service target: 7 days.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Open official service portal',exact:false}).getAttribute('href'),'https://vswsonline.ap.gov.in/#/home');
  await page.reload({waitUntil:'domcontentloaded'});await page.getByText('IT returns / pay slips or other income proof',{exact:true}).waitFor();
  await mkdir(resolve(__dirname,'../.data/certificates-live'),{recursive:true});await page.screenshot({path:resolve(__dirname,'../.data/certificates-live/ap-desktop.png')});
  await page.getByLabel('State or UT',{exact:true}).selectOption('Telangana');
  await page.getByText('Application form: marked not mandatory for Citizen Login',{exact:true}).waitFor();
  assert.ok(!(await page.locator('.workflow').innerText()).includes('₹12'));
  await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('html').evaluate(el=>el.scrollWidth),390);
  await page.getByLabel('State or UT',{exact:true}).selectOption('Goa');await page.getByText('Stamp-paper affidavit for EWS purpose',{exact:true}).waitFor();
  assert.equal(await page.locator('html').evaluate(el=>el.scrollWidth),390);await page.screenshot({path:resolve(__dirname,'../.data/certificates-live/goa-mobile.png')});
  assert.deepEqual(errors,[]);
  const answer=(await json('/assistant/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'What documents and fee are needed for an income certificate in Andhra Pradesh?'})})).data;
  assert.equal(answer.certificate_guides[0].slug,'ap-income');assert.equal(answer.certificate_guides.length,1);assert.match(answer.reply,/₹12/);assert.match(answer.reply,/EoDB%20SOP%20final.pdf#page=4/);
  assert.ok(answer.matches.every(record=>record.record_type==='citizen_service'));
  console.log(JSON.stringify({verifiedAt:new Date().toISOString(),frontend,api,directoryVersion:directory.version,guides:16,checks:['generic income → AP details','documented charge and service target','official APSeva link','direct reload','Telangana scanned checklist without AP fee','Goa conditional documents','mobile width','public assistant source and fee'],browserErrors:errors}));
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
