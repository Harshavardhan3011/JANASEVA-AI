import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Check, ChevronRight, ClipboardCheck, FileText, GraduationCap, Landmark, LockKeyhole, MessageCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const guide = 'https://scholarships.gov.in/public/schemeGuidelines/CSSS_GUIDLINES_07022024_updated.pdf';
export const LandingPage = () => {
  const { user } = useAuth();
  const start = user ? '/assistant' : '/register';
  return <div className="civic-landing">
    <header className="civic-header"><div className="civic-shell civic-nav">
      <Link className="civic-brand" to="/"><span><Landmark size={22}/></span><strong>JANASEVA<span> AI</span></strong></Link>
      <nav aria-label="Main navigation"><a href="#scholarships">Scholarships</a><a href="#how-it-works">How it works</a></nav>
      <div className="civic-nav-actions"><Link to={user ? '/dashboard' : '/login'}>{user ? 'Dashboard' : 'Sign in'}</Link><Link className="primary-action" to={start}>Get started <ArrowUpRight size={15}/></Link></div>
    </div></header>
    <main>
      <section className="civic-hero"><div className="civic-shell civic-hero-grid">
        <div className="civic-hero-copy">
          <div className="civic-kicker"><span/> CITIZEN SERVICES</div>
          <h1>A clearer path to your <em>college scholarship.</em></h1>
          <p>Find the scheme, understand the rules and prepare your application in one guided workspace.</p>
          <div className="hero-actions"><Link className="primary-action" to={start}>Start an application <ArrowRight size={18}/></Link><a href="#how-it-works" className="secondary-action">See how it works</a></div>
          <span className="hero-note"><ShieldCheck size={17}/> You approve every step that uses the demo portal.</span>
        </div>
        <div className="hero-board">
          <div className="board-inner"><div className="board-header"><span className="board-icon"><GraduationCap size={27}/></span><div><strong>Scholarship application</strong><small>PM-USP CSSS · Fresh applicant</small></div></div>
          <p className="board-label">APPLICATION JOURNEY</p>
          <ol className="board-steps">
            <li><span><Check size={17}/></span><div><strong>Discover the scheme</strong><small>Explore official Ministry guidelines</small></div><ChevronRight size={16}/></li>
            <li><span><ClipboardCheck size={17}/></span><div><strong>Check your eligibility</strong><small>Review income, enrollment and board percentile</small></div><ChevronRight size={16}/></li>
            <li><span><FileText size={17}/></span><div><strong>Prepare your documents</strong><small>Review the details before you approve</small></div><ChevronRight size={16}/></li>
          </ol>
          <div className="board-foot"><LockKeyhole size={15}/> Your documents stay in your workspace</div></div>
        </div>
      </div></section>
      <section id="scholarships" className="civic-schemes"><div className="civic-shell">
        <div className="section-heading"><div><h2>Explore the supported scholarship</h2><p>Start with a fresh application for college or university study.</p></div></div>
        <article className="scheme-feature"><span className="scheme-icon"><GraduationCap size={27}/></span><div><small>MINISTRY OF EDUCATION</small>
          <h3>PM-USP Central Sector Scholarship</h3><p>For eligible students enrolled in regular degree courses at recognized institutions.</p></div>
          <a className="secondary-action" href={guide} target="_blank" rel="noreferrer">Official guidelines <ArrowUpRight size={16}/></a></article>
      </div></section>
      <section id="how-it-works" className="civic-how"><div className="civic-shell"><div className="section-heading"><div><h2>How it works</h2></div></div>
        <div className="how-grid">{[
          { icon:MessageCircle,title:'Ask in your own words',copy:'Get scheme information alongside the Ministry sources it comes from.' },
          { icon:FileText,title:'Review your evidence',copy:'Check the published criteria and review extracted details from your documents.' },
          { icon:ShieldCheck,title:'Approve the demo',copy:'Authorize form filling, review the result, then approve the mock submission.' },
        ].map(item => <article key={item.title}><item.icon size={25}/><h3>{item.title}</h3><p>{item.copy}</p></article>)}</div>
      </div></section>
    </main>
    <footer className="civic-footer"><div className="civic-shell"><strong>JANASEVA AI</strong><span>Civic technology demonstration</span><a href="https://scholarships.gov.in/" target="_blank" rel="noreferrer">National Scholarship Portal <ArrowUpRight size={14}/></a></div></footer>
  </div>;
};
