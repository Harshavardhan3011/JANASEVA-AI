import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { errorMessage } from '../services/workflow';
const sectionNames:Record<string,string>={
  overview:'Overview',whoCanApply:'Who can apply',benefits:'Benefits',eligibility:'Eligibility',
  documents:'Documents',applicationSteps:'How to apply',dates:'Important dates',contacts:'Contacts',status:'Application status',
};

type Answer='met'|'unmet'|'unknown';
interface Claim {text:string;quote:string}
interface Watch {
  scheme_id:string;version_id:string|null;source_url:string|null;stale:boolean;
  scheme?:{scheme_name:string;coverage_state:string|null};
  description:{whoCanApply:Claim[];eligibility:Claim[];documents:Claim[]}|null;
  answers:Record<string,Answer>;
}
interface Change {before:Claim[]|string|null;after:Claim[]|string|null}
interface Alert {
  id:string;scheme_id:string;scheme_name:string;source_url:string;
  read_at:string|null;created_at:string;changes:Record<string,Change>;
}
interface Dashboard {state:string;watches:Watch[];alerts:Alert[]}

function Evidence({claims}:{claims:Change['before']}) {
  if (!claims) return <p>No previous information.</p>;
  if (typeof claims==='string') return <p>{claims}</p>;
  return claims.length ? <ul className="list-disc pl-5">{claims.map((claim,index)=>
    <li key={index}>{claim.text}<blockquote className="text-sm text-slate-600">{claim.quote}</blockquote></li>)}</ul>
    : <p>Not specified in the official source.</p>;
}

function EligibilityChecklist({watch,onSave,busy}:{
  watch:Watch;onSave:(answers:Record<string,Answer>)=>void;busy:boolean;
}) {
  const [answers,setAnswers]=useState(watch.answers || {});
  const conditions=(['whoCanApply','eligibility'] as const).flatMap(section=>
    (watch.description?.[section] || []).map((claim,index)=>({...claim,key:section+'.'+index})));
  const unknown=conditions.filter(claim=>!answers[claim.key] || answers[claim.key]==='unknown').length;
  const unmet=conditions.filter(claim=>answers[claim.key]==='unmet').length;
  return <div className="space-y-3">
    {watch.stale && <p role="status" className="rounded bg-amber-50 p-3">The published source changed. Check the current conditions again.</p>}
    <p className="text-sm">Your answers are a self-assessment. The issuing authority decides eligibility.</p>
    {!conditions.length ? <p>Eligibility evidence is not available for this scheme yet.</p> : <form onSubmit={event=>{event.preventDefault();onSave(answers);}} className="space-y-3">
      {conditions.map(claim=><div key={claim.key} className="rounded-lg border border-slate-200 p-3">
        <label className="grid gap-2">{claim.text}
          <select aria-label={'Your answer for '+claim.text} value={answers[claim.key] || 'unknown'}
            onChange={event=>setAnswers({...answers,[claim.key]:event.target.value as Answer})}>
            <option value="unknown">Unknown — I need to check</option>
            <option value="met">Met — this applies to me</option>
            <option value="unmet">Unmet — this does not apply to me</option>
          </select>
        </label>
        <details className="pt-2 text-sm"><summary>Official evidence</summary><blockquote className="whitespace-pre-wrap">{claim.quote}</blockquote>
          <a className="underline" href={watch.source_url || undefined} target="_blank" rel="noreferrer">Read official source</a></details>
      </div>)}
      <p role="status">{unmet ? unmet+' conditions marked unmet.' : unknown ? unknown+' conditions still unknown.' : 'You marked all listed conditions met.'}</p>
      <button className="primary-action" disabled={busy}>Save assessment</button>
    </form>}
    <h3 className="font-bold">Documents to prepare</h3>
    {watch.description?.documents?.length ? <ul className="list-disc pl-5">{watch.description.documents.map((claim,index)=>
      <li key={index}>{claim.text}<details><summary>Official evidence</summary><blockquote>{claim.quote}</blockquote></details></li>)}</ul>
      : <p>Not specified in the official source.</p>}
  </div>;
}

