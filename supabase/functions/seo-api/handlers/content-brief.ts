/**
 * Content brief — normalize at the boundary, never dereference raw.
 *
 * `content_brief` reaches every stage through a tool schema of `z.any()`, so whatever the
 * model decided a brief looks like arrives intact. `ContentBrief` is a TypeScript interface,
 * which means it constrains nothing at runtime: the prompt builders read
 * `brief.audience.painPoints.join(', ')` and `brief.brandVoice.toneAttributes.join(', ')`
 * directly, sixteen dereferences deep across plan / write / analyze.
 *
 * On 2026-09-06 the marketing agent sent a perfectly sensible brief of its own design —
 * `{ market, audience: "<prose>", language, mustCover: [...], brandVoice: "<prose>",
 * businessContext, provenance }` — and `buildPlanningSystemPrompt` threw
 * `Cannot read properties of undefined (reading 'join')` on `brief.audience.painPoints`,
 * AFTER the credits were debited. Article 8b8d7383 died at 30% with that message, and the
 * user saw a pipeline that simply stopped.
 *
 * This is the same lesson `article-plan-guard.ts` carries for `article_plan` and `plan.ts`
 * already carries for `keyword_research` — presence is not shape — applied to the one field
 * that had not learned it. The remedy differs though, and deliberately:
 *
 *   - `keyword_research` is REQUIRED and load-bearing, so a wrong shape is REJECTED (400).
 *   - `content_brief` is OPTIONAL and purely additive prompt context. Rejecting it would
 *     fail a run over something that only ever makes the article better, so it is
 *     NORMALIZED instead. This function never throws and never returns a partial shape.
 *
 * The second defect it closes is quieter: the builders only read the keys they know, so
 * every key the caller invented was dropped on the floor. That brief's `mustCover`,
 * `businessContext` and `market` — the only workspace-specific information in the whole
 * request — would have reached the model nowhere even if the run had survived. Unknown
 * keys now survive as labelled prose in `extraContext`.
 */

/**
 * `ContentBrief`'s shape with every field PRESENT, and every value allowed to be absent.
 *
 * Deliberately not `extends ContentBrief`: that interface types a brief somebody filled in
 * completely, so its scalars are non-nullable. A normalized brief is the opposite premise —
 * whatever arrived, made safe to read — and "the caller did not say" is its normal state.
 * Widening here is what lets every consumer drop its own guard: the arrays are always
 * arrays and the nested objects are always objects, so only the scalars need a fallback,
 * and `briefValue` / `briefList` supply it.
 */
export interface NormalizedBrief {
  businessObjective: string | null;
  conversionGoal: string | null;
  callToAction: string | null;
  contentType: string | null;
  audience: {
    primaryPersona: string | null;
    knowledgeLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert' | null;
    painPoints: string[];
    decisionStage: 'awareness' | 'consideration' | 'decision' | null;
    contentPreferences: string | null;
  };
  brandVoice: {
    toneAttributes: string[];
    personalityTraits: string[];
    writingStyle: string | null;
    terminologyPreferences: string[];
    avoidList: string[];
    exampleContentUrls: string[];
  };
  requiredPoints: string[];
  internalLinksContext: string[];
  clusterContext: {
    pillarTopic: string | null;
    relatedArticles: string[];
    differentiationNote: string | null;
  } | null;
  performanceFeedback: {
    previousArticleScores: { title: string | null; score: number | null; topIssue: string }[];
    audienceFeedbackNotes: string | null;
    promptRefinements: string | null;
  } | null;
  provenance: {
    authorName: string | null;
    authorTitle: string | null;
    authorBio: string | null;
    authorUrl: string | null;
    publisherName: string | null;
    reviewedBy: string | null;
    aiDisclosure: 'ai_generated' | 'ai_assisted' | 'human_written' | null;
  } | null;
  firsthandExperience: {
    proprietaryData: string[];
    ownedExamples: string[];
    methodology: string | null;
    credentials: string | null;
  } | null;
  /** Top-level keys outside `ContentBrief`, rendered as `Label: value` prose. */
  extraContext: string[];
}

const KNOWLEDGE_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
const DECISION_STAGES = ['awareness', 'consideration', 'decision'] as const;
const AI_DISCLOSURES = ['ai_generated', 'ai_assisted', 'human_written'] as const;

