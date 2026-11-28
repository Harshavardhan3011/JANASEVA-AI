import { createHash } from 'node:crypto';
import { env } from '../../config/env';
import { describeScheme } from './catalog.ai';
import { createOfficialReader,readDocument } from './catalog.fetch';
import { compatibleScope,matchesSchemeName,sourceScope,ambiguousVariant } from './catalog.identity';
import { publisherForHost } from './catalog.publishers';
import { searchSchemeFields } from './catalog.search';
import { compact,descriptionSchema,officialSourceUrl,sections,verifyDescription } from './catalog.types';
import type { EvidenceSource,ImportMetadata,SchemeDescription,SourceDocument } from './catalog.types';
import { recordSchema,officialDate } from './record.schema';
import { database } from '../../config/db';

type Claim=SchemeDescription['overview'][number];
export const enrichmentFields=['overview','whoCanApply','eligibility','exclusions','documents','benefits','applicationSteps','fees','dates','contacts'] as const;
type Field=typeof enrichmentFields[number];
export interface EnrichmentReport {
 changedFields?:string[];
 checkedAt:string;mode:string;fields:Record<string,{status:'verified'|'unverified';sources:string[];note:string}>;
 attempts:Array<{url:string;status:string;reason?:string;fields?:string[];mode?:string}>;conflicts:string[];
}
export interface ExtractionOutcome {mode:string;providerError?:string}
const claimsFor=(description:SchemeDescription,field:Field):Claim[]=>field==='fees'?description.record?.facts.fees || []:description[field] || [];
export const missingFields=(description:SchemeDescription)=>enrichmentFields.filter(field=>!claimsFor(description,field).length);

// Extract only explicitly labelled source sections; no eligibility/date inference.
function extractPlainSections(meta:ImportMetadata,document:SourceDocument):SchemeDescription {
 const text=document.text;
 const result=descriptionSchema.parse({...Object.fromEntries(sections.map(key=>[key,[]])),status:'unknown',statusEvidence:null,reviewIssues:[]});
 const labels=[...text.matchAll(/^[ \t]*(?:\d{1,2}[.)][ \t]+)?(overview|about(?: the scheme)?|objectives?|scheme deliverable|benefits?|rate of scholarship|eligibility(?: criteria)?|who is eligible|who can apply|beneficiar(?:y|ies)|who is not eligible|exclusions?|required documents|documents required|documents|how to apply|procedure to apply|application process|contact(?: details| us)?)[ \t]*:?[ \t]*([^\n]*)/gim)];
 if(!labels.length)throw new Error('No reliable labelled sections were found; configure the AI provider for this source.');
 const add=(value:string)=>value.split(/\n\s*\n/).map(compact).filter(value=>value.length>=5).flatMap(value=>{
  const chunks=value.match(/.{1,1400}(?:\s|$)/g) || [];return chunks.map(quote=>({text:quote.trim(),quote:quote.trim()}));
 });
 for(let index=0;index<labels.length;index++){
  const match=labels[index],name=match[1].toLowerCase();
  const raw=(match[2]+'\n'+text.slice(match.index!+match[0].length,labels[index+1]?.index ?? text.length)).split(/Website\/Mobile App Policies|Content Owned by|Useful Links/i)[0].trim();
  const key=/^who is not|^exclusion/.test(name)?'exclusions':/^eligib|^who is eligible/.test(name)?'eligibility':/^who can|^beneficiar/.test(name)?'whoCanApply':/^benefit|^rate/.test(name)?'benefits':/document/.test(name)?'documents':/^how|^procedure|^application/.test(name)?'applicationSteps':/^contact/.test(name)?'contacts':'overview';
  result[key]=[...(result[key] || []),...add(raw)].slice(0,key==='overview'?4:key==='eligibility'?18:key==='applicationSteps'?15:10);
 }
 const start=text.toLowerCase().indexOf(meta.title.toLowerCase());
 const body=start>=0?text.slice(start+meta.title.length):text;
 if(!result.overview.length)result.overview=add(body.split('\n').filter(line=>compact(line).length>100 && !/^Date\s*:/i.test(line)).slice(0,1).join('\n')).slice(0,1);
 const titleQuote=compact(start>=0?text.slice(start,start+meta.title.length):document.originalTitle);
 const lines=text.split('\n');
 const authority=lines.find(line=>/department\s+name|^ministry of/i.test(line) && compact(line).length<350) || lines.find(line=>/government of|district administration/i.test(line) && compact(line).length>=8 && compact(line).length<350);
 const evidence=(quote:string)=>({text:compact(quote),quote:compact(quote)});
 result.record=recordSchema.parse({type:'scheme',title:{text:meta.title,quote:titleQuote},typeEvidence:evidence(titleQuote),authority:authority?{...evidence(authority),text:compact(authority.split('|').find(part=>/government of|department|ministry/i.test(part)) || authority)}:null});
 return result;
}

