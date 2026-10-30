import { supabase } from '@/integrations/supabase/client';
import { isLinkedRecordKind, type LinkedRecordKind } from '@/config/linkedRecordKinds';

export interface LinkedRecord {
  kind: LinkedRecordKind;
  id: string;
  label: string | null;
  status: string | null;
  relation: string | null;
}

/** Every record directly linked to one record, in both directions. RLS decides which are visible. */
export async function getLinkedRecords(kind: LinkedRecordKind, id: string): Promise<LinkedRecord[]> {
  // Not in the generated types yet (`types:generate` needs an access token this checkout lacks).
  const { data, error } = await (supabase as any).rpc('get_linked_records', { p_kind: kind, p_id: id });
  if (error) throw error;
  return ((data ?? []) as any[])
    .filter((row) => isLinkedRecordKind(row?.kind))
    .map((row) => ({
      kind: row.kind as LinkedRecordKind,
      id: String(row.id),
      label: row.label ?? null,
      status: row.status ?? null,
      relation: row.relation ?? null,
    }));
}
