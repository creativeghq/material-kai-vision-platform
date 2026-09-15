/**
 * "Start Here" — the first-run walkthrough, declared once.
 *
 * Setup steps mount the REAL settings components (no second write path to drift); tour steps are
 * a grid of highlights, each one a link to a place that exists. Routes here are checked by
 * tests/unit/onboardingSteps.test.ts against the app's own route table, and `?tab=` links are
 * checked by deepLinkTargets.test.ts along with every other link in the repo.
 */
import {
  Activity, Bot, Building2, CalendarClock, Contact, DraftingCompass, FileSignature, FileText,
  FolderKanban, Globe, Grid3x3, Handshake, ImagePlus, Inbox, KeyRound, LayoutDashboard, Wallet,
  BookOpen, Boxes, Megaphone, Palette, Radar, Ruler, ScanLine, Share2, Sofa, Sparkles, Store,
  TrendingUp, Users, Workflow, Coins, LibraryBig,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PRODUCT_BROWSE_ANY, type Capability } from '@/auth/capabilities';

/** A setup step asks the user to DO something; a tour step shows them where something lives. */
export type OnboardingStepKind = 'setup' | 'tour';

export interface OnboardingHighlight {
  /** The product's own name for it — the same words the launcher tile uses. */
  label: string;
  description: string;
  /** A real in-app route. Nine of the launcher's tiles open the agent, not a page — keep those. */
  route: string;
  icon: LucideIcon;
  /**
   * The module that has to be on for the route to render anything. A highlight whose module the
   * workspace does not own still renders — as a link to Profile → Modules, never to a blank page.
   */
  moduleSlug?: string;
  /**
   * The nav gates this destination on `requireRole: 'admin'`, so a plain member cannot open it.
   * Offering it anyway is the "offered but not bound" failure: they click, and a guard refuses.
   * Held to nav-items.ts by tests/unit/onboardingSteps.test.ts.
   */
  requireAdmin?: boolean;
  /**
   * What the ROUTE guards on. A tile the reader cannot open is worse than no tile: they click and
   * a CapabilityGuard refuses. Never fewer gates than the nav item for the same route carries —
   * held to nav-items.ts by tests/unit/onboardingSteps.test.ts.
   */
  requireCapability?: Capability;
  /** Visible when the member holds ANY of these — the nav's own OR-gate, same meaning. */
  requireAnyCapability?: readonly Capability[];
}

export interface OnboardingStep {
  id: string;
  kind: OnboardingStepKind;
  /** Short label for the progress rail. */
  navLabel: string;
  title: string;
  /** One or two sentences under the title. */
  lede: string;
  icon: LucideIcon;
  /**
   * Setup work belongs to whoever runs the workspace. A step with this set is skipped entirely
   * for a member who could not act on it — an invited employee never sees the VAT form.
   */
  requireWorkspaceManager?: boolean;
  requireCapability?: Capability;
  highlights?: readonly OnboardingHighlight[];
  /** Small print under the step body. */
  footnote?: string;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  // ───────────────────────────── setup ─────────────────────────────
  {
    id: 'business',
    kind: 'setup',
    navLabel: 'Business Details',
    title: 'Your business details',
    lede:
      'Every invoice, quote and delivery note you issue carries these, and so does the envelope '
      + 'filed with ΑΑΔΕ. Fill them in once — enter your VAT number and we can fetch the rest.',
    icon: Building2,
    requireWorkspaceManager: true,
    requireCapability: 'finance.manage',
    footnote: 'You can change any of this later under Finance → Settings → Business Identity.',
  },
  {
    id: 'myaade',
    kind: 'setup',
    navLabel: 'myDATA & ΑΑΔΕ',
    title: 'Connect myDATA and ΑΑΔΕ',
    lede:
      'Two separate credentials: Special Access Codes look up a Greek company by VAT number, and '
      + 'the myDATA REST keys transmit your documents and read back what suppliers have filed '
      + 'against you.',
    icon: FileText,
    requireWorkspaceManager: true,
    requireCapability: 'finance.manage',
    footnote:
      'Greek businesses only — skip this if you do not file with ΑΑΔΕ. Both live under '
      + 'Profile → Keys afterwards.',
  },
  {
    id: 'workspace',
    kind: 'setup',
    navLabel: 'Modules & Team',
    title: 'Turn on what you need, and bring your team',
    lede:
      'Most of the platform is opt-in. Switch on the modules you actually work with — the rest '
      + 'stays out of your way — then invite the people who will use them. Each teammate gets a '
      + 'role that decides what they can open.',
    icon: Boxes,
    requireWorkspaceManager: true,
    footnote: 'Profile → Modules and Profile → Team, any time.',
  },

