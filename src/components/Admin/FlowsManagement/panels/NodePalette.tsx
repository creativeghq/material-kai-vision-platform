import React, { useState } from 'react';
import {
  Hand, Clock, Globe, UserPlus, FileText,
  GitBranch, ArrowLeftRight, Filter, Timer,
  MessageSquare, Mail, PlusCircle, Bell,
  LogIn, CheckCircle2, XCircle,
  Search, Box, Orbit,
  FlaskConical, Repeat, CircleStop,
  Smartphone, Send, UserCog, Tag, StickyNote,
  UserPen, PackageCheck, ScrollText, Zap,
  SearchCheck, ScanEye, PackagePlus,
  LayoutGrid, ImagePlus, Share2,
  BotMessageSquare,
  Compass, FileSearch, Building2, UserSearch, MailCheck,
  MessageCircle, Megaphone, TrendingDown,
  Inbox, ClipboardCheck, FileCheck, Eye, Star, Package,
  CalendarOff, CalendarCheck, ShoppingCart, BookOpen, FilePlus2,
  MailX, MailWarning, MailOpen, MousePointerClick, AtSign, Briefcase,
  Ship, Truck, Home,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/core/ui/accordion';
import { triggerPaletteItems, conditionPaletteItems, actionPaletteItems, groupBySubcategory, isTenantAllowedItem } from '../utils/paletteItems';
import type { NodePaletteItem, FlowNodeData } from '@/services/flows/types';

const iconMap: Record<string, React.ElementType> = {
  Hand, Clock, Globe, UserPlus, FileText,
  GitBranch, ArrowLeftRight, Filter, Timer,
  MessageSquare, Mail, PlusCircle, Bell,
  LogIn, CheckCircle2, XCircle,
  Search, Box, Orbit,
  FlaskConical, Repeat, CircleStop,
  Smartphone, Send, UserCog, Tag, StickyNote,
  UserPen, PackageCheck, ScrollText, Zap,
  SearchCheck, ScanEye, PackagePlus,
  LayoutGrid, ImagePlus, Share2,
  BotMessageSquare,
  Compass, FileSearch, Building2, UserSearch, MailCheck,
  MessageCircle, Megaphone, TrendingDown,
  Inbox, ClipboardCheck, FileCheck, Eye, Star, Package,
  CalendarOff, CalendarCheck, ShoppingCart, BookOpen, FilePlus2,
  MailX, MailWarning, MailOpen, MousePointerClick, AtSign, Briefcase,
  Ship, Truck, Home,
};

const categoryColors: Record<string, string> = {
  trigger: 'border-emerald-500/30 hover:border-emerald-500/60 bg-emerald-500/5',
  condition: 'border-amber-500/30 hover:border-amber-500/60 bg-amber-500/5',
  action: 'border-blue-500/30 hover:border-blue-500/60 bg-blue-500/5',
};

const categoryTextColors: Record<string, string> = {
  trigger: 'text-emerald-600 dark:text-emerald-400',
  condition: 'text-amber-600 dark:text-amber-400',
  action: 'text-blue-600 dark:text-blue-400',
};

const categoryAccentDot: Record<string, string> = {
  trigger: 'bg-emerald-500',
  condition: 'bg-amber-500',
  action: 'bg-blue-500',
};

interface PaletteItemProps {
  item: NodePaletteItem;
  /** Click/keyboard path. Drag remains available as a mouse shortcut. */
  onAdd: (item: NodePaletteItem) => void;
}

function PaletteItem({ item, onAdd }: PaletteItemProps) {
  const Icon = iconMap[item.icon] || Globe;

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/reactflow-type', item.type);
    e.dataTransfer.setData('application/reactflow-data', JSON.stringify(item.defaultData));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={() => onAdd(item)}
      title={`Add ${item.label} to the canvas`}
      className={`w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-md border cursor-grab active:cursor-grabbing transition-colors ${categoryColors[item.category]}`}
    >
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${categoryTextColors[item.category]}`} />
      <div className="min-w-0">
        <p className="text-xs font-medium truncate">{item.label}</p>
        <p className="text-[10px] text-muted-foreground truncate leading-tight">{item.description}</p>
      </div>
    </button>
  );
}

interface PaletteSectionProps {
  label: string;
  category: string;
  items: NodePaletteItem[];
  onAdd: (item: NodePaletteItem) => void;
}

function PaletteSection({ label, category, items, onAdd }: PaletteSectionProps) {
  const groups = groupBySubcategory(items);

  return (
    <div>
      <p className={`text-xs font-semibold mb-1 ${categoryTextColors[category]}`}>
        {label}
      </p>
      <Accordion type="multiple" defaultValue={groups.map(g => g.group)}>
        {groups.map(({ group, items: groupItems }) => (
          <AccordionItem key={group} value={group} className="border-b-0">
            <AccordionTrigger className="py-1.5 hover:no-underline text-xs text-muted-foreground gap-2">
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${categoryAccentDot[category]}`} />
                {group}
                <span className="text-[10px] text-muted-foreground/60">({groupItems.length})</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-2 pt-0">
              <div className="space-y-1">
                {groupItems.map((item) => (
                  <PaletteItem key={item.subType} item={item} onAdd={onAdd} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

interface NodePaletteProps {
  /** #256 — when true, show only the tenant-safe subset (workspace builder). The DB guard trigger
   *  is the real enforcer; this trims the palette so a workspace user never sees privileged nodes. */
  tenantMode?: boolean;
  /** Adds the node without a drag. Required for keyboard users, who cannot drag at all. */
  onAddNode: (type: string, data: FlowNodeData) => void;
}

export function NodePalette({ tenantMode = false, onAddNode }: NodePaletteProps) {
  const [search, setSearch] = useState('');

  const q = search.toLowerCase().trim();

  const scope = (items: NodePaletteItem[]) =>
    tenantMode ? items.filter(isTenantAllowedItem) : items;

  const filterItems = (items: NodePaletteItem[]) => {
    const scoped = scope(items);
    return q
      ? scoped.filter(
          (i) =>
            i.label.toLowerCase().includes(q) ||
            i.description.toLowerCase().includes(q) ||
            i.group.toLowerCase().includes(q),
        )
      : scoped;
  };

  const filteredTriggers = filterItems(triggerPaletteItems);
  const filteredConditions = filterItems(conditionPaletteItems);
  const filteredActions = filterItems(actionPaletteItems);

  const handleAdd = (item: NodePaletteItem) =>
    onAddNode(item.type, item.defaultData as FlowNodeData);

  return (
    <div className="w-[240px] border-r bg-muted/30 flex flex-col h-full">
      <div className="p-3 space-y-2 border-b">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Click or drag to add
        </p>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes…"
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {filteredTriggers.length > 0 && (
          <PaletteSection label="Triggers" category="trigger" items={filteredTriggers} onAdd={handleAdd} />
        )}
        {filteredConditions.length > 0 && (
          <PaletteSection label="Conditions" category="condition" items={filteredConditions} onAdd={handleAdd} />
        )}
        {filteredActions.length > 0 && (
          <PaletteSection label="Actions" category="action" items={filteredActions} onAdd={handleAdd} />
        )}
        {filteredTriggers.length === 0 && filteredConditions.length === 0 && filteredActions.length === 0 && (
          <p className="text-xs text-muted-foreground text-center pt-6">No nodes match "{search}"</p>
        )}
      </div>
    </div>
  );
}
