import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { getHistory } from '../tracking/tracking.controller';
import { startBrowserExecution,getBrowserStatus,getBrowserScreenshot } from './browser.controller';

const router = Router();
router.use(authMiddleware);
router.post('/:applicationId/start',startBrowserExecution);
router.get('/:applicationId/status',getBrowserStatus);
router.get('/:applicationId/events',getHistory);
router.get('/:applicationId/screenshot',getBrowserScreenshot);
export default router;
