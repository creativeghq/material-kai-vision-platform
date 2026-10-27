import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

export type EnrichmentVerdict = 'nothing_missing' | 'gaps_with_source' | 'gaps_no_source' | 'unclassified';

export interface EnrichmentReportRow {
  product_id: string;
  name: string | null;
  category: string | null;
  gaps: string[];
  source: { kind: 'product_url' | 'brand_site'; url: string } | null;
  verdict: EnrichmentVerdict;
}

export interface EnrichmentReport {
  summary: { products: number } & Record<EnrichmentVerdict, number>;
  products: EnrichmentReportRow[];
  estimate: { products_to_read: number; credits_ceiling: number };
}

export interface EnrichmentRunResult {
  product_id: string;
  status: string;
  reason?: string;
  fields?: number;
}

export interface EnrichmentAttempt {
  product_id: string;
  status: string;
  reason: string | null;
  promoted_fields: string[];
  canonicalization_state: string;
  embedding_state: string;
}

export const RUN_BATCH = 3;

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('enrich-draft-products', { body });
  if (error) throw await edgeError(error, 'Enrichment request failed');
  return data as T;
}

export async function fetchEnrichmentReport(workspaceId: string, documentId: string): Promise<EnrichmentReport> {
  const report = await call<EnrichmentReport | null>({ action: 'report', workspace_id: workspaceId, document_id: documentId });
  if (!report?.summary || !Array.isArray(report.products)) throw new Error('The gap report came back empty');
  return report;
}

export async function runEnrichment(workspaceId: string, productIds: string[]): Promise<EnrichmentRunResult[]> {
  const out = await call<{ results?: EnrichmentRunResult[] } | null>({ action: 'run', workspace_id: workspaceId, product_ids: productIds });
  return out?.results ?? [];
}

export async function fetchEnrichmentStatus(workspaceId: string, productIds: string[]): Promise<Map<string, EnrichmentAttempt>> {
  if (productIds.length === 0) return new Map();
  const out = await call<{ attempts?: EnrichmentAttempt[] } | null>({ action: 'status', workspace_id: workspaceId, product_ids: productIds });
  return new Map((out?.attempts ?? []).map((a) => [a.product_id, a]));
}

export function describeReport({ summary }: EnrichmentReport): string {
  const withGaps = summary.gaps_with_source + summary.gaps_no_source;
  if (summary.products === 0) return 'There are no draft products from this catalogue.';
  const parts = [`${withGaps} of ${summary.products} draft products have empty fields`];
  if (withGaps > 0) parts.push(`${summary.gaps_with_source} have a page we can read, ${summary.gaps_no_source} have none`);
  if (summary.unclassified > 0) parts.push(`${summary.unclassified} have no category yet`);
  return `${parts.join('; ')}.`;
}

export const ATTEMPT_LABEL: Record<string, { label: string; tone: 'success' | 'warning' | 'error' | 'info' | 'neutral' }> = {
  done: { label: 'Enriched', tone: 'success' },
  nothing_missing: { label: 'Complete', tone: 'neutral' },
  no_source: { label: 'No source', tone: 'neutral' },
  low_confidence: { label: 'Not confident', tone: 'warning' },
  failed: { label: 'Failed', tone: 'error' },
  running: { label: 'Running', tone: 'info' },
  extracted: { label: 'Saving', tone: 'info' },
  promoted: { label: 'Needs retry', tone: 'warning' },
};
