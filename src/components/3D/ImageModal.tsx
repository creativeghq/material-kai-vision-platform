import React from 'react';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: Array<{ url: string; modelName: string }>;
  currentIndex: number;
  onNavigate: (direction: 'prev' | 'next') => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({
  isOpen,
  onClose,
  images,
  currentIndex,
  onNavigate,
}) => {
  const currentImage = images[currentIndex];

  const handleDownload = () => {
    if (!currentImage) return;

    const link = document.createElement('a');
    link.href = currentImage.url;
    link.download = `interior-design-${currentImage.modelName}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!currentImage) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full h-[90vh] p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="flex items-center justify-between">
            <span>{currentImage.modelName}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {currentIndex + 1} of {images.length}
              </span>
              <Button
                onClick={onClose}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onClose();
                  }
                }}
                className="px-2 py-1 text-sm hover:bg-gray-100">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 relative bg-background/95">
          <img
            src={currentImage.url}
            alt={`Interior design by ${currentImage.modelName}`}
            className="w-full h-full object-contain"
          />

          {/* Navigation buttons */}
          {images.length > 1 && (
            <>
              <Button
                onClick={() => onNavigate('prev')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onNavigate('prev');
                  }
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 px-2 py-1 text-sm bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={currentIndex === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => onNavigate('next')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onNavigate('next');
                  }
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 px-2 py-1 text-sm bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={currentIndex === images.length - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        <div className="p-4 pt-2 border-t">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Model: {currentImage.modelName}</span>
            </div>
            <Button
              onClick={handleDownload}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleDownload();
                }
              }}
              className="px-3 py-1 text-sm border border-gray-300 hover:bg-gray-50">
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
