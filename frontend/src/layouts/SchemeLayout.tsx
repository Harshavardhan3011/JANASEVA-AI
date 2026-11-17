import { Link,Outlet } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { useAuth } from '../hooks/useAuth';

export const SchemeLayout=()=>{
  const { user }=useAuth();
  if (user) return <AppLayout/>;
  return <div className="min-h-screen bg-slate-50">
    <header className="border-b border-slate-200 bg-white">
      <nav className="civic-shell flex flex-wrap items-center gap-4 py-4">
        <Link to="/" className="font-extrabold text-slate-900">JANASEVA AI</Link>
        <Link to="/schemes" className="ml-auto text-sm font-semibold">Schemes</Link>
        <Link to="/login" className="secondary-action">Sign in</Link>
      </nav>
    </header>
    <main className="civic-shell py-5 sm:py-8"><Outlet/></main>
  </div>;
};
