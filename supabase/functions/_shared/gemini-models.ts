export const GEMINI_TEXT = 'gemini-4-hydrogen';
export const GEMINI_FRONTIER = 'gemini-4-carbon';

export type GeminiThinkingLevel = 'low' | 'medium' | 'high';

/** Gemini 4 defaults to `high` thinking, billed as output and counted in `maxOutputTokens`; `low` is its floor. */
export function geminiThinkingConfig(
  model: string,
  level?: GeminiThinkingLevel | 'none',
): { thinkingLevel: GeminiThinkingLevel } | undefined {
  if (model.startsWith('gemini-4')) return { thinkingLevel: level && level !== 'none' ? level : 'low' };
  return level && level !== 'none' ? { thinkingLevel: level } : undefined;
}

export function geminiOutputTokens(usageMetadata: unknown): number {
  const u = (usageMetadata ?? {}) as { candidatesTokenCount?: number; thoughtsTokenCount?: number };
  return (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
}
