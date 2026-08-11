/**
 * The punch device binding is an enforcement boundary, so what it accepts and
 * refuses is behaviour, not detail. The signatures here are produced with Node's
 * own EC signer in `ieee-p1363` encoding, which is byte-for-byte what WebCrypto
 * hands the browser client — a test that signed in DER would pass against a
 * server no real browser could talk to.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync, sign } from 'crypto';
import { DeviceBindingService, REPLACEMENT_WINDOW_MS } from './device-binding.service';

const TENANT = 'tenant-1';
const EMPLOYEE = 'emp-1';
/** The only actor that exists as a `users` row, for the audit foreign key. */
const KNOWN_USER = 'user-hr';

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    spki: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    signChallenge: (challenge: string) =>
      sign('sha256', Buffer.from(challenge), {
        key: privateKey,
        dsaEncoding: 'ieee-p1363',
      }).toString('base64url'),
  };
}

/** In-memory `employee_devices`, keyed the two ways the service looks rows up. */
function deviceTable(seed: Array<Record<string, any>> = []) {
  const rows = new Map<string, Record<string, any>>();
  for (const row of seed) rows.set(row.employeeId, { id: `dev-${row.employeeId}`, ...row });
  const auditRows: Array<Record<string, any>> = [];

  /**
   * `@@unique([tenantId, deviceId])`, enforced. A double that let two rows hold
   * one device id would accept writes Postgres rejects, and the handover path
   * below is exactly where that gap hides.
   */
  const assertDeviceIdFree = (tenantId: string, deviceId: string, employeeId: string) => {
    const clash = [...rows.values()].find(
      (row) =>
        row.tenantId === tenantId && row.deviceId === deviceId && row.employeeId !== employeeId,
    );
    if (clash) {
      throw new Error(
        `Unique constraint failed on the fields: (tenantId, deviceId) — held by ${clash.employeeId}`,
      );
    }
  };

  return {
    rows,
    auditRows,
    employeeDevice: {
      findUnique: jest.fn(({ where }: { where: Record<string, any> }) => {
        if (where.employeeId) return Promise.resolve(rows.get(where.employeeId) ?? null);
        const { tenantId, deviceId } = where.tenantId_deviceId ?? {};
        return Promise.resolve(
          [...rows.values()].find(
            (row) => row.tenantId === tenantId && row.deviceId === deviceId,
          ) ?? null,
        );
      }),
      create: jest.fn(({ data }: { data: Record<string, any> }) => {
        assertDeviceIdFree(data.tenantId, data.deviceId, data.employeeId);
        const row = {
          id: `dev-${data.employeeId}`,
          bindingVersion: 1,
          registeredAt: new Date(),
          lastSeenAt: new Date(),
          publicKey: null,
          replacementAllowedUntil: null,
          ...data,
        };
        rows.set(data.employeeId, row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }: { where: any; data: any }) => {
        const existing = rows.get(where.employeeId);
        if (data.deviceId) {
          assertDeviceIdFree(existing?.tenantId, data.deviceId, where.employeeId);
        }
        const row = { ...existing, ...data };
        rows.set(where.employeeId, row);
        return Promise.resolve(row);
      }),
      delete: jest.fn(({ where }: { where: any }) => {
        const row = rows.get(where.employeeId);
        rows.delete(where.employeeId);
        return Promise.resolve(row);
      }),
    },
    auditLog: {
      create: jest.fn(({ data }: { data: Record<string, any> }) => {
        // `actorId` is a foreign key to users. A non-user actor — an API key
        // authenticates as `api-key:<id>` — has to arrive as null or Postgres
        // rejects the write and the reset 500s.
        if (data.actorId && data.actorId !== KNOWN_USER) {
          throw new Error('Foreign key constraint violated: `audit_logs_actorId_fkey (index)`');
        }
        auditRows.push(data);
        return Promise.resolve(data);
      }),
    },
    user: {
      findUnique: jest.fn(({ where }: { where: any }) =>
        Promise.resolve(where.id === KNOWN_USER ? { id: KNOWN_USER } : null),
      ),
    },
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
}

function newService(prisma: ReturnType<typeof deviceTable>, options?: { enforce?: boolean }) {
  process.env.ATTENDANCE_REQUIRE_SIGNED_DEVICE = options?.enforce ? 'true' : 'false';
  return new DeviceBindingService(prisma as never, new ConfigService());
}

/** A row as it exists for everyone registered before key binding shipped. */
function legacyRow(extra: Record<string, any> = {}) {
  return {
    tenantId: TENANT,
    employeeId: EMPLOYEE,
    deviceId: 'device-1',
    bindingVersion: 1,
    publicKey: null,
    publicKeyAlg: null,
    challengeNonce: null,
    challengeExpiresAt: null,
    replacementAllowedUntil: null,
    ...extra,
  };
}

afterEach(() => {
  delete process.env.ATTENDANCE_REQUIRE_SIGNED_DEVICE;
  jest.useRealTimers();
});

describe('first punch registration', () => {
  it('binds the device and stores the key it presents', async () => {
    const prisma = deviceTable();
    const key = keypair();

    await newService(prisma).verify(TENANT, EMPLOYEE, {
      deviceId: 'device-1',
      devicePublicKey: key.spki,
    });

    expect(prisma.rows.get(EMPLOYEE)).toMatchObject({
      deviceId: 'device-1',
      publicKey: key.spki,
      bindingVersion: 2,
    });
  });

  it('binds a client that sends no key at all, as version 1', async () => {
    // The rollout window: an older bundle still in a warm tab must keep working.
    const prisma = deviceTable();

    await newService(prisma).verify(TENANT, EMPLOYEE, { deviceId: 'device-1' });

    expect(prisma.rows.get(EMPLOYEE)).toMatchObject({ deviceId: 'device-1', bindingVersion: 1 });
    expect(prisma.rows.get(EMPLOYEE)?.publicKey).toBeNull();
  });

  it('refuses a device already registered to another employee', async () => {
    const prisma = deviceTable([legacyRow()]);

    await expect(
      newService(prisma).verify(TENANT, 'emp-2', { deviceId: 'device-1' }),
    ).rejects.toThrow(/already registered to another employee/i);
  });
});

describe('an already bound device', () => {
  it('refuses a punch from a different device', async () => {
    const prisma = deviceTable([legacyRow()]);

    await expect(
      newService(prisma).verify(TENANT, EMPLOYEE, { deviceId: 'device-2' }),
    ).rejects.toThrow(/not your registered punch device/i);
  });

  it('touches only lastSeenAt for a version 1 row and a version 1 client', async () => {
    // The pre-key write, unchanged. Anything extra here would mean the upgrade
    // is rewriting rows it was supposed to leave alone.
    const prisma = deviceTable([legacyRow()]);

    await newService(prisma).verify(TENANT, EMPLOYEE, { deviceId: 'device-1' });

    expect(prisma.employeeDevice.update).toHaveBeenCalledWith({
      where: { employeeId: EMPLOYEE },
      data: { lastSeenAt: expect.any(Date) },
    });
  });

  it('upgrades a version 1 row in place the first time a key arrives', async () => {
    const prisma = deviceTable([legacyRow()]);
    const key = keypair();

    await newService(prisma).verify(TENANT, EMPLOYEE, {
      deviceId: 'device-1',
      devicePublicKey: key.spki,
    });

    expect(prisma.rows.get(EMPLOYEE)).toMatchObject({
      publicKey: key.spki,
      publicKeyAlg: 'ECDSA-P256',
      bindingVersion: 2,
    });
  });
});

describe('signature enforcement', () => {
  /** A key-bound row holding a live challenge, ready to be punched against. */
  function challenged(key: ReturnType<typeof keypair>, challenge = 'challenge-1') {
    return deviceTable([
      legacyRow({
        bindingVersion: 2,
        publicKey: key.spki,
        publicKeyAlg: 'ECDSA-P256',
        challengeNonce: challenge,
        challengeExpiresAt: new Date(Date.now() + 60_000),
      }),
    ]);
  }

  it('accepts a valid signature and consumes the challenge', async () => {
    const key = keypair();
    const prisma = challenged(key);

    await newService(prisma, { enforce: true }).verify(TENANT, EMPLOYEE, {
      deviceId: 'device-1',
      deviceChallenge: 'challenge-1',
      deviceSignature: key.signChallenge('challenge-1'),
    });

    const row = prisma.rows.get(EMPLOYEE);
    expect(row?.lastVerifiedAt).toBeInstanceOf(Date);
    // Cleared, so replaying the same signature cannot punch twice.
    expect(row?.challengeNonce).toBeNull();
  });

  it('refuses a replay of a consumed challenge', async () => {
    const key = keypair();
    const prisma = challenged(key);
    const service = newService(prisma, { enforce: true });
    const punch = {
      deviceId: 'device-1',
      deviceChallenge: 'challenge-1',
      deviceSignature: key.signChallenge('challenge-1'),
    };

    await service.verify(TENANT, EMPLOYEE, punch);

    await expect(service.verify(TENANT, EMPLOYEE, punch)).rejects.toThrow(ForbiddenException);
  });

  it('refuses a signature made by a different key', async () => {
    // The copied-deviceId attack: the id is right, the device is not.
    const prisma = challenged(keypair());

    await expect(
      newService(prisma, { enforce: true }).verify(TENANT, EMPLOYEE, {
        deviceId: 'device-1',
        deviceChallenge: 'challenge-1',
        deviceSignature: keypair().signChallenge('challenge-1'),
      }),
    ).rejects.toThrow(/could not prove/i);
  });

  it('refuses an expired challenge', async () => {
    const key = keypair();
    const prisma = challenged(key);
    prisma.rows.get(EMPLOYEE)!.challengeExpiresAt = new Date(Date.now() - 1);

    await expect(
      newService(prisma, { enforce: true }).verify(TENANT, EMPLOYEE, {
        deviceId: 'device-1',
        deviceChallenge: 'challenge-1',
        deviceSignature: key.signChallenge('challenge-1'),
      }),
    ).rejects.toThrow(/could not prove/i);
  });

  it('refuses a key-bound device that sends no signature', async () => {
    const prisma = challenged(keypair());

    await expect(
      newService(prisma, { enforce: true }).verify(TENANT, EMPLOYEE, { deviceId: 'device-1' }),
    ).rejects.toThrow(/could not prove/i);
  });

  it('allows the same punch while enforcement is off', async () => {
    // The kill switch: every signature failure has to degrade to the behaviour
    // that shipped before, or a bad rollout locks an office out of punching.
    const prisma = challenged(keypair());

    await expect(
      newService(prisma, { enforce: false }).verify(TENANT, EMPLOYEE, { deviceId: 'device-1' }),
    ).resolves.toBeUndefined();
  });
});

describe('issueChallenge', () => {
  it('stores a single-use nonce for a key-bound device', async () => {
    const prisma = deviceTable([legacyRow({ bindingVersion: 2, publicKey: keypair().spki })]);

    const { challenge, expiresAt } = await newService(prisma).issueChallenge(EMPLOYEE);

    expect(challenge).toEqual(expect.any(String));
    expect(prisma.rows.get(EMPLOYEE)?.challengeNonce).toBe(challenge);
    expect(expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('hands back the live nonce instead of invalidating another tab', async () => {
    // Two tabs arming a check-in at once. Minting a second nonce would leave
    // whichever tab asked first holding a challenge that can no longer verify.
    const key = keypair();
    const prisma = deviceTable([legacyRow({ bindingVersion: 2, publicKey: key.spki })]);
    const service = newService(prisma, { enforce: true });

    const first = await service.issueChallenge(EMPLOYEE);
    const second = await service.issueChallenge(EMPLOYEE);

    expect(second.challenge).toBe(first.challenge);
    expect(second.expiresAt!.getTime()).toBeGreaterThanOrEqual(first.expiresAt!.getTime());
    await expect(
      service.verify(TENANT, EMPLOYEE, {
        deviceId: 'device-1',
        deviceChallenge: first.challenge!,
        deviceSignature: key.signChallenge(first.challenge!),
      }),
    ).resolves.toBeUndefined();
  });

  it('mints a fresh nonce once the live one has expired', async () => {
    const prisma = deviceTable([
      legacyRow({
        bindingVersion: 2,
        publicKey: keypair().spki,
        challengeNonce: 'stale',
        challengeExpiresAt: new Date(Date.now() - 1),
      }),
    ]);

    const { challenge } = await newService(prisma).issueChallenge(EMPLOYEE);

    expect(challenge).not.toBe('stale');
  });

  it('returns no challenge when there is nothing to prove yet', async () => {
    // No device bound, and a device still on `deviceId` alone: in both cases
    // the client punches unsigned rather than being blocked on a nonce.
    const empty = deviceTable();
    const legacy = deviceTable([legacyRow()]);

    await expect(newService(empty).issueChallenge(EMPLOYEE)).resolves.toEqual({
      challenge: null,
      expiresAt: null,
    });
    await expect(newService(legacy).issueChallenge(EMPLOYEE)).resolves.toEqual({
      challenge: null,
      expiresAt: null,
    });
  });
});

describe('device replacement', () => {
  it('opens a bounded window instead of deleting the binding', async () => {
    const prisma = deviceTable([legacyRow()]);

    const result = await newService(prisma).allowReplacement(TENANT, EMPLOYEE, 'user-9');

    expect(result.reset).toBe(true);
    // The row survives, so the punch history and the old device stay readable.
    expect(prisma.rows.get(EMPLOYEE)?.deviceId).toBe('device-1');
    expect(prisma.rows.get(EMPLOYEE)?.replacementAllowedUntil.getTime()).toBeCloseTo(
      Date.now() + REPLACEMENT_WINDOW_MS,
      -3,
    );
    expect(prisma.auditRows[0]).toMatchObject({ action: 'ATTENDANCE_DEVICE_RESET' });
  });

  it('records a real user as the audit actor', async () => {
    const prisma = deviceTable([legacyRow()]);

    await newService(prisma).allowReplacement(TENANT, EMPLOYEE, KNOWN_USER);

    expect(prisma.auditRows[0]).toMatchObject({
      action: 'ATTENDANCE_DEVICE_RESET',
      actorId: KNOWN_USER,
    });
  });

  it('resets for an actor that is not a user row', async () => {
    // `DELETE /attendance/device/:employeeId` carries both @Roles and @Scopes,
    // and RolesGuard lets an API key through on the scope alone — so the actor
    // arrives as `api-key:<id>`, which no users row matches.
    const prisma = deviceTable([legacyRow()]);

    await expect(
      newService(prisma).allowReplacement(TENANT, EMPLOYEE, 'api-key:key-1'),
    ).resolves.toMatchObject({ reset: true });

    expect(prisma.auditRows[0].actorId).toBeNull();
    expect(prisma.auditRows[0].newValue).toMatchObject({ actorUserId: 'api-key:key-1' });
    expect(prisma.rows.get(EMPLOYEE)!.replacementAllowedUntil).toBeInstanceOf(Date);
  });

  it('refuses to reset an employee in another tenant', async () => {
    const prisma = deviceTable([legacyRow({ tenantId: 'tenant-2' })]);

    await expect(newService(prisma).allowReplacement(TENANT, EMPLOYEE)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lets the next device take the row over, and audits the swap', async () => {
    const prisma = deviceTable([legacyRow()]);
    const service = newService(prisma);
    const key = keypair();
    await service.allowReplacement(TENANT, EMPLOYEE);

    await service.verify(TENANT, EMPLOYEE, {
      deviceId: 'device-2',
      devicePublicKey: key.spki,
    });

    expect(prisma.rows.get(EMPLOYEE)).toMatchObject({
      deviceId: 'device-2',
      previousDeviceId: 'device-1',
      publicKey: key.spki,
      bindingVersion: 2,
      // Consumed, so the window does not stay open for a third device.
      replacementAllowedUntil: null,
    });
    expect(prisma.auditRows.map((row) => row.action)).toContain('ATTENDANCE_DEVICE_REBOUND');
  });

  it('closes the window once it expires', async () => {
    const prisma = deviceTable([
      legacyRow({ replacementAllowedUntil: new Date(Date.now() - 1000) }),
    ]);

    await expect(
      newService(prisma).verify(TENANT, EMPLOYEE, { deviceId: 'device-2' }),
    ).rejects.toThrow(/not your registered punch device/i);
  });

  it('frees a handed-down phone for a colleague while the window is open', async () => {
    // HR resets so the device can change hands. The released row still holds
    // the id, so it has to be dropped as it changes hands or the colleague's
    // registration collides with @@unique([tenantId, deviceId]).
    const prisma = deviceTable([legacyRow()]);
    const service = newService(prisma);
    await service.allowReplacement(TENANT, EMPLOYEE);

    await service.verify(TENANT, 'emp-2', { deviceId: 'device-1' });

    expect(prisma.rows.get('emp-2')).toMatchObject({ deviceId: 'device-1' });
    expect(prisma.rows.has(EMPLOYEE)).toBe(false);
    expect(prisma.auditRows.map((row) => row.action)).toContain('ATTENDANCE_DEVICE_RELEASED');
  });

  it('frees the phone for a colleague on a rebind too', async () => {
    // The same collision, reached from the other side: emp-2 already has a
    // released binding of their own and moves onto the handed-down device.
    const prisma = deviceTable([
      legacyRow(),
      legacyRow({
        employeeId: 'emp-2',
        deviceId: 'device-2',
        replacementAllowedUntil: new Date(Date.now() + 60_000),
      }),
    ]);
    const service = newService(prisma);
    await service.allowReplacement(TENANT, EMPLOYEE);

    await service.verify(TENANT, 'emp-2', { deviceId: 'device-1' });

    expect(prisma.rows.get('emp-2')).toMatchObject({
      deviceId: 'device-1',
      previousDeviceId: 'device-2',
    });
    expect(prisma.rows.has(EMPLOYEE)).toBe(false);
  });
});
