/**
 * The device id is what binds a punch to one browser, so how it survives — or
 * fails to survive — a hostile localStorage is attendance behaviour, not a
 * detail. Each test loads a fresh copy of the module because the id retained
 * for a page session lives in module state.
 */
type DeviceModule = typeof import('./device');

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A localStorage double whose read and write can each be made to throw. */
function storage(options: { read?: 'throw'; write?: 'throw'; seed?: string } = {}) {
  const map = new Map<string, string>();
  if (options.seed) map.set('peoplehub.deviceId', options.seed);
  return {
    map,
    getItem: jest.fn((key: string) => {
      if (options.read === 'throw') throw new Error('storage blocked');
      return map.get(key) ?? null;
    }),
    setItem: jest.fn((key: string, value: string) => {
      if (options.write === 'throw') throw new Error('quota exceeded');
      map.set(key, value);
    }),
  };
}

/**
 * A fresh page session against one storage bucket. A new module registry is
 * what a real reload — or a different browser, profile or PWA — actually gives.
 */
function loadDevice(localStorage: unknown): DeviceModule {
  (globalThis as Record<string, unknown>).window = { localStorage };
  let mod!: DeviceModule;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('./device') as DeviceModule;
  });
  return mod;
}

describe('getDeviceId', () => {
  const realCrypto = globalThis.crypto;

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
    jest.restoreAllMocks();
  });

  describe('resolution order', () => {
    it('returns the stored id without rewriting it', () => {
      const store = storage({ seed: 'stored-id' });
      const device = loadDevice(store);

      expect(device.getDeviceId()).toBe('stored-id');
      expect(store.setItem).not.toHaveBeenCalled();
    });

    it('lets the stored id win over one already retained in memory', () => {
      // Generated while storage was down, then storage comes back holding a
      // different id — the persisted one is the binding, so it wins.
      const device = loadDevice(storage({ write: 'throw' }));
      const generated = device.getDeviceId();

      (globalThis as Record<string, unknown>).window = {
        localStorage: storage({ seed: 'stored-id' }),
      };

      expect(device.getDeviceId()).toBe('stored-id');
      expect(device.getDeviceId()).not.toBe(generated);
    });

    it('falls back to the in-memory id before generating a new one', () => {
      const device = loadDevice(storage({ write: 'throw' }));

      const first = device.getDeviceId();
      const second = device.getDeviceId();

      expect(second).toBe(first);
    });

    it('persists a generated id so the next call is a plain stored read', () => {
      const store = storage();
      const device = loadDevice(store);

      const generated = device.getDeviceId();

      expect(generated).toMatch(UUID_V4);
      expect(store.map.get('peoplehub.deviceId')).toBe(generated);
      expect(device.getDeviceId()).toBe(generated);
    });
  });

  describe('hostile storage', () => {
    it('keeps one id for the whole page session when writes fail', () => {
      const device = loadDevice(storage({ write: 'throw' }));

      const ids = [device.getDeviceId(), device.getDeviceId(), device.getDeviceId()];

      // The bug this guards: a new id per call means the id a punch presents
      // never matches the one bound minutes earlier, and every punch is refused.
      expect(new Set(ids).size).toBe(1);
      expect(ids[0]).toMatch(UUID_V4);
    });

    it('keeps one id for the whole page session when reads throw', () => {
      const device = loadDevice(storage({ read: 'throw' }));

      const ids = [device.getDeviceId(), device.getDeviceId(), device.getDeviceId()];

      expect(new Set(ids).size).toBe(1);
      expect(ids[0]).toMatch(UUID_V4);
    });

    it('survives reads and writes both throwing', () => {
      const device = loadDevice(storage({ read: 'throw', write: 'throw' }));

      const ids = [device.getDeviceId(), device.getDeviceId()];

      expect(new Set(ids).size).toBe(1);
      expect(ids[0]).toMatch(UUID_V4);
    });

    it('heals storage on a later call once it starts accepting writes', () => {
      const device = loadDevice(storage({ write: 'throw' }));
      const generated = device.getDeviceId();

      const healthy = storage();
      (globalThis as Record<string, unknown>).window = { localStorage: healthy };

      expect(device.getDeviceId()).toBe(generated);
      expect(healthy.map.get('peoplehub.deviceId')).toBe(generated);
    });

    it('returns an empty id when there is no window at all', () => {
      // Render-safe: a server-rendered pass reads this without throwing.
      const device = loadDevice(storage());
      delete (globalThis as Record<string, unknown>).window;

      expect(device.getDeviceId()).toBe('');
    });
  });

  describe('secure generation only', () => {
    /**
     * Counts `Math.random` calls made by `run` alone. Jest's own machinery
     * calls it constantly, so a bare `not.toHaveBeenCalled()` on a global spy
     * measures the test runner rather than the module.
     */
    function randomCallsDuring(run: () => void): { calls: number; thrown: unknown } {
      const spy = jest.spyOn(Math, 'random');
      const before = spy.mock.calls.length;
      let thrown: unknown;
      try {
        run();
      } catch (error) {
        thrown = error;
      }
      return { calls: spy.mock.calls.length - before, thrown };
    }

    it('builds a v4 uuid from getRandomValues when randomUUID is missing', () => {
      // iOS Safari before 15.4, and every insecure origin.
      Object.defineProperty(globalThis, 'crypto', {
        value: { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) },
        configurable: true,
      });
      const device = loadDevice(storage());
      let id = '';

      const { calls, thrown } = randomCallsDuring(() => {
        id = device.getDeviceId();
      });

      expect(thrown).toBeUndefined();
      expect(id).toMatch(UUID_V4);
      expect(calls).toBe(0);
    });

    it('throws instead of generating a weak id when no secure randomness exists', () => {
      Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
      const store = storage();
      const device = loadDevice(store);

      // A guessable device id is worse than none: it would look valid to the
      // server and bind the employee to something anyone could forge.
      const { calls, thrown } = randomCallsDuring(() => device.getDeviceId());

      expect(thrown).toBeInstanceOf(device.DeviceIdUnavailableError);
      expect(calls).toBe(0);
      expect(store.setItem).not.toHaveBeenCalled();
    });

    it('never calls Math.random anywhere in the module source', () => {
      // Belt and braces: the tests above cover the paths that exist today, this
      // catches a weak fallback being introduced on a path they do not reach.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const source = require('fs').readFileSync(require.resolve('./device'), 'utf8');

      expect(source).not.toMatch(/Math\s*\.\s*random\s*\(/);
    });
  });
});

