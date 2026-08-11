import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmployeeDevice, Prisma } from '@prisma/client';
import { createPublicKey, randomBytes, verify as verifySignature } from 'crypto';
import { PrismaService } from '../../common/database/prisma.service';

/**
 * One punch device per employee, one employee per device — enforced two ways.
 *
 * `deviceId` is a bearer string: readable in devtools and replayable from
 * anywhere, so on its own it proves only that *someone* knows it. A registered
 * device therefore also holds a non-extractable ECDSA key pair, and every punch
 * signs a single-use server challenge with it. The private half cannot be
 * exported by the browser, the employee, or injected script, so the binding can
 * no longer be copied to a second phone.
 *
 * Rows registered before key binding shipped carry `bindingVersion: 1` and no
 * key. They are matched on `deviceId` exactly as before and upgrade themselves
 * the first time a client presents a key, so nobody has to re-register.
 * `ATTENDANCE_REQUIRE_SIGNED_DEVICE` decides whether a key-bound row may punch
 * without a signature: while it is off, a missing or bad signature is logged
 * and allowed, which is what makes the rollout reversible with one env var.
 */

/** How long an issued punch challenge stays usable (ms). */
const CHALLENGE_TTL_MS = 60_000;

/** How long an HR device reset stays open for a replacement device (ms). */
export const REPLACEMENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const DEVICE_KEY_ALGORITHM = 'ECDSA-P256';

const WRONG_DEVICE =
  'This is not your registered punch device. If you changed phones, ask HR to reset your device binding.';
const DEVICE_TAKEN =
  'This device is already registered to another employee — punches must come from your own device.';
const UNPROVEN_DEVICE =
  'This device could not prove it is your registered punch device. Reopen the app and try again, or ask HR to reset your device binding.';

/** The device fields a punch carries. Everything but `deviceId` is optional. */
export interface DevicePunchCredentials {
  deviceId: string;
  deviceName?: string;
  platform?: string;
  /** SPKI public key (base64), sent on every punch so version 1 rows upgrade. */
  devicePublicKey?: string;
  /** The challenge this punch signed, as issued by `issueChallenge`. */
  deviceChallenge?: string;
  /** Signature over `deviceChallenge`, raw r‖s, base64url. */
  deviceSignature?: string;
}

