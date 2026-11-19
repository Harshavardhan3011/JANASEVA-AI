import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { errorMessage } from '../services/workflow';
import { SchemeCard } from '../components/SchemeCard';
import type { SchemeCardData } from '../components/SchemeCard';

interface Profile {state:string;district:string;occupation:string;ageRange:string;incomeRange:string}
interface Dashboard {
 state:string;profile:Partial<Profile>;watches:Array<{scheme_id:string;scheme?:SchemeCardData}>;
 recommendations:SchemeCardData[];deadlines:Array<{id:string;scheme_name:string;deadline:string;cycle:string|null}>;
 alerts:Array<{read_at:string|null}>;
}
const emptyProfile:Profile={state:'',district:'',occupation:'',ageRange:'',incomeRange:''};
export const DashboardPage=()=>{
 const {user}=useAuth();
 const [data,setData]=useState<Dashboard>();
 const [profile,setProfile]=useState(emptyProfile);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
   const controller=new AbortController();setError('');
   api.get('/citizen-schemes',{signal:controller.signal}).then(result=>{
     const raw=result.data.data || {};
     const dashboard:Dashboard={
       ...raw,state:raw.state || '',profile:raw.profile || {},
       watches:Array.isArray(raw.watches)?raw.watches:[],
       alerts:Array.isArray(raw.alerts)?raw.alerts:[],
       recommendations:Array.isArray(raw.recommendations)?raw.recommendations:[],
       deadlines:Array.isArray(raw.deadlines)?raw.deadlines:[],
     };
     setData(dashboard);setProfile({...emptyProfile,...dashboard.profile,state:dashboard.state});
   }).catch(err=>{if (!controller.signal.aborted) setError(errorMessage(err));});
   return ()=>controller.abort();
 },[revision]);
 async function save() {
   setBusy(true);setError('');setMessage('');
   try {await api.put('/citizen-schemes/profile',profile);setMessage('Profile saved.');setRevision(value=>value+1);}
   catch(err) {setError(errorMessage(err));}
   finally {setBusy(false);}
 }
 return <div className="workflow">
   <header className="workflow-heading"><div><h1>Welcome, {user?.name?.split(' ')[0] || 'citizen'}.</h1><p>Find support, save useful schemes and check your next steps.</p></div></header>
   <div className="inline-actions"><Link className="primary-action" to="/schemes">Find a scheme</Link><Link className="secondary-action" to="/assistant">Ask JANASEVA AI</Link></div>
   {error && <p role="alert" className="workflow-error">{error}</p>}
   {message && <p role="status">{message}</p>}
   <section className="workflow-card"><details><summary className="cursor-pointer font-semibold">Optional profile — improve recommendations</summary>
     <p>You can browse and save schemes without completing this profile.</p>
     <form className="grid gap-3 pt-3" onSubmit={event=>{event.preventDefault();void save();}}>
       {(['state','district','occupation'] as const).map(field=><label key={field} className="grid gap-2">{field==='state'?'State or UT':field==='district'?'District':'Occupation'}
         <input value={profile[field]} maxLength={120} onChange={event=>setProfile({...profile,[field]:event.target.value})}/></label>)}
       <label className="grid gap-2">Age range<select value={profile.ageRange} onChange={event=>setProfile({...profile,ageRange:event.target.value})}>
         <option value="">Prefer not to say</option><option value="under18">Under 18</option><option value="18-25">18–25</option><option value="26-40">26–40</option><option value="41-60">41–60</option><option value="over60">Over 60</option>
       </select></label>
       <label className="grid gap-2">Annual household income range<select value={profile.incomeRange} onChange={event=>setProfile({...profile,incomeRange:event.target.value})}>
         <option value="">Prefer not to say</option><option value="under1lakh">Under ₹1 lakh</option><option value="1-3lakh">₹1–3 lakh</option><option value="3-5lakh">₹3–5 lakh</option><option value="over5lakh">Over ₹5 lakh</option>
       </select></label><button className="secondary-action" disabled={busy}>Save profile</button>
     </form>
   </details></section>
   {!data ? !error && <p role="status">Loading your dashboard…</p> : <>
     <section className="workflow-card"><h2>Saved schemes</h2><Link to="/my-schemes" className="underline">Assessments and updates ({data.alerts.filter(alert=>!alert.read_at).length} unread)</Link>
       {!data.watches.length && <p>Save a scheme from Explore Schemes to keep it here.</p>}
       <div className="grid gap-3 pt-3 lg:grid-cols-2">{data.watches.filter(watch=>watch.scheme).map(watch=><SchemeCard key={watch.scheme_id} scheme={watch.scheme!} initialSaved onSaveChange={()=>setRevision(value=>value+1)}/>)}</div>
     </section>
     <section className="workflow-card"><h2>Upcoming verified deadlines</h2>
       {data.deadlines.length?<ul>{data.deadlines.map(item=><li key={item.id}><Link to={'/schemes/'+item.id}>{item.scheme_name}</Link> · {item.deadline}{item.cycle && ' · '+item.cycle}</li>)}</ul>
         :<p>No upcoming application deadline could be verified for your saved schemes.</p>}
     </section>
     <section className="workflow-card"><h2>Recommended to explore</h2><p>Matches use published coverage and occupation keywords. Check age, income and all other conditions in the official guidelines.</p>
       <div className="grid gap-3 pt-3 lg:grid-cols-2">{data.recommendations.map(scheme=><SchemeCard scheme={scheme} key={scheme.id} initialSaved={data.watches.some(watch=>watch.scheme_id===scheme.id)} onSaveChange={()=>setRevision(value=>value+1)}/>)}</div>
       {!data.recommendations.length && <p>No published matches for this profile. Try Explore Schemes.</p>}
     </section>
     <div className="inline-actions"><Link to="/applications">Previous applications</Link><Link to="/documents">My documents</Link><Link to="/schemes/admin">Source administration</Link></div>
   </>}
 </div>;
};
