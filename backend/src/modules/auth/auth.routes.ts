import rateLimit from 'express-rate-limit';
import { Router } from 'express';
import { register, login, getMe, logout, resendVerification, confirmVerification, forgotPassword, resetPassword, inviteAdmin, acceptAdminInvitation } from './auth.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();
router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});

const emailRequests=rateLimit({windowMs:3600000,limit:20,handler:(req,res)=>{
  const reset=(req as typeof req & {rateLimit?:{resetTime?:Date}}).rateLimit?.resetTime;
  const seconds=reset?Math.max(1,Math.ceil((reset.getTime()-Date.now())/1000)):3600;
  res.set('Retry-After',String(seconds)).status(429).json({success:false,error:{code:'RATE_LIMITED',
    message:'Too many email requests. Wait for the countdown before trying again.',retryAfterSeconds:seconds}});
}});
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
