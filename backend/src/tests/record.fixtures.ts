import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../config/env';
import { compact,descriptionSchema } from '../modules/catalog/catalog.types';
import type { ImportMetadata,SourceDocument,SchemeDescription } from '../modules/catalog/catalog.types';
import { recordSchema } from '../modules/catalog/record.schema';

export interface OfficialFixture {id:string;document:SourceDocument;checkedOn:string;fixtureNote:string}
export const officialFixtures=JSON.parse(readFileSync(join(root,'backend/src/tests/fixtures/government-records.json'),'utf8')) as OfficialFixture[];
export function recordFixture(id:string):{document:SourceDocument;metadata:ImportMetadata;description:SchemeDescription} {
 const fixture=officialFixtures.find(row=>row.id===id)!;
 if (!fixture) throw new Error('Official fixture missing: '+id);
 const text=compact(fixture.document.text);
 const claim=(quote:string,wording=quote)=>{
  if (!text.includes(compact(quote))) throw new Error('Fixture quotation absent: '+quote);
  return {text:wording,quote:compact(quote)};
 };
 const description=descriptionSchema.parse({overview:[],whoCanApply:[],benefits:[],eligibility:[],documents:[],applicationSteps:[],dates:[],contacts:[],status:'unknown',statusEvidence:null,reviewIssues:[]});
 const record=recordSchema.parse({type:id==='svamitva'?'event':id.startsWith('pension')?'public_notice':id==='rules'?'regulatory_guide':id==='faq'?'faq':'citizen_service',originalLanguage:id==='pension'?'hi':'en'});
 const metadata:ImportMetadata={title:fixture.document.originalTitle,issuer:'Press Information Bureau',state:'',category:'Public notices',publicationDate:fixture.document.publicationDate,sourceId:fixture.document.sourceId,originalLanguage:record.originalLanguage};
 if(id==='svamitva') {
  const intro='The Ministry of Panchayati Raj will hold a Review Meeting on the SVAMITVA Scheme on 20th November 2026 at Bharat Mandapam, New Delhi.';
  description.overview=[claim(intro)];record.typeEvidence=claim(fixture.document.originalTitle);
  record.authority=claim('Ministry of Panchayati Raj');metadata.issuer=record.authority.text;
  record.title=claim(fixture.document.originalTitle);record.jurisdiction.level='Central';
  record.dates=[{kind:'event',value:'2026-11-20',time:null,timezone:'Asia/Kolkata',...claim(intro)}];
  record.facts.venue=[claim('Bharat Mandapam, New Delhi')];
  record.facts.agenda=[claim('The review meeting will provide a platform for the States/Union Territories to share their progress, achievements and best practices in drone surveys, ground verification of maps and issuance of Property Cards.')];
  record.related=[{title:'SVAMITVA',url:null,quote:intro}];
 } else if(id==='pension-en') {
  const hearing='Office of Principal Controller of Communication Accounts, Delhi, will hold a Pension Adalat on 4th December 2026';
  const deadline='For settlement of grievances related to pension, pensioners may register on or before 27.11.2026 through the following modes:';
  metadata.title='Delhi Pension Adalat';record.title=claim('Pension Adalat',metadata.title);
  description.overview=[claim(hearing)];record.typeEvidence=claim(hearing);
  record.authority=claim('Office of Principal Controller of Communication Accounts, Delhi');metadata.issuer=record.authority.text;
  metadata.state='Delhi';record.jurisdiction={level:'Central',state:'Delhi',district:null,localBody:null,evidence:record.authority};
  record.dates=[{kind:'hearing',value:'2026-12-04',time:null,timezone:'Asia/Kolkata',...claim(hearing)},
   {kind:'registration_deadline',value:'2026-11-27',time:null,timezone:'Asia/Kolkata',...claim(deadline)}];
  record.facts.audience=[claim('Pensioners of Department of Telecommunications, BSNL and MTNL units of Delhi circle, who are residing in Delhi NCR')];
  record.facts.venue=[claim('Conference Hall, Sanchar Lekha Bhawan, Office of Principal Controller of Communication Accounts, Prasad Nagar, New Delhi- 110005')];
  description.contacts=[claim('Toll Free Helpline No. 1800118119')];
  record.facts.grievanceChannels=[claim('eMail: cca.dl-dot[at]nic[dot]in')];
 } else if(id==='rules') {
  metadata.title='Social Security (Central) Rules, 2026';metadata.issuer='Ministry of Labour and Employment';metadata.category='Law and regulation';
  const title='These rules may be called the Social Security (Central) Rules, 2026.';
  description.overview=[claim(title)];record.title=claim(title,metadata.title);record.typeEvidence=claim(title);
  record.authority=claim('MINISTRY OF LABOUR AND EMPLOYMENT');record.jurisdiction.level='Central';
  record.dates=[{kind:'publication',value:'2026-05-08',time:null,timezone:'Asia/Kolkata',...claim('New Delhi, the 8th May, 2026')},
   {kind:'effective',value:'2026-05-08',time:null,timezone:'Asia/Kolkata',...claim('They shall come into force on the date of their publication in the Official Gazette.')}];
  record.facts.referenceNumber=[claim('G.S.R. 344(E).')];record.facts.effectiveConditions=[claim('They shall come into force on the date of their publication in the Official Gazette.')];
  description.reviewIssues=['Only the opening Gazette excerpt is captured; the full bilingual document must be reviewed.'];
 } else if(id==='faq') {
  metadata.title='Social Security Rules FAQ';metadata.issuer='Ministry of Labour and Employment';metadata.category='Law and regulation';
  const question='FAQ 1: Are all procedures under the Social Security Rules mandatory in digital mode?';
  description.overview=[claim(question)];record.title=claim(question,metadata.title);record.typeEvidence=claim(question);
  record.related=[{title:'Social Security Rules',url:null,quote:question}];
  description.reviewIssues=['This explanatory FAQ predates the final May rules. Check the Gazette if its guidance differs.'];
 } else if(id==='ap-service') {
  metadata.title='Income Certificate';metadata.issuer='Tahsildar/Deputy Tahsildar of Revenue Department';metadata.category='Citizen services';metadata.state='Andhra Pradesh';
  record.title=claim('Income Certificate');record.typeEvidence=claim('Income Certificate');
  record.authority=claim(metadata.issuer);record.jurisdiction.level='State';record.jurisdiction.state=metadata.state;
  description.overview=[claim('Anyone who wants an Income Certificate')];
  description.documents=[claim('Copy of IT Returns/Pay Slips (Any other documents for income proof)'),claim('Ration Card/EPIC Card/Aadhar Card')];
  record.facts.processingTime=[claim('7 days')];record.facts.fees=[claim('Fee & mode of payment 12/-','12/-')];
  record.facts.applicationChannels=[claim('https://vswsonline.ap.gov.in/#/home')];
  description.applicationSteps=[claim('The citizen visits the APSEVA portal and clicks on Citizen Login.')];
  description.reviewIssues=['The source is an older service manual. Confirm fees and processing time with the issuing authority before applying.'];
 }
 description.record=record;
 return {document:fixture.document,metadata,description};
}
