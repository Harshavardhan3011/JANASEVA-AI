import { Suspense } from 'react';
import { NavLink,Outlet } from 'react-router-dom';
export function AdminLayout() {
  return <><nav aria-label="Administration" className="mb-6 flex flex-wrap gap-3">
    {[['','Overview'],['/review','Review'],['/discovery','Discovery'],['/schemes','Schemes'],['/sources','Sources'],['/users','Users'],['/audit','Audit']].map(([path,label])=>
      <NavLink key={path} end to={'/admin'+path} className={({isActive})=>'rounded-lg border px-3 py-2 text-sm '+(isActive?'bg-blue-50 font-bold text-blue-800':'bg-white')}>{label}</NavLink>)}
  </nav><Suspense fallback={<p role="status">Loading administration…</p>}><Outlet/></Suspense></>;
}
