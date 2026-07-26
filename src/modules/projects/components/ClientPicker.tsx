import React, { useEffect, useState } from 'react';
import { Building2, User as UserIcon, X, Search, Plus, Loader2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/core/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useQuotaErrorHandler } from '@/hooks/useQuotaErrorHandler';
import { supabase } from '@/integrations/supabase/client';
import { projectsService } from '../services/projectsService';

export interface ClientPickerValue {
  client_company_id: string | null;
  client_contact_id: string | null;
  /** Display label for the selected client (computed by parent or derived here) */
  display_name?: string;
}

interface ClientPickerProps {
  value: ClientPickerValue;
  onChange: (next: ClientPickerValue) => void;
  disabled?: boolean;
  /**
   * Picker layout:
   *  - 'admin' (default): both Company (B2B) and Contact (B2C) tabs over the full CRM. Used in admin contexts.
   *  - 'simple': contact-only, scoped to the user's own contacts, with an inline "+ Add new client" form.
   *    Hides the shared CRM company list and the B2B/B2C distinction.
   */
  mode?: 'admin' | 'simple';
}

export const ClientPicker: React.FC<ClientPickerProps> = ({ value, onChange, disabled, mode = 'admin' }) => {
  const { toast } = useToast();
  const handleQuotaError = useQuotaErrorHandler();
  const [search, setSearch] = useState('');
  const [companies, setCompanies] = useState<Array<{ id: string; name: string; email: string | null }>>([]);
  const [contacts, setContacts] = useState<Array<{ id: string; name: string | null; first_name: string | null; last_name: string | null; email: string | null }>>([]);
  const [loading, setLoading] = useState(false);
  // In simple mode the picker is contact-only — no company tab. In admin mode keep the previous
  // behaviour of remembering which tab the operator last touched.
  const [tab, setTab] = useState<'company' | 'contact'>(
    mode === 'simple' ? 'contact' : (value.client_contact_id ? 'contact' : 'company'),
  );

  // Simple-mode-only: inline "Add new client" form state. Creates a new crm_contacts
  // row scoped to the current user, then selects it.
  const [addingNew, setAddingNew] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [savingNew, setSavingNew] = useState(false);

  useEffect(() => {
    // Lazy search: don't show any results until the user actually types. Clears
    // any lingering rows when the box is empty so the picker stays clean.
    if (!search.trim()) {
      setCompanies([]);
      setContacts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        if (mode === 'admin' && tab === 'company') {
          const data = await projectsService.searchCompanies(search);
          if (!cancelled) setCompanies(data);
        } else {
          const data = await projectsService.searchContacts(search);
          if (!cancelled) setContacts(data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(run, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, tab, mode]);

  const handleCreateContact = async () => {
    if (!newFirstName.trim() && !newLastName.trim() && !newEmail.trim()) {
      toast({ title: 'Enter at least a first name, last name, or email', variant: 'destructive' });
      return;
    }
    try {
      setSavingNew(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const displayName = [newFirstName.trim(), newLastName.trim()].filter(Boolean).join(' ') || newEmail.trim() || 'Unnamed contact';

      const { data, error } = await (supabase as any)
        .from('crm_contacts')
        .insert({
          // NB: do NOT set user_id — that column is the platform-user↔contact link (one per user).
          // Binding a new CLIENT contact to the creator's user_id creates a second self-contact and
          // breaks GET /contacts/by-user/{creator} (.single() → "multiple rows"). created_by is the
          // right attribution field.
          created_by: user.id,
          workspace_id: getActiveWorkspaceId(user.id) ?? undefined,
          name: displayName,
          first_name: newFirstName.trim() || null,
          last_name: newLastName.trim() || null,
          email: newEmail.trim() || null,
          phone: newPhone.trim() || null,
        })
        .select('id, name, first_name, last_name, email')
        .single();
      if (error) throw error;

      onChange({
        client_company_id: null,
        client_contact_id: data.id,
        display_name: displayName,
      });

      // reset form
      setNewFirstName('');
      setNewLastName('');
      setNewEmail('');
      setNewPhone('');
      setAddingNew(false);
    } catch (err) {
      if (handleQuotaError(err)) return; // plan-limit reached → upsell toast
      toast({
        title: 'Failed to add client',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSavingNew(false);
    }
  };

  const selectedLabel = value.display_name;

  if (selectedLabel) {
    return (
      <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border bg-muted/40">
        <div className="flex items-center gap-2 min-w-0">
          {value.client_company_id ? (
            <Building2 className="h-4 w-4 text-primary shrink-0" />
          ) : (
            <UserIcon className="h-4 w-4 text-primary shrink-0" />
          )}
          <span className="text-sm truncate">{selectedLabel}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onChange({ client_company_id: null, client_contact_id: null, display_name: undefined })}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const contactDisplay = (c: { name: string | null; first_name: string | null; last_name: string | null; email: string | null }) => {
    if (c.name) return c.name;
    const parts = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
    return parts || c.email || 'Unnamed contact';
  };

  // ─── Simple mode: contact-only, scoped to user's own contacts, with inline add-new form ───
  if (mode === 'simple') {
    return (
      <div className="space-y-3">
        {!addingNew ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search your clients..."
                className="pl-9"
                disabled={disabled}
              />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {loading && <div className="text-sm text-muted-foreground py-2">Searching...</div>}
              {!loading && contacts.length === 0 && (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  {search ? 'No clients matched.' : 'Start typing to find a client, or add a new one below.'}
                </div>
              )}
              {contacts.map(c => {
                const label = contactDisplay(c);
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange({
                      client_company_id: null,
                      client_contact_id: c.id,
                      display_name: label,
                    })}
                    className="w-full text-left p-2.5 rounded-lg hover:bg-muted/60 transition-colors flex items-center gap-2"
                  >
                    <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{label}</p>
                      {c.email && <p className="text-xs text-muted-foreground truncate">{c.email}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAddingNew(true)}
              disabled={disabled}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add new client
            </Button>
          </>
        ) : (
          <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/30">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">First name</Label>
                <Input
                  value={newFirstName}
                  onChange={e => setNewFirstName(e.target.value)}
                  disabled={savingNew || disabled}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Last name</Label>
                <Input
                  value={newLastName}
                  onChange={e => setNewLastName(e.target.value)}
                  disabled={savingNew || disabled}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                disabled={savingNew || disabled}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input
                type="tel"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                disabled={savingNew || disabled}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAddingNew(false)}
                disabled={savingNew}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleCreateContact}
                disabled={savingNew || disabled}
                className="flex-1"
              >
                {savingNew ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  <><Plus className="h-4 w-4 mr-2" />Save client</>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Admin mode: full CRM with Company (B2B) and Contact (B2C) tabs ──────────
  return (
    <Tabs value={tab} onValueChange={v => setTab(v as 'company' | 'contact')}>
      <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
        <TabsTrigger value="company" className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5" />
          Company (B2B)
        </TabsTrigger>
        <TabsTrigger value="contact" className="flex items-center gap-2">
          <UserIcon className="h-3.5 w-3.5" />
          Contact (B2C)
        </TabsTrigger>
      </TabsList>

      <div className="mt-3 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={tab === 'company' ? 'Search companies...' : 'Search contacts...'}
          className="pl-9"
          disabled={disabled}
        />
      </div>

      <TabsContent value="company" className="mt-3">
        <div className="max-h-48 overflow-y-auto space-y-1">
          {loading && <div className="text-sm text-muted-foreground py-2">Searching...</div>}
          {!loading && companies.length === 0 && (
            <div className="text-sm text-muted-foreground py-4 text-center">
              {search ? 'No companies matched.' : 'Start typing to search.'}
            </div>
          )}
          {companies.map(c => (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange({
                client_company_id: c.id,
                client_contact_id: null,
                display_name: c.name,
              })}
              className="w-full text-left p-2.5 rounded-lg hover:bg-muted/60 transition-colors flex items-center gap-2"
            >
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                {c.email && <p className="text-xs text-muted-foreground truncate">{c.email}</p>}
              </div>
            </button>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="contact" className="mt-3">
        <div className="max-h-48 overflow-y-auto space-y-1">
          {loading && <div className="text-sm text-muted-foreground py-2">Searching...</div>}
          {!loading && contacts.length === 0 && (
            <div className="text-sm text-muted-foreground py-4 text-center">
              {search ? 'No contacts matched.' : 'Start typing to search.'}
            </div>
          )}
          {contacts.map(c => {
            const label = contactDisplay(c);
            return (
              <button
                key={c.id}
                type="button"
                disabled={disabled}
                onClick={() => onChange({
                  client_company_id: null,
                  client_contact_id: c.id,
                  display_name: label,
                })}
                className="w-full text-left p-2.5 rounded-lg hover:bg-muted/60 transition-colors flex items-center gap-2"
              >
                <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{label}</p>
                  {c.email && <p className="text-xs text-muted-foreground truncate">{c.email}</p>}
                </div>
              </button>
            );
          })}
        </div>
      </TabsContent>
    </Tabs>
  );
};
