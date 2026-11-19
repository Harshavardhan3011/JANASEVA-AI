import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { authService, VerificationRequiredError, type VerificationResponse } from '../services/auth.service';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  verificationEmail: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, lang?: string) => Promise<VerificationResponse>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('janaseva_token');
  });
  const [verificationEmail,setVerificationEmail]=useState<string|null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('janaseva_token');
      if (storedToken) {
        try {
          const res = await authService.getMe();
          if (res.success && res.data?.user) {
            setUser(res.data.user);
            localStorage.setItem('janaseva_user', JSON.stringify(res.data.user));
          } else {
            setUser(null);
            setToken(null);
          }
        } catch (err) {
          if ((err as {response?:{data?:{error?:{code?:string}}}}).response?.data?.error?.code==='EMAIL_VERIFICATION_REQUIRED') {
            try {setVerificationEmail(JSON.parse(localStorage.getItem('janaseva_user') || '{}').email || '');} catch {setVerificationEmail('');}
          }
          // Token invalid
          setUser(null);
          setToken(null);
          localStorage.removeItem('janaseva_token');
          localStorage.removeItem('janaseva_user');
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setUser(null);setToken(null);setVerificationEmail(null);
    localStorage.removeItem('janaseva_user');localStorage.removeItem('janaseva_token');
    const res = await authService.login(email, password);
    if (res.data?.verification_required) throw new VerificationRequiredError(res.data.email || email,res.data.cooldown);
    if (res.success && res.data) {
      setUser(res.data.user);
      setToken(res.data.token);
      localStorage.setItem('janaseva_token', res.data.token);
      localStorage.setItem('janaseva_user', JSON.stringify(res.data.user));
    } else {
      throw new Error(res.error?.message || 'Login failed');
    }
  };

  const register = async (name: string, email: string, password: string, lang = 'en') => {
    const res = await authService.register(name,email,password,lang);
    if (!res.success || !res.data) throw new Error(res.error?.message || 'Registration failed');
    return res.data;
  };

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setToken(null);setVerificationEmail(null);
      localStorage.removeItem('janaseva_auth_next');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        verificationEmail,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