describe('requireDeviceId', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    jest.restoreAllMocks();
  });

  it('returns the resolved id in a browser', () => {
    const device = loadDevice(storage({ seed: 'stored-id' }));

    expect(device.requireDeviceId()).toBe('stored-id');
  });

  it('returns a generated id when storage is empty', () => {
    const device = loadDevice(storage());

    expect(device.requireDeviceId()).toMatch(UUID_V4);
  });

  it('refuses to hand a punch the empty server-rendered placeholder', () => {
    // A punch carrying '' would be refused by the API as a validation error
    // that tells the employee nothing, and would bind nothing.
    const device = loadDevice(storage());
    delete (globalThis as Record<string, unknown>).window;

    expect(() => device.requireDeviceId()).toThrow(device.DeviceIdUnavailableError);
  });

  it('propagates the same error when no secure randomness exists', () => {
    const realCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
    try {
      const device = loadDevice(storage());
      expect(() => device.requireDeviceId()).toThrow(device.DeviceIdUnavailableError);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
    }
  });
});

/**
 * What the id actually identifies. Each bucket below is an independent
 * localStorage, which is exactly what a cleared store, a private window,
 * another browser, an in-app WebView and an installed PWA each present — from
 * one unchanged physical device. The server rule is a strict equality on the
 * bound id, so any of them is refused.
 */
describe('the id identifies a storage bucket, not a device', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    jest.restoreAllMocks();
  });

  it.each([
    ['a cleared store', () => storage()],
    ['a private window', () => storage()],
    ['another browser on the same phone', () => storage()],
    ['an installed PWA beside the browser tab', () => storage()],
    ['an in-app WebView', () => storage()],
  ])('presents a different id from %s', (_label, secondBucket) => {
    const bound = loadDevice(storage()).getDeviceId();

    const presented = loadDevice(secondBucket()).getDeviceId();

    expect(presented).not.toBe(bound);
  });

  it('presents a different id after a reload when writes never landed', () => {
    // Nothing was ever persisted, so the next page session cannot recover it.
    const store = storage({ write: 'throw' });
    const bound = loadDevice(store).getDeviceId();

    const presented = loadDevice(store).getDeviceId();

    expect(presented).not.toBe(bound);
  });

  it('presents the same id across reloads when storage works', () => {
    // The control: the binding only holds while one bucket survives.
    const store = storage();
    const bound = loadDevice(store).getDeviceId();

    expect(loadDevice(store).getDeviceId()).toBe(bound);
  });
});

/**
 * The signing credential. `deviceId` proves only that someone knows a string;
 * the credential is what proves the punch came from this device, so what the
 * browser produces has to be exactly what the API can verify — the round trip
 * below signs here and verifies with the server's own primitive.
 */
