import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { api } from '../services/api';
import { errorMessage } from '../services/workflow';

const endpoint = '/scheme-monitor';
const levels = ['National','State','District','Village'];
const categories = ['Agriculture','Education','Employment','Finance','Health','Housing','Infrastructure','Social welfare','Other'];
const locationFields = [['state','State'],['district','District'],['village','Village']] as const;
const textFields = [['description','Public summary'],['benefits','Benefits'],['eligibility','Eligibility']] as const;

interface Source {
  id:string; label:string; url:string; enabled:boolean; checked_at:string|null;
  next_check_at:string; last_status:string; last_message:string|null;
}
interface Draft {
  title:string; issuer:string; description:string; category:string; level:string;
  state:string; district:string; village:string;
  sourceUrl:string|null; applyUrl:string|null; deadline:string|null; eligibility:string; benefits:string;
}
interface Notice {
  id:string; draft:Draft; evidence:string; has_attachment:boolean; source_label:string|null;
}

function ReviewNotice({ notice, onReview, onAttachment, busy }: {
  notice:Notice; onReview:(id:string, body:unknown)=>void; onAttachment:(id:string)=>void; busy:boolean;
}) {
  const draft = notice.draft;
  const [level,setLevel]=useState(draft.level);
  function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields=Object.fromEntries(new FormData(event.currentTarget));
    onReview(notice.id,{
      action:'publish',
      draft:{ ...fields, deadline:fields.deadline || null, sourceUrl:fields.sourceUrl || null, applyUrl:fields.applyUrl || null },
    });
  }
  return <article className="mt-4 rounded-lg border border-slate-200 p-4">
    <h3 className="font-bold">{draft.title}</h3>
    <p className="text-sm">{notice.source_label || 'Submitted village notice'}</p>
    <details className="my-3">
      <summary className="cursor-pointer font-semibold">Read source evidence</summary>
      <p className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-sm">{notice.evidence || 'No readable text was extracted. Check the attachment.'}</p>
    </details>
    <div className="inline-actions">
      {notice.has_attachment ? <button type="button" className="secondary-action" disabled={busy} onClick={()=>onAttachment(notice.id)}>Download original notice</button> : null}
      {draft.sourceUrl ? <a className="secondary-action" href={draft.sourceUrl} target="_blank" rel="noreferrer">Open source <ArrowUpRight size={15}/></a> : null}
    </div>
    <form onSubmit={publish}>
      <div className="input-grid">
        <label>Scheme name<input name="title" defaultValue={draft.title} required maxLength={255}/></label>
        <label>Issuing authority<input name="issuer" defaultValue={draft.issuer} required maxLength={255}/></label>
        <label>Coverage level<select name="level" value={level} onChange={event=>setLevel(event.target.value)}>{levels.map(value=><option key={value}>{value}</option>)}</select></label>
        <label>Category<select name="category" defaultValue={draft.category}>{categories.map(value=><option key={value}>{value}</option>)}</select></label>
        {locationFields.map(([key,label],index)=><label key={key}>{label}
          <input name={key} defaultValue={draft[key]} maxLength={120} required={levels.indexOf(level)>index}/>
        </label>)}
        <label>Application deadline<input name="deadline" type="date" defaultValue={draft.deadline || ''}/></label>
        <label>Official notice or issuing office URL<input name="sourceUrl" type="url" defaultValue={draft.sourceUrl || ''} required/></label>
        <label>Official application URL<input name="applyUrl" type="url" defaultValue={draft.applyUrl || ''}/></label>
        {textFields.map(([key,label])=><label key={key}>{label}
          <textarea name={key} defaultValue={draft[key]} rows={2} maxLength={key==='description' ? 2000 : 1200} className="rounded-md border border-slate-300 bg-white p-2"/>
        </label>)}
      </div>
      <label className="approval-check"><input type="checkbox" required/>I verified the issuing authority and the details shown above.</label>
      <div className="inline-actions">
        <button className="primary-action" disabled={busy}>Publish scheme</button>
        <button className="text-action" type="button" disabled={busy} onClick={()=>onReview(notice.id,{action:'reject'})}>Reject notice</button>
      </div>
    </form>
  </article>;
}

