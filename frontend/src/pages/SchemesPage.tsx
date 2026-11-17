import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, FileText } from 'lucide-react';
import { api } from '../services/api';
import { errorMessage, startApplication } from '../services/workflow';
import { useAuth } from '../hooks/useAuth';
import { describeStatus } from '../services/schemeDetails';
import type { SchemeStatus } from '../services/schemeDetails';

interface Scheme {
  id: string;
  scheme_name: string;
  description: string;
  department: string;
  official_url: string;
  guided_application: boolean;
  catalog_source_url: string | null;
  catalog_checked_on: string | null;
  academic_year: string | null;
  application_deadline: string | null;
  application_cycle: 'student' | 'renewal' | null;
  category: string | null;
  coverage_level: string | null;
  coverage_state: string | null;
  coverage_district: string | null;
  coverage_village: string | null;
  application_url: string | null;
  eligibility_summary: string | null;
  scheme_status: SchemeStatus;
  benefits_summary: string | null;
}

const calendarDate = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' });
const formatDate = (value: string) => calendarDate.format(new Date(value));
const nspCatalog = 'https://scholarships.gov.in/All-Scholarships';
const filterFields = [['category','Category'],['coverage_state','State'],['scheme_status','Scheme status'],['coverage_district','District'],['coverage_village','Village']] as const;
type Filter = typeof filterFields[number][0];
const emptyFilters: Record<Filter,string> = { category:'',coverage_state:'',scheme_status:'',coverage_district:'',coverage_village:'' };