// A bounded extractive fallback for clearly labelled official guidelines. It does not infer
// eligibility or synthesize a missing rule, and is reported separately from model extraction.
export function extractLabelledDetails(meta:ImportMetadata,document:SourceDocument):SchemeDescription {
 const text=document.text;const result=descriptionSchema.parse({...Object.fromEntries(sections.map(key=>[key,[]])),status:'unknown',statusEvidence:null,reviewIssues:[]});
 if(!matchesSchemeName(text.slice(0,3500),meta))throw new Error('The source does not identify this scheme clearly enough for extraction.');
 const claim=(quote:string):Claim=>({text:compact(quote),quote});
 const chunks=(value:string)=>value.split(/\n\s*\n|\n\s*(?=[ivx]{1,5}\.\s)/).map(part=>part.trim()).filter(part=>part.length>=5 && compact(part).length<=1600).slice(0,10).map(claim);
 // Horizontal spacing only: a wrapped year ending in "23." is not a new numbered heading.
 const headings=[...text.matchAll(/^[ \t]*\d{1,2}\.[ \t]+([A-Z][^\n]{2,109})/gm)];
 if(!headings.some(heading=>/^eligibility/i.test(heading[1])) && !(/^(www\.)?scholarships\.gov\.in$/.test(new URL(document.url).hostname) && new URL(document.url).pathname==='/All-Scholarships'))return extractPlainSections(meta,document);
 for(let index=0;index<headings.length;index++) {
  const heading=headings[index],body=text.slice(heading.index!+heading[0].length,headings[index+1]?.index ?? text.length).trim();
  const key=/^objective|^about/i.test(heading[1])?'overview':/^eligibility/i.test(heading[1])?'eligibility':/^rate|^benefits|amount of/i.test(heading[1])?'benefits':/^procedure for application|^how to apply/i.test(heading[1])?'applicationSteps':/^documents|required documents/i.test(heading[1])?'documents':/^grievance|^contact/i.test(heading[1])?'contacts':null;
  if(key)result[key]=chunks(body).slice(0,key==='overview'?4:10);
 }
 if(!result.overview.length)result.overview=chunks(text.slice(0,800)).slice(0,1);
 for(const row of result.eligibility)if(/certificate.*(?:required|fresh)|(?:required|fresh).*certificate/i.test(row.text))result.documents.push(row);
 const contact=text.match(/Contact us:\s*([\s\S]{20,1200})/i);if(contact)result.contacts=chunks(contact[0]);
 const title=text.slice(0,text.indexOf('\n1.')>0?text.indexOf('\n1.'):500).trim().slice(0,700);
 const authority=text.match(/Department of Higher Education,\s*Ministry of Education/i)?.[0] || text.match(/Ministry of Education,\s*Government of India/i)?.[0];
 const record=recordSchema.parse({type:'scheme',title:{text:meta.title,quote:title},typeEvidence:{text:'Scholarship scheme',quote:title},authority:authority?claim(authority):null});
 const centralEvidence=text.match(/Ministry of Education,\s*Government of India/i)?.[0];
 if(centralEvidence)record.jurisdiction={level:'Central',state:null,district:null,localBody:null,evidence:claim(centralEvidence)};
 for(const line of text.split('\n')) {
  if(/Student Application\s+Open till/i.test(line)) {const value=officialDate(line.replace(/(\d{2})-(\d{2})-(20\d{2})/,'$1/$2/$3'));if(value){record.dates.push({kind:'application_deadline',value,time:null,timezone:'Asia/Kolkata',...claim(line)});result.dates.push(claim(line));}}
 }
 result.record=record;return result;
}

