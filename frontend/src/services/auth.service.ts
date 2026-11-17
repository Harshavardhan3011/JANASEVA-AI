import { api } from './api';
import { User, ApiResponse } from '../types';

export interface AuthResponseData {
  user: User;
  token: string;
}

export const authService = {
  async register(name: string, email: string, password: string, preferred_language = 'en') {
    const response = await api.post<ApiResponse<AuthResponseData>>('/auth/register', {
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
