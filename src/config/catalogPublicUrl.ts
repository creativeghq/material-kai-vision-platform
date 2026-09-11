/**
 * Where a published catalog lives, in one place.
 *
 * The path is workspace-scoped — `/c/<workspace handle>/<catalog slug>`. A flat `/c/<slug>` made
 * the slug unique across the PLATFORM, so the second tenant to publish
 * "monoblock-air-conditioner-8000-btu" silently got it back with `-4821` glued on: a URL nobody
 * chose, on a page that goes to customers. Import-free so `vocab:mirror` can byte-copy it to Deno;
 * nine call sites used to build this string by hand across both runtimes.
 */

/** First segment of the pair. Mirrors `workspaces.public_handle`'s CHECK constraint. */
export const WORKSPACE_HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** The path, relative to the app origin. */
export function catalogPublicPath(handle: string | null | undefined, slug: string | null | undefined): string | null {
  if (!handle || !slug) return null;
  return `/c/${handle}/${slug}`;
}

/** The full link — what goes in an email, a PDF footer or an agent reply. */
export function catalogPublicUrl(
  origin: string,
  handle: string | null | undefined,
  slug: string | null | undefined,
): string | null {
  const path = catalogPublicPath(handle, slug);
  if (!path) return null;
  return `${origin.replace(/\/$/, '')}${path}`;
}

/**
 * Normalise anything typed into a handle field. Shared with `set_workspace_public_handle`, which
 * normalises rather than refusing: "Materials Hub" becomes `materials-hub` instead of a CHECK
 * violation the form then has to explain.
 */
export function normalizeWorkspaceHandle(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');
}
