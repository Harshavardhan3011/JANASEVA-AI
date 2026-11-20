import { useEffect,useState } from 'react';
import type { FormEvent } from 'react';
import { Link,useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { errorMessage } from '../services/workflow';
import { dateLabel,emptyDescription,schemeSections } from '../services/schemeDetails';
import type { Claim,Description,SchemeStatus,Section } from '../services/schemeDetails';
import { draftFieldLabel,prepareDraft } from '../services/schemeDraft';

const endpoint='/scheme-catalog-admin';
const categories=['Other','Agriculture','Education','Employment','Finance','Health','Housing','Infrastructure','Social welfare'];
interface Source {id:string;label:string;url:string;enabled:boolean;interval_minutes:number;last_success_at:string|null;last_checked_at:string|null;last_error:string|null}
interface Run {id:string;source_id:string;trigger_kind:string;started_at:string;finished_at:string|null;added:number;changed:number;skipped:number;failed:number;published:number;error:string|null;outcomes:Array<{url:string;result:string;error?:string}>}
interface Import {id:string;scheme_id:string|null;version_id:string;original_title:string;status:string;error:string|null;metadata:{title:string}}
interface Registry {id:string;label:string;url:string;purpose:string;jurisdiction:string;department:string;access_method:string;access_note:string;approved:boolean;last_error:string|null}
interface Dashboard {sources:Source[];runs:Run[];imports:Import[];registry:Registry[];coverage:Array<{jurisdiction:string;department:string;sources:number;approved:number}>}
interface Version {id:string;source_url:string;original_title:string;source_text:string;metadata:{title:string;applyUrl:string|null;reviewNote?:string;incomplete:boolean};description:Description|null;published_description:Description|null;error:string|null;status:string;scheme_id:string|null}

function ClaimInput({ claim,onChange }:{claim:Claim;onChange:(value:Claim)=>void}) {
  return <div className="input-grid">
    <label>Public wording<textarea aria-label="Public wording" className="rounded-md border border-slate-300 p-2" value={claim.text}
      minLength={3} maxLength={1600} placeholder="Describe one claim (at least 3 characters)" rows={3} onChange={event=>onChange({...claim,text:event.target.value})}/></label>
    <label>Exact passage from official source<textarea aria-label="Exact passage from official source" className="rounded-md border border-slate-300 p-2" value={claim.quote}
      minLength={5} maxLength={2400} placeholder="Copy the supporting source passage (at least 5 characters)" rows={3} onChange={event=>onChange({...claim,quote:event.target.value})}/></label>
  </div>;
}

export const SchemeAdminPage=({section='editor'}:{section?:'editor'|'sources'})=>{
  const [params]=useSearchParams();
  const selectedVersion=params.get('version');
  const [reason,setReason]=useState('');
  const [registryEdit,setRegistryEdit]=useState<Registry>();
  const {user}=useAuth();
  const [dashboard,setDashboard]=useState<Dashboard>();
  const [version,setVersion]=useState<Version>();
  const [draft,setDraft]=useState<Description>(emptyDescription);
  const [verified,setVerified]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const config={};
  async function loadDashboard() {
    setDashboard((await api.get<{data:Dashboard}>(endpoint,config)).data.data);
  }
  async function open(id:string) {
    const row=(await api.get<{data:Version}>(endpoint+'/versions/'+id,config)).data.data;
    setVersion(row);setDraft({...emptyDescription(),...row.description});setVerified(false);
  }
  async function act(fn:()=>Promise<void>) {
    setBusy(true);setError('');setMessage('');
    try { await fn(); }
    catch(err) {
      const response=(err as {response?:{data?:{error?:{issues?:Array<{path:Array<string|number>;message:string}>;details?:Record<string,string[]>}}}})?.response?.data;
      const issues=response?.error?.issues;
      const details=issues?.length ? issues.map(issue=>draftFieldLabel(issue.path)+': '+issue.message).join('\n') :
        response?.error?.details ? Object.entries(response.error.details).map(([field,messages])=>field+': '+messages.join(' ')).join('\n') : '';
      setError(response ? [errorMessage(err),details].filter(Boolean).join('\n') : err instanceof Error ? err.message : errorMessage(err));
    } finally { setBusy(false); }
  }
  useEffect(()=>{
    if (!user?.is_admin) return;
    const controller=new AbortController();
    api.get<{data:Dashboard}>(endpoint,{signal:controller.signal}).then(result=>setDashboard(result.data.data))
      .catch(err=>{if (!controller.signal.aborted) setError(errorMessage(err));});
    return ()=>controller.abort();
  },[user?.is_admin]);
  useEffect(()=>{
    if (!selectedVersion || !user?.is_admin) return;
    const controller=new AbortController();setVersion(undefined);
    api.get<{data:Version}>(endpoint+'/versions/'+selectedVersion,{signal:controller.signal}).then(result=>{setVersion(result.data.data);setDraft({...emptyDescription(),...result.data.data.description});setVerified(false);})
      .catch(err=>{if (!controller.signal.aborted) setError(errorMessage(err));});
    return ()=>controller.abort();
  },[selectedVersion,user?.is_admin]);
  const unlocked=Boolean(dashboard);
  useEffect(()=>{
    if (!unlocked) return;
    const controller=new AbortController();
    const timer=window.setInterval(()=>{
      api.get<{data:Dashboard}>(endpoint,{signal:controller.signal})
        .then(result=>setDashboard(result.data.data)).catch(()=>{});
    },10000);
    return ()=>{clearInterval(timer);controller.abort();};
  },[unlocked]);
  function submitImport(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form=event.currentTarget;
    const body=new FormData(form);
    if (!String(body.get('officialId') || '').trim()) body.delete('officialId');
    if (!(body.get('officialPdf') as File | null)?.size) body.delete('officialPdf');
    void act(async()=>{
      const reply=await api.post<{data:{result:string;version:Version}}>(endpoint+'/import',body,{...config,timeout:100000});
      await loadDashboard();await open(reply.data.data.version.id);
      setMessage(reply.data.data.result==='skipped'?'Source unchanged. Opened the existing version.':'Official source captured.');
    });
  }
  const path=version ? endpoint+'/versions/'+version.id : '';
  function updateClaim(section:Section,index:number,claim:Claim) {
    setDraft(current=>({...current,[section]:(current[section] || []).map((item,i)=>i===index?claim:item)}));
  }
  if (!user?.is_admin) return <p role="alert">Administrator sign-in is required to manage sources and publishing.</p>;
  return <div className="workflow">
    <Link className="back-link" to="/schemes">← Schemes</Link>
    <header className="workflow-heading"><div><h1>{section==='sources'?'Official sources':'Scheme evidence and editor'}</h1><p>Import official material, review changes, and monitor scheduled syncs.</p></div></header>
    {error ? <p role="alert" className="workflow-error whitespace-pre-line">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {dashboard ? <>
      {section==='sources' && <><section className="workflow-card"><h2>Official source registry</h2>
        <p>Confirm the access method and publisher terms before approving a source. Feed and API contracts require a dedicated connector.</p>
        <details open={Boolean(registryEdit)||undefined}><summary>{registryEdit?'Edit official source':'Add an official source'}</summary><form key={registryEdit?.id || 'new'} className="grid gap-3 pt-3" onSubmit={event=>{
          event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));
          void act(async()=>{await api.put(endpoint+'/registry/'+values.id,{...values,approved:values.approved==='on'},config);await loadDashboard();setMessage('Registry saved.');});
        }}>
          {['id','label','url','purpose','jurisdiction','department','access_note'].map(field=><label className="grid gap-1" key={field}>{field.replace('_',' ')}<input name={field} defaultValue={String(registryEdit?.[field as keyof Registry] ?? '')} readOnly={field==='id' && Boolean(registryEdit)} required maxLength={field==='access_note'?1000:500}/></label>)}
          <label>Access method<select name="access_method" defaultValue={registryEdit?.access_method || 'manual_review'}><option value="manual_review">Manual review</option><option value="listing">Permitted public listing</option><option value="document">Official document</option><option value="feed">Feed</option><option value="api">API</option></select></label>
          <label><input name="approved" type="checkbox" defaultChecked={registryEdit?.approved || false}/>I verified permitted automated access for this source.</label>
          <button className="secondary-action" disabled={busy}>Save source</button><button type="button" onClick={()=>setRegistryEdit(undefined)}>Clear form</button>
        </form></details>
        <div className="space-y-3 pt-3">{dashboard.registry?.filter(source=>params.get('access')!=='pending' || !source.approved).map(source=><article key={source.id} className="rounded border border-slate-200 p-3">
          <a className="underline font-bold" href={source.url} target="_blank" rel="noreferrer">{source.label}</a>
          <button className="secondary-action" onClick={()=>setRegistryEdit(source)}>Edit source</button><p>{source.purpose}</p><p>{source.jurisdiction} · {source.department} · {source.access_method} · {source.approved?'Approved':'Access review required'}</p><p>{source.access_note}</p>
        </article>)}</div>
        <details className="mt-4"><summary>Jurisdiction and department coverage</summary>
          <p>Counts show registered sources and access approval. Zero means a source still needs to be added.</p>
          <div className="max-h-80 overflow-auto"><table className="w-full text-sm"><thead><tr><th>Jurisdiction</th><th>Department</th><th>Sources</th><th>Approved</th></tr></thead>
            <tbody>{dashboard.coverage?.map(row=><tr key={row.jurisdiction+row.department}><td>{row.jurisdiction}</td><td>{row.department}</td><td>{row.sources}</td><td>{row.approved}</td></tr>)}</tbody></table></div>
        </details>
      </section>
      <section className="workflow-card">
        <div className="section-heading"><div><h2>Sources and sync runs</h2></div>
          <Link className="secondary-action" to="/admin/discovery">Discovery and sync</Link>
        </div>
        <div className="divide-y divide-slate-200">
          {dashboard.sources.filter(source=>params.get('health')!=='failing' || source.last_error).map(source=><article className="py-3" key={source.id}>
            <a className="font-bold text-teal-800 underline" href={source.url} target="_blank" rel="noreferrer">{source.label}</a>
            <p className="text-sm">Last checked: {source.last_checked_at ? new Date(source.last_checked_at).toLocaleString() : 'Pending'} · Last successful sync: {source.last_success_at ? new Date(source.last_success_at).toLocaleString() : 'Pending'}</p>
            {source.last_error ? <p className="text-sm text-red-800">{source.last_error}</p> : null}
            <form className="inline-actions mt-2" onSubmit={event=>{
              event.preventDefault();const fields=new FormData(event.currentTarget);
              void act(async()=>{await api.patch(endpoint+'/sources/'+source.id,{minutes:Number(fields.get('minutes')),enabled:fields.has('enabled')},config);await loadDashboard();});
            }}>
              <label>Interval in minutes <input name="minutes" type="number" min={15} max={10080} defaultValue={source.interval_minutes} required className="w-24"/></label>
              <label className="inline-flex items-center gap-2"><input name="enabled" type="checkbox" defaultChecked={source.enabled}/> Enabled</label>
              <button className="secondary-action" disabled={busy}>Save schedule</button>
            </form>
          </article>)}
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer font-semibold">Recent runs</summary>
          {dashboard.runs.map(run=><article className="border-b border-slate-200 py-3 text-sm" key={run.id}>
            <strong>{run.source_id} · {run.trigger_kind}</strong>
            <p>{new Date(run.started_at).toLocaleString()} · {run.finished_at?'Finished':'Started'}</p>
            <p>{run.added} added · {run.changed} updated · {run.skipped} skipped · {run.failed} failed · {run.published} published</p>
            {run.error ? <p>{run.error}</p> : null}
            {run.outcomes.length ? <ul>{run.outcomes.map((item,index)=><li key={index}>
              <a className="break-all text-teal-800 underline" href={item.url}>{item.url}</a> · {item.result}{item.error ? ' · '+item.error : ''}
            </li>)}</ul> : null}
          </article>)}
        </details>
      </section>
      </>}
      {section==='editor' && <>{!selectedVersion && <><section className="workflow-card">
        <h2>Import a scheme</h2><p>Use a supported official URL. If automated access fails, attach the official PDF.</p>
        <form onSubmit={submitImport}>
          <div className="input-grid">
            <label>Official source URL<input name="url" type="url" required/></label>
            <label>Scheme name<input name="title" required minLength={3} maxLength={255}/></label>
            <label>Issuing authority<input name="issuer" required maxLength={255}/></label>
            <label>Aliases, separated by commas<input name="aliases" maxLength={1000}/></label>
            <label>Official scheme ID (if provided)<input name="officialId" maxLength={120}/></label>
            <label>State (leave empty for national)<input name="state" maxLength={120}/></label>
            <label>Category<select name="category">{categories.map(item=><option key={item}>{item}</option>)}</select></label>
            <label>Official PDF (optional)<input name="officialPdf" type="file" accept=".pdf,application/pdf"/></label>
          </div>
          <button className="primary-action" disabled={busy}>Import for review</button>
        </form>
      </section>
      <section className="workflow-card">
        <h2>Imported schemes</h2>
        {dashboard.imports.length ? <ul className="divide-y divide-slate-200">{dashboard.imports.map(item=><li key={item.id} className="py-3">
          <div className="inline-actions"><strong>{item.metadata.title}</strong><span className="state-label">{item.status.replace('_',' ')}</span>
            <button className="secondary-action" disabled={busy} onClick={()=>void act(()=>open(item.version_id))}>Open version</button>
            {item.scheme_id ? <Link className="text-sm text-teal-800 underline" to={'/schemes/'+item.scheme_id}>Published page</Link> : null}
          </div>{item.error ? <p className="text-sm">{item.error}</p> : null}
        </li>)}</ul> : <p>No schemes have been imported.</p>}
      </section>
      </>}
      {version ? <section className="workflow-card">
        <h2>{version.metadata.title}</h2>
        <p><a className="text-teal-800 underline" href={version.source_url} target="_blank" rel="noreferrer">{version.original_title}</a></p>
        {version.metadata.reviewNote ? <p role="note">{version.metadata.reviewNote}</p> : null}
        {version.metadata.incomplete ? <p role="note">Source text may be incomplete.</p> : null}
        {version.error ? <p role="note">{version.error}</p> : null}
        {version.status==='generation_failed' ? <p role="note">AI generation did not complete. The official text and any published version are preserved. Retry after fixing the provider issue, or enter supported claims below. This page may describe an announcement rather than a scheme; do not publish it as a scheme unless its evidence supports that.</p> : null}
        {draft.reviewIssues.map(issue=><p key={issue} role="note">{issue}</p>)}
        <details className="mt-3"><summary className="cursor-pointer font-semibold">Official source text</summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-100 p-3 text-sm">{version.source_text}</pre>
        </details>
        {version.metadata.applyUrl ? <p>Application link from source: <a href={version.metadata.applyUrl}>{version.metadata.applyUrl}</a></p> : null}
        {version.published_description && version.status!=='published' ? <details className="mt-3">
          <summary className="cursor-pointer font-semibold">Compare with the published version</summary>
          {schemeSections.filter(([key])=>JSON.stringify(draft[key])!==JSON.stringify(version.published_description?.[key])).map(([key,label])=><div className="py-2" key={key}>
            <strong>{label}</strong><p>Published: {version.published_description?.[key].map(item=>item.text).join(' ') || 'No details'}</p>
            <p>Draft: {draft[key].map(item=>item.text).join(' ') || 'No details'}</p>
          </div>)}
          <p>Application status: {version.published_description.status} → {draft.status}</p>
        </details> : null}
        {version.status!=='published' ? <button className="secondary-action mt-3" disabled={busy} onClick={()=>void act(async()=>{
          const result=await api.post<{data:Version}>(path+'/retry',{}, {...config,timeout:100000});await open(version.id);await loadDashboard();
          if (result.data.data.status==='generation_failed') setError(result.data.data.error || 'AI generation failed. Your source is preserved; check the provider configuration before retrying.');
          else setMessage('Loaded the latest generation result.');
        })}>Retry AI generation</button> : null}
        <fieldset disabled={busy || version.status==='published'}>
          <p className="mt-3 text-sm">Each item needs public wording (3–1600 characters) and an exact supporting source passage (5–2400 characters). Empty added rows are ignored; complete or remove partially filled rows. Leave missing sections empty.</p>
          {schemeSections.map(([section,label])=><details className="mt-3 rounded-md border border-slate-200 p-3" key={section} open={section==='overview'||error.includes(label+' item')||undefined}>
            <summary className="cursor-pointer font-semibold">{label} ({draft[section].length})</summary>
            {(draft[section] || []).map((claim,index)=><div key={index} className="pb-2">
              <ClaimInput claim={claim} onChange={value=>updateClaim(section,index,value)}/>
              <button className="text-action mt-1" onClick={()=>setDraft(current=>({...current,[section]:current[section].filter((_,i)=>i!==index)}))}>Remove item</button>
            </div>)}
            <button className="secondary-action mt-2" onClick={()=>setDraft(current=>({...current,[section]:[...current[section],{text:'',quote:''}]}))}>Add item</button>
          </details>)}
          <label className="mt-4 grid max-w-xs gap-1">Application status
            <select value={draft.status} onChange={event=>{
              const status=event.target.value as SchemeStatus;
              setDraft(current=>({...current,status,statusEvidence:status==='unknown'?null:{text:'',quote:''}}));
            }}><option value="unknown">Not specified</option><option value="open">Open</option><option value="closed">Closed</option><option value="announced">Announced</option><option value="rolling">Rolling</option></select>
          </label>
          {draft.statusEvidence ? <ClaimInput claim={draft.statusEvidence} onChange={claim=>setDraft(current=>({...current,statusEvidence:claim}))}/> : null}
          {version.status!=='published' ? <>
            <label className="grid gap-2 mt-3">Review reason<textarea value={reason} minLength={5} maxLength={1000} onChange={event=>setReason(event.target.value)}/></label>
            <label className="approval-check"><input type="checkbox" checked={verified} onChange={event=>setVerified(event.target.checked)}/>I verified the public description against the official source.</label>
            <div className="inline-actions mt-4">
              <button className="secondary-action" onClick={()=>void act(async()=>{const payload=prepareDraft(draft);await api.put(path,payload,config);setDraft(payload);setVersion(current=>current?{...current,description:payload,status:'draft',error:null}:current);setMessage('Draft saved.');await loadDashboard();})}>Save draft</button>
              <button className="primary-action !mt-0" disabled={!verified || reason.trim().length<5} onClick={()=>void act(async()=>{
                const payload=prepareDraft(draft);
                if (!payload.overview.length) throw new Error('Overview: add at least one claim with an exact official source passage before publishing.');
                await api.put(path,payload,config);setDraft(payload);
                await api.post('/admin/review/'+version.id,{action:'approve',reason},config);await open(version.id);await loadDashboard();
                setMessage('Scheme published.');
              })}>Publish verified version</button>
              <button className="secondary-action" disabled={reason.trim().length<5} onClick={()=>void act(async()=>{await api.post('/admin/review/'+version.id,{action:'reject',reason});setMessage('Change rejected. Published version preserved.');await loadDashboard();})}>Reject change</button>
            </div>
          </> : null}
        </fieldset>
      </section> : null}</>}
    </> : null}
  </div>;
};
