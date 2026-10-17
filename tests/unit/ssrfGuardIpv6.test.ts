import { describe, it, expect } from 'vitest';
import {
  assertSafeUrl,
  ipv4IsBlocked,
  ipv6IsBlocked,
  parseIpv6,
} from '../../supabase/functions/_shared/ssrf-guard.ts';

describe('ssrf-guard IPv6 parsing', () => {
  it('expands compressed and embedded-v4 forms to eight groups', () => {
    expect(parseIpv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6('::ffff:127.0.0.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(parseIpv6('::ffff:7f00:1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(parseIpv6('::127.0.0.1')).toEqual([0, 0, 0, 0, 0, 0, 0x7f00, 1]);
    expect(parseIpv6('1:2:3:4:5:6:7:8')).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(parseIpv6('2001:db8::1:2.3.4.5')).toEqual([0x2001, 0xdb8, 0, 0, 0, 1, 0x0203, 0x0405]);
  });

  it('rejects malformed literals', () => {
    for (const bad of ['1::2::3', '1:2:3:4:5:6:7:8:9', 'gggg::1', '::1.2.3', 'fe80::1%eth0', '1:2:3:4:5:6:7']) {
      expect(parseIpv6(bad)).toBeNull();
    }
  });
});

describe('ssrf-guard blocks internal destinations however they are spelled', () => {
  const blocked = [
    '::', '::1', '[::1]',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '::ffff:169.254.169.254',
    '::ffff:a00:1', '::ffff:0:7f00:1',
    '::7f00:1', '::127.0.0.1', '::a9fe:a9fe',
    '64:ff9b::7f00:1', '64:ff9b::a9fe:a9fe', '64:ff9b:1::1',
    '2002:7f00:1::', '2002:a9fe:a9fe::1',
    '2001:0:4136:e378:8000:63bf:80ff:fffe',
    'fe80::1', 'febf::1', 'fec0::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '2001:db8::1', '100::1',
    '0:0:0:0:0:ffff:7f00:0001',
  ];
  it.each(blocked)('%s', (ip) => {
    expect(ipv6IsBlocked(ip)).toBe(true);
  });

  it('allows public IPv6, including public mapped v4', () => {
    expect(ipv6IsBlocked('2606:4700:4700::1111')).toBe(false);
    expect(ipv6IsBlocked('2a00:1450:4001:80e::200e')).toBe(false);
    expect(ipv6IsBlocked('::ffff:8.8.8.8')).toBe(false);
    expect(ipv6IsBlocked('64:ff9b::808:808')).toBe(false);
  });

  it('IPv4 ranges', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '198.18.0.1', '255.255.255.255']) {
      expect(ipv4IsBlocked(ip)).toBe(true);
    }
    expect(ipv4IsBlocked('8.8.8.8')).toBe(false);
    expect(ipv4IsBlocked('1.2.3')).toBe(true);
  });

  it('assertSafeUrl refuses the WHATWG-normalised mapped literal', async () => {
    expect(new URL('http://[::ffff:127.0.0.1]/').hostname).toBe('[::ffff:7f00:1]');
    await expect(assertSafeUrl('http://[::ffff:127.0.0.1]/')).rejects.toThrow(/Blocked/);
    await expect(assertSafeUrl('http://[::ffff:169.254.169.254]/latest/meta-data')).rejects.toThrow(/Blocked/);
    await expect(assertSafeUrl('http://[::7f00:1]/')).rejects.toThrow(/Blocked/);
    await expect(assertSafeUrl('http://0x7f.1/')).rejects.toThrow(/Blocked/);
  });

  it('blocks the IETF protocol and benchmarking v4 ranges', () => {
    for (const ip of ['192.0.0.1', '192.0.0.255', '198.19.255.255']) {
      expect(ipv4IsBlocked(ip)).toBe(true);
    }
  });
});

describe('ssrf-guard DNS resolution', () => {
  const g = globalThis as unknown as { Deno?: unknown };
  const withResolver = async (resolveDns: (h: string, t: string) => Promise<string[]>, fn: () => Promise<void>) => {
    const prev = g.Deno;
    g.Deno = { resolveDns };
    try { await fn(); } finally { g.Deno = prev; }
  };

  it('fails closed when no record resolves', async () => {
    await withResolver(() => Promise.reject(new Error('resolver down')), async () => {
      await expect(assertSafeUrl('https://example.com/')).rejects.toThrow(/did not resolve/);
    });
  });

  it('refuses a name that resolves to a blocked address', async () => {
    await withResolver((_h, t) => Promise.resolve(t === 'A' ? ['93.184.216.34'] : ['::ffff:a9fe:a9fe']), async () => {
      await expect(assertSafeUrl('https://example.com/')).rejects.toThrow(/blocked address/);
    });
  });

  it('allows a name that resolves only to public addresses', async () => {
    await withResolver((_h, t) => Promise.resolve(t === 'A' ? ['93.184.216.34'] : []), async () => {
      await expect(assertSafeUrl('https://example.com/')).resolves.toBe('https://example.com/');
    });
  });
});
