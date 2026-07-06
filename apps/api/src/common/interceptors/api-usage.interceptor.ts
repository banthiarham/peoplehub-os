import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from '../types/auth-user';

@Injectable()
export class ApiUsageInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      route?: { path?: string };
      method?: string;
      url?: string;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const endpoint = request.route?.path ?? request.url ?? 'unknown';
    const method = request.method ?? 'GET';
    return next.handle().pipe(
      tap({
        next: () => {
          void this.log(request, endpoint, method, 200, Date.now() - startedAt);
        },
        error: (error) => {
          void this.log(request, endpoint, method, error?.status ?? 500, Date.now() - startedAt);
        },
      }),
    );
  }

  private async log(
    request: { user?: AuthUser; ip?: string; headers?: Record<string, string | string[] | undefined> },
    endpoint: string,
    method: string,
    statusCode: number,
    responseMs: number,
  ) {
    const user = request.user;
    if (!user) return;
    const baseData = {
      tenantId: user.tenantId,
      authType: user.authType ?? 'jwt',
      subjectId: user.userId,
      endpoint,
      method,
      statusCode,
      responseMs,
      ipAddress: request.ip ?? null,
      userAgent: typeof request.headers?.['user-agent'] === 'string' ? request.headers['user-agent'] : null,
    };

    await this.prisma.apiRequestLog.create({
      data: {
        ...baseData,
        apiKeyId: user.apiKeyId ?? null,
        oauthClientId: user.authType === 'oauth' && user.userId.startsWith('oauth-client:')
          ? user.userId.replace('oauth-client:', '')
          : null,
      },
    });

    if (user.apiKeyId) {
      await this.prisma.apiKeyLog.create({
        data: {
          apiKeyId: user.apiKeyId,
          endpoint,
          method,
          statusCode,
          responseMs,
        },
      });
    }
  }
}
