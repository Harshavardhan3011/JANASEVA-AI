import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { AuthLayout } from './layouts/AuthLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { AppLayout } from './layouts/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
const MySchemesPage=lazy(()=>import('./pages/MySchemesPage').then(module=>({default:module.MySchemesPage})));
import { DashboardPage } from './pages/DashboardPage';
import { SchemesPage } from './pages/SchemesPage';
import { SchemeMonitorPage } from './pages/SchemeMonitorPage';
import { SchemeLayout } from './layouts/SchemeLayout';
import { SchemeDetailPage } from './pages/SchemeDetailPage';
const SchemeAdminPage=lazy(()=>import('./pages/SchemeAdminPage').then(module=>({default:module.SchemeAdminPage})));
import { AssistantPage } from './pages/AssistantPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { ApplicationsListPage } from './pages/ApplicationsListPage';
import { ApplicationReviewPage } from './pages/ApplicationReviewPage';
import { BrowserMonitorPage } from './pages/BrowserMonitorPage';
import { TrackingPage } from './pages/TrackingPage';

export const App: React.FC = () => {
  return (
    <Routes>
      {/* Public Landing */}
      <Route path="/" element={<LandingPage />} />
      <Route element={<SchemeLayout />}>
        <Route path="/schemes" element={<SchemesPage />} />
        <Route path="/schemes/:id" element={<SchemeDetailPage />} />
        <Route path="/assistant" element={<AssistantPage />} />
      </Route>

      {/* Auth Routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* Protected Citizen Workspace */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/my-schemes" element={<Suspense fallback={<p role="status">Loading your schemes…</p>}><MySchemesPage /></Suspense>} />
          <Route path="/schemes/monitor" element={<SchemeMonitorPage />} />
          <Route path="/schemes/admin" element={<Suspense fallback={<p role="status">Loading administration…</p>}><SchemeAdminPage /></Suspense>} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/applications" element={<ApplicationsListPage />} />
          <Route path="/applications/:id" element={<ApplicationReviewPage />} />
          <Route path="/applications/:id/monitor" element={<BrowserMonitorPage />} />
          <Route path="/tracking" element={<TrackingPage />} />
          <Route path="/tracking/:id" element={<TrackingPage />} />
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
