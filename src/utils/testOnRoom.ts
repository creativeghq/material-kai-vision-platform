/**
 * "Test on a room" deep-link builder.
 *
 * Single source of truth for the product-page → Interior Designer agent
 * hand-off. Both ProductCard and ProductDetailModal use this so the URL
 * contract (parsed in src/pages/AgentHub.tsx) lives in one place.
 *
 * The target page parses `agent` + `pinned_product_*` + `prompt`, pre-pins the
 * material into the Interior agent's tray, and auto-sends the seeded prompt so
 * the agent immediately asks the user to upload a room photo.
 */
export function buildTestOnRoomUrl(args: {
  productId: string;
  productName: string;
  productImage?: string;
}): string {
  const { productId, productName, productImage } = args;
  const params = new URLSearchParams({
    agent: 'interior-designer',
    pinned_product_id: productId,
    pinned_product_name: productName,
    prompt:
      `I want to see "${productName}" applied on a real room. ` +
      'I\'ll upload a photo of my room — apply this material onto a surface ' +
      '(floor or wall) and show me the result, keeping everything else in place.',
  });
  if (productImage) params.set('pinned_product_image', productImage);
  return `/agent-hub?${params.toString()}`;
}

/**
 * "Build with this product" deep-link builder.
 *
 * Sibling of `buildTestOnRoomUrl`, and deliberately the same contract — AgentHub
 * already parses `agent`, `pinned_product_*`, `generation_mode` and `prompt`, so this
 * needs no new plumbing on the receiving end.
 *
 * The difference is direction. "Test on a room" takes a MATERIAL and puts it onto the
 * user's room photo. These take the PRODUCT ITSELF and photograph it:
 *
 *   product-shot      the product alone on seamless white — a catalog hero image
 *   product-lifestyle the product staged in a styled room
 *   material-texture  the material as a seamless, tileable swatch
 *
 * All three have existed in generate_gemini since it shipped, each with its own prompt
 * builder, and nothing in the product could reach them — no button, no quick-start.
 *
 * `generation_mode` is pinned rather than left to the agent to infer: the mode decides
 * which prompt builder runs, and "make me a shot of this chair" is not reliably
 * distinguishable in prose from "put this chair in a room".
 */
export type ProductStudioMode = 'product-shot' | 'product-lifestyle' | 'material-texture';

export function buildProductStudioUrl(args: {
  productId: string;
  productName: string;
  productImage?: string;
  mode: ProductStudioMode;
}): string {
  const { productId, productName, productImage, mode } = args;

  const prompt =
    mode === 'product-shot'
      ? `Render a catalog hero shot of "${productName}" on a seamless white background, ` +
        'true to its real materials, finish and proportions.'
      : mode === 'product-lifestyle'
        ? `Stage "${productName}" in a styled room and photograph it as a lifestyle shot, ` +
          'keeping the product itself exactly as it is.'
        : `Create a seamless, tileable texture swatch of "${productName}" that can be applied ` +
          'to a surface in a render.';

  const params = new URLSearchParams({
    agent: 'interior-designer',
    pinned_product_id: productId,
    pinned_product_name: productName,
    generation_mode: mode,
    prompt,
  });
  if (productImage) params.set('pinned_product_image', productImage);
  return `/agent-hub?${params.toString()}`;
}
