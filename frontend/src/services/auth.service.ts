import { api } from './api';
import { User, ApiResponse } from '../types';

export class VerificationRequiredError extends Error {
 constructor(public email:string,public cooldown=60) {super('Verify your email to continue.');}
}
export interface VerificationResponse {verification_required:true;email:string;sent:boolean;cooldown:number}
export interface AuthResponseData {
  verification_required?:boolean;
  email?:string;
  cooldown?:number;
  user: User;
  token: string;
}

export const authService = {
  async register(name: string, email: string, password: string, preferred_language = 'en') {
    const response = await api.post<ApiResponse<VerificationResponse>>('/auth/register', {
      name,
      email,
      password,
      preferred_language,
    });
    return response.data;
  },

  async login(email: string, password: string) {
    const response = await api.post<ApiResponse<AuthResponseData>>('/auth/login', {
      email,
      password,
    });
    return response.data;
  },

  async getMe() {
    const response = await api.get<ApiResponse<{ user: User }>>('/auth/me');
    return response.data;
  },

  async logout() {
    try {
      await api.post('/auth/logout');
    } finally {
      localStorage.removeItem('janaseva_token');
      localStorage.removeItem('janaseva_user');
    }
  },
};
