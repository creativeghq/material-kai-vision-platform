/** Pick one of your moodboards and save the current render on it as a room view (#560). */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { roomViewService } from '@/services/roomViewService';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTitle: string;
  /** Does the save; resolves with the sheet id. */
  onSave: (board: { id: string; room_id: string | null }, title: string) => Promise<string>;
}

export const SaveToMoodboardDialog: React.FC<Props> = ({ open, onOpenChange, defaultTitle, onSave }) => {
  const [boards, setBoards] = useState<{ id: string; title: string; room_id: string | null }[] | null>(null);
  const [boardId, setBoardId] = useState<string>('');
  const [title, setTitle] = useState(defaultTitle);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ boardId: string; sheetId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSaved(null);
    setError(null);
    setTitle(defaultTitle);
    roomViewService.listMyMoodboards()
      .then((b) => { setBoards(b); setBoardId((cur) => cur || b[0]?.id || ''); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load your moodboards'));
  }, [open, defaultTitle]);

  const board = boards?.find((b) => b.id === boardId) ?? null;

  const save = async () => {
    if (!board) return;
    setSaving(true);
    setError(null);
    try {
      const sheetId = await onSave(board, title.trim() || defaultTitle);
      setSaved({ boardId: board.id, sheetId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save to Moodboard</DialogTitle>
          <DialogDescription>
            Saved as a room view: a sheet on the moodboard with a pin on the surface, ready for decks and client views. The product is added to the board if it is not on it.
          </DialogDescription>
        </DialogHeader>
        {saved ? (
          <p className="text-sm">
            Saved. <Link className="underline" to={`/moodboard/${saved.boardId}?tab=room-views`} onClick={() => onOpenChange(false)}>Open the moodboard</Link>
          </p>
        ) : boards === null && !error ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading your moodboards…</div>
        ) : boards && boards.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You have no moodboards yet. <Link className="underline" to="/moodboard" onClick={() => onOpenChange(false)}>Create one</Link>, then save this view to it.
          </p>
        ) : (
          <div className="grid gap-3">
            <div>
              <Label className="text-xs">Moodboard</Label>
              <Select value={boardId} onValueChange={setBoardId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick a moodboard" /></SelectTrigger>
                <SelectContent>{(boards ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{saved ? 'Close' : 'Cancel'}</Button>
          {!saved && (
            <Button onClick={save} disabled={saving || !board}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Save
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
