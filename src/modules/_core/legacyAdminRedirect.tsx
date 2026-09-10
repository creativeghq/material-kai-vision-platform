/** A module route that only forwards an old `/admin/...` address to its real one. */
import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import type { ComponentType, LazyExoticComponent } from 'react';

/**
 * `legacyAdminRedirect('/emails/templates/:id/edit')` → a component that fills `:id` from the
 * current match and appends the query string.
 *
 * Typed as the module registry's lazy component so it drops into a `routes: []` entry unchanged;
 * it is a plain component, and rendering one where a lazy one is expected is fine.
 */
export function legacyAdminRedirect(target: string): LazyExoticComponent<ComponentType<unknown>> {
  const Redirect: React.FC = () => {
    const params = useParams();
    const { search } = useLocation();
    const path = target.replace(/:([A-Za-z0-9_]+)/g, (whole, name: string) => params[name] ?? whole);
    return <Navigate to={`${path}${search}`} replace />;
  };
  return Redirect as unknown as LazyExoticComponent<ComponentType<unknown>>;
}

export default legacyAdminRedirect;
