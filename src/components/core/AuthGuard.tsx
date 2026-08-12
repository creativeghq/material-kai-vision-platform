import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { PageLoader } from '@/components/core/PageLoader';

interface AuthGuardProps {
  children: React.ReactNode;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth', { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) {
    // The SAME loader the route-level <Suspense> fallback uses. These two phases run
    // back to back on every authenticated page load (session check, then the route's
    // lazy chunk); with two different spinners at two different vertical positions the
    // handover read as a flicker before any content had even been requested.
    return <PageLoader />;
  }

  if (!user) {
    return null; // Will redirect via useEffect
  }

  return <>{children}</>;
};