export async function extractDetails(meta:ImportMetadata,document:SourceDocument,requestedFields?:string[],outcome?:ExtractionOutcome) {
 if(env.LLM_API_KEY){try{const result=await describeScheme(meta,document.text,requestedFields);if(outcome)outcome.mode='AI with source validation';return result;}catch(error){
   try{const result=extractLabelledDetails(meta,document);if(outcome){outcome.mode='Labelled official excerpts (AI unavailable)';outcome.providerError=error instanceof Error?error.message.slice(0,300):'AI unavailable.';}return result;}catch{throw error;}
 }}
 if(outcome)outcome.mode='Labelled official excerpts';return extractLabelledDetails(meta,document);
}

export function stamp(description:SchemeDescription,url:string,scope:string|null,hash:string) {
 const result=structuredClone(description);const add=(row:Claim)=>({...row,sourceUrl:row.sourceUrl || url,sourceHash:row.sourceHash || hash,...(row.scope || scope?{scope:row.scope || scope!}: {})});
 for(const key of sections)result[key]=(result[key] || []).map(add);
 if(result.statusEvidence)result.statusEvidence=add(result.statusEvidence);
 if(result.record){for(const key of Object.keys(result.record.facts) as Array<keyof typeof result.record.facts>)result.record.facts[key]=result.record.facts[key].map(add);result.record.dates=result.record.dates.map(date=>({...date,...add(date)}));for(const key of ['title','authority','typeEvidence'] as const)if(result.record[key])result.record[key]=add(result.record[key]!);if(result.record.jurisdiction.evidence)result.record.jurisdiction.evidence=add(result.record.jurisdiction.evidence);}
 return result;
}
export function evidenceDocument(document:SourceDocument):EvidenceSource {
 return {url:document.url,text:document.text,title:document.originalTitle,fetchedAt:new Date().toISOString(),fingerprint:createHash('sha256').update(document.text).digest('hex'),scope:sourceScope(document.text),identityQuote:document.text.slice(0,1200),incomplete:document.incomplete};
}
function materiallyDifferent(a:Claim[],b:Claim[]) {
 const figures=(rows:Claim[])=>[...new Set(rows.flatMap(row=>compact(row.quote).match(/\d+(?:[.,]\d+)*/g) || []))].sort().join('|');
 const identical=a.length && b.length && b.every(row=>a.some(prior=>compact(prior.quote).includes(compact(row.quote)) || compact(row.quote).includes(compact(prior.quote))));
 return Boolean(a.length && b.length && !identical && (figures(a)!==figures(b) || !figures(a)));
}

export function preserveVerified(previous:SchemeDescription,incoming:SchemeDescription) {
 const result=structuredClone(previous);const conflicts:string[]=[];
 for(const key of sections) {
  if(!(result[key] || []).length)result[key]=incoming[key] || [];
  else if(!['overview','contacts','whoCanApply'].includes(key) && materiallyDifferent(result[key] || [],incoming[key] || []))conflicts.push(key+': the refreshed source differs from the verified version; retained for review.');
 }
 if(!result.record)result.record=incoming.record;
 else if(incoming.record) {
  for(const key of Object.keys(result.record.facts) as Array<keyof typeof result.record.facts>) {
   if(!result.record.facts[key].length)result.record.facts[key]=incoming.record.facts[key];
   else if(materiallyDifferent(result.record.facts[key],incoming.record.facts[key]))conflicts.push(key+': changed official figures need review.');
  }
  for(const date of incoming.record.dates){const before=result.record.dates.find(row=>row.kind===date.kind);if(!before)result.record.dates.push(date);else if(before.value!==date.value)conflicts.push(date.kind+': changed official date needs review.');}
 }
 if(previous.status!=='unknown' && incoming.status!==previous.status && incoming.status!=='unknown')conflicts.push('Application status changed; retained for review.');
 if(previous.status==='unknown'){result.status=incoming.status;result.statusEvidence=incoming.statusEvidence;}
 result.reviewIssues=[...new Set([...previous.reviewIssues,...incoming.reviewIssues,...conflicts])].slice(0,12);return result;
}

