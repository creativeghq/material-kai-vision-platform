/** What each Claude model accepts. Twin of mivaa `app/services/core/claude_models.py`. */

export const CLAUDE_OPUS = 'claude-opus-5-5';
export const CLAUDE_SONNET = 'claude-sonnet-5-5';
export const CLAUDE_HAIKU = 'claude-haiku-5-5';

/** `tool_choice` `any`/`tool` is a 400 on these. */
const REJECTS_FORCED_TOOL_CHOICE = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-mythos-5-1'];
/** Thinking cannot be disabled; effort is the only control. */
const ALWAYS_THINKS = ['claude-opus-5-5'];
/** `disabled` is a 400; `between_tools` is the no-thinking setting. */
const BETWEEN_TOOLS = ['claude-sonnet-5-5'];
/** Thinks by default where its predecessor did not, so an unset `thinking` is turned off. */
const THINKING_OFF_UNLESS_ASKED = ['claude-haiku-5-5'];
const ACCEPTS_SAMPLING: string[] = [];

const THINKING_OFF_EFFORTS = new Set<string | undefined>([undefined, 'low', 'medium', 'high']);
const SAMPLING_KEYS = ['temperature', 'top_p', 'top_k'];

const is = (model: string, family: string[]) => family.some((m) => model.startsWith(m));

export const rejectsForcedToolChoice = (model: string) => is(model, REJECTS_FORCED_TOOL_CHOICE);
export const acceptsSamplingParams = (model: string) => is(model, ACCEPTS_SAMPLING);

function appendSystem(system: unknown, text: string): unknown {
  if (!system) return text;
  if (Array.isArray(system)) return [...system, { type: 'text', text }];
  return `${system}\n\n${text}`;
}

/**
 * A Messages API body rewritten into the form its model accepts.
 *
 * A forced tool becomes `auto` plus an instruction naming it, so the caller's own
 * "no tool_use block" check still decides whether the call worked.
 */
export function shapeClaudeRequest<T extends Record<string, unknown>>(body: T): T {
  const out: Record<string, unknown> = { ...body };
  const model = String(out.model ?? '');
  const outputConfig = { ...((out.output_config as Record<string, unknown>) ?? {}) };
  const effort = outputConfig.effort as string | undefined;
  const thinking = out.thinking as { type?: string } | undefined;

  if (!acceptsSamplingParams(model)) for (const k of SAMPLING_KEYS) delete out[k];

  if (thinking === undefined && is(model, THINKING_OFF_UNLESS_ASKED) && THINKING_OFF_EFFORTS.has(effort)) {
    out.thinking = { type: 'disabled' };
  } else if (thinking?.type === 'disabled') {
    if (is(model, ALWAYS_THINKS)) {
      delete out.thinking;
      out.output_config = { ...outputConfig, effort: effort ?? 'low' };
    } else if (is(model, BETWEEN_TOOLS)) {
      if (THINKING_OFF_EFFORTS.has(effort)) out.thinking = { type: 'between_tools' };
      else delete out.thinking;
    }
  }

  const toolChoice = out.tool_choice as { type?: string; name?: string; disable_parallel_tool_use?: boolean } | undefined;
  if ((toolChoice?.type === 'any' || toolChoice?.type === 'tool') && rejectsForcedToolChoice(model)) {
    // A forced call never thought first; budgets sized for that would be spent on thinking.
    if (thinking === undefined && is(model, BETWEEN_TOOLS) && THINKING_OFF_EFFORTS.has(effort)) {
      out.thinking = { type: 'between_tools' };
    } else if (thinking === undefined && is(model, ALWAYS_THINKS) && effort === undefined) {
      out.output_config = { ...outputConfig, effort: 'low' };
    }
    out.tool_choice = {
      type: 'auto',
      ...(toolChoice.disable_parallel_tool_use !== undefined
        ? { disable_parallel_tool_use: toolChoice.disable_parallel_tool_use }
        : {}),
    };
    out.system = appendSystem(
      out.system,
      toolChoice.name
        ? `Answer by calling the \`${toolChoice.name}\` tool. Do not reply in text.`
        : 'Answer by calling one of the provided tools. Do not reply in text.',
    );
  }
  return out as T;
}

/**
 * `bindTools` options forcing `name`, or `auto` where forcing is a 400 — pair it with
 * `toolInstruction` in the prompt, and keep treating a reply with no tool call as a failure.
 */
export function langchainToolChoice(
  model: string,
  name: string,
): { tool_choice: 'auto' | { type: 'tool'; name: string } } {
  return { tool_choice: rejectsForcedToolChoice(model) ? 'auto' : { type: 'tool', name } };
}

export const toolInstruction = (name: string) => `Answer by calling the \`${name}\` tool. Do not reply in text.`;

/** ChatAnthropic fields: Haiku 5.5 thinks by default, and its callers were sized for a model that did not. */
export function langchainThinking(model: string): { thinking?: { type: 'disabled' } } {
  return is(model, THINKING_OFF_UNLESS_ASKED) ? { thinking: { type: 'disabled' } } : {};
}

/** AI SDK `providerOptions`, same reason. */
export function aiSdkClaudeOptions(model: string): { anthropic: { thinking: { type: 'disabled' } } } | undefined {
  return is(model, THINKING_OFF_UNLESS_ASKED) ? { anthropic: { thinking: { type: 'disabled' } } } : undefined;
}
