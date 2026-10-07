import { describe, expect, it } from 'vitest';
import { escapeHtml } from '@/utils/escapeHtml';
import { normalizeSignatureCard, renderSignatureHtml, renderSignatureText } from '@/utils/emailSignature';

const card = {
  name: 'Basilis Kanonidis', title: 'CEO', company: 'Materials Hub', phone: '+30 694 840 8542',
  email: 'find@materialshub.gr', website: 'materialshub.gr', address: 'Thessaloniki, Greece',
  tagline: '', logo_url: 'https://app.materialshub.gr/mh-logo.png', confidentiality: false,
};

describe('email signature', () => {
  it('is null without a name and drops keys it does not know', () => {
    expect(normalizeSignatureCard({ title: 'CEO' })).toBeNull();
    expect(normalizeSignatureCard({ ...card, role: 'admin' })).not.toHaveProperty('role');
  });

  it('refuses a non-https logo and a malformed email', () => {
    const n = normalizeSignatureCard({ ...card, logo_url: 'javascript:alert(1)', email: 'not an email' });
    expect(n?.logo_url).toBe('');
    expect(n?.email).toBe('');
  });

  it('escapes every value into the HTML', () => {
    const n = normalizeSignatureCard({ ...card, name: '<script>x</script>', address: '"><img src=x onerror=1>' })!;
    const html = renderSignatureHtml(n, escapeHtml);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('href="tel:+306948408542"');
    expect(html).toContain('href="https://materialshub.gr"');
  });

  it('renders the same facts as plain text', () => {
    const text = renderSignatureText(normalizeSignatureCard(card)!);
    expect(text.split('\n')).toEqual([
      'Basilis Kanonidis', 'CEO, Materials Hub', 'M +30 694 840 8542', 'E find@materialshub.gr', 'W materialshub.gr', 'A Thessaloniki, Greece',
    ]);
  });
});
