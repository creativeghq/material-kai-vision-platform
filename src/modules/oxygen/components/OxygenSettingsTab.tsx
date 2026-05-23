import React, { useEffect, useState } from 'react';
import { Loader2, KeyRound, Save, CheckCircle2, AlertCircle, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { oxygenService, type OxygenSettingsView, type OxygenTaxRow, type OxygenWarehouseRow } from '../services/oxygenService';

const KEY_UNCHANGED = '__UNCHANGED__';

export const OxygenSettingsTab: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadingDropdowns, setLoadingDropdowns] = useState(false);
  const [revealKey, setRevealKey] = useState(false);

  const [view, setView] = useState<OxygenSettingsView | null>(null);
  const [apiKey, setApiKey] = useState<string>(KEY_UNCHANGED);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('https://api.oxygen.gr/v1');
  const [taxId, setTaxId] = useState<number | null>(null);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [taxes, setTaxes] = useState<OxygenTaxRow[]>([]);
  const [warehouses, setWarehouses] = useState<OxygenWarehouseRow[]>([]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const v = await oxygenService.getSettings();
      setView(v);
      setApiBaseUrl(v.api_base_url || 'https://api.oxygen.gr/v1');
      setTaxId(v.default_tax_id_24);
      setWarehouseId(v.default_warehouse_id);
      setApiKey(KEY_UNCHANGED);
    } catch (err) {
      toast({ title: 'Failed to load settings', description: errMsg(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadSettings(); }, []);

  const loadDropdowns = async () => {
    setLoadingDropdowns(true);
    try {
      const overrideKey = apiKey !== KEY_UNCHANGED && apiKey !== '' ? apiKey : undefined;
      const [t, w] = await Promise.all([
        oxygenService.listTaxes({ override_api_key: overrideKey, override_api_base_url: apiBaseUrl }),
        oxygenService.listWarehouses({ override_api_key: overrideKey, override_api_base_url: apiBaseUrl }),
      ]);
      setTaxes(t);
      setWarehouses(w);
    } catch (err) {
      toast({ title: 'Could not fetch dropdown values', description: errMsg(err), variant: 'destructive' });
    } finally {
      setLoadingDropdowns(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const overrideKey = apiKey !== KEY_UNCHANGED && apiKey !== '' ? apiKey : undefined;
      const res = await oxygenService.testConnection({ override_api_key: overrideKey, override_api_base_url: apiBaseUrl });
      toast({ title: 'Connection OK', description: `Base ${res.base_url} · ${res.taxes_count} tax rates available` });
      await loadSettings();
    } catch (err) {
      toast({ title: 'Connection failed', description: errMsg(err), variant: 'destructive' });
      await loadSettings();
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Parameters<typeof oxygenService.saveSettings>[0] = {
        api_base_url: apiBaseUrl,
        default_tax_id_24: taxId,
        default_warehouse_id: warehouseId,
      };
      if (apiKey !== KEY_UNCHANGED) payload.api_key = apiKey;
      const next = await oxygenService.saveSettings(payload);
      setView(next);
      setApiKey(KEY_UNCHANGED);
      toast({ title: 'Settings saved' });
    } catch (err) {
      toast({ title: 'Could not save settings', description: errMsg(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-12 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>;
  }

  const effectiveSource = view?.effective.source ?? 'partial';
  const ready = !!view?.effective.api_key_present && !!view?.effective.default_tax_id_24 && !!view?.effective.default_warehouse_id;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> Module configuration
              </CardTitle>
              <CardDescription>
                Stored in the <code className="text-xs">oxygen_settings</code> table. Environment variables are kept as a one-time fallback only.
              </CardDescription>
            </div>
            <StatusBadge ready={ready} source={effectiveSource} verified={view?.last_verified_status ?? null} />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="oxygen-api-key">API key</Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  id="oxygen-api-key"
                  type={revealKey ? 'text' : 'password'}
                  placeholder={view?.api_key_present ? (view.api_key_masked ?? 'Leave unchanged') : 'Paste your Oxygen API key'}
                  value={apiKey === KEY_UNCHANGED ? '' : apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  className="font-mono pr-9"
                />
                <Button
                  type="button" variant="ghost" size="sm"
                  className="absolute right-1 top-1 h-7 w-7 p-0"
                  onClick={() => setRevealKey(v => !v)}
                  title={revealKey ? 'Hide' : 'Reveal'}
                >
                  {revealKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {view?.api_key_present && apiKey === KEY_UNCHANGED && (
                <Button type="button" variant="outline" size="sm" onClick={() => setApiKey('')} className="rounded-full">
                  Clear
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {apiKey === KEY_UNCHANGED && view?.api_key_present
                ? <>Existing key kept: <code className="font-mono">{view.api_key_masked}</code></>
                : apiKey === ''
                  ? 'Key will be cleared on save.'
                  : 'Type a new key to replace the existing one.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="oxygen-base-url">API base URL</Label>
            <Input
              id="oxygen-base-url"
              value={apiBaseUrl}
              onChange={e => setApiBaseUrl(e.target.value)}
              className="font-mono"
              placeholder="https://api.oxygen.gr/v1"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button" variant="outline" size="sm" onClick={handleTestConnection}
              disabled={testing || (!view?.api_key_present && (apiKey === KEY_UNCHANGED || apiKey === ''))}
              className="rounded-full"
            >
              {testing ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Testing…</> : <>Test connection</>}
            </Button>
            <Button
              type="button" variant="ghost" size="sm" onClick={loadDropdowns}
              disabled={loadingDropdowns || (!view?.api_key_present && (apiKey === KEY_UNCHANGED || apiKey === ''))}
              className="rounded-full"
            >
              {loadingDropdowns ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Loading…</> : <><RefreshCw className="h-4 w-4 mr-1" /> Refresh dropdowns</>}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Default tax (24% VAT)</Label>
              <Select value={taxId != null ? String(taxId) : ''} onValueChange={v => setTaxId(v ? Number(v) : null)}>
                <SelectTrigger>
                  <SelectValue placeholder={taxes.length === 0 ? 'Refresh dropdowns to populate' : 'Select tax rate'} />
                </SelectTrigger>
                <SelectContent>
                  {taxes.length === 0 && taxId != null && (
                    <SelectItem value={String(taxId)}>Tax #{taxId} (saved)</SelectItem>
                  )}
                  {taxes.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      #{t.id} · {t.name ?? t.code ?? `rate ${t.rate ?? '?'}%`}
                      {typeof t.rate === 'number' ? ` (${t.rate}%)` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default warehouse</Label>
              <Select value={warehouseId != null ? String(warehouseId) : ''} onValueChange={v => setWarehouseId(v ? Number(v) : null)}>
                <SelectTrigger>
                  <SelectValue placeholder={warehouses.length === 0 ? 'Refresh dropdowns to populate' : 'Select warehouse'} />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.length === 0 && warehouseId != null && (
                    <SelectItem value={String(warehouseId)}>Warehouse #{warehouseId} (saved)</SelectItem>
                  )}
                  {warehouses.map(w => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      #{w.id} · {w.name ?? w.code ?? 'Unnamed'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-end pt-2 border-t border-white/10">
            <Button onClick={handleSave} disabled={saving} className="rounded-full">
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…</> : <><Save className="h-4 w-4 mr-1" /> Save settings</>}
            </Button>
          </div>

          {view?.last_verified_at && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              {view.last_verified_status === 'ok'
                ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                : <AlertCircle className="h-3 w-3 text-amber-500" />}
              Last verified {new Date(view.last_verified_at).toLocaleString()} · {view.last_verified_status}
              {view.last_verified_error && <span className="text-amber-500">— {view.last_verified_error}</span>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const StatusBadge: React.FC<{ ready: boolean; source: 'db' | 'env' | 'partial'; verified: 'ok' | 'failed' | null }> = ({ ready, source, verified }) => {
  if (!ready) return <Badge variant="destructive">Not configured</Badge>;
  if (verified === 'failed') return <Badge className="bg-amber-600 hover:bg-amber-600 text-white">Verification failed</Badge>;
  if (source === 'env') return <Badge variant="outline">Using env vars</Badge>;
  if (source === 'partial') return <Badge variant="outline">Partial config</Badge>;
  return <Badge className="bg-emerald-700 hover:bg-emerald-700 text-white">Ready</Badge>;
};

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}
