import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Loader2, CheckCircle2, AlertCircle, CreditCard, FileText, Landmark, Copy, Check, ShieldCheck,
  ExternalLink, Download, Ban, UploadCloud, Send, Paperclip, X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Textarea } from '@/components/core/ui/textarea';
import { MoneyInput } from '@/components/core/ui/money-input';
import {
  financeService, formatMoney, type PublicFiscalRecord, type PublicBankTransfer, type PublicPayLine, type PublicPaymentProof,
  type PublicPayOtherTotals,
} from '@/modules/finance/services/financeService';
import { formatDate } from '@/utils/datetime';

// Public, no-auth payment page reached from email links, "Pay now" buttons, the storefront and the
// public quote page. The amount is always re-validated + clamped server-side.
interface PayInfo {
  invoice_id: string;
  internal_number: string;
  customer_display: string;
  currency: string;
  is_pre_invoice: boolean;
  total: number;
  amount_due: number;
  deposit_pct: number | null;
  deposit_amount: number | null;
  min_amount: number;
  max_amount: number;
  providers: ProviderOption[];
  bank_transfer: PublicBankTransfer | null;
  created_at: string | null;
  subtotal_net: number | null;
  vat_amount: number | null;
  other_totals: PublicPayOtherTotals | null;
  lines: PublicPayLine[];
}

interface ProviderOption {
  slug: string;
  label: string;
  methods: Array<'card' | 'bank_reference'>;
}

/** One selectable way to pay. `transfer` is a plain IBAN transfer the seller confirms by hand. */
interface PayOption {
  key: string;
  provider: string | null;
  method: 'card' | 'bank_reference' | 'transfer';
  label: string;
  hint: string;
}

const TRANSFER_KEY = 'transfer';
const PROOF_MAX_BYTES = 5 * 1024 * 1024;

function buildOptions(providers: ProviderOption[], bankTransfer: PublicBankTransfer | null): PayOption[] {
  const out: PayOption[] = [];
  for (const p of providers) {
    for (const m of p.methods) {
      // Revolut's hosted page fans out beyond cards, so "Card" would under-sell it.
      const isRevolut = p.slug === 'revolut';
      out.push({
        key: `${p.slug}:${m}`,
        provider: p.slug,
        method: m,
        label: m === 'card'
          ? (isRevolut ? 'Online payment — Revolut' : `Card — ${p.label}`)
          : `Bank payment code — ${p.label}`,
        hint: m === 'card'
          ? (isRevolut
            ? 'Card, Revolut Pay, Apple/Google Pay or Pay by Bank — on Revolut’s secure page.'
            : 'Pay now by card. You will be redirected to a secure page.')
          : 'Get a payment code to use in your banking app. No IBAN needed.',
      });
    }
  }
  if (bankTransfer) {
    out.push({
      key: TRANSFER_KEY,
      provider: null,
      method: 'transfer',
      label: 'Direct bank transfer',
      hint: 'Transfer to our bank account and upload the receipt here.',
    });
  }
  return out;
}

function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

const CopyButton: React.FC<{ value: string; label: string }> = ({ value, label }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={copied ? 'Copied' : `Copy ${label}`}
      onClick={() => {
        if (!navigator.clipboard?.writeText) return;
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }).catch(() => { /* clipboard refused — the value stays on screen to select by hand */ });
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
};

const DetailRow: React.FC<{ label: string; value: string; copyValue?: string; mono?: boolean; strong?: boolean }> = ({
  label, value, copyValue, mono, strong,
}) => (
  <div className="flex items-center justify-between gap-3 px-3 py-2">
    <dt className="text-xs text-muted-foreground shrink-0">{label}</dt>
    <dd className="flex min-w-0 items-center gap-1">
      <span className={`text-right text-sm break-all ${mono ? 'font-mono tabular-nums' : ''} ${strong ? 'font-semibold' : ''}`}>{value}</span>
      {copyValue && <CopyButton value={copyValue} label={label} />}
    </dd>
  </div>
);

const Panel: React.FC<{ title?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
  <section className={`rounded-md border border-hairline bg-card ${className ?? ''}`}>
    {title && (
      <h2 className="border-b border-hairline bg-surface-sunken px-4 py-2 font-sans text-xs font-semibold">{title}</h2>
    )}
    {children}
  </section>
);

