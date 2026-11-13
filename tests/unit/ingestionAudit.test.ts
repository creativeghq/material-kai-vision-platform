import { describe, it, expect } from 'vitest';
import {
  canAcknowledge, examplesLine, exampleText, findingsSummary, formatCoverage, pagesNeedingReview, statusTone,
} from '@/components/Admin/OperationsDashboard/ingestionAudit';

describe('ingestion audit mapping', () => {
  it('maps every status to a tone and unknown to neutral', () => {
    expect(statusTone('passed')).toBe('success');
    expect(statusTone('needs_review')).toBe('warning');
    expect(statusTone('failed')).toBe('error');
    expect(statusTone('unverifiable')).toBe('neutral');
    expect(statusTone('audit_error')).toBe('error');
    expect(statusTone('weird')).toBe('neutral');
  });
  it('only failed and needs_review can be acknowledged', () => {
    expect(['passed', 'failed', 'needs_review', 'unverifiable', 'audit_error'].filter(canAcknowledge)).toEqual(['failed', 'needs_review']);
  });
  it('formats coverage, with a dash for absent', () => {
    expect(formatCoverage(null)).toBe('—');
    expect(formatCoverage(undefined)).toBe('—');
    expect(formatCoverage(1)).toBe('100%');
    expect(formatCoverage(0.9234)).toBe('92.3%');
    expect(formatCoverage(0)).toBe('0%');
  });
  it('sums pages needing review, null when neither is known', () => {
    expect(pagesNeedingReview({})).toBeNull();
    expect(pagesNeedingReview({ pages_with_missing_numbers: 2, tables_needing_review: 3 })).toBe(5);
    expect(pagesNeedingReview({ tables_needing_review: 1 })).toBe(1);
  });
  it('never reports an unfinished audit with no findings as zero', () => {
    expect(findingsSummary({ status: 'passed', findings: [] })).toBe('0');
    expect(findingsSummary({ status: 'audit_error', findings: [] })).toBe('—');
    expect(findingsSummary({ status: 'failed', findings: null })).toBe('—');
    expect(findingsSummary({ status: 'needs_review', findings: [
      { severity: 'warn', code: 'a', message: 'm', count: 1, examples: [] },
      { severity: 'info', code: 'b', message: 'm', count: 1, examples: [] },
    ] })).toBe('1 (+1 info)');
  });
  it('renders examples as text, not JSON', () => {
    expect(exampleText({ page: 4, code: 'A1' })).toBe('page: 4, code: A1');
    expect(exampleText('x')).toBe('x');
    const line = examplesLine({ severity: 'warn', code: 'c', message: 'm', count: 10, examples: ['a', 'b', 'c', 'd'] });
    expect(line).toBe('a; b; c; and 7 more');
    expect(line).not.toContain('{');
  });
});
