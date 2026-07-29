/**
 * Public marketing landing page — /home.
 *
 * Registered OUTSIDE <AuthGuard> in App.tsx (no login required). This is the
 * canonical, publicly-reachable "home page" used for Google OAuth branding
 * verification: it loads with no login, states the app name (MaterialsHub)
 * prominently, and explains what the platform does + its functionality.
 *
 * Self-contained (no Layout / no workspace machinery) so it renders for
 * anonymous visitors and search-engine / verification crawlers.
 */

import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight,
  Bot,
  Boxes,
  Building2,
  Calculator,
  CreditCard,
  FileText,
  Image as ImageIcon,
  KeyRound,
  LineChart,
  LogIn,
  Megaphone,
  MessagesSquare,
  Package,
  PenLine,
  PiggyBank,
  Receipt,
  ScanSearch,
  Sparkles,
  Store,
  TrendingUp,
  Users,
  Wand2,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** Core capabilities — each is a real, shipped part of the platform. */
const FEATURES: Feature[] = [
  {
    icon: Bot,
    title: 'AI assistants',
    description:
      'Chat-driven assistants that search your catalog, draft quotes, build moodboards, run market research and automate everyday work — grounded in your own data.',
  },
  {
    icon: ScanSearch,
    title: 'Visual material search',
    description:
      'Snap or upload a photo of a tile, wood, light or surface and find the closest matches across your catalog with multi-vector AI vision search.',
  },
  {
    icon: FileText,
    title: 'Catalog extraction',
    description:
      'Import supplier PDF and XML catalogs. The pipeline reads layout, tables and images, extracts products, prices and specs, and files them into a searchable knowledge base.',
  },
  {
    icon: ImageIcon,
    title: 'Moodboards & presentation sheets',
    description:
      'Assemble moodboards and generate client-ready presentation sheets — material boards, colour palettes, lighting plans, FF&E schedules and full decks — as polished PDFs.',
  },
  {
    icon: Receipt,
    title: 'Quotes, orders & finance',
    description:
      'Turn selections into branded quotes, orders and invoices with FF&E specification, payments and Greek myDATA e-invoicing built in.',
  },
  {
    icon: Building2,
    title: 'CRM & projects',
    description:
      'Customers, suppliers and projects end to end. One research chain enriches a company from the Greek registries (ΑΑΔΕ → ΓΕΜΗ) and the open web, with multiple named addresses and phone numbers per party.',
  },
  {
    icon: LineChart,
    title: 'Price & market monitoring',
    description:
      'Track competitor prices, brand mentions and market coverage across the web, with alerts when prices drop or new retailers and mentions appear.',
  },
  {
    icon: TrendingUp,
    title: 'SEO & content',
    description:
      'Connect your website once, then pull Search Console performance, run site-health and backlink audits, research keywords and publish SEO articles with internal links written in.',
  },
  {
    icon: MessagesSquare,
    title: 'Shared inbox & WhatsApp',
    description:
      'Team, customer and WhatsApp conversations in one inbox. A reply assigns itself to the person who started the thread, so nothing sits unowned.',
  },
  {
    icon: Wand2,
    title: 'AR, 3D & staging',
    description:
      'Preview materials in AR, simulate lighting, generate 3D and virtual-staging renders, and explore rooms as immersive walkthroughs.',
  },
  {
    icon: Store,
    title: 'Marketplace & storefronts',
    description:
      'Publish an online storefront, share catalogs, run a counter with point of sale, and connect with brands and buyers through the materials marketplace.',
  },
  {
    icon: Workflow,
    title: 'Automations & flows',
    description:
      'Automate notifications, emails and workflows with a visual flow builder — no code. Every alert on the platform runs through it, so you can retarget or pause any of them.',
  },
];

