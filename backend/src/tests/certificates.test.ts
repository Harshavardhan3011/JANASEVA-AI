import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { certificateDirectory as directory,findCertificateGuides,certificateGuideAnswer } from '../modules/schemes/certificate-directory';

test('certificate directory coverage, official links and jurisdiction-safe answers',()=>{
 assert.deepEqual(JSON.parse(readFileSync(resolve(__dirname,'../../../frontend/src/data/certificate-directory.json'),'utf8')),directory,'Frontend-only Vercel build must ship the same public guide data');
 assert.equal(directory.states.length,36);
 assert.equal(new Set(directory.states.map(item=>item.state)).size,36);
 assert.equal(new Set(directory.guides.map(item=>item.slug)).size,directory.guides.length);
 assert.equal(directory.guides.filter(item=>item.level==='source_guide').length,16);
 for(const guide of directory.guides) {
  assert.ok(guide.steps.length);
  if(guide.level==='source_guide') {assert.ok(guide.sources.length);assert.ok(guide.checkedOn);}
  else {assert.equal(guide.documents.length,0);assert.equal(guide.applicationUrl,null);}
  for(const url of [...guide.sources.map(source=>source.url),...(guide.applicationUrl?[guide.applicationUrl]:[])]) {
   const parsed=new URL(url);assert.equal(parsed.protocol,'https:');assert.match(parsed.hostname,/\.(gov|nic)\.in$/);
  }
 }
 const ap=findCertificateGuides('What documents do I need for an income certificate in Andhra Pradesh?');
 assert.equal(ap[0].slug,'ap-income');assert.ok(certificateGuideAnswer(ap[0]).includes('pay slips'));
 assert.equal(ap.length,1,'A verified state guide must replace its empty directory fallback');
 assert.match(certificateGuideAnswer(ap[0]),/₹12/);
 assert.match(certificateGuideAnswer(ap[0]),/7 days/);
 const ts=findCertificateGuides('income certificate in Telangana');
 assert.equal(ts[0].slug,'ts-income');assert.equal(ts.length,1);
 assert.match(certificateGuideAnswer(ts[0]),/not mandatory for Citizen Login/);
 assert.ok(!certificateGuideAnswer(ts[0]).includes('₹12'));
 assert.ok(!findCertificateGuides('income certificate in Karnataka').some(guide=>guide.district),'District rules need an explicit district');
 assert.equal(findCertificateGuides('income certificate in Tumakuru Karnataka')[0].slug,'karnataka-tumakuru-income');
 const delhi=findCertificateGuides('income certificate in Delhi')[0];
 assert.match(certificateGuideAnswer(delhi),/14 days, another 21 days/);
 assert.ok(certificateGuideAnswer(ap[0]).includes('#page=4'));
 assert.ok(!findCertificateGuides('income certificate in Telangana').some(guide=>guide.state==='Andhra Pradesh'));
 assert.ok(!findCertificateGuides('birth certificate in Andhra Pradesh').some(guide=>guide.kind==='caste'));
 const disability=findCertificateGuides('Apply for a UDID disability certificate')[0];
 assert.equal(disability.slug,'disability');assert.ok(certificateGuideAnswer(disability).includes('Identity proof'));
 assert.ok(certificateGuideAnswer(disability).includes('depwd.gov.in'));
 const unknown=findCertificateGuides('EWS certificate')[0];
 assert.match(certificateGuideAnswer(unknown),/Local requirements have not yet been verified/);
 assert.match(certificateGuideAnswer(unknown),/Not specified in the official source/);
});
