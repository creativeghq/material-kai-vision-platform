/**
 * Shared quote status badge utility.
 * Single source of truth for status colours — use this everywhere.
 */

import React from 'react';
import { Clock, FileText, CheckCircle, XCircle, Package } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';

export type QuoteStatus = 'draft' | 'submitted' | 'quoted' | 'accepted' | 'rejected' | 'expired';

interface StatusConfig {
  icon: React.ElementType;
  className: string;
  label: string;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  draft:     { icon: Clock,        className: 'bg-gray-100 text-gray-700 hover:bg-gray-100',     label: 'Draft' },
  submitted: { icon: FileText,     className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100', label: 'Submitted' },
  quoted:    { icon: Package,      className: 'bg-purple-100 text-purple-800 hover:bg-purple-100', label: 'Quoted' },
  accepted:  { icon: CheckCircle,  className: 'bg-green-100 text-green-800 hover:bg-green-100',  label: 'Accepted' },
  rejected:  { icon: XCircle,      className: 'bg-red-100 text-red-800 hover:bg-red-100',        label: 'Rejected' },
  expired:   { icon: XCircle,      className: 'bg-gray-100 text-gray-500 hover:bg-gray-100',     label: 'Expired' },
};

const DEFAULT_CONFIG: StatusConfig = {
  icon: Clock,
  className: 'bg-gray-100 text-gray-700 hover:bg-gray-100',
  label: 'Unknown',
};

export function getQuoteStatusConfig(status: string): StatusConfig {
  return STATUS_CONFIG[status] ?? DEFAULT_CONFIG;
}

export function QuoteStatusBadge({ status }: { status: string }) {
  const config = getQuoteStatusConfig(status);
  const Icon = config.icon;
  return (
    <Badge className={config.className}>
      <Icon className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}

// Plain-colored-word form for use INSIDE table/list rows (house rule: no pill tags in tables).
// Keep `QuoteStatusBadge` for page/modal headers where the pill is appropriate.
const QUOTE_STATUS_WORD_TONE: Record<string, string> = {
  draft: 'text-muted-foreground',
  submitted: 'text-amber-600 dark:text-amber-400',
  quoted: 'text-blue-600 dark:text-blue-400',
  accepted: 'text-emerald-600 dark:text-emerald-400',
  rejected: 'text-red-500 dark:text-red-400',
  expired: 'text-muted-foreground',
};

export function QuoteStatusWord({ status }: { status: string }) {
  const config = getQuoteStatusConfig(status);
  const tone = QUOTE_STATUS_WORD_TONE[status] ?? 'text-muted-foreground';
  return <span className={`text-xs font-medium ${tone}`}>{config.label}</span>;
}
