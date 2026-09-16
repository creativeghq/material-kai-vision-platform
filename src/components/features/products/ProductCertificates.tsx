import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { todayLocalISO } from '@/utils/datetime';
import { presentValidity } from './certificateValidity';

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

export function ProductCertificates({ productId }: { productId: string }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    // The operator's calendar day: the DB session is UTC, so current_date is off by one.
    supabase
      .rpc('get_product_certificates', { p_product_id: productId, p_today: todayLocalISO() })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setLoad({ kind: 'failed', reason: error.message }); return; }
        setLoad({ kind: 'loaded', rows: (data ?? []) as CertificateRow[] });
      });
    return () => { cancelled = true; };
  }, [productId]);

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
  if (load.rows.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
        <ShieldCheck className="h-4 w-4" />
        Certificates
      </h3>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
