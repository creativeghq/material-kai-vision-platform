import { toLocalISODate } from '@/utils/datetime';

interface OrderableInvoice {
  issued_at?: string | null;
  legal_number?: string | null;
  created_at?: string | null;
}

const trailingSequence = (n: string | null | undefined): number => {
  const m = /(\d+)\D*$/.exec(n ?? '');
  return m ? Number(m[1]) : -1;
};

const time = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : 0);

export function compareInvoicesNewestFirst(a: OrderableInvoice, b: OrderableInvoice): number {
  if (!a.issued_at || !b.issued_at) {
    if (a.issued_at) return 1;
    if (b.issued_at) return -1;
    return time(b.created_at) - time(a.created_at);
  }
  const dayA = toLocalISODate(new Date(a.issued_at));
  const dayB = toLocalISODate(new Date(b.issued_at));
  if (dayA !== dayB) return dayA < dayB ? 1 : -1;
  return (trailingSequence(b.legal_number) - trailingSequence(a.legal_number))
    || (time(b.issued_at) - time(a.issued_at))
    || (time(b.created_at) - time(a.created_at));
}
