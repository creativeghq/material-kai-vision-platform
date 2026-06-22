/**
 * IndustrySelect — multi-select for a company's industries, backed by the CRM
 * Categories system (`kind='industry'`). Self-saving: toggles write category
 * memberships immediately via `setCompanyMembershipsWithinScope` (so it never
 * clobbers the company's other manual category memberships), and mirrors a
 * denormalized comma-joined label onto `crm_companies.industry` so existing
 * list/table readers keep rendering. Operators can add a new industry inline;
 * full management lives at /admin/crm → Categories.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Plus, Loader2, X } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { crmCategoriesService, type CrmCategory } from '@/services/crmCategoriesService';
import { companiesAPI } from '@/services/crm.service';
import { getErrorMessage } from '@/core/errors/utils';

interface Props {
  companyId: string;
  readOnly?: boolean;
  /** Mirror the chosen industry names back to the parent (for its local denormalized label). */
  onChange?: (names: string[]) => void;
}

export const IndustrySelect: React.FC<Props> = ({ companyId, readOnly, onChange }) => {
  const { toast } = useToast();
  const [industries, setIndustries] = useState<CrmCategory[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

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

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created = await crmCategoriesService.create({ name, kind: 'industry' });
      const nextList = [...industries, created as CrmCategory].sort((a, b) => a.name.localeCompare(b.name));
      setIndustries(nextList);
      setNewName('');
      await persist([...selectedIds, created.id], nextList);
    } catch (err) {
      toast({ title: 'Could not add industry', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const selected = useMemo(
    () => industries.filter((c) => selectedIds.includes(c.id)),
    [industries, selectedIds],
  );

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading industries…</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {selected.length === 0 && <span className="text-sm text-muted-foreground">No industries set</span>}
        {selected.map((c) => (
          <Badge key={c.id} variant="secondary" className="gap-1">
            {c.name}
            {!readOnly && (
              <button type="button" onClick={() => toggle(c.id)} className="ml-0.5 opacity-70 hover:opacity-100">
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>

      {!readOnly && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="justify-between gap-2">
              Select industries
              <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="start">
            <div className="max-h-56 overflow-y-auto space-y-0.5">
              {industries.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">No industries yet — add one below.</p>
              )}
              {industries.map((c) => {
                const checked = selectedIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted text-left"
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? 'bg-primary border-primary text-primary-foreground' : 'border-input'}`}>
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    {c.name}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-1.5 border-t pt-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
                placeholder="Add new industry…"
                className="h-8 text-sm"
              />
              <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={handleCreate} disabled={creating || !newName.trim()}>
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};

export default IndustrySelect;
