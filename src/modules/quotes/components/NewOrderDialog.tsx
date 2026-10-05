import React, { useEffect, useState } from 'react';
import { Building2, Loader2, Search, User, UserPlus } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CRM_SEARCH_COLUMN, foldedLike } from '@/services/crmSearch';
import { quotesService } from '@/modules/quotes/services/QuotesService';

export interface CustomerOption { type: 'contact' | 'company'; id: string; label: string; sub?: string; }

export const NewOrderDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string | null;
  onCreated: (quoteId: string) => void;
  /** Opened from a conversation or a document: the customer and a name are already known. */
  initialCustomer?: CustomerOption | null;
  initialName?: string;
}> = ({ open, onOpenChange, workspaceId, onCreated, initialCustomer, initialName }) => {
  const { toast } = useToast();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  const [orderName, setOrderName] = useState('');
  const [busy, setBusy] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', email: '' });

  // Reset when opened.
  useEffect(() => {
    if (open) {
      setTerm(''); setResults([]); setCustomer(initialCustomer ?? null); setOrderName(initialName ?? '');
      setAddingContact(false); setNewContact({ name: '', email: '' });
    }
  }, [open, initialCustomer, initialName]);

  // Debounced search across CRM contacts + companies (RLS scopes to the rep's workspace).
  useEffect(() => {
    if (term.trim().length < 2) { setResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const [{ data: contacts }, { data: companies }] = await Promise.all([
          supabase.from('crm_contacts')
            .select('id, name, first_name, last_name, email')
            .ilike(CRM_SEARCH_COLUMN, foldedLike(term))
            .limit(6),
          supabase.from('crm_companies').select('id, name').ilike(CRM_SEARCH_COLUMN, foldedLike(term)).limit(6),
        ]);
        if (cancelled) return;
        const opts: CustomerOption[] = [];
        for (const c of contacts ?? []) {
          const label = (c as any).name || [(c as any).first_name, (c as any).last_name].filter(Boolean).join(' ') || (c as any).email || 'Contact';
          opts.push({ type: 'contact', id: (c as any).id, label, sub: (c as any).email || undefined });
        }
        for (const co of companies ?? []) opts.push({ type: 'company', id: (co as any).id, label: (co as any).name, sub: 'Company' });
        setResults(opts);
      } catch (e) {
        console.error('customer search failed', e);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [term]);

  const quickAddContact = async () => {
    if (!newContact.name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    if (!workspaceId) { toast({ title: 'No active workspace', variant: 'destructive' }); return; }
    try {
      setBusy(true);
      const { data, error } = await supabase.from('crm_contacts')
        .insert({ workspace_id: workspaceId, name: newContact.name.trim(), email: newContact.email.trim() || null } as any)
        .select('id, name, email').single();
      if (error) throw error;
      setCustomer({ type: 'contact', id: (data as any).id, label: (data as any).name, sub: (data as any).email || undefined });
      setAddingContact(false);
    } catch (e: any) {
      toast({ title: 'Failed to add contact', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const createOrder = async () => {
    if (!customer) { toast({ title: 'Pick a customer first', variant: 'destructive' }); return; }
    if (!orderName.trim()) { toast({ title: 'Name the order', variant: 'destructive' }); return; }
    try {
      setBusy(true);
      const quote = await quotesService.createQuote({
        name: orderName.trim(),
        workspace_id: workspaceId ?? undefined,
        customer_contact_id: customer.type === 'contact' ? customer.id : null,
        customer_company_id: customer.type === 'company' ? customer.id : null,
      });
      onCreated(quote.id);
    } catch (e: any) {
      toast({ title: 'Failed to create order', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Order</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Customer</Label>
              {!addingContact && (
                <button type="button" className="text-xs text-primary hover:underline inline-flex items-center gap-1" onClick={() => { setAddingContact(true); setCustomer(null); }}>
                  <UserPlus className="h-3 w-3" /> Quick add
                </button>
              )}
            </div>

            {customer ? (
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-2">
                  {customer.type === 'company' ? <Building2 className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  <span className="font-medium">{customer.label}</span>
                  {customer.sub && <span className="text-muted-foreground text-xs">· {customer.sub}</span>}
                </span>
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setCustomer(null)}>Change</button>
              </div>
            ) : addingContact ? (
              <div className="grid grid-cols-1 gap-2 rounded-md border border-border/60 p-3">
                <Input className="h-8 text-xs" placeholder="Customer name *" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} />
                <Input className="h-8 text-xs" placeholder="Email (optional)" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setAddingContact(false)}>Cancel</Button>
                  <Button size="sm" onClick={quickAddContact} disabled={busy}>Add</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input className="h-8 text-xs pl-7" placeholder="Search contacts or companies…" value={term} onChange={(e) => setTerm(e.target.value)} />
                </div>
                {(searching || results.length > 0) && (
                  <div className="rounded-md border border-border/60 divide-y divide-border/40 max-h-48 overflow-y-auto">
                    {searching && <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>}
                    {!searching && results.map((r) => (
                      <button
                        key={`${r.type}:${r.id}`}
                        type="button"
                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 inline-flex items-center gap-2"
                        onClick={() => { setCustomer(r); setTerm(''); setResults([]); }}
                      >
                        {r.type === 'company' ? <Building2 className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                        <span className="font-medium">{r.label}</span>
                        {r.sub && <span className="text-muted-foreground">· {r.sub}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Order name */}
          <div className="space-y-1">
            <Label className="text-xs">Order name *</Label>
            <Input className="h-8 text-xs" placeholder="e.g. Kitchen renovation — materials" value={orderName} onChange={(e) => setOrderName(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={createOrder} disabled={busy || !customer || !orderName.trim()}>
            {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : <>Create &amp; add products</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
