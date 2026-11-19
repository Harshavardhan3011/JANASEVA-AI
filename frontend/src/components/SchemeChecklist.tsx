import { useEffect,useState } from 'react';
import { api } from '../services/api';
import { errorMessage } from '../services/workflow';
export function SchemeChecklist({id,items}:{id:string;items:string[]}) {
 const [progress,setProgress]=useState<Record<string,boolean>>({});
 const [error,setError]=useState('');
 const [ready,setReady]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{
   setProgress({});setReady(false);setMessage('');setError('');
   const controller=new AbortController();
   api.get('/citizen-schemes/progress/'+id,{signal:controller.signal}).then(result=>{setProgress(result.data.data);setReady(true);})
     .catch(err=>{if (!controller.signal.aborted) setError(errorMessage(err));});
   return ()=>controller.abort();
 },[id]);
 async function save() {
   setBusy(true);setMessage('');setError('');
   try {await api.put('/citizen-schemes/progress/'+id,progress);setMessage('Checklist saved.');}
   catch(err) {setError(errorMessage(err));}finally {setBusy(false);}
 }
 return <section className="workflow-card"><h2>My preparation checklist</h2>
   {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
   {!items.length?<p>Document and application-step details are not specified in the official source.</p>:!ready?<p>Loading checklist…</p>:<>
     <div className="space-y-3">{items.map((text,index)=>{
       const key=text;
       return <label key={index} className="flex items-start gap-3"><input type="checkbox" checked={Boolean(progress[key])} onChange={event=>setProgress({...progress,[key]:event.target.checked})}/>{text}</label>;
     })}</div><button className="secondary-action mt-3" disabled={busy} onClick={()=>void save()}>Save checklist</button>
   </>}
 </section>;
}
