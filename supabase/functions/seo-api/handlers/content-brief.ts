/** Content brief — normalize at the boundary, never dereference raw. */

/** `ContentBrief`'s shape with every field PRESENT, and every value allowed to be absent. */
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

/**
 * Keys `ContentBrief` declares. Everything else becomes `extraContext`.
 *
 * `extraContext` is in here because normalizing must be IDEMPOTENT: the pipeline normalizes
 * once and stores the result on the article row, then hands it to each stage, which
 * normalizes again. Without this the second pass sees `extraContext` as a key it does not
 * know and folds the whole list back into a single run-on `Extra context: a; b; c` bullet —
 * on every pipeline run, which is the only way this code is normally reached.
 */
const KNOWN_KEYS = new Set([
  'businessObjective', 'conversionGoal', 'audience', 'brandVoice', 'contentType',
  'callToAction', 'requiredPoints', 'internalLinksContext', 'provenance',
  'firsthandExperience', 'clusterContext', 'performanceFeedback', 'extraContext',
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

/**
 * Flatten a value into prose, one nesting level at a time. Returns null when there is
 * nothing to say — an empty array or an object of nulls must not become `Market: ` with a
 * blank after it.
 */
function renderValue(value: unknown, depth = 0): string | null {
  if (Array.isArray(value)) {
    const items = value
      .map((v) => (depth < 2 ? renderValue(v, depth + 1) : asText(v)))
      .filter((s): s is string => s !== null);
    return items.length > 0 ? items.join('; ') : null;
  }

  if (isPlainObject(value)) {
    if (depth >= 2) return null;
    const parts = Object.entries(value)
      .map(([k, v]) => {
        const t = renderValue(v, depth + 1);
        return t ? `${humanizeKey(k)} ${t}` : null;
      })
      .filter((p): p is string => p !== null);
    return parts.length > 0 ? parts.join(', ') : null;
  }

  return asText(value);
}

/** One line of prose for an unknown key. */
function renderUnknown(key: string, value: unknown): string | null {
  const rendered = renderValue(value);
  return rendered ? `${humanizeKey(key)}: ${rendered}` : null;
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

  // Lines an earlier normalization already produced come through as-is; re-rendering them
  // would nest them under a second label. See KNOWN_KEYS on why this runs twice.
  const extraContext = [
    ...asTextArray(raw.extraContext),
    ...Object.entries(raw)
      .filter(([k]) => !KNOWN_KEYS.has(k))
      .map(([k, v]) => renderUnknown(k, v))
      .filter((line): line is string => line !== null),
  ];

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

/** Non-empty array, or null — so "the caller said nothing" is distinguishable from "[]". */
const filled = (a: string[] | null | undefined): string[] | null =>
  Array.isArray(a) && a.length > 0 ? a : null;

/**
 * Normalize the caller's brief, then fill ONLY what it left absent from the workspace's brand
 * profile. The caller always wins: a per-article brief that names its own author is stating a
 * fact about that article, and a stored default must never overwrite it.
 *
 * Without this, `provenance` and `firsthandExperience` are null on every run — the analyzer's
 * two E-E-A-T checks then fail every time and read as a writing problem rather than a missing
 * input. They are also the checks no competitor has, so they are the worst two to leave broken.
 */
export async function resolveBriefWithProfile(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  workspaceId: string | null | undefined,
  raw: unknown,
): Promise<NormalizedBrief | null> {
  const brief = normalizeContentBrief(raw);
  if (!workspaceId) return brief;

  const { data: p, error } = await supabase
    .from('workspace_brand_profile')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  // A profile we could not read is not an empty profile. Return the caller's brief untouched and
  // let the checks report honestly, rather than silently writing defaults we did not load.
  if (error || !p) return brief;

  const base = brief ?? emptyBrief({});

  return {
    ...base,
    brandVoice: {
      toneAttributes:         filled(base.brandVoice.toneAttributes)         ?? (p.tone_attributes ?? []),
      personalityTraits:      filled(base.brandVoice.personalityTraits)      ?? (p.personality_traits ?? []),
      writingStyle:           base.brandVoice.writingStyle                   ?? (p.writing_style ?? null),
      terminologyPreferences: filled(base.brandVoice.terminologyPreferences) ?? (p.terminology_preferences ?? []),
      avoidList:              filled(base.brandVoice.avoidList)              ?? (p.avoid_list ?? []),
      exampleContentUrls:     filled(base.brandVoice.exampleContentUrls)     ?? (p.example_content_urls ?? []),
    },
    // Whole-object fallback: a caller that supplied provenance at all owns it, because a half-
    // merged author (their name, our bio) is a claim nobody made.
    provenance: base.provenance ?? (
      p.author_name || p.publisher_name || p.reviewed_by || p.ai_disclosure
        ? {
            authorName: p.author_name ?? null,
            authorTitle: p.author_title ?? null,
            authorBio: p.author_bio ?? null,
            authorUrl: p.author_url ?? null,
            publisherName: p.publisher_name ?? null,
            reviewedBy: p.reviewed_by ?? null,
            aiDisclosure: p.ai_disclosure ?? null,
          }
        : null
    ),
    firsthandExperience: base.firsthandExperience ?? (
      (p.proprietary_data?.length || p.owned_examples?.length || p.methodology || p.credentials)
        ? {
            proprietaryData: p.proprietary_data ?? [],
            ownedExamples: p.owned_examples ?? [],
            methodology: p.methodology ?? null,
            credentials: p.credentials ?? null,
          }
        : null
    ),
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
