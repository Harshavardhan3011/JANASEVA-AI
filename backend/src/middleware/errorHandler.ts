import { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../shared/errors';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId || 'unknown';

  if (err instanceof AppError) {
    if (err.retryAfterSeconds) res.set('Retry-After',String(err.retryAfterSeconds));
    console.error(`[${requestId}] AppError: ${err.code} - ${err.message}`);
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.retryAfterSeconds?{retryAfterSeconds:err.retryAfterSeconds}:{}),
      },
    });
    return;
  }

  if (err instanceof MulterError) {
    res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ success:false, error:{ code:err.code,message:'Upload one PDF, PNG or JPEG file up to 10 MB.' } });
    return;
  }
  if (err instanceof ZodError) {
    console.error(`[${requestId}] ValidationError:`, err.flatten());
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  console.error(`[${requestId}] Unhandled Error:`, err.message);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
