import { Router } from 'express';
import { register, login, getMe, logout } from './auth.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authMiddleware, getMe);
router.post('/logout', authMiddleware, logout);

export default router;
