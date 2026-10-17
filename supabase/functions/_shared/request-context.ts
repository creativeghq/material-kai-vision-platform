import { AsyncLocalStorage } from 'node:async_hooks';

/** Per-request facts the auth helpers need without threading them through every call. withApiLogging opens one scope per request. */
export interface RequestContext {
  /** Set by authenticate() for a kai_ key: the one workspace that key may act in. */
  keyWorkspaceId?: string | null;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/** The workspace an API-key caller is fenced to, or null for every other caller. */
export function keyWorkspaceFence(): string | null {
  return requestContext.getStore()?.keyWorkspaceId ?? null;
}
