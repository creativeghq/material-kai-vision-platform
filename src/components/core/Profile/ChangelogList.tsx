import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Loader2, Megaphone, Sparkles, Wrench, AlertTriangle, Server, Code2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { supabase } from '@/integrations/supabase/client';

type Category = 'api' | 'feature' | 'fix' | 'breaking' | 'platform';

interface ChangelogEntry {
  id: string;
  slug: string;
  title: string;
  body_md: string;
  category: Category | null;
  published_at: string;
}

const CATEGORY_META: Record<Category, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
  api:      { label: 'API',      icon: Code2,          className: 'bg-blue-500/15 text-blue-700 border-blue-500/30' },
  feature:  { label: 'Feature',  icon: Sparkles,       className: 'bg-violet-500/15 text-violet-700 border-violet-500/30' },
  fix:      { label: 'Fix',      icon: Wrench,         className: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
  breaking: { label: 'Breaking', icon: AlertTriangle,  className: 'bg-red-500/15 text-red-700 border-red-500/30' },
  platform: { label: 'Platform', icon: Server,         className: 'bg-muted text-foreground border-border' },
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

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
      const { data, error: qErr } = await supabase
        .from('changelog_entries')
        .select('id, slug, title, body_md, category, published_at')
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (qErr) {
        setError(qErr.message);
      } else {
        setEntries((data || []) as ChangelogEntry[]);
      }
      setLoading(false);
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

  const grouped = useMemo(() => {
    const byMonth: Record<string, ChangelogEntry[]> = {};
    for (const e of entries) {
      const d = new Date(e.published_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      (byMonth[key] ||= []).push(e);
    }
    return Object.entries(byMonth).map(([key, items]) => {
      const [y, m] = key.split('-').map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
      return { key, label, items };
    });
  }, [entries]);

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
                  const meta = CATEGORY_META[entry.category || 'platform'];
                  const Icon = meta.icon;
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
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-1 ${meta.className}`}>
                            <Icon className="h-3 w-3" />
                            {meta.label}
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
