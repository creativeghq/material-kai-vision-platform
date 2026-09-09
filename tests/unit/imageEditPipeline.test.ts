/**
 * An EDIT must edit the user's own photo, come back the same shape, and still be findable on the
 * next turn.
 *
 * All three failed at once in conversation b520cc11 (2026-09-09). The user attached a 355x355
 * terrazzo swatch and a 1280x1600 photo of their kitchen and asked to swap the floor tile:
 *
 *   1. `image-edit` read the two composer slots BACKWARDS — `images[0]` was "the photo to edit"
 *      there and "the inspiration" everywhere else — so the SWATCH was sent as the room.
 *   2. A second image on an edit switched the mode into a two-step style transfer whose first
 *      step describes the reference in words and whose second step never sends it at all, under
 *      a prompt that says "apply every item below" to the whole room.
 *   3. The output was requested at the 16:9 default and the multi-image call did not forward
 *      even that, so a 4:5 photo came back 16:9 — re-cropped, i.e. not the same room.
 *   4. On the retry, `agent-chat` had flattened the history to `{role, content}` before the
 *      recovery paths read it, so the earlier attachments were unreachable and the tool
 *      answered "No reference image available for editing" in 2ms.
 *
 * Nothing failed anywhere: a wrong room is a valid image, a landscape crop is a valid crop, and
 * an empty array is a valid array. These are source-level assertions for that reason.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { stripComments } from '../helpers/stripComments';

import {
  resolveImageSlots,
  SLOT_REFERENCE,
  SLOT_BASE,
} from '../../supabase/functions/_shared/tools/image-slots.ts';
import {
  readImageSize,
  nearestAspectRatio,
  aspectRatioOfImage,
} from '../../supabase/functions/_shared/image-dimensions.ts';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const GENERATION_TOOLS = 'supabase/functions/_shared/tools/generation-tools.ts';
const GEMINI_FN = 'supabase/functions/generate-interior-gemini/index.ts';
const AI_CLIENT = 'supabase/functions/_shared/ai-client.ts';
const AGENT_CHAT = 'supabase/functions/agent-chat/index.ts';
const AGENT_HUB = 'src/components/features/ai/AgentHub.tsx';

// The supported output shapes, read from the one place they are declared.
const ASPECT_RATIOS = ['1:1', '16:9', '3:2', '4:3', '9:16', '3:4', '4:5', '5:4', '21:9', '2:3'] as const;

describe('which attachment is the room — one convention', () => {
  it('two images: slot 0 is the reference, slot 1 is the photo being edited', () => {
    expect(resolveImageSlots(2)).toEqual({ baseIndex: SLOT_BASE, referenceIndex: SLOT_REFERENCE });
    expect(SLOT_REFERENCE).toBe(0);
    expect(SLOT_BASE).toBe(1);
  });

  it('one image is the photo, never the reference', () => {
    expect(resolveImageSlots(1)).toEqual({ baseIndex: 0, referenceIndex: -1 });
    // Even when the caller insists it is a reference — there is nothing else to edit.
    expect(resolveImageSlots(1, { referenceImageIndex: 1 })).toEqual({ baseIndex: 0, referenceIndex: -1 });
  });

  it('no image resolves to nothing rather than to index 0', () => {
    expect(resolveImageSlots(0)).toEqual({ baseIndex: -1, referenceIndex: -1 });
  });

  it('the model can pin either slot, 1-based, and the other one follows', () => {
    // "here is a tile, put it in this room" with the ROOM attached first.
    expect(resolveImageSlots(2, { baseImageIndex: 1 })).toEqual({ baseIndex: 0, referenceIndex: 1 });
    expect(resolveImageSlots(3, { baseImageIndex: 3, referenceImageIndex: 2 }))
      .toEqual({ baseIndex: 2, referenceIndex: 1 });
  });

  it('pinning ONE slot moves the other — or the override recreates the bug it fixes', () => {
    // "the tile is image 2" must not leave the base sitting on image 2 as well, editing the tile.
    expect(resolveImageSlots(2, { referenceImageIndex: 2 })).toEqual({ baseIndex: 0, referenceIndex: 1 });
    expect(resolveImageSlots(2, { referenceImageIndex: 1 })).toEqual({ baseIndex: 1, referenceIndex: 0 });
  });

  it('an out-of-range pin falls back to the convention instead of editing a different image', () => {
    expect(resolveImageSlots(2, { baseImageIndex: 7 })).toEqual({ baseIndex: SLOT_BASE, referenceIndex: SLOT_REFERENCE });
    expect(resolveImageSlots(2, { baseImageIndex: 0 })).toEqual({ baseIndex: SLOT_BASE, referenceIndex: SLOT_REFERENCE });
    expect(resolveImageSlots(2, { baseImageIndex: 1.5 })).toEqual({ baseIndex: SLOT_BASE, referenceIndex: SLOT_REFERENCE });
  });

  it('one image cannot be both the room and the material', () => {
    const slots = resolveImageSlots(2, { baseImageIndex: 2, referenceImageIndex: 2 });
    expect(slots.baseIndex).toBe(1);
    expect(slots.referenceIndex).toBe(-1);
  });

  it('the composer, the tool and the model prompt all state the same order', () => {
    // The UI the user is looking at when they drop the two files.
    const hub = read(AGENT_HUB);
    expect(hub).toMatch(/slotIdx === 0 \? 'Inspiration' : 'Your Room'/);

    // What Gemini is told each image is.
    const aiClient = read(AI_CLIENT);
    const labels = aiClient.slice(aiClient.indexOf('const IMAGE_LABELS'), aiClient.indexOf('const parts: any[]'));
    expect(labels.indexOf('STYLE REFERENCE IMAGE (first image')).toBeGreaterThan(-1);
    expect(labels.indexOf('ROOM TO EDIT (second image')).toBeGreaterThan(labels.indexOf('STYLE REFERENCE IMAGE (first image'));

    // And the tool that maps one to the other.
    const tools = read(GENERATION_TOOLS);
    expect(tools).toContain("import { resolveImageSlots } from './image-slots.ts'");
    expect(tools).toMatch(/const slots = resolveImageSlots\(images\.length, \{ baseImageIndex, referenceImageIndex \}\)/);
  });

  it('no mode picks its images by raw index any more', () => {
    const tools = read(GENERATION_TOOLS);
    const body = tools.slice(tools.indexOf('Which attachment is the photo'), tools.indexOf('const resolvedBoardMode'));
    // `images[0]` as "the thing to edit" and `images[1]` as "the style" is exactly the pair that
    // meant opposite things in image-edit and copy-style.
    expect(body).not.toMatch(/images\[0\]/);
    expect(body).not.toMatch(/images\[1\]/);
    expect(body).toContain('slotBaseImage');
    expect(body).toContain('slotReferenceImage');
  });

  it('the tool exposes the override to the model, because prose cannot carry it', () => {
    const tools = read(GENERATION_TOOLS);
    expect(tools).toMatch(/baseImageIndex: z\.number\(\)/);
    expect(tools).toMatch(/referenceImageIndex: z\.number\(\)/);
    // The agent wrote "Image 2 is the base photograph" into the prompt, where nothing read it.
    const agentChat = read(AGENT_CHAT);
    expect(agentChat).toContain('pass baseImageIndex and ');
  });
});

describe('a reference image on an edit is a MATERIAL, and its pixels are sent', () => {
  it('image-edit passes both images to the model, reference first', () => {
    const fn = read(GEMINI_FN);
    const editBranch = fn.slice(
      fn.indexOf("else if (mode === 'image-edit')"),
      fn.indexOf("else if (mode === 'unstage')"),
    );
    expect(editBranch).toContain('images: [styleBuffer, sourceBuffer]');
    expect(editBranch).toContain('interior_targeted_edit_with_reference');
  });

  it('image-edit no longer paraphrases the reference into a whole-room renovation', () => {
    const fn = read(GEMINI_FN);
    const editBranch = fn.slice(
      fn.indexOf("else if (mode === 'image-edit')"),
      fn.indexOf("else if (mode === 'unstage')"),
    );
    // `extractDesignSpec` reads a photo for its fixtures/basin/vanity/taps, and
    // `interior_apply_spec` opens "you are performing a cosmetic renovation of the room".
    // Both are right for copy-style and catastrophic for "swap this one tile".
    expect(editBranch).not.toContain('extractDesignSpec');
    expect(editBranch).not.toContain('buildApplySpecPrompt');
  });

  it('copy-style keeps the two-step spec extraction — there the reference IS a room', () => {
    const fn = read(GEMINI_FN);
    const copyStyle = fn.slice(
      fn.indexOf("else if (mode === 'copy-style')"),
      fn.indexOf("else if (mode === 'floor-plan-render')"),
    );
    expect(copyStyle).toContain('extractDesignSpec');
  });

  it('a targeted edit is not silently promoted to a whole-room restyle', () => {
    const tools = read(GENERATION_TOOLS);
    expect(tools).toMatch(/detectEditIntent\(prompt\) && \(hasRecentGeneration \|\| hasUploadedImage\)/);
    // ...and the floor-plan modes are still reached: "can you change this floor plan into a
    // render" matches the generic edit verb, so the specific test has to come first.
    const detect = tools.slice(tools.indexOf('let resolvedMode ='), tools.indexOf('materials-selection-board: requires'));
    expect(detect.indexOf("resolvedMode = 'floor-plan-render'"))
      .toBeLessThan(detect.indexOf("resolvedMode = 'image-edit'"));
  });

  it('a two-image edit runs on the only provider that takes two images', () => {
    const fn = read(GEMINI_FN);
    // Grok and gpt-image-1 edit ONE image: left on those tiers the material reference is gated,
    // charged for, and then dropped on the floor.
    expect(fn).toMatch(/multiReference:[^;]*mode === 'image-edit' && !!body\.style_reference_url/s);
  });
});

describe('an edit comes back the shape it went in', () => {
  const png = (w: number, h: number) => {
    const b = new Uint8Array(24);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    b.set([0, 0, 0, 13], 8);
    b.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
    new DataView(b.buffer).setUint32(16, w);
    new DataView(b.buffer).setUint32(20, h);
    return b;
  };

  const jpeg = (w: number, h: number) => {
    const b = new Uint8Array(22);
    b.set([0xff, 0xd8], 0);
    b.set([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00], 2); // APP0, length 4 (skipped)
    b.set([0xff, 0xc0, 0x00, 0x11, 0x08], 8); // SOF0, length 17, 8-bit
    const dv = new DataView(b.buffer);
    dv.setUint16(13, h);
    dv.setUint16(15, w);
    return b;
  };

  const webpVp8x = (w: number, h: number) => {
    const b = new Uint8Array(30);
    const put = (s: string, at: number) => { for (let i = 0; i < s.length; i++) b[at + i] = s.charCodeAt(i); };
    put('RIFF', 0); put('WEBP', 8); put('VP8X', 12);
    const u24 = (v: number, at: number) => { b[at] = v & 0xff; b[at + 1] = (v >> 8) & 0xff; b[at + 2] = (v >> 16) & 0xff; };
    u24(w - 1, 24);
    u24(h - 1, 27);
    return b;
  };

  it('reads the size out of the header for the formats the composer accepts', () => {
    expect(readImageSize(png(1280, 1600))).toEqual({ width: 1280, height: 1600 });
    expect(readImageSize(jpeg(1280, 1600))).toEqual({ width: 1280, height: 1600 });
    expect(readImageSize(webpVp8x(355, 355))).toEqual({ width: 355, height: 355 });
  });

  it('returns null rather than a guess for bytes it cannot read', () => {
    expect(readImageSize(new Uint8Array(4))).toBeNull();
    expect(readImageSize(new Uint8Array(64))).toBeNull();
  });

  it('matches a photo to the nearest offered ratio', () => {
    // The exact images from the conversation.
    expect(nearestAspectRatio({ width: 1280, height: 1600 }, ASPECT_RATIOS)).toBe('4:5');
    expect(nearestAspectRatio({ width: 355, height: 355 }, ASPECT_RATIOS)).toBe('1:1');
    expect(nearestAspectRatio({ width: 1408, height: 768 }, ASPECT_RATIOS)).toBe('16:9');
    // Portrait and landscape are the same distance from square — a log-space comparison, not a
    // difference of ratios, which biases everything towards the wide end.
    expect(nearestAspectRatio({ width: 900, height: 1200 }, ASPECT_RATIOS)).toBe('3:4');
    expect(nearestAspectRatio({ width: 1200, height: 900 }, ASPECT_RATIOS)).toBe('4:3');
    expect(aspectRatioOfImage(png(1280, 1600), ASPECT_RATIOS)).toBe('4:5');
  });

  it('the supported set is read from ai-client, not restated', () => {
    const aiClient = read(AI_CLIENT);
    expect(aiClient).toContain('export const IMAGE_ASPECT_RATIOS = [');
    expect(aiClient).toContain('export type ImageAspectRatio = typeof IMAGE_ASPECT_RATIOS[number]');
    // If this list changes, this test's copy must change with it — that is the point of failing.
    for (const r of ASPECT_RATIOS) expect(aiClient).toContain(`'${r}'`);
  });

  it('the multi-image call actually forwards the ratio it was given', () => {
    const aiClient = read(AI_CLIENT);
    const multi = aiClient.slice(aiClient.indexOf('async function generateMultiImageWithGemini'));
    expect(multi).toContain('imageConfig: { aspectRatio: config.aspectRatio }');
    // ...and degrades to today's behaviour rather than killing every generation if a model
    // rejects the field.
    expect(multi).toContain('retrying without it');
  });

  it('every mode that transforms a supplied photo derives the ratio from it', () => {
    const fn = read(GEMINI_FN);
    expect(fn).toContain('const aspectRatioForSource = (source: Uint8Array): ImageAspectRatio =>');
    for (const marker of [
      'const editAspectRatio = aspectRatioForSource(sourceBuffer)',        // image-edit
      'aspectRatio: aspectRatioForSource(sourceBuffer) }',                 // unstage
      'const measured = await measureSource(body.reference_image_url)',    // redesign
      'const measuredRoom = await measureSource(body.reference_image_url)', // copy-style
    ]) {
      expect(fn).toContain(marker);
    }
    // The measuring download must not be able to fail a generation that never needed the bytes.
    const measure = fn.slice(fn.indexOf('const measureSource ='), fn.indexOf('// ── What may be edited'));
    expect(measure).toContain('catch (err)');
    expect(measure).toContain('using the default ratio');
  });
});

describe('the images stay reachable on the next turn', () => {
  it('agent-chat carries the image fields into the history executeAgent reads', () => {
    const src = read(AGENT_CHAT);
    const map = src.slice(
      src.indexOf('let anthropicMessages = messages.map'),
      src.indexOf('// ── DATA fence (security invariant 9)'),
    );
    // These four are read by name inside executeAgent. Projecting the history down to
    // {role, content} made both recovery paths dead code for every conversation ever run.
    for (const field of ['images', 'metadata', 'geminiImageData', 'tool_results']) {
      expect(map).toContain(`msg.${field}`);
    }
  });

  it('both recovery paths still read the fields the map carries', () => {
    const src = read(AGENT_CHAT);
    expect(src).toContain('const raw = m.images ?? m.metadata?.attachedImages;');
    expect(src).toContain('if (m.geminiImageData?.image_url)');
  });

  it('an earlier upload comes back as the SET it was, not as its last URL', () => {
    const src = read(AGENT_CHAT);
    // Flattening loses the pair: `.slice(-1)` over [tile, room] keeps the room and drops the
    // tile, so "now put that tile on the wall" a turn later has nothing to apply.
    expect(src).toContain('const priorUploadGroups: string[][]');
    expect(src).toMatch(/toolImages: string\[\] = images\.length > 0\s*\?\s*images\s*:\s*\(priorUploadGroups\[priorUploadGroups\.length - 1\] \?\? \[\]\)/);
  });

  it('a finished turn is recorded even when the client is gone', () => {
    const src = read(AGENT_CHAT);
    // The claim is checked before the write — not a blind insert. And the check is the WINDOW,
    // not the stamp: an edge deploy and a frontend deploy are not one transaction, so a tab still
    // running the old bundle stamps nothing and must not be given a duplicate of every reply.
    expect(src).toContain('async function recoverAssistantMessage(');
    const fn = src.slice(src.indexOf('async function recoverAssistantMessage('), src.indexOf('async function executeAgent('));
    expect(fn).toMatch(/\.gte\('created_at', turnStartedAt\)/);
    expect(fn.indexOf(".gte('created_at', turnStartedAt)"))
      .toBeLessThan(fn.indexOf("await supabase.from('agent_chat_messages').insert("));
    // A read failure must not produce a duplicate.
    expect(fn).toContain('Fail CLOSED on a read error');

    // The client has to stamp what it saves, or the net fires on every turn.
    const hub = read(AGENT_HUB);
    expect(hub).toContain('turn_id: data.turn_id ?? streamTurnId ?? undefined');
    expect(hub).toContain('if (typeof chunk.turn_id === \'string\') streamTurnId = chunk.turn_id;');
  });

  it('the render is recorded on the job row, not only in the chat message', () => {
    const fn = read(GEMINI_FN);
    const insert = fn.slice(fn.indexOf("from('generation_3d').insert({"));
    expect(insert).toContain('image_urls: [imageUrl]');
  });
});

describe('the agent reports what ran, because it cannot see what it made', () => {
  it('the edge function returns the provenance of the run', () => {
    const fn = read(GEMINI_FN);
    const response = fn.slice(fn.lastIndexOf('success: true,'));
    for (const field of ['source_image_url', 'material_reference_url', 'source_size', 'output_size']) {
      expect(response).toContain(field);
    }
    // Measured on the way past rather than by decoding the image a second time, and null —
    // "unknown" — rather than a guess when the header cannot be read.
    expect(fn).toContain('const persistMeasured = async');
    expect(fn).toContain('outputSize = null;');
  });

  it('the tool hands that evidence to the model on every edit', () => {
    const tools = read(GENERATION_TOOLS);
    expect(tools).toContain('const edited = SINGLE_SOURCE_MODES.includes(resolvedMode)');
    expect(tools).toMatch(/base_image_origin:/);
    expect(tools).toMatch(/the user's attachment \$\{slots\.baseIndex \+ 1\} of \$\{images\.length\}/);
  });

  it('and is told, in the tool it calls, that it has not seen the picture', () => {
    const tools = read(GENERATION_TOOLS);
    const desc = tools.slice(tools.indexOf("name: 'generate_gemini'"), tools.indexOf('PARAMETER EXTRACTION'));
    expect(desc).toContain('YOU CANNOT SEE THE IMAGE THIS RETURNS');
    // The specific sentence that cost the user 30 credits and their trust: a claim of
    // preservation about pixels nobody in the loop had looked at.
    expect(desc).toMatch(/NEVER write that .* is\s*\n?unchanged, preserved or identical/s);
    // The tool's own success copy must not assert the edit worked either — it primes the reply.
    expect(tools).toContain('`Edit run on ${edited.base_image_origin}.`');
  });
});

describe('every media tool on the agent, not just the one that broke', () => {
  // generate_gemini was fixed first; these six had the identical shape and were left. Each
  // produces something the model cannot look at, and each was describing it anyway.
  const MEDIA_TOOLS = [
    'generate_3d',
    'generate_gemini',
    'virtual_staging',
    'apply_lighting_preset',
    'generate_vr_world',
  ] as const;

  it('every one of them tells the model it cannot see what it produced', () => {
    const tools = read(GENERATION_TOOLS);
    for (const name of MEDIA_TOOLS) {
      const at = tools.indexOf(`name: '${name}'`);
      expect(at, `${name} not found`).toBeGreaterThan(-1);
      // The description runs from the name to the schema.
      const desc = tools.slice(at, tools.indexOf('schema: z.object', at));
      expect(desc, `${name} does not warn that the model cannot see its output`)
        .toMatch(/CANNOT SEE THE IMAGE THIS RETURNS|\$\{CANNOT_SEE_NOTE\}/);
    }
    // The video tool lives in another file and produces a video, not an image.
    expect(read('supabase/functions/_shared/tools/background-tools.ts'))
      .toContain('YOU CANNOT SEE THE VIDEO THIS RETURNS');
  });

  it('every one of them returns WHICH image it ran on', () => {
    const tools = read(GENERATION_TOOLS);
    // `source_image_url` in an onChunk is for the screen; the model only reads the return.
    for (const marker of [
      'source_image_url: resolvedImageUrl ?? null',   // generate_3d
      'base_image_url: result.source_image_url',      // generate_gemini
      'source_image_url: resolvedImageUrl,',          // staging / lighting / VR
      'source_image_origin: picked.origin,',
    ]) {
      expect(tools).toContain(marker);
    }
    // The video tool's own param is snake_case, so it echoes it back by shorthand.
    const bg = read('supabase/functions/_shared/tools/background-tools.ts');
    const ret = bg.slice(bg.indexOf('return JSON.stringify({'), bg.indexOf("name: 'generate_video'"));
    expect(ret).toContain('source_image_url,');
  });

  it('a tool that acts on "your room" can actually reach the room the user attached', () => {
    const agentChat = read(AGENT_CHAT);
    // All three took only `conversationImages` — images WE generated — so an uploaded photo was
    // unreachable and the tool refused while the user was looking at it in the composer.
    for (const factory of [
      'createVirtualStagingTool',
      'createApplyLightingPresetTool',
      'createGenerateVRWorldTool',
    ]) {
      const call = agentChat.slice(agentChat.indexOf(`tools.push(${factory}(`));
      expect(call.slice(0, 220), `${factory} is not handed the user's attachments`)
        .toContain('toolImages');
    }
    expect(read(GENERATION_TOOLS)).toContain('function resolveMediaSource(');
  });

  it('generate_3d picks the room by the shared convention, not by index 0', () => {
    const tools = read(GENERATION_TOOLS);
    // Comments explain the OLD code by quoting it; only the code counts.
    const body = stripComments(
      tools.slice(tools.indexOf('export const create3DGenerationTool'), tools.indexOf('export const EDIT_INTENT_PATTERNS')),
    );
    // `userImages[0]` is the INSPIRATION slot — this tool fans a wrong pick across every model
    // in the grid at once.
    expect(body).not.toMatch(/userImages\[0\]/);
    expect(body).toContain('resolveImageSlots(userImages.length, { baseImageIndex })');
  });

  it('a tool that reads a page does not imply it looked at the pictures', () => {
    const search = read('supabase/functions/_shared/tools/search-tools.ts');
    expect(search).toContain('derived_from:');
    expect(search).toContain('No image was analysed');
    expect(search).toContain('it does NOT look at the images on it');
  });

  it('no tool tells the model to poll a tool that does not exist', () => {
    const bg = read('supabase/functions/_shared/tools/background-tools.ts');
    expect(bg).not.toContain('generate_3d_status');
    expect(bg).toContain('check_generation_status');
  });
});

describe('a form must be able to change what happens', () => {
  it('request_input tells the model not to ask for something no parameter takes', () => {
    const src = read('supabase/functions/_shared/tools/input-request-tools.ts');
    expect(src).toContain('EVERY field must map to something you can actually do with the answer');
  });
});
