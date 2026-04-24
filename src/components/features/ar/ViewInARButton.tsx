/**
 * ViewInARButton Component
 * Renders a context-aware button for AR preview on product cards.
 * - Desktop: shows QR code modal for phone handoff
 * - WebXR/QuickLook: opens AR preview directly
 * - Unsupported: renders nothing
 */

import React, { useState } from 'react';
import { QrCode, Smartphone, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/core/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { useARSupport } from './useARSupport';

// ---------------------------------------------------------------------------
// QR Code Modal (inline) — shows a URL for mobile handoff
// ---------------------------------------------------------------------------

interface ARQRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName?: string;
}

const ARQRCodeModal: React.FC<ARQRCodeModalProps> = ({
  isOpen,
  onClose,
  productId,
  productName,
}) => {
  const arUrl = `${window.location.origin}/ar/${productId}`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">
            View {productName || 'Material'} in AR
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex h-48 w-48 items-center justify-center rounded-xl bg-white p-3">
            <QRCodeSVG
              value={arUrl}
              size={168}
              level="M"
              includeMargin={false}
            />
          </div>

          <div className="w-full space-y-2 text-center">
            <p className="text-sm text-muted-foreground">
              Scan the QR code with your phone to view this material in AR,
              or copy the link below:
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={arUrl}
                className="flex-1 rounded-full border bg-muted/50 px-3 py-1.5 text-xs"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => {
                  navigator.clipboard.writeText(arUrl);
                }}
              >
                Copy
              </Button>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="rounded-full"
            onClick={onClose}
          >
            <X className="mr-1 h-4 w-4" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// ViewInARButton
// ---------------------------------------------------------------------------

interface ViewInARButtonProps {
  productId: string;
  productName?: string;
  productImage?: string;
  pbrMaps?: {
    albedo_url?: string;
    tileable_url?: string;
    normal_url?: string;
    roughness_url?: string;
  };
  variant?: 'default' | 'outline' | 'ghost' | 'icon';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  /** Called when the user wants to open the AR preview modal directly */
  onOpenPreview?: () => void;
}

export const ViewInARButton: React.FC<ViewInARButtonProps> = ({
  productId,
  productName,
  variant = 'outline',
  size = 'sm',
  className = '',
  onOpenPreview,
}) => {
  const { mode, loading } = useARSupport();
  const [qrOpen, setQrOpen] = useState(false);

  if (loading) return null;
  if (mode === 'none') return null;

  // Desktop → QR modal for phone handoff
  if (mode === 'desktop') {
    return (
      <>
        <Button
          variant={variant === 'icon' ? 'ghost' : variant}
          size={size}
          className={`rounded-full ${className}`}
          onClick={() => {
            if (onOpenPreview) {
              onOpenPreview();
            } else {
              setQrOpen(true);
            }
          }}
          title="View in AR"
        >
          {size === 'icon' || variant === 'icon' ? (
            <QrCode className="h-4 w-4" />
          ) : (
            <>
              <QrCode className="mr-1.5 h-4 w-4" />
              View in 3D
            </>
          )}
        </Button>

        <ARQRCodeModal
          isOpen={qrOpen}
          onClose={() => setQrOpen(false)}
          productId={productId}
          productName={productName}
        />
      </>
    );
  }

  // Mobile (WebXR or QuickLook) → open preview or navigate
  return (
    <Button
      variant={variant === 'icon' ? 'ghost' : variant}
      size={size}
      className={`rounded-full ${className}`}
      onClick={() => {
        if (onOpenPreview) {
          onOpenPreview();
        } else {
          window.location.href = `/ar/${productId}`;
        }
      }}
      title="View in AR"
    >
      {size === 'icon' || variant === 'icon' ? (
        <Smartphone className="h-4 w-4" />
      ) : (
        <>
          <Smartphone className="mr-1.5 h-4 w-4" />
          View in AR
        </>
      )}
    </Button>
  );
};
