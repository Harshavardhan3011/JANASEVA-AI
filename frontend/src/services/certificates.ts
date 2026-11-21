import directory from '../data/certificate-directory.json';
interface CertificateCandidate {scheme_name:string;record_type?:string;record?:{type?:string}|null}
export const certificateTypes={income:'Income',caste:'Caste / community',birth:'Birth',death:'Death',residence:'Residence / domicile',ews:'EWS',disability:'Disability',marriage:'Marriage',other:'Other certificates'};
export type CertificateType=string;
export function isCertificateRecord(record:CertificateCandidate) {
 return (record.record?.type || record.record_type)==='citizen_service' && /\bcertificates?\b|\budid\b|jeevan\s*pramaan|प्रमाण.?पत्र|సర్టిఫికెట్/iu.test(record.scheme_name);
}
export function certificateType(title:string):CertificateType {
 const aliases:Record<string,RegExp>={ncl:/non.creamy|\bncl\b|\bobc\b/i,life:/life certificate|jeevan|pramaan/i,'legal-heir':/legal heir|surviving|succession/i,police:/police|\bpcc\b|character/i};
 for(const [kind,pattern] of Object.entries(aliases))if(pattern.test(title))return kind;
 if(/\bews\b|economically weaker/iu.test(title))return 'ews';
 if(/income|आय/iu.test(title))return 'income';
 if(/caste|community|जाति/iu.test(title))return 'caste';
 if(/birth|जन्म/iu.test(title))return 'birth';
 if(/death|मृत्यु/iu.test(title))return 'death';
 if(/residen|domicile|nativity|निवास/iu.test(title))return 'residence';
 if(/disabil/iu.test(title))return 'disability';
 if(/marriage/iu.test(title))return 'marriage';
 return directory.guides.find(guide=>!guide.state && guide.aliases.some(alias=>alias.length>3 && title.toLowerCase().includes(alias.toLowerCase())))?.kind || 'other';
}
export const catalogDetailPath=(record:CertificateCandidate & {id:string})=>(isCertificateRecord(record)?'/certificates/':'/schemes/')+record.id;
