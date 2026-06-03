import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingScreen } from '@/components/ui/GlassSpinner';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('author' | 'admin')[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, userRole, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Admin-created accounts get a temporary password; force a reset before
  // they can access any other route.
  const mustReset = (user.user_metadata as any)?.must_reset_password === true;
  if (mustReset && location.pathname !== '/reset-password') {
    return <Navigate to="/reset-password?first-login=1" replace />;
  }

  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    if (userRole === 'admin') {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/author" replace />;
  }

  return <>{children}</>;
}

