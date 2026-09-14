// Work out which business is on the other end of a conversation, then file it as one.
//
// A trade inbox is mostly companies introducing themselves, and the channel tells us almost
// nothing: a display name, a number, and what they typed. So the research runs off those three,
// and its answer is a PROPOSAL a person approves — filing a party is a decision, which is why the
// WhatsApp webhook stopped creating records on its own.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Building2, Search, Link2, UserRound, AlertCircle } from 'lucide-react';

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { companiesAPI, type CreateCompanyError } from '@/services/crm.service';
import { inboxApi } from '@/services/inboxApi';
import { identifyCounterparty, NO_IDENTITY, type CounterpartyIdentity } from '@/services/companyEnrichService';
import {
  CompanyIdentityLookup, companyIdentityPayload, emptyCompanyIdentity, type CompanyIdentityDraft,
} from '@/components/business/crm/CompanyIdentityLookup';
import { normalizeVat, CRM_VAT_COLUMN } from '@/components/business/crm/companyIdentity';
import { CRM_NAME_COLUMN, foldedName } from '@/services/crmSearch';
import { countryFromPhone } from '@/utils/phoneCountry';
import { VAT_COUNTRY_OPTIONS } from '@/lib/vatCountries';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  threadId: string;
  /** The name the channel shows. Often a person AND a company: "Patricia (Unitiles)". */
  displayName: string;
  phone: string | null;
  /** Message bodies, newest last. Read for domains and for what they actually sell. */
  transcript: string;
  /** Called once the thread is linked, so the drawer can re-read its context. */
  onLinked: (company: { id: string; name: string }) => void;
}

/**
 * A free mailbox names the person's provider, never their employer, and searching "gmail.com"
 * returns Google every time. Matched on the WHOLE domain (or its last two labels), never on the
 * first label — `mail.acme-tiles.it` is a company's own mail host, not a free provider.
 */
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.gr', 'yahoo.it',
  'hotmail.com', 'hotmail.it', 'hotmail.gr', 'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com',
  'mail.ru', 'yandex.ru', 'yandex.com', 'qq.com', '163.com', '126.com',
  'web.de', 'gmx.de', 'gmx.net', 'free.fr', 'orange.fr', 'wanadoo.fr',
  'libero.it', 'virgilio.it', 'tiscali.it', 'alice.it', 'otenet.gr', 'hol.gr',
]);
const isFreeMail = (d: string) => FREE_MAIL.has(d) || FREE_MAIL.has(d.split('.').slice(-2).join('.'));

/** Domains and email domains mentioned in the conversation — the strongest lead there is. */
function domainsIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g)) found.add(m[1].toLowerCase());
  for (const m of text.matchAll(/https?:\/\/([\w-]+(?:\.[\w-]+)+)/gi)) found.add(m[1].toLowerCase());
  return [...found].filter((d) => !isFreeMail(d)).slice(0, 10);
}

/** What this business is to us. The inbox carries both, so neither may be assumed. */
type BusinessRole = 'supplier' | 'customer' | 'both';
const ROLE_LABEL: Record<BusinessRole, string> = {
  supplier: 'They supply us',
  customer: 'They buy from us',
  both: 'Both',
};

const countryName = (code: string | null): string | null =>
  (code ? VAT_COUNTRY_OPTIONS.find((o) => o.code === code)?.name ?? null : null);

