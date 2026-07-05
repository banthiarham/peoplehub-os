'use client';

import { OrganizationAdmin } from '@/components/settings/organization-admin';
import { RbacAdmin } from '@/components/settings/rbac-admin';
import { LocationsGeofencing } from '@/components/settings/locations-geofencing';
import { PageHeader } from '@/components/ui/page-header';

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Company structure, legal entities, locations, roles, permissions and access controls"
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <OrganizationAdmin />
        <LocationsGeofencing />
        <RbacAdmin />
      </div>
    </div>
  );
}
