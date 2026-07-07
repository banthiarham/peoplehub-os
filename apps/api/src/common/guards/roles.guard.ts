import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPES_KEY } from '../decorators/scopes.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthUser } from '../types/auth-user';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if ((!requiredRoles || requiredRoles.length === 0) && (!requiredScopes || requiredScopes.length === 0)) return true;

    const { user } = context.switchToHttp().getRequest<{ user: AuthUser }>();
    if (!user) return false;
    if (user.isSuperAdmin) return true;

    const hasScopes = !!requiredScopes && requiredScopes.length > 0;
    const hasRoles = !!requiredRoles && requiredRoles.length > 0;
    const scopeMatch = !hasScopes
      ? false
      : (user.scopes ?? []).some((scope) => requiredScopes.includes(scope));
    const roleMatch = !hasRoles
      ? false
      : (user.roles ?? []).some((role) => requiredRoles.includes(role));

    if (user.authType === 'apiKey') {
      if (hasScopes && hasRoles) return scopeMatch || roleMatch;
      if (hasScopes) return scopeMatch;
      return roleMatch;
    }
    if (hasScopes && hasRoles) return scopeMatch || roleMatch;
    if (hasScopes) return scopeMatch;
    return roleMatch;
  }
}
