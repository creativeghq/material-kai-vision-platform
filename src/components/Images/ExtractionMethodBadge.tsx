/**
 * ExtractionMethodBadge - Visual badge showing image extraction method
 * 
 * Displays:
 * - Vision-Guided: Green badge with eye icon
 * - PyMuPDF: Gray badge with document icon
 * - Confidence score (if available)
 */

import React from 'react';
import { Eye, FileText, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ExtractionMethodBadgeProps {
  extractionMethod?: string | null;
  detectionConfidence?: number | null;
  visionProvider?: string | null;
  visionModel?: string | null;
  size?: 'sm' | 'md' | 'lg';
  showConfidence?: boolean;
  className?: string;
}

export const ExtractionMethodBadge: React.FC<ExtractionMethodBadgeProps> = ({
  extractionMethod = 'pymupdf',
  detectionConfidence,
  visionProvider,
  visionModel,
  size = 'sm',
  showConfidence = true,
  className = '',
}) => {
  const isVisionGuided = extractionMethod === 'vision_guided';
  
  // Size variants
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };
  
  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  // Badge styling
  const badgeClasses = isVisionGuided
    ? 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200'
    : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200';

  // Icon
  const Icon = isVisionGuided ? Eye : FileText;

  // Tooltip content
  const tooltipContent = (
    <div className="space-y-1 text-xs">
      <div className="font-semibold">
        {isVisionGuided ? 'Vision-Guided Extraction' : 'PyMuPDF Extraction'}
      </div>
      {isVisionGuided && (
        <>
          {visionProvider && (
            <div>Provider: {visionProvider}</div>
          )}
          {visionModel && (
            <div>Model: {visionModel}</div>
          )}
          {detectionConfidence !== null && detectionConfidence !== undefined && (
            <div className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Confidence: {Math.round(detectionConfidence * 100)}%
            </div>
          )}
        </>
      )}
      {!isVisionGuided && (
        <div className="text-gray-400">Traditional PDF extraction</div>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`${badgeClasses} ${sizeClasses[size]} ${className} flex items-center gap-1 cursor-help`}
          >
            <Icon className={iconSizes[size]} />
            <span>{isVisionGuided ? 'Vision' : 'PyMuPDF'}</span>
            {showConfidence && isVisionGuided && detectionConfidence !== null && detectionConfidence !== undefined && (
              <span className="ml-1 font-semibold">
                {Math.round(detectionConfidence * 100)}%
              </span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Compact version for small spaces
export const ExtractionMethodIcon: React.FC<{
  extractionMethod?: string | null;
  detectionConfidence?: number | null;
  className?: string;
}> = ({ extractionMethod = 'pymupdf', detectionConfidence, className = '' }) => {
  const isVisionGuided = extractionMethod === 'vision_guided';
  const Icon = isVisionGuided ? Eye : FileText;
  const colorClass = isVisionGuided ? 'text-green-600' : 'text-gray-500';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`inline-flex items-center gap-1 ${className}`}>
            <Icon className={`h-4 w-4 ${colorClass}`} />
            {isVisionGuided && detectionConfidence !== null && detectionConfidence !== undefined && (
              <span className="text-xs text-green-700 font-medium">
                {Math.round(detectionConfidence * 100)}%
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="text-xs">
            {isVisionGuided ? 'Vision-Guided' : 'PyMuPDF'}
            {isVisionGuided && detectionConfidence !== null && detectionConfidence !== undefined && (
              <> ({Math.round(detectionConfidence * 100)}% confidence)</>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

