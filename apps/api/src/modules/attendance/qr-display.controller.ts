import { Body, Controller, Headers, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AttendanceQrService } from './attendance-qr.service';
import { PairQrDisplayDto, QrDisplayTokenDto } from './dto/attendance.dto';

/**
 * Unauthenticated in the JWT sense: a wall-mounted tablet has no user to keep
 * signed in, so the pairing code and display token are the credentials.
 *
 * `ThrottlerGuard` is bound here rather than globally — the app registers
 * `ThrottlerModule` but no global guard, and turning it on app-wide is not this
 * change's call.
 */
@UseGuards(ThrottlerGuard)
@ApiTags('Attendance QR display')
@Controller('attendance/qr/display')
export class QrDisplayController {
  constructor(private readonly qr: AttendanceQrService) {}

  @Public()
  @Post('pair')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Exchange a pairing code for this display token' })
  pair(@Body() dto: PairQrDisplayDto) {
    return this.qr.pair(dto);
  }

  @Public()
  @Post('token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Issue the next signed QR for a paired display' })
  token(
    @Headers('x-display-token') displayToken: string | undefined,
    @Body() dto: QrDisplayTokenDto,
  ) {
    if (!displayToken) throw new UnauthorizedException('Missing display token');
    return this.qr.issueToken(displayToken, dto);
  }
}
