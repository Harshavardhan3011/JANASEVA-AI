import { z } from 'zod';
import { categories } from '../monitor/monitor.types';

export const unknownDetail='Not specified in the official source.';
export const sections=['overview','whoCanApply','benefits','eligibility','documents','applicationSteps','dates','contacts'] as const;
export const sectionNames={
  overview:'Overview', whoCanApply:'Who can apply', benefits:'Benefits', eligibility:'Eligibility',
  documents:'Documents', applicationSteps:'How to apply', dates:'Important dates', contacts:'Official contacts',
};
export const claimSchema=z.object({ text:z.string().trim().min(3).max(1600), quote:z.string().trim().min(5).max(2400) }).strict();
export const descriptionSchema=z.object({
  overview:z.array(claimSchema).max(4), whoCanApply:z.array(claimSchema).max(12),
  benefits:z.array(claimSchema).max(14), eligibility:z.array(claimSchema).max(18),
  documents:z.array(claimSchema).max(14), applicationSteps:z.array(claimSchema).max(15),
  dates:z.array(claimSchema).max(10), contacts:z.array(claimSchema).max(10),
  status:z.enum(['unknown','open','closed']),
  statusEvidence:claimSchema.nullable(),
  reviewIssues:z.array(z.string().trim().min(1).max(350)).max(12),
}).strict();
export type SchemeDescription=z.infer<typeof descriptionSchema>;

export const supportedHosts=new Set([
  'pib.gov.in','www.pib.gov.in','sspensions.ap.gov.in','pmkisan.gov.in','www.pmkisan.gov.in',
  'gsws-nbm.ap.gov.in','gramawardsachivalayam.ap.gov.in','nandyal.ap.gov.in',
]);
export const officialSourceUrl=z.url({protocol:/^https$/}).refine(value=>{
  const url=new URL(value);
  return supportedHosts.has(url.hostname) && !url.username && !url.password && !url.port;
},'Use an HTTPS URL on an approved government source domain.');
export const metadataSchema=z.object({
  title:z.string().trim().min(3).max(255),
  issuer:z.string().trim().min(2).max(255),
  officialId:z.string().trim().min(1).max(120).optional(),
  state:z.string().trim().max(120).default(''),
  category:z.enum(categories).default('Other'),
  reviewNote:z.string().trim().max(600).optional(),
});
export type ImportMetadata=z.infer<typeof metadataSchema>;
export interface SourceDocument {
  url:string; originalTitle:string; text:string; applyUrl:string|null; incomplete:boolean;
}

export function canonicalSource(input:string) {
  const url=new URL(officialSourceUrl.parse(input));
  url.hash='';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
  }
  if (/^(www\.)?pib\.gov\.in$/.test(url.hostname) && url.searchParams.has('PRID') &&
    /PressRelease(?:Iframe)?Page\.aspx$/i.test(url.pathname)) {
    return 'https://www.pib.gov.in/PressReleasePage.aspx?PRID='+encodeURIComponent(url.searchParams.get('PRID')!);
  }
  url.searchParams.sort();
  return url.href;
}

export const compact=(text:string)=>text.normalize('NFKC').replace(/\s+/g,' ').trim();
const numbers=(str:string)=>compact(str).match(/\d+(?:[,.]\d+)*/g)?.map(value=>value.replace(/,/g,'')) ?? [];

export function verifyDescription(description:SchemeDescription,sourceText:string) {
  const source=compact(sourceText);
  const problems:string[]=[];
  const claims=sections.flatMap(key=>description[key]);
  if (description.statusEvidence) claims.push(description.statusEvidence);
  for (const claim of claims) {
    const quote=compact(claim.quote);
    if (!source.includes(quote)) problems.push('A citation does not match the official source text.');
    if (numbers(claim.text).some(number=>!numbers(quote).includes(number))) problems.push('A claim has a figure or date absent from its citation.');
  }
  if (description.status!=='unknown') {
    const quote=description.statusEvidence?.quote || '';
    const stateEvidence=description.status==='closed'
      ? /(?:applications? (?:are|is|have been|has been) (?:closed|no longer accepted)|scheme (?:is|has been) (?:closed|discontinued)|आवेदन बंद (?:हैं|है))/iu
      : /(?:applications?[^.]{0,32}(?:are now open|are open|are invited)|आवेदन आमंत्रित)/iu;
    if (!stateEvidence.test(quote)) problems.push('The official text does not explicitly confirm the application status.');
  }
  return {
    problems:[...new Set(problems)],
    extractive:claims.every(claim=>compact(claim.quote)===compact(claim.text)),
  };
}
