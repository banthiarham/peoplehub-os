'use client';

import { useSession } from 'next-auth/react';
import { OrganizationAdmin } from '@/components/settings/organization-admin';
import { RbacAdmin } from '@/components/settings/rbac-admin';
import { LocationsGeofencing } from '@/components/settings/locations-geofencing';
import { PageHeader } from '@/components/ui/page-header';
import { allows, viewerFromSession } from '@/lib/authz';

export default function SettingsPage() {
  const { data: session } = useSession();
  // The API remains the enforcement point; this only avoids rendering a card whose
  // every request would 403.
  const canManageRoles = allows(viewerFromSession(session), 'manageUserRoles');

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
