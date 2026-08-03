'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  INSTALL_DISMISSED_KEY,
  isDismissalActive,
  isStandalone,
  manualInstallInstructions,
  type BeforeInstallPromptEvent,
  type ManualInstallInstructions,
} from '@/lib/pwa-install';

export interface InstallPrompt {
  /** Installable by any route — native prompt or documented manual steps. Ignores dismissal. */
  canInstall: boolean;
  /** `canInstall` and the user has not dismissed the banner recently. */
  isBannerVisible: boolean;
  /** True when the browser handed us a real `beforeinstallprompt` to replay. */
  hasNativePrompt: boolean;
  manualInstructions: ManualInstallInstructions | null;
  promptInstall: () => Promise<void>;
  dismiss: () => void;
}

function readDismissal(): boolean {
  try {
    return isDismissalActive(window.localStorage.getItem(INSTALL_DISMISSED_KEY), Date.now());
  } catch {
    // Safari private mode throws on localStorage access. Treat it as "not dismissed".
    return false;
  }
}

function writeDismissal(): void {
  try {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
  } catch {
    // Dismissal is a convenience, not correctness — losing it is acceptable.
  }
}

/**
 * Tracks whether VioHr can be installed and how.
 *
 * All state starts false so the server render and the first client render agree; the
 * effect below fills it in after mount.
 */
export function useInstallPrompt(): InstallPrompt {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [manualInstructions, setManualInstructions] = useState<ManualInstallInstructions | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Already installed and running standalone — there is nothing to offer.
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    setDismissed(readDismissal());
    // Returns null on Chromium, which fires the event below instead, so there is no
    // race between showing manual steps and receiving the real prompt.
    setManualInstructions(
      manualInstallInstructions(window.navigator.userAgent, window.navigator.maxTouchPoints),
    );

    const onBeforeInstallPrompt = (event: Event) => {
      // Suppress Chrome's own mini-infobar so the in-app banner is the single entry point.
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    writeDismissal();
    setDismissed(true);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'dismissed') {
        // Declining the browser's own dialog is a "not now" too — without recording it,
        // the banner would return on the next full page load.
        dismiss();
      }
      // On 'accepted' the browser fires `appinstalled`, which clears the banner.
    } catch {
      // `prompt()` throws if the event has already been replayed. That happens when two
      // mounted instances of this hook share one event and the other one used it first;
      // dropping the stale event below is the whole recovery.
    }
    // The event is single-use either way. Chrome hands us a fresh one on a later visit
    // if VioHr is still not installed.
    setDeferredPrompt(null);
  }, [deferredPrompt, dismiss]);

  const canInstall = !installed && (Boolean(deferredPrompt) || Boolean(manualInstructions));

  return {
    canInstall,
    isBannerVisible: canInstall && !dismissed,
    hasNativePrompt: Boolean(deferredPrompt),
    manualInstructions,
    promptInstall,
    dismiss,
  };
}
