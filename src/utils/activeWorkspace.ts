// Shared accessor for the active workspace id that WorkspaceContext persists, for non-hook code.

export const ACTIVE_WORKSPACE_KEY = (userId: string) => `mk_active_workspace_${userId}`;

export function getActiveWorkspaceId(userId: string | null | undefined): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(ACTIVE_WORKSPACE_KEY(userId));
  } catch {
    return null;
  }
}

let requestWorkspaceId: string | null = null;

/** Set by WorkspaceContext; sent as `x-workspace-id` on PostgREST calls, where `stamp_workspace_id` reads it. */
export function setRequestWorkspaceId(id: string | null): void {
  requestWorkspaceId = id;
}

export function getRequestWorkspaceId(): string | null {
  return requestWorkspaceId;
}