interface App {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** Purchasable add-on modules — switch them on per workspace from the in-app app store. */
const APPS: App[] = [
  {
    icon: Building2,
    title: 'Real Estate',
    description:
      'Listings, leads, viewings, offers and sales, with public listing pages, a buyer portal that matches saved requirements automatically, and syndication to property portals.',
  },
  {
    icon: KeyRound,
    title: 'Property Management',
    description:
      'Tenancies, rent schedules, maintenance jobs and landlord statements. Rent due becomes a draft invoice for you to review — never an automatic filing.',
  },
  {
    icon: PiggyBank,
    title: 'Investments',
    description:
      'Model a property as an investment case: purchase, costs, financing and projected yield and ROI.',
  },
  {
    icon: Users,
    title: 'HR & payroll',
    description:
      'Employees, absences, attendance and clock-in, payroll runs, document OCR, Greek Εργάνη filing, and a branded public careers page with its own job board.',
  },
  {
    icon: Package,
    title: 'Stock & warehouse',
    description:
      'Multi-warehouse inventory, transfers, stocktakes, inbound shipments and reorder points — wired straight into order fulfilment and delivery notes.',
  },
  {
    icon: PenLine,
    title: 'Contracts & e-signature',
    description:
      'Draft, send and countersign contracts. The counterparty signs from a link with no account, and the signed PDF is archived against the record it came from.',
  },
  {
    icon: Megaphone,
    title: 'Email marketing',
    description:
      'Campaigns built on a visual editor, sent through your own provider account, with working one-click unsubscribe and suppression handled for you.',
  },
  {
    icon: CreditCard,
    title: 'Payments',
    description:
      'Take card payments through Stripe or Viva, send pay-by-link invoices, and reconcile settlements back against the invoice automatically.',
  },
];

/** Free, no-login public tools already live on the platform. */
const TOOLS: { label: string; to: string }[] = [
  { label: 'Material search', to: '/tools/product-search' },
  { label: 'Price scan', to: '/tools/price-scan' },
  { label: 'Mention scan', to: '/tools/mention-scan' },
  { label: 'Project plan estimator', to: '/tools/project-plan' },
  { label: 'Heat-pump sizer', to: '/tools/heat-pump' },
  { label: 'Heating cost comparison', to: '/tools/heating-cost' },
];

function BrandMark() {
  return (
    <Link to="/home" className="flex items-center gap-2.5">
      <img src="/mh-logo.png" alt="" aria-hidden="true" className="h-7 w-auto block dark:hidden" />
      <img src="/mh-logo-white.png" alt="" aria-hidden="true" className="h-7 w-auto hidden dark:block" />
      <span className="font-display text-lg font-semibold tracking-tight">MaterialsHub</span>
    </Link>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>MaterialsHub — Materials sourcing, catalog & business platform</title>
        <meta
          name="description"
          content="MaterialsHub is an AI-powered platform for materials sourcing, catalog management, visual search, quoting, moodboards and business management for design and construction professionals."
        />
      </Helmet>

      {/* Header */}
      <header className="border-b border-border/40 sticky top-0 z-30 bg-background/80 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <BrandMark />
          <div className="flex items-center gap-2 sm:gap-3 text-sm">
            <Link to="/tools">
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex">Free tools</Button>
            </Link>
            <Link to="/brands">
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex">Brands</Button>
            </Link>
            <Link to="/changelog">
              <Button variant="ghost" size="sm" className="hidden md:inline-flex">What's new</Button>
            </Link>
            <Link to="/auth">
              <Button variant="ghost" size="sm" className="gap-2">
                <LogIn className="h-4 w-4" />
                <span>Sign in</span>
              </Button>
            </Link>
            <Link to="/auth?mode=signup">
              <Button size="sm" className="gap-2">
                Get started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Brand aurora glow behind the hero */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(720px 480px at 80% -10%, hsl(var(--primary) / 0.18), transparent 60%), radial-gradient(560px 420px at 6% 8%, hsl(var(--primary) / 0.10), transparent 60%)',
          }}
        />
        <div className="container mx-auto max-w-5xl px-4 py-20 sm:py-28 text-center">
          <Badge variant="outline" className="rounded-full mb-6 gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI-powered materials platform
          </Badge>

