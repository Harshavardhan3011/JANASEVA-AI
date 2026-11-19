import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { errorMessage } from '../services/workflow';
import { describeStatus } from '../services/schemeDetails';
import type { SchemeStatus } from '../services/schemeDetails';
export interface SchemeCardData {
 id:string;scheme_name:string;description:string;category?:string|null;coverage_state?:string|null;
 benefit?:string|null;benefits_summary?:string|null;match_reasons?:string[];
 official_url:string;application_url?:string|null;scheme_status:SchemeStatus;
 deadline?:string|null;cycle?:string|null;last_verified_at?:string|null;
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
 return <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
   <h3 className="font-bold"><Link to={'/schemes/'+scheme.id} className="underline">{scheme.scheme_name}</Link></h3>
   <p className="text-xs text-slate-600">{[scheme.category,scheme.coverage_state].filter(Boolean).join(' · ')}</p>
   <p>{scheme.description}</p>
   {scheme.match_reasons?.length ? <ul className="list-disc pl-5 text-sm">{scheme.match_reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>:null}
   <p className="text-sm">{scheme.benefit || scheme.benefits_summary || 'Benefits not specified in the official source.'}</p>
   <p className="text-sm font-semibold">{describeStatus(scheme.scheme_status)}</p>
   <p className="text-xs">Last verified · {scheme.last_verified_at?new Date(scheme.last_verified_at).toLocaleDateString():'Not specified in the official source.'}</p>
   {scheme.deadline && <p>Application deadline · {scheme.deadline}{scheme.cycle && ' · '+scheme.cycle}</p>}
   <div className="inline-actions mt-auto">
     <Link className="secondary-action" to={'/schemes/'+scheme.id}>View details</Link>
     {user?<button disabled={busy} className="secondary-action" onClick={()=>void save()}>{saved?'Remove saved':'Save'}</button>
       :<Link className="secondary-action" to="/login">Sign in to save</Link>}
     {scheme.application_url && scheme.scheme_status!=='closed' && <a className="secondary-action" href={scheme.application_url} target="_blank" rel="noreferrer">Official application</a>}
     <a className="text-sm underline" href={scheme.official_url} target="_blank" rel="noreferrer">Official source</a>
   </div>
   {error && <p role="alert">{error}</p>}
 </article>;
}
