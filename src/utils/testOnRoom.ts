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
