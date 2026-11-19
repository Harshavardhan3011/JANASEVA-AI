import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { requestIdMiddleware } from './middleware/requestId';
import { errorHandler } from './middleware/errorHandler';

// Route Imports
import authRoutes from './modules/auth/auth.routes';
import healthRoutes from './modules/health/health.routes';
import schemesRoutes from './modules/schemes/schemes.routes';
import policyRoutes from './modules/policy/policy.routes';
import eligibilityRoutes from './modules/eligibility/eligibility.routes';
import applicationsRoutes from './modules/applications/applications.routes';
import browserRoutes from './modules/browser/browser.routes';
import trackingRoutes from './modules/tracking/tracking.routes';
import assistantRoutes from './modules/assistant/assistant.routes';
import documentsRoutes from './modules/documents/documents.routes';
import monitorRoutes from './modules/monitor/monitor.routes';
import citizenRoutes from './modules/citizen/citizen.routes';
import catalogAdmin from './modules/catalog/catalog.admin';
import dashboardAdmin from './modules/catalog/dashboard.admin';

const app: Application = express();
if (env.TRUST_PROXY_HOPS) app.set('trust proxy',env.TRUST_PROXY_HOPS);

// Security & Parsing Middleware
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: [env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  })
);
app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestIdMiddleware);

app.use(['/api/v1/auth/login', '/api/v1/auth/register'], rateLimit({ windowMs: 60000, limit: 15 }));

// Mount REST API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/schemes', schemesRoutes);
app.use('/api/v1/policy', policyRoutes);
app.use('/api/v1/eligibility', eligibilityRoutes);
app.use('/api/v1/applications', applicationsRoutes);
app.use('/api/v1/browser', browserRoutes);
app.use('/api/v1/tracking', trackingRoutes);
app.use('/api/v1/assistant', assistantRoutes);
app.use('/api/v1/documents', documentsRoutes);
app.use('/api/v1/scheme-monitor', monitorRoutes);
app.use('/api/v1/scheme-catalog-admin',catalogAdmin);
app.use('/api/v1/admin',dashboardAdmin);
app.use('/api/v1/citizen-schemes',citizenRoutes);
app.use('/api/v1', healthRoutes);

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`,
    },
  });
});

// Centralized Error Handler
app.use(errorHandler);

export default app;
