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
import { isCertificateRecord,certificateType,certificateTypes } from '../services/certificates';
import { CertificateDirectory,certificateGuideTypes,certificateDepartments } from '../components/CertificateDirectory';

export const SchemesPage=({section='schemes'}:{section?:'schemes'|'certificates'})=>{
 const certificates=section==='certificates';
 const [params,setParams]=useSearchParams();
 const query=params.get('q') || '';
 const [input,setInput]=useState(query);
 const [states,setStates]=useState<string[]>(indianStates);
 const [state,setState]=useState('');
 const [category,setCategory]=useState('');
 const [status,setStatus]=useState('');
 const [certificateKind,setCertificateKind]=useState('');
 const [type,setType]=useState('');const [department,setDepartment]=useState('');const [audience,setAudience]=useState('');const [regulatoryStatus,setRegulatoryStatus]=useState('');
 const [schemes,setSchemes]=useState<SchemeCardData[]>();
 const [error,setError]=useState('');
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
   const controller=new AbortController();setSchemes(undefined);setError('');
   api.get('/schemes',{params:{q:query,...(certificates?{type:'citizen_service'}:{})},signal:controller.signal}).then(result=>setSchemes((result.data.data as SchemeCardData[]).filter(record=>certificates?isCertificateRecord(record):!isCertificateRecord(record))))
     .catch(err=>{if (!controller.signal.aborted) setError(errorMessage(err));});
   return ()=>controller.abort();
 },[query,certificates,retry]);
 useEffect(()=>{setInput(query);},[query]);
 useEffect(()=>{
   const controller=new AbortController();
   api.get('/schemes/locations',{signal:controller.signal}).then(result=>setStates(result.data.data || [])).catch(()=>{});
   return ()=>controller.abort();
 },[]);
 const matches=schemes?.filter(scheme=>(!state || !scheme.coverage_state || scheme.coverage_state===state) &&
   (!category || scheme.category===category) && (!status || scheme.scheme_status===status) && (!certificateKind || certificateType(scheme.scheme_name)===certificateKind));
 const filtered=matches?.filter(scheme=>(!type || (scheme.record_type || 'scheme')===type) && (!department || scheme.department===department) &&
   (!audience || scheme.record?.facts?.audience?.some(claim=>claim.text.toLowerCase().includes(audience.toLowerCase()))) &&
   (!regulatoryStatus || scheme.record?.facts?.legalStatus?.some(claim=>claim.text.toLowerCase().includes(regulatoryStatus.toLowerCase()))));
 return <div className="workflow">
   <header className="workflow-heading"><div><span className="civic-kicker">OFFICIAL INFORMATION · INDIA</span><h1>{certificates?'Certificates':'Explore schemes'}</h1><p>{certificates?'Find certificate services, required documents, fees, processing times and official application portals.':'Find schemes, notices, jobs and government guidance.'}</p></div></header>
   <section className="workflow-card">
     <form className="grid gap-3" onSubmit={event=>{event.preventDefault();setParams(input?{q:input}:{});}}>
       <label className="grid gap-2">{certificates?'Search certificates':'Search schemes'}<input type="search" placeholder={certificates?'Search income, caste, birth or residence certificates':'Search schemes or ask a question'} maxLength={1500} value={input} onChange={event=>setInput(event.target.value)}/></label>
       <div className="inline-actions"><button className="primary-action">Search</button><Link className="secondary-action" to={'/ask?q='+encodeURIComponent(input)}>Ask JANASEVA AI</Link></div>
     </form>
     <div className="grid gap-3 pt-4 sm:grid-cols-3">
       <label className="grid gap-2">State or UT<select aria-label="State or UT" value={state} onChange={event=>setState(event.target.value)}><option value="">All</option>
         {[...new Set([...states,...(schemes || []).map(scheme=>scheme.coverage_state).filter(Boolean)])].sort().map(value=><option key={value} value={value!}>{value}</option>)}</select></label>
       {certificates?<label className="grid gap-2">Certificate type<select aria-label="Certificate type" value={certificateKind} onChange={event=>setCertificateKind(event.target.value)}><option value="">All certificates</option>{Object.entries({...certificateTypes,...certificateGuideTypes}).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>:<label className="grid gap-2">Category<select value={category} onChange={event=>setCategory(event.target.value)}><option value="">All</option>
         {[...new Set((schemes || []).map(scheme=>scheme.category).filter(Boolean))].sort().map(value=><option key={value} value={value!}>{value}</option>)}</select></label>}
       {certificates?<label className="grid gap-2">Issuing department<select aria-label="Issuing department" value={department} onChange={event=>setDepartment(event.target.value)}><option value="">All departments</option>{[...new Set([...certificateDepartments,...(schemes || []).map(item=>item.department).filter(Boolean)])].sort().map(value=><option key={value}>{value}</option>)}</select></label>:<label className="grid gap-2">Application status<select value={status} onChange={event=>setStatus(event.target.value)}><option value="">All</option>
         {(['announced','open','closed','rolling','unknown'] as SchemeStatus[]).map(value=><option key={value} value={value}>{describeStatus(value)}</option>)}</select></label>}
     </div>
     {(type==='regulatory_guide' || type==='notification') && <label className="grid gap-2 pt-3">Regulatory status<input placeholder="For example: draft, amended, in force" value={regulatoryStatus} maxLength={40} onChange={event=>setRegulatoryStatus(event.target.value)}/></label>}
     {!certificates && <div className="grid gap-3 pt-3 sm:grid-cols-3">
       <label className="grid gap-2">Information type<select aria-label="Information type" value={type} onChange={event=>{setType(event.target.value);setRegulatoryStatus('');}}><option value="">All types</option>{Object.entries(recordLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
       <label className="grid gap-2">Department<select value={department} onChange={event=>setDepartment(event.target.value)}><option value="">All departments</option>{[...new Set((schemes || []).map(item=>item.department).filter(Boolean))].sort().map(value=><option key={value}>{value}</option>)}</select></label>
       <label className="grid gap-2">Intended audience<input placeholder="For example: pensioners" value={audience} maxLength={150} onChange={event=>setAudience(event.target.value)}/></label>
     </div>}
     <button className="text-action mt-3" onClick={()=>{setState('');setCategory('');setStatus('');setType('');setDepartment('');setAudience('');setRegulatoryStatus('');setCertificateKind('');}}>Clear filters</button>
   </section>
   {certificates && <CertificateDirectory query={query} state={state} kind={certificateKind} department={department}/>}
   {certificates && <h2 className="text-2xl font-bold mt-6">Published certificate records</h2>}
   {error?<div role="alert" className="workflow-error"><p>{error} {certificates?'The public certificate directory above is still available.':''}</p><button className="secondary-action" onClick={()=>setRetry(value=>value+1)}>Retry catalog</button></div>:!filtered?<p role="status">{certificates?'Loading certificates…':'Loading schemes…'}</p>:<>
     <p role="status">{filtered.length?filtered.length+(certificates?(filtered.length===1?' published certificate':' published certificates'):' published records'):certificates?'No verified certificates match your search. Try another state, certificate type or keyword.':'No verified records match these filters. Try another type, state or keyword.'}</p>
     <div className="grid gap-4 lg:grid-cols-2">{filtered.map(scheme=><SchemeCard key={scheme.id} scheme={scheme}/>)}</div>
   </>}
 </div>;
};
