import { Request,Response,NextFunction } from 'express';
import { AppError } from '../shared/errors';
export async function requireSchemeReviewer(_req:Request,res:Response,next:NextFunction) {
 if (!res.locals.isAdmin) throw AppError.forbidden('Administrator sign-in required.');
 next();
}
