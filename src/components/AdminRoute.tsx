import { Navigate } from 'react-router-dom';
import { useAdmin } from '../hooks/useAdmin';
import { useMasquerade } from '../hooks/useMasquerade';

export const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin, loading } = useAdmin();
  const { isMasquerading } = useMasquerade();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!isAdmin || isMasquerading) {
    return <Navigate to="/schedule" />;
  }

  return <>{children}</>;
}; 