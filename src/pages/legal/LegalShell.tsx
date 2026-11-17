/**
 * Shared chrome for the public legal pages (/privacy, /terms).
 *
 * Registered OUTSIDE <AuthGuard> in App.tsx — no login required. Mirrors the
 * ToolsShell header (brand logo + back to home) but stays independent of the
 * tools-quota machinery.
 */

import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/core/ui/button';

export function LegalShell({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 sticky top-0 z-30 bg-background/80 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link to="/" className="flex items-center">
            <img src="/mh-logo.png" alt="materialshub" className="h-7 w-auto block dark:hidden" />
            <img src="/mh-logo-white.png" alt="" aria-hidden="true" className="h-7 w-auto hidden dark:block" />
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Link to="/privacy">
              <Button variant="ghost" size="sm">Privacy</Button>
            </Link>
            <Link to="/terms">
              <Button variant="ghost" size="sm">Terms</Button>
            </Link>
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Home</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-12">
        <div className="mb-10">
          <h1 className="text-4xl font-semibold tracking-tight mb-2">{title}</h1>
          <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        </div>

        {/* `.legal-prose` styles headings, paragraphs, and lists consistently. */}
        <div
          className="
            legal-prose space-y-6 text-[15px] leading-relaxed text-foreground/90
            [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h2]:mt-10 [&_h2]:mb-3
            [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2
            [&_p]:text-foreground/80
            [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_ul]:text-foreground/80
            [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1.5 [&_ol]:text-foreground/80
            [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
            [&_strong]:text-foreground [&_strong]:font-semibold
          "
        >
          {children}
        </div>

        <footer className="mt-16 pt-8 border-t border-border/40 text-sm text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2">
          <span>© {new Date().getFullYear()} MaterialsHub</span>
          <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <a href="mailto:support@materialshub.gr" className="hover:text-foreground transition-colors">
            support@materialshub.gr
          </a>
        </footer>
      </main>
    </div>
  );
}
