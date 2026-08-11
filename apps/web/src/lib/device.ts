const DEVICE_ID_KEY = 'peoplehub.deviceId';

/**
 * Thrown when no usable device id can be produced — the browser offers no
 * cryptographic randomness (an insecure origin, or a browser too old for
 * either API), or there is no browser at all. Failing loudly is the point:
 * see `secureUuid` and `requireDeviceId`.
 */
export class DeviceIdUnavailableError extends Error {
  constructor() {
    super(
      'Could not identify this device for attendance. Open the portal directly over https and try again, or ask HR for help.',
    );
    this.name = 'DeviceIdUnavailableError';
  }
}

/**
 * Holds a securely generated id for the rest of the page session when
 * localStorage cannot keep it. Without this, a browser whose storage rejects
 * writes mints a brand new id on *every* call, so the id a punch presents
 * differs from the one bound minutes earlier and every punch is refused.
 */
let memoryId: string | null = null;

function readStored(): string | null {
  try {
    return window.localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string): void {
  try {
    window.localStorage.setItem(DEVICE_ID_KEY, id);
  } catch {
    // Storage is blocked or full. The id still stands for this page session;
    // `memoryId` is what keeps it stable.
  }
}

/**
 * A v4 UUID built from cryptographic randomness only.
 *
 * The device id participates in attendance enforcement — it is what binds a
 * punch to one browser — so a guessable id is worse than no id at all. There
 * is deliberately no `Math.random` fallback: where neither `crypto.randomUUID`
 * (absent on insecure origins and iOS Safari before 15.4) nor
 * `crypto.getRandomValues` exists, this throws rather than hand back a weak
 * identifier that would look valid to the server.
 */
function secureUuid(): string {
  const source = typeof crypto !== 'undefined' ? crypto : undefined;
  if (typeof source?.randomUUID === 'function') return source.randomUUID();
  if (typeof source?.getRandomValues === 'function') {
    const bytes = source.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new DeviceIdUnavailableError();
}

/**
 * Per-browser device identifier. Generated once and persisted; the API binds it
 * to the employee on their first punch, after which punches presenting any
 * other id are rejected until HR resets the binding.
 *
 * Resolved in order: the id already in localStorage, then the one retained in
 * memory for this page session, then a newly generated one. Every storage
 * access is guarded, so a browser that blocks or rejects storage still punches
 * with one consistent id for the session instead of a new id per call.
 *
 * Note what this identifies: a *storage bucket*, not a phone. A cleared store,
 * a private window, another browser, an in-app WebView and an installed PWA
 * each present a different id from the same physical device.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';

  const stored = readStored();
  if (stored) {
    memoryId = stored;
    return stored;
  }

  if (memoryId) {
    // Storage may have recovered since it was minted; persisting costs nothing
    // and turns the next call back into a plain stored read.
    writeStored(memoryId);
    return memoryId;
  }

  const generated = secureUuid();
  memoryId = generated;
  writeStored(generated);
  return generated;
}

/**
 * The device id for a punch.
 *
 * `getDeviceId` is safe to call while rendering and returns an empty string
 * where there is no browser, which a server-rendered pass hits. A punch must
 * never carry that empty value: the API would reject it as a validation error
 * that tells the employee nothing about what went wrong, and it would bind
 * nothing. Punch paths call this; render-time reads call `getDeviceId`.
 */
export function requireDeviceId(): string {
  const id = getDeviceId();
  if (!id) throw new DeviceIdUnavailableError();
  return id;
}

const CREDENTIAL_DB = 'peoplehub-device';
const CREDENTIAL_STORE = 'credential';
const CREDENTIAL_ID = 'punch-v1';

export interface DeviceCredential {
  /** SPKI public key, base64 — what the server registers and verifies against. */
  publicKey: string;
  /**
   * Generated non-extractable, so signing is the only thing anyone — script,
   * devtools, or the employee — can do with it. This is what the device id on
   * its own could never be: a proof that cannot be copied to a second phone.
   */
  privateKey: CryptoKey;
}

function toBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function toBase64Url(buffer: ArrayBuffer): string {
  return toBase64(buffer).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Every step below resolves rather than rejects when the browser refuses.
 * A device that cannot hold a key still punches — unsigned, exactly as it did
 * before key binding shipped — instead of being locked out by a storage quirk.
 */
function openCredentialStore(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(CREDENTIAL_DB, 1);
    } catch {
      return resolve(null);
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CREDENTIAL_STORE)) {
        request.result.createObjectStore(CREDENTIAL_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function readCredential(db: IDBDatabase): Promise<DeviceCredential | null> {
  return new Promise((resolve) => {
    try {
      const request = db.transaction(CREDENTIAL_STORE, 'readonly').objectStore(CREDENTIAL_STORE).get(CREDENTIAL_ID);
      request.onsuccess = () => resolve((request.result as DeviceCredential) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function writeCredential(db: IDBDatabase, credential: DeviceCredential): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = db.transaction(CREDENTIAL_STORE, 'readwrite').objectStore(CREDENTIAL_STORE).put(credential, CREDENTIAL_ID);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function loadOrCreateCredential(): Promise<DeviceCredential | null> {
  if (typeof indexedDB === 'undefined' || !globalThis.crypto?.subtle) return null;
  const db = await openCredentialStore();
  if (!db) return null;

  const stored = await readCredential(db);
  if (stored?.privateKey && typeof stored.publicKey === 'string') return stored;

  // `extractable: false` applies to the private key; the public half of a
  // generated pair is always exportable, which is the half the server needs.
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ]);
  const credential: DeviceCredential = {
    publicKey: toBase64(await crypto.subtle.exportKey('spki', pair.publicKey)),
    privateKey: pair.privateKey,
  };
  await writeCredential(db, credential);
  // Best effort: reduces the chance the browser evicts the key under storage
  // pressure and forces the employee through a device replacement.
  try {
    void navigator.storage?.persist?.();
  } catch {
    // Unsupported or blocked; the credential still stands.
  }
  return credential;
}

let credentialPromise: Promise<DeviceCredential | null> | null = null;

/**
 * This device's punch credential, generated once and reused. Concurrent callers
 * share one generation, so a check-in and a challenge fetch racing on first use
 * cannot mint two key pairs and register the wrong one.
 */
export function getDeviceCredential(): Promise<DeviceCredential | null> {
  credentialPromise ??= loadOrCreateCredential()
    .catch(() => null)
    .then((result) => {
      // A transient failure must not stick for the rest of the page session.
      if (!result) credentialPromise = null;
      return result;
    });
  return credentialPromise;
}

/** Signs a server challenge, or null when this device holds no credential. */
export async function signDeviceChallenge(challenge: string): Promise<string | null> {
  const credential = await getDeviceCredential();
  if (!credential) return null;
  try {
    return toBase64Url(
      await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        credential.privateKey,
        new TextEncoder().encode(challenge),
      ),
    );
  } catch {
    return null;
  }
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
