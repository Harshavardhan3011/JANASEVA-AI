import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { api } from '../services/api';
import { documentLabels,errorMessage } from '../services/workflow';
import type { CitizenDocument } from '../services/workflow';

export const DocumentsPage = () => {
  const [docs,setDocs]=useState<CitizenDocument[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  useEffect(()=>{api.get('/documents').then(r=>setDocs(r.data.data)).catch(e=>setError(errorMessage(e))).finally(()=>setLoading(false));},[]);
  return <div className="workflow"><header className="workflow-heading"><div><h1>Documents</h1><p>Upload and review evidence inside each scholarship application.</p></div>
    <Link className="secondary-action" to="/applications">Open applications</Link></header>
    {error && <p className="workflow-error" role="alert">{error}</p>}
    <section className="workflow-card">{loading ? <p>Loading documents…</p> : !docs.length ? <p>No supporting documents uploaded.</p> :
    <ul className="app-list">{docs.map(doc=><li key={doc.id}><Link to={'/applications/'+doc.application_id}>
      <FileText size={20}/><span><strong>{documentLabels[doc.document_type]}</strong><small>{doc.extracted_data_json.method}</small></span>
      <span className="state-label">{doc.validation_status==='VALID' ? 'Reviewed' : 'Review needed'}</span></Link></li>)}</ul>}</section>
  </div>;
};
