import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttendanceQrDisplay } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { haversineMeters } from './geo-distance';
import {
  QR_ACCEPT_MS,
  QR_ROTATE_MS,
  QrTokenPayload,
  signQrToken,
  verifyQrToken,
} from './qr-token';
import { PairQrDisplayDto, QrDisplayTokenDto, UpsertQrDisplayDto } from './dto/attendance.dto';

/** How long a pairing code stays usable before HR has to issue another. */
const PAIRING_TTL_MS = 10 * 60 * 1000;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * A display is a fixed screen at one location, authenticated by its own token
 * rather than a person's session — which would expire and leave it dark.
 */
@Injectable()
export class AttendanceQrService {
  private readonly logger = new Logger(AttendanceQrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Current secret first. The `JWT_SECRET` fallback is warned about: a leaked
   * QR secret should never also be the auth secret.
   */
  private secrets(): string[] {
    const current = this.config.get<string>('ATTENDANCE_QR_SECRET');
    const previous = this.config.get<string>('ATTENDANCE_QR_SECRET_PREVIOUS');
    if (!current) {
      this.logger.warn(
        'ATTENDANCE_QR_SECRET is not set — falling back to JWT_SECRET for attendance QR signing',
      );
    }
    const signing = current ?? this.config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me';
    return previous ? [signing, previous] : [signing];
  }

  private allowsUnsignedQr(): boolean {
    return this.config.get<string>('ATTENDANCE_ALLOW_UNSIGNED_QR') === 'true';
  }

  /** What HR sees. Never includes the token — it exists hashed only. */
  private view(display: AttendanceQrDisplay & { location?: { name: string } | null }) {
    return {
      id: display.id,
      locationId: display.locationId,
      locationName: display.location?.name ?? null,
      name: display.name,
      verifyLocation: display.verifyLocation,
      isActive: display.isActive,
      lastSeenAt: display.lastSeenAt,
      pairingPending: !!display.pairingCodeHash && !!display.pairingExpiresAt,
      pairingExpiresAt: display.pairingExpiresAt,
      createdAt: display.createdAt,
    };
  }

  async listDisplays(tenantId: string) {
    const displays = await this.prisma.attendanceQrDisplay.findMany({
      where: { tenantId },
      include: { location: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return displays.map((display) => this.view(display));
  }

  /** Returns a single-use pairing code, shown once and stored hashed. */
  async upsertDisplay(tenantId: string, dto: UpsertQrDisplayDto, registeredById?: string) {
    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, tenantId },
      select: { id: true, name: true, geoLat: true, geoLng: true, attendanceRadius: true },
    });
    if (!location) throw new NotFoundException('Location not found');
    if (dto.verifyLocation && (location.geoLat == null || location.geoLng == null || !location.attendanceRadius)) {
      throw new BadRequestException(
        `${location.name} has no geofence configured — set its coordinates and radius before requiring the display to be on site`,
      );
    }

    const pairingCode = randomBytes(4).toString('hex').toUpperCase();
    const shared = {
      name: dto.name?.trim() || `${location.name} display`,
      verifyLocation: dto.verifyLocation ?? false,
      pairingCodeHash: sha256(pairingCode),
      pairingExpiresAt: new Date(Date.now() + PAIRING_TTL_MS),
      isActive: true,
      registeredById: registeredById ?? null,
    };

    // Re-pairing rotates the token, so the screen it replaces stops working.
    const display = await this.prisma.attendanceQrDisplay.upsert({
      where: { locationId: location.id },
      create: {
        tenantId,
        locationId: location.id,
        tokenHash: sha256(randomBytes(32).toString('base64url')),
        ...shared,
      },
      update: { ...shared, tokenHash: sha256(randomBytes(32).toString('base64url')) },
      include: { location: { select: { name: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        action: 'ATTENDANCE_QR_DISPLAY_PAIRED',
        objectType: 'AttendanceQrDisplay',
        objectId: display.id,
        newValue: { locationId: location.id, verifyLocation: shared.verifyLocation },
      },
    });

    return { ...this.view(display), pairingCode };
  }

  async revokeDisplay(tenantId: string, locationId: string) {
    const display = await this.prisma.attendanceQrDisplay.findFirst({
      where: { locationId, tenantId },
    });
    if (!display) throw new NotFoundException('No QR display registered for this location');

    // Rotating the token is what stops the screen; `isActive` alone would leave
    // a working credential in the wild.
    await this.prisma.attendanceQrDisplay.update({
      where: { id: display.id },
      data: {
        isActive: false,
        tokenHash: sha256(randomBytes(32).toString('base64url')),
        pairingCodeHash: null,
        pairingExpiresAt: null,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        action: 'ATTENDANCE_QR_DISPLAY_REVOKED',
        objectType: 'AttendanceQrDisplay',
        objectId: display.id,
        oldValue: { locationId },
      },
    });
    return { revoked: true };
  }

  /**
   * Unauthenticated by necessity — the screen has no user — so the pairing code
   * is the only credential. Consuming it clears the hash.
   */
  async pair(dto: PairQrDisplayDto) {
    const codeHash = sha256(dto.pairingCode.trim().toUpperCase());
    const display = await this.prisma.attendanceQrDisplay.findFirst({
      where: { pairingCodeHash: codeHash, pairingExpiresAt: { gt: new Date() } },
      include: { location: { select: { name: true } } },
    });
    if (!display) throw new UnauthorizedException('That pairing code is not valid or has expired');

    const token = `phd_${randomBytes(32).toString('base64url')}`;
    await this.prisma.attendanceQrDisplay.update({
      where: { id: display.id },
      data: {
        tokenHash: sha256(token),
        pairingCodeHash: null,
        pairingExpiresAt: null,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });

    return {
      token,
      locationId: display.locationId,
      locationName: display.location?.name ?? null,
      name: display.name,
      verifyLocation: display.verifyLocation,
      rotateMs: QR_ROTATE_MS,
    };
  }

  private async displayForToken(token: string): Promise<AttendanceQrDisplay> {
    const display = await this.prisma.attendanceQrDisplay.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!display || !display.isActive) {
      throw new UnauthorizedException('This display is not paired — pair it again from Settings');
    }
    return display;
  }

  /**
   * A display configured to prove it is on site is refused when it cannot say
   * where it is, rather than falling back.
   */
  async issueToken(token: string, dto: QrDisplayTokenDto) {
    const display = await this.displayForToken(token);
    if (display.verifyLocation) {
      await this.assertDisplayOnSite(display, dto);
    }

    await this.prisma.attendanceQrDisplay.update({
      where: { id: display.id },
      data: {
        lastSeenAt: new Date(),
        lastGeoLat: dto.geoLat ?? null,
        lastGeoLng: dto.geoLng ?? null,
        lastGeoAccuracy: dto.geoAccuracy ?? null,
      },
    });

    return {
      token: signQrToken(
        { t: display.tenantId, l: display.locationId, d: display.id },
        this.secrets()[0],
      ),
      rotateMs: QR_ROTATE_MS,
      expiresInMs: QR_ACCEPT_MS,
    };
  }

  private async assertDisplayOnSite(display: AttendanceQrDisplay, dto: QrDisplayTokenDto) {
    const location = await this.prisma.location.findFirst({
      where: { id: display.locationId, tenantId: display.tenantId },
      select: { name: true, geoLat: true, geoLng: true, attendanceRadius: true },
    });
    if (!location?.geoLat || !location?.geoLng || !location?.attendanceRadius) return;

    if (dto.geoLat == null || dto.geoLng == null) {
      throw new ForbiddenException(
        `This display must confirm it is at ${location.name} — allow location access on this device`,
      );
    }
    const distance = haversineMeters(dto.geoLat, dto.geoLng, location.geoLat, location.geoLng);
    if (distance > location.attendanceRadius) {
      throw new ForbiddenException(
        `This display is ${Math.round(distance)}m from ${location.name} — QR codes are only issued on site`,
      );
    }
  }

  /**
   * `locationId` comes from the verified payload, so a scanning client cannot
   * influence where its punch lands. Tenant is re-checked despite being signed.
   */
  async resolveScannedCode(
    tenantId: string,
    qrCode: string,
  ): Promise<{ locationId: string; displayId: string | null; issuedAt: number | null }> {
    const legacy = this.resolveLegacyCode(qrCode);
    if (legacy) return legacy;

    const { payload, failure } = verifyQrToken(qrCode, this.secrets());
    if (!payload) throw new BadRequestException(this.scanFailureMessage(failure));
    if (payload.t !== tenantId) throw new ForbiddenException('This QR code is not for your workspace');

    await this.assertDisplayUsable(payload);
    return { locationId: payload.l, displayId: payload.d, issuedAt: payload.i };
  }

  private scanFailureMessage(failure?: string): string {
    if (failure === 'expired') {
      return 'That QR code has expired — scan the code currently on the screen';
    }
    return 'This is not a valid attendance QR code';
  }

  /** A revoked display must not keep punching through codes still in window. */
  private async assertDisplayUsable(payload: QrTokenPayload) {
    const display = await this.prisma.attendanceQrDisplay.findFirst({
      where: { id: payload.d, tenantId: payload.t },
      select: { isActive: true, locationId: true },
    });
    if (!display || !display.isActive || display.locationId !== payload.l) {
      throw new ForbiddenException('This QR display is no longer active');
    }
  }

  /**
   * The unsigned `PHUB:<locationId>` format that predates signed codes. No
   * shipped client produced one, so it is refused unless explicitly re-enabled.
   */
  private resolveLegacyCode(qrCode: string) {
    if (!qrCode.startsWith('PHUB:')) return null;
    if (!this.allowsUnsignedQr()) {
      throw new BadRequestException(
        'This QR code is no longer accepted — scan the code on the location display',
      );
    }
    const [, locationId] = qrCode.split(':');
    if (!locationId) throw new BadRequestException('This is not a valid attendance QR code');
    this.logger.warn(`Unsigned attendance QR accepted for location ${locationId}`);
    return { locationId, displayId: null, issuedAt: null };
  }
}
