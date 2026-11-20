import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { indianStates } from '../services/indianStates';
import { api } from '../services/api';
import { errorMessage } from '../services/workflow';
import { SchemeCard } from '../components/SchemeCard';
import type { SchemeCardData } from '../components/SchemeCard';
import { describeStatus } from '../services/schemeDetails';
import type { SchemeStatus } from '../services/schemeDetails';
import { recordLabels } from '../services/governmentRecords';

export const SchemesPage=()=>{
 const [params,setParams]=useSearchParams();
 const query=params.get('q') || '';
 const [input,setInput]=useState(query);
 const [states,setStates]=useState<string[]>(indianStates);
 const [state,setState]=useState('');
 const [category,setCategory]=useState('');
 const [status,setStatus]=useState('');
 const [type,setType]=useState('');const [department,setDepartment]=useState('');const [audience,setAudience]=useState('');const [regulatoryStatus,setRegulatoryStatus]=useState('');
 const [schemes,setSchemes]=useState<SchemeCardData[]>();
 const [error,setError]=useState('');
 useEffect(()=>{
   const controller=new AbortController();setSchemes(undefined);setError('');
   api.get('/schemes',{params:{q:query},signal:controller.signal}).then(result=>setSchemes(result.data.data))
     .catch(err=>{if (!controller.signal.aborted) setError(errorMessage(err));});
   return ()=>controller.abort();
 },[query]);
 useEffect(()=>{
   const controller=new AbortController();
   api.get('/schemes/locations',{signal:controller.signal}).then(result=>setStates(result.data.data || [])).catch(()=>{});
   return ()=>controller.abort();
 },[]);
 const matches=schemes?.filter(scheme=>(!state || !scheme.coverage_state || scheme.coverage_state===state) &&
   (!category || scheme.category===category) && (!status || scheme.scheme_status===status));
 const filtered=matches?.filter(scheme=>(!type || (scheme.record_type || 'scheme')===type) && (!department || scheme.department===department) &&
   (!audience || scheme.record?.facts.audience.some(claim=>claim.text.toLowerCase().includes(audience.toLowerCase()))) &&
   (!regulatoryStatus || scheme.record?.facts.legalStatus.some(claim=>claim.text.toLowerCase().includes(regulatoryStatus.toLowerCase()))));
 return <div className="workflow">
   <header className="workflow-heading"><div><span className="civic-kicker">OFFICIAL INFORMATION · INDIA</span><h1>Explore schemes</h1><p>Find schemes, citizen services, notices, jobs and government guidance.</p></div></header>
   <section className="workflow-card">
     <form className="grid gap-3" onSubmit={event=>{event.preventDefault();setParams(input?{q:input}:{});}}>
       <label className="grid gap-2">Search schemes<input type="search" placeholder="Search schemes or ask a question" maxLength={1500} value={input} onChange={event=>setInput(event.target.value)}/></label>
       <div className="inline-actions"><button className="primary-action">Search</button><Link className="secondary-action" to={'/ask?q='+encodeURIComponent(input)}>Ask JANASEVA AI</Link></div>
     </form>
     <div className="grid gap-3 pt-4 sm:grid-cols-3">
       <label className="grid gap-2">State or UT<select value={state} onChange={event=>setState(event.target.value)}><option value="">All</option>
         {[...new Set([...states,...(schemes || []).map(scheme=>scheme.coverage_state).filter(Boolean)])].sort().map(value=><option key={value} value={value!}>{value}</option>)}</select></label>
       <label className="grid gap-2">Category<select value={category} onChange={event=>setCategory(event.target.value)}><option value="">All</option>
         {[...new Set((schemes || []).map(scheme=>scheme.category).filter(Boolean))].sort().map(value=><option key={value} value={value!}>{value}</option>)}</select></label>
       <label className="grid gap-2">Application status<select value={status} onChange={event=>setStatus(event.target.value)}><option value="">All</option>
         {(['announced','open','closed','rolling','unknown'] as SchemeStatus[]).map(value=><option key={value} value={value}>{describeStatus(value)}</option>)}</select></label>
     </div>
     {(type==='regulatory_guide' || type==='notification') && <label className="grid gap-2 pt-3">Regulatory status<input placeholder="For example: draft, amended, in force" value={regulatoryStatus} maxLength={40} onChange={event=>setRegulatoryStatus(event.target.value)}/></label>}
     <div className="grid gap-3 pt-3 sm:grid-cols-3">
       <label className="grid gap-2">Information type<select aria-label="Information type" value={type} onChange={event=>{setType(event.target.value);setRegulatoryStatus('');}}><option value="">All types</option>{Object.entries(recordLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
       <label className="grid gap-2">Department<select value={department} onChange={event=>setDepartment(event.target.value)}><option value="">All departments</option>{[...new Set((schemes || []).map(item=>item.department).filter(Boolean))].sort().map(value=><option key={value}>{value}</option>)}</select></label>
       <label className="grid gap-2">Intended audience<input placeholder="For example: pensioners" value={audience} maxLength={150} onChange={event=>setAudience(event.target.value)}/></label>
     </div>
     <button className="text-action mt-3" onClick={()=>{setState('');setCategory('');setStatus('');setType('');setDepartment('');setAudience('');setRegulatoryStatus('');}}>Clear filters</button>
   </section>
   {error?<p role="alert" className="workflow-error">{error}</p>:!filtered?<p role="status">Loading schemes…</p>:<>
     <p role="status">{filtered.length?filtered.length+' published records':'No verified records match these filters. Try another type, state or keyword.'}</p>
     <div className="grid gap-4 lg:grid-cols-2">{filtered.map(scheme=><SchemeCard key={scheme.id} scheme={scheme}/>)}</div>
   </>}
 </div>;
};
