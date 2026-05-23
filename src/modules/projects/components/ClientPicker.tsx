import React, { useEffect, useState } from 'react';
import { Building2, User as UserIcon, X, Search } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/core/ui/tabs';
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
}

export const ClientPicker: React.FC<ClientPickerProps> = ({ value, onChange, disabled }) => {
  const [search, setSearch] = useState('');
  const [companies, setCompanies] = useState<Array<{ id: string; name: string; email: string | null }>>([]);
  const [contacts, setContacts] = useState<Array<{ id: string; name: string | null; first_name: string | null; last_name: string | null; email: string | null }>>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'company' | 'contact'>(value.client_contact_id ? 'contact' : 'company');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        if (tab === 'company') {
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
  }, [search, tab]);

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

  return (
    <Tabs value={tab} onValueChange={v => setTab(v as 'company' | 'contact')}>
      <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
        <TabsTrigger value="company" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <Building2 className="h-3.5 w-3.5" />
          Company (B2B)
        </TabsTrigger>
        <TabsTrigger value="contact" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
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
