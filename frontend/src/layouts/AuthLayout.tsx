import { Outlet } from 'react-router-dom';
import { SiteHeader } from '../components/SiteHeader';

export function AuthLayout() {
  return <div className="min-h-dvh bg-slate-50 flex flex-col">
    <SiteHeader />
    <main className="flex-1 w-full px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md">
        <p className="mb-6 text-center text-sm text-slate-600">Government schemes and official notices</p>
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-xl sm:px-10"><Outlet /></div>
      </div>
    </main>
  </div>;
}
