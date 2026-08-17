import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { AttendanceQrService } from './attendance-qr.service';
import { signQrToken } from './qr-token';

const TENANT = 'tenant-1';
const OTHER_TENANT = 'tenant-2';
const LOCATION = 'loc-1';
const SECRET = 'qr-secret';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function harness(options?: {
  location?: Record<string, unknown> | null;
  display?: Record<string, unknown> | null;
}) {
  const displays = new Map<string, Record<string, any>>();
  if (options?.display) displays.set(options.display.id as string, { ...options.display });
  const auditRows: Array<Record<string, any>> = [];

  const match = (row: Record<string, any>, where: Record<string, any>) =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'pairingExpiresAt' && value && typeof value === 'object' && 'gt' in value) {
        return row.pairingExpiresAt && row.pairingExpiresAt > (value as { gt: Date }).gt;
      }
      return row[key] === value;
    });

  return {
    displays,
    auditRows,
    location: {
      findFirst: jest.fn(({ where }: { where: any }) => {
        const location =
          options?.location === undefined
            ? { id: LOCATION, name: 'Delhi HQ', geoLat: 28.6, geoLng: 77.2, attendanceRadius: 200 }
            : options.location;
        if (!location) return Promise.resolve(null);
        // Tenant scoping is the point of several tests below, so honour it.
        if (where.tenantId && where.tenantId !== TENANT) return Promise.resolve(null);
        if (where.id && where.id !== (location as any).id) return Promise.resolve(null);
        return Promise.resolve(location);
      }),
    },
    attendanceQrDisplay: {
      findMany: jest.fn(() => Promise.resolve([...displays.values()])),
      findFirst: jest.fn(({ where }: { where: any }) =>
        Promise.resolve([...displays.values()].find((row) => match(row, where)) ?? null),
      ),
      findUnique: jest.fn(({ where }: { where: any }) =>
        Promise.resolve([...displays.values()].find((row) => match(row, where)) ?? null),
      ),
      upsert: jest.fn(({ where, create, update }: any) => {
        const existing = [...displays.values()].find((row) => row.locationId === where.locationId);
        const row = existing
          ? { ...existing, ...update }
          : { id: 'display-1', createdAt: new Date(), ...create };
        displays.set(row.id, row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }: any) => {
        const row = { ...displays.get(where.id), ...data };
        displays.set(where.id, row);
        return Promise.resolve(row);
      }),
    },
    auditLog: {
      create: jest.fn(({ data }: any) => {
        auditRows.push(data);
        return Promise.resolve(data);
      }),
    },
  };
}

function newService(prisma: ReturnType<typeof harness>, env: Record<string, string> = {}) {
  const config = { get: (key: string) => ({ ATTENDANCE_QR_SECRET: SECRET, ...env })[key] };
  return new AttendanceQrService(prisma as never, config as never as ConfigService);
}

const pairedDisplay = (extra: Record<string, unknown> = {}) => ({
  id: 'display-1',
  tenantId: TENANT,
  locationId: LOCATION,
  name: 'Delhi HQ display',
  tokenHash: sha256('phd_live-token'),
  pairingCodeHash: null,
  pairingExpiresAt: null,
  verifyLocation: false,
  isActive: true,
  ...extra,
});

