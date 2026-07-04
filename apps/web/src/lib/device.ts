const DEVICE_ID_KEY = 'peoplehub.deviceId';

/**
 * Stable per-browser device identifier. Generated once and persisted; the API
 * binds it to the employee on their first punch, after which punches from any
 * other device are rejected until HR resets the binding.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getDeviceInfo(): { deviceName: string; platform: string } {
  if (typeof navigator === 'undefined') return { deviceName: 'Unknown', platform: 'Unknown' };
  const ua = navigator.userAgent;
  const platform = /android/i.test(ua)
    ? 'Android'
    : /iphone|ipad|ipod/i.test(ua)
      ? 'iOS'
      : /mac/i.test(ua)
        ? 'macOS'
        : /windows/i.test(ua)
          ? 'Windows'
          : /linux/i.test(ua)
            ? 'Linux'
            : 'Unknown';
  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /chrome|crios/i.test(ua)
      ? 'Chrome'
      : /firefox|fxios/i.test(ua)
        ? 'Firefox'
        : /safari/i.test(ua)
          ? 'Safari'
          : 'Browser';
  return { deviceName: `${browser} on ${platform}`, platform };
}
