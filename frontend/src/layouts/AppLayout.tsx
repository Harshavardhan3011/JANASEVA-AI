import { Outlet } from 'react-router-dom';
import { SiteHeader } from '../components/SiteHeader';

export function AppLayout() {
  return <div className="h-dvh overflow-hidden bg-slate-50 flex flex-col">
    <SiteHeader />
    <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8"><Outlet /></main>
  </div>;
}
