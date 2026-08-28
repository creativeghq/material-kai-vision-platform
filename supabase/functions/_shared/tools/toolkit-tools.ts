/**
 * Toolkit meta-tool — lets the agent dynamically pull in more capabilities
 * mid-conversation when the user's request needs tools that aren't currently
 * bound.
 *
 * load_toolkit: takes a toolkit_id and calls the host-supplied `applyToolkit`
 * loader, which instantiates that cluster's tools and appends them to the LIVE
 * tool list for THIS run. Because the agent graph re-binds tools on every
 * iteration, the freshly-loaded tools are usable in the SAME turn — there is no
 * longer a two-turn "please re-send" dance. The tool still emits a
 * `toolkit_loaded` chunk so the frontend can persist the toolkit onto the
 * conversation for future turns.
 *
 * RBAC + per-agent ownership are enforced inside the loader (admin-only clusters never bind
 * for non-admins; a toolkit a given agent doesn't own is rejected with a message that NAMES
 * the agent which does own it, derived from AGENT_CONFIGS). The toolkit→tool mapping lives in
 * agent-chat's SERVER_TOOLKITS — this file no longer keeps its own copy.
 *
 * `availableToolkitIds` MUST already be filtered to what this agent can load — it reaches the
 * model through both the description and the schema `.describe()`, so anything extra is a menu
 * entry that can only produce a refusal (#380: 5 of 14 calls, all of them that shape).
 */

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');

type ChunkSink = ((chunk: any) => void) | undefined;

/** Result returned by the host loader. */
export interface ApplyToolkitResult {
  success: boolean;
  tool_ids?: string[];
  toolkit_name?: string;
  error?: string;
}

export type ApplyToolkitFn = (toolkitId: string) => Promise<ApplyToolkitResult>;

export const createLoadToolkitTool = (
  isAdmin: boolean,
  onChunk: ChunkSink,
  applyToolkit: ApplyToolkitFn,
  availableToolkitIds: string[],
) => {
  return tool(
    async (input: { toolkit_id: string }) => {
      const res = await applyToolkit(input.toolkit_id);

      if (!res.success) {
        return JSON.stringify({
          success: false,
          error: res.error || `Could not load toolkit "${input.toolkit_id}".`,
          available_toolkits: availableToolkitIds,
        });
      }

      // Tell the frontend to persist this toolkit onto the conversation so
      // future turns bind it up-front (the tools are ALREADY live this turn).
      try {
        onChunk?.({
          type: 'toolkit_loaded',
          toolkit_id: input.toolkit_id,
          toolkit_name: res.toolkit_name || input.toolkit_id,
          tool_ids: res.tool_ids || [],
        });
      } catch { /* stream may be closed */ }

      return JSON.stringify({
        success: true,
        toolkit_id: input.toolkit_id,
        tools_added: res.tool_ids || [],
        message:
          `Loaded the "${res.toolkit_name || input.toolkit_id}" toolkit — its tools are now available in THIS turn. ` +
          `Continue with the user's request immediately; do NOT ask the user to re-send.`,
      });
    },
    {
      name: 'load_toolkit',
      description:
        'Load an additional toolkit (cluster of tools) so you can use it. Call this when the user\'s request needs capabilities that aren\'t in your currently bound toolset. ' +
        'The tools become available IMMEDIATELY in the same turn — after calling this, proceed directly to using the tool you needed. Never tell the user to re-send. ' +
        `Available toolkits: ${availableToolkitIds.join(', ')}.`,
      schema: z.object({
        toolkit_id: z.string().describe(`One of: ${availableToolkitIds.join(', ')}`),
      }),
    },
  );
};
