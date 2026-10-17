// Shared SSRF guard for edge functions that fetch a user-supplied URL server-side.
// Mirrors the Python app/utils/ssrf_guard.py contract. IPv6 literals are parsed in full because
// WHATWG URL rewrites [::ffff:127.0.0.1] to [::ffff:7f00:1], which no dotted-form check matches.

export class SSRFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SSRFError';
  }
}

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const p = parts.map((n) => (/^\d{1,3}$/.test(n) ? parseInt(n, 10) : NaN));
  return p.some((n) => Number.isNaN(n) || n > 255) ? null : p;
}

function v4OctetsBlocked(p: number[]): boolean {
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127) return true;      // this-net, 10/8, loopback
  if (a === 169 && b === 254) return true;                // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;       // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;      // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF protocol + TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true;   // benchmarking 198.18.0.0/15
  if (a === 198 && b === 51 && c === 100) return true;    // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true;     // TEST-NET-3
  if (a >= 224) return true;                              // multicast + reserved + broadcast
  return false;
}

export function ipv4IsBlocked(ip: string): boolean {
  const p = parseIpv4(ip);
  return p ? v4OctetsBlocked(p) : true; // malformed → block
}

/** Eight 16-bit groups, or null when `ip` is not a valid IPv6 literal (embedded dotted v4 allowed). */
export function parseIpv6(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (s.includes('%')) return null; // zone ids are never a public destination
  let tail: number[] = [];
  const lastColon = s.lastIndexOf(':');
  if (s.slice(lastColon + 1).includes('.')) {
    const v4 = parseIpv4(s.slice(lastColon + 1));
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    const prefix = s.slice(0, lastColon + 1);
    s = prefix.endsWith('::') ? prefix : prefix.slice(0, -1);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const toGroups = (part: string): number[] | null => {
    if (part === '') return [];
    const gs = part.split(':');
    if (gs.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
    return gs.map((g) => parseInt(g, 16));
  };
  const head = toGroups(halves[0]);
  const rest = halves.length === 2 ? toGroups(halves[1]) : [];
  if (!head || !rest) return null;
  const explicit = head.length + rest.length + tail.length;
  if (halves.length === 1) {
    return explicit === 8 ? [...head, ...tail] : null;
  }
  if (explicit > 7) return null;
  return [...head, ...new Array(8 - explicit).fill(0), ...rest, ...tail];
}

function v4FromGroups(hi: number, lo: number): number[] {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
}

export function ipv6IsBlocked(ip: string): boolean {
  const g = parseIpv6(ip);
  if (!g) return true; // unparseable → block
  const zeroUpTo = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeroUpTo(8)) return true;                                    // ::
  if (zeroUpTo(7) && g[7] === 1) return true;                      // ::1
  if (zeroUpTo(5) && g[5] === 0xffff) return v4OctetsBlocked(v4FromGroups(g[6], g[7])); // ::ffff:a.b.c.d
  if (zeroUpTo(4) && g[4] === 0xffff && g[5] === 0) return v4OctetsBlocked(v4FromGroups(g[6], g[7])); // ::ffff:0:a.b.c.d
  if (zeroUpTo(6)) return v4OctetsBlocked(v4FromGroups(g[6], g[7])); // IPv4-compatible ::a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) {
    if (g[2] === 1) return true;                                   // 64:ff9b:1::/48 local NAT64
    if (g.slice(2, 6).every((x) => x === 0)) return v4OctetsBlocked(v4FromGroups(g[6], g[7]));
  }
  if (g[0] === 0x2002) return v4OctetsBlocked(v4FromGroups(g[1], g[2])); // 6to4
  if (g[0] === 0x2001 && g[1] === 0) {                             // Teredo: client v4 is inverted
    return v4OctetsBlocked(v4FromGroups(g[6] ^ 0xffff, g[7] ^ 0xffff))
      || v4OctetsBlocked(v4FromGroups(g[2], g[3]));
  }
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;             // documentation
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // discard 100::/64
  if ((g[0] & 0xffc0) === 0xfe80) return true;                     // link-local fe80::/10
  if ((g[0] & 0xffc0) === 0xfec0) return true;                     // site-local fec0::/10
  if ((g[0] & 0xfe00) === 0xfc00) return true;                     // unique-local fc00::/7
  if ((g[0] & 0xff00) === 0xff00) return true;                     // multicast
  if (zeroUpTo(1)) return true;                                    // rest of ::/16 is reserved
  return false;
}

function isIpLiteral(host: string): 'v4' | 'v6' | null {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return 'v4';
  if (host.includes(':')) return 'v6';
  return null;
}

const BLOCKED_HOST_RE =
  /(^|\.)(localhost|internal|local|metadata\.google\.internal|metadata|instance-data)$/i;

/** Throws SSRFError if `rawUrl` is unsafe to fetch server-side. Async because it
 *  resolves DNS. Returns the normalized URL string on success. */
export async function assertSafeUrl(
  rawUrl: string,
  opts: { allowSchemes?: string[] } = {},
): Promise<string> {
  const allow = opts.allowSchemes ?? ['http:', 'https:'];
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new SSRFError('Malformed URL');
  }
  if (!allow.includes(u.protocol)) {
    throw new SSRFError(`Scheme not allowed: ${u.protocol}`);
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host) throw new SSRFError('Empty host');

  const literal = isIpLiteral(host);
  if (literal === 'v4' && ipv4IsBlocked(host)) throw new SSRFError('Blocked IP range');
  if (literal === 'v6' && ipv6IsBlocked(host)) throw new SSRFError('Blocked IPv6 range');
  if (!literal && BLOCKED_HOST_RE.test(host)) throw new SSRFError('Blocked internal host');

  if (!literal) {
    // Resolve and block if any address is private (DNS-rebinding defense).
    const addrs: string[] = [];
    for (const rec of ['A', 'AAAA'] as const) {
      try {
        addrs.push(...(await Deno.resolveDns(host, rec)));
      } catch {
        // record type may not exist / resolver unavailable — ignore per-type
      }
    }
    for (const ip of addrs) {
      const blocked = ip.includes(':') ? ipv6IsBlocked(ip) : ipv4IsBlocked(ip);
      if (blocked) throw new SSRFError('Host resolves to a blocked address');
    }
  }
  return u.toString();
}
