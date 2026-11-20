import { useEffect,useState } from 'react';
import { Link,useParams } from 'react-router-dom';
import { api } from '../services/api';
import { errorMessage } from '../services/workflow';
const labels={fullName:'Full name',email:'Email',state:'State or UT',district:'District',occupation:'Occupation',education:'Education',phone:'Phone',address:'Address',purpose:'Purpose / request',age:'Age (if required by the official form)',annualIncome:'Annual income (if required by the official form)'};
interface Draft {id:string;scheme_id:string;fields:Partial<Record<keyof typeof labels,string>>;reviewed_at:string|null;requiredFields:string[];note:string;record:{scheme_name:string;application_url:string|null;official_url:string}|null}
export function CitizenDraftsPage() {
 const {id}=useParams();const [draft,setDraft]=useState<Draft>();const [list,setList]=useState<Array<{id:string;title:string;reviewed_at:string|null}>>();
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const controller=new AbortController();setDraft(undefined);setList(undefined);setError('');
  api.get('/citizen-schemes/drafts'+(id?'/'+id:''),{signal:controller.signal}).then(result=>id?setDraft(result.data.data):setList(result.data.data)).catch(err=>{if(!controller.signal.aborted)setError(errorMessage(err));});
  return ()=>controller.abort();
 },[id]);
 const copyText=draft?[draft.record?.scheme_name,...Object.entries(draft.fields).filter(([,value])=>value).map(([key,value])=>(labels[key as keyof typeof labels] || key)+': '+value)].join('\n'):'';
 return <div className="workflow"><header className="workflow-heading"><div><h1>My preparation drafts</h1><p>Your details, reviewed by you. Nothing is submitted to a government portal.</p></div></header>
  {error && <p role="alert" className="workflow-error">{error}</p>}{message && <p role="status">{message}</p>}
  {!draft && !list && !error && <p role="status">Loading your drafts…</p>}
  {list && <section className="workflow-card">{list.length?list.map(item=><p className="py-3" key={item.id}><Link className="source-link" to={'/dashboard/drafts/'+item.id}>{item.title}</Link> · {item.reviewed_at?'Reviewed':'Draft — review needed'}</p>):<p>No preparation drafts yet. <Link className="source-link" to="/schemes">Explore a scheme or service</Link>, then choose Prepare a personal draft.</p>}</section>}
  {draft && <><section className="workflow-card"><h2>{draft.record?.scheme_name || 'Saved preparation draft'}</h2><p>{draft.note}</p><p>Prefilled fields come from your account and optional profile. Eligibility and age/income bands are not treated as confirmed personal facts.</p>
   <form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try {await api.put('/citizen-schemes/drafts/'+draft.id,{fields:draft.fields,reviewed:false});setMessage('Draft saved. Review it before using it on the official portal.');setDraft({...draft,reviewed_at:null});}catch(err){setError(errorMessage(err));}finally{setBusy(false);}}}>
    <div className="input-grid">{Object.entries(labels).map(([key,label])=><label key={key}>{label}{draft.requiredFields.includes(key)?' *':''}<input required={draft.requiredFields.includes(key)} maxLength={key==='purpose'||key==='address'?1500:200} value={draft.fields[key as keyof typeof labels] || ''} onChange={event=>setDraft({...draft,reviewed_at:null,fields:{...draft.fields,[key]:event.target.value}})}/></label>)}</div>
    <button className="secondary-action mt-4" disabled={busy}>Save editable draft</button>
   </form>
   <button className="primary-action" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await api.put('/citizen-schemes/drafts/'+draft.id,{fields:draft.fields,reviewed:true});setDraft({...draft,reviewed_at:new Date().toISOString()});setMessage('Marked as reviewed. You can copy the draft and complete the official form yourself.');}catch(err){setError(errorMessage(err));}finally{setBusy(false);}}}>I reviewed these details</button>
  </section><section className="workflow-card"><h2>Copyable preparation draft</h2><textarea aria-label="Copyable preparation draft" className="w-full" rows={10} readOnly value={copyText}/>
   <button className="secondary-action" disabled={!draft.reviewed_at} onClick={()=>void navigator.clipboard.writeText(copyText).then(()=>setMessage('Reviewed draft copied.')).catch(()=>setMessage('Select and copy the text above.'))}>Copy reviewed draft</button>
   {draft.record && <a className="primary-action" href={draft.record.application_url || draft.record.official_url} target="_blank" rel="noreferrer">Open official portal / source</a>}
  </section></>}
 </div>;
}
