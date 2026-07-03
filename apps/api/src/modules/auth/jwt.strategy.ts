import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../../common/types/auth-user';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  name: string | null;
  isSuperAdmin: boolean;
  employeeId: string | null;
  roles: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
    });
  }

  validate(payload: JwtPayload): AuthUser {
    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      email: payload.email,
      name: payload.name,
      isSuperAdmin: payload.isSuperAdmin,
      employeeId: payload.employeeId,
      roles: payload.roles ?? [],
    };
  }
}
