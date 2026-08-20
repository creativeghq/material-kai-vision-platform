import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw, FileText } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Switch } from '@/components/core/ui/switch';
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
  const [defaultNotes, setDefaultNotes] = useState('');
  const [showPayLink, setShowPayLink] = useState(true);
  const [showPrevBalance, setShowPrevBalance] = useState(true);

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
        setDefaultNotes((s as any).default_invoice_notes ?? '');
        setShowPayLink((s as any).invoice_show_pay_link !== false);
        setShowPrevBalance((s as any).invoice_show_previous_balance !== false);
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
        default_invoice_notes: defaultNotes.trim() || null,
        invoice_show_pay_link: showPayLink,
        invoice_show_previous_balance: showPrevBalance,
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
        <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Invoice design template</CardTitle>
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
            <Button size="sm" variant="ghost" className="gap-1.5 h-7 text-xs" onClick={resetColors}>
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

        <div className="space-y-1.5">
          <Label className="text-xs">Default invoice notes / footer</Label>
          <Textarea
            rows={3}
            value={defaultNotes}
            onChange={(e) => setDefaultNotes(e.target.value)}
            placeholder="e.g. Payment due within 30 days. Goods remain our property until paid in full."
          />
          <p className="text-[11px] text-muted-foreground">Pre-fills the Notes field on every new invoice (you can still edit it per invoice). Printed at the bottom of the invoice.</p>
        </div>

        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label className="text-xs">Show "Pay / View online" link + QR</Label>
              <p className="text-[11px] text-muted-foreground">Prints a scannable QR + link to the hosted payment page on payable invoices (PDF and email).</p>
            </div>
            <Switch checked={showPayLink} onCheckedChange={setShowPayLink} />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label className="text-xs">Show customer's previous balance</Label>
              <p className="text-[11px] text-muted-foreground">Prints the carry-forward (previous balance / credit) and total outstanding below the invoice total.</p>
            </div>
            <Switch checked={showPrevBalance} onCheckedChange={setShowPrevBalance} />
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Save template
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default InvoiceTemplateCard;
