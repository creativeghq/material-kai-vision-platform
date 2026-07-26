// Reusable contracts panel — one component for all three contexts (hr | finance | project).
// Pass a `subject` (e.g. { customer_company_id } or { hr_employee_id } or { project_id }) when
// mounting under a specific entity; omit it for a standalone workspace-wide list (finance).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, FileSignature, Plus, Link2, Ban, CheckCircle2, Send, Download } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { FilterBar, useFilters, type FilterGroupDef } from '@/components/core/filters';
import { contractsService, type Contract, type ContractContext, type ContractStatus } from '@/services/contractsService';

const STATUS_TONE: Record<ContractStatus, string> = {
  draft: 'text-muted-foreground border-border',
  sent: 'text-amber-600 border-amber-500/40',
  signed: 'text-emerald-600 border-emerald-500/40',
  declined: 'text-destructive border-destructive/40',
  void: 'text-muted-foreground border-border line-through',
  expired: 'text-muted-foreground border-border line-through',
};

const TYPE_OPTIONS: Record<ContractContext, string[]> = {
  hr: ['employment', 'amendment', 'nda', 'termination'],
  finance: ['sales', 'framework', 'service', 'supplier', 'nda'],
  project: ['work_agreement', 'amendment', 'nda'],
  realestate: ['memorandum_of_sale', 'agency_agreement', 'reservation'],
};

type Subject = Partial<Pick<Contract, 'hr_employee_id' | 'customer_company_id' | 'supplier_company_id' | 'order_id' | 'quote_id' | 'project_id'>>;

const CONTEXT_BADGE: Record<ContractContext, string> = {
  hr: 'text-violet-600 border-violet-500/40',
  finance: 'text-sky-600 border-sky-500/40',
  project: 'text-teal-600 border-teal-500/40',
  realestate: 'text-emerald-600 border-emerald-500/40',
};

