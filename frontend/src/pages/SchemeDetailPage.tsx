import { useEffect,useState } from 'react';
import { Link,useParams,useSearchParams,useNavigate } from 'react-router-dom';
import { ArrowLeft,ArrowUpRight } from 'lucide-react';
import { SchemeChecklist } from '../components/SchemeChecklist';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { errorMessage } from '../services/workflow';
import { dateLabel,describeStatus,schemeSections,unavailable } from '../services/schemeDetails';
import type { Description,SchemeStatus,Section } from '../services/schemeDetails';
import { RecordFacts } from '../components/RecordFacts';
import { applicableRecord,publicSections } from '../services/governmentRecords';
import type { GovernmentRecord,RecordType } from '../services/governmentRecords';

interface Detail {
  enrichment?:{status:string|null;checkedAt:string|null;mode?:string|null;fields:Record<string,{status:string;sources:string[];note:string}>};
  recheck_status:string|null;recheck_error:string|null;
  scheme_name:string; department:string; official_url:string; original_title:string|null;
  description:string; category:string|null; coverage_state:string|null;
  source_fetched_at:string|null; last_verified_at:string|null; catalog_checked_on:string|null;
  application_url:string|null; application_deadline:string|null; application_cycle:string|null;
  benefits_summary:string|null; eligibility_summary:string|null; scheme_status:SchemeStatus;
  detail:Omit<Description,'reviewIssues'>|null;
  record_type?:RecordType;record?:GovernmentRecord|null;
}

