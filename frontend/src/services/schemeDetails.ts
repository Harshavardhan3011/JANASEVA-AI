export const schemeSections=[
  ['overview','Overview'],['whoCanApply','Who can apply'],['benefits','Benefits'],['eligibility','Eligibility'],['exclusions','Exclusions'],
  ['documents','Documents'],['applicationSteps','How to Apply'],['dates','Important Dates'],['contacts','Official contacts'],
] as const;
export type Section=typeof schemeSections[number][0];
export interface Claim { text:string; quote:string;sourceUrl?:string;sourceHash?:string;scope?:string }
export type SchemeStatus='unknown'|'announced'|'open'|'closed'|'rolling';
export type Description=Record<Section,Claim[]> & {
  status:SchemeStatus; statusEvidence:Claim|null; reviewIssues:string[];
  record?:import('./governmentRecords').GovernmentRecord;
};
export const unavailable='Not specified in the official source.';
export const describeStatus=(status:SchemeStatus)=>({unknown:'Status not specified',open:'Applications open',closed:'Closed',announced:'Announced',rolling:'Rolling applications'})[status];
export const dateLabel=(date:string)=>new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeZone:'Asia/Kolkata'}).format(new Date(date));
export const emptyDescription=():Description=>({
  overview:[],whoCanApply:[],benefits:[],eligibility:[],exclusions:[],documents:[],applicationSteps:[],dates:[],contacts:[],
  status:'unknown',statusEvidence:null,reviewIssues:[],
});
