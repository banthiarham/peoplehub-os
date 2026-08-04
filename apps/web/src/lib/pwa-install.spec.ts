import {
  DISMISSAL_WINDOW_MS,
  isDismissalActive,
  isStandalone,
  manualInstallInstructions,
} from './pwa-install';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  ipadDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  desktopEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  desktopFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
};

describe('isDismissalActive', () => {
  const now = 1_700_000_000_000;

  it('suppresses the banner inside the dismissal window and releases it after', () => {
    expect(isDismissalActive(String(now), now)).toBe(true);
    // One millisecond short of the window, then exactly on the boundary.
    expect(isDismissalActive(String(now - DISMISSAL_WINDOW_MS + 1), now)).toBe(true);
    expect(isDismissalActive(String(now - DISMISSAL_WINDOW_MS), now)).toBe(false);
    expect(isDismissalActive(String(now - DISMISSAL_WINDOW_MS - 1), now)).toBe(false);
  });

  it('shows the banner when nothing was ever stored', () => {
    expect(isDismissalActive(null, now)).toBe(false);
    expect(isDismissalActive(undefined, now)).toBe(false);
    expect(isDismissalActive('', now)).toBe(false);
  });

  it('fails open on unusable stored values', () => {
    // A corrupt or future-dated key must never be able to hide the install option
    // permanently — a reappearing banner is the recoverable failure.
    expect(isDismissalActive('not-a-timestamp', now)).toBe(false);
    expect(isDismissalActive('NaN', now)).toBe(false);
    expect(isDismissalActive(String(now + 60_000), now)).toBe(false);
  });
});

describe('manualInstallInstructions', () => {
  it('returns nothing for Chromium browsers, which get the native prompt instead', () => {
    expect(manualInstallInstructions(UA.desktopChrome)).toBeNull();
    expect(manualInstallInstructions(UA.desktopEdge)).toBeNull();
    expect(manualInstallInstructions(UA.androidChrome)).toBeNull();
  });

  it('returns nothing for desktop Firefox, which cannot install a PWA at all', () => {
    expect(manualInstallInstructions(UA.desktopFirefox)).toBeNull();
  });

  it('sends every iOS browser through the Share sheet', () => {
    // Chrome on iOS is a WebKit shell, so it installs exactly like Safari does.
    for (const ua of [UA.iphoneSafari, UA.iphoneChrome]) {
      const instructions = manualInstallInstructions(ua);
      expect(instructions?.title).toBe('Add VioHr to your Home Screen');
      expect(instructions?.steps.join(' ')).toContain('Add to Home Screen');
    }
  });

  it('tells an iPad apart from a Mac by touch points, not user agent', () => {
    // iPadOS 13+ sends a desktop macOS user agent, so these two strings are identical.
    expect(manualInstallInstructions(UA.macSafari, 0)?.title).toBe('Add VioHr to your Dock');
    expect(manualInstallInstructions(UA.ipadDesktopMode, 5)?.title).toBe(
      'Add VioHr to your Home Screen',
    );
  });

  it('points Firefox on Android at its browser menu', () => {
    expect(manualInstallInstructions(UA.androidFirefox)?.title).toBe(
      'Install VioHr from the browser menu',
    );
  });

  it('points desktop Safari at Add to Dock', () => {
    const instructions = manualInstallInstructions(UA.macSafari);
    expect(instructions?.steps.join(' ')).toContain('Add to Dock');
  });
});

describe('isStandalone', () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = originalWindow;
  });

  const stubWindow = (options: { displayMode?: boolean; iosStandalone?: boolean }) => {
    (globalThis as { window?: unknown }).window = {
      matchMedia: (query: string) => ({
        matches: query === '(display-mode: standalone)' && options.displayMode === true,
      }),
      navigator: { standalone: options.iosStandalone },
    };
  };

  it('is false during server rendering, where there is no window', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(isStandalone()).toBe(false);
  });

  it('detects an installed app through the display-mode media query', () => {
    stubWindow({ displayMode: true });
    expect(isStandalone()).toBe(true);
  });

  it('falls back to the iOS-only navigator.standalone flag', () => {
    stubWindow({ displayMode: false, iosStandalone: true });
    expect(isStandalone()).toBe(true);
  });

  it('is false in a normal browser tab', () => {
    stubWindow({ displayMode: false, iosStandalone: false });
    expect(isStandalone()).toBe(false);
  });
});
