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
 *
 * KEEPING IT HONEST: every entry below names something that is actually shipped
 * and reachable. FEATURES is the core platform, APPS mirrors the module catalog
 * (`modules` table + each module's manifest.json), and TOOLS mirrors the public
 * grid in `src/pages/Tools/ToolsHubPage.tsx`. When a module ships or a public
 * tool is added, update the matching array here — a landing page that lags the
 * product is how prospects end up asking for things that already exist.
 */

import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight,
  Bot,
  BookOpen,
  Boxes,
  Building2,
  Calculator,
  CodeXml,
  Contact,
  CreditCard,
  FileText,
  HardHat,
  Image as ImageIcon,
  KeyRound,
  Landmark,
  LineChart,
  LogIn,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Package,
  PenLine,
  PiggyBank,
  Receipt,
  Ruler,
  ScanSearch,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  Target,
  TrendingUp,
  Users,
  Workflow,
  Wrench,
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
      'Chat-driven assistants with real tools — they search your catalog, price a spec, draft quotes, build moodboards, run market research and carry out work in your workspace, grounded in your own data.',
  },
  {
    icon: ScanSearch,
    title: 'Visual material search',
    description:
      'Snap or upload a photo of a tile, wood, stone or light fitting and find the closest matches in your catalog — AI vision that compares colour, texture, style and material, not filenames.',
  },
  {
    icon: FileText,
    title: 'Catalog extraction',
    description:
      'Import supplier PDF and XML catalogs. The pipeline reads layout, tables and images, extracts products, variants, prices and specs, and files them into a searchable knowledge base.',
  },
  {
    icon: ImageIcon,
    title: 'Moodboards & client sheets',
    description:
      'Assemble moodboards and generate client-ready presentation sheets — material boards, colour palettes, lighting plans, FF&E schedules and full decks — as polished PDFs or a shareable client view.',
  },
  {
    icon: Ruler,
    title: 'Room planner',
    description:
      'Draw a room to scale, place real catalog products at their true size in 2D or 3D, then turn the plan straight into a quote — or send it to the client as a page they can open.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Product configurator',
    description:
      'Let a customer configure finish, size, edge and mechanism, with variant rules deciding what is actually buildable and one price derivation behind it. The configuration becomes a quote line.',
  },
  {
    icon: Boxes,
    title: '3D, AR & visualisation',
    description:
      'Product models measured at upload, AI-generated material textures and surface relief, shared lighting presets, AR preview in the real room, and virtual-staging renders.',
  },
  {
    icon: Receipt,
    title: 'Quotes, orders & invoicing',
    description:
      'Selections become branded quotes, then orders, delivery notes and invoices — with payments, customs codes, units of measure and Greek myDATA e-invoicing built in. A filed MARK makes the document immutable.',
  },
  {
    icon: Contact,
    title: 'CRM, parties & accounts',
    description:
      'Customers, suppliers and contacts with several named addresses and phone numbers each. One research chain enriches a company from the Greek registries (ΑΑΔΕ → ΓΕΜΗ) and the open web, and every party carries an account balance you can drill into.',
  },
  {
    icon: HardHat,
    title: 'Projects & job costing',
    description:
      'Run the whole engagement: rooms, budget against actual, labour and job costing, a schedule with dependencies and a critical path, snags and a site log, a revisioned drawing register and threaded client requests.',
  },
  {
    icon: MessagesSquare,
    title: 'Shared inbox',
    description:
      'Team, customer and WhatsApp conversations in one inbox. A reply assigns itself to the person who started the thread, and an incoming order can be turned into a real order without leaving it.',
  },
  {
    icon: Store,
    title: 'Storefront & marketplace',
    description:
      'Publish an online storefront, share catalogs, run a counter with point of sale, and meet brands and buyers through the materials marketplace and public brand pages.',
  },
  {
    icon: CodeXml,
    title: 'Sell from your own site',
    description:
      'Drop the MaterialsHub web component — or the Shopify app block — onto your own website. Visitors view the product in 3D, configure it, place it on a room plan and get a price, or a quote request when nothing matches.',
  },
  {
    icon: Workflow,
    title: 'Automations & flows',
    description:
      'Automate notifications, emails and workflows in a visual builder — no code. Every alert on the platform runs through it, so you can retarget or pause any of them, and outbound webhooks push the same events to your own systems.',
  },
  {
    icon: Wrench,
    title: 'Service & installed base',
    description:
      'What you sold is still the customer’s. Track installed equipment, warranty cover and recurring service plans, issue warranty certificates, and open the next visit only when the last one is signed off.',
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
      'Listings, leads routed by territory, viewings, offers behind an AML/KYC gate, commission splits and vendor reports — plus public listing pages, a buyer portal and portal syndication in both directions.',
  },
  {
    icon: KeyRound,
    title: 'Property Management',
    description:
      'Tenancies, rent schedules, maintenance work orders, landlord statements and short-let operations with changeover and channel sync. Rent due becomes a draft invoice for you to review — never an automatic filing.',
  },
  {
    icon: PiggyBank,
    title: 'Investments',
    description:
      'Model a property as an investment case — purchase, costs, financing and rent turned into gross and net yield, cap rate, cash-on-cash return and a portfolio roll-up.',
  },
  {
    icon: Users,
    title: 'HR & payroll',
    description:
      'Employees, absences, attendance and clock-in, payroll runs, document OCR, the full Greek Εργάνη E-document set, and a branded careers page with its own job board.',
  },
  {
    icon: Package,
    title: 'Stock & warehouse',
    description:
      'Multi-warehouse inventory, transfers, stocktakes, inbound shipments, dispatch and reorder points — with stock leaving the warehouse only against a fiscal document.',
  },
  {
    icon: PenLine,
    title: 'Contracts & e-signature',
    description:
      'Draft, send and countersign contracts across HR, finance and projects. The counterparty signs from a link with no account, and the signed PDF is archived against the record it came from.',
  },
  {
    icon: CreditCard,
    title: 'Payments',
    description:
      'Take card payments through Stripe, Viva.com or Revolut Checkout, send pay-by-link invoices, and reconcile settlements back against the invoice automatically.',
  },
  {
    icon: Landmark,
    title: 'Business banking',
    description:
      'Connect the workspace’s own Revolut Business account: live balances, a per-leg transaction feed into Finance and webhook-driven reconciliation. Your keys and your account, never the operator’s.',
  },
  {
    icon: Target,
    title: 'Deals & pipeline',
    description:
      'One pipeline across the platform, with stage sets that belong to a deal type — a construction deal cannot land in a conveyancing stage. Weighted forecast, deal team and a full stage history.',
  },
  {
    icon: Megaphone,
    title: 'Email marketing',
    description:
      'Campaigns built on a visual editor, sent through your own provider account, with working one-click unsubscribe and suppression handled for you.',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp & push',
    description:
      'WhatsApp and web-push as first-class channels — templates, campaigns, reply capture, opt-outs and delivery analytics.',
  },
  {
    icon: Share2,
    title: 'Social media',
    description:
      'Connect Instagram, Facebook, LinkedIn, X and TikTok. Generate posts, images and video, schedule them, and sync analytics and audience insights.',
  },
  {
    icon: TrendingUp,
    title: 'SEO toolkit',
    description:
      'Keyword research, SERP and URL audits, backlinks, OnPage crawls and Search Console performance per connected site — then publish SEO articles with internal links drawn from your real pages.',
  },
  {
    icon: LineChart,
    title: 'Price & mention monitoring',
    description:
      'Track competitor prices across Greek and EU marketplaces, watch any page for changes, and follow brand mentions across news, blogs, Reddit, YouTube and LLM answers — with alerts when something moves.',
  },
  {
    icon: Star,
    title: 'Reviews & ratings',
    description:
      'Product and professional-profile reviews with verified-purchase badges, owner replies and AI review summaries, surfaced on product and brand pages.',
  },
  {
    icon: BookOpen,
    title: 'Presentation catalogs',
    description:
      'Turn manufacturer PDFs into editable, branded catalogs with email-gated public landing pages.',
  },
];

