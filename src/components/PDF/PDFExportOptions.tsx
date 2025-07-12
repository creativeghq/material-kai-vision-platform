import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Download, 
  FileSpreadsheet, 
  FileJson, 
  Image as ImageIcon,
  Package
} from 'lucide-react';
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
  resultSummary 
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
      'Structured Data'
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
      `"${JSON.stringify(tile.structured_data || {}).replace(/"/g, '""')}"`
    ]);

    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.join(','))
      .join('\n');

    downloadFile(csvContent, `pdf_materials_${processingId}.csv`, 'text/csv');
    
    toast({
      title: "CSV Export",
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
          height: tile.height
        },
        extracted_text: tile.extracted_text,
        structured_data: tile.structured_data,
        metadata: tile.metadata_extracted
      }))
    };

    const jsonContent = JSON.stringify(exportData, null, 2);
    downloadFile(jsonContent, `pdf_materials_${processingId}.json`, 'application/json');
    
    toast({
      title: "JSON Export",
      description: `Exported complete data structure to JSON`,
    });
  };

  const exportMaterialCatalog = () => {
    const materialTiles = tiles.filter(t => t.material_detected);
    const materialSummary = materialTiles.reduce((acc, tile) => {
      const type = tile.material_type;
      if (!acc[type]) {
        acc[type] = {
          material_type: type,
          count: 0,
          avg_confidence: 0,
          examples: [],
          properties_detected: new Set()
        };
      }
      
      acc[type].count++;
      acc[type].avg_confidence += tile.material_confidence || 0;
      
      if (acc[type].examples.length < 3) {
        acc[type].examples.push({
          text: tile.extracted_text?.substring(0, 200),
          confidence: tile.material_confidence,
          page: tile.page_number
        });
      }

      // Collect unique properties
      if (tile.structured_data) {
        Object.keys(tile.structured_data).forEach(prop => {
          acc[type].properties_detected.add(prop);
        });
      }

      return acc;
    }, {} as any);

    // Convert sets to arrays and calculate averages
    Object.values(materialSummary).forEach((material: any) => {
      material.avg_confidence = material.avg_confidence / material.count;
      material.properties_detected = Array.from(material.properties_detected);
    });

    const catalogContent = JSON.stringify({
      processing_id: processingId,
      catalog_type: 'material_summary',
      generated_at: new Date().toISOString(),
      total_materials_detected: materialTiles.length,
      unique_material_types: Object.keys(materialSummary).length,
      materials: Object.values(materialSummary)
    }, null, 2);

    downloadFile(catalogContent, `material_catalog_${processingId}.json`, 'application/json');
    
    toast({
      title: "Material Catalog Export",
      description: `Exported catalog with ${Object.keys(materialSummary).length} material types`,
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
  const materialTypes = [...new Set(materialTiles.map(t => t.material_type))];

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
            <Badge key={type} variant="outline">{type}</Badge>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Button onClick={exportToCSV} variant="outline" className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Export CSV
          </Button>
          
          <Button onClick={exportToJSON} variant="outline" className="flex items-center gap-2">
            <FileJson className="h-4 w-4" />
            Export JSON
          </Button>
          
          <Button onClick={exportMaterialCatalog} variant="outline" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Material Catalog
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          <p>• CSV: Tabular data for spreadsheet analysis</p>
          <p>• JSON: Complete structured data with metadata</p>
          <p>• Material Catalog: Summarized materials by type</p>
        </div>
      </CardContent>
    </Card>
  );
};