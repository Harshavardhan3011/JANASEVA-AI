import { z } from 'zod';

export const recordTypes=['scheme','citizen_service','public_notice','recruitment','exam','result','regulatory_guide','notification','directory','helpline','grievance','rti','scheme_update','event','faq'] as const;
export const evidenceSchema=z.object({text:z.string().trim().min(3).max(1600),quote:z.string().trim().min(5).max(2400)}).strict();
export const factKeys=['audience','venue','agenda','fees','processingTime','applicationChannels','posts','qualifications','referenceNumber','legalStatus','effectiveConditions','offices','grievanceChannels'] as const;
export const dateKinds=['publication','application_open','application_deadline','registration_deadline','hearing','event','effective','result'] as const;
function emptyFacts() {
  const result={} as Record<typeof factKeys[number],z.infer<typeof evidenceSchema>[]>;
  for (const key of factKeys) result[key]=[];
  return result;
}
export const recordDateSchema=z.object({
  kind:z.enum(dateKinds),value:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  timezone:z.literal('Asia/Kolkata').default('Asia/Kolkata'),
  text:z.string().trim().min(3).max(1600),quote:z.string().trim().min(5).max(2400),
}).strict();
export const recordSchema=z.object({
  type:z.enum(recordTypes),typeEvidence:evidenceSchema.nullable().default(null),
  title:evidenceSchema.nullable().default(null),authority:evidenceSchema.nullable().default(null),
  originalLanguage:z.string().trim().min(2).max(40).default('und'),
  jurisdiction:z.object({level:z.enum(['Central','State','Union Territory','District','Local']).nullable().default(null),
    state:z.string().max(120).nullable().default(null),district:z.string().max(120).nullable().default(null),localBody:z.string().max(160).nullable().default(null),
    evidence:evidenceSchema.nullable().default(null)}).default({level:null,state:null,district:null,localBody:null,evidence:null}),
  dates:z.array(recordDateSchema).max(20).default([]),
  facts:z.object(Object.fromEntries(factKeys.map(key=>[key,z.array(evidenceSchema).max(12).default([])])) as Record<typeof factKeys[number],z.ZodDefault<z.ZodArray<typeof evidenceSchema>>>).default(emptyFacts),
  related:z.array(z.object({title:z.string().min(2).max(255),url:z.url().nullable(),quote:z.string().min(5).max(2400)}).strict()).max(8).default([]),
}).strict();
export type GovernmentRecord=z.infer<typeof recordSchema>;
export type RecordDate=z.infer<typeof recordDateSchema>;
export type RecordType=typeof recordTypes[number];

const months:Record<string,number>={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12,'जनवरी':1,'फरवरी':2,'मार्च':3,'अप्रैल':4,'मई':5,'जून':6,'जुलाई':7,'अगस्त':8,'सितंबर':9,'सितम्बर':9,'अक्टूबर':10,'नवंबर':11,'नवम्बर':11,'दिसंबर':12,'दिसम्बर':12};
export function officialDate(text:string,publication:string|null=null):string|null {
  let year:number,month:number,day:number;
  const iso=text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  const named=text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+|[\u0900-\u097f]+)[,\s]+(20\d{2})/i);
  const numeric=text.match(/\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/);
  if (iso) [,year,month,day]=iso.map(Number);
  else if (named && months[named[2].toLowerCase()]) {day=Number(named[1]);month=months[named[2].toLowerCase()];year=Number(named[3]);}
  else if (numeric) {day=Number(numeric[1]);month=Number(numeric[2]);year=Number(numeric[3]);}
  else if (/\btomorrow\b|कल/u.test(text) && publication && /^\d{4}-\d{2}-\d{2}$/.test(publication)) {
    const date=new Date(publication+'T00:00:00+05:30');date.setUTCDate(date.getUTCDate()+1);
    return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  } else if (/date of (?:their |its )?publication/i.test(text) && publication) return publication;
  else return null;
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year && date.getUTCMonth()===month-1 && date.getUTCDate()===day?
    `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:null;
}

export function inferredType(title:string):RecordType {
  if (/faq|frequently asked/iu.test(title)) return 'faq';
  if (/adalat|hearing|consultation|पेंशन अदालत|शिकायतों/iu.test(title)) return 'public_notice';
  if (/meeting|conference|बैठक/iu.test(title)) return 'event';
  if (/recruit|vacanc|भर्ती/iu.test(title)) return 'recruitment';
  if (/exam|परीक्षा/iu.test(title)) return /result|परिणाम/iu.test(title)?'result':'exam';
  if (/rules|gazette|regulation|नियम|अधिसूचना/iu.test(title)) return 'regulatory_guide';
  if (/certificate|licen[cs]e|renewal|correction/iu.test(title)) return 'citizen_service';
  if (/helpline/iu.test(title)) return 'helpline';
  if (/directory|contact us/iu.test(title)) return 'directory';
  if (/\brti\b|right to information/iu.test(title)) return 'rti';
  if (/grievance/iu.test(title)) return 'grievance';
  if (/scheme|pension|scholarship|subsidy|yojana|योजना|पेंशन|छात्रवृत्ति/iu.test(title)) return 'scheme';
  return 'notification';
}
