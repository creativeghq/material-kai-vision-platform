import { useCallback, useEffect, useState } from 'react';
import { Bookmark, BookmarkPlus, Loader2, Trash2, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SavedRow {
  id: string;
  name: string;
  query: string;
}

type Load =
  | { kind: 'loading' }
  | { kind: 'loaded'; rows: SavedRow[] }
  | { kind: 'failed'; reason: string };

interface Props {
  currentQuery?: string;
  onApply: (query: string) => void;
}

export function SavedSearches({ currentQuery, onApply }: Props) {
  const { activeWorkspaceId } = useWorkspace();
  const { user } = useAuth();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const reload = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from('saved_searches')
      .select('id, name, query')
      .eq('user_id', user.id)
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .limit(20);
    if (error) { setLoad({ kind: 'failed', reason: error.message }); return; }
    setLoad({ kind: 'loaded', rows: (data ?? []) as SavedRow[] });
  }, [user?.id]);

  useEffect(() => { void reload(); }, [reload]);

  const trimmed = (currentQuery ?? '').trim();
  const alreadySaved = load.kind === 'loaded'
    && load.rows.some((r) => r.query.trim().toLowerCase() === trimmed.toLowerCase());

  const save = async () => {
    if (!trimmed || !user?.id) return;
    setSaving(true);
    const { error } = await supabase.from('saved_searches').insert({
      user_id: user.id,
      workspace_id: activeWorkspaceId,
      name: trimmed.slice(0, 80),
      query: trimmed,
      search_strategy: 'multi_vector',
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Search not saved', description: error.message, variant: 'destructive' });
      return;
    }
    void reload();
  };

  const remove = async (row: SavedRow) => {
    const { error } = await supabase.from('saved_searches').delete().eq('id', row.id);
    if (error) {
      toast({ title: 'Search not removed', description: error.message, variant: 'destructive' });
      return;
    }
    void reload();
  };

  const apply = async (row: SavedRow) => {
    onApply(row.query);
    const { error } = await supabase
      .from('saved_searches')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) console.error('[SavedSearches] last_used_at not recorded:', error.message);
  };

  if (load.kind === 'loading') return null;

  if (load.kind === 'failed') {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-destructive" />
        Saved searches could not be loaded — this is not a statement that you have none.
      </p>
    );
  }

  if (load.rows.length === 0 && !trimmed) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {load.rows.length > 0 && (
        <Bookmark className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      {load.rows.map((row) => (
        <span key={row.id} className="inline-flex items-center overflow-hidden rounded-sm border border-hairline">
          <button
            type="button"
            onClick={() => void apply(row)}
            className="px-2.5 py-1 text-xs hover:bg-surface-sunken"
          >
            {row.name}
          </button>
          <button
            type="button"
            aria-label={`Remove saved search ${row.name}`}
            onClick={() => void remove(row)}
            className="border-l border-hairline px-1.5 py-1 text-muted-foreground hover:bg-surface-sunken"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </span>
      ))}

      {trimmed && !alreadySaved && (
        <Button variant="ghost" size="sm" onClick={() => void save()} disabled={saving}>
          {saving
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <BookmarkPlus className="h-3.5 w-3.5" />}
          <span className="ml-1.5 text-xs">Save this search</span>
        </Button>
      )}
    </div>
  );
}
