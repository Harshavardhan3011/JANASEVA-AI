import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardCheck, Landmark, MessageCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { errorMessage,statusLabel } from '../services/workflow';
import type { Application } from '../services/workflow';

export const DashboardPage = () => {
  const { user }=useAuth();
  const [apps,setApps]=useState<Application[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  useEffect(()=>{ api.get('/applications').then(r=>setApps(r.data.data)).catch(e=>setError(errorMessage(e))).finally(()=>setLoading(false)); },[]);
  return <div className="workflow">
    <section className="dashboard-hero"><div><span className="civic-kicker"><span/> CITIZEN WORKSPACE</span>
      <h1>Welcome, {user?.name?.split(' ')[0] || 'citizen'}.</h1><p>Find government schemes, review official updates and pick up where you left off.</p>
      <div className="inline-actions">
        <Link className="primary-action" to="/schemes">Browse schemes <ArrowRight size={16}/></Link>
        <Link className="secondary-action" to="/assistant"><MessageCircle size={18}/> Ask the scholarship assistant</Link>
      </div></div><Landmark size={90} strokeWidth={1.2}/></section>
    {error && <p className="workflow-error" role="alert">{error}</p>}
    <section className="workflow-card"><div className="section-heading"><div><h2>Your applications</h2><p>Track screening, review and demo submission.</p></div><Link className="secondary-action" to="/applications">View all <ArrowRight size={16}/></Link></div>
      {loading ? <p>Loading applications…</p> : !apps.length ? <div className="dashboard-empty"><ClipboardCheck size={24}/> <span>No applications yet. Start from the scholarship assistant.</span></div> :
        <ul className="app-list">{apps.slice(0,4).map(app=><li key={app.id}><Link to={'/applications/'+app.id}><span><strong>{app.scheme?.scheme_name}</strong><small>{new Date(app.created_at).toLocaleDateString()}</small></span><span className="state-label">{statusLabel(app.workflow_state)}</span><ArrowRight size={17}/></Link></li>)}</ul>}
    </section>
  </div>;
};
