import { z } from 'zod';
import { publisherForHost } from './catalog.publishers';
import { recordSchema,officialDate } from './record.schema';

export const unknownDetail='Not specified in the official source.';
export const sections=['overview','whoCanApply','benefits','eligibility','exclusions','documents','applicationSteps','dates','contacts'] as const;
export const sectionNames={
  overview:'Overview', whoCanApply:'Who can apply', benefits:'Benefits', eligibility:'Eligibility',
  exclusions:'Exclusions', documents:'Documents', applicationSteps:'How to apply', dates:'Important dates', contacts:'Official contacts',
};
export const claimSchema=z.object({ text:z.string().trim().min(3).max(1600), quote:z.string().trim().min(5).max(2400),sourceUrl:z.url().optional(),sourceHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),scope:z.string().max(160).optional() }).strict();
export const descriptionSchema=z.object({
  overview:z.array(claimSchema).max(4), whoCanApply:z.array(claimSchema).max(12),
  benefits:z.array(claimSchema).max(14), eligibility:z.array(claimSchema).max(18),
  exclusions:z.array(claimSchema).max(12).optional(),
  documents:z.array(claimSchema).max(14), applicationSteps:z.array(claimSchema).max(15),
  dates:z.array(claimSchema).max(10), contacts:z.array(claimSchema).max(10),
  status:z.enum(['unknown','announced','open','closed','rolling']),
  statusEvidence:claimSchema.nullable(),
  reviewIssues:z.array(z.string().trim().min(1).max(350)).max(12),
  record:recordSchema.optional(),
}).strict();
export type SchemeDescription=z.infer<typeof descriptionSchema>;

export const supportedHosts=new Set([
  'pib.gov.in','www.pib.gov.in','sspensions.ap.gov.in','pmkisan.gov.in','www.pmkisan.gov.in',
  'gsws-nbm.ap.gov.in','gramawardsachivalayam.ap.gov.in','nandyal.ap.gov.in',
  'apseva.ap.gov.in','vswsonline.ap.gov.in',
  'scholarships.gov.in','www.scholarships.gov.in','www.education.gov.in','education.gov.in',
]);
export const officialSourceUrl=z.url({protocol:/^https$/}).refine(value=>{
  const url=new URL(value);
  return (supportedHosts.has(url.hostname) || Boolean(publisherForHost(url.hostname))) && !url.username && !url.password && !url.port;
},'Use an HTTPS URL on an approved government source domain.');
export const metadataSchema=z.object({
  schemeId:z.uuid().optional(),
  sourceLinks:z.array(z.object({url:z.url(),title:z.string().max(255)})).max(30).optional(),
  title:z.string().trim().min(3).max(255),
  issuer:z.string().trim().min(2).max(255),
  officialId:z.string().trim().min(1).max(120).optional(),
  state:z.string().trim().max(120).default(''),
  category:z.string().trim().min(2).max(100).default('Other'),
  reviewNote:z.string().trim().max(600).optional(),
  aliases:z.preprocess(value=>typeof value==='string'?value.split(',').map(item=>item.trim()).filter(Boolean):value,z.array(z.string().trim().min(2).max(120)).max(12).optional()),
  district:z.string().trim().max(120).optional(),
  coverageLevel:z.enum(['National','State','Union Territory','District','Village','Local']).optional(),
  applicationPortalSource:z.boolean().optional(),
  discovery:z.literal('official_search').optional(),
  publicationDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  sourceId:z.string().max(160).optional(),originalLanguage:z.string().max(40).optional(),
  extraction:z.object({method:z.enum(['html','pdf']),pages:z.number().optional(),characters:z.number(),truncated:z.boolean(),error:z.string().optional()}).optional(),
});
export type ImportMetadata=z.infer<typeof metadataSchema>;
export interface SourceDocument {
  url:string; originalTitle:string; text:string; applyUrl:string|null; incomplete:boolean;
  publicationDate?:string|null;sourceId?:string;originalLanguage?:string;identityUrl?:string;
  extraction?:ImportMetadata['extraction'];
  links?:Array<{url:string;title:string}>;
}
export interface EvidenceSource {url:string;text:string;title:string;fetchedAt:string;fingerprint:string;scope:string|null;identityQuote:string;incomplete:boolean}