describe('device credential', () => {
  const realCrypto = globalThis.crypto;

  /** Minimal in-memory IndexedDB: open, one store, get and put. */
  function fakeIndexedDB(options: { open?: 'fail'; write?: 'fail' } = {}) {
    const data = new Map<string, unknown>();
    let created = false;

    const request = <T>(produce: () => T) => {
      const req: Record<string, any> = { onsuccess: null, onerror: null };
      queueMicrotask(() => {
        try {
          req.result = produce();
          req.onsuccess?.();
        } catch {
          req.onerror?.();
        }
      });
      return req;
    };

    const store = {
      get: (key: string) => request(() => data.get(key)),
      put: (value: unknown, key: string) =>
        request(() => {
          if (options.write === 'fail') throw new Error('quota exceeded');
          data.set(key, value);
        }),
    };
    const db = {
      objectStoreNames: { contains: () => created },
      createObjectStore: () => {
        created = true;
        return store;
      },
      transaction: () => ({ objectStore: () => store }),
    };

    return {
      data,
      open: jest.fn(() => {
        const req: Record<string, any> = {
          result: db,
          onupgradeneeded: null,
          onsuccess: null,
          onerror: null,
          onblocked: null,
        };
        queueMicrotask(() => {
          if (options.open === 'fail') return req.onerror?.();
          if (!created) req.onupgradeneeded?.();
          req.onsuccess?.();
        });
        return req;
      }),
    };
  }

  function withIndexedDB(db: unknown): void {
    (globalThis as Record<string, unknown>).indexedDB = db;
  }

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).indexedDB;
    Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
    jest.restoreAllMocks();
  });

  it('generates one credential and reuses it for the page session', async () => {
    const idb = fakeIndexedDB();
    withIndexedDB(idb);
    const device = loadDevice(storage());

    const [first, second] = await Promise.all([
      device.getDeviceCredential(),
      device.getDeviceCredential(),
    ]);

    // Concurrent first callers must share one generation, or the key that gets
    // registered is not the key the next punch signs with.
    expect(first?.publicKey).toBe(second?.publicKey);
    expect(idb.open).toHaveBeenCalledTimes(1);
  });

  it('recovers the same credential after a reload', async () => {
    const idb = fakeIndexedDB();
    withIndexedDB(idb);

    const bound = await loadDevice(storage()).getDeviceCredential();
    const presented = await loadDevice(storage()).getDeviceCredential();

    expect(presented?.publicKey).toBe(bound?.publicKey);
  });

  it('signs a challenge the API can verify against the registered key', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createPublicKey, verify } = require('crypto');
    withIndexedDB(fakeIndexedDB());
    const device = loadDevice(storage());

    const credential = await device.getDeviceCredential();
    const signature = await device.signDeviceChallenge('challenge-1');

    const verified = verify(
      'sha256',
      Buffer.from('challenge-1'),
      {
        key: createPublicKey({
          key: Buffer.from(credential!.publicKey, 'base64'),
          format: 'der',
          type: 'spki',
        }),
        // The encoding mismatch that would silently fail every punch: WebCrypto
        // emits raw r‖s where Node reads DER by default.
        dsaEncoding: 'ieee-p1363',
      },
      Buffer.from(signature!, 'base64url'),
    );
    expect(verified).toBe(true);
  });

  it('holds a private key that cannot be exported', async () => {
    withIndexedDB(fakeIndexedDB());

    const credential = await loadDevice(storage()).getDeviceCredential();

    // The whole point of the credential over the id: copying it to a second
    // phone has to be impossible, not merely inconvenient.
    await expect(crypto.subtle.exportKey('pkcs8', credential!.privateKey)).rejects.toThrow();
  });

  it('punches on without a credential when the store cannot be opened', async () => {
    withIndexedDB(fakeIndexedDB({ open: 'fail' }));
    const device = loadDevice(storage());

    await expect(device.getDeviceCredential()).resolves.toBeNull();
    await expect(device.signDeviceChallenge('challenge-1')).resolves.toBeNull();
    // The binding still works the way it did before keys existed.
    expect(device.getDeviceId()).toMatch(UUID_V4);
  });

  it('punches on where the browser has no IndexedDB at all', async () => {
    const device = loadDevice(storage());

    await expect(device.getDeviceCredential()).resolves.toBeNull();
    expect(device.getDeviceId()).toMatch(UUID_V4);
  });

  it('retries generation after a failed attempt instead of giving up for the session', async () => {
    withIndexedDB(fakeIndexedDB({ open: 'fail' }));
    const device = loadDevice(storage());
    await device.getDeviceCredential();

    withIndexedDB(fakeIndexedDB());

    expect(await device.getDeviceCredential()).not.toBeNull();
  });
});
