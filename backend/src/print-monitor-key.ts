import { monitorSecret } from './config/secrets';
monitorSecret().then(key=>{
  if (!key) throw new Error('Set SCHEME_MONITOR_KEY in production.');
  console.log(key);
}).catch(error=>{console.error(error.message);process.exitCode=1;});