/** Free, no-login public tools already live on the platform. Mirrors /tools. */
const TOOLS: { label: string; to: string }[] = [
  { label: 'Material search', to: '/tools/product-search' },
  { label: 'Heat-pump sizer', to: '/tools/heat-pump' },
  { label: 'Heating cost comparison', to: '/tools/heating-cost' },
  { label: 'Kitchen cost calculator', to: '/tools/kitchen-cost' },
  { label: 'Price scan', to: '/tools/price-scan' },
  { label: 'Mention scan', to: '/tools/mention-scan' },
  { label: 'Project plan estimator', to: '/tools/project-plan' },
];

/** Systems the platform talks to — each one is a live integration, not a roadmap item. */
const INTEGRATIONS: string[] = [
  'myDATA (ΑΑΔΕ)',
  'ΓΕΜΗ',
  'Εργάνη',
  'TARIC customs',
  'Revolut Business',
  'Stripe',
  'Viva.com',
  'Shopify',
  'WhatsApp',
  'Google Search Console',
  'Google Calendar',
  'Skroutz & BestPrice',
  'Outbound webhooks',
  'Public API',
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
          content="MaterialsHub is an AI-powered platform for materials sourcing, catalog management, visual search, room planning, quoting and moodboards — plus the business behind them: CRM, projects, finance, HR and real estate."
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
          <Badge variant="outline" className="mb-6 gap-1.5">
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
            For design, construction and materials businesses: AI visual search and catalog
            extraction at the front, room planning, configuration and quoting in the middle, and
            CRM, projects, warehouse and finance behind it — one platform, start to finish.
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
            One platform for the whole materials workflow — discovery, specification, the sale, and
            the business around it.
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

      {/* Integrations */}
      <section className="container mx-auto max-w-4xl px-4 pb-16 text-center">
        <h2 className="font-display text-2xl font-semibold tracking-tight mb-3">
          Connected to the systems you already use
        </h2>
        <p className="text-muted-foreground text-sm max-w-xl mx-auto mb-6">
          Greek fiscal and registry services, payments, banking, storefronts and messaging — each
          running on your own credentials, held per workspace.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {INTEGRATIONS.map((name) => (
            <Badge key={name} variant="outline" className="font-normal">
              {name}
            </Badge>
          ))}
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
                    <Badge variant="outline" className="hover:border-primary/40 cursor-pointer">
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
