import { describe, expect, it } from 'vitest';
import { roleBadgeClass, roleBadgeFullClass, roleLabel } from '@/utils/roleBadge';
import { hasWorkspacePermission, workspacePermissions } from '@/utils/workspacePermissions';
import type { WorkspaceDto } from '@/api/workspaces';

describe('roleBadgeClass', () => {
  it('gives owners and workspace admins the heaviest tier', () => {
    expect(roleBadgeClass('org_owner')).toBe(roleBadgeClass('ws_admin'));
    expect(roleBadgeClass('org_owner')).toContain('bg-brand-700');
  });

  it('gives admins and managers the heavy tier', () => {
    expect(roleBadgeClass('org_admin')).toContain('bg-brand-600');
    expect(roleBadgeClass('ws_manager')).toContain('bg-brand-600');
  });

  it('falls back to the background tier for members, unknown roles and empty input', () => {
    const background = roleBadgeClass('org_member');
    expect(roleBadgeClass('ws_member')).toBe(background);
    expect(roleBadgeClass('custom_sales_role')).toBe(background);
    expect(roleBadgeClass(null)).toBe(background);
    expect(roleBadgeClass(undefined)).toBe(background);
  });

  it('wraps the tier classes with badge sizing classes', () => {
    const full = roleBadgeFullClass('ws_analyst');
    expect(full).toContain('inline-flex');
    expect(full).toContain(roleBadgeClass('ws_analyst'));
  });
});

describe('roleLabel', () => {
  it('translates system roles', () => {
    expect(roleLabel('org_owner')).toBe('Owner');
    expect(roleLabel('WS_ANALYST')).toBe('Analyst');
  });

  it('falls back to the explicit fallback or the raw name for custom roles', () => {
    expect(roleLabel('custom_sales_role', 'Sales')).toBe('Sales');
    expect(roleLabel('custom_sales_role')).toBe('custom_sales_role');
  });

  it('returns the fallback (or empty string) when no role is given', () => {
    expect(roleLabel(null, 'None')).toBe('None');
    expect(roleLabel(undefined)).toBe('');
  });
});

describe('workspace permissions', () => {
  const workspace = { myPermissions: ['view_entities', 'create_entities'] } as WorkspaceDto;

  it('reads myPermissions from the workspace DTO', () => {
    expect(workspacePermissions(workspace)).toEqual(['view_entities', 'create_entities']);
    expect(workspacePermissions(null)).toEqual([]);
  });

  it('checks a single permission', () => {
    expect(hasWorkspacePermission(workspace, 'create_entities')).toBe(true);
    expect(hasWorkspacePermission(workspace, 'delete_entities')).toBe(false);
    expect(hasWorkspacePermission(undefined, 'view_entities')).toBe(false);
  });
});
