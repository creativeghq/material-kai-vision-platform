/**
 * TechRadarReviewModal — inline modal triggered by Pepper's `tech_radar_form_open`
 * chunk. Lets the user describe a solution to review (and optionally start a
 * background monitor) without learning the tool schema. On submit it posts a
 * structured follow-up message that re-invokes `review_solution` / `track_tech_radar`.
 *
 * Mirrors JobSitesFormModal: the modal trades one chunk-emit for a proper form,
 * then collapses back into the chat-tool flow on submit.
 */

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';

export type TechRadarFormState = {
  prefill?: {
    title?: string;
    component?: string;
    repo?: string;
    current_approach?: string;
    constraints?: string;
  };
} | null;

interface Props {
  state: TechRadarFormState;
  onClose: () => void;
  /** Sent as a follow-up user message; the agent parses it and calls the radar tools. */
  onSubmit: (followupMessage: string) => void;
}

const CADENCE_OPTIONS = [
  { value: 'once', label: 'Just review once (no monitor)' },
  { value: '24',   label: 'Watch daily' },
  { value: '168',  label: 'Watch weekly' },
  { value: '720',  label: 'Watch monthly' },
] as const;

export function TechRadarReviewModal({ state, onClose, onSubmit }: Props) {
  const open = !!state;
  const [title, setTitle] = useState(state?.prefill?.title || '');
  const [component, setComponent] = useState(state?.prefill?.component || '');
  const [repo, setRepo] = useState(state?.prefill?.repo || '');
  const [currentApproach, setCurrentApproach] = useState(state?.prefill?.current_approach || '');
  const [constraints, setConstraints] = useState(state?.prefill?.constraints || '');
  const [cadence, setCadence] = useState<string>('once');

  useEffect(() => {
    if (state) {
      setTitle(state.prefill?.title || '');
      setComponent(state.prefill?.component || '');
      setRepo(state.prefill?.repo || '');
      setCurrentApproach(state.prefill?.current_approach || '');
      setConstraints(state.prefill?.constraints || '');
      setCadence('once');
    }
  }, [state]);

  const handleSubmit = () => {
    if (!title.trim() || !currentApproach.trim()) return;
    const parts: string[] = [];
    if (cadence === 'once') {
      parts.push('Run a Tech Radar review using review_solution (save=true).');
    } else {
      parts.push('Set up a Tech Radar monitor using track_tech_radar (action: "create").');
      parts.push(`- review_interval_hours: ${cadence}`);
    }
    parts.push(`- title: ${title.trim()}`);
    if (component.trim()) parts.push(`- component: ${component.trim()}`);
    if (repo.trim()) parts.push(`- repo: ${repo.trim()}`);
    parts.push(`- current_approach: ${currentApproach.trim()}`);
    if (constraints.trim()) parts.push(`- constraints: ${constraints.trim()}`);
    parts.push('Show me the findings grouped by ring when done.');
    onSubmit(parts.join('\n'));
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tech Radar — review a solution</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">What are we reviewing?</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="PDF OCR pipeline" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Component / area (optional)</Label>
              <Input value={component} onChange={(e) => setComponent(e.target.value)} placeholder="ocr" />
            </div>
            <div>
              <Label className="text-xs">Repo (optional)</Label>
              <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" />
            </div>
          </div>
          <div>
            <Label className="text-xs">How does it work today?</Label>
            <Textarea
              value={currentApproach}
              onChange={(e) => setCurrentApproach(e.target.value)}
              placeholder="PaddleOCR-VL structural pass on Modal (PP-DocLayoutV2 detector + 0.9B VLM); layout regions + OCR text + figure boxes per page; bbox normalized 0..1; metrics in paddleocr_metrics."
              rows={4}
            />
          </div>
          <div>
            <Label className="text-xs">Constraints to respect (optional)</Label>
            <Textarea
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              placeholder="Must run on our HF endpoints, &lt; $0.02/page, no new SaaS vendor."
              rows={2}
            />
          </div>
          <div>
            <Label className="text-xs">Cadence</Label>
            <Select value={cadence} onValueChange={setCadence}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CADENCE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || !currentApproach.trim()}>
            Send to Pepper
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
