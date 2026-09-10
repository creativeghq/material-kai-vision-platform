/**
 * The Agent Studio artifact canvas — the VOCABULARY of what an artifact is, the chip that
 * stands for one in the chat, and the modal that opens one full size.
 *
 * WHAT THIS REPLACED, AND WHY. The canvas used to be a permanent left-docked PANE, which made
 * the chat a 400px right rail for the whole conversation. Every turn opened a page on it —
 * `handleSendMessage` selected the turn's run before a single tool had reported — so a turn that
 * only ever produced PROSE, which is most of them, put a tab on the strip, took the screen away
 * from the answer, and left the reader a checklist of nothing beside a column of text a third of
 * the window wide. Conversation d3ec683e is four of those in a row.
 *
 * So the canvas is no longer a place you live beside. It is a thing you OPEN: the chat is the
 * whole window, an artifact is a chip in the stream, and clicking one — or producing one — opens
 * it in a modal over the conversation. Nothing is lost, because the pane never showed the chat and
 * an artifact at once either; what goes is the rail, the collapse handle, the mobile
 * single-pane fork, and a tab strip that described work rather than results.
 *
 * The modal deliberately speaks the app's existing overlay language (`SocialPostEditorDialog`,
 * `DocumentEditor`): the shared Radix `Dialog`, `bg-card` on a flat `bg-black/80` scrim, a
 * hairline border, `shadow-overlay`, the primitive's own close affordance. A second overlay
 * idiom invented here would be one more thing to keep in step with the rest of the app.
 */
import React from 'react';
import {
  FileText, Package, Camera, Globe, LayoutGrid, Image as ImageIcon, Video,
  ArrowUpRight, Sparkles, Radar, ClipboardList,
  Briefcase, Boxes, PackageCheck, MessageSquare, Bot, TrendingUp, Images,
  Wand2, Calculator, MessageSquareQuote, ShieldQuestion, MoreHorizontal, X, Trash2,
  ListChecks, PanelRight, CornerDownLeft,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/core/ui/dialog';
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
  | 'demo' | 'calc' | 'clarify' | 'confirm' | 'run';

export interface CanvasArtifact {
  id: string;
  kind: CanvasArtifactKind;
  title: string;
  /**
   * A picture of the thing, when the thing has one. Turns the card in the chat from a line of
   * text into a result you can recognise before you open it — which for a generated image, a
   * render or a board is most of what you wanted to see.
   */
  preview?: string;
}

/**
 * One TURN of the conversation, not one message.
 *
 * A single request that produces several artifacts is one piece of work: "generate an SEO
 * article" runs research, a keyword card and a volume card, and those are the STEPS of the
 * article, not three separate things the user asked for. They are the modal's sub-tabs.
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
  // card that BLOCKS the turn was the one that stayed in the chat rail.
  confirm: ShieldQuestion,
  // The WORK, not its output. A run is openable — from its line in the chat — but it no longer
  // opens ITSELF: watching a checklist is worth a click, never worth the screen.
  run: ListChecks,
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
  run: 'How it ran',
};

/** The artifact's own label, for anything that needs to name a kind outside this file. */
export const artifactKindLabel = (kind: CanvasArtifactKind): string => KIND_LABEL[kind];
export const artifactKindIcon = (kind: CanvasArtifactKind) => KIND_ICON[kind];

interface ArtifactMenuProps {
  id: string;
  title: string;
  onCloseArtifact?: (id: string) => void;
  onDeleteArtifact?: (id: string) => void;
  className?: string;
  iconClassName?: string;
}

/**
 * Close-vs-delete, written once.
 *
 * Two different promises — "hide it here, it stays saved" and "remove it for good" — so they are
 * two items with their own wording. A single "×" cannot say which one it is, and the strip used
 * to carry two hand-written copies of this menu that had to be edited in step.
 */
const ArtifactMenu: React.FC<ArtifactMenuProps> = ({
  id, title, onCloseArtifact, onDeleteArtifact, className, iconClassName,
}) => {
  if (!onCloseArtifact && !onDeleteArtifact) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          title="Options"
          aria-label={`Options for ${title}`}
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-surface-sunken hover:text-foreground',
            className,
          )}
        >
          <MoreHorizontal className={cn('h-4 w-4', iconClassName)} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {onCloseArtifact && (
          <DropdownMenuItem onClick={() => onCloseArtifact(id)}>
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
            onClick={() => onDeleteArtifact(id)}
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
  );
};

