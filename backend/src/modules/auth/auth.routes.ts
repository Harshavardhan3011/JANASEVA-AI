import rateLimit from 'express-rate-limit';
import { Router } from 'express';
import { register, login, getMe, logout, resendVerification, confirmVerification, forgotPassword, resetPassword, inviteAdmin, acceptAdminInvitation } from './auth.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();
router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});

const emailRequests=rateLimit({windowMs:3600000,limit:20});
const tokenAttempts=rateLimit({windowMs:900000,limit:20});
router.post('/register', emailRequests, register);
router.post('/resend-verification',emailRequests,resendVerification);
router.post('/verify-email',tokenAttempts,confirmVerification);
router.post('/forgot-password',emailRequests,forgotPassword);
router.post('/reset-password',tokenAttempts,resetPassword);
router.post('/admin-invitations',authMiddleware,emailRequests,inviteAdmin);
router.post('/accept-invitation',tokenAttempts,acceptAdminInvitation);
router.post('/login', login);
router.get('/me', authMiddleware, getMe);
router.post('/logout', authMiddleware, logout);

export default router;
