import { Router } from 'express';
import { evaluate, getApplicationEligibility } from './eligibility.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

router.post('/evaluate', evaluate);
router.get('/:applicationId', authMiddleware, getApplicationEligibility);

export default router;
