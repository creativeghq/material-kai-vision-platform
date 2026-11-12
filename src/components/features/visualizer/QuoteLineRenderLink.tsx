import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Grid3x3 } from 'lucide-react';
import { parseRenderState, serializeRenderState } from '@/lib/surfaceRenderer';
import { roomViewService } from '@/services/roomViewService';

/** "View render" on a quote line quantified from a room view or the visualizer (#560). */
export const QuoteLineRenderLink: React.FC<{ roomViewSheetId?: string | null; visualizerState?: string | null }> = ({
  roomViewSheetId, visualizerState,
}) => {
  const [moodboardId, setMoodboardId] = useState<string | null>(null);
  useEffect(() => {
    if (!roomViewSheetId) return;
    let live = true;
    roomViewService.moodboardForSheet(roomViewSheetId)
      .then((id) => { if (live) setMoodboardId(id); })
      .catch(() => { if (live) setMoodboardId(null); });
    return () => { live = false; };
  }, [roomViewSheetId]);

  let to: string | null = null;
  if (roomViewSheetId && moodboardId) to = `/moodboard/${moodboardId}?tab=room-views&view=${roomViewSheetId}`;
  else if (!roomViewSheetId && visualizerState) {
    const state = parseRenderState(new URLSearchParams(visualizerState));
    if (state.sceneId) to = `/visualizer?${serializeRenderState(state).toString()}`;
  }
  if (!to) return null;
  return (
    <Link
      to={to}
      onClick={(e) => e.stopPropagation()}
      className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
    >
      <Grid3x3 className="h-3 w-3" />View render
    </Link>
  );
};
