/**
 * Guard: robots.txt and llms.txt express ONE crawl policy, and it is the intended one.
 *
 * WHY THIS EXISTS
 * ---------------
 * Issue #349 B4. Until 2026-08-22 `public/robots.txt` blocked `OAI-SearchBot`,
 * `ChatGPT-User`, `PerplexityBot` and `Perplexity-User` in the same breath as `GPTBot`
 * and `CCBot` — retrieval agents lumped in with training crawlers. Those four are how
 * an answer engine FETCHES a page to answer a question somebody is asking right now,
 * so the platform's AI-search visibility was zero by configuration.
 *
 * Meanwhile `public/llms.txt` sat there addressed to exactly those agents, describing
 * public surfaces they were forbidden to read. Two files, two contradictory policies,
 * and nothing that could notice: robots.txt has no schema, no build step and no test.
 * You find out by measuring a visibility metric that has been structurally zero the
 * whole time — which reads identically to being genuinely invisible.
 *
 * Three things are pinned here:
 *   1. Every retrieval agent is ALLOWED, and every training crawler is BLOCKED.
 *   2. An allowed agent still cannot reach the tokenised share URLs. Allowing a
 *      crawler is not the same as opening the app, and `/q/{token}` IS a credential.
 *   3. llms.txt names the same allow-set. It is prose, so it cannot be enforced by
 *      construction — but it can be prevented from disagreeing.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const robotsTxt = readFileSync(resolve(ROOT, 'public/robots.txt'), 'utf8');
const llmsTxt = readFileSync(resolve(ROOT, 'public/llms.txt'), 'utf8');

/**
 * Answer-engine and search agents. Each fetches a page to ANSWER a question or to keep
 * an index that answers cite from. Blocking one removes us from that engine's results.
 */
const RETRIEVAL_AGENTS = [
  'Googlebot',
  'Bingbot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'meta-externalfetcher',
];

/**
 * Training-corpus and model-grounding crawlers. Blocking these is the opt-out the
 * platform deliberately keeps; `Google-Extended` and `Applebot-Extended` are the
 * Gemini-app and Apple-Intelligence TRAINING controls specifically and govern none of
 * the retrieval above.
 */
const TRAINING_CRAWLERS = [
  'GPTBot', 'ClaudeBot', 'Claude-Web', 'anthropic-ai', 'CCBot',
  'Google-Extended', 'Applebot-Extended', 'Bytespider', 'meta-externalagent',
  'FacebookBot', 'cohere-ai', 'AI2Bot',
];

/** The token IS the credential; an indexed share URL is a public document. */
const TOKENISED_SHARE_PATHS = ['/q/', '/i/', '/c/', '/u/', '/pay/', '/statement/', '/sheets/'];

/** The authenticated app surface. Renders an empty shell to a crawler anyway. */
const APP_PATHS = ['/admin', '/auth', '/profile', '/settings', '/billing', '/finance', '/crm'];

interface Group {
  agents: string[];
  allow: string[];
  disallow: string[];
}

/**
 * Parse robots.txt into groups. A group is one or more consecutive `User-agent:` lines
 * followed by its rules — RFC 9309 §2.2.1, which is exactly why the platform's shared
 * Disallow list can live in ONE place instead of being pasted per agent.
 */
function parseGroups(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let expectingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!current || !expectingAgents) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
        expectingAgents = true;
      }
      current.agents.push(value.toLowerCase());
    } else if (field === 'allow' || field === 'disallow') {
      if (!current) continue;
      expectingAgents = false;
      (field === 'allow' ? current.allow : current.disallow).push(value);
    } else {
      // sitemap, crawl-delay — neither opens nor closes a group
      expectingAgents = false;
    }
  }
  return groups;
}

const groups = parseGroups(robotsTxt);

