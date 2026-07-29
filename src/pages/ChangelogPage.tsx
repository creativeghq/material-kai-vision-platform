/**
 * Public changelog — /changelog.
 *
 * Registered OUTSIDE <AuthGuard> in App.tsx: a changelog you have to log in to read is useless for
 * the two audiences that need it most — prospects deciding whether the platform is alive, and API
 * consumers who need a linkable record of a breaking change.
 *
 * Reads published `changelog_entries` through the shared changelogService, the same reader the
 * in-app Profile → Subscription tab uses, so the two can never disagree about what is published.
 * Anonymous access is enforced server-side by an RLS policy scoped to `published_at IS NOT NULL`;
 * drafts are not reachable from here even by a crafted request.
 *
 * Self-contained (no Layout / no workspace machinery) so it renders for anonymous visitors and
 * crawlers, mirroring HomePage.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import ReactMarkdown from 'react-markdown';
import {
  AlertTriangle,
  ArrowRight,
  Code2,
  Loader2,
  LogIn,
  Server,
  Sparkles,
  Wrench,
} from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import {
  fetchChangelog,
  groupByMonth,
  changelogCategory,
  formatChangelogDate,
  CHANGELOG_CATEGORY_LABEL,
  CHANGELOG_CATEGORY_CLASS,
  type ChangelogCategory,
  type ChangelogEntry,
} from '@/services/changelogService';

const CATEGORY_ICON: Record<ChangelogCategory, React.ComponentType<{ className?: string }>> = {
  api: Code2,
  feature: Sparkles,
  fix: Wrench,
  breaking: AlertTriangle,
  platform: Server,
};

function BrandMark() {
  return (
    <Link to="/home" className="flex items-center gap-2.5">
      <img src="/mh-logo.png" alt="" aria-hidden="true" className="h-7 w-auto block dark:hidden" />
      <img src="/mh-logo-white.png" alt="" aria-hidden="true" className="h-7 w-auto hidden dark:block" />
      <span className="font-display text-lg font-semibold tracking-tight">MaterialsHub</span>
    </Link>
  );
}

export default function ChangelogPage() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchChangelog(100);
        if (!cancelled) setEntries(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const months = useMemo(() => groupByMonth(entries), [entries]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Changelog — MaterialsHub</title>
        <meta
          name="description"
          content="What's new on MaterialsHub — new features, fixes, API changes and breaking changes, newest first."
        />
      </Helmet>

      {/* Header */}
      <header className="border-b border-border/40 sticky top-0 z-30 bg-background/80 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <BrandMark />
          <div className="flex items-center gap-2 sm:gap-3 text-sm">
            <Link to="/tools">
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex">Free tools</Button>
            </Link>
            <a href="/documentation/">
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex">Docs</Button>
            </a>
            <Link to="/auth">
              <Button variant="ghost" size="sm" className="gap-2">
                <LogIn className="h-4 w-4" />
                <span>Sign in</span>
              </Button>
            </Link>
            <Link to="/auth?mode=signup">
              <Button size="sm" className="gap-2">
                Get started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-border/40">
        <div className="container mx-auto max-w-4xl px-4 py-14 sm:py-20">
          <Badge variant="outline" className="rounded-full mb-5 gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Product updates
          </Badge>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight mb-4">
            Changelog
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Everything we ship, newest first — new features, fixes, and any change to the API.
            Breaking changes are labelled as such so you can find them at a glance.
          </p>
        </div>
      </section>

      {/* Entries */}
      <section className="container mx-auto max-w-4xl px-4 py-12">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-10">Couldn't load the changelog: {error}</p>
        ) : months.length === 0 ? (
          <p className="text-muted-foreground py-10">No updates published yet.</p>
        ) : (
          <div className="space-y-14">
            {months.map((month) => (
              <div key={month.key} id={month.key} className="scroll-mt-20">
                <div className="flex items-center gap-4 mb-6">
                  <h2 className="font-display text-xl font-semibold tracking-tight">{month.label}</h2>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <div className="space-y-6">
                  {month.items.map((entry) => {
                    const cat = changelogCategory(entry.category);
                    const Icon = CATEGORY_ICON[cat];
                    return (
                      <article
                        key={entry.id}
                        id={entry.slug}
                        className="scroll-mt-20 rounded-2xl border border-border/60 bg-card/40 p-6"
                      >
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                          <Badge variant="outline" className={`text-[11px] px-2 py-0 gap-1 ${CHANGELOG_CATEGORY_CLASS[cat]}`}>
                            <Icon className="h-3 w-3" />
                            {CHANGELOG_CATEGORY_LABEL[cat]}
                          </Badge>
                          <time
                            dateTime={entry.published_at}
                            className="text-xs text-muted-foreground"
                          >
                            {formatChangelogDate(entry.published_at)}
                          </time>
                        </div>

                        <h3 className="font-display text-xl font-semibold tracking-tight mb-3">
                          <a href={`#${entry.slug}`} className="hover:text-primary transition-colors">
                            {entry.title}
                          </a>
                        </h3>

                        <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90">
                          <ReactMarkdown>{entry.body_md}</ReactMarkdown>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="container mx-auto max-w-4xl px-4 pb-24 text-center">
        <h2 className="font-display text-2xl font-semibold tracking-tight mb-3">
          Want these as they land?
        </h2>
        <p className="text-muted-foreground mb-7 max-w-xl mx-auto">
          Signed-in users see the same log in their account, and get a notification when something
          affects them.
        </p>
        <Link to="/auth?mode=signup">
          <Button size="lg" className="gap-2">
            Create free account
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40">
        <div className="container mx-auto max-w-6xl px-4 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src="/mh-logo.png" alt="" aria-hidden="true" className="h-5 w-auto block dark:hidden" />
            <img src="/mh-logo-white.png" alt="" aria-hidden="true" className="h-5 w-auto hidden dark:block" />
            <span>© {new Date().getFullYear()} MaterialsHub</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link to="/home" className="hover:text-foreground transition-colors">Home</Link>
            <Link to="/tools" className="hover:text-foreground transition-colors">Tools</Link>
            <a href="/documentation/" className="hover:text-foreground transition-colors">Documentation</a>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
