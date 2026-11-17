/**
 * Shared context passed to all tool factory functions.
 * All dependencies are injected explicitly — no global singletons in tool files.
 */
export interface ToolContext {
  userId: string;
  workspaceId: string;
  supabaseUrl: string;
  supabaseKey: string;
  sendProgress?: (status: string) => void;
  onChunk?: (chunk: any) => void;
  conversationId?: string;
}
