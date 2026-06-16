import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw, FileText } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';

import { financeService } from '@/modules/finance/services/financeService';
import {
  TEMPLATE_OPTIONS,
  COLOR_ROLE_LABELS,
  DEFAULT_TEMPLATE_ID,
  getTemplateSpec,
  resolveColors,
  type InvoiceColorRole,
  type InvoiceColors,
} from '@/modules/finance/invoice-templates';

/**
 * Workspace-level invoice design picker: choose a template (dropdown, no preview) and
 * set its colors. Persists to finance_settings.invoice_template_id / invoice_template_colors.
 * New invoices snapshot these at creation; the preview + PDF read them.
 */
export function InvoiceTemplateCard({ workspaceId }: { workspaceId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateId, setTemplateId] = useState<string>(DEFAULT_TEMPLATE_ID);
  const [colors, setColors] = useState<InvoiceColors>(() => getTemplateSpec(DEFAULT_TEMPLATE_ID).defaultColors);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const s = await financeService.getSettings(workspaceId);
        if (cancelled) return;
        const tid = s.invoice_template_id || DEFAULT_TEMPLATE_ID;
        setTemplateId(tid);
        setColors(resolveColors(tid, s.invoice_template_colors));
      } catch (err: any) {
        if (!cancelled) toast({ title: 'Failed to load template settings', description: err?.message, variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId, toast]);

  const spec = useMemo(() => getTemplateSpec(templateId), [templateId]);
  // Roles the chosen template actually uses (so we don't show irrelevant pickers).
  const roles = useMemo(() => Object.keys(spec.defaultColors) as InvoiceColorRole[], [spec]);

  const onPickTemplate = (tid: string) => {
    setTemplateId(tid);
    // Re-base colors on the new template's defaults (keeps it predictable; user re-tweaks).
    setColors(resolveColors(tid, null));
  };

  const setColor = (role: InvoiceColorRole, value: string) =>
    setColors((c) => ({ ...c, [role]: value }));

  const resetColors = () => setColors(resolveColors(templateId, null));

  const save = async () => {
    setSaving(true);
    try {
      await financeService.updateSettings(workspaceId, {
        invoice_template_id: templateId,
        invoice_template_colors: colors,
      });
      toast({ title: 'Invoice template saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Invoice design template</CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-5">
        <div className="space-y-1.5 max-w-md">
          <Label className="text-xs">Template</Label>
          <Select value={templateId} onValueChange={onPickTemplate}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TEMPLATE_OPTIONS.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{spec.description}</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs">Colors</Label>
            <Button size="sm" variant="ghost" className="rounded-full gap-1.5 h-7 text-xs" onClick={resetColors}>
              <RotateCcw className="h-3 w-3" /> Reset to defaults
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {roles.map((role) => (
              <div key={role} className="flex items-center gap-2">
                <input
                  type="color"
                  value={colors[role]}
                  onChange={(e) => setColor(role, e.target.value)}
                  className="h-8 w-9 rounded border border-border/50 bg-transparent cursor-pointer shrink-0"
                  aria-label={COLOR_ROLE_LABELS[role]}
                />
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{COLOR_ROLE_LABELS[role]}</div>
                  <div className="text-[10px] text-muted-foreground font-mono uppercase">{colors[role]}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" className="rounded-full" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Save template
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default InvoiceTemplateCard;