  // ───────────────────────────── tour ─────────────────────────────
  {
    id: 'agent',
    kind: 'tour',
    navLabel: 'The Agent',
    title: 'The Agent is how you use most of this',
    lede:
      'Rather than hunting through screens, you ask. The Agent Hub is one chat with a canvas beside '
      + 'it, and behind it sit specialists that pick themselves up when they are relevant — Trinity '
      + 'for quotes and invoices, Vision for interiors and renders, Edith for SEO and content, '
      + 'Pepper for products and company research, Hermes for messages and social, Estate for '
      + 'property. They share your data, so a question can cross modules.',
    icon: Bot,
    requireCapability: 'agent.use',
    highlights: [
      {
        label: 'Agent Hub',
        description: 'Chat plus a canvas. Every toolkit, artifact and generated image lands here.',
        route: '/agent-hub',
        icon: Sparkles,
      },
      {
        label: 'Discover',
        description: 'Browse the material catalog, other members and the marketplace.',
        route: '/discover',
        icon: LibraryBig,
        requireAnyCapability: PRODUCT_BROWSE_ANY,
      },
      {
        label: 'Dashboard',
        description: 'What needs you today, drawn from whichever modules you turned on.',
        route: '/',
        icon: LayoutDashboard,
      },
    ],
    // Spotlight is not a tile: ⌘K is an overlay with no route of its own, and a tile linking to
    // /agent-hub would have promised something the click could not deliver.
    footnote:
      'Press ⌘K (Ctrl+K) anywhere to jump straight to a record. Agent work spends credits — '
      + 'your balance and top-ups live under Profile → Credits.',
  },
  {
    id: 'sales',
    kind: 'tour',
    navLabel: 'Sales',
    title: 'Sales — the people you sell to',
    lede:
      'One party record runs through all of it: a company or contact in CRM is the same party a '
      + 'deal, a quote and an invoice point at, so nobody is typed in twice.',
    icon: Handshake,
    highlights: [
      {
        label: 'CRM',
        description: 'Contacts, companies and suppliers — with duplicate search before you create.',
        route: '/crm',
        icon: Contact,
        moduleSlug: 'crm',
        requireCapability: 'crm.view',
      },
      {
        label: 'Deals',
        description: 'A pipeline per deal type, with a weighted forecast derived from the stages.',
        route: '/crm?tab=pipeline',
        icon: Handshake,
        moduleSlug: 'deals',
        requireCapability: 'crm.view',
      },
      {
        label: 'Quotes',
        description: 'Build a quote, send a link, and turn an accepted one into an order.',
        route: '/quotes',
        icon: FileText,
        moduleSlug: 'quotes',
        requireCapability: 'quotes.use',
      },
      {
        label: 'Real Estate',
        description: 'Listings, viewings, buyers and sellers — plus letting and investment add-ons.',
        route: '/properties',
        icon: Building2,
        moduleSlug: 'real-estate',
        requireCapability: 'realestate.view',
      },
      {
        label: 'Appointments',
        description: 'Book meetings with reminders, off your own published availability.',
        route: '/agent-hub?capability=appointments',
        icon: CalendarClock,
        moduleSlug: 'crm',
        requireCapability: 'agent.use',
      },
      {
        label: 'Market Trends',
        description: 'What buyers across the platform search for, save and ask to be quoted.',
        route: '/market-trends',
        icon: TrendingUp,
        requireAdmin: true,
      },
    ],
  },
  {
    id: 'studio',
    kind: 'tour',
    navLabel: 'Studio',
    title: 'Studio — what you design and show',
    lede:
      'A project holds the rooms, the money and the people; everything else here feeds it. The '
      + 'design tools are agent-driven, so "empty this room and lay a light oak floor" is the '
      + 'interface.',
    icon: Palette,
    highlights: [
      {
        label: 'Projects',
        description: 'Rooms, deadlines, tasks, budget against actual, and the client’s own view.',
        route: '/projects',
        icon: FolderKanban,
        moduleSlug: 'projects',
      },
      {
        label: 'Interior Design',
        description: 'Design, render, stage, empty or re-light a room — and floor plan to 3D.',
        route: '/agent-hub?capability=interior',
        icon: Sofa,
      },
      {
        label: 'MoodBoards',
        description: 'Curate materials and inspiration into a board you can share as a link.',
        route: '/moodboard',
        icon: Palette,
      },
      {
        label: 'Image Studio',
        description: 'Product shots, marketing visuals and photo edits — same engine, no room.',
        route: '/agent-hub?capability=image-studio&generation_mode=image-edit',
        icon: ImagePlus,
        requireCapability: 'agent.use',
      },
      {
        label: 'Room Planner',
        description: 'Lay catalog products out on a floor plan at their real size.',
        route: '/room-planner',
        icon: Ruler,
      },
      {
        label: 'Surface Visualizer',
        description: 'Put a tile, stone or floor onto a room photo, to scale, in the browser.',
        route: '/visualizer',
        icon: Grid3x3,
      },
      {
        label: 'Blueprints',
        description: 'A reusable kitchen or scope of works that prices a whole project in one click.',
        route: '/blueprints',
        icon: DraftingCompass,
      },
      {
        label: 'Catalogs',
        description: 'Branded product catalogs built from manufacturer PDFs, shared as a page.',
        route: '/agent-hub?capability=catalog',
        icon: BookOpen,
        moduleSlug: 'presentation-catalogs',
        requireCapability: 'agent.use',
      },
    ],
  },
  {
    id: 'operations',
    kind: 'tour',
    navLabel: 'Finance & People',
    title: 'Finance, warehouse and people',
    lede:
      'The ERP half. Money is derived in one place and formatted everywhere else, so a balance on '
      + 'an order, a statement and a report cannot disagree with each other.',
    icon: Wallet,
    highlights: [
      {
        label: 'Finance',
        description:
          'Orders, invoices, receipts, credit notes, expenses, payments, reports and the myDATA book.',
        route: '/finance',
        icon: Wallet,
        moduleSlug: 'sales-finance',
        requireCapability: 'finance.manage',
      },
      {
        label: 'POS',
        description: 'Cash register — issue a retail receipt, take payment, print, all myDATA-filed.',
        route: '/pos',
        icon: ScanLine,
        moduleSlug: 'sales-finance',
        requireCapability: 'invoice.issue',
      },
      {
        label: 'Warehouse',
        description: 'Inventory, inbound, dispatch, movements, valuation and stock counts.',
        route: '/warehouse',
        icon: Boxes,
        moduleSlug: 'stock',
        requireCapability: 'warehouse.manage',
      },
      {
        label: 'Contracts',
        description: 'Send a contract for e-signature and track it back to the record it belongs to.',
        route: '/agent-hub?capability=contract',
        icon: FileSignature,
        moduleSlug: 'contracts',
        requireCapability: 'agent.use',
      },
      {
        label: 'HR',
        description: 'Employees, time off, attendance, payroll, departures and Εργάνη filings.',
        route: '/hr',
        icon: Users,
        moduleSlug: 'hr',
        requireCapability: 'hr.view',
      },
      {
        label: 'Client Portal',
        description: 'Where your customer sees their own orders, invoices, balance and pays.',
        route: '/portal',
        icon: Store,
      },
    ],
    footnote:
      'Bank feed, Stripe, Viva and Revolut are modules too — switch them on under Profile → Modules.',
  },
  {
    id: 'more',
    kind: 'tour',
    navLabel: 'Wait, we are not done!',
    title: 'Wait, we are not done!',
    lede:
      'You do not need any of this on day one. It is here so you know it exists when you want it.',
    icon: Activity,
    highlights: [
      {
        label: 'Inbox',
        description:
          'One thread list for WhatsApp, email, social DMs and comments, and profile enquiries.',
        route: '/inbox',
        icon: Inbox,
        moduleSlug: 'inbox',
        requireCapability: 'inbox.use',
      },
      {
        label: 'SEO & Content',
        description: 'Keyword research, audits, backlinks, AI visibility and article writing.',
        route: '/agent-hub?capability=seo-research',
        icon: TrendingUp,
        moduleSlug: 'seo-toolkit',
        requireCapability: 'agent.use',
      },
      {
        label: 'Your websites',
        description: 'Connect a site to open its SEO dashboard and Search Console data.',
        route: '/profile?tab=websites',
        icon: Globe,
      },
      {
        label: 'Automations',
        description: 'When something happens in the workspace, do something about it.',
        route: '/automations',
        icon: Workflow,
        moduleSlug: 'flows-toolkit',
        requireCapability: 'agent.use',
      },
      {
        label: 'Email Marketing',
        description: 'Templates, contact lists and bulk campaigns from your own domain.',
        route: '/marketing/email',
        icon: Megaphone,
        moduleSlug: 'email-marketing',
        requireCapability: 'marketing.email',
      },
      {
        label: 'Social Media',
        description: 'Write, schedule and publish to Instagram, Facebook, LinkedIn, X and TikTok.',
        route: '/agent-hub?capability=social-post',
        icon: Share2,
        moduleSlug: 'social-media',
        requireCapability: 'agent.use',
      },
      {
        label: 'Mention Monitoring',
        description: 'Where your brand gets talked about — news, blogs, Reddit, YouTube, chatbots.',
        route: '/mention-monitoring',
        icon: Radar,
        moduleSlug: 'mention-monitoring',
        requireAdmin: true,
      },
      {
        label: 'Page Monitoring',
        description: 'Watch a page you do not control — a supplier price list — and see what changed.',
        route: '/monitoring/pages',
        icon: FileText,
      },
      {
        label: 'Knowledge Base',
        description: 'The public material and brand library, and the docs behind your own answers.',
        route: '/knowledge-base',
        icon: LibraryBig,
      },
      {
        label: 'Templates',
        description: 'Reusable starting points for invoices, quotes, projects, moodboards and more.',
        route: '/templates',
        icon: FileText,
      },
      {
        label: 'Credits',
        description: 'What agent work costs, what you have left, and how to top up.',
        route: '/profile?tab=credits',
        icon: Coins,
      },
      {
        label: 'Keys',
        description: 'Bring your own provider keys — ΑΑΔΕ, email, shipping, social — per workspace.',
        route: '/profile?tab=keys',
        icon: KeyRound,
      },
    ],
  },
] as const;

export const ONBOARDING_STEP_IDS: readonly string[] = ONBOARDING_STEPS.map((s) => s.id);

export interface OnboardingAudience {
  isWorkspaceManager: boolean;
  can: (capability: Capability) => boolean;
}

/**
 * The steps THIS member actually gets. A step they could not act on is dropped rather than shown
 * disabled: a wizard that opens on a form its reader may not submit reads as broken.
 */
export function visibleOnboardingSteps(audience: OnboardingAudience): OnboardingStep[] {
  return ONBOARDING_STEPS.filter((step) => {
    if (step.requireWorkspaceManager && !audience.isWorkspaceManager) return false;
    if (step.requireCapability && !audience.can(step.requireCapability)) return false;
    return true;
  });
}
