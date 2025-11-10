/**
 * XML Import Tab
 * 
 * Handles XML file upload, field detection, AI-assisted mapping, and import job creation
 */

import React, { useState } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import XMLFieldMappingModal from './XMLFieldMappingModal';

interface DetectedField {
  xml_field: string;
  sample_values: string[];
  suggested_mapping: string;
  confidence: number;
  data_type: string;
}

const XMLImportTab: React.FC = () => {
  const { currentWorkspace } = useWorkspace();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedFields, setDetectedFields] = useState<DetectedField[]>([]);
  const [suggestedMappings, setSuggestedMappings] = useState<Record<string, string>>({});
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.xml')) {
        setError('Please select an XML file');
        return;
      }
      setSelectedFile(file);
      setError(null);
      setDetectedFields([]);
      setSuggestedMappings({});
    }
  };

  const handleDetectFields = async () => {
    if (!selectedFile || !currentWorkspace) return;

    setIsDetecting(true);
    setError(null);

    try {
      // Read file as text
      const xmlText = await selectedFile.text();

      // Encode to base64
      const xmlBase64 = btoa(xmlText);

      // Call Edge Function in preview mode
      const { data, error: functionError } = await supabase.functions.invoke(
        'xml-import-orchestrator',
        {
          body: {
            workspace_id: currentWorkspace.id,
            xml_content: xmlBase64,
            preview_only: true, // Trigger field detection mode
          },
        }
      );

      if (functionError) {
        throw new Error(functionError.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to detect fields');
      }

      setDetectedFields(data.detected_fields || []);
      setSuggestedMappings(data.suggested_mappings || {});
      setShowMappingModal(true);
    } catch (err: any) {
      console.error('Error detecting fields:', err);
      setError(err.message || 'Failed to detect XML fields');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleMappingConfirmed = () => {
    setShowMappingModal(false);
    // The modal will handle the actual import
  };

  return (
    <div className="space-y-6">
      {/* File Upload Section */}
      <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
        <input
          type="file"
          accept=".xml"
          onChange={handleFileSelect}
          className="hidden"
          id="xml-file-input"
        />
        <label
          htmlFor="xml-file-input"
          className="cursor-pointer flex flex-col items-center gap-4"
        >
          <div className="p-4 bg-blue-600/20 rounded-full">
            <FileText className="h-12 w-12 text-blue-400" />
          </div>
          <div>
            <p className="text-lg font-semibold text-white mb-1">
              {selectedFile ? selectedFile.name : 'Choose XML File'}
            </p>
            <p className="text-sm text-gray-400">
              {selectedFile
                ? `${(selectedFile.size / 1024).toFixed(2)} KB`
                : 'Click to browse or drag and drop'}
            </p>
          </div>
          {!selectedFile && (
            <Button variant="outline" className="mt-2">
              <Upload className="h-4 w-4 mr-2" />
              Select File
            </Button>
          )}
        </label>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* File Selected - Show Detect Button */}
      {selectedFile && !detectedFields.length && (
        <div className="flex flex-col items-center gap-4">
          <Alert className="bg-blue-900/20 border-blue-700">
            <CheckCircle className="h-4 w-4 text-blue-400" />
            <AlertDescription className="text-blue-200">
              File selected: <strong>{selectedFile.name}</strong>
              <br />
              Click "Detect Fields" to analyze the XML structure and get AI-assisted field mappings
            </AlertDescription>
          </Alert>

          <Button
            onClick={handleDetectFields}
            disabled={isDetecting}
            className="bg-blue-600 hover:bg-blue-700"
            size="lg"
          >
            {isDetecting ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Analyzing XML Structure...
              </>
            ) : (
              <>
                <FileText className="h-5 w-5 mr-2" />
                Detect Fields & Suggest Mappings
              </>
            )}
          </Button>
        </div>
      )}

      {/* Fields Detected - Show Summary */}
      {detectedFields.length > 0 && !showMappingModal && (
        <div className="space-y-4">
          <Alert className="bg-green-900/20 border-green-700">
            <CheckCircle className="h-4 w-4 text-green-400" />
            <AlertDescription className="text-green-200">
              Detected <strong>{detectedFields.length} fields</strong> with AI-suggested mappings
              <br />
              <Button
                variant="link"
                className="text-green-300 hover:text-green-200 p-0 h-auto"
                onClick={() => setShowMappingModal(true)}
              >
                Click here to review and confirm mappings
              </Button>
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-700/30 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-1">Total Fields</p>
              <p className="text-2xl font-bold text-white">{detectedFields.length}</p>
            </div>
            <div className="bg-gray-700/30 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-1">High Confidence</p>
              <p className="text-2xl font-bold text-green-400">
                {detectedFields.filter((f) => f.confidence >= 0.9).length}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Field Mapping Modal */}
      {showMappingModal && (
        <XMLFieldMappingModal
          isOpen={showMappingModal}
          onClose={() => setShowMappingModal(false)}
          detectedFields={detectedFields}
          suggestedMappings={suggestedMappings}
          xmlFile={selectedFile!}
          onMappingConfirmed={handleMappingConfirmed}
        />
      )}

      {/* Instructions */}
      <div className="bg-gray-700/20 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-3">How It Works</h3>
        <ol className="space-y-2 text-gray-300 text-sm">
          <li className="flex gap-2">
            <span className="text-blue-400 font-bold">1.</span>
            <span>Upload your XML file from a supplier or manufacturer</span>
          </li>
          <li className="flex gap-2">
            <span className="text-blue-400 font-bold">2.</span>
            <span>
              AI analyzes the XML structure and suggests field mappings to our product schema
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-blue-400 font-bold">3.</span>
            <span>Review and adjust the suggested mappings in the mapping interface</span>
          </li>
          <li className="flex gap-2">
            <span className="text-blue-400 font-bold">4.</span>
            <span>Save the mapping as a template for future imports from the same source</span>
          </li>
          <li className="flex gap-2">
            <span className="text-blue-400 font-bold">5.</span>
            <span>
              Products are processed in batches with real-time progress tracking
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
};

export default XMLImportTab;

