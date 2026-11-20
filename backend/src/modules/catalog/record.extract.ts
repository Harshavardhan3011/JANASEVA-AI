import { descriptionSchema,claimSchema,sections,compact } from './catalog.types';
import type { ImportMetadata,SchemeDescription } from './catalog.types';
import { inferredType,officialDate,recordSchema,recordDateSchema,dateKinds,factKeys } from './record.schema';

export function sourcePreview(meta:ImportMetadata,text:string):SchemeDescription {
  const lines=text.split(/\n+/).map(compact).filter(line=>line.length>=5 && line.length<=2400);
  const record=recordSchema.parse({type:inferredType(meta.title),originalLanguage:meta.originalLanguage || 'und'});
  const evidence=(quote:string)=>({text:quote.slice(0,1600),quote});
  const titleLine=lines.find(line=>line.includes(meta.title));
  if (titleLine) record.title=evidence(titleLine);
  const issuer=lines.find(line=>line.includes(meta.issuer));if (issuer) record.authority=evidence(issuer);
  for (const line of lines) {
    const value=officialDate(line,meta.publicationDate || null);
    if (!value) continue;
    const kind=/posted on|published on|प्रकाशित/iu.test(line)?'publication':
      /register|registration|पंजीकरण|last date|deadline|अंतिम तिथि/iu.test(line)?'registration_deadline':
      /adalat|hearing|अदालत|सुनवाई/iu.test(line)?'hearing':/meeting|बैठक|tomorrow/iu.test(line)?'event':null;
    if (kind && !record.dates.some(date=>date.kind===kind)) record.dates.push({kind,value,time:null,timezone:'Asia/Kolkata',...evidence(line)});
  }
  const description=descriptionSchema.parse(Object.fromEntries([
    ...sections.map(section=>[section,section==='overview' && lines.length?[evidence(titleLine || lines[0])]:[]]),
    ['status','unknown'],['statusEvidence',null],['reviewIssues',[]],['record',record],
  ]));
  return description;
}

export function parseExtractedDescription(raw:unknown,meta:ImportMetadata,text:string) {
  if (!raw || typeof raw!=='object' || Array.isArray(raw)) return descriptionSchema.parse(raw);
  const value={...raw} as Record<string,unknown>;
  const problems:string[]=[];
  // Salvage valid individual claims rather than losing the whole extraction to one malformed row.
  for (const section of sections) {
    if (!Array.isArray(value[section])) continue;
    value[section]=(value[section] as unknown[]).flatMap((item,index)=>{
      const parsed=claimSchema.safeParse(item);
      if (parsed.success) return [parsed.data];
      problems.push(section+' item '+(index+1)+' was invalid and needs source review.');return [];
    });
  }
  if (!value.record && inferredType(meta.title)!=='scheme') value.record=sourcePreview(meta,text).record;
  if (value.record && typeof value.record==='object' && !Array.isArray(value.record)) {
    const record={...value.record} as Record<string,unknown>;
    for (const key of ['title','authority','typeEvidence']) if (record[key]!==undefined && record[key]!==null) {
      const result=claimSchema.safeParse(record[key]);
      if(result.success)record[key]=result.data;
      else {record[key]=null;problems.push(key+' needs source evidence before automatic publication.');}
    }
    if (record.facts && typeof record.facts==='object' && !Array.isArray(record.facts)) {
      const facts={...record.facts} as Record<string,unknown>;
      for (const key of factKeys) if (Array.isArray(facts[key])) facts[key]=(facts[key] as unknown[]).flatMap((item,index)=>{
        const result=claimSchema.safeParse(item);if(result.success)return [result.data];
        problems.push(key+' item '+(index+1)+' needs a complete source quotation.');return [];
      });
      record.facts=facts;
    }
    if (Array.isArray(record.dates)) record.dates=record.dates.flatMap((item,index)=>{
      const result=recordDateSchema.safeParse(item);if(result.success)return [result.data];
      problems.push('Structured date '+(index+1)+' is invalid and remains unverified.');return [];
    });
    value.record=record;
  }
  const parsed=descriptionSchema.parse(value);
  parsed.reviewIssues=[...parsed.reviewIssues,...problems].slice(0,12);
  const record=parsed.record;
  if (!record) return parsed;
  const type=inferredType(meta.title);
  const compatible=record.type===type || (type==='event' && record.type==='scheme_update') || (type==='scheme' && record.type==='scheme_update') || (type==='regulatory_guide' && record.type==='notification');
  if (type!=='notification' && !compatible) parsed.reviewIssues=[...parsed.reviewIssues,'The title indicates '+type+' but extraction classified '+record.type+'. Check classification.'].slice(0,12);
  if (record.type!=='scheme' && parsed.status!=='unknown') {parsed.status='unknown';parsed.statusEvidence=null;}
  if (meta.publicationDate && !record.dates.some(date=>date.kind==='publication')) {
    const line=text.split('\n').find(line=>/posted on|published on/i.test(line) && officialDate(line)===meta.publicationDate);
    if (line && line.length<=1600) record.dates.push({kind:'publication',value:meta.publicationDate,time:null,timezone:'Asia/Kolkata',text:line,quote:line});
  }
  return parsed;
}

export const recordPrompt=`Also return record with: type (${['scheme','citizen_service','public_notice','recruitment','exam','result','regulatory_guide','notification','directory','helpline','grievance','rti','scheme_update','event','faq'].join(', ')}), typeEvidence (claim or null), title and authority (claims or null), originalLanguage (language code or und), jurisdiction ({level:Central/State/Union Territory/District/Local or null,state,district,localBody,evidence:claim or null}), dates, facts, related.
dates is an array of {kind:one of ${dateKinds.join(', ')},value:YYYY-MM-DD or null,time:HH:mm or null,timezone:"Asia/Kolkata",text,quote}. Use separate evidence for each date; never confuse publication, registration, application, hearing, event, effective dates. A quote must contain only one relevant date. Resolve tomorrow only against the supplied source publication date in Asia/Kolkata, never today's date. Do not invent times. Keep null when unclear.
facts contains ${factKeys.join(', ')} as arrays of claims. Each public claim needs at least 3 characters and its exact quotation at least 5; include surrounding official context for short values such as fees. related is [{title,url:null or an official URL actually present in source,quote}]. Identify the parent scheme/service for updates and events, and the underlying rule for FAQs. A meeting about a scheme is an event, not a new scheme. An Adalat is a public notice, not a pension benefit. Gazette rules are regulatory_guide. Fill type-relevant fields, leaving other arrays empty. Preserve exact fees, qualifications and contact details. Do not infer legal status merely from a title.`;
