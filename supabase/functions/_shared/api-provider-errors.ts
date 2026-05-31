/**
 * Canonical "external API provider not configured" response.
 *
 * Used by every edge function that calls an external API client (Stripe,
 * Resend, Twilio, Replicate, OpenAI, Anthropic, MIVAA, etc.) when the
 * required secret is unset in both env and `platform_secrets`. Returns a
 * uniform shape so the frontend can branch on `code: 'provider_not_configured'`
 * regardless of which provider failed.
 *
 * Pattern at call site:
 *
 *   import { notConfiguredResponse } from '../_shared/api-provider-errors.ts';
 *
 *   if (!resendApiKey()) {
 *     return notConfiguredResponse({
 *       provider: 'Resend',
 *       settingsPath: '/admin/modules/email/settings → Keys',
 *     });
 *   }
 *
 * The Stripe surface uses `noPaymentProviderResponse` from `stripe-clients.ts`
 * which is a typed alias of this same shape — kept separate because the
 * customer-facing wording for payments differs from the admin-facing wording
 * for back-office services like Resend / Twilio / Replicate.
 */

export interface ProviderConfig {
  /** Display name shown in the error message (e.g. `'Resend'`, `'Twilio'`). */
  provider: string;
  /** Deep-link path where admin should fix it. Rendered into the message. */
  settingsPath?: string;
  /** Extra short hint about the env var name, prepended to the settings hint. */
  envVarHint?: string;
}

const BASE_HEADERS = { 'Content-Type': 'application/json' };

export function notConfiguredResponse(
  config: ProviderConfig,
  extraHeaders: Record<string, string> = {},
): Response {
  const parts: string[] = [`${config.provider} is not configured.`];
  if (config.envVarHint) parts.push(config.envVarHint);
  if (config.settingsPath) parts.push(`Set it at ${config.settingsPath}.`);

  return new Response(
    JSON.stringify({
      error: parts.join(' '),
      code: 'provider_not_configured',
      provider: config.provider.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    }),
    { status: 503, headers: { ...BASE_HEADERS, ...extraHeaders } },
  );
}