          <h1 className="font-display text-4xl sm:text-6xl font-semibold tracking-tight mb-6">
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'var(--brand-gradient)' }}
            >
              MaterialsHub
            </span>
            <br className="hidden sm:block" />
            <span className="text-foreground"> the materials command center</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            MaterialsHub helps design and construction professionals source, catalog and specify
            materials — with AI visual search, catalog extraction, moodboards, quoting, CRM and
            finance in one place.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/auth?mode=signup">
              <Button size="lg" className="gap-2">
                Create free account
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/tools">
              <Button size="lg" variant="outline" className="gap-2">
                <Calculator className="h-4 w-4" />
                Try the free tools
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto max-w-6xl px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="font-display text-3xl font-semibold tracking-tight mb-3">
            Everything from a photo to a paid invoice
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            One platform for the whole materials workflow — discovery, specification and the business
            around it.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <Card key={f.title} className="dashboard-card h-full">
                <CardContent className="p-6 flex flex-col h-full">
                  <div className="rounded-xl bg-primary/10 p-2.5 w-fit mb-4">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1.5">{f.title}</h3>
                  <p className="text-sm text-muted-foreground flex-1">{f.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Business apps (add-on modules) */}
      <section className="container mx-auto max-w-6xl px-4 pb-16">
        <div className="text-center mb-12">
          <h2 className="font-display text-3xl font-semibold tracking-tight mb-3">
            Switch on only the apps you need
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            The platform is modular. Every workspace starts with the core, and you enable the rest
            from the in-app store when the business actually needs them.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {APPS.map((a) => {
            const Icon = a.icon;
            return (
              <Card key={a.title} className="dashboard-card h-full">
                <CardContent className="p-5 flex flex-col h-full">
                  <div className="rounded-xl bg-primary/10 p-2 w-fit mb-3">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <h3 className="text-base font-semibold mb-1.5">{a.title}</h3>
                  <p className="text-sm text-muted-foreground flex-1">{a.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Free tools strip */}
      <section className="container mx-auto max-w-5xl px-4 pb-16">
        <Card className="dashboard-card">
          <CardContent className="p-8 flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Boxes className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold tracking-tight">Free tools — no login needed</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Get a feel for the platform with quick utilities for pricing, sourcing and planning.
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                {TOOLS.map((t) => (
                  <Link key={t.to} to={t.to}>
                    <Badge variant="outline" className="rounded-full hover:border-primary/40 cursor-pointer">
                      {t.label}
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
            <Link to="/tools" className="shrink-0">
              <Button variant="outline" className="gap-2">
                Explore tools
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </section>

      {/* CTA */}
      <section className="container mx-auto max-w-4xl px-4 pb-24 text-center">
        <h2 className="font-display text-3xl font-semibold tracking-tight mb-4">
          Ready to organise your materials?
        </h2>
        <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
          Create a free MaterialsHub account and start sourcing, specifying and quoting in minutes.
        </p>
        <Link to="/auth?mode=signup">
          <Button size="lg" className="gap-2">
            Get started free
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40">
        <div className="container mx-auto max-w-6xl px-4 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src="/mh-logo.png" alt="" aria-hidden="true" className="h-5 w-auto block dark:hidden" />
            <img src="/mh-logo-white.png" alt="" aria-hidden="true" className="h-5 w-auto hidden dark:block" />
            <span>© {new Date().getFullYear()} MaterialsHub</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link to="/tools" className="hover:text-foreground transition-colors">Tools</Link>
            <Link to="/brands" className="hover:text-foreground transition-colors">Brands</Link>
            <Link to="/knowledge-base" className="hover:text-foreground transition-colors">Knowledge base</Link>
            <Link to="/changelog" className="hover:text-foreground transition-colors">Changelog</Link>
            <a href="/documentation/" className="hover:text-foreground transition-colors">Documentation</a>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <a href="mailto:support@materialshub.gr" className="hover:text-foreground transition-colors">
              support@materialshub.gr
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
