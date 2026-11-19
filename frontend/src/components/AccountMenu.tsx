import { Link,useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
export function AccountMenu() {
 const {user,logout}=useAuth();
 const navigate=useNavigate();
 if (!user) return <Link className="secondary-action" to="/login">Log in</Link>;
 return <details className="relative">
   <summary className="cursor-pointer font-semibold">My account</summary>
   <div className="absolute right-0 z-50 grid min-w-40 gap-3 rounded-lg border bg-white p-4 shadow-lg">
     <Link to="/dashboard">My dashboard</Link>
     {user.is_admin && <Link to="/admin">Admin dashboard</Link>}
     <button className="text-left" onClick={async()=>{await logout();navigate('/');}}>Log out</button>
   </div>
 </details>;
}
