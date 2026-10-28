import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { todayLocalISO } from '@/utils/datetime';

export interface RecordedCertificate {
  standard: string;
  certificate_number: string | null;
  issuer: string | null;
  validity: string | null;
  valid_until: string | null;
}

/** The product's recorded certificates (the Knowledge tab's list), so a chip can say whether one backs it. */
export function useProductCertificates(productId: string | undefined, enabled: boolean): RecordedCertificate[] {
  const [rows, setRows] = useState<RecordedCertificate[]>([]);

  useEffect(() => {
    if (!productId || !enabled) { setRows([]); return; }
    let live = true;
    supabase
      .rpc('get_product_certificates', { p_product_id: productId, p_today: todayLocalISO() })
      .then(({ data, error }) => { if (live) setRows(error ? [] : ((data ?? []) as RecordedCertificate[])); });
    return () => { live = false; };
  }, [productId, enabled]);

  return rows;
}

export const certKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** "EN 442" matches "EN 442-1:2014"; short keys never match, so "CE" cannot claim every "certificate". */
export function certMatches(chip: string, other: string): boolean {
  const a = certKey(chip);
  const b = certKey(other);
  if (a.length < 4 || b.length < 4) return a === b && a.length > 0;
  return a.includes(b) || b.includes(a);
}
