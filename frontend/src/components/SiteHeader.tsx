import { ArrowUpRight, Landmark, Menu } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useRef } from 'react';
import { AccountMenu } from './AccountMenu';
import { useAuth } from '../hooks/useAuth';

export function SiteHeader() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  const links = [
    { to: '/schemes', label: 'Explore Schemes' },
    { to: '/certificates', label: 'Certificates' },
    { to: '/ask', label: 'Ask AI' },
    { to: '/dashboard', label: 'Dashboard' },
    ...(user?.is_admin ? [{ to: '/admin', label: 'Administration' }] : []),
  ];
  const closeMenu = () => { if (mobileMenu.current) mobileMenu.current.open = false; };
  return <header className="civic-header site-header" onKeyDown={event => {
    if (event.key === 'Escape') {
      closeMenu();
      mobileMenu.current?.querySelector('summary')?.focus();
    }
  }}>
    <div className="civic-shell civic-nav">
      <Link className="civic-brand" to="/" aria-label="JANASEVA AI home" onClick={closeMenu}>
        <span><Landmark size={22} aria-hidden="true" /></span><strong>JANASEVA<span> AI</span></strong>
      </Link>
      <nav aria-label="Main navigation">{links.map(link => <NavLink key={link.to} to={link.to}>{link.label}</NavLink>)}</nav>
      <div className="civic-nav-actions">
        <AccountMenu key={(user?.id || 'visitor') + pathname} />
        {!user && <Link className="primary-action header-register" to="/register">Create account <ArrowUpRight size={15} aria-hidden="true" /></Link>}
        <details className="site-mobile-menu" ref={mobileMenu} key={pathname}>
          <summary aria-label="Toggle navigation"><Menu size={24} aria-hidden="true" /></summary>
          <nav aria-label="Mobile navigation">{links.map(link => <NavLink key={link.to} to={link.to} onClick={closeMenu}>{link.label}</NavLink>)}
            {!user && <Link to="/register" onClick={closeMenu}>Create account</Link>}
          </nav>
        </details>
      </div>
    </div>
  </header>;
}
