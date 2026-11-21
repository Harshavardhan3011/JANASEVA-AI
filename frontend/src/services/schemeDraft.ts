import { z } from 'zod';
import { schemeSections } from './schemeDetails';
import type { Description } from './schemeDetails';
import { factLabels } from './governmentRecords';

export function draftFieldLabel(path: Array<string | number>) {
  if (path[0]==='record') return path.slice(1).map(value=>typeof value==='number'?'item '+(value+1):factLabels[value as keyof typeof factLabels] || String(value)).join(' · ');
  const [section,index,field]=path;
  const label=schemeSections.find(([key])=>key===section)?.[1] ||
    (section==='statusEvidence'?'Application status evidence':String(section || 'Description'));
  return label+(typeof index==='number'?' item '+(index+1):'')+
    (field==='text' || index==='text'?' — public wording':field==='quote' || index==='quote'?' — official source passage':'');
}

const claim=z.object({text:z.string().trim().min(3).max(1600),quote:z.string().trim().min(5).max(2400)});
const limits={overview:4,whoCanApply:12,benefits:14,eligibility:18,exclusions:12,documents:14,applicationSteps:15,dates:10,contacts:10};

export function prepareDraft(draft:Description):Description {
  const cleaned={...draft};
  const errors:string[]=[];
  for (const [section] of schemeSections) {
    const rows=draft[section] || [];
    // An untouched Add item placeholder carries no information. Never discard a partially completed claim.
    cleaned[section]=rows.filter(row=>row.text.trim() || row.quote.trim()).map(row=>({...row,text:row.text.trim(),quote:row.quote.trim()}));
    rows.forEach((row,index)=>{
      if (!row.text.trim() && !row.quote.trim()) return;
      const result=claim.safeParse(row);
      if (!result.success) for (const issue of result.error.issues) {
        errors.push(draftFieldLabel([section,index,...issue.path.map(String)])+': '+issue.message);
      }
    });
    if (cleaned[section].length>limits[section]) errors.push(draftFieldLabel([section])+': use at most '+limits[section]+' items.');
  }
  if (draft.status!=='unknown') {
    const result=claim.safeParse(draft.statusEvidence);
    if (!result.success) errors.push('Application status evidence: enter public wording (at least 3 characters) and an exact official passage (at least 5 characters), or choose Not specified.');
    else cleaned.statusEvidence={...draft.statusEvidence,...result.data};
  } else cleaned.statusEvidence=null;
  if (draft.record) {
    const record=structuredClone(draft.record);
    for (const key of Object.keys(factLabels) as Array<keyof typeof factLabels>) {
      const rows=record.facts[key] || [];
      record.facts[key]=rows.filter(row=>row.text.trim() || row.quote.trim());
      rows.forEach((row,index)=>{if(!row.text.trim() && !row.quote.trim())return;
        const result=claim.safeParse(row);if(!result.success)errors.push(draftFieldLabel(['record','facts',key,index])+': complete public wording and an exact quotation.');});
    }
    record.dates=record.dates.filter(row=>row.text.trim() || row.quote.trim() || row.value || row.time);
    record.dates.forEach((row,index)=>{if(!claim.safeParse(row).success)errors.push('Structured date item '+(index+1)+': provide wording and a supporting quotation.');});
    record.related=record.related.filter(row=>row.title.trim() || row.quote.trim() || row.url);
    cleaned.record=record;
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return cleaned;
}
