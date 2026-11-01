export type AuditStatus = 'passed' | 'needs_review' | 'failed' | 'unverifiable' | 'audit_error';
export type BadgeTone = 'success' | 'warning' | 'error' | 'neutral';

export interface AuditFinding {
  severity: 'warn' | 'fail';
  code: string;
  message: string;
  count: number;
  examples: unknown[];
}

export interface AuditMetrics {
  number_coverage?: number | null;
  code_coverage?: number | null;
  pages_with_missing_numbers?: number | null;
  tables_needing_review?: number | null;
  [key: string]: unknown;
}

export interface IngestionAuditRow {
  id: string;
  document_id: string;
  status: string;
  metrics: AuditMetrics | null;
  findings: AuditFinding[] | null;
  acknowledged_at: string | null;
  created_at: string;
}

const STATUS_TONE: Record<AuditStatus, BadgeTone> = {
  passed: 'success',
  needs_review: 'warning',
  failed: 'error',
  unverifiable: 'neutral',
  audit_error: 'error',
};

const STATUS_LABEL: Record<AuditStatus, string> = {
  passed: 'Passed',
  needs_review: 'Needs review',
  failed: 'Failed',
  unverifiable: 'Unverifiable',
  audit_error: 'Audit error',
};

const isStatus = (s: string): s is AuditStatus => s in STATUS_TONE;

export const statusTone = (s: string): BadgeTone => (isStatus(s) ? STATUS_TONE[s] : 'neutral');
export const statusLabel = (s: string): string => (isStatus(s) ? STATUS_LABEL[s] : s.replace(/_/g, ' '));
export const canAcknowledge = (s: string): boolean => s === 'failed' || s === 'needs_review';

export function formatCoverage(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  const pct = Math.min(100, Math.max(0, v * 100));
  const rounded = Math.round(pct * 10) / 10;
  return `${pct < 100 && rounded >= 100 ? 99.9 : rounded}%`;
}

export function pagesNeedingReview(m: AuditMetrics | null | undefined): number | null {
  const a = m?.pages_with_missing_numbers;
  const b = m?.tables_needing_review;
  if (typeof a !== 'number' && typeof b !== 'number') return null;
  return (typeof a === 'number' ? a : 0) + (typeof b === 'number' ? b : 0);
}

export function findingsOf(row: Pick<IngestionAuditRow, 'findings'>): AuditFinding[] {
  return Array.isArray(row.findings) ? row.findings : [];
}

export function exampleText(example: unknown): string {
  if (example === null || example === undefined) return '—';
  if (typeof example === 'string') return example;
  if (typeof example === 'number' || typeof example === 'boolean') return String(example);
  if (typeof example === 'object') {
    return Object.entries(example as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`)
      .join(', ') || '—';
  }
  return '—';
}

export function examplesLine(f: AuditFinding, limit = 3): string {
  const ex = Array.isArray(f.examples) ? f.examples : [];
  if (ex.length === 0) return '';
  const shown = ex.slice(0, limit).map(exampleText).join('; ');
  const rest = Math.max(f.count || ex.length, ex.length) - Math.min(limit, ex.length);
  return rest > 0 ? `${shown}; and ${rest} more` : shown;
}

export function findingsSummary(row: Pick<IngestionAuditRow, 'findings' | 'status'>): string {
  const n = findingsOf(row).length;
  if (n === 0) return row.status === 'passed' ? '0' : '—';
  return String(n);
}
