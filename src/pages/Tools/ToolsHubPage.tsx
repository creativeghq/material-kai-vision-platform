/**
 * Tools hub (/tools)
 *
 * Public landing grid. Each card links to a root-based tool route
 * (/tools/<slug>). Add a new entry to TOOLS to surface another tool — the
 * grid and the agent stay independent surfaces over the same capability.
 *
 * Registered OUTSIDE <AuthGuard> in App.tsx — no login required.
 */

import { Link } from 'react-router-dom';
import {
  Calculator,
  ChevronRight,
  ClipboardList,
  Columns3,
  Flame,
  MessageSquareText,
  ScanSearch,
  ShoppingBag,
  Thermometer,
  LineChart,
  Radar,
  Megaphone,
  Share2,
  Search,
  type LucideIcon,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { QuotaBadge, ToolsShell, useToolsQuota } from './toolsShared';

interface ToolEntry {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  badge: string;
  /** Absolute route to link to. Defaults to `/tools/<slug>` for the public tools. */
  to?: string;
}

const TOOLS: ToolEntry[] = [
  {
    slug: 'product-search',
    title: 'Material search',
    description:
      'Search the material catalog by name, brand or category and see matching products instantly.',
    icon: ScanSearch,
    badge: 'Free · 2/day',
  },
  {
    slug: 'heat-pump',
    title: 'Heat-pump sizer',
    description:
      'Estimate the heat-pump capacity (kW) a space needs — from area, insulation, climate zone, ceiling height and emitter type.',
    icon: Thermometer,
    badge: 'Free · instant',
  },
  {
    slug: 'heating-cost',
    title: 'Heating cost comparison',
    description:
      'Compare the annual running cost of six heating methods — oil, gas, A/C, heat pump and fireplaces — for the same home.',
    icon: Flame,
    badge: 'Free · instant',
  },
  {
    slug: 'price-scan',
    title: 'Price scan',
    description:
      'Type any product or brand and see live retailer prices from across the web, verified by direct page reads.',
    icon: ShoppingBag,
    badge: 'Free · 2/day',
  },
  {
    slug: 'mention-scan',
    title: 'Mention scan',
    description:
      'Find recent news, blog and editorial coverage of a brand or product, grouped by outlet.',
    icon: MessageSquareText,
    badge: 'Free · 2/day',
  },
  {
    slug: 'project-plan',
    title: 'Project plan estimator',
    description:
      'Pick a renovation type and see the full scope of works, priced — fine-tune the numbers and the total updates live.',
    icon: ClipboardList,
    badge: 'Free · instant',
  },
];

/**
 * Catalog tools — require a signed-in workspace (they hit MIVAA / the product
 * catalog), so they're shown only to authenticated users and link to their own
 * authenticated routes rather than `/tools/<slug>`.
 */
const WORKSPACE_TOOLS: ToolEntry[] = [
  {
    slug: 'recognition',
    to: '/recognition',
    title: 'Material recognition',
    description:
      'Upload a photo of a material or surface and identify it — AI vision returns the closest matches from your catalog.',
    icon: ScanSearch,
    badge: 'Signed in · AI',
  },
  {
    slug: 'compare',
    to: '/compare',
    title: 'Material comparison',
    description:
      'Put 2–4 catalog products side by side with property-level diff highlighting. Search and add products right in the tool.',
    icon: Columns3,
    badge: 'Signed in · catalog',
  },
];

/**
 * Agent tools — capabilities that live in the KAI studio (chat + canvas) rather than as a standalone
 * page: the monitors and marketing toolkits. Each card deep-links to `/agent-hub?capability=<id>`,
 * which primes the owning agent + toolkit so the user lands on "here's what you can do" (#275). Shown
 * to signed-in users only.
 */
const AGENT_TOOLS: ToolEntry[] = [
  {
    slug: 'price-monitoring', to: '/agent-hub?capability=price-monitoring',
    title: 'Price monitoring',
    description: 'Track what competitors charge for your products across retailers — start tracking or pull the latest prices from chat.',
    icon: LineChart, badge: 'Studio · agent',
  },
  {
    slug: 'mention-monitoring', to: '/agent-hub?capability=mention-monitoring',
    title: 'Mention monitoring',
    description: 'Watch news, blogs and LLM answers for your brand or products — summaries and sentiment, on demand.',
    icon: Radar, badge: 'Studio · agent',
  },
  {
    slug: 'email-campaign', to: '/agent-hub?capability=email-campaign',
    title: 'Email campaigns',
    description: 'Draft a campaign to a CRM audience in chat — the agent composes it and you send from the Email page.',
    icon: Megaphone, badge: 'Studio · agent',
  },
  {
    slug: 'seo-research', to: '/agent-hub?capability=seo-research',
    title: 'SEO research',
    description: 'Keyword research, audits and content — run the SEO toolkit inside the studio.',
    icon: Search, badge: 'Studio · agent',
  },
  {
    slug: 'social-post', to: '/agent-hub?capability=social-post',
    title: 'Social posts',
    description: 'Publish and schedule posts across connected accounts, and read analytics — from chat.',
    icon: Share2, badge: 'Studio · agent',
  },
];

function ToolCard({ tool }: { tool: ToolEntry }) {
  const Icon = tool.icon;
  return (
    <Link to={tool.to ?? `/tools/${tool.slug}`} className="group block">
      <Card className="dashboard-card h-full transition-colors hover:border-primary/40">
        <CardContent className="p-5 flex flex-col h-full">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <Badge variant="outline" className="rounded-full text-[10px]">
              {tool.badge}
            </Badge>
          </div>
          <h2 className="text-lg font-semibold mb-1.5 flex items-center gap-1">
            {tool.title}
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:translate-x-0.5 group-hover:text-primary transition-all" />
          </h2>
          <p className="text-sm text-muted-foreground flex-1">{tool.description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function ToolsHubPage() {
  const { user, session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const { quota } = useToolsQuota(accessToken);

  return (
    <ToolsShell backTo="/" headerRight={<QuotaBadge quota={quota} isAuthenticated={!!user} />}>
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center rounded-full bg-primary/10 p-3 mb-4">
          <Calculator className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight mb-3">Free tools</h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Quick utilities for sourcing, pricing and specifying. No login needed — every tool here is
          also available inside the KAI assistant.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TOOLS.map((t) => <ToolCard key={t.slug} tool={t} />)}
      </div>

      {/* Catalog tools — only for signed-in workspaces (need MIVAA / the catalog). */}
      {user && (
        <div className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight mb-1">Catalog tools</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Available in your workspace — these work over your product catalog.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {WORKSPACE_TOOLS.map((t) => <ToolCard key={t.slug} tool={t} />)}
          </div>
        </div>
      )}

      {/* Agent tools — capabilities you run inside the KAI studio (chat + canvas). */}
      {user && (
        <div className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight mb-1">Agent tools</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Run these inside the studio — the agent does the work and shows results on the canvas.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {AGENT_TOOLS.map((t) => <ToolCard key={t.slug} tool={t} />)}
          </div>
        </div>
      )}
    </ToolsShell>
  );
}
