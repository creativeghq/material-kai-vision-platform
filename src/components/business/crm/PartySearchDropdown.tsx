import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Check, Search, User } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { CRM_SEARCH_COLUMN, foldedLike } from '@/services/crmSearch';
import { Button } from '@/components/core/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/core/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import type { PartyRef } from '@/components/business/crm/partyRef';

// Re-exported so a call site needs one import, not two. The rules live in `partyRef.ts`, which
// is free of the Supabase client and therefore directly testable.
export type { PartyKind, PartyRef } from '@/components/business/crm/partyRef';
export { partyColumns, partyRefOf } from '@/components/business/crm/partyRef';

/**
 * Pick a CRM party — a COMPANY or a PERSON — for a field that can be either (#376).
 *
 * `ContactSearchDropdown` searches `crm_contacts` only, and it is what every real-estate
 * counterparty field used. Phase 0 of #376 gave `properties`, `property_offers`,
 * `property_sales` and `property_tenancies` their `*_company_id` twins, with a
 * `num_nonnulls(...) <= 1` check so a counterparty is one thing — and then nothing wrote them,
 * because the only picker on screen could not return a company. A vendor, a buyer, a landlord
 * or a tenant that is a firm — which in Greek property is most of them — still could not be
 * recorded. The model was symmetric; the surface was not.
 *
 * ONE PICKER, both tables, because the alternative is two controls side by side and an operator
 * guessing which one to use. The selection is `{ kind, id }`, so the caller sets the correct
 * column of the pair and clears the other — the CHECK constraint then physically prevents a
 * counterparty from being two things at once.
 *
 * Search goes through `CRM_SEARCH_COLUMN` + `foldedLike`, the one way to search a party here: it
 * matches the generated folded/transliterated column, so `Κώστας` finds `ΚΩΣΤΑΣ` and `societe`
 * finds `Société`. A raw `ilike` on `name` is the accent-sensitive bug that
 * tests/unit/crmPartySearch.test.ts exists to keep out.
 */

interface Option extends PartyRef { label: string; sub?: string | null }

/** Rows offered per table. A display cap, not a search cap — the server pages. */
const PER_TABLE = 8;

export function PartySearchDropdown({
  value,
  onSelect,
  placeholder = 'Search companies and people…',
  disabled = false,
}: {
  value: PartyRef | null;
  /** null when the field is cleared — a counterparty is legitimately optional. */
  onSelect: (party: PartyRef | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Option | null>(null);

  const valueKey = value ? `${value.kind}:${value.id}` : '';

  // Resolve the current value's name. Without this an edit form shows an empty picker over a
  // field that is set, and the operator's reasonable conclusion is that it is not set.
  useEffect(() => {
    let cancelled = false;
    if (!value) { setSelected(null); return; }
    if (selected && selected.kind === value.kind && selected.id === value.id) return;
    void (async () => {
      const table = value.kind === 'company' ? 'crm_companies' : 'crm_contacts';
      const { data } = await supabase.from(table).select('id, name').eq('id', value.id).maybeSingle();
      if (cancelled) return;
      setSelected(data ? { kind: value.kind, id: value.id, label: (data as { name: string }).name || value.id } : null);
    })();
    return () => { cancelled = true; };
    // `selected` is deliberately out of the deps: it is what this effect writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueKey]);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) { setOptions([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const [companies, contacts] = await Promise.all([
        supabase.from('crm_companies').select('id, name, email')
          .ilike(CRM_SEARCH_COLUMN, foldedLike(q)).limit(PER_TABLE),
        supabase.from('crm_contacts').select('id, name, first_name, last_name, email')
          .ilike(CRM_SEARCH_COLUMN, foldedLike(q)).limit(PER_TABLE),
      ]);
      const next: Option[] = [];
      for (const c of (companies.data ?? []) as Array<{ id: string; name: string | null; email: string | null }>) {
        next.push({ kind: 'company', id: c.id, label: c.name || c.id, sub: c.email });
      }
      for (const c of (contacts.data ?? []) as Array<{ id: string; name: string | null; first_name: string | null; last_name: string | null; email: string | null }>) {
        const label = c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || c.id;
        next.push({ kind: 'contact', id: c.id, label, sub: c.email });
      }
      setOptions(next);
      setLoading(false);
    }, 200);
    return () => { clearTimeout(t); setLoading(false); };
  }, [term]);

  const groups = useMemo(() => ({
    company: options.filter((o) => o.kind === 'company'),
    contact: options.filter((o) => o.kind === 'contact'),
  }), [options]);

  const pick = (o: Option) => {
    setSelected(o);
    onSelect({ kind: o.kind, id: o.id });
    setOpen(false);
    setTerm('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected
              ? (selected.kind === 'company' ? <Building2 className="h-4 w-4 shrink-0" /> : <User className="h-4 w-4 shrink-0" />)
              : <Search className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="truncate">{selected?.label ?? placeholder}</span>
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Type at least 2 characters…" value={term} onValueChange={setTerm} />
          <CommandList>
            {term.trim().length < 2
              ? <CommandEmpty>Search companies and people by name, email or VAT number.</CommandEmpty>
              : loading
                ? <CommandEmpty>Searching…</CommandEmpty>
                : options.length === 0
                  ? <CommandEmpty>Nothing matched. Add them in CRM first.</CommandEmpty>
                  : null}
            {groups.company.length > 0 && (
              <CommandGroup heading="Companies">
                {groups.company.map((o) => (
                  <CommandItem key={`c-${o.id}`} value={`c-${o.id}`} onSelect={() => pick(o)}>
                    <Building2 className="mr-2 h-4 w-4" />
                    <span className="truncate">{o.label}</span>
                    {o.sub && <span className="ml-2 truncate text-xs text-muted-foreground">{o.sub}</span>}
                    {value?.kind === 'company' && value.id === o.id && <Check className="ml-auto h-4 w-4" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {groups.contact.length > 0 && (
              <CommandGroup heading="People">
                {groups.contact.map((o) => (
                  <CommandItem key={`p-${o.id}`} value={`p-${o.id}`} onSelect={() => pick(o)}>
                    <User className="mr-2 h-4 w-4" />
                    <span className="truncate">{o.label}</span>
                    {o.sub && <span className="ml-2 truncate text-xs text-muted-foreground">{o.sub}</span>}
                    {value?.kind === 'contact' && value.id === o.id && <Check className="ml-auto h-4 w-4" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {selected && (
              <CommandGroup>
                <CommandItem
                  value="__clear"
                  onSelect={() => { setSelected(null); onSelect(null); setOpen(false); setTerm(''); }}
                >
                  <span className="text-muted-foreground">Clear</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

