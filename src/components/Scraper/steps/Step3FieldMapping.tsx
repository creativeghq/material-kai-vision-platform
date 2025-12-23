import React from 'react';
import { FileJson } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldMappingStep, type FieldMapping } from '../FieldMappingStep';

interface Step3FieldMappingProps {
  fieldMappings: FieldMapping[];
  onFieldMappingsChange: (mappings: FieldMapping[]) => void;
  workspaceId: string;
  sampleUrl?: string;
}

export const Step3FieldMapping: React.FC<Step3FieldMappingProps> = ({
  fieldMappings,
  onFieldMappingsChange,
  workspaceId,
  sampleUrl,
}) => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            Field Mappings
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Define what data to extract from the web pages. These fields will be used to structure
            the extracted material information.
          </p>
        </CardHeader>
        <CardContent>
          <FieldMappingStep
            fields={fieldMappings}
            onChange={onFieldMappingsChange}
            workspaceId={workspaceId}
            sampleUrl={sampleUrl}
          />
        </CardContent>
      </Card>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-sm text-blue-900 mb-2">💡 Tips for Field Mapping</h4>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Use descriptive field names that match your data structure</li>
          <li>Mark required fields to ensure data quality</li>
          <li>Use templates to save time on common configurations</li>
          <li>Try AI Suggest to automatically detect fields from a sample page</li>
        </ul>
      </div>
    </div>
  );
};

