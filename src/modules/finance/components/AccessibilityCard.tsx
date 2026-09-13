/**
 * European Accessibility Act position (#450) — Directive (EU) 2019/882, Ν. 4994/2022.
 *
 * In force since 28 June 2025, and the transitional period covers service contracts and equipment,
 * not the storefront. The disproportionate-burden defence is an audited, renewable claim under
 * Annex VI — which is why it lives here as a dated record with an expiry rather than a checkbox.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, Accessibility, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Checkbox } from '@/components/core/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISO } from '@/utils/datetime';
import {
  accessibilityService, accessibilityNeedsAttention, burdenClaimIsVoid,
  type AccessibilityPosition, type AccessibilityAssessment,
} from '@/modules/finance/services/accessibilityService';

export const AccessibilityCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [position, setPosition] = useState<AccessibilityPosition | null>(null);
  const [history, setHistory] = useState<AccessibilityAssessment[]>([]);
  const [statement, setStatement] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    assessed_on: todayLocalISO(),
    conclusion: '',
    annex_vi_documentation: '',
    disproportionate_burden_claimed: false,
    funding_received: false,
    funding_source: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, h, s] = await Promise.all([
        accessibilityService.position(workspaceId),
        accessibilityService.listAssessments(workspaceId),
        accessibilityService.getStatement(workspaceId, 'el'),
      ]);
      setPosition(p); setHistory(h); setStatement(s?.body ?? ''); setFailed(false);
    } catch {
      setPosition(null); setHistory([]); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const voidClaim = burdenClaimIsVoid(form);

  const record = async () => {
    setSaving(true);
    try {
      await accessibilityService.recordAssessment({
        workspace_id: workspaceId, subject: 'storefront',
        assessed_on: form.assessed_on, conclusion: form.conclusion,
        annex_vi_documentation: form.annex_vi_documentation || null,
        disproportionate_burden_claimed: form.disproportionate_burden_claimed,
        funding_received: form.funding_received,
        funding_source: form.funding_source || null,
      });
      await load();
      toast({ title: 'Assessment recorded' });
    } catch (err: unknown) {
      toast({
        title: 'Could not record the assessment',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setSaving(false); }
  };

  const saveStatement = async () => {
    setSaving(true);
    try {
      await accessibilityService.saveStatement(workspaceId, 'el', statement);
      await load();
      toast({ title: 'Accessibility statement saved' });
    } catch (err: unknown) {
      toast({
        title: 'Could not save the statement',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Accessibility className="h-4 w-4 text-primary" /> Accessibility (EAA)
        </CardTitle>
        <CardDescription>
          The regulated thing is the selling service, not what is sold — an online tile shop is in
          scope. There is no presumption of conformity available, so EN 301 549 / WCAG 2.1 AA is the
          benchmark and not a legal shield.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the accessibility position…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The accessibility position could not be read just now. That is not a statement that one
            is on record.
          </p>
        )}

        {!loading && !failed && position && (
          <div
            className={`rounded-md border p-2 text-xs ${
              accessibilityNeedsAttention(position)
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : 'border-hairline bg-surface-sunken text-muted-foreground'
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              {accessibilityNeedsAttention(position)
                ? <AlertTriangle className="h-3.5 w-3.5" />
                : <CheckCircle2 className="h-3.5 w-3.5" />}
              {position.status.replace(/_/g, ' ')}
            </div>
            <p className="mt-1">{position.reason}</p>
            {position.has_statement === false && (
              <p className="mt-1">No public accessibility statement is published.</p>
            )}
          </div>
        )}

        <div className="space-y-2 rounded-md border border-hairline p-3">
          <p className="text-sm font-medium">Record an assessment</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="eaa-date" className="text-[11px]">Assessed on</Label>
              <Input
                id="eaa-date" type="date" className="mt-1 h-8 text-xs" value={form.assessed_on}
                onChange={(e) => setForm((f) => ({ ...f, assessed_on: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="eaa-funding-source" className="text-[11px]">Funding source, if any</Label>
              <Input
                id="eaa-funding-source" className="mt-1 h-8 text-xs" value={form.funding_source}
                onChange={(e) => setForm((f) => ({ ...f, funding_source: e.target.value }))}
                placeholder="ΕΣΠΑ, RRF, …"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="eaa-conclusion" className="text-[11px]">Conclusion</Label>
            <Textarea
              id="eaa-conclusion" className="mt-1 text-xs" rows={2} value={form.conclusion}
              onChange={(e) => setForm((f) => ({ ...f, conclusion: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="eaa-annex" className="text-[11px]">Annex VI documentation</Label>
            <Textarea
              id="eaa-annex" className="mt-1 text-xs" rows={2} value={form.annex_vi_documentation}
              onChange={(e) => setForm((f) => ({ ...f, annex_vi_documentation: e.target.value }))}
            />
          </div>
          <label className="flex items-start gap-2 text-xs">
            <Checkbox
              className="mt-0.5" checked={form.funding_received}
              onCheckedChange={(v) => setForm((f) => ({ ...f, funding_received: v === true }))}
            />
            <span>We received funding to improve accessibility from other than our own resources</span>
          </label>
          <label className="flex items-start gap-2 text-xs">
            <Checkbox
              className="mt-0.5" checked={form.disproportionate_burden_claimed}
              onCheckedChange={(v) => setForm((f) => ({ ...f, disproportionate_burden_claimed: v === true }))}
            />
            <span>We are claiming a disproportionate burden</span>
          </label>

          {voidClaim && (
            <p className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              Art 14(6) voids the disproportionate-burden defence outright where funding was
              received for the purpose of improving accessibility. These two cannot both be true.
            </p>
          )}

          <Button size="sm" onClick={record} disabled={saving || voidClaim || !form.conclusion.trim()}>
            {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
            Record assessment
          </Button>
        </div>

        <div className="space-y-2 rounded-md border border-hairline p-3">
          <Label htmlFor="eaa-statement" className="text-sm font-medium">Accessibility statement</Label>
          <Textarea
            id="eaa-statement" className="text-xs" rows={5} value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder="Shown on the storefront. Say what conforms, what does not, and how to reach a person."
          />
          <Button size="sm" variant="outline" onClick={saveStatement} disabled={saving || !statement.trim()}>
            <Save className="mr-2 h-3.5 w-3.5" /> Save statement
          </Button>
        </div>

        {history.length > 0 && (
          <div className="space-y-1 text-[11px] text-muted-foreground">
            <p className="font-medium">Earlier assessments</p>
            {history.map((h) => (
              <p key={h.id} className="tabular-nums">
                {h.assessed_on} → review due {h.next_review_due}
                {h.disproportionate_burden_claimed ? ' · burden claimed' : ''}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
