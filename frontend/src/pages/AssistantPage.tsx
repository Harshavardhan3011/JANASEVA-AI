import { useEffect,useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, MessageCircle, Send } from 'lucide-react';
import { api } from '../services/api';
import { errorMessage,startApplication } from '../services/workflow';
import type { Citation } from '../types';

interface Turn { message:string; reply:string; citations:Citation[]; scheme_id:string|null; conversation_id:string }
const examples=['Help me apply for a college scholarship','What is the family income limit?','Which documents should I prepare?'];
export const AssistantPage = () => {
  const navigate=useNavigate();
  const [history,setHistory]=useState<Turn[]>([]);
  const [conversation,setConversation]=useState('');
  const [conversations,setConversations]=useState<Array<{ id:string; title:string }>>([]);
  const [input,setInput]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(() => { api.get('/assistant/conversations').then(r=>setConversations(r.data.data)).catch(e=>setError(errorMessage(e))); },[]);
  async function send(message:string) {
    if (!message.trim()) return;
    setBusy(true); setError('');
    try {
      const { data } = await api.post<{data:Turn}>('/assistant/chat',{ message,conversation_id:conversation || undefined });
      if (!conversation) setConversations(items=>[{ id:data.data.conversation_id,title:message },...items]);
      setConversation(data.data.conversation_id);
      setHistory(items=>[...items,{ ...data.data,message }]);
      setInput('');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function open(id:string) {
    setError('');
    if (!id) { setConversation(''); setHistory([]); return; }
    try { const r=await api.get('/assistant/conversations/'+id); setConversation(id); setHistory(r.data.data.turns); }
    catch(e) { setError(errorMessage(e)); }
  }
  async function apply() {
    setBusy(true); setError('');
    try { navigate('/applications/'+(await startApplication()).id); }
    catch (e) { setError(errorMessage(e)); setBusy(false); }
  }
  return <div className="workflow">
    <header className="workflow-heading"><div><h1>Scholarship assistant</h1><p>Ask about fresh applications for PM-USP CSSS.</p></div>
    <select aria-label="Conversation history" value={conversation} onChange={event=>void open(event.target.value)} disabled={busy}>
      <option value="">New conversation</option>{conversations.map(item=><option key={item.id} value={item.id}>{item.title.slice(0,60)}</option>)}
    </select></header>
    {error && <p className="workflow-error" role="alert">{error}</p>}
    <section className="workflow-card conversation" aria-live="polite">
      {!history.length && <div className="chat-empty"><span className="scheme-icon"><MessageCircle size={22}/></span><h2>What would you like to know?</h2><div className="inline-actions">{examples.map(value=><button key={value} className="secondary-action"
        disabled={busy} onClick={()=>void send(value)}>{value}</button>)}</div></div>}
      {history.map((turn,i)=><article className="chat-turn" key={i}>
        <p className="chat-question">{turn.message}</p><p className="chat-answer">{turn.reply}</p>
        {!!turn.citations.length && <ul className="citations">{turn.citations.map(c=><li key={c.section+c.official_url}>
          <a href={c.official_url+'#page='+c.page} target="_blank" rel="noreferrer">{c.source_document_name} · {c.section} <ArrowUpRight size={15}/></a>
          <small>Page {c.page} · Source checked {c.verified_date}</small></li>)}</ul>}
        {i===history.length-1 && turn.scheme_id && <button className="primary-action" disabled={busy} onClick={()=>void apply()}>Start guided application <ArrowUpRight size={16}/></button>}
      </article>)}
      <form className="chat-form" onSubmit={e=>{e.preventDefault();void send(input);}}>
        <input aria-label="Your scholarship question" placeholder="Ask about income, eligibility or documents…" value={input} maxLength={1500} onChange={e=>setInput(e.target.value)}/>
        <button className="primary-action" aria-label="Send" disabled={busy || !input.trim()}><Send size={17}/></button>
      </form>
      {busy && <p role="status">Working on your request…</p>}
    </section>
  </div>;
};
