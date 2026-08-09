import React, { useEffect, useState } from 'react';
import { ShieldCheck, Mail, Globe, Clock, Hash } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/utils/datetime';

/**
 * Operator-side e-sign audit trail for a quote.
 *
 * Surfaces every `quote_approvals` row (RLS: workspace members read) so the
 * operator sees exactly who signed, when, from where, and the content hash that
 * was signed. Self-hides when the quote has no approvals — drop it anywhere on
 * the quote detail page.
 */
interface Approval {
  id: string;
  signer_name: string;
  signer_email: string | null;
  ip_address: string | null;
  version_hash: string | null;
  signed_at: string;
}

export function QuoteApprovalsCard({ quoteId }: { quoteId: string }) {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('quote_approvals')
      .select('id, signer_name, signer_email, ip_address, version_hash, signed_at')
      .eq('quote_id', quoteId)
      .order('signed_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setApprovals((data ?? []) as Approval[]);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [quoteId]);

  if (!loaded || approvals.length === 0) return null;

  return (
    <div className="dashboard-card p-4 mb-5 border border-emerald-500/30 bg-emerald-500/[0.04]">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        <span className="text-sm font-medium">Signed &amp; accepted</span>
        <span className="text-xs text-muted-foreground">· e-signature audit trail</span>
      </div>
      <div className="space-y-3">
        {approvals.map((a) => (
          <div key={a.id} className="rounded-lg border border-border/50 bg-background/40 p-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="font-medium text-sm">{a.signer_name}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatDate(a.signed_at, { withTime: true })}
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {a.signer_email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{a.signer_email}</span>}
              {a.ip_address && <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" />{a.ip_address}</span>}
              {a.version_hash && (
                <span className="inline-flex items-center gap-1" title={`Signed content hash: ${a.version_hash}`}>
                  <Hash className="h-3 w-3" />sig {a.version_hash.slice(0, 12)}…
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
