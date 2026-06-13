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
  Flame,
  MessageSquareText,
  ShoppingBag,
  Thermometer,
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
}

const TOOLS: ToolEntry[] = [
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
];

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
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.slug} to={`/tools/${t.slug}`} className="group block">
              <Card className="dashboard-card h-full transition-colors hover:border-primary/40">
                <CardContent className="p-5 flex flex-col h-full">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="rounded-xl bg-primary/10 p-2.5">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <Badge variant="outline" className="rounded-full text-[10px]">
                      {t.badge}
                    </Badge>
                  </div>
                  <h2 className="text-lg font-semibold mb-1.5 flex items-center gap-1">
                    {t.title}
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:translate-x-0.5 group-hover:text-primary transition-all" />
                  </h2>
                  <p className="text-sm text-muted-foreground flex-1">{t.description}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </ToolsShell>
  );
}
