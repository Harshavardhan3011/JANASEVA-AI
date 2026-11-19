import React from 'react';
import { Navigate, Outlet, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const ProtectedRoute: React.FC<{admin?:boolean}> = ({admin=false}) => {
  const location=useLocation();
  const { user, isAuthenticated, isLoading, verificationEmail } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-slate-600">Loading JANASEVA AI...</p>
        </div>
      </div>
    );
  }

  if (verificationEmail!==null) return <Navigate to={'/check-email?email='+encodeURIComponent(verificationEmail)+'&next='+encodeURIComponent(location.pathname+location.search)} replace/>;
  if (!isAuthenticated) {
    return <Navigate to={"/login?next="+encodeURIComponent(location.pathname+location.search)} replace />;
  }

  if (admin && !user?.is_admin) return <div className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-bold">Access denied</h1><p className="my-4">This area is available to authorized administrators.</p><Link className="primary-action" to="/dashboard">My dashboard</Link></div>;

  return <Outlet />;
};
