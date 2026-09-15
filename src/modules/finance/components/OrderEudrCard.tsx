/**
 * Where this order stands under the EUDR (#449).
 *
 * MDF, plywood, joinery and wooden kitchen furniture are named in Annex I and there is no size
 * deferral for them — those headings were already in the EUTR Annex, so 30 December 2026 is the
 * date for every size of business. Ceramics, metal furniture and plastic are out entirely.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, TreePine, Plus } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  eudrService, eudrLineNeedsAttention, eudrCollectsCustomerIdentity,
  EUDR_OBLIGATIONS, EUDR_APPLIES_FROM,
  type EudrOrderPosition, type EudrOrderLine, type EudrRole, type EudrStatement,
} from '@/modules/finance/services/eudrService';

const ROLE_LABEL: Record<EudrRole, string> = {
  operator: 'Operator',
  downstream_operator: 'Downstream operator',
  trader: 'Trader',
  out_of_scope: 'Out of scope',
};

const ROLE_TONE: Record<EudrRole, 'warning' | 'info' | 'neutral'> = {
  operator: 'warning',
  downstream_operator: 'info',
  trader: 'info',
  out_of_scope: 'neutral',
};

export const OrderEudrCard: React.FC<{
  orderId: string;
  workspaceId: string;
  /** Art 5(3)(b) asks for the CUSTOMER identity on a sale, and only a business one. */
  isSale?: boolean;
  customerIsBusiness?: boolean;
}> = ({ orderId, workspaceId, isSale = false, customerIsBusiness = false }) => {
  const { toast } = useToast();
  const [position, setPosition] = useState<EudrOrderPosition | null>(null);
  const [statements, setStatements] = useState<EudrStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [recordFor, setRecordFor] = useState<EudrOrderLine | null>(null);
  const [ref, setRef] = useState('');
  const [declId, setDeclId] = useState('');
  const [netMass, setNetMass] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        eudrService.orderPosition(orderId),
        eudrService.listStatements(workspaceId, orderId).catch(() => [] as EudrStatement[]),
      ]);
      setPosition(p); setStatements(s); setFailed(false);
    } catch {
      setPosition(null); setStatements([]); setFailed(true);
    } finally { setLoading(false); }
  }, [orderId, workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const record = async () => {
    if (!recordFor || !ref.trim()) return;
    setSaving(true);
    try {
      await eudrService.recordStatement({
        workspace_id: workspaceId,
        reference_number: ref.trim(),
        declaration_identifier: declId.trim() || null,
        origin_of_statement: recordFor.role === 'operator' ? 'ours' : 'supplier',
        order_id: orderId,
        order_item_id: recordFor.order_item_id,
        net_mass_kg: netMass.trim() ? Number(netMass) : null,
      } as never);
      setRecordFor(null); setRef(''); setDeclId(''); setNetMass('');
      await load();
      toast({ title: 'Due diligence statement recorded' });
    } catch (err: unknown) {
      toast({
        title: 'Could not record the statement',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking this order against EUDR Annex I…
      </div>
    );
  }

  if (failed || !position || position.status !== 'ok') {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          This order could not be checked against EUDR Annex I just now. That is not a statement
          that nothing on it is in scope.
        </span>
      </div>
    );
  }

  const relevant = (position.lines ?? []).filter((l) => l.role !== 'out_of_scope');
  const checkedOut = (position.lines ?? []).length - relevant.length;
  const roles = new Set(relevant.map((l) => l.role).filter(Boolean) as EudrRole[]);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md border border-hairline bg-surface-sunken p-2 text-xs">
        <TreePine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">Deforestation Regulation — applies {EUDR_APPLIES_FROM}</p>
          <p className="text-muted-foreground">{position.reason}</p>
        </div>
      </div>

      {relevant.length > 0 && (
        <div className="table-scroll">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line</TableHead>
                <TableHead>CN</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead>Our role</TableHead>
                <TableHead>Species</TableHead>
                <TableHead>Statement</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {relevant.map((l) => (
                <TableRow key={l.order_item_id}>
                  <TableCell>{l.description ?? '—'}</TableCell>
                  <TableCell className="tabular-nums">{l.cn || '—'}</TableCell>
                  <TableCell>
                    {l.origin ?? <span className="text-destructive">not recorded</span>}
                  </TableCell>
                  <TableCell>
                    {l.role
                      ? <Badge variant={ROLE_TONE[l.role]}>{ROLE_LABEL[l.role]}</Badge>
                      : <Badge variant="error">Undecidable</Badge>}
                  </TableCell>
                  <TableCell>
                    {l.species_scientific
                      ? <span className="italic">{l.species_scientific}</span>
                      : <span className="text-destructive">no scientific name</span>}
                  </TableCell>
                  <TableCell>
                    {l.has_statement
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    {eudrLineNeedsAttention(l) && (
                      <Button size="sm" variant="ghost" onClick={() => setRecordFor(l)}>
                        <Plus className="mr-1 h-3 w-3" /> Statement
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {relevant.some((l) => eudrLineNeedsAttention(l)) && (
        <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[11px]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            {relevant.find((l) => eudrLineNeedsAttention(l))?.reason}
          </span>
        </p>
      )}

      {[...roles].filter((r) => r !== 'out_of_scope').map((r) => (
        <div key={r} className="rounded-md border border-hairline p-2 text-[11px]">
          <p className="font-medium">{ROLE_LABEL[r]} — what that costs</p>
          <ul className="ml-4 mt-1 list-disc space-y-0.5 text-muted-foreground">
            {EUDR_OBLIGATIONS[r as Exclude<EudrRole, 'out_of_scope'>].map((o) => <li key={o}>{o}</li>)}
          </ul>
        </div>
      ))}

      {statements.length > 0 && (
        <div className="rounded-md border border-hairline p-2 text-[11px]">
          <p className="font-medium">Statements on this order</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {statements.map((s) => (
              <li key={s.id} className="tabular-nums">
                {s.reference_number}
                {s.declaration_identifier ? ` · ${s.declaration_identifier}` : ''}
                {` · kept to ${s.retain_until}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {checkedOut > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {checkedOut} further lines were checked against Annex I and are out of scope.
        </p>
      )}

      {isSale && relevant.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {eudrCollectsCustomerIdentity({ isBusiness: customerIsBusiness })
            ? 'Art 5(3)(b): this is a business customer, so their name, address, email and website are collected and kept five years with the DDS references.'
            : 'Art 5(3)(b) reaches business customers only. Nothing is collected about a consumer here — doing it anyway would be over-collection, which is its own breach.'}
        </p>
      )}

      {recordFor && (
        <div className="space-y-2 rounded-md border border-hairline p-2">
          <p className="text-xs font-medium">
            Due diligence statement for {recordFor.description ?? 'this line'}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="eudr-ref" className="text-[11px]">DDS reference number</Label>
              <Input
                id="eudr-ref" className="h-9 w-64" value={ref}
                onChange={(e) => setRef(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="eudr-decl" className="text-[11px]">Declaration identifier</Label>
              <Input
                id="eudr-decl" className="h-9 w-56" value={declId}
                onChange={(e) => setDeclId(e.target.value)} placeholder="optional"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="eudr-mass" className="text-[11px]">Net mass (kg)</Label>
              <Input
                id="eudr-mass" type="number" className="h-9 w-32" value={netMass}
                onChange={(e) => setNetMass(e.target.value)}
              />
            </div>
            <Button onClick={record} disabled={saving || !ref.trim()}>
              {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Record
            </Button>
            <Button variant="ghost" onClick={() => setRecordFor(null)}>Cancel</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            The reference number and the declaration identifier are what the Regulation names. A
            TRACES retrieval code is a convenience it issues alongside them, not a requirement.
          </p>
        </div>
      )}
    </div>
  );
};
