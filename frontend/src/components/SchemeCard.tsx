import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { errorMessage } from '../services/workflow';
import { describeStatus } from '../services/schemeDetails';
import type { SchemeStatus } from '../services/schemeDetails';
import { applicableRecord,recordLabels } from '../services/governmentRecords';
import type { GovernmentRecord,RecordType } from '../services/governmentRecords';
import { isCertificateRecord,catalogDetailPath } from '../services/certificates';
export interface SchemeCardData {
 catalog_status?:string;id:string;scheme_name:string;description:string;category?:string|null;coverage_state?:string|null;
 match_label?:string;benefit?:string|null;benefits_summary?:string|null;match_reasons?:string[];
 official_url:string;application_url?:string|null;scheme_status:SchemeStatus;
 deadline?:string|null;cycle?:string|null;last_verified_at?:string|null;
 record_type?:RecordType;record?:GovernmentRecord|null;department?:string;
}
export function SchemeCard({scheme,initialSaved=false,onSaveChange}:{scheme:SchemeCardData;initialSaved?:boolean;onSaveChange?:()=>void}) {
 const {user}=useAuth();
 const [saved,setSaved]=useState(initialSaved);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 async function save() {
   setBusy(true);setError('');
   try {
     await api.request({url:'/citizen-schemes/watches/'+scheme.id,method:saved?'delete':'put'});
     setSaved(value=>!value);onSaveChange?.();
   } catch(err) {setError(errorMessage(err));}
   finally {setBusy(false);}
 }
 const type=scheme.record_type || scheme.record?.type || 'scheme';
 const certificate=isCertificateRecord(scheme),detailPath=catalogDetailPath(scheme);
 return <article className="catalog-card flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5">
   <div className="inline-actions"><span className="state-label">{certificate?'Certificate':recordLabels[type]}</span><span className="text-xs font-semibold">{scheme.record?.jurisdiction.level==='Central'?'Central Government':scheme.record?.jurisdiction.level==='State'?'State Government · '+(scheme.coverage_state || 'check state'):scheme.record?.jurisdiction.level==='Union Territory'?'Union Territory administration':scheme.record?.jurisdiction.level==='District'?'District authority':scheme.record?.jurisdiction.level==='Local'?'Local authority':scheme.coverage_state?'Coverage · '+scheme.coverage_state:'India · check authority'}</span></div>
   {scheme.catalog_status==='ARCHIVED' && <p className="text-sm font-bold">Archived from the public catalog · saved in your account</p>}
   <h3 className="font-bold">{scheme.catalog_status==='ARCHIVED'?scheme.scheme_name:<Link to={detailPath} className="underline">{scheme.scheme_name}</Link>}</h3>
   <p className="text-xs text-slate-600">{[scheme.category,scheme.coverage_state].filter(Boolean).join(' · ')}</p>
   {scheme.match_label && <p className="text-sm font-bold text-blue-700">{scheme.match_label}</p>}
   <p className="catalog-summary">{scheme.description}</p>
   {scheme.match_reasons?.length ? <ul className="list-disc pl-5 text-sm">{scheme.match_reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>:null}
   {type==='scheme' && <p className="text-sm"><strong>Main benefit · </strong>{scheme.benefit || scheme.benefits_summary || 'Not specified in the official source.'}</p>}
   {scheme.record?.facts?.audience?.[0] && <p className="text-sm"><strong>For · </strong>{scheme.record.facts.audience[0].text}</p>}
   {certificate && <><p className="text-sm"><strong>Issuing authority · </strong>{scheme.department || 'Not specified in the official source.'}</p>{(['fees','processingTime'] as const).map(key=><p className="text-sm" key={key}><strong>{key==='fees'?'Fee':'Processing time'} · </strong>{scheme.record?.facts?.[key]?.[0]?.text || 'Not specified in the official source.'}</p>)}</>}
   {applicableRecord(type) && <p className="text-sm font-semibold">{certificate && scheme.scheme_status==='unknown'?'Application availability: check the official portal':describeStatus(scheme.scheme_status)}</p>}
   {scheme.record?.dates?.filter(date=>['hearing','event','registration_deadline'].includes(date.kind)).slice(0,2).map((date,index)=><p className="text-sm" key={index}>{date.kind==='registration_deadline'?'Register by':date.kind==='hearing'?'Hearing':'Meeting / event'} · {date.value || 'Not specified'}</p>)}
   <p className="text-xs">Last verified · {scheme.last_verified_at?new Date(scheme.last_verified_at).toLocaleDateString():'Not specified in the official source.'}</p>
   {scheme.deadline && <p>Application deadline · {scheme.deadline}{scheme.cycle && ' · '+scheme.cycle}</p>}
   <div className="inline-actions mt-auto">
     {scheme.catalog_status!=='ARCHIVED' && <Link className="secondary-action" to={detailPath}>View details</Link>}
     {user?<button disabled={busy} className="secondary-action" onClick={()=>void save()}>{saved?'Remove saved':'Save'}</button>
       :<Link className="secondary-action" to={"/login?next="+encodeURIComponent(detailPath+"?save=1")}>Log in to save</Link>}
     {applicableRecord(type) && scheme.application_url && scheme.scheme_status!=='closed' && <a className="secondary-action" href={scheme.application_url} target="_blank" rel="noreferrer">Official application</a>}
     <a className="text-sm underline" href={scheme.official_url} target="_blank" rel="noreferrer">Official source</a>
   </div>
   {error && <p role="alert">{error}</p>}
 </article>;
}
