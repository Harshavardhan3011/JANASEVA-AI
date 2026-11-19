import { AccountMenu } from '../components/AccountMenu';
import { Link,Outlet } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { useAuth } from '../hooks/useAuth';

export const SchemeLayout=()=>{
  const { user }=useAuth();
  if (user) return <AppLayout/>;
  return <div className="h-dvh flex flex-col overflow-hidden bg-slate-50">
    <header className="shrink-0 border-b border-slate-200 bg-white">
      <nav className="civic-shell flex flex-wrap items-center gap-4 py-4">
        <Link to="/" className="font-extrabold text-slate-900">JANASEVA AI</Link>
        <Link to="/schemes" className="ml-auto text-sm font-semibold">Explore Schemes</Link>
        <Link to="/ask" className="text-sm font-semibold">Ask AI</Link>
        <Link to="/dashboard" className="text-sm font-semibold">Dashboard</Link>
        <AccountMenu/>
      </nav>
    </header>
    <main className="civic-shell flex-1 min-h-0 overflow-y-auto py-5 sm:py-8"><Outlet/></main>
  </div>;
};
