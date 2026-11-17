const express = require('express');
const { createHmac, timingSafeEqual } = require('node:crypto');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const app = express();
require('../backend/node_modules/dotenv').config({ path:join(__dirname,'../.env'),quiet:true });
const directory = join(process.env.DATA_DIR || join(__dirname,'..','.data'),'receipts');
const port = Number(process.env.MOCK_PORTAL_PORT || 3002);
app.use(express.urlencoded({ extended:false,limit:'12kb' }));
app.use((_req,res,next) => {
  res.set('Cache-Control','no-store');
  res.set('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
  next();
});
function portalSecret() {
  if (process.env.PORTAL_SECRET) return process.env.PORTAL_SECRET;
  try { return readFileSync(join(directory,'..','portal-secret'),'utf8'); } catch { return ''; }
}
function authorized(req, requiredMode) {
  const secret = portalSecret();
  if (!secret) return false;
  const { id } = req.params;
  const mode = req.get('x-janaseva-mode');
  const proof = req.get('x-janaseva-signature') || '';
  if (!/^[a-f0-9-]{36}$/.test(id) || !['fill','submit'].includes(mode) ||
    (requiredMode && mode !== requiredMode) || !/^[a-f0-9]{64}$/.test(proof)) return false;
  return timingSafeEqual(createHmac('sha256',secret).update(mode+':'+id).digest(),Buffer.from(proof,'hex'));
}
const html = (heading,body) => `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading} | JANASEVA Demo Portal</title>
<style>body{margin:0;background:#f1f6f9;color:#102a43;font:16px system-ui}main{max-width:720px;margin:42px auto;padding:34px;background:#fff;border:1px solid #d7e4ed;border-radius:18px}
header{color:#0c6c6c;font-weight:bold;letter-spacing:1px;font-size:.8rem}h1{font-size:2rem}p{color:#486581;line-height:1.5}
label{display:grid;gap:6px;margin:14px 0;font-weight:600}input{font:inherit;padding:10px;border:1px solid #9fb3c8;border-radius:6px}button{background:#0d47a1;color:#fff;font:inherit;padding:12px 18px;border:0;border-radius:7px}
code{font-size:1.35rem;color:#066765}label.check{display:flex;align-items:center;gap:10px}</style>
<main><header>JANASEVA AI · DEMONSTRATION PORTAL</header><h1>${heading}</h1>${body}</main></html>`;
app.get('/',(_req,res) => res.send(html('Scholarship demo portal','<p>Open a scholarship application in JANASEVA AI to use this simulated portal.</p>')));
app.get('/demo/apply/:id',(req,res) => {
  if (!authorized(req)) return res.sendStatus(403);
  const field = (name,label,attributes='') => `<label>${label}<input required name="${name}" id="${name}" ${attributes}></label>`;
  return res.send(html('Review your PM-USP CSSS demo form',`
    <p>This simulation uses your prepared application data. The National Scholarship Portal is separate.</p>
    <form method="post" action="/demo/submit/${req.params.id}">
      ${field('applicant_name','Applicant name','maxlength="120"')}
      ${field('institution_name','Institution','maxlength="180"')}
      ${field('course_name','Degree course','maxlength="120"')}
      ${field('board_percentile','Class XII board percentile','type="number" min="0" max="100" step="any"')}
      ${field('annual_income','Annual family income (₹)','type="number" min="0" step="1"')}
      <label class="check"><input id="evidence_reviewed" required type="checkbox" name="evidence_reviewed"> Income certificate and marksheet reviewed</label>
      ${req.get('x-janaseva-mode') === 'submit' ? '<button>Submit demo application</button>' : '<p>Waiting for final approval in JANASEVA AI.</p>'}
    </form>`));
});
app.post('/demo/submit/:id',(req,res) => {
  if (!authorized(req,'submit')) return res.sendStatus(403);
  const { applicant_name,institution_name,course_name,board_percentile,annual_income,evidence_reviewed } = req.body;
  const textValid = [applicant_name,institution_name,course_name].every(v => typeof v === 'string' && v.trim().length >= 2 && v.length <= 180);
  if (!textValid || !board_percentile || !annual_income || !(Number(board_percentile)>80 && Number(board_percentile)<=100) ||
      !(Number.isInteger(Number(annual_income)) && Number(annual_income)>=0 && Number(annual_income)<=450000) ||
      evidence_reviewed !== 'on') return res.sendStatus(422);
  mkdirSync(directory,{ recursive:true });
  const ref = 'DEMO-'+createHmac('sha256',portalSecret()).update('receipt:'+req.params.id).digest('hex').slice(0,16).toUpperCase();
  try {
    writeFileSync(join(directory,req.params.id+'.txt'),ref,{ flag:'wx',mode:0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  return res.redirect(303,'/demo/receipt/'+req.params.id);
});
app.get('/demo/receipt/:id',(req,res) => {
  if (!authorized(req,'submit')) return res.sendStatus(403);
  let reference;
  try { reference = readFileSync(join(directory,req.params.id+'.txt'),'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return res.sendStatus(404); throw error; }
  return res.send(html('Demo application received',`<p>Demonstration reference</p><code id="acknowledgement-ref-code">${reference}</code>`));
});
if (require.main === module) app.listen(port,'127.0.0.1',() => console.log('Mock scholarship portal running on port '+port));
module.exports = app;
