/**
 * CategoryAssignmentPicker — embeddable component that lets an admin pick which
 * CRM categories a user / contact / company belongs to. Drops into the CRM
 * detail pages without the full Categories admin page.
 *
 * Shows ALL category kinds (Custom + Professional type + Role) as assignable
 * tags on contacts and companies. For platform USERS the professional_type /
 * role categories are auto-synced from user_profiles.professional_type / role,
 * so there they stay read-only (managed by the resync RPC); only Custom is
 * hand-toggled. Industry + the lead vocabularies have their own dedicated
 * pickers, so they're not duplicated here.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Tags } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { crmCategoriesService, type CrmCategorySummary, type CrmCategoryKind } from '@/services/crmCategoriesService';
import { getErrorMessage } from '@/core/errors/utils';

type Target =
  | { kind: 'user'; id: string }
  | { kind: 'contact'; id: string }
  | { kind: 'company'; id: string };

interface Props {
  target: Target;
  className?: string;
}

/** Kinds rendered here, in order. Industry + lead_status/lead_source are excluded —
 * they have dedicated UIs (IndustrySelect + the Lead dropdowns). */
const GROUPS: Array<{ key: Extract<CrmCategoryKind, 'manual' | 'professional_type' | 'role'>; label: string }> = [
  { key: 'manual', label: 'Custom' },
  { key: 'professional_type', label: 'Professional type' },
  { key: 'role', label: 'Role' },
];

export const CategoryAssignmentPicker: React.FC<Props> = ({ target, className }) => {
  const { toast } = useToast();
  const [categories, setCategories] = useState<CrmCategorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const refreshMemberships = useCallback(async () => {
    const ids =
      target.kind === 'user'    ? await crmCategoriesService.listMembershipsForUser(target.id) :
      target.kind === 'contact' ? await crmCategoriesService.listMembershipsForContact(target.id) :
                                  await crmCategoriesService.listMembershipsForCompany(target.id);
    setMemberOf(new Set(ids));
  }, [target]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const list = await crmCategoriesService.list();
      setCategories(list.filter((c) => c.is_active));
      await refreshMemberships();
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [refreshMemberships, toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const grouped = useMemo(() => {
    const out: Record<string, CrmCategorySummary[]> = { manual: [], professional_type: [], role: [] };
    for (const c of categories) out[c.kind]?.push(c);
    return out;
  }, [categories]);

  const toggle = async (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    // On platform users, professional_type / role are auto-synced → read-only here.
    if (target.kind === 'user' && cat.kind !== 'manual') return;

    const next = new Set(memberOf);
    if (next.has(categoryId)) next.delete(categoryId); else next.add(categoryId);
    setMemberOf(next);
    setSaving(true);
    try {
      if (target.kind === 'user') {
        // Only manual memberships are hand-managed for users; auto rows stay put.
        const manualIds = categories.filter((c) => c.kind === 'manual').map((c) => c.id);
        await crmCategoriesService.setMembershipsForUser(target.id, manualIds.filter((id) => next.has(id)));
      } else if (target.kind === 'contact') {
        // Contacts/companies have no auto memberships — every assignment is manual,
        // so any kind can be freely toggled. Persist the full selection.
        await crmCategoriesService.setMembershipsForContact(target.id, [...next]);
      } else {
        await crmCategoriesService.setMembershipsForCompany(target.id, [...next]);
      }
    } catch (err) {
      toast({ title: 'Save failed', description: getErrorMessage(err), variant: 'destructive' });
      await refreshMemberships();
    } finally { setSaving(false); }
  };

  const anyCategories = categories.some((c) => c.kind === 'manual' || c.kind === 'professional_type' || c.kind === 'role');

  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Tags className="h-4 w-4" /> CRM Categories
        </CardTitle>
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 py-3 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !anyCategories ? (
          <div className="text-xs text-muted-foreground">
            No categories yet.{' '}
            <a href="/admin/crm?tab=categories" className="text-primary hover:underline">Create some →</a>
          </div>
        ) : (
          GROUPS.map(({ key, label }) => {
            const list = grouped[key] ?? [];
            if (list.length === 0) return null;
            const readOnly = target.kind === 'user' && key !== 'manual';
            const activeReadOnly = readOnly ? list.filter((c) => memberOf.has(c.id)) : [];
            return (
              <div key={key} className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {label}{readOnly && ' (auto-synced)'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {readOnly ? (
                    activeReadOnly.length === 0
                      ? <span className="text-xs text-muted-foreground">— none</span>
                      : activeReadOnly.map((c) => (
                          <Badge key={c.id} variant="secondary" className="text-xs">
                            {c.color_hex && <span className="w-2 h-2 rounded-full mr-1.5" style={{ background: c.color_hex }} />}
                            {c.name}
                          </Badge>
                        ))
                  ) : (
                    list.map((c) => {
                      const active = memberOf.has(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggle(c.id)}
                          disabled={saving}
                          className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 transition border ${
                            active ? 'bg-primary text-primary-foreground border-primary'
                                   : 'border-border hover:border-primary/50'
                          }`}
                        >
                          {c.color_hex && <span className="w-2 h-2 rounded-full" style={{ background: c.color_hex }} />}
                          {c.name}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })
        )}
        {!loading && target.kind === 'user' && (grouped.professional_type?.length > 0 || grouped.role?.length > 0) && (
          <p className="text-[10px] text-muted-foreground">
            Professional type / role are synced from the user's profile — edit the source field then run "Resync auto" on the Categories page.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
