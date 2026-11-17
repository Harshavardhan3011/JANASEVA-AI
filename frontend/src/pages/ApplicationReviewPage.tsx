import { useEffect,useState } from 'react';
import type { FormEvent } from 'react';
import { Link,useParams } from 'react-router-dom';
import { ArrowLeft,ArrowRight,CheckCircle2,FileCheck2,ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import { documentLabels,errorMessage,statusLabel } from '../services/workflow';
import type { Application,BrowserStatus,CitizenDocument,Details } from '../services/workflow';

const textFields = [
  ['name','Full name'],['institution_name','Institution name'],['course_name','Degree course'],
  ['annual_family_income','Annual family income (₹)'],['board_percentile','Class XII board and stream percentile'],
] as const;
const questions = [
  ['regular_degree','Are you pursuing a regular degree course?'],
  ['recognized_institution','Is your institution recognized by the relevant regulator?'],
  ['other_scholarship','Do you receive another scholarship, fee waiver or reimbursement?'],
  ['gap_after_class_xii','Did you take a gap after Class XII?'],
  ['fresh_first_year','Did you complete Class XII last academic year and enter the first year of a regular degree?'],
  ['board_listed','Did your Class XII board include you on its published eligibility list?'],
] as const;
const conditionLabels = Object.fromEntries([...textFields,...questions]);

export const ApplicationReviewPage = () => {
  const { id } = useParams();
  const [app,setApp] = useState<Application>();
  const [docs,setDocs] = useState<CitizenDocument[]>([]);
  const [status,setStatus] = useState<BrowserStatus>();
  const [image,setImage] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [approved,setApproved] = useState(false);

  async function refresh() {
    const [application, documents, browser] = await Promise.all([
      api.get('/applications/'+id),api.get('/documents',{ params:{ application_id:id } }), api.get('/browser/'+id+'/status'),
    ]);
    setApp(application.data.data);
    setDocs(documents.data.data);
    setStatus(browser.data.data);
  }
  useEffect(() => {
    setLoading(true);
    refresh().catch(e => setError(errorMessage(e))).finally(() => setLoading(false));
  },[id]);
  useEffect(() => {
    if (!app?.browser_active) return;
    const timer = window.setInterval(() => { void refresh().catch(() => {}); },3500);
    return () => window.clearInterval(timer);
  },[app?.browser_active,id]);
  useEffect(() => {
    setImage('');
    if (!status?.screenshot_path) return;
    let active = true;
    let url = '';
    api.get(status.screenshot_path,{ responseType:'blob' }).then(response => {
      if (!active) return;
      url = URL.createObjectURL(response.data);
      setImage(url);
    }).catch(e => { if (active) setError(errorMessage(e)); });
    return () => { active=false; if (url) URL.revokeObjectURL(url); };
  },[status?.id,status?.screenshot_path]);

  async function act(run:() => Promise<unknown>) {
    setBusy(true); setError(''); setApproved(false);
    try { await run(); }
    catch (e) { setError(errorMessage(e)); }
    finally { await refresh().catch(e => setError(errorMessage(e))); setBusy(false); }
  }
  function prepare(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!app) return;
    const form = new FormData(event.currentTarget);
    const details = Object.fromEntries([
      ...textFields.map(([key]) => [key, key === 'board_percentile' || key === 'annual_family_income' ? Number(form.get(key)) : form.get(key)]),
      ...questions.map(([key]) => [key,form.get(key)==='yes']),
    ]) as unknown as Details;
    void act(() => api.post('/applications/'+id+'/prepare',{ applicant_data:details,revision:app.revision }));
  }

  if (loading) return <p role="status">Loading application…</p>;
  if (!app) return <p role="alert">{error || 'Application unavailable.'}</p>;
  const state = app.workflow_state;
  const editable = ['ELIGIBILITY_PENDING','DOCUMENTS_PENDING'].includes(state);
  const reviewMode = state === 'APPROVAL_PENDING' || state === 'FINAL_APPROVAL_PENDING';
  const finalApproval = state === 'FINAL_APPROVAL_PENDING';
  const detail = app.applicant_data_json;
  const steps = ['Screening','Documents','Review','Browser','Receipt'];
  const activeStep = ['ELIGIBILITY_PENDING','DOCUMENTS_PENDING','APPROVAL_PENDING','BROWSER_EXECUTION_PENDING','SUBMISSION_COMPLETED'].indexOf(state);
  return <div className="workflow">
    <Link className="back-link" to="/applications"><ArrowLeft size={17}/> Applications</Link>
    <header className="workflow-heading">
      <div><h1>Scholarship application</h1><p>PM-USP CSSS · Fresh applicant</p></div>
      <span className="state-label">{statusLabel(state)}</span>
    </header>
    {state !== 'CANCELLED' && <ol className="workflow-steps" aria-label="Application progress">
      {steps.map((name,index) => <li key={name} className={index <= (activeStep < 0 ? 3 : activeStep) ? 'reached' : ''}>
        <span>{index < activeStep ? <CheckCircle2 size={16}/> : index+1}</span>{name}
      </li>)}
    </ol>}
    {error && <p className="workflow-error" role="alert">{error}</p>}
    {editable && <form key={app.id} onSubmit={prepare} className="workflow-card">
      <h2>Applicant details</h2><p>Use your Class XII board percentile and the figures on your supporting documents.</p>
      <div className="input-grid">
        {textFields.map(([name,label]) => <label key={name}>{label}<input name={name} required defaultValue={detail[name] ?? ''}
          type={name === 'annual_family_income' || name === 'board_percentile' ? 'number' : 'text'}
          min={0} max={name==='board_percentile' ? 100 : name==='annual_family_income' ? 1000000000 : undefined}
          step={name==='board_percentile' ? 'any' : undefined} maxLength={name==='institution_name' ? 180 : 120} /></label>)}
        {questions.map(([name,label]) => <label key={name}>{label}<select required name={name}
          defaultValue={detail[name] === undefined ? '' : detail[name] ? 'yes' : 'no'}>
          <option value="">Select an answer</option><option value="yes">Yes</option><option value="no">No</option>
        </select></label>)}
      </div>
      <button className="primary-action" disabled={busy}>{state==='DOCUMENTS_PENDING' ? 'Validate and prepare' : 'Check eligibility'} <ArrowRight size={16}/></button>
    </form>}
    {app.eligibility_result && <section className="workflow-card"><h2>Eligibility assessment</h2><p>{app.eligibility_result.summary}</p>
      <ul className="checks">{app.eligibility_result.conditions.map(c => <li key={c.condition}>
        <span><strong>{conditionLabels[c.condition] || c.condition}</strong><small>{c.required_value} · {c.evidence}</small></span>
        <span className={c.result==='FAIL' ? 'fail' : 'pass'}>{c.result}</span></li>)}</ul>
      {app.scheme?.official_url && <a className="back-link" href={app.scheme.official_url} target="_blank" rel="noreferrer">Read the Ministry guidelines <ArrowRight size={15}/></a>}
    </section>}
    {state==='DOCUMENTS_PENDING' && <section className="workflow-card"><h2>Supporting evidence</h2>
      <p>Upload a PDF, PNG or JPEG up to 10 MB. Review extracted values against each original before confirming.</p>
      {['INCOME_CERTIFICATE','MARKSHEET'].map(kind => {
        const matching=docs.filter(doc => doc.document_type===kind);
        return <div className="document-block" key={kind}>
          <div className="document-heading"><FileCheck2 size={20}/><strong>{documentLabels[kind]}</strong></div>
          {matching.map(doc => <div className="document-result" key={doc.id}>
            <p>{Object.entries(doc.extracted_data_json).filter(([key]) => key!=='readable').map(([key,value]) => key==='method' || key==='warning' ? String(value) : key.replace(/_/g,' ')+': '+value).join(' · ')}</p>
            <div className="inline-actions">{doc.validation_status==='VALID' ? <span className="pass">Reviewed</span>
              : <button className="secondary-action" disabled={busy} onClick={() => void act(() => api.post('/documents/'+doc.id+'/review',{ reviewed:true }))}>Confirm I reviewed this document</button>}
              <button className="text-action" disabled={busy} onClick={() => void act(() => api.delete('/documents/'+doc.id))}>Remove document</button></div>
          </div>)}
          {!matching.some(doc => doc.validation_status==='VALID') && <form className="upload-row" onSubmit={event => {
            event.preventDefault();
            const body=new FormData(event.currentTarget);
            body.set('application_id',app.id); body.set('document_type',kind);
            void act(() => api.post('/documents/upload',body,{ timeout:90000 }));
          }}>
            <input aria-label={documentLabels[kind]} name="document" type="file" required accept=".pdf,.jpg,.jpeg,.png"/>
            <button className="secondary-action" disabled={busy}>Upload and extract</button>
          </form>}
        </div>;
      })}
      <button className="primary-action" disabled={busy || !['INCOME_CERTIFICATE','MARKSHEET'].every(kind => docs.some(doc => doc.document_type===kind && doc.validation_status==='VALID'))} onClick={() => void act(() => api.post('/applications/'+id+'/prepare',{ applicant_data:detail,revision:app.revision }))}>Prepare reviewed application <ArrowRight size={16}/></button>
    </section>}
    {!editable && state!=='CANCELLED' && <section className="workflow-card"><h2>Prepared dossier</h2>
      <dl className="input-grid dossier">{textFields.map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{detail[key] ?? '—'}</dd></div>)}</dl>
    </section>}
    {status && <section className="workflow-card"><h2>Mock portal preview</h2><p>{status.current_step}</p>
      {image && <img className="portal-preview" src={image} alt="Screenshot captured by Playwright in the mock scholarship portal"/>}
    </section>}
    {reviewMode && <section className="workflow-card approval-card">
      <h2><ShieldCheck size={22}/> {finalApproval ? 'Final demo submission' : 'Authorize browser preparation'}</h2>
      <p>{finalApproval ? 'Review the completed mock form above. Your approval sends it to the demonstration portal.' :
      'Your approval lets Playwright fill and validate the demonstration portal form. You will review the filled form before submitting.'}</p>
      <label className="approval-check"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)}/>
        {finalApproval ? 'I reviewed the form and authorize the demo submission.' : 'I reviewed the dossier and authorize browser preparation.'}</label>
      <button className="primary-action" disabled={!approved || busy || Boolean(app.browser_active) || (finalApproval && !image)} onClick={() => void act(async () => {
        await api.post('/applications/'+id+'/'+(finalApproval ? 'approve-submission' : 'approve-preparation'),{ authorized:true,revision:app.revision },{ timeout:120000 });
        if (!finalApproval) await api.post('/browser/'+id+'/start',{},{ timeout:120000 });
      })}>{finalApproval ? 'Submit demo application' : 'Approve and fill mock form'} <ArrowRight size={16}/></button>
    </section>}
    {state==='BROWSER_EXECUTION_PENDING' && <section className="workflow-card"><h2>Browser preparation</h2><p>Your first approval is recorded. Fill the mock form or retry a failed run.</p>
      <button className="primary-action" disabled={busy || Boolean(app.browser_active)} onClick={() => void act(() => api.post('/browser/'+id+'/start',{},{ timeout:120000 }))}>Run browser preparation</button></section>}
    {state==='SUBMISSION_COMPLETED' && <section className="workflow-card receipt"><CheckCircle2 size={30}/><h2>Demo application received</h2><p>Demonstration reference</p><strong>{app.reference_number}</strong></section>}
    {busy && <p role="status">Working on your application…</p>}
    <div className="inline-actions"><Link className="secondary-action" to={'/tracking/'+id}>View audit history</Link>
    {!app.browser_phase && state!=='CANCELLED' && state!=='SUBMISSION_COMPLETED' && <button className="text-action" disabled={busy}
      onClick={() => { if (window.confirm('Cancel this application?')) void act(() => api.post('/applications/'+id+'/cancel',{})); }}>Cancel application</button>}</div>
  </div>;
};
