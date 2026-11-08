/** `/inbox?compose=email&to=…` opens the Inbox's new-email form prefilled. It sends nothing. */
export interface ComposeEmailSeed {
  to: string;
  contactId?: string | null;
  leadId?: string | null;
}

const P = { compose: 'compose', to: 'to', contact: 'contact', lead: 'lead' } as const;

export function inboxComposeEmailUrl(seed: ComposeEmailSeed): string {
  const p = new URLSearchParams({ [P.compose]: 'email', [P.to]: seed.to.trim() });
  if (seed.contactId) p.set(P.contact, seed.contactId);
  if (seed.leadId) p.set(P.lead, seed.leadId);
  return `/inbox?${p.toString()}`;
}

/** The seed in `params`, and `params` with it removed so a refresh does not reopen the form. */
export function takeComposeEmailSeed(params: URLSearchParams): { seed: ComposeEmailSeed; rest: URLSearchParams } | null {
  if (params.get(P.compose) !== 'email') return null;
  const rest = new URLSearchParams(params);
  for (const k of Object.values(P)) rest.delete(k);
  return {
    seed: {
      to: (params.get(P.to) ?? '').slice(0, 320),
      contactId: params.get(P.contact),
      leadId: params.get(P.lead),
    },
    rest,
  };
}
