import { useState } from 'react';
import { Link,useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, CalendarDays, ChevronRight, ClipboardCheck, Globe2, Landmark, Search, ShieldCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export const LandingPage = () => {
  const { user } = useAuth();
  const navigate=useNavigate();
  const [query,setQuery]=useState('');
  return <div className="civic-landing">
    <header className="civic-header"><div className="civic-shell civic-nav">
      <Link className="civic-brand" to="/"><span><Landmark size={22}/></span><strong>JANASEVA<span> AI</span></strong></Link>
      <nav aria-label="Main navigation"><Link to="/schemes">Explore Schemes</Link><Link to="/assistant">Ask AI</Link><Link to="/dashboard">Dashboard</Link></nav>
      <div className="civic-nav-actions"><Link to={user ? '/dashboard' : '/login'}>{user ? 'Dashboard' : 'Sign in'}</Link>{!user && <Link className="primary-action" to="/register">Create account <ArrowUpRight size={15}/></Link>}</div>
    </div></header>
    <main>
      <section className="civic-hero"><div className="civic-shell civic-hero-grid">
        <div className="civic-hero-copy">
          <h1>Find government schemes <em>that could help you.</em></h1>
          <p>Discover government schemes and official notices. See who can apply, what support is available and when applications close.</p>
          <form className="grid gap-3 py-4" onSubmit={event=>{event.preventDefault();navigate('/schemes?q='+encodeURIComponent(query));}}>
            <label className="grid gap-2">What support are you looking for?<input placeholder="Search schemes or ask a question" maxLength={1500} value={query} onChange={event=>setQuery(event.target.value)}/></label>
            <div className="inline-actions"><button className="primary-action">Find a scheme</button><Link className="secondary-action" to={'/assistant?q='+encodeURIComponent(query)}>Ask JANASEVA AI</Link></div>
          </form>
          <div className="hero-actions"><Link className="primary-action" to="/schemes">Browse schemes <ArrowRight size={18}/></Link><a href="#how-it-works" className="secondary-action">See how it works</a></div>
          <span className="hero-note"><ShieldCheck size={17}/> Current catalog coverage starts in India.</span>
        </div>
        <div className="hero-board">
          <div className="board-inner"><div className="board-header"><span className="board-icon"><Landmark size={27}/></span><div><strong>Government schemes</strong><small>Local, state and national programs</small></div></div>
          <ol className="board-steps">
            <li><span><Search size={17}/></span><div><strong>Find relevant schemes</strong><small>Search by category and location</small></div><ChevronRight size={16}/></li>
            <li><span><ClipboardCheck size={17}/></span><div><strong>See who can apply</strong><small>Review benefits, eligibility and documents</small></div><ChevronRight size={16}/></li>
            <li><span><CalendarDays size={17}/></span><div><strong>Check application dates</strong><small>Read deadlines and official notices</small></div><ChevronRight size={16}/></li>
          </ol>
          <div className="board-foot"><ShieldCheck size={15}/> Follow links to official sources</div></div>
        </div>
      </div></section>
      <section id="how-it-works" className="civic-how"><div className="civic-shell"><div className="section-heading"><div><h2>How it works</h2></div></div>
        <div className="how-grid">{[
          { icon:Globe2,title:'Look beyond one portal',copy:'Explore published schemes from different government departments in one catalog.' },
          { icon:CalendarDays,title:'Find important updates',copy:'Check a scheme’s status and any published application or renewal dates.' },
          { icon:ShieldCheck,title:'Read the original notice',copy:'Open the source on the issuing authority’s website and use its application link when available.' },
        ].map(item => <article key={item.title}><item.icon size={25}/><h3>{item.title}</h3><p>{item.copy}</p></article>)}</div>
      </div></section>
    </main>
    <footer className="civic-footer"><div className="civic-shell"><strong>JANASEVA AI</strong><span>Government scheme discovery</span><Link to="/schemes">Scheme catalog <ArrowRight size={14}/></Link></div></footer>
  </div>;
};
