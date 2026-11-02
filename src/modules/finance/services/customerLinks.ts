import { supabase } from '@/integrations/supabase/client';

export type ShareableDocumentKind = 'invoice' | 'credit_note' | 'delivery_note' | 'order';

export function customerLinkUrl(kind: ShareableDocumentKind, token: string): string {
  return `${window.location.origin}/${kind === 'invoice' ? 'pay' : 'd'}/${token}`;
}

/** Reuses the document's live link; `rotate` issues a new one and the old link stops working. */
export async function mintCustomerLink(kind: ShareableDocumentKind, id: string, rotate = false): Promise<string> {
  const { data, error } = await supabase.rpc('mint_document_share_token', { p_kind: kind, p_id: id, p_rotate: rotate });
  if (error) throw new Error(error.message);
  return customerLinkUrl(kind, data as string);
}

export function whatsappShareHref(url: string, label: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${label}: ${url}`)}`;
}

type Toast = (t: { title: string; description?: string; variant?: 'destructive' }) => void;

/** The window opens BEFORE the await so a popup blocker treats it as the click's own window. */
export function customerLinkHandlers(kind: ShareableDocumentKind, id: string, label: string, toast: Toast) {
  const fail = (e: unknown) => toast({ title: 'Could not create the customer link', description: (e as Error).message, variant: 'destructive' });
  const openWith = async (to: (url: string) => string) => {
    const w = window.open('', '_blank');
    try {
      const url = await mintCustomerLink(kind, id);
      if (w) { w.opener = null; w.location.href = to(url); } else window.open(to(url), '_blank', 'noopener');
    } catch (e) { w?.close(); fail(e); }
  };
  return {
    copy: async () => {
      try {
        const url = await mintCustomerLink(kind, id);
        try {
          await navigator.clipboard.writeText(url);
          toast({ title: 'Customer link copied', description: url });
        } catch {
          toast({ title: 'Customer link', description: url });
        }
      } catch (e) { fail(e); }
    },
    open: () => openWith((u) => u),
    whatsapp: () => openWith((u) => whatsappShareHref(u, label)),
  };
}
