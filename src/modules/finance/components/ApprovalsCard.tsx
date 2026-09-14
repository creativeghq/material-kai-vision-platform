/**
 * The approval spine, in one place (#426, #435).
 *
 * Credit holds, margin floors and till variances share these bands and this queue, because they
 * are the same three questions. Entersoft's κλίμακες ποσού is the shape: a band, and a named
 * approver per band — not a single yes/no anyone with the setting can flip.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, ShieldCheck, Plus, Trash2, Check, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { WORKSPACE_MEMBER_ROLES, workspaceRoleLabel } from '@/auth/workspaceRoles';
import {
  approvalService, SUBJECT_LABEL,
  type ApprovalPolicy, type ApprovalRequest, type ApprovalSubject, type ApprovalAction,
} from '@/modules/finance/services/approvalService';

const SUBJECTS: ApprovalSubject[] = ['credit_hold', 'margin_floor', 'pos_variance'];
const ACTIONS: ApprovalAction[] = ['warn', 'block', 'approve'];

const ACTION_HELP: Record<ApprovalAction, string> = {
  warn: 'Informs and lets it through',
  block: 'Refuses outright — nobody can wave it through',
  approve: 'Refuses until the named role signs for it',
};

const roleOptions = () => [...WORKSPACE_MEMBER_ROLES];

const blankPolicy = (workspaceId: string): Partial<ApprovalPolicy> & { workspace_id: string; subject: ApprovalSubject } => ({
  workspace_id: workspaceId,
  subject: 'credit_hold',
  workspace_role: null,
  band_from: 0,
  band_to: null,
  action: 'warn',
  approver_role: null,
  grace_days: 0,
  grace_basis: 'calendar',
  is_active: true,
});

export const ApprovalsCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [policies, setPolicies] = useState<ApprovalPolicy[]>([]);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [draft, setDraft] = useState<(Partial<ApprovalPolicy> & { workspace_id: string; subject: ApprovalSubject }) | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ps, rs] = await Promise.all([
        approvalService.listPolicies(workspaceId),
        approvalService.listRequests(workspaceId),
      ]);
      setPolicies(ps); setRequests(rs); setFailed(false);
    } catch {
      setPolicies([]); setRequests([]); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const savePolicy = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await approvalService.savePolicy(draft);
      setDraft(null);
      await load();
      toast({ title: 'Policy saved' });
    } catch (err: unknown) {
      toast({
        title: 'Could not save the policy',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const removePolicy = async (id: string) => {
    try { await approvalService.deletePolicy(id); await load(); }
    catch (err: unknown) {
      toast({
        title: 'Could not remove the policy',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  const decide = async (r: ApprovalRequest, approve: boolean) => {
    const why = (reasons[r.id] ?? '').trim();
    if (!why) {
      toast({ title: 'Say why', description: 'An override nobody explained is worse than no control.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      await approvalService.decide(r.id, approve, why);
      setReasons((m) => ({ ...m, [r.id]: '' }));
      await load();
      toast({ title: approve ? 'Approved' : 'Declined' });
    } catch (err: unknown) {
      toast({
        title: 'Could not record the decision',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const pending = requests.filter((r) => r.status === 'pending');

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" /> Approvals and authority
          </CardTitle>
          <CardDescription>
            One set of bands for credit holds, margin floors and till variances. Every verdict is
            enforced at the write, not in the dialog — and every override is signed.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setDraft(blankPolicy(workspaceId))}>
          <Plus className="mr-2 h-3.5 w-3.5" /> New band
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading policies…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The approval policies could not be read just now. That is not a statement that none are
            configured — the write is gated server-side either way.
          </p>
        )}

        {!loading && !failed && policies.length === 0 && !draft && (
          <HubEmptyState
            title="No approval bands configured"
            description="Until a band exists nothing is checked — which is not the same as everything being approved."
            action={(
              <Button size="sm" onClick={() => setDraft(blankPolicy(workspaceId))}>
                <Plus className="mr-2 h-3.5 w-3.5" /> New band
              </Button>
            )}
          />
        )}

        {policies.length > 0 && (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Applies to</TableHead>
                  <TableHead className="text-right">Band</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Approver</TableHead>
                  <TableHead>Limits</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{SUBJECT_LABEL[p.subject]}</TableCell>
                    <TableCell>{p.workspace_role ?? 'every role'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.band_from} – {p.band_to ?? '∞'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.action === 'block' ? 'error' : p.action === 'approve' ? 'warning' : 'neutral'}>
                        {p.action}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.approver_role ?? '—'}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">
                      {p.min_margin_percent != null && <div>min margin {p.min_margin_percent}%</div>}
                      {p.max_discount_percent != null && <div>max discount {p.max_discount_percent}%</div>}
                      {p.grace_days != null && p.subject === 'credit_hold' && (
                        <div>{p.grace_days} {p.grace_basis} grace days</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm" variant="ghost" className="h-7 px-2"
                        onClick={() => removePolicy(p.id)} aria-label="Remove this band"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {draft && (
          <div className="grid gap-2 rounded-md border border-hairline p-3 sm:grid-cols-3">
            <div>
              <Label className="text-[11px]">Subject</Label>
              <Select
                value={draft.subject}
                onValueChange={(v) => setDraft((d) => (d ? { ...d, subject: v as ApprovalSubject } : d))}
              >
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{SUBJECT_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px]">Applies to role</Label>
              <Select
                value={draft.workspace_role ?? '__all'}
                onValueChange={(v) => setDraft((d) => (d ? { ...d, workspace_role: v === '__all' ? null : v } : d))}
              >
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Every role</SelectItem>
                  {roleOptions().map((r) => <SelectItem key={r} value={r}>{workspaceRoleLabel(r)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px]">Approver role</Label>
              <Select
                value={draft.approver_role ?? '__none'}
                onValueChange={(v) => setDraft((d) => (d ? { ...d, approver_role: v === '__none' ? null : v } : d))}
              >
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Nobody</SelectItem>
                  {roleOptions().map((r) => <SelectItem key={r} value={r}>{workspaceRoleLabel(r)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px]">Band from</Label>
              <Input
                type="number" className="mt-1 h-8 text-xs" value={String(draft.band_from ?? 0)}
                onChange={(e) => setDraft((d) => (d ? { ...d, band_from: Number(e.target.value) } : d))}
              />
            </div>
            <div>
              <Label className="text-[11px]">Band to (blank = no ceiling)</Label>
              <Input
                type="number" className="mt-1 h-8 text-xs" value={draft.band_to == null ? '' : String(draft.band_to)}
                onChange={(e) => setDraft((d) => (d ? { ...d, band_to: e.target.value === '' ? null : Number(e.target.value) } : d))}
              />
            </div>
            <div>
              <Label className="text-[11px]">Action</Label>
              <Select
                value={draft.action ?? 'warn'}
                onValueChange={(v) => setDraft((d) => (d ? { ...d, action: v as ApprovalAction } : d))}
              >
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((a) => <SelectItem key={a} value={a}>{a} — {ACTION_HELP[a]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {draft.subject === 'margin_floor' && (
              <>
                <div>
                  <Label className="text-[11px]">Minimum margin %</Label>
                  <Input
                    type="number" className="mt-1 h-8 text-xs"
                    value={draft.min_margin_percent == null ? '' : String(draft.min_margin_percent)}
                    onChange={(e) => setDraft((d) => (d ? { ...d, min_margin_percent: e.target.value === '' ? null : Number(e.target.value) } : d))}
                  />
                </div>
                <div>
                  <Label className="text-[11px]">Maximum discount %</Label>
                  <Input
                    type="number" className="mt-1 h-8 text-xs"
                    value={draft.max_discount_percent == null ? '' : String(draft.max_discount_percent)}
                    onChange={(e) => setDraft((d) => (d ? { ...d, max_discount_percent: e.target.value === '' ? null : Number(e.target.value) } : d))}
                  />
                </div>
              </>
            )}

            {draft.subject === 'credit_hold' && (
              <>
                <div>
                  <Label className="text-[11px]">Grace days</Label>
                  <Input
                    type="number" className="mt-1 h-8 text-xs" value={String(draft.grace_days ?? 0)}
                    onChange={(e) => setDraft((d) => (d ? { ...d, grace_days: Number(e.target.value) } : d))}
                  />
                </div>
                <div>
                  <Label className="text-[11px]">Counted as</Label>
                  <Select
                    value={draft.grace_basis ?? 'calendar'}
                    onValueChange={(v) => setDraft((d) => (d ? { ...d, grace_basis: v as 'calendar' | 'working' } : d))}
                  >
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="calendar">Calendar days</SelectItem>
                      <SelectItem value="working">Working days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="flex items-end gap-2 sm:col-span-3">
              <Button size="sm" onClick={savePolicy} disabled={busy}>Save band</Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Waiting on a signature</p>
          {pending.length === 0
            ? <p className="text-xs text-muted-foreground">Nothing is waiting on an approval.</p>
            : pending.map((r) => (
              <div key={r.id} className="space-y-2 rounded-md border border-hairline p-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="warning">{SUBJECT_LABEL[r.subject]}</Badge>
                  <span className="tabular-nums">{r.amount != null ? r.amount.toFixed(2) : '—'}</span>
                  <span className="text-muted-foreground">{r.entity_table} {r.entity_id.slice(0, 8)}</span>
                  {r.approver_role && <span className="text-muted-foreground">needs {r.approver_role}</span>}
                </div>
                {r.request_reason && <p className="text-muted-foreground">{r.request_reason}</p>}
                {Object.keys(r.context ?? {}).length > 0 && (
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {Object.entries(r.context).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}
                  </p>
                )}
                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    className="h-8 w-72 text-xs"
                    placeholder="why — this is recorded against your name"
                    value={reasons[r.id] ?? ''}
                    onChange={(e) => setReasons((m) => ({ ...m, [r.id]: e.target.value }))}
                    aria-label="Reason for the decision"
                  />
                  <Button size="sm" onClick={() => decide(r, true)} disabled={busy}>
                    <Check className="mr-1 h-3 w-3" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => decide(r, false)} disabled={busy}>
                    <X className="mr-1 h-3 w-3" /> Decline
                  </Button>
                </div>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
};