export const SchemesPage = () => {
  const navigate = useNavigate();
  const {user}=useAuth();
  const [schemes, setSchemes] = useState<Scheme[]>();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  const [loadError, setLoadError] = useState('');
  const [applicationError, setApplicationError] = useState('');
  const [startingId, setStartingId] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    api.get<{ data: Scheme[] }>('/schemes', { signal: controller.signal })
      .then(response => setSchemes(response.data.data))
      .catch(error => {
        if (!controller.signal.aborted) setLoadError(errorMessage(error));
      });
    return () => controller.abort();
  }, []);

  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = schemes?.filter(scheme => {
    const searchText = [scheme.scheme_name, scheme.description, scheme.department, scheme.academic_year,
      scheme.category, scheme.coverage_state, scheme.coverage_district, scheme.coverage_village].join(' ').toLowerCase();
    return words.every(word => searchText.includes(word)) && filterFields.every(([key])=>!filters[key] || scheme[key]===filters[key]);
  });

  async function apply(id: string) {
    if (!user) { navigate('/login');return; }
    setStartingId(id);
    setApplicationError('');
    try {
      const application = await startApplication(id);
      navigate('/applications/' + application.id);
    } catch (error) {
      setApplicationError(errorMessage(error));
      setStartingId('');
    }
  }

  return <div className="workflow">
    <header className="workflow-heading"><div>
      <h1>Schemes</h1>
      <p>Find government schemes by category and location.</p>
    </div>{user ? <div className="inline-actions">
      <Link className="secondary-action" to="/schemes/monitor">Scheme Monitor <ArrowRight size={16}/></Link>
      <Link className="secondary-action" to="/schemes/admin">Manage schemes</Link>
    </div> : null}</header>
    <section className="workflow-card" aria-label="Scheme catalog">
      <label className="grid gap-2 font-semibold">
        Search schemes
        <input type="search" value={query} onChange={event => setQuery(event.target.value)}
          placeholder="Search by name, department or location" />
      </label>
      <div className="grid gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-3">
        {filterFields.map(([field,label])=>{
          const options=[...new Set((schemes || []).map(scheme=>scheme[field]).filter((value):value is string=>Boolean(value)))].sort();
          return <label className="grid gap-1 text-sm font-semibold" key={field}>{label}
            <select value={filters[field]} onChange={event=>setFilters({ ...filters, [field]:event.target.value })}>
              <option value="">All</option>{options.map(option=><option value={option} key={option}>
                {field==='scheme_status'?describeStatus(option as SchemeStatus):option}
              </option>)}
            </select>
          </label>;
        })}
      </div>
      {loadError ? <p className="workflow-error" role="alert">{loadError}</p> : !matches ? (
        <p role="status">Loading schemes…</p>
      ) : matches.length === 0 ? (
        <p role="status">{schemes?.length ? 'No schemes match your search.' : 'No schemes are currently available.'}</p>
      ) : (
        <>
          <p className="mt-3 text-sm" role="status">{matches.length} {matches.length === 1 ? 'scheme' : 'schemes'}</p>
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {matches.map(scheme => <li key={scheme.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
                <FileText size={20} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <span className="text-xs text-slate-600">{scheme.department}</span>
                <h3 className="font-bold leading-snug"><Link className="hover:underline" to={'/schemes/'+scheme.id}>{scheme.scheme_name}</Link></h3>
                {scheme.scheme_status!=='unknown' ? <span className="state-label">{describeStatus(scheme.scheme_status)}</span> : null}
                <p className="text-sm">{scheme.description}</p>
                {scheme.coverage_level ? <p className="text-xs">
                  {[scheme.category,scheme.coverage_village,scheme.coverage_district,scheme.coverage_state].filter(Boolean).join(' · ') || scheme.coverage_level}
                </p> : null}
              </div>
            </div>
            {scheme.academic_year || scheme.application_deadline ? (
              <dl className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm">
                {scheme.academic_year ? <div><dt className="text-xs text-slate-600">Academic year</dt><dd className="font-semibold">{scheme.academic_year}</dd></div> : null}
                {scheme.application_deadline ? <div>
                  <dt className="text-xs text-slate-600">{scheme.application_cycle === 'renewal' ? 'Renewal deadline' : 'Student deadline'}</dt>
                  <dd className="font-semibold"><time dateTime={scheme.application_deadline}>{formatDate(scheme.application_deadline)}</time></dd>
                </div> : null}
              </dl>
            ) : null}
            {scheme.benefits_summary ? <p className="text-sm"><strong>Benefits.</strong> {scheme.benefits_summary}</p> : null}
            {scheme.eligibility_summary ? <p className="text-sm"><strong>Eligibility.</strong> {scheme.eligibility_summary}</p> : null}
            <div className="inline-actions mt-auto">
              {scheme.guided_application ? (
                <button className="secondary-action" disabled={Boolean(startingId)} onClick={() => void apply(scheme.id)}>
                  {startingId === scheme.id ? 'Starting application…' : 'Start guided application'} <ArrowRight size={16} aria-hidden="true" />
                </button>
              ) : (
                <a className="secondary-action" href={(scheme.scheme_status!=='closed' && scheme.application_url) || scheme.catalog_source_url || scheme.official_url} target="_blank" rel="noreferrer">
                  {scheme.application_url && scheme.scheme_status!=='closed' ? 'Apply on official portal' : scheme.catalog_source_url === nspCatalog ? 'Open on NSP' : 'Open official source'} <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              )}
              {scheme.official_url !== scheme.catalog_source_url && (scheme.catalog_source_url || scheme.guided_application) ? (
                <a className="back-link !mt-0" href={scheme.official_url} target="_blank" rel="noreferrer">
                  Official guidelines <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              ) : null}
            </div>
            {scheme.catalog_checked_on && scheme.catalog_source_url ? (
              <a className="w-fit text-xs text-slate-600 underline underline-offset-2" href={scheme.catalog_source_url} target="_blank" rel="noreferrer">
                Source checked <time dateTime={scheme.catalog_checked_on}>{formatDate(scheme.catalog_checked_on)}</time>
              </a>
            ) : null}
          </li>)}
        </ul>
        </>
      )}
      {applicationError && <p className="workflow-error" role="alert">{applicationError}</p>}
    </section>
    <section className="workflow-card">
      <h2>More scholarships</h2>
      <p>Check the portal for state schemes and the latest application dates.</p>
      <a className="back-link" href={nspCatalog} target="_blank" rel="noreferrer">
        Browse the National Scholarship Portal <ArrowUpRight size={16} aria-hidden="true" />
      </a>
    </section>
  </div>;
};
