/**
 * Comparing two B2B research runs (issue #394).
 *
 * WHY THIS IS NOT THE VISION CONSENSUS
 * ------------------------------------
 * For vision, two readers looking at one image should say the same thing, so
 * DISAGREEMENT is the defect signal and the writer's answer is authoritative.
 *
 * Research is the opposite shape. There is no single right answer to "ceramic tile
 * manufacturers in Poland" — there is a long tail, and two searches will legitimately
 * surface different slices of it. A challenger that finds three companies the
 * incumbent missed has done something USEFUL, not something wrong.
 *
 * So agreement is the wrong metric entirely. What matters is:
 *
 *   COVERAGE      — how many real companies did each surface, and how much of the
 *                   union did each contribute?
 *   VERIFIABILITY — of what it surfaced, how much can be checked?
 *
 * The second is what stops coverage becoming a hallucination contest. A model that
 * invents ten plausible Polish furniture companies "wins" on coverage and is worse
 * than useless, because the failure only shows up when somebody emails a domain that
 * does not exist. Verifiability is the objective half — a domain either resolves or
 * it does not, no judgement involved — and it is the research equivalent of scoring
 * `detected_text` on exact matches rather than on how good the prose sounded.
 *
 * Nothing here decides a winner. It records what each run produced so a human can
 * look at a real comparison instead of a vendor benchmark.
 */

export interface ManufacturerRecord {
  company_name: string;
  website?: string | null;
  domain?: string | null;
  city?: string | null;
  country?: string;
  products?: string[];
  is_manufacturer?: boolean;
  employee_estimate?: string | null;
  contact_email?: string | null;
  source_urls?: string[];
}

export interface SideStats {
  /** Rows returned. */
  count: number;
  /** Rows carrying a domain at all — a row without one cannot be verified or contacted. */
  with_domain: number;
  /** Rows whose domain actually resolved over DNS/HTTPS. The objective half. */
  domain_resolves: number;
  /** Rows citing at least one source URL. */
  with_sources: number;
  /** Rows the model itself marked as a real manufacturer rather than a reseller. */
  claimed_manufacturer: number;
  /** Domains present here and in no other side. */
  unique_domains: string[];
}

export interface ResearchComparison {
  incumbent: SideStats;
  challenger: SideStats;
  /** Domains both sides surfaced — corroborated, and the strongest rows in the run. */
  overlap_domains: string[];
  /** Union size. The ceiling a single provider could have reached. */
  union_domains: number;
  /**
   * Set when one side did not run. Present so an absent challenger can never be
   * read as a challenger that found nothing.
   */
  challenger_ran: boolean;
  notes: string[];
}

/** Bare, lowercased, no scheme/www/path. Two spellings of one company are one row. */
export function normaliseDomain(raw?: string | null): string | null {
  if (!raw) return null;
  let d = String(raw).trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '');
  d = d.split('/')[0].split('?')[0].split('#')[0];
  d = d.replace(/\.$/, '');
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

/**
 * Does this domain actually exist?
 *
 * HEAD, short timeout, redirects followed — we are asking "is there a site here",
 * not reading it. Anything that answers at all counts, including a 403 or a 500: the
 * question is whether the company's web presence is real, and a server that refuses
 * us is still a server. Only a DNS failure or a timeout is a no.
 *
 * Deliberately NOT routed through the SSRF guard: these are model-proposed hostnames,
 * so the guard is exactly right in principle — but it resolves and rejects private
 * ranges, which is what we want, so we use it. See the caller.
 */
