/** Every generated result in a conversation, in order, so any generator can take any earlier one as its input. Import-free. */

export type ConversationMediaKind = 'image' | 'staging' | 'board' | 'video';

export interface ConversationMedia {
  kind: ConversationMediaKind;
  url: string;
  /** What produced it, for the agent's context line ("image-edit", "scene-render", "virtual staging"). */
  label: string;
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | null => (v && typeof v === 'object' ? v as Rec : null);
const str = (v: unknown): string | null => (typeof v === 'string' && /^https?:\/\//.test(v) ? v : null);

/** A result travels on the message itself during a live session and under `metadata` once restored from the DB. */
function field(m: Rec, key: string): Rec | null {
  return rec(m[key]) ?? rec(rec(m.metadata)?.[key]);
}

export function collectConversationMedia(messages: unknown[]): ConversationMedia[] {
  const out: ConversationMedia[] = [];
  const seen = new Set<string>();
  const add = (kind: ConversationMediaKind, url: string | null, label: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ kind, url, label });
  };
  for (const raw of messages) {
    const m = rec(raw);
    if (!m || m.role !== 'assistant') continue;
    const gem = field(m, 'geminiImageData');
    if (gem) add('image', str(gem.image_url), String(gem.mode ?? 'generated image'));
    const staged = field(m, 'virtualStagingData');
    if (staged) add('staging', str(staged.image_url), 'virtual staging');
    const board = field(m, 'materialsBoardData');
    if (board) add('board', str(board.image_url), 'materials board');
    if (Array.isArray(m.tool_results)) {
      for (const tr of m.tool_results) add('image', str(rec(tr)?.image_url), 'tool result');
    }
    const video = field(m, 'videoData');
    if (video) add('video', str(video.video_url), String(video.video_type ?? 'video'));
  }
  return out;
}

/** The stills an image tool can take as its source, oldest first. */
export const stillsOf = (media: ConversationMedia[]): string[] => media.filter((x) => x.kind !== 'video').map((x) => x.url);

/** The [CONTEXT] block: the last few results by kind, so the agent can pass the one the user means. */
export function conversationMediaContext(media: ConversationMedia[], max = 6): string {
  if (!media.length) return '';
  const recent = media.slice(-max);
  const lines = recent.map((x, i) => `${i + 1}. ${x.kind} (${x.label}): ${x.url}`);
  return `[CONTEXT] Results generated earlier in this conversation, oldest first (last ${recent.length} of ${media.length}):\n${lines.join('\n')}\n`
    + 'Any of them can be the input of the next generator: pass the one the user means as source_image_url (or image_url for manage_scenes). '
    + 'With no URL, image tools use the newest still. A request to modify the design without a new upload is an image-edit of the newest still.';
}

export type MediaSourceChoice = 'auto' | 'my_upload' | 'last_generated';

export interface ResolvedMediaSource {
  url?: string;
  /** How to describe the choice to the user. Always set, including when nothing was found. */
  origin: string;
}

export function resolveMediaSource(opts: {
  sourceImageUrl?: string;
  source?: MediaSourceChoice;
  conversationImages: string[];
  uploadedRoom?: string;
}): ResolvedMediaSource {
  const lastGenerated = opts.conversationImages[opts.conversationImages.length - 1];
  if (opts.sourceImageUrl) return { url: opts.sourceImageUrl, origin: 'a URL supplied in the tool call' };
  if (opts.source === 'my_upload' && opts.uploadedRoom) return { url: opts.uploadedRoom, origin: 'the photo the user attached' };
  if (lastGenerated) return { url: lastGenerated, origin: 'the image generated most recently in this conversation' };
  if (opts.uploadedRoom) return { url: opts.uploadedRoom, origin: 'the photo the user attached' };
  return { url: undefined, origin: 'no image was available' };
}
