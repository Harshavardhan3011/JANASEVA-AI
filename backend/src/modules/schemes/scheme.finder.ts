import type { CatalogScheme } from './schemes.controller';
import { searchPublishers } from '../catalog/catalog.publishers';

const stop=new Set('a an the for in of and or is are i me my find help apply what which how do need this that scheme schemes documents deadline application open where scholarship scholarships student students year third first second fourth'.split(' '));
const groups=[
 {category:'Education',words:/scholar|student|college|engineering|education|study|degree|छात्र|छात्रवृत्ति|విద్య|స్కాలర్షిప్/i},
 {category:'Agriculture',words:/farmer|agricultur|crop|kisan|farming/i},
 {category:'Health',words:/health|medical|hospital|treatment/i},
 {category:'Housing',words:/hous|home|shelter/i},
 {category:'Employment',words:/job|employment|worker|labour|labor/i},
 {category:'Finance',words:/loan|credit|business|entrepreneur/i},
 {category:'Social welfare',words:/pension|widow|disab|welfare/i},
];
export function findSchemes(catalog:CatalogScheme[],query:string,state='',limit=8) {
 const normalized=query.toLowerCase();
 const location=[...new Set(searchPublishers.map(item=>item.state).filter(Boolean))]
   .find(value=>normalized.includes(value.toLowerCase())) || state;
 const category=groups.find(group=>group.words.test(query))?.category;
 const words=normalized.match(/[\p{L}\p{M}\p{N}]+/gu)?.filter(word=>word.length>2 && !stop.has(word)) || [];
 return catalog.flatMap(scheme=>{
   if (location && scheme.coverage_state && scheme.coverage_state.toLowerCase()!==location.toLowerCase()) return [];
   const text=[scheme.scheme_name,scheme.description,...(scheme.aliases || []),scheme.category,
     scheme.department,scheme.eligibility_summary,scheme.benefits_summary,scheme.record_type,
     ...(scheme.record?Object.values(scheme.record.facts).flat().map(claim=>claim.text):[]),
     ...(scheme.record?.dates.map(date=>date.text) || [])].join(' ').toLowerCase();
   const hits=words.filter(word=>text.includes(word)).length;
   const categoryMatch=category===scheme.category;
   const nameMatch=normalized.includes(scheme.scheme_name.toLowerCase()) ||
     (scheme.aliases || []).some(alias=>normalized.includes(alias.toLowerCase()));
   if (query && !hits && !categoryMatch && !nameMatch) return [];
   const reasons:string[]=[];
   if (nameMatch) reasons.push('The name or alias matches your question.');
   if (categoryMatch) reasons.push('Published category matches '+category+'.');
   if (location && scheme.coverage_state) reasons.push('Published coverage includes '+location+'.');
   else if (location) reasons.push('State-specific eligibility needs checking in the official guidelines.');
   if (!reasons.length) reasons.push(query?'Published text matches your search.':'Available in the published catalog.');
   return [{...scheme,match_reasons:reasons,score:hits+Number(categoryMatch)*5+Number(nameMatch)*20}];
 }).sort((a,b)=>b.score-a.score).slice(0,limit);
}
export function verifiedDeadline(scheme:CatalogScheme) {
 const confirmed=scheme.record?.dates.filter(date=>['registration_deadline','application_deadline'].includes(date.kind) && date.value);
 if (confirmed?.length===1) return confirmed[0].value;
 // Legacy catalog dates are retained, but are not treated as a current verified application window.
 const claims=scheme.detail?.dates || [];
 const dates=claims.flatMap(claim=>{
   if (!/application|apply|renewal|submission/i.test(claim.text) || !/closing|last date|deadline|closes|until|before|by /i.test(claim.text)) return [];
   return claim.text.match(/\b20\d{2}-\d{2}-\d{2}\b/g) || [];
 });
 return dates.length===1 && /^(open|rolling)$/.test(scheme.scheme_status) ? dates[0] : null;
}
