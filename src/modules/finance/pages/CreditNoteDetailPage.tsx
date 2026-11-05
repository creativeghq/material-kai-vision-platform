import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FileMinus, FileText, Loader2, PackageCheck, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState, HubPanel, HubProperty, HubPropertyList, HubRecordPage } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import { financeService, formatMoney, round2 } from '@/modules/finance/services/financeService';
import { FINANCE_BASE, FINANCE_TAB, creditNoteUrl, financeTabUrl } from '@/modules/finance/routes';
import {
  creditNoteDraftsService, invoiceLabel, type CreditLine, type CreditNoteDraft, type CreditNoteRecord,
} from '@/modules/finance/services/creditNoteDraftsService';
import { NewCreditNoteDialog } from '@/modules/finance/components/NewCreditNoteDialog';
import { ReceiveReturnDialog } from '@/modules/finance/components/ReceiveReturnDialog';
import { FiscalRecordPanel, useFiscalAuthCode } from '@/modules/finance/components/FiscalRecordPanel';
import { CustomerLinkPanel } from '@/modules/finance/components/CustomerLinkPanel';
import { issuedToast, transmitAfterIssue } from '@/modules/finance/services/fiscalAutoSend';

const isTransmitted = (s: string | null) => s === 'accepted' || s === 'offline';
const crumbs = (title: string) => [
  { label: 'Finance', to: FINANCE_BASE },
  { label: 'Credit Notes', to: financeTabUrl(FINANCE_TAB.creditNotes) },
  { label: title },
];

const NotFound: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="p-6">
      <HubEmptyState
        icon={FileMinus}
        title="Credit note not found"
        description="It may have been issued or removed, or it belongs to another workspace."
        action={<Button variant="outline" onClick={() => navigate(financeTabUrl(FINANCE_TAB.creditNotes))}>Back to Credit Notes</Button>}
      />
    </div>
  );
};

const Loading: React.FC = () => (
  <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
);

