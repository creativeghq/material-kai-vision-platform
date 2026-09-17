// A model-provider failure, said in a sentence the person who hit it can act on.

export interface ProviderFailure {
  message: string;
  code:
    | 'provider_out_of_credit'
    | 'provider_auth_failed'
    | 'attachment_unreadable'
    | 'context_too_long'
    | 'provider_rate_limited'
    | 'provider_overloaded'
    | 'provider_timeout'
    | 'agent_failed';
  /** Whether the same turn, sent again unchanged, could succeed. */
  retryable: boolean;
}

const RULES: Array<{ test: RegExp; failure: ProviderFailure }> = [
  {
    test: /credit balance is too low|billing.*not active|insufficient[_ ]quota/i,
    failure: {
      code: 'provider_out_of_credit',
      retryable: false,
      message:
        'The AI service is unavailable — the platform\'s provider account is out of credit. '
        + 'Nothing you did caused this and retrying will not help until it is topped up.',
    },
  },
  {
    test: /timed out while trying to download the file|could not (?:be )?(?:download|fetch)/i,
    failure: {
      code: 'attachment_unreadable',
      retryable: true,
      message:
        'I could not read the file you attached — fetching it timed out. Try attaching it again, '
        + 'or a smaller version of it.',
    },
  },
  {
    test: /authentication[_ ]error|invalid x-api-key|401/i,
    failure: {
      code: 'provider_auth_failed',
      retryable: false,
      message:
        'The AI service rejected our credentials. This is a platform configuration problem, not '
        + 'something you can fix from here.',
    },
  },
  {
    test: /prompt is too long|context[_ ]length|maximum.*tokens/i,
    failure: {
      code: 'context_too_long',
      retryable: false,
      message:
        'This conversation has grown past what the model can read in one turn. Start a new chat, '
        + 'or attach fewer files, and the same question will work.',
    },
  },
  {
    test: /rate[_ ]limit|429/i,
    failure: {
      code: 'provider_rate_limited',
      retryable: true,
      message: 'The AI service is rate-limiting us right now. Give it a moment and send that again.',
    },
  },
  {
    test: /overloaded|529|503/i,
    failure: {
      code: 'provider_overloaded',
      retryable: true,
      message: 'The AI service is overloaded right now. Send that again in a moment.',
    },
  },
  {
    test: /\btimeout\b|timed out|aborted/i,
    failure: {
      code: 'provider_timeout',
      retryable: true,
      message: 'That turn took too long and was cut off before it finished. Try it again.',
    },
  },
];

const GENERIC: ProviderFailure = {
  code: 'agent_failed',
  retryable: true,
  message: 'Something went wrong running that turn. It has been logged — try again.',
};

/** Falls through to a generic sentence rather than printing a raw body nobody can act on. */
export function describeProviderFailure(err: unknown): ProviderFailure {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (!raw) return GENERIC;
  for (const rule of RULES) {
    if (rule.test.test(raw)) return rule.failure;
  }
  return GENERIC;
}
