import { useState, type DragEvent } from 'react';

export function useFileDrop(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  return {
    dragging,
    dropProps: {
      onDragOver: (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); setDragging(true); },
      onDragLeave: (e: DragEvent) => { if (e.currentTarget === e.target) setDragging(false); },
      onDrop: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length) onFiles(files);
      },
    },
  };
}