const LinesCard: React.FC<{ lines: (CreditLine & { id?: string })[]; currency: string; action?: React.ReactNode }> = ({ lines, currency, action }) => {
  const net = round2(lines.reduce((t, l) => t + Number(l.net_value ?? 0), 0));
  const vat = round2(lines.reduce((t, l) => t + Number(l.vat_amount ?? 0), 0));
  return (
    <Card>
      <CardHeader><CardTitle>Lines Credited</CardTitle></CardHeader>
      <CardContent className="p-0">
        {lines.length === 0 ? (
          <div className="p-4"><HubEmptyState icon={FileMinus} title="No lines" description="Pick the invoice lines this note credits." action={action} /></div>
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="border-b border-hairline bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Description</th>
                  <th className="px-4 py-2 text-right">Quantity</th>
                  <th className="px-4 py-2 text-right">Net</th>
                  <th className="px-4 py-2 text-right">VAT</th>
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.id ?? i} className="border-b border-hairline">
                    <td className="px-4 py-2">{l.description}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(l.quantity)}{l.unit ? ` ${l.unit}` : ''}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(Number(l.net_value), currency)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(Number(l.vat_amount), currency)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(round2(Number(l.net_value) + Number(l.vat_amount)), currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-sunken text-sm">
                  <td className="px-4 py-2 font-medium" colSpan={2}>Total</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMoney(net, currency)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMoney(vat, currency)}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatMoney(round2(net + vat), currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const PartyLinks: React.FC<{ invoiceId: string; invoice: CreditNoteDraft['invoice']; partyName: string | null }> = ({ invoiceId, invoice, partyName }) => (
  <>
    <HubProperty label="Customer">
      {invoice?.customer_company_id
        ? <Link className="text-primary hover:underline" to={`/crm/companies/${invoice.customer_company_id}`}>{partyName ?? 'Company'}</Link>
        : null}
    </HubProperty>
    <HubProperty label="Credits Invoice">
      <Link className="text-primary hover:underline" to={`${FINANCE_BASE}/invoices/${invoiceId}`}>{invoiceLabel(invoice)}</Link>
    </HubProperty>
  </>
);

export const CreditNoteDraftPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [draft, setDraft] = useState<CreditNoteDraft | null | 'missing'>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await creditNoteDraftsService.get(id);
      if (d?.issued_credit_note_id) { navigate(creditNoteUrl(d.issued_credit_note_id), { replace: true }); return; }
      setDraft(d ?? 'missing');
    } catch { setDraft('missing'); }
  }, [id, navigate]);
  useEffect(() => { void load(); }, [load]);

  if (draft === null) return <Loading />;
  if (draft === 'missing') return <NotFound />;
  const currency = draft.invoice?.currency ?? 'EUR';
  const docType = String(draft.invoice?.document_type ?? '').startsWith('11.') ? '11.4' : draft.correlated ? '5.1' : '5.2';

  const issue = async () => {
    setBusy('issue');
    try {
      const cnId = await creditNoteDraftsService.issue(draft.id);
      toast(issuedToast('Credit note', await transmitAfterIssue('credit_note', cnId, draft.workspace_id)));
      navigate(creditNoteUrl(cnId), { replace: true });
    } catch (err) {
      toast({ title: 'Could not issue', description: (err as { message?: string })?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };
  const remove = async () => {
    setBusy('delete');
    try { await creditNoteDraftsService.remove(draft.id); navigate(financeTabUrl(FINANCE_TAB.creditNotes)); }
    catch (err) { toast({ title: 'Could not delete', description: (err as { message?: string })?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  return (
    <HubRecordPage
      icon={FileMinus}
      title="Draft credit note"
      subtitle={`Against ${invoiceLabel(draft.invoice)} · ${docType}`}
      breadcrumbs={crumbs('Draft credit note')}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil className="mr-1.5 h-4 w-4" />Edit</Button>
          <Button size="sm" onClick={() => void issue()} disabled={!!busy}>
            {busy === 'issue' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileMinus className="mr-1.5 h-4 w-4" />}Issue &amp; send to myDATA
          </Button>
          <Button variant="ghost" size="icon" aria-label="Delete draft" onClick={() => void remove()} disabled={!!busy}><Trash2 className="h-4 w-4" /></Button>
        </>
      }
      overlays={
        <NewCreditNoteDialog
          workspaceId={draft.workspace_id}
          open={editing}
          draftId={draft.id}
          onOpenChange={setEditing}
          onCreated={(r) => { setEditing(false); if (r?.creditNoteId) navigate(creditNoteUrl(r.creditNoteId)); else void load(); }}
        />
      }
      left={
        <HubPanel title="Details">
          <HubPropertyList>
            <HubProperty label="Status"><Badge variant="neutral">Draft</Badge></HubProperty>
            <PartyLinks invoiceId={draft.invoice_id} invoice={draft.invoice} partyName={draft.party_name} />
            <HubProperty label="Document Type">{docType}</HubProperty>
            <HubProperty label="Reason">{draft.reason}</HubProperty>
            <HubProperty label="Last Changed">{formatDate(draft.updated_at)}</HubProperty>
          </HubPropertyList>
        </HubPanel>
      }
    >
      <p className="rounded-sm border border-hairline bg-surface-sunken px-4 py-3 text-sm text-muted-foreground">
        A draft is not a document yet: it has no number, does not reduce what the customer owes and is not in any report.
        Issuing numbers it and nets it against the invoice.
      </p>
      <LinesCard lines={draft.lines} currency={currency} action={<Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit draft</Button>} />
    </HubRecordPage>
  );
};

export const CreditNoteDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [cn, setCn] = useState<CreditNoteRecord | null | 'missing'>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);
  const authCode = useFiscalAuthCode('credit_notes', id ?? '', cn && cn !== 'missing' ? cn.fiscal_mark : null);

  const load = useCallback(async () => {
    if (!id) return;
    try { setCn((await creditNoteDraftsService.getIssued(id)) ?? 'missing'); }
    catch { setCn('missing'); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (cn === null) return <Loading />;
  if (cn === 'missing') return <NotFound />;
  const transmitted = isTransmitted(cn.fiscal_status);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (err) {
      toast({ title: 'Failed', description: (err as { message?: string })?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  return (
    <HubRecordPage
      icon={FileMinus}
      title={cn.credit_note_number}
      subtitle={`Credit note ${cn.document_type ?? ''} · against ${invoiceLabel(cn.invoice)}`}
      breadcrumbs={crumbs(cn.credit_note_number)}
      actions={
        <>
          <Button variant="outline" size="sm" disabled={!!busy} onClick={() => void run('pdf', async () => {
            const { pdf_url } = await financeService.generateCreditNotePdf(cn.id, true);
            if (pdf_url) window.open(pdf_url, '_blank', 'noopener');
          })}>
            {busy === 'pdf' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />}PDF
          </Button>
          {!cn.goods_returned_at && (
            <Button variant="outline" size="sm" onClick={() => setReceiving(true)}><PackageCheck className="mr-1.5 h-4 w-4" />Receive returned goods</Button>
          )}
        </>
      }
      overlays={
        <ReceiveReturnDialog
          creditNoteId={cn.id}
          creditNoteNumber={cn.credit_note_number}
          open={receiving}
          onOpenChange={setReceiving}
          onDone={() => { setReceiving(false); void load(); }}
        />
      }
      right={
        <>
          <FiscalRecordPanel
            record={cn}
            authenticationCode={authCode}
            sending={busy === 'fiscal'}
            onSend={() => void run('fiscal', async () => {
              const t = issuedToast('Credit Note', await transmitAfterIssue('credit_note', cn.id, cn.workspace_id));
              toast(t.variant ? t : { title: 'Sent to myDATA', description: t.description });
              await load();
            })}
          />
          <CustomerLinkPanel kind="credit_note" id={cn.id} workspaceId={cn.workspace_id} label={`Credit note ${cn.credit_note_number ?? ''}`.trim()} />
        </>
      }
      left={
        <HubPanel title="Details">
          <HubPropertyList>
            <HubProperty label="Status">
              <span className="flex flex-wrap gap-1.5">
                <Badge variant="info">Issued</Badge>
                {transmitted ? <Badge variant="success">myDATA ✓</Badge> : <Badge variant="warning">Not sent to myDATA</Badge>}
              </span>
            </HubProperty>
            <PartyLinks invoiceId={cn.invoice_id} invoice={cn.invoice} partyName={cn.party_name} />
            <HubProperty label="Document Type">{cn.document_type}</HubProperty>
            <HubProperty label="Issued">{cn.issued_at ? formatDate(cn.issued_at) : null}</HubProperty>
            <HubProperty label="Reason">{cn.reason}</HubProperty>
            <HubProperty label="Correlated MARK">{cn.correlated_mark ? <span className="font-mono text-xs">{cn.correlated_mark}</span> : null}</HubProperty>
            <HubProperty label="Goods Returned">{cn.goods_returned_at ? formatDate(cn.goods_returned_at) : <span className="text-muted-foreground">Nothing received back</span>}</HubProperty>
          </HubPropertyList>
        </HubPanel>
      }
    >
      <LinesCard lines={cn.items} currency={cn.currency} />
    </HubRecordPage>
  );
};

export default CreditNoteDetailPage;
