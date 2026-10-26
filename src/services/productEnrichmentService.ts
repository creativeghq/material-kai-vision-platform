import { supabase } from '@/integrations/supabase/client';

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
}

export async function fetchEnrichmentReport(workspaceId: string, documentId: string): Promise<EnrichmentReport> {
  const { data, error } = await supabase.functions.invoke('enrich-draft-products', {
    body: { action: 'report', workspace_id: workspaceId, document_id: documentId },
  });
  if (error) throw new Error(error.message);
  const report = data as EnrichmentReport | null;
  if (!report?.summary || !Array.isArray(report.products)) throw new Error('The gap report came back empty');
  return report;
}

export function describeReport({ summary }: EnrichmentReport): string {
  const withGaps = summary.gaps_with_source + summary.gaps_no_source;
  if (summary.products === 0) return 'There are no draft products from this catalogue.';
  const parts = [`${withGaps} of ${summary.products} draft products have empty fields`];
  if (withGaps > 0) parts.push(`${summary.gaps_with_source} have a page we can read, ${summary.gaps_no_source} have none`);
  if (summary.unclassified > 0) parts.push(`${summary.unclassified} have no category yet`);
  return `${parts.join('; ')}.`;
}
