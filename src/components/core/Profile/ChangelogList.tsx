import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Loader2, Megaphone, Sparkles, Wrench, AlertTriangle, Server, Code2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import {
  fetchChangelog,
  groupByMonth,
  changelogCategory,
  formatChangelogDate as formatDate,
  CHANGELOG_CATEGORY_LABEL,
  CHANGELOG_CATEGORY_CLASS,
  type ChangelogCategory,
  type ChangelogEntry,
} from '@/services/changelogService';

/** Icon per category — the only display concern this surface adds on top of the shared service. */
const CATEGORY_ICON: Record<ChangelogCategory, React.ComponentType<{ className?: string }>> = {
  api: Code2,
  feature: Sparkles,
  fix: Wrench,
  breaking: AlertTriangle,
  platform: Server,
};

interface ChangelogListProps {
  /** Slug to scroll to + highlight on mount (deep-link target from bell action_url). */
  highlightSlug?: string | null;
}

export const ChangelogList: React.FC<ChangelogListProps> = ({ highlightSlug }) => {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const entryRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await fetchChangelog(50);
        if (!cancelled) setEntries(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!highlightSlug || loading) return;
    const node = entryRefs.current[highlightSlug];
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightSlug, loading, entries]);

  const grouped = useMemo(() => groupByMonth(entries), [entries]);

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary" />
          Changes Log
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Failed to load changelog: {error}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No updates published yet.</p>
        ) : (
          grouped.map(group => (
            <div key={group.key} className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.label}</p>
              <div className="space-y-3">
                {group.items.map(entry => {
                  const cat = changelogCategory(entry.category);
                  const Icon = CATEGORY_ICON[cat];
                  const isHighlight = highlightSlug === entry.slug;
                  return (
                    <div
                      key={entry.id}
                      ref={el => { entryRefs.current[entry.slug] = el; }}
                      className={`rounded-xl border p-4 transition-colors ${isHighlight ? 'bg-primary/5 border-primary/40 ring-1 ring-primary/20' : 'bg-muted/20'}`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="font-medium text-sm truncate">{entry.title}</h3>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-1 ${CHANGELOG_CATEGORY_CLASS[cat]}`}>
                            <Icon className="h-3 w-3" />
                            {CHANGELOG_CATEGORY_LABEL[cat]}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">{formatDate(entry.published_at)}</span>
                      </div>
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground/90">
                        <ReactMarkdown>{entry.body_md}</ReactMarkdown>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};