const PROOF_STATE: Record<PublicPaymentProof['state'], { label: string; variant: 'success' | 'error' | 'warning' | 'info' | 'neutral' }> = {
  checking: { label: 'Checking…', variant: 'neutral' },
  checked: { label: 'Receipt checked — waiting for the bank', variant: 'info' },
  received: { label: 'Received — the seller will review it', variant: 'warning' },
  confirmed: { label: 'Payment confirmed', variant: 'success' },
  rejected: { label: 'Not accepted', variant: 'error' },
};

const proofStatusBadge = (state: PublicPaymentProof['state']) => {
  const s = PROOF_STATE[state] ?? PROOF_STATE.received;
  return <Badge variant={s.variant}>{state === 'checking' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}{s.label}</Badge>;
};

const BankTransferPanel: React.FC<{
  bank: PublicBankTransfer;
  reference: string;
  amount: number;
  currency: string;
}> = ({ bank, reference, amount, currency }) => (
  <Panel title={<span className="flex items-center gap-2"><Landmark className="h-3.5 w-3.5 text-primary" /> Bank transfer details</span>}>
    <div className="space-y-3 p-4">
      <p className="text-xs text-muted-foreground">
        Transfer <strong className="text-foreground">{formatMoney(amount, currency)}</strong> to the account below and
        put <strong className="text-foreground">{reference}</strong> in the transfer reference, so we can match it to your order.
      </p>
      {bank.accounts.map((a) => (
        <div key={a.iban} className="rounded-md border border-hairline">
          {a.bank_name && (
            <div className="border-b border-hairline bg-surface-sunken px-3 py-1.5 text-xs font-semibold">{a.bank_name}</div>
          )}
          <dl className="divide-y divide-hairline">
            {bank.beneficiary && <DetailRow label="Beneficiary" value={bank.beneficiary} copyValue={bank.beneficiary} strong />}
            <DetailRow label="IBAN" value={formatIban(a.iban)} copyValue={a.iban} mono strong />
            {a.bic && <DetailRow label="BIC / SWIFT" value={a.bic} copyValue={a.bic} mono />}
          </dl>
        </div>
      ))}
      <dl className="divide-y divide-hairline rounded-md border border-hairline">
        <DetailRow label="Reference" value={reference} copyValue={reference} mono strong />
        <DetailRow label="Amount" value={formatMoney(amount, currency)} copyValue={amount.toFixed(2)} mono strong />
      </dl>
    </div>
  </Panel>
);

