/**
 * Self-billing (αυτοτιμολόγηση) authorizations. Issuing in a supplier's name needs two facts that
 * cannot be derived from our own data — ΑΑΔΕ's prior written agreement, and the supplier's ΑΦΜ
 * authorized on the e-invoicing provider account — so both are recorded here and
 * `self_billing_blocks()` refuses issuance until they are.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import {
  HubToolbar, HubFilterSelect, HubResetFilters, HubSortButton, HubCellLink, HubCellEmpty, useHubTable,
  HUB_FILTER_ALL, type HubTableField, type HubSort,
} from '@/components/core/hub';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Loader2, Plus, Handshake } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { todayLocalISO } from '@/utils/datetime';

interface AgreementRow {
  id: string;
  supplier_company_id: string;
  supplier_name: string;
  agreement_signed_on: string | null;
  issuer_vat_authorized_on: string | null;
  authorized_issuer_vat: string | null;
  is_active: boolean;
  revoked_on: string | null;
  /** The supplier's ΑΦΜ as it stands in CRM today — drift from the authorized one blocks issuance. */
  current_vat: string | null;
}

type AgreementState = 'revoked' | 'drifted' | 'incomplete' | 'active';

const STATE_LABEL: Record<AgreementState, string> = {
  revoked: 'Revoked', drifted: 'ΑΦΜ changed', incomplete: 'Incomplete', active: 'Active',
};

const stateOf = (r: AgreementRow): AgreementState => {
  if (!r.is_active) return 'revoked';
  const drifted = !!r.authorized_issuer_vat && !!r.current_vat
    && r.authorized_issuer_vat.replace(/\D/g, '') !== r.current_vat.replace(/\D/g, '');
  if (drifted) return 'drifted';
  if (!r.agreement_signed_on || !r.issuer_vat_authorized_on) return 'incomplete';
  return 'active';
};

const FIELDS: HubTableField<AgreementRow>[] = [
  { id: 'supplier', sortValue: (r) => r.supplier_name, searchText: (r) => r.supplier_name },
  { id: 'vat', sortValue: (r) => r.authorized_issuer_vat, searchText: (r) => r.authorized_issuer_vat },
  { id: 'signed', sortValue: (r) => r.agreement_signed_on },
  { id: 'authorized', sortValue: (r) => r.issuer_vat_authorized_on },
  {
    id: 'state', sortValue: stateOf, filterValue: stateOf, filterLabel: 'State',
    filterOptionLabel: (v) => STATE_LABEL[v as AgreementState] ?? v,
  },
];