/** Keys `ContentBrief` declares. Everything else becomes `extraContext`. */
const KNOWN_KEYS = new Set([
  'businessObjective', 'conversionGoal', 'audience', 'brandVoice', 'contentType',
  'callToAction', 'requiredPoints', 'internalLinksContext', 'provenance',
  'firsthandExperience', 'clusterContext', 'performanceFeedback',
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A scalar the prompt can print, or null. Objects and arrays are NOT stringified here —
 *  `[object Object]` in a prompt is worse than an omitted line. */
function asText(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return String(v);
  return null;
}

/** A list of printable strings. A bare string is a one-item list — the commonest way a
 *  model answers a field whose name reads singular ("brandVoice", "audience"). */
function asTextArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(asText).filter((s): s is string => s !== null);
  const one = asText(v);
  return one ? [one] : [];
}

function asEnum<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  const t = asText(v);
  if (t === null) return null;
  const hit = allowed.find((a) => a.toLowerCase() === t.toLowerCase());
  return hit ?? null;
}

/** `foo_bar` / `fooBar` → `Foo bar`, so an invented key reads as a prompt label. */
function humanizeKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** One line of prose for an unknown key. Returns null when there is nothing to say —
 *  an empty array or an object of nulls must not become `Market: ` with a blank after it. */
function renderUnknown(key: string, value: unknown): string | null {
  const label = humanizeKey(key);

  if (Array.isArray(value)) {
    const items = asTextArray(value);
    return items.length > 0 ? `${label}: ${items.join('; ')}` : null;
  }

  if (isPlainObject(value)) {
    const parts = Object.entries(value)
      .map(([k, v]) => {
        const t = Array.isArray(v) ? asTextArray(v).join(', ') : asText(v);
        return t ? `${humanizeKey(k)} ${t}` : null;
      })
      .filter((p): p is string => p !== null);
    return parts.length > 0 ? `${label}: ${parts.join('; ')}` : null;
  }

  const scalar = asText(value);
  return scalar ? `${label}: ${scalar}` : null;
}

/**
 * Coerce anything into a brief every prompt builder can read, or null when there is
 * genuinely nothing in it. Total: no input shape throws, including a string, an array,
 * a number, or an object whose every field is the wrong type.
 */
