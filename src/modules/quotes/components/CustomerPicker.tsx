// Reusable customer picker for quotes — searches CRM customer companies + client contacts.
// A quote's customer drives the pricing pyramid (customer-level pricing/discounts), the
// send-to-customer email recipient, and the bill-to on invoice conversion, so the primary
// quote-building surfaces must be able to set it.
import React, { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/core/ui/input';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { supabase } from '@/integrations/supabase/client';

export type QuoteCustomer = { type: 'company' | 'contact'; id: string; label: string };

export const CustomerPicker: React.FC<{
  value: QuoteCustomer | null;
  onChange: (v: QuoteCustomer | null) => void;
  label?: string;
  disabled?: boolean;
}> = ({ value, onChange, label = 'Customer', disabled }) => {
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<QuoteCustomer[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) { setOptions([]); return; }
    const t = setTimeout(async () => {
      const [companies, contacts] = await Promise.all([
        supabase.from('crm_companies').select('id, name').eq('is_customer', true).ilike('name', `%${term}%`).limit(6),
        supabase.from('crm_contacts').select('id, name, first_name, last_name, email').eq('is_client', true)
          .or(`name.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`).limit(6),
      ]);
      const opts: QuoteCustomer[] = [];
      for (const c of companies.data ?? []) opts.push({ type: 'company', id: (c as any).id, label: `${(c as any).name} (company)` });
      for (const c of contacts.data ?? []) {
        const l = (c as any).name || [(c as any).first_name, (c as any).last_name].filter(Boolean).join(' ') || (c as any).email || (c as any).id;
        opts.push({ type: 'contact', id: (c as any).id, label: l });
      }
      setOptions(opts);
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  if (value) {
    return (
      <div className="space-y-1">
        <Label>{label}</Label>
        <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
          <span className="text-sm">{value.label}</span>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(null)}>Change</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1" ref={boxRef}>
      <Label>{label}</Label>
      <div className="relative">
        <Input placeholder="Search a customer…" value={search} onChange={(e) => setSearch(e.target.value)} disabled={disabled} />
        {options.length > 0 && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border/60 bg-popover shadow-md">
            {options.map((o) => (
              <button key={`${o.type}-${o.id}`} type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => { onChange(o); setSearch(''); setOptions([]); }}>
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
