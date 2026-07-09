/**
 * Per-workspace ΠΣ Εργάνη ΙΙ (Ergani) Web API credentials. Admin-gated; each tenant submits
 * workforce declarations (work card, leaves, E3 hires, schedules) under its OWN e-ΕΦΚΑ "Εργάνη"
 * account. The password is stored in workspace_ergani_credentials (RLS: workspace admin) and never
 * returned to the browser — only `has_password` via the masked get_ergani_creds_status RPC.
 *
 * Trial vs Production: the trial environment (trialeservices.yeka.gr) stamps every submission «ΑΚΥΡΟ»
 * — use it to validate the wiring before switching to Production.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Loader2, Save, KeyRound, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { hrService, type ErganiEnv } from '../services/hrService';

const ERGANI_PORTAL = 'https://eservices.yeka.gr/';

export const ErganiCredentialsCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [employerAfm, setEmployerAfm] = useState('');
  const [branchAa, setBranchAa] = useState('0');
  const [environment, setEnvironment] = useState<ErganiEnv>('trial');
  const [enabled, setEnabled] = useState(true);
  const [hasPassword, setHasPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const s = await hrService.getErganiStatus(workspaceId).catch(() => null);
      if (cancelled) return;
      setUsername(s?.username ?? '');
      setEmployerAfm(s?.employer_afm ?? '');
      setBranchAa(s?.branch_aa ?? '0');
      setEnvironment(s?.environment ?? 'trial');
      setEnabled(s?.enabled ?? true);
      setHasPassword(!!s?.has_password);
      setPassword('');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  const save = async () => {
    if (!username.trim()) {
      toast({ title: 'Username required', description: 'Enter your Εργάνη Web API username.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await hrService.saveErganiCredentials(workspaceId, {
        username: username.trim(),
        password: password.trim() || undefined, // blank keeps the stored secret
        employer_afm: employerAfm.trim() || null,
        branch_aa: branchAa.trim() || '0',
        usertype: '02',
        environment,
        enabled,
      });
      if (password.trim()) setHasPassword(true);
      setPassword('');
      toast({ title: 'Εργάνη credentials saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return <Card><CardContent className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="text-sm flex items-center gap-2"><KeyRound className="h-4 w-4" /> Εργάνη — Ministry of Labour (HR filings)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Enter your business's <strong>ΠΣ Εργάνη Web API</strong> credentials so the platform can file
          work-card punches, leaves, E3 hires and work-time schedules on your behalf. Managed via the{' '}
          <a href={ERGANI_PORTAL} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
            Εργάνη portal <ExternalLink className="h-3 w-3" />
          </a>. Every filing runs under <strong>your</strong> e-ΕΦΚΑ account. Use <strong>Trial</strong> first —
          those submissions are stamped «ΑΚΥΡΟ» and carry no legal effect.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Εργάνη username" autoComplete="off" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder={hasPassword ? '•••••••• (configured — blank keeps it)' : 'Εργάνη password'} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Employer ΑΦΜ <span className="text-muted-foreground">(f_afm_ergodoti)</span></Label>
            <Input value={employerAfm} onChange={(e) => setEmployerAfm(e.target.value)} placeholder="e.g. 094187530" className="font-mono" maxLength={9} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Branch Α/Α <span className="text-muted-foreground">(f_aa, Παράρτημα)</span></Label>
            <Input value={branchAa} onChange={(e) => setBranchAa(e.target.value)} placeholder="0" className="font-mono" />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
          <div>
            <div className="text-sm">Environment</div>
            <p className="text-xs text-muted-foreground">{environment === 'production' ? 'Production — filings are legally binding.' : 'Trial — filings stamped «ΑΚΥΡΟ».'}</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className={environment === 'trial' ? 'font-medium' : 'text-muted-foreground'}>Trial</span>
            <Switch checked={environment === 'production'} onCheckedChange={(v) => setEnvironment(v ? 'production' : 'trial')} />
            <span className={environment === 'production' ? 'font-medium' : 'text-muted-foreground'}>Production</span>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
          <div className="text-sm">Enabled</div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div>
          <Button size="sm" onClick={save} disabled={saving} className="rounded-full">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
