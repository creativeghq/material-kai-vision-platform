import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IngestionAuditList } from '@/components/Admin/OperationsDashboard/IngestionAuditList';
import type { IngestionAuditRow } from '@/components/Admin/OperationsDashboard/ingestionAudit';

const row = (over: Partial<IngestionAuditRow>): IngestionAuditRow => ({
  id: 'r1',
  document_id: 'd1',
  status: 'failed',
  metrics: { number_coverage: 0.5, code_coverage: null, pages_with_missing_numbers: 2, tables_needing_review: 1 },
  findings: [{ severity: 'fail', code: 'x', message: 'Prices missing', count: 2, examples: ['p4'] }],
  acknowledged_at: null,
  created_at: '2026-10-30T10:00:00Z',
  ...over,
});

const render = (rows: IngestionAuditRow[], onAck?: () => void) =>
  renderToStaticMarkup(createElement(IngestionAuditList, { rows, filenames: { d1: 'catalogue.pdf' }, onAcknowledge: onAck }));

describe('ingestion audit list', () => {
  it('shows filename, status, coverage and an Acknowledge action', () => {
    const html = render([row({})], () => undefined);
    expect(html).toContain('catalogue.pdf');
    expect(html).toContain('Failed');
    expect(html).toContain('50%');
    expect(html).toContain('—');
    expect(html).toContain('Acknowledge');
  });
  it('shows acknowledged rows as such, without the button', () => {
    const html = render([row({ acknowledged_at: '2026-10-31T10:00:00Z' })], () => undefined);
    expect(html).toContain('Acknowledged');
    expect(html).not.toContain('>Acknowledge<');
  });
  it('does not offer acknowledge on a passed audit', () => {
    expect(render([row({ status: 'passed', findings: [] })], () => undefined)).not.toContain('>Acknowledge<');
  });
  it('explains an empty list', () => {
    expect(render([])).toContain('No ingestion audits yet');
  });
});
