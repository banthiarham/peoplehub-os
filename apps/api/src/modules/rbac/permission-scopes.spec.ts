import { PermissionType } from '@prisma/client';
import { scopeActions, scopeModule, scopesForPermissions } from './permission-scopes';

describe('permission scope mapping', () => {
  it('renames only the workflows module', () => {
    expect(scopeModule('workflows')).toBe('workflow');
    expect(scopeModule('payroll')).toBe('payroll');
    expect(scopeModule('employee.field.salary')).toBe('employee.field.salary');
  });

  it('derives usable scopes for integration and API-key permission types', () => {
    expect(scopeActions(PermissionType.MANAGE_INTEGRATIONS)).toEqual(['integrations']);
    expect(scopeActions(PermissionType.MANAGE_API_KEYS)).toEqual(['api_keys']);
    expect(scopeActions(PermissionType.VIEW_SENSITIVE)).toEqual(['sensitive']);
  });

  it('keeps payroll lifecycle actions off the generic approve scope', () => {
    expect(scopeActions(PermissionType.RUN_PAYROLL)).toEqual(['run', 'write']);
    expect(scopeActions(PermissionType.LOCK_PAYROLL)).toEqual(['lock']);
    expect(scopeActions(PermissionType.UNLOCK_PAYROLL)).toEqual(['unlock']);

    for (const type of [PermissionType.RUN_PAYROLL, PermissionType.LOCK_PAYROLL, PermissionType.UNLOCK_PAYROLL]) {
      expect(scopeActions(type)).not.toContain('approve');
    }
  });

  it('never derives a payroll lifecycle scope from APPROVE', () => {
    const scopes = scopesForPermissions([{ module: 'payroll', permissionType: PermissionType.APPROVE }]);
    expect(scopes).toEqual(['payroll:approve']);
    expect(scopes).not.toContain('payroll:run');
    expect(scopes).not.toContain('payroll:lock');
    expect(scopes).not.toContain('payroll:unlock');
  });

  it('separates module configuration from a plain write', () => {
    expect(scopeActions(PermissionType.CONFIGURE)).toEqual(['write', 'configure']);
    for (const type of [PermissionType.CREATE, PermissionType.EDIT, PermissionType.DELETE]) {
      expect(scopeActions(type)).toEqual(['write']);
      expect(scopeActions(type)).not.toContain('configure');
    }
  });

  it('never derives a configure scope from a create grant', () => {
    const scopes = scopesForPermissions([{ module: 'leave', permissionType: PermissionType.CREATE }]);
    expect(scopes).toEqual(['leave:write']);
    expect(scopes).not.toContain('leave:configure');
  });

  it('de-duplicates and sorts', () => {
    expect(
      scopesForPermissions([
        { module: 'leave', permissionType: PermissionType.CREATE },
        { module: 'leave', permissionType: PermissionType.EDIT },
        { module: 'attendance', permissionType: PermissionType.VIEW },
      ]),
    ).toEqual(['attendance:read', 'leave:write']);
  });
});
