/** Canonical "external API provider not configured" response. */

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
