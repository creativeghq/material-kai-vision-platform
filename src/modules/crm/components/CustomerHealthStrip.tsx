/**
 * Where this customer stands, above their timeline.
 *
 * Everything here is derived by `get_customer_health`; this file FORMATS and never re-decides.
 * The records that answer "what is happening with them" live in six tables, so before this the
 * question was six screens and no synthesis.
 *
 * A signal reports its own status, so "nothing billed yet" is rendered as an absence and can
 * never be read as "owes nothing".
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';

interface Signal {
  signal: string;
  label: string;
  status: string;
  value: number | string | null;
  previous: number | string | null;
  detail: string | null;
  severity: string;
}

/** Worst first. A strip that opens with what is fine buries the reason someone came to it. */
const ORDER: Record<string, number> = { attention: 0, watch: 1, good: 2, none: 3 };

/**
 * An unrecognised severity falls through to neutral — never to "good", which would read a shape
 * we do not understand as a clean bill of health.
 */
const TONE: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  good: 'success', watch: 'warning', attention: 'error', none: 'neutral',
};

const SEVERITY_LABEL: Record<string, string> = {
  attention: 'Needs attention', watch: 'Watch', good: 'Fine', none: 'Nothing recorded',
};

export const CustomerHealthStrip: React.FC<{ companyId: string }> = ({ companyId }) => {
  const [rows, setRows] = useState<Signal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase.rpc('get_customer_health', { p_company_id: companyId });
    if (err) { setError(err.message); setRows([]); return; }
    const list = ((data ?? []) as Signal[]).slice()
      .sort((a, b) => (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9));
    setRows(list);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  if (rows === null) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading this customer&apos;s signals…
        </CardContent>
      </Card>
    );
  }

  // A read that failed is UNKNOWN, not a healthy customer — say so rather than render nothing.
  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-800 dark:text-amber-300" />
          <span className="text-muted-foreground">Could not read this customer&apos;s signals: {error}</span>
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map((s) => (
        <Card key={s.signal}>
          <CardContent className="space-y-1.5 p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">{s.label}</span>
              <Badge variant={TONE[s.severity] ?? 'neutral'}>
                {SEVERITY_LABEL[s.severity] ?? 'Unknown'}
              </Badge>
            </div>
            <p className="text-sm text-foreground">{s.detail ?? '—'}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default CustomerHealthStrip;
