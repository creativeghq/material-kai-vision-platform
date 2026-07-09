/**
 * PUBLIC workspace clock-in kiosk — app.materialshub.gr/{workspace-slug}/clockin
 *
 * Mobile / tablet friendly. No login: the employee identifies by ΑΦΜ (VAT), optionally a PIN, and
 * taps Clock in / Clock out. Designed for a shared office device or a phone in the field. The
 * workspace must have enabled the kiosk (Profile/HR settings); otherwise this shows a disabled notice.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Clock, LogIn, LogOut, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { kioskService, type KioskResolve, type KioskLookup } from '../services/kioskService';

type Phase = 'loading' | 'disabled' | 'entry' | 'confirm' | 'done';

export default function ClockInKioskPage() {
  const { slug = '' } = useParams();
  const [phase, setPhase] = useState<Phase>('loading');
  const [meta, setMeta] = useState<KioskResolve | null>(null);
  const [vat, setVat] = useState('');
  const [pin, setPin] = useState('');
  const [emp, setEmp] = useState<KioskLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; clocked_in: boolean; is_late: boolean | null } | null>(null);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const m = await kioskService.resolve(slug);
        setMeta(m);
        setPhase(m.enabled ? 'entry' : 'disabled');
      } catch { setPhase('disabled'); }
    })();
  }, [slug]);

  const reset = useCallback(() => {
    setVat(''); setPin(''); setEmp(null); setError(null); setResult(null); setPhase('entry');
  }, []);

  const lookup = async () => {
    if (!vat.trim()) { setError('Enter your ΑΦΜ'); return; }
    if (meta?.require_pin && !pin.trim()) { setError('Enter your PIN'); return; }
    setBusy(true); setError(null);
    try {
      const e = await kioskService.lookup(slug, vat.trim(), pin.trim() || undefined);
      setEmp(e); setPhase('confirm');
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  const doClock = async (punch_type: 'arrival' | 'departure') => {
    setBusy(true); setError(null);
    try {
      const r = await kioskService.clock(slug, vat.trim(), punch_type, pin.trim() || undefined);
      setResult({ name: r.name, clocked_in: r.clocked_in, is_late: r.is_late });
      setPhase('done');
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(reset, 6000);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  useEffect(() => () => { if (resetTimer.current) window.clearTimeout(resetTimer.current); }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6 text-muted-foreground">
          <Clock className="h-5 w-5" />
          <span className="text-sm font-medium">{meta?.workspace_name || 'Clock in'}</span>
        </div>

        {phase === 'loading' && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

        {phase === 'disabled' && (
          <div className="rounded-2xl border border-border/60 bg-card p-8 text-center">
            <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-3" />
            <p className="text-sm text-muted-foreground">The clock-in kiosk is not enabled for this workspace.</p>
          </div>
        )}

        {phase === 'entry' && (
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
            <h1 className="text-lg font-semibold text-center">Enter your ΑΦΜ</h1>
            <div className="space-y-2">
              <Label className="text-xs">ΑΦΜ (VAT number)</Label>
              <Input value={vat} onChange={(e) => setVat(e.target.value.replace(/\D/g, ''))} inputMode="numeric" autoFocus maxLength={9}
                className="h-14 text-center text-2xl font-mono tracking-widest" placeholder="•••••••••"
                onKeyDown={(e) => { if (e.key === 'Enter' && !meta?.require_pin) lookup(); }} />
            </div>
            {meta?.require_pin && (
              <div className="space-y-2">
                <Label className="text-xs">PIN</Label>
                <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" maxLength={8}
                  className="h-14 text-center text-2xl font-mono tracking-widest" placeholder="••••"
                  onKeyDown={(e) => { if (e.key === 'Enter') lookup(); }} />
              </div>
            )}
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button onClick={lookup} disabled={busy} className="w-full h-14 rounded-full text-base">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Continue'}
            </Button>
          </div>
        )}

        {phase === 'confirm' && emp && (
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Welcome</p>
              <h1 className="text-2xl font-semibold">{emp.name}</h1>
              <p className="text-sm text-muted-foreground mt-1">{emp.clocked_in ? 'You are currently clocked in' : 'You are currently clocked out'}</p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={() => doClock(emp.clocked_in ? 'departure' : 'arrival')} disabled={busy}
              variant={emp.clocked_in ? 'destructive' : 'default'} className="w-full h-16 rounded-full text-lg">
              {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : emp.clocked_in ? <><LogOut className="h-6 w-6 mr-2" />Clock out</> : <><LogIn className="h-6 w-6 mr-2" />Clock in</>}
            </Button>
            <button onClick={reset} className="text-xs text-muted-foreground underline">Not you? Start over</button>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center space-y-2">
            <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500" />
            <h1 className="text-xl font-semibold">{result.clocked_in ? 'Clocked in' : 'Clocked out'}</h1>
            <p className="text-sm text-muted-foreground">{result.name}</p>
            {result.is_late && <p className="text-sm text-amber-500">Marked late</p>}
            <Button onClick={reset} variant="outline" className="rounded-full mt-2">Done</Button>
          </div>
        )}
      </div>
      <p className="mt-8 text-[11px] text-muted-foreground">Powered by MaterialsHub</p>
    </div>
  );
}
