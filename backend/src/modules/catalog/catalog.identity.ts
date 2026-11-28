import { compact } from './catalog.types';
import type { ImportMetadata } from './catalog.types';

const normalized=(value:string)=>compact(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function matchesSchemeName(text:string,meta:Pick<ImportMetadata,'title'|'aliases'>) {
  return [meta.title,...(meta.aliases || [])].some(name=>{
    if(/^(?:merit|welfare)[ -]based (?:scheme|scholarship)$|^(?:financial assistance|schemes?|scholarships?|pensions?)$/i.test(name.trim()))return false;
    if (normalized(name).length>=8 && normalized(text).includes(normalized(name))) return true;
    const words=name.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(word=>!['the','of','for','and','scheme','scholarship','students','central','sector','pm'].includes(word)) || [];
    return words.length>=2 && words.every(word=>normalized(text).includes(normalized(word)));
  });
}
export function sourceScope(text:string):string|null {
  const onward=compact(text).match(/applicable (?:for|from) (?:the )?(?:academic |financial )?year\s+(20\d{2})[-–](\d{2}(?:\d{2})?)\s+onwards/i);
  if(onward)return onward[1]+'-'+onward[2]+' onwards';
  const cycle=compact(text).match(/(?:academic year|financial year|FAQs?\)?\s*)\s*[:–-]?\s*(20\d{2})[-–](\d{2}(?:\d{2})?)/i);
  if(cycle)return cycle[1]+'-'+cycle[2];
  const portal=compact(text).match(/Scheme\s+Open from\s*:\s*\d{2}-\d{2}-(20\d{2})/i);
  return portal?portal[1]+'-'+String(Number(portal[1])+1).slice(-2):null;
}
export function compatibleScope(primary:string|null,candidate:string|null) {
  if(!primary || !candidate)return false;
  const a=Number(primary.slice(0,4)),b=Number(candidate.slice(0,4));
  return primary===candidate || (candidate.endsWith('onwards') && b<=a) || (primary.endsWith('onwards') && a<=b);
}
export function ambiguousVariant(title:string,text:string) {
 const groups=[['degree','diploma'],['pre-matric','post-matric'],['undergraduate','postgraduate'],['jrf','srf']];
 const heading=compact(text).toLowerCase().replace(/[–—]/g,'-');
 return groups.some(group=>group.filter(term=>title.toLowerCase().includes(term)).length===1 && group.every(term=>heading.includes(term)));
}
