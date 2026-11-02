/** Issuing transmits to myDATA (auto_send_to_aade, on unless off). A failed send leaves an ISSUED document and says so. */
import { supabase } from '@/integrations/supabase/client';
import { deliveryNotesService } from '@/modules/finance/services/deliveryNotesService';
import { financeService } from '@/modules/finance/services/financeService';

export type AutoSendResult =
  | { status: 'sent'; mark: string | null; offline: boolean }
  | { status: 'off' }
  | { status: 'failed'; error: string };

async function autoSendOn(workspaceId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('finance_settings').select('auto_send_to_aade').eq('workspace_id', workspaceId).maybeSingle();
  if (error) return true;
  return (data as { auto_send_to_aade?: boolean | null } | null)?.auto_send_to_aade !== false;
}

export async function transmitAfterIssue(
  kind: 'delivery_note' | 'credit_note', id: string, workspaceId: string,
): Promise<AutoSendResult> {
  if (!(await autoSendOn(workspaceId))) return { status: 'off' };
  try {
    const res = kind === 'delivery_note'
      ? await deliveryNotesService.submitFiscal(id)
      : await financeService.submitCreditNoteFiscal(id);
    const f = res?.fiscal;
    if (!f) return { status: 'failed', error: 'myDATA returned no response.' };
    if (f.ok === false) return { status: 'failed', error: String(f.error ?? 'Not submitted.') };
    if (f.status === 'rejected' || f.status === 'error') {
      return { status: 'failed', error: String(f.errorMessage ?? f.errorCode ?? 'Rejected by myDATA.') };
    }
    return { status: 'sent', mark: f.mark ?? null, offline: f.status === 'offline' };
  } catch (err) {
    return { status: 'failed', error: (err as { message?: string })?.message ?? 'myDATA transmission failed.' };
  }
}

export function issuedToast(label: string, r: AutoSendResult): { title: string; description?: string; variant?: 'destructive' } {
  if (r.status === 'sent') {
    return r.offline
      ? { title: `${label} issued — AADE offline`, description: 'Accepted by the provider; the MARK is assigned automatically shortly.' }
      : { title: `${label} issued and sent to myDATA`, description: r.mark ? `MARK ${r.mark}` : undefined };
  }
  if (r.status === 'off') {
    return { title: `${label} issued`, description: 'Automatic sending to AADE is off for this workspace — send it from its page.' };
  }
  return { title: `${label} issued — NOT sent to myDATA`, description: `${r.error} Retry from its page.`, variant: 'destructive' };
}
