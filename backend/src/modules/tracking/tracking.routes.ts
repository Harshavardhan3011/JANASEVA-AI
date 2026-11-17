import { Router } from 'express';
import { getTracking, getHistory } from './tracking.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/:applicationId', getTracking);
router.get('/:applicationId/history', getHistory);

export default router;
