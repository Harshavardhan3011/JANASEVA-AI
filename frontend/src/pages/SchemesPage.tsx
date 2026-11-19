import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { indianStates } from '../services/indianStates';
import { api } from '../services/api';
import { errorMessage } from '../services/workflow';
import { SchemeCard } from '../components/SchemeCard';
import type { SchemeCardData } from '../components/SchemeCard';
import { describeStatus } from '../services/schemeDetails';
import type { SchemeStatus } from '../services/schemeDetails';

export const SchemesPage=()=>{
 const [params,setParams]=useSearchParams();
 const query=params.get('q') || '';
 const [input,setInput]=useState(query);
 const [states,setStates]=useState<string[]>(indianStates);
 const [state,setState]=useState('');
 const [category,setCategory]=useState('');
 const [status,setStatus]=useState('');
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
 return <div className="workflow">
   <header className="workflow-heading"><div><h1>Explore schemes</h1><p>Search published government schemes across India.</p></div></header>
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
   </section>
   {error?<p role="alert" className="workflow-error">{error}</p>:!matches?<p role="status">Loading schemes…</p>:<>
     <p role="status">{matches.length?matches.length+' schemes':'No schemes match your search. Try another category or keyword.'}</p>
     <div className="grid gap-4 lg:grid-cols-2">{matches.map(scheme=><SchemeCard key={scheme.id} scheme={scheme}/>)}</div>
   </>}
 </div>;
};
