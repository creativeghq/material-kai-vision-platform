// Public e-signature page — /sign/:token (registered OUTSIDE AuthGuard).
// Resolves a contract sign-token, shows the terms, and captures a typed legal signature.
// The signature + timestamp + IP (server-side) form the audit trail.
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, FileSignature, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { contractsService } from '@/services/contractsService';

type Resolved =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'signed_already'; title?: string }
  | { kind: 'ready'; title: string; body: string | null; counterparty: string | null; effective: string | null; expiry: string | null };

export default function PublicContractSignPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<Resolved>({ kind: 'loading' });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setState({ kind: 'not_found' }); return; }
    (async () => {
      try {
        const r = await contractsService.resolveToken(token);
        if (r.signed) setState({ kind: 'signed_already', title: r.contract?.title });
        else if (r.not_found || !r.contract) setState({ kind: 'not_found' });
        else setState({
          kind: 'ready',
          title: r.contract.title,
          body: r.contract.body_markdown,
          counterparty: r.contract.counterparty_name,
          effective: r.contract.effective_date,
          expiry: r.contract.expiry_date,
        });
      } catch {
        setState({ kind: 'not_found' });
      }
    })();
  }, [token]);

  const submit = async () => {
    if (!token || !name.trim() || !consent) return;
    setSubmitting(true);
    setError(null);
    try {
      await contractsService.sign(token, {
        signer_name: name.trim(),
        signer_email: email.trim() || undefined,
        // Typed legal signature captured as a lightweight marker alongside the server-side audit.
        signature_image: `typed:${name.trim()}`,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your signature.');
    } finally {
      setSubmitting(false);
    }
  };

  const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">{children}</div>
    </div>
  );

  if (state.kind === 'loading') {
    return <Shell><div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div></Shell>;
  }
  if (state.kind === 'not_found') {
    return <Shell><div className="text-center py-12 space-y-2"><AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground" /><h1 className="text-lg font-semibold">Contract unavailable</h1><p className="text-sm text-muted-foreground">This signing link is invalid, expired, or has been withdrawn.</p></div></Shell>;
  }
  if (state.kind === 'signed_already' || done) {
    const title = state.kind === 'signed_already' ? state.title : undefined;
    return <Shell><div className="text-center py-12 space-y-2"><CheckCircle2 className="h-9 w-9 mx-auto text-emerald-500" /><h1 className="text-lg font-semibold">Signed</h1><p className="text-sm text-muted-foreground">{title ? `"${title}" has been signed.` : 'This contract has been signed. Thank you.'}</p></div></Shell>;
  }

  return (
    <Shell>
      <div className="flex items-center gap-2 mb-4">
        <FileSignature className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">{state.title}</h1>
      </div>
      {(state.effective || state.expiry) && (
        <p className="text-xs text-muted-foreground mb-4">
          {state.effective && <>Effective {new Date(state.effective).toLocaleDateString()}</>}
          {state.effective && state.expiry && ' · '}
          {state.expiry && <>Expires {new Date(state.expiry).toLocaleDateString()}</>}
        </p>
      )}

      {state.body && (
        <div className="max-h-[45vh] overflow-y-auto rounded-md border border-border/60 bg-muted/20 p-4 text-sm whitespace-pre-wrap leading-relaxed mb-6">
          {state.body}
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Your full legal name <span className="text-destructive">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={state.counterparty || 'Full name'} />
          </div>
          <div className="space-y-1">
            <Label>Email (optional)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
        </div>

        {name.trim() && (
          <div className="rounded-md border border-border/60 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Signature</p>
            <p className="text-2xl" style={{ fontFamily: 'Segoe Script, "Brush Script MT", cursive' }}>{name.trim()}</p>
          </div>
        )}

        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5"  />
          <span>I have read and agree to the terms above, and I consent to signing this contract electronically.</span>
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button className="w-full" disabled={!name.trim() || !consent || submitting} onClick={submit}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign contract'}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center">Your name, the time of signing, and your IP address are recorded for this agreement.</p>
      </div>
    </Shell>
  );
}
