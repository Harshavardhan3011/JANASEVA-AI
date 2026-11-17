import { useEffect,useState } from 'react';
import { Link,useParams } from 'react-router-dom';
import { ArrowLeft,ArrowUpRight } from 'lucide-react';
import { api } from '../services/api';
import { errorMessage } from '../services/workflow';
import { dateLabel,describeStatus,schemeSections,unavailable } from '../services/schemeDetails';
import type { Description,SchemeStatus,Section } from '../services/schemeDetails';

interface Detail {
  scheme_name:string; department:string; official_url:string; original_title:string|null;
  description:string; category:string|null; coverage_state:string|null;
  source_fetched_at:string|null; last_verified_at:string|null; catalog_checked_on:string|null;
  application_url:string|null; application_deadline:string|null; application_cycle:string|null;
  benefits_summary:string|null; eligibility_summary:string|null; scheme_status:SchemeStatus;
  detail:Omit<Description,'reviewIssues'>|null;
}

export const SchemeDetailPage=()=>{
  const {id}=useParams();
  const [entry,setEntry]=useState<Detail>();
  const [error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    setEntry(undefined);setError('');
    api.get<{data:Detail}>('/schemes/'+id,{signal:controller.signal})
      .then(result=>setEntry(result.data.data))
      .catch(err=>{if (!controller.signal.aborted) setError(errorMessage(err));});
    return ()=>controller.abort();
  },[id]);

  const legacy:Partial<Record<Section,string|null>>=entry?.detail || !entry ? {} : {
    overview:entry.description, benefits:entry.benefits_summary, eligibility:entry.eligibility_summary,
    dates:entry.application_deadline ? `${entry.application_cycle==='renewal'?'Renewal':'Student application'} deadline: ${dateLabel(entry.application_deadline)}` : null,
  };
  return <div className="workflow">
    <Link to="/schemes" className="back-link"><ArrowLeft size={17}/> All schemes</Link>
    {error ? <p role="alert" className="workflow-error">{error}</p> : !entry ? <p role="status">Loading scheme…</p> : <>
      <header className="workflow-heading"><div><h1>{entry.scheme_name}</h1><p>{[entry.department,entry.coverage_state,entry.category].filter(Boolean).join(' · ')}</p></div></header>
      <section className="workflow-card" aria-label="Official source">
        <span className="state-label">{describeStatus(entry.scheme_status)}</span>
        <p>Source: <a className="font-semibold text-teal-800 underline" href={entry.official_url} target="_blank" rel="noreferrer">{entry.original_title || entry.department}</a></p>
        <p>Last verified: {entry.last_verified_at || entry.catalog_checked_on ? dateLabel(entry.last_verified_at || entry.catalog_checked_on!) : unavailable}</p>
        {entry.source_fetched_at ? <p>Published source fetched: {dateLabel(entry.source_fetched_at)}</p> : null}
        {entry.application_url && entry.scheme_status!=='closed' ? <a className="primary-action" href={entry.application_url} target="_blank" rel="noreferrer">
          Apply on official portal <ArrowUpRight size={16}/></a> : null}
      </section>
      {schemeSections.map(([key,label])=>{
        const claims=entry.detail?.[key];
        const List=key==='applicationSteps' ? 'ol' : 'ul';
        return <section className="workflow-card" key={key}><h2>{label}</h2>
          {claims?.length ? <List className={key==='applicationSteps'?'ml-5 list-decimal space-y-2 pt-2':'space-y-2 pt-2'}>
            {claims.map((claim,index)=><li key={index}>{claim.text}{' '}
              <a title={claim.quote} aria-label={`Official source for ${label} item ${index+1}`}
                 href={entry.official_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-teal-800 underline">Source</a>
            </li>)}
          </List> : <p>{legacy[key] || unavailable}</p>}
        </section>;
      })}
    </>}
  </div>;
};
