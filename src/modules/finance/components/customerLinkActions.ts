import { Copy, ExternalLink, MessageCircle } from 'lucide-react';
import type { RowMenuAction } from '@/modules/finance/components/DocumentRowMenu';
import { customerLinkHandlers, type ShareableDocumentKind } from '@/modules/finance/services/customerLinks';

type Toast = Parameters<typeof customerLinkHandlers>[3];

export function customerLinkMenuActions(
  kind: ShareableDocumentKind, id: string, label: string, toast: Toast, who = 'customer',
): RowMenuAction[] {
  const h = customerLinkHandlers(kind, id, label, toast);
  return [
    { label: `Copy ${who} link`, icon: Copy, onSelect: () => void h.copy() },
    { label: `Open ${who} view`, icon: ExternalLink, onSelect: () => void h.open() },
    { label: 'Send via WhatsApp', icon: MessageCircle, onSelect: () => void h.whatsapp() },
  ];
}
