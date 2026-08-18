/**
 * `request_input` — the agent's structured way to ask for something (issue #370, Class D).
 *
 * WHY THIS EXISTS. The mechanism for an interactive follow-up was half-built. The b2b-research
 * workflow already declares `awaits_user_input: true` with an `input_schema`; AgentHub already
 * HANDLES a `workflow_step_input_request` chunk and already RENDERS a form from it. Nothing in
 * `supabase/functions/` has ever emitted that chunk — `createWorkflowEmitter` has `plan()`,
 * `step()` and `finished()` and no input request — so the form only ever appeared via the
 * frontend-local path when the picker launched a workflow. An agent answering a free-form message
 * had no structured channel at all, so every follow-up degraded to a wall of markdown in the chat.
 * That is what the user saw twice in conversation 96da9fc8, and it was the only thing the agent
 * could do.
 *
 * WHAT IT IS NOT. This is NOT the confirmation gate. Approving a spend, a send, or a fiscal
 * document stays with `action_confirmation` and invariant 9. `request_input` collects SCOPE, and
 * scope is never a gate:
 *
 *   - it is DISMISSIBLE, always. The card renders a "decide for me" control that hands the turn
 *     back with permission to proceed on defaults. A question the user cannot wave away is a gate,
 *     and gates are the failure the operating doctrine exists to prevent.
 *   - it is for parameters that genuinely change the work. The doctrine says a parameter the tool
 *     marks optional is not a question; this tool does not exempt the agent from that. It is for
 *     the case where the answer really does change what gets built — not for collecting a country
 *     the tool would have defaulted for you.
 *
 * The fields reuse the frontend's `ToolkitFormField` shape, so a `country` field renders the real
 * sourcing-market vocabulary and an `enum` renders the real values — the same renderers the
 * quick-start forms use, rather than a second set that can drift from them.
 */

// `tool` is typed non-generically ON PURPOSE — see the note in toolkit-tools.ts. Inferring it
// pulls @langchain/core's generic graph in and blows the edge typecheck heap.
const { tool } = await import('npm:@langchain/core@1.1.15/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  ) => any;
};
const { z } = await import('npm:zod@3.24.0');

type ChunkSink = ((chunk: any) => void) | undefined;

export const createRequestInputTool = (onChunk: ChunkSink) => {
  return tool(
    async (input: {
      title: string;
      prompt?: string;
      fields: Array<{
        key: string;
        label: string;
        kind?: string;
        required?: boolean;
        placeholder?: string;
        help?: string;
        default?: string;
        options?: Array<{ value: string; label: string }>;
      }>;
      submit_label?: string;
    }) => {
      const requestId = crypto.randomUUID();

      // Guard the shape here rather than trusting the model: a field with no key cannot round-trip
      // an answer, and a card with no fields is a question wearing a form's clothes.
      const fields = (input.fields ?? []).filter((f) => f && typeof f.key === 'string' && f.key.trim());
      if (!fields.length) {
        return JSON.stringify({
          success: false,
          error: 'request_input needs at least one field with a `key`. If you have nothing concrete '
            + 'to collect, do not ask — proceed on the defaults and say what you assumed.',
        });
      }

      try {
        onChunk?.({
          type: 'input_request',
          request_id: requestId,
          title: input.title,
          prompt: input.prompt ?? '',
          fields,
          submit_label: input.submit_label ?? 'Run it',
          timestamp: Date.now(),
        });
      } catch {
        // Stream already closed — the card cannot be shown, so say so rather than reporting that
        // a question was asked. An agent that believes it asked will sit waiting for an answer
        // that can never arrive.
        return JSON.stringify({
          success: false,
          error: 'The input form could not be displayed. Proceed on sensible defaults and state your assumptions.',
        });
      }

      // The turn ENDS here. The answers arrive as the user's next message, so anything written
      // after this call is text the user reads underneath a form they have not filled in yet.
      return JSON.stringify({
        success: true,
        request_id: requestId,
        asked: fields.map((f) => f.key),
        instruction: 'The form is on screen. STOP now — do not restate these questions in prose and '
          + 'do not guess the answers. Write at most one short line telling the user the form is there. '
          + 'Their answers, or their instruction to proceed with defaults, arrive as the next message.',
      });
    },
    {
      name: 'request_input',
      description:
        'Ask the user for specific values using an interactive form on the canvas, instead of asking '
        + 'in prose. Use ONLY when the answer genuinely changes what you would build and you cannot '
        + 'proceed sensibly on defaults — a parameter the tool marks optional is not a reason to ask. '
        + 'NOT a confirmation gate: approving a spend, a send or a document stays with the confirm '
        + 'flow. The user can always dismiss the form and tell you to decide, so never treat it as a '
        + 'precondition. After calling it, stop and wait — do not repeat the questions in your reply.',
      schema: z.object({
        title: z.string().describe('Short heading for the form, e.g. "Scope the manufacturer sweep".'),
        prompt: z.string().optional().describe('One sentence of context shown above the fields.'),
        fields: z.array(z.object({
          key: z.string().describe('Identifier for the answer, e.g. "segment".'),
          label: z.string().describe('Field label shown to the user.'),
          kind: z.enum(['text', 'textarea', 'number', 'select', 'country', 'country_code', 'tags'])
            .optional()
            .describe('Input type. "country" renders the platform\'s sourcing markets; "select" needs `options`.'),
          required: z.boolean().optional().describe('Default false. Prefer optional fields — the user can always skip.'),
          placeholder: z.string().optional(),
          help: z.string().optional().describe('Small print under the field.'),
          default: z.string().optional().describe('Pre-filled value. Use the default you WOULD have proceeded with.'),
          options: z.array(z.object({ value: z.string(), label: z.string() })).optional()
            .describe('Required when kind is "select".'),
        })).describe('The values to collect. Keep it to the few that actually change the work.'),
        submit_label: z.string().optional().describe('Button text, e.g. "Run the sweep". Defaults to "Run it".'),
      }),
    },
  );
};
