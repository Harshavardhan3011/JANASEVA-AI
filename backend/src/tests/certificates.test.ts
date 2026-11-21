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
