/**
 * IndustrySelect — multi-select for a company's industries, backed by the CRM
 * Categories system (`kind='industry'`). Self-saving: toggles write category
 * memberships immediately via `setCompanyMembershipsWithinScope` (so it never
 * clobbers the company's other manual category memberships), and mirrors a
 * denormalized comma-joined label onto `crm_companies.industry` so existing
 * list/table readers keep rendering. Operators can add a new industry inline;
 * full management lives at /crm → Categories.
 *
 * Presentation is delegated to InlineMultiSelect so the field behaves like the
 * InlineText/InlineSelect rows beside it — the chips are the trigger, rather than a
 * permanent "Select industries" dropdown button parked under the value. This file
 * keeps the data + persistence logic only.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { InlineMultiSelect } from '@/components/business/crm/inline/InlineFields';
import { useToast } from '@/hooks/use-toast';
import { crmCategoriesService, type CrmCategory } from '@/services/crmCategoriesService';
import { companiesAPI } from '@/services/crm.service';
import { getErrorMessage } from '@/core/errors/utils';

interface Props {
  companyId: string;
  readOnly?: boolean;
  /** Field label rendered by the inline row (matches the sibling InlineText fields). */
  label?: string;
  /** Mirror the chosen industry names back to the parent (for its local denormalized label). */
  onChange?: (names: string[]) => void;
}

export const IndustrySelect: React.FC<Props> = ({ companyId, readOnly, label = 'Industry', onChange }) => {
  const { toast } = useToast();
  const [industries, setIndustries] = useState<CrmCategory[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [all, memberships] = await Promise.all([
        crmCategoriesService.listByKind('industry'),
        crmCategoriesService.listMembershipsForCompany(companyId),
      ]);
      setIndustries(all);
      const industryIdSet = new Set(all.map((c) => c.id));
      setSelectedIds(memberships.filter((id) => industryIdSet.has(id)));
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => { load(); }, [load]);

  const persist = useCallback(async (nextIds: string[], list: CrmCategory[]) => {
    setSaving(true);
    const prev = selectedIds;
    setSelectedIds(nextIds); // optimistic
    try {
      await crmCategoriesService.setCompanyMembershipsWithinScope(
        companyId, list.map((c) => c.id), nextIds,
      );
      // Mirror the denormalized label so company list/table views keep rendering.
      const names = list.filter((c) => nextIds.includes(c.id)).map((c) => c.name);
      await companiesAPI.updateCompany(companyId, { industry: names.join(', ') || null });
      onChange?.(names);
    } catch (err) {
      setSelectedIds(prev); // revert
      toast({ title: 'Could not save industries', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [companyId, selectedIds, onChange, toast]);

  const toggle = (id: string) => {
    if (readOnly) return;
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    persist(next, industries);
  };

  const handleCreate = async (rawName: string) => {
    const name = rawName.trim();
    if (!name) return;
    try {
      const created = await crmCategoriesService.create({ name, kind: 'industry' });
      const nextList = [...industries, created as CrmCategory].sort((a, b) => a.name.localeCompare(b.name));
      setIndustries(nextList);
      await persist([...selectedIds, created.id], nextList);
    } catch (err) {
      toast({ title: 'Could not add industry', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  const options = useMemo(
    () => industries.map((c) => ({ value: c.id, label: c.name })),
    [industries],
  );

  // Keep the same row shape while loading so the field doesn't jump on first paint.
  if (loading) {
    return <InlineMultiSelect label={label} values={[]} options={[]} onToggle={() => {}} placeholder="Loading…" readOnly />;
  }

  return (
    <InlineMultiSelect
      label={label}
      values={selectedIds}
      options={options}
      onToggle={toggle}
      onCreate={readOnly ? undefined : handleCreate}
      createPlaceholder="Add new industry…"
      emptyListText="No industries yet — add one below."
      placeholder="Not set"
      saving={saving}
      readOnly={readOnly}
    />
  );
};

export default IndustrySelect;
