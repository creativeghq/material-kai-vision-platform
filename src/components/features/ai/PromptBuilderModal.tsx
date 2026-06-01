/**
 * PromptBuilderModal — unified "What can the agents do?" surface.
 *
 * MERGES two starter-prompt sources into ONE card-based discovery view:
 *
 *   1. CODE-DEFINED TOOLKITS (TOOLKITS in agentToolsCatalog.ts)
 *      Each toolkit's `quick_starts` array drives the primary CTAs.
 *      These are workflow-aware (catalog-build, b2b-research, etc.) and
 *      always in sync with the deployed code.
 *
 *   2. ADMIN-CURATED STARTERS (`prompts` table where prompt_type='chat_starter')
 *      Loaded via `listChatStarters(agentId, isAdmin)`. Grouped by
 *      `configuration.group`. Variable-substitution flow (`{{variables}}`)
 *      is handled inline in this modal — when a starter has variables, the
 *      card opens an inline form before submitting.
 *
 * Both sources share the same visual treatment so users don't have to
 * mentally switch between "code workflows" vs "admin templates". Single
 * search bar filters across both.
 *
 * Replaces the older 2-button setup (✨ PromptBuilder + 📋 StarterPrompts).
 *
 * Companion: ToolkitPickerModal (🔧 Wrench) handles toolkit ON/OFF
 * selection — a different concern.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Search as SearchIcon, ChevronDown, ChevronRight, Lock, AlertCircle,
  Compass, BookOpen, Megaphone, LayoutTemplate, Sparkles, Globe, Link2,
  FileSearch, Layers, BadgeCheck, Newspaper, Building2, Bot, Wrench,
  Plus, ListChecks, Palette, Grid3x3, Send, PencilLine, Mail,
  ImageIcon, ArrowLeft, ArrowRight, type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Button } from '@/components/core/ui/button';
import { cn } from '@/lib/utils';
import {
  TOOLKITS, AGENTS,
  getToolkitOwnerAgents, toolkitTokenEstimate, findTool,
  type ToolkitDefinition, type ToolkitQuickStart,
} from './agentToolsCatalog';
import {
  listChatStarters, substituteVariables, groupStarters,
  type ChatStarter,
} from '@/services/chatStarters';
import {
  loadInteriorTemplatePrompts, filterByImageMode,
  INTERIOR_CATEGORY_ORDER, INTERIOR_SUBCATEGORY_LABELS,
  IMAGE_COMPATIBLE_SUBCATEGORIES,
  type InteriorPromptTemplate,
} from './interiorPromptTemplates';

// Lucide icon name → component map. Mirrors strings used in the catalog's
// `icon` field. Falls back to Wrench for unknown names.
const ICONS: Record<string, LucideIcon> = {
  Compass, BookOpen, Megaphone, LayoutTemplate, Sparkles, Globe, Link2,
  FileSearch, Layers, BadgeCheck, Newspaper, Building2, Bot, Wrench,
  Plus, ListChecks, Palette, Grid3x3, Send, PencilLine, Mail, Search: SearchIcon,
  AlertCircle,
};
function iconFor(name?: string): LucideIcon {
  if (!name) return Wrench;
  return ICONS[name] || Wrench;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Current user's role — drives RBAC filtering. */
  role: 'viewer' | 'member' | 'admin' | 'owner';
  /** Current selected agent — used so quick-starts on toolkits owned by
   *  another agent can auto-switch the user. */
  currentAgentId?: string;
  /** Whether the user has currently attached an image. Affects warning
   *  on starters with `requires_image: true`. */
  hasUploadedImage?: boolean;
  /** Slugs of enabled modules from public.modules. Module-gated toolkits
   *  whose slug isn't here render dimmed with a disabled banner. */
  enabledModules?: string[];
  /**
   * Called when the user picks ANY starter (toolkit quick-start OR DB
   * curated starter OR Interior design template). Caller should:
   *   1. Switch agent if `agentId` differs from current
   *   2. Set chat input to `prompt`
   *   3. Auto-send (single contract for all sources)
   *  Modal closes itself.
   */
  onQuickStart: (params: {
    toolkitId?: string;     // present for code-defined toolkits
    starterId?: string;     // present for DB-curated starters
    templateId?: string;    // present for Interior design templates
    agentId: string;
    prompt: string;
    workflowId?: string;
    /** Full quick-start — present for code-defined toolkit quick-starts. When it
     *  carries a `form`, the caller opens ToolkitFormModal to collect first. */
    quickStart?: ToolkitQuickStart;
    /** The owning toolkit — passed alongside `quickStart` for the form modal. */
    toolkit?: ToolkitDefinition;
  }) => void;
  /**
   * Optional callback for the virtual-staging subcategory in Interior
   * design templates. When the user picks a virtual-staging template this
   * fires INSTEAD of `onQuickStart` because virtual staging needs the
   * staging wizard (image picker → preset selector → render). Caller
   * sets the staging image URL and lets the wizard take over.
   */
  onTriggerVirtualStaging?: () => void;
}

