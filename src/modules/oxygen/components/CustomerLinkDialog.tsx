import React, { useEffect, useState } from 'react';
import { Loader2, Search, Building2, User as UserIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { oxygenService } from '../services/oxygenService';
import type { CrmContactSearchRow, CrmCompanySearchRow } from '../types';

interface CustomerLinkDialogProps {
  open: boolean;
  onClose: () => void;
  quoteId: string;
  onLinked: () => void;
}

export const CustomerLinkDialog: React.FC<CustomerLinkDialogProps> = ({ open, onClose, quoteId, onLinked }) => {
  const { toast } = useToast();
  const [tab, setTab] = useState<'company' | 'contact'>('company');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [companies, setCompanies] = useState<CrmCompanySearchRow[]>([]);
  const [contacts, setContacts] = useState<CrmContactSearchRow[]>([]);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setCompanies([]);
      setContacts([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        if (tab === 'company') {
          const rows = await oxygenService.searchCompanies(query);
          if (!cancelled) setCompanies(rows);
        } else {
          const rows = await oxygenService.searchContacts(query);
          if (!cancelled) setContacts(rows);
        }
      } catch (err) {
        console.error('[oxygen] search failed:', err);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, tab, open]);

  const handleLink = async (link: { customer_contact_id?: string; customer_company_id?: string }) => {
    setLinking(true);
    try {
      await oxygenService.linkCustomerToQuote(quoteId, link);
      toast({ title: 'Customer linked', description: 'Quote is now linked to the selected customer.' });
      onLinked();
      onClose();
    } catch (err) {
      toast({
        title: 'Failed to link customer',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLinking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link Customer to Quote</DialogTitle>
          <DialogDescription>
            Select the company or person this quote is billed to. Required before creating an Oxygen pre-invoice.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => setTab(v as 'company' | 'contact')} className="mt-2">
          <TabsList className="bg-transparent p-0 gap-2">
            <TabsTrigger value="company" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Building2 className="h-4 w-4" /> Company (B2B)
            </TabsTrigger>
            <TabsTrigger value="contact" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <UserIcon className="h-4 w-4" /> Contact (Private)
            </TabsTrigger>
          </TabsList>

          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={tab === 'company' ? 'Search by company name, VAT, or email…' : 'Search by name, email, or VAT…'}
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <TabsContent value="company" className="mt-3">
            <ResultsList
              loading={searching}
              empty={query.trim().length < 2 ? 'Type at least 2 characters' : 'No companies found'}
              items={companies.map(c => ({
                id: c.id,
                primary: c.name,
                secondary: [c.vat_number ? `VAT ${c.vat_number}` : null, c.email].filter(Boolean).join(' · '),
                badge: c.vat_number ? null : 'No VAT',
                onClick: () => handleLink({ customer_company_id: c.id }),
              }))}
              linking={linking}
            />
          </TabsContent>

          <TabsContent value="contact" className="mt-3">
            <ResultsList
              loading={searching}
              empty={query.trim().length < 2 ? 'Type at least 2 characters' : 'No contacts found'}
              items={contacts.map(c => ({
                id: c.id,
                primary: c.name ?? c.email ?? 'Unnamed',
                secondary: [
                  c.contact_type ?? 'private',
                  c.vat_number ? `VAT ${c.vat_number}` : c.email,
                  c.company,
                ].filter(Boolean).join(' · '),
                badge: c.contact_type === 'company' ? 'B2B' : null,
                onClick: () => handleLink({ customer_contact_id: c.id }),
              }))}
              linking={linking}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={linking}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface ResultRow {
  id: string;
  primary: string;
  secondary: string;
  badge: string | null;
  onClick: () => void;
}

const ResultsList: React.FC<{ loading: boolean; empty: string; items: ResultRow[]; linking: boolean }> = ({ loading, empty, items, linking }) => {
  if (loading) {
    return <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Searching…</div>;
  }
  if (items.length === 0) {
    return <div className="py-8 text-center text-muted-foreground text-sm">{empty}</div>;
  }
  return (
    <div className="max-h-80 overflow-y-auto divide-y divide-border rounded-md border">
      {items.map(row => (
        <button
          key={row.id}
          onClick={row.onClick}
          disabled={linking}
          className="w-full text-left px-4 py-3 hover:bg-muted/40 disabled:opacity-50 flex items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <div className="font-medium truncate">{row.primary}</div>
            {row.secondary && <div className="text-xs text-muted-foreground truncate">{row.secondary}</div>}
          </div>
          {row.badge && <Badge variant="outline" className="shrink-0">{row.badge}</Badge>}
        </button>
      ))}
    </div>
  );
};