/** Bare host, `www.` dropped, so `https://www.acme.it/en/` and `acme.it` compare equal. */
function domainOf(url: string | null | undefined): string | null {
  const s = String(url ?? '').trim();
  if (!s) return null;
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

/** The research's answer as a crm_companies patch — only the columns it actually established. */
function draftFromIdentity(id: CounterpartyIdentity, fallbackCountry: string | null): CompanyIdentityDraft {
  const fields: Record<string, unknown> = {};
  const put = (k: string, v: string | null) => { if (v) fields[k] = v; };
  put('website', id.website);
  put('email', id.email);
  put('phone', id.phone);
  put('city', id.city);
  put('state', id.state);
  put('industry', id.industry);
  put('description', id.description);
  put('linkedin', id.linkedin);
  // The trading name, kept beside the registered one rather than instead of it.
  if (id.legal_name && id.business_name && id.legal_name !== id.business_name) {
    put('commercial_title', id.business_name);
  }
  const cc = (id.country_code || fallbackCountry || '').toUpperCase();
  if (cc) fields.country_code = cc;
  put('country', countryName(cc || null));
  return emptyCompanyIdentity({
    name: id.legal_name || id.business_name || '',
    countryCode: cc || 'EL',
    // A registry id is not a VAT number, so it is never seeded into the VAT field — it would be
    // sent to VIES, refused, and read as "this business does not exist".
    vatNumber: id.vat_number || '',
    fields,
  });
}

export const IdentifyBusinessDialog: React.FC<Props> = ({
  open, onOpenChange, workspaceId, threadId, displayName, phone, transcript, onLinked,
}) => {
  const { toast } = useToast();
  const [researching, setResearching] = useState(false);
  const [identity, setIdentity] = useState<CounterpartyIdentity | null>(null);
  const [draft, setDraft] = useState<CompanyIdentityDraft>(emptyCompanyIdentity());
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);
  /** A company matched on the NUMBER. Held apart from `duplicate`, which the name probe rewrites
   *  as the operator types — that was clearing a certain match and re-arming "Add as a business"
   *  for a number already on file. */
  const [phoneMatch, setPhoneMatch] = useState<{ id: string; name: string } | null>(null);
  const [role, setRole] = useState<BusinessRole>('supplier');
  const [saving, setSaving] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const ranFor = useRef<string | null>(null);

  const phoneCountry = countryFromPhone(phone);

  /**
   * Do we already know this number? Free, instant, and right far more often than a web search:
   * `crm_phones` holds every number we have ever filed against a business or a person, and the
   * whole point of putting a counterparty's number there is that the next conversation from it
   * costs nothing to place. Asked BEFORE the paid research, never after.
   */
  const lookupKnownNumber = useCallback(async (): Promise<{ id: string; name: string } | null> => {
    const normalized = (phone ?? '').replace(/[^0-9+]/g, '');
    if (!normalized) return null;
    try {
      const { data: byPhone } = await supabase
        .from('crm_phones')
        .select('company_id, contact_id')
        .eq('workspace_id', workspaceId).eq('phone_normalized', normalized)
        .not('company_id', 'is', null).limit(1).maybeSingle();
      const viaPhones = (byPhone as { company_id?: string } | null)?.company_id ?? null;

      // The company's own `phone` column too — a business filed before crm_phones existed, or
      // one whose number was typed on the record rather than added as a line.
      const companyId = viaPhones ?? (await (async () => {
        const { data } = await supabase.from('crm_companies')
          .select('id').eq('workspace_id', workspaceId).eq('phone', normalized).limit(1).maybeSingle();
        return (data as { id?: string } | null)?.id ?? null;
      })());
      if (!companyId) return null;

      const { data: co } = await supabase.from('crm_companies')
        .select('id, name').eq('id', companyId).maybeSingle();
      const row = co as { id: string; name: string | null } | null;
      return row ? { id: row.id, name: row.name ?? normalized } : null;
    } catch {
      // A failed probe is not "we do not know them" — fall through to the research rather than
      // asserting a new business exists.
      return null;
    }
  }, [phone, workspaceId]);

  const research = useCallback(async () => {
    setResearching(true);
    setIdentity(null);
    const known = await lookupKnownNumber();
    if (known) {
      setPhoneMatch(known);
      setDuplicate(known);
      setIdentity({
        ...NO_IDENTITY, verdict: 'business', confidence: 'high', ok: true,
        business_name: known.name,
        evidence: [`This number is already on file in your CRM under “${known.name}”. No search was needed.`],
      } as CounterpartyIdentity);
      setResearching(false);
      return;
    }
    try {
      const res = await identifyCounterparty({
        displayName,
        phone,
        countryName: countryName(phoneCountry),
        domains: domainsIn(transcript),
        transcript,
        workspaceId,
      });
      setIdentity(res);
      if (res.verdict === 'business') setDraft(draftFromIdentity(res, phoneCountry));
      else setDraft(emptyCompanyIdentity({ countryCode: phoneCountry || 'EL', name: displayName }));
    } finally {
      setResearching(false);
    }
  }, [displayName, phone, phoneCountry, transcript, workspaceId, lookupKnownNumber]);

  // Once per opening, not once per render — this call costs credits.
  useEffect(() => {
    if (!open) { ranFor.current = null; return; }
    if (ranFor.current === threadId) return;
    ranFor.current = threadId;
    setDuplicate(null);
    void research();
  }, [open, threadId, research]);

  // Are they already in the CRM? VAT, then DOMAIN, then name.
  //
  // Domain sits in the middle deliberately: two rows for one business usually differ by name
  // ("Marocchi", "MAROCCHI SRL", "Marocchi Group") and agree on the website, so a name-only probe
  // is the one that misses. crm-api still runs its own folded-name check before the insert — this
  // is the shortcut that offers "link to it", never the guarantee.
  useEffect(() => {
    if (!open) return;
    // A number already on file is the strongest match there is and is never re-opened by typing.
    if (phoneMatch) { setDuplicate(phoneMatch); return; }
    const vat = draft.vatNumber.trim();
    const name = draft.name.trim();
    const domain = domainOf(draft.fields.website as string | undefined);
    if (!vat && !domain && name.length < 2) { setDuplicate(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const hit = (data: unknown) => {
        const row = data as { id?: string; name?: string | null } | null;
        return row?.id ? { id: row.id, name: row.name ?? name } : null;
      };
      try {
        const vatKey = normalizeVat(vat);
        if (vatKey) {
          const { data } = await supabase.from('crm_companies').select('id, name')
            .eq('workspace_id', workspaceId).eq(CRM_VAT_COLUMN, vatKey).limit(1).maybeSingle();
          if (cancelled) return;
          if (hit(data)) { setDuplicate(hit(data)); return; }
        }
        if (domain) {
          // `ilike` narrows, then the host is compared exactly — `%acme.it%` alone also matches
          // `notacme.it.example.com`.
          const { data: rows } = await supabase.from('crm_companies').select('id, name, website')
            .eq('workspace_id', workspaceId).ilike('website', `%${domain}%`).limit(50);
          if (cancelled) return;
          const match = ((rows ?? []) as Array<{ id: string; name: string | null; website: string | null }>)
            .find((r) => domainOf(r.website) === domain);
          if (match) { setDuplicate({ id: match.id, name: match.name ?? name }); return; }
        }
        if (name.length >= 2) {
          const { data } = await supabase.from('crm_companies').select('id, name')
            .eq('workspace_id', workspaceId).eq(CRM_NAME_COLUMN, foldedName(name)).limit(1).maybeSingle();
          if (cancelled) return;
          if (hit(data)) { setDuplicate(hit(data)); return; }
        }
        if (!cancelled) setDuplicate(null);
      } catch {
        if (!cancelled) setDuplicate(null);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, draft.vatNumber, draft.name, draft.fields.website, workspaceId, phoneMatch]);

  const linkTo = async (company: { id: string; name: string }) => {
    const res = await inboxApi.linkCompanyToThread(threadId, company.id);
    toast({
      title: `Filed under ${company.name}`,
      description: res.contact_linked
        ? 'The conversation and the contact on it now belong to that business.'
        : 'The conversation now belongs to that business.',
    });
    onLinked(company);
    onOpenChange(false);
  };

  const useExisting = async () => {
    if (!duplicate) return;
    setSaving(true);
    try {
      await linkTo(duplicate);
    } catch (e) {
      toast({ title: 'Could not link the business', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const createAndLink = async () => {
    const name = draft.name.trim();
    if (!name) {
      toast({ title: 'A name is needed', description: 'Type the business name, or look its VAT number up.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    // Two writes with no transaction, so the halves are reported separately (anti-regression
    // rule 4). A retry is safe: crm-api's duplicate guard 409s with the row it found, which the
    // catch turns into "link to it" rather than a second business.
    let created: { id: string; name: string } | null = null;
    try {
      const payload = companyIdentityPayload(draft, {
        is_supplier: role === 'supplier' || role === 'both',
        is_customer: role === 'customer' || role === 'both',
      });
      const { data } = await companiesAPI.createCompany({ ...payload, workspace_id: workspaceId });
      if (!data?.id) throw new Error('The business was not returned by the server.');
      created = { id: data.id as string, name: (data.name as string) ?? name };
    } catch (err) {
      const dup = err as CreateCompanyError;
      if (dup?.code === 'duplicate_company' && dup.existing) {
        setDuplicate({ id: dup.existing.id, name: dup.existing.name || name });
        toast({ title: 'Already in the CRM', description: `"${dup.existing.name || name}" is on file — link the conversation to it instead.` });
      } else {
        toast({ title: 'Could not add the business', description: (err as Error)?.message, variant: 'destructive' });
      }
      setSaving(false);
      return;
    }

    try {
      await linkTo(created);
    } catch (e) {
      // The business EXISTS. Saying "could not add the business" here would send the operator
      // back to create a second one.
      setDuplicate(created);
      toast({
        title: `${created.name} was added, but not linked`,
        description: `${(e as Error).message} The business is in the CRM — use “Link to it” to attach this conversation.`,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || lookupBusy || researching;
  const verdict = identity?.verdict ?? null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Find the business
          </DialogTitle>
          <DialogDescription>
            Researching “{displayName}”{phoneCountry ? ` — a ${countryName(phoneCountry)} number` : ''}.
            Nothing is filed until you say so.
          </DialogDescription>
        </DialogHeader>

        {researching && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching the web for who they are…
          </div>
        )}

        {!researching && identity && (
          <div className="space-y-3">
            {/* The verdict, and it is never rendered as a number. "We could not ask" and "not a
                business" are different answers and the second one files a supplier wrongly. */}
            <div className="flex items-center gap-2">
              {verdict === 'business' && (
                <Badge variant="success">
                  A business{identity.confidence ? ` · ${identity.confidence} confidence` : ''}
                </Badge>
              )}
              {verdict === 'person' && <Badge variant="info">Looks like an individual</Badge>}
              {verdict === 'unclear' && <Badge variant="warning">Not enough to tell</Badge>}
              {verdict === 'unknown' && <Badge variant="neutral">Could not check</Badge>}
              {identity.person_name && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <UserRound className="h-3 w-3" />
                  {identity.person_name}{identity.person_role ? ` · ${identity.person_role}` : ''}
                </span>
              )}
            </div>

            {verdict === 'unknown' && (
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 mt-px shrink-0" />
                {identity.error || identity.skipped[0] || 'The research could not run.'} You can still
                type the business in below.
              </p>
            )}

            {identity.evidence.length > 0 && (
              <ul className="rounded-sm border border-hairline bg-surface-sunken p-3 space-y-1.5">
                {identity.evidence.map((line, i) => (
                  <li key={i} className="text-xs text-muted-foreground leading-relaxed">{line}</li>
                ))}
              </ul>
            )}

            {identity.registry_id && !identity.vat_number && (
              <p className="text-xs text-muted-foreground">
                Register number found: <span className="font-mono">{identity.registry_id}</span> — kept out of
                the VAT field, which only takes a number a tax registry can confirm.
              </p>
            )}

            <CompanyIdentityLookup
              value={draft}
              onChange={setDraft}
              onBusyChange={setLookupBusy}
              disabled={saving}
            />

            {/* Never assumed. This inbox carries both — suppliers introducing themselves AND
                customers asking for work — and a customer filed as supplier-only drops out of
                every customer count and filter without erroring. */}
            {!duplicate && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">What are they to us?</p>
                <div className="flex gap-1.5">
                  {(Object.keys(ROLE_LABEL) as BusinessRole[]).map((r) => (
                    <Button
                      key={r}
                      type="button"
                      size="sm"
                      variant={role === r ? 'secondary' : 'outline'}
                      className="flex-1"
                      disabled={saving}
                      onClick={() => setRole(r)}
                    >
                      {ROLE_LABEL[r]}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {duplicate && (
              <div className="rounded-sm border border-hairline p-3 flex items-center justify-between gap-3">
                <p className="text-xs">
                  <span className="font-medium">{duplicate.name}</span> is already in the CRM.
                </p>
                <Button size="sm" variant="secondary" disabled={busy} onClick={useExisting}>
                  <Link2 className="w-3.5 h-3.5 mr-1.5" />Link to it
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void research()}>
            <Search className="w-3.5 h-3.5 mr-1.5" />Search again
          </Button>
          <Button size="sm" disabled={busy || !!duplicate || !draft.name.trim()} onClick={() => void createAndLink()}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Building2 className="w-3.5 h-3.5 mr-1.5" />}
            Add as a business
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
