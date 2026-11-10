import { formatMoney, formatNumber } from '@/utils/decimal';

export function fmtMs(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

export function fmtUsd(v: number | null | undefined): string {
  if (v == null) return '—';
  return formatMoney(v, 'USD', { decimals: 2, maxDecimals: v !== 0 && Math.abs(v) < 1 ? 4 : 2 });
}

export function fmtInt(v: number | null | undefined): string {
  return formatNumber(v, { maxDecimals: 0 });
}

export function fmtTokens(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${Math.round(v / 1000)}k`;
  return formatNumber(v, { maxDecimals: 0 });
}

/** A rate with nothing to divide by is not 0% — it is no measurement. */
export function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

export function fmtPct(r: number | null): string {
  if (r == null) return '—';
  const p = r * 100;
  return `${p < 10 && p > 0 ? p.toFixed(1) : Math.round(p)}%`;
}

export type Tone = 'success' | 'warning' | 'error' | 'neutral';

/** Failure-rate tone: ≥20% red, ≥5% amber. */
export function failTone(r: number | null): Tone {
  if (r == null) return 'neutral';
  if (r >= 0.2) return 'error';
  if (r >= 0.05) return 'warning';
  return 'success';
}

export function delta(cur: number | null, prev: number | null, upIsGood: boolean, caption: string) {
  if (cur == null || prev == null || prev === 0) return undefined;
  const change = (cur - prev) / prev;
  if (!Number.isFinite(change)) return undefined;
  const direction = Math.abs(change) < 0.005 ? 'flat' : change > 0 ? 'up' : 'down';
  return {
    value: `${change > 0 ? '+' : ''}${Math.round(change * 100)}%`,
    direction: direction as 'up' | 'down' | 'flat',
    upIsGood,
    caption,
  };
}

export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : '—';
}