const ProofUploadPanel: React.FC<{
  token: string;
  proofs: PublicPaymentProof[];
  onUploaded: (p: PublicPaymentProof) => void;
}> = ({ token, proofs, onUploaded }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const pick = (f: File | null | undefined) => {
    setErr(null);
    setSent(false);
    if (!f) return;
    if (f.size > PROOF_MAX_BYTES) { setErr('That file is larger than 5 MB.'); return; }
    if (!(f.type === 'application/pdf' || f.type.startsWith('image/') || /\.(pdf|jpe?g|png|webp|heic)$/i.test(f.name))) {
      setErr('Upload a PDF or an image (JPG, PNG, WEBP, HEIC).');
      return;
    }
    setFile(f);
  };

  const submit = async () => {
    if (!file) { setErr('Choose the receipt file first.'); return; }
    setBusy(true);
    setErr(null);
    try {
      const proof = await financeService.uploadPaymentProof(token, file, note.trim());
      onUploaded(proof);
      setFile(null);
      setNote('');
      setSent(true);
      if (inputRef.current) inputRef.current.value = '';
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={<span className="flex items-center gap-2"><UploadCloud className="h-3.5 w-3.5 text-primary" /> Upload proof of payment</span>}>
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted-foreground">
          Upload the receipt of your bank transfer so we can confirm your payment faster.
        </p>

        {proofs.length > 0 && (
          <ul className="divide-y divide-hairline rounded-md border border-hairline text-sm">
            {proofs.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{p.file_name || 'Receipt'}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(p.created_at, { withTime: true })}</span>
                </span>
                {proofStatusBadge(p.state)}
              </li>
            ))}
          </ul>
        )}

        {sent && (
          <div className="flex items-start gap-2 rounded-md border border-hairline bg-surface-sunken p-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>Thank you — we received your receipt and are checking it. Your order is marked paid once the transfer reaches our bank.</span>
          </div>
        )}

        <div>
          <span className="mb-1 block text-xs font-medium">Receipt file</span>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-8 text-center transition-colors ${dragging ? 'border-primary bg-primary/[0.06]' : 'border-hairline bg-surface-sunken hover:border-primary/60'}`}
          >
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,.heic"
              onChange={(e) => pick(e.target.files?.[0])}
            />
            {file ? (
              <span className="flex items-center gap-2 text-sm">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <span className="max-w-[16rem] truncate">{file.name}</span>
                <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                <button
                  type="button"
                  aria-label="Remove file"
                  className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={(e) => { e.preventDefault(); setFile(null); if (inputRef.current) inputRef.current.value = ''; }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : (
              <>
                <UploadCloud className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm">Drag the file here or <span className="text-primary underline">browse</span></span>
                <span className="text-[11px] text-muted-foreground">JPG, PNG, PDF — up to 5 MB</span>
              </>
            )}
          </label>
        </div>

        <div>
          <label htmlFor="proof-note" className="mb-1 block text-xs font-medium">Note (optional)</label>
          <Textarea
            id="proof-note"
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. transfer date, bank branch…"
            className="min-h-[72px] text-sm"
          />
        </div>

        {err && <p className="text-xs text-destructive">{err}</p>}

        <Button onClick={() => void submit()} disabled={busy || !file}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Send proof of payment
        </Button>
      </div>
    </Panel>
  );
};

const FiscalRecordPanel: React.FC<{ fiscal: PublicFiscalRecord }> = ({ fiscal }) => {
  const rows: [string, string | null][] = [
    ['Number', fiscal.legal_number],
    ['MARK', fiscal.mark],
    ['UID', fiscal.uid],
    ['Authentication code', fiscal.authentication_code],
    ['Issued', fiscal.issued_at ? formatDate(fiscal.issued_at, { withTime: true }) : null],
  ];
  return (
    <div className="rounded-lg border border-hairline text-sm">
      <div className="flex items-center gap-2 border-b border-hairline bg-surface-sunken px-3 py-2 text-xs font-semibold">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Filed with ΑΑΔΕ (myDATA)
      </div>
      <dl className="divide-y divide-hairline">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 px-3 py-1.5">
            <dt className="text-muted-foreground shrink-0">{k}</dt>
            <dd className="font-mono text-xs break-all text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2 border-t border-hairline px-3 py-2">
        {fiscal.provider_url && (
          <a href={fiscal.provider_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> Filed copy{fiscal.provider_name ? ` (${fiscal.provider_name})` : ''}
          </a>
        )}
        {fiscal.aade_url && (
          <a href={fiscal.aade_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> Verify at ΑΑΔΕ
          </a>
        )}
      </div>
      {fiscal.provider_name && (
        <p className="border-t border-hairline px-3 py-1.5 text-[11px] text-muted-foreground">
          Transmitted via {fiscal.provider_name}{fiscal.provider_website ? ` | ${fiscal.provider_website}` : ''}
        </p>
      )}
    </div>
  );
};

// myDATA header totals: withholdings and deductions reduce what is paid, the rest add to it.
const OTHER_TOTAL_ROWS: Array<[keyof PublicPayOtherTotals, string, 1 | -1]> = [
  ['withheld', 'Withholding tax', -1],
  ['deductions', 'Deductions', -1],
  ['fees', 'Fees', 1],
  ['stamp_duty', 'Stamp duty', 1],
  ['other_taxes', 'Other taxes', 1],
];

const OrderLinesPanel: React.FC<{ info: PayInfo }> = ({ info }) => {
  if (info.lines.length === 0) return null;
  return (
    <Panel title="Order details">
      <ul className="divide-y divide-hairline">
        {info.lines.map((l, i) => (
          <li key={i} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{l.description}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {l.sku ? `${l.sku} · ` : ''}{l.quantity}{l.unit ? ` ${l.unit}` : ''} × {formatMoney(l.unit_price, info.currency)}
                {l.discount ? ` − ${formatMoney(l.discount, info.currency)} discount` : ''}
              </p>
            </div>
            <span className="shrink-0 tabular-nums">{formatMoney(l.line_total, info.currency)}</span>
          </li>
        ))}
      </ul>
      <dl className="divide-y divide-hairline border-t border-hairline text-sm">
        {info.subtotal_net != null && (
          <div className="flex justify-between px-4 py-2">
            <dt className="text-muted-foreground">Net amount</dt>
            <dd className="tabular-nums">{formatMoney(info.subtotal_net, info.currency)}</dd>
          </div>
        )}
        {info.vat_amount != null && (
          <div className="flex justify-between px-4 py-2">
            <dt className="text-muted-foreground">VAT</dt>
            <dd className="tabular-nums">{formatMoney(info.vat_amount, info.currency)}</dd>
          </div>
        )}
        {info.other_totals && OTHER_TOTAL_ROWS.filter(([k]) => Math.abs(info.other_totals![k]) > 0.005).map(([k, label, sign]) => (
          <div key={k} className="flex justify-between px-4 py-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{sign < 0 ? '− ' : ''}{formatMoney(info.other_totals![k], info.currency)}</dd>
          </div>
        ))}
        <div className="flex justify-between px-4 py-2 font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatMoney(info.total, info.currency)}</dd>
        </div>
      </dl>
    </Panel>
  );
};

const PayInvoicePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [search] = useSearchParams();
  const status = search.get('status'); // 'success' | 'cancelled' (redirect-back from the provider)
  const justPlaced = search.get('placed') === '1';
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<PayInfo | null>(null);
  const [proofs, setProofs] = useState<PublicPaymentProof[]>([]);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [fiscal, setFiscal] = useState<PublicFiscalRecord | null>(null);
  const [closed, setClosed] = useState<{ status: string; number: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const downloadPdf = async () => {
    if (!token) return;
    setDownloading(true);
    try { window.open(await financeService.payTokenPdf(token), '_blank', 'noopener'); }
    catch (err) { setError((err as Error).message); }
    finally { setDownloading(false); }
  };
  const downloadButton = (
    <Button variant="outline" size="sm" onClick={() => void downloadPdf()} disabled={downloading}>
      {downloading ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-2" />}
      Download PDF
    </Button>
  );
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<'deposit' | 'full' | 'custom'>('full');
  const [custom, setCustom] = useState<number | null>(null);
  const [option, setOption] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [bankRef, setBankRef] = useState<{ rf_code: string; amount: number; currency: string } | null>(null);

  // Load the document + payable options. No session, no side effects. Also runs for
  // status=return (Revolut redirects on EVERY outcome): the server state decides what we say.
  useEffect(() => {
    if (!token || (status && status !== 'return' && status !== 'success')) { setLoading(false); return; }
    void (async () => {
      try {
        const res = await financeService.resolvePayToken(token, { infoOnly: true });
        if (res.error) { setError(res.error); return; }
        setFiscal(res.fiscal ?? null);
        if (res.closed) { setClosed({ status: res.status ?? '', number: res.internal_number ?? '' }); return; }
        if (res.already_paid) { setAlreadyPaid(true); return; }
        const next: PayInfo = {
          invoice_id: res.invoice_id!,
          internal_number: res.internal_number ?? '',
          customer_display: res.customer_display ?? '',
          currency: res.currency ?? 'EUR',
          is_pre_invoice: !!res.is_pre_invoice,
          total: Number(res.total ?? 0),
          amount_due: Number(res.amount_due ?? 0),
          deposit_pct: res.deposit_pct ?? null,
          deposit_amount: res.deposit_amount ?? null,
          min_amount: Number(res.min_amount ?? 0),
          max_amount: Number(res.max_amount ?? 0),
          providers: (res.providers ?? []) as ProviderOption[],
          bank_transfer: res.bank_transfer ?? null,
          created_at: res.created_at ?? null,
          subtotal_net: res.subtotal_net ?? null,
          vat_amount: res.vat_amount ?? null,
          other_totals: res.other_totals ?? null,
          lines: res.lines ?? [],
        };
        setInfo(next);
        setProofs(res.proofs ?? []);
        setChoice(next.deposit_amount != null ? 'deposit' : 'full');
        setCustom(next.deposit_amount ?? next.amount_due);
        // A customer who already sent a receipt comes back to it, not to a card form.
        const opts = buildOptions(next.providers, next.bank_transfer);
        setOption((res.proofs?.length && next.bank_transfer) ? TRANSFER_KEY : (opts[0]?.key ?? null));
      } catch (err: any) {
        setError(err?.message ?? 'Failed to resolve payment link');
      } finally {
        setLoading(false);
      }
    })();
  }, [token, status]);

  const checking = proofs.some((p) => p.state === 'checking');
  useEffect(() => {
    if (!token || !checking) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 30) { clearInterval(timer); return; }
      financeService.pollPaymentProofs(token).then(setProofs).catch(() => { /* keep the last known states */ });
    }, 4000);
    return () => clearInterval(timer);
  }, [token, checking]);

  const chosenAmount = (): number | undefined => {
    if (!info) return undefined;
    if (choice === 'full') return info.amount_due;
    if (choice === 'deposit') return info.deposit_amount ?? info.amount_due;
    return custom ?? undefined;
  };

  const pay = async () => {
    if (!token || !info) return;
    const amount = chosenAmount();
    if (amount == null || !Number.isFinite(amount)) { setError('Enter an amount to pay.'); return; }
    if (amount < info.min_amount - 0.005) {
      setError(`The minimum payable right now is ${formatMoney(info.min_amount, info.currency)}.`);
      return;
    }
    if (amount > info.amount_due + 0.005) {
      setError(`That's more than the ${formatMoney(info.amount_due, info.currency)} outstanding.`);
      return;
    }
    const picked = buildOptions(info.providers, info.bank_transfer).find((o) => o.key === option);
    if (!picked || picked.method === 'transfer') return;
    try {
      setBusy(true);
      setError(null);
      const res = await financeService.resolvePayToken(token, {
        amount,
        provider: picked.provider ?? undefined,
        method: picked.method,
        successUrl: `${window.location.origin}/pay/${token}?status=success`,
        cancelUrl: `${window.location.origin}/pay/${token}?status=cancelled`,
      });
      if (res.error) { setError(res.error); return; }
      if (res.payment_kind === 'bank_reference' && res.rf_code) {
        setBankRef({ rf_code: res.rf_code, amount, currency: info.currency });
        return;
      }
      if (res.checkout_url) {
        // Keep the button disabled through the navigation, so a double-click cannot mint a second session.
        window.location.href = res.checkout_url;
        return;
      }
      setError('Could not start the checkout.');
      setBusy(false);
    } catch (err: any) {
      setError(err?.message ?? 'Could not start the checkout.');
      setBusy(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-0">
        <CardContent className="p-8">{children}</CardContent>
      </Card>
    </div>
  );

  // Provider return: ONLY the server-verified state decides what we claim — a URL param is not a receipt.
  if ((status === 'return' || status === 'success') && !loading) {
    if (alreadyPaid) {
      return shell(
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
          <h1 className="mt-4 text-xl font-semibold">Payment received</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Thank you. A receipt will be emailed to you, and the seller sees this within a minute.
          </p>
        </div>,
      );
    }
    return shell(
      <div className="text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-warning" />
        <h1 className="mt-4 text-xl font-semibold">Checking your payment…</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          If you completed the payment, it can take a moment to confirm — refresh this page shortly.
          If you cancelled or it failed, you can simply try again.
        </p>
        {info && (
          <p className="mt-2 text-xs text-muted-foreground">
            Outstanding right now: {formatMoney(info.amount_due, info.currency)}
          </p>
        )}
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" onClick={() => window.location.reload()}>Refresh</Button>
          <Button onClick={() => { window.location.href = `${window.location.origin}/pay/${token}`; }}>
            Try again
          </Button>
        </div>
      </div>,
    );
  }

  if (status === 'cancelled') {
    return shell(
      <div className="text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">Payment cancelled</h1>
        <p className="mt-2 text-sm text-muted-foreground">You closed the checkout window. Nothing was charged.</p>
        <Button className="mt-6" onClick={() => window.location.assign(`/pay/${token}`)}>
          <CreditCard className="h-4 w-4 mr-2" /> Try again
        </Button>
      </div>,
    );
  }

  if (loading) {
    return shell(
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">Loading payment details…</p>
      </div>,
    );
  }

  if (bankRef) {
    return shell(
      <div>
        <div className="text-center">
          <Landmark className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-4 text-xl font-semibold">Pay by bank transfer</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Open your banking app, start a transfer of{' '}
            <strong>{formatMoney(bankRef.amount, bankRef.currency)}</strong>, and paste this code
            into the <strong>reference</strong> field. You don't need an IBAN.
          </p>
        </div>

        <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-center">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Payment code</p>
          <p className="mt-1 font-mono text-lg font-semibold tracking-wider break-all">{bankRef.rf_code}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => { void navigator.clipboard.writeText(bankRef.rf_code); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2500); }}
          >
            <Copy className="h-3.5 w-3.5 mr-2" /> {codeCopied ? 'Copied!' : 'Copy code'}
          </Button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground text-center">
          Transfer exactly this amount — banks reject a different one. Your invoice updates
          automatically once the transfer clears, usually within one business day.
        </p>
      </div>,
    );
  }

  if (alreadyPaid) {
    return shell(
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
        <h1 className="mt-4 text-xl font-semibold">Already paid</h1>
        <p className="mt-2 text-sm text-muted-foreground">This document has no outstanding balance.</p>
        <div className="mt-4">{downloadButton}</div>
        {fiscal && <div className="mt-6 text-left"><FiscalRecordPanel fiscal={fiscal} /></div>}
      </div>,
    );
  }

  if (closed) {
    return shell(
      <div className="text-center">
        <Ban className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">
          {closed.status === 'credit_noted' ? 'Credited' : 'Cancelled'} — {closed.number}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {closed.status === 'credit_noted'
            ? 'This document has been reversed by a credit note, so there is nothing to pay on it.'
            : 'This document has been cancelled, so there is nothing to pay on it.'}
        </p>
        <div className="mt-4">{downloadButton}</div>
        {fiscal && <div className="mt-6 text-left"><FiscalRecordPanel fiscal={fiscal} /></div>}
      </div>,
    );
  }

  if (error && !info) {
    return shell(
      <div className="text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="mt-4 text-xl font-semibold">Payment unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </div>,
    );
  }

  if (!info || !token) return shell(null);

  const partPaid = info.total > 0 && info.amount_due < info.total - 0.005;
  const canDeposit = info.deposit_amount != null;
  const payOptions = buildOptions(info.providers, info.bank_transfer);
  const selected = payOptions.find((o) => o.key === option) ?? payOptions[0];
  const isTransfer = selected?.method === 'transfer';
  const docLabel = info.is_pre_invoice ? 'Order' : 'Invoice';
  const radioClass = (on: boolean) =>
    `rounded-md border px-3 py-2 text-sm text-left transition-colors ${on ? 'border-primary bg-primary/[0.08] font-medium' : 'border-hairline hover:bg-surface-sunken'}`;

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <Panel>
          <div className="px-6 py-6 text-center">
            {justPlaced ? (
              <>
                <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
                <p className="mt-3 text-sm text-muted-foreground">Thank you — we have received your order.</p>
              </>
            ) : (
              <FileText className="mx-auto h-8 w-8 text-primary" />
            )}
            <p className="mt-4 text-[11px] font-semibold text-muted-foreground">{docLabel} number</p>
            <h1 className="font-sans text-2xl font-semibold tabular-nums">{info.internal_number}</h1>
          </div>
          <dl className="grid grid-cols-2 border-t border-hairline text-sm">
            <div className="border-b border-r border-hairline px-4 py-3">
              <dt className="text-[11px] font-semibold text-muted-foreground">Date</dt>
              <dd className="mt-0.5 font-medium">{info.created_at ? formatDate(info.created_at) : '—'}</dd>
            </div>
            <div className="border-b border-hairline px-4 py-3">
              <dt className="text-[11px] font-semibold text-muted-foreground">Customer</dt>
              <dd className="mt-0.5 truncate font-medium">{info.customer_display || '—'}</dd>
            </div>
            <div className="border-r border-hairline px-4 py-3">
              <dt className="text-[11px] font-semibold text-muted-foreground">Total</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{formatMoney(info.total, info.currency)}</dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-[11px] font-semibold text-muted-foreground">{partPaid ? 'Outstanding' : 'To pay'}</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{formatMoney(info.amount_due, info.currency)}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Payment">
          <div className="space-y-4 p-4">
            <div className="space-y-2">
              <span id="pay-amount-label" className="text-xs font-medium">How much would you like to pay?</span>
              <div className="grid gap-2" role="radiogroup" aria-labelledby="pay-amount-label">
                {canDeposit && (
                  <button type="button" role="radio" aria-checked={choice === 'deposit'} onClick={() => setChoice('deposit')}
                    className={`flex items-center justify-between ${radioClass(choice === 'deposit')}`}>
                    <span>Deposit {info.deposit_pct != null && <span className="text-muted-foreground">({info.deposit_pct}%)</span>}</span>
                    <span className="tabular-nums font-medium">{formatMoney(info.deposit_amount!, info.currency)}</span>
                  </button>
                )}
                <button type="button" role="radio" aria-checked={choice === 'full'} onClick={() => setChoice('full')}
                  className={`flex items-center justify-between ${radioClass(choice === 'full')}`}>
                  <span>Pay in full</span>
                  <span className="tabular-nums font-medium">{formatMoney(info.amount_due, info.currency)}</span>
                </button>
                <div
                  role="radio"
                  aria-checked={choice === 'custom'}
                  tabIndex={0}
                  onClick={() => setChoice('custom')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChoice('custom'); } }}
                  className={`flex cursor-pointer items-center justify-between ${radioClass(choice === 'custom')}`}
                >
                  <span>Another amount</span>
                  {choice === 'custom' && (
                    <span role="presentation" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="w-32">
                      <MoneyInput aria-label="Custom amount" className="h-8 text-right text-sm" value={custom} onValueChange={setCustom} onFocus={() => setChoice('custom')} />
                    </span>
                  )}
                </div>
              </div>
              {info.min_amount > 0 && info.min_amount < info.amount_due - 0.005 && (
                <p className="text-[11px] text-muted-foreground">
                  Minimum payable now: {formatMoney(info.min_amount, info.currency)}.
                </p>
              )}
            </div>

            {payOptions.length > 1 && (
              <div className="space-y-2">
                <span id="pay-method-label" className="text-xs font-medium">How would you like to pay?</span>
                <div className="grid gap-2" role="radiogroup" aria-labelledby="pay-method-label">
                  {payOptions.map((o) => (
                    <button key={o.key} type="button" role="radio" aria-checked={selected?.key === o.key}
                      onClick={() => { setOption(o.key); setError(null); }} className={radioClass(selected?.key === o.key)}>
                      <span className="flex items-center gap-2">
                        {o.method === 'card'
                          ? <CreditCard className="h-3.5 w-3.5 shrink-0" />
                          : <Landmark className="h-3.5 w-3.5 shrink-0" />}
                        {o.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{o.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {payOptions.length === 1 && isTransfer && (
              <p className="flex items-center gap-2 text-sm font-medium">
                <Landmark className="h-4 w-4 text-primary" /> Payment method: direct bank transfer
              </p>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}

            {payOptions.length === 0 ? (
              <div className="rounded-md border border-hairline bg-surface-sunken p-3 text-center">
                <p className="text-sm">Online payment isn&apos;t available yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The seller hasn&apos;t finished setting up a way to pay. Please contact them to arrange payment.
                </p>
              </div>
            ) : !isTransfer && (
              <>
                <Button className="w-full" onClick={pay} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : selected?.method === 'bank_reference'
                      ? <Landmark className="h-4 w-4 mr-2" />
                      : <CreditCard className="h-4 w-4 mr-2" />}
                  {selected?.method === 'bank_reference'
                    ? `Get a code for ${formatMoney(chosenAmount() ?? 0, info.currency)}`
                    : `Pay ${formatMoney(chosenAmount() ?? 0, info.currency)}`}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  {selected?.method === 'bank_reference'
                    ? `Secure payment via ${selected.label.split('—')[1]?.trim() || 'bank transfer'}. You'll get a code to use in your banking app.`
                    : `Secure payment via ${selected?.label.split('—')[1]?.trim() || 'our provider'}. You'll be redirected to complete it.`}
                </p>
              </>
            )}
          </div>
        </Panel>

        {isTransfer && info.bank_transfer && (
          <>
            <BankTransferPanel
              bank={info.bank_transfer}
              reference={info.internal_number}
              amount={chosenAmount() ?? info.amount_due}
              currency={info.currency}
            />
            <ProofUploadPanel token={token} proofs={proofs} onUploaded={(p) => setProofs((xs) => [p, ...xs])} />
          </>
        )}

        <OrderLinesPanel info={info} />

        {fiscal && <FiscalRecordPanel fiscal={fiscal} />}
        <div className="flex justify-center">{downloadButton}</div>
      </div>
    </div>
  );
};

export default PayInvoicePage;
