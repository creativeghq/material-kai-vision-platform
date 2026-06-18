/**
 * CategoryAssignmentPicker — embeddable component that lets an admin pick
 * which CRM categories a user / contact / company belongs to. Drops into the
 * CRM detail pages without the full Categories admin page.
 *
 * Wires through crmCategoriesService.setMembershipsFor*. Auto-synced
 * categories (kind != 'manual') are visible but disabled — those are managed
 * by the resync RPC, not by hand.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Tags } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { crmCategoriesService, type CrmCategorySummary } from '@/services/crmCategoriesService';
import { getErrorMessage } from '@/core/errors/utils';

type Target =
  | { kind: 'user'; id: string }
  | { kind: 'contact'; id: string }
  | { kind: 'company'; id: string };

interface Props {
  target: Target;
  className?: string;
}

export const CategoryAssignmentPicker: React.FC<Props> = ({ target, className }) => {
  const { toast } = useToast();
  const [categories, setCategories] = useState<CrmCategorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const list = await crmCategoriesService.list();
      setCategories(list.filter((c) => c.is_active));
      const ids =
        target.kind === 'user'    ? await crmCategoriesService.listMembershipsForUser(target.id) :
        target.kind === 'contact' ? await crmCategoriesService.listMembershipsForContact(target.id) :
                                    await crmCategoriesService.listMembershipsForCompany(target.id);
      setMemberOf(new Set(ids));
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [target, toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const toggle = async (categoryId: string) => {
    // Auto-synced categories are read-only here — managed by the resync RPC.
    // Only manual categories can be toggled by the admin.
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat || cat.kind !== 'manual') return;

    const next = new Set(memberOf);
    if (next.has(categoryId)) next.delete(categoryId);
    else next.add(categoryId);
    setMemberOf(next);
    setSaving(true);
    try {
      const manualIds = categories.filter((c) => c.kind === 'manual').map((c) => c.id);
      const wantManualMemberships = manualIds.filter((id) => next.has(id));
      if (target.kind === 'user') {
        await crmCategoriesService.setMembershipsForUser(target.id, wantManualMemberships);
      } else if (target.kind === 'contact') {
        await crmCategoriesService.setMembershipsForContact(target.id, wantManualMemberships);
      } else {
        await crmCategoriesService.setMembershipsForCompany(target.id, wantManualMemberships);
      }
    } catch (err) {
      toast({ title: 'Save failed', description: getErrorMessage(err), variant: 'destructive' });
      const ids =
        target.kind === 'user'    ? await crmCategoriesService.listMembershipsForUser(target.id) :
        target.kind === 'contact' ? await crmCategoriesService.listMembershipsForContact(target.id) :
                                    await crmCategoriesService.listMembershipsForCompany(target.id);
      setMemberOf(new Set(ids));
    } finally { setSaving(false); }
  };

  const grouped = useMemo(() => {
    const out = { manual: [] as CrmCategorySummary[], professional_type: [] as CrmCategorySummary[], role: [] as CrmCategorySummary[] };
    for (const c of categories) out[c.kind].push(c);
    return out;
  }, [categories]);

  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Tags className="h-4 w-4" /> CRM Categories
        </CardTitle>
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 py-3 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Custom</div>
              <div className="flex flex-wrap gap-1.5">
                {grouped.manual.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No custom categories yet. Add some at /admin/crm?tab=categories.</div>
                ) : grouped.manual.map((c) => {
                  const active = memberOf.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggle(c.id)}
                      disabled={saving}
                      className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 transition border ${
                        active ? 'bg-primary text-primary-foreground border-primary' :
                        'border-border hover:border-primary/50'
                      }`}
                    >
                      {c.color_hex && <span className="w-2 h-2 rounded-full" style={{ background: c.color_hex }} />}
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {(grouped.professional_type.length > 0 || grouped.role.length > 0) && (
              <div className="space-y-2 pt-2 border-t">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Auto-synced (read-only)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[...grouped.professional_type, ...grouped.role].filter((c) => memberOf.has(c.id)).map((c) => (
                    <Badge key={c.id} variant="secondary" className="text-xs">
                      {c.color_hex && <span className="w-2 h-2 rounded-full mr-1.5" style={{ background: c.color_hex }} />}
                      {c.name}
                    </Badge>
                  ))}
                  {[...grouped.professional_type, ...grouped.role].filter((c) => memberOf.has(c.id)).length === 0 && (
                    <span className="text-xs text-muted-foreground">— none</span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Synced from {target.kind === 'user' ? 'user_profiles.professional_type / role' : 'underlying record'}. Edit the source field then run "Resync auto" on the Categories page.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
