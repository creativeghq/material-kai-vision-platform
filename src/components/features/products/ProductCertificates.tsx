import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState } from '@/components/core/hub';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISO } from '@/utils/datetime';
import { presentValidity } from './certificateValidity';
import {
  type CertificateDraft, ProductCertificateDialog, emptyDraft,
} from './ProductCertificateDialog';

interface CertificateRow {
  id: string;
  standard: string;
  certificate_number: string | null;
  issuer: string | null;
  scope: string | null;
  result: string | null;
  valid_from: string | null;
  valid_until: string | null;
  validity: string | null;
  notes: string | null;
}

type Load =
  | { kind: 'loading' }
  | { kind: 'loaded'; rows: CertificateRow[] }
  | { kind: 'failed'; reason: string };

interface Props {
  productId: string;
  canEdit?: boolean;
  suggestedStandards?: string[];
}

export function ProductCertificates({ productId, canEdit = false, suggestedStandards = [] }: Props) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [draft, setDraft] = useState<CertificateDraft | null>(null);
  // Remount per open: the dialog seeds its form once, so a reused key shows the last row.
  const [openSeq, setOpenSeq] = useState(0);
  const openDraft = (d: CertificateDraft) => { setDraft(d); setOpenSeq((n) => n + 1); };
  const { toast } = useToast();

  const reload = useCallback(() => {
    // The operator's calendar day: the DB session is UTC, so current_date is off by one.
    return supabase
      .rpc('get_product_certificates', { p_product_id: productId, p_today: todayLocalISO() })
      .then(({ data, error }) => {
        if (error) { setLoad({ kind: 'failed', reason: error.message }); return; }
        setLoad({ kind: 'loaded', rows: (data ?? []) as CertificateRow[] });
      });
  }, [productId]);

  useEffect(() => { void reload(); }, [reload]);

  const remove = async (row: CertificateRow) => {
    const { error } = await supabase.from('product_certificates').delete().eq('id', row.id);
    if (error) {
      toast({ title: 'Certificate not removed', description: error.message, variant: 'destructive' });
      return;
    }
    void reload();
  };

  if (load.kind === 'loading') {
    return <p className="text-sm text-muted-foreground">Loading certificates…</p>;
  }
  if (load.kind === 'failed') {
    return (
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-destructive">Certificates could not be loaded</span>
        {' '}— this is not a statement that the product has none. {load.reason}
      </p>
    );
  }
  if (load.rows.length === 0 && !canEdit) return null;

  const recorded = new Set(load.rows.map((r) => r.standard.toLowerCase()));
  const unrecorded = suggestedStandards.filter((s) => s && !recorded.has(s.toLowerCase()));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
          <ShieldCheck className="h-4 w-4" />
          Certificates
        </h3>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => openDraft(emptyDraft())}>
            <Plus className="h-4 w-4" />
            <span className="ml-2">Add certificate</span>
          </Button>
        )}
      </div>

      {load.rows.length === 0 ? (
        <HubEmptyState
          icon={ShieldCheck}
          title="No certificates recorded"
          description="Record the standard, number, issuer and expiry so this product can be filtered on them and warn before they lapse."
          action={canEdit
            ? (
              <Button variant="outline" size="sm" onClick={() => openDraft(emptyDraft())}>
                <Plus className="h-4 w-4" />
                <span className="ml-2">Add certificate</span>
              </Button>
            )
            : undefined}
        />
      ) : (
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken">
              <tr className="text-left">
                <th className="px-3 py-2 text-[11px] font-semibold">Standard</th>
                <th className="px-3 py-2 text-[11px] font-semibold">Result</th>
                <th className="px-3 py-2 text-[11px] font-semibold">Number</th>
                <th className="px-3 py-2 text-[11px] font-semibold">Issuer</th>
                <th className="px-3 py-2 text-[11px] font-semibold">Valid until</th>
                <th className="px-3 py-2 text-[11px] font-semibold">Status</th>
                {canEdit && <th className="px-3 py-2"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {load.rows.map((row) => {
                const v = presentValidity(row.validity);
                return (
                  <tr key={row.id} className="border-t border-hairline align-top">
                    <td className="px-3 py-2 font-medium">
                      {row.standard}
                      {row.scope && (
                        <span className="block text-xs text-muted-foreground">{row.scope}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{row.result ?? '—'}</td>
                    <td className="px-3 py-2">{row.certificate_number ?? '—'}</td>
                    <td className="px-3 py-2">{row.issuer ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{row.valid_until ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Badge variant={v.tone === 'success' ? 'success'
                        : v.tone === 'warning' ? 'warning'
                        : v.tone === 'error' ? 'error' : 'neutral'}>
                        {v.label}
                      </Badge>
                    </td>
                    {canEdit && (
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost" size="sm" aria-label={`Edit ${row.standard}`}
                            onClick={() => openDraft({
                              id: row.id,
                              standard: row.standard,
                              certificate_number: row.certificate_number ?? '',
                              issuer: row.issuer ?? '',
                              scope: row.scope ?? '',
                              result: row.result ?? '',
                              valid_from: row.valid_from ?? '',
                              valid_until: row.valid_until ?? '',
                              notes: row.notes ?? '',
                            })}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="sm" aria-label={`Remove ${row.standard}`}
                            onClick={() => void remove(row)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && unrecorded.length > 0 && (
        <div className="space-y-2 border-t border-hairline pt-3">
          <p className="text-xs text-muted-foreground">
            Extracted from this product&apos;s text, not yet recorded as certificates —
            each still needs its number, issuer and expiry:
          </p>
          <div className="flex flex-wrap gap-2">
            {unrecorded.map((s) => (
              <Button key={s} variant="outline" size="sm" onClick={() => openDraft(emptyDraft(s))}>
                <Plus className="h-3.5 w-3.5" />
                <span className="ml-1.5">{s}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {draft && (
        <ProductCertificateDialog
          key={openSeq}
          productId={productId}
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={() => { void reload(); }}
        />
      )}
    </div>
  );
}
