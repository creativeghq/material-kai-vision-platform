import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { PageLoader } from '@/components/core/PageLoader';

interface AuthGuardProps {
  children: React.ReactNode;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading || user) return;
    // Carry the query and hash across the bounce instead of dropping them.
    navigate(
      { pathname: '/auth', search: location.search, hash: location.hash },
      { replace: true, state: { from: location.pathname } },
    );
  }, [user, loading, navigate, location.pathname, location.search, location.hash]);

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
