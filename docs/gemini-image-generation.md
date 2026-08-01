# Gemini image generation — patterns and reusable building blocks

How we generate images programmatically inside Supabase edge functions — for static admin assets (reference images, hero illustrations, system-generated thumbnails) and for user-facing flows. This doc is the canonical reference; copy the pattern when you need to add another image-generation endpoint.

Last reviewed 2026-05-02.

---

## Models, costs, response format

| Model | Speed | Quality | Credits per image (per ai_model_pricing) | When to use |
|---|---|---|---|---|
| `gemini-3.1-flash-image-preview` | ~5–10 s | Good | 6 | Default. Static admin assets, throwaway previews, user-facing where speed matters more than 4K detail. |
| `gemini-3-pro-image-preview` | ~15–30 s | Excellent (~4K) | 15 | Hero / cover images, anything the client will actually print. |

Endpoint format (REST, no SDK needed):

```
POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent?key=<GOOGLE_API_KEY>
```

Request body:

```json
{
  "contents": [{ "role": "user", "parts": [{ "text": "<your prompt>" }] }],
  "generationConfig": { "responseModalities": ["IMAGE"] }
}
```

Response shape (the relevant part):

```
data.candidates[0].content.parts[].inlineData = { mimeType, data: "<base64>" }
```

Gemini returns either `image/png` or `image/jpeg` based on its own choice — **always read `inlineData.mimeType` from the response and pass it through to your storage upload**, never hardcode a content type.

## Required environment

`GOOGLE_API_KEY` must be set on the Supabase edge functions environment. Some older functions also accept `GOOGLE_GENERATIVE_AI_API_KEY` as a fallback name; new code should accept either:

```ts
const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY');
```

---

## The minimal call (copy-paste skeleton)

```ts
async function generateImage(
  prompt: string,
  model: 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview' = 'gemini-3.1-flash-image-preview',
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 500)}`);

  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
  if (!part) throw new Error('No image data in response');

  const base64: string = part.inlineData.data;
  const mimeType: string = part.inlineData.mimeType || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mimeType };
}
```

That's the whole pattern — no SDK, no auth dance, just a fetch and a base64 decode.

## Multi-image / image-edit flows

If you need to feed reference images alongside the prompt (style transfer, room editing, dual-reference), the shared helper at [`supabase/functions/_shared/ai-client.ts:398`](../supabase/functions/_shared/ai-client.ts) (`generateImageWithGemini`) handles that. Look at [`generate-interior-gemini`](../supabase/functions/generate-interior-gemini/) for a comprehensive working example covering text-to-image, single-reference edit, and dual-reference style-transfer.

---

## Reference implementation: `seed-sheet-references`

> **The source is gone.** `supabase/functions/seed-sheet-references/` does not exist in this
> repo — the slug is still deployed but cannot be read, changed or redeployed, and its
> output bucket `moodboard-sheet-references` is **empty**, so it has never successfully
> seeded. Verified 2026-08-01 (audit #298 finding 25). The description below is kept as a
> design record; do not link it as a working example to copy.

A one-shot admin endpoint that generates 8 static reference images (one per moodboard sheet
type) and uploads them into the public `moodboard-sheet-references` bucket.

### What it does

1. Receives `POST { types?: string[], model?: 'flash'|'pro', overwrite?: boolean }`.
2. Authenticates via `x-admin-secret` header against `SUPABASE_SERVICE_ROLE_KEY` (so only operators can call it; not user-callable).
3. For each requested sheet type:
   - Skip if the file already exists in the bucket and `overwrite` is false.
   - Call Gemini `generateContent` with a **curated prompt** that describes the visual layout of that specific sheet type (chip grid, swatch row, lighting plan diagram, etc.).
   - Receive base64 inlineData + mimeType in the response.
   - Decode and upload to `moodboard-sheet-references/<sheet_type>.png` with the actual mimeType from the response.
4. Returns a JSON summary of what was uploaded / skipped / failed.

### Key prompt-engineering notes

- The prompt must describe **the page itself, not the room** — "a photograph of a designer's presentation board, A3 landscape, 4×2 chip grid, ..." rather than "a kitchen with brass fixtures". This is the difference between a useful reference image and a generic interior render.
- Always include "no people" if you don't want incidental humans in shot (Gemini sometimes adds them).
- Specify "editorial photography style" or "architectural drafting style" — gives Gemini a clear aesthetic anchor.
- Specify aspect ratio in the prompt language ("A3 landscape" — Gemini reads this from the words even though we don't pass `aspectRatio` for the REST endpoint).
- Hard-coded fixture symbols, hex codes, or label text help Gemini render diagrams more faithfully.

### Calling it

```bash
# All 8, skip existing
curl -X POST https://<project-ref>.supabase.co/functions/v1/seed-sheet-references \
  -H "x-admin-secret: <SUPABASE_SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"flash","overwrite":false}'

