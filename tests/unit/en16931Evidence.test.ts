import { describe, expect, it } from 'vitest';
import { en16931Evidence } from '@/modules/finance/utils/en16931Evidence';

const fetched = { source_format: 'en16931_ubl', delivery_channel: 'provider_link' };

describe('en16931Evidence', () => {
  it('says nothing for a document with no structured file', () => {
    expect(en16931Evidence({ source_format: null })).toBeNull();
    expect(en16931Evidence(null)).toBeNull();
  });

  it('reports agreement, and still says a fetched file is not a delivered one', () => {
    const e = en16931Evidence({ ...fetched, raw: { en16931_check: { verdict: 'agrees', differences: [] } } })!;
    expect(e.tone).toBe('success');
    expect(e.detail).toContain('does not count as a structured document delivered');
  });

  it('names what differs', () => {
    const e = en16931Evidence({ ...fetched, raw: { en16931_check: { verdict: 'differs', differences: ['gross total', 'MARK'] } } })!;
    expect(e.tone).toBe('warning');
    expect(e.detail).toContain('gross total, MARK');
  });

  it('does not claim agreement for a file that was never checked', () => {
    expect(en16931Evidence({ ...fetched, raw: {} })!.tone).toBe('neutral');
  });

  it('does not call a delivered document a fetched one', () => {
    const e = en16931Evidence({ source_format: 'en16931_ubl', delivery_channel: 'peppol', raw: { en16931_check: { verdict: 'agrees' } } })!;
    expect(e.detail).toContain('Delivered as a structured');
    expect(e.detail).not.toContain('fetched');
  });
});
