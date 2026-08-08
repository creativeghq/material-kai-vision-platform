import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';
import { entityTemplatesService, type EntityTemplate } from '@/services/entityTemplatesService';
import { getAdapter } from '@/services/templates/registry';
import type { TemplateEntityType } from '@/services/templates/types';

/**
 * "Start from a template" — the apply half of the template engine (issue #322).
 *
 * Two modes:
 *  - default: apply the template and navigate to whatever it produced.
 *  - `onSelect`: hand the template back to the caller instead. Money documents use this — the
 *    invoice dialog pre-fills its own form rather than letting a template create a legal document
 *    behind the operator's back.
 */
export const TemplatePickerDialog: React.FC<{
  entityType: TemplateEntityType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Attach whatever is created to this project. */
  projectId?: string | null;
  /** Party the new record is for, when the calling form already knows it. */
  customer?: { companyId?: string | null; contactId?: string | null };
  /** Name the new record, when the calling form already has one typed. */
  title?: string;
  /** The employee an onboarding checklist is applied to. */
  hrEmployeeId?: string | null;
  /** Take over instead of applying — receives the chosen template. */
  onSelect?: (template: EntityTemplate) => void;
}> = ({ entityType, open, onOpenChange, projectId, customer, title, hrEmployeeId, onSelect }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const workspaceId = getActiveWorkspaceId(user?.id);
  const adapter = getAdapter(entityType);

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<EntityTemplate[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates(await entityTemplatesService.list({ entityType, workspaceId }));
    } catch (e) {
      toast({ title: 'Failed to load templates', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [entityType, workspaceId, toast]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const choose = async (tpl: EntityTemplate) => {
    if (onSelect) { onOpenChange(false); onSelect(tpl); return; }
    if (!workspaceId) { toast({ title: 'No active workspace', variant: 'destructive' }); return; }
    setBusyId(tpl.id);
    try {
      const result = await entityTemplatesService.apply(tpl.id, { workspaceId, projectId, customer, title, hrEmployeeId });
      onOpenChange(false);
      if (result.message) toast({ title: result.message });
      navigate(result.route);
    } catch (e) {
      toast({ title: 'Could not use this template', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const own = templates.filter((t) => !t.is_platform_starter);
  const starters = templates.filter((t) => t.is_platform_starter);

  const Row = ({ tpl }: { tpl: EntityTemplate }) => {
    let facts: string[] = [];
    try { facts = adapter?.summary(tpl.payload as never) ?? []; } catch { facts = []; }
    return (
      <button
        type="button"
        className="w-full text-left rounded-lg border border-border/60 px-3 py-2 hover:bg-muted/50 transition-colors disabled:opacity-50"
        disabled={busyId === tpl.id}
        onClick={() => choose(tpl)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{tpl.title}</span>
          {tpl.is_platform_starter && <Badge variant="outline" className="text-[10px] h-4">Starter</Badge>}
          {busyId === tpl.id && <Loader2 className="h-3.5 w-3.5 animate-spin ml-auto" />}
        </div>
        {tpl.description && <div className="text-xs text-muted-foreground line-clamp-1">{tpl.description}</div>}
        {facts.length > 0 && <div className="text-[11px] text-muted-foreground mt-0.5">{facts.join(' · ')}</div>}
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Start from a template</DialogTitle>
          <DialogDescription>
            Pick a saved {adapter?.label.toLowerCase() ?? 'record'} shape, or one of the platform starters.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : templates.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No {adapter?.plural.toLowerCase() ?? 'record'} templates yet. Save one from an existing record first.
          </div>
        ) : (
          <div className="space-y-4 max-h-[55vh] overflow-y-auto">
            {own.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Your templates</div>
                <div className="space-y-2">{own.map((t) => <Row key={t.id} tpl={t} />)}</div>
              </div>
            )}
            {starters.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Starter examples
                </div>
                <div className="space-y-2">{starters.map((t) => <Row key={t.id} tpl={t} />)}</div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="ghost" className="rounded-full" onClick={() => { onOpenChange(false); navigate('/templates'); }}>
            Manage templates
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TemplatePickerDialog;
