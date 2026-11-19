import {
  BookOpen,
  Boxes,
  Brain,
  ClipboardCheck,
  Database,
  FileSearch,
  Globe,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
  Package,
  Radio,
  Search,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { AdminAttention } from './adminAttention';

const approvalsTotal = (a: AdminAttention): number => Object.values(a.approvals).reduce((s, n) => s + n, 0);

export interface AdminDestination {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  /** One line for the Overview's area cards. */
  description: string;
  count?: (a: AdminAttention) => number;
}

export interface AdminNavGroup {
  label?: string;
  items: AdminDestination[];
}

/** The ONE list of operator destinations — the HQ sidebar and the Overview read it. */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    items: [
      { id: 'overview', label: 'Overview', path: '/admin', icon: LayoutDashboard, description: 'What needs attention across the platform.' },
    ],
  },
  {
    label: 'Agents',
    items: [
      { id: 'agents', label: 'Agent Harness', path: '/admin/agents', icon: Radio, description: 'Turns, models, tools, evals, failures and conversations.' },
      { id: 'agent-ops', label: 'Agent Ops', path: '/admin/agent-ops', icon: ShieldAlert, description: 'Cases JARVIS hands to Stark and Veritas, background agents and every background process.', count: (a) => a.ops.escalated },
      { id: 'ai-configs', label: 'AI Configurations', path: '/admin/ai-configs', icon: Brain, description: 'Prompts, chat starters, writing rules and model pricing.' },
    ],
  },
  {
    label: 'Data & Pipeline',
    items: [
      { id: 'jobs', label: 'Job Queue', path: '/admin/async-queue-monitor', icon: ListChecks, description: 'Processing jobs, stages and document health.', count: (a) => a.jobs.failed_24h + a.jobs.stale },
      { id: 'ingestion-quality', label: 'Ingestion Quality', path: '/admin/ingestion-quality', icon: FileSearch, description: 'Post-ingestion audits of every catalogue.', count: (a) => a.ingestion.needs_review },
      { id: 'materials', label: 'Materials Data', path: '/admin/materials-data', icon: Package, description: 'Products, chunks, images, categories and the AI review.' },
      { id: 'kb', label: 'Knowledge Base', path: '/admin/knowledge-base', icon: BookOpen, description: 'Knowledge base articles, categories, search and product links.' },
      { id: 'data-health', label: 'Data Health', path: '/admin/data-health', icon: ShieldCheck, description: 'Integrity findings and the nightly sweep.', count: (a) => a.integrity.critical + a.integrity.warning },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'system-health', label: 'System Health', path: '/admin/system-health', icon: HeartPulse, description: 'Services, providers, capabilities and storage.', count: (a) => a.providers.failing },
      { id: 'search', label: 'Search Analytics', path: '/admin/search', icon: Search, description: 'Query volume, latency, cache and zero results.' },
      { id: 'billing', label: 'Services & Billing', path: '/admin/billing', icon: Wallet, description: 'Channel costs, third-party services and email delivery.' },
      { id: 'platform', label: 'Platform Overview', path: '/admin/platform', icon: Globe, description: 'Workspaces, users, quotes, AI spend and growth.' },
      { id: 'approvals', label: 'Approvals', path: '/admin/approvals', icon: ClipboardCheck, description: 'Brands, access, resellers, marketplace, claims and freight.', count: approvalsTotal },
    ],
  },
  {
    label: 'Platform',
    items: [
      { id: 'modules', label: 'Modules & Plans', path: '/admin/modules', icon: Database, description: 'Modules, subscribers, plans and keys.' },
      { id: 'master-catalog', label: 'Master Catalog', path: '/catalog-master', icon: Boxes, description: 'Manufacturer master records.' },
    ],
  },
];

export const ADMIN_DESTINATIONS: AdminDestination[] = ADMIN_NAV.flatMap((g) => g.items);
