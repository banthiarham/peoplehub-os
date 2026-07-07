export interface AuthUser {
  userId: string;
  tenantId: string;
  email: string;
  name: string | null;
  isSuperAdmin: boolean;
  employeeId: string | null;
  roles: string[];
  authType?: 'jwt' | 'apiKey' | 'oauth';
  apiKeyId?: string;
  scopes?: string[];
}
