import React, { useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { SecretsManagerCard } from '@/components/Admin/Secrets/SecretsManagerCard';
import { platformSecretsService, type OxygenTaxRow, type OxygenWarehouseRow, type PlatformSecretView } from '@/services/platformSecretsService';

export const OxygenSettingsTab: React.FC = () => {
  return (
    <div className="space-y-6">
      <SecretsManagerCard
        scope={{ mode: 'module', moduleSlug: 'oxygen' }}
        title="Oxygen API credentials"
        description="Configure once, used by the Make Pre-Invoice action on every accepted quote."
        renderFooter={(secrets, refresh) => <OxygenHelpers secrets={secrets} refresh={refresh} />}
      />
    </div>
  );
};

const OxygenHelpers: React.FC<{ secrets: PlatformSecretView[]; refresh: () => Promise<void> }> = ({ secrets, refresh }) => {
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [taxes, setTaxes] = useState<OxygenTaxRow[]>([]);
  const [warehouses, setWarehouses] = useState<OxygenWarehouseRow[]>([]);
  const [savingPick, setSavingPick] = useState(false);

  const apiKeySecret = secrets.find(s => s.key === 'OXYGEN_API_KEY');
  const taxSecret = secrets.find(s => s.key === 'OXYGEN_DEFAULT_TAX_ID_24');
  const whSecret = secrets.find(s => s.key === 'OXYGEN_DEFAULT_WAREHOUSE_ID');

  const canCall = !!apiKeySecret?.effective.value_present;

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await platformSecretsService.testOxygen();
      toast({ title: 'Connection OK', description: `Base ${res.base_url} · ${res.taxes_count} tax rates available` });
      await refresh();
    } catch (err) {
      toast({ title: 'Connection failed', description: errMsg(err), variant: 'destructive' });
      await refresh();
    } finally {
      setTesting(false);
    }
  };

  const handleLoadLookups = async () => {
    setLoadingLookups(true);
    try {
      const [t, w] = await Promise.all([
        platformSecretsService.listOxygenTaxes(),
        platformSecretsService.listOxygenWarehouses(),
      ]);
      setTaxes(t);
      setWarehouses(w);
    } catch (err) {
      toast({ title: 'Could not fetch dropdown values', description: errMsg(err), variant: 'destructive' });
    } finally {
      setLoadingLookups(false);
    }
  };

  const handlePickTax = async (id: number) => {
    setSavingPick(true);
    try {
      await platformSecretsService.save('OXYGEN_DEFAULT_TAX_ID_24', String(id));
      toast({ title: 'Default tax saved', description: `Tax #${id}` });
      await refresh();
    } catch (err) {
      toast({ title: 'Save failed', description: errMsg(err), variant: 'destructive' });
    } finally {
      setSavingPick(false);
    }
  };

  const handlePickWarehouse = async (id: number) => {
    setSavingPick(true);
    try {
      await platformSecretsService.save('OXYGEN_DEFAULT_WAREHOUSE_ID', String(id));
      toast({ title: 'Default warehouse saved', description: `Warehouse #${id}` });
      await refresh();
    } catch (err) {
      toast({ title: 'Save failed', description: errMsg(err), variant: 'destructive' });
    } finally {
      setSavingPick(false);
    }
  };

  if (!apiKeySecret) return null;

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4" /> Connection helpers
        </CardTitle>
        <CardDescription>
          After the API key is set, use these to test the connection and pick the default tax + warehouse from Oxygen's actual catalog.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" disabled={!canCall || testing} onClick={handleTest} className="rounded-full">
            {testing ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Testing…</> : 'Test connection'}
          </Button>
          <Button variant="ghost" size="sm" disabled={!canCall || loadingLookups} onClick={handleLoadLookups} className="rounded-full">
            {loadingLookups ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Loading…</> : <><RefreshCw className="h-4 w-4 mr-1" /> Refresh dropdowns</>}
          </Button>
          {apiKeySecret.last_verified_at && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              {apiKeySecret.last_verified_status === 'ok'
                ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                : <AlertCircle className="h-3 w-3 text-amber-500" />}
              Last verified {new Date(apiKeySecret.last_verified_at).toLocaleString()}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Default tax (24% VAT)</Label>
            <Select
              value={taxSecret?.value_present ? '__current__' : ''}
              onValueChange={v => { if (v && v !== '__current__') void handlePickTax(Number(v)); }}
              disabled={savingPick}
            >
              <SelectTrigger>
                <SelectValue placeholder={
                  taxSecret?.value_present
                    ? `Current: tax #${taxSecret.value_masked ?? ''}`
                    : taxes.length === 0
                      ? 'Refresh dropdowns to populate'
                      : 'Select tax rate'
                } />
              </SelectTrigger>
              <SelectContent>
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
            <Select
              value={whSecret?.value_present ? '__current__' : ''}
              onValueChange={v => { if (v && v !== '__current__') void handlePickWarehouse(Number(v)); }}
              disabled={savingPick}
            >
              <SelectTrigger>
                <SelectValue placeholder={
                  whSecret?.value_present
                    ? `Current: warehouse #${whSecret.value_masked ?? ''}`
                    : warehouses.length === 0
                      ? 'Refresh dropdowns to populate'
                      : 'Select warehouse'
                } />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map(w => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    #{w.id} · {w.name ?? w.code ?? 'Unnamed'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}
