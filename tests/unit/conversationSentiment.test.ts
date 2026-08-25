/**
 * The conversation reading drives three things that must agree: the mood ring on the avatar, the
 * Mood panel in the drawer, and the tone the assistant replies in. Every failure mode here is
 * silent — a stale mood is a valid mood, and a reply written blind is still a reply.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import { moodStyle, urgencyIsLoud, MOODS } from '../../src/utils/conversationMood';

const API = readFileSync(join(process.cwd(), 'supabase', 'functions', 'inbox-api', 'index.ts'), 'utf8');
const PAGE = readFileSync(join(process.cwd(), 'src', 'pages', 'Inbox', 'InboxPage.tsx'), 'utf8');
const PANEL = readFileSync(join(process.cwd(), 'src', 'components', 'Admin', 'OperationsDashboard', 'InboxAIPanel.tsx'), 'utf8');

describe('conversation sentiment', () => {
  it('is derived ONCE and shared by the screen and the assistant', () => {
    // Two reads would let the drawer say "frustrated" while the reply is written as though
    // nothing were wrong, and the operator believes whichever agrees with them.
    const api = stripComments(API);
    expect(api).toMatch(/async function readConversationSentiment\(/);
    // The action delegates rather than carrying a second copy of the call.
    expect((api.match(/tool_choice: \{ type: 'tool', name: TOOL\.name \}/g) ?? []).length).toBe(1);
    expect((api.match(/name: 'report_sentiment'/g) ?? []).length).toBe(1);
    // And the agent path actually consults it.
    expect(api).toMatch(/readConversationSentiment\([\s\S]{0,200}?\)/);
    expect(api).toMatch(/conversation_reading/);
  });

  it('forces the tool rather than parsing free-form JSON', () => {
    // Invariant 9: a classifier whose verdict drives a stored field and a UI state uses
    // tools + tool_choice, never a salvage parser over prose.
    const api = stripComments(API);
    expect(api).toMatch(/tool_choice: \{ type: 'tool'/);
    expect(api).toMatch(/c\.type === 'tool_use'/);
  });

  it('takes its rubric from the DATABASE and has no code fallback', () => {
    // CLAUDE.md: never hardcode a prompt in a file that calls a model, and never write a
    // fallback — a fallback is invisible when it fires, so an admin's edit saves and changes
    // nothing forever while every health signal stays green.
    const api = stripComments(API);
    expect(api).toMatch(/loadPrompt\(db, 'tool', 'inbox_conversation_sentiment'\)/);
    expect(api).not.toMatch(/inbox_conversation_sentiment[\s\S]{0,80}\?\?/);
  });

  it('fences the customer transcript as DATA', () => {
    // A WhatsApp message is whatever the sender typed, including "ignore your instructions".
    expect(stripComments(API)).toMatch(/<message index="\$\{i\}" from="\$\{who\}">/);
    expect(stripComments(API)).toMatch(/<conversation>/);
  });

  it('caches on the last message id, not a timestamp', () => {
    // "Has anything happened since?" is exactly the last message id. A timestamp TTL would
    // re-bill a quiet thread on a timer and miss a busy one between ticks.
    const api = stripComments(API);
    expect(api).toMatch(/last_message_id: lastId/);
    expect(api).toMatch(/cached\.last_message_id === lastId/);
  });

  it('MERGES the verdict into thread metadata', () => {
    // PostgREST .update({metadata}) is a whole-column assignment and would delete
    // zernio_conversation_id, contact_phone and wa_profile — the thread's identity.
    expect(stripComments(API)).toMatch(/inbox_thread_merge_metadata[\s\S]{0,160}sentiment/);
  });

  it('never blocks a reply on the reading failing', () => {
    // The customer losing their answer because a mood call 500'd would be a far worse bug than
    // a reply written without tone.
    expect(stripComments(API)).toMatch(/sentiment unavailable for the agent reply/);
  });

  it('shows the mood where you SCAN, not on every avatar at once', () => {
    // Six copies of one fact in a thread and the signal stops meaning anything.
    const page = stripComments(PAGE);
    expect((page.match(/showMood/g) ?? []).length).toBeLessThanOrEqual(5);
    expect(page).toMatch(/showMood/);
  });

  it('changes the RING, never the character', () => {
    // The cast is 24 rendered people. Swapping someone's face when they get annoyed reads as a
    // different person replying — identity and state must not share a channel.
    const page = stripComments(PAGE);
    expect(page).toMatch(/ring-2 ring-offset-1/);
    expect(page).not.toMatch(/castAvatarSrc\([^)]*mood/);
  });

  it('styles every mood, and an unknown one falls back to calm', () => {
    // A value added to the enum before this map would otherwise light every conversation up as
    // urgent, and a flag that fires on everything is one people learn to ignore.
    for (const m of MOODS) expect(moodStyle(m).label).toBeTruthy();
    expect(moodStyle('something-new').label).toBe('Neutral');
    expect(moodStyle('something-new').needsAttention).toBe(false);
    expect(moodStyle(null).needsAttention).toBe(false);
  });

  it('writes each mood colour as an explicit light/dark PAIR', () => {
    // A raw palette shade is pale BY DESIGN for the dark themes; on the light themes' cream it
    // renders near-invisible. Same defect as the Inbox source tag. Tailwind's scanner also reads
    // source text, so these must be written out, never assembled.
    for (const m of MOODS) {
      const { ring, chip } = moodStyle(m);
      expect(ring, `${m} ring needs a dark: pair`).toMatch(/dark:/);
      expect(chip, `${m} chip needs a dark: pair`).toMatch(/dark:/);
    }
  });

  it('flags only the top two urgencies', () => {
    expect(urgencyIsLoud('critical')).toBe(true);
    expect(urgencyIsLoud('high')).toBe(true);
    expect(urgencyIsLoud('medium')).toBe(false);
    expect(urgencyIsLoud('none')).toBe(false);
    expect(urgencyIsLoud(undefined)).toBe(false);
  });

  it('honours the operator switch BEFORE spending anything', () => {
    // An "off" that still reads the messages and calls the model and throws the answer away is
    // not off. The master check sits ahead of both.
    const api = stripComments(API);
    expect(api).toMatch(/sentimentSettings\(db, workspaceId\)/);
    expect(api).toMatch(/if \(!settings\.enabled\) return \{ sentiment: null[^}]*'disabled'/);
    const gate = api.indexOf("reason: 'disabled'");
    const call = api.indexOf('api.anthropic.com');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(call);
  });

  it('defaults every switch to ON when the row is missing a key', () => {
    // `!== false`, not `=== true`: an absent key means "not configured", which is the default.
    // Failing closed to OFF would ship the feature dark and report nothing — the silent-zero
    // shape, and a surprise bill is louder and more recoverable than a feature that quietly
    // stopped weeks ago.
    const api = stripComments(API);
    expect(api).toMatch(/const globalOn = v\.enabled !== false/);
    expect(api).toMatch(/v\.auto_on_agent_reply !== false/);
    expect(api).toMatch(/v\.per_message_mood !== false/);
  });

  it('BOOKS the spend, or the cost panel is a permanent zero', () => {
    // A raw fetch to Anthropic logs nothing on its own, and the operator's switch sits next to a
    // figure read from ai_usage_logs. No insert = a confident $0 beside a switch that bills.
    const api = stripComments(API);
    expect(api).toMatch(/operation_type: 'inbox_conversation_sentiment'/);
    expect(api).toMatch(/input_tokens: inTok/);
    // And the panel must read the columns that actually exist.
    const panel = stripComments(PANEL);
    expect(panel).toMatch(/\.eq\('operation_type', 'inbox_conversation_sentiment'\)/);
    expect(panel).toMatch(/billed_cost_usd/);
    expect(panel).not.toMatch(/task_type|total_cost/);
  });

  it('attributes the spend to a workspace', () => {
    // ai_usage_logs.workspace_id being NULL is what broke every per-tenant cost view once
    // already, so it is passed in rather than looked up and forgotten.
    expect(stripComments(API)).toMatch(/workspace_id: workspaceId \?\? null/);
  });

  it('maps per-message moods to ids server-side, with bounds checking', () => {
    // The model keys its answer on an INDEX because uuids come back subtly wrong often enough to
    // matter. Resolving that to ids in the browser would mean every consumer re-deriving it
    // against a list it may have paged differently, and an off-by-one paints the wrong bubble —
    // a working feature giving a wrong answer, the hardest kind to notice.
    const api = stripComments(API);
    expect(api).toMatch(/i >= withText\.length\) continue/);
    expect(api).toMatch(/messageMoods\[String\(withText\[i\]\.id\)\]/);
    expect(stripComments(PAGE)).toMatch(/mood=\{messageMoods\[m\.id\]\}/);
  });

  it('never colours OUR OWN message with the mood read off the customer', () => {
    // It is the customer's temperature being reported. Painting our replies with it would say we
    // were the ones who sounded angry.
    expect(stripComments(PAGE)).toMatch(/!ours && mood && mood !== 'neutral'/);
  });

  it('gives every mood a saturated bar, not the tinted chip', () => {
    // The bar is 3px on top of a filled bubble, where a 15% tint disappears entirely.
    for (const m of MOODS) {
      const { bar } = moodStyle(m);
      expect(bar, `${m} bar needs a dark: pair`).toMatch(/dark:/);
      expect(bar, `${m} bar must be solid, not a tint`).not.toMatch(/\//);
    }
  });

  it('gates on global OR module, never AND', () => {
    // The platform switch turns it on for everyone; when it is off, a workspace paying for the
    // `inbox-ai` add-on still gets it. An AND would turn the operator's COST control into a kill
    // switch for paying tenants, which is a different thing and not what it is labelled as.
    const api = stripComments(API);
    expect(api).toMatch(/isWorkspaceEntitled\(db, workspaceId, 'inbox-ai'\)/);
    expect(api).toMatch(/const globalOn = v\.enabled !== false/);
    // Consulted ONLY when the global is off — while it is on everybody has it and an
    // entitlement round-trip per analysis buys nothing.
    expect(api).toMatch(/if \(!globalOn && workspaceId\)/);
  });

  it('gives an add-on workspace the WHOLE feature', () => {
    // The sub-switches are the platform's shape for its own spend. Selling someone a module and
    // then withholding half of it from a screen they cannot see would be indefensible.
    const api = stripComments(API);
    expect(api).toMatch(/via === 'module' \? true : v\.auto_on_agent_reply !== false/);
    expect(api).toMatch(/via === 'module' \? true : v\.per_message_mood !== false/);
  });

  it('names the add-on when it is off, so the fix is findable', () => {
    // Three different fixes hide behind one blank panel: turn the platform switch on, buy the
    // add-on, or wait for more messages. Only naming the module makes the second discoverable.
    expect(stripComments(API)).toMatch(/add the Inbox AI module/);
  });

  it('reads the entitlement table that actually exists', () => {
    // `workspace_modules` is not a table. PostgREST errors on it, and a `?? 0` would turn that
    // into a confident "nobody holds this add-on" beside a switch about money.
    const panel = stripComments(PANEL);
    expect(panel).toMatch(/from\('workspace_module_entitlements'\)/);
    expect(panel).not.toMatch(/from\('workspace_modules'\)/);
  });

  it('warns that switching off globally does not stop add-on spend', () => {
    // Reading "off" as "no more spend" would be wrong about the operator's own bill.
    expect(stripComments(PANEL)).toMatch(/hold the Inbox AI add-on/);
  });
});
