/**
 * Naming a place must be the same act as linking to it.
 *
 * The Social quick-start ("My accounts") shipped both halves of the same dead end:
 *
 *   • the result card offered "Add account", which asked the AGENT to add one. No tool can —
 *     connecting a social account is an OAuth handshake with Meta/LinkedIn that only exists in
 *     the app UI — so the button's entire effect was a paragraph telling the user to go to
 *     Profile → Social Accounts.
 *   • that paragraph then named the destination in plain text, so the reader still had to go
 *     hunt for a tab among seventeen on the profile page.
 *
 * Both halves now read one registry (`src/config/appDestinations.ts`). This guard fails the
 * build when:
 *   1. a registered destination points at a route or a `?tab=` that does not exist — a link to
 *      nowhere is worse than the mention it replaced;
 *   2. a tool tells the user to go somewhere that is not registered, so the reply would name a
 *      place the UI cannot link to (that is the original bug, re-entering by the back door);
 *   3. the rewrite touches code spans or existing links, or stops being idempotent;
 *   4. the result card goes back to asking the model for something the model cannot do.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import { APP_DESTINATIONS, destinationPhrases } from '@/config/appDestinations';
import { RESULT_SETUP_DESTINATION, resultOffersCreate } from '@/config/capabilities';
import { linkifyDestinations } from '@/utils/linkifyDestinations';
import { AgentResultCard } from '@/components/features/ai/AgentResultCard';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

// ── 1. Every destination is somewhere the app can actually go ────────────────

/** Route paths declared in App.tsx plus every module's own route table. */
function declaredRoutes(): Set<string> {
  const routes = new Set<string>();
  const app = stripComments(read('src/App.tsx'));
  for (const m of app.matchAll(/path="([^"]+)"/g)) routes.add(m[1]);
  const modulesDir = join(ROOT, 'src/modules');
  for (const dir of readdirSync(modulesDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const index = join(modulesDir, dir.name, 'index.ts');
    if (!existsSync(index)) continue;
    const src = stripComments(readFileSync(index, 'utf8'));
    for (const m of src.matchAll(/path:\s*'([^']+)'/g)) routes.add(m[1]);
  }
  return routes;
}

/**
 * Where each tabbed destination's tab values are DECLARED. Listed on purpose: the point of the
 * check is that the tab VALUE still exists — the profile page has seventeen tabs and renaming one
 * silently turns every link at it into a page that lands back on "profile".
 *
 * Finance points at the module constant rather than the page, because FinancePage builds its
 * tab strip from `FINANCE_TAB` (the Orders pane is keyed `doc_orders`, not `orders`).
 */
const TABBED_PAGES: Record<string, string> = {
  '/profile': 'src/pages/UserProfilePage.tsx',
  '/admin/ai-configs': 'src/components/Admin/AgentConfigs/AgentConfigsPage.tsx',
  '/quotes': 'src/modules/quotes/pages/QuotesPage.tsx',
  '/finance': 'src/modules/finance/routes.ts',
};

function tabValues(file: string): Set<string> {
  const src = read(file);
  return new Set([
    ...[...src.matchAll(/<TabsTrigger\s+value="([^"]+)"/g)].map((m) => m[1]),
    // A tab strip built from a constant map declares its values as object properties.
    ...[...src.matchAll(/^\s{2}\w+:\s*'([a-z_]+)',$/gm)].map((m) => m[1]),
  ]);
}

describe('the destination registry points at real places', () => {
  const routes = declaredRoutes();

  it('every route exists in App.tsx or a module route table', () => {
    for (const d of APP_DESTINATIONS) {
      const path = d.route.split('?')[0];
      expect(routes.has(path), `${d.id} → ${d.route} is not a declared route`).toBe(true);
    }
  });

  it('every ?tab= lands on a tab that still exists on that page', () => {
    for (const d of APP_DESTINATIONS) {
      const [path, query] = d.route.split('?');
      if (!query) continue;
      const tab = new URLSearchParams(query).get('tab');
      if (!tab) continue;
      const page = TABBED_PAGES[path];
      expect(page, `${d.id} addresses a tab on ${path}, which is not in TABBED_PAGES`).toBeTruthy();
      expect(tabValues(page!).has(tab), `${d.id} → ${d.route}: no tab "${tab}" on ${page}`).toBe(true);
    }
  });

  // `?section=` used to be checked here, against ONE hardcoded rail — the channels rail was the
  // only one with sections when it was written. There are four now (schedule, social-accounts,
  // keys, finance settings), and a check that resolves every section against the wrong rail is
  // worse than none: it convicts correct links and vouches for nothing. Moved and generalised to
  // tests/unit/profileSectionLinks.test.ts, which resolves each link against the rail its OWN tab
  // renders and covers `APP_DESTINATIONS` among the other section links in the codebase.

  it('every breadcrumb names at least two segments', () => {
    // A one-word destination ("Inbox") cannot be linkified without swallowing the word wherever
    // it appears in ordinary prose.
    for (const { phrase } of destinationPhrases()) {
      expect(phrase, `"${phrase}" has no separator`).toMatch(/→|->|›|»|▸|>/);
    }
  });

  it('ids are unique', () => {
    const ids = APP_DESTINATIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every result-type setup destination resolves', () => {
    const ids = new Set(APP_DESTINATIONS.map((d) => d.id));
    for (const [type, setup] of Object.entries(RESULT_SETUP_DESTINATION)) {
      expect(ids.has(setup.destination), `${type} → unknown destination "${setup.destination}"`).toBe(true);
    }
  });
});

// ── 2. Every place a TOOL sends someone is a place the reply can link to ─────

describe('agent tools only name destinations the UI can link', () => {
  // A breadcrumb in a tool string: a known top-level area, an arrow, then Capitalised Words.
  // Trailing lowercase prose ("…Modules and then") is excluded by the capitalisation rule, and
  // the area list keeps flow vocabulary ("Inbox Message → Notify Recipient") and prose arrows
  // ("Research → Plan", "Greek → Latin") out of it.
  const BREADCRUMB = /\b(Profile|Settings|Admin|Marketing|Messaging|Quotes|Finance|Warehouse|CRM)\s*(?:→|->|>)\s*((?:[A-Z][a-z]+)(?: [A-Z][a-z]+)*)/g;

  const toolsDir = join(ROOT, 'supabase/functions/_shared/tools');
  const files = readdirSync(toolsDir).filter((f) => f.endsWith('.ts'));

  it('scans a real set of tool files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('each one linkifies', () => {
    const unlinkable: string[] = [];
    let found = 0;
    for (const f of files) {
      const src = stripComments(readFileSync(join(toolsDir, f), 'utf8'));
      for (const m of src.matchAll(BREADCRUMB)) {
        found++;
        const phrase = `${m[1]} → ${m[2]}`;
        if (!linkifyDestinations(phrase).startsWith('[')) unlinkable.push(`${f}: ${phrase}`);
      }
    }
    // A scanner that stops seeing anything reports green forever. 17 at the time of writing.
    expect(found, 'the breadcrumb scan found nothing — the pattern or the paths have drifted').toBeGreaterThan(10);
    expect(
      unlinkable,
      'a tool names a place with no route behind it — register it in src/config/appDestinations.ts',
    ).toEqual([]);
  });
});

