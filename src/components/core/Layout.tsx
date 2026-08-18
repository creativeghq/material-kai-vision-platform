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
    <div className="relative h-screen h-[100dvh] overflow-hidden flex flex-col bg-background">
      {/* The two atmosphere layers that used to sit here (a fixed brand "aurora"
          of radial glows plus a film-grain overlay) are gone. A data product's
          ground has to be ONE colour: an opaque panel can only match a flat
          canvas, and a chart, a table and a KPI all lose contrast against a
          moving gradient. See the APP CANVAS note in index.css. */}
      {/* Skip link — the platform had none anywhere across 640 components, so a keyboard user
          tabbed the ENTIRE sidebar on every route change before reaching content. Visually
          hidden until focused, which is the point: invisible to mouse users, the first stop for
          a keyboard user. Placed before <Sidebar /> so it is genuinely first in DOM order. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to main content
      </a>
      <Sidebar />
      {/* `mobile-content` reserves room for the fixed bottom tab bar (mobile only).
          `relative z-10` lifts page content above the fixed atmosphere. */}
      <main id="main-content" tabIndex={-1} className="relative z-10 flex-1 min-h-0 overflow-x-hidden overflow-y-auto flex flex-col page-wrapper mobile-content">
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
