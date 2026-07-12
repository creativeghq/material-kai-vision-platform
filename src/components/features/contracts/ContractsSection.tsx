// Reusable contracts panel — one component for all three contexts (hr | finance | project).
// Pass a `subject` (e.g. { customer_company_id } or { hr_employee_id } or { project_id }) when
// mounting under a specific entity; omit it for a standalone workspace-wide list (finance).
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, FileSignature, Plus, Link2, Ban, CheckCircle2, Send } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { contractsService, type Contract, type ContractContext, type ContractStatus } from '@/services/contractsService';

const STATUS_TONE: Record<ContractStatus, string> = {
  draft: 'text-muted-foreground border-border',
  sent: 'text-amber-600 border-amber-500/40',
  signed: 'text-emerald-600 border-emerald-500/40',
  declined: 'text-destructive border-destructive/40',
  void: 'text-muted-foreground border-border line-through',
};

const TYPE_OPTIONS: Record<ContractContext, string[]> = {
  hr: ['employment', 'amendment', 'nda', 'termination'],
  finance: ['sales', 'framework', 'service', 'supplier', 'nda'],
  project: ['work_agreement', 'amendment', 'nda'],
};

type Subject = Partial<Pick<Contract, 'hr_employee_id' | 'customer_company_id' | 'supplier_company_id' | 'order_id' | 'quote_id' | 'project_id'>>;

export const ContractsSection: React.FC<{
  workspaceId: string;
  context: ContractContext;
  subject?: Subject;
  heading?: string;
}> = ({ workspaceId, context, subject, heading = 'Contracts' }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [type, setType] = useState<string>(TYPE_OPTIONS[context][0]);
  const [counterparty, setCounterparty] = useState('');
  const [counterpartyEmail, setCounterpartyEmail] = useState('');
  const [effective, setEffective] = useState('');
  const [expiry, setExpiry] = useState('');
  const [bodyText, setBodyText] = useState('');

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      setRows(await contractsService.list(workspaceId, { context, ...(subject ?? {}) }));
    } catch (err: any) {
      toast({ title: 'Failed to load contracts', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [workspaceId, context, JSON.stringify(subject), toast]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const resetForm = () => {
    setTitle(''); setType(TYPE_OPTIONS[context][0]); setCounterparty(''); setCounterpartyEmail('');
    setEffective(''); setExpiry(''); setBodyText('');
  };

  const create = async () => {
    if (!title.trim()) { toast({ title: 'Title is required', variant: 'destructive' }); return; }
    if (context === 'finance' && !subject?.customer_company_id && !subject?.supplier_company_id && !counterparty.trim()) {
      toast({ title: 'Add a counterparty name', variant: 'destructive' }); return;
    }
    setBusy(true);
    try {
      await contractsService.create(workspaceId, {
        context, title: title.trim(), contract_type: type,
        counterparty_name: counterparty.trim() || undefined,
        counterparty_email: counterpartyEmail.trim() || undefined,
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

  const send = async (c: Contract) => {
    try {
      const { sign_path } = await contractsService.send(workspaceId, c.id);
      const url = `${window.location.origin}${sign_path}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast({ title: 'Signing link ready', description: 'Copied to clipboard — send it to the signer.' });
      await load();
    } catch (err: any) {
      toast({ title: 'Could not send', description: err?.message, variant: 'destructive' });
    }
  };

  const copyLink = async (c: Contract) => {
    if (!c.sign_token) return;
    await navigator.clipboard.writeText(`${window.location.origin}/sign/${c.sign_token}`).catch(() => {});
    toast({ title: 'Signing link copied' });
  };

  const voidContract = async (c: Contract) => {
    if (!confirm(`Void "${c.title}"? The signing link stops working.`)) return;
    try { await contractsService.void(workspaceId, c.id); await load(); }
    catch (err: any) { toast({ title: 'Could not void', description: err?.message, variant: 'destructive' }); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileSignature className="h-4 w-4" /> {heading}</h3>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> New contract</Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No contracts yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <div key={c.id} className="rounded-lg border border-border/60 p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{c.title}</span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-medium ${STATUS_TONE[c.status]}`}>{c.status}</span>
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
          <DialogHeader><DialogTitle>New {context} contract</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2"><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Framework supply agreement" /></div>
              <div className="space-y-1"><Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPE_OPTIONS[context].map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Counterparty {context === 'finance' && !subject?.customer_company_id ? '*' : ''}</Label><Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Signer / company name" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Counterparty email</Label><Input type="email" value={counterpartyEmail} onChange={(e) => setCounterpartyEmail(e.target.value)} placeholder="signer@example.com" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label>Effective</Label><Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} /></div>
                <div className="space-y-1"><Label>Expires</Label><Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
              </div>
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
