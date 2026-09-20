/** The AI Citations vocabulary — one copy, read by the panel and every card in it. */
import type { SeoMetricStatus } from './seoMetrics';

/** A figure plus the verdict on whether it is real — `seo_metric` minus the series. */
export interface AiRate {
  value: number | null;
  status: SeoMetricStatus | string;
  note: string | null;
}

export interface AiEngine {
  model: string;
  probes: number;
  answered: number;
  failed: number;
  named: number;
  cited: number;
  /** Bar segments, partitioned in SQL: `named - cited` overflows on a ghost citation. */
  named_not_cited: number;
  absent: number;
  cited_unnamed: number;
  /** Answers that carried ANY source. Zero means the engine did not browse. */
  sourced: number;
  avg_position: number | null;
  cost_usd: number | null;
  avg_latency_ms: number | null;
  last_run_at: string | null;
  mention_rate: AiRate;
  citation_rate: AiRate;
  browses: boolean;
  status: SeoMetricStatus | string;
  note: string | null;
}

export interface AiRival {
  /** A domain on `cited_instead`, a brand name on `named_instead`. */
  domain?: string;
  name?: string;
  answers: number;
  engines: string[];
}

export interface AiCitationReport {
  status: 'ok' | 'no_sources' | 'collector_failed' | 'not_collected' | string;
  window_days: number;
  note: string | null;
  totals: {
    probes: number; answered: number; failed: number;
    named: number; cited: number; sourced: number;
    cost_usd: number | null;
    first_run_at: string | null; last_run_at: string | null;
    mention_rate: number | null;
    citation_rate: number | null;
  };
  engines: AiEngine[];
  cited_instead: AiRival[];
  named_instead: AiRival[];
}

/** Answered through DataForSEO rather than the vendor API — a different retrieval
 *  stack and a stated country, so it is a separate surface, never the same rate. */
export const DFS_PREFIX = 'dfs:';

/** A model's own display name. Never invent a vendor label we cannot verify. */
export function modelLabel(model: string): string {
  if (model.startsWith(DFS_PREFIX)) {
    const family = model.slice(DFS_PREFIX.length);
    return `${engineName(family)} · via DataForSEO`;
  }
  return engineName(model);
}

function engineName(model: string): string {
  if (model.startsWith('claude')) return 'Claude';
  if (model.startsWith('chat_gpt') || model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'ChatGPT';
  if (model.startsWith('sonar') || model.startsWith('perplexity')) return 'Perplexity';
  if (model.startsWith('gemini')) return 'Gemini';
  return model;
}

export type AnswerVerdict = 'cited' | 'named' | 'absent' | 'failed' | 'not_run';

export const VERDICT_LABEL: Record<AnswerVerdict, string> = {
  cited: 'Cited you',
  named: 'Named you',
  absent: 'Left you out',
  failed: 'Failed',
  not_run: 'Not run',
};

export const VERDICT_BADGE: Record<AnswerVerdict, 'success' | 'info' | 'neutral' | 'warning'> = {
  cited: 'success',
  named: 'info',
  absent: 'neutral',
  failed: 'warning',
  not_run: 'warning',
};

/** Verdict bar segments. Tinted — four saturated fills read as four buttons. */
export const VERDICT_FILL: Record<AnswerVerdict, string> = {
  cited: 'bg-emerald-600 dark:bg-emerald-400',
  named: 'bg-primary/60',
  absent: 'bg-muted-foreground/25',
  failed: 'bg-amber-600/50 dark:bg-amber-400/40',
  not_run: 'bg-muted',
};

/** A failed call is not an absent mention. Testing `mentioned` alone collapses the
 *  two, which is how a dead API key reads as "assistants never mention us". */
export function answerVerdict(a: {
  error?: string | null;
  mentioned?: boolean | null;
  brand_cited?: boolean | null;
} | null | undefined): AnswerVerdict {
  if (!a) return 'not_run';
  if (a.error) return 'failed';
  if (a.brand_cited) return 'cited';
  return a.mentioned ? 'named' : 'absent';
}

export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] || url;
  }
}

export function formatUsd(v: number | null | undefined): string {
  if (v == null) return '—';
  return v < 0.01 && v > 0 ? '<$0.01' : `$${v.toFixed(2)}`;
}

export interface LostQuestionPage {
  url: string;
  score: number | null;
  status: SeoMetricStatus | string;
  note: string | null;
  gaps: string[];
  words: number | null;
  analysed_at: string | null;
}

export interface LostQuestion {
  prompt_text: string;
  template_key: string;
  answers: number;
  cited: number;
  named: number;
  engines: string[];
  last_asked: string | null;
  rival_urls: string[];
  rival_brands: string[];
  page: LostQuestionPage | null;
  status: SeoMetricStatus | string;
}

export interface CitabilityReport {
  status: string;
  window_days: number;
  note: string | null;
  pages_known: number;
  pages_read: number;
  pages_note: string | null;
  questions: LostQuestion[];
}

export function withRosterEngines(
  engines: AiEngine[],
  roster: { model: string; enabled: boolean }[] | undefined,
): AiEngine[] {
  const seen = new Set(engines.map((e) => e.model));
  const missing = (roster ?? []).filter((m) => !seen.has(m.model));
  const absent = missing.map((m): AiEngine => {
    const note = m.enabled
      ? 'This assistant is configured but produced no probe in this window.'
      : 'No API key is configured for this assistant, so it is dropped from the run entirely — it has never answered.';
    const rate: AiRate = { value: null, status: 'not_collected', note };
    return {
      model: m.model,
      probes: 0, answered: 0, failed: 0, named: 0, cited: 0,
      named_not_cited: 0, absent: 0, cited_unnamed: 0, sourced: 0,
      avg_position: null, cost_usd: null, avg_latency_ms: null, last_run_at: null,
      mention_rate: rate, citation_rate: rate,
      browses: false, status: 'not_collected', note,
    };
  });
  return [...engines, ...absent];
}

export interface LlmMentionTarget {
  target: string;
  target_kind: 'domain' | 'keyword';
  platform: string | null;
  language_code: string | null;
  status: SeoMetricStatus | string;
  note: string | null;
  metrics: Record<string, number | string | null>;
  top_domains: { domain?: string; citations?: number; mentions?: number }[];
  top_pages: { url?: string; citations?: number }[];
  top_brands: { brand?: string; mentions?: number }[];
  series: { date?: string; value?: number }[];
  captured_at: string;
}

export interface LlmMentionsReport {
  status: string;
  window_days: number;
  note: string | null;
  targets: LlmMentionTarget[];
}

export interface AiKeywordVolume {
  keyword: string;
  ai_volume: number | null;
  status: SeoMetricStatus | string;
  note: string | null;
  captured_at: string;
}

export interface AiKeywordVolumes {
  status: string;
  note: string | null;
  volumes: AiKeywordVolume[];
}
