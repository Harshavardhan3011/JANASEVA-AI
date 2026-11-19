import { NavLink,Outlet } from 'react-router-dom';
export function PersonalLayout() {
  return <><nav aria-label="Personal dashboard" className="mb-6 flex flex-wrap gap-3">
    {[['','Overview'],['/saved','Saved schemes'],['/checklists','Checklists'],['/profile','Preferences']].map(([path,label])=>
      <NavLink key={path} end to={'/dashboard'+path} className={({isActive})=>'rounded-lg border px-3 py-2 text-sm '+(isActive?'bg-blue-50 font-bold text-blue-800':'bg-white')}>{label}</NavLink>)}
  </nav><Outlet/></>;
}
