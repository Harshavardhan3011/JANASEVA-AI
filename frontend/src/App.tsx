import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { EmailAuthPage } from './pages/EmailAuthPage';
import { AuthLayout } from './layouts/AuthLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { AppLayout } from './layouts/AppLayout';
import { PersonalLayout } from './layouts/PersonalLayout';
import { AdminLayout } from './layouts/AdminLayout';
import { useAuth } from './hooks/useAuth';
const AdminOverview=lazy(()=>import('./pages/AdminPages').then(module=>({default:module.AdminOverview})));
const AdminSchemes=lazy(()=>import('./pages/AdminPages').then(module=>({default:module.AdminSchemes})));
const AdminReview=lazy(()=>import('./pages/AdminPages').then(module=>({default:module.AdminReview})));
const AdminDiscovery=lazy(()=>import('./pages/AdminPages').then(module=>({default:module.AdminDiscovery})));
const AdminUsers=lazy(()=>import('./pages/AdminPages').then(module=>({default:module.AdminUsers})));
const AdminAudit=lazy(()=>import('./pages/AdminPages').then(module=>({default:module.AdminAudit})));
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
import { CitizenDraftsPage } from './pages/CitizenDraftsPage';

function LegacyAsk() {const location=useLocation();return <Navigate to={'/ask'+location.search+location.hash} replace/>;}

export const App: React.FC = () => {
  const {user}=useAuth();
  return (
    <Routes key={user?.id || 'visitor'}>
      {/* Public Landing */}
      <Route path="/" element={<LandingPage />} />
      <Route element={<SchemeLayout />}>
        <Route path="/schemes" element={<SchemesPage />} />
        <Route path="/schemes/:id" element={<SchemeDetailPage />} />
        <Route path="/ask" element={<AssistantPage />} />
        <Route path="/assistant" element={<LegacyAsk/>} />
      </Route>

      {/* Auth Routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        {['/check-email','/verify-email','/forgot-password','/reset-password','/accept-invitation'].map(path=><Route key={path} path={path} element={<EmailAuthPage key={path}/>}/>)}
      </Route>

      {/* Protected Citizen Workspace */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<PersonalLayout/>}>
            <Route index element={<DashboardPage/>}/>
            <Route path="saved" element={<DashboardPage key="saved" view="saved"/>}/>
            <Route path="checklists" element={<DashboardPage key="checklists" view="checklists"/>}/>
            <Route path="profile" element={<DashboardPage key="profile" view="profile"/>}/>
            <Route path="notices" element={<SchemeMonitorPage/>}/>
            <Route path="drafts" element={<CitizenDraftsPage/>}/>
            <Route path="drafts/:id" element={<CitizenDraftsPage/>}/>
          </Route>
          <Route path="/my-schemes" element={<Suspense fallback={<p role="status">Loading your schemes…</p>}><MySchemesPage /></Suspense>} />
          <Route path="/schemes/monitor" element={<Navigate to={user?.is_admin?'/admin/review/notices':'/dashboard/notices'} replace/>}/>
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/applications" element={<ApplicationsListPage />} />
          <Route path="/applications/:id" element={<ApplicationReviewPage />} />
          <Route path="/applications/:id/monitor" element={<BrowserMonitorPage />} />
          <Route path="/tracking" element={<TrackingPage />} />
          <Route path="/tracking/:id" element={<TrackingPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute admin/>}>
        <Route element={<AppLayout/>}>
          <Route path="/admin" element={<AdminLayout/>}>
            <Route index element={<AdminOverview/>}/>
            <Route path="schemes" element={<AdminSchemes/>}/>
            <Route path="review" element={<AdminReview/>}/>
            <Route path="review/notices" element={<SchemeMonitorPage/>}/>
            <Route path="sources" element={<Suspense fallback={<p role="status">Loading sources…</p>}><SchemeAdminPage section="sources"/></Suspense>}/>
            <Route path="discovery" element={<AdminDiscovery/>}/>
            <Route path="users" element={<AdminUsers/>}/>
            <Route path="audit" element={<AdminAudit/>}/>
            <Route path="*" element={<p>Administration page not found. Choose a page above.</p>}/>
          </Route>
          <Route path="/schemes/admin" element={<Navigate to="/admin/schemes" replace/>}/>
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