export const ContractsSection: React.FC<{
  workspaceId: string;
  /** A specific context, or 'all' for a cross-context read view (create disabled). */
  context: ContractContext | 'all';
  subject?: Subject;
  heading?: string;
  /** Prefill the counterparty from the entity this panel is mounted under (employee / project client
   *  / property buyer) so the signer isn't retyped — and the signing email actually has a recipient. */
  defaultCounterparty?: { name?: string | null; email?: string | null };
  /**
   * Group definitions for the shared filter modal. Only the standalone Contracts page passes
   * these — the entity-scoped mounts (employee dialog, project tab) show a handful of rows and
   * would gain nothing from a filter bar.
   */
  filterGroups?: (rows: Contract[]) => FilterGroupDef[];
}> = ({ workspaceId, context, subject, heading = 'Contracts', defaultCounterparty, filterGroups: buildGroups }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // The context used when CREATING. On the standalone 'all' tab the user picks it in the dialog;
  // on a specific tab (or an entity-scoped mount) it's locked to that context.
  const [createContext, setCreateContext] = useState<ContractContext>(context === 'all' ? 'finance' : context);
  // Category picker is only shown on the cross-context 'all' tab — a specific tab IS the category.
  const pickCategory = context === 'all';
  // Create is always available: entity-scoped mounts link the new row to the employee/project via
  // `subject`; standalone mounts (incl. 'all') create with a free-text counterparty, category chosen
  // by tab or by the in-dialog picker. The backend only requires context + title.
  const canCreate = true;

  const [title, setTitle] = useState('');
  const [type, setType] = useState<string>(TYPE_OPTIONS[context === 'all' ? 'finance' : context][0]);

  // Switching category resets the type list to that category's options.
  const changeCategory = (c: ContractContext) => { setCreateContext(c); setType(TYPE_OPTIONS[c][0]); };
  const [counterparty, setCounterparty] = useState('');
  const [counterpartyEmail, setCounterpartyEmail] = useState('');
  const [value, setValue] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [effective, setEffective] = useState('');
  const [expiry, setExpiry] = useState('');
  const [bodyText, setBodyText] = useState('');

  /** Open the create dialog, prefilling the counterparty from the mounted entity when available. */
  const openCreate = () => {
    if (defaultCounterparty?.name) setCounterparty(defaultCounterparty.name);
    if (defaultCounterparty?.email) setCounterpartyEmail(defaultCounterparty.email);
    setOpen(true);
  };

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      setRows(await contractsService.list(workspaceId, { ...(context !== 'all' ? { context } : {}), ...(subject ?? {}) }));
    } catch (err: any) {
      toast({ title: 'Failed to load contracts', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [workspaceId, context, JSON.stringify(subject), toast]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => (buildGroups ? buildGroups(rows) : []), [buildGroups, rows]);
  const { values: filterValues, setValues: setFilterValues, filtered, previewCount, activeCount } =
    useFilters<Contract>(rows, groups);

  const resetForm = () => {
    setTitle(''); setType(TYPE_OPTIONS[createContext][0]); setCounterparty(''); setCounterpartyEmail('');
    setValue(''); setCurrency('EUR'); setEffective(''); setExpiry(''); setBodyText('');
  };

  const create = async () => {
    if (!title.trim()) { toast({ title: 'Title is required', variant: 'destructive' }); return; }
    if (createContext === 'finance' && !subject?.customer_company_id && !subject?.supplier_company_id && !counterparty.trim()) {
      toast({ title: 'Add a counterparty name', variant: 'destructive' }); return;
    }
    setBusy(true);
    try {
      await contractsService.create(workspaceId, {
        context: createContext, title: title.trim(), contract_type: type,
        counterparty_name: counterparty.trim() || undefined,
        counterparty_email: counterpartyEmail.trim() || undefined,
        value: value.trim() ? Number(value) : undefined,
        currency: value.trim() ? currency : undefined,
        effective_date: effective || undefined,
        expiry_date: expiry || undefined,
        body_markdown: bodyText.trim() || undefined,
        ...(subject ?? {}),
      });
      toast({ title: 'Contract created' });
      resetForm(); setOpen(false); await load();
    } catch (err: any) {
      toast({ title: 'Could not create contract', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  // Returns true only if the clipboard write actually succeeded. In a non-secure context or when
  // permission is denied, navigator.clipboard.writeText rejects — the caller must then SHOW the URL,
  // because the signing link is delivered nowhere else.
  const tryCopy = async (text: string): Promise<boolean> => {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  };

  const send = async (c: Contract) => {
    try {
      const { sign_path } = await contractsService.send(workspaceId, c.id);
      const url = `${window.location.origin}${sign_path}`;
      const copied = await tryCopy(url);
      toast(copied
        ? { title: 'Signing link ready', description: 'Copied to clipboard — send it to the signer.' }
        : { title: 'Signing link ready — copy it manually', description: url });
      await load();
    } catch (err: any) {
      toast({ title: 'Could not send', description: err?.message, variant: 'destructive' });
    }
  };

  const copyLink = async (c: Contract) => {
    if (!c.sign_token) return;
    const url = `${window.location.origin}/sign/${c.sign_token}`;
    const copied = await tryCopy(url);
    toast(copied
      ? { title: 'Signing link copied' }
      : { title: 'Copy failed — here is the link', description: url });
  };

  const voidContract = async (c: Contract) => {
    if (!confirm(`Void "${c.title}"? The signing link stops working.`)) return;
    try { await contractsService.void(workspaceId, c.id); await load(); }
    catch (err: any) { toast({ title: 'Could not void', description: err?.message, variant: 'destructive' }); }
  };

  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const downloadPdf = async (c: Contract) => {
    setPdfBusy(c.id);
    try {
      const url = await contractsService.generatePdf(c.id);
      window.open(url, '_blank', 'noopener');
    } catch (err: any) {
      toast({ title: 'Could not generate PDF', description: err?.message, variant: 'destructive' });
    } finally { setPdfBusy(null); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileSignature className="h-4 w-4" /> {heading}</h3>
        {canCreate && (
          <Button size="sm" variant="outline" className="rounded-full" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1" /> New contract</Button>
        )}
      </div>

      {groups.length > 0 && rows.length > 0 && (
        <FilterBar
          groups={groups}
          values={filterValues}
          onChange={setFilterValues}
          previewCount={previewCount}
          title="Filter contracts"
          searchPlaceholder="Search contracts…"
        />
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          {activeCount > 0 ? 'No contracts match your filters.' : 'No contracts yet.'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <div key={c.id} className="rounded-lg border border-border/60 p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{c.title}</span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-medium ${STATUS_TONE[c.status]}`}>{c.status}</span>
                  {context === 'all' && <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[9px] font-medium capitalize ${CONTEXT_BADGE[c.context]}`}>{c.context}</span>}
                  {c.contract_type && <span className="text-[10px] text-muted-foreground capitalize">{c.contract_type.replace(/_/g, ' ')}</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {c.counterparty_name && <>For {c.counterparty_name} · </>}
                  {c.status === 'signed' && c.signed_at
                    ? <span className="text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Signed {new Date(c.signed_at).toLocaleDateString()}</span>
                    : c.expiry_date ? <>Expires {new Date(c.expiry_date).toLocaleDateString()}</> : <>Created {new Date(c.created_at).toLocaleDateString()}</>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {(c.status === 'draft') && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => send(c)} title="Generate signing link"><Send className="h-3.5 w-3.5 mr-1" /> Send</Button>
                )}
                {c.status === 'sent' && c.sign_token && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => copyLink(c)} title="Copy signing link"><Link2 className="h-3.5 w-3.5 mr-1" /> Copy link</Button>
                )}
                {c.status === 'signed' && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => downloadPdf(c)} disabled={pdfBusy === c.id} title="Download the signed contract PDF">
                    {pdfBusy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Download className="h-3.5 w-3.5 mr-1" /> PDF</>}
                  </Button>
                )}
                {c.status !== 'signed' && c.status !== 'void' && (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => voidContract(c)} title="Void"><Ban className="h-3.5 w-3.5" /></Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New {createContext} contract</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {pickCategory && (
              <div className="space-y-1"><Label>Category</Label>
                <Select value={createContext} onValueChange={(v) => changeCategory(v as ContractContext)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="finance">Finance</SelectItem>
                    <SelectItem value="hr">HR</SelectItem>
                    <SelectItem value="project">Projects</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2"><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Framework supply agreement" /></div>
              <div className="space-y-1"><Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPE_OPTIONS[createContext].map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Counterparty {createContext === 'finance' && !subject?.customer_company_id ? '*' : ''}</Label><Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Signer / Company name" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Counterparty email</Label><Input type="email" value={counterpartyEmail} onChange={(e) => setCounterpartyEmail(e.target.value)} placeholder="signer@example.com" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label>Value</Label><Input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" /></div>
                <div className="space-y-1"><Label>Currency</Label><Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="EUR" /></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Effective</Label><Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} /></div>
              <div className="space-y-1"><Label>Expires</Label><Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
            </div>
            <div className="space-y-1"><Label>Terms</Label><Textarea rows={6} value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder="The agreement text the signer will read and sign…" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }} disabled={busy}>Cancel</Button>
            <Button onClick={create} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContractsSection;
