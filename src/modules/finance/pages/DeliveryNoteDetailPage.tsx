/** One delivery note: read it, edit it while it is a draft, issue it, then transmit it. */
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FileText, Loader2, Pencil, Send, Truck } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState, HubPanel, HubProperty, HubPropertyList, HubRecordPage } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import { humanizeLabel } from '@/utils/humanize';
import { unitSuffix } from '@/lib/units';
import { FINANCE_BASE, FINANCE_TAB, financeTabUrl } from '@/modules/finance/routes';
import { deliveryNotesService, deliveryNoteRelation, type DeliveryNoteDetail } from '@/modules/finance/services/deliveryNotesService';
import { NewDeliveryNoteDialog } from '@/modules/finance/components/NewDeliveryNoteDialog';
import { movePurposeLabel, movementDocTypeLabel } from '@/services/fiscal/fiscalVocabulary';

const STATUS_VARIANT: Record<string, 'neutral' | 'info' | 'success' | 'error'> = {
  draft: 'neutral', issued: 'info', invoiced: 'success', void: 'error',
};

const address = (parts: (string | null | undefined)[]) => parts.filter((x) => x && String(x).trim()).join(', ');

export const DeliveryNoteDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [note, setNote] = useState<DeliveryNoteDetail | null | 'missing'>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try { setNote((await deliveryNotesService.get(id)) ?? 'missing'); }
    catch (err) {
      toast({ title: 'Could not load the delivery note', description: (err as { message?: string })?.message, variant: 'destructive' });
      setNote('missing');
    }
  }, [id, toast]);
  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (err) {
      toast({ title: 'Failed', description: (err as { message?: string })?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  if (note === null) {
    return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (note === 'missing') {
    return (
      <div className="p-6">
        <HubEmptyState
          icon={Truck}
          title="Delivery note not found"
          description="It may have been removed, or it belongs to another workspace."
          action={<Button variant="outline" onClick={() => navigate(financeTabUrl(FINANCE_TAB.deliveryNotes))}>Back to Delivery Notes</Button>}
        />
      </div>
    );
  }

  const isReturn = !!note.return_of_inbound_document_id;
  const isDraft = note.status === 'draft';
  const docType = note.mydata_document_type ?? (note.kind === 'receipt' ? '10.2' : '9.3');
  const title = note.delivery_note_number ?? (isReturn ? 'Draft return to supplier' : 'Draft delivery note');
  const kindLabel = isReturn ? 'Return to supplier' : note.kind === 'receipt' ? 'Goods receipt' : 'Dispatch to customer';
  const relation = deliveryNoteRelation(note);

  const issue = () => run('issue', async () => {
    const r = await deliveryNotesService.issue(note.id);
    toast({
      title: `Issued ${r.delivery_note_number ?? ''}`.trim(),
      description: r.skipped > 0
        ? `${r.moved} line(s) moved stock. Not linked to a stock item, so nothing moved: ${r.skipped_lines.join(', ')}.`
        : `${r.moved} line(s) moved stock.`,
    });
    await load();
  });
  const sendFiscal = () => run('fiscal', async () => {
    const r = await deliveryNotesService.submitFiscal(note.id);
    toast({ title: r?.fiscal?.mark ? `Sent to myDATA · MARK ${r.fiscal.mark}` : 'Sent to myDATA' });
    await load();
  });
  const pdf = () => run('pdf', async () => {
    const url = await deliveryNotesService.generatePdf(note.id, true);
    if (url) window.open(url, '_blank', 'noopener');
  });
  const toInvoice = () => run('invoice', async () => {
    const invId = await deliveryNotesService.toInvoice(note.id);
    navigate(`${FINANCE_BASE}/invoices/${invId}`);
  });

  return (
    <HubRecordPage
      icon={Truck}
      title={title}
      subtitle={`${kindLabel} · ${movementDocTypeLabel(docType)}`}
      breadcrumbs={[
        { label: 'Finance', to: FINANCE_BASE },
        { label: 'Delivery Notes', to: financeTabUrl(FINANCE_TAB.deliveryNotes) },
        { label: title },
      ]}
      actions={
        <>
          {isDraft && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-1.5 h-4 w-4" />Edit
            </Button>
          )}
          {isDraft && (
            <Button size="sm" onClick={issue} disabled={!!busy}>
              {busy === 'issue' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Truck className="mr-1.5 h-4 w-4" />}
              Issue ({note.kind === 'receipt' ? 'add to stock' : 'take out of stock'})
            </Button>
          )}
          {!isDraft && (
            <Button variant="outline" size="sm" onClick={pdf} disabled={!!busy}>
              {busy === 'pdf' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />}PDF
            </Button>
          )}
          {note.status === 'issued' && note.kind === 'dispatch' && note.fiscal_status !== 'accepted' && (
            <Button size="sm" onClick={sendFiscal} disabled={!!busy}>
              {busy === 'fiscal' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}Send to myDATA
            </Button>
          )}
          {/* A return is refunded by the supplier's credit note, never invoiced. */}
          {note.status === 'issued' && note.kind === 'dispatch' && !isReturn && (
            <Button variant="outline" size="sm" onClick={toInvoice} disabled={!!busy}>Create invoice</Button>
          )}
        </>
      }
      overlays={
        <NewDeliveryNoteDialog
          workspaceId={note.workspace_id}
          open={editing}
          noteId={note.id}
          onOpenChange={setEditing}
          onCreated={() => { setEditing(false); void load(); }}
        />
      }
      left={
        <HubPanel title="Details">
          <HubPropertyList>
            <HubProperty label="Status">
              <span className="flex flex-wrap gap-1.5">
                <Badge variant={STATUS_VARIANT[note.status] ?? 'neutral'}>{humanizeLabel(note.status)}</Badge>
                {note.fiscal_mark && !note.fiscal_cancellation_mark && <Badge variant="success">myDATA ✓</Badge>}
                {note.fiscal_cancellation_mark && <Badge variant="warning">myDATA cancelled</Badge>}
              </span>
            </HubProperty>
            <HubProperty label={note.kind === 'receipt' || isReturn ? 'Supplier' : 'Customer'}>
              {note.customer_company_id
                ? <Link className="text-primary hover:underline" to={`/crm/companies/${note.customer_company_id}`}>{note.company_name ?? 'Company'}</Link>
                : null}
            </HubProperty>
            <HubProperty label="For">
              {relation
                ? (relation.to ? <Link className="text-primary hover:underline" to={relation.to}>{relation.label}</Link> : relation.label)
                : null}
            </HubProperty>
            <HubProperty label="Document type">{movementDocTypeLabel(docType)}</HubProperty>
            {note.kind === 'dispatch' && (
              <HubProperty label="Purpose">{note.move_purpose ? `${note.move_purpose} — ${movePurposeLabel(note.move_purpose)}` : null}</HubProperty>
            )}
            <HubProperty label="Issued">{note.issued_at ? formatDate(note.issued_at) : null}</HubProperty>
            <HubProperty label="Transport date">{note.transport_date ? formatDate(note.transport_date) : null}</HubProperty>
            <HubProperty label="Vehicle">{note.vehicle_number}</HubProperty>
            <HubProperty label="Loading place">
              {address([note.ship_from_street, note.ship_from_number, note.ship_from_postal, note.ship_from_city]) || (
                <span className="text-muted-foreground">Your business address</span>
              )}
            </HubProperty>
            <HubProperty label="Delivery place">
              {address([note.ship_to_street, note.ship_to_number, note.ship_to_postal, note.ship_to_city]) || (
                <span className="text-muted-foreground">{note.customer_company_id ? "The company's address" : null}</span>
              )}
            </HubProperty>
            <HubProperty label="MARK">{note.fiscal_mark ? <span className="font-mono text-xs">{note.fiscal_mark}</span> : null}</HubProperty>
            {note.fiscal_error && (
              <HubProperty label="myDATA error"><span className="text-destructive">{note.fiscal_error}</span></HubProperty>
            )}
          </HubPropertyList>
        </HubPanel>
      }
      right={isReturn ? (
        <HubPanel title="How this return works">
          <p className="text-xs text-muted-foreground">
            Issuing takes the linked lines out of stock. The money comes back on the supplier&apos;s own credit note,
            which arrives through myDATA.
          </p>
        </HubPanel>
      ) : undefined}
    >
      <Card>
        <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
        <CardContent className="p-0">
          {note.items.length === 0 ? (
            <div className="p-4">
              <HubEmptyState
                icon={Truck}
                title="No lines"
                description="A note needs at least one line before it can be issued."
                action={isDraft ? <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit note</Button> : undefined}
              />
            </div>
          ) : (
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead className="border-b border-hairline bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">#</th>
                    <th className="px-4 py-2 text-left">Description</th>
                    <th className="px-4 py-2 text-left">Code</th>
                    <th className="px-4 py-2 text-right">Quantity</th>
                    <th className="px-4 py-2 text-left">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {note.items.map((it, i) => (
                    <tr key={it.id} className="border-b border-hairline">
                      <td className="px-4 py-2 text-muted-foreground tabular-nums">{it.source_line_number ?? i + 1}</td>
                      <td className="px-4 py-2">{it.description}</td>
                      <td className="px-4 py-2 font-mono text-xs">{it.sku ?? '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(it.quantity)} {unitSuffix(it.unit)}</td>
                      <td className="px-4 py-2 text-xs">
                        {it.warehouse_item_id
                          ? <span>{isDraft ? 'Moves on issue' : 'Moved'}</span>
                          : <span className="text-muted-foreground">No stock movement</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {note.notes && (
        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm">{note.notes}</p></CardContent>
        </Card>
      )}
    </HubRecordPage>
  );
};

export default DeliveryNoteDetailPage;