interface ArtifactModalProps {
  /** The turn being shown. `null` closes the modal — there is nothing to draw. */
  group: CanvasArtifactGroup | null;
  /** The active MEMBER id — a message id, or `run:<id>`, the same value `onSelect` emits. */
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  /**
   * Per-artifact menu. `onCloseArtifact` drops it from this conversation's VIEW (it stays saved
   * and returns on reload); `onDeleteArtifact` deletes the saved entry. Omit a handler and its
   * item is not offered. Never offered for a RUN — a run is not a saved entry, so both items
   * addressed a message id that does not exist and did nothing in silence.
   */
  onCloseArtifact?: (id: string) => void;
  onDeleteArtifact?: (id: string) => void;
  children?: React.ReactNode;
  /** Contextual detail panel for the active artifact. */
  inspector?: React.ReactNode;
  /**
   * Ask a follow-up about what is open, without going back for the composer.
   *
   * A Radix dialog makes what is behind it inert, so the modal costs the one thing the two-pane
   * layout genuinely gave you: reading a result and typing about it at the same time. This is
   * that capability, not a second composer — it hands the sentence to the SAME
   * `handleCardAsk` (set the input, send) every result card already uses, and closes on the way
   * so the answer arrives somewhere the user can see it.
   */
  onAsk?: (text: string) => void;
}

/**
 * One artifact, full size, over the conversation.
 *
 * Sized like `DocumentEditor` — the app's existing full-workspace dialog — because an artifact
 * here is a 3D world, a page of products or an article, not a form. Full-bleed below `sm`: an
 * artifact on a phone wants the whole screen, and the 16px gutter a form dialog keeps would just
 * be 16px less of it.
 *
 * The PANEL does not scroll; the body does. `DialogContent` puts `overflow-y-auto` on itself as a
 * mobile-safety floor for content-sized dialogs, which for a fixed-height workspace would scroll
 * the header and the sub-tabs off the top along with the content.
 */
