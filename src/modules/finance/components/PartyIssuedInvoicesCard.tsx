/** The invoices WE issued to a customer, on their CRM record. */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Loader2 } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { formatMoney } from '@/modules/finance/services/financeService';
import { FINANCE_BASE } from '@/modules/finance/routes';
import { statusTone } from '@/utils/statusTone';
import { humanizeLabel } from '@/utils/humanize';
import { formatDate } from '@/utils/datetime';

interface Row {
  id: string;
  internal_number: string | null;
  legal_number: string | null;
  document_type: string | null;
  status: string;
  issued_at: string | null;
  due_at: string | null;
  total: number;
  amount_due: number;
  currency: string | null;
}

export const PartyIssuedInvoicesCard: React.FC<{
  workspaceId: string;
  companyId?: string;
  contactId?: string;
}> = ({ workspaceId, companyId, contactId }) => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRows(null);
      setError(null);
      let q = supabase
        .from('invoices')
        .select('id, internal_number, legal_number, document_type, status, issued_at, due_at, total, amount_due, currency')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(200);
      q = companyId ? q.eq('customer_company_id', companyId) : q.eq('customer_contact_id', contactId ?? '');
      const { data, error: err } = await q;
      if (cancelled) return;
      if (err) { setError(err.message); return; }
      setRows((data ?? []) as unknown as Row[]);
    })();
    return () => { cancelled = true; };
  }, [workspaceId, companyId, contactId]);

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 space-y-0">
        <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Issued Invoices</CardTitle>
        <p className="mt-0.5 text-xs text-muted-foreground">Invoices issued to this customer, newest first.</p>
      </CardHeader>
      <CardContent className="p-0">
        {error ? (
          <div className="p-6 text-center text-sm text-destructive">Could not load invoices: {error}</div>
        ) : rows === null ? (
          <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <HubEmptyState icon={FileText} title="No invoices issued to this customer yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`${FINANCE_BASE}/invoices/${r.id}`)}
                >
                  <TableCell className="font-medium">{r.legal_number ?? r.internal_number ?? '—'}</TableCell>
                  <TableCell>{r.document_type ?? '—'}</TableCell>
                  <TableCell className={statusTone(r.status)}>{humanizeLabel(r.status)}</TableCell>
                  <TableCell>{r.issued_at ? formatDate(r.issued_at) : '—'}</TableCell>
                  <TableCell>{r.due_at ? formatDate(r.due_at) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(Number(r.total), r.currency ?? undefined)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(Number(r.amount_due), r.currency ?? undefined)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
