import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

export const AuthLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link to="/" className="inline-flex items-center space-x-2">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-slate-900">JANASEVA AI</span>
        </Link>
        <p className="mt-2 text-sm text-slate-600">
          Government schemes and official notices
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 sm:rounded-xl sm:px-10">
          <Outlet />
        </div>
      </div>
    </div>
  );
};