// ── 3. The rewrite itself ────────────────────────────────────────────────────

describe('linkifyDestinations', () => {
  it('links the breadcrumb an agent actually writes', () => {
    expect(linkifyDestinations('No social accounts are connected. Connect one in Profile → Social Accounts first.'))
      .toContain('[Profile → Social Accounts](/profile?tab=social-accounts)');
  });

  it('does not care which arrow or casing the model chose', () => {
    for (const written of ['Profile -> social accounts', 'profile > Social Accounts', 'Profile→Social Accounts']) {
      expect(linkifyDestinations(`Go to ${written} to connect one.`)).toContain('](/profile?tab=social-accounts)');
    }
  });

  it('keeps the label exactly as written — the link is an addition, not a correction', () => {
    expect(linkifyDestinations('open profile > Keys')).toContain('[profile > Keys](/profile?tab=keys)');
  });

  it('leaves an existing link alone, so a second pass changes nothing', () => {
    const once = linkifyDestinations('See Profile → Keys for that.');
    expect(linkifyDestinations(once)).toBe(once);
  });

  it('never rewrites inside code', () => {
    const inline = 'Run `Profile → Keys` verbatim.';
    expect(linkifyDestinations(inline)).toBe(inline);
    const fenced = '```\nProfile → Keys\n```';
    expect(linkifyDestinations(fenced)).toBe(fenced);
  });

  it('never rewrites inside a URL', () => {
    const url = 'https://example.com/Profile%20→%20Keys';
    expect(linkifyDestinations(url)).toBe(url);
  });

  it('catches the paraphrase the model actually writes', () => {
    // A tool says "Profile → Social Accounts"; the model relays it as a sentence. Both forms of
    // the same destination have to link, or the fix only works when the model quotes verbatim.
    expect(linkifyDestinations('You can connect one from the Social Accounts tab.'))
      .toContain('[Social Accounts tab](/profile?tab=social-accounts)');
    expect(linkifyDestinations('Create one on the Keys tab.')).toContain('](/profile?tab=keys)');
  });

  it('needs the word "tab" — a bare tab name is an ordinary word', () => {
    const prose = 'The keys are on the desk and the reviews were good.';
    expect(linkifyDestinations(prose)).toBe(prose);
  });

  it('does not reach across a line break to build a phrase that was never written', () => {
    // `>` is one of the separators it accepts, and it also starts a markdown blockquote. A
    // paragraph ending in "Profile" above a quoted line is two things, not one destination.
    const two = 'That is in your Profile\n> Keys are elsewhere.';
    expect(linkifyDestinations(two)).toBe(two);
  });

  it('leaves prose that merely uses the words alone', () => {
    const prose = 'Your profile is fine and the keys are in the drawer.';
    expect(linkifyDestinations(prose)).toBe(prose);
  });
});