describe('AttendanceQrService', () => {
  describe('provisioning', () => {
    it('returns a pairing code and stores only its hash', async () => {
      const prisma = harness();

      const result = await newService(prisma).upsertDisplay(TENANT, { locationId: LOCATION });

      expect(result.pairingCode).toMatch(/^[0-9A-F]{8}$/);
      const stored = [...prisma.displays.values()][0];
      expect(stored.pairingCodeHash).toBe(sha256(result.pairingCode));
      expect(stored.pairingCodeHash).not.toBe(result.pairingCode);
    });

    it('refuses a location in another tenant', async () => {
      const prisma = harness();

      await expect(
        newService(prisma).upsertDisplay(OTHER_TENANT, { locationId: LOCATION }),
      ).rejects.toThrow(/location not found/i);
    });

    it('refuses on-site verification when the location has no geofence', async () => {
      const prisma = harness({
        location: { id: LOCATION, name: 'Delhi HQ', geoLat: null, geoLng: null, attendanceRadius: null },
      });

      await expect(
        newService(prisma).upsertDisplay(TENANT, { locationId: LOCATION, verifyLocation: true }),
      ).rejects.toThrow(/no geofence configured/i);
    });

    it('rotates the token when a location is re-paired', async () => {
      const prisma = harness({ display: pairedDisplay() });

      await newService(prisma).upsertDisplay(TENANT, { locationId: LOCATION });

      // The screen it replaces must stop working the moment a new one pairs.
      expect([...prisma.displays.values()][0].tokenHash).not.toBe(sha256('phd_live-token'));
    });
  });

  describe('pairing', () => {
    const withPendingCode = () =>
      harness({
        display: pairedDisplay({
          pairingCodeHash: sha256('A1B2C3D4'),
          pairingExpiresAt: new Date(Date.now() + 60_000),
        }),
      });

    it('exchanges a code for a token and consumes the code', async () => {
      const prisma = withPendingCode();

      const result = await newService(prisma).pair({ pairingCode: 'A1B2C3D4' });

      expect(result.token).toMatch(/^phd_/);
      const stored = [...prisma.displays.values()][0];
      expect(stored.tokenHash).toBe(sha256(result.token));
      expect(stored.pairingCodeHash).toBeNull();
    });

    it('accepts a code the way a person would type it', async () => {
      const prisma = withPendingCode();

      await expect(newService(prisma).pair({ pairingCode: ' a1b2c3d4 ' })).resolves.toBeDefined();
    });

    it('refuses a code that was already used', async () => {
      const prisma = withPendingCode();
      const service = newService(prisma);
      await service.pair({ pairingCode: 'A1B2C3D4' });

      await expect(service.pair({ pairingCode: 'A1B2C3D4' })).rejects.toThrow(/not valid|expired/i);
    });

    it('refuses an expired code', async () => {
      const prisma = harness({
        display: pairedDisplay({
          pairingCodeHash: sha256('A1B2C3D4'),
          pairingExpiresAt: new Date(Date.now() - 1),
        }),
      });

      await expect(newService(prisma).pair({ pairingCode: 'A1B2C3D4' })).rejects.toThrow(
        /not valid|expired/i,
      );
    });
  });

  describe('issuing codes', () => {
    it('signs a code naming the display location', async () => {
      const prisma = harness({ display: pairedDisplay() });

      const { token } = await newService(prisma).issueToken('phd_live-token', {});

      expect(token.startsWith('PHUB2.')).toBe(true);
      await expect(
        newService(prisma).resolveScannedCode(TENANT, token),
      ).resolves.toMatchObject({ locationId: LOCATION, displayId: 'display-1' });
    });

    it('refuses a token that matches no display', async () => {
      const prisma = harness({ display: pairedDisplay() });

      await expect(newService(prisma).issueToken('phd_wrong', {})).rejects.toThrow(/not paired/i);
    });

    it('refuses a revoked display', async () => {
      const prisma = harness({ display: pairedDisplay({ isActive: false }) });

      await expect(newService(prisma).issueToken('phd_live-token', {})).rejects.toThrow(
        /not paired/i,
      );
    });

    describe('when the display must prove it is on site', () => {
      const onSite = () => harness({ display: pairedDisplay({ verifyLocation: true }) });

      it('issues when the display is inside the geofence', async () => {
        await expect(
          newService(onSite()).issueToken('phd_live-token', { geoLat: 28.6, geoLng: 77.2 }),
        ).resolves.toBeDefined();
      });

      it('refuses when the display is elsewhere', async () => {
        await expect(
          newService(onSite()).issueToken('phd_live-token', { geoLat: 19.07, geoLng: 72.87 }),
        ).rejects.toThrow(/only issued on site/i);
      });

      it('refuses rather than falling back when no fix is sent', async () => {
        await expect(newService(onSite()).issueToken('phd_live-token', {})).rejects.toThrow(
          /must confirm it is at/i,
        );
      });
    });
  });

  describe('resolving a scanned code', () => {
    const scanned = (extra: Record<string, unknown> = {}) =>
      signQrToken({ t: TENANT, l: LOCATION, d: 'display-1', ...extra }, SECRET);

    it('takes the location from the signed payload', async () => {
      const prisma = harness({ display: pairedDisplay() });

      await expect(newService(prisma).resolveScannedCode(TENANT, scanned())).resolves.toMatchObject(
        { locationId: LOCATION },
      );
    });

    it('refuses a code signed for another workspace', async () => {
      const prisma = harness({ display: pairedDisplay() });
      const foreign = signQrToken({ t: OTHER_TENANT, l: LOCATION, d: 'display-1' }, SECRET);

      await expect(newService(prisma).resolveScannedCode(TENANT, foreign)).rejects.toThrow(
        /not for your workspace/i,
      );
    });

    it('refuses a code from a display that has since been revoked', async () => {
      // Still inside its window, so only the display check can stop it.
      const prisma = harness({ display: pairedDisplay({ isActive: false }) });

      await expect(newService(prisma).resolveScannedCode(TENANT, scanned())).rejects.toThrow(
        /no longer active/i,
      );
    });

    it('refuses a code whose display has moved to another location', async () => {
      const prisma = harness({ display: pairedDisplay({ locationId: 'loc-2' }) });

      await expect(newService(prisma).resolveScannedCode(TENANT, scanned())).rejects.toThrow(
        /no longer active/i,
      );
    });

    it('refuses an expired code with advice that fits', async () => {
      const prisma = harness({ display: pairedDisplay() });
      const stale = scanned({ i: Math.floor(Date.now() / 1000) - 120 });

      await expect(newService(prisma).resolveScannedCode(TENANT, stale)).rejects.toThrow(
        /expired/i,
      );
    });

    describe('the unsigned format that predates signing', () => {
      it('is refused by default', async () => {
        const prisma = harness({ display: pairedDisplay() });

        await expect(
          newService(prisma).resolveScannedCode(TENANT, `PHUB:${LOCATION}`),
        ).rejects.toThrow(/no longer accepted/i);
      });

      it('is readable only behind the escape hatch', async () => {
        const prisma = harness({ display: pairedDisplay() });
        const service = newService(prisma, { ATTENDANCE_ALLOW_UNSIGNED_QR: 'true' });

        await expect(
          service.resolveScannedCode(TENANT, `PHUB:${LOCATION}`),
        ).resolves.toMatchObject({ locationId: LOCATION, displayId: null });
      });
    });
  });

  describe('revoking', () => {
    it('rotates the token so the screen stops working', async () => {
      const prisma = harness({ display: pairedDisplay() });

      await newService(prisma).revokeDisplay(TENANT, LOCATION);

      const stored = [...prisma.displays.values()][0];
      expect(stored.isActive).toBe(false);
      expect(stored.tokenHash).not.toBe(sha256('phd_live-token'));
      expect(prisma.auditRows.map((row) => row.action)).toContain(
        'ATTENDANCE_QR_DISPLAY_REVOKED',
      );
    });

    it('refuses to revoke across tenants', async () => {
      const prisma = harness({ display: pairedDisplay() });

      await expect(newService(prisma).revokeDisplay(OTHER_TENANT, LOCATION)).rejects.toThrow(
        /no qr display/i,
      );
    });
  });
});
