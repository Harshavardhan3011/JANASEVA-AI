import { Outlet } from 'react-router-dom';
import { SiteHeader } from '../components/SiteHeader';

export function SchemeLayout() {
  return <div className="h-dvh flex flex-col overflow-hidden bg-slate-50">
    <SiteHeader />
    <main className="civic-shell flex-1 min-h-0 overflow-y-auto py-5 sm:py-8"><Outlet /></main>
  </div>;
}
