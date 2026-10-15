import React, { useState } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, useDraggable, useDroppable,
  useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { FileText, GripVertical } from 'lucide-react';

import { formatMoney } from '@/utils/decimal';
import { formatDate, fromLocalISODate } from '@/utils/datetime';
import { LEAD_STATUSES, LEAD_STATUS_LABEL, type LeadStatus } from '@/modules/crm/leadVocabulary';
import type { Lead } from '@/services/crmLeadsService';

interface Props {
  leads: Lead[];
  quoteCounts: Map<string, number>;
  today: string;
  onOpen: (lead: Lead) => void;
  onMove: (lead: Lead, to: LeadStatus) => void;
}

const BOARD_ORDER: LeadStatus[] = ['new', 'contacted', 'quoted', 'converted', 'lost'];

export const LeadsBoard: React.FC<Props> = ({ leads, quoteCounts, today, onOpen, onMove }) => {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const dragging = draggingId ? leads.find((l) => l.id === draggingId) ?? null : null;

  const onDragEnd = (evt: DragEndEvent) => {
    setDraggingId(null);
    const to = evt.over ? (String(evt.over.id) as LeadStatus) : null;
    const lead = leads.find((l) => l.id === String(evt.active.id));
    if (!to || !lead || lead.status === to || !LEAD_STATUSES.includes(to)) return;
    onMove(lead, to);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e: DragStartEvent) => setDraggingId(String(e.active.id))}
      onDragCancel={() => setDraggingId(null)}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-2">
        {BOARD_ORDER.map((status) => {
          const column = leads.filter((l) => l.status === status);
          const total = column.reduce((sum, l) => sum + (l.estimated_value ?? 0), 0);
          return (
            <StatusColumn key={status} status={status} count={column.length} total={total} isDragging={draggingId !== null}>
              {column.map((l) => (
                <LeadCard
                  key={l.id} lead={l} quotes={quoteCounts.get(l.id) ?? 0}
                  overdue={!!l.follow_up_on && l.status !== 'converted' && l.status !== 'lost' && l.follow_up_on < today}
                  onOpen={() => onOpen(l)}
                />
              ))}
            </StatusColumn>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="w-[248px] rotate-1 rounded-md border border-primary bg-card p-2.5 shadow-overlay">
            <div className="truncate text-sm font-semibold">{dragging.name}</div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{dragging.title ?? '—'}</div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};

const StatusColumn: React.FC<{
  status: LeadStatus; count: number; total: number; isDragging: boolean; children: React.ReactNode;
}> = ({ status, count, total, isDragging, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="w-[248px] shrink-0">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <span className="text-xs font-semibold">{LEAD_STATUS_LABEL[status]}</span>
        <span className="text-right text-[10px] text-muted-foreground tabular-nums">
          {count}{total > 0 ? ` · ${formatMoney(total, 'EUR', { decimals: 0, maxDecimals: 0 })}` : ''}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={[
          'min-h-[80px] space-y-2 rounded-md p-1 transition-colors',
          isOver ? 'bg-primary/[0.08] outline outline-2 outline-primary' : isDragging ? 'outline-dashed outline-1 outline-hairline' : '',
        ].join(' ')}
      >
        {children}
        {count === 0 && !isDragging && (
          <div className="rounded-md border border-dashed border-hairline py-6 text-center text-[11px] text-muted-foreground">—</div>
        )}
      </div>
    </div>
  );
};

const LeadCard: React.FC<{ lead: Lead; quotes: number; overdue: boolean; onOpen: () => void }> = ({ lead, quotes, overdue, onOpen }) => {
  const locked = lead.status === 'converted';
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, disabled: locked });
  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      className={`dashboard-card panel-interactive cursor-pointer p-2.5 ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start gap-1">
        {!locked && (
          <button
            type="button"
            className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label={`Drag ${lead.name} to another status`}
            onClick={(e) => e.stopPropagation()}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{lead.name}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{lead.title ?? lead.email ?? '—'}</div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            {lead.estimated_value != null && (
              <span className="tabular-nums">{formatMoney(lead.estimated_value, lead.currency, { decimals: 0, maxDecimals: 0 })}</span>
            )}
            {quotes > 0 && <span className="inline-flex items-center gap-0.5"><FileText className="h-3 w-3" />{quotes}</span>}
            {lead.follow_up_on && (
              <span className={overdue ? 'text-[hsl(var(--error))]' : undefined}>{formatDate(fromLocalISODate(lead.follow_up_on))}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
