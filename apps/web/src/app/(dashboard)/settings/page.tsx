'use client';

import { useSession } from 'next-auth/react';
import { OrganizationAdmin } from '@/components/settings/organization-admin';
import { RbacAdmin } from '@/components/settings/rbac-admin';
import { LocationsGeofencing } from '@/components/settings/locations-geofencing';
import { PageHeader } from '@/components/ui/page-header';

// Mirrors RBAC_ADMIN_ROLES on the API. The API remains the enforcement point; this
// only avoids rendering a card whose every request would 403.
const RBAC_ADMIN_ROLES = ['Super Admin', 'Tenant Owner', 'HR Admin'];

export default function SettingsPage() {
  const { data: session } = useSession();
  const canManageRoles = (session?.user?.roles ?? []).some((role) => RBAC_ADMIN_ROLES.includes(role));

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Company structure, legal entities, locations, roles, permissions and access controls"
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <OrganizationAdmin />
        <LocationsGeofencing />
        {canManageRoles && <RbacAdmin />}
      </div>
    </div>
  );
}
