/**
 * A module route that only forwards an old `/admin/...` address to its real one.
 *
 * Seven tenant surfaces were mounted under `/admin` behind `AdminGuard` — which is not "an admin"
 * but the PLATFORM OPERATOR (owner/admin of the root workspace). The pages configure things that
 * belong to a workspace: its messaging channels, its email domain, its catalogs, its connected
 * social accounts, its automations. So a customer who bought one of those modules could not open
 * the page that sets it up, and every in-app link to it read `/admin/...` as though the tenant
 * were browsing our operator console.
 *
 * The redirects exist because links outlive routes: stored `action_url`s on notifications sent
 * months ago, bookmarks, anything pasted into a chat. They carry the route params and the query
 * string across, and they are deliberately UNGATED — the whole point is that the person the old
 * address bounced now arrives.
 */
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
