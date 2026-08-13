/**
 * LeadFieldSelect — pick-one dropdown for a contact's Lead Status / Lead Source,
 * backed by the CRM Categories system (`kind='lead_status' | 'lead_source'`).
 *
 * Dropdown only. The option list is managed exclusively at /crm →
 * Categories — there is no inline free-text entry and no free-text fallback.
 * The chosen option's NAME is stored as a string on `crm_contacts.lead_status`
 * / `.lead_source` via the supplied `onSave` ("Not set" clears to null).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { InlineSelect } from '@/components/business/crm/inline/InlineFields';
import { useToast } from '@/hooks/use-toast';
import { crmCategoriesService, type CrmCategory, type CrmCategoryKind } from '@/services/crmCategoriesService';
import { getErrorMessage } from '@/core/errors/utils';

interface Props {
  kind: Extract<CrmCategoryKind, 'lead_status' | 'lead_source'>;
  label: string;
  value?: string | null;
  onSave: (value: string | null) => void | Promise<void>;
  placeholder?: string;
  alwaysEdit?: boolean;
}

export const LeadFieldSelect: React.FC<Props> = ({ kind, label, value, onSave, placeholder = 'Not set', alwaysEdit }) => {
  const { toast } = useToast();
  const [categories, setCategories] = useState<CrmCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setCategories(await crmCategoriesService.listByKind(kind));
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [kind, toast]);

  useEffect(() => { load(); }, [load]);

  const options = useMemo(
    () => categories.map((c) => ({
      value: c.name,
      label: (
        <span className="flex items-center gap-1.5">
          {c.color_hex && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c.color_hex }} />}
          {c.name}
        </span>
      ),
      searchText: c.name,
    })),
    [categories],
  );

  if (loading) {
    return (
      <div>
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
      </div>
    );
  }

  return (
    <InlineSelect
      label={label}
      value={value}
      onSave={(v) => onSave((v as string | null) ?? null)}
      options={options}
      placeholder={placeholder}
      alwaysEdit={alwaysEdit}
    />
  );
};

export default LeadFieldSelect;
