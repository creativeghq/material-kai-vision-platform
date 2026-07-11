/**
 * Shared full-screen route loading spinner. Used as the App-level <Suspense> fallback for lazy
 * routes AND by the module-route guards (ModuleGate / EntitlementGuard) while they resolve their
 * async checks — so navigating to a module route (e.g. /hr) shows a loader like every other page
 * instead of a blank screen during the module-enabled + entitlement lookups.
 */
import React from 'react';

export const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  </div>
);

export default PageLoader;
