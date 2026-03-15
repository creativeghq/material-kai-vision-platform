import React from 'react';

// ── Color palette ──────────────────────────────────────────────
export const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#84cc16'];

// ── Helper functions ───────────────────────────────────────────
export function formatProfType(type: string): string {
  const map: Record<string, string> = {
    interior_designer: 'Interior Designer', architect: 'Architect',
    designer: 'Designer', manufacturer: 'Manufacturer', brand: 'Brand',
    supplier: 'Supplier', sourcing_agent: 'Sourcing Agent',
    consultant: 'Consultant', other: 'Other',
  };
  return map[type] ?? type;
}

export function getMomentum(lastRequested: string | null): string {
  if (!lastRequested) return 'cool';
  const days = (Date.now() - new Date(lastRequested).getTime()) / 86400000;
  return days < 7 ? 'hot' : days < 21 ? 'warm' : 'cool';
}

export function prettifyKey(k: string): string {
  return k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim().replace(/^\w/, (c) => c.toUpperCase());
}

export function getLifecycle(firstRequested: string | null, lastRequested: string | null, mentionCount: number, growthPct?: number): string {
  const now = Date.now();
  const firstDays = firstRequested ? (now - new Date(firstRequested).getTime()) / 86400000 : 999;
  const lastDays = lastRequested ? (now - new Date(lastRequested).getTime()) / 86400000 : 999;
  if (growthPct !== undefined) {
    if (growthPct > 80) return 'emerging';
    if (growthPct > 15) return 'growing';
    if (growthPct < -20) return 'declining';
    return 'established';
  }
  if (firstDays < 28) return 'emerging';
  if (lastDays < 7 && mentionCount > 40) return 'growing';
  if (lastDays > 35) return 'declining';
  return 'established';
}

// ── KPI Card ──────────────────────────────────────────────────
export function KpiCard({ label, value, sub, icon: Icon, color = 'text-primary' }: {
  label: string; value: React.ReactNode; sub?: string;
  icon: React.ComponentType<{ className?: string }>; color?: string;
}) {
  return (
    <div className="relative rounded-xl border border-border/50 bg-card px-4 py-3 hover:border-primary/30 transition-all overflow-hidden group">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {label}
      </p>
      <p className={`text-2xl font-bold tracking-tight leading-none ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
    </div>
  );
}

// ── Section Header ────────────────────────────────────────────
export function SectionHeader({ title, desc, icon: Icon }: { title: string; desc?: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="mt-14 mb-6">
      <div className="flex items-center gap-2.5 mb-2">
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      </div>
      {desc && <p className="text-sm text-muted-foreground leading-snug">{desc}</p>}
      <div className="mt-4 border-b border-border/50" />
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────
export function EmptyState({ message = 'No data yet for this period' }: { message?: string }) {
  return <div className="flex items-center justify-center h-full min-h-[80px] text-xs text-muted-foreground italic py-8">{message}</div>;
}

// ── Lifecycle Badge ───────────────────────────────────────────
export function LifecycleBadge({ stage }: { stage: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    emerging:    { label: '✦ Emerging',    cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    growing:     { label: '▲ Growing',     cls: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    established: { label: '● Established', cls: 'bg-muted text-muted-foreground border-border/40' },
    declining:   { label: '▼ Declining',   cls: 'bg-red-500/10 text-red-500 border-red-500/20' },
  };
  const { label, cls } = map[stage] ?? map.established;
  return <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>;
}
