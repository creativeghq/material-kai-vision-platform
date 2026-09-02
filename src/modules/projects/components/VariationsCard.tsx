/**
 * The variation register — every agreed change to the scope, both directions.
 *
 * Client and supplier variations are shown in ONE register but never added together. A client
 * variation is money in, a supplier variation is money out, and the totals here are stated
 * separately for the same reason `get_order_settlements` keeps money IN and money OUT apart: the
 * platform has already shipped one implementation that netted the two and reported a fully-paid
 * order as owing money.
 *
 * Only APPROVED variations reach the CVR, and the register says which those are rather than
 * showing one total that quietly includes work nobody has agreed to pay for.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Check, X, GitPullRequestArrow } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { HubEmptyState } from '@/components/core/hub';
import { CostCodePicker } from '@/components/business/costCodes/CostCodePicker';
import { useToast } from '@/hooks/use-toast';
import { humanizeLabel } from '@/utils/humanize';
import { formatMoney } from '@/utils/decimal';
import { formatDate, todayLocalISO } from '@/utils/datetime';
import {
  variationsService, VARIATION_DIRECTIONS, VARIATION_ORIGINS, isVariationMoney,
  type ProjectVariation, type VariationDirection, type VariationOrigin, type VariationStatus,
} from '../services/variationsService';

interface Props {
  projectId: string;
  workspaceId: string | null;
  currency?: string;
  isOwner: boolean;
  /** Bumped when a variation changes so the CVR beside it reloads. */
  onChanged?: () => void;
}

const statusVariant = (s: VariationStatus) =>
  s === 'approved' ? 'success'
    : s === 'rejected' ? 'error'
      : s === 'withdrawn' ? 'neutral'
        : s === 'submitted' ? 'info' : 'neutral';

