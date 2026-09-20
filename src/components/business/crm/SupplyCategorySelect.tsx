import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Package, RefreshCw, Check } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/core/errors/utils';
import { companiesAPI } from '@/services/crm.service';
import {
  crmCategoriesService,
  type SupplyCategoryOption,
} from '@/services/crmCategoriesService';

interface Props {
  target: { kind: 'contact' | 'company'; id: string };
  readOnly?: boolean;
  className?: string;
  /** Mirror the chosen names back to the parent, which holds its own denormalized label. */
  onChange?: (names: string[]) => void;
}

export const SupplyCategorySelect: React.FC<Props> = ({ target, readOnly, className, onChange }) => {
  const { toast } = useToast();
  const [options, setOptions] = useState<SupplyCategoryOption[]>([]);
  const [unsynced, setUnsynced] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [evidence, setEvidence] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const targetKind = target.kind;
  const targetId = target.id;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [list, memberships] = await Promise.all([
        crmCategoriesService.listSupplyCategories(),
        targetKind === 'company'
          ? crmCategoriesService.listMembershipsForCompany(targetId)
          : crmCategoriesService.listMembershipsForContact(targetId),
      ]);
      setOptions(list.options);
      setUnsynced(list.unsynced);
      const scope = new Set(list.options.map((o) => o.id));
      setSelected(new Set(memberships.filter((id) => scope.has(id))));
      if (targetKind === 'company') {
        try {
          setEvidence(await crmCategoriesService.supplyEvidenceForCompany(targetId));
        } catch {
          setEvidence(new Set());
        }
      }
    } catch (err) {
      toast({ title: 'Could not load categories', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [targetKind, targetId, toast]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (optionId: string) => {
    if (readOnly || saving) return;
    const next = new Set(selected);
    if (next.has(optionId)) next.delete(optionId); else next.add(optionId);
    const prev = selected;
    setSelected(next);
    setSaving(true);
    try {
      const scopeIds = options.map((o) => o.id);
      const names = options.filter((o) => next.has(o.id)).map((o) => o.name);
      if (targetKind === 'company') {
        await crmCategoriesService.setCompanyMembershipsWithinScope(targetId, scopeIds, [...next]);
        await companiesAPI.updateCompany(targetId, { industry: names.join(', ') || null });
      } else {
        await crmCategoriesService.setContactMembershipsWithinScope(targetId, scopeIds, [...next]);
      }
      onChange?.(names);
    } catch (err) {
      setSelected(prev);
      toast({ title: 'Could not save', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const result = await crmCategoriesService.syncSupplyCategories();
      const created = result.filter((r) => r.out_action === 'created').length;
      const matched = result.filter((r) => r.out_action === 'matched').length;
      toast({
        title: 'Categories matched',
        description: `${created} added from the product catalogue, ${matched} existing matched.`,
      });
      await load();
    } catch (err) {
      toast({ title: 'Could not match categories', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const groups = useMemo(() => ({
    product: options.filter((o) => o.material_category_id),
    other: options.filter((o) => !o.material_category_id),
  }), [options]);

  const untagged = useMemo(
    () => groups.product.filter((o) => o.material_category_id
      && evidence.has(o.material_category_id) && !selected.has(o.id)),
    [groups.product, evidence, selected],
  );

  const syncButton = (
    <Button size="sm" variant="secondary" onClick={runSync} disabled={syncing}>
      {syncing ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
      Match product categories
    </Button>
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <HubEmptyState
        icon={Package}
        title="No product categories yet"
        description="Pull the categories in from the product catalogue, then tag what this party deals in."
        action={readOnly ? undefined : syncButton}
        className={className}
      />
    );
  }

  const renderGroup = (label: string, list: SupplyCategoryOption[], hint?: string) => {
    if (list.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
          {hint && <span className="ml-2 normal-case tracking-normal">{hint}</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {list.map((o) => {
            const active = selected.has(o.id);
            const stocked = !!o.material_category_id && evidence.has(o.material_category_id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                disabled={readOnly || saving}
                title={stocked ? 'This supplier already has products filed under this category' : undefined}
                className={cn(
                  'px-3 py-1.5 text-xs flex items-center gap-1.5 rounded-sm border transition disabled:opacity-60',
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:border-primary/50',
                  !active && stocked && 'border-amber-800 dark:border-amber-300',
                )}
              >
                {active && <Check className="h-3 w-3" />}
                {o.name}
                {stocked && <Package className="h-3 w-3 opacity-70" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className={cn('space-y-4', className)}>
      {renderGroup('Product categories', groups.product)}
      {renderGroup('Other', groups.other, 'no product category answers to these')}

      {untagged.length > 0 && (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Has products filed under {untagged.map((o) => o.name).join(', ')} but is not tagged with
          {untagged.length === 1 ? ' it' : ' them'}.
        </p>
      )}

      {unsynced > 0 && !readOnly && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
          <span>{unsynced} product {unsynced === 1 ? 'category is' : 'categories are'} not offered here yet.</span>
          {syncButton}
        </div>
      )}
    </div>
  );
};

export default SupplyCategorySelect;
