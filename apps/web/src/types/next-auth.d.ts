import 'next-auth';
import 'next-auth/jwt';

interface TenantInfo {
  id: string;
  slug: string;
  name: string;
}

declare module 'next-auth' {
  interface User {
    accessToken: string;
    roles: string[];
    employeeId: string | null;
    tenant?: TenantInfo;
  }
  interface Session {
    accessToken?: string;
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      roles: string[];
      employeeId: string | null;
      tenant?: TenantInfo;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    roles?: string[];
    employeeId?: string | null;
    tenant?: TenantInfo;
  }
}