export const SchemeDetailPage=()=>{
  const {id}=useParams();
  const navigate=useNavigate();
  const [params,setParams]=useSearchParams();
  const {user}=useAuth();
  const [refreshMessage,setRefreshMessage]=useState('');
  const [actionError,setActionError]=useState('');
  const [following,setFollowing]=useState(false);
  const [saving,setSaving]=useState(false);
  const [entry,setEntry]=useState<Detail>();
  const [error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    setEntry(undefined);setError('');setActionError('');setFollowing(false);
    api.get<{data:Detail}>('/schemes/'+id,{signal:controller.signal})
      .then(result=>setEntry(result.data.data))
      .catch(err=>{if (!controller.signal.aborted) setError(errorMessage(err));});
    return ()=>controller.abort();
  },[id]);

  useEffect(()=>{
    if (!user || !id || params.get('save')!=='1') return;
    let active=true;
    api.put('/citizen-schemes/watches/'+id).then(()=>{
      if (!active) return;
      setFollowing(true);setParams({}, {replace:true});
    }).catch(err=>{if (active) setActionError(errorMessage(err));});
    return ()=>{active=false;};
  },[id,user,params,setParams]);
  const legacy:Partial<Record<Section,string|null>>=entry?.detail || !entry ? {} : {
    overview:entry.description, benefits:entry.benefits_summary, eligibility:entry.eligibility_summary,
    dates:entry.application_deadline ? 'Recorded cycle '+(entry.application_cycle || 'unspecified')+'. Current application window could not be verified. Check the official portal.' : null,
  };
  return <div className="workflow">
    <Link to="/schemes" className="back-link"><ArrowLeft size={17}/> All schemes</Link>
    {error ? <p role="alert" className="workflow-error">{error}</p> : !entry ? <p role="status">Loading scheme…</p> : <>
      <header className="workflow-heading"><div><h1>{entry.scheme_name}</h1><p>{[entry.department,entry.coverage_state,entry.category].filter(Boolean).join(' · ')}</p></div></header>
      <section className="workflow-card">
        {actionError && <p role="alert" className="workflow-error">{actionError}</p>}
        {user ? <div className="inline-actions">
          <button className="secondary-action" disabled={saving || following} onClick={async()=>{
            setSaving(true);setActionError('');
            try {await api.put('/citizen-schemes/watches/'+id);setFollowing(true);}
            catch(err) {setActionError(errorMessage(err));}
            finally {setSaving(false);}
          }}>{following?'Following updates':saving?'Saving…':'Follow updates'}</button>
          <Link to="/my-schemes" className="secondary-action">My schemes and eligibility checklist</Link>
        </div> : <Link to={"/login?next="+encodeURIComponent("/schemes/"+id+"?save=1")} className="secondary-action">Log in to save</Link>}
      </section>
      <section className="workflow-card" aria-label="Official source">
        <div className="inline-actions"><button disabled={saving} className="secondary-action" onClick={async()=>{
          setSaving(true);setActionError('');
          try {await api.post('/schemes/'+id+'/refresh');setRefreshMessage('Recheck requested. The last verified information stays visible while the scheduled worker checks.');}
          catch(err) {setActionError(errorMessage(err));}finally {setSaving(false);}
        }}>Refresh official information</button></div>
        {refreshMessage && <p role="status">{refreshMessage}</p>}
        {entry.recheck_status && <p>Latest recheck · {entry.recheck_status}{entry.recheck_error?' · '+entry.recheck_error:''}</p>}
        <span className="state-label">{describeStatus(entry.scheme_status)}</span>
        <p>Source: <a className="font-semibold text-teal-800 underline" href={entry.official_url} target="_blank" rel="noreferrer">{entry.original_title || entry.department}</a></p>
        <p>Last verified: {entry.last_verified_at || entry.catalog_checked_on ? dateLabel(entry.last_verified_at || entry.catalog_checked_on!) : unavailable}</p>
        {entry.source_fetched_at ? <p>Published source fetched: {dateLabel(entry.source_fetched_at)}</p> : null}
        {entry.enrichment?.status && <p>Detail enrichment · {entry.enrichment.status==='review'?'Some proposed details need verification':entry.enrichment.status==='completed'?'Official sources checked':entry.enrichment.status==='failed'?'Recheck needed; verified details retained':entry.enrichment.status}</p>}
        {entry.enrichment?.checkedAt && <p>Additional official sources checked: {dateLabel(entry.enrichment.checkedAt)}</p>}
        {entry.enrichment?.mode && <p>Description method: {entry.enrichment.mode}</p>}
        {applicableRecord(entry.record_type) && entry.application_url && entry.scheme_status!=='closed' ? <a className="primary-action" href={entry.application_url} target="_blank" rel="noreferrer">
          Apply on official portal <ArrowUpRight size={16}/></a> : null}
        {['regulatory_guide','notification','recruitment','exam','result'].includes(entry.record_type || '') && <a className="secondary-action mt-3" href={entry.official_url} target="_blank" rel="noreferrer">Download / view official notification</a>}
        {user && applicableRecord(entry.record_type) && <button className="secondary-action mt-3" disabled={saving} onClick={async()=>{
          setSaving(true);setActionError('');try {const result=await api.post('/citizen-schemes/drafts',{schemeId:id});navigate('/dashboard/drafts/'+result.data.data.id);}catch(err){setActionError(errorMessage(err));}finally{setSaving(false);}
        }}>Prepare a personal draft</button>}
      </section>
      {entry.record && <RecordFacts record={entry.record} source={entry.official_url}/>}
      {entry.enrichment?.checkedAt && <section className="workflow-card"><h2>Detail verification</h2><ul className="space-y-2 pt-2">{Object.entries(entry.enrichment.fields).map(([field,state])=><li key={field}><strong>{({applicationSteps:'How to apply',dates:'Application dates',fees:'Fees',documents:'Required documents',benefits:'Benefits',eligibility:'Eligibility',contacts:'Contacts'} as Record<string,string>)[field] || field}</strong> · {state.status==='verified'?'Supported by official evidence':'Not verified after checking available official sources.'}</li>)}</ul></section>}
      {user && id && <SchemeChecklist id={id} items={[...(entry.detail?.documents || []),...(entry.detail?.applicationSteps || [])].map(claim=>claim.text)}/>}
      {schemeSections.filter(([key])=>publicSections(entry.record_type).includes(key)).map(([key,label])=>{
        const claims=entry.detail?.[key];
        const List=key==='applicationSteps' ? 'ol' : 'ul';
        return <section className="workflow-card" key={key}><h2>{label}</h2>
          {claims?.length ? <List className={key==='applicationSteps'?'ml-5 list-decimal space-y-2 pt-2':'space-y-2 pt-2'}>
            {claims.map((claim,index)=><li key={index}>{claim.text}{' '}
              <a title={claim.quote} aria-label={`Official source for ${label} item ${index+1}`}
                 href={claim.sourceUrl || entry.official_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-teal-800 underline">Source</a>{claim.scope && <small className="block text-slate-600">Source scope: {claim.scope}</small>}
            </li>)}
          </List> : <p>{legacy[key] || (entry.enrichment?.fields[key]?.status==='unverified'?'Not verified after checking available official sources.':unavailable)}</p>}
        </section>;
      })}
    </>}
  </div>;
};
