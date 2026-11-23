import { Link,useNavigate,useParams,useSearchParams } from 'react-router-dom';
import { useEffect,useState } from 'react';
import { api } from '../services/api';
import { certificateType,isCertificateRecord } from '../services/certificates';
import type { SchemeCardData } from './SchemeCard';
import directory from '../data/certificate-directory.json';
const unknown='Not specified in the official source.';
type Guide=typeof directory.guides[number];
export const certificateGuideTypes=Object.fromEntries(directory.guides.filter(guide=>!guide.state).map(guide=>[guide.kind,guide.title]));
export const certificateDepartments=[...new Set(directory.guides.map(guide=>guide.department))];
function stateGuide(base:Guide,state:string,district='') {
 return directory.guides.find(guide=>guide.kind===base.kind && guide.level==='source_guide' && guide.state===state && guide.district===district)
  || (base.level==='source_guide' && !base.state?base:undefined);
}
function SourceLinks({guide,field}:{guide:Guide;field:string}) {
 const sources=guide.sources.filter(source=>source.supports.includes(field));
 return sources.length?<p className="text-sm">Evidence: {sources.map((source,index)=><span key={source.url}>{index>0?' · ':''}<a className="text-action" href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</a></span>)}</p>:null;
}
function PublishedCertificateLinks({kind,state}:{kind:string;state:string}) {
 const [records,setRecords]=useState<SchemeCardData[]>([]);
 useEffect(()=>{
  const controller=new AbortController();setRecords([]);
  if(!state)return ()=>controller.abort();
  api.get('/schemes',{params:{type:'citizen_service',state},signal:controller.signal}).then(result=>{
   if(Array.isArray(result.data.data))setRecords(result.data.data.filter((item:SchemeCardData)=>isCertificateRecord(item) && certificateType(item.scheme_name)===kind && item.coverage_state===state && item.last_verified_at));
  }).catch(()=>{});
  return ()=>controller.abort();
 },[kind,state]);
 if(!records.length)return null;
 return <section className="workflow-card space-y-3"><h2 className="text-xl font-bold">Published local certificate records</h2><p>These records come from the live catalog and can be updated by the discovery pipeline.</p>{records.map(record=><p key={record.id}><Link className="text-action" to={'/certificates/'+record.id}>{record.scheme_name} · {record.department} ↗</Link></p>)}</section>;
}
export function CertificateDirectory({query='',state='',kind='',department=''}:{query?:string;state?:string;kind?:string;department?:string}) {
 const [showPending,setShowPending]=useState(false);
 const words=query.toLowerCase().split(/\s+/).filter(Boolean);
 const categories=directory.guides.filter(guide=>!guide.state);
 const guides=categories.map(base=>({base,guide:stateGuide(base,state) || base})).filter(({base,guide})=>
  (!kind || base.kind===kind) && (!department || guide.department===department) &&
  words.every(word=>[base.title,guide.title,...guide.aliases,state].join(' ').toLowerCase().includes(word)));
 const sources=directory.guides.filter(guide=>guide.level==='source_guide');
 const visible=guides.filter(({base,guide})=>showPending || Boolean(kind) || words.length>0 || guide.level==='source_guide' ||
  (!state && sources.some(item=>item.kind===base.kind)));
 return <section aria-labelledby="certificate-directory-title" className="space-y-4">
  <h2 id="certificate-directory-title" className="text-2xl font-bold">Certificate guides and official links</h2>
  <p>{directory.notice}</p><p>{sources.length} official-source guides · {new Set(sources.map(guide=>guide.state).filter(Boolean)).size} states with local guidance · national UDID and Jeevan Pramaan guides.</p>
  <label className="flex gap-2 items-center"><input type="checkbox" checked={showPending} onChange={event=>setShowPending(event.target.checked)}/>Show certificate types awaiting detailed local guidance</label>
  <p role="status">{visible.length} certificate categories shown</p>
  {!visible.length && <p>No detailed guide matches these filters yet. Try another state or include types awaiting guidance.</p>}
  <div className="grid gap-4 lg:grid-cols-2">{visible.map(({base,guide})=>{
   const available=guide.level==='source_guide';
   const path='/certificates/guides/'+base.slug+(state?'?state='+encodeURIComponent(state):'');
   const local=directory.guides.filter(item=>item.kind===base.kind && item.state && item.level==='source_guide');
   return <article className="workflow-card space-y-3" key={base.kind}>
    <p className="text-sm">{available?'Official-source guide · '+guide.scope:state?'Detailed statewide guide not yet available for '+state:'Select a state to see local requirements'}</p>
    <h3 className="text-xl font-semibold"><Link to={path}>{base.title}</Link></h3>
    <p>{available?guide.overview:'Choose the issuing jurisdiction before checking documents, charges and application instructions.'}</p>
    {!available && local.length>0 && <p className="text-sm">Guides available: {[...new Set(local.map(item=>item.scope))].join('; ')}</p>}
    <div className="inline-actions"><Link className="secondary-action" to={path}>{available?'How and where to apply':'Choose state and view guidance'}</Link>
     <Link className="text-action" to={'/ask?q='+encodeURIComponent('How do I apply for '+base.title+(state?' in '+state:'')+'?')}>Ask JANASEVA AI</Link></div>
   </article>;
  })}</div>
 </section>;
}
export function CertificateGuidePage() {
 const {slug}=useParams();const [params]=useSearchParams();const navigate=useNavigate();
 const requested=directory.guides.find(item=>item.slug===slug);
 if(!requested)return <div className="workflow"><h1>Certificate guide not found</h1><Link to="/certificates">Explore certificates</Link></div>;
 const base=directory.guides.find(item=>item.kind===requested.kind && !item.state) || requested;
 const state=params.get('state') ?? requested.state;
 const district=params.get('district') ?? (requested.state===state?requested.district:'');
 const guide=stateGuide(base,state,district);
 const alternatives=directory.guides.filter(item=>item.kind===base.kind && item.level==='source_guide' && item.state);
 const portal=directory.states.find(item=>item.state===state);
 const changeState=(value:string)=>navigate('/certificates/guides/'+base.slug+(value?'?state='+encodeURIComponent(value):''));
 return <div className="workflow space-y-5">
  <Link to="/certificates">← Certificates</Link>
  <header className="workflow-heading"><div><h1>{guide?.title || base.title}</h1><p>{guide?.scope || (state?'Guidance for '+state:'Choose your state / issuing authority')}</p></div></header>
  <section className="workflow-card space-y-4" aria-labelledby="choose-jurisdiction">
   <h2 id="choose-jurisdiction" className="text-xl font-bold">Choose where you are applying</h2>
   <label className="grid gap-2">State or UT<select aria-label="State or UT" value={state} onChange={event=>changeState(event.target.value)}><option value="">Choose your state or UT</option>{directory.states.map(item=><option key={item.state}>{item.state}</option>)}</select></label>
   {guide && <p role="status">Showing {guide.scope} requirements{guide.district?' only':''}. Official source checked {guide.checkedOn}.</p>}
   {!guide && <div role="status"><p>{state?'A detailed '+base.title.toLowerCase()+' guide for '+state+' has not yet been verified.':'Select your state to load the applicable documents, procedure and official portal.'}</p>
    {alternatives.length>0 && <div className="space-y-2 pt-3"><p>Available official guides for this certificate:</p>{alternatives.map(item=><p key={item.slug}><Link className="text-action" to={'/certificates/guides/'+item.slug}>{item.scope}{item.district?' · District-specific':''} ↗</Link></p>)}</div>}
   </div>}
  </section>
  <PublishedCertificateLinks key={base.kind+state} kind={base.kind} state={state}/>
  {guide && <>
   <section className="workflow-card space-y-4"><h2 className="text-xl font-bold">Overview</h2><p>{guide.overview}</p><SourceLinks guide={guide} field="overview"/>
    {guide.authority && <><h2 className="text-xl font-bold">Issuing authority</h2><p>{guide.authority}</p><SourceLinks guide={guide} field="authority"/></>}
    {guide.eligibility.length>0 && <><h2 className="text-xl font-bold">Who can apply</h2><ul className="list-disc pl-5">{guide.eligibility.map(text=><li key={text}>{text}</li>)}</ul><SourceLinks guide={guide} field="eligibility"/></>}
    <h2 className="text-xl font-bold">Required documents and information</h2>
    {guide.documents.length>0 && <ul className="list-disc pl-5 space-y-2">{guide.documents.map(text=><li key={text}>{text}</li>)}</ul>}
    {guide.documentNote && <p>{guide.documentNote}</p>}
    {!guide.documents.length && !guide.documentNote && <p>{unknown}</p>}
    <SourceLinks guide={guide} field="documents"/><SourceLinks guide={guide} field="documentNote"/>
    <h2 className="text-xl font-bold">How to apply</h2><ol className="list-decimal pl-5 space-y-2">{guide.steps.map(step=><li key={step}>{step}</li>)}</ol><SourceLinks guide={guide} field="steps"/>
    <h2 className="text-xl font-bold">Fees and processing time</h2><p>Fees: {guide.fees || 'The checked source does not specify a current amount. Check the service charge before payment.'}</p><SourceLinks guide={guide} field="fees"/>
    <p>Processing time: {guide.processingTime || 'A current service target is not specified in the checked source.'}</p><SourceLinks guide={guide} field="processingTime"/>
    {guide.contact && <><h2 className="text-xl font-bold">Where to get help</h2><p>{guide.contact}</p><SourceLinks guide={guide} field="contact"/></>}
    {guide.notes.length>0 && <aside className="border-l-4 border-amber-400 pl-3"><h2 className="text-xl font-bold">Check before submitting</h2>{guide.notes.map(note=><p key={note}>{note}</p>)}</aside>}
   </section>
  </>}
  <section className="workflow-card space-y-4"><h2 className="text-xl font-bold">Where to apply</h2>
   {guide?.applicationUrl?<><a className="primary-action" href={guide.applicationUrl} target="_blank" rel="noopener noreferrer">Open official service portal ↗</a><p>This opens the official portal; select the named certificate service after signing in where required.</p><SourceLinks guide={guide} field="applicationUrl"/></>:<p>{state?'A service-specific application link for this jurisdiction is not verified yet.':'Choose a state above for the applicable application channel.'}</p>}
   {portal && <p><a className="text-action" href={portal.url} target="_blank" rel="noopener noreferrer">{portal.state} government website ↗</a> · Official directory fallback.</p>}
   {!guide && directory.directories.map(item=><p key={item.url}><a className="text-action" href={item.url} target="_blank" rel="noopener noreferrer">{item.label} ↗</a> · Directory, not an application form.</p>)}
   <Link className="secondary-action" to={'/ask?q='+encodeURIComponent('How do I apply for '+base.title+(state?' in '+state:'')+'?')}>Ask JANASEVA AI about this certificate</Link>
  </section>
  {guide && <section className="workflow-card space-y-3"><h2 className="text-xl font-bold">Official evidence</h2>{guide.sources.map(source=><div key={source.url}><a className="text-action" href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</a><p>Supports: {source.supports.join(', ')}. Checked {guide.checkedOn}.</p></div>)}</section>}
 </div>;
}
