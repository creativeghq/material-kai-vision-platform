import React from 'react';
import {
  Building2,
  Calendar,
  CheckCircle2,
  Download,
  FileText,
  Filter,
  Mail,
  Palette,
  Phone,
  Plus,
  StickyNote,
  Upload,
  Users,
} from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Switch } from '@/components/core/ui/switch';
import { Label } from '@/components/core/ui/label';
import { Progress } from '@/components/core/ui/progress';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import {
  HubCellEmpty,
  HubCellLink,
  HubDataTable,
  HubEmptyState,
  HubFilterSelect,
  HubPanel,
  HubPanelAddAction,
  HubProperty,
  HubPropertyList,
  HubRecordIdentity,
  HubRecordLayout,
  HubSideNav,
  HubStatGrid,
  HubStatTile,
  HubTabAddAction,
  HubTabNav,
  HubTimeline,
  HubTimelineGroup,
  HubTimelineItem,
  HubToolbar,
} from '@/components/core/hub';
import type { HubColumn, HubSort } from '@/components/core/hub';
import { useTheme } from '@/contexts/ThemeContext';
import { formatMoney } from '@/utils/decimal';

/**
 * SPECIMEN SHEET — every surface of the design system on one page.
 *
 * This is a working page, not a screenshot: it renders the real components with
 * the real tokens, so it changes the moment the system does. That is the point —
 * a design system documented only in prose drifts from the code within a
 * release, and then the prose is worse than nothing because people trust it.
 *
 * The theme/accent switcher at the top is here rather than buried in settings
 * because the one thing you cannot check from a screenshot is whether a surface
 * survives all four combinations (light/dark × green/blue).
 */

interface DemoRow {
  id: string;
  name: string;
  company: string | null;
  stage: string;
  owner: string | null;
  value: number;
  updated: string;
}

const DEMO_ROWS: DemoRow[] = [
  { id: '1', name: 'Elena Papadopoulou', company: 'Aegean Interiors', stage: 'Qualified', owner: 'Nikos R.', value: 18400, updated: '2 hours ago' },
  { id: '2', name: 'Marcus Lindqvist', company: 'Nord Studio', stage: 'Proposal', owner: 'Anna K.', value: 42750, updated: 'Yesterday' },
  { id: '3', name: 'Sofia Marino', company: null, stage: 'New', owner: null, value: 0, updated: '3 days ago' },
  { id: '4', name: 'Yusuf Demir', company: 'Levant Stone', stage: 'Won', owner: 'Nikos R.', value: 96200, updated: 'Last week' },
  { id: '5', name: 'Claire Dubois', company: 'Atelier Sud', stage: 'Lost', owner: 'Anna K.', value: 7300, updated: 'Last week' },
];

const STAGE_VARIANT: Record<string, 'success' | 'info' | 'warning' | 'error' | 'neutral'> = {
  Won: 'success',
  Proposal: 'info',
  Qualified: 'warning',
  Lost: 'error',
  New: 'neutral',
};

// Even a specimen sheet formats money through the one canonical formatter —
// tests/unit/moneyPrimitives.test.ts fails the build on a local re-implementation,
// and it is right to: a second formatter is how a platform ends up showing two
// different renderings of the same figure on two screens.
const demoMoney = (n: number) =>
  n === 0 ? null : formatMoney(n, 'EUR', { decimals: 0, maxDecimals: 0 });