const SortHead: React.FC<{
  id: string; label: string; sort?: HubSort; onSort: (id: string) => void; className?: string;
}> = ({ id, label, sort, onSort, className }) => (
  <TableHead
    className={className}
    aria-sort={sort?.columnId === id ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
  >
    <HubSortButton active={sort?.columnId === id ? sort.direction : undefined} onClick={() => onSort(id)}>
      {label}
    </HubSortButton>
  </TableHead>
);

export const SelfBillingCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<AgreementRow[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; vat_number: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ supplier_id: '', signed_on: '', authorized_on: '', series: 'AT' });
  const t = useHubTable(rows, FIELDS);

  const load = async () => {
    setLoading(true);
    try {
      const [ag, sup] = await Promise.all([
        supabase
          .from('finance_self_billing_agreements')
          .select('id, supplier_company_id, agreement_signed_on, issuer_vat_authorized_on, authorized_issuer_vat, is_active, revoked_on, crm_companies!inner(name, vat_number)')
          .eq('workspace_id', workspaceId),
        supabase
          .from('crm_companies').select('id, name, vat_number')
          .eq('workspace_id', workspaceId).eq('is_supplier', true).order('name'),
      ]);
      if (ag.error) throw ag.error;
      setRows(((ag.data ?? []) as any[]).map((r) => ({
        id: r.id,
        supplier_company_id: r.supplier_company_id,
        supplier_name: r.crm_companies?.name ?? '—',
        agreement_signed_on: r.agreement_signed_on,
        issuer_vat_authorized_on: r.issuer_vat_authorized_on,
        authorized_issuer_vat: r.authorized_issuer_vat,
        is_active: r.is_active,
        revoked_on: r.revoked_on,
        current_vat: r.crm_companies?.vat_number ?? null,
      })).sort((a, b) => a.supplier_name.localeCompare(b.supplier_name)));
      setSuppliers((sup.data ?? []) as any[]);
    } catch (err: any) {
      toast({ title: 'Could not load self-billing agreements', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [workspaceId]);

  const add = async () => {
    const supplier = suppliers.find((s) => s.id === form.supplier_id);
    if (!supplier) { toast({ title: 'Pick a supplier', variant: 'destructive' }); return; }
    if (!supplier.vat_number) {
      toast({
        title: 'That supplier has no ΑΦΜ',
        description: 'A self-billed invoice is issued in their name, so their ΑΦΜ has to be on the CRM record first.',
        variant: 'destructive',
      });
      return;
    }
    if (!form.series.trim()) { toast({ title: 'Name the numbering series', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      // One RPC, not two writes: the agreement and the supplier's own numbering range have to
      // arrive together, or the gate refuses a supplier this screen just said was authorized. It
      // also freezes the ΑΦΜ as authorized, so a later CRM edit cannot redirect the filing.
      const { error } = await supabase.rpc('authorize_self_billing_supplier', {
        p_workspace_id: workspaceId,
        p_supplier_company_id: supplier.id,
        p_series: form.series.trim(),
        p_agreement_signed_on: form.signed_on || null,
        p_issuer_vat_authorized_on: form.authorized_on || null,
      });
      if (error) throw error;
      setForm({ supplier_id: '', signed_on: '', authorized_on: '', series: 'AT' });
      setAdding(false);
      await load();
    } catch (err: any) {
      toast({ title: 'Could not save', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const setActive = async (row: AgreementRow, active: boolean) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('finance_self_billing_agreements')
        .update({
          is_active: active,
          revoked_on: active ? null : todayLocalISO(),
          // Re-activating re-authorizes against the ΑΦΜ that stands today, which is the only
          // honest reading of "we checked this again".
          ...(active ? { authorized_issuer_vat: row.current_vat } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (error) throw error;
      await load();
    } catch (err: any) {
      toast({ title: 'Could not update', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const addButton = (
    <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
      <Plus className="mr-1.5 h-3.5 w-3.5" /> Authorize a supplier
    </Button>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle>Self-billing (αυτοτιμολόγηση)</CardTitle>
          <CardDescription>
            Invoices you raise in a supplier&apos;s name. The supplier is the issuer and you are the
            counterpart, so it is booked as a purchase — a supplier bill is raised with each one.
          </CardDescription>
        </div>
        {!adding && rows.length > 0 && addButton}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : (
          <>
            {rows.length === 0 && !adding && (
              <HubEmptyState
                icon={Handshake}
                title="No supplier is authorized for self-billing"
                description="ΑΑΔΕ requires a written agreement with the supplier before the first document, and the e-invoicing provider must have their ΑΦΜ authorized on your account."
                action={addButton}
              />
            )}

            {rows.length > 0 && (
              <div className="overflow-hidden rounded-md border border-hairline">
                {rows.length > 8 && (
                  <HubToolbar
                    search={t.search}
                    onSearchChange={t.setSearch}
                    searchPlaceholder="Search suppliers or ΑΦΜ"
                    filters={<>
                      <HubFilterSelect label="State" value={t.filters.state ?? HUB_FILTER_ALL} options={t.filterOptions.state} onChange={(v) => t.setFilter('state', v)} />
                      <HubResetFilters count={t.activeFilterCount} onReset={t.reset} />
                    </>}
                  />
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHead id="supplier" label="Supplier" sort={t.sort} onSort={t.toggleSort} />
                      <SortHead id="vat" label="Authorized ΑΦΜ" sort={t.sort} onSort={t.toggleSort} className="hidden sm:table-cell" />
                      <SortHead id="signed" label="Agreement signed" sort={t.sort} onSort={t.toggleSort} className="hidden md:table-cell" />
                      <SortHead id="authorized" label="ΑΦΜ authorized" sort={t.sort} onSort={t.toggleSort} className="hidden md:table-cell" />
                      <SortHead id="state" label="State" sort={t.sort} onSort={t.toggleSort} />
                      <TableHead><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {t.rows.length === 0 && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6}>
                          <HubEmptyState
                            variant="filtered"
                            title="No agreements match"
                            action={<HubResetFilters count={t.activeFilterCount} onReset={t.reset} />}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                    {t.rows.map((r) => {
                      const state = stateOf(r);
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <HubCellLink to={`/crm/companies/${r.supplier_company_id}`} className="block max-w-[16rem] truncate">
                              <span title={r.supplier_name}>{r.supplier_name}</span>
                            </HubCellLink>
                          </TableCell>
                          <TableCell className="hidden tabular-nums sm:table-cell">{r.authorized_issuer_vat || <HubCellEmpty />}</TableCell>
                          <TableCell className="hidden whitespace-nowrap tabular-nums md:table-cell">{r.agreement_signed_on || <HubCellEmpty />}</TableCell>
                          <TableCell className="hidden whitespace-nowrap tabular-nums md:table-cell">{r.issuer_vat_authorized_on || <HubCellEmpty />}</TableCell>
                          <TableCell>
                            {state === 'revoked' ? (
                              <Badge variant="neutral">Revoked{r.revoked_on ? ` ${r.revoked_on}` : ''}</Badge>
                            ) : state === 'drifted' ? (
                              <Badge variant="error">ΑΦΜ changed — re-authorize</Badge>
                            ) : state === 'incomplete' ? (
                              <Badge variant="warning">Incomplete</Badge>
                            ) : (
                              <Badge variant="success">Active</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm" variant="ghost" disabled={busy}
                              onClick={() => void setActive(r, !r.is_active)}
                            >
                              {r.is_active ? 'Revoke' : 'Re-authorize'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {adding && (
              <div className="space-y-3 rounded-sm border border-hairline bg-surface-sunken p-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Supplier</Label>
                    <Select value={form.supplier_id} onValueChange={(v) => setForm((f) => ({ ...f, supplier_id: v }))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Pick a supplier…" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}{s.vat_number ? ` · ${s.vat_number}` : ' · no ΑΦΜ'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Written agreement signed</Label>
                    <Input
                      className="h-9" type="date" value={form.signed_on}
                      onChange={(e) => setForm((f) => ({ ...f, signed_on: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Numbering series</Label>
                    <Input
                      className="h-9" value={form.series} maxLength={20}
                      onChange={(e) => setForm((f) => ({ ...f, series: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">ΑΦΜ authorized with the provider</Label>
                    <Input
                      className="h-9" type="date" value={form.authorized_on}
                      onChange={(e) => setForm((f) => ({ ...f, authorized_on: e.target.value }))}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  The series numbers this supplier&apos;s documents only — their range is legally theirs,
                  so it never mixes with your own sales numbering. Both dates are required before the first document. Authorizing an ΑΦΜ with the
                  provider is arranged with them directly — it is not something this screen can do.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy} onClick={() => void add()}>
                    {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null} Save
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => setAdding(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
