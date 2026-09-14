/**
 * What a trade customer sees of their own account (#441).
 *
 * The link is the identity: unique to the recipient, with no account for them to create and forget.
 * Everything below is scoped by it, and the statement is the ledger's own figure rather than a
 * second total computed here with the customer watching.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertTriangle, Receipt, ShieldQuestion, RotateCcw, Check, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { formatDate } from '@/utils/datetime';
import {
  tradePortalService, ROLE_LABEL, APPROVAL_LABEL, canManageColleagues, mayBuy, isUncapped,
  STATEMENT_IS_ONE_DERIVATION, DRAFT_UNTIL_WE_CONFIRM,
  type Statement, type HistoryLine, type ApprovalRow,
} from '@/modules/crm/services/tradePortalService';

const TradePortalPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [statement, setStatement] = useState<Statement | null>(null);
  const [history, setHistory] = useState<HistoryLine[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const s = await tradePortalService.statement(token);
      setStatement(s);
      if (s.ok) {
        const [h, a] = await Promise.all([
          tradePortalService.history(token).catch(() => ({ ok: false, rows: [] })),
          tradePortalService.approvals(token).catch(() => ({ ok: false, rows: [] })),
        ]);
        setHistory(h.rows ?? []);
        setApprovals(a.rows ?? []);
      }
      setFailed(false);
    } catch {
      setStatement(null); setFailed(true);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (failed || !statement?.ok) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldQuestion className="h-4 w-4" /> This link is not valid
            </CardTitle>
            <CardDescription>
              {statement?.reason ?? 'We could not open your account just now.'} Ask us for a new one
              — links are personal and they expire.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const reorder = async (l: HistoryLine) => {
    if (!token) return;
    setBusy(true);
    try {
      const res = await tradePortalService.placeOrder(token, [{
        product_id: l.product_id,
        description: l.description ?? 'Reorder',
        quantity: l.quantity,
        unit_price: l.unit_price,
      }]);
      toast({
        title: res.needs_approval ? 'Sent for approval' : 'Order placed',
        description: res.reason,
      });
      await load();
    } catch (err: unknown) {
      toast({
        title: 'Could not place the order',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const decide = async (a: ApprovalRow, decision: 'approved' | 'declined') => {
    if (!token) return;
    setBusy(true);
    try {
      await tradePortalService.decide(token, a.id, decision);
      await load();
    } catch (err: unknown) {
      toast({
        title: 'Could not record the decision',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const pending = approvals.filter((a) => a.status === 'pending');
  const items = statement.open_items ?? [];
  const totalOutstanding = items.reduce((s, i) => s + Number(i.outstanding ?? 0), 0);

  return (
    <div className="mx-auto min-h-screen max-w-4xl space-y-4 px-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Receipt className="h-4 w-4 text-primary" />
            {statement.company_name ?? 'Your account'}
            {statement.role && <Badge variant="neutral">{ROLE_LABEL[statement.role]}</Badge>}
          </CardTitle>
          <CardDescription>
            {statement.display_name || statement.email}
            {mayBuy(statement)
              ? isUncapped(
                { spend_limit_per_order: statement.spend_limit_per_order ?? null },
              )
                ? ' — no per-order cap'
                : ` — up to ${statement.spend_limit_per_order} per order`
              : ' — you can see the account but not place orders'}
            {canManageColleagues(statement)
              && '. You can also add and cap your own colleagues.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 text-xs">
          {items.length === 0 && (
            <HubEmptyState
              title="Nothing outstanding"
              description="Every invoice on your account is settled. Anything issued later will appear here."
            />
          )}

          {items.length > 0 && (
            <>
              <p className="tabular-nums font-medium">
                {items.length} open item(s) · {totalOutstanding.toFixed(2)} outstanding
              </p>
              <div className="table-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Issued</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((i) => (
                      <TableRow key={i.invoice_id}>
                        <TableCell>{i.number ?? '—'}</TableCell>
                        <TableCell className="tabular-nums">
                          {i.issued_at ? formatDate(i.issued_at) : '—'}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {i.due_at ? formatDate(i.due_at) : '—'}
                          {i.days_past_due != null && i.days_past_due > 0 && (
                            <Badge variant="warning" className="ml-2">
                              {i.days_past_due}d overdue
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{i.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{i.outstanding}</TableCell>
                        <TableCell className="text-right">
                          {i.pay_token && (
                            <a
                              className="text-primary underline"
                              href={`/pay/${i.pay_token}`}
                              rel="noreferrer"
                            >
                              Pay
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          <p className="text-[11px] text-muted-foreground">{STATEMENT_IS_ONE_DERIVATION}</p>
          <p className="text-[11px] text-muted-foreground">{DRAFT_UNTIL_WE_CONFIRM}</p>
        </CardContent>
      </Card>

      {mayBuy(statement) && history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RotateCcw className="h-4 w-4 text-primary" /> Order it again
            </CardTitle>
            <CardDescription>
              What you have had before, at your prices. Over your per-order cap it becomes a request
              for your own administrator rather than a refusal from us.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            {history.slice(0, 12).map((l, i) => (
              <div key={`${l.product_id ?? 'x'}-${i}`} className="flex flex-wrap items-center gap-2 border-b border-hairline pb-1">
                <span className="font-medium">{l.description ?? 'Line'}</span>
                <span className="tabular-nums text-muted-foreground">
                  {l.quantity} x {l.unit_price}
                </span>
                {l.ordered_at && (
                  <span className="tabular-nums text-muted-foreground">
                    {formatDate(l.ordered_at)}
                  </span>
                )}
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                  disabled={busy} onClick={() => reorder(l)}>
                  <RotateCcw className="mr-1 h-3 w-3" /> Reorder
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {canManageColleagues(statement) && pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Waiting on you</CardTitle>
            <CardDescription>
              Your colleagues' orders above their cap. You set the caps and you decide these — we do
              not.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            {pending.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 border-b border-hairline pb-1">
                <Badge variant="warning">{APPROVAL_LABEL[a.status]}</Badge>
                <span className="tabular-nums">
                  {a.amount}{a.limit_at_request != null ? ` against a cap of ${a.limit_at_request}` : ''}
                </span>
                <span className="tabular-nums text-muted-foreground">{formatDate(a.created_at)}</span>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                  disabled={busy} onClick={() => decide(a, 'approved')}>
                  <Check className="mr-1 h-3 w-3" /> Approve
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                  disabled={busy} onClick={() => decide(a, 'declined')}>
                  <X className="mr-1 h-3 w-3" /> Decline
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!failed && statement.ok && (
        <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          This link is personal to you and it expires. If somebody else needs access, your account
          administrator can add them.
        </p>
      )}
    </div>
  );
};

export default TradePortalPage;