export default function DesignSystemPage() {
  const { theme, setTheme, accent, setAccent } = useTheme();

  const [search, setSearch] = React.useState('');
  const [stage, setStage] = React.useState('all');
  const [owner, setOwner] = React.useState('all');
  const [selected, setSelected] = React.useState<Set<string>>(new Set(['2']));
  const [sort, setSort] = React.useState<HubSort>({ columnId: 'value', direction: 'desc' });
  const [section, setSection] = React.useState('overview');
  const [navItem, setNavItem] = React.useState('account');

  const rows = React.useMemo(() => {
    const filtered = DEMO_ROWS.filter(
      (r) =>
        (stage === 'all' || r.stage === stage) &&
        (owner === 'all' || r.owner === owner) &&
        (search === '' || `${r.name} ${r.company ?? ''}`.toLowerCase().includes(search.toLowerCase())),
    );
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.columnId === 'value') return (a.value - b.value) * dir;
      if (sort.columnId === 'name') return a.name.localeCompare(b.name) * dir;
      return 0;
    });
  }, [search, stage, owner, sort]);

  const columns: HubColumn<DemoRow>[] = [
    { id: 'name', header: 'Name', sortable: true, cell: (r) => <HubCellLink>{r.name}</HubCellLink> },
    {
      id: 'company',
      header: 'Company',
      hideBelow: 'md',
      cell: (r) => r.company ?? <HubCellEmpty />,
    },
    {
      id: 'stage',
      header: 'Stage',
      cell: (r) => <Badge variant={STAGE_VARIANT[r.stage] ?? 'neutral'}>{r.stage}</Badge>,
    },
    { id: 'owner', header: 'Owner', hideBelow: 'lg', cell: (r) => r.owner ?? <HubCellEmpty /> },
    {
      id: 'value',
      header: 'Value',
      align: 'right',
      sortable: true,
      cell: (r) => demoMoney(r.value) ?? <HubCellEmpty />,
    },
    { id: 'updated', header: 'Last activity', align: 'right', hideBelow: 'sm', cell: (r) => r.updated },
  ];

  const activeFilters = [stage, owner].filter((v) => v !== 'all').length;

  return (
    <>
      <PageHeader
        icon={Palette}
        title="Design system"
        subtitle="Every surface, token and pattern — rendered live, in the current theme"
        breadcrumbs={[{ label: 'Platform', to: '/' }, { label: 'Design system' }]}
        actions={
          <>
            <Button variant="outline" size="sm">
              <Download />
              Export tokens
            </Button>
            <Button size="sm">
              <Plus />
              New component
            </Button>
          </>
        }
      >
        <HubTabNav
          aria-label="Design system sections"
          activeId={section}
          onSelect={setSection}
          items={[
            { id: 'overview', label: 'Foundations' },
            { id: 'list', label: 'List screen' },
            { id: 'record', label: 'Record screen' },
            { id: 'forms', label: 'Forms' },
          ]}
          trailing={<HubTabAddAction label="Add view" />}
        />
      </PageHeader>

      <div className="space-y-6 p-4 sm:p-6">
        {/* ── Theme matrix ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Theme</CardTitle>
            <CardDescription>
              Two modes × two accents. Every surface below has to hold up in all four — check them
              here rather than trusting a screenshot of one.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Mode</span>
              <div className="flex gap-1">
                {(['light', 'dark'] as const).map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={theme === t ? 'default' : 'outline'}
                    onClick={() => setTheme(t)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Accent</span>
              <div className="flex gap-1">
                {(['green', 'blue'] as const).map((a) => (
                  <Button
                    key={a}
                    size="sm"
                    variant={accent === a ? 'default' : 'outline'}
                    onClick={() => setAccent(a)}
                  >
                    {a}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {section === 'overview' && (
          <>
            <section>
              <SectionHeader
                title="Surfaces"
                subtitle="Page → panel → sunken. Three steps, hairline-separated, no glass and no shadow at rest."
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-hairline bg-background p-4">
                  <p className="text-xs font-semibold text-muted-foreground">Page</p>
                  <p className="mt-1 text-sm">--background</p>
                </div>
                <div className="rounded-md border border-hairline bg-card p-4">
                  <p className="text-xs font-semibold text-muted-foreground">Panel</p>
                  <p className="mt-1 text-sm">--card</p>
                </div>
                <div className="rounded-md border border-hairline bg-surface-sunken p-4">
                  <p className="text-xs font-semibold text-muted-foreground">Sunken</p>
                  <p className="mt-1 text-sm">--surface-sunken</p>
                </div>
              </div>
            </section>

            <section>
              <SectionHeader
                title="Type scale"
                subtitle="Serif for identity (h1/h2), sans for chrome (h3 and below). Weight carries the hierarchy."
              />
              <Card>
                <CardContent className="space-y-2">
                  <h1 className="text-xl font-semibold">Page title — 20px display serif</h1>
                  <h2 className="text-base font-semibold">Section — 16px sans semibold</h2>
                  <h3 className="text-sm font-semibold">Panel title — 14px sans semibold</h3>
                  <p className="text-sm">Body — 14px regular, the default for all content.</p>
                  <p className="text-xs text-muted-foreground">
                    Caption / label — 12px, muted. Used for property labels and helper text.
                  </p>
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    Table header — 11px semibold, muted, never uppercase.
                  </p>
                </CardContent>
              </Card>
            </section>

            <section>
              <SectionHeader
                title="Buttons"
                subtitle="One solid button per screen. Everything else outlines or goes ghost."
              />
              <Card>
                <CardContent className="flex flex-wrap items-center gap-2">
                  <Button>Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="destructive">Delete</Button>
                  <Button variant="link">Link</Button>
                  <Button size="sm" variant="outline">
                    <Upload />
                    Small
                  </Button>
                  <Button size="icon" variant="outline" aria-label="Add">
                    <Plus />
                  </Button>
                  <Button disabled>Disabled</Button>
                </CardContent>
              </Card>
            </section>

            <section>
              <SectionHeader
                title="Tags"
                subtitle="Tinted, squared, 11px. A status is a label — it must not carry the weight of a button."
              />
              <Card>
                <CardContent className="flex flex-wrap items-center gap-2">
                  <Badge>Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="outline">Outline</Badge>
                  <Badge variant="success">Paid</Badge>
                  <Badge variant="warning">Pending</Badge>
                  <Badge variant="error">Overdue</Badge>
                  <Badge variant="info">Draft</Badge>
                  <Badge variant="neutral">Archived</Badge>
                </CardContent>
              </Card>
            </section>

            <section>
              <SectionHeader
                title="KPI tiles"
                subtitle="Auto-fitting grid. Deltas are coloured by meaning, not by direction."
              />
              <HubStatGrid>
                <HubStatTile label="Contacts created" value="444" category="OFFLINE SOURCE" delta={{ value: '12.4%', direction: 'up', caption: 'vs last month' }} />
                <HubStatTile label="Qualified leads" value="69" delta={{ value: '43.75%', direction: 'up' }} help="Contacts whose lifecycle stage reached MQL in the period." />
                <HubStatTile label="Cost per lead" value="€38.20" delta={{ value: '9.1%', direction: 'up', upIsGood: false, caption: 'vs last month' }} />
                <HubStatTile label="Landing page views" value="428,376" delta={{ value: '2.78%', direction: 'down', caption: 'vs last month' }} />
                <HubStatTile label="Open deals" value="1,124" delta={{ value: '0.0%', direction: 'flat' }} />
              </HubStatGrid>
            </section>

            <section>
              <SectionHeader title="Tabs" subtitle="Underline, platform-wide. A filled pill is a button; a tab is a place." />
              <Card>
                <CardContent>
                  <Tabs defaultValue="activity">
                    <TabsList>
                      <TabsTrigger value="activity">Activity</TabsTrigger>
                      <TabsTrigger value="notes">Notes</TabsTrigger>
                      <TabsTrigger value="emails">Emails</TabsTrigger>
                      <TabsTrigger value="calls">Calls</TabsTrigger>
                      <TabsTrigger value="tasks">Tasks</TabsTrigger>
                    </TabsList>
                    <TabsContent value="activity" className="text-sm text-muted-foreground">
                      The active tab is marked by a 2px accent rule under its label and an accent
                      text colour — location, not action.
                    </TabsContent>
                    <TabsContent value="notes" className="text-sm text-muted-foreground">
                      Notes panel.
                    </TabsContent>
                    <TabsContent value="emails" className="text-sm text-muted-foreground">
                      Emails panel.
                    </TabsContent>
                    <TabsContent value="calls" className="text-sm text-muted-foreground">
                      Calls panel.
                    </TabsContent>
                    <TabsContent value="tasks" className="text-sm text-muted-foreground">
                      Tasks panel.
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </section>

            <section>
              <SectionHeader title="Empty states" subtitle="Two kinds of nothing, two different answers." />
              <div className="grid gap-3 md:grid-cols-2">
                <Card>
                  <HubEmptyState
                    icon={Users}
                    title="No contacts yet"
                    description="Import a list or create your first contact to get started."
                    action={
                      <>
                        <Button size="sm">
                          <Plus />
                          Create contact
                        </Button>
                        <Button size="sm" variant="outline">
                          <Upload />
                          Import
                        </Button>
                      </>
                    }
                  />
                </Card>
                <Card>
                  <HubEmptyState
                    variant="filtered"
                    icon={Filter}
                    title="No contacts match these filters"
                    description="You have 4,182 contacts — three filters are excluding all of them."
                    action={
                      <Button size="sm" variant="outline">
                        Clear filters
                      </Button>
                    }
                  />
                </Card>
              </div>
            </section>
          </>
        )}

        {section === 'list' && (
          <section>
            <SectionHeader
              title="List screen"
              subtitle="Toolbar, filters, selection, sorting, empty and footer — one object, not three stacked cards."
            />
            <div className="overflow-hidden rounded-md border border-hairline bg-card">
              <HubToolbar
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search name, company"
                filters={
                  <>
                    <HubFilterSelect
                      label="Stage"
                      value={stage}
                      onChange={setStage}
                      options={[
                        { value: 'all', label: 'All stages' },
                        { value: 'New', label: 'New' },
                        { value: 'Qualified', label: 'Qualified' },
                        { value: 'Proposal', label: 'Proposal' },
                        { value: 'Won', label: 'Won' },
                        { value: 'Lost', label: 'Lost' },
                      ]}
                    />
                    <HubFilterSelect
                      label="Owner"
                      value={owner}
                      onChange={setOwner}
                      options={[
                        { value: 'all', label: 'Any owner' },
                        { value: 'Nikos R.', label: 'Nikos R.' },
                        { value: 'Anna K.', label: 'Anna K.' },
                      ]}
                    />
                    {activeFilters > 0 && (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          setStage('all');
                          setOwner('all');
                        }}
                      >
                        Clear {activeFilters} filter{activeFilters === 1 ? '' : 's'}
                      </Button>
                    )}
                  </>
                }
                actions={
                  <>
                    <Button size="sm" variant="outline">
                      <Download />
                      Export
                    </Button>
                    <Button size="sm">
                      <Plus />
                      Create
                    </Button>
                  </>
                }
              />
              <HubDataTable
                rows={rows}
                columns={columns}
                rowId={(r) => r.id}
                selected={selected}
                onSelectedChange={setSelected}
                sort={sort}
                onSortChange={setSort}
                className="rounded-none border-0"
                empty={
                  <HubEmptyState
                    variant="filtered"
                    icon={Filter}
                    title="Nothing matches"
                    description="Widen the search or clear a filter."
                  />
                }
                footer={
                  <>
                    <span>
                      {selected.size > 0
                        ? `${selected.size} selected`
                        : `Showing ${rows.length} of ${DEMO_ROWS.length}`}
                    </span>
                    {selected.size > 0 && (
                      <div className="ml-auto flex gap-1.5">
                        <Button size="sm" variant="outline">
                          Assign owner
                        </Button>
                        <Button size="sm" variant="outline">
                          Add to list
                        </Button>
                      </div>
                    )}
                  </>
                }
              />
            </div>
          </section>
        )}

        {section === 'record' && (
          <section>
            <SectionHeader
              title="Record screen"
              subtitle="Left: who. Centre: what happened. Right: what it is connected to."
            />
            <div className="overflow-hidden rounded-md border border-hairline bg-background">
              <HubRecordLayout
                left={
                  <>
                    <HubRecordIdentity
                      name="Elena Papadopoulou"
                      subtitle="Specification Manager"
                      meta={<Badge variant="info">Qualified lead</Badge>}
                      actions={
                        <>
                          <Button size="icon-sm" variant="outline" aria-label="Log a note">
                            <StickyNote />
                          </Button>
                          <Button size="icon-sm" variant="outline" aria-label="Send email">
                            <Mail />
                          </Button>
                          <Button size="icon-sm" variant="outline" aria-label="Log a call">
                            <Phone />
                          </Button>
                          <Button size="icon-sm" variant="outline" aria-label="Create task">
                            <CheckCircle2 />
                          </Button>
                          <Button size="icon-sm" variant="outline" aria-label="Schedule meeting">
                            <Calendar />
                          </Button>
                        </>
                      }
                    />
                    <HubPanel title="About this contact" collapsible>
                      <HubPropertyList>
                        <HubProperty label="First name">Elena</HubProperty>
                        <HubProperty label="Last name">Papadopoulou</HubProperty>
                        <HubProperty label="Email">
                          <a className="text-primary hover:underline" href="mailto:elena@aegean.gr">
                            elena@aegean.gr
                          </a>
                        </HubProperty>
                        <HubProperty label="Phone">+30 210 555 0117</HubProperty>
                        <HubProperty label="VAT number">{null}</HubProperty>
                        <HubProperty label="Created">28 Feb 2026, 11:11</HubProperty>
                      </HubPropertyList>
                    </HubPanel>
                  </>
                }
                right={
                  <>
                    <HubPanel title="Deals (2)" action={<HubPanelAddAction label="Add deal" />}>
                      <div className="space-y-2">
                        {[
                          { title: '€18,400 — Showroom refit', stage: 'Proposal sent', close: '30 Nov 2026' },
                          { title: '€4,200 — Sample programme', stage: 'Closed won', close: '30 Nov 2025' },
                        ].map((d) => (
                          <div key={d.title} className="rounded-sm border border-hairline p-2.5">
                            <p className="text-sm font-semibold text-primary">{d.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">Stage: {d.stage}</p>
                            <p className="text-xs text-muted-foreground">Close date: {d.close}</p>
                          </div>
                        ))}
                      </div>
                    </HubPanel>
                    <HubPanel title="Company (1)" action={<HubPanelAddAction label="Add" />}>
                      <div className="flex items-center gap-2 text-sm">
                        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-semibold text-primary">Aegean Interiors</span>
                      </div>
                    </HubPanel>
                    <HubPanel title="Attachments (0)" action={<HubPanelAddAction label="Upload" />}>
                      <p className="text-xs text-muted-foreground">Nothing attached yet.</p>
                    </HubPanel>
                  </>
                }
              >
                <div className="rounded-md border border-hairline bg-card">
                  <HubTabNav
                    aria-label="Record sections"
                    activeId="activity"
                    onSelect={() => undefined}
                    items={[
                      { id: 'activity', label: 'Activity' },
                      { id: 'notes', label: 'Notes', count: 4 },
                      { id: 'emails', label: 'Emails', count: 12 },
                      { id: 'calls', label: 'Calls' },
                      { id: 'tasks', label: 'Tasks', count: 2 },
                    ]}
                  />
                  <div className="p-3">
                    <HubTimeline>
                      <HubTimelineGroup label="Pinned">
                        <HubTimelineItem
                          pinned
                          expandable
                          defaultExpanded
                          title={
                            <>
                              <strong className="font-semibold">Note</strong> from Nikos R.
                            </>
                          }
                          timestamp="9 Mar, 11:41"
                        >
                          Asked for the full technical sheet on the porcelain range before the
                          specification meeting. Sent the EN 14411 declaration.
                        </HubTimelineItem>
                      </HubTimelineGroup>

                      <HubTimelineGroup label="Upcoming">
                        <HubTimelineItem
                          icon={CheckCircle2}
                          title={
                            <>
                              <strong className="font-semibold">Task</strong> assigned to Anna K. —
                              send sample box
                            </>
                          }
                          timestamp="Overdue: 8 Mar"
                          overdue
                        />
                        <HubTimelineItem
                          icon={Calendar}
                          title={
                            <>
                              <strong className="font-semibold">Meeting</strong> — specification
                              review
                            </>
                          }
                          timestamp="4 May, 13:30"
                        />
                      </HubTimelineGroup>

                      <HubTimelineGroup label="March 2026">
                        <HubTimelineItem
                          icon={Mail}
                          expandable
                          title={
                            <>
                              <strong className="font-semibold">Email</strong> — Re: Aegean showroom
                              quantities
                            </>
                          }
                          timestamp="9 Mar, 14:11"
                        >
                          Confirmed 340 m² of the matte finish and asked whether the trim profiles
                          ship from the same batch.
                        </HubTimelineItem>
                        <HubTimelineItem
                          icon={FileText}
                          title={
                            <>
                              <strong className="font-semibold">Quote</strong> QT-2026-0184 sent
                            </>
                          }
                          timestamp="2 Mar, 09:02"
                        />
                      </HubTimelineGroup>
                    </HubTimeline>
                  </div>
                </div>
              </HubRecordLayout>
            </div>
          </section>
        )}

        {section === 'forms' && (
          <section className="space-y-6">
            <SectionHeader
              title="Settings screen"
              subtitle="A section rail plus one form panel. Every control is the same 36px height."
            />
            <div className="flex flex-col gap-4 lg:flex-row">
              <HubSideNav
                activeId={navItem}
                onSelect={setNavItem}
                aria-label="Settings sections"
                groups={[
                  {
                    label: 'Your preferences',
                    items: [
                      { id: 'account', label: 'Account defaults' },
                      { id: 'notifications', label: 'Notifications', count: 3 },
                      { id: 'security', label: 'Security' },
                    ],
                  },
                  {
                    label: 'Workspace',
                    items: [
                      { id: 'team', label: 'Users & teams' },
                      { id: 'branding', label: 'Branding' },
                      { id: 'integrations', label: 'Integrations' },
                      { id: 'billing', label: 'Billing' },
                    ],
                  },
                ]}
              />

              <div className="min-w-0 flex-1">
                <Card>
                  <CardHeader>
                    <CardTitle>Account defaults</CardTitle>
                    <CardDescription>
                      Applied to every new record created in this workspace.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="ds-name">Workspace name</Label>
                        <Input id="ds-name" defaultValue="Aegean Interiors" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ds-currency">Default currency</Label>
                        <Select defaultValue="eur">
                          <SelectTrigger id="ds-currency">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="eur">EUR — Euro</SelectItem>
                            <SelectItem value="gbp">GBP — Pound sterling</SelectItem>
                            <SelectItem value="usd">USD — US dollar</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="ds-notes">Default quote footer</Label>
                      <Textarea
                        id="ds-notes"
                        rows={3}
                        defaultValue="Prices exclude VAT. Lead time confirmed on order."
                      />
                    </div>

                    <div className="space-y-2.5 border-t border-hairline pt-4">
                      <div className="flex items-center gap-2.5">
                        <Checkbox id="ds-cb" defaultChecked />
                        <Label htmlFor="ds-cb" className="font-normal">
                          Send me a weekly pipeline digest
                        </Label>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="ds-sw" className="font-normal">
                          Require approval before a quote is sent
                        </Label>
                        <Switch id="ds-sw" defaultChecked />
                      </div>
                    </div>

                    <div className="space-y-1.5 border-t border-hairline pt-4">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-muted-foreground">Storage used</span>
                        <span className="tabular-nums text-muted-foreground">62%</span>
                      </div>
                      <Progress value={62} />
                    </div>
                  </CardContent>
                  <CardFooter className="justify-end">
                    <Button variant="outline">Cancel</Button>
                    <Button>Save changes</Button>
                  </CardFooter>
                </Card>
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
