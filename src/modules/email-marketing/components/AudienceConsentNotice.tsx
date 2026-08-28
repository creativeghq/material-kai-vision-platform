/**
 * What a campaign audience resolves to, and what it holds back — with the reason (#357 AE-8).
 *
 * `crm_contacts.marketing_consent` has existed all along: it is on the contact page, and the
 * real-estate module honours it on every alert and digest. The campaign resolver never read it, so
 * a contact with the box unticked received every campaign anyway, and a pasted address that
 * matched nobody was mailed on no basis at all.
 *
 * Now that the resolver withholds those, the count on screen gets SMALLER than the audience — and a
 * number that shrinks with no stated reason is the silent-zero shape wearing a compliance hat
 * (anti-regression rule 3). People work around an unexplained count; they act on an explained one.
 * So every withheld address is counted, named and given the thing that would fix it.
 *
 * SQL derives the verdict. This only formats it.
 */
import React from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';

import { summarizeAudienceConsent } from '../consentBasis';
import type { AudienceRecipient } from '../services/marketingService';

export const AudienceConsentNotice: React.FC<{
  rows: AudienceRecipient[];
  /** Shown while the resolve is in flight, so an empty count is not read as "nobody". */
  resolving?: boolean;
  className?: string;
}> = ({ rows, resolving = false, className }) => {
  const { mailable, withheld } = summarizeAudienceConsent(rows);

  return (
    <div className={`rounded-sm border border-hairline bg-surface-sunken p-3 text-sm ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        {withheld.length === 0 ? (
          <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden />
        ) : (
          <ShieldAlert className="h-4 w-4 text-amber-800 dark:text-amber-300" aria-hidden />
        )}
        <span>
          <span className="font-semibold tabular-nums">{mailable}</span>{' '}
          recipient{mailable === 1 ? '' : 's'} will be emailed
          {resolving && <span className="text-muted-foreground"> · resolving…</span>}
        </span>
      </div>

      {withheld.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-hairline pt-2">
          {withheld.map((w) => (
            <li key={w.basis} className="text-xs text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">{w.count}</span> held back — {w.label}.
              {w.remedy ? ` ${w.remedy}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
