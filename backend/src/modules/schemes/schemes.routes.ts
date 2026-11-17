import { Router } from 'express';
import { getSchemes, getSchemeById, searchSchemes } from './schemes.controller';

const router = Router();

router.get('/', getSchemes);
router.get('/:id', getSchemeById);
router.post('/search', searchSchemes);

export default router;