export function normalizeContentBrief(raw: unknown): NormalizedBrief | null {
  if (raw === null || raw === undefined) return null;

  // A brief sent as bare prose is a real brief — it is the business context, and the
  // alternative (dropping it) loses the only thing the caller actually said.
  if (!isPlainObject(raw)) {
    const prose = Array.isArray(raw) ? asTextArray(raw).join('; ') : asText(raw);
    if (!prose) return null;
    return emptyBrief({ extraContext: [`Business context: ${prose}`] });
  }

  // `audience` and `brandVoice` are declared as objects. A string there is not an unknown
  // key, it is the declared key with the wrong type — coerce it into the field that best
  // carries prose rather than discarding what the caller wrote.
  const audienceRaw = isPlainObject(raw.audience) ? raw.audience : {};
  const audienceProse = isPlainObject(raw.audience) ? null : asText(raw.audience);

  const voiceRaw = isPlainObject(raw.brandVoice) ? raw.brandVoice : {};
  const voiceProse = isPlainObject(raw.brandVoice) ? null : asText(raw.brandVoice);

  const extraContext = Object.entries(raw)
    .filter(([k]) => !KNOWN_KEYS.has(k))
    .map(([k, v]) => renderUnknown(k, v))
    .filter((line): line is string => line !== null);

  return emptyBrief({
    businessObjective: asText(raw.businessObjective),
    conversionGoal: asText(raw.conversionGoal),
    callToAction: asText(raw.callToAction),
    contentType: asText(raw.contentType),

    audience: {
      primaryPersona: asText(audienceRaw.primaryPersona) ?? audienceProse,
      knowledgeLevel: asEnum(audienceRaw.knowledgeLevel, KNOWLEDGE_LEVELS),
      painPoints: asTextArray(audienceRaw.painPoints),
      decisionStage: asEnum(audienceRaw.decisionStage, DECISION_STAGES),
      contentPreferences: asText(audienceRaw.contentPreferences),
    },

    brandVoice: {
      toneAttributes: asTextArray(voiceRaw.toneAttributes),
      personalityTraits: asTextArray(voiceRaw.personalityTraits),
      writingStyle: asText(voiceRaw.writingStyle) ?? voiceProse,
      terminologyPreferences: asTextArray(voiceRaw.terminologyPreferences),
      avoidList: asTextArray(voiceRaw.avoidList),
      exampleContentUrls: asTextArray(voiceRaw.exampleContentUrls),
    },

    requiredPoints: asTextArray(raw.requiredPoints),
    internalLinksContext: asTextArray(raw.internalLinksContext),

    clusterContext: isPlainObject(raw.clusterContext)
      ? {
          pillarTopic: asText(raw.clusterContext.pillarTopic),
          relatedArticles: asTextArray(raw.clusterContext.relatedArticles),
          differentiationNote: asText(raw.clusterContext.differentiationNote),
        }
      : null,

    performanceFeedback: isPlainObject(raw.performanceFeedback)
      ? {
          previousArticleScores: (Array.isArray(raw.performanceFeedback.previousArticleScores)
            ? raw.performanceFeedback.previousArticleScores
            : []
          )
            .map((entry: unknown) => {
              const obj = isPlainObject(entry) ? entry : {};
              // `topIssue` is the only field any prompt reads; a bare string entry IS that.
              const topIssue = isPlainObject(entry) ? asText(obj.topIssue) : asText(entry);
              if (!topIssue) return null;
              const score = typeof obj.score === 'number' && Number.isFinite(obj.score) ? obj.score : null;
              return { title: asText(obj.title), score, topIssue };
            })
            .filter((e): e is { title: string | null; score: number | null; topIssue: string } => e !== null),
          audienceFeedbackNotes: asText(raw.performanceFeedback.audienceFeedbackNotes),
          promptRefinements: asText(raw.performanceFeedback.promptRefinements),
        }
      : null,

    // An invented byline is worse than none (pipeline.ts), so a provenance block that
    // coerces to nothing stays null and the analyzer keeps raising its `provenance` fix.
    provenance: isPlainObject(raw.provenance)
      ? {
          authorName: asText(raw.provenance.authorName),
          authorTitle: asText(raw.provenance.authorTitle),
          authorBio: asText(raw.provenance.authorBio),
          authorUrl: asText(raw.provenance.authorUrl),
          publisherName: asText(raw.provenance.publisherName),
          reviewedBy: asText(raw.provenance.reviewedBy),
          aiDisclosure: asEnum(raw.provenance.aiDisclosure, AI_DISCLOSURES),
        }
      : null,

    firsthandExperience: isPlainObject(raw.firsthandExperience)
      ? {
          proprietaryData: asTextArray(raw.firsthandExperience.proprietaryData),
          ownedExamples: asTextArray(raw.firsthandExperience.ownedExamples),
          methodology: asText(raw.firsthandExperience.methodology),
          credentials: asText(raw.firsthandExperience.credentials),
        }
      : null,

    extraContext,
  });
}

/** Every field present, so no consumer has to guard. Overrides are applied on top. */
function emptyBrief(overrides: Partial<NormalizedBrief>): NormalizedBrief {
  return {
    businessObjective: null,
    conversionGoal: null,
    audience: {
      primaryPersona: null,
      knowledgeLevel: null,
      painPoints: [],
      decisionStage: null,
      contentPreferences: null,
    },
    brandVoice: {
      toneAttributes: [],
      personalityTraits: [],
      writingStyle: null,
      terminologyPreferences: [],
      avoidList: [],
      exampleContentUrls: [],
    },
    contentType: null,
    callToAction: null,
    requiredPoints: [],
    internalLinksContext: [],
    provenance: null,
    firsthandExperience: null,
    clusterContext: null,
    performanceFeedback: null,
    extraContext: [],
    ...overrides,
  };
}

/**
 * What to print when a brief field is absent. "Not specified" rather than a silent blank:
 * a prompt line reading `Knowledge level: ` invites the model to guess one, and a prompt
 * line reading `undefined` invites it to write about undefined.
 */
export function briefValue(v: string | null | undefined): string {
  return v && v.trim() ? v : 'Not specified';
}

/** Same, for a list. */
export function briefList(items: string[] | null | undefined, separator = ', '): string {
  return items && items.length > 0 ? items.join(separator) : 'Not specified';
}

/**
 * The block carrying keys `ContentBrief` does not declare. Rendered LAST in each prompt so
 * it reads as supplementary, and omitted entirely when there is nothing in it.
 */
export function briefExtraContextBlock(brief: NormalizedBrief | null): string {
  if (!brief || brief.extraContext.length === 0) return '';
  return `

=== ADDITIONAL BRIEF CONTEXT ===
${brief.extraContext.map((line) => `- ${line}`).join('\n')}`;
}
