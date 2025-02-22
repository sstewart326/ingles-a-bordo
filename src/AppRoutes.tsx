import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { Header } from './components/Header';
import Footer from './components/Footer';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Dashboard } from './pages/Dashboard';
import { Schedule } from './pages/Schedule';
import { Profile } from './pages/Profile';
import { AdminUsers } from './pages/AdminUsers';
import { AdminSchedule } from './pages/AdminSchedule';

// Lazy load components that use Firebase Storage
const ClassMaterials = lazy(() => import('./pages/ClassMaterials'));
const AdminMaterials = lazy(() => import('./pages/AdminMaterials'));

// Loading component
const LoadingSpinner = () => (
  <div className="flex-1 flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
  </div>
);

export const AppRoutes = () => {
  return (
    <div className="flex flex-col flex-1">
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<><Login /><Footer /></>} />
        <Route path="/signup" element={<><Signup /><Footer /></>} />
        
        {/* Protected Routes */}
        <Route
          path="/dashboard"
          element={
            <AdminRoute>
              <Header />
              <main className="flex-1">
                <Dashboard />
              </main>
              <Footer />
            </AdminRoute>
          }
        />
        <Route
          path="/schedule"
          element={
            <ProtectedRoute>
              <Header />
              <main className="flex-1">
                <Schedule />
              </main>
              <Footer />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Header />
              <main className="flex-1">
                <Profile />
              </main>
              <Footer />
            </ProtectedRoute>
          }
        />
        <Route
          path="/materials"
          element={
            <ProtectedRoute>
              <Header />
              <main className="flex-1">
                <Suspense fallback={<LoadingSpinner />}>
                  <ClassMaterials />
                </Suspense>
              </main>
              <Footer />
            </ProtectedRoute>
          }
        />

        {/* Admin Routes */}
        <Route
          path="/admin/users"
          element={
            <AdminRoute>
              <Header />
              <main className="flex-1">
                <AdminUsers />
              </main>
              <Footer />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/schedule"
          element={
            <AdminRoute>
              <Header />
              <main className="flex-1">
                <AdminSchedule />
              </main>
              <Footer />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/materials"
          element={
            <AdminRoute>
              <Header />
              <main className="flex-1">
                <Suspense fallback={<LoadingSpinner />}>
                  <AdminMaterials />
                </Suspense>
              </main>
              <Footer />
            </AdminRoute>
          }
        />
      </Routes>
    </div>
  );
}; 