export async function enrichDetails(meta:ImportMetadata,primary:SourceDocument,initial:SchemeDescription,previousSources:EvidenceSource[]=[],extraUrls:string[]=[],initialOutcome?:ExtractionOutcome) {
 const primaryEvidence=evidenceDocument(primary);
 const description=stamp(initial,primary.url,sourceScope(primary.text),primaryEvidence.fingerprint);
 const sources=[primaryEvidence,...previousSources.filter(source=>source.url!==primary.url || source.fingerprint!==primaryEvidence.fingerprint)];
 const report:EnrichmentReport={checkedAt:new Date().toISOString(),mode:initialOutcome?.mode || (env.LLM_API_KEY?'AI with source validation':'Labelled official excerpts'),fields:{},attempts:[],conflicts:[]};
 if(initialOutcome?.providerError)report.attempts.push({url:primary.url,status:'provider-fallback',reason:initialOutcome.providerError,mode:initialOutcome.mode});
 const missing=missingFields(description);
 const candidates=[...(primary.links || []).filter(link=>/guideline|specification|faq|apply|amend|contact/i.test(link.title)).map(link=>link.url),...extraUrls];
 if(new URL(primary.url).hostname.replace(/^www\./,'')==='scholarships.gov.in' && /schemeGuidelines/i.test(primary.url))candidates.push('https://scholarships.gov.in/All-Scholarships');
 const {rows:registry}=await (await database()).query<{url:string}>(`select url from public.scheme_source_registry where approved and (jurisdiction=$1 or jurisdiction='India') and (lower(department)=lower($2) or lower(department)=lower($3)) limit 3`,[meta.state || 'India',meta.category,meta.issuer]);
 const originHost=new URL(primary.url).hostname.replace(/^www\./,'');
 const hosts=[...new Set([...( /education|scholarship/i.test(meta.issuer+' '+meta.title)?['education.gov.in']:[]),...registry.map(row=>new URL(row.url).hostname.replace(/^www\./,'')).filter(host=>host!==originHost),originHost])];
 if(missing.length)try{candidates.push(...await searchSchemeFields(meta.title,meta.state,missing,hosts));}catch{report.attempts.push({url:primary.url,status:'search-unavailable',reason:'Official search could not be completed; linked sources are still checked.'});}
 const read=createOfficialReader();
 for(const url of [...new Set(candidates)].filter(url=>url!==primary.url).slice(0,4)) {
  try {
   officialSourceUrl.parse(url);const document=await readDocument(read,url,meta.title);
   const state=publisherForHost(new URL(document.url).hostname)?.state;
   if(state && state!==meta.state)throw new Error('Jurisdiction mismatch: this official publisher serves another state.');
   if(meta.state && !state && !compact(document.text.slice(0,5000)).toLowerCase().includes(meta.state.toLowerCase()) && !(meta.state==='Andhra Pradesh' && new URL(document.url).hostname.endsWith('.ap.gov.in')))throw new Error('The opened source does not confirm this scheme’s state jurisdiction.');
   if(!matchesSchemeName(document.text.slice(0,4500),meta))throw new Error('Scheme identity was not confirmed in the opened source.');
   if(ambiguousVariant(meta.title,document.text))throw new Error('Multiple scheme variants need review before their fields can be merged.');
   const scope=sourceScope(document.text),baseScope=sourceScope(primary.text);
   if((baseScope || scope) && !compatibleScope(baseScope,scope))throw new Error('Applicable version is missing or incompatible with the primary source ('+(baseScope || 'unspecified')+').');
   const applicationPortal=/^(www\.)?scholarships\.gov\.in$/.test(new URL(document.url).hostname) && new URL(document.url).pathname==='/All-Scholarships';
   if(baseScope?.endsWith('onwards') && scope && !scope.endsWith('onwards') && !applicationPortal)throw new Error('This source is limited to '+scope+'; its applicability to the current application cycle needs review.');
   if(document.incomplete)throw new Error('The supplemental extraction is incomplete and requires review.');
   const evidence=evidenceDocument(document);
   const outcome:ExtractionOutcome={mode:''};
   const candidate=stamp(await extractDetails(meta,document,missingFields(description),outcome),document.url,scope,evidence.fingerprint);
   const check=verifyDescription(candidate,document.text,[evidence]);
   if(check.problems.length)throw new Error(check.problems.join(' '));
   if(candidate.reviewIssues.length)throw new Error('The supplemental extraction contains unresolved review issues.');
   const filled:string[]=[];
   if(description.record && candidate.record){
    if(!description.record.authority && candidate.record.authority){description.record.authority=candidate.record.authority;filled.push('authority');}
    if(!description.record.typeEvidence && candidate.record.type===description.record.type && candidate.record.typeEvidence){description.record.typeEvidence=candidate.record.typeEvidence;filled.push('classification');}
    if(!description.record.jurisdiction.evidence && candidate.record.jurisdiction.evidence){description.record.jurisdiction=candidate.record.jurisdiction;filled.push('jurisdiction');}
   }
   for(const field of enrichmentFields) {
    const before=claimsFor(description,field),after=claimsFor(candidate,field);
    if(!after.length)continue;
    if(missingFields(description).includes(field)) {
     if(field==='fees' && description.record)description.record.facts.fees=after;
     else if(field!=='fees')description[field]=after;
     if(field==='dates' && description.record && candidate.record)description.record.dates.push(...candidate.record.dates.filter(date=>!description.record!.dates.some(existing=>existing.kind===date.kind)));
     filled.push(field);
    } else if(!['overview','contacts','whoCanApply'].includes(field) && materiallyDifferent(before,after))report.conflicts.push(field+': differing figures or conditions in '+document.url+'; existing verified values retained.');
   }
   if(filled.length || report.conflicts.length){const existing=sources.findIndex(source=>source.url===evidence.url && source.fingerprint===evidence.fingerprint);if(existing>=0)sources[existing]=evidence;else sources.push(evidence);}
   report.attempts.push({url:document.url,status:filled.length?'enriched':'checked',fields:filled,mode:outcome.mode,...(outcome.providerError?{reason:outcome.providerError}:{})});
   if(outcome.mode.includes('excerpts') && !report.mode.includes('excerpts'))report.mode='AI and labelled official excerpts';
  }catch(error){const code=error instanceof Error?(error.cause as {code?:string}|undefined)?.code:undefined;const reason=error instanceof Error?(error.message+(code?' ('+code+')':'')).slice(0,300):'Source verification failed.';report.attempts.push({url,status:'unverified',reason});if(/version.*incompatible|current application cycle needs review|Jurisdiction mismatch|variants need review/i.test(reason))report.conflicts.push('Scope verification needs review for '+url+'. Existing values were preserved.');}
 }
 for(const field of enrichmentFields){const rows=claimsFor(description,field),verified=rows.length>0;report.fields[field]={status:verified?'verified':'unverified',sources:[...new Set(rows.map(row=>row.sourceUrl || primary.url))],note:verified?'Supported by captured official evidence.':'Could not verify from official sources'};}
 if(report.conflicts.length)description.reviewIssues=[...description.reviewIssues,...report.conflicts].slice(0,12);
 return {description,sources,report};
}
