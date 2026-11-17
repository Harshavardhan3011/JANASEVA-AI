import { Router } from 'express';
import { queryPolicy, getPolicyDocuments } from './policy.controller';

import { ingestPolicyDocument } from './policy-ingestion';
const router = Router();

router.post('/query', queryPolicy);
router.get('/documents', getPolicyDocuments);

router.post('/documents/ingest', ingestPolicyDocument);
export default router;
