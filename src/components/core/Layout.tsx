import React from 'react';

import { Sidebar } from './Sidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { PageErrorBoundary } from './ErrorBoundary';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  // `h-screen` (100vh) is the LARGE viewport on mobile Safari / Chrome Android:
  // with `overflow-hidden` on the root, ~60-100px of <main>'s scroll box lives
  // under the browser toolbar with no way to scroll it into view. `100dvh`
  // tracks the visible viewport; `h-screen` stays as the fallback.
  return (
    <div className="relative h-screen h-[100dvh] overflow-hidden flex flex-col">
      {/* Command-center atmosphere — brand aurora + film grain behind every page. */}
      <div className="app-aurora" aria-hidden="true" />
      <div className="app-grain" aria-hidden="true" />
      <Sidebar />
      {/* `mobile-content` reserves room for the fixed bottom tab bar (mobile only).
          `relative z-10` lifts page content above the fixed atmosphere. */}
      <main className="relative z-10 flex-1 min-h-0 overflow-x-hidden overflow-y-auto flex flex-col page-wrapper mobile-content">
        {/* Localize a page render throw to the content area (nav + chrome stay usable) instead of
            letting it bubble to the top-level CriticalErrorBoundary and blank the whole app — the
            heavy authenticated pages (finance tables, agent canvas, PDF viewer) are the main risk. */}
        <PageErrorBoundary name="Page">
          {children}
        </PageErrorBoundary>
      </main>
      <MobileBottomNav />
    </div>
  );
};
