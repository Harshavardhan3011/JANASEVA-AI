import { Link } from 'react-router-dom';
import { dateLabels,factLabels,recordLabels } from '../services/governmentRecords';
import type { GovernmentRecord } from '../services/governmentRecords';
export function RecordFacts({record,source}:{record:GovernmentRecord;source:string}) {
 const expected=record.type==='citizen_service'?['fees','processingTime','applicationChannels','offices']:
  record.type==='public_notice'?['audience','venue','grievanceChannels']:record.type==='recruitment'?['posts','qualifications','referenceNumber']:
  record.type==='regulatory_guide'?['referenceNumber','legalStatus','effectiveConditions']:record.type==='event'?['agenda','venue']:[];
 const facts=Object.entries(record.facts || {}).filter(([key,claims])=>claims.length || expected.includes(key));
 return <>
  <section className="workflow-card record-context"><span className="state-label">{recordLabels[record.type]}</span>
   <p>{[record.jurisdiction?.level,record.jurisdiction?.state,record.jurisdiction?.district,record.jurisdiction?.localBody].filter(Boolean).join(' · ') || 'Jurisdiction not specified in the official source.'}</p>
   <p>Original language · {record.originalLanguage==='und'?'Not specified':record.originalLanguage}</p>
   <div className="record-dates">{record.dates?.map((date,index)=><div className="record-date" key={index}>
    <strong>{dateLabels[date.kind]}</strong><span>{date.value || 'Not specified in the official source.'}</span>
    {date.kind==='hearing'?<small>{date.time?'Hearing time '+date.time+' IST':'Hearing time unspecified'}</small>:date.time && <small>{date.time} IST</small>}
    {date.value && date.kind!=='publication' && date.value<new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()) && <small>Past date · retained for reference</small>}
    {date.scope && <small>Source scope: {date.scope}</small>}<a className="text-sm underline" title={date.quote} href={date.sourceUrl || source} target="_blank" rel="noreferrer">Date source</a>
   </div>)}</div>
   {record.type==='public_notice' && !record.dates?.some(date=>date.kind==='hearing') && <p>Hearing date and time not specified in the official source.</p>}
  </section>
  {facts.map(([key,claims])=><section className="workflow-card" key={key}><h2>{factLabels[key as keyof typeof factLabels]}</h2>{claims.length?<ul className="space-y-3 pt-3">{claims.map((claim,index)=><li key={index}>{claim.text} <a className="source-link" title={claim.quote} href={claim.sourceUrl || source} target="_blank" rel="noreferrer">Source</a>{claim.scope && <small className="block">Source scope: {claim.scope}</small>}</li>)}</ul>:<p>Not specified in the official source.</p>}</section>)}
  {record.related?.length>0 && <section className="workflow-card"><h2>Related schemes, services and guidance</h2><ul>{record.related.map((related,index)=><li className="py-2" key={index}>
   {related.recordId?<Link className="source-link" to={'/schemes/'+related.recordId}>{related.title}</Link>:related.url?<a className="source-link" href={related.url} target="_blank" rel="noreferrer">{related.title}</a>:<Link className="source-link" to={'/schemes?q='+encodeURIComponent(related.title)}>{related.title} · find related records</Link>}
   <p className="text-sm">Relationship evidence: {related.quote}</p>
  </li>)}</ul></section>}
 </>;
}
