import { dateLabels,factLabels,recordLabels } from '../services/governmentRecords';
import type { GovernmentRecord,RecordType } from '../services/governmentRecords';
import type { Claim } from '../services/schemeDetails';
function Evidence({value,onChange}:{value:Claim;onChange:(claim:Claim)=>void}) {
 return <div className="input-grid"><label>Public field value<textarea aria-label="Public field value" rows={2} maxLength={1600} value={value.text} onChange={event=>onChange({...value,text:event.target.value})}/></label>
 <label>Supporting exact quotation<textarea aria-label="Supporting exact quotation" rows={2} maxLength={2400} value={value.quote} onChange={event=>onChange({...value,quote:event.target.value})}/></label></div>;
}
export function RecordEditor({record,onChange}:{record:GovernmentRecord;onChange:(record:GovernmentRecord)=>void}) {
 return <section className="mt-4 rounded-lg border border-teal-200 bg-teal-50/30 p-4"><h2>Information type and structured details</h2>
  <p>Keep publication, registration, hearing and effective dates separate. Missing dates and times stay unspecified. Source-backed changes are validated when saved.</p>
  <div className="input-grid"><label>Record type<select aria-label="Record type" value={record.type} onChange={event=>onChange({...record,type:event.target.value as RecordType})}>{Object.entries(recordLabels).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
  <label>Original language<input value={record.originalLanguage} maxLength={40} onChange={event=>onChange({...record,originalLanguage:event.target.value})}/></label>
  <label>Jurisdiction level<select value={record.jurisdiction.level || ''} onChange={event=>onChange({...record,jurisdiction:{...record.jurisdiction,level:event.target.value || null}})}><option value="">Unspecified</option>{['Central','State','Union Territory','District','Local'].map(value=><option key={value}>{value}</option>)}</select></label>
  {(['state','district','localBody'] as const).map(key=><label key={key}>{key}<input value={record.jurisdiction[key] || ''} maxLength={120} onChange={event=>onChange({...record,jurisdiction:{...record.jurisdiction,[key]:event.target.value || null}})}/></label>)}</div>
  {(['title','authority','typeEvidence'] as const).map(key=><details key={key} className="mt-3"><summary>{key==='title'?'Public title':key==='authority'?'Responsible authority':'Record classification'} evidence</summary><Evidence value={record[key] || {text:'',quote:''}} onChange={value=>onChange({...record,[key]:value.text || value.quote?value:null})}/></details>)}
  <details open className="mt-4"><summary>Structured dates ({record.dates.length})</summary>{record.dates.map((date,index)=><div className="my-3 rounded border border-slate-200 bg-white p-3" key={index}>
   <div className="input-grid"><label>Date purpose<select value={date.kind} onChange={event=>onChange({...record,dates:record.dates.map((value,i)=>i===index?{...value,kind:event.target.value as typeof date.kind}:value)})}>{Object.entries(dateLabels).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
   <label>Verified date (leave blank if unknown)<input type="date" value={date.value || ''} onChange={event=>onChange({...record,dates:record.dates.map((value,i)=>i===index?{...value,value:event.target.value || null}:value)})}/></label>
   <label>Verified time in IST (optional)<input type="time" value={date.time || ''} onChange={event=>onChange({...record,dates:record.dates.map((value,i)=>i===index?{...value,time:event.target.value || null}:value)})}/></label></div>
   <Evidence value={date} onChange={claim=>onChange({...record,dates:record.dates.map((value,i)=>i===index?{...value,...claim}:value)})}/>
   <button className="text-action" onClick={()=>onChange({...record,dates:record.dates.filter((_,i)=>i!==index)})}>Remove date</button>
  </div>)}<button className="secondary-action" onClick={()=>onChange({...record,dates:[...record.dates,{kind:'event',value:null,time:null,timezone:'Asia/Kolkata',text:'',quote:''}]})}>Add structured date</button></details>
  {Object.entries(factLabels).map(([key,label])=><details className="mt-3" key={key}><summary>{label} ({record.facts[key as keyof typeof factLabels]?.length || 0})</summary>
   {(record.facts[key as keyof typeof factLabels] || []).map((claim,index)=><div className="my-2" key={index}><Evidence value={claim} onChange={value=>onChange({...record,facts:{...record.facts,[key]:record.facts[key as keyof typeof factLabels].map((item,i)=>i===index?value:item)}})}/>
    <button className="text-action" onClick={()=>onChange({...record,facts:{...record.facts,[key]:record.facts[key as keyof typeof factLabels].filter((_,i)=>i!==index)}})}>Remove field</button></div>)}
   <button className="secondary-action mt-2" onClick={()=>onChange({...record,facts:{...record.facts,[key]:[...(record.facts[key as keyof typeof factLabels] || []),{text:'',quote:''}]}})}>Add {label.toLowerCase()}</button>
  </details>)}
  <details className="mt-3"><summary>Related record evidence</summary>{record.related.map((item,index)=><div className="input-grid" key={index}>
   <label>Related title<input value={item.title} onChange={event=>onChange({...record,related:record.related.map((value,i)=>i===index?{...value,title:event.target.value}:value)})}/></label>
   <label>Official related URL (optional)<input type="url" value={item.url || ''} onChange={event=>onChange({...record,related:record.related.map((value,i)=>i===index?{...value,url:event.target.value || null}:value)})}/></label>
   <label>Relationship quotation<textarea value={item.quote} onChange={event=>onChange({...record,related:record.related.map((value,i)=>i===index?{...value,quote:event.target.value}:value)})}/></label>
   <button className="text-action" onClick={()=>onChange({...record,related:record.related.filter((_,i)=>i!==index)})}>Remove relation</button>
  </div>)}<button className="secondary-action mt-2" onClick={()=>onChange({...record,related:[...record.related,{title:'',url:null,quote:''}]})}>Add related record</button></details>
 </section>;
}
