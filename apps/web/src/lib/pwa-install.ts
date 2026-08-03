/**
 * Helpers behind the "Install VioHr" banner.
 *
 * Everything here is framework-free and side-effect-free so it stays covered by the
 * node-environment Jest setup (see jest.config.js — there is no jsdom). The React
 * wiring lives in components/pwa/use-install-prompt.ts.
 */

/** Matches the `peoplehub.*` localStorage convention used by lib/device.ts. */
export const INSTALL_DISMISSED_KEY = 'peoplehub.pwa.installDismissedAt';

/**
 * "Not now" hides the banner for two weeks rather than forever: the install entry in
 * the profile menu stays available the whole time, so a dismissal never has to be
 * permanent to avoid being annoying.
 */
export const DISMISSAL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * `beforeinstallprompt` is not in TypeScript's DOM lib because it is not a standard —
 * only Chromium ships it.
 */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export interface ManualInstallInstructions {
  title: string;
  steps: string[];
}

/**
 * True when the app is already running as an installed PWA, in which case there is
 * nothing left to install. `navigator.standalone` is the iOS-only equivalent of the
 * `display-mode` media query, which WebKit did not support until relatively recently.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const displayMode =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayMode || iosStandalone;
}

/**
 * Whether a previous "Not now" should still be suppressing the banner.
 *
 * A stored timestamp in the future (clock skew, or a hand-edited value) counts as
 * expired rather than active: failing open means the banner reappears, which is
 * recoverable, whereas failing closed could hide the install option indefinitely.
 */
export function isDismissalActive(stored: string | null | undefined, now: number): boolean {
  if (!stored) return false;
  const dismissedAt = Number(stored);
  if (!Number.isFinite(dismissedAt)) return false;
  const elapsed = now - dismissedAt;
  return elapsed >= 0 && elapsed < DISMISSAL_WINDOW_MS;
}

/**
 * Manual steps for browsers that can install a PWA but expose no API to trigger it.
 *
 * Returns null when the browser fires `beforeinstallprompt` (all Chromium browsers —
 * they get the real prompt instead) and also when the browser cannot install at all
 * (desktop Firefox), where instructions would only be noise.
 *
 * This deliberately does its own user-agent parsing rather than reusing
 * lib/device.ts: installability needs distinctions that attendance device-binding
 * does not, most importantly that *every* iOS browser is WebKit underneath and so
 * every one of them installs through the Share sheet.
 */
export function manualInstallInstructions(
  userAgent: string,
  maxTouchPoints = 0,
): ManualInstallInstructions | null {
  const ua = userAgent ?? '';
  const isMac = /macintosh/i.test(ua);
  // iPadOS 13+ reports a desktop macOS user agent by default, so the only way to tell
  // an iPad from a Mac is the touch capability. Getting this wrong would show Mac
  // "Add to Dock" steps to iPad users, who have no Dock and no File menu.
  const isIpadInDesktopMode = isMac && maxTouchPoints > 1;
  const isIos = /iphone|ipad|ipod/i.test(ua) || isIpadInDesktopMode;
  const isAndroid = /android/i.test(ua);
  // `crios`/`fxios` are Chrome and Firefox on iOS, both WebKit shells.
  const isChromium = /edg\/|edga\/|edgios\/|chrome\/|crios\/|chromium\/|opr\/|samsungbrowser/i.test(ua);
  const isFirefox = /firefox\/|fxios\//i.test(ua);

  if (isIos) {
    return {
      title: 'Add VioHr to your Home Screen',
      steps: [
        'Tap the Share button in the browser toolbar.',
        'Scroll down and choose "Add to Home Screen".',
        'Tap "Add" to confirm.',
      ],
    };
  }

  if (isAndroid && isFirefox) {
    return {
      title: 'Install VioHr from the browser menu',
      steps: ['Open the browser menu (⋮).', 'Choose "Install" or "Add to Home screen".'],
    };
  }

  // Desktop Safari (Safari 17+ on macOS). Chromium UAs also contain "safari", so they
  // have to be excluded first — that is what the isChromium guard above is for.
  if (!isChromium && !isFirefox && /safari\//i.test(ua) && isMac) {
    return {
      title: 'Add VioHr to your Dock',
      steps: ['Open the File menu.', 'Choose "Add to Dock".', 'Confirm the name and click "Add".'],
    };
  }

  return null;
}
