import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

export const root = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });

export const env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.string().default(''),
  DATA_DIR: z.string().default(path.join(root, '.data')),
  SUPABASE_URL: z.string().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  STORAGE_BUCKET: z.string().default('documents'),
  POLICY_INGEST_KEY: z.string().refine(value => !value || value.length >= 32).default(''),
  SCHEME_MONITOR_KEY: z.string().refine(value => !value || value.length >= 32).default(''),
  SCHEME_MONITOR_ENABLED: z.enum(['true','false']).default('true').transform(value => value === 'true'),
  SCHEME_CATALOG_ENABLED: z.enum(['true','false']).default('true').transform(value => value==='true'),
  SCHEME_CATALOG_AUTO_PUBLISH: z.enum(['true','false']).default('true').transform(value => value==='true'),
  TAVILY_API_KEY: z.string().trim().default(''),
  SCHEME_SEARCH_API_KEY: z.string().trim().default(''),
  SCHEME_SYNC_WORKER: z.enum(['true','false']).default('false').transform(value=>value==='true'),
  LLM_PROVIDER: z.enum(['gemini', 'openai']).default('gemini'),
  LLM_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default(''),
  EMBEDDING_PROVIDER: z.enum(['gemini', 'openai']).default('gemini'),
  EMBEDDING_API_KEY: z.string().default(''),
  EMBEDDING_MODEL: z.string().default(''),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  SMTP_HOST: z.string().trim().default(''),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(['true','false']).default('false').transform(value=>value==='true'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default(''),
  APP_PUBLIC_URL: z.preprocess(value=>value===''?undefined:value,z.url().optional()),
  EMAIL_VERIFY_TTL_MINUTES: z.coerce.number().int().min(5).max(2880).default(60),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
  AUTH_EMAIL_COOLDOWN_SECONDS: z.coerce.number().int().min(30).max(3600).default(60),
  PENDING_REGISTRATION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  Adminmail: z.string().trim().default(''),
  AdminPass: z.string().default(''),
  JWT_SECRET: z.string().default(''),
  MOCK_PORTAL_URL: z.url().default('http://127.0.0.1:3002'),
  PORTAL_SECRET: z.string().default(''),
  BROWSER_CHANNEL: z.string().default(''),
  BROWSER_HEADLESS: z.enum(['true', 'false']).default('true').transform(value => value === 'true'),
  BROWSER_TIMEOUT: z.coerce.number().int().min(3000).max(60000).default(15000),
  OCR_LANG_PATH: z.string().default(''),
}).superRefine((config, ctx) => {
  if (config.SCHEME_SYNC_WORKER && !config.DATABASE_URL) {
    ctx.addIssue({code:'custom',message:'The standalone scheduler requires DATABASE_URL.'});
  }
  if (config.NODE_ENV === 'production' && !config.SCHEME_SYNC_WORKER &&
      (!config.DATABASE_URL || !config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY ||
       config.JWT_SECRET.length < 32 || config.PORTAL_SECRET.length < 32)) {
    ctx.addIssue({ code: 'custom', message: 'Production requires Supabase database and Storage credentials, JWT_SECRET and a private PORTAL_SECRET.' });
  }
}).parse(process.env);
