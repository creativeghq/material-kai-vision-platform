/**
 * What a chat turn looks like to the user: their message, ONE reply, and the result cards the
 * turn produced attached under that reply. Shared by every agent and toolkit, so no tool can
 * put its working on screen as if the agent had said it.
 */

export interface TurnMessage {
  id: string;
  role: string;
  content?: unknown;
  agentResultData?: { title?: string };
  seoGenericData?: unknown;
  actionConfirmationData?: unknown;
  inputRequestData?: unknown;
}

/** The chat line a result card is saved under ("seo my rankings card: result rendered above."). */
export const ARTIFACT_PLACEHOLDER = /: result rendered above\.$/;

/** The model's own lookups — reader names, endpoint lists, raw JSON. Never the answer. */
export const INTERNAL_RESULT_TYPES: ReadonlySet<string> = new Set([
  'platform_api_matches', 'platform_api_result', 'platform_data_matches', 'platform_data_result',
]);

const proseOf = (content: unknown): string => (typeof content === 'string' ? content : '').trim();

/** A result card's own row, not something the agent SAID — it never goes back to the model as prose. */
export function isResultCardRow(m: TurnMessage): boolean {
  if (m.role !== 'assistant') return false;
  const prose = proseOf(m.content);
  return ARTIFACT_PLACEHOLDER.test(prose)
    || (!!m.agentResultData && (prose === '' || prose === (m.agentResultData.title ?? '').trim()))
    || (!!m.seoGenericData && prose === '');
}

/** Waiting on the user — stays where it is, never folded under a reply. */
const awaitsUser = (m: TurnMessage) => !!m.actionConfirmationData || !!m.inputRequestData;

/**
 * Which cards attach under which reply. `artifactTitle` answers "is this a canvas artifact, and
 * what is it called" — null for plain prose.
 */
export function layoutTurns<M extends TurnMessage>(
  messages: readonly M[],
  artifactTitle: (m: M) => string | null,
): { attached: Map<string, M[]>; absorbed: Set<string> } {
  const attached = new Map<string, M[]>();
  const absorbed = new Set<string>();
  let turn: M[] = [];
  const close = () => {
    const reply = [...turn].reverse().find((m) => {
      if (awaitsUser(m) || isResultCardRow(m)) return false;
      const prose = proseOf(m.content);
      const title = artifactTitle(m);
      return prose !== '' && (title === null || prose !== title.trim());
    });
    if (reply) {
      const cards = turn.filter((m) => m !== reply && artifactTitle(m) !== null && !awaitsUser(m));
      if (cards.length > 0) {
        attached.set(reply.id, cards);
        cards.forEach((m) => absorbed.add(m.id));
      }
    }
    turn = [];
  };
  for (const m of messages) {
    if (m.role === 'user') close();
    else if (m.role === 'assistant') turn.push(m);
  }
  close();
  return { attached, absorbed };
}
