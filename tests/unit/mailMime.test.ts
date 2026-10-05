import { describe, it, expect } from 'vitest';
import {
  base64UrlToBytes, buildMimeMessage, encodeHeaderWord, headerSafe, parseAddress, parseGmailPayload, utf8ToBase64,
} from '../../supabase/functions/_shared/mail-mime';

const b64url = (s: string) => utf8ToBase64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('outgoing mail', () => {
  it('cannot be given an extra header through any field', () => {
    const raw = buildMimeMessage({ from: 'a@x.gr', to: ['b@y.gr\r\nBcc: spy@evil.io'], subject: 'Hi\r\nBcc: spy@evil.io', text: 'x' });
    expect(raw.split('\r\n').filter((l) => /^Bcc:/i.test(l))).toEqual([]);
    expect(headerSafe('a\nb')).toBe('a b');
  });

  it('encodes a Greek subject and keeps the body intact', () => {
    expect(encodeHeaderWord('Προσφορά πλακιδίων')).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
    const raw = buildMimeMessage({ from: 'a@x.gr', to: ['b@y.gr'], subject: 'Προσφορά', text: 'Καλημέρα' });
    const body = raw.split('\r\n\r\n')[1].replace(/\r\n/g, '');
    expect(new TextDecoder().decode(base64UrlToBytes(body))).toBe('Καλημέρα');
  });

  it('threads a reply and carries text, HTML and files', () => {
    const raw = buildMimeMessage({
      from: 'a@x.gr', to: ['b@y.gr'], cc: ['c@y.gr'], subject: 'Re: Quote', text: 'hi', html: '<p>hi</p>',
      inReplyTo: '<m1@y.gr>', references: '<m0@y.gr> <m1@y.gr>',
      attachments: [{ filename: 'spec.pdf', contentType: 'application/pdf', base64: 'JVBERi0=' }],
    });
    expect(raw).toContain('In-Reply-To: <m1@y.gr>');
    expect(raw).toContain('Cc: c@y.gr');
    expect(raw).toContain('multipart/mixed');
    expect(raw).toContain('multipart/alternative');
    expect(raw).toContain('filename="spec.pdf"');
  });
});

describe('Gmail payloads', () => {
  it('finds the text, the HTML and the attachments in a nested message', () => {
    const parsed = parseGmailPayload({
      mimeType: 'multipart/mixed',
      headers: [{ name: 'Subject', value: 'Order' }, { name: 'From', value: 'Maria <Maria@Keros.com>' }],
      parts: [
        { mimeType: 'multipart/alternative', parts: [
          { mimeType: 'text/plain', body: { data: b64url('Γεια σας') } },
          { mimeType: 'text/html', body: { data: b64url('<p>Γεια σας</p>') } },
        ] },
        { mimeType: 'application/pdf', filename: 'invoice.pdf', body: { attachmentId: 'att1', size: 1234 } },
      ],
    });
    expect(parsed.headers.subject).toBe('Order');
    expect(parsed.text).toBe('Γεια σας');
    expect(parsed.html).toBe('<p>Γεια σας</p>');
    expect(parsed.attachments).toEqual([{ attachmentId: 'att1', filename: 'invoice.pdf', mimeType: 'application/pdf', size: 1234 }]);
  });

  it('decodes a Greek legacy charset', () => {
    const bytes = new Uint8Array([0xc3, 0xe5, 0xe9, 0xe1]);
    const data = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const parsed = parseGmailPayload({ mimeType: 'text/plain', headers: [{ name: 'Content-Type', value: 'text/plain; charset="iso-8859-7"' }], body: { data } });
    expect(parsed.text).toBe('Γεια');
  });

  it('reads an address with or without a name', () => {
    expect(parseAddress('"Maria K" <Maria@Keros.com>')).toEqual({ name: 'Maria K', address: 'maria@keros.com' });
    expect(parseAddress('info@niveco.gr')).toEqual({ name: null, address: 'info@niveco.gr' });
  });
});

describe('address lists', () => {
  it('keeps a comma inside a quoted name', async () => {
    const { parseAddressList } = await import('../../supabase/functions/_shared/mail-mime');
    expect(parseAddressList('"Doe, John" <John@X.gr>, maria@keros.com')).toEqual([
      { name: 'Doe, John', address: 'john@x.gr' },
      { name: null, address: 'maria@keros.com' },
    ]);
  });
});
