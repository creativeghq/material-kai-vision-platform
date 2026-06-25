/**
 * Embedding Coverage card — Ops Overview badge for the Embedding Backfill agent.
 *
 * Reads the platform-wide deficiency counts from the get_embedding_backfill_backlog()
 * RPC (admin-gated) and renders them. The Embedding Backfill background agent repairs
 * these automatically (15-min recent sweep + nightly full); this card is the
 * at-a-glance health signal. "Stuck" = entities that have failed ≥3 attempts and
 * need a human — click through to the agent run history for the failing IDs + reason.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, CheckCircle2, AlertTriangle, Database } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface Backlog {
  products_missing_text: number;
  chunks_missing_text: number;
  images_classification_pending: number;
  images_partial: number;
  stuck: number;
}

const FIELDS: { key: keyof Backlog; label: string }[] = [
  { key: 'products_missing_text',         label: 'Products missing text' },
  { key: 'chunks_missing_text',           label: 'Chunks missing text' },
  { key: 'images_partial',                label: 'Images partial' },
  { key: 'images_classification_pending', label: 'Images pending classify' },
];

export const EmbeddingBackfillCard: React.FC = () => {
  const navigate = useNavigate();
  const [backlog, setBacklog] = useState<Backlog | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    // RPC isn't in the generated types union yet — localized cast.
    const { data, error } = await (supabase.rpc as any)('get_embedding_backfill_backlog');
    if (error) {
      setErr(error.message);
      setBacklog(null);
    } else {
      setBacklog(data as Backlog);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const total = backlog ? FIELDS.reduce((s, f) => s + (backlog[f.key] || 0), 0) : 0;
  const allClear = !!backlog && total === 0 && backlog.stuck === 0;

  return (
    <div className="dashboard-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
          <p className="text-sm font-semibold">Embedding Coverage</p>
          {!loading && allClear && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> All embedded
            </span>
          )}
          {!loading && backlog && backlog.stuck > 0 && (
            <span className="flex items-center gap-1 text-xs text-red-400">
              <AlertTriangle className="h-3.5 w-3.5" /> {backlog.stuck} stuck
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => navigate('/admin/background-agents')}>
            View agent
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {err && <p className="text-xs text-muted-foreground italic">Backlog unavailable: {err}</p>}

      {!err && backlog && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FIELDS.map((f) => {
            const v = backlog[f.key] || 0;
            return (
              <div key={f.key}>
                <p className={`text-xl font-bold leading-none ${v > 0 ? 'text-amber-400' : ''}`}>{v}</p>
                <p className="text-xs text-muted-foreground mt-1">{f.label}</p>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-3 leading-snug">
        Repaired automatically every 15&nbsp;min by the Embedding Backfill agent (nightly full sweep).
        “Stuck” = failed ≥3 attempts and needs a look.
      </p>
    </div>
  );
};
