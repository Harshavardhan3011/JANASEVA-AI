// Isolated local integration test: emails are captured in memory, never delivered.
const assert = require('node:assert/strict');
const {mkdtemp, rm} = require('node:fs/promises');
const {tmpdir} = require('node:os');
const {join, resolve} = require('node:path');
const {spawn} = require('node:child_process');
const {chromium} = require('../backend/node_modules/playwright');

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'janaseva-auth-ui-'));
  const frontend = 'http://127.0.0.1:5175';
  Object.assign(process.env, {BREVO_API_KEY:'',NODE_ENV:'test', DATA_DIR:directory, DATABASE_URL:'', SUPABASE_URL:'',
    SUPABASE_SERVICE_ROLE_KEY:'', FRONTEND_URL:frontend, SMTP_HOST:'smtp.fixture.test',
    SMTP_FROM:'sender@example.test', APP_PUBLIC_URL:frontend, Adminmail:'', AdminPass:'', LLM_API_KEY:''});
  const outbox = [];
  require('../backend/node_modules/nodemailer').createTransport = () => ({sendMail:async mail => {outbox.push(mail);}});
  const {default:app} = require('../backend/dist/app');
  const {database, closeDatabase} = require('../backend/dist/config/db');
  const {browserOptions} = require('../backend/dist/config/browser');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(done => server.once('listening', done));
  const api = 'http://127.0.0.1:' + server.address().port + '/api/v1';
  await database();
  const vite = spawn(process.execPath, [resolve(__dirname, '../frontend/node_modules/vite/bin/vite.js'),
    '--host', '127.0.0.1', '--port', '5175', '--strictPort'], {
    cwd:resolve(__dirname, '../frontend'), env:{...process.env, VITE_API_URL:api}, stdio:'ignore', windowsHide:true});
  let browser;
  try {
    for (let attempt=0; attempt<80; attempt++) {
      try {if ((await fetch(frontend)).ok) break;} catch {}
      if (attempt===79) throw new Error('Vite did not start');
      await new Promise(done => setTimeout(done, 250));
    }
    browser = await chromium.launch(browserOptions());
    const page = await browser.newPage({viewport:{width:1280,height:900}});
    await page.clock.install();
    const errors=[];
    page.on('pageerror',error => errors.push(error.message));
    await page.goto(frontend);
    await page.getByRole('link',{name:'Log in',exact:true}).click();
    await page.getByRole('link',{name:'Create an account',exact:true}).click();
    const email='browser-owner@example.test', password='BrowserPassword123!';
    await page.locator('[name=name]').fill('Browser Owner');
    await page.locator('[name=email]').fill(email);
    await page.locator('[name=password]').fill(password);
    await page.locator('[name=confirmPassword]').fill(password);
    await page.locator('button[type=submit]').click();
    await page.getByRole('heading',{name:'Check your email',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Resend verification email',exact:true}).isDisabled(),true);
    await page.goto(frontend+'/dashboard');
    await page.waitForURL('**/login?next=*');
    const verificationURL=outbox.at(-1).text.match(/http:\/\/[^\s]+/)[0];
    await page.goto(verificationURL);
    await page.getByRole('heading',{name:'Confirm your email',exact:true}).waitFor();
    assert.equal((await (await database()).query('select email_verified_at from public.users where email=$1',[email])).rows[0].email_verified_at,null);
    await page.getByRole('button',{name:'Confirm',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Your email is verified'}).waitFor();
    await page.getByRole('link',{name:'Back to log in',exact:true}).click();
    async function login(pass,address=email) {
      await page.locator('[name=email]').fill(address);
      await page.locator('[name=password]').fill(pass);
      await page.locator('button[type=submit]').click();
    }
    await login(password);
    await page.getByRole('heading',{name:'Saved schemes',exact:true}).waitFor();
    await page.goto(frontend+'/schemes?q=PM-USP');
    await page.getByRole('button',{name:'Save',exact:true}).first().click();
    await page.getByRole('button',{name:'Remove saved',exact:true}).first().waitFor();
    await page.goto(frontend+'/dashboard');
    await page.getByRole('button',{name:'Remove saved',exact:true}).first().waitFor();
    const firstSaved=await page.getByRole('button',{name:'Remove saved',exact:true}).first().locator('xpath=ancestor::article').getByRole('heading').innerText();
    const secondEmail='browser-second@example.test';
    const registered=await fetch(api+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Second Browser Owner',email:secondEmail,password})});
    assert.equal(registered.status,201);
    const secondVerification=new URLSearchParams(new URL(outbox.at(-1).text.match(/http:\/\/[^\s]+/)[0]).hash.slice(1)).get('token');
    assert.equal((await fetch(api+'/auth/verify-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:secondVerification})})).status,200);
    await page.locator('header').getByText('My account',{exact:true}).click();
    await page.locator('header').getByRole('button',{name:'Log out',exact:true}).click();
    await page.goto(frontend+'/login');
    await page.goto(frontend+'/login?next='+encodeURIComponent('/admin/users'));
    await login(password,secondEmail);
    await page.waitForURL('**/dashboard');
    await page.getByText('Save a scheme from Explore Schemes to keep it here.',{exact:true}).waitFor();
    const secondSession=await page.evaluate(()=>localStorage.getItem('janaseva_token'));
    const catalogReply=await (await fetch(api+'/schemes')).json();
    const otherScheme=catalogReply.data.find(item=>item.scheme_name!==firstSaved);
    assert.ok(otherScheme);
    await fetch(api+'/citizen-schemes/watches/'+otherScheme.id,{method:'PUT',headers:{Authorization:'Bearer '+secondSession}});
    await page.goto(frontend+'/dashboard/saved');
    await page.reload();
    await page.getByRole('heading',{name:'Your saved schemes',exact:true}).waitFor();
    await page.getByRole('heading',{name:otherScheme.scheme_name,exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:firstSaved,exact:true}).count(),0);
    await page.goto(frontend+'/dashboard/profile');
    await page.getByRole('heading',{name:'My preferences',exact:true}).waitFor();
    await page.getByRole('textbox',{name:'Education',exact:true}).fill('Engineering');
    await page.getByRole('textbox',{name:'State or UT',exact:true}).fill('Karnataka');
    await page.getByRole('button',{name:'Save profile',exact:true}).click();
    await page.getByText('Profile saved.',{exact:true}).waitFor();
    await page.goto(frontend+'/dashboard/checklists');
    await page.reload();
    await page.getByRole('heading',{name:'My checklists',exact:true}).waitFor();
    await page.evaluate(()=>{const cached=JSON.parse(localStorage.getItem('janaseva_user'));cached.is_admin=true;localStorage.setItem('janaseva_user',JSON.stringify(cached));});
    await page.goto(frontend+'/admin/discovery');
    await page.getByRole('heading',{name:'Access denied',exact:true}).waitFor();
    await page.goto(frontend+'/');
    await page.getByText('My account',{exact:true}).click();
    await page.getByRole('button',{name:'Log out',exact:true}).click();
    await page.goto(frontend+'/login');
    await login(password);
    await page.getByRole('heading',{name:'Saved schemes',exact:true}).waitFor();
    const savedSection=page.locator('section').filter({has:page.getByRole('heading',{name:'Saved schemes',exact:true})});
    await savedSection.getByRole('heading',{name:firstSaved,exact:true}).waitFor();
    assert.equal(await savedSection.getByRole('heading',{name:otherScheme.scheme_name,exact:true}).count(),0);
    await page.locator('header').getByText('My account',{exact:true}).click();
    await page.locator('header').getByRole('button',{name:'Log out',exact:true}).click();
    await page.goto(frontend+'/login');
    await page.getByRole('link',{name:'Forgot password?',exact:true}).click();
    await page.getByRole('textbox',{name:'Email address',exact:true}).fill(email);
    await page.getByRole('button',{name:'Send reset link',exact:true}).click();
    await page.getByRole('status').filter({hasText:'If an eligible account exists'}).waitFor();
    const resetURL=outbox.at(-1).text.match(/http:\/\/[^\s]+/)[0];
    await page.goto(resetURL);
    await page.getByLabel('New password',{exact:true}).fill('ChangedBrowserPassword123!');
    await page.getByLabel('Confirm new password',{exact:true}).fill('ChangedBrowserPassword123!');
    await page.getByRole('button',{name:'Confirm',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Your password has been reset'}).waitFor();
    await login('ChangedBrowserPassword123!');
    await page.getByRole('heading',{name:'Saved schemes',exact:true}).waitFor();
    await page.getByRole('button',{name:'Remove saved',exact:true}).first().waitFor();
    await page.setViewportSize({width:390,height:844});
    await page.goto(frontend+'/');
    await page.getByText('My account',{exact:true}).first().click();
    await page.getByRole('button',{name:'Log out',exact:true}).first().click();
    await page.getByRole('link',{name:'Log in',exact:true}).click();
    await page.getByRole('link',{name:'Create an account',exact:true}).waitFor();
    await page.goto(frontend+'/schemes?q=PM-USP');
    await page.getByRole('link',{name:'Log in to save',exact:true}).first().click();
    await login('ChangedBrowserPassword123!');
    await page.getByRole('button',{name:'Following updates',exact:true}).waitFor();
    await page.goto(frontend+'/');
    await page.getByText('My account',{exact:true}).first().click();
    await page.getByRole('button',{name:'Log out',exact:true}).first().click();
    // A verified invited admin fixture checks the distinct admin redirect without changing production data.
    await (await database()).query("update public.users set role='admin',admin_source='invitation' where email=$1",[email]);
    await page.goto(frontend+'/login');
    await login('ChangedBrowserPassword123!');
    await page.getByRole('heading',{name:'Administration',exact:true}).waitFor();
    await page.waitForURL('**/admin');
    await page.goto(frontend+'/admin/users');
    await page.getByRole('heading',{name:'Invite an administrator',exact:true}).waitFor();
    for (const [path,heading] of [['/admin/schemes','Scheme catalog'],['/admin/review','Review changes'],['/admin/sources','Official sources'],['/admin/audit','Audit history']]) {
      await page.goto(frontend+path);
      await page.reload();
      await page.getByRole('heading',{name:heading,exact:true}).waitFor();
      assert.equal(await page.locator('html').evaluate(element=>element.scrollWidth),390);
    }
    await (await database()).query('update public.scheme_catalog_sources set enabled=false');
    await page.goto(frontend+'/admin/discovery');
    await page.getByRole('button',{name:'Sync now',exact:true}).click();
    await page.getByRole('status').filter({hasText:'queued'}).first().waitFor();
    assert.equal(await page.getByRole('button',{name:'Sync now',exact:true}).isDisabled(),true);
    await require('../backend/dist/modules/catalog/catalog.queue').processDiscoveryQueue();
    await page.getByText('admin · completed',{exact:true}).waitFor();
    await page.goto(frontend+'/');
    await page.getByText('My account',{exact:true}).click();
    await page.getByRole('button',{name:'Log out',exact:true}).click();
    await page.goto(frontend+'/schemes?q=PM-USP');
    await page.getByRole('link',{name:'Log in to save',exact:true}).first().click();
    await login('ChangedBrowserPassword123!');
    await page.getByRole('button',{name:'Following updates',exact:true}).waitFor();
    await page.route('**/auth/resend-verification',route=>route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({success:false,error:{code:'RATE_LIMITED',retryAfterSeconds:120}})}));
    const [restored]=await Promise.all([page.waitForResponse(response=>response.url()===api+'/auth/me'),page.goto(frontend+'/check-email?email='+encodeURIComponent(email))]);
    await restored.finished();
    await page.getByRole('heading',{name:'Check your email',exact:true}).waitFor();
    await page.waitForTimeout(200);
    await page.clock.fastForward(61000);
    await page.getByRole('button',{name:'Resend verification email',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Too many email requests'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Resend verification email',exact:true}).isDisabled(),true);
    await page.reload();
    assert.equal(await page.getByRole('button',{name:'Resend verification email',exact:true}).isDisabled(),true);
    assert.ok(Number((await page.getByRole('status').innerText()).match(/\d+/)[0])>100,'Server retry deadline survives refresh.');
    assert.deepEqual(errors,[]);
    console.log('PASS: desktop/mobile account navigation, pending gate, explicit verification, dashboard, save, reset, preserved saved schemes. Emails captured locally; production delivery unverified.');
  } finally {
    if (browser) await browser.close();
    vite.kill();
    await new Promise(done => {server.close(done);server.closeAllConnections();});
    await closeDatabase();
    await rm(directory,{recursive:true,force:true});
  }
}
main().catch(error => {console.error(error);process.exitCode=1;});
