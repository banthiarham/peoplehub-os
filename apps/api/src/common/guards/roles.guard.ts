import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPES_KEY } from '../decorators/scopes.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { SELF_SERVICE_KEY } from '../decorators/self-service.decorator';
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
    const selfService = this.reflector.getAllAndOverride<boolean>(SELF_SERVICE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const ungated =
      (!requiredRoles || requiredRoles.length === 0) && (!requiredScopes || requiredScopes.length === 0);
    if (ungated && !selfService) return true;

    const { user } = context.switchToHttp().getRequest<{ user: AuthUser }>();
    if (!user) return false;
    if (user.isSuperAdmin) return true;

    // A self-service route is about the caller's own record, so the caller's employee link
    // is the authorisation. Machine tokens never carry one, which is what keeps an API key
    // out of these routes even when it holds the module scope.
    if (selfService && user.authType !== 'apiKey' && !!user.employeeId) return true;
    if (ungated) return false;

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
