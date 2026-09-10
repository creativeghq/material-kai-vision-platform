/**
 * The Agent Studio artifact canvas — the VOCABULARY of what an artifact is, the chip that
 * stands for one in the chat, and the modal that opens one full size.
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

/**
 * Kinds that are WAITING ON THE USER. They are not results — they are the turn asking, and the
 * turn does not continue until they are answered.
 *
 * They shipped looking exactly like a finished result: same grey card, same passive "View". A
 * question that blocks the conversation cannot be the quietest thing on screen.
 */
const PENDING_KINDS = new Set<CanvasArtifactKind>(['clarify', 'confirm']);

/** The verb on the card's button. "View" is right for a result and wrong for a question. */
const CTA_LABEL: Partial<Record<CanvasArtifactKind, string>> = {
  clarify: 'Answer',
  confirm: 'Review',
};

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

/** One artifact, full size, over the conversation. */
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
          /**
           * MAX height, not a fixed one.
           *
           * `h-[92dvh]` made every artifact the same height, so a result with three key/value
           * rows opened as ~130px of content above 800px of empty cream. A tall artifact still
           * hits the cap and behaves exactly as before — header and sub-tabs pinned, body
           * scrolling — but a small one is now the size of the thing in it.
           */
          'flex max-h-[92dvh] w-[96vw] max-w-5xl flex-col gap-0 overflow-hidden p-0',
          // Full-bleed SHEET on a phone — a FIXED height here, unlike the desktop cap above.
          // DialogContent centres itself (`top-1/2` + `-translate-y-1/2`), so content-sized +
          // full-width + square corners made a small result a band floating across the middle of
          // the screen with its corners bleeding off both edges. Commit to the sheet or keep the
          // inset rounded dialog; the mix is what looks broken. Bottom nav is z-40, this is z-50.
          'max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-none max-sm:rounded-none',
        )}
        // The header carries its own controls on one line; the primitive's floating X would
        // land on top of them.
        hideClose
      >
        {/* Header — what this is, and the ways out of it */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-4 sm:px-5">
          {/* Accent-tinted, matching the card in the chat this was opened from — `surface-sunken`
              on `card` is two barely-different creams on the light themes, so the tile read as an
              empty square. */}
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold leading-snug">
              {active?.title ?? 'Canvas'}
            </DialogTitle>
            <DialogDescription className="truncate text-[11px] leading-snug">
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
                    {/* 130px cut "CREATIVEG LTD — registration number, and status of the six
                        invoices" down to "CREATIVEG LTD — r…", which names nothing. The strip
                        scrolls, so it can afford the room. */}
                    <span className="max-w-[220px] truncate">{m.title}</span>
                  </button>
                  {/* On HOVER only — including on the active tab, which used to keep it visible
                      and so put a permanent `···` in the strip that read as a third tab. Touch
                      has no hover and needs no fallback here: the header carries the same menu
                      for whichever artifact is active, which is the one a tap can address. */}
                  {m.kind !== 'run' && (
                    <ArtifactMenu
                      id={m.id}
                      title={m.title}
                      onCloseArtifact={onCloseArtifact}
                      onDeleteArtifact={onDeleteArtifact}
                      className="h-5 w-5 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 max-lg:hidden"
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
          {/* `artifact-page` flattens the card frame each renderer draws for the chat. In the
              chat that frame is what separates a result from the prose around it; here the
              artifact IS the page, so it was a same-colour box with a hairline sitting inside a
              same-colour panel — a card in a card, which is one surface more than the ladder
              has. One rule rather than a prop on fifteen renderers. */}
          <div className="artifact-page min-h-0 flex-1 overflow-auto p-4 sm:p-6 custom-scrollbar">
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
          <div className="flex shrink-0 items-center gap-2 border-t border-hairline bg-surface-sunken px-4 py-2.5 sm:px-5">
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

/** The artifact, as it appears in the conversation: a card you click to open it. */
export const ArtifactCard: React.FC<ArtifactCardProps> = ({ artifact, active, onOpen }) => {
  const Icon = KIND_ICON[artifact.kind];
  // A preview that fails to load falls back to the kind icon. In REACT state, not by writing
  // `style.display = 'none'` from the error handler: React never resets an imperative style, so
  // one transient failure left an empty slot on that card for good — including after `preview`
  // changed to a URL that works.
  const [previewFailed, setPreviewFailed] = React.useState(false);
  React.useEffect(() => { setPreviewFailed(false); }, [artifact.preview]);
  const showPreview = Boolean(artifact.preview) && !previewFailed;
  const pending = PENDING_KINDS.has(artifact.kind);
  return (
    <button
      onClick={onOpen}
      aria-label={`Open ${artifact.title}`}
      className={cn(
        'panel-interactive group flex items-center gap-3 rounded-md border bg-card p-2.5 text-left transition-colors',
        /**
         * SIZED TO ITS CONTENT, not to the conversation.
         *
         * This was `w-full` inside a `max-w-[75%]` wrapper, which on a full-width chat is about
         * 1400px — so a 48px tile and two short lines were stretched into an empty bar with the
         * action pinned a whole viewport away from the title. A bubble can fill that width
         * because it is full of text; a card has nothing to fill it with. The preview variant
         * gets a little more room because it is carrying a picture.
         */
        showPreview ? 'w-full max-w-lg' : 'w-full max-w-md',
        active
          ? 'border-primary'
          : pending
            ? 'border-primary/40'
            : 'border-hairline',
      )}
    >
      {showPreview ? (
        // A picture of the result reads faster than its name, and it is the thing most of these
        // turns were asked for. `object-cover` on a fixed square so a panorama and a swatch
        // occupy the same slot and the row height never jumps.
        <img
          src={artifact.preview}
          alt=""
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-sm border border-hairline object-cover"
          onError={() => setPreviewFailed(true)}
        />
      ) : (
        // Accent-tinted, not `surface-sunken`: on the light themes a sunken square on a card is
        // two barely-different creams, so the tile read as a blank box rather than as an icon.
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{artifact.title}</span>
        {/* No second copy of the icon here — the tile beside it is already the icon, and at this
            width the pair read as two bullets on one card. */}
        <span className={cn('block truncate text-[11px]', pending ? 'text-primary' : 'text-muted-foreground')}>
          {KIND_LABEL[artifact.kind]}
        </span>
      </span>
      {/* A named action, not a bare chevron: the card is the only way into the modal now that the
          tab strip is gone, so it should say what pressing it does. A PENDING kind gets the solid
          fill — the turn is waiting on it, and it had been rendering as the quietest thing on the
          screen next to results nobody has to act on. */}
      <span
        className={cn(
          'flex shrink-0 items-center gap-1 rounded-sm px-2 py-1 text-[11px] font-medium transition-colors',
          pending
            ? 'bg-primary text-primary-foreground'
            : active
              ? 'bg-primary/10 text-primary'
              : 'bg-surface-sunken text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary',
        )}
      >
        {CTA_LABEL[artifact.kind] ?? (active ? 'Open' : 'View')}
        <ArrowUpRight className="h-3.5 w-3.5" />
      </span>
    </button>
  );
};

export default ArtifactModal;