const PromptBuilderModal: React.FC<Props> = ({
  open, onClose, role, currentAgentId, hasUploadedImage = false,
  enabledModules = [], onQuickStart, onTriggerVirtualStaging,
}) => {
  const isAdmin = role === 'admin' || role === 'owner';
  const isInteriorAgent = (currentAgentId || 'kai') === 'interior-designer';
  const [search, setSearch] = useState('');
  // Active tab: "toolkits" (code-defined workflows) | "prompts" (curated starters + Interior templates)
  const [activeTab, setActiveTab] = useState<'toolkits' | 'prompts'>('toolkits');

  // ── Interior Designer design templates (rooms, floor-plan-3d, virtual-staging) ──
  // Loaded only when the current agent is interior-designer, since the
  // category filter on the DB query is hard-coded to 'interior-designer'.
  const [interiorTemplates, setInteriorTemplates] = useState<InteriorPromptTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  // Selected room/subcategory chip — drives template filtering. Image-aware
  // default: virtual-staging when an image is attached, living-room otherwise.
  const [selectedRoom, setSelectedRoom] = useState<string>(() =>
    hasUploadedImage ? 'virtual-staging' : 'living-room',
  );

  // Snap to a sensible room when the image-attach state changes
  useEffect(() => {
    if (hasUploadedImage) {
      setSelectedRoom((prev) =>
        IMAGE_COMPATIBLE_SUBCATEGORIES.has(prev) ? prev : 'virtual-staging',
      );
    } else {
      setSelectedRoom((prev) =>
        IMAGE_COMPATIBLE_SUBCATEGORIES.has(prev) ? 'living-room' : prev,
      );
    }
  }, [hasUploadedImage]);

  // The Prompt Library tab is hidden for non-Interior agents. If the user
  // was on it and switches agent, force them back to Toolkits so they
  // don't end up on a hidden tab.
  useEffect(() => {
    if (!isInteriorAgent && activeTab === 'prompts') {
      setActiveTab('toolkits');
    }
  }, [isInteriorAgent, activeTab]);

  // Load Interior templates when modal opens on Interior Designer agent
  useEffect(() => {
    if (!open || !isInteriorAgent) {
      setInteriorTemplates([]);
      return;
    }
    let cancelled = false;
    setLoadingTemplates(true);
    loadInteriorTemplatePrompts()
      .then((rows) => { if (!cancelled) setInteriorTemplates(rows); })
      .finally(() => { if (!cancelled) setLoadingTemplates(false); });
    return () => { cancelled = true; };
  }, [open, isInteriorAgent]);

  // ── DB-curated starters (admin-defined in `prompts` table) ─────────
  const [dbStarters, setDbStarters] = useState<ChatStarter[]>([]);
  const [loadingStarters, setLoadingStarters] = useState(false);
  // Variable-form sub-step: when a DB starter has {{variables}}, picking it
  // opens a small form before submitting. `null` = no starter picked.
  const [pickedStarter, setPickedStarter] = useState<ChatStarter | null>(null);
  const [varValues, setVarValues] = useState<Record<string, string>>({});

  // Reload DB starters whenever the modal opens or the agent changes. Reload
  // on agent change so an Interior Designer user doesn't see KAI's curated
  // starters and vice versa.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const agent = currentAgentId || 'kai';
    (async () => {
      setLoadingStarters(true);
      try {
        const rows = await listChatStarters(agent, isAdmin);
        if (!cancelled) setDbStarters(rows);
      } finally {
        if (!cancelled) setLoadingStarters(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, currentAgentId, isAdmin]);

  // Reset variable-form sub-step when modal closes
  useEffect(() => {
    if (!open) {
      setPickedStarter(null);
      setVarValues({});
    }
  }, [open]);

  const groupedStarters = useMemo(() => groupStarters(dbStarters), [dbStarters]);

  /** Handle clicking a DB starter — either submit immediately (no vars) or
   *  open the variable-form sub-step. */
  const handlePickStarter = (s: ChatStarter) => {
    const vars = s.configuration?.variables ?? [];
    if (vars.length === 0) {
      onQuickStart({
        starterId: s.id,
        agentId: currentAgentId || 'kai',
        prompt: s.prompt_text,
      });
      onClose();
      return;
    }
    const seed: Record<string, string> = {};
    vars.forEach((v) => { seed[v.key] = v.default ?? ''; });
    setVarValues(seed);
    setPickedStarter(s);
  };

  const handleSubmitFilledStarter = () => {
    if (!pickedStarter) return;
    const text = substituteVariables(pickedStarter.prompt_text, varValues);
    if (!text || !text.trim()) return;
    onQuickStart({
      starterId: pickedStarter.id,
      agentId: currentAgentId || 'kai',
      prompt: text,
    });
    onClose();
  };

  // STRICT filter: only show toolkits owned by the CURRENT agent.
  // No cross-agent leakage. If the user wants tools from another agent,
  // they switch the agent first (via the agent picker in the chat header).
  // Admin filter also applied; module-disabled toolkits still render but
  // dimmed via the moduleDisabled prop so users see what they're missing.
  const visibleToolkits = useMemo(() => {
    const current = currentAgentId || 'kai';
    return TOOLKITS.filter((t) => {
      if (t.adminOnly && !isAdmin) return false;
      const owners = getToolkitOwnerAgents(t);
      return owners.includes(current);
    });
  }, [isAdmin, currentAgentId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visibleToolkits;
    return visibleToolkits.filter((t) => {
      if (t.name.toLowerCase().includes(q)) return true;
      if (t.description.toLowerCase().includes(q)) return true;
      if (t.tool_ids.some((id) => id.toLowerCase().includes(q))) return true;
      // Search inside quick-start labels too — "deck" surfaces sheets toolkit
      if ((t.quick_starts || []).some((qs) =>
        qs.label.toLowerCase().includes(q) || qs.description.toLowerCase().includes(q),
      )) return true;
      return false;
    });
  }, [visibleToolkits, search]);

  // Order: always-on first, then standard, then admin
  const ordered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const score = (t: ToolkitDefinition) => (t.alwaysOn ? 0 : t.adminOnly ? 2 : 1);
      return score(a) - score(b);
    });
  }, [filtered]);

  // ── Interior templates filtered by image mode + selected room + search ──
  const filteredInteriorTemplates = useMemo(() => {
    if (!isInteriorAgent || interiorTemplates.length === 0) return [];
    const byImage = filterByImageMode(interiorTemplates, hasUploadedImage);
    const byRoom = byImage.filter((p) => p.subcategory === selectedRoom);
    const q = search.trim().toLowerCase();
    if (!q) return byRoom;
    return byRoom.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q),
    );
  }, [interiorTemplates, hasUploadedImage, selectedRoom, search, isInteriorAgent]);

  // Available room chips for the current image-mode. Hide image-incompatible
  // rooms when an image is attached, and vice versa.
  const availableRooms = useMemo(() => {
    if (!isInteriorAgent) return [];
    const present = new Set(interiorTemplates.map((p) => p.subcategory));
    return INTERIOR_CATEGORY_ORDER.filter((c) => {
      if (!present.has(c)) return false;
      if (hasUploadedImage && !IMAGE_COMPATIBLE_SUBCATEGORIES.has(c)) return false;
      if (!hasUploadedImage && IMAGE_COMPATIBLE_SUBCATEGORIES.has(c)) return false;
      return true;
    });
  }, [interiorTemplates, hasUploadedImage, isInteriorAgent]);

  /** Handle clicking an Interior design template. Virtual-staging triggers
   * the staging wizard via callback (since it needs a separate flow);
   * everything else goes through the standard auto-send path. */
  const handlePickInteriorTemplate = (p: InteriorPromptTemplate) => {
    if (p.subcategory === 'virtual-staging' && onTriggerVirtualStaging) {
      onClose();
      onTriggerVirtualStaging();
      return;
    }
    onQuickStart({
      templateId: p.id,
      agentId: currentAgentId || 'interior-designer',
      prompt: p.prompt_text,
    });
    onClose();
  };

  // Filter DB starters by the same search text. Each `group` is rendered as
  // its own card; we filter by group-name OR by any starter inside the group
  // matching the query so a search for "render" surfaces the whole group
  // that contains the "Render this room" starter.
  const filteredStarterGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: Array<[string, ChatStarter[]]> = [];
    for (const [group, items] of Object.entries(groupedStarters)) {
      if (!q) { out.push([group, items]); continue; }
      const groupMatches = group.toLowerCase().includes(q);
      const filtered = items.filter((s) =>
        groupMatches
        || s.name.toLowerCase().includes(q)
        || (s.description || '').toLowerCase().includes(q)
        || s.prompt_text.toLowerCase().includes(q),
      );
      if (filtered.length > 0) out.push([group, filtered]);
    }
    return out;
  }, [groupedStarters, search]);

  // Friendly name of the current agent for the "show other agents" hint
  const currentAgentName = useMemo(() => {
    if (!currentAgentId) return 'this agent';
    return AGENTS.find((a) => a.id === currentAgentId)?.name || currentAgentId;
  }, [currentAgentId]);

  if (!open) return null;

  // ── Variable-form sub-step (when a DB starter has {{variables}}) ────────
  // Renders an entirely separate panel — picking a starter with vars opens
  // this view. User fills the variables, sees a preview, then submits.
  if (pickedStarter) {
    const vars = pickedStarter.configuration?.variables ?? [];
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={onClose}>
        <div
          className="dashboard-card w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                size="icon" variant="ghost" className="h-8 w-8 shrink-0"
                onClick={() => setPickedStarter(null)}
                title="Back to picker"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h3 className="font-medium truncate">{pickedStarter.name}</h3>
                {pickedStarter.description && (
                  <p className="text-xs text-muted-foreground truncate">{pickedStarter.description}</p>
                )}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted/60">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {pickedStarter.configuration?.requires_image && !hasUploadedImage && (
              <div className="flex items-center gap-2 text-xs text-yellow-600 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2.5">
                <ImageIcon className="h-4 w-4 shrink-0" />
                <span>This starter works best when you attach a photo first.</span>
              </div>
            )}

            {vars.map((v) => (
              <div key={v.key} className="space-y-1.5">
                <Label htmlFor={`var-${v.key}`} className="text-sm font-medium">
                  {v.key}
                  {v.description && (
                    <span className="ml-2 text-xs text-muted-foreground font-normal">— {v.description}</span>
                  )}
                </Label>
                <Input
                  id={`var-${v.key}`}
                  value={varValues[v.key] ?? ''}
                  onChange={(e) => setVarValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
                  placeholder={v.default}
                />
              </div>
            ))}

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Preview</Label>
              <div className="text-xs whitespace-pre-wrap bg-muted/50 rounded-lg p-3 border max-h-40 overflow-y-auto">
                {substituteVariables(pickedStarter.prompt_text, varValues)}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 border-t border-border bg-muted/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {pickedStarter.configuration?.skill_hint && (
                <Badge variant="outline" className="text-xs">
                  <Sparkles className="h-3 w-3 mr-1" />
                  {pickedStarter.configuration.skill_hint}
                </Badge>
              )}
              {pickedStarter.configuration?.credit_estimate && (
                <span>~{pickedStarter.configuration.credit_estimate} credits</span>
              )}
            </div>
            <Button onClick={handleSubmitFilledStarter} className="rounded-full">
              Send to chat <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="dashboard-card w-full max-w-5xl max-h-[90vh] flex flex-col rounded-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-medium leading-tight">What can the agents do?</h2>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
                Pick a toolkit. Click a starter button to fire that workflow into the chat — the agent will pick up from there.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-muted/60"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs strip */}
        <div className="border-b border-border px-3 pt-2 flex items-end gap-1 flex-wrap">
          <TabButton
            active={activeTab === 'toolkits'}
            onClick={() => setActiveTab('toolkits')}
            count={
              ordered.length
              + filteredStarterGroups.reduce((sum, [, items]) => sum + items.length, 0)
            }
          >
            <BookOpen className="h-3.5 w-3.5 mr-1.5" />
            Toolkits & Workflows
          </TabButton>
          {/* Prompt Library tab — only meaningful for Interior Designer (room
              templates + virtual staging). Hidden for other agents since
              there's nothing to show there. */}
          {isInteriorAgent && (
            <TabButton
              active={activeTab === 'prompts'}
              onClick={() => setActiveTab('prompts')}
              count={filteredInteriorTemplates.length}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Prompt Library
            </TabButton>
          )}
          <div className="ml-auto text-[10px] text-muted-foreground self-center pb-1">
            {currentAgentName} only
          </div>
        </div>

        {/* Search */}
        <div className="border-b border-border p-3">
          <div className="relative max-w-md">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                activeTab === 'toolkits'
                  ? 'Search toolkits, workflows, or custom prompts...'
                  : 'Search design templates...'
              }
              className="text-xs h-8 pl-8"
            />
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* ── Toolkits & Workflows tab — toolkit cards + custom DB prompts ── */}
          {activeTab === 'toolkits' && (
            <div className="space-y-5">
              {/* Toolkit cards (code-defined workflows) */}
              {ordered.length > 0 && (
                <section>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {ordered.map((t) => {
                      const moduleDisabled = !!(t.moduleSlug && !enabledModules.includes(t.moduleSlug));
                      const owners = getToolkitOwnerAgents(t);
                      return (
                        <ToolkitDiscoveryCard
                          key={t.id}
                          toolkit={t}
                          moduleDisabled={moduleDisabled}
                          onQuickStart={(qs) => {
                            // Strict-filter guarantees current agent owns this toolkit
                            const targetAgent = currentAgentId || owners[0];
                            onQuickStart({
                              toolkitId: t.id,
                              agentId: targetAgent,
                              prompt: qs.prompt,
                              workflowId: qs.workflow_id,
                              quickStart: qs,
                              toolkit: t,
                            });
                            onClose();
                          }}
                        />
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Custom prompts — admin-curated DB starters (chat_starter prompt_type) */}
              {filteredStarterGroups.length > 0 && (
                <section>
                  {ordered.length > 0 && (
                    <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                      Custom prompts
                    </h3>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredStarterGroups.map(([group, items]) => (
                      <CuratedStartersCard
                        key={group}
                        group={group}
                        starters={items}
                        onPick={handlePickStarter}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Empty + loading states */}
              {ordered.length === 0 && filteredStarterGroups.length === 0 && !loadingStarters && (
                <div className="text-sm text-muted-foreground text-center py-12">
                  {search
                    ? `Nothing matches "${search}" in toolkits or custom prompts.`
                    : `No toolkits or prompts available on ${currentAgentName}.`}
                </div>
              )}
              {ordered.length === 0 && filteredStarterGroups.length === 0 && loadingStarters && (
                <div className="text-sm text-muted-foreground text-center py-12">
                  Loading...
                </div>
              )}
            </div>
          )}

          {/* ── Prompt Library tab — Interior design templates only ── */}
          {activeTab === 'prompts' && isInteriorAgent && (
            <div className="space-y-3">
              {hasUploadedImage && (
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300">
                  <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Image attached — only Floor Plan &amp; Virtual Staging templates are shown.</span>
                </div>
              )}
              {availableRooms.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {availableRooms.map((room) => (
                    <button
                      key={room}
                      onClick={() => setSelectedRoom(room)}
                      className={cn(
                        'rounded-full text-xs px-3 py-1 whitespace-nowrap transition shrink-0',
                        selectedRoom === room
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/50 hover:bg-muted',
                      )}
                    >
                      {INTERIOR_SUBCATEGORY_LABELS[room] ?? room}
                    </button>
                  ))}
                </div>
              )}

              {loadingTemplates ? (
                <div className="text-sm text-muted-foreground text-center py-12">
                  Loading design templates...
                </div>
              ) : filteredInteriorTemplates.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-12">
                  {search ? `No templates match "${search}".` : 'No templates for this room yet.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredInteriorTemplates.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handlePickInteriorTemplate(p)}
                      className="text-left p-4 bg-card border border-border rounded-xl hover:border-primary/40 hover:bg-muted/20 transition group flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-medium group-hover:text-primary transition-colors">
                          {p.name}
                        </h4>
                        <Badge variant="outline" className="text-[9px] py-0 shrink-0">
                          {INTERIOR_SUBCATEGORY_LABELS[p.subcategory] ?? p.subcategory}
                        </Badge>
                      </div>
                      {p.description && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                          {p.description}
                        </p>
                      )}
                      <div className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        {p.subcategory === 'virtual-staging' && onTriggerVirtualStaging
                          ? 'Opens staging wizard →'
                          : 'Click to send →'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PromptBuilderModal;

// ─────────────────────────────────────────────────────────────────────
// CuratedStartersCard — wraps a single `configuration.group` of admin-
// curated starters in the same visual style as a toolkit card.
// ─────────────────────────────────────────────────────────────────────

const CuratedStartersCard: React.FC<{
  group: string;
  starters: ChatStarter[];
  onPick: (s: ChatStarter) => void;
}> = ({ group, starters, onPick }) => {
  return (
    <div className="rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition flex flex-col">
      <div className="flex items-start gap-3 mb-2">
        <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-sm font-medium">{group}</h3>
            <Badge variant="outline" className="text-[9px] py-0 border-blue-500/40 text-blue-300/80">
              curated
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {starters.length} starter{starters.length === 1 ? '' : 's'} · admin-curated templates
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        {starters.map((s) => {
          const hasVars = (s.configuration?.variables || []).length > 0;
          return (
            <button
              key={s.id}
              onClick={() => onPick(s)}
              className="w-full text-left bg-muted/40 hover:bg-primary/10 rounded-md px-3 py-2 border border-border/50 hover:border-primary/40 transition group flex items-start gap-2.5"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary/70 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium">{s.name}</span>
                  {s.is_default && (
                    <Badge variant="outline" className="text-[9px] py-0">default</Badge>
                  )}
                  {hasVars && (
                    <Badge variant="outline" className="text-[9px] py-0">
                      {s.configuration?.variables?.length} var{(s.configuration?.variables?.length || 0) === 1 ? '' : 's'}
                    </Badge>
                  )}
                  {s.configuration?.requires_image && (
                    <Badge variant="outline" className="text-[9px] py-0 gap-0.5">
                      <ImageIcon className="h-2.5 w-2.5" /> image
                    </Badge>
                  )}
                  {s.configuration?.credit_estimate && (
                    <span className="text-[9px] text-muted-foreground ml-auto">
                      ~{s.configuration.credit_estimate} cr
                    </span>
                  )}
                </div>
                {s.description && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {s.description}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// TabButton — pill-style tab control for the modal header
// ─────────────────────────────────────────────────────────────────────

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}> = ({ active, onClick, count, children }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex items-center text-xs font-medium px-3 py-1.5 rounded-t-md border-b-2 transition',
      active
        ? 'border-primary text-foreground bg-primary/5'
        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40',
    )}
  >
    {children}
    {count != null && (
      <span className={cn(
        'ml-1.5 text-[10px] rounded-full px-1.5 py-0.5',
        active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground',
      )}>
        {count}
      </span>
    )}
  </button>
);

// ─────────────────────────────────────────────────────────────────────
// ToolkitDiscoveryCard — single visual cluster
// ─────────────────────────────────────────────────────────────────────

const ToolkitDiscoveryCard: React.FC<{
  toolkit: ToolkitDefinition;
  moduleDisabled: boolean;
  onQuickStart: (qs: ToolkitQuickStart) => void;
}> = ({ toolkit, moduleDisabled, onQuickStart }) => {
  const [showTools, setShowTools] = useState(false);
  const Icon = iconFor(toolkit.icon);
  const tokenEst = toolkitTokenEstimate(toolkit);
  const ownerAgents = getToolkitOwnerAgents(toolkit);
  const ownerAgentNames = ownerAgents
    .map((id) => AGENTS.find((a) => a.id === id)?.name || id)
    .join(' / ');

  return (
    <div className={cn(
      'rounded-xl border p-4 transition relative overflow-hidden flex flex-col',
      moduleDisabled
        ? 'border-border/30 bg-muted/10'
        : 'border-border bg-card hover:border-primary/40',
    )}>
      {/* Disabled overlay */}
      {moduleDisabled && toolkit.moduleSlug && (
        <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-amber-500/20 border border-amber-500/40 rounded-full px-3 py-1 text-[11px] text-amber-300 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Module "{toolkit.moduleSlug}" disabled — ask an admin to enable
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3 mb-2">
        <div className={cn(
          'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
          moduleDisabled ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary',
        )}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-sm font-medium">{toolkit.name}</h3>
            {toolkit.alwaysOn && (
              <Badge variant="outline" className="text-[9px] py-0 border-green-500/40 text-green-300">
                always on
              </Badge>
            )}
            {toolkit.adminOnly && (
              <Badge variant="outline" className="text-[9px] py-0 gap-0.5">
                <Lock className="h-2.5 w-2.5" /> admin
              </Badge>
            )}
            {toolkit.moduleSlug && (
              <Badge variant="outline" className="text-[9px] py-0 border-amber-500/40 text-amber-300/80">
                module
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{toolkit.description}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/80 mb-3 pl-12">
        <span>{toolkit.tool_ids.length} tool{toolkit.tool_ids.length === 1 ? '' : 's'}</span>
        <span className="opacity-50">·</span>
        <span>~{tokenEst.toLocaleString()} tk</span>
        <span className="opacity-50">·</span>
        <span>{ownerAgentNames}</span>
      </div>

      {/* Quick starts */}
      {(toolkit.quick_starts || []).length > 0 && !moduleDisabled && (
        <div className="space-y-1.5">
          {(toolkit.quick_starts || []).map((qs, i) => {
            const QSIcon = iconFor(qs.icon || toolkit.icon);
            return (
              <button
                key={i}
                onClick={() => onQuickStart(qs)}
                className="w-full text-left bg-muted/40 hover:bg-primary/10 rounded-md px-3 py-2 border border-border/50 hover:border-primary/40 transition group flex items-start gap-2.5"
              >
                <QSIcon className="h-3.5 w-3.5 text-primary/70 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{qs.label}</span>
                    {qs.workflow_id && (
                      <Badge variant="outline" className="text-[9px] py-0">workflow</Badge>
                    )}
                    <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 ml-auto whitespace-nowrap">
                      Send →
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{qs.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* No quick-starts fallback */}
      {(toolkit.quick_starts || []).length === 0 && !moduleDisabled && (
        <div className="text-[11px] text-muted-foreground italic">
          No starter prompts yet for this toolkit.
        </div>
      )}

      {/* Show-tools disclosure */}
      {!moduleDisabled && toolkit.tool_ids.length > 0 && (
        <button
          onClick={() => setShowTools((s) => !s)}
          className="mt-3 text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 self-start"
        >
          {showTools
            ? <><ChevronDown className="h-3 w-3" /> Hide tools</>
            : <><ChevronRight className="h-3 w-3" /> Show {toolkit.tool_ids.length} tools inside</>}
        </button>
      )}

      {showTools && !moduleDisabled && (
        <div className="mt-2 pt-2 border-t border-border/40 space-y-1 text-[11px]">
          {toolkit.tool_ids.map((id) => {
            const tool = findTool(id);
            if (!tool) return null;
            return (
              <div key={id} className="flex items-baseline gap-2">
                <span className="font-medium">{tool.name}</span>
                <span className="text-muted-foreground truncate">{tool.desc}</span>
                {tool.credits != null && tool.credits > 0 && (
                  <Badge variant="outline" className="text-[9px] py-0 ml-auto shrink-0">
                    {tool.credits} cr
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
