import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react';

const registerSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    preferred_language: z.enum(['en', 'te']),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export const RegisterPage: React.FC = () => {
  const { register: registerAuth } = useAuth();
  const navigate = useNavigate();
  const [params]=useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      preferred_language: 'en',
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    try {
      setServerError(null);
      const result=await registerAuth(data.name, data.email, data.password, data.preferred_language);
      navigate('/check-email?email='+encodeURIComponent(data.email.trim().toLowerCase())+'&next='+encodeURIComponent(params.get('next') || '/dashboard'),{state:{cooldown:result.cooldown,deliveryFailed:!result.sent}});
    } catch (err: any) {
      setServerError(err.message || 'Registration failed. Please try again.');
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900 mb-6 text-center">
        Create Citizen Account
      </h2>

      {serverError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-start space-x-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Full Name</label>
          <input
            type="text"
            {...register('name')}
            placeholder="Kavitha Reddy"
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Email Address</label>
          <input
            type="email"
            {...register('email')}
            placeholder="kavitha@example.com"
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Password (min 8 chars)</label>
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

        <div>
          <label className="block text-sm font-medium text-slate-700">Confirm Password</label>
          <input
            type="password"
            {...register('confirmPassword')}
            placeholder="••••••••"
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {errors.confirmPassword && (
            <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Preferred Language</label>
          <select
            {...register('preferred_language')}
            className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="en">English</option>
            <option value="te">తెలుగు (Telugu)</option>
          </select>
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
              <span>Create Account</span>
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-slate-600">
        Already registered?{' '}
        <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
          Sign in
        </Link>
      </div>
    </div>
  );
};
