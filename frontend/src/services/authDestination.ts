export function safeDestination(value:string|null, fallback='/dashboard',isAdmin=false) {
 if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x1f]/.test(value)) return fallback;
 try {
   const url=new URL(value,'https://janaseva.invalid');
   if (url.origin!=='https://janaseva.invalid' || /^\/(login|register|verify-email|check-email|reset-password|forgot-password|accept-invitation)/.test(url.pathname)) return fallback;
   if (/^\/(admin(?:\/|$)|schemes\/(admin|monitor)(?:\/|$))/.test(url.pathname) && !isAdmin) return fallback;
   if (!/^\/(?:$|schemes(?:\/|$)|ask(?:\/|$)|assistant(?:\/|$)|dashboard(?:\/|$)|my-schemes(?:\/|$)|applications(?:\/|$)|documents(?:\/|$)|tracking(?:\/|$)|admin(?:\/|$))/.test(url.pathname)) return fallback;
   return url.pathname+url.search+url.hash;
 } catch {return fallback;}
}
