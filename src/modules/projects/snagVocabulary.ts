/** `project_snags_severity_check`, written ONCE (#391). */

export const SNAG_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type SnagSeverity = (typeof SNAG_SEVERITIES)[number];

export function isSnagSeverity(v: unknown): v is SnagSeverity {
  return typeof v === 'string' && (SNAG_SEVERITIES as readonly string[]).includes(v);
}