/** The group a crawler obeys: its own, or `*` when it has none. */
function groupFor(agent: string): Group {
  const own = groups.find((g) => g.agents.includes(agent.toLowerCase()));
  const wildcard = groups.find((g) => g.agents.includes('*'));
  const chosen = own || wildcard;
  if (!chosen) throw new Error(`no group matches ${agent} and robots.txt has no '*' group`);
  return chosen;
}

/** Longest-match wins between Allow and Disallow, per the REP. */
function isAllowed(group: Group, path: string): boolean {
  const longest = (rules: string[]) =>
    rules.filter((r) => r !== '' && path.startsWith(r)).reduce((m, r) => Math.max(m, r.length), -1);
  const allow = longest(group.allow);
  const disallow = longest(group.disallow);
  if (disallow === -1) return true;
  return allow >= disallow;
}

describe('robots.txt — retrieval is not training', () => {
  it('parses into groups at all', () => {
    expect(groups.length).toBeGreaterThan(3);
    expect(groups.some((g) => g.agents.includes('*'))).toBe(true);
  });

  it.each(RETRIEVAL_AGENTS)('%s may read the public surface', (agent) => {
    const group = groupFor(agent);
    expect(
      isAllowed(group, '/knowledge-base/some-article'),
      `${agent} is blocked from the public knowledge base — that removes us from its answers`,
    ).toBe(true);
    expect(isAllowed(group, '/tools')).toBe(true);
    expect(isAllowed(group, '/careers/acme')).toBe(true);
  });

  it.each(RETRIEVAL_AGENTS)('%s still cannot reach a tokenised share URL', (agent) => {
    const group = groupFor(agent);
    for (const path of TOKENISED_SHARE_PATHS) {
      expect(
        isAllowed(group, `${path}abc123`),
        `${agent} may crawl ${path} — the token IS the credential`,
      ).toBe(false);
    }
  });

  it.each(RETRIEVAL_AGENTS)('%s still cannot reach the authenticated app surface', (agent) => {
    const group = groupFor(agent);
    for (const path of APP_PATHS) {
      expect(isAllowed(group, path), `${agent} may crawl ${path}`).toBe(false);
    }
  });

  it.each(TRAINING_CRAWLERS)('%s is blocked outright', (agent) => {
    const group = groupFor(agent);
    expect(
      group.agents.includes(agent.toLowerCase()),
      `${agent} has no group of its own, so it falls through to '*' and is ALLOWED`,
    ).toBe(true);
    expect(isAllowed(group, '/knowledge-base/some-article')).toBe(false);
    expect(isAllowed(group, '/')).toBe(false);
  });

  it('names no agent in both lists', () => {
    const overlap = RETRIEVAL_AGENTS
      .map((a) => a.toLowerCase())
      .filter((a) => TRAINING_CRAWLERS.map((t) => t.toLowerCase()).includes(a));
    expect(overlap).toEqual([]);
  });

  it('still points at the sitemap', () => {
    expect(robotsTxt).toMatch(/^Sitemap:\s*https:\/\/\S+\/sitemap\.xml\s*$/m);
  });
});

describe('llms.txt — the second copy of the same policy', () => {
  it.each(RETRIEVAL_AGENTS)('names %s as allowed', (agent) => {
    expect(
      llmsTxt.includes(agent),
      `llms.txt does not mention ${agent}. The two files drifted apart once already, and `
      + 'a crawler reading llms.txt has no way to notice the contradiction.',
    ).toBe(true);
  });

  it('names the training crawlers as blocked', () => {
    // Not every one — the list is illustrative in prose — but the headline ones must be
    // there, or "we allow AI agents" reads as an unqualified invitation.
    for (const agent of ['GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended']) {
      expect(llmsTxt).toContain(agent);
    }
  });

  it('says which file wins if they ever disagree', () => {
    expect(llmsTxt).toMatch(/robots\.txt.{0,80}(machines obey|obey)/i);
  });

  it('does not invite a crawler into a tokenised share URL', () => {
    expect(llmsTxt).toMatch(/Do not crawl, index or share them/);
  });
});
