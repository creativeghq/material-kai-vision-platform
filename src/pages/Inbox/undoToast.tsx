import { ToastAction, type ToastActionElement } from '@/components/core/ui/toast';

export function undoToastAction(onUndo: () => void): ToastActionElement {
  return <ToastAction altText="Undo" onClick={onUndo}>Undo</ToastAction>;
}
