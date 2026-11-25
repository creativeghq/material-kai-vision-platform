/**
 * What a chat turn looks like to the user: their message, ONE reply, and the result cards the
 * turn produced attached under that reply. Shared by every agent and toolkit, so no tool can
 * put its working on screen as if the agent had said it.
 */

export interface TurnMessage {
  id: string;
  role: string;
  content?: unknown;
  /** Set on the model's own reply, never on a card a tool posted. */
  turnId?: string;
  recovered?: boolean;
  sceneData?: { scene_id: string; intent?: unknown };
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
  'price_resolution', 'price_lookup_matches',
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
 * Which cards attach under which reply: the one their own tool call led to, never a later
 * message of the same turn. `artifactTitle` is null for plain prose.
 */
export function layoutTurns<M extends TurnMessage>(
  messages: readonly M[],
  artifactTitle: (m: M) => string | null,
): { attached: Map<string, M[]>; absorbed: Set<string> } {
  const attached = new Map<string, M[]>();
  const absorbed = new Set<string>();
  let turn: M[] = [];
  const speaks = (m: M) => {
    if (awaitsUser(m) || isResultCardRow(m)) return false;
    const prose = proseOf(m.content);
    const title = artifactTitle(m);
    return prose !== '' && (title === null || prose !== title.trim());
  };
  const close = () => {
    const isReply = turn.map((m) => speaks(m) && (!!m.turnId || artifactTitle(m) === null));
    const spoke = turn.map(speaks);
    const firstReply = isReply.indexOf(true);
    turn.forEach((m, i) => {
      if (isReply[i] || awaitsUser(m) || artifactTitle(m) === null) return;
      const host = spoke[i]
        ? (i < firstReply ? firstReply : -1)
        : [isReply.indexOf(true, i + 1), isReply.lastIndexOf(true, i), spoke.indexOf(true, i + 1)].find((x) => x >= 0) ?? -1;
      if (host < 0) return;
      const id = turn[host].id;
      attached.set(id, [...(attached.get(id) ?? []), m]);
      absorbed.add(m.id);
    });
    turn = [];
  };
  for (const m of messages) {
    if (m.role === 'user') close();
    else if (m.role === 'assistant') turn.push(m);
  }
  close();
  return { attached, absorbed };
}

/** A saved conversation can hold one reply twice (server rescue + client save) or one room's card several times. */
export function dropRepeats<M extends TurnMessage>(messages: readonly M[]): M[] {
  const savedByClient = new Set(messages.filter((m) => m.turnId && !m.recovered).map((m) => m.turnId));
  let rooms = new Set<string>();
  return messages.filter((m) => {
    if (m.role === 'user') { rooms = new Set(); return true; }
    if (m.recovered && savedByClient.has(m.turnId)) return false;
    if (!m.sceneData || m.sceneData.intent || m.turnId) return true;
    if (rooms.has(m.sceneData.scene_id)) return false;
    rooms.add(m.sceneData.scene_id);
    return true;
  });
}
