import { useEffect,useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { errorMessage } from '../services/workflow';
import { SchemeCard } from '../components/SchemeCard';
import type { SchemeCardData } from '../components/SchemeCard';
interface Turn {message:string;reply:string;matches?:SchemeCardData[];follow_up?:string|null;conversation_id:string;recheck_requested?:boolean}
const examples=['Find scholarships for a third-year mechanical engineering student in Andhra Pradesh.','Find agriculture schemes.','What documents do I need for PM-USP CSSS?'];
export const AssistantPage=()=>{
 const {user}=useAuth();
 const [params]=useSearchParams();
 const [input,setInput]=useState(params.get('q') || '');
 const [history,setHistory]=useState<Turn[]>([]);
 const [conversation,setConversation]=useState('');
 const [conversations,setConversations]=useState<Array<{id:string;title:string}>>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
   if (!user) return;
   const controller=new AbortController();
   api.get('/assistant/conversations',{signal:controller.signal}).then(result=>setConversations(result.data.data))
     .catch(err=>{if (!controller.signal.aborted) setError(errorMessage(err));});
   return ()=>controller.abort();
 },[user]);
 async function send(message:string) {
   if (!message.trim() || busy) return;
   setBusy(true);setError('');
   try {
     const {data}=await api.post<{data:Turn}>('/assistant/'+(user?'chat':'answer'),{message,conversation_id:conversation || undefined},{timeout:60000});
     setHistory(items=>[...items,{...data.data,message}]);
     if (user && !conversation) setConversations(items=>[{id:data.data.conversation_id,title:message},...items]);
     setConversation(data.data.conversation_id);setInput('');
   } catch(err) {setError(errorMessage(err));}
   finally {setBusy(false);}
 }
 async function open(id:string) {
   setError('');setConversation(id);
   if (!id) {setHistory([]);return;}
   try {setHistory((await api.get('/assistant/conversations/'+id)).data.data.turns);}
   catch(err) {setError(errorMessage(err));}
 }
 return <div className="workflow">
   <header className="workflow-heading"><div><h1>Ask JANASEVA AI</h1><p>Find schemes and check requirements against official sources.</p></div>
     {user && <select aria-label="Conversation history" disabled={busy} value={conversation} onChange={event=>void open(event.target.value)}>
       <option value="">New conversation</option>{conversations.map(item=><option key={item.id} value={item.id}>{item.title.slice(0,60)}</option>)}
     </select>}
   </header>
   <section className="workflow-card">
     {!history.length && <div className="space-y-3"><p>Tell us what support you are looking for and where you live.</p>
       {examples.map(example=><button key={example} className="secondary-action text-left" disabled={busy} onClick={()=>void send(example)}>{example}</button>)}</div>}
     {history.map((turn,index)=><article key={index} className="space-y-3 border-b border-slate-200 py-4">
       <p className="font-semibold">{turn.message}</p><p className="whitespace-pre-line">{turn.reply}</p>
       {turn.follow_up && <button className="secondary-action" onClick={()=>setInput(turn.message+' My state is ')}>{turn.follow_up}</button>}
       {turn.recheck_requested && <p className="text-sm">A source check was requested. The last published information remains visible while the worker checks.</p>}
       <div className="grid gap-3 lg:grid-cols-2">{turn.matches?.map(scheme=><SchemeCard scheme={scheme} key={scheme.id}/>)}</div>
     </article>)}
     <form className="grid gap-3 pt-4" onSubmit={event=>{event.preventDefault();void send(input);}}>
       <label className="grid gap-2">Your question<input placeholder="Search schemes or ask a question" value={input} maxLength={1500} onChange={event=>setInput(event.target.value)}/></label>
       <button className="primary-action" disabled={busy || !input.trim()}>{busy?'Finding schemes…':'Ask JANASEVA AI'}</button>
     </form>
     {error && <p role="alert" className="workflow-error">{error} You can also use Explore Schemes.</p>}
     {busy && <p role="status">Checking the published catalog…</p>}
   </section>
 </div>;
};
