/** Turning platform lookups into a presence plan (#487 C3). Import-free so the unit tests load it directly. */

export type PresencePlatform = 'youtube' | 'reddit' | 'pinterest' | 'trustpilot';
export type PresenceStatus = 'present' | 'absent' | 'collector_failed';

export interface PlatformCall { keyword: string; ok: boolean; error?: string; items: unknown[] }
export interface PresenceAction { text: string; url?: string; keyword?: string }
export interface PlatformVerdict {
  platform: PresencePlatform;
  status: PresenceStatus;
  /** Why the status is what it is, in one sentence. */
  note: string;
  matches: number;
  actions: PresenceAction[];
  errors: string[];
}

/** Who we are: the bare domain, matched against URLs, and the brand name, matched as a word in titles. */
export interface Identity { domain: string; brand: string | null }

/** The Google query that finds a platform's pages for a keyword: what ranks there is also what assistants cite. */
export const PLATFORM_SITE: Record<Exclude<PresencePlatform, 'youtube'>, string> = {
  reddit: 'reddit.com', pinterest: 'pinterest.com', trustpilot: 'trustpilot.com',
};

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
export const itemTitle = (it: any): string | null => str(it?.title) ?? str(it?.name) ?? null;
export const itemUrl = (it: any): string | null => str(it?.url) ?? str(it?.link) ?? null;

/** Only results on the platform itself: a Google `site:` query still returns ads, PAA and other blocks. */
export function onPlatform(items: unknown[], platform: PresencePlatform): unknown[] {
  if (platform === 'youtube') return items.filter((it: any) => !it?.type || /video/.test(String(it.type)));
  const host = PLATFORM_SITE[platform];
  return items.filter((it: any) => (it?.type ?? 'organic') === 'organic' && (itemUrl(it) ?? '').toLowerCase().includes(host));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Ours when a URL field carries our domain, or a title/channel names the brand as a whole word. */
export function isOurs(item: unknown, who: Identity): boolean {
  const it = (item ?? {}) as any;
  const urls = [itemUrl(it), str(it.domain), str(it.channel?.url), str(it.description)].filter(Boolean).join(' ').toLowerCase();
  if (who.domain && urls.includes(who.domain.toLowerCase())) return true;
  if (!who.brand || who.brand.length < 4) return false;
  const names = [itemTitle(it), str(it.channel?.title), str(it.channel_name)].filter(Boolean).join(' ');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(who.brand)}([^\\p{L}\\p{N}]|$)`, 'iu').test(names);
}

/** A Google rating block is `{value, votes_count}`; never render the object itself. */
export function ratingOf(it: any): { value: number | null; votes: number | null } {
  const r = it?.rating;
  const value = typeof r === 'number' ? r : Number.isFinite(Number(r?.value)) ? Number(r.value) : null;
  const votes = Number.isFinite(Number(r?.votes_count)) ? Number(r.votes_count) : Number.isFinite(Number(it?.reviews_count)) ? Number(it.reviews_count) : null;
  return { value, votes };
}

const LABEL: Record<PresencePlatform, string> = { youtube: 'YouTube', reddit: 'Reddit', pinterest: 'Pinterest', trustpilot: 'Trustpilot' };

export function judgePlatform(platform: PresencePlatform, calls: PlatformCall[], who: Identity): PlatformVerdict {
  const answered = calls.filter((c) => c.ok).map((c) => ({ ...c, items: onPlatform(c.items, platform) }));
  const errors = calls.filter((c) => !c.ok).map((c) => `${c.keyword}: ${c.error ?? 'failed'}`);
  if (!answered.length) {
    return { platform, status: 'collector_failed', note: `${LABEL[platform]} could not be searched, so presence there is unknown.`, matches: 0, actions: [], errors };
  }
  const actions: PresenceAction[] = [];

  if (platform === 'trustpilot') {
    const listing = answered.flatMap((c) => c.items).find((it) => isOurs(it, who) || (itemUrl(it) ?? '').toLowerCase().includes(`/review/${who.domain.toLowerCase()}`)) as any;
    if (listing) {
      const { value, votes } = ratingOf(listing);
      if (votes != null && votes < 20) actions.push({ text: `Only ${votes} reviews on Trustpilot: ask recent customers for one after delivery.`, url: itemUrl(listing) ?? undefined });
      return {
        platform, status: 'present', matches: 1, errors, actions,
        note: `Listed${value != null ? `, rated ${value}` : ''}${votes != null ? ` from ${votes} reviews` : ''}.`,
      };
    }
    actions.push({ text: 'No Trustpilot page for the brand shows in Google: claim the profile and invite customers to review.' });
    return { platform, status: 'absent', matches: 0, errors, actions, note: 'No listing for the brand or the domain ranks in Google.' };
  }

  let ours = 0;
  for (const c of answered) {
    const theirs = c.items.filter((it) => !isOurs(it, who));
    const ourHere = c.items.length - theirs.length;
    ours += ourHere;
    if (platform === 'reddit') {
      for (const it of theirs.slice(0, 3)) {
        const t = itemTitle(it);
        if (t) actions.push({ text: `Answer the thread "${t}" with a useful, non-promotional reply.`, url: itemUrl(it) ?? undefined, keyword: c.keyword });
      }
    } else if (ourHere === 0 && c.items.length) {
      const top = theirs.slice(0, 2).map(itemTitle).filter(Boolean).join('; ');
      actions.push({
        keyword: c.keyword,
        text: platform === 'youtube'
          ? `Publish a video for "${c.keyword}". Ranking now: ${top || 'other channels'}.`
          : `Pin product photos for "${c.keyword}" that link to the matching page on the site.`,
      });
    }
  }
  const q = `${answered.length} quer${answered.length === 1 ? 'y' : 'ies'}`;
  const note = ours
    ? `Found ${ours} result${ours === 1 ? '' : 's'} of yours across ${q}.`
    : `Nothing of yours in the top results for ${q}.`;
  return { platform, status: ours ? 'present' : 'absent', note, matches: ours, actions: actions.slice(0, 8), errors };
}