// ── 3b. …and the chat bubble actually renders it as an in-app link ───────────

describe('the agent bubble renders the destination as a link', () => {
  it('produces an anchor to the route, not a new tab', async () => {
    const { MemoryRouter } = await import('react-router-dom');
    const { MarkdownRenderer } = await import('@/components/features/ai/MarkdownRenderer');
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(MarkdownRenderer, {
          content: 'No social accounts are connected. Connect one in Profile → Social Accounts first.',
        }),
      ),
    );
    expect(html).toContain('href="/profile?tab=social-accounts"');
    // An in-app route opening a second tab of the same app is not "go there".
    expect(html).not.toMatch(/href="\/profile[^"]*"[^>]*target="_blank"/);
  });
});

// ── 4. The result card offers the flow, not a request for one ────────────────

const render = (data: Record<string, unknown>, resultType: string, title = 'Social accounts') =>
  renderToStaticMarkup(React.createElement(AgentResultCard, { title, data, resultType, onAsk: () => {} }));

describe('a list fed by a setup flow links to that flow', () => {
  const ACCOUNTS = {
    accounts: [
      { id: 'a1', platform: 'instagram', handle: '@kai', active: true },
      { id: 'a2', platform: 'facebook', handle: 'Kai', active: true },
    ],
  };

  it('offers Connect an account, pointed at the tab that connects one', () => {
    const html = render(ACCOUNTS, 'social_accounts');
    expect(html).toContain('/profile?tab=social-accounts');
    expect(html).toContain('Connect an account');
  });

  it('does NOT ask the agent to add one — no tool can', () => {
    expect(render(ACCOUNTS, 'social_accounts')).not.toContain('Add account');
    expect(resultOffersCreate('social_accounts')).toBe(false);
  });

  it('puts the connect action in the empty state, where it matters most — once', () => {
    const html = render({ accounts: [] }, 'social_accounts');
    expect(html).toContain('Profile → Social Accounts');
    expect((html.match(/\/profile\?tab=social-accounts/g) || []).length).toBe(1);
  });

  it('covers the other connection-shaped lists too', () => {
    const wa = render({ channels: [] }, 'messaging_channels_list', 'WhatsApp channels');
    expect(wa).toContain('Connect a channel');
    // The channels rail on the profile, not the workspace-admin-gated /messaging page.
    expect(wa).toContain('/profile?tab=social-accounts&amp;section=whatsapp');
  });
});

describe('a list nobody can add to offers no create action', () => {
  it('never invites you to write a review about yourself', () => {
    const html = render(
      { reviews: [{ id: 'r1', from_name: 'A', overall_rating: 5 }, { id: 'r2', from_name: 'B', overall_rating: 4 }] },
      'reviews_list',
      'Reviews about you',
    );
    expect(html).not.toContain('Add review');
    // …but it still hands off to the page where they live.
    expect(html).toContain('Open in Reviews');
  });

  it('leaves the ordinary create action alone', () => {
    const html = render(
      { flows: [{ id: 'f1', name: 'One', status: 'active' }, { id: 'f2', name: 'Two', status: 'draft' }] },
      'flows_list',
      'Workspace flows',
    );
    expect(html).toContain('Add flow');
  });
});
