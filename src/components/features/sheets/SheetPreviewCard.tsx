import React from 'react';
import { Download, FileText, ExternalLink, Pencil } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card } from '@/components/core/ui/card';
import { SHEET_TYPE_LABELS, type SheetType } from '@/services/moodboardSheetsService';

interface SheetPreviewCardProps {
  sheetId: string;
  sheetType: SheetType;
  title: string;
  pdfUrl: string;
  pageCount?: number;
  creditsUsed?: number;
  onEdit?: () => void;
}

export function SheetPreviewCard({
  sheetId,
  sheetType,
  title,
  pdfUrl,
  pageCount,
  creditsUsed,
  onEdit,
}: SheetPreviewCardProps) {
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = `${title.replace(/\s+/g, '-').toLowerCase()}.pdf`;
    a.target = '_blank';
    a.click();
  };

  return (
    <Card className="p-4 space-y-3 dashboard-card">
      <div className="flex items-center gap-2 flex-wrap">
        <FileText className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{title}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full ml-auto">
          {SHEET_TYPE_LABELS[sheetType] || sheetType}
        </span>
      </div>

      {/* Inline preview */}
      <div className="rounded-lg overflow-hidden border border-white/15 bg-black/20" style={{ aspectRatio: '4/3' }}>
        <iframe
          src={`${pdfUrl}#toolbar=0&navpanes=0`}
          className="w-full h-full"
          title={title}
        />
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        {pageCount != null && <span>{pageCount} page{pageCount === 1 ? '' : 's'}</span>}
        {creditsUsed != null && creditsUsed > 0 && <span>· {creditsUsed} credits</span>}
        <span className="ml-auto font-mono text-[10px]">{sheetId.slice(0, 8)}</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="gap-2" onClick={handleDownload}>
          <Download className="h-4 w-4" />
          Download PDF
        </Button>
        <Button size="sm" variant="ghost" className="gap-2" onClick={() => window.open(pdfUrl, '_blank')}>
          <ExternalLink className="h-4 w-4" />
          Open in new tab
        </Button>
        {onEdit && (
          <Button size="sm" variant="ghost" className="gap-2 ml-auto" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        )}
      </div>
    </Card>
  );
}