@Injectable()
export class DeviceBindingService {
  private readonly logger = new Logger(DeviceBindingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get signatureRequired(): boolean {
    return this.config.get<string>('ATTENDANCE_REQUIRE_SIGNED_DEVICE') === 'true';
  }

  /**
   * A released row is one an HR reset has opened for replacement. It still
   * holds its `deviceId` — which keeps the punch history and the audit trail
   * intact — but it no longer blocks either its own employee moving to a new
   * device or a colleague inheriting the handed-down phone.
   */
  private isReleased(device: Pick<EmployeeDevice, 'replacementAllowedUntil'>): boolean {
    return !!device.replacementAllowedUntil && device.replacementAllowedUntil > new Date();
  }

  private keyColumns(publicKey: string | undefined) {
    if (!publicKey) return {};
    return { publicKey, publicKeyAlg: DEVICE_KEY_ALGORITHM, bindingVersion: 2 };
  }

  /**
   * Verifies (and on a first punch, creates) the binding for one punch.
   * Throws when the punch may not proceed; returns silently when it may.
   */
  async verify(
    tenantId: string,
    employeeId: string,
    credentials: DevicePunchCredentials,
  ): Promise<void> {
    const bound = await this.prisma.employeeDevice.findUnique({ where: { employeeId } });
    if (!bound) return this.register(tenantId, employeeId, credentials);
    if (bound.deviceId !== credentials.deviceId) {
      return this.rebind(tenantId, bound, credentials);
    }
    return this.verifyBound(bound, credentials);
  }

  /**
   * Frees the tenant-unique `deviceId` for this employee, or refuses it.
   *
   * A released row keeps its `deviceId`, so a handed-down phone would otherwise
   * collide with `@@unique([tenantId, deviceId])` and fail the punch with a
   * constraint error. Dropping the released row is exactly what the old reset
   * did outright; here it happens only once the device actually changes hands.
   */
  private async claimDeviceId(
    tenantId: string,
    employeeId: string,
    deviceId: string,
  ): Promise<void> {
    const holder = await this.prisma.employeeDevice.findUnique({
      where: { tenantId_deviceId: { tenantId, deviceId } },
    });
    if (!holder || holder.employeeId === employeeId) return;
    if (!this.isReleased(holder)) throw new ForbiddenException(DEVICE_TAKEN);

    await this.prisma.employeeDevice.delete({ where: { employeeId: holder.employeeId } });
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        action: 'ATTENDANCE_DEVICE_RELEASED',
        objectType: 'EmployeeDevice',
        objectId: holder.id,
        oldValue: { employeeId: holder.employeeId, deviceId },
        newValue: { claimedByEmployeeId: employeeId },
      },
    });
  }

  /** Trust on first punch, exactly as before — now capturing the key too. */
  private async register(
    tenantId: string,
    employeeId: string,
    credentials: DevicePunchCredentials,
  ): Promise<void> {
    await this.claimDeviceId(tenantId, employeeId, credentials.deviceId);
    await this.prisma.employeeDevice.create({
      data: {
        tenantId,
        employeeId,
        deviceId: credentials.deviceId,
        deviceName: credentials.deviceName,
        platform: credentials.platform,
        ...this.keyColumns(credentials.devicePublicKey),
      },
    });
  }

  /**
   * A punch from a device other than the bound one. Refused as before unless
   * HR has released the binding, in which case this device takes the row over
   * and the swap is audited.
   */
  private async rebind(
    tenantId: string,
    bound: EmployeeDevice,
    credentials: DevicePunchCredentials,
  ): Promise<void> {
    if (!this.isReleased(bound)) throw new ForbiddenException(WRONG_DEVICE);
    await this.claimDeviceId(tenantId, bound.employeeId, credentials.deviceId);

    const now = new Date();
    await this.prisma.employeeDevice.update({
      where: { employeeId: bound.employeeId },
      data: {
        deviceId: credentials.deviceId,
        deviceName: credentials.deviceName ?? null,
        platform: credentials.platform ?? null,
        previousDeviceId: bound.deviceId,
        registeredAt: now,
        lastSeenAt: now,
        publicKey: credentials.devicePublicKey ?? null,
        publicKeyAlg: credentials.devicePublicKey ? DEVICE_KEY_ALGORITHM : null,
        bindingVersion: credentials.devicePublicKey ? 2 : 1,
        replacementAllowedUntil: null,
        replacementAllowedById: null,
        challengeNonce: null,
        challengeExpiresAt: null,
        lastVerifiedAt: null,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        action: 'ATTENDANCE_DEVICE_REBOUND',
        objectType: 'EmployeeDevice',
        objectId: bound.id,
        oldValue: { employeeId: bound.employeeId, deviceId: bound.deviceId },
        newValue: { employeeId: bound.employeeId, deviceId: credentials.deviceId },
      },
    });
  }

  /** The bound device is punching. Decide what it still has to prove. */
  private async verifyBound(
    bound: EmployeeDevice,
    credentials: DevicePunchCredentials,
  ): Promise<void> {
    // Starts as the exact update the pre-key path wrote, so a version 1 row
    // with a version 1 client touches nothing new.
    const data: Prisma.EmployeeDeviceUpdateInput = { lastSeenAt: new Date() };

    if (!bound.publicKey) {
      Object.assign(data, this.keyColumns(credentials.devicePublicKey));
    } else if (this.assertProven(bound, credentials)) {
      data.lastVerifiedAt = new Date();
      data.challengeNonce = null;
      data.challengeExpiresAt = null;
    }

    await this.prisma.employeeDevice.update({ where: { employeeId: bound.employeeId }, data });
  }

  /**
   * Whether this punch proved possession of the bound key.
   *
   * Throws only under `ATTENDANCE_REQUIRE_SIGNED_DEVICE`. Until it is on, every
   * failure is logged and allowed: a bug in challenge handling must degrade to
   * the behaviour that shipped before, never to an office that cannot punch.
   */
  private assertProven(bound: EmployeeDevice, credentials: DevicePunchCredentials): boolean {
    const reason = this.proofFailure(bound, credentials);
    if (!reason) return true;
    if (this.signatureRequired) throw new ForbiddenException(UNPROVEN_DEVICE);
    this.logger.warn(
      `Unproven punch device for employee ${bound.employeeId}: ${reason} (enforcement off)`,
    );
    return false;
  }

  private proofFailure(
    bound: EmployeeDevice,
    credentials: DevicePunchCredentials,
  ): string | null {
    if (!credentials.deviceSignature || !credentials.deviceChallenge) return 'no signature sent';
    if (!bound.challengeNonce || bound.challengeNonce !== credentials.deviceChallenge) {
      // Also the replay case: a consumed challenge is cleared, so a second
      // punch presenting it no longer matches.
      return 'challenge does not match the one issued';
    }
    if (!bound.challengeExpiresAt || bound.challengeExpiresAt < new Date()) {
      return 'challenge expired';
    }
    if (
      !this.signatureMatches(
        bound.publicKey as string,
        credentials.deviceChallenge,
        credentials.deviceSignature,
      )
    ) {
      return 'signature did not verify';
    }
    return null;
  }

  private signatureMatches(publicKey: string, challenge: string, signature: string): boolean {
    try {
      const key = createPublicKey({
        key: Buffer.from(publicKey, 'base64'),
        format: 'der',
        type: 'spki',
      });
      return verifySignature(
        'sha256',
        Buffer.from(challenge),
        // WebCrypto emits raw r‖s; Node reads DER unless told otherwise.
        { key, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url'),
      );
    } catch {
      return false;
    }
  }

  /**
   * Issues the nonce the next punch signs. Returns a null challenge when there
   * is nothing to prove yet — no device bound, or one still on `deviceId`
   * alone — so the client simply punches without a signature.
   */
  async issueChallenge(
    employeeId: string,
  ): Promise<{ challenge: string | null; expiresAt: Date | null }> {
    const bound = await this.prisma.employeeDevice.findUnique({ where: { employeeId } });
    if (!bound?.publicKey) return { challenge: null, expiresAt: null };

    // A live nonce is handed back rather than replaced: the row holds one, so
    // minting a second would invalidate the challenge another tab is already
    // signing. Replay protection is unaffected — the nonce is cleared when it
    // is consumed, not when it is issued.
    const live =
      bound.challengeNonce && bound.challengeExpiresAt && bound.challengeExpiresAt > new Date();
    const challenge = live ? (bound.challengeNonce as string) : randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    await this.prisma.employeeDevice.update({
      where: { employeeId },
      data: { challengeNonce: challenge, challengeExpiresAt: expiresAt },
    });
    return { challenge, expiresAt };
  }

  /**
   * Releases a binding so the employee's next device takes it over.
   *
   * Replaces deleting the row: a delete threw away the device history and left
   * the employee claimable by any device forever, whereas a window is bounded,
   * auditable, and keeps the old binding readable while it runs.
   */
  async allowReplacement(
    tenantId: string,
    employeeId: string,
    actorUserId?: string,
  ): Promise<{ reset: true; replacementAllowedUntil: Date }> {
    const bound = await this.prisma.employeeDevice.findUnique({ where: { employeeId } });
    if (!bound || bound.tenantId !== tenantId) {
      throw new NotFoundException('No device registered for this employee');
    }
    const replacementAllowedUntil = new Date(Date.now() + REPLACEMENT_WINDOW_MS);
    // `AuditLog.actorId` is a foreign key, but not every caller is a user row:
    // an API key authenticates as `api-key:<id>`, which would fail the
    // constraint and 500 the reset. The raw actor is kept in `newValue`, which
    // is plain JSON, so nothing is lost when the column has to stay null.
    const actor = actorUserId
      ? await this.prisma.user.findUnique({ where: { id: actorUserId }, select: { id: true } })
      : null;

    await this.prisma.$transaction([
      this.prisma.employeeDevice.update({
        where: { employeeId },
        data: { replacementAllowedUntil, replacementAllowedById: actorUserId ?? null },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId,
          actorId: actor?.id ?? null,
          action: 'ATTENDANCE_DEVICE_RESET',
          objectType: 'EmployeeDevice',
          objectId: bound.id,
          oldValue: { employeeId, deviceId: bound.deviceId },
          newValue: { replacementAllowedUntil, actorUserId: actorUserId ?? null },
        },
      }),
    ]);
    return { reset: true, replacementAllowedUntil };
  }
}
