// Shared SSRF guard for edge functions that fetch a user-supplied URL server-side
// (pentest #250 C23/C24). Mirrors the Python app/utils/ssrf_guard.py contract.
//
// A user-controlled URL fetched by OUR runtime can be pointed at cloud metadata
// (169.254.169.254), loopback, or RFC1918 internal services. This guard:
//   1. requires an http/https scheme,
//   2. blocks IP-literal hosts in private/loopback/link-local/reserved ranges,
//   3. blocks known-internal hostnames (localhost, *.internal, metadata hosts),
//   4. resolves the hostname (A/AAAA) and blocks if ANY resolved address is
//      private — closing DNS-rebinding-to-internal.
//
// Callers MUST additionally pass `redirect: "error"` (or "manual") to fetch(),
// because a public URL can 302 to a blocked address AFTER this check. Re-guard
// each hop if you follow redirects yourself.

export class SSRFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SSRFError';
  }
}

function ipv4IsBlocked(ip: string): boolean {
  const p = ip.split('.').map((n) => parseInt(n, 10));
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // malformed → block
  const [a, b] = p;
  if (a === 10) return true;                              // 10.0.0.0/8
  if (a === 127) return true;                             // loopback
  if (a === 0) return true;                               // "this" network
  if (a === 169 && b === 254) return true;                // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;       // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;      // CGNAT 100.64.0.0/10
  if (a >= 224) return true;                              // multicast + reserved
  return false;
}

function ipv6IsBlocked(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (s === '::1' || s === '::') return true;             // loopback / unspecified
  if (s.startsWith('fe80')) return true;                  // link-local
  if (s.startsWith('fc') || s.startsWith('fd')) return true; // unique-local fc00::/7
  // IPv4-mapped ::ffff:a.b.c.d — extract and check as v4
  const mapped = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsBlocked(mapped[1]);
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
