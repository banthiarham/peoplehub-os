'use client';

/**
 * Uses the browser's own `BarcodeDetector` where it exists and falls back to
 * jsQR elsewhere — iOS Safari, most of the phones this runs on, has no
 * detector. jsQR is imported only on that path, so it costs the bundle nothing.
 */

export type ScanFailure = 'denied' | 'unavailable' | 'insecure';

export class ScanUnavailableError extends Error {
  constructor(readonly reason: ScanFailure) {
    super(
      reason === 'denied'
        ? 'Camera access was blocked — allow the camera and try again, or check in with GPS.'
        : reason === 'insecure'
          ? 'The camera needs a secure connection. Open the portal over https and try again.'
          : 'No camera is available on this device — check in with GPS instead.',
    );
    this.name = 'ScanUnavailableError';
  }
}

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

function nativeDetector(): BarcodeDetectorLike | null {
  const ctor = (
    globalThis as unknown as {
      BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike;
    }
  ).BarcodeDetector;
  if (!ctor) return null;
  try {
    return new ctor({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

export interface QrScanner {
  /** Resolves with the first decoded payload, or never if stopped first. */
  result: Promise<string>;
  stop: () => void;
}

/**
 * The caller owns the `<video>` element so React keeps control of the DOM.
 * `stop()` is safe to call twice: an unmounting dialog and a successful scan
 * race each other.
 */
export async function scanQrCode(video: HTMLVideoElement): Promise<QrScanner> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    // Absent on insecure origins as well as on devices with no camera, and the
    // two need different advice.
    throw new ScanUnavailableError(
      typeof window !== 'undefined' && !window.isSecureContext ? 'insecure' : 'unavailable',
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
  } catch (error) {
    const name = (error as { name?: string }).name;
    throw new ScanUnavailableError(
      name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable',
    );
  }

  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  await video.play().catch(() => undefined);

  let stopped = false;
  let frame = 0;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };

  const result = new Promise<string>((resolve) => {
    const detector = nativeDetector();
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    let decodeFallback: typeof import('jsqr').default | null = null;

    const tick = async () => {
      if (stopped) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        try {
          if (detector) {
            const [found] = await detector.detect(video);
            if (found?.rawValue) return resolve(found.rawValue);
          } else if (context) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            decodeFallback ??= (await import('jsqr')).default;
            const found = decodeFallback(image.data, image.width, image.height);
            if (found?.data) return resolve(found.data);
          }
        } catch {
          // A frame that fails to decode is ordinary — keep sampling.
        }
      }
      if (!stopped) frame = requestAnimationFrame(() => void tick());
    };
    frame = requestAnimationFrame(() => void tick());
  });

  return { result, stop };
}
