import React from 'react';
import { Link } from 'react-router-dom';
import { Database, BookOpen, Inbox, Palette, Sparkles } from 'lucide-react';

import { INBOX_LINK } from './officeLinks';

interface QuickTile {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  to: string;
}

/** Destinations only — no data, no counts. Every path is already linked from
 *  elsewhere in the shipped dashboard (hero tasks / widget "View all"), so none
 *  of these can be a dead route. */
const TILES: QuickTile[] = [
  { icon: Database, label: 'Catalog', to: '/discover' },
  // Inbox, not Quotes: the Quotes block directly above this row already links to the list, and
  // this row is the only remaining way into the conversation threads — the open-thread count
  // used to sit as the third row of the FINANCE block, where it was neither finance nor linked
  // to anything.
  { icon: Inbox, label: 'Inbox', to: INBOX_LINK },
  { icon: BookOpen, label: 'Knowledge', to: '/knowledge-base' },
  { icon: Palette, label: 'MoodBoards', to: '/moodboard' },
  { icon: Sparkles, label: 'Ask KAI', to: '/agent-hub' },
];

/**
 * QuickAccess — the icon row from the reference's "Γρήγορη πρόσβαση".
 *
 * Deliberately the only block on the panel with no number on it: it is pure
 * navigation, and mixing a count into it would imply something needs attention.
 */
export const QuickAccess: React.FC = () => (
  <div>
    <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground mb-2">
      Quick Access
    </p>
    <div className="grid grid-cols-5 gap-1.5">
      {TILES.map((t) => (
        <Link
          key={t.to}
          to={t.to}
          title={t.label}
          className="group flex flex-col items-center gap-1.5 rounded-xl border border-hairline bg-background/40 px-1 py-2.5 transition-colors hover:border-primary/40 hover:bg-background/70"
        >
          <t.icon className="h-4 w-4 text-primary shrink-0" />
          {/* 9px is small, but the tile is 1/5 of a narrow column and the icon
              carries the meaning; the title attribute covers any truncation. */}
          <span className="text-[9px] leading-none text-muted-foreground text-center truncate w-full">
            {t.label}
          </span>
        </Link>
      ))}
    </div>
  </div>
);