export async function domainResolves(
  domain: string,
  opts: { timeoutMs?: number } = {},
): Promise<boolean> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 6000);
  try {
    const res = await fetch(`https://${domain}`, {
      method: 'HEAD',
      redirect: 'follow',
      signal: ctl.signal,
    });
    // Any HTTP answer proves the host exists. Only a throw means it does not.
    return res.status > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function sideStats(
  rows: ManufacturerRecord[],
  verify: (d: string) => Promise<boolean>,
): Promise<Omit<SideStats, 'unique_domains'> & { domains: Set<string> }> {
  const domains = new Set<string>();
  let withDomain = 0;
  let withSources = 0;
  let claimed = 0;

  for (const r of rows) {
    const d = normaliseDomain(r.domain ?? r.website);
    if (d) {
      withDomain++;
      domains.add(d);
    }
    if ((r.source_urls?.length ?? 0) > 0) withSources++;
    if (r.is_manufacturer) claimed++;
  }

  // Verified concurrently — a serial sweep of 8 domains at a 6s timeout can exceed
  // the tool budget on its own.
  const verdicts = await Promise.all([...domains].map((d) => verify(d)));
  const resolves = verdicts.filter(Boolean).length;

  return {
    count: rows.length,
    with_domain: withDomain,
    domain_resolves: resolves,
    with_sources: withSources,
    claimed_manufacturer: claimed,
    domains,
  };
}

export async function compareResearchRuns(
  incumbentRows: ManufacturerRecord[],
  challengerRows: ManufacturerRecord[],
  opts: {
    challengerRan: boolean;
    verify?: (d: string) => Promise<boolean>;
  },
): Promise<ResearchComparison> {
  const verify = opts.verify ?? ((d: string) => domainResolves(d));

  const inc = await sideStats(incumbentRows, verify);
  const cha = opts.challengerRan
    ? await sideStats(challengerRows, verify)
    : { count: 0, with_domain: 0, domain_resolves: 0, with_sources: 0, claimed_manufacturer: 0, domains: new Set<string>() };

  const overlap = [...inc.domains].filter((d) => cha.domains.has(d)).sort();
  const onlyInc = [...inc.domains].filter((d) => !cha.domains.has(d)).sort();
  const onlyCha = [...cha.domains].filter((d) => !inc.domains.has(d)).sort();

  const notes: string[] = [];
  if (!opts.challengerRan) {
    notes.push(
      'The challenger did not run, so this is a single-provider record and not a comparison. '
      + 'Nothing here says anything about the challenger.',
    );
  } else {
    if (inc.with_domain && inc.domain_resolves < inc.with_domain) {
      notes.push(
        `Incumbent: ${inc.with_domain - inc.domain_resolves} of ${inc.with_domain} domains did not resolve.`,
      );
    }
    if (cha.with_domain && cha.domain_resolves < cha.with_domain) {
      notes.push(
        `Challenger: ${cha.with_domain - cha.domain_resolves} of ${cha.with_domain} domains did not resolve.`,
      );
    }
    if (!overlap.length && inc.domains.size && cha.domains.size) {
      notes.push(
        'Zero overlap. Either the long tail is genuinely wide, or one side is inventing — '
        + 'check the resolve counts before reading this as complementary coverage.',
      );
    }
  }

  return {
    incumbent: { ...stripDomains(inc), unique_domains: onlyInc },
    challenger: { ...stripDomains(cha), unique_domains: onlyCha },
    overlap_domains: overlap,
    union_domains: new Set([...inc.domains, ...cha.domains]).size,
    challenger_ran: opts.challengerRan,
    notes,
  };
}

function stripDomains<T extends { domains: Set<string> }>(s: T): Omit<T, 'domains'> {
  const { domains: _drop, ...rest } = s;
  return rest;
}

// ── General web research: compare the SOURCES, not the prose ────────────────
//
// The B2B lane above compares structured company records, and it works because a
// domain either resolves or it does not — an objective check with no judgement in it.
//
// General research returns PROSE plus citations, and two paragraphs cannot be
// compared objectively. Scoring them needs an LLM judge, which is the subjective
// thing this whole approach exists to avoid: a judge that prefers the better-written
// answer tells you which model writes well, not which one found more.
//
// So the prose is NOT scored. What is scored is the evidence underneath it — which
// sources each provider actually surfaced, how many resolve, and where they overlap.
// That is weaker than the B2B case and the weakness is worth stating plainly: a
// source existing does not prove the claim it was cited for. It does prove the model
// did not invent the citation, which is the failure that matters most here.

export interface SourceSideStats {
  /** Distinct source URLs cited. */
  cited: number;
  /** Distinct hosts behind them — five pages from one site is one perspective. */
  distinct_hosts: number;
  /** Hosts that actually resolved. */
  hosts_resolve: number;
  /** Hosts this side cited and the other did not. */
  unique_hosts: string[];
}

export interface SourceComparison {
  incumbent: SourceSideStats;
  challenger: SourceSideStats;
  /** Hosts both cited — corroboration, the strongest evidence in the run. */
  overlap_hosts: string[];
  union_hosts: number;
  challenger_ran: boolean;
  notes: string[];
}

function hostsOf(urls: string[]): { hosts: Set<string>; cited: number } {
  const hosts = new Set<string>();
  const seenUrls = new Set<string>();
  for (const u of urls) {
    if (!u) continue;
    seenUrls.add(u);
    const h = normaliseDomain(u);
    if (h) hosts.add(h);
  }
  return { hosts, cited: seenUrls.size };
}

export async function compareResearchSources(
  incumbentUrls: string[],
  challengerUrls: string[],
  opts: { challengerRan: boolean; verify?: (d: string) => Promise<boolean> },
): Promise<SourceComparison> {
  const verify = opts.verify ?? ((d: string) => domainResolves(d));

  const inc = hostsOf(incumbentUrls);
  const cha = opts.challengerRan ? hostsOf(challengerUrls) : { hosts: new Set<string>(), cited: 0 };

  const [incVerdicts, chaVerdicts] = await Promise.all([
    Promise.all([...inc.hosts].map(verify)),
    Promise.all([...cha.hosts].map(verify)),
  ]);

  const overlap = [...inc.hosts].filter((h) => cha.hosts.has(h)).sort();
  const notes: string[] = [];

  if (!opts.challengerRan) {
    notes.push(
      'The challenger did not run, so this is a single-provider record and not a comparison.',
    );
  } else {
    const incDead = inc.hosts.size - incVerdicts.filter(Boolean).length;
    const chaDead = cha.hosts.size - chaVerdicts.filter(Boolean).length;
    if (incDead) notes.push(`Incumbent cited ${incDead} host(s) that did not resolve.`);
    if (chaDead) notes.push(`Challenger cited ${chaDead} host(s) that did not resolve.`);
    if (!overlap.length && inc.hosts.size && cha.hosts.size) {
      notes.push(
        'The two providers cited entirely different sources. That is either genuinely '
        + 'complementary coverage or a sign they answered different questions — read both '
        + 'answers before treating it as breadth.',
      );
    }
    notes.push(
      'Sources are compared, not the answers. A resolving source proves the citation is '
      + 'real, not that the claim it supports is correct.',
    );
  }

  return {
    incumbent: {
      cited: inc.cited,
      distinct_hosts: inc.hosts.size,
      hosts_resolve: incVerdicts.filter(Boolean).length,
      unique_hosts: [...inc.hosts].filter((h) => !cha.hosts.has(h)).sort(),
    },
    challenger: {
      cited: cha.cited,
      distinct_hosts: cha.hosts.size,
      hosts_resolve: chaVerdicts.filter(Boolean).length,
      unique_hosts: [...cha.hosts].filter((h) => !inc.hosts.has(h)).sort(),
    },
    overlap_hosts: overlap,
    union_hosts: new Set([...inc.hosts, ...cha.hosts]).size,
    challenger_ran: opts.challengerRan,
    notes,
  };
}
