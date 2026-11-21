import { Link,useParams,useSearchParams } from 'react-router-dom';
// Public reference snapshot; backend tests enforce parity with the API dataset.
import directory from '../data/certificate-directory.json';
const unknown='Not specified in the official source.';
export const certificateGuideTypes=Object.fromEntries(directory.guides.filter(guide=>!guide.state).map(guide=>[guide.slug,guide.title]));
export const certificateDepartments=[...new Set(directory.guides.map(guide=>guide.department))];

export function CertificateDirectory({query='',state='',kind='',department=''}:{query?:string;state?:string;kind?:string;department?:string}) {
 const words=query.toLowerCase().split(/\s+/).filter(Boolean);
 const guides=directory.guides.filter(guide=>(!guide.state || !state || guide.state===state) &&
  (!kind || guide.kind===kind) && (!department || guide.department===department) &&
  words.every(word=>[guide.title,...guide.aliases,guide.scope].join(' ').toLowerCase().includes(word)));
 return <section aria-labelledby="certificate-directory-title" className="space-y-4">
  <h2 id="certificate-directory-title" className="text-2xl font-bold">Certificate guides and official links</h2>
  <p>{directory.notice}</p>
  <p role="status">{guides.length} directory entries and source guides</p>
  {!guides.length && <p>Try a certificate name such as income, caste, birth, UDID or life certificate.</p>}
  <div className="grid gap-4 lg:grid-cols-2">{guides.map(guide=><article className="workflow-card space-y-3" key={guide.slug}>
   <p className="text-sm">{guide.level==='source_guide'?'Official source guide':'Local requirements need verification'} · {guide.scope}</p>
   <h3 className="text-xl font-semibold"><Link to={'/certificates/guides/'+guide.slug+(state?'?state='+encodeURIComponent(state):'')}>{guide.title}</Link></h3>
   <p>{guide.overview}</p><div className="inline-actions"><Link className="secondary-action" to={'/certificates/guides/'+guide.slug+(state?'?state='+encodeURIComponent(state):'')}>How and where to apply</Link>
   <Link className="text-action" to={'/ask?q='+encodeURIComponent('How do I apply for '+guide.title+(state?' in '+state:'')+'?')}>Ask JANASEVA AI</Link></div>
  </article>)}</div>
 </section>;
}

export function CertificateGuidePage() {
 const {slug}=useParams();const [params,setParams]=useSearchParams();
 const guide=directory.guides.find(item=>item.slug===slug);
 const state=guide?.state || params.get('state') || '';
 const portal=directory.states.find(item=>item.state===state);
 if(!guide) return <div className="workflow"><h1>Certificate guide not found</h1><Link to="/certificates">Explore certificates</Link></div>;
 return <div className="workflow space-y-5">
  <Link to="/certificates">← Certificates</Link>
  <header className="workflow-heading"><div><h1>{guide.title}</h1><p>{guide.scope}</p></div></header>
  <section className="workflow-card space-y-4"><h2 className="text-xl font-bold">Overview</h2><p>{guide.overview}</p>
   <p>{guide.level==='source_guide'?'Official source checked '+guide.checkedOn+'. This is a source summary, not confirmation of an open application window.':'General navigation guide. Local eligibility, required documents, fees and processing times have not yet been verified.'}</p>
   <h2 className="text-xl font-bold">Who can apply</h2><ul>{guide.eligibility.length?guide.eligibility.map(text=><li key={text}>{text}</li>):<li>{unknown}</li>}</ul>
   <h2 className="text-xl font-bold">Required documents and information</h2><ul className="list-disc pl-5">{guide.documents.length?guide.documents.map(text=><li key={text}>{text}</li>):<li>{unknown} Open the local service’s checklist before preparing documents.</li>}</ul>
   <h2 className="text-xl font-bold">How to apply</h2><ol className="list-decimal pl-5 space-y-2">{guide.steps.map(step=><li key={step}>{step}</li>)}</ol>
   <h2 className="text-xl font-bold">Fees and processing time</h2><p>Fees: {guide.fees || unknown}</p><p>Processing time: {guide.processingTime || unknown}</p>
   <h2 className="text-xl font-bold">Contact and application dates</h2><p>Contact: {guide.contact || unknown}</p><p>Application dates: {unknown}</p>
  </section>
  <section className="workflow-card space-y-4"><h2 className="text-xl font-bold">Where to apply</h2>
   {guide.applicationUrl && <a className="primary-action" href={guide.applicationUrl} target="_blank" rel="noopener noreferrer">Open official service portal ↗</a>}
   {!guide.applicationUrl && <p>A direct application link has not been verified. Use the official authority or directory below to locate the service.</p>}
   {!guide.state && <label className="grid gap-2">State or UT<select aria-label="State or UT" value={state} onChange={event=>setParams(event.target.value?{state:event.target.value}:{})}><option value="">Choose your state or UT</option>{directory.states.map(item=><option key={item.state}>{item.state}</option>)}</select></label>}
   {portal && <p><a className="text-action" href={portal.url} target="_blank" rel="noopener noreferrer">{portal.state} government website ↗</a> · Official homepage; locate the issuing department’s service.</p>}
   {directory.directories.map(item=><p key={item.url}><a className="text-action" href={item.url} target="_blank" rel="noopener noreferrer">{item.label} ↗</a> · Directory, not a direct application form.</p>)}
   <Link className="secondary-action" to={'/ask?q='+encodeURIComponent('How do I apply for '+guide.title+(state?' in '+state:'')+'?')}>Ask JANASEVA AI about this certificate</Link>
  </section>
  <section className="workflow-card space-y-3"><h2 className="text-xl font-bold">Official evidence</h2>{guide.sources.length?guide.sources.map(source=><div key={source.url}><a className="text-action" href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</a><p>Supports: {source.supports.join(', ')}. Checked {guide.checkedOn}.</p></div>):<p>No service-specific source has been verified for this directory entry. General steps above are navigation guidance.</p>}</section>
 </div>;
}
