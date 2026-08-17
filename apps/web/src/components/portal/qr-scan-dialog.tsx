'use client';

import { useEffect, useRef, useState } from 'react';
import { CameraOff, Loader2, MapPin } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { scanQrCode, ScanUnavailableError, type QrScanner } from '@/lib/qr-scan';

/**
 * Owns the camera only while open, and hands the decoded payload straight to
 * the caller — what a code means is the server's to decide.
 */
export function QrScanDialog({
  open,
  onClose,
  onScanned,
  onUseGps,
  submitting,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onScanned: (qrCode: string) => void;
  /** Offered when the camera cannot be used, so a refusal is not a dead end. */
  onUseGps?: () => void;
  submitting: boolean;
  error: string | null;
}) {
  // A callback ref, not `useRef`: Radix mounts the dialog body a commit later
  // than `open` flips, so an effect keyed on `open` alone runs before the
  // element exists. Keying on the element starts the camera when it attaches.
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  // Held in a ref: the caller passes an inline arrow, and a new identity every
  // render would tear the camera down and re-prompt for permission.
  const onScannedRef = useRef(onScanned);
  useEffect(() => {
    onScannedRef.current = onScanned;
  }, [onScanned]);

  // Cleared on close: otherwise the error card stays up, the video never
  // mounts, and reopening cannot recover.
  useEffect(() => {
    if (!open) {
      setCameraError(null);
      setStarting(true);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !videoEl) return;
    let scanner: QrScanner | null = null;
    let cancelled = false;

    setStarting(true);

    const start = async () => {
      try {
        scanner = await scanQrCode(videoEl);
        if (cancelled) {
          scanner.stop();
          return;
        }
        setStarting(false);
        const code = await scanner.result;
        // The dialog can close between decoding and here; punching a scan the
        // employee cancelled is worse than dropping it.
        if (!cancelled) onScannedRef.current(code);
      } catch (err) {
        if (cancelled) return;
        setStarting(false);
        setCameraError(
          err instanceof ScanUnavailableError ? err.message : 'Could not start the camera.',
        );
      }
    };
    void start();

    return () => {
      cancelled = true;
      scanner?.stop();
    };
  }, [open, videoEl]);

  const blocked = !!cameraError;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Scan the location code</DialogTitle>
        </DialogHeader>

        {blocked ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-canvas px-4 py-8 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white">
              <CameraOff className="h-5 w-5 text-ink-muted" />
            </div>
            <p className="text-sm text-ink">{cameraError}</p>
          </div>
        ) : (
          <div className="relative aspect-square overflow-hidden rounded-xl bg-ink">
            <video ref={setVideoEl} className="h-full w-full object-cover" muted playsInline />

            {/* Corner brackets, so it is obvious where to aim. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-2/3 w-2/3">
                {[
                  'left-0 top-0 border-l-2 border-t-2 rounded-tl-lg',
                  'right-0 top-0 border-r-2 border-t-2 rounded-tr-lg',
                  'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg',
                  'bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg',
                ].map((corner) => (
                  <span key={corner} className={`absolute h-7 w-7 border-white/90 ${corner}`} />
                ))}
              </div>
            </div>

            {(starting || submitting) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/70 px-6 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
                <p className="text-sm font-medium text-white">
                  {submitting ? 'Checking in…' : 'Starting camera…'}
                </p>
                {starting && !submitting && (
                  <p className="text-xs text-white/70">Allow camera access when your phone asks</p>
                )}
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        {!error && !blocked && !starting && (
          <p className="mt-3 text-center text-xs text-ink-muted">
            Point the camera at the QR on the display at your location
          </p>
        )}

        {/* Stacked, not side by side: three buttons in a row are unreadable on
            the phone screen this is used from. */}
        <div className="mt-4 flex flex-col gap-2">
          {blocked && onUseGps && (
            <Button
              onClick={() => {
                onClose();
                onUseGps();
              }}
            >
              <MapPin className="h-4 w-4" /> Use my location instead
            </Button>
          )}
          {blocked && (
            // Clearing the error remounts the video, restarting the camera.
            <Button variant="outline" onClick={() => setCameraError(null)}>
              Try the camera again
            </Button>
          )}
          <Button
            variant={blocked ? 'ghost' : 'outline'}
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
