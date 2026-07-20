/**
 * CanvasPanel — the Agent Studio artifact canvas (issue #253, P2).
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
  FileText, Package, Camera, Globe, LayoutGrid, Image as ImageIcon, Video, Sofa,
  PanelRightClose, ArrowLeft, ArrowUpRight, LayoutPanelLeft, Sparkles, Radar, ClipboardList,
  Briefcase, Boxes, PackageCheck, MessageSquare, Bot, TrendingUp, Images,
  Wand2, Calculator,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type CanvasArtifactKind =
  | 'sheet' | 'staging' | 'products' | 'world' | 'board' | 'image' | 'video' | 'design' | 'render'
  | 'inspiration' | 'radar' | 'result' | 'quote'
  | 'jobs' | 'sourcing' | 'order' | 'mentions' | 'llm' | 'seo' | 'catalog'
  | 'demo' | 'calc';

export interface CanvasArtifact {
  id: string;
  kind: CanvasArtifactKind;
  title: string;
}

const KIND_ICON: Record<CanvasArtifactKind, React.ComponentType<{ className?: string }>> = {
  sheet: FileText,
  staging: Camera,
  products: Package,
  world: Globe,
  board: LayoutGrid,
  image: ImageIcon,
  video: Video,
  design: Sofa,
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
};

const KIND_LABEL: Record<CanvasArtifactKind, string> = {
  sheet: 'Presentation sheet',
  staging: 'Virtual staging',
  products: 'Product results',
  world: '3D / VR world',
  board: 'Materials board',
  image: 'Generated image',
  video: 'Generated video',
  design: 'Interior design',
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
};

interface CanvasPanelProps {
  artifacts: CanvasArtifact[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  children?: React.ReactNode;
  /** Contextual detail panel for the active artifact (issue #253 P3). */
  inspector?: React.ReactNode;
  /**
   * Single-pane (mobile) mode. The canvas takes the whole screen instead of
   * sharing it with the chat rail, so the close control reads as "back to chat"
   * and the inspector stacks under the artifact instead of docking beside it.
   */
  singlePane?: boolean;
}

export const CanvasPanel: React.FC<CanvasPanelProps> = ({ artifacts, activeId, onSelect, onClose, children, inspector, singlePane }) => {
  return (
    <div className={cn(
      'flex min-w-0 flex-1 flex-col bg-background',
      !singlePane && 'border-r border-white/8',
    )}>
      {/* Tab strip + close */}
      <div className="flex h-[52px] shrink-0 items-center gap-1 border-b border-white/8 px-2">
        {singlePane ? (
          <button
            onClick={onClose}
            title="Back to chat"
            aria-label="Back to chat"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : (
          <LayoutPanelLeft className="mx-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto custom-scrollbar">
          {artifacts.length === 0 && (
            <span className="px-1.5 text-sm font-medium text-muted-foreground">Canvas</span>
          )}
          {artifacts.map((a) => {
            const Icon = KIND_ICON[a.kind];
            const active = a.id === activeId;
            return (
              <button
                key={a.id}
                onClick={() => onSelect(a.id)}
                className={cn(
                  'flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm transition-colors',
                  active
                    ? 'border-white/15 bg-white/8 text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground',
                )}
                title={a.title}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="max-w-[140px] truncate sm:max-w-[180px]">{a.title}</span>
              </button>
            );
          })}
        </div>
        {!singlePane && (
          <button
            onClick={onClose}
            title="Close canvas"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        )}
      </div>

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
          <aside className="max-h-[45%] shrink-0 overflow-auto border-t border-white/8 bg-white/[0.015] custom-scrollbar lg:max-h-none lg:w-[288px] lg:border-l lg:border-t-0">
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
