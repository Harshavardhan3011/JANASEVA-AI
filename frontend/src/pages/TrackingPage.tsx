import { useEffect,useState } from 'react';
import { Link,useParams } from 'react-router-dom';
import { ArrowUpRight,History } from 'lucide-react';
import { api } from '../services/api';
import { errorMessage,statusLabel } from '../services/workflow';
import type { Application } from '../services/workflow';

interface Event { id:string; event_type:string; action_name:string; execution_status:string; created_at:string }
export const TrackingPage = () => {
  const { id }=useParams();
  const [apps,setApps]=useState<Application[]>([]);
  const [events,setEvents]=useState<Event[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const selected=apps.find(app=>app.id===id);
  useEffect(()=>{
    setLoading(true);setError('');
    Promise.all([api.get('/applications'),id ? api.get('/tracking/'+id+'/history') : Promise.resolve(null)])
      .then(([applications,history])=>{setApps(applications.data.data);setEvents(history?.data.data ?? []);})
      .catch(e=>setError(errorMessage(e))).finally(()=>setLoading(false));
  },[id]);
  return <div className="workflow"><header className="workflow-heading"><div><h1>Activity history</h1><p>Review recorded actions and approval checkpoints.</p></div>
    {selected && <Link to={'/applications/'+selected.id} className="secondary-action">Open application <ArrowUpRight size={16}/></Link>}</header>
    {error && <p className="workflow-error" role="alert">{error}</p>}
    {loading ? <p role="status">Loading activity…</p> : <section className="workflow-card">
      {selected ? <><div className="section-heading"><div><h2>{selected.scheme?.scheme_name}</h2><p>{selected.reference_number || statusLabel(selected.workflow_state)}</p></div>
        <Link className="back-link" to="/tracking">Choose another application</Link></div>
        <ul className="app-list">{events.map(event=><li key={event.id}><div className="audit-item"><History size={18}/><span>
          <strong>{event.event_type.replace(/_/g,' ').toLowerCase()}</strong><small>{new Date(event.created_at).toLocaleString()}</small></span>
          <span className="state-label">{event.execution_status.replace(/_/g,' ').toLowerCase()}</span></div></li>)}</ul></> :
      apps.length ? <ul className="app-list">{apps.map(app=><li key={app.id}><Link to={'/tracking/'+app.id}>
        <span><strong>{app.scheme?.scheme_name}</strong><small>{new Date(app.created_at).toLocaleString()}</small></span>
        <span className="state-label">{statusLabel(app.workflow_state)}</span><ArrowUpRight size={17}/></Link></li>)}</ul> : <p>No applications to track yet.</p>}
    </section>}
  </div>;
};
