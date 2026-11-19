import { safeDestination } from '../services/authDestination';
import { VerificationRequiredError } from '../services/auth.service';
import { api } from '../services/api';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location=useLocation();
  const [params]=useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setServerError(null);
      await login(data.email, data.password);
      const sessionReply=await api.get('/auth/me');
      const isAdmin=Boolean(sessionReply.data.data.user?.is_admin);
      const destination=safeDestination(params.get('next') || localStorage.getItem('janaseva_auth_next'),isAdmin?'/admin':'/dashboard',isAdmin);
      navigate(isAdmin && destination==='/dashboard'?'/admin':destination);
      localStorage.removeItem('janaseva_auth_next');
    } catch (err: any) {
      if (err instanceof VerificationRequiredError) {navigate('/check-email?email='+encodeURIComponent(err.email)+'&next='+encodeURIComponent(safeDestination(params.get('next'))),{state:{cooldown:err.cooldown}});return;}
      setServerError(err.message || 'Login failed. Please verify your credentials.');
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900 mb-6 text-center">
        Sign in to your account
      </h2>

      {location.state?.message && <p role="status" className="mb-4 text-emerald-700">{location.state.message}</p>}
      {serverError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-start space-x-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Email Address</label>
          <input
            type="email"
            {...register('email')}
            placeholder="citizen@example.gov.in"
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Password</label>
          <input
            type="password"
            {...register('password')}
            placeholder="••••••••"
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <span>Sign In</span>
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </button>
      </form>

      <Link to="/forgot-password" className="mt-3 block text-sm text-blue-600">Forgot password?</Link>
      <div className="mt-6 text-center text-sm text-slate-600">
        Don&apos;t have an account?{' '}
        <Link to={"/register?next="+encodeURIComponent(safeDestination(params.get("next")))} className="font-medium text-blue-600 hover:text-blue-500">
          Create an account
        </Link>
      </div>
    </div>
  );
};
