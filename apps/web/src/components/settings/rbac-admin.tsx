'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, ShieldCheck, UserCog } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toaster';

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Array<{ module: string; permissionType: string; scopeType: string }>;
  _count: { userRoles: number };
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  userRoles: Array<{ role: { id: string; name: string } }>;
}

interface FieldPermission {
  key: string;
  label: string;
  roleIds: string[];
  roles: Array<{ id: string; name: string }>;
}

function apiError(err: unknown) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Request failed');
}

export function RbacAdmin() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleForm, setRoleForm] = useState({ name: '', description: '' });
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const { data: roles, isLoading: rolesLoading } = useQuery<RoleRow[]>({
    queryKey: ['roles'],
    queryFn: () => api.get('/roles').then((r) => r.data),
  });
  const { data: users } = useQuery<UserRow[]>({
    queryKey: ['roles', 'users'],
    queryFn: () => api.get('/roles/users').then((r) => r.data),
  });
  const { data: fieldPermissions } = useQuery<FieldPermission[]>({
    queryKey: ['roles', 'field-permissions'],
    queryFn: () => api.get('/roles/field-permissions').then((r) => r.data),
  });

  const createRole = useMutation({
    mutationFn: () => api.post('/roles', roleForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast('Role created');
      setRoleOpen(false);
      setRoleForm({ name: '', description: '' });
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  const assignRoles = useMutation({
    mutationFn: () => api.patch(`/roles/users/${editingUser?.id}`, { roleIds: selectedRoles }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast('User roles updated');
      setEditingUser(null);
    },
    onError: (err) => toast(apiError(err), 'error'),
  });

  const openUser = (user: UserRow) => {
    setEditingUser(user);
    setSelectedRoles(user.userRoles.map((ur) => ur.role.id));
  };

  return (
    <>
      <Card className="lg:col-span-2">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary-600" /> Roles and permissions
          </CardTitle>
          <Button size="sm" onClick={() => setRoleOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Custom role
          </Button>
        </CardHeader>
        {rolesLoading ? (
          <Skeleton className="m-4 h-40" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Role</TH>
                <TH>Scope</TH>
                <TH className="text-right">Users</TH>
                <TH className="text-right">Permissions</TH>
              </TR>
            </THead>
            <TBody>
              {roles?.map((role) => (
                <TR key={role.id}>
                  <TD>
                    <span className="block font-medium">{role.name}</span>
                    <span className="text-xs text-ink-muted">{role.description ?? (role.isSystem ? 'System role' : 'Custom role')}</span>
                  </TD>
                  <TD>
                    <Badge variant={role.isSystem ? 'success' : 'outline'}>{role.isSystem ? 'Default' : 'Custom'}</Badge>
                  </TD>
                  <TD className="text-right tabular-nums">{role._count.userRoles}</TD>
                  <TD className="text-right tabular-nums">{role.permissions.length}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-4 w-4 text-primary-600" /> User role assignment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {users?.slice(0, 8).map((user) => (
            <button
              key={user.id}
              onClick={() => openUser(user)}
              className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-left hover:bg-canvas"
            >
              <span>
                <span className="block text-sm font-medium">{user.name ?? user.email}</span>
                <span className="block text-xs text-ink-muted">{user.email}</span>
              </span>
              <span className="flex max-w-[180px] flex-wrap justify-end gap-1">
                {user.userRoles.slice(0, 2).map((ur) => (
                  <Badge key={ur.role.id} variant="outline">{ur.role.name}</Badge>
                ))}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary-600" /> Sensitive fields
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {fieldPermissions?.map((field) => (
            <FieldPermissionRow key={field.key} field={field} roles={roles ?? []} />
          ))}
        </CardContent>
      </Card>

      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create custom role</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Labeled label="Role name">
              <Input value={roleForm.name} onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))} />
            </Labeled>
            <Labeled label="Description">
              <Input value={roleForm.description} onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))} />
            </Labeled>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleOpen(false)}>Cancel</Button>
            <Button disabled={!roleForm.name.trim() || createRole.isPending} onClick={() => createRole.mutate()}>
              {createRole.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingUser !== null} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign roles</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {roles?.map((role) => (
              <label key={role.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedRoles.includes(role.id)}
                  onChange={(e) =>
                    setSelectedRoles((current) =>
                      e.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id),
                    )
                  }
                />
                {role.name}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button onClick={() => assignRoles.mutate()} disabled={assignRoles.isPending}>
              {assignRoles.isPending ? 'Saving…' : 'Save roles'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FieldPermissionRow({ field, roles }: { field: FieldPermission; roles: RoleRow[] }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [roleId, setRoleId] = useState('');
  const update = useMutation({
    mutationFn: (roleIds: string[]) => api.patch('/roles/field-permissions', { fieldKey: field.key, roleIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles', 'field-permissions'] });
      toast('Field access updated');
      setRoleId('');
    },
    onError: (err) => toast(apiError(err), 'error'),
  });
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="text-sm font-medium">{field.label}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {field.roles.map((role) => (
          <button
            key={role.id}
            className="rounded-full"
            onClick={() => update.mutate(field.roleIds.filter((id) => id !== role.id))}
            disabled={update.isPending}
            title={`Remove ${role.name} access`}
          >
            <Badge variant="outline">{role.name} ×</Badge>
          </button>
        ))}
        {!field.roles.length && <span className="text-xs text-ink-muted">No roles</span>}
      </div>
      <div className="mt-3 flex gap-2">
        <Select className="min-w-0 flex-1" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">Grant role…</option>
          {roles.filter((r) => !field.roleIds.includes(r.id)).map((role) => (
            <option key={role.id} value={role.id}>{role.name}</option>
          ))}
        </Select>
        <Button
          size="sm"
          variant="outline"
          disabled={!roleId || update.isPending}
          onClick={() => update.mutate([...field.roleIds, roleId])}
        >
          Grant
        </Button>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  );
}
