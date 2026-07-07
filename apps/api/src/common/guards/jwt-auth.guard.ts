import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../database/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Record<string, any>>();
    const apiKey = request.headers?.['x-api-key'] as string | undefined;
    if (apiKey) {
      const keyHash = createHash('sha256').update(apiKey).digest('hex');
      return this.prisma.apiKey.findFirst({ where: { keyHash, isActive: true } }).then((key) => {
        if (!key) throw new UnauthorizedException('Invalid API key');
        void this.prisma.apiKey.update({
          where: { id: key.id },
          data: { lastUsedAt: new Date() },
        });
        request.user = {
          userId: `api-key:${key.id}`,
          tenantId: key.tenantId,
          email: `api-key-${key.keyPrefix}@peoplehub.internal`,
          name: key.name,
          isSuperAdmin: false,
          employeeId: null,
          roles: [],
          authType: 'apiKey',
          apiKeyId: key.id,
          scopes: key.scopes ?? [],
        };
        return true;
      });
    }

    return super.canActivate(context) as boolean | Promise<boolean> | Observable<boolean>;
  }
}
