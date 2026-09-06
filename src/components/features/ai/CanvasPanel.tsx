/**
 * CanvasPanel — the Agent Studio artifact canvas.
 *
 * A collapsible, left-docked workspace that renders the currently-selected
 * toolkit artifact (moodboard sheet, product results, virtual staging, …) at
 * full width, with a tab strip across the open artifacts. The heavy card
 * component is rendered by the parent and passed as `children` so all of its
 * handlers/state stay in the AgentHub closure — the panel is pure chrome.
 *
 * When the canvas is open, the matching inline card in the chat collapses to an
 * `ArtifactChip` (below) so the artifact lives in exactly one place.
 */
import React from 'react';
import {
  FileText, Package, Camera, Globe, LayoutGrid, Image as ImageIcon, Video,
  PanelRightClose, ArrowLeft, ArrowUpRight, LayoutPanelLeft, Sparkles, Radar, ClipboardList,
  Briefcase, Boxes, PackageCheck, MessageSquare, Bot, TrendingUp, Images,
  Wand2, Calculator, MessageSquareQuote, ShieldQuestion, MoreHorizontal, X, Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type CanvasArtifactKind =
  | 'sheet' | 'staging' | 'products' | 'world' | 'board' | 'image' | 'video' | 'render'
  | 'inspiration' | 'radar' | 'result' | 'quote'
  | 'jobs' | 'sourcing' | 'order' | 'mentions' | 'llm' | 'seo' | 'catalog'
  | 'demo' | 'calc' | 'clarify' | 'confirm';

export interface CanvasArtifact {
  id: string;
  kind: CanvasArtifactKind;
  title: string;
}

/**
 * One TURN of the conversation, not one message.
 *
 * The tab strip used to be one tab per artifact-bearing message, so a single request that
 * produced several artifacts opened several canvas pages: "generate an SEO article" ran
 * research, a keyword card and a volume card and put three pages on the strip, none of which
 * was the article. A turn is one piece of work and reads as one page — the members are its
 * sub-tabs.
 *
 * The group is titled by, and opens on, its LAST member: the final artifact of a turn is its
 * outcome, and the steps that produced it belong behind it rather than in front of it.
 */
export interface CanvasArtifactGroup {
  id: string;
  kind: CanvasArtifactKind;
  title: string;
  members: CanvasArtifact[];
}

const KIND_ICON: Record<CanvasArtifactKind, React.ComponentType<{ className?: string }>> = {
  sheet: FileText,
  staging: Camera,
  products: Package,
  world: Globe,
  board: LayoutGrid,
  image: ImageIcon,
  video: Video,
  render: LayoutGrid,
  inspiration: Sparkles,
  radar: Radar,
  result: ClipboardList,
  quote: FileText,
  jobs: Briefcase,
  sourcing: Boxes,
  order: PackageCheck,
  mentions: MessageSquare,
  llm: Bot,
  seo: TrendingUp,
  catalog: Images,
  demo: Wand2,
  calc: Calculator,
  // A pending QUESTION is an artifact too. The canvas could only ever show finished output, so
  // a follow-up had nowhere to live but the chat stream as prose (#370, Class D).
  clarify: MessageSquareQuote,
  // The Approve/Decline gate. `clarify` became an artifact in #370 and this did not, so the one
  // card that BLOCKS the turn was the one that stayed in the chat rail — and on a phone the rail
  // is unmounted whenever the canvas is up.
  confirm: ShieldQuestion,
};

const KIND_LABEL: Record<CanvasArtifactKind, string> = {
  sheet: 'Presentation sheet',
  staging: 'Virtual staging',
  products: 'Product results',
  world: '3D / VR world',
  board: 'Materials board',
  image: 'Generated image',
  video: 'Generated video',
  render: 'Room generation',
  inspiration: 'Inspiration board',
  radar: 'Tech radar',
  result: 'Result',
  quote: 'Quote',
  jobs: 'Job findings',
  sourcing: 'Supply options',
  order: 'Purchase order',
  mentions: 'Mentions',
  llm: 'LLM visibility',
  seo: 'SEO',
  catalog: 'Catalog',
  demo: 'Demo results',
  calc: 'Calculation',
  clarify: 'Needs your input',
  confirm: 'Needs your approval',
};

interface CanvasPanelProps {
  /** One entry per TURN. A turn with several artifacts renders as one tab with sub-tabs. */
  groups: CanvasArtifactGroup[];
  /** The active MEMBER id — a message id, the same value `onSelect` emits. */
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  /**
   * Per-tab menu. `onCloseArtifact` drops the artifact from this conversation's
   * VIEW (it stays saved and returns on reload); `onDeleteArtifact` deletes the
   * saved entry. Two different promises, so they are two separate items with
   * their own wording — a single "×" cannot say which one it is. Omit a handler
   * and its item is not offered.
   */
  onCloseArtifact?: (id: string) => void;
  onDeleteArtifact?: (id: string) => void;
  children?: React.ReactNode;
  /** Contextual detail panel for the active artifact. */
  inspector?: React.ReactNode;
  /**
   * Single-pane (mobile) mode. The canvas takes the whole screen instead of
   * sharing it with the chat rail, so the close control reads as "back to chat"
   * and the inspector stacks under the artifact instead of docking beside it.
   */
  singlePane?: boolean;
}

export const CanvasPanel: React.FC<CanvasPanelProps> = ({ groups, activeId, onSelect, onClose, onCloseArtifact, onDeleteArtifact, children, inspector, singlePane }) => {
  const activeGroup = groups.find((g) => g.members.some((m) => m.id === activeId)) ?? null;
  // Sub-tabs only when there is genuinely more than one thing behind the tab. A single-artifact
  // turn must look exactly as it did before, or every ordinary result grows a redundant strip.
  const subTabs = activeGroup && activeGroup.members.length > 1 ? activeGroup.members : [];
  return (
    <div className={cn(
      'flex min-w-0 flex-1 flex-col bg-background',
      !singlePane && 'border-r border-border',
    )}>
      {/* Tab strip + close */}
      <div className="flex h-[52px] shrink-0 items-center gap-1 border-b border-border px-2">
        {singlePane ? (
          <button
            onClick={onClose}
            title="Back to chat"
            aria-label="Back to chat"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : (
          <LayoutPanelLeft className="mx-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto custom-scrollbar">
          {groups.length === 0 && (
            <span className="px-1.5 text-sm font-medium text-muted-foreground">Canvas</span>
          )}
          {groups.map((g) => {
            const a = g;
            const Icon = KIND_ICON[g.kind];
            const active = g === activeGroup;
            // The kebab addresses ONE artifact. On a grouped tab the sub-strip carries it
            // instead, so a "Delete entry" can never silently mean "delete four of them".
            const hasTabMenu = Boolean((onCloseArtifact || onDeleteArtifact) && g.members.length === 1);
            return (
              // The tab is a container, not a button: the kebab is a second control
              // and a button inside a button is invalid markup (and unclickable).
              <div
                key={a.id}
                className={cn(
                  'group flex h-9 shrink-0 items-center rounded-lg border text-sm transition-colors',
                  hasTabMenu ? 'pr-1' : '',
                  active
                    ? 'border-border bg-accent text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <button
                  onClick={() => onSelect(a.id)}
                  className="flex h-9 min-w-0 items-center gap-2 rounded-lg px-3"
                  title={a.title}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="max-w-[140px] truncate sm:max-w-[180px]">{a.title}</span>
                  {g.members.length > 1 && (
                    // Says there is more behind this tab. Without it a grouped turn looks
                    // like a single result and the sub-strip appears from nowhere on click.
                    <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                      {g.members.length}
                    </span>
                  )}
                </button>
                {hasTabMenu && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        title="Tab options"
                        aria-label={`Options for ${a.title}`}
                        className={cn(
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground',
                          // Always reachable on touch (no hover there) and on the tab
                          // you are looking at; fades in on the rest so the strip stays quiet.
                          active ? 'opacity-100' : 'opacity-60 group-hover:opacity-100',
                        )}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                      {onCloseArtifact && (
                        <DropdownMenuItem onClick={() => onCloseArtifact(a.id)}>
                          <X className="mr-2 mt-0.5 h-4 w-4 shrink-0 self-start" />
                          <span className="flex flex-col">
                            <span>Close in chat</span>
                            <span className="text-xs text-muted-foreground">Hides it here. Stays saved.</span>
                          </span>
                        </DropdownMenuItem>
                      )}
                      {onCloseArtifact && onDeleteArtifact && <DropdownMenuSeparator />}
                      {onDeleteArtifact && (
                        <DropdownMenuItem
                          onClick={() => onDeleteArtifact(a.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 mt-0.5 h-4 w-4 shrink-0 self-start" />
                          <span className="flex flex-col">
                            <span>Delete entry</span>
                            <span className="text-xs text-muted-foreground">Removes it from this chat for good.</span>
                          </span>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })}
        </div>
        {!singlePane && (
          <button
            onClick={onClose}
            title="Close canvas"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Sub-tabs: everything else this turn produced. Underline treatment, because the
          platform's tab language is underline everywhere and a filled pill here would read
          as a button sitting inside the page. */}
      {subTabs.length > 0 && (
        <div
          role="tablist"
          aria-label="Steps in this result"
          className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-surface-sunken px-2 custom-scrollbar"
        >
          {subTabs.map((m) => {
            const MemberIcon = KIND_ICON[m.kind];
            const active = m.id === activeId;
            return (
              <div key={m.id} className="group flex shrink-0 items-center">
                <button
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelect(m.id)}
                  title={m.title}
                  className={cn(
                    'flex h-9 min-w-0 items-center gap-1.5 border-b-2 px-2.5 text-xs transition-colors',
                    active
                      ? 'border-primary font-medium text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <MemberIcon className="h-3 w-3 shrink-0" />
                  <span className="max-w-[130px] truncate">{m.title}</span>
                </button>
                {(onCloseArtifact || onDeleteArtifact) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        title="Step options"
                        aria-label={`Options for ${m.title}`}
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground',
                          active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                        )}
                      >
                        <MoreHorizontal className="h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                      {onCloseArtifact && (
                        <DropdownMenuItem onClick={() => onCloseArtifact(m.id)}>
                          <X className="mr-2 mt-0.5 h-4 w-4 shrink-0 self-start" />
                          <span className="flex flex-col">
                            <span>Close in chat</span>
                            <span className="text-xs text-muted-foreground">Hides it here. Stays saved.</span>
                          </span>
                        </DropdownMenuItem>
                      )}
                      {onCloseArtifact && onDeleteArtifact && <DropdownMenuSeparator />}
                      {onDeleteArtifact && (
                        <DropdownMenuItem
                          onClick={() => onDeleteArtifact(m.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 mt-0.5 h-4 w-4 shrink-0 self-start" />
                          <span className="flex flex-col">
                            <span>Delete entry</span>
                            <span className="text-xs text-muted-foreground">Removes it from this chat for good.</span>
                          </span>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Active artifact + contextual inspector.
          Below `lg` the inspector stacks UNDER the artifact instead of being
          dropped entirely — on a phone it's the only way to reach an artifact's
          details/actions. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-6 custom-scrollbar">
          {children ?? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
              <LayoutPanelLeft className="mb-3 h-10 w-10 opacity-40" />
              <p className="max-w-sm text-sm">
                Your canvas. When the agent produces something — results, a document, a design —
                it opens here full-size, with its details and actions alongside.
              </p>
            </div>
          )}
        </div>
        {inspector && (
          <aside className="max-h-[45%] shrink-0 overflow-auto border-t border-border bg-muted/20 custom-scrollbar lg:max-h-none lg:w-[288px] lg:border-l lg:border-t-0">
            {inspector}
          </aside>
        )}
      </div>
    </div>
  );
};

interface ArtifactChipProps {
  kind: CanvasArtifactKind;
  title: string;
  active: boolean;
  onOpen: () => void;
}

/** Compact stand-in shown in the chat stream while the artifact lives in the canvas. */
export const ArtifactChip: React.FC<ArtifactChipProps> = ({ kind, title, active, onOpen }) => {
  const Icon = KIND_ICON[kind];
  return (
    <button
      onClick={onOpen}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl border bg-black/20 px-3 py-2.5 text-left transition-colors',
        active ? 'border-primary/50' : 'border-white/10 hover:border-white/25',
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/90">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-white">{title}</span>
        <span className="block text-[11px] text-white/70">{KIND_LABEL[kind]}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-white/85">
        {active ? 'In canvas' : 'Open in canvas'}
        <ArrowUpRight className="h-3.5 w-3.5" />
      </span>
    </button>
  );
};

export default CanvasPanel;
