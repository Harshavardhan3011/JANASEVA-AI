import { useEffect,useState } from 'react';
import { Link,useNavigate } from 'react-router-dom';
import { ArrowRight,Plus } from 'lucide-react';
import { api } from '../services/api';
import { errorMessage,startApplication,statusLabel } from '../services/workflow';
import type { Application } from '../services/workflow';

export const ApplicationsListPage = () => {
  const navigate=useNavigate();
  const [apps,setApps]=useState<Application[]>([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{api.get('/applications').then(r=>setApps(r.data.data)).catch(e=>setError(errorMessage(e))).finally(()=>setLoading(false));},[]);
  async function create() {
    setBusy(true);setError('');
    try { navigate('/applications/'+(await startApplication()).id); }
    catch(e) { setError(errorMessage(e));setBusy(false); }
  }
  return <div className="workflow"><header className="workflow-heading"><div><h1>Applications</h1><p>Open a saved scholarship application or start a new one.</p></div>
    <button className="primary-action" disabled={busy} onClick={()=>void create()}><Plus size={18}/> New application</button></header>
    {error && <p className="workflow-error" role="alert">{error}</p>}
    <section className="workflow-card">{loading ? <p>Loading applications…</p> : !apps.length ? <p>No applications yet.</p> :
      <ul className="app-list">{apps.map(app=><li key={app.id}><Link to={'/applications/'+app.id}><span><strong>{app.scheme?.scheme_name}</strong>
        <small>{new Date(app.created_at).toLocaleDateString()} {app.reference_number && ' · '+app.reference_number}</small></span>
        <span className="state-label">{statusLabel(app.workflow_state)}</span><ArrowRight size={18}/></Link></li>)}</ul>}</section></div>;
};
