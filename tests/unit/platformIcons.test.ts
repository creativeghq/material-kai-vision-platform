/**
 * The social networks are labelled with their OWN marks, from one registry.
 *
 * Profile → Social Accounts shipped with a camera for Instagram, two silhouettes for Facebook, a
 * briefcase for LinkedIn and a musical note for TikTok — emoji, not marks, rendering differently on
 * every OS. The map was copy-pasted into three components, so "fix the icons" meant fixing them in
 * three places and the fourth surface got whatever its author felt like.
 *
 * These cases pin both halves: the registry is complete for every platform the connect flow offers,
 * and no surface goes back to keeping its own idea of what a network looks like.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { PLATFORM_BRANDS, SOCIAL_PLATFORMS, platformLabel } from '../../src/components/core/icons/PlatformIcon';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const rel = (p: string) => relative(ROOT, p).split('\\').join('/');

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Every network Zernio can hand back on `social_accounts.platform`. */
const CONNECTABLE = [
  'instagram', 'facebook', 'linkedin', 'tiktok', 'pinterest', 'youtube', 'twitter', 'threads',
];

describe('platform icons — the registry covers every network we offer', () => {
  it('every connectable network has a real mark', () => {
    for (const id of CONNECTABLE) {
      const brand = PLATFORM_BRANDS[id];
      expect(brand, `no brand registered for '${id}'`).toBeTruthy();
      // A path that does not start with a move-to is not path data.
      expect(brand.path.startsWith('M'), `${id} has no usable path data`).toBe(true);
      expect(brand.path.length).toBeGreaterThan(40);
      expect(brand.label.length).toBeGreaterThan(0);
    }
  });

  it('the connect list is exactly the connectable networks, in a stable order', () => {
    expect(SOCIAL_PLATFORMS.map(p => p.id)).toEqual(CONNECTABLE);
  });

  it('WhatsApp is a brand but not an account you connect here', () => {
    expect(PLATFORM_BRANDS.whatsapp).toBeTruthy();
    expect(SOCIAL_PLATFORMS.map(p => p.id)).not.toContain('whatsapp');
  });

  it('a brand colour is a hex, or null for a mark that must follow the theme', () => {
    for (const brand of Object.values(PLATFORM_BRANDS)) {
      if (brand.color === null) continue;
      expect(brand.color, `${brand.id} has a colour that is not a hex`).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('the black-and-white marks carry no colour — a black logo on plum-black is no logo', () => {
    // X, Threads and TikTok are monochrome brands. Pinning a hex on any of them makes it
    // invisible in exactly one of the four themes, which is the half nobody checks.
    for (const id of ['twitter', 'threads', 'tiktok']) {
      expect(PLATFORM_BRANDS[id].color, `${id} must inherit the surface foreground`).toBeNull();
    }
  });

  it('an unknown platform still gets a label rather than an empty cell', () => {
    expect(platformLabel('mastodon')).toBe('mastodon');
    expect(platformLabel('instagram')).toBe('Instagram');
  });
});

describe('platform icons — nobody keeps a private copy', () => {
  const REGISTRY = join(SRC, 'components', 'core', 'icons', 'PlatformIcon.tsx');
  const files = walk(SRC).filter(f => f !== REGISTRY);

  /**
   * A network named as a KEY or a quoted id — `instagram:` / `'instagram'`. The word appearing in
   * prose is not the defect: an SEO card whose subtitle counts Reddit "threads" is not a platform
   * map, and matching it would make this case unrunnable rather than strict.
   */
  const IDS = 'instagram|facebook|linkedin|tiktok|pinterest|youtube|twitter|threads';
  const KEYED = new RegExp(`['"\`](?:${IDS})['"\`]|\\b(?:${IDS})\\s*:`);

  it('no component labels a network with an emoji again', () => {
    // The exact set that shipped, plus the generic link fallback they were paired with.
    const EMOJI = ['📸', '👥', '💼', '🎵', '📌', '▶️', '🧵', '🔗', '𝕏'];
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      if (!KEYED.test(src)) continue;
      for (const line of src.split('\n')) {
        if (!KEYED.test(line)) continue;
        if (EMOJI.some(e => line.includes(e))) offenders.push(`${rel(f)}: ${line.trim()}`);
      }
    }
    expect(offenders, 'label the network with its own mark via <PlatformIcon>').toEqual([]);
  });

  it('no second copy of the brand path data exists', () => {
    // A long inline `d=` in a file that names a network means somebody pasted a logo instead of
    // importing one — the same drift as the emoji maps, just harder to spot. Two copies of the
    // Pinterest mark were living in the moodboard screens when this case was written.
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      if (!KEYED.test(src)) continue;
      if (/\bd=["'`]M[^"'`]{80,}/.test(src)) offenders.push(rel(f));
    }
    expect(offenders, 'import PLATFORM_BRANDS instead of inlining a logo path').toEqual([]);
  });
});
