import { useCallback,useEffect,useState } from 'react';
import { Link,useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { errorMessage } from '../services/workflow';
import { SchemeAdminPage } from './SchemeAdminPage';

function useAdminData<T>(path:string,poll=false) {
  const [data,setData]=useState<T>(),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(value=>value+1),[]);
  useEffect(()=>{
    const controller=new AbortController();setData(undefined);setError('');
    const load=()=>api.get('/admin/'+path,{signal:controller.signal}).then(result=>{setData(result.data.data);setError('');})
      .catch(err=>{if (!controller.signal.aborted) setError(errorMessage(err));});
    void load();const timer=poll?window.setInterval(()=>void load(),3000):undefined;
    return ()=>{controller.abort();if (timer) clearInterval(timer);};
  },[path,poll,revision]);
  return {data,error,refresh};
}
function Feedback({error,loading}:{error:string;loading:boolean}) {
  return error?<p role="alert" className="workflow-error">{error}</p>:loading?<p role="status">Loading administration…</p>:null;
}
const date=(value:string|null)=>value?new Date(value).toLocaleString():'Not yet checked';
interface Request {id:string;status:string;trigger_kind:string;attempts:number;created_at:string;started_at:string|null;finished_at:string|null;added:number;changed:number;skipped:number;failed:number;error:string|null}
export function AdminOverview() {
  const {data,error}=useAdminData<{published:number;review:number;notices:number;source_review:number;failing:number;verified_users:number;latest:Request|null}>('overview',true);
  return <div className="workflow"><h1 className="text-2xl font-bold">Administration</h1>
    <div className="inline-actions"><Link className="primary-action" to="/admin/review">Review changes</Link><Link className="secondary-action" to="/admin/discovery">Discovery and sync</Link></div>
    <Feedback error={error} loading={!data}/>{data && <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
        ['/admin/schemes?status=ACTIVE','Published schemes',data.published],['/admin/review','Changes awaiting review',data.review],
        ['/admin/review/notices','Submitted notices',data.notices],['/admin/sources?access=pending','Sources awaiting approval',data.source_review],
        ['/admin/sources?health=failing','Failing sources',data.failing],['/admin/users','Verified accounts',data.verified_users],
      ].map(([to,label,count])=><Link key={String(label)} className="workflow-card" to={String(to)}><strong className="block text-3xl">{count}</strong>{label}</Link>)}</div>
      <section className="workflow-card"><h2>Latest discovery request</h2>{data.latest?<p><Link className="underline" to="/admin/discovery">{data.latest.status} · {data.latest.trigger_kind} · {date(data.latest.created_at)}</Link></p>:<p>No recorded discovery request yet. Open Discovery to queue the first check.</p>}</section>
    </>}
  </div>;
}
interface Scheme {id:string;scheme_name:string;category:string;state:string|null;status:string;application_status:string;official_url:string;current_version:string|null;published_version:string|null}
export function AdminSchemes() {
  const [params,setParams]=useSearchParams();
  const query=new URLSearchParams(params);query.delete('version');
  const {data,error,refresh}=useAdminData<{items:Scheme[];total:number;page:number}>('schemes?'+query.toString());
  const [history,setHistory]=useState<Array<{id:string;status:string;review_disposition:string;fetched_at:string;verified_at:string|null;source_url:string}>>();
  const [actionError,setActionError]=useState(''),[busy,setBusy]=useState(false);
  async function action(fn:()=>Promise<void>) {setBusy(true);setActionError('');try {await fn();} catch(err){setActionError(errorMessage(err));}finally {setBusy(false);}}
  if (params.has('version')) return <div className="workflow"><Link className="underline" to="/admin/review">Back to review queue</Link><SchemeAdminPage/></div>;
  return <div className="workflow"><h1 className="text-2xl font-bold">Scheme catalog</h1>
    <form className="inline-actions" onSubmit={event=>{event.preventDefault();setParams(Object.fromEntries(new FormData(event.currentTarget)) as Record<string,string>);}}>
      <label>Search schemes<input name="q" defaultValue={params.get('q') || ''} maxLength={200}/></label>
      <label>Publication status<select name="status" defaultValue={params.get('status') || ''}><option value="">All</option><option>ACTIVE</option><option>ARCHIVED</option><option>INACTIVE</option></select></label>
      <label>Category<input name="category" defaultValue={params.get('category') || ''}/></label><button className="secondary-action">Search</button>
    </form><Feedback error={error || actionError} loading={!data}/>
    {data && <><p>{data.total} schemes</p>{!data.items.length && <p>No schemes match these filters.</p>}
      {data.items.map(scheme=><article key={scheme.id} className="workflow-card"><h2>{scheme.scheme_name}</h2><p>{scheme.category} · {scheme.state || 'India / check coverage'} · {scheme.status} · Application: {scheme.application_status}</p>
        <a className="underline" href={scheme.official_url} target="_blank" rel="noreferrer">Official evidence</a>
        <div className="inline-actions mt-3"><Link to={'/schemes/'+scheme.id}>Public page</Link>
          <button className="secondary-action" disabled={busy} onClick={()=>void action(async()=>{const reply=await api.post('/admin/schemes/'+scheme.id+'/draft');setParams({version:reply.data.data.version_id});})}>Edit description</button>
          <button className="secondary-action" disabled={busy} onClick={()=>void action(async()=>setHistory((await api.get('/admin/schemes/'+scheme.id+'/history')).data.data))}>Revision history</button>
        </div>
        {scheme.status!=='ARCHIVED' && <form className="inline-actions mt-3" onSubmit={event=>{event.preventDefault();const reason=String(new FormData(event.currentTarget).get('reason'));void action(async()=>{await api.post('/admin/schemes/'+scheme.id+'/archive',{reason});refresh();});}}>
          <label>Archive reason<input name="reason" required minLength={5} maxLength={1000}/></label><button className="secondary-action" disabled={busy}>Archive scheme</button>
        </form>}
      </article>)}
      <div className="inline-actions"><button disabled={data.page<=1} onClick={()=>{params.set('page',String(data.page-1));setParams(params);}}>Previous</button><span>Page {data.page}</span><button disabled={data.page*40>=data.total} onClick={()=>{params.set('page',String(data.page+1));setParams(params);}}>Next</button></div>
    </>}
    {history && <section className="workflow-card"><h2>Revision history</h2>{!history.length && <p>No imported revisions. Import official evidence below.</p>}{history.map(version=><p key={version.id}><Link className="underline" to={'/admin/schemes?version='+version.id}>{date(version.fetched_at)} · {version.status} · {version.review_disposition}</Link> · Verified {date(version.verified_at)}</p>)}</section>}
    <SchemeAdminPage/>
  </div>;
}
interface Review {id:string;original_title:string;status:string;review_disposition:string;possible_duplicate:boolean;error:string|null;metadata:{reviewNote?:string}}
export function AdminReview() {
  const {data,error}=useAdminData<Review[]>('review');
  return <div className="workflow"><h1 className="text-2xl font-bold">Review changes</h1><div className="inline-actions"><Link to="/admin/review/notices" className="secondary-action">Review submitted notices</Link><Link to="/admin/sources" className="secondary-action">Review discovered sources</Link></div>
    <Feedback error={error} loading={!data}/>{data && !data.length && <p>No scheme changes await review.</p>}
    {data?.map(item=><article key={item.id} className="workflow-card"><h2>{item.original_title}</h2><p>{item.status} · {item.review_disposition}</p>
      {item.possible_duplicate && <p>Possible duplicate: compare official identifiers and state variants before publishing.</p>}
      <p>{item.error || item.metadata.reviewNote || 'Check eligibility, benefits, application dates and source evidence.'}</p>
      <Link className="secondary-action" to={'/admin/schemes?version='+item.id}>Inspect evidence and decide</Link>
    </article>)}
  </div>;
}
interface Run {id:string;source_id:string;trigger_kind:string;started_at:string;finished_at:string|null;added:number;changed:number;skipped:number;failed:number;published:number;error:string|null;outcomes:Array<{url:string;result:string;error?:string}>}
export function AdminDiscovery() {
  const {data,error,refresh}=useAdminData<{requests:Request[];runs:Run[]}>('discovery',true);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[actionError,setActionError]=useState('');
  const active=data?.requests.find(request=>['queued','running'].includes(request.status));
  return <div className="workflow"><h1 className="text-2xl font-bold">Discovery and sync</h1><p>Checks run on the backend schedule independently of this page. A saved request resumes after a worker restart.</p>
    <button className="primary-action" disabled={busy || Boolean(active) || !data} onClick={async()=>{setBusy(true);setActionError('');try {const reply=await api.post('/admin/discovery/sync');setMessage('Request '+reply.data.data.request.id+' queued.');refresh();}catch(err){setActionError(errorMessage(err));}finally {setBusy(false);}}}>Sync now</button>
    {active && <p role="status">{active.status} · Request {active.id} · Attempt {active.attempts}</p>}{message && <p role="status">{message}</p>}
    <Feedback error={error || actionError} loading={!data}/>
    <section className="workflow-card"><h2>Requests</h2>{data && !data.requests.length && <p>No queued checks yet.</p>}{data?.requests.map(request=><article key={request.id} className="border-b py-3"><strong>{request.trigger_kind} · {request.status}</strong><p>{date(request.created_at)} · {request.added} added · {request.changed} updated · {request.skipped} skipped · {request.failed} failed · {request.attempts} attempts</p>{request.error && <p>{request.error}</p>}</article>)}</section>
    <section className="workflow-card"><h2>Source runs</h2>{data && !data.runs.length && <p>Source results will appear after the first check.</p>}{data?.runs.map(run=><article key={run.id} className="border-b py-3"><strong>{run.source_id} · {run.trigger_kind}</strong><p>{date(run.started_at)} · {run.finished_at?'Finished':'Running'}</p><p>{run.added} added · {run.changed} updated · {run.skipped} skipped · {run.failed} failed · {run.published} published</p>{run.error && <p>{run.error}</p>}<details><summary>Source outcomes</summary>{run.outcomes.map((item,index)=><p key={index} className="break-all"><a className="underline" href={item.url}>{item.url}</a> · {item.result}{item.error && ' · '+item.error}</p>)}</details></article>)}</section>
  </div>;
}
interface Account {id:string;name:string;email:string;email_verified_at:string|null;registration_pending:boolean;role:string;created_at:string}
export function AdminUsers() {
  const [params,setParams]=useSearchParams();
  const {data,error}=useAdminData<{items:Account[];total:number;page:number}>('users?'+params.toString());
  const [message,setMessage]=useState(''),[inviteError,setInviteError]=useState(''),[busy,setBusy]=useState(false);
  return <div className="workflow"><h1 className="text-2xl font-bold">Accounts</h1>
    <form className="inline-actions" onSubmit={event=>{event.preventDefault();setParams({q:String(new FormData(event.currentTarget).get('q') || '')});}}><label>Search accounts<input name="q" maxLength={200}/></label><button className="secondary-action">Search</button></form>
    <Feedback error={error || inviteError} loading={!data}/>{message && <p role="status">{message}</p>}
    <section className="workflow-card"><h2>Invite an administrator</h2><p>Access is granted only after the invited address confirms its single-use email link.</p>
      <form className="inline-actions" onSubmit={async event=>{event.preventDefault();const email=String(new FormData(event.currentTarget).get('email'));setBusy(true);try {setMessage((await api.post('/auth/admin-invitations',{email})).data.data.message);}catch(err){setInviteError(errorMessage(err));}finally{setBusy(false);}}}><label>Administrator email<input type="email" name="email" required/></label><button className="secondary-action" disabled={busy}>Send invitation</button></form>
    </section>
    {data && <><p>{data.total} accounts · Pending accounts are excluded from the overview's verified count.</p>{!data.items.length && <p>No accounts match your search.</p>}{data.items.map(account=><article className="workflow-card" key={account.id}><h2>{account.name}</h2><p>{account.email}</p><p>{account.email_verified_at?'Verified':'Pending verification'} · {account.role} · Created {date(account.created_at)}</p></article>)}
      <div className="inline-actions"><button disabled={data.page<=1} onClick={()=>{params.set('page',String(data.page-1));setParams(params);}}>Previous</button><span>Page {data.page}</span><button disabled={data.page*40>=data.total} onClick={()=>{params.set('page',String(data.page+1));setParams(params);}}>Next</button></div>
    </>}
  </div>;
}
interface Audit {id:string;actor_id:string|null;actor_kind:string;action:string;entity_type:string;entity_id:string;reason:string;created_at:string}
export function AdminAudit() {
  const [page,setPage]=useState(1),{data,error}=useAdminData<Audit[]>('audit?page='+page);
  return <div className="workflow"><h1 className="text-2xl font-bold">Audit history</h1><Feedback error={error} loading={!data}/>{data && !data.length && <p>No recorded changes on this page.</p>}{data?.map(item=><article key={item.id} className="workflow-card"><h2>{item.action}</h2><p>{date(item.created_at)} · {item.actor_kind} · {item.actor_id || 'Backend worker'}</p><p className="break-all">{item.entity_type}: {item.entity_id}</p><p>{item.reason}</p></article>)}<div className="inline-actions"><button disabled={page<=1} onClick={()=>setPage(value=>value-1)}>Previous</button><span>Page {page}</span><button disabled={!data || data.length<50} onClick={()=>setPage(value=>value+1)}>Next</button></div></div>;
}
