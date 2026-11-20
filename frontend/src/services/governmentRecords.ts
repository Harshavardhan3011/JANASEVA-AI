import type { Claim } from './schemeDetails';
export const recordLabels={scheme:'Scheme',citizen_service:'Citizen service',public_notice:'Public notice',recruitment:'Recruitment',exam:'Exam',result:'Result',regulatory_guide:'Rules and guidance',notification:'Notification',directory:'Department directory',helpline:'Helpline',grievance:'Grievance channel',rti:'RTI guidance',scheme_update:'Scheme update',event:'Public event',faq:'Official FAQ'};
export type RecordType=keyof typeof recordLabels;
export const factLabels={audience:'Who this affects',venue:'Venue',agenda:'Agenda and announcement',fees:'Fees',processingTime:'Processing time',applicationChannels:'Application channels',posts:'Posts',qualifications:'Qualifications',referenceNumber:'Reference number',legalStatus:'Regulatory status',effectiveConditions:'Effective-date conditions',offices:'Responsible office',grievanceChannels:'Grievance and contact channels'};
export const dateLabels={publication:'Publication date',application_open:'Applications open',application_deadline:'Application deadline',registration_deadline:'Registration deadline',hearing:'Hearing date',event:'Event / meeting date',effective:'Effective date',result:'Result date'};
export interface GovernmentRecord {
 type:RecordType;typeEvidence:Claim|null;title:Claim|null;authority:Claim|null;originalLanguage:string;
 jurisdiction:{level:string|null;state:string|null;district:string|null;localBody:string|null;evidence:Claim|null};
 dates:Array<Claim & {kind:keyof typeof dateLabels;value:string|null;time:string|null;timezone:string}>;
 facts:Record<keyof typeof factLabels,Claim[]>;
 related:Array<{title:string;url:string|null;quote:string;recordId?:string|null}>;
}
export const applicableRecord=(type?:RecordType)=>!type || ['scheme','citizen_service','recruitment','exam'].includes(type);
export function emptyGovernmentRecord():GovernmentRecord {
 const facts={} as GovernmentRecord['facts'];for(const key of Object.keys(factLabels) as Array<keyof typeof factLabels>)facts[key]=[];
 return {type:'scheme',typeEvidence:null,title:null,authority:null,originalLanguage:'und',jurisdiction:{level:null,state:null,district:null,localBody:null,evidence:null},dates:[],facts,related:[]};
}
export function publicSections(type:RecordType='scheme') {
 if (type==='scheme') return ['overview','benefits','whoCanApply','eligibility','exclusions','documents','applicationSteps','dates','contacts'];
 if (type==='citizen_service' || type==='recruitment' || type==='exam') return ['overview','whoCanApply','eligibility','documents','applicationSteps','dates','contacts'];
 return ['overview','dates','contacts'];
}
