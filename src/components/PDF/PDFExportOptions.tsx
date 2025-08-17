import React from 'react';
import {
  Download,
  FileSpreadsheet,
  FileJson,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface PDFTile {
  id: string;
  page_number: number;
  tile_index: number;
  extracted_text: string;
  ocr_confidence: number;
  material_detected: boolean;
  material_type: string;
  material_confidence: number;
  structured_data: any;
  metadata_extracted: any;
  x_coordinate: number;
  y_coordinate: number;
  width: number;
  height: number;
  image_url?: string;
}

interface PDFExportOptionsProps {
  processingId: string;
  tiles: PDFTile[];
  resultSummary: any;
}

export const PDFExportOptions: React.FC<PDFExportOptionsProps> = ({
  processingId,
  tiles,
  resultSummary,
}) => {
  const { toast } = useToast();

  const exportToCSV = () => {
    const materialTiles = tiles.filter(t => t.material_detected);

    const csvHeaders = [
      'Page',
      'Tile Index',
      'Material Type',
      'Material Confidence',
      'OCR Confidence',
      'X Position',
      'Y Position',
      'Extracted Text',
      'Structured Data',
    ];

    const csvRows = materialTiles.map(tile => [
      tile.page_number,
      tile.tile_index,
      tile.material_type,
      Math.round((tile.material_confidence || 0) * 100) + '%',
      Math.round((tile.ocr_confidence || 0) * 100) + '%',
      tile.x_coordinate,
      tile.y_coordinate,
      `"${(tile.extracted_text || '').replace(/"/g, '""')}"`,
      `"${JSON.stringify(tile.structured_data || {}).replace(/"/g, '""')}"`,
    ]);

    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.join(','))
      .join('\n');

    downloadFile(csvContent, `pdf_materials_${processingId}.csv`, 'text/csv');

    toast({
      title: 'CSV Export',
      description: `Exported ${materialTiles.length} materials to CSV`,
    });
  };

  const exportToJSON = () => {
    const exportData = {
      processing_id: processingId,
      summary: resultSummary,
      export_timestamp: new Date().toISOString(),
      materials: tiles.filter(t => t.material_detected).map(tile => ({
        id: tile.id,
        page_number: tile.page_number,
        tile_index: tile.tile_index,
        material_type: tile.material_type,
        material_confidence: tile.material_confidence,
        ocr_confidence: tile.ocr_confidence,
        position: {
          x: tile.x_coordinate,
          y: tile.y_coordinate,
          width: tile.width,
          height: tile.height,
        },
        extracted_text: tile.extracted_text,
        structured_data: tile.structured_data,
        metadata: tile.metadata_extracted,
      })),
    };

    const jsonContent = JSON.stringify(exportData, null, 2);
    downloadFile(jsonContent, `pdf_materials_${processingId}.json`, 'application/json');

    toast({
      title: 'JSON Export',
      description: 'Exported complete data structure to JSON',
    });
  };


  const downloadFile = (content: string, filename: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const materialTiles = tiles.filter(t => t.material_detected);
  const materialTypes = Array.from(new Set(materialTiles.map(t => t.material_type)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Export Options
        </CardTitle>
        <CardDescription>
          Export your PDF processing results in various formats
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium">Total Materials</p>
            <p className="text-muted-foreground">{materialTiles.length} detected</p>
          </div>
          <div>
            <p className="font-medium">Material Types</p>
            <p className="text-muted-foreground">{materialTypes.length} unique types</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {materialTypes.map(type => (
            <span key={type} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-300">
              {type}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Button onClick={exportToCSV} className="flex items-center gap-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
            <FileSpreadsheet className="h-4 w-4" />
            Export CSV
          </Button>

          <Button onClick={exportToJSON} className="flex items-center gap-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
            <FileJson className="h-4 w-4" />
            Export JSON
          </Button>

        </div>

        <div className="text-xs text-muted-foreground">
          <p>• CSV: Tabular data for spreadsheet analysis</p>
          <p>• JSON: Complete structured data with metadata</p>
        </div>
      </CardContent>
    </Card>
  );
};