export const VariationsCard: React.FC<Props> = ({
  projectId, workspaceId, currency = 'EUR', isOwner, onChanged,
}) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<ProjectVariation[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState<VariationDirection | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await variationsService.list(projectId));
    } catch (e) {
      toast({ title: 'Failed to load variations', description: (e as Error).message, variant: 'destructive' });
      setRows([]);
    }
  }, [projectId, toast]);

  useEffect(() => { void load(); }, [load]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (e) {
      toast({ title: label, description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const money = (v: number) => formatMoney(v, currency);

  /**
   * Two totals, never one. Each counts only what the CVR counts, so the register and the
   * reconciliation cannot disagree about the job's value.
   */
  const totals = useMemo(() => {
    const list = rows ?? [];
    const approved = list.filter((v) => isVariationMoney(v.status));
    return {
      clientApproved: approved.filter((v) => v.direction === 'client')
        .reduce((s, v) => s + Number(v.value), 0),
      supplierApproved: approved.filter((v) => v.direction === 'supplier')
        .reduce((s, v) => s + Number(v.value), 0),
      pending: list.filter((v) => v.status === 'draft' || v.status === 'submitted').length,
    };
  }, [rows]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 px-5 py-3">
        <div>
          <CardTitle>Variations</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Changes to the agreed scope. Only approved ones reach the CVR.
          </p>
        </div>
        {isOwner && workspaceId && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setCreating('client')} disabled={busy}>
              <Plus className="h-3.5 w-3.5" /> Client
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCreating('supplier')} disabled={busy}>
              <Plus className="h-3.5 w-3.5" /> Subcontractor
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="px-0 py-0">
        {rows === null ? (
          <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <HubEmptyState
            icon={GitPullRequestArrow}
            title="No variations yet"
            description="Record a change to the agreed scope — an extra the client asked for, or an uplift a subcontractor is claiming — and it flows into the cost report once approved."
            action={isOwner && workspaceId
              ? <Button size="sm" onClick={() => setCreating('client')}><Plus className="h-3.5 w-3.5" /> Add a variation</Button>
              : undefined}
          />
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                  <th className="px-5 py-2 text-left">Ref</th>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">Origin</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2 text-right">Days</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-5 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id} className="border-t border-border/60">
                    <td className="px-5 py-2 font-mono text-xs tabular-nums text-muted-foreground">
                      {v.reference}
                    </td>
                    <td className="px-3 py-2">
                      {v.title}
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {v.direction === 'client' ? 'to client' : 'to subcontractor'}
                      </span>
                      {v.description && (
                        <p className="text-xs text-muted-foreground">{v.description}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{humanizeLabel(v.origin)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(Number(v.value))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {v.time_impact_days || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={statusVariant(v.status)}>{humanizeLabel(v.status)}</Badge>
                      {v.decided_at && (
                        <span className="ml-2 text-[11px] text-muted-foreground">
                          {formatDate(v.decided_at)}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2">
                      {isOwner && (
                        <div className="flex justify-end gap-1">
                          {(v.status === 'draft' || v.status === 'submitted') && (
                            <>
                              <Button size="sm" variant="ghost" title="Approve" disabled={busy}
                                onClick={() => void act('Could not approve', () => variationsService.setStatus(v.id, 'approved'))}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" title="Reject" disabled={busy}
                                onClick={() => void act('Could not reject', () => variationsService.setStatus(v.id, 'rejected'))}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="ghost" title="Delete" disabled={busy}
                            onClick={() => void act('Could not delete', () => variationsService.remove(v.id))}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border/60 px-5 py-3 text-xs">
            <span className="text-muted-foreground">
              Approved to client <span className="font-medium tabular-nums text-foreground">{money(totals.clientApproved)}</span>
            </span>
            <span className="text-muted-foreground">
              Approved to subcontractors <span className="font-medium tabular-nums text-foreground">{money(totals.supplierApproved)}</span>
            </span>
            {totals.pending > 0 && (
              <span className="text-amber-800 dark:text-amber-300">
                {totals.pending} not yet decided, so not in the CVR
              </span>
            )}
          </div>
        )}
      </CardContent>

      {creating && workspaceId && (
        <NewVariationDialog
          projectId={projectId}
          workspaceId={workspaceId}
          direction={creating}
          currency={currency}
          onClose={() => setCreating(null)}
          onSaved={() => { setCreating(null); void load(); onChanged?.(); }}
        />
      )}
    </Card>
  );
};

const NewVariationDialog: React.FC<{
  projectId: string;
  workspaceId: string;
  direction: VariationDirection;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ projectId, workspaceId, direction, currency, onClose, onSaved }) => {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [origin, setOrigin] = useState<VariationOrigin>('client_instruction');
  const [value, setValue] = useState('');
  const [days, setDays] = useState('');
  const [costCodeId, setCostCodeId] = useState<string | null>(null);
  const [raisedOn, setRaisedOn] = useState(todayLocalISO());
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amount = Number(value);
    if (!title.trim()) { toast({ title: 'Give it a title', variant: 'destructive' }); return; }
    if (!Number.isFinite(amount)) { toast({ title: 'Give it a value', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await variationsService.create({
        workspace_id: workspaceId,
        project_id: projectId,
        direction,
        title: title.trim(),
        description: description.trim() || null,
        origin,
        value: amount,
        currency,
        cost_code_id: costCodeId,
        time_impact_days: Number(days) || 0,
        raised_on: raisedOn,
      });
      onSaved();
    } catch (e) {
      toast({ title: 'Could not add the variation', description: (e as Error).message, variant: 'destructive' });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {direction === 'client' ? 'Variation to the client' : 'Variation from a subcontractor'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Extra radiators to the landing" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Detail</Label>
            <textarea
              className="min-h-20 w-full rounded-sm border border-hairline bg-background p-2 text-sm"
              value={description} onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Value ({currency})</Label>
              <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" />
              <p className="text-[11px] text-muted-foreground">
                Negative for an omission — work taken out.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Extra days</Label>
              <Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} placeholder="0" />
              <p className="text-[11px] text-muted-foreground">
                The programme claim, lost if it only lives in an email.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Why</Label>
              <Select value={origin} onValueChange={(v) => setOrigin(v as VariationOrigin)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VARIATION_ORIGINS.map((o) => (
                    <SelectItem key={o} value={o}>{humanizeLabel(o)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Raised on</Label>
              <Input type="date" value={raisedOn} onChange={(e) => setRaisedOn(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cost code</Label>
            <CostCodePicker value={costCodeId} onChange={setCostCodeId} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/** Re-exported so `VARIATION_DIRECTIONS` has a consumer and the vocabulary cannot silently rot. */
export { VARIATION_DIRECTIONS };
