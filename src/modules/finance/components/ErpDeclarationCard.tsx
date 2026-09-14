/**
 * The Α.1054 Δήλωση Συμβατότητας — an obligation on whoever BUILDS the ERP (#448).
 *
 * It is a filing, not a feature, and it is due the day BEFORE a version is first released. A
 * bespoke in-house system is still built and technically supported by somebody, so "this is ours,
 * not a product" does not settle it; reading the decision does.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, FileCheck, Save, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import {
  posInterconnectionService, DECLARATION_LABEL, declarationNeedsAttention,
  DECLARATION_DUTY_IS_OPEN,
  type DeclarationPosition,
} from '@/modules/finance/services/posInterconnectionService';

export const ErpDeclarationCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [position, setPosition] = useState<DeclarationPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ name: '', version: '', released: '', filed: '' });
  const [model, setModel] = useState({ declarationId: '', nsp: '', model: '' });

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      setPosition(await posInterconnectionService.declarations(workspaceId));
      setFailed(false);
    } catch {
      setPosition(null); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft.name.trim() || !draft.version.trim()) return;
    setBusy(true);
    try {
      await posInterconnectionService.saveDeclaration({
        workspaceId,
        softwareName: draft.name.trim(),
        softwareVersion: draft.version.trim(),
        firstReleasedOn: draft.released || null,
        filedWithAadeOn: draft.filed || null,
      });
      setDraft({ name: '', version: '', released: '', filed: '' });
      await load();
    } catch (err: unknown) {
      toast({
        title: 'Could not record the version',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const addModel = async () => {
    if (!model.declarationId || !model.nsp.trim() || !model.model.trim()) return;
    setBusy(true);
    try {
      await posInterconnectionService.addDeclaredModel(model.declarationId, model.nsp.trim(), model.model.trim());
      setModel((m) => ({ ...m, nsp: '', model: '' }));
      await load();
    } catch (err: unknown) {
      toast({
        title: 'Could not add the model',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileCheck className="h-4 w-4 text-primary" /> Δήλωση Συμβατότητας (Α.1054)
        </CardTitle>
        <CardDescription>
          Every commercial name and version, and per payment-service provider every POS model it can
          interconnect with, filed with AADE before the version is released.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-xs">
        {loading && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the declarations…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The declarations could not be read just now. That is not a statement that none are due.
          </p>
        )}

        {!loading && !failed && position && (
          <>
            <div
              className={`space-y-1 rounded-md border p-2 ${
                position.status === 'overdue'
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : declarationNeedsAttention(position)
                    ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                    : 'border-hairline bg-surface-sunken text-muted-foreground'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 font-medium">
                {declarationNeedsAttention(position)
                  ? <AlertTriangle className="h-3.5 w-3.5" />
                  : <CheckCircle2 className="h-3.5 w-3.5" />}
                <Badge variant={position.status === 'overdue' ? 'error' : 'neutral'}>
                  {DECLARATION_LABEL[position.status]}
                </Badge>
                <span className="tabular-nums">
                  {position.filed} of {position.versions} filed
                </span>
              </div>
              <p>{position.reason}</p>
              {/* #448 -- the duty follows whoever BUILDS and supports the programme, and we reach
                  AADE through a provider. Which of us files it is theirs to confirm. */}
              <p>{DECLARATION_DUTY_IS_OPEN}</p>
              <p>{position.legal_basis}</p>
            </div>

            {position.rows.length === 0 && (
              <HubEmptyState
                title="No version declared"
                description="Α.1054 attaches to whoever builds and technically supports the programme. We reach AADE through a certified provider, so ask them whether they already hold it before filing — and record the answer here either way."
              />
            )}

            {position.rows.map((d) => (
              <div key={d.id} className="space-y-1 rounded-md border border-hairline p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{d.software_name} {d.software_version}</span>
                  {d.first_released_on && <span className="tabular-nums text-muted-foreground">released {d.first_released_on}</span>}
                  {d.filed_with_aade_on
                    ? <Badge variant="success">filed {d.filed_with_aade_on}</Badge>
                    : <Badge variant="warning">not filed</Badge>}
                  {d.covers_iris && <Badge variant="info">IRIS</Badge>}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {d.models.length === 0
                    ? 'No POS model declared against it. The decision asks for each model PER provider, so an empty list is an incomplete filing.'
                    : d.models.map((m) => `${m.nsp_name} · ${m.pos_model}`).join(' — ')}
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    className="h-8 w-40 text-xs" placeholder="Provider"
                    value={model.declarationId === d.id ? model.nsp : ''}
                    onChange={(e) => setModel({ declarationId: d.id, nsp: e.target.value, model: model.declarationId === d.id ? model.model : '' })}
                  />
                  <Input
                    className="h-8 w-40 text-xs" placeholder="POS model"
                    value={model.declarationId === d.id ? model.model : ''}
                    onChange={(e) => setModel({ declarationId: d.id, nsp: model.declarationId === d.id ? model.nsp : '', model: e.target.value })}
                  />
                  <Button size="sm" variant="outline" onClick={addModel} disabled={busy || model.declarationId !== d.id}>
                    <Plus className="mr-1 h-3 w-3" /> Add model
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-end gap-2 rounded-md border border-hairline p-2">
              <div>
                <Label htmlFor="erp-name" className="text-[11px]">Commercial name</Label>
                <Input
                  id="erp-name" className="mt-1 h-8 w-48 text-xs" value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="erp-ver" className="text-[11px]">Version</Label>
                <Input
                  id="erp-ver" className="mt-1 h-8 w-28 text-xs" value={draft.version}
                  onChange={(e) => setDraft((d) => ({ ...d, version: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="erp-rel" className="text-[11px]">First released</Label>
                <Input
                  id="erp-rel" type="date" className="mt-1 h-8 w-40 text-xs" value={draft.released}
                  onChange={(e) => setDraft((d) => ({ ...d, released: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="erp-filed" className="text-[11px]">Filed with AADE</Label>
                <Input
                  id="erp-filed" type="date" className="mt-1 h-8 w-40 text-xs" value={draft.filed}
                  onChange={(e) => setDraft((d) => ({ ...d, filed: e.target.value }))}
                />
              </div>
              <Button size="sm" onClick={save} disabled={busy || !draft.name.trim() || !draft.version.trim()}>
                <Save className="mr-1 h-3 w-3" /> Record version
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
