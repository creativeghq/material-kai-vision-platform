import React from 'react';
import {
  Hand, Clock, Globe, UserPlus, FileText, Image,
  GitBranch, ArrowLeftRight, Filter, Timer,
  MessageSquare, Mail, PlusCircle, Bell,
  LogIn, CheckCircle2, XCircle, ClipboardCheck,
  FileCheck, Package, Search, Box, Orbit,
  FlaskConical, Repeat, CircleStop,
  Smartphone, Send, UserCog, Tag, StickyNote,
  UserPen, PackageCheck, ScrollText, Zap,
  SearchCheck, ScanEye, PackagePlus,
  LayoutGrid, ImagePlus, Share2,
  BotMessageSquare,
  Compass, FileSearch, Building2, UserSearch, MailCheck,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/core/ui/accordion';
import { triggerPaletteItems, conditionPaletteItems, actionPaletteItems, groupBySubcategory } from '../utils/paletteItems';
import type { NodePaletteItem } from '@/services/flows/types';

const iconMap: Record<string, React.ElementType> = {
  Hand, Clock, Globe, UserPlus, FileText, Image,
  GitBranch, ArrowLeftRight, Filter, Timer,
  MessageSquare, Mail, PlusCircle, Bell,
  LogIn, CheckCircle2, XCircle, ClipboardCheck,
  FileCheck, Package, Search, Box, Orbit,
  FlaskConical, Repeat, CircleStop,
  Smartphone, Send, UserCog, Tag, StickyNote,
  UserPen, PackageCheck, ScrollText, Zap,
  SearchCheck, ScanEye, PackagePlus,
  LayoutGrid, ImagePlus, Share2,
  BotMessageSquare,
  Compass, FileSearch, Building2, UserSearch, MailCheck,
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
}

function PaletteItem({ item }: PaletteItemProps) {
  const Icon = iconMap[item.icon] || Globe;

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/reactflow-type', item.type);
    e.dataTransfer.setData('application/reactflow-data', JSON.stringify(item.defaultData));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border cursor-grab active:cursor-grabbing transition-colors ${categoryColors[item.category]}`}
    >
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${categoryTextColors[item.category]}`} />
      <div className="min-w-0">
        <p className="text-xs font-medium truncate">{item.label}</p>
        <p className="text-[10px] text-muted-foreground truncate leading-tight">{item.description}</p>
      </div>
    </div>
  );
}

interface PaletteSectionProps {
  label: string;
  category: string;
  items: NodePaletteItem[];
}

function PaletteSection({ label, category, items }: PaletteSectionProps) {
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
                  <PaletteItem key={item.subType} item={item} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

export function NodePalette() {
  return (
    <div className="w-[240px] border-r bg-muted/30 overflow-y-auto p-3 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Drag to canvas
      </p>
      <PaletteSection label="Triggers" category="trigger" items={triggerPaletteItems} />
      <PaletteSection label="Conditions" category="condition" items={conditionPaletteItems} />
      <PaletteSection label="Actions" category="action" items={actionPaletteItems} />
    </div>
  );
}