# Subset, force regenerate
curl -X POST https://<project-ref>.supabase.co/functions/v1/seed-sheet-references \
  -H "x-admin-secret: <SUPABASE_SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"types":["material_board","color_palette"],"model":"pro","overwrite":true}'
```

The function takes ~10 s per `flash` image, ~25 s per `pro` image. Edge runtime has a **150 s response idle timeout** that often fires before the call completes, but **the function continues running on the backend until done** — files appear in the bucket as they're uploaded one by one. Re-list the bucket after the timeout to confirm completion. Don't retry on `IDLE_TIMEOUT` unless storage actually shows missing files.

---

## When to spin up a new image-generation endpoint

If you have a NEW image-generation use case, ask first:

1. **Is it user-driven and per-request?** (e.g. "generate a hero image for this listing")
   → Build a normal user-callable edge function with credit gating via `debit_user_credits`. Look at `generate-interior-gemini`, `generate-social-image`, or `generate-pbr-maps` for templates.

2. **Is it static admin content?** (e.g. "generate the platform's cover graphic for this email template")
   → Copy the `seed-sheet-references` pattern. Admin-secret gate, idempotent (skip-if-exists by default), curated prompts in code, write to a public-read bucket excluded from `reset-platform`.

3. **Is it batch processing?** (e.g. "regenerate every product hero overnight")
   → Background-agent pattern, NOT a synchronous edge function. Look at the `background-agent-runner` and `_shared/agents/*` directory.

## Buckets convention (post-consolidation 2026-05-23)

Storage now lives in 6 anchor buckets — see [CLAUDE.md](../CLAUDE.md) "Storage Buckets" for the canonical map. New features should pick the right anchor + folder rather than creating a new bucket:

- **Static admin-curated reference images** → `moodboard-sheet-references` (the platform's `<feature>-references` pattern collapsed into this single bucket). It's a public bucket and `reset-platform` does not clear it.
- **AI-generated or chat-uploaded media** → `generation-images` under a `<feature>/` prefix (e.g. `social/`, `product-crops/`, `3d/`, `designer/`, `agent/`).
- **Generated PDFs** → `pdf-documents` under `<feature>-output/` (e.g. `quote-output/`, `catalog-output/`, `moodboard-output/`). Private bucket; use `storage.from('pdf-documents').createSignedUrl(path, 60*60*24*7)` for client access.
- **Admin-managed templates** → `quote-templates` (private, admin-RW). Use a `<feature>/` prefix to separate template sets.

Patterns to follow:
- A BEFORE DELETE trigger on the owning row to clean up storage when the row is deleted (see `_cleanup_moodboard_sheet_storage`, `_cleanup_quote_pdf_storage` for the canonical pattern — both now target `pdf-documents`).
- Stop persisting full URLs in DB rows; store only the storage path and re-derive a fresh signed URL on each read.

## Pitfalls we've hit

- **`responseModalities: ["IMAGE"]` is required.** Without it, Gemini returns a description of what the image would look like rather than the image itself.
- **`role: 'user'` is required** in `contents[].role` — leaving it off works in some SDK paths but not the raw REST endpoint.
- **Don't hardcode `image/png`** as the upload content-type — Gemini sometimes returns JPEG. Use the mimeType from the response. (We hit this in v1 of the seed function, see git history for the fix.)
- **Edge timeout != function timeout.** The edge runtime gives up waiting at 150s but the function keeps running. Build idempotent functions and re-check state via storage list / DB query rather than assuming a timeout means failure.
- **No streaming for image responses.** The `:streamGenerateContent` endpoint exists but doesn't return useful chunks for IMAGE modality — stick with the standard `:generateContent`.

## See also

- [`docs/moodboard-presentation-sheets.md`](moodboard-presentation-sheets.md) — the feature that drove the seed-sheet-references function.
- [`supabase/functions/generate-interior-gemini/`](../supabase/functions/generate-interior-gemini/) — the production-grade Gemini integration with all editing modes.
- [`supabase/functions/_shared/ai-client.ts`](../supabase/functions/_shared/ai-client.ts) — the shared `generateImageWithGemini` helper for image-edit flows.
