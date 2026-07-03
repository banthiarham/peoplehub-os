'use client';

import { useSession } from 'next-auth/react';
import { Building2, Landmark, ShieldCheck, UserCog } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';

export default function SettingsPage() {
  const { data: session } = useSession();
  return (
    <div>
      <PageHeader title="Settings" description="Workspace and account configuration" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary-600" /> Organization
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Company" value={session?.user?.tenant?.name ?? 'Demo Corp'} />
            <Row label="Workspace slug" value={session?.user?.tenant?.slug ?? 'demo-corp'} />
            <Row label="Country" value="India (IN)" />
            <Row label="Currency" value="INR (₹)" />
            <Row label="Timezone" value="Asia/Kolkata" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-4 w-4 text-primary-600" /> Your account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Name" value={session?.user?.name ?? '—'} />
            <Row label="Email" value={session?.user?.email ?? '—'} />
            <Row
              label="Roles"
              value={
                <span className="flex flex-wrap justify-end gap-1">
                  {(session?.user?.roles ?? []).map((r) => (
                    <Badge key={r}>{r}</Badge>
                  ))}
                </span>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-primary-600" /> Statutory compliance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="PF" value={<Badge variant="success">Enabled · 12% capped</Badge>} />
            <Row label="ESI" value={<Badge variant="success">Enabled · gross ≤ ₹21k</Badge>} />
            <Row label="Professional Tax" value={<Badge variant="success">Slab-based</Badge>} />
            <Row label="TDS" value={<Badge variant="success">New regime FY 2025-26</Badge>} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary-600" /> Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Authentication" value="Email + password (JWT)" />
            <Row label="MFA" value={<Badge variant="outline">Coming soon</Badge>} />
            <Row label="Audit log" value={<Badge variant="success">Enabled</Badge>} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
