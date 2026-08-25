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
    expect(stripComments(API)).toMatch(/<message from="\$\{who\}">/);
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
});
