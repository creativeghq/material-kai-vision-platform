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
    // A password-recovery link whose `redirect_to` is not allow-listed does not fail —
    // GoTrue silently falls back to the project's Site URL, so the link lands HERE with
    // its tokens still attached (`#...type=recovery`, or `?code=` under PKCE). Redirecting
    // to a bare `/auth` threw those away, and /auth opens on the Sign Up tab: someone
    // recovering an account they already have was shown "Create an account".
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
    // The redirect above is an EFFECT, so this renders first and renders again on every pass
    // where the navigation has not landed yet. Bare null made that a black screen with no
    // spinner and no error — indistinguishable from a dead app, and invisible to Sentry
    // because nothing threw. Show the same loader the signed-in wait uses.
    return <PageLoader />;
  }

  return <>{children}</>;
};