export const SchemeMonitorPage = () => {
  const [sources,setSources]=useState<Source[]>([]);
  const [sourceError,setSourceError]=useState('');
  const [noticeStatus,setNoticeStatus]=useState('');
  const [noticeError,setNoticeError]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const [key,setKey]=useState('');
  const [queue,setQueue]=useState<Notice[]>();
  const [reviewStatus,setReviewStatus]=useState('');
  const [reviewError,setReviewError]=useState('');
  const [reviewBusy,setReviewBusy]=useState(false);

  useEffect(()=>{
    const controller=new AbortController();
    async function refresh() {
      try {
        const { data }=await api.get<{data:Source[]}>(endpoint+'/sources',{signal:controller.signal});
        setSources(data.data);
        setSourceError('');
      } catch (error) {
        if (!controller.signal.aborted) setSourceError(errorMessage(error));
      }
    }
    void refresh();
    const timer=window.setInterval(()=>void refresh(),8000);
    return ()=>{ controller.abort(); window.clearInterval(timer); };
  },[]);

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form=event.currentTarget;
    const data=new FormData(form);
    setSubmitting(true);
    setNoticeError('');
    setNoticeStatus('');
    try {
      await api.post(endpoint+'/notices',data,{ timeout:90000 });
      form.reset();
      setNoticeStatus('Submitted for review. The notice will appear in Schemes after approval.');
    } catch(error) { setNoticeError(errorMessage(error)); }
    finally { setSubmitting(false); }
  }

  const reviewConfig={ headers:{ 'x-scheme-monitor-key':key } };
  async function refreshQueue() {
    const { data }=await api.get<{data:Notice[]}>(endpoint+'/review',reviewConfig);
    setQueue(data.data);
  }
  async function reviewOperation(work:()=>Promise<void>) {
    setReviewBusy(true); setReviewError(''); setReviewStatus('');
    try { await work(); }
    catch(error) { setReviewError(errorMessage(error)); }
    finally { setReviewBusy(false); }
  }
  async function resolve(id:string,body:unknown) {
    await reviewOperation(async ()=>{
      const { data }=await api.post<{data:{status:string}}>(endpoint+'/review/'+id,body,reviewConfig);
      setQueue(items=>items?.filter(item=>item.id!==id));
      setReviewStatus(data.data.status==='published' ? 'The scheme is published.' : 'The notice was rejected.');
    });
  }
  async function attachment(id:string) {
    await reviewOperation(async ()=>{
      const { data }=await api.get<Blob>(endpoint+'/review/'+id+'/attachment',{ ...reviewConfig,responseType:'blob' });
      const url=URL.createObjectURL(data);
      const link=document.createElement('a');
      const extension=({'image/png':'png','image/jpeg':'jpg','application/pdf':'pdf'})[data.type] || 'bin';
      link.href=url; link.download='scheme-notice.'+extension; link.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
  }

  return <div className="workflow">
    <Link to="/schemes" className="back-link"><ArrowLeft size={17}/> Schemes</Link>
    <header className="workflow-heading"><div><h1>Scheme Monitor</h1><p>Track official sources and submit village notices for review.</p></div></header>
    <section className="workflow-card">
      <h2>Monitored sources</h2>
      {sourceError ? <p className="workflow-error" role="alert">{sourceError}</p> : sources.length ? (
        <ul className="mt-3 divide-y divide-slate-200">
          {sources.map(source=><li key={source.id} className="py-3">
            <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold">{source.label} <ArrowUpRight size={15}/></a>
            <p className="text-sm">{source.last_message || (source.last_status==='checking' ? 'Check in progress…' : 'Waiting for the first check.')}</p>
            <p className="text-xs">{source.checked_at ? 'Last checked '+new Date(source.checked_at).toLocaleString()+' · ' : ''}
              {source.enabled ? 'Next scheduled check '+new Date(source.next_check_at).toLocaleString() : 'Paused'}</p>
          </li>)}
        </ul>
      ) : <p role="status">Loading sources…</p>}
    </section>
    <section className="workflow-card">
      <h2>Submit a village notice</h2>
      <p>Attach a public government notice as a PDF, PNG or JPEG up to 6 MB. Use a clear image for paper notices.</p>
      <form onSubmit={submit}>
        <div className="input-grid">
          <label>Scheme or notice name<input name="title" required minLength={3} maxLength={255}/></label>
          <label>Issuing office or Panchayat<input name="issuer" required minLength={2} maxLength={255}/></label>
          {locationFields.map(([field,label])=><label key={field}>{label}<input name={field} required minLength={2} maxLength={120}/></label>)}
          <label>Official source URL (optional)<input name="sourceUrl" type="url"/></label>
          <label>Government notice<input name="notice" type="file" required accept=".pdf,.png,.jpg,.jpeg"/></label>
        </div>
        <button className="primary-action" disabled={submitting}>{submitting ? 'Processing notice…' : 'Submit for review'}</button>
      </form>
      {noticeStatus ? <p role="status">{noticeStatus}</p> : null}
      {noticeError ? <p className="workflow-error" role="alert">{noticeError}</p> : null}
    </section>
    <section className="workflow-card">
      <h2>Reviewer workspace</h2>
      <form onSubmit={event=>{event.preventDefault();void reviewOperation(refreshQueue);}}>
        <div className="input-grid"><label>Monitor review key<input type="password" value={key} onChange={event=>{setKey(event.target.value);setQueue(undefined);}} required autoComplete="off" disabled={reviewBusy}/></label></div>
        <div className="inline-actions mt-3">
          <button className="secondary-action" disabled={!key || reviewBusy}>{queue ? 'Refresh queue' : 'Open review queue'}</button>
          {queue ? <button type="button" className="secondary-action" disabled={reviewBusy} onClick={()=>void reviewOperation(async ()=>{
            await api.post(endpoint+'/review/run',{},reviewConfig);
            setReviewStatus('Source checks scheduled. Refresh the review queue after they finish.');
          })}>Check sources now</button> : null}
        </div>
      </form>
      {reviewError ? <p className="workflow-error" role="alert">{reviewError}</p> : null}
      {reviewStatus ? <p role="status">{reviewStatus}</p> : null}
      {queue ? queue.length ? queue.map(notice=><ReviewNotice key={notice.id} notice={notice} busy={reviewBusy}
        onReview={(id,action)=>void resolve(id,action)} onAttachment={id=>void attachment(id)}/>) : <p>No notices awaiting review.</p> : null}
    </section>
  </div>;
};
