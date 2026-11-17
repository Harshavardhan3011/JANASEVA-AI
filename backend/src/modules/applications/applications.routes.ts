import { Router } from 'express';
import {
  createApplication,
  getApplications,
  getApplicationById,
  prepareApplication,
  approvePreparation,
  approveSubmission,
  cancelApplication,
} from './applications.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.post('/', createApplication);
router.get('/', getApplications);
router.get('/:id', getApplicationById);
router.post('/:id/prepare', prepareApplication);
router.post('/:id/approve-preparation', approvePreparation);
router.post('/:id/approve-submission', approveSubmission);
router.post('/:id/cancel', cancelApplication);

export default router;
