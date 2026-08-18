const WORKBENCH_PERMISSIONS = [
  'workspace:read',
  'product:write',
  'strategy:generate',
  'strategy:edit',
  'image:generate',
  'chat:use',
  'image:download',
  'activity:read_self'
]

const ROLE_PERMISSIONS = {
  ADMIN: ['*'],
  OPERATOR: WORKBENCH_PERMISSIONS,
  DESIGNER: WORKBENCH_PERMISSIONS
}

export const MEMBERSHIP_ROLES = Object.keys(ROLE_PERMISSIONS)

export function hasPermission(role, permission) {
  const permissions = ROLE_PERMISSIONS[role] || []
  return permissions.includes('*') || permissions.includes(permission)
}

export function roleLabel(role) {
  return {
    ADMIN: '管理员',
    OPERATOR: '运营',
    DESIGNER: '美工'
  }[role] || role
}
