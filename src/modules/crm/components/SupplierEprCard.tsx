/**
 * Is this supplier registered as a packaging producer? (#454)
 *
 * Greek suppliers are matched by ΑΦΜ against a nightly mirror of the public ΕΜΠΑ register, derived
 * in SQL by `epr_company_register_status`. `never_read` / `register_unavailable` are UNKNOWN and
 * must never read as "not registered". Other countries are still recorded by hand.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, BadgeCheck, CheckCircle2, ExternalLink, HelpCircle, Plus, Save,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import { FINANCE_BASE, FINANCE_TAB } from '@/modules/finance/routes';
import { WorkPanelError, WorkPanelForm, WorkPanelHeader, WorkPanelLoading } from './WorkPanelHeader';
import {
  packagingEprService, EMPA_PUBLIC_SEARCH_URL,
  type CompanyRegisterStatus, type GreekRegisterResult,
} from '@/modules/finance/services/packagingEprService';

interface Props {
  workspaceId: string;
  companyId: string;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-2 border-b border-hairline px-5 py-4 last:border-b-0">
    <h4 className="text-xs font-semibold text-muted-foreground">{title}</h4>
    {children}
  </section>
);

const Verdict: React.FC<{ tone: 'ok' | 'warn' | 'unknown'; title: string; children?: React.ReactNode }> = ({
  tone, title, children,
}) => {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : HelpCircle;
  const color = tone === 'ok'
    ? 'text-emerald-700 dark:text-emerald-400'
    : tone === 'warn' ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground';
  return (
    <div className="flex items-start gap-2.5">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
      <div className="min-w-0 space-y-1 text-sm">
        <p className={`font-medium ${tone === 'unknown' ? 'text-foreground' : color}`}>{title}</p>
        {children && <div className="space-y-1 text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
};

const RegisterLink: React.FC = () => (
  <a href={EMPA_PUBLIC_SEARCH_URL} target="_blank" rel="noopener noreferrer"
    className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
    Open the ΕΜΠΑ public search <ExternalLink className="h-3 w-3" />
  </a>
);

const GreekResult: React.FC<{ r: GreekRegisterResult; lastOk: string | null }> = ({ r, lastOk }) => {
  switch (r.state) {
    case 'listed':
      return (
        <Verdict tone="ok" title="Registered in the Greek producer register (ΕΜΠΑ)">
          <ul className="divide-y divide-hairline rounded-sm border border-hairline">
            {(r.entries ?? []).map((e) => (
              <li key={e.amp} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
                <span className="text-muted-foreground">ΑΜΠ</span>
                <span className="font-mono font-medium text-foreground">{e.amp}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">{e.name ?? '—'}</span>
                {e.scheme && <Badge variant="neutral">{e.scheme}</Badge>}
              </li>
            ))}
          </ul>
          <p className="text-xs">
            Matched automatically by ΑΦΜ {r.afm} against the public register on {formatDate(r.checked_at)}.
            The register is re-read every night.
          </p>
          <RegisterLink />
        </Verdict>
      );
    case 'not_listed':
      return (
        <Verdict tone="warn" title="Not found in the Greek producer register">
          <p className="text-xs">
            ΑΦΜ {r.afm} has no packaging registration in ΕΜΠΑ (checked {formatDate(r.checked_at)}). If this
            supplier packs or imports the goods they sell you, they should be registered — ask them for their
            ΑΜΠ. If they only resell goods packed by someone else, that company is the producer instead.
          </p>
          <RegisterLink />
        </Verdict>
      );
    case 'delisted':
      return (
        <Verdict tone="warn" title="No longer in the Greek producer register">
          <p className="text-xs">
            ΑΦΜ {r.afm} was listed until {formatDate(r.last_listed_at)} and has since dropped off the register.
            Ask the supplier whether their registration lapsed.
          </p>
          <RegisterLink />
        </Verdict>
      );
    case 'no_afm':
      return (
        <Verdict tone="unknown" title="No ΑΦΜ on file">
          <p className="text-xs">Add their ΑΦΜ under Details and this check runs automatically.</p>
        </Verdict>
      );
    default:
      return (
        <Verdict tone="unknown" title="The register could not be read">
          <p className="text-xs">
            {lastOk
              ? `The last successful read was on ${formatDate(lastOk)}. `
              : 'The register has not been read yet. '}
            This says nothing either way about whether the supplier is registered.
          </p>
          <RegisterLink />
        </Verdict>
      );
  }
};

const OwnResult: React.FC<{ own: CompanyRegisterStatus['own'] }> = ({ own }) => {
  const registered = own.entries?.[0]?.amp ?? null;
  if (own.state === 'no_afm') {
    return (
      <Verdict tone="unknown" title="Your ΑΦΜ is not set">
        <p className="text-xs">
          Add it in <Link to={`${FINANCE_BASE}?tab=${FINANCE_TAB.settings}`} className="text-primary hover:underline">Finance → Settings</Link> to
          check your own registration too.
        </p>
      </Verdict>
    );
  }
  if (own.state === 'listed') {
    const mismatch = own.recorded_amp && registered && own.recorded_amp !== registered;
    return (
      <Verdict tone={mismatch ? 'warn' : 'ok'} title={`Your business is registered — ΑΜΠ ${registered}`}>
        {mismatch && (
          <p className="text-xs">
            Finance → Settings has ΑΜΠ {own.recorded_amp}, which is not the number in the register. Your
            sales documents print the one in Settings.
          </p>
        )}
      </Verdict>
    );
  }
  if (own.state === 'not_listed' || own.state === 'delisted') {
    return (
      <Verdict tone="warn" title="Your business is not in the packaging register">
        <p className="text-xs">
          If you import packaged goods into Greece, you are most likely the producer for that packaging and
          need your own ΕΜΠΑ registration.
        </p>
      </Verdict>
    );
  }
  return <Verdict tone="unknown" title="Your own registration could not be checked right now" />;
};

const About: React.FC = () => (
  <details className="group border-t border-hairline px-5 py-4 text-sm" open>
    <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-muted-foreground">
      <HelpCircle className="h-3.5 w-3.5" /> About this check
      <span className="font-normal group-open:hidden">— show</span>
    </summary>
    <div className="mt-3 space-y-3 text-muted-foreground [&_h5]:mb-1 [&_h5]:text-xs [&_h5]:font-semibold [&_h5]:text-foreground">
      <div>
        <h5>What it is</h5>
        <p>
          Every business that first puts packaging on the Greek market — the box, pallet, film or crate goods
          arrive in — must be registered as a <em>producer</em> in ΕΜΠΑ, the national producer register kept
          by ΕΟΑΝ, and pay into a recycling scheme. This panel shows whether this supplier is.
        </p>
      </div>
      <div>
        <h5>Why it exists</h5>
        <p>
          The EU Packaging Regulation (PPWR, 2025/40, art. 19) requires a business that sells packaged goods
          on to check, before selling, that the producer is registered. A number the supplier gives you is not
          a check — looking it up in the public register is.
        </p>
      </div>
      <div>
        <h5>How the check works</h5>
        <p>
          For Greek suppliers it is automatic. Every night the platform downloads the public ΕΜΠΑ packaging
          register and matches each supplier by their ΑΦΜ. A supplier that drops off the register is flagged,
          and if the register cannot be read the panel says so rather than guessing. Suppliers from other
          countries are not checked automatically yet — look them up in their country&apos;s register and
          record the result below.
        </p>
      </div>
      <div>
        <h5>What it means for your own imports</h5>
        <p>
          The producer is whoever first places the packaging on the Greek market. For goods you import
          yourself, that is usually you: you need your own ΕΜΠΑ registration, and what a foreign supplier pays
          at home (for example to CONAI in Italy) does not cover Greece.
        </p>
      </div>
      <p className="text-xs">
        Legal basis: PPWR (EU) 2025/40 art. 19(2)(a) and art. 44; Ν. 4819/2021. This is guidance, not legal
        advice — confirm your own obligations with your accountant.
      </p>
    </div>
  </details>
);

export const SupplierEprCard: React.FC<Props> = ({ workspaceId, companyId }) => {
  const { toast } = useToast();
  const [status, setStatus] = useState<CompanyRegisterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ memberState: '', number: '', url: '' });
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await packagingEprService.companyRegisterStatus(companyId);
      setStatus(s); setFailed(!s);
    } catch {
      setStatus(null); setFailed(true);
    } finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const save = async (verified: boolean) => {
    if (!draft.number.trim() || !draft.memberState.trim()) return;
    setBusy(true);
    try {
      await packagingEprService.recordSupplierRegistration({
        workspaceId, companyId,
        memberState: draft.memberState,
        registrationNumber: draft.number.trim(),
        registerUrl: draft.url || null,
        verified,
      });
      setDraft({ memberState: '', number: '', url: '' });
      setFormOpen(false);
      await load();
      toast({
        title: verified ? 'Recorded as verified' : 'Recorded, not verified',
        description: verified
          ? 'The public register was checked.'
          : 'This is the number the supplier gave us. The law asks for the register check.',
      });
    } catch (err: unknown) {
      toast({
        title: 'Could not record the registration',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const openForm = () => {
    setDraft((d) => ({ ...d, memberState: d.memberState || status?.country || '' }));
    setFormOpen(true);
  };
  const manual = status?.registrations ?? [];
  const recordButton = (variant: 'default' | 'outline') => (
    <Button size="sm" variant={variant} onClick={openForm}>
      <Plus className="mr-1 h-3.5 w-3.5" /> Record a registration
    </Button>
  );

  return (
    <Card>
      <WorkPanelHeader
        icon={BadgeCheck}
        title="Packaging producer registration"
        description="Whether this supplier is registered as a packaging producer, checked against the public register."
        action={!loading && !failed && !formOpen && !status?.is_greek && manual.length > 0 && recordButton('outline')}
      />

      <CardContent className="p-0">
        {loading && <WorkPanelLoading />}

        {!loading && failed && (
          <WorkPanelError>
            The registration could not be read just now.
            That is not a statement that this supplier is registered, or that it is not.
          </WorkPanelError>
        )}

        {!loading && !failed && status && (
          <>
            {status.is_greek && (
              <Section title="Greek producer register (ΕΜΠΑ) — checked automatically">
                <GreekResult r={status.greek} lastOk={status.register.last_ok} />
              </Section>
            )}

            {formOpen && (
              <WorkPanelForm>
                <div>
                  <Label htmlFor="epr-ms">Country</Label>
                  <Input
                    id="epr-ms" className="mt-1 h-8 w-20 text-xs uppercase" maxLength={2} placeholder="IT"
                    value={draft.memberState}
                    onChange={(e) => setDraft((d) => ({ ...d, memberState: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div>
                  <Label htmlFor="epr-num">Registration number</Label>
                  <Input
                    id="epr-num" className="mt-1 h-8 w-40 font-mono text-xs" value={draft.number}
                    onChange={(e) => setDraft((d) => ({ ...d, number: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="epr-url">Register entry</Label>
                  <Input
                    id="epr-url" className="mt-1 h-8 w-56 text-xs" placeholder="link to their entry"
                    value={draft.url}
                    onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                  />
                </div>
                <Button size="sm" onClick={() => save(true)}
                  disabled={busy || !draft.number.trim() || !draft.memberState.trim()}>
                  <Save className="mr-1 h-3.5 w-3.5" /> I checked the register
                </Button>
                <Button size="sm" variant="outline" onClick={() => save(false)}
                  disabled={busy || !draft.number.trim() || !draft.memberState.trim()}>
                  Record unverified
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setFormOpen(false)} disabled={busy}>Cancel</Button>
              </WorkPanelForm>
            )}

            {manual.length > 0 && (
              <Section title="Recorded by hand">
                <ul className="divide-y divide-hairline rounded-sm border border-hairline">
                  {manual.map((r) => (
                    <li key={r.member_state} className="flex flex-wrap items-center gap-3 px-3 py-2 text-xs">
                      <Badge variant={r.verified_at ? 'success' : 'warning'}>{r.member_state}</Badge>
                      <span className="font-mono">{r.registration_number}</span>
                      {r.verified_at
                        ? <span className="text-muted-foreground">register checked {formatDate(r.verified_at)}</span>
                        : <span className="text-amber-800 dark:text-amber-300">not checked against the register</span>}
                    </li>
                  ))}
                </ul>
                {status.is_greek && !formOpen && (
                  <Button size="sm" variant="ghost" onClick={openForm}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Record another country
                  </Button>
                )}
              </Section>
            )}

            {!status.is_greek && manual.length === 0 && !formOpen && (
              <HubEmptyState
                icon={BadgeCheck}
                title="Not checked automatically"
                description={`The automatic check covers Greek suppliers only for now. Look this supplier up in their own country's producer register${status.country ? ` (${status.country})` : ''} and record the result.`}
                action={recordButton('default')}
              />
            )}

            <Section title="Your own registration">
              <OwnResult own={status.own} />
            </Section>

            <About />
          </>
        )}
      </CardContent>
    </Card>
  );
};
