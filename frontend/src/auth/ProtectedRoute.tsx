import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { Role } from '@logisticai/shared';
import { useMe } from './useAuth';

export function ProtectedRoute({ children, role }: { children: ReactNode; role?: Role }) {
  const { data: user, isLoading } = useMe();
  const location = useLocation();
  if (isLoading) {
    return <p className="p-8 text-testo-2" role="status">Caricamento...</p>;
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}
