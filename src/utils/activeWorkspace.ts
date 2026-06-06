// Shared accessor for the active workspace id that WorkspaceContext persists.
// Lets non-hook code (services) stamp new rows with the workspace the user is
// actually in, instead of relying on the server-side root default. The durable
// fix is an X-Workspace-Id header / JWT claim; this closes the gap client-side.

export const ACTIVE_WORKSPACE_KEY = (userId: string) => `mk_active_workspace_${userId}`;

export function getActiveWorkspaceId(userId: string | null | undefined): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(ACTIVE_WORKSPACE_KEY(userId));
  } catch {
    return null;
  }
}