export function canonicalSource(input:string) {
  const url=new URL(officialSourceUrl.parse(input));
  url.hash='';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
  }
  if (/^(www\.)?pib\.gov\.in$/.test(url.hostname) && url.searchParams.has('PRID') &&
    /(?:PressRelease(?:Iframe)?Page|PressRel(?:e|ea)seDetailm?|PressReleaseDetail)\.aspx$/i.test(url.pathname)) {
    return 'https://www.pib.gov.in/PressReleasePage.aspx?PRID='+encodeURIComponent(url.searchParams.get('PRID')!);
  }
  url.searchParams.sort();
  return url.href;
}

export const compact=(text:string)=>text.normalize('NFKC').replace(/\s+/g,' ').trim();
const numbers=(str:string)=>compact(str).match(/\d+(?:[,.]\d+)*/g)?.map(value=>value.replace(/,/g,'')) ?? [];

export function verifyDescription(description:SchemeDescription,sourceText:string,evidence:Array<Pick<EvidenceSource,'url'|'text'> & {fingerprint?:string}>=[]) {
  const source=compact(sourceText);
  const problems:string[]=[];
  const claims=sections.flatMap(key=>description[key] || []);
  if (description.statusEvidence) claims.push(description.statusEvidence);
  if (description.record) {
    const record=description.record;
    claims.push(...Object.values(record.facts).flat(),...record.dates,...[record.typeEvidence,record.title,record.authority,record.jurisdiction.evidence].filter((value):value is {text:string;quote:string}=>Boolean(value)));
    for (const relation of record.related) {
      if (!source.includes(compact(relation.quote))) problems.push('A related record lacks matching source evidence.');
      if (relation.url && (!officialSourceUrl.safeParse(relation.url).success || !source.includes(relation.url))) problems.push('A related official URL must be present in the supplied source evidence.');
    }
    const publication=record.dates.find(date=>date.kind==='publication')?.value || null;
    for (const date of record.dates) {
      if (date.value && officialDate(date.quote,publication)!==date.value) problems.push('A structured date is not supported by its citation and source publication date.');
      if (date.time && !compact(date.quote).includes(date.time)) problems.push('A structured time is not present in its citation.');
    }
  }
  for (const claim of claims) {
    const quote=compact(claim.quote);
    const cited='sourceUrl' in claim && typeof claim.sourceUrl==='string'?evidence.find(document=>document.url===claim.sourceUrl && (!('sourceHash' in claim) || !claim.sourceHash || document.fingerprint===claim.sourceHash)):null;
    const matching='sourceUrl' in claim && claim.sourceUrl?Boolean(cited && officialSourceUrl.safeParse(claim.sourceUrl).success && compact(cited.text).includes(quote)):source.includes(quote);
    if (!matching) problems.push('A citation does not match its captured official source text.');
    if (numbers(claim.text).some(number=>!numbers(quote).includes(number))) problems.push('A claim has a figure or date absent from its citation.');
  }
  if (description.status!=='unknown') {
    const quote=description.statusEvidence?.quote || '';
    const stateEvidence=description.status==='closed'
      ? /(?:applications? (?:are|is|have been|has been) (?:closed|no longer accepted)|scheme (?:is|has been) (?:closed|discontinued)|आवेदन बंद (?:हैं|है))/iu
      : description.status==='announced' ? /(?:scheme.{0,50}(?:announced|launched)|(?:announces|launches).{0,50}scheme)/iu
      : description.status==='rolling' ? /(?:applications?.{0,50}(?:throughout the year|year.round|rolling basis|no closing date))/iu
      : /(?:applications?[^.]{0,32}(?:are now open|are open|are invited)|आवेदन आमंत्रित)/iu;
    if (!stateEvidence.test(quote)) problems.push('The official text does not explicitly confirm the application status.');
  }
  return {
    problems:[...new Set(problems)],
    extractive:claims.every(claim=>compact(claim.quote)===compact(claim.text)),
  };
}