export const MySchemesPage=()=>{
  const [data,setData]=useState<Dashboard>();
  const [state,setState]=useState('');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [view,setView]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    api.get<{data:Dashboard}>('/citizen-schemes',{signal:controller.signal}).then(result=>{
      const raw=result.data.data;
      setData({...raw,watches:raw.watches || [],alerts:raw.alerts || []});setState(raw.state || '');
    }).catch(err=>{if (!controller.signal.aborted) setError(errorMessage(err));});
    return ()=>controller.abort();
  },[view]);
  async function change(path:string,body:unknown,method:'put'|'post'|'delete'='put') {
    setBusy(true);setError('');setMessage('');
    try {
      await api.request({url:'/citizen-schemes/'+path,method,data:body});
      setMessage('Saved.');setView(value=>value+1);
    } catch(err) {setError(errorMessage(err));}
    finally {setBusy(false);}
  }
  function saveProfile(event:FormEvent) {event.preventDefault();void change('profile',{state});}
  return <div className="workflow">
    <header className="workflow-heading"><div><h1>My schemes</h1><p>Follow schemes, check cited conditions and see official updates.</p></div>
      <Link to="/schemes" className="secondary-action">Browse schemes</Link></header>
    {error && <p role="alert" className="workflow-error">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!data ? <p role="status">Loading your schemes…</p> : <>
      <section className="workflow-card"><h2>Your location</h2>
        <form onSubmit={saveProfile} className="space-y-3">
          <label className="grid gap-2">State or union territory<input maxLength={120} value={state} onChange={event=>setState(event.target.value)} placeholder="For example, Karnataka"/></label>
          <button className="secondary-action" disabled={busy}>Save location</button>
        </form><p className="text-sm pt-2">Location helps you compare a scheme’s coverage with where you live.</p>
      </section>
      <section className="workflow-card"><h2>Scheme updates</h2>
        {!data.alerts.length && <p>Updates to followed schemes will appear here after a new version is published.</p>}
        {data.alerts.map(alert=><article key={alert.id} className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3">
          <h3 className="font-bold"><Link to={'/schemes/'+alert.scheme_id}>{alert.scheme_name}</Link>{!alert.read_at && ' · Unread'}</h3>
          <p>{new Date(alert.created_at).toLocaleString()}</p>
          {Object.entries(alert.changes).map(([section,change])=><details key={section}>
            <summary>{sectionNames[section] || section} changed</summary>
            <div className="grid gap-3 py-2 sm:grid-cols-2"><div><h4 className="font-bold">Previous publication</h4><Evidence claims={change.before}/></div>
              <div><h4 className="font-bold">New publication</h4><Evidence claims={change.after}/></div></div>
          </details>)}
          <a className="underline" href={alert.source_url} target="_blank" rel="noreferrer">Official source</a>
          {!alert.read_at && <button className="secondary-action" disabled={busy} onClick={()=>void change('alerts/'+alert.id+'/read',{},'post')}>Mark read</button>}
        </article>)}
      </section>
      <section className="workflow-card"><h2>Followed schemes</h2>
        {!data.watches.length && <p>Open a scheme and choose Follow updates to start.</p>}
        {data.watches.map(watch=><article key={watch.scheme_id} className="mt-4 space-y-3 rounded-lg border border-slate-200 p-4">
          <h3 className="font-bold"><Link className="underline" to={'/schemes/'+watch.scheme_id}>{watch.scheme?.scheme_name || 'Scheme'}</Link></h3>
          {watch.scheme?.coverage_state && <p>Published coverage · {watch.scheme.coverage_state}
            {data.state && data.state.toLowerCase()!==watch.scheme.coverage_state.toLowerCase() && ' · Check the residence conditions against your saved location.'}</p>}
          <EligibilityChecklist key={watch.scheme_id+watch.version_id+view} watch={watch} busy={busy}
            onSave={answers=>void change('assessments/'+watch.scheme_id,{versionId:watch.version_id,answers})}/>
          <button className="secondary-action" disabled={busy} onClick={()=>void change('watches/'+watch.scheme_id,{},'delete')}>Unfollow</button>
        </article>)}
      </section>
    </>}
  </div>;
};
