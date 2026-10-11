/** Vision check of a site photo: an article prints what the image shows, never the stored alt (it can be wrong). */

import type { DbClient } from '../../_shared/supabase-client.ts';
import { callClaudeMessages } from '../../_shared/ai-client.ts';
import { getToolPrompt } from '../../_shared/prompt-utils.ts';
import { fetchImageGuardedOrNull } from '../../_shared/fetch-image.ts';
import type { PageImage } from '../../_shared/page-images.ts';
import { serpValue } from './untrusted.ts';

export const PHOTO_VERIFY_MODEL = 'claude-haiku-4-5';
export const PHOTO_VERIFY_MAX_INPUT_TOKENS = 2500;
export const PHOTO_VERIFY_MAX_OUTPUT_TOKENS = 300;

const LANGUAGE_NAMES: Record<string, string> = {
  el: 'Greek', en: 'English', de: 'German', fr: 'French', it: 'Italian', es: 'Spanish', nl: 'Dutch', pt: 'Portuguese',
};
const VISION_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const SCHEMA = {
  type: 'object',
  properties: {
    description: { type: 'string' },
    site_description_accurate: { type: 'boolean' },
  },
  required: ['description', 'site_description_accurate'],
  additionalProperties: false,
};

export interface PhotoUsage { model: string; inputTokens: number; outputTokens: number }

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** What the photo shows, in `languageCode`, or null when it could not be checked (never a guess). */
export async function verifyPhoto(
  supabase: DbClient,
  img: PageImage,
  languageCode: string,
  who: { userId: string; workspaceId: string | null },
): Promise<{ seen: { text: string; site_alt_ok: boolean } | null; usage: PhotoUsage | null }> {
  const file = await fetchImageGuardedOrNull(img.src, { maxBytes: MAX_IMAGE_BYTES, timeoutMs: 10_000 });
  if (!file || !VISION_MIME.has(file.mimeType)) return { seen: null, usage: null };

  const res = await callClaudeMessages({
    model: PHOTO_VERIFY_MODEL,
    max_tokens: PHOTO_VERIFY_MAX_OUTPUT_TOKENS,
    system: await getToolPrompt(supabase, 'seo_photo_verify'),
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: file.mimeType, data: toBase64(file.bytes) } },
        {
          type: 'text',
          text: `Language: ${LANGUAGE_NAMES[languageCode] ?? languageCode}\n`
            + `<site_description>${serpValue(img.alt, 300)}</site_description>`,
        },
      ],
    }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  }, { task: 'seo_photo_verify', userId: who.userId, workspaceId: who.workspaceId, timeoutMs: 30_000 });

  const usage: PhotoUsage = {
    model: PHOTO_VERIFY_MODEL,
    inputTokens: Number(res.usage?.input_tokens ?? 0),
    outputTokens: Number(res.usage?.output_tokens ?? 0),
  };
  // A refusal or an unparseable reply is a failed check, never a description to salvage.
  if (res.stop_reason === 'refusal') return { seen: null, usage };
  try {
    const out = JSON.parse(res.content?.find((b) => b.type === 'text')?.text ?? '');
    const text = String(out?.description ?? '').trim();
    if (!text || typeof out?.site_description_accurate !== 'boolean') return { seen: null, usage };
    return { seen: { text: text.slice(0, 300), site_alt_ok: out.site_description_accurate }, usage };
  } catch {
    return { seen: null, usage };
  }
}
