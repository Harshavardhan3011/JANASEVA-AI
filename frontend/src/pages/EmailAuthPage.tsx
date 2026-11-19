import { useEffect,useState } from 'react';
import { Link,useLocation,useSearchParams,useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { safeDestination } from '../services/authDestination';
import { errorMessage } from '../services/workflow';

export function EmailAuthPage() {
 const location=useLocation();
 const navigate=useNavigate();
 const [params]=useSearchParams();
 const mode=location.pathname;
 const [token]=useState(()=>new URLSearchParams(location.hash.slice(1)).get('token') || params.get('token') || '');
 const [email,setEmail]=useState(params.get('email') || '');
 const [password,setPassword]=useState('');
 const [confirmation,setConfirmation]=useState('');
 const [cooldown,setCooldown]=useState<number>(mode==='/check-email'?(location.state?.cooldown ?? 60):0);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [done,setDone]=useState(false);
 const [message,setMessage]=useState('');
 const destination=safeDestination(params.get('next') || localStorage.getItem('janaseva_auth_next'));
 useEffect(()=>{
   if (location.hash || params.has('token')) window.history.replaceState(null,'',location.pathname);
   if (mode==='/check-email') localStorage.setItem('janaseva_auth_next',destination);
 },[location.hash,location.pathname,mode,params,destination]);
 useEffect(()=>{
   if (!cooldown) return;
   const timer=window.setInterval(()=>setCooldown(value=>Math.max(0,value-1)),1000);
   return ()=>clearInterval(timer);
 },[cooldown]);
 const confirm=mode==='/verify-email' || mode==='/reset-password' || mode==='/accept-invitation';
 const needsPassword=mode==='/reset-password' || mode==='/accept-invitation';
 const title=mode==='/check-email'?'Check your email':mode==='/forgot-password'?'Forgot password?':mode==='/reset-password'?'Choose a new password':mode==='/accept-invitation'?'Accept administrator invitation':'Confirm your email';
 async function submit() {
   setBusy(true);setError('');setMessage('');
   try {
     if (confirm) {
       if (!token) throw new Error('This link is incomplete. Request a new email.');
       if (needsPassword && password!==confirmation) throw new Error('Passwords do not match.');
       const path=mode==='/verify-email'?'verify-email':mode==='/reset-password'?'reset-password':'accept-invitation';
       await api.post('/auth/'+path,{token,...(needsPassword?{password,confirmation}:{})});
       if (mode==='/reset-password') {navigate('/login',{replace:true,state:{message:'Your password has been reset. Log in with your new password.'}});return;}
       setDone(true);
       setMessage('Your email is verified. You can now log in.');
     } else {
       const path=mode==='/check-email'?'resend-verification':'forgot-password';
       const {data}=await api.post('/auth/'+path,{email});
       setCooldown(data.data.cooldown || 60);setMessage(data.data.message);
     }
   } catch(err) {setError(err instanceof Error && !('response' in err)?err.message:errorMessage(err));}
   finally {setBusy(false);}
 }
 return <div className="space-y-4">
   <h1 className="text-xl font-bold">{title}</h1>
   {mode==='/check-email' && <p>Your account is pending verification. Open the email and confirm on the website. If it has not arrived, check spam or resend after the cooldown.</p>}
   {location.state?.deliveryFailed && <p role="alert">We could not send the verification email. Your pending account is saved. Try resending after the cooldown.</p>}
   {error && <p role="alert" className="text-red-700">{error}</p>}
   {message && <p role="status">{message}</p>}
   {!done && <form className="grid gap-3" onSubmit={event=>{event.preventDefault();void submit();}}>
     {!confirm && <label className="grid gap-2">Email address<input type="email" autoComplete="email" required maxLength={250} value={email} onChange={event=>setEmail(event.target.value)}/></label>}
     {needsPassword && <><label className="grid gap-2">New password<input type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={event=>setPassword(event.target.value)}/></label>
       <label className="grid gap-2">Confirm new password<input type="password" autoComplete="new-password" required value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></label></>}
     <button className="primary-action" disabled={busy || (!confirm && cooldown>0)}>{busy?'Please wait…':confirm?'Confirm':mode==='/check-email'?'Resend verification email':'Send reset link'}</button>
     {!confirm && cooldown>0 && <p role="status">You can request another email in {cooldown} seconds.</p>}
   </form>}
   <div className="grid gap-2">
     <Link className="underline" to={'/login?next='+encodeURIComponent(destination)}>Back to log in</Link>
     {mode==='/accept-invitation' && !done && <p>For a fresh invitation, contact the administrator who invited you.</p>}
     {confirm && !done && mode!=='/accept-invitation' && <Link className="underline" to={mode==='/verify-email'?'/check-email':'/forgot-password'}>Request a fresh link</Link>}
   </div>
 </div>;
}
