import app from './app';
import { closeDatabase } from './config/db';
import { env,root } from './config/env';
import { scheduleMonitor } from './modules/monitor/monitor.job';
import { scheduleCatalog } from './modules/catalog/catalog.job';
import { join } from 'node:path';
import { checkAuthMail } from './modules/auth/auth.mail';

if (env.SCHEME_SYNC_WORKER) throw new Error('Use the scheduled sync command in worker mode.');

if (env.NODE_ENV === 'production' && new URL(env.MOCK_PORTAL_URL).hostname === '127.0.0.1') {
  const portal = require(join(root,'mock-portal','server.js'));
  portal.listen(Number(new URL(env.MOCK_PORTAL_URL).port || 80),'127.0.0.1');
}

const server = app.listen(env.PORT, env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`JANASEVA AI API listening on port ${env.PORT}`);
  if (env.NODE_ENV==='production') void checkAuthMail().then(status=>console.info('Auth SMTP check',status))
    .catch(()=>console.warn('Auth SMTP check unavailable'));
});
const stopMonitor=scheduleMonitor();
const stopCatalog=scheduleCatalog();
for (const signal of ['SIGINT','SIGTERM'] as const) {
  process.on(signal,()=>server.close(()=>{ void Promise.all([stopMonitor(),stopCatalog()]).then(closeDatabase).finally(()=>process.exit(0)); }));
}