export const ArtifactModal: React.FC<ArtifactModalProps> = ({
  group, activeId, onSelect, onClose, onCloseArtifact, onDeleteArtifact, children, inspector, onAsk,
}) => {
  // Sub-tabs only when there is genuinely more than one thing behind this turn. A
  // single-artifact turn must look exactly as it did before, or every ordinary result grows a
  // redundant strip.
  const members = group?.members ?? [];
  const subTabs = members.length > 1 ? members : [];
  const active = members.find((m) => m.id === activeId) ?? group ?? null;
  const Icon = active ? KIND_ICON[active.kind] : ClipboardList;
  // A run is not a saved entry; the menu addresses a message id it does not have.
  const menuTarget = active && active.kind !== 'run' ? active : null;
  const [inspectorOpen, setInspectorOpen] = React.useState(true);
  const [ask, setAsk] = React.useState('');

  // An abandoned sentence belongs to the artifact it was typed about. This component stays
  // mounted across opens, so without this, text typed about one result reappears in the ask box
  // of the next one — and it is one keypress from being sent about the wrong thing.
  React.useEffect(() => { setAsk(''); }, [activeId]);

  const submitAsk = () => {
    const text = ask.trim();
    if (!text || !onAsk) return;
    setAsk('');
    // NAME what is open. `handleCardAsk` sends the sentence as an ordinary message, and the
    // agent reads it against the end of the conversation — so "is this priced right?" asked
    // about a quote reopened from six turns ago gets answered about the latest turn instead.
    const about = active ? `${KIND_LABEL[active.kind]} “${active.title}”` : 'this result';
    // Close FIRST: the answer lands in the conversation, and a modal left over it would hide
    // the thing the user just asked for. If the turn produces an artifact, the modal comes back
    // on that one by itself.
    onClose();
    onAsk(`About the ${about}: ${text}`);
  };

  return (
    <Dialog open={Boolean(group)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className={cn(
          'flex h-[92dvh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0',
          // Full-bleed on a phone: an artifact wants the screen.
          'max-sm:h-[100dvh] max-sm:w-full max-sm:max-w-none max-sm:rounded-none',
        )}
        // The header carries its own controls on one line; the primitive's floating X would
        // land on top of them.
        hideClose
      >
        {/* Header — what this is, and the ways out of it */}
        <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-hairline px-3 sm:px-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-surface-sunken text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold leading-tight">
              {active?.title ?? 'Canvas'}
            </DialogTitle>
            <DialogDescription className="truncate text-[11px] leading-tight">
              {active ? KIND_LABEL[active.kind] : 'Nothing open'}
            </DialogDescription>
          </div>
          {inspector && (
            <button
              onClick={() => setInspectorOpen((v) => !v)}
              title={inspectorOpen ? 'Hide details' : 'Show details'}
              aria-label={inspectorOpen ? 'Hide details' : 'Show details'}
              aria-pressed={inspectorOpen}
              className={cn(
                'hidden h-8 w-8 shrink-0 items-center justify-center rounded-sm transition-colors lg:flex',
                inspectorOpen
                  ? 'bg-surface-sunken text-foreground'
                  : 'text-muted-foreground hover:bg-surface-sunken hover:text-foreground',
              )}
            >
              <PanelRight className="h-4 w-4" />
            </button>
          )}
          {menuTarget && (
            <ArtifactMenu
              id={menuTarget.id}
              title={menuTarget.title}
              onCloseArtifact={onCloseArtifact}
              onDeleteArtifact={onDeleteArtifact}
            />
          )}
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-surface-sunken hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sub-tabs: the other things this turn produced. Underline treatment, because the
            platform's tab language is underline everywhere and a filled pill here would read
            as a button sitting inside the page. */}
        {subTabs.length > 0 && (
          <div
            role="tablist"
            aria-label="Steps in this result"
            className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-hairline bg-surface-sunken px-2 custom-scrollbar"
          >
            {subTabs.map((m) => {
              const MemberIcon = KIND_ICON[m.kind];
              const isActive = m.id === activeId;
              return (
                <div key={m.id} className="group flex shrink-0 items-center">
                  <button
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => onSelect(m.id)}
                    title={m.title}
                    className={cn(
                      'flex h-9 min-w-0 items-center gap-1.5 border-b-2 px-2.5 text-xs transition-colors',
                      isActive
                        ? 'border-primary font-medium text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <MemberIcon className="h-3 w-3 shrink-0" />
                    <span className="max-w-[130px] truncate">{m.title}</span>
                  </button>
                  {m.kind !== 'run' && (
                    <ArtifactMenu
                      id={m.id}
                      title={m.title}
                      onCloseArtifact={onCloseArtifact}
                      onDeleteArtifact={onDeleteArtifact}
                      className={cn('h-5 w-5', isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
                      iconClassName="h-3 w-3"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* The artifact + its inspector. Below `lg` the inspector stacks UNDER the artifact
            instead of being dropped — on a phone it is the only way to reach an artifact's
            details and actions. */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-6 custom-scrollbar">
            {children}
          </div>
          {inspector && (
            <aside
              className={cn(
                'max-h-[45%] shrink-0 overflow-auto border-t border-hairline bg-surface-sunken custom-scrollbar',
                'lg:max-h-none lg:border-l lg:border-t-0',
                inspectorOpen ? 'lg:w-[288px]' : 'lg:hidden',
              )}
            >
              {inspector}
            </aside>
          )}
        </div>

        {/* Ask about what is open. See `onAsk` — this is the capability the docked pane had and
            a modal otherwise takes away, not a second composer. */}
        {onAsk && (
          <div className="flex shrink-0 items-center gap-2 border-t border-hairline bg-surface-sunken px-3 py-2 sm:px-4">
            <input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitAsk();
                }
              }}
              placeholder={`Ask about this ${active ? KIND_LABEL[active.kind].toLowerCase() : 'result'}…`}
              aria-label="Ask about this result"
              className="h-9 min-w-0 flex-1 rounded-sm border border-hairline bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={submitAsk}
              disabled={!ask.trim()}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-sm bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity disabled:pointer-events-none disabled:opacity-50"
            >
              <CornerDownLeft className="h-3.5 w-3.5" />
              Ask
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

interface ArtifactCardProps {
  artifact: CanvasArtifact;
  /** True while this artifact is the one open in the modal. */
  active: boolean;
  onOpen: () => void;
}

/**
 * The artifact, as it appears in the conversation: a card you click to open it.
 *
 * IT LIVES OUTSIDE THE MESSAGE BUBBLE, and that is the whole reason it is legible. Inside, it
 * could not be: `.msg-assistant` is `--primary` on the dark themes (an accent-filled slab) and
 * `--card` on the light ones, so a card drawn in `bg-card` was a dark box on magenta in one and
 * EXACTLY THE BUBBLE'S OWN COLOUR in the other — a hairline apart from its background, which is
 * what "not so visible" was. The bubble also re-themes its own children by attribute selector
 * (`html.light .msg-assistant [class*="bg-white"]`, …), so anything in there is styled by where
 * it sits rather than by what it is.
 *
 * Out here it is an ordinary panel on the page ground and the normal three-surface ladder
 * applies — `bg-card` + `border-hairline`, border to the accent on hover, the design system's
 * `panel-interactive` behaviour for a panel that is itself the click target. One treatment,
 * correct in all four theme combinations.
 *
 * It takes the ARTIFACT, not a kind and a title typed out at the call site: the stream used to
 * hand-write thirty of these with their own strings, a second copy of the mapping
 * `getCanvasArtifact` already makes.
 */
export const ArtifactCard: React.FC<ArtifactCardProps> = ({ artifact, active, onOpen }) => {
  const Icon = KIND_ICON[artifact.kind];
  return (
    <button
      onClick={onOpen}
      aria-label={`Open ${artifact.title}`}
      className={cn(
        'panel-interactive group flex w-full items-center gap-3 rounded-md border bg-card p-2.5 text-left',
        'transition-colors',
        active ? 'border-primary' : 'border-hairline',
      )}
    >
      {artifact.preview ? (
        // A picture of the result reads faster than its name, and it is the thing most of these
        // turns were asked for. `object-cover` on a fixed square so a panorama and a swatch
        // occupy the same slot and the row height never jumps.
        <img
          src={artifact.preview}
          alt=""
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-sm border border-hairline object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-surface-sunken text-primary">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{artifact.title}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Icon className="h-3 w-3 shrink-0" />
          {KIND_LABEL[artifact.kind]}
        </span>
      </span>
      {/* A named action, not a bare chevron: the card is the only way into the modal now that
          the tab strip is gone, so it should say what pressing it does. */}
      <span
        className={cn(
          'flex shrink-0 items-center gap-1 rounded-sm px-2 py-1 text-[11px] font-medium transition-colors',
          active
            ? 'bg-primary/10 text-primary'
            : 'bg-surface-sunken text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary',
        )}
      >
        {active ? 'Open' : 'View'}
        <ArrowUpRight className="h-3.5 w-3.5" />
      </span>
    </button>
  );
};

export default ArtifactModal;
