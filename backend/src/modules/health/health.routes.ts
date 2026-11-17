import { Router } from 'express';
import { database } from '../../config/db';

const router = Router();
router.get('/health',(_req,res) => res.json({ status:'ok',service:'JANASEVA AI' }));
router.get('/ready',async (_req,res) => {
  try {
    await (await database()).query('select 1 from public.schemes limit 1');
    res.json({ status:'ready',database:'connected' });
  } catch {
    res.status(503).json({ status:'not_ready',database:'unreachable' });
  }
});
export default router;
