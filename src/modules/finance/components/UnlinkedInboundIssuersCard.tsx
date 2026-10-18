import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/modules/finance/services/financeService';
import type { UnlinkedInboundIssuer } from '@/modules/finance/services/partyBalancesService';
import { formatDate } from '@/utils/datetime';

/** AADE issuers whose VAT matches no single CRM company — their documents are on no party's statement. */
export const UnlinkedInboundIssuersCard: React.FC<{ issuers: UnlinkedInboundIssuer[] }> = ({ issuers }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  if (issuers.length === 0) return null;

  const total = issuers.reduce((s, i) => s + (i.currency === 'EUR' ? i.balance : 0), 0);
  const copyVat = async (vat: string) => {
    try {
      await navigator.clipboard.writeText(vat);
      toast({ title: 'VAT number copied', description: vat });
    } catch {
      toast({ title: 'Copy failed', description: vat, variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader className="px-4 py-2.5 space-y-0">
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
            {issuers.length} AADE {issuers.length === 1 ? 'supplier is' : 'suppliers are'} not linked to a CRM company
            <span className="font-normal text-muted-foreground">· {formatMoney(Math.abs(total))} on no statement</span>
          </CardTitle>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <p className="text-xs text-muted-foreground">
          Their invoices count once a CRM company carries the same VAT number. Add the VAT to the existing company,
          or create the company — the add form checks for duplicates first.
        </p>
      </CardHeader>
      {open && (
        <CardContent className="p-0">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-xs text-muted-foreground">
                <tr className="border-b border-hairline">
                  <th className="px-4 py-2 text-left font-semibold">Issuer</th>
                  <th className="px-4 py-2 text-left font-semibold">VAT</th>
                  <th className="px-4 py-2 text-right font-semibold">Documents</th>
                  <th className="px-4 py-2 text-left font-semibold">Period</th>
                  <th className="px-4 py-2 text-right font-semibold">Balance</th>
                  <th className="px-4 py-2 text-left font-semibold">Why</th>
                  <th className="px-4 py-2"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {issuers.map((i) => (
                  <tr key={`${i.issuer_vat}-${i.currency}`} className="border-b border-hairline">
                    <td className="px-4 py-2">{i.issuer_name ?? '—'}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      <button type="button" onClick={() => { void copyVat(i.issuer_vat); }}
                        className="inline-flex items-center gap-1 hover:underline" title="Copy VAT number">
                        {i.issuer_vat} <Copy className="h-3 w-3" />
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{i.documents}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{formatDate(i.first_date)} – {formatDate(i.last_date)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(Math.abs(i.balance), i.currency)}</td>
                    <td className="px-4 py-2">
                      {i.matching_companies > 1
                        ? <Badge variant="warning">{i.matching_companies} companies share it</Badge>
                        : <Badge variant="neutral">No company</Badge>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link to={i.matching_companies > 1 ? '/crm?tab=companies' : '/crm?new=company'}>
                          {i.matching_companies > 1 ? 'Review in CRM' : 'Add company'}
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
};